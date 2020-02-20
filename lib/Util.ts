import { getStatusBarItem } from "../extension";
import {
    workspace,
    extensions,
    window,
    Uri,
    commands,
    ViewColumn,
    WorkspaceFolder
} from "vscode";
import {
    CODE_TIME_EXT_ID,
    launch_url,
    LOGIN_LABEL,
    CODE_TIME_PLUGIN_ID,
    CODE_TIME_TYPE,
    api_endpoint
} from "./Constants";
import {
    refetchUserStatusLazily,
    getToggleFileEventLoggingState,
    getAppJwt
} from "./DataController";
import { updateStatusBarWithSummaryData } from "./storage/SessionSummaryData";
import { EventManager } from "./managers/EventManager";
import { serverIsAvailable } from "./http/HttpClient";
import { refetchAtlassianOauthLazily } from "./user/OnboardManager";

const moment = require("moment-timezone");
const open = require("open");
const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

export const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DASHBOARD_LABEL_WIDTH = 25;
export const DASHBOARD_VALUE_WIDTH = 25;
export const MARKER_WIDTH = 4;

const NUMBER_IN_EMAIL_REGEX = new RegExp("^\\d+\\+");
const dayFormat = "YYYY-MM-DD";
const dayTimeFormat = "LLLL";

let cachedSessionKeys = {};
let editorSessiontoken = null;
let showStatusBarText = true;
let extensionName = null;
let extensionDisplayName = null; // Code Time or Music Time

export function getEditorSessionToken() {
    if (!editorSessiontoken) {
        editorSessiontoken = randomCode();
    }
    return editorSessiontoken;
}

export function getPluginId() {
    return CODE_TIME_PLUGIN_ID;
}

export function getPluginName() {
    return CODE_TIME_EXT_ID;
}

export function getPluginType() {
    return CODE_TIME_TYPE;
}

export function getVersion() {
    const extension = extensions.getExtension(CODE_TIME_EXT_ID);
    return extension.packageJSON.version;
}

export function isCodeTimeMetricsFile(fileName) {
    fileName = fileName || "";
    if (fileName.includes(".software") && fileName.includes("CodeTime")) {
        return true;
    }
    return false;
}

export function codeTimeExtInstalled() {
    const codeTimeExt = extensions.getExtension(CODE_TIME_EXT_ID);
    return codeTimeExt ? true : false;
}

export function getSessionFileCreateTime() {
    let sessionFile = getSoftwareSessionFile();
    const stat = fs.statSync(sessionFile);
    if (stat.birthtime) {
        return stat.birthtime;
    }
    return stat.ctime;
}

/**
 * This method is sync, no need to await on it.
 * @param file
 */
export function getFileAgeInDays(file) {
    if (!fs.existsSync(file)) {
        return 0;
    }
    const stat = fs.statSync(file);
    let creationTimeSec = stat.birthtimeMs || stat.ctimeMs;
    // convert to seconds
    creationTimeSec /= 1000;

    const daysDiff = moment
        .duration(moment().diff(moment.unix(creationTimeSec)))
        .asDays();

    // if days diff is 0 then use 200, otherwise 100 per day, which is equal to a 9000 limit for 90 days
    return daysDiff > 1 ? parseInt(daysDiff, 10) : 1;
}

/**
 * These will return the workspace folders.
 * use the uri.fsPath to get the full path
 * use the name to get the folder name
 */
export function getWorkspaceFolders(): WorkspaceFolder[] {
    let folders = [];
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        for (let i = 0; i < workspace.workspaceFolders.length; i++) {
            let workspaceFolder = workspace.workspaceFolders[i];
            let folderUri = workspaceFolder.uri;
            if (folderUri && folderUri.fsPath) {
                // paths.push(folderUri.fsPath);
                folders.push(workspaceFolder);
            }
        }
    }
    return folders;
}

export function getNumberOfTextDocumentsOpen() {
    return workspace.textDocuments ? workspace.textDocuments.length : 0;
}

