import { workspace, Disposable } from "vscode";
import { KpmDataManager } from "./KpmDataManager";
import { NO_NAME_FILE } from "./Constants";
import { DEFAULT_DURATION } from "./Constants";
import { getCurrentMusicTrackId, getResourceInfo, isEmptyObj } from "./Util";

const fs = require("fs");

// Available to the KpmDataManager and the KpmController
let activeKeystrokeCountMap = {};

export function deleteProjectNameFromMap(projectName) {
    delete activeKeystrokeCountMap[projectName];
}

export class KpmController {
    private _disposable: Disposable;
    private _sendDataInterval: any = null;

    constructor() {
        let subscriptions: Disposable[] = [];

        workspace.onDidOpenTextDocument(this._onOpenHandler, this);
        workspace.onDidCloseTextDocument(this._onCloseHandler, this);
        workspace.onDidChangeTextDocument(this._onEventHandler, this);
        this._disposable = Disposable.from(...subscriptions);

        // create the 60 second timer that will post keystroke
        // events to the pluing manager if there's any data to send
        this._sendDataInterval = setInterval(
            this.sendKeystrokeDataIntervalHandler,
            DEFAULT_DURATION * 1000
        );
    }

    private sendKeystrokeDataIntervalHandler() {
        //
        // Go through all keystroke count objects found in the map and send
        // the ones that have data (data is greater than 1), then clear the map
        //
        if (activeKeystrokeCountMap) {
            for (const key of Object.keys(activeKeystrokeCountMap)) {
                const keystrokeCount = activeKeystrokeCountMap[key];
                const hasData = keystrokeCount.hasData();
                if (hasData) {
                    // send the payload
                    setTimeout(() => keystrokeCount.postData(), 0);
                } else {
                    // remove it
                    delete activeKeystrokeCountMap[key];
                }
            }
        }
    }

    private getRootPath() {
        let rootPath =
            workspace.workspaceFolders &&
            workspace.workspaceFolders[0] &&
            workspace.workspaceFolders[0].uri &&
            workspace.workspaceFolders[0].uri.fsPath;

        return rootPath;
    }

    private _onCloseHandler(event) {
        if (!this.isTrueEventFile(event)) {
            return;
        }
        const filename = event.fileName || NO_NAME_FILE;

        let [keystrokeCount, fileInfo, rootPath] = this.getFileInfoDatam(
            filename
        );

        this.updateFileInfoLength(filename, fileInfo);

        fileInfo.close = fileInfo.close + 1;
        console.log("Software.com: File closed: " + filename);
    }

    private _onOpenHandler(event) {
        if (!this.isTrueEventFile(event)) {
            return;
        }
        const filename = event.fileName || NO_NAME_FILE;

        let [keystrokeCount, fileInfo, rootPath] = this.getFileInfoDatam(
            filename
        );

        this.updateFileInfoLength(filename, fileInfo);

        fileInfo.open = fileInfo.open + 1;
        console.log("Software.com: File opened: " + filename);
    }

    /**
     * This will return true if it's a true file. we don't
     * want to send events for .git or other event triggers
     * such as extension.js.map events
     */
    private isTrueEventFile(event) {
        if (event && event.document) {
            if (
                event.document.isUntitled !== undefined &&
                event.document.isUntitled !== null &&
                event.document.isUntitled === true
            ) {
                return false;
            }
            return true;
        }
        return false;
    }

    private updateFileInfoLength(filename, fileInfo) {
        if (filename !== NO_NAME_FILE) {
            fs.stat(filename, function(err, stats) {
                if (stats && stats["size"]) {
                    fileInfo.length = stats["size"];
                }
            });
        }
    }

