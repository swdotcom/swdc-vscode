import { commands, window, workspace, WorkspaceConfiguration } from "vscode";
import ConfigSettings from "../model/ConfigSettings";
import { getConfigSettings } from "./ConfigManager";
import {
  checkRegistration,
  checkSlackConnection,
  pauseSlackNotifications,
  setSlackStatus,
  updateSlackPresence,
  enableSlackNotifications,
} from "./SlackManager";
import { showFullScreenMode, showNormalScreenMode, showZenMode } from "./ScreenManager";
import { showQuickPick } from "../menu/MenuManager";

let flowEnabled = false;

/**
 * Screen Mode: full screen
Pause Notifications: on
Slack Away Msg: It's CodeTime!
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

export async function enableFlow() {
  const registered = checkRegistration(true);
  if (!registered) {
    return;
  }
  const connected = checkSlackConnection(true);
  if (!connected) {
    return;
  }

  window.showInformationMessage("Enabling code flow");

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
    await pauseSlackNotifications();
  }

  // set to zen mode
  if (configSettings.screenMode.includes("Full Screen")) {
    showFullScreenMode();
  } else if (configSettings.screenMode.includes("Zen")) {
    showZenMode();
  }

  flowEnabled = true;

  commands.executeCommand("codetime.refreshFlowTree");
}

export async function pauseFlow() {
  const registered = checkRegistration(true);
  if (!registered) {
    return;
  }
  const connected = checkSlackConnection(true);
  if (!connected) {
    return;
  }

  window.showInformationMessage("Turning off code flow");

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
    await enableSlackNotifications();
  }

  showNormalScreenMode();

  flowEnabled = false;

  commands.executeCommand("codetime.refreshFlowTree");
}

export function isInFlowMode() {
  return flowEnabled;
}
