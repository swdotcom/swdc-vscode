import { workspace, Disposable } from "vscode";
import { KpmDataManager } from "./KpmDataManager";
import { UNTITLED, UNTITLED_WORKSPACE } from "./Constants";
import { DEFAULT_DURATION } from "./Constants";
import {
    getRootPathForFile,
    updateCodeTimeMetricsFileFocus,
    isCodeTimeMetricsFile,
    isEmptyObj,
    getProjectFolder,
    getDashboardFile,
    getNowTimes,
    logEvent,
    getFileAgeInDays
} from "./Util";
import { sendOfflineData } from "./DataController";
import { getRepoContributorInfo, getRepoFileCount } from "./KpmRepoManager";
const moment = require("moment-timezone");

const NO_PROJ_NAME = "Unnamed";

let _keystrokeMap = {};

export class KpmController {
    private _disposable: Disposable;
    private _lastDayOfMonth: number = -1;

    constructor() {
        let subscriptions: Disposable[] = [];

        workspace.onDidOpenTextDocument(this._onOpenHandler, this);
        workspace.onDidCloseTextDocument(this._onCloseHandler, this);
        workspace.onDidChangeTextDocument(this._onEventHandler, this);
        this._disposable = Disposable.from(...subscriptions);
    }

    public async sendKeystrokeDataIntervalHandler(sendLazy: boolean = true) {
        //
        // Go through all keystroke count objects found in the map and send
        // the ones that have data (data is greater than 1), then clear the map
        //
        if (_keystrokeMap && !isEmptyObj(_keystrokeMap)) {
            for (const key of Object.keys(_keystrokeMap)) {
                const keystrokeCount = _keystrokeMap[key];

                const hasData = keystrokeCount.hasData();

                if (hasData) {
                    // post the payload offline until the batch interval sends it out
                    if (sendLazy) {
                        setTimeout(() => keystrokeCount.postData(), 0);
                    } else {
                        await keystrokeCount.postData();
                    }
                }
                delete _keystrokeMap[key];
            }
        }

        // check if we're in a new day, if so lets send the offline data
        const dayOfMonth = moment()
            .startOf("day")
            .date();
        if (dayOfMonth !== this._lastDayOfMonth) {
            this._lastDayOfMonth = dayOfMonth;
            setTimeout(() => {
                sendOfflineData();
            }, 1000 * 2);
        }
    }

    /**
     * File Close Handler
     * @param event
     */
    private async _onCloseHandler(event) {
        if (!event) {
            return;
        }
        const staticInfo = await this.getStaticEventInfo(event);

        if (!this.isTrueEventFile(event, staticInfo.filename)) {
            return;
        }

        if (isCodeTimeMetricsFile(staticInfo.filename)) {
            updateCodeTimeMetricsFileFocus(false);
        }

        let rootPath = getRootPathForFile(staticInfo.filename);

        if (!rootPath) {
            rootPath = UNTITLED;
        }

        await this.initializeKeystrokesCount(staticInfo.filename, rootPath);

        const sourceObj = _keystrokeMap[rootPath].source[staticInfo.filename];
        this.updateStaticValues(sourceObj, staticInfo);

        _keystrokeMap[rootPath].source[staticInfo.filename].close += 1;
        logEvent(`File closed: ${staticInfo.filename}`);
    }

    /**
     * File Open Handler
     * @param event
     */
    private async _onOpenHandler(event) {
        if (!event) {
            return;
        }
        const staticInfo = await this.getStaticEventInfo(event);

        if (!this.isTrueEventFile(event, staticInfo.filename)) {
            return;
        }

        if (isCodeTimeMetricsFile(staticInfo.filename)) {
            updateCodeTimeMetricsFileFocus(true);
        } else {
            updateCodeTimeMetricsFileFocus(false);
        }

        let rootPath = getRootPathForFile(staticInfo.filename);

        if (!rootPath) {
            rootPath = UNTITLED;
        }

        await this.initializeKeystrokesCount(staticInfo.filename, rootPath);

        const sourceObj = _keystrokeMap[rootPath].source[staticInfo.filename];
        this.updateStaticValues(sourceObj, staticInfo);

        _keystrokeMap[rootPath].source[staticInfo.filename].open += 1;
        logEvent(`File opened: ${staticInfo.filename}`);
    }

