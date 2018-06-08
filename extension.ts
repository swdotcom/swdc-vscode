// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
    window,
    workspace,
    Disposable,
    ExtensionContext,
    TextDocument,
    StatusBarAlignment,
    ViewColumn,
    Selection,
    commands
} from "vscode";
import axios from "axios";
import {
    SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION,
    EPROTONOSUPPORT
} from "constants";
import { settings } from "cluster";

const request = require("request");
const fs = require("fs");
const readline = require("readline");
const open = require("open");
const os = require("os");
const cp = require("child_process");
const crypto = require("crypto");

// ? marks that the parameter is optional
type Project = { directory: String; name?: String };

const NOT_NOW_LABEL = "Not now";
const LOGIN_LABEL = "Login";
const NO_NAME_FILE = "Untitled";
const VERSION = "0.3.2";
const PM_URL = "http://localhost:19234";
const DEFAULT_DURATION = 60;
const MILLIS_PER_HOUR = 1000 * 60 * 60;
const LONG_THRESHOLD_HOURS = 12;
const SHORT_THRESHOLD_HOURS = 1;
const pmApi = axios.create({
    baseURL: `${PM_URL}/api/v1/`
});
const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TEST_API_ENDPOINT = "http://localhost:5000";
const TEST_URL = "http://localhost:3000";

const PROD_API_ENDPOINT = "https://api.software.com";
const PROD_URL = "https://alpha.software.com";

// set the api endpoint to use
const api_endpoint = PROD_API_ENDPOINT;
// set the launch url to use
const launch_url = PROD_URL;

const beApi = axios.create({
    baseURL: `${api_endpoint}`
});

const pmBucket = "https://s3-us-west-1.amazonaws.com/swdc-plugin-manager/";

let pmName = "software";
let downloadingNow = false;
let statusBarItem = null;
let confirmWindow = null;
let confirmWindowOpen = false;

// Available to the KeystrokeCount and the KeystrokeCountController
let activeKeystrokeCountMap = {};
let kpmInfo = {};

export function activate(ctx: ExtensionContext) {
    console.log(`Software.com: Loaded v${VERSION}`);

    //
    // Add the keystroke controller to the ext ctx, which
    // will then listen for text document changes.
    //
    const controller = new KeystrokeCountController();
    ctx.subscriptions.push(controller);

    var disposable = commands.registerCommand("extension.kpmClicked", () => {
        handleKpmClickedEvent();
    });
    ctx.subscriptions.push(disposable);

    statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 10);
    statusBarItem.tooltip = "Click to see more from Software.com";
    statusBarItem.command = "extension.kpmClicked";
    statusBarItem.show();
    showStatus(`Software.com`);

    setInterval(() => {
        fetchDailyKpmSessionInfo();
    }, 1000 * 60);

    // send any offline data
    setTimeout(() => {
        // check if the user is authenticated with what is saved in the software config
        chekUserAuthenticationStatus();
        fetchDailyKpmSessionInfo();
        sendOfflineData();
    }, 5000);
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
        const startOfEvent = nowInSecs() - DEFAULT_DURATION;

        (this.source = {}),
            (this.type = "Events"),
            (this.data = 0),
            (this.start = startOfEvent),
            (this.end = startOfEvent + 60),
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

        sendOfflineData();

        console.error(`Software.com: sending ${JSON.stringify(payload)}`);

        // POST the kpm to the PluginManager
        beApi.defaults.headers.common["Authorization"] = getItem("jwt");
        return beApi
            .post("/data", payload)
            .then(response => {
                // everything is fine, remove this one from the map
                delete activeKeystrokeCountMap[projectName];
            })
            .catch(err => {
                // store the payload offline
                console.log(
                    "Software.com: Error sending data, saving kpm info offline"
                );
                storePayload(payload);
                chekUserAuthenticationStatus();
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
                const hasData = keystrokeCount.hasData();
                if (hasData) {
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
        // Map all of the contentChanges objects then use the
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
function getPluginManagerAppFile() {
    const startPath = getInstallDir();
    const dirFiles = fs.readdirSync(startPath);

    for (let i in dirFiles) {
        const file = dirFiles[i];
        if (file.toLowerCase().indexOf("software") === 0) {
            return file;
        }
    }

    console.log(
        `Software.com: Unable to locate Software Desktop within ${startPath}`
    );
    return null;
}

// process.platform return the following...
//   -> 'darwin', 'freebsd', 'linux', 'sunos' or 'win32'
function isWindows() {
    return process.platform.indexOf("win32") !== -1;
}

function isMac() {
    return process.platform.indexOf("darwin") !== -1;
}

async function getLatestPmName() {
    const ymlUrl = pmBucket + "latest.yml";
    const ymlFile = os.homedir() + "/latest.yml";

    let options = { url: ymlUrl };
    let req = request.get(options);
    let out = fs.createWriteStream(ymlFile);

    req.pipe(out);

    /**
     * example content:
     *  version: 0.5.5
        files:
        - url: software-plugin-manager-0.5.5.exe
            sha512: Zo8SfVtfuXST0y/IhfQORU2knk2qwX+2hC3OHnlDLzbiblae1YJO0zPjOq5aXdLPM/fK9PgrVT0FDe3izSupJw==
            size: 39836352
        path: software-plugin-manager-0.5.5.exe
        sha512: Zo8SfVtfuXST0y/IhfQORU2knk2qwX+2hC3OHnlDLzbiblae1YJO0zPjOq5aXdLPM/fK9PgrVT0FDe3izSupJw==
        sha2: 9fad7b5634c38203a74d89b02e7e52c2bc1f723297d511c4532072279334a0aa
        releaseDate: '2018-04-12T17:00:54.727Z'
     */
    req.on("end", function() {
        // read file
        fs.readFile(ymlFile, (err, data) => {
            if (err) throw err;
            let content = data.toString();
            content = content.split("\n");

            // get the path name, sans the extension
            let nameSansExt = content
                .find(s => s.includes("path:"))
                .replace(/\s+/g, "")
                .split("path:")[1]
                .split(".exe")[0];

            if (nameSansExt) {
                pmName = nameSansExt;
            }
        });

        // delete file
        fs.unlink(ymlFile, function(error) {
            if (error) {
                throw error;
            }
        });
    });
}

function getSoftwareDir() {
    const homedir = os.homedir();
    let softwareDataDir = homedir;
    if (isWindows()) {
        softwareDataDir += "\\.software";
    } else {
        softwareDataDir += "/.software";
    }

    if (!fs.existsSync(softwareDataDir)) {
        fs.mkdirSync(softwareDataDir).toString();
    }

    return softwareDataDir;
}

function getSoftwareSessionFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\session.json";
    } else {
        file += "/session.json";
    }
    return file;
}

function getSoftwareDataStoreFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\data.json";
    } else {
        file += "/data.json";
    }
    return file;
}

