import { getStatusBarItem } from "./extension";
import { workspace, extensions, window, Uri, commands, ViewColumn, WorkspaceFolder, TextDocument } from "vscode";
import {
  CODE_TIME_EXT_ID,
  launch_url,
  CODE_TIME_PLUGIN_ID,
  CODE_TIME_TYPE,
  api_endpoint,
  SOFTWARE_DIRECTORY,
  LOG_FILE_EVENTS,
  SIGN_UP_LABEL,
} from "./Constants";
import { refetchUserStatusLazily } from "./DataController";
import { updateStatusBarWithSummaryData } from "./storage/SessionSummaryData";
import { v4 as uuidv4 } from "uuid";

import { format } from "date-fns";
import { showModalSignupPrompt } from "./managers/SlackManager";

const queryString = require("query-string");
const fileIt = require("file-it");
const moment = require("moment-timezone");
const open = require("open");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const path = require("path");

export const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DASHBOARD_LABEL_WIDTH = 28;
export const DASHBOARD_VALUE_WIDTH = 36;
export const DASHBOARD_COL_WIDTH = 21;
export const DASHBOARD_LRG_COL_WIDTH = 38;
export const TABLE_WIDTH = 80;
export const MARKER_WIDTH = 4;

const NUMBER_IN_EMAIL_REGEX = new RegExp("^\\d+\\+");
const dayFormat = "YYYY-MM-DD";
const dayTimeFormat = "LLLL";

let showStatusBarText = true;
let extensionName = null;
let workspace_name = null;

export function getWorkspaceName() {
  if (!workspace_name) {
    workspace_name = randomCode();
  }
  return workspace_name;
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

export function isGitProject(projectDir) {
  if (!projectDir) {
    return false;
  }

  if (!fs.existsSync(path.join(projectDir, ".git"))) {
    return false;
  }
  return true;
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

  const daysDiff = moment.duration(moment().diff(moment.unix(creationTimeSec))).asDays();

  // if days diff is 0 then use 200, otherwise 100 per day, which is equal to a 9000 limit for 90 days
  return daysDiff > 1 ? parseInt(daysDiff, 10) : 1;
}

export function getActiveProjectWorkspace(): WorkspaceFolder {
  const activeDocPath = findFirstActiveDirectoryOrWorkspaceDirectory();
  if (activeDocPath) {
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
      for (let i = 0; i < workspace.workspaceFolders.length; i++) {
        const workspaceFolder = workspace.workspaceFolders[i];
        const folderPath = workspaceFolder.uri.fsPath;
        if (activeDocPath.indexOf(folderPath) !== -1) {
          return workspaceFolder;
        }
      }
    }
  }
  return null;
}

export function isFileActive(file: string, isCloseEvent: boolean = false): boolean {
  if (isCloseEvent) return true;

  if (workspace.textDocuments) {
    for (let i = 0; i < workspace.textDocuments.length; i++) {
      const doc: TextDocument = workspace.textDocuments[i];
      if (doc && doc.fileName === file) {
        return true;
      }
    }
  }
  return false;
}

export function findFirstActiveDirectoryOrWorkspaceDirectory(): string {
  if (getNumberOfTextDocumentsOpen() > 0) {
    // check if the .software/CodeTime has already been opened
    for (let i = 0; i < workspace.textDocuments.length; i++) {
      let docObj = workspace.textDocuments[i];
      if (docObj.fileName) {
        const dir = getRootPathForFile(docObj.fileName);
        if (dir) {
          return dir;
        }
      }
    }
  }
  const folder: WorkspaceFolder = getFirstWorkspaceFolder();
  if (folder) {
    return folder.uri.fsPath;
  }
  return "";
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
        folders.push(workspaceFolder);
      }
    }
  }
  return folders;
}

export function getFirstWorkspaceFolder(): WorkspaceFolder {
  const workspaceFolders: WorkspaceFolder[] = getWorkspaceFolders();
  if (workspaceFolders && workspaceFolders.length) {
    return workspaceFolders[0];
  }
  return null;
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

export function getWorkspaceFolderByPath(path): WorkspaceFolder {
  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    for (let i = 0; i < workspace.workspaceFolders.length; i++) {
      let workspaceFolder: WorkspaceFolder = workspace.workspaceFolders[i];
      if (path.includes(workspaceFolder.uri.fsPath)) {
        return workspaceFolder;
      }
    }
  }
  return null;
}

