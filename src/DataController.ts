import {commands} from 'vscode';
import {isResponseOk, appGet} from './http/HttpClient';
import {
  getItem,
  setItem,
  setAuthCallbackState,
  logIt,
  musicTimeExtInstalled,
  editorOpsExtInstalled,
  showInformationMessage,
} from './Util';
import {initializeWebsockets} from './websockets';
import {SummaryManager} from './managers/SummaryManager';
import { updateFlowModeStatus } from './managers/FlowManager';

let currentUser: any | null = null;

export async function getCachedSlackIntegrations() {
  currentUser = await getCachedUser();
  if (currentUser?.integration_connections?.length) {
    return currentUser?.integration_connections?.filter(
      (integration: any) => integration.status === 'ACTIVE' && (integration.integration_type_id === 14));
  }
  return [];
}

export async function getCachedUser() {
  if (!currentUser) {
    currentUser = await getUser();
  }
  return currentUser;
}

export function isRegistered() {
  return !!getItem('name');
}

export async function getUserPreferences() {
  currentUser = await getCachedUser()
  if (currentUser) {
    let prefs = currentUser.preferences;
    if (prefs && typeof prefs === 'string') {
      try {
        return JSON.parse(prefs);
      } catch (e: any) {
        logIt(`Error parsing preferences: ${e.message}`, true);
      }
    }
  }
  return {}
}

export async function getUser() {
  const resp = await appGet('/api/v1/user');
  if (isResponseOk(resp) && resp.data) {
    currentUser = resp.data;

    if (hasIntegrationConnection(8, currentUser?.integration_connections)) {
      setItem('authType', 'google');
    } else if (hasIntegrationConnection(9, currentUser?.integration_connections)) {
      setItem('authType', 'github');
    } else {
      setItem('authType', 'software');
    }
    return currentUser;
  }
  return null;
}

function hasIntegrationConnection(type_id: number, connections = []):boolean {
  return !!(connections?.find((integration: any) => integration.status === 'ACTIVE' && (integration.integration_type_id === type_id)));
}

export async function authenticationCompleteHandler(user: any) {
  let updatedUserInfo = false;
  // clear the auth callback state
  setItem('switching_account', false);
  setAuthCallbackState(null);

  if (user?.registered === 1) {
    currentUser = user;
    updatedUserInfo = true;
    // new user
    if (user.plugin_jwt) {
      setItem('jwt', user.plugin_jwt);
    }
    setItem('name', user.email);

    const currentAuthType = getItem('authType');
    if (!currentAuthType) {
      setItem('authType', 'software');
    }

    // update the login status
    showInformationMessage(`Successfully logged on to Code Time`);

    await reload()
  }

  return updatedUserInfo;
}

export async function userDeletedCompletionHandler() {
  commands.executeCommand('codetime.logout');
}

export async function reload() {
  updateFlowModeStatus();

  try {
    initializeWebsockets();
  } catch (e: any) {
    logIt(`Failed to initialize websockets: ${e.message}`);
  }

  // re-initialize user and preferences
  await getUser();

  // fetch after logging on
  SummaryManager.getInstance().updateSessionSummaryFromServer();

  if (musicTimeExtInstalled()) {
    setTimeout(() => {
      commands.executeCommand("musictime.refreshMusicTimeView")
    }, 1000);
  }

  if (editorOpsExtInstalled()) {
    setTimeout(() => {
      commands.executeCommand("editorOps.refreshEditorOpsView")
    }, 1000);
  }

  commands.executeCommand('codetime.refreshCodeTimeView');
}