export function isFileOpen(fileName) {
    if (getNumberOfTextDocumentsOpen() > 0) {
        // check if the .software/CodeTime has already been opened
        for (let i = 0; i < workspace.textDocuments.length; i++) {
            let docObj = workspace.textDocuments[i];
            if (docObj.fileName && docObj.fileName === fileName) {
                return true;
            }
        }
    }
    return false;
}

export function getRootPathForFile(fileName) {
    let folder = getProjectFolder(fileName);
    if (folder) {
        return folder.uri.fsPath;
    }
    return null;
}

export function getProjectFolder(fileName) {
    let liveshareFolder = null;
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        for (let i = 0; i < workspace.workspaceFolders.length; i++) {
            let workspaceFolder = workspace.workspaceFolders[i];
            if (workspaceFolder.uri) {
                let isVslsScheme =
                    workspaceFolder.uri.scheme === "vsls" ? true : false;
                if (isVslsScheme) {
                    liveshareFolder = workspaceFolder;
                }
                let folderUri = workspaceFolder.uri;
                if (
                    folderUri &&
                    folderUri.fsPath &&
                    !isVslsScheme &&
                    fileName.includes(folderUri.fsPath)
                ) {
                    return workspaceFolder;
                }
            }
        }
    }
    // wasn't found but if liveshareFolder was found, return that
    if (liveshareFolder) {
        return liveshareFolder;
    }
    return null;
}

export function validateEmail(email) {
    let re = /\S+@\S+\.\S+/;
    return re.test(email);
}

export function setItem(key, value) {
    // update the cached session key map
    cachedSessionKeys[key] = value;

    const jsonObj = getSoftwareSessionAsJson();
    jsonObj[key] = value;

    const content = JSON.stringify(jsonObj);

    const sessionFile = getSoftwareSessionFile();
    fs.writeFileSync(sessionFile, content, err => {
        if (err)
            logIt(`Error writing to the Software session file: ${err.message}`);
    });
}

export function getItem(key) {
    let cachedVal = cachedSessionKeys[key];
    if (cachedVal) {
        return cachedVal;
    }
    const jsonObj = getSoftwareSessionAsJson();
    let val = jsonObj[key] || null;
    // update the cache map
    cachedSessionKeys[key] = val;
    return val;
}

export function showLoading() {
    let loadingMsg = "⏳ code time metrics";
    updateStatusBar(loadingMsg, "");
}

export function showStatus(fullMsg, tooltip) {
    if (!tooltip) {
        tooltip = "Code time today. Click to see more from Code Time.";
    }
    updateStatusBar(fullMsg, tooltip);
}

export function handleCodeTimeStatusToggle() {
    toggleStatusBar();
}

function updateStatusBar(msg, tooltip) {
    let loggedInName = getItem("name");
    let userInfo = "";
    if (loggedInName && loggedInName !== "") {
        userInfo = ` Logged in as ${loggedInName}`;
    }
    if (!tooltip) {
        tooltip = `Click to see more from Code Time`;
    }

    if (!showStatusBarText) {
        // add the message to the tooltip
        tooltip = msg + " | " + tooltip;
    }
    if (!getStatusBarItem()) {
        return;
    }
    getStatusBarItem().tooltip = `${tooltip}${userInfo}`;
    if (!showStatusBarText) {
        getStatusBarItem().text = "$(clock)";
    } else {
        getStatusBarItem().text = msg;
    }
}

export function toggleStatusBar() {
    showStatusBarText = !showStatusBarText;
    updateStatusBarWithSummaryData();
}

export function isStatusBarTextVisible() {
    return showStatusBarText;
}

export function isEmptyObj(obj) {
    return Object.keys(obj).length === 0 && obj.constructor === Object;
}

export function isLinux() {
    return isWindows() || isMac() ? false : true;
}

// process.platform return the following...
//   -> 'darwin', 'freebsd', 'linux', 'sunos' or 'win32'
export function isWindows() {
    return process.platform.indexOf("win32") !== -1;
}

export function isMac() {
    return process.platform.indexOf("darwin") !== -1;
}