export function getProjectFolder(fileName): WorkspaceFolder {
  let liveshareFolder = null;
  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    for (let i = 0; i < workspace.workspaceFolders.length; i++) {
      let workspaceFolder = workspace.workspaceFolders[i];
      if (workspaceFolder.uri) {
        let isVslsScheme = workspaceFolder.uri.scheme === "vsls" ? true : false;
        if (isVslsScheme) {
          liveshareFolder = workspaceFolder;
        }
        let folderUri = workspaceFolder.uri;
        if (folderUri && folderUri.fsPath && !isVslsScheme && fileName.includes(folderUri.fsPath)) {
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

export function setItem(key, value) {
  if (key === "jwt" || key === "name") {
    fileIt.setJsonValue(getAuthFile(), key, value);
  } else {
    fileIt.setJsonValue(getSoftwareSessionFile(), key, value);
  }
}

export function getItem(key) {
  if (key === "jwt" || key === "name") {
    const val = fileIt.getJsonValue(getAuthFile(), key);
    if (val) {
      return val;
    }
  }
  return fileIt.getJsonValue(getSoftwareSessionFile(), key);
}

export function getIntegrations() {
  let integrations = getFileDataAsJson(getIntegrationsFile());
  if (!integrations) {
    integrations = [];
    syncIntegrations(integrations);
  }
  return integrations;
}

export function syncIntegrations(integrations) {
  fileIt.writeJsonFileSync(getIntegrationsFile(), integrations);
}

export function getPluginUuid() {
  let plugin_uuid = fileIt.getJsonValue(getDeviceFile(), "plugin_uuid");
  if (!plugin_uuid) {
    // set it for the 1st and only time
    plugin_uuid = uuidv4();
    fileIt.setJsonValue(getDeviceFile(), "plugin_uuid", plugin_uuid);
  }
  return plugin_uuid;
}

export function getAuthCallbackState(autoCreate = true) {
  let auth_callback_state = fileIt.getJsonValue(getDeviceFile(), "auth_callback_state");
  if (!auth_callback_state && autoCreate) {
    auth_callback_state = uuidv4();
    setAuthCallbackState(auth_callback_state);
  }
  return auth_callback_state;
}

export function setAuthCallbackState(value: string) {
  fileIt.setJsonValue(getDeviceFile(), "auth_callback_state", value);
}

export function showStatus(fullMsg, tooltip) {
  if (!tooltip) {
    tooltip = "Active code time today. Click to see more from Code Time.";
  }
  updateStatusBar(fullMsg, tooltip);
}

function updateStatusBar(msg, tooltip) {
  let loggedInName = getItem("name");
  let userInfo = "";
  if (loggedInName && loggedInName !== "") {
    userInfo = ` Connected as ${loggedInName}`;
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
  let hostname = getCommandResultString("hostname");
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

/**
 * This function is synchronous as it uses "spawnSync" to perform shell commands
 * @param cmd
 * @param projectDir
 * @returns
 */
export function getCommandResultString(cmd, projectDir = null): string {
  const opts = projectDir !== undefined && projectDir !== null ? { cwd: projectDir } : {};

  return execCmd(cmd, opts);
}

function execCmd(cmd = "", opts = {}) {
  let resultStr = "";
  try {
    // add utf 8 to the options
    opts = {
      ...opts,
      encoding: "utf8",
    };

    // get the command and options
    let cmdOpts = cmd.trim().split(" ");
    if (cmdOpts.length) {
      // get the command
      cmd = cmdOpts[0];
      if (cmdOpts.length > 1) {
        // splice out the options
        cmdOpts = cmdOpts.slice(1, cmdOpts.length);
      } else {
        // no options, set the array to empty
        cmdOpts = [];
      }
    }
    const data = spawnSync(cmd, cmdOpts, opts);
    if (data) {
      const errorText = data?.stderr.toString().trim() ?? null;
      if (errorText) {
        console.error("command error: ", errorText);
        return null;
      }
      resultStr = data?.stdout.toString().trim() ?? "";
      const lines = resultStr ? resultStr.split(/\r?\n/) : null;
      if (lines && lines.length) {
        resultStr = lines[0];
      }
    }
  } catch (e) {
    console.error("command error: ", e);
  }
  return resultStr;
}

export async function getOsUsername() {
  let username = os.userInfo().username;
  if (!username || username.trim() === "") {
    username = getCommandResultString("whoami");
  }
  return username;
}

function getFile(name) {
  let file_path = getSoftwareDir();
  if (isWindows()) {
    return `${file_path}\\${name}`;
  }
  return `${file_path}/${name}`;
}

export function getDeviceFile() {
  return getFile("device.json");
}

export function getSoftwareSessionFile() {
  return getFile("session.json");
}

export function getAuthFile() {
  return getFile("auth.json");
}

export function getSoftwareDataStoreFile() {
  return getFile("data.json");
}

export function getPluginEventsFile() {
  return getFile("events.json");
}

export function getTimeCounterFile() {
  return getFile("timeCounter.json");
}

export function getDashboardFile() {
  return getFile("CodeTime.txt");
}

export function getCommitSummaryFile() {
  return getFile("CommitSummary.txt");
}

export function getGitEventFile() {
  return getFile("gitEvents.json");
}

export function getSummaryInfoFile() {
  return getFile("SummaryInfo.txt");
}

export function getProjectCodeSummaryFile() {
  return getFile("ProjectCodeSummary.txt");
}

export function getProjectContributorCodeSummaryFile() {
  return getFile("ProjectContributorCodeSummary.txt");
}

export function getDailyReportSummaryFile() {
  return getFile("DailyReportSummary.txt");
}

export function getIntegrationsFile() {
  return getFile("integrations.json");
}

export function getSoftwareDir(autoCreate = true) {
  const homedir = os.homedir();
  let softwareDataDir = homedir;
  if (isWindows()) {
    softwareDataDir += `\\${SOFTWARE_DIRECTORY}`;
  } else {
    softwareDataDir += `/${SOFTWARE_DIRECTORY}`;
  }

  if (autoCreate && !fs.existsSync(softwareDataDir)) {
    fs.mkdirSync(softwareDataDir);
  }

  return softwareDataDir;
}

export function getLocalREADMEFile() {
  const resourcePath: string = path.join(__dirname, "resources");
  const file = path.join(resourcePath, "README.md");
  return file;
}

export function displayReadmeIfNotExists(override = false) {
  const initialized_readme = getItem("vscode_CtReadme");

  if (!initialized_readme || override) {
    const readmeUri = Uri.file(getLocalREADMEFile());

    commands.executeCommand("markdown.showPreview", readmeUri, ViewColumn.One);
    setItem("vscode_CtReadme", true);
  }
}

export function openFileInEditor(file) {
  workspace.openTextDocument(file).then(
    (doc) => {
      // Show open document and set focus
      window.showTextDocument(doc, 1, false).then(undefined, (error: any) => {
        if (error.message) {
          window.showErrorMessage(error.message);
        } else {
          logIt(error);
        }
      });
    },
    (error: any) => {
      if (error.message && error.message.toLowerCase().includes("file not found")) {
        window.showErrorMessage(`Cannot open ${file}.  File not found.`);
      } else {
        logIt(error);
      }
    }
  );
}

export function getExtensionName() {
  if (extensionName) {
    return extensionName;
  }

  const resourcePath: string = path.join(__dirname, "resources");
  const extInfoFile = path.join(resourcePath, "extensioninfo.json");

  const extensionJson = fileIt.readJsonFileSync(extInfoFile);
  if (extensionJson) {
    extensionName = extensionJson.name;
  }
  if (!extensionName) {
    extensionName = "swdc-vscode";
  }
  return extensionName;
}

export function logEvent(message) {
  if (LOG_FILE_EVENTS) {
    console.log(`${getExtensionName()}: ${message}`);
  }
}

export function logIt(message) {
  console.log(`${getExtensionName()}: ${message}`);
}

export async function showOfflinePrompt(addReconnectMsg = false) {
  // shows a prompt that we're not able to communicate with the app server
  let infoMsg = "Our service is temporarily unavailable. ";
  if (addReconnectMsg) {
    infoMsg += "We will try to reconnect again in a minute. Your status bar will not update at this time.";
  } else {
    infoMsg += "Please try again later.";
  }
  // set the last update time so we don't try to ask too frequently
  window.showInformationMessage(infoMsg, ...["OK"]);
}

export function getOffsetSeconds() {
  let d = new Date();
  return d.getTimezoneOffset() * 60;
}

export function getFormattedDay(unixSeconds) {
  return moment.unix(unixSeconds).format(dayFormat);
}

export function isNewDay() {
  const { day } = getNowTimes();
  const currentDay = getItem("currentDay");
  return currentDay !== day ? true : false;
}

export function coalesceNumber(val, defaultVal = 0) {
  if (val === null || val === undefined || isNaN(val)) {
    return defaultVal;
  }
  return val;
}

/**
 * now - current time in UTC (Moment object)
 * now_in_sec - current time in UTC, unix seconds
 * offset_in_sec - timezone offset from UTC (sign = -420 for Pacific Time)
 * local_now_in_sec - current time in UTC plus the timezone offset
 * utcDay - current day in UTC
 * day - current day in local TZ
 * localDayTime - current day in local TZ
 *
 * Example:
 * { day: "2020-04-07", localDayTime: "Tuesday, April 7, 2020 9:48 PM",
 * local_now_in_sec: 1586296107, now: "2020-04-08T04:48:27.120Z", now_in_sec: 1586321307,
 * offset_in_sec: -25200, utcDay: "2020-04-08" }
 */
export function getNowTimes() {
  const now = moment.utc();
  const now_in_sec = now.unix();
  const offset_in_sec = moment().utcOffset() * 60;
  const local_now_in_sec = now_in_sec + offset_in_sec;
  const utcDay = now.format(dayFormat);
  const day = moment().format(dayFormat);
  const localDayTime = moment().format(dayTimeFormat);

  return {
    now,
    now_in_sec,
    offset_in_sec,
    local_now_in_sec,
    utcDay,
    day,
    localDayTime,
  };
}

export function randomCode() {
  return crypto
    .randomBytes(16)
    .map((value) => alpha.charCodeAt(Math.floor((value * alpha.length) / 256)))
    .toString();
}

export function normalizeGithubEmail(email: string, filterOutNonEmails = true) {
  if (email) {
    if (filterOutNonEmails && (email.endsWith("github.com") || email.includes("users.noreply"))) {
      return null;
    } else {
      const found = email.match(NUMBER_IN_EMAIL_REGEX);
      if (found && email.includes("users.noreply")) {
        // filter out the ones that look like
        // 2342353345+username@users.noreply.github.com"
        return null;
      }
    }
  }

  return email;
}

export function wrapExecCmd(cmd, projectDir) {
  let result = null;
  try {
    let opts = projectDir !== undefined && projectDir !== null ? { cwd: projectDir } : {};
    return execCmd(cmd, opts);
  } catch (e) {
    console.error(e.message);
  }
  return result;
}

export async function launchWebDashboard() {
  if (!checkRegistration()) {
    return;
  }

  // add the token=jwt
  const jwt = getItem("jwt");
  const encodedJwt = encodeURIComponent(jwt);
  const webUrl = `${launch_url}?token=${encodedJwt}`;

  launchWebUrl(webUrl);
}

export function launchWebUrl(url) {
  open(url);
}

function checkRegistration() {
  if (!getItem("name")) {
    window
      .showInformationMessage(
        "Sign up or log in to see more data visualizations.",
        {
          modal: true,
        },
        SIGN_UP_LABEL
      )
      .then(async (selection) => {
        if (selection === SIGN_UP_LABEL) {
          commands.executeCommand("codetime.signUpAccount");
        }
      });
    return false;
  }
  return true;
}

export function formatNumber(num) {
  let str = "";
  num = num ? parseFloat(num) : 0;
  if (num >= 1000) {
    str = num.toLocaleString();
  } else if (num % 1 === 0) {
    str = num.toFixed(0);
  } else {
    str = num.toFixed(2);
  }
  return str;
}

/**
 * humanize the minutes
 */
export function humanizeMinutes(min) {
  min = parseInt(min, 0) || 0;
  let str = "";
  if (min === 60) {
    str = "1h";
  } else if (min > 60) {
    const hours = Math.floor(min / 60);
    const minutes = min % 60;

    const hoursStr = Math.floor(hours).toFixed(0) + "h";
    if ((parseFloat(min) / 60) % 1 === 0) {
      str = hoursStr;
    } else {
      str = `${hoursStr} ${minutes}m`;
    }
  } else if (min === 1) {
    str = "1m";
  } else {
    // less than 60 seconds
    str = min.toFixed(0) + "m";
  }
  return str;
}

export async function launchEmailSignup(switching_account: boolean = false) {
  setItem("authType", "software");
  setItem("switching_account", switching_account);

  // continue with onboaring
  const url = await buildEmailSignup();

  launchWebUrl(url);
  refetchUserStatusLazily();
}

export async function launchLogin(loginType: string = "software", switching_account: boolean = false) {
  setItem("authType", loginType);
  setItem("switching_account", switching_account);

  // continue with onboaring
  const url = await buildLoginUrl(loginType);

  launchWebUrl(url);
  // use the defaults
  refetchUserStatusLazily();
}

/**
 * @param loginType "software" | "existing" | "google" | "github"
 */
export async function buildLoginUrl(loginType: string) {
  const auth_callback_state = getAuthCallbackState(true);
  const name = getItem("name");
  let url = launch_url;

  let obj = {
    plugin: getPluginType(),
    pluginVersion: getVersion(),
    plugin_id: getPluginId(),
    auth_callback_state,
    login: true,
  };

  // only send the plugin_uuid and plugin_token when registering for the 1st time
  if (!name) {
    obj["plugin_uuid"] = getPluginUuid();
    obj["plugin_token"] = getItem("jwt");
  }

  if (loginType === "github") {
    // github signup/login flow
    obj["redirect"] = launch_url;
    url = `${api_endpoint}/auth/github`;
  } else if (loginType === "google") {
    // google signup/login flow
    obj["redirect"] = launch_url;
    url = `${api_endpoint}/auth/google`;
  } else {
    // email login
    obj["token"] = getItem("jwt");
    obj["auth"] = "software";
    url = `${launch_url}/onboarding`;
  }

  const qryStr = queryString.stringify(obj);

  return `${url}?${qryStr}`;
}

/**
 * @param loginType "software" | "existing" | "google" | "github"
 */
export async function buildEmailSignup() {
  const auth_callback_state = getAuthCallbackState(true);

  let loginUrl = launch_url;

  let obj = {
    token: getItem("jwt"),
    auth: "software",
    plugin: getPluginType(),
    plugin_uuid: getPluginUuid(),
    pluginVersion: getVersion(),
    plugin_id: getPluginId(),
    auth_callback_state,
  };

  loginUrl = `${launch_url}/email-signup`;

  const qryStr = queryString.stringify(obj);

  return `${loginUrl}?${qryStr}`;
}

export function showInformationMessage(message: string) {
  return window.showInformationMessage(`${message}`);
}

export function showWarningMessage(message: string) {
  return window.showWarningMessage(`${message}`);
}

function getSpaces(spacesRequired) {
  let spaces = "";
  if (spacesRequired > 0) {
    for (let i = 0; i < spacesRequired; i++) {
      spaces += " ";
    }
  }
  return spaces;
}

export function getRowLabels(labels) {
  // for now 3 columns
  let content = "";
  let spacesRequired = 0;
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (i === 0) {
      content += label;
      // show a colon at the end of this column
      spacesRequired = DASHBOARD_COL_WIDTH - content.length - 1;
      content += getSpaces(spacesRequired);
      content += ":";
    } else if (i === 1) {
      // middle column
      spacesRequired = DASHBOARD_LRG_COL_WIDTH + DASHBOARD_COL_WIDTH - content.length - label.length - 1;
      content += getSpaces(spacesRequired);
      content += `${label} `;
    } else {
      // last column, get spaces until the end
      spacesRequired = DASHBOARD_COL_WIDTH - label.length - 2;
      content += `| `;
      content += getSpaces(spacesRequired);
      content += label;
    }
  }
  content += "\n";
  return content;
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
  return fileIt.readJsonFileSync(file);
}

export function getFileDataArray(file) {
  let payloads: any[] = fileIt.readJsonArraySync(file);
  return payloads;
}

export function noSpacesProjectDir(projectDir: string): string {
  return projectDir.replace(/^\s+/g, "");
}

export function checkRegistrationForReport(showSignup = true) {
  if (!getItem("name")) {
    if (showSignup) {
      showModalSignupPrompt("Unlock your personalized dashboard and visualize your coding activity. Create an account to get started.");
    }
    return false;
  }
  return true;
}
