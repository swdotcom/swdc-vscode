import { commands, ProgressLocation, window } from "vscode";
import { getPreference } from "../DataController";
import { softwarePost, softwareDelete } from "../http/HttpClient";
import { getItem } from "../Util";
import { softwareGet } from "../http/HttpClient";

import {
  checkRegistration,
  showModalSignupPrompt,
  checkSlackConnectionForFlowMode,
} from "./SlackManager";
import {
  FULL_SCREEN_MODE_ID,
  getScreenMode,
  NORMAL_SCREEN_MODE,
  showFullScreenMode,
  showNormalScreenMode,
  showZenMode,
  ZEN_MODE_ID,
} from "./ScreenManager";

export let enablingFlow = false;
export let enabledFlow = false;
let useSlackSettings = true;

/**
 * Screen Mode: full screen
 * Pause Notifications: on
 * Slack Away Msg: It's CodeTime!
 */
export function getConfigSettingsTooltip() {
  const preferences = [];
  const flowModeSettings = getPreference("flowMode");
  // move this to the backend
  preferences.push(`**Screen Mode**: *${flowModeSettings?.editor?.vscode?.screenMode?.toLowerCase()}*`);

  const notificationState = flowModeSettings?.slack?.pauseSlackNotifications ? "on" : "off";
  preferences.push(`**Pause Notifications**: *${notificationState}*`);

  const slackStatusText = flowModeSettings?.slack?.slackStatusText ?? "";
  preferences.push(`**Slack Away Msg**: *${slackStatusText}*`);

  const flowModeReminders = configSettings.flowModeReminders ? "on" : "off";
  preferences.push(`**Flow Mode reminders**: *${flowModeReminders}*`);

  // 2 spaces followed by a newline will create newlines in markdown
  return preferences.length ? preferences.join("  \n") : "";
}

export async function checkToDisableFlow() {
  if (!enabledFlow || enablingFlow) {
    return;
  } else if (!useSlackSettings && !isScreenStateInFlow()) {
    // slack isn't connected but the screen state changed out of flow
    pauseFlow();
    return;
  }

<<<<<<< HEAD
  // slack is connected, check
  const [slackStatus, slackPresence, slackDnDInfo] = await Promise.all([getSlackStatus(), getSlackPresence(), getSlackDnDInfo()]);
  if (enabledFlow && !isInFlowMode(slackStatus, slackPresence, slackDnDInfo)) {
=======
  if (enabledFlow && !(await isInFlowMode())) {
>>>>>>> removing functions that were moved to the backend
    // disable it
    pauseFlow();
  }
}

export async function enableFlow() {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Enabling flow...",
      cancellable: false,
    },

    (progress) => {
      return new Promise((resolve, reject) => {
        initiateFlow().catch((e) => { });
        resolve(true);
      });
    }
  );
}

async function initiateFlow() {
  const isRegistered = checkRegistration(false);
  if (!isRegistered) {
    // show the flow mode prompt
    showModalSignupPrompt("To use Flow Mode, please first sign up or login.");
    return;
  }

  // { connected, usingAllSettingsForFlow }
  const connectInfo = await checkSlackConnectionForFlowMode();
  useSlackSettings = connectInfo.useSlackSettings;
  if (!connectInfo.continue) {
    return;
  }

<<<<<<< HEAD
  enablingFlow = true;

  const configSettings: ConfigSettings = getConfigSettings();

  // create a FlowSession on backend
  softwarePost(
    "/v1/flow_sessions",
    {
      automated: false,
      automations: configSettings,
      duration_minutes: configSettings.durationMinutes
    },
    getItem("jwt")
  );

  // set slack status to away
  if (configSettings.setSlackToAway) {
    updateSlackPresence("away");
  }
=======
  const flowModeSettings = getPreference("flowMode");
>>>>>>> updating configs and slack handlers to use backend

  // create a FlowSession on backend.  Also handles 3rd party automations (slack, cal, etc)
  softwarePost("/v1/flow_sessions", { automated: false }, getItem("jwt"));

  // update screen mode
  let screenChanged = false;
  const screenMode = flowModeSettings?.editor?.vscode?.screenMode;
  if (screenMode?.includes("Full Screen")) {
    screenChanged = showFullScreenMode();
  } else if (screenMode.includes("Zen")) {
    screenChanged = showZenMode();
  } else {
    screenChanged = showNormalScreenMode();
  }

  if (!screenChanged) {
    commands.executeCommand("codetime.refreshFlowTree");
  } else {
    commands.executeCommand("codetime.scheduleFlowRefresh");
  }
  enabledFlow = true;
  enablingFlow = false;
}

