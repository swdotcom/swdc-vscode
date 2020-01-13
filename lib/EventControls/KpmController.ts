import { workspace, Disposable, window, commands } from "vscode";
import { KpmDataManager } from "../KpmDataManager";
import { UNTITLED, UNTITLED_WORKSPACE } from "../Constants";
import { DEFAULT_DURATION } from "../Constants";
import {
    getRootPathForFile,
    isEmptyObj,
    getProjectFolder,
    getDashboardFile,
    getNowTimes,
    logEvent,
    getFileAgeInDays,
    getFileType
} from "../Util";
import { sendOfflineData } from "../DataController";
import {
    getRepoContributorInfo,
    getRepoFileCount,
    getFileContributorCount
} from "../RepoControls/KpmRepoManager";
import { FileChangeInfo } from "../models";
const moment = require("moment-timezone");

const NO_PROJ_NAME = "Unnamed";

let _keystrokeMap = {};
let _staticInfoMap = {};
let _treeRefreshTimer = null;

export class KpmController {
    private static instance: KpmController;

    private _disposable: Disposable;
    private _lastDayOfMonth: number = -1;

    constructor() {
        let subscriptions: Disposable[] = [];

        workspace.onDidOpenTextDocument(this._onOpenHandler, this);
        workspace.onDidCloseTextDocument(this._onCloseHandler, this);
        workspace.onDidChangeTextDocument(this._onEventHandler, this);
        this._disposable = Disposable.from(...subscriptions);
    }

    static getInstance(): KpmController {
        if (!KpmController.instance) {
            KpmController.instance = new KpmController();
        }

        return KpmController.instance;
    }

    public async sendKeystrokeDataIntervalHandler() {
        //
        // Go through all keystroke count objects found in the map and send
        // the ones that have data (data is greater than 1), then clear the map
        //
        if (_keystrokeMap && !isEmptyObj(_keystrokeMap)) {
            let keys = Object.keys(_keystrokeMap);
            // use a normal for loop since we have an await within the loop
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const keystrokeCount = _keystrokeMap[key];

                const hasData = keystrokeCount.hasData();

                if (hasData) {
                    // post the payload offline until the batch interval sends it out
                    setTimeout(() => keystrokeCount.postData(), 0);
                }
            }
        }

        // clear out the keystroke map
        _keystrokeMap = {};

        // clear out the static info map
        _staticInfoMap = {};

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
        if (!event || !window.state.focused) {
            return;
        }
        const staticInfo = await this.getStaticEventInfo(event);

        if (!this.isTrueEventFile(event, staticInfo.filename)) {
            return;
        }

        let rootPath = getRootPathForFile(staticInfo.filename);

        if (!rootPath) {
            rootPath = UNTITLED;
        }

        await this.initializeKeystrokesCount(staticInfo.filename, rootPath);

        const rootObj = _keystrokeMap[rootPath];
        this.updateStaticValues(rootObj, staticInfo);