    /**
     * File Change Event Handler
     * @param event
     */
    private async _onEventHandler(event) {
        const staticInfo = await this.getStaticEventInfo(event);

        const filename = staticInfo.filename;

        if (!this.isTrueEventFile(event, filename)) {
            return;
        }

        let rootPath = getRootPathForFile(filename);

        if (!rootPath) {
            rootPath = UNTITLED;
        }

        await this.initializeKeystrokesCount(filename, rootPath);

        if (!_keystrokeMap[rootPath].source[filename]) {
            // it's undefined, it wasn't created
            return;
        }

        const sourceObj = _keystrokeMap[rootPath].source[staticInfo.filename];
        this.updateStaticValues(_keystrokeMap[rootPath], staticInfo);

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
            sourceObj.paste += 1;
            logEvent("Copy+Paste Incremented");
        } else if (newCount < 0) {
            sourceObj.delete += 1;
            // update the overall count
            logEvent("Delete Incremented");
        } else if (hasNonNewLineData) {
            // update the data for this fileInfo keys count
            sourceObj.add += 1;
            // update the overall count
            logEvent("KPM incremented");
        }
        // increment keystrokes by 1
        _keystrokeMap[rootPath].keystrokes += 1;

        // "netkeys" = add - delete
        sourceObj.netkeys = sourceObj.add - sourceObj.delete;

