// Copyright (c) 2018 Software.co Technologies, Inc. All Rights Reserved.
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
    window,
    workspace,
    Disposable,
    ExtensionContext,
    TextDocument,
    StatusBarAlignment
} from "vscode";
import axios from "axios";
import {
    SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION,
    EPROTONOSUPPORT
} from "constants";

const request = require("request");
const fs = require("fs");
const open = require("open");
const path = require("path");
const os = require("os");

// ? marks that the parameter is optional
type Project = { directory: String; name?: String };

const DOWNLOAD_NOW_LABEL = "Download";
const NO_NAME_FILE = "Untitled";
const VERSION = "0.1.5";
const PM_URL = "http://localhost:19234";
const DEFAULT_DURATION = 60;
const MILLIS_PER_DAY = 1000 * 60 * 60 * 24;
const api = axios.create({
    baseURL: `${PM_URL}/api/v1/`
});

const pmBucket = "https://s3-us-west-1.amazonaws.com/swdc-plugin-manager/";
let wasMessageShown = false;
let checkedForPmInstallation = false;
let lastMillisCheckedForPmInstallation = 0;
let downloadingNow = false;
let downloadWindow = null;
let progressWindow = null;

// Available to the KeystrokeCount and the KeystrokeCountController
let activeKeystrokeCountMap = {};

export function activate(ctx: ExtensionContext) {
    console.log(`Software.com: Loaded v${VERSION}`);

    //
    // Add the keystroke controller to the ext ctx, which
    // will then listen for text document changes.
    //
    const controller = new KeystrokeCountController();
    ctx.subscriptions.push(controller);
}

function nowInSecs() {
    return Math.round(Date.now() / 1000);
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

/**
 * mac: /Applications/Software.app/Contents/Info.plist
 * example info
 * Bundle version: 0.5.6-staging.2750
 * Bundle version string, short: 0.5.6-staging
 * Bundle display name: Software
 *
 * win: C:\Users\<username>\AppData\Local\Programs\software-plugin-manager\Software.exe
 *
 * Find all files recursively in specific folder with specific extension, e.g:
 * findFilesInDir('./project/src', '.html') ==> ['./project/src/a.html','./project/src/build/index.html']
 * @param  {String} startPath    Path relative to this file or other file which requires this files
 * @param  {String} filter       Extension name, e.g: '.html'
 * @return {Array}               Result files with path string in an array
 */
function hasPluginInstalled(startPath) {
    const dirFiles = fs.readdirSync(startPath);

    for (let i in dirFiles) {
        if (dirFiles[i].toLowerCase().indexOf("software") === 0) {
            return true;
        }
    }

    console.log(`Unable to locate the Plugin Manager within ${startPath}`);
    return false;
}

// process.platform return the following...
//   -> 'darwin', 'freebsd', 'linux', 'sunos' or 'win32'
function isWindows() {
    return process.platform.indexOf("win32") !== -1;
}

function isMac() {
    return process.platform.indexOf("darwin") !== -1;
}

function downloadPM() {
    downloadingNow = true;
    let homedir = os.homedir();

    let pmExtension = ".dmg";
    if (isMac()) {
        homedir += "/Desktop/";
    } else if (isWindows()) {
        pmExtension = ".exe";
        homedir += "\\Desktop\\";
    } else if (!isMac()) {
        pmExtension = ".deb";
        homedir += "/Desktop/";
    }

    let pmBinary = homedir + "software-plugin-manager" + pmExtension;
    let file_url = pmBucket + "software-plugin-manager" + pmExtension;

    // Save variable to know progress
    var received_bytes = 0;
    var total_bytes = 0;
    let options = { url: file_url };
    let req = request.get(options);
    let out = fs.createWriteStream(pmBinary);

    let statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right);
    statusBarItem.show();

    req.pipe(out);
    req.on("response", function(data) {
        if (data && data.statusCode === 200) {
            statusBarItem.text = "Starting Plugin Manager download.";
        } else {
            downloadingNow = false;
        }

        // Change the total bytes value to get progress later.
        total_bytes = parseInt(data.headers["content-length"]);
    });

    req.on("data", function(chunk) {
        // Update the received bytes
        received_bytes += chunk.length;
        showProgress(received_bytes, total_bytes, statusBarItem);
    });

    req.on("end", function() {
        downloadingNow = false;

        // show the final message in the status bar
        statusBarItem.text = "Completed Plugin Manager download";

        // install the plugin manager
        open(pmBinary);

        setTimeout(() => {
            statusBarItem.hide();
            statusBarItem = null;
        }, 5000);
    });
}

function showProgress(received, total, statusBarItem) {
    const percent = Math.ceil(Math.max(received * 100 / total, 2));
    // let message = `Downloaded ${percent}% | ${received} bytes out of ${total} bytes`;
    statusBarItem.text = `Downloading Plugin Manager: ${percent}%`;
}

export class KeystrokeCount {
    public source: {};
    public type: String;
    public data: Number;
    public start: Number;
    public end: Number;
    public project: Project;
    public pluginId: Number;
    public version: String;

    constructor(project: Project) {
        const now = nowInSecs();

        (this.source = {}),
            (this.type = "Events"),
            (this.data = 0),
            (this.start = now),
            (this.end = now + DEFAULT_DURATION),
            (this.project = project),
            (this.pluginId = 2);
        this.version = VERSION;
    }

    hasData() {
        for (const fileName of Object.keys(this.source)) {
            const fileInfoData = this.source[fileName];
            // check if any of the metric values has data
            if (
                fileInfoData &&
                (fileInfoData.keys > 0 ||
                    fileInfoData.paste > 0 ||
                    fileInfoData.open > 0 ||
                    fileInfoData.close > 0 ||
                    fileInfoData.delete > 0)
            ) {
                return true;
            }
        }
        return false;
    }

