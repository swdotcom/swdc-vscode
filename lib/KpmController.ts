import { workspace, Disposable } from "vscode";
import { KpmDataManager } from "./KpmDataManager";
import { NO_NAME_FILE } from "./Constants";
import { DEFAULT_DURATION } from "./Constants";
import {
    getRootPathForFile,
    updateCodeTimeMetricsFileFocus,
    updateCodeTimeMetricsFileClosed,
    isCodeTimeMetricsFile,
    isEmptyObj,
    getProjectFolder,
    getItem
} from "./Util";
import { requiresUserCreation, createAnonymousUser } from "./DataController";

const NO_PROJ_NAME = "Unnamed";

let _keystrokeMap = {};

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

    private async sendKeystrokeDataIntervalHandler() {
        // check if we've lost the jwt for some reason
        let jwt = getItem("jwt");
        if (!jwt) {
            if (await requiresUserCreation()) {
                await createAnonymousUser();
            }
        }

        //
        // Go through all keystroke count objects found in the map and send
        // the ones that have data (data is greater than 1), then clear the map
        //
        if (_keystrokeMap && !isEmptyObj(_keystrokeMap)) {
            for (const key of Object.keys(_keystrokeMap)) {
                const keystrokeCount = _keystrokeMap[key];

                const hasData = keystrokeCount.hasData();

                if (hasData) {
                    // send the payload
                    setTimeout(() => keystrokeCount.postData(), 0);
                }
                delete _keystrokeMap[key];
            }
        }
    }

    private async _onCloseHandler(event) {
        if (!event) {
            return;
        }
        const filename = event.fileName || NO_NAME_FILE;

        if (isCodeTimeMetricsFile(filename)) {
            updateCodeTimeMetricsFileFocus(false);
            updateCodeTimeMetricsFileClosed(true);
        }

        if (!this.isTrueEventFile(event)) {
            return;
        }

        let rootPath = getRootPathForFile(filename);

        await this.initializeKeystrokesCount(filename);

        if (event.document && event.document.getText()) {
            _keystrokeMap[rootPath].source[
                filename
            ].length = event.document.getText().length;
        }

        _keystrokeMap[rootPath].source[filename].close += 1;
        console.log("Code Time: File closed: " + filename);
    }

    private async _onOpenHandler(event) {
        if (!event) {
            return;
        }
        const filename = event.fileName || NO_NAME_FILE;
        if (isCodeTimeMetricsFile(filename)) {
            updateCodeTimeMetricsFileFocus(true);
            updateCodeTimeMetricsFileClosed(false);
        } else {
            updateCodeTimeMetricsFileFocus(false);
        }
        if (!this.isTrueEventFile(event)) {
            return;
        }

        let rootPath = getRootPathForFile(filename);

        await this.initializeKeystrokesCount(filename);

        if (event.document && event.document.getText()) {
            _keystrokeMap[rootPath].source[
                filename
            ].length = event.document.getText().length;
        }

        _keystrokeMap[rootPath].source[filename].open += 1;
        console.log("Code Time: File opened: " + filename);
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

    private async _onEventHandler(event) {
        if (!this.isTrueEventFile(event)) {
            return;
        }

        this.updateEventInfo(event);
    }

    private async updateEventInfo(event) {
        let filename = event.document.fileName || NO_NAME_FILE;
        let languageId = event.document.languageId || "";
        let lines = event.document.lineCount || 0;

        let rootPath = getRootPathForFile(filename);

        if (!filename || !rootPath || filename.indexOf(rootPath) === -1) {
            return;
        }

        await this.initializeKeystrokesCount(filename);

        if (!_keystrokeMap[rootPath].source[filename]) {
            // it's undefined, it wasn't created
            return;
        }

        // let fileInfo = _keystrokeMap[rootPath].source[filename];

        if (event.document && event.document.getText()) {
            _keystrokeMap[rootPath].source[
                filename
            ].length = event.document.getText().length;
        }

        //
        // Map all of the contentChanges objects then use the
        // reduce function to add up all of the lengths from each
        // contentChanges.text.length value, but only if the text
        // has a length.
        //

        let isNewLine = false;
        let hasNonNewLineData = false;

        // get the content changes text
        let text = "";

        let hasCotentText =
            event.contentChanges && event.contentChanges.length === 1
                ? true
                : false;
        if (hasCotentText) {
            text = event.contentChanges[0].text || "";
        }

        // check if the text has a new line
        if (text && text.match(/[\n\r]/g)) {
            isNewLine = true;
        } else if (text && text.length > 0) {
            hasNonNewLineData = true;
        }

        let newCount = text ? text.length : 0;

        // check if its a character deletion
        if (
            newCount === 0 &&
            event.contentChanges &&
            event.contentChanges.length === 1 &&
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

        if (newCount > 8) {
            //
            // it's a copy and paste event
            //
            _keystrokeMap[rootPath].source[filename].paste += 1;
            console.log("Code Time: Copy+Paste Incremented");
        } else if (newCount < 0) {
            _keystrokeMap[rootPath].source[filename].delete += 1;
            // update the overall count
            console.log("Code Time: Delete Incremented");
        } else if (hasNonNewLineData) {
            // update the data for this fileInfo keys count
            _keystrokeMap[rootPath].source[filename].add += 1;
            // update the overall count
            console.log("Code Time: KPM incremented");
        }
        // increment keystrokes by 1
        _keystrokeMap[rootPath].keystrokes += 1;

        // "netkeys" = add - delete
        _keystrokeMap[rootPath].source[filename].netkeys =
            _keystrokeMap[rootPath].source[filename].add -
            _keystrokeMap[rootPath].source[filename].delete;

        // set the linesAdded: 0, linesRemoved: 0, syntax: ""
        if (!_keystrokeMap[rootPath].source[filename].syntax) {
            _keystrokeMap[rootPath].source[filename].syntax = languageId;
        }
        let diff = 0;
        if (
            _keystrokeMap[rootPath].source[filename].lines &&
            _keystrokeMap[rootPath].source[filename].lines >= 0
        ) {
            diff = lines - _keystrokeMap[rootPath].source[filename].lines;
        }
        _keystrokeMap[rootPath].source[filename].lines = lines;
        if (diff < 0) {
            _keystrokeMap[rootPath].source[filename].linesRemoved += Math.abs(
                diff
            );
            console.log("Code Time: Increment lines removed");
        } else if (diff > 0) {
            _keystrokeMap[rootPath].source[filename].linesAdded += diff;
            console.log("Code Time: Increment lines added");
        }
        if (
            _keystrokeMap[rootPath].source[filename].linesAdded === 0 &&
            isNewLine
        ) {
            _keystrokeMap[rootPath].source[filename].linesAdded = 1;
            console.log("Code Time: Increment lines added");
        }
    }

    private initializeKeystrokesCount(filename) {
        //
        // get the root path
        //
        let rootPath = getRootPathForFile(filename);

        // the rootPath (directory) is used as the map key, must be a string
        rootPath = rootPath || NO_PROJ_NAME;
        if (!_keystrokeMap) {
            _keystrokeMap = {};
        }

        let keystrokeCount = _keystrokeMap[rootPath];
        if (keystrokeCount) {
            return;
        }

        let workspaceFolder = getProjectFolder(filename);

        //
        // Create the keystroke count and add it to the map
        //
        keystrokeCount = new KpmDataManager({
            // project.directory is used as an object key, must be string
            directory: rootPath,
            name: workspaceFolder.name || rootPath,
            identifier: "",
            resource: {}
        });
        keystrokeCount["keystrokes"] = 0;
        // liveshare number (minutes)
        keystrokeCount["liveshare"] = 0;

        let fileInfo = null;
        if (filename) {
            //
            // Look for an existing file source. create it if it doesn't exist
            // or use it if it does and increment it's data value
            //
            fileInfo = findFileInfoInSource(keystrokeCount.source, filename);
            // "add" = additive keystrokes
            // "netkeys" = add - delete
            // "delete" = delete keystrokes
            if (!fileInfo) {
                // initialize and add it
                fileInfo = {
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
                    syntax: ""
                };
                keystrokeCount.source[filename] = fileInfo;
            }
        }

        _keystrokeMap[rootPath] = keystrokeCount;
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
