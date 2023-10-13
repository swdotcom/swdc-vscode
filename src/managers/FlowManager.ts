import {commands, ProgressLocation, window} from 'vscode';
import {appPost, appDelete, appGet} from '../http/HttpClient';
import {getBooleanItem, getItem, isFlowModeEnabled, isPrimaryWindow, logIt, updateFlowChange} from '../Util';

import {showModalSignupPrompt, checkSlackConnectionForFlowMode} from './SlackManager';
import {
  FULL_SCREEN_MODE_ID,
  getConfiguredScreenMode,
  showFullScreenMode,
  showNormalScreenMode,
  showZenMode,
  ZEN_MODE_ID,
} from './ScreenManager';
import {updateFlowModeStatusBar} from './StatusBarManager';
import { isRegistered } from '../DataController';

let inFlowLocally: boolean = false;

export function isInFlowLocally() {
  return inFlowLocally;
}

export function updateInFlowLocally(inFlow: boolean) {
  inFlowLocally = inFlow;
}

export async function initializeFlowModeState() {
  await determineFlowModeFromApi();
  updateFlowStatus();
}

export async function updateFlowModeStatus() {
  await initializeFlowModeState();
}

export async function enableFlow({automated = false}) {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: 'Enabling flow...',
      cancellable: false,
    },
    async (progress) => {
      await initiateFlow({automated}).catch((e) => {
        console.error('[Code Time] Unable to initiate flow. ', e.message);
      });
    }
  );
}

export async function initiateFlow({automated = false}) {
  if (!isRegistered() && !automated) {
    // manually initiated, show the flow mode prompt
    showModalSignupPrompt('To enable Flow Mode, please sign up or log in.');
    return;
  }

  const skipSlackCheck = !!getBooleanItem('vscode_CtskipSlackConnect');

  if (!skipSlackCheck && !automated) {
    const connectInfo = await checkSlackConnectionForFlowMode();
    if (!connectInfo.continue) {
      return;
    }
  }

  const preferredScreenMode = await getConfiguredScreenMode();

  // process if...
  // 1) its the primary window
  // 2) flow mode is not current enabled via the flowChange.json state
  const primary = isPrimaryWindow();
  const flowEnabled = isFlowModeEnabled();
  if (primary && !flowEnabled) {
    logIt('Entering Flow Mode');
    await appPost('/plugin/flow_sessions', { automated: automated });
    // only update flow change here
    inFlowLocally = true;
    updateFlowChange(true);
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
  const flowEnabled = isFlowModeEnabled();
  if (flowEnabled) {
    logIt('Exiting Flow Mode');
    await appDelete('/plugin/flow_sessions');
    // only update flow change in here
    inFlowLocally = false;
    updateFlowChange(false);
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
    ? await appGet('/plugin/flow_sessions')
    : {data: {flow_sessions: []}};

  const openFlowSessions = flowSessionsReponse?.data?.flow_sessions ?? [];
  // make sure "enabledFlow" is set as it's used as a getter outside this export
  const enabledFlow: boolean = !!(openFlowSessions?.length);
  // update the local inFlow state
  inFlowLocally = enabledFlow;
  // initialize the file value
  updateFlowChange(enabledFlow);
}