    private async _onEventHandler(event) {
        if (!this.isTrueEventFile(event)) {
            return;
        }

        let filename = event.document.fileName || NO_NAME_FILE;
        let languageId = event.document.languageId || "";
        let lines = event.document.lineCount || 0;

        let [keystrokeCount, fileInfo, rootPath] = this.getFileInfoDatam(
            filename
        );

        this.updateFileInfoLength(filename, fileInfo);

        //
        // Map all of the contentChanges objects then use the
        // reduce function to add up all of the lengths from each
        // contentChanges.text.length value, but only if the text
        // has a length.
        //

        // let newCount = event.contentChanges
        //     .map(cc => (cc.text && cc.text.length > 0 ? cc.text.length : 0))
        //     .reduce((prev, curr) => prev + curr, 0);

        let isNewLine = false;
        let hasNonNewLineData = false;
        let newCount = event.contentChanges
            .map(cc => {
                if (cc && cc.text && cc.text.length > 0) {
                    if (cc.text.match(/[\n\r]/g)) {
                        // only return a keystroke of 1 if it's a new line event
                        isNewLine = true;
                        return 1;
                    }
                    hasNonNewLineData = true;
                    return cc.text.length;
                }
                return 0;
            })
            .reduce((prev, curr) => prev + curr, 0);

        // first check if there's a rangeLength, and if so it's character deletion
        if (
            newCount == 0 &&
            event.contentChanges &&
            event.contentChanges.length > 0 &&
            event.contentChanges[0].rangeLength &&
            event.contentChanges[0].rangeLength > 0
        ) {
            // since new count is zero, check the range length.
            // if there's range length then it's a deletion
            newCount = event.contentChanges[0].rangeLength / -1;
        }

        if (newCount === 0) {
            return;
        }

        if (isEmptyObj(fileInfo.trackInfo)) {
            // check to see if the user has any music playing
            fileInfo.trackInfo = await getCurrentMusicTrackId();
        }

        // get the repo info if we don't already have it for the project
        if (
            keystrokeCount.project &&
            (!keystrokeCount.project.resource ||
                isEmptyObj(keystrokeCount.project.resource))
        ) {
            keystrokeCount.project.resource = await getResourceInfo(rootPath);
        }

        if (newCount > 1) {
            //
            // it's a copy and paste event
            //
            fileInfo.paste += newCount;
            console.log("Software.com: Copy+Paste Incremented");
        } else if (newCount < 0) {
            fileInfo.delete += Math.abs(newCount);
            // update the overall count
            console.log("Software.com: Delete Incremented");
        } else if (hasNonNewLineData) {
            // update the data for this fileInfo keys count
            fileInfo.add += 1;
            // update the overall count
            console.log("Software.com: KPM incremented");
        }
        // increment data by 1
        keystrokeCount.data += 1;

        // "netkeys" = add - delete
        // "keys" = add + delete
        fileInfo.netkeys = fileInfo.add - fileInfo.delete;
        fileInfo.keys = fileInfo.add + fileInfo.delete;

        // set the linesAdded: 0, linesRemoved: 0, syntax: ""
        if (!fileInfo.syntax) {
            fileInfo.syntax = languageId;
        }
        let diff = 0;
        if (fileInfo.lines && fileInfo.lines >= 0) {
            diff = lines - fileInfo.lines;
        }
        fileInfo.lines = lines;
        if (diff < 0) {
            fileInfo.linesRemoved += Math.abs(diff);
        } else if (diff > 0) {
            fileInfo.linesAdded += diff;
        }
        if (fileInfo.linesAdded === 0 && isNewLine) {
            fileInfo.linesAdded = 1;
        }

        // update the map containing the keystroke count
        activeKeystrokeCountMap[rootPath] = keystrokeCount;
    }

    private getFileInfoDatam(filename) {
        //
        // get the root path
        //
        let rootPath = this.getRootPath();

        // the rootPath (directory) is used as the map key, must be a string
        rootPath = rootPath || "None";
        let keystrokeCount = activeKeystrokeCountMap[rootPath];
        if (!keystrokeCount) {
            //
            // Create the keystroke count and add it to the map
            //
            keystrokeCount = new KpmDataManager({
                // project.directory is used as an object key, must be string
                directory: rootPath,
                name: workspace.name || rootPath,
                resource: {}
            });
        }

        let fileInfo = null;
        if (filename) {
            //
            // Look for an existing file source. create it if it doesn't exist
            // or use it if it does and increment it's data value
            //
            fileInfo = findFileInfoInSource(keystrokeCount.source, filename);
            // "add" = additive keystrokes
            // "netkeys" = add - delete
            // "keys" = add + delete
            // "delete" = delete keystrokes
            if (!fileInfo) {
                // initialize and add it
                fileInfo = {
                    keys: 0,
                    add: 0,
                    netkeys: 0,
                    paste: 0,
                    open: 0,
                    close: 0,
                    delete: 0,
                    length: 0,
                    lines: 0,
                    linesAdded: 0,
                    linesRemoved: 0,
                    syntax: "",
                    trackInfo: {}
                };
                keystrokeCount.source[filename] = fileInfo;
            }
        }

        return [keystrokeCount, fileInfo, rootPath];
    }

    public dispose() {
        clearInterval(this._sendDataInterval);
        this._disposable.dispose();
    }
}

//
// This will return the object in an object array
// based on a key and the key's value.
//
function findFileInfoInSource(source, filenameToMatch) {
    if (
        source[filenameToMatch] !== undefined &&
        source[filenameToMatch] !== null
    ) {
        return source[filenameToMatch];
    }
    return null;
}
