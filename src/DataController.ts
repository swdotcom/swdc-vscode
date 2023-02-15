import {window, commands} from 'vscode';
import {isResponseOk, appGet} from './http/HttpClient';
import {
  getItem,
  setItem,
  setAuthCallbackState,
  logIt,
  musicTimeExtInstalled,
  editorOpsExtInstalled,
} from './Util';
import {clearSessionSummaryData} from './storage/SessionSummaryData';
import {initializeWebsockets} from './websockets';
import {SummaryManager} from './managers/SummaryManager';
import { updateFlowModeStatus } from './managers/FlowManager';
import { createAnonymousUser } from './menu/AccountManager';
import { ExtensionManager } from './managers/ExtensionManager';

let currentUser: any | null = null;
let lastUserFetch: number = 0;

export async function getCachedSlackIntegrations() {
  if (!currentUser) {
    currentUser = await getUser();
  }
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
  if (!currentUser) {
    currentUser = await getUser();
  }

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
  const nowMillis: number = new Date().getTime();
  if (currentUser && nowMillis - lastUserFetch < 2000) {
    return currentUser;
  }

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

    lastUserFetch = nowMillis;
    return currentUser;
  }
  return null;
}

function hasIntegrationConnection(type_id: number, connections = []):boolean {
  return !!(connections?.find((integration: any) => integration.status === 'ACTIVE' && (integration.integration_type_id === type_id)));
}

export function setPreference(preference: string, value: any) {
  return setItem(preference, value);
}

export function getPreference(preference: string) {
  return getItem(preference);
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
    window.showInformationMessage(`Successfully logged on to Code Time`);

    updateFlowModeStatus();

    try {
      initializeWebsockets();
    } catch (e: any) {
      logIt(`Failed to initialize websockets: ${e.message}`);
    }

    clearSessionSummaryData();

    // re-initialize user and preferences
    await getUser();

    // fetch after logging on
    SummaryManager.getInstance().updateSessionSummaryFromServer();
  }

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

  // update the extensions if its a new user
  setTimeout(() => {
    ExtensionManager.getInstance().initialize();
  }, 1000);

  commands.executeCommand('codetime.refreshCodeTimeView');

  logIt('Successfully logged on to Code Time');

  return updatedUserInfo;
}

export async function userDeletedCompletionHandler() {
  const user = await getUser();
  if (!user?.registered) {
    // reset the user session
    createAnonymousUser();

    // update the login status
    window.showInformationMessage(`Successfully deleted your Code Time account`);

    try {
      initializeWebsockets();
    } catch (e: any) {
      logIt(`Failed to initialize websockets: ${e.message}`);
    }

    clearSessionSummaryData();

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

    logIt('Successfully deleted your Code Time account');
  }
}

export async function getCachedIntegrations(integration_type_id: number | undefined = undefined) {
  const user = await getUser();
  if (user?.integration_connections?.length) {
    if (integration_type_id) {
      return user.integration_connections.filter(
        (integration: any) => integration.status === 'ACTIVE' && integration_type_id === integration.integration_type_id
      );
    } else {
      return user.integration_connections;
    }
  }
  return [];
}
