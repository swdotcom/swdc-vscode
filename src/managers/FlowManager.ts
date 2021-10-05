import {commands, ProgressLocation, window} from 'vscode';
import {softwarePost, softwareDelete} from '../http/HttpClient';
import {getItem} from '../Util';
import {softwareGet} from '../http/HttpClient';

import {checkRegistration, showModalSignupPrompt, checkSlackConnectionForFlowMode} from './SlackManager';
import {
  FULL_SCREEN_MODE_ID,
  getConfiguredScreenMode,
  showFullScreenMode,
  showNormalScreenMode,
  showZenMode,
  ZEN_MODE_ID,
} from './ScreenManager';
import {updateFlowModeStatusBar} from './StatusBarManager';
import { getLocalStorageValue, setLocalStorageValue } from '../extension';

let enabledFlow = false;

export async function initializeFlowModeState() {
  await determineFlowModeFromApi();
  setLocalStorageValue('enabledFlow', enabledFlow);
}

export async function isFlowModeEnabled() {
  const enabledFlowFlag = getLocalStorageValue('enabledFlow');
  if (enabledFlowFlag === undefined || enabledFlowFlag === null) {
    return await determineFlowModeFromApi();
  }
  return enabledFlowFlag;
}

export async function updateFlowModeStatus() {
  await initializeFlowModeState();
  updateFlowStatus();
}

export async function enableFlow({automated = false, skipSlackCheck = false, process_flow_session = true}) {
  if (enabledFlow) {
    // already enabled locally, but update the status bar just in case
    updateFlowStatus();
    return;
  }

  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: 'Enabling flow...',
      cancellable: false,
    },

    (progress) => {
      return new Promise((resolve, reject) => {
        initiateFlow({automated, skipSlackCheck, process_flow_session}).catch((e) => {
          console.error('[CodeTime] Unable to initiate flow. ', e.message);
        });
        resolve(true);
      });
    }
  );
}

async function initiateFlow({automated = false, skipSlackCheck = false, process_flow_session = true}) {
  const isRegistered = checkRegistration(false);
  if (!isRegistered) {
    // show the flow mode prompt
    showModalSignupPrompt('To use Flow Mode, please first sign up or login.');
    return;
  }

  // { connected, usingAllSettingsForFlow }
  if (!skipSlackCheck) {
    const connectInfo = await checkSlackConnectionForFlowMode();
    if (!connectInfo.continue) {
      return;
    }
  }

  const preferredScreenMode = getConfiguredScreenMode();

  // create a FlowSession on backend.  Also handles 3rd party automations (slack, cal, etc)
  if (process_flow_session) {
    softwarePost('/v1/flow_sessions', {automated}, getItem('jwt'));
  }

  // update screen mode
  if (preferredScreenMode === FULL_SCREEN_MODE_ID) {
    showFullScreenMode();
  } else if (preferredScreenMode === ZEN_MODE_ID) {
    showZenMode();
  } else {
    showNormalScreenMode();
  }

  enabledFlow = true;
  setLocalStorageValue('enabledFlow', enabledFlow);
  updateFlowStatus();
}

export async function pauseFlow() {
  if (enabledFlow) {
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: 'Turning off flow...',
        cancellable: false,
      },
      (progress) => {
        return new Promise((resolve, reject) => {
          pauseFlowInitiate().catch((e) => {});
          resolve(true);
        });
      }
    );
  }
}

async function pauseFlowInitiate() {
  await softwareDelete('/v1/flow_sessions', getItem('jwt'));
  showNormalScreenMode();

  enabledFlow = false;
  setLocalStorageValue('enabledFlow', enabledFlow);

  updateFlowStatus();
}

function updateFlowStatus() {
  commands.executeCommand('codetime.refreshCodeTimeView');

  updateFlowModeStatusBar();
}

export async function determineFlowModeFromApi() {
  const flowSessionsReponse = getItem('jwt')
    ? await softwareGet('/v1/flow_sessions', getItem('jwt'))
    : {data: {flow_sessions: []}};
  const openFlowSessions = flowSessionsReponse?.data?.flow_sessions;
  // make sure "enabledFlow" is set as it's used as a getter outside this export
  enabledFlow = openFlowSessions?.length > 0;

  setLocalStorageValue('enabledFlow', enabledFlow);

  return enabledFlow;
}
