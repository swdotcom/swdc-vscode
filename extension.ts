// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
    window,
    workspace,
    Disposable,
    ExtensionContext,
    StatusBarAlignment,
    commands,
    extensions
} from "vscode";
import axios from "axios";

const fs = require("fs");
const os = require("os");
const cp = require("child_process");
const crypto = require("crypto");

// ? marks that the parameter is optional
type Project = { directory: String; name?: String };

const NOT_NOW_LABEL = "Not now";
const LOGIN_LABEL = "Log in";
const NO_NAME_FILE = "Untitled";
const DEFAULT_DURATION = 60;
const MILLIS_PER_HOUR = 1000 * 60 * 60;
const MILLIS_PER_MINUTE = 1000 * 60;
const LONG_THRESHOLD_HOURS = 12;
const SHORT_THRESHOLD_HOURS = 1;

const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// set the api endpoint to use
const api_endpoint = "https://api.software.com";
// set the launch url to use
const launch_url = "https://app.software.com";

let TELEMETRY_ON = true;

const beApi = axios.create({
    baseURL: `${api_endpoint}`
});

let statusBarItem = null;
let confirmWindow = null;
let lastAuthenticationCheckTime = -1;

// Available to the KeystrokeCount and the KeystrokeCountController
let activeKeystrokeCountMap = {};
let kpmInfo = {};
let extensionVersion;