        rootObj.source[staticInfo.filename].close += 1;
        logEvent(`File closed: ${staticInfo.filename}`);
    }

    /**
     * File Open Handler
     * @param event
     */
    private async _onOpenHandler(event) {
        if (!event || !window.state.focused) {
            return;
        }
        const staticInfo = await this.getStaticEventInfo(event);

        if (!this.isTrueEventFile(event, staticInfo.filename)) {
            return;
        }

        let rootPath = getRootPathForFile(staticInfo.filename);

        if (!rootPath) {
            rootPath = UNTITLED;
        }

        await this.initializeKeystrokesCount(staticInfo.filename, rootPath);

        const rootObj = _keystrokeMap[rootPath];
        this.updateStaticValues(rootObj, staticInfo);

        rootObj.source[staticInfo.filename].open += 1;
        logEvent(`File opened: ${staticInfo.filename}`);
    }

    /**
     * File Change Event Handler
     * @param event
     */
    private async _onEventHandler(event) {
        if (!event || !window.state.focused) {
            return;
        }
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

        const rootObj = _keystrokeMap[rootPath];
        const sourceObj: FileChangeInfo = rootObj.source[staticInfo.filename];
        const currLineCount =
            event.document && event.document.lineCount
                ? event.document.lineCount
                : event.lineCount || 0;
        this.updateStaticValues(rootObj, staticInfo);

        // Use the contentChanges to figure out most of the events
        let isNewLine = false;
        let isLineDelete = false;
        let hasNonNewLineData = false;
        let textChangeLen = 0;
        let rangeChangeLen = 0;
        let contentText = "";
        if (event.contentChanges && event.contentChanges.length) {
            for (let i = 0; i < event.contentChanges.length; i++) {
                const range = event.contentChanges[i].range;
                contentText = event.contentChanges[i].text;
                if (contentText.match(/[\n\r]/g)) {
                    // it's a new line
                    isNewLine = true;
                    contentText = "";
                } else if (contentText.length > 0) {
                    // has text changes
                    hasNonNewLineData = true;
                    textChangeLen += contentText.length;
                    rangeChangeLen += event.contentChanges[i].rangeLength || 0;
                } else if (range && !range.isEmpty && !range.isSingleLine) {
                    // it's an empty line delete
                    isLineDelete = true;
                }
            }
        }

        // check if its a character deletion
        if (textChangeLen === 0 && rangeChangeLen > 0) {
            // since new count is zero, check the range length.
            // if there's range length then it's a deletion
            textChangeLen = event.contentChanges[0].rangeLength / -1;
        }

        this.lazilyRefreshCommitTreeInfo();
        if (textChangeLen === 0 && !isNewLine && !isLineDelete) {
            return;
        }

        if (textChangeLen > 8) {
            //
            // it's a copy and paste event
            //
            sourceObj.paste += 1;
            logEvent("Copy+Paste Incremented");
        } else if (textChangeLen < 0) {
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
        rootObj.keystrokes += 1;

        // "netkeys" = add - delete
        sourceObj.netkeys = sourceObj.add - sourceObj.delete;

        let diff = 0;

        // check if the line count has changed since the initial
        // time we've set the static info line count for this file
        if (sourceObj.lines > 0 && currLineCount !== sourceObj.lines) {
            // i.e. it's now 229 but was 230 before, it'll set
            // diff to -1 which triggers our condition to
            // increment the linesRemoved
            diff = currLineCount - sourceObj.lines;
        }

        sourceObj.lines = currLineCount;

        if (isLineDelete) {
            // make the diff absolute as we're just incrementing
            // the linesRemoved value
            diff = Math.abs(diff);
            diff = Math.max(diff, 1);
            sourceObj.linesRemoved += diff;
            logEvent(`Removed ${diff} lines`);
        } else if (isNewLine) {
            // when hitting the enter key it doesn't change the currLineCount
            // but the contentChanges has the "\n" to provide that a newline
            // has happened
            diff = Math.max(diff, 1);
            sourceObj.linesAdded += diff;
            logEvent(`Added ${diff} lines`);
        }
    }

    private lazilyRefreshCommitTreeInfo() {
        // "codetime.refreshKpmTree"
        if (_treeRefreshTimer) {
            clearTimeout(_treeRefreshTimer);
            _treeRefreshTimer = null;
        }
        _treeRefreshTimer = setTimeout(() => {
            commands.executeCommand("codetime.refreshCommitTree");
            _treeRefreshTimer = null;
        }, 2000);
    }

    /**
     * Update some of the basic/static attributes
     * @param sourceObj
     * @param staticInfo
     */
    private updateStaticValues(payload, staticInfo) {
        const sourceObj: FileChangeInfo = payload.source[staticInfo.filename];
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

        // update the repoFileContributorCount
        if (!sourceObj.repoFileContributorCount) {
            sourceObj.repoFileContributorCount =
                staticInfo.repoFileContributorCount;
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

        let staticInfo = _staticInfoMap[filename];

        if (staticInfo) {
            return staticInfo;
        }

        // get the repo count and repo file count
        const contributorInfo = await getRepoContributorInfo(filename);
        const repoContributorCount = contributorInfo
            ? contributorInfo.count
            : 0;
        const repoFileCount = await getRepoFileCount(filename);

        // get the file contributor count
        const repoFileContributorCount = await getFileContributorCount(
            filename
        );

        // get the age of this file
        const fileAgeDays = getFileAgeInDays(filename);

        // if the languageId is not assigned, use the file type
        if (!languageId && filename.indexOf(".") !== -1) {
            let fileType = getFileType(filename);
            if (fileType) {
                languageId = fileType;
            }
        }

        staticInfo = {
            filename,
            languageId,
            length,
            fileAgeDays,
            repoContributorCount,
            repoFileCount,
            lineCount,
            repoFileContributorCount
        };

        _staticInfoMap[filename] = staticInfo;

        return staticInfo;
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
        let nowTimes = getNowTimes();
        const start = nowTimes.now_in_sec - 60;
        const local_start = nowTimes.local_now_in_sec - 60;
        keystrokeCount["start"] = start;
        keystrokeCount["local_start"] = local_start;
        const fileInfo = new FileChangeInfo();
        fileInfo.add = 1;
        fileInfo.keystrokes = 1;
        fileInfo.start = start;
        fileInfo.local_start = local_start;
        keystrokeCount.source[fileName] = fileInfo;

        setTimeout(() => keystrokeCount.postData(true /*sendNow*/), 0);
    }

    private async initializeKeystrokesCount(filename, rootPath) {
        // the rootPath (directory) is used as the map key, must be a string
        rootPath = rootPath || NO_PROJ_NAME;
        // if we don't even have a _keystrokeMap then create it and take the
        // path of adding this file with a start time of now
        if (!_keystrokeMap) {
            _keystrokeMap = {};
        }

        const nowTimes = getNowTimes();

        let keystrokeCount = _keystrokeMap[rootPath];

        // create the keystroke count if it doesn't exist
        if (!keystrokeCount) {
            // add keystroke count wrapper
            keystrokeCount = this.createKeystrokeCounter(
                filename,
                rootPath,
                nowTimes
            );
        }

        // check if we have this file or not
        const hasFile = keystrokeCount.source[filename];

        if (!hasFile) {
            // no file, start anew
            this.addFile(filename, nowTimes, keystrokeCount);
        } else if (parseInt(keystrokeCount.source[filename].end, 10) !== 0) {
            // re-initialize it since we ended it before the minute was up
            keystrokeCount.source[filename].end = 0;
            keystrokeCount.source[filename].local_end = 0;
        }

        // close any existing
        const fileKeys = Object.keys(keystrokeCount.source);
        if (fileKeys.length > 1) {
            // set the end time to now for the other files that don't match this file
            fileKeys.forEach(key => {
                let sourceObj: FileChangeInfo = keystrokeCount.source[key];
                if (key !== filename && sourceObj.end === 0) {
                    sourceObj.end = nowTimes.now_in_sec;
                    sourceObj.local_end = nowTimes.local_now_in_sec;
                }
            });
        }

        _keystrokeMap[rootPath] = keystrokeCount;
    }

    private addFile(filename, nowTimes, keystrokeCount) {
        const fileInfo = new FileChangeInfo();
        fileInfo.start = nowTimes.now_in_sec;
        fileInfo.local_start = nowTimes.local_now_in_sec;
        keystrokeCount.source[filename] = fileInfo;
    }

    private createKeystrokeCounter(filename, rootPath, nowTimes) {
        const workspaceFolder = getProjectFolder(filename);
        const name = workspaceFolder
            ? workspaceFolder.name
            : UNTITLED_WORKSPACE;
        let keystrokeCount = new KpmDataManager({
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

        return keystrokeCount;
    }

    public dispose() {
        this._disposable.dispose();
    }
}