function getInstallDir() {
    // first check if the pm has been installed or not
    const homedir = os.homedir();
    let installDir;
    if (isMac()) {
        installDir = "/Applications";
    } else if (isWindows()) {
        installDir = os.homedir() + "\\AppData\\Local\\Programs";
    } else {
        installDir = "/usr/lib/";
    }
    return installDir;
}

function getPmExtension() {
    let pmExtension = ".dmg";
    if (isWindows()) {
        pmExtension = ".exe";
    } else if (!isMac()) {
        pmExtension = ".deb";
    }

    return pmExtension;
}

function getPmBinaryTarget() {
    let homedir = os.homedir();

    if (isMac()) {
        homedir += "/Desktop/";
    } else if (isWindows()) {
        homedir += "\\Desktop\\";
    } else if (!isMac()) {
        homedir += "/Desktop/";
    }

    let pmBinary = homedir + pmName + getPmExtension();

    return pmBinary;
}

function downloadPM() {
    downloadingNow = true;

    let pmBinary = getPmBinaryTarget();
    let file_url = pmBucket + pmName + getPmExtension();

    // Save variable to know progress
    var received_bytes = 0;
    var total_bytes = 0;
    let options = { url: file_url };
    let req = request.get(options);
    let out = fs.createWriteStream(pmBinary);

    req.pipe(out);
    req.on("response", function(data) {
        if (data && data.statusCode === 200) {
            showStatus("Downloading Software Desktop");
        } else {
            downloadingNow = false;
        }

        // Change the total bytes value to get progress later.
        total_bytes = parseInt(data.headers["content-length"]);
    });

    req.on("data", function(chunk) {
        // Update the received bytes
        received_bytes += chunk.length;
        showProgress(received_bytes, total_bytes);
    });

    req.on("end", function() {
        downloadingNow = false;

        // show the final message in the status bar
        showStatus("Completed Software Desktop");

        // install the plugin manager
        open(pmBinary);

        setTimeout(() => {
            showStatus("");
        }, 5000);
    });
}

function showProgress(received, total) {
    const percent = Math.ceil(Math.max((received * 100) / total, 2));
    // let message = `Downloaded ${percent}% | ${received} bytes out of ${total} bytes`;
    showStatus(`Downloading Software Desktop: ${percent}%`);
}

async function serverIsAvailable() {
    return await checkOnline();
}

/**
 * User session will have...
 * { user: user, jwt: jwt }
 */
