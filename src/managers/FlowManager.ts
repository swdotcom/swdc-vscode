import { commands, ProgressLocation, window } from "vscode";
import ConfigSettings from "../model/ConfigSettings";
import { getConfigSettings } from "./ConfigManager";
import { softwarePost, softwareDelete } from "../http/HttpClient";
import { getItem } from "../Util";

import {
  checkRegistration,
  pauseSlackNotifications,
  setSlackStatus,
  setDnD,
  endDnD,
  updateSlackPresence,
  enableSlackNotifications,
  getSlackStatus,
  getSlackPresence,
  getSlackDnDInfo,
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
  const configSettings: ConfigSettings = getConfigSettings();
  preferences.push(`**Screen Mode**: *${configSettings.screenMode.toLowerCase()}*`);

  const notificationState = configSettings.pauseSlackNotifications ? "on" : "off";
  preferences.push(`**Pause Notifications**: *${notificationState}*`);

  const slackStatusText = configSettings.slackStatusText ?? "";
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

  // slack is connected, check
  const [slackStatus, slackPresence, slackDnDInfo] = await Promise.all([getSlackStatus(), getSlackPresence(), getSlackDnDInfo()]);
  if (enabledFlow && !isInFlowMode(slackStatus, slackPresence, slackDnDInfo)) {
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

  // set the status text to what the user set in the settings
  const status = {
    status_text: configSettings.slackStatusText,
    status_emoji: ":large_purple_circle:",
    status_expiration: new Date((new Date).getTime() + Number(configSettings.durationMinutes)*60*1000),
  };

  await setSlackStatus(status);

  // pause slack notifications
  if (configSettings.pauseSlackNotifications) {
    setDnD(configSettings.durationMinutes);
  }

  // set to zen mode
  let screenChanged = false;
  if (configSettings.screenMode.includes("Full Screen")) {
    screenChanged = showFullScreenMode();
  } else if (configSettings.screenMode.includes("Zen")) {
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
  const configSettings: ConfigSettings = getConfigSettings();

  softwareDelete("/v1/flow_sessions", getItem("jwt"));
  // set slack status to auto
  updateSlackPresence("away");

  // clear the status
  const status = {
    status_text: "",
    status_emoji: "",
  };
  await setSlackStatus(status);

  // pause slack notifications
  if (configSettings.pauseSlackNotifications) {
    endDnD();
  }

  const screenChanged = showNormalScreenMode();

  if (!screenChanged) {
    commands.executeCommand("codetime.refreshFlowTree");
  } else {
    commands.executeCommand("codetime.scheduleFlowRefresh");
  }
  enabledFlow = false;
}


export function isInFlowMode(slackStatus, slackPresence, slackDnDInfo) {
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
}
