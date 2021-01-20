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
    async () => {
      initiateFlow();
    }
  );
}

async function initiateFlow() {
  if (!checkRegistration(true) || !checkSlackConnection(true)) {
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
    status_emoji: "",
    status_expiration: 0,
  };

  await setSlackStatus(status);

  // pause slack notifications
  if (configSettings.pauseSlackNotifications) {
    await pauseSlackNotifications(false);
  }

  // set to zen mode
  if (configSettings.screenMode.includes("Full Screen")) {
    showFullScreenMode();
  } else if (configSettings.screenMode.includes("Zen")) {
    showZenMode();
  } else {
    showNormalScreenMode();
  }

  commands.executeCommand("codetime.refreshFlowTree");
  enabledFlow = true;
}

export async function pauseFlow() {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Turning off code flow...",
      cancellable: false,
    },
    async () => {
      pauseFlowInitiate();
    }
  );
}

async function pauseFlowInitiate() {
  if (!checkRegistration(true) || !checkSlackConnection(true)) {
    return;
  }

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
    await enableSlackNotifications(false);
  }

  showNormalScreenMode();

  commands.executeCommand("codetime.refreshFlowTree");
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

  return screenInFlowState && pauseSlackNotificationsInFlowState && slackAwayStatusMsgInFlowState && slackAwayPresenceInFlowState;
}
