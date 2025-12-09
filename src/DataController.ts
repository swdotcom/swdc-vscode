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
import { AuthProvider } from './auth/AuthProvider';

let currentUser: any | null = null;
let authProvider: AuthProvider | null = null;

export function initializeAuthProvider(provider: AuthProvider) {
  authProvider = provider;
}

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
    return currentUser.preferences_parsed;
  }
  return {}
}

export async function getUser(token_override: any = '') {
  const resp = await appGet('/api/v1/user', {}, token_override);
  if (isResponseOk(resp) && resp.data) {
    currentUser = resp.data;
    return currentUser;
  }
  return null;
}

export async function authenticationCompleteHandler(user: any, override_jwt: any = '') {
  setAuthCallbackState(null);
  if (user?.registered === 1) {
    currentUser = user;
    // new user
    if (override_jwt) {
      setItem('jwt', override_jwt);
    } else if (user.plugin_jwt) {
      setItem('jwt', user.plugin_jwt);
    }
    setItem('name', user.email);
    setItem('updatedAt', new Date().getTime());

    setItem('logging_in', false);
    // ensure the session is updated
    if (authProvider) {
      authProvider.updateSession(getItem('jwt'), user);
    }
    setItem('lastTimeInvalidSessionNotified', 0);
    // update the login status
    showInformationMessage('Successfully logged on to Code Time');

    await reload();
  }
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