export async function getHostname() {
    let hostname = await getCommandResult("hostname", 1);
    return hostname;
}

export function getOs() {
    let parts = [];
    let osType = os.type();
    if (osType) {
        parts.push(osType);
    }
    let osRelease = os.release();
    if (osRelease) {
        parts.push(osRelease);
    }
    let platform = os.platform();
    if (platform) {
        parts.push(platform);
    }
    if (parts.length > 0) {
        return parts.join("_");
    }
    return "";
}

export async function getCommandResult(cmd, maxLines: any = -1) {
    let result = await wrapExecPromise(`${cmd}`, null);
    if (!result) {
        return "";
    }
    let contentList = result
        .replace(/\r\n/g, "\r")
        .replace(/\n/g, "\r")
        .split(/\r/);
    if (contentList && contentList.length > 0) {
        let len =
            maxLines !== -1
                ? Math.min(contentList.length, maxLines)
                : contentList.length;
        for (let i = 0; i < len; i++) {
            let line = contentList[i];
            if (line && line.trim().length > 0) {
                result = line.trim();
                break;
            }
        }
    }
    return result;
}

export async function getOsUsername() {
    let username = os.userInfo().username;
    if (!username || username.trim() === "") {
        username = await getCommandResult("whoami", 1);
    }
    return username;
}

export function getDashboardFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\CodeTime.txt";
    } else {
        file += "/CodeTime.txt";
    }
    return file;
}

export function getCommitSummaryFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\CommitSummary.txt";
    } else {
        file += "/CommitSummary.txt";
    }
    return file;
}

export function getSummaryInfoFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\SummaryInfo.txt";
    } else {
        file += "/SummaryInfo.txt";
    }
    return file;
}

export function getSoftwareDir(autoCreate = true) {
    const homedir = os.homedir();
    let softwareDataDir = homedir;
    if (isWindows()) {
        softwareDataDir += "\\.software";
    } else {
        softwareDataDir += "/.software";
    }

    if (autoCreate && !fs.existsSync(softwareDataDir)) {
        fs.mkdirSync(softwareDataDir);
    }

    return softwareDataDir;
}

export function softwareSessionFileExists() {
    // don't auto create the file
    const file = getSoftwareSessionFile();
    // check if it exists
    return fs.existsSync(file);
}

export function jwtExists() {
    let jwt = getItem("jwt");
    return !jwt ? false : true;
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

export function getPluginEventsFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\events.json";
    } else {
        file += "/events.json";
    }
    return file;
}

export function getLocalREADMEFile() {
    let file = __dirname;
    if (isWindows()) {
        file += "\\README.md";
    } else {
        file += "/README.md";
    }
    return file;
}

export function getImagesDir() {
    let dir = __dirname;
    if (isWindows()) {
        dir += "\\images";
    } else {
        dir += "/images";
    }
    return dir;
}

export function displayReadmeIfNotExists(override = false) {
    const displayedReadme = getItem("vscode_CtReadme");
    if (!displayedReadme || override) {
        const readmeUri = Uri.file(getLocalREADMEFile());

        commands.executeCommand(
            "markdown.showPreview",
            readmeUri,
            ViewColumn.One
        );
        setItem("vscode_CtReadme", true);
    }
}

export function openFileInEditor(file) {
    // const uri = Uri.file(file);
    // commands.executeCommand("vscode.open", uri, ViewColumn.One);

    workspace.openTextDocument(file).then(
        doc => {
            // Show open document and set focus
            window
                .showTextDocument(doc, 1, false)
                .then(undefined, (error: any) => {
                    if (error.message) {
                        window.showErrorMessage(error.message);
                    } else {
                        logIt(error);
                    }
                });
        },
        (error: any) => {
            if (
                error.message &&
                error.message.toLowerCase().includes("file not found")
            ) {
                window.showErrorMessage(
                    `Cannot open ${file}.  File not found.`
                );
            } else {
                logIt(error);
            }
        }
    );
}