        let diff = 0;
        if (sourceObj.lines && sourceObj.lines >= 0) {
            diff = staticInfo.lineCount - sourceObj.lines;
        }
        sourceObj.lines = staticInfo.lineCount;
        if (diff < 0) {
            sourceObj.linesRemoved += Math.abs(diff);
            logEvent("Increment lines removed");
        } else if (diff > 0) {
            sourceObj.linesAdded += diff;
            logEvent("Increment lines added");
        }
        if (sourceObj.linesAdded === 0 && isNewLine) {
            sourceObj.linesAdded = 1;
            logEvent("Increment lines added");
        }
    }

    /**
     * Update some of the basic/static attributes
     * @param sourceObj
     * @param staticInfo
     */
    private updateStaticValues(payload, staticInfo) {
        const sourceObj = payload.source[staticInfo.filename];
        // set the repoContributorCount
        if (
            staticInfo.repoContributorCount &&
            payload.repoContributorCount === 0
        ) {
            payload.repoContributorCount = staticInfo.repoContributorCount;
        }

        // set the repoFileCount
        if (staticInfo.repoFileCount && payload.repoFileCount === 0) {
            payload.repoFileCount = staticInfo.repoFileCount;
        }

        // syntax
        if (!sourceObj.syntax) {
            sourceObj.syntax = staticInfo.languageId;
        }
        // fileAgeDays
        if (!sourceObj.fileAgeDays) {
            sourceObj.fileAgeDays = staticInfo.fileAgeDays;
        }

        // length
        sourceObj.length = staticInfo.length;
    }

    private async getStaticEventInfo(event) {
        let filename = "";
        let languageId = "";
        let length = 0;
        let lineCount = 0;

        // get the filename, length of the file, and the languageId
        if (event.fileName) {
            filename = event.fileName;
            if (event.languageId) {
                languageId = event.languageId;
            }
            if (event.getText()) {
                length = event.getText().length;
            }
            if (event.lineCount) {
                lineCount = event.lineCount;
            }
        } else if (event.document && event.document.fileName) {
            filename = event.document.fileName;
            if (event.document.languageId) {
                languageId = event.document.languageId;
            }
            if (event.document.getText()) {
                length = event.document.getText().length;
            }

            if (event.document.lineCount) {
                lineCount = event.document.lineCount;
            }
        }

        // get the repo count and repo file count
        const contributorInfo = await getRepoContributorInfo();
        const repoContributorCount = contributorInfo.count;
        const repoFileCount = await getRepoFileCount();

        // get the age of this file
        const fileAgeDays = getFileAgeInDays(filename);

        // if the languageId is not assigned, use the file type
        if (!languageId && filename.indexOf(".") !== -1) {
            languageId = filename.substring(filename.lastIndexOf(".") + 1);
        }

        return {
            filename,
            languageId,
            length,
            fileAgeDays,
            repoContributorCount,
            repoFileCount,
            lineCount
        };
    }

    /**
     * This will return true if it's a true file. we don't
     * want to send events for .git or other event triggers
     * such as extension.js.map events
     */
    private isTrueEventFile(event, filename) {
        if (!filename) {
            return false;
        }
        // if it's the dashboard file or a liveshare tmp file then
        // skip event tracking

        let scheme = "";
        if (event.uri && event.uri.scheme) {
            scheme = event.uri.scheme;
        } else if (
            event.document &&
            event.document.uri &&
            event.document.uri.scheme
        ) {
            scheme = event.document.uri.scheme;
        }

        // other scheme types I know of "vscode-userdata", "git"
        if (scheme !== "file" && scheme !== "untitled") {
            return false;
        }

        if (
            filename === getDashboardFile() ||
            (filename &&
                filename.includes(".code-workspace") &&
                filename.includes("vsliveshare") &&
                filename.includes("tmp-"))
        ) {
            // ../vsliveshare/tmp-.../.../Visual Studio Live Share.code-workspace
            // don't handle this event (it's a tmp file that may not bring back a real project name)
            return false;
        }
        return true;
    }

    public buildBootstrapKpmPayload() {
        let rootPath = NO_PROJ_NAME;
        let fileName = "Untitled";
        let name = UNTITLED_WORKSPACE;

        // send the code time bootstrap payload
        let keystrokeCount = new KpmDataManager({
            // project.directory is used as an object key, must be string
            directory: rootPath,
            name,
            identifier: "",
            resource: {}
        });
        keystrokeCount["keystrokes"] = 1;
        let fileInfo = {
            add: 1,
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
            fileAgeDays: 0
        };
        keystrokeCount.source[fileName] = fileInfo;

        setTimeout(() => keystrokeCount.postData(true /*sendNow*/), 0);
    }

    /**
     * This function will ensure a file within the aggregate KeystrokeCount
     * object has a start, local_start, end, and local_end.
     * @param filename
     * @param rootPath
     */
    private async initializeKeystrokesCount(filename, rootPath) {
        // the rootPath (directory) is used as the map key, must be a string
        rootPath = rootPath || NO_PROJ_NAME;
        if (!_keystrokeMap) {
            _keystrokeMap = {};
        }

        let keystrokeCount = _keystrokeMap[rootPath];
        if (
            _keystrokeMap[rootPath] &&
            _keystrokeMap[rootPath].source[filename]
        ) {
            // we found that we already have this source file
            // make sure the end time is set to zero since it's getting edited
            _keystrokeMap[rootPath].source[filename]["end"] = 0;
            _keystrokeMap[rootPath].source[filename]["local_end"] = 0;

            // check if there are source files that need to get a closing end time
            Object.keys(_keystrokeMap[rootPath].source).forEach(key => {
                if (key !== filename) {
                    if (_keystrokeMap[rootPath].source[key]["end"] === 0) {
                        let nowTimes = getNowTimes();
                        _keystrokeMap[rootPath].source[key]["end"] =
                            nowTimes.now_in_sec;
                        _keystrokeMap[rootPath].source[key]["local_end"] =
                            nowTimes.local_now_in_sec;
                    }
                }
            });

            return;
        }

        let workspaceFolder = getProjectFolder(filename);
        let name = workspaceFolder ? workspaceFolder.name : UNTITLED_WORKSPACE;

        const nowTimes = getNowTimes();

        //
        // Create the keystroke count and add it to the map
        //
        if (!keystrokeCount) {
            keystrokeCount = new KpmDataManager({
                // project.directory is used as an object key, must be string
                directory: rootPath,
                name,
                identifier: "",
                resource: {}
            });

            keystrokeCount["start"] = nowTimes.now_in_sec;
            keystrokeCount["local_start"] = nowTimes.local_now_in_sec;
            keystrokeCount["keystrokes"] = 0;

            // start the minute timer to send the data
            setTimeout(() => {
                this.sendKeystrokeDataIntervalHandler();
            }, DEFAULT_DURATION * 1000);
        }

        let fileInfo = null;
        if (filename) {
            if (keystrokeCount.source) {
                const keys = Object.keys(keystrokeCount.source);
                if (keys && keys.length > 0) {
                    for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                        if (key !== filename) {
                            // ending a file session that doesn't match the incoming file
                            const end =
                                parseInt(
                                    keystrokeCount.source[key]["end"],
                                    10
                                ) || 0;
                            if (end === 0) {
                                // set the end time for this file event
                                let nowTimes = getNowTimes();
                                keystrokeCount.source[key]["end"] =
                                    nowTimes.now_in_sec;
                                keystrokeCount.source[key]["local_end"] =
                                    nowTimes.local_now_in_sec;
                            }
                        }
                    }
                }
            }

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
                    start: nowTimes.now_in_sec,
                    local_start: nowTimes.local_now_in_sec,
                    end: 0,
                    local_end: 0,
                    syntax: "",
                    fileAgeDays: 0
                };
                keystrokeCount.source[filename] = fileInfo;
            }
        }

        _keystrokeMap[rootPath] = keystrokeCount;
    }

    public dispose() {
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
