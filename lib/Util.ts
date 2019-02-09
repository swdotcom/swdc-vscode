import { getStatusBarItem } from "../extension";
import { workspace } from "vscode";
import { fetchDailyKpmSessionInfo } from "./KpmStatsManager";

const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const cp = require("child_process");
const crypto = require("crypto");

export const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DASHBOARD_LABEL_WIDTH = 23;
export const DASHBOARD_VALUE_WIDTH = 25;

let lastMsg = "";
let lastTooltip = "";
let codeTimeMetricsIsFocused = false;
let codeTimeMetricsIsClosed = true;

export function isCodeTimeMetricsFocused() {
    return codeTimeMetricsIsFocused;
}

export function isCodeTimeMetricsClosed() {
    return codeTimeMetricsIsClosed;
}

export function updateCodeTimeMetricsFileFocus(isFocused) {
    codeTimeMetricsIsFocused = isFocused;
}

export function updateCodeTimeMetricsFileClosed(isClosed) {
    codeTimeMetricsIsClosed = isClosed;
}

export function isCodeTimeMetricsFile(fileName) {
    fileName = fileName || "";
    if (fileName.includes(".software") && fileName.includes("CodeTime")) {
        return true;
    }
    return false;
}

export function getRootPaths() {
    let paths = [];
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        for (let i = 0; i < workspace.workspaceFolders.length; i++) {
            let folderUri = workspace.workspaceFolders[i].uri;
            if (folderUri && folderUri.fsPath) {
                paths.push(folderUri.fsPath);
            }
        }
    }
    return paths;
}

export function getRootPathForFile(fileName) {
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        for (let i = 0; i < workspace.workspaceFolders.length; i++) {
            let folderUri = workspace.workspaceFolders[i].uri;
            if (
                folderUri &&
                folderUri.fsPath &&
                fileName.includes(folderUri.fsPath)
            ) {
                return folderUri.fsPath;
            }
        }
    }
    return null;
}

export function setItem(key, value) {
    const jsonObj = getSoftwareSessionAsJson();
    jsonObj[key] = value;

    const content = JSON.stringify(jsonObj);

    const sessionFile = getSoftwareSessionFile();
    fs.writeFileSync(sessionFile, content, err => {
        if (err)
            console.log(
                "Code Time: Error writing to the Software session file: ",
                err.message
            );
    });
}

export function getItem(key) {
    const jsonObj = getSoftwareSessionAsJson();

    return jsonObj[key] || null;
}

export function showErrorStatus(errorTooltip) {
    let fullMsg = `$(${"alert"}) ${"Code Time"}`;
    if (!errorTooltip) {
        errorTooltip =
            "To see your coding data in Code Time, please log in to your account.";
    }
    lastMsg = fullMsg;
    lastTooltip = errorTooltip;
    showStatus(fullMsg, errorTooltip);
}

export function showLoading() {
    let loadingMsg = "⏳ code time metrics";
    updateStatusBar(loadingMsg, "");
}

export function showLastStatus() {
    if (lastMsg && lastMsg !== "") {
        updateStatusBar(lastMsg, lastTooltip);
    } else {
        // make a /session fetch
        fetchDailyKpmSessionInfo();
    }
}

export function showStatus(fullMsg, tooltip) {
    if (!tooltip) {
        tooltip = "Click to see more from Code Time";
    }
    lastMsg = fullMsg;
    lastTooltip = tooltip;
    updateStatusBar(fullMsg, tooltip);
}

export function showTacoTimeStatus(fullMsg, tooltip) {
    getStatusBarItem().command = "extension.orderGrubCommand";
    updateStatusBar(fullMsg, tooltip);
}

function updateStatusBar(msg, tooltip) {
    getStatusBarItem().tooltip = tooltip;
    getStatusBarItem().text = msg;
}

export function isEmptyObj(obj) {
    return Object.keys(obj).length === 0 && obj.constructor === Object;
}

// process.platform return the following...
//   -> 'darwin', 'freebsd', 'linux', 'sunos' or 'win32'
export function isWindows() {
    return process.platform.indexOf("win32") !== -1;
}

export function isMac() {
    return process.platform.indexOf("darwin") !== -1;
}

export function getDashboardFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\CodeTime";
    } else {
        file += "/CodeTime";
    }
    return file;
}

export function getSoftwareDir() {
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

export function getSoftwareSessionFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\session.json";
    } else {
        file += "/session.json";
    }
    return file;
}

export function getSoftwareDataStoreFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\data.json";
    } else {
        file += "/data.json";
    }
    return file;
}

export function getSoftwareSessionAsJson() {
    let data = null;

    const sessionFile = getSoftwareSessionFile();
    if (fs.existsSync(sessionFile)) {
        const content = fs.readFileSync(sessionFile).toString();
        if (content) {
            data = JSON.parse(content);
            let keysLen = data ? Object.keys(data).length : 0;
            let dataLen = data && keysLen === 0 ? data.length : 0;
            if (data && keysLen === 0 && dataLen > 0) {
                // re-create the session file, it's corrupt without any keys but has a length
                deleteFile(sessionFile);
                data = {};
            }
        }
    }
    return data ? data : {};
}

export function nowInSecs() {
    return Math.round(Date.now() / 1000);
}

export function getOffsetSecends() {
    let d = new Date();
    return d.getTimezoneOffset() * 60;
}

export function storePayload(payload) {
    fs.appendFile(
        getSoftwareDataStoreFile(),
        JSON.stringify(payload) + os.EOL,
        err => {
            if (err)
                console.log(
                    "Code Time: Error appending to the Software data store file: ",
                    err.message
                );
        }
    );
}

export function randomCode() {
    return crypto
        .randomBytes(16)
        .map(value =>
            alpha.charCodeAt(Math.floor((value * alpha.length) / 256))
        )
        .toString();
}

export function deleteFile(file) {
    // if the file exists, get it
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
}

function execPromise(command, opts) {
    return new Promise(function(resolve, reject) {
        exec(command, opts, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(stdout.trim());
        });
    });
}

export async function wrapExecPromise(cmd, projectDir) {
    let result = null;
    try {
        let opts =
            projectDir !== undefined && projectDir != null
                ? { cwd: projectDir }
                : {};
        result = await execPromise(cmd, opts);
    } catch (e) {
        // console.error(e.message);
        result = null;
    }
    return result;
}

export function launchWebUrl(url) {
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
                "Code Time: Error launching Software web url: ",
                error.toString()
            );
        }
    });
}

export function humanizeMinutes(min) {
    min = parseInt(min, 0) || 0;
    let str = "";
    if (min === 60) {
        str = "1 hr";
    } else if (min > 60) {
        let hrs = parseFloat(min) / 60;
        if (hrs % 1 === 0) {
            str = hrs.toFixed(0) + " hrs";
        } else {
            str = (Math.round(hrs * 10) / 10).toFixed(1) + " hrs";
        }
    } else if (min === 1) {
        str = "1 min";
    } else {
        // less than 60 seconds
        str = min.toFixed(0) + " min";
    }
    return str;
}