    postToPM() {
        const payload = JSON.parse(JSON.stringify(this));
        payload.data = String(payload.data);

        // ensure the start and end are exactly DEFAULT_DURATION apart
        const now = nowInSecs();
        payload.start = now - DEFAULT_DURATION;
        payload.end = now;

        const projectName =
            payload.project && payload.project.directory
                ? payload.project.directory
                : "null";

        // Null out the project if the project's name is 'null'
        if (projectName === "null") {
            payload.project = null;
        }

        console.error(`Software.com: sending ${JSON.stringify(payload)}`);

        // POST the kpm to the PluginManager
        return api
            .post("/data", payload)
            .then(response => {
                // everything is fine, remove this one from the map
                delete activeKeystrokeCountMap[projectName];
            })
            .catch(err => {
                if (downloadWindow) {
                    return;
                }

                // first check if the pm has been installed or not
                const homedir = os.homedir();
                let installDir;
                let pmBinary = homedir;
                if (isMac()) {
                    installDir = "/Applications";
                    pmBinary += "/Desktop/software-plugin-manager.dmg";
                } else if (isWindows()) {
                    installDir = os.homedir() + "\\AppData\\Programs";
                    pmBinary += "\\Desktop\\software-plugin-manager.exe";
                } else {
                    installDir = "/usr/lib/";
                    pmBinary += "/Desktop/software-plugin-manager.deb";
                }

                // check if we have the plugin installed
                const foundPath = hasPluginInstalled(installDir);
                if (foundPath) {
                    // update checkedForPmInstallation to true
                    checkedForPmInstallation = true;
                } else if (
                    !foundPath &&
                    checkedForPmInstallation &&
                    lastMillisCheckedForPmInstallation > 0 &&
                    Date.now() - lastMillisCheckedForPmInstallation >
                        MILLIS_PER_DAY
                ) {
                    // it's been over a day since we've asked the user to download the
                    // pm that we're unable to locate, update the checked flag to false
                    checkedForPmInstallation = false;
                }

                if (!checkedForPmInstallation && !foundPath) {
                    // show the download popup
                    downloadWindow = window
                        .showInformationMessage(
                            "The Plugin Manager does not look like it was installed. Would you like to download it now?",
                            { modal: true },
                            ...[DOWNLOAD_NOW_LABEL, "Not now"]
                        )
                        .then(selection => {
                            checkedForPmInstallation = true;
                            if (selection === DOWNLOAD_NOW_LABEL) {
                                // start the download process
                                downloadPM();
                            }
                            downloadWindow = null;
                            lastMillisCheckedForPmInstallation = Date.now();
                        });

                    return;
                }

                if (downloadingNow && checkedForPmInstallation && !foundPath) {
                    // don't message the user, it's downloading now
                    return;
                }

                //
                // Send a one time messager that we're unable to communicate with the Plugin Manager
                // and that the user should make sure its running.
                //
                if (!wasMessageShown && checkedForPmInstallation && foundPath) {
                    // still not sending data and we completed PM install check
                    window.showErrorMessage(
                        "We are having trouble sending data to Software.com. " +
                            "Please make sure the Plugin Manager is running and logged on.",
                        {
                            modal: true
                        }
                    );
                    console.error(
                        `Software.com: Unable to send KPM information: ${err}`
                    );
                    wasMessageShown = true;
                }
                // remove this project from the map
                delete activeKeystrokeCountMap[projectName];
            });
    }
}

class KeystrokeCountController {
    private _activeDatas: {} = {};
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
                if (keystrokeCount.hasData()) {
                    // send the payload
                    setTimeout(() => keystrokeCount.postToPM(), 0);
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

    private _onEventHandler(event) {
        if (!this.isTrueEventFile(event)) {
            return;
        }

        let filename = event.document.fileName || NO_NAME_FILE;

        let [keystrokeCount, fileInfo, rootPath] = this.getFileInfoDatam(
            filename
        );

        this.updateFileInfoLength(filename, fileInfo);

        //
        // Map all of the contentChanges objets then use the
        // reduce function to add up all of the lengths from each
        // contentChanges.text.length value, but only if the text
        // has a length.
        //

        let newCount = event.contentChanges
            .map(cc => (cc.text && cc.text.length > 0 ? cc.text.length : 0))
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

        if (newCount > 1) {
            //
            // it's a copy and past event
            //
            fileInfo.paste = fileInfo.paste + newCount;
            console.log("Software.com: Copy+Paste Incremented");
        } else if (newCount < 0) {
            fileInfo.delete = fileInfo.delete + Math.abs(newCount);
            console.log("Software.com: Delete Incremented");
        } else {
            // update the data for this fileInfo keys count
            fileInfo.keys = fileInfo.keys + 1;

            // update the overall count
            keystrokeCount.data = keystrokeCount.data + 1;
            console.log("Software.com: KPM incremented");
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
            keystrokeCount = new KeystrokeCount({
                // project.directory is used as an object key, must be string
                directory: rootPath,
                name: workspace.name || rootPath
            });
        }

        let fileInfo = null;
        if (filename) {
            //
            // Look for an existing file source. create it if it doesn't exist
            // or use it if it does and increment it's data value
            //
            fileInfo = findFileInfoInSource(keystrokeCount.source, filename);
            if (!fileInfo) {
                // initialize and add it
                fileInfo = {
                    keys: 0,
                    paste: 0,
                    open: 0,
                    close: 0,
                    delete: 0,
                    length: 0
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