async function isAuthenticated() {
    const tokenVal = getItem("token");
    if (!tokenVal) {
        return false;
    }

    // since we do have a token value, ping the backend using authentication
    // in case they need to re-authenticate
    beApi.defaults.headers.common["Authorization"] = getItem("jwt");
    const authenticated = await beApi
        .get("/users/ping/")
        .then(() => {
            return true;
        })
        .catch(() => {
            console.log("Software.com: The user is not authenticated");
            return false;
        });

    return authenticated;
}

async function checkOnline() {
    // non-authenticated ping, no need to set the Authorization header
    const isOnline = await beApi
        .get("/ping")
        .then(() => {
            return true;
        })
        .catch(() => {
            console.log("Software.com: Server not reachable");
            return false;
        });
    return isOnline;
}

function storePayload(payload) {
    fs.appendFile(
        getSoftwareDataStoreFile(),
        JSON.stringify(payload) + os.EOL,
        err => {
            if (err)
                console.log(
                    "Software.com: Error appending to the Software data store file: ",
                    err.message
                );
        }
    );
}

function sendOfflineData() {
    const dataStoreFile = getSoftwareDataStoreFile();
    if (fs.existsSync(dataStoreFile)) {
        const content = fs.readFileSync(dataStoreFile).toString();
        if (content) {
            console.error(`Software.com: sending batch payloads: ${content}`);
            const payloads = content
                .split(/\r?\n/)
                .map(item => {
                    let obj = null;
                    if (item) {
                        try {
                            obj = JSON.parse(item);
                        } catch (e) {
                            //
                        }
                    }
                    if (obj) {
                        return obj;
                    }
                })
                .filter(item => item);
            // POST the kpm to the PluginManager
            beApi.defaults.headers.common["Authorization"] = getItem("jwt");
            return beApi
                .post("/data/batch", payloads)
                .then(response => {
                    // everything is fine, delete the offline data file
                    deleteFile(getSoftwareDataStoreFile());
                })
                .catch(err => {
                    console.log(
                        "Software.com: Unable to send offline data: ",
                        err.message
                    );
                });
        }
    }
}

function setItem(key, value) {
    const jsonObj = getSoftwareSessionAsJson();
    jsonObj[key] = value;

    const content = JSON.stringify(jsonObj);

    const sessionFile = getSoftwareSessionFile();
    fs.writeFileSync(sessionFile, content, err => {
        if (err)
            console.log(
                "Software.com: Error writing to the Software session file: ",
                err.message
            );
    });
}

function getItem(key) {
    const jsonObj = getSoftwareSessionAsJson();

    return jsonObj[key] || null;
}

function getSoftwareSessionAsJson() {
    let data = null;

    const sessionFile = getSoftwareSessionFile();
    if (fs.existsSync(sessionFile)) {
        const content = fs.readFileSync(sessionFile).toString();
        if (content) {
            data = JSON.parse(content);
        }
    }
    return data ? data : {};
}

function deleteFile(file) {
    // if the file exists, get it
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
}

function chekUserAuthenticationStatus() {
    const serverAvailablePromise = serverIsAvailable();
    const isAuthenticatedPromise = isAuthenticated();
    const pastThresholdTime = isPastTimeThreshold();
    const existingJwt = getItem("jwt");

    Promise.all([serverAvailablePromise, isAuthenticatedPromise]).then(
        values => {
            const serverAvailable = values[0];
            const isAuthenticated = values[1];
            //
            // Show the dialog if the user is not authenticated but online,
            // and it's past the threshold time and the confirm window is null
            //
            if (
                serverAvailable &&
                !isAuthenticated &&
                pastThresholdTime &&
                !confirmWindowOpen
            ) {
                // set the last update time so we don't try to ask too frequently
                setItem("vscode_lastUpdateTime", Date.now());
                confirmWindowOpen = true;
                let infoMsg =
                    "To see insights into how you code, please sign in to Software.com.";
                if (existingJwt) {
                    // they have an existing jwt, show the re-login message
                    infoMsg =
                        "We are having trouble sending data to Software.com, please sign in to see insights into how you code.";
                }

                confirmWindow = window
                    .showInformationMessage(
                        infoMsg,
                        ...[NOT_NOW_LABEL, LOGIN_LABEL]
                    )
                    .then(selection => {
                        if (selection === LOGIN_LABEL) {
                            const tokenVal = randomCode();
                            // update the .software data with the token we've just created
                            setItem("token", tokenVal);
                            launchWebUrl(
                                `${launch_url}/login?token=${tokenVal}`
                            );
                        }
                        confirmWindowOpen = false;
                        confirmWindow = null;
                    });
            }
        }
    );
}

/**
 * Checks the last time we've updated the session info
 */