export function getExtensionDisplayName() {
    if (extensionDisplayName) {
        return extensionDisplayName;
    }
    let extInfoFile = __dirname;
    if (isWindows()) {
        extInfoFile += "\\extensioninfo.json";
    } else {
        extInfoFile += "/extensioninfo.json";
    }
    if (fs.existsSync(extInfoFile)) {
        const content = fs.readFileSync(extInfoFile).toString();
        if (content) {
            try {
                const data = JSON.parse(content);
                if (data) {
                    extensionDisplayName = data.displayName;
                }
            } catch (e) {
                logIt(`unable to read ext info name: ${e.message}`);
            }
        }
    }
    if (!extensionDisplayName) {
        extensionDisplayName = "Code Time";
    }
    return extensionDisplayName;
}

export function getExtensionName() {
    if (extensionName) {
        return extensionName;
    }
    let extInfoFile = __dirname;
    if (isWindows()) {
        extInfoFile += "\\extensioninfo.json";
    } else {
        extInfoFile += "/extensioninfo.json";
    }
    if (fs.existsSync(extInfoFile)) {
        const content = fs.readFileSync(extInfoFile).toString();
        if (content) {
            try {
                const data = JSON.parse(content);
                if (data) {
                    extensionName = data.name;
                }
            } catch (e) {
                logIt(`unable to read ext info name: ${e.message}`);
            }
        }
    }
    if (!extensionName) {
        extensionName = "swdc-vscode";
    }
    return extensionName;
}

export function logEvent(message) {
    const logEvents = getToggleFileEventLoggingState();
    if (logEvents) {
        console.log(`${getExtensionName()}: ${message}`);
    }
}

export function logIt(message) {
    console.log(`${getExtensionName()}: ${message}`);
}

export function getSoftwareSessionAsJson() {
    let data = null;

    const sessionFile = getSoftwareSessionFile();
    if (fs.existsSync(sessionFile)) {
        const content = fs.readFileSync(sessionFile).toString();
        if (content) {
            try {
                data = JSON.parse(content);
            } catch (e) {
                logIt(`unable to read session info: ${e.message}`);
                // error trying to read the session file, delete it
                deleteFile(sessionFile);
                data = {};
            }
        }
    }
    return data ? data : {};
}

export async function showOfflinePrompt(addReconnectMsg = false) {
    // shows a prompt that we're not able to communicate with the app server
    let infoMsg = "Our service is temporarily unavailable. ";
    if (addReconnectMsg) {
        infoMsg +=
            "We will try to reconnect again in 10 minutes. Your status bar will not update at this time.";
    } else {
        infoMsg += "Please try again later.";
    }
    // set the last update time so we don't try to ask too frequently
    window.showInformationMessage(infoMsg, ...["OK"]);
}

export function nowInSecs() {
    return Math.round(Date.now() / 1000);
}

export function getOffsetSeconds() {
    let d = new Date();
    return d.getTimezoneOffset() * 60;
}

export function getLastPayloadTimestampDay(latestPayloadTimestamp) {
    const UTC = moment.utc();
    const local = moment(UTC).local();
    const localDayTime = moment
        .unix(latestPayloadTimestamp)
        .utcOffset(moment.parseZone(local).utcOffset())
        .format(dayFormat);
    return localDayTime;
}

/**
 * Return the local and utc unix and day values
 */
export function getNowTimes() {
    const UTC = moment.utc();
    const now_in_sec = UTC.unix();
    const local = moment(UTC).local();
    const offset_in_sec = moment.parseZone(local).utcOffset() * 60;
    const local_now_in_sec = now_in_sec + offset_in_sec;
    const day = moment()
        .utcOffset(moment.parseZone(local).utcOffset())
        .format(dayFormat);
    const utcDay = moment()
        .utcOffset(0)
        .format(dayTimeFormat);
    const localDayTime = moment()
        .utcOffset(moment.parseZone(local).utcOffset())
        .format(dayTimeFormat);

    return {
        now_in_sec,
        local_now_in_sec,
        day,
        utcDay,
        localDayTime
    };
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

export function normalizeGithubEmail(email) {
    if (email) {
        email = email.replace("users.noreply.", "");
        if (NUMBER_IN_EMAIL_REGEX.test(email)) {
            // take out the 1st part
            email = email.substring(email.indexOf("+") + 1);
        }
    }
    return email;
}

export function getSongDisplayName(name) {
    if (!name) {
        return "";
    }
    name = name.trim();
    if (name.length > 11) {
        return `${name.substring(0, 10)}...`;
    }
    return name;
}

export async function getGitEmail() {
    let workspaceFolders = getWorkspaceFolders();

    if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
    }

    for (let i = 0; i < workspaceFolders.length; i++) {
        let projectDir = workspaceFolders[i].uri.fsPath;

        let email = await wrapExecPromise("git config user.email", projectDir);
        if (email) {
            return email;
        }
    }
    return null;
}

