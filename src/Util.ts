import {workspace, extensions, window, Uri, commands, ViewColumn, WorkspaceFolder} from 'vscode';
import {
  CODE_TIME_EXT_ID,
  app_url,
  CODE_TIME_PLUGIN_ID,
  CODE_TIME_TYPE,
  SOFTWARE_DIRECTORY,
  SIGN_UP_LABEL,
} from './Constants';
import {v4 as uuidv4} from 'uuid';

import {showModalSignupPrompt} from './managers/SlackManager';
import {execCmd} from './managers/ExecManager';
import {getFileDataAsJson, getJsonItem, setJsonItem, storeJsonData} from './managers/FileManager';
import {SummaryManager} from './managers/SummaryManager';
import { formatISO } from 'date-fns';

const moment = require('moment-timezone');
const open = require('open');

const fs = require('fs');
const os = require('os');
const path = require('path');
const outputChannel = window.createOutputChannel('CodeTime');

export const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const dayFormat = 'YYYY-MM-DD';
const dayTimeFormat = 'LLLL';

let workspace_name: string | null = null;
let hostname: string | null = null;
let osUsername: string | null = null;

export function getRandomNumberWithinRange(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

export function getWorkspaceName() {
  if (!workspace_name) {
    workspace_name = uuidv4();
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
  return extension ? extension.packageJSON.version : '2.5.27';
}

export function getEditorName() {
  return 'vscode';
}

export function isGitProject(projectDir: string) {
  if (!projectDir) {
    return false;
  }

  const gitRemotesDir = path.join(projectDir, '.git', 'refs', 'remotes');
  if (!fs.existsSync(gitRemotesDir)) {
    return false;
  }
  return true;
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

export function getFirstWorkspaceFolder(): WorkspaceFolder | null {
  const workspaceFolders: WorkspaceFolder[] = getWorkspaceFolders();
  if (workspaceFolders && workspaceFolders.length) {
    return workspaceFolders[0];
  }
  return null;
}

export function getNumberOfTextDocumentsOpen() {
  return workspace.textDocuments ? workspace.textDocuments.length : 0;
}

export function updateFlowChange(in_flow: boolean) {
  setJsonItem(getFlowChangeFile(), "in_flow", in_flow);
}

export function getFlowChangeState(): boolean {
  // nullish coalesce the "in_flow" flag if it doesn't exist
  return getJsonItem(getFlowChangeFile(), "in_flow") ?? false;
}

export function setItem(key: string, value: any) {
  setJsonItem(getSoftwareSessionFile(), key, value);
}

export function getItem(key: string) {
  return getJsonItem(getSoftwareSessionFile(), key);
}

export function getIntegrations() {
  let integrations = getFileDataAsJson(getIntegrationsFile());
  if (!integrations) {
    integrations = [];
    storeJsonData(getIntegrationsFile(), integrations);
  }
  const integrationsLen = integrations.length;
  // check to see if there are any [] values and remove them
  integrations = integrations.filter((n: any) => n && n.authId);
  if (integrations.length !== integrationsLen) {
    // update the file with the latest
    storeJsonData(getIntegrationsFile(), integrations);
  }
  return integrations;
}

export function syncSlackIntegrations(integrations: any[]) {
  const nonSlackIntegrations = getIntegrations().filter(
    (integration: any) => integration.name.toLowerCase() != 'slack'
  );
  integrations = integrations?.length ? [...integrations, ...nonSlackIntegrations] : nonSlackIntegrations;
  storeJsonData(getIntegrationsFile(), integrations);
}

export function getPluginUuid() {
  let plugin_uuid = getJsonItem(getDeviceFile(), 'plugin_uuid');
  if (!plugin_uuid) {
    // set it for the 1st and only time
    plugin_uuid = uuidv4();
    setJsonItem(getDeviceFile(), 'plugin_uuid', plugin_uuid);
  }
  return plugin_uuid;
}

export function getAuthCallbackState(autoCreate = true) {
  let auth_callback_state = getJsonItem(getDeviceFile(), 'auth_callback_state');
  if (!auth_callback_state && autoCreate) {
    auth_callback_state = uuidv4();
    setAuthCallbackState(auth_callback_state);
  }
  return auth_callback_state;
}

export function setAuthCallbackState(value: string | null) {
  setJsonItem(getDeviceFile(), 'auth_callback_state', value);
}

export function isLinux() {
  return isWindows() || isMac() ? false : true;
}

// process.platform return the following...
//   -> 'darwin', 'freebsd', 'linux', 'sunos' or 'win32'
export function isWindows() {
  return process.platform.indexOf('win32') !== -1;
}

export function isMac() {
  return process.platform.indexOf('darwin') !== -1;
}

export function getHostname(): any {
  if (!hostname) {
    hostname = execCmd('hostname');
  }
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
    return parts.join('_');
  }
  return '';
}

export async function getOsUsername() {
  if (!osUsername) {
    try {
      // Throws a SystemError if a user has no username or homedir
      osUsername = os.userInfo().username;
    } catch (e: any) {
      console.error('Username not available.', e.message);
    }

    if (!osUsername) {
      osUsername = execCmd('whoami');
    }
  }
  return osUsername;
}

export function isEditorOpsInstalled(): boolean {
  const editorOpsExt = extensions.getExtension('softwaredotcom.editor-ops');
  return !!(editorOpsExt);
}

function getFile(name: string) {
  let file_path = getSoftwareDir();
  if (isWindows()) {
    return `${file_path}\\${name}`;
  }
  return `${file_path}/${name}`;
}

export function getDeviceFile() {
  return getFile('device.json');
}

export function getSoftwareSessionFile() {
  return getFile('session.json');
}

export function getGitEventFile() {
  return getFile('gitEvents.json');
}

export function getIntegrationsFile() {
  return getFile('integrations.json');
}

export function getSessionSummaryFile() {
  return getFile('sessionSummary.json');
}

export function getFlowChangeFile() {
  return getFile('flowChange.json');
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
  const resourcePath: string = path.join(__dirname, 'resources');
  const file = path.join(resourcePath, 'README.md');
  return file;
}

export function displayReadme() {
  const readmeUri = Uri.file(getLocalREADMEFile());

  commands.executeCommand('markdown.showPreview', readmeUri, ViewColumn.One);
  setItem('vscode_CtReadme', true);
}

export function openFileInEditor(file: string) {
  workspace.openTextDocument(file).then(
    (doc) => {
      // Show open document and set focus
      window.showTextDocument(doc, 1, false).then(undefined, (error: any) => {
        if (error.message) {
          window.showErrorMessage(error.message);
        } else {
          logIt(`Error opening document: ${error}`);
        }
      });
    },
    (error: any) => {
      if (error.message && error.message.toLowerCase().includes('file not found')) {
        window.showErrorMessage(`Cannot open ${file}.  File not found.`);
      } else {
        logIt(`Cannot open ${file}: ${error}`);
      }
    }
  );
}

export function getExtensionName() {
  return 'swdc-vscode';
}

export function getLogId() {
  return 'CodeTime';
}

export function logIt(message: string) {
  const windowMsg: string = isPrimaryWindow() ? '(p)' : '';
  outputChannel.appendLine(`${formatISO(new Date())} ${getLogId()}${windowMsg}: ${message}`);
}

export async function showOfflinePrompt(addReconnectMsg = false) {
  // shows a prompt that we're not able to communicate with the app server
  let infoMsg = 'Our service is temporarily unavailable. ';
  if (addReconnectMsg) {
    infoMsg += 'We will try to reconnect again in a minute. Your status bar will not update at this time.';
  } else {
    infoMsg += 'Please try again later.';
  }
  // set the last update time so we don't try to ask too frequently
  window.showInformationMessage(infoMsg, ...['OK']);
}

export function getOffsetSeconds() {
  let d = new Date();
  return d.getTimezoneOffset() * 60;
}

export function isNewDay() {
  const {day} = getNowTimes();
  const currentDay = getItem('currentDay');
  const dayChanged = !!(currentDay !== day);
  if (dayChanged) {
    setItem('currentDay', day);
    // refetch the current day stats
    setTimeout(() => {
      SummaryManager.getInstance().updateSessionSummaryFromServer();
    }, 1000);
  }
  return dayChanged;
}

export function coalesceNumber(val: any, defaultVal = 0) {
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

export async function launchWebDashboard() {
  if (!checkRegistration()) {
    return;
  }

  // add the token=jwt
  const jwt = getItem('jwt');
  const encodedJwt = encodeURIComponent(jwt);
  const webUrl = `${app_url}?token=${encodedJwt}`;

  launchWebUrl(webUrl);
}

export function launchWebUrl(url: string) {
  open(url);
}

function checkRegistration() {
  if (!getItem('name')) {
    window
      .showInformationMessage(
        'Sign up or log in to see more data visualizations.',
        {
          modal: true,
        },
        SIGN_UP_LABEL
      )
      .then(async (selection) => {
        if (selection === SIGN_UP_LABEL) {
          commands.executeCommand('codetime.registerAccount');
        }
      });
    return false;
  }
  return true;
}

/**
 * humanize the minutes
 */
export function humanizeMinutes(min: any) {
  min = parseInt(min, 0) || 0;
  let str = '';
  if (min === 60) {
    str = '1h';
  } else if (min > 60) {
    const hours = Math.floor(min / 60);
    const minutes = min % 60;

    const hoursStr = Math.floor(hours).toFixed(0) + 'h';
    if ((parseFloat(min) / 60) % 1 === 0) {
      str = hoursStr;
    } else {
      str = `${hoursStr} ${minutes}m`;
    }
  } else if (min === 1) {
    str = '1m';
  } else {
    // less than 60 seconds
    str = min.toFixed(0) + 'm';
  }
  return str;
}

export function showInformationMessage(message: string) {
  return window.showInformationMessage(`${message}`);
}

export function showWarningMessage(message: string) {
  return window.showWarningMessage(`${message}`);
}

export function noSpacesProjectDir(projectDir: string): string {
  return projectDir.replace(/^\s+/g, '');
}

export function checkRegistrationForReport(showSignup = true) {
  if (!getItem('name')) {
    if (showSignup) {
      showModalSignupPrompt(
        'Unlock your personalized dashboard and visualize your coding activity. Create an account to get started.'
      );
    }
    return false;
  }
  return true;
}

export function getImage(name: string) {
  const resourcePath: string = path.join(__dirname, 'images');
  const file = path.join(resourcePath, name);
  return file;
}

export function isPrimaryWindow() {
  let workspaceWindow = getItem('vscode_ct_primary_window');
  if (!workspaceWindow) {
    // its not set yet, update it to this window
    workspaceWindow = getWorkspaceName();
    setItem('vscode_ct_primary_window', workspaceWindow);
  }
  return !!(workspaceWindow === getWorkspaceName());
}
