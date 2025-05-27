import {workspace, extensions, window, Uri, commands, ViewColumn, WorkspaceFolder, env} from 'vscode';
import {
  CODE_TIME_EXT_ID,
  app_url,
  CODE_TIME_PLUGIN_ID,
  CODE_TIME_TYPE,
  SOFTWARE_DIRECTORY,
  MUSIC_TIME_EXT_ID,
  EDITOR_OPS_EXT_ID
} from './Constants';
import { v4 as uuidv4 } from 'uuid';

import {showModalSignupPrompt} from './managers/SlackManager';
import {execCmd} from './managers/ExecManager';
import {getBooleanJsonItem, getJsonItem, setJsonItem, storeJsonData} from './managers/FileManager';
import { formatISO } from 'date-fns';
import { initializeWebsockets, websocketAlive } from './websockets';

const open = require('open');

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
const outputChannel = window.createOutputChannel('CodeTime');

export const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let workspace_name: string | null = null;
let hostname: string | null = null;
let osUsername: string | null = null;
let editorName: string = '';
let osName: string = '';

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
  if (!editorName) {
    try {
      editorName = env.appName
    } catch (e) {
      editorName = 'vscode'
    }
  }
  return editorName;
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

export function isFlowModeEnabled() {
  // nullish coalesce the "in_flow" flag if it doesn't exist
  return getBooleanJsonItem(getFlowChangeFile(), "in_flow") ?? false;
}

export function setItem(key: string, value: any) {
  setJsonItem(getSoftwareSessionFile(), key, value);
}

export function getItem(key: string) {
  return getJsonItem(getSoftwareSessionFile(), key);
}

export function getBooleanItem(key: string) {
  return getBooleanJsonItem(getSoftwareSessionFile(), key);
}

export function isActiveIntegration(type: string, integration: any) {
  if (integration && integration.status.toLowerCase() === "active") {
    // handle integration_connection attribute
    if (integration.integration_type) {
      return !!(integration.integration_type.type.toLowerCase() === type.toLowerCase())
    }
    // still hasn't updated to use that in within the file, check the older version attribute
    return !!(integration.name.toLowerCase() === type.toLowerCase())
  }
  return false;
}

export function getPluginUuid() {
  let plugin_uuid = getJsonItem(getDeviceFile(), 'plugin_uuid');
  if (!plugin_uuid) {
    let name = `${getOsUsername()}${getHostname()}`;
    if (!name) {
      name = getOs();
    }
    const hashName = require('crypto')
      .createHash('sha1')
      .update(name)
      .digest('hex');
    plugin_uuid = `${hashName.trim()}:${uuidv4()}`;
    // set it for the 1st and only time
    setJsonItem(getDeviceFile(), 'plugin_uuid', plugin_uuid);
  }
  return plugin_uuid;
}

export function getAuthCallbackState(autoCreate = true) {
  let auth_callback_state = getJsonItem(getDeviceFile(), 'auth_callback_state', false);
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
  if (!osName) {
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
      osName = parts.join('_');
    }
  }
  return osName;
}

export function getOsUsername() {
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

function getFile(name: string, default_data: any = {}) {
  const file_path = getSoftwareDir();
  const file = isWindows() ? `${file_path}\\${name}` : `${file_path}/${name}`;
  if (!fs.existsSync(file)) {
    storeJsonData(file, default_data);
  }
  return file;
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

export function getSessionSummaryFile() {
  return getFile('sessionSummary.json');
}

export function getFlowChangeFile() {
  return getFile('flowChange.json');
}

export function getExtensionsFile() {
  return getFile('extensions.json');
}

export function getSoftwareDir() {
  const homedir = os.homedir();
  const softwareDataDir = isWindows() ? `${homedir}\\${SOFTWARE_DIRECTORY}` : (process.env.XDG_CONFIG_HOME ? `${process.env.XDG_CONFIG_HOME}/${SOFTWARE_DIRECTORY.substring(1)}` : `${homedir}/${SOFTWARE_DIRECTORY}`);

  if (!fs.existsSync(softwareDataDir)) {
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

export function getExtensionName() {
  return 'swdc-vscode';
}

export function getLogId() {
  return 'CodeTime';
}

export function logIt(message: string, isError: boolean = false) {
  const windowMsg: string = isPrimaryWindow() ? '(p)' : '';
  outputChannel.appendLine(`${formatISO(new Date())} ${getLogId()}${windowMsg}: ${message}`);
  if (isError) {
    console.error(message)
  }
}

export function getOffsetSeconds() {
  let d = new Date();
  return d.getTimezoneOffset() * 60;
}

export function getAuthQueryObject(): URLSearchParams {
  const params = new URLSearchParams();
  params.append('plugin_uuid', getPluginUuid());
  params.append('plugin_id', `${getPluginId()}`);
  params.append('plugin_version', getVersion());
  params.append('auth_callback_state', getAuthCallbackState(true));
  return params;
}

export async function launchWebDashboard() {
  // add the token=jwt
  const jwt = getItem('jwt');
  const encodedJwt = encodeURIComponent(jwt);
  const webUrl = `${app_url}?token=${encodedJwt}`;

  launchWebUrl(webUrl);
}

export function launchWebUrl(url: string) {
  if (!websocketAlive()) {
    try {
      initializeWebsockets();
    } catch (e) {
      console.error('Failed to initialize websockets', e);
    }
  }
  open(url);
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
  logIt(message);
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
  let workspaceWindow = getItem('vscode_primary_window');
  if (!workspaceWindow) {
    // its not set yet, update it to this window
    workspaceWindow = getWorkspaceName();
    setItem('vscode_primary_window', workspaceWindow);
  }
  return !!(workspaceWindow === getWorkspaceName());
}

export function musicTimeExtInstalled() {
  return !!extensions.getExtension(MUSIC_TIME_EXT_ID);
}

export function editorOpsExtInstalled() {
  return !!extensions.getExtension(EDITOR_OPS_EXT_ID)
}

export function getFileNameFromPath(filePath: string) {
  const parts = isWindows() ? filePath.split('\\') : filePath.split('/');
  return parts[parts.length - 1].split('.')[0];
}
