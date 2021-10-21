import {commands, ProgressLocation, window} from 'vscode';
import {softwarePost, softwareDelete} from '../http/HttpClient';
import {getFlowChangeState, getItem, isPrimaryWindow, logIt, updateFlowChange} from '../Util';
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
import {getPreference} from '../DataController';

export async function initializeFlowModeState() {
  await determineFlowModeFromApi();
  updateFlowStatus();
}

export function isFlowModeEnabled() {
  return getFlowChangeState();
}

export async function updateFlowModeStatus() {
  await initializeFlowModeState();
}

export async function enableFlow({automated = false, skipSlackCheck = false, process_flow_session = true}) {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: 'Enabling flow...',
      cancellable: false,
    },
    async (progress) => {
      await initiateFlow({automated, skipSlackCheck, process_flow_session}).catch((e) => {
        console.error('[CodeTime] Unable to initiate flow. ', e.message);
      });
    }
  );
}

export async function initiateFlow({automated = false, skipSlackCheck = false, process_flow_session = true}) {
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
  if (process_flow_session && isPrimaryWindow() && !isFlowModeEnabled()) {
    // only update flow change here
    updateFlowChange(true);
    logIt('Entering Flow Mode');
    await softwarePost('/v1/flow_sessions', {automated}, getItem('jwt'));
  }

  // update screen mode
  if (preferredScreenMode === FULL_SCREEN_MODE_ID) {
    showFullScreenMode();
  } else if (preferredScreenMode === ZEN_MODE_ID) {
    showZenMode();
  } else {
    showNormalScreenMode();
  }

  updateFlowStatus();
}

export async function pauseFlow() {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: 'Turning off flow...',
      cancellable: false,
    },
    async (progress) => {
      await pauseFlowInitiate().catch((e) => {});
    }
  );
}

export async function pauseFlowInitiate() {
  if (isPrimaryWindow() && isFlowModeEnabled()) {
    // only update flow change in here
    updateFlowChange(false);
    logIt('Exiting Flow Mode');
    await softwareDelete('/v1/flow_sessions', getItem('jwt'));
  }

  showNormalScreenMode();
  updateFlowStatus();
}

function updateFlowStatus() {
  setTimeout(() => {
    commands.executeCommand('codetime.refreshCodeTimeView');
  }, 2000);

  updateFlowModeStatusBar();
}

export async function determineFlowModeFromApi() {
  const flowSessionsReponse = getItem('jwt')
    ? await softwareGet('/v1/flow_sessions', getItem('jwt'))
    : {data: {flow_sessions: []}};
  const openFlowSessions = flowSessionsReponse?.data?.flow_sessions;
  // make sure "enabledFlow" is set as it's used as a getter outside this export
  const enabledFlow: boolean = !!(openFlowSessions?.length);
  // initialize the file value
  updateFlowChange(enabledFlow);
}

export function isAutoFlowModeEnabled() {
  const flowModeSettings: any = getPreference('flowMode');
  if (flowModeSettings?.editor.autoEnterFlowMode !== undefined) {
    return flowModeSettings.editor.autoEnterFlowMode;
  }
  return false;
}