export async function wrapExecPromise(cmd, projectDir) {
    let result = null;
    try {
        let opts =
            projectDir !== undefined && projectDir !== null
                ? { cwd: projectDir }
                : {};
        result = await execPromise(cmd, opts).catch(e => {
            if (e.message) {
                console.log("task error: ", e.message);
            }
            return null;
        });
    } catch (e) {
        if (e.message) {
            console.log("task error: ", e.message);
        }
        result = null;
    }
    return result;
}

export function launchWebUrl(url) {
    open(url);
}

/**
 * @param num The number to round
 * @param precision The number of decimal places to preserve
 */
function roundUp(num, precision) {
    precision = Math.pow(10, precision);
    return Math.ceil(num * precision) / precision;
}

/**
 * humanize the minutes
 */
export function humanizeMinutes(min) {
    min = parseInt(min, 0) || 0;
    let str = "";
    if (min === 60) {
        str = "1 hr";
    } else if (min > 60) {
        let hrs = parseFloat(min) / 60;
        const roundedTime = roundUp(hrs, 1);
        str = roundedTime.toFixed(1) + " hrs";
    } else if (min === 1) {
        str = "1 min";
    } else {
        // less than 60 seconds
        str = min.toFixed(0) + " min";
    }
    return str;
}

export async function launchLogin() {
    const serverOnline = await serverIsAvailable();
    if (!serverOnline) {
        showOfflinePrompt();
        return;
    }
    let loginUrl = await buildLoginUrl(serverOnline);
    launchWebUrl(loginUrl);
    refetchUserStatusLazily();
}

/**
 * check if the user needs to see the login prompt or not
 */
export async function showLoginPrompt(serverIsOnline) {
    const infoMsg = `Finish creating your account and see rich data visualizations.`;
    // set the last update time so we don't try to ask too frequently
    const selection = await window.showInformationMessage(
        infoMsg,
        { modal: true },
        ...[LOGIN_LABEL]
    );

    let eventName = "";
    let eventType = "";

    if (selection === LOGIN_LABEL) {
        let loginUrl = await buildLoginUrl(serverIsOnline);
        launchWebUrl(loginUrl);
        refetchUserStatusLazily();
        eventName = "click";
        eventType = "mouse";
    } else {
        // create an event showing login was not selected
        eventName = "close";
        eventType = "window";
    }

    EventManager.getInstance().createCodeTimeEvent(
        eventType,
        eventName,
        "OnboardPrompt"
    );
}

export async function buildLoginUrl(serverOnline) {
    let jwt = getItem("jwt");
    if (!jwt) {
        // we should always have a jwt, but if  not create one
        // this will serve as a temp token until they've onboarded
        jwt = await getAppJwt(serverOnline);
        setItem("jwt", jwt);
    }
    if (jwt) {
        const encodedJwt = encodeURIComponent(jwt);
        const loginUrl = `${launch_url}/onboarding?token=${encodedJwt}&plugin=${getPluginType()}`;
        return loginUrl;
    } else {
        // no need to build an onboarding url if we dn't have the token
        return launch_url;
    }
}

