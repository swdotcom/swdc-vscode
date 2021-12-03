import {window, commands} from 'vscode';
import {isResponseOk, softwareDelete, appGet} from './http/HttpClient';
import {
  getItem,
  setItem,
  setAuthCallbackState,
  getIntegrations,
  syncSlackIntegrations,
  logIt,
  isActiveIntegration,
} from './Util';
import {DEFAULT_SESSION_THRESHOLD_SECONDS} from './Constants';
import {clearSessionSummaryData} from './storage/SessionSummaryData';
import {initializeWebsockets} from './websockets';
import {SummaryManager} from './managers/SummaryManager';
import {userEventEmitter} from './events/userEventEmitter';
import { updateFlowModeStatus } from './managers/FlowManager';

let currentUser: any | null = null;
let lastUserFetch: number = 0;

export async function reconcileSlackIntegrations(user: any) {
  let foundNewIntegration = false;
  const slackIntegrations = [];
  if (user && user.integration_connections) {
    const currentIntegrations = getIntegrations();
    // find the slack auth
    for (const integration of user.integration_connections) {
      const isSlackIntegration = isActiveIntegration('slack', integration);

      if (isSlackIntegration) {
        const currentIntegration = currentIntegrations.find((n: any) => n.auth_id === integration.auth_id);
        if (!currentIntegration) {
          slackIntegrations.push(integration);
        } else {
          // add the existing one back
          slackIntegrations.push(currentIntegration);
        }
      }
    }
  }

  syncSlackIntegrations(slackIntegrations);

  return foundNewIntegration;
}

export async function getUser() {
  const nowMillis: number = new Date().getTime();
  if (currentUser && nowMillis - lastUserFetch < 2000) {
    return currentUser;
  }

  const resp = await appGet('/api/v1/user');
  if (isResponseOk(resp)) {
    if (resp && resp.data) {
      currentUser = resp.data;
      lastUserFetch = nowMillis;
      if (currentUser.registered === 1) {
        // update jwt to what the jwt is for this spotify user
        setItem('name', currentUser.email);

        await reconcileSlackIntegrations(currentUser);
      }
      return currentUser;
    }
  }
  return null;
}

export async function initializePreferences() {
  let jwt = getItem('jwt');
  // use a default if we're unable to get the user or preferences
  let sessionThresholdInSec = DEFAULT_SESSION_THRESHOLD_SECONDS;

  // enable Git by default
  let disableGitData = false;

  let flowMode = {};

  if (jwt) {
    let user = await getUser();
    userEventEmitter.emit('user_object_updated', user);
    // obtain the session threshold in seconds "sessionThresholdInSec"
    sessionThresholdInSec = user?.preferences?.sessionThresholdInSec || DEFAULT_SESSION_THRESHOLD_SECONDS;
    disableGitData = !!user?.preferences?.disableGitData;
    flowMode = user?.preferences?.flowMode;
  }

  // update values config
  setPreference('sessionThresholdInSec', sessionThresholdInSec);
  setPreference('disableGitData', disableGitData);
  setPreference('flowMode', flowMode);
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

    // fetch after logging on
    SummaryManager.getInstance().updateSessionSummaryFromServer();

    initializePreferences();
  }

  // update this users integrations
  await reconcileSlackIntegrations(user);

  commands.executeCommand('codetime.refreshCodeTimeView');

  logIt('Successfully logged on to Code Time');

  return updatedUserInfo;
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

export async function diconnectIntegration(integration_type_id: number) {
  const integrations = await getCachedIntegrations(integration_type_id);
  let refreshView = false;
  if (integrations?.length) {
    for await (const integration of integrations) {
      const resp = await softwareDelete(`/integrations/${integration.id}`, getItem('jwt'));
      if (isResponseOk(resp)) {
        refreshView = true;
      }
    }
  }
  if (refreshView) {
    // refresh the view
    commands.executeCommand('codetime.refreshCodeTimeView');
  }
}
