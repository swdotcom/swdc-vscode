import { commands, ProgressLocation, window } from "vscode";
import ConfigSettings from "../model/ConfigSettings";
import { getConfigSettings } from "./ConfigManager";
import {
  checkRegistration,
  checkSlackConnection,
  pauseSlackNotifications,
  setSlackStatus,
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

let enabledFlow = false;
let usingAllSettingsForFlow = true;

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

  const slackAwayStatusMsg = configSettings.slackAwayStatusText ?? "";
  preferences.push(`**Slack Away Msg**: *${slackAwayStatusMsg}*`);

  // 2 spaces followed by a newline will create newlines in markdown
  return preferences.length ? preferences.join("  \n") : "";
}

export async function checkToDisableFlow() {
  if (!usingAllSettingsForFlow) {
    return;
  }

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
        initiateFlow().catch((e) => {});
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
  usingAllSettingsForFlow = connectInfo.usingAllSettingsForFlow;
  if (!connectInfo.connected) {
    return;
  }

  const configSettings: ConfigSettings = getConfigSettings();

  // set slack status to away
  if (configSettings.slackAwayStatus) {
    await updateSlackPresence("away");
  }

  // set the status text to what the user set in the settings
  const status = {
    status_text: configSettings.slackAwayStatusText,
    status_emoji: ":large_purple_circle:",
    status_expiration: 0,
  };

  await setSlackStatus(status);

  // pause slack notifications
  if (configSettings.pauseSlackNotifications) {
    await pauseSlackNotifications(false /*showNotification*/, false /*refreshFlowTree*/, true /*isFlowRequest*/);
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
        pauseFlowInitiate().catch((e) => {});
        resolve(true);
      });
    }
  );
}

async function pauseFlowInitiate() {
  const configSettings: ConfigSettings = getConfigSettings();

  // set slack status to away
  await updateSlackPresence("auto");

  // clear the status
  const status = {
    status_text: "",
    status_emoji: "",
  };
  await setSlackStatus(status);

  // pause slack notifications
  if (configSettings.pauseSlackNotifications) {
    await enableSlackNotifications(false /*showNotification*/, false /*refreshFlowTree*/, true /*isFlowRequest*/);
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

  // determine if the pause slack notification is in flow
  let pauseSlackNotificationsInFlowState = false;
  if (configSettings.pauseSlackNotifications && slackDnDInfo?.snooze_enabled) {
    pauseSlackNotificationsInFlowState = true;
  } else if (!configSettings.pauseSlackNotifications && !slackDnDInfo?.snooze_enabled) {
    pauseSlackNotificationsInFlowState = true;
  }

  // determine if the slack away status text is in flow
  let slackAwayStatusMsgInFlowState = false;
  if (configSettings.slackAwayStatusText === slackStatus) {
    slackAwayStatusMsgInFlowState = true;
  }

  let slackAwayPresenceInFlowState = false;
  if (configSettings.slackAwayStatus && slackPresence === "away") {
    slackAwayPresenceInFlowState = true;
  } else if (!configSettings.slackAwayStatus && slackPresence === "active") {
    slackAwayPresenceInFlowState = true;
  }

  if (!usingAllSettingsForFlow && enabledFlow) {
    return true;
  }

  // otherwise check the exact settings
  return screenInFlowState && pauseSlackNotificationsInFlowState && slackAwayStatusMsgInFlowState && slackAwayPresenceInFlowState;
}