export function activate(ctx: ExtensionContext) {
    const extension = extensions.getExtension("softwaredotcom.swdc-vscode")
        .packageJSON;

    extensionVersion = extension.version;
    console.log(`Software.com: Loaded v${extensionVersion}`);

    //
    // Add the keystroke controller to the ext ctx, which
    // will then listen for text document changes.
    //
    const controller = new KeystrokeCountController();
    ctx.subscriptions.push(controller);

    setTimeout(() => {
        statusBarItem = window.createStatusBarItem(
            StatusBarAlignment.Right,
            10
        );
        statusBarItem.tooltip = "Click to see more from Software.com";
        statusBarItem.command = "extension.softwareKpmDashboard";
        statusBarItem.show();

        showStatus("Software.com", null);
    }, 100);

    // 1 minute interval to fetch daily kpm info
    setInterval(() => {
        fetchDailyKpmSessionInfo();
    }, 1000 * 60);

    // initiate kpm fetch
    fetchDailyKpmSessionInfo();

    setTimeout(() => {
        // check if the user is authenticated with what is saved in the software config
        chekUserAuthenticationStatus();
    }, 5000);

    // send any offline data
    setTimeout(() => {
        // send any offline data
        sendOfflineData();
    }, 10000);

    ctx.subscriptions.push(
        commands.registerCommand("extension.softwareKpmDashboard", () => {
            handleKpmClickedEvent();
        })
    );
    ctx.subscriptions.push(
        commands.registerCommand("extension.pauseSoftwareMetrics", () => {
            handlePauseMetricsEvent();
        })
    );
    ctx.subscriptions.push(
        commands.registerCommand("extension.enableSoftwareMetrics", () => {
            handleEnableMetricsEvent();
        })
    );
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
        this.version = extensionVersion;
    }

    hasData() {
        for (const fileName of Object.keys(this.source)) {
            const fileInfoData = this.source[fileName];
            // check if any of the metric values has data
            if (
                fileInfoData &&
                (fileInfoData.add > 0 ||
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

    postData() {
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

        if (!TELEMETRY_ON) {
            storePayload(payload);
            console.log(
                "Software metrics are currently paused. Enable metrics to view your KPM info."
            );
            return;
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
                delete activeKeystrokeCountMap[projectName];
                chekUserAuthenticationStatus();
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

    private _onEventHandler(event) {
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
            const deleteCount = Math.abs(newCount);
            fileInfo.delete = fileInfo.delete + deleteCount;
            // update the overall count
            keystrokeCount.data = keystrokeCount.data + deleteCount;
            console.log("Software.com: Delete Incremented");
        } else {
            // update the data for this fileInfo keys count
            fileInfo.add = fileInfo.add + 1;

            // update the overall count
            keystrokeCount.data = keystrokeCount.data + 1;
            console.log("Software.com: KPM incremented");
        }

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
            fileInfo.linesRemoved += fileInfo.linesRemoved + Math.abs(diff);
        } else if (diff > 0) {
            fileInfo.linesAdded += fileInfo.linesAdded + diff;
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
                    syntax: ""
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

// process.platform return the following...
//   -> 'darwin', 'freebsd', 'linux', 'sunos' or 'win32'
function isWindows() {
    return process.platform.indexOf("win32") !== -1;
}

function isMac() {
    return process.platform.indexOf("darwin") !== -1;
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
        fs.mkdirSync(softwareDataDir);
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

async function serverIsAvailable() {
    return await checkOnline();
}

/**
 * User session will have...
 * { user: user, jwt: jwt }
 */
async function isAuthenticated() {
    if (!TELEMETRY_ON) {
        return true;
    }

    const tokenVal = getItem("token");
    if (!tokenVal) {
        showErrorStatus();
        return await new Promise((resolve, reject) => {
            resolve(false);
        });
    }

    // since we do have a token value, ping the backend using authentication
    // in case they need to re-authenticate
    beApi.defaults.headers.common["Authorization"] = getItem("jwt");
    return await beApi
        .get("/users/ping/")
        .then(() => {
            return true;
        })
        .catch(async () => {
            console.log("Software.com: The user is not logged in");
            showErrorStatus();
            return false;
        });
}

function showErrorStatus() {
    let fullMsg = `$(${"alert"}) ${"Software.com"}`;
    showStatus(
        fullMsg,
        "To see your coding data in Software.com, please log in to your account."
    );
}

async function checkOnline() {
    if (!TELEMETRY_ON) {
        return true;
    }
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
    if (!TELEMETRY_ON) {
        return;
    }
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

async function chekUserAuthenticationStatus() {
    let nowMillis = Date.now();
    if (
        lastAuthenticationCheckTime !== -1 &&
        nowMillis - lastAuthenticationCheckTime < MILLIS_PER_MINUTE * 3
    ) {
        // it's less than 3 minutes, wait until the threshold has passed until we try again
        return;
    }
    lastAuthenticationCheckTime = nowMillis;

    const serverAvailablePromise = serverIsAvailable();
    const isAuthenticatedPromise = isAuthenticated();
    const pastThresholdTime = isPastTimeThreshold();

    const serverAvailable = await serverAvailablePromise;
    const authenticated = await isAuthenticatedPromise;

    if (
        serverAvailable &&
        !authenticated &&
        pastThresholdTime &&
        !confirmWindow
    ) {
        //
        // Show the dialog if the user is not authenticated but online,
        // and it's past the threshold time and the confirm window is null
        //
        let infoMsg =
            "To see your coding data in Software.com, please log in to your account.";
        // set the last update time so we don't try to ask too frequently
        setItem("vscode_lastUpdateTime", Date.now());
        confirmWindow = window
            .showInformationMessage(infoMsg, ...[NOT_NOW_LABEL, LOGIN_LABEL])
            .then(selection => {
                if (selection === LOGIN_LABEL) {
                    handleKpmClickedEvent();
                }
                confirmWindow = null;
            });
    } else if (!authenticated) {
        showErrorStatus();
    }
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
    if (!TELEMETRY_ON) {
        return;
    }
    const tokenVal = getItem("token");

    if (!tokenVal) {
        return;
    }

    // need to get back...
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
            // try again in 2 minutes
            setTimeout(() => {
                checkTokenAvailability();
            }, 1000 * 120);
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
    if (!TELEMETRY_ON) {
        // telemetry is paused
        return;
    }
    const fromSeconds = nowInSecs();
    beApi.defaults.headers.common["Authorization"] = getItem("jwt");
    beApi
        .get(`/sessions?from=${fromSeconds}&summary=true`)
        .then(response => {
            const sessions = response.data;
            const inFlow =
                sessions.inFlow !== undefined && sessions.inFlow !== null
                    ? sessions.inFlow
                    : true;
            let avgKpm = sessions.kpm ? parseInt(sessions.kpm, 10) : 0;
            let totalMin = sessions.minutesTotal;
            let sessionMinAvg = sessions.sessionMinAvg
                ? parseInt(sessions.sessionMinAvg, 10)
                : 0;

            let sessionTime = humanizeMinutes(totalMin);

            let sessionMinGoalPercent = sessions.sessionMinGoalPercent
                ? parseFloat(sessions.sessionMinGoalPercent)
                : 0;

            let sessionTimeIcon = "";
            if (sessionMinGoalPercent > 0) {
                if (sessionMinGoalPercent < 0.45) {
                    sessionTimeIcon = "❍";
                } else if (sessionMinGoalPercent < 0.7) {
                    sessionTimeIcon = "◒";
                } else if (sessionMinGoalPercent < 0.95) {
                    sessionTimeIcon = "◍";
                } else {
                    sessionTimeIcon = "●";
                }
            }
            // const avgKpm = totalKpm > 0 ? totalKpm / sessionLen : 0;
            kpmInfo["kpmAvg"] =
                avgKpm > 0 || avgKpm === 0
                    ? avgKpm.toFixed(0)
                    : avgKpm.toFixed(2);
            kpmInfo["sessionTime"] = sessionTime;
            if (avgKpm > 0 || totalMin > 0) {
                let kpmMsg = `${kpmInfo["kpmAvg"]} KPM`;
                let sessionMsg = `${kpmInfo["sessionTime"]}`;

                // if inFlow then show the rocket
                if (inFlow) {
                    kpmMsg = "🚀" + " " + kpmMsg;
                }
                // if we have session avg percent info, show the icon that corresponds
                if (sessionTimeIcon) {
                    sessionMsg = sessionTimeIcon + " " + sessionMsg;
                }

                let fullMsg = kpmMsg + ", " + sessionMsg;
                showStatus(fullMsg, null);
            } else {
                showStatus("Software.com", null);
            }
        })
        .catch(err => {
            console.log(
                "Software.com: error getting session information: ",
                err.message
            );
        });
}

function humanizeMinutes(min) {
    min = parseInt(min, 0) || 0;
    let str = "";
    if (min === 60) {
        str = "1 hr";
    } else if (min > 60) {
        str = (min / 60).toFixed(2) + " hrs";
    } else if (min === 1) {
        str = "1 min";
    } else {
        // less than 60 seconds
        str = min.toFixed(0) + " min";
    }
    return str;
}

function handlePauseMetricsEvent() {
    TELEMETRY_ON = false;
    showStatus("Paused", "Enable metrics to resume");
}

function handleEnableMetricsEvent() {
    TELEMETRY_ON = true;
    showStatus("Software.com", null);
}

async function handleKpmClickedEvent() {
    // check if we've successfully logged in as this user yet
    const existingJwt = getItem("jwt");
    let tokenVal = getItem("token");

    let webUrl = launch_url;

    let addedToken = false;

    if (!tokenVal) {
        tokenVal = randomCode();
        addedToken = true;
        setItem("token", tokenVal);
    } else if (!existingJwt) {
        addedToken = true;
    } else if (!(await isAuthenticated())) {
        addedToken = true;
    }

    // add the token to the launch url
    if (addedToken) {
        webUrl = `${launch_url}/onboarding?token=${tokenVal}`;

        // check for the jwt in a minute
        setTimeout(() => {
            checkTokenAvailability();
        }, 1000 * 60);
    }

    launchWebUrl(webUrl);
}

function showStatus(fullMsg, tooltip) {
    if (!tooltip) {
        statusBarItem.tooltip = "Click to see more from Software.com";
    } else {
        statusBarItem.tooltip = tooltip;
    }
    statusBarItem.text = `${fullMsg}`;
}