export async function connectAtlassian() {
    const serverOnline = await serverIsAvailable();
    if (!serverOnline) {
        showOfflinePrompt();
        return;
    }
    let jwt = getItem("jwt");
    if (!jwt) {
        // we should always have a jwt, but if  not create one
        // this will serve as a temp token until they've onboarded
        jwt = await getAppJwt(serverOnline);
        setItem("jwt", jwt);
    }

    const encodedJwt = encodeURIComponent(jwt);
    const connectAtlassianAuth = `${api_endpoint}/auth/atlassian?token=${jwt}&plugin=${getPluginType()}`;
    launchWebUrl(connectAtlassianAuth);
    refetchAtlassianOauthLazily();
}

export function showInformationMessage(message: string) {
    return window.showInformationMessage(`${message}`);
}

export function showWarningMessage(message: string) {
    return window.showWarningMessage(`${message}`);
}

export function getDashboardRow(label, value) {
    let content = `${getDashboardLabel(label)} : ${getDashboardValue(value)}\n`;
    return content;
}

export function getSectionHeader(label) {
    let content = `${label}\n`;
    // add 3 to account for the " : " between the columns
    let dashLen = DASHBOARD_LABEL_WIDTH + DASHBOARD_VALUE_WIDTH + 15;
    for (let i = 0; i < dashLen; i++) {
        content += "-";
    }
    content += "\n";
    return content;
}

export function buildQueryString(obj) {
    let params = [];
    if (obj) {
        let keys = Object.keys(obj);
        if (keys && keys.length > 0) {
            for (let i = 0; i < keys.length; i++) {
                let key = keys[i];
                let val = obj[key];
                if (val && val !== undefined) {
                    let encodedVal = encodeURIComponent(val);
                    params.push(`${key}=${encodedVal}`);
                }
            }
        }
    }
    if (params.length > 0) {
        return "?" + params.join("&");
    } else {
        return "";
    }
}

function getDashboardLabel(label, width = DASHBOARD_LABEL_WIDTH) {
    return getDashboardDataDisplay(width, label);
}

function getDashboardValue(value) {
    let valueContent = getDashboardDataDisplay(DASHBOARD_VALUE_WIDTH, value);
    let paddedContent = "";
    for (let i = 0; i < 11; i++) {
        paddedContent += " ";
    }
    paddedContent += valueContent;
    return paddedContent;
}

function getDashboardDataDisplay(widthLen, data) {
    let len =
        data.constructor === String
            ? widthLen - data.length
            : widthLen - String(data).length;
    let content = "";
    for (let i = 0; i < len; i++) {
        content += " ";
    }
    return `${content}${data}`;
}

export function createSpotifyIdFromUri(id: string) {
    if (id.indexOf("spotify:") === 0) {
        return id.substring(id.lastIndexOf(":") + 1);
    }
    return id;
}

export function isValidJson(val: any) {
    if (val === null || val === undefined) {
        return false;
    }
    if (typeof val === "string" || typeof val === "number") {
        return false;
    }
    try {
        const stringifiedVal = JSON.stringify(val);
        JSON.parse(stringifiedVal);
        return true;
    } catch (e) {
        //
    }
    return false;
}

export function getFileType(fileName: string) {
    let fileType = "";
    const lastDotIdx = fileName.lastIndexOf(".");
    const len = fileName.length;
    if (lastDotIdx !== -1 && lastDotIdx < len - 1) {
        fileType = fileName.substring(lastDotIdx + 1);
    }
    return fileType;
}

export function getFileDataAsJson(file) {
    let data = null;
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file).toString();
        if (content) {
            try {
                data = JSON.parse(content);
            } catch (e) {
                logIt(`unable to read session info: ${e.message}`);
                // error trying to read the session file, delete it
                deleteFile(file);
            }
        }
    }
    return data;
}

export function getFileDataArray(file) {
    let payloads: any[] = [];
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file).toString();
        try {
            payloads = JSON.parse(content);
        } catch (e) {
            logIt(`Error reading file array data: ${e.message}`);
        }
    }
    return payloads;
}

export function getFileDataPayloadsAsJson(file) {
    let payloads: any[] = [];
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file).toString();
        if (content) {
            payloads = content
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
        }
    }
    return payloads;
}