export async function pauseFlow() {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Turning off flow...",
      cancellable: false,
    },
    (progress) => {
      return new Promise((resolve, reject) => {
        pauseFlowInitiate().catch((e) => { });
        resolve(true);
      });
    }
  );
}

async function pauseFlowInitiate() {
  softwareDelete("/v1/flow_sessions", getItem("jwt"));
  const screenChanged = showNormalScreenMode();

  if (!screenChanged) {
    commands.executeCommand("codetime.refreshFlowTree");
  } else {
    commands.executeCommand("codetime.scheduleFlowRefresh");
  }
  enabledFlow = false;
}


<<<<<<< HEAD
export function isInFlowMode(slackStatus, slackPresence, slackDnDInfo) {
<<<<<<< HEAD
  if (enablingFlow) {
    return true;
  } else if (!enabledFlow) {
    return false;
  }
  const configSettings: ConfigSettings = getConfigSettings();

  // determine if this editor should be in flow mode
  let screenInFlowState = isScreenStateInFlow();

  // determine if the pause slack notification is in flow
  let pauseSlackNotificationsInFlowState = false;
  if (!useSlackSettings) {
    pauseSlackNotificationsInFlowState = true;
  } else if (configSettings.pauseSlackNotifications && slackDnDInfo?.snooze_enabled) {
    pauseSlackNotificationsInFlowState = true;
  } else if (!configSettings.pauseSlackNotifications && !slackDnDInfo?.snooze_enabled) {
    pauseSlackNotificationsInFlowState = true;
  }

  // determine if the slack away status text is in flow
<<<<<<< HEAD
  let slackAwayStatusMsgInFlowState = false;
  if (!useSlackSettings) {
    slackAwayStatusMsgInFlowState = true;
  } else if (configSettings.slackAwayStatusText === slackStatus) {
    slackAwayStatusMsgInFlowState = true;
  }

  let slackAwayPresenceInFlowState = false;
  if (!useSlackSettings) {
    slackAwayPresenceInFlowState = true;
  } else if (configSettings.slackAwayStatus && slackPresence === "away") {
=======
  let slackStatusTextInFlowState = false;
  if (configSettings.slackStatusText === slackStatus) {
    slackStatusTextInFlowState = true;
  }

  let slackAwayPresenceInFlowState = false;
  if (configSettings.setSlackToAway && slackPresence === "away") {
>>>>>>> moving config page to be server side and updating names of variables
    slackAwayPresenceInFlowState = true;
  } else if (!configSettings.setSlackToAway && slackPresence === "active") {
    slackAwayPresenceInFlowState = true;
  }

  // otherwise check the exact settings
  return screenInFlowState && pauseSlackNotificationsInFlowState && slackStatusTextInFlowState && slackAwayPresenceInFlowState;
=======
=======
export async function isInFlowMode() {
  const flowSessionsReponse = await softwareGet("/v1/flow_sessions", getItem("jwt"));
  const openFlowSessions = flowSessionsReponse?.data?.flow_sessions;

>>>>>>> removing functions that were moved to the backend
  const flowModeSettings = getPreference("flowMode");
  const currentScreenMode = getScreenMode();
  const flowScreenMode = flowModeSettings?.editor?.vscode?.screenMode;
  // determine if this editor should be in flow mode
  let screenInFlowState = false;
  if (flowScreenMode.includes("Full Screen") && currentScreenMode === FULL_SCREEN_MODE_ID) {
    screenInFlowState = true;
  } else if (flowScreenMode.includes("Zen") && currentScreenMode === ZEN_MODE_ID) {
    screenInFlowState = true;
  } else if (flowScreenMode.includes("None") && currentScreenMode === NORMAL_SCREEN_MODE) {
    screenInFlowState = true;
  }

<<<<<<< HEAD
  return screenInFlowState;
>>>>>>> updating configs and slack handlers to use backend
}

function isScreenStateInFlow() {
  const configSettings: ConfigSettings = getConfigSettings();
  const screen_mode = getScreenMode();
  // determine if this editor should be in flow mode
  let screenInFlowState = false;
  if (configSettings.screenMode.includes("Full Screen") && screen_mode === FULL_SCREEN_MODE_ID) {
    screenInFlowState = true;
  } else if (configSettings.screenMode.includes("Zen") && screen_mode === ZEN_MODE_ID) {
    screenInFlowState = true;
  } else if (configSettings.screenMode.includes("None") && screen_mode === NORMAL_SCREEN_MODE) {
    screenInFlowState = true;
  }

  return screenInFlowState;
=======
  return screenInFlowState ?? openFlowSessions?.length > 0;
>>>>>>> removing functions that were moved to the backend
}