function isPastTimeThreshold() {
    const existingJwt = getItem("jwt");
    const thresholdHoursBeforeCheckingAgain = !existingJwt
        ? SHORT_THRESHOLD_HOURS
        : LONG_THRESHOLD_HOURS;
    const lastUpdateTime = getItem("vscode_lastUpdateTime");
    if (
        lastUpdateTime &&
        Date.now() - lastUpdateTime <
            MILLIS_PER_HOUR * thresholdHoursBeforeCheckingAgain
    ) {
        return false;
    }
    return true;
}

function randomCode() {
    return crypto
        .randomBytes(16)
        .map(value =>
            alpha.charCodeAt(Math.floor((value * alpha.length) / 256))
        )
        .toString();
}

function checkTokenAvailability() {
    const tokenVal = getItem("token");

    // ned to get back...
    // response.data.user, response.data.jwt
    // non-authorization API
    beApi
        .get(`/users/plugin/confirm?token=${tokenVal}`)
        .then(response => {
            if (response.data) {
                setItem("jwt", response.data.jwt);
                setItem("user", response.data.user);
                setItem("vscode_lastUpdateTime", Date.now());
            }
        })
        .catch(err => {
            console.log(
                "Software.com: unable to obtain session token: ",
                err.message
            );
            // try again in 1 minute
            setTimeout(() => {
                checkTokenAvailability();
            }, 1000 * 60);
        });
}

function launchWebUrl(url) {
    let open = "open";
    let args = [`${url}`];
    if (isWindows()) {
        open = "cmd";
        // adds the following args to the beginning of the array
        args.unshift("/c", "start", '""');
    } else if (!isMac()) {
        open = "xdg-open";
    }

    let process = cp.execFile(open, args, (error, stdout, stderr) => {
        if (error != null) {
            console.log(
                "Software.com: Error launching Software authentication: ",
                error.toString()
            );
        }
    });
}

async function fetchDailyKpmSessionInfo() {
    if (await !isAuthenticated()) {
        console.log("Software.com: not authenticated, trying again later");
        return;
    }
    /**
     * http://localhost:5000/sessions?from=1527724925&summary=true
     * [
            {
                "to": "1527788100",
                "from": "1527782400",
                "minutesTotal": 95,
                "kpm": 108,
                "plugins": [
                    {
                        "name": "keystrokes",
                        "data": [
                            {
                                "values": [],
                                "average": {
                                    "value": 109.787001477105,
                                    "daysHistory": 1
                                },
                                "interval": 1,
                                "type": "keystrokes",
                                "intervalUnit": "minute"
                            }
                        ]
                    }
                ],
                "projectInfo": {}
            }
        ]
     */

    const fromSeconds = nowInSecs();
    beApi.defaults.headers.common["Authorization"] = getItem("jwt");
    beApi
        .get(`/sessions?from=${fromSeconds}&summary=true`)
        .then(response => {
            const sessions = response.data;
            let avgKpm = sessions.kpm ? parseInt(sessions.kpm, 10) : 0;
            let totalMin = sessions.minutesTotal;
            let sessionTime = "";
            if (totalMin === 60) {
                sessionTime = "1 hr";
            } else if (totalMin > 60) {
                sessionTime = (totalMin / 60).toFixed(2) + " hrs";
            } else if (totalMin === 1) {
                sessionTime = "1 min";
            } else {
                sessionTime = totalMin + " min";
            }
            // const avgKpm = totalKpm > 0 ? totalKpm / sessionLen : 0;
            kpmInfo["kpmAvg"] =
                avgKpm > 0 ? avgKpm.toFixed(0) : avgKpm.toFixed(2);
            kpmInfo["sessionTime"] = sessionTime;
            if (avgKpm > 0 || totalMin > 0) {
                showStatus(
                    `${kpmInfo["kpmAvg"]} KPM, ${kpmInfo["sessionTime"]}`
                );
            } else {
                showStatus("Software.com");
            }
        })
        .catch(err => {
            console.log(
                "Software.com: error getting session information: ",
                err.message
            );
            chekUserAuthenticationStatus();
        });
}

function getSelectedKpm() {
    if (kpmInfo["kpmAvg"]) {
        return `${kpmInfo["kpmAvg"]} KPM, ${kpmInfo["sessionTime"]}`;
    }
    return "";
}

function handleKpmClickedEvent() {
    // check if we've successfully logged in as this user yet
    const existingJwt = getItem("jwt");

    let webUrl = launch_url;
    if (!existingJwt) {
        const tokenVal = randomCode();
        // update the .software data with the token we've just created
        setItem("token", tokenVal);
        webUrl = `${launch_url}/login?token=${tokenVal}`;
    }

    launchWebUrl(webUrl);
}

function showStatus(msg) {
    statusBarItem.text = `$(flame)${msg}`;
}
