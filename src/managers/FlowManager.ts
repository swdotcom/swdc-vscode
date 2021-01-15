import { commands, window } from "vscode";
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

let flowEnabled = false;

export function getConfigSettingsTooltip() {
  const configSettings: ConfigSettings = getConfigSettings();

  // Screen mode, Pause Slack notifications, Slack away status
  // (Settings => screen mode: Full screen, Pause notifications: on, Slack away: on using 'CodeTime!')
  let slackAwayStatusText = "";
  if (configSettings.slackAwayStatus) {
    slackAwayStatusText += "on";
  }
  if (configSettings.slackAwayStatusText) {
    slackAwayStatusText += ` using '${configSettings.slackAwayStatusText}'`;
  }

  const pauseNotificationText = configSettings.pauseSlackNotifications ? "on" : "off";
  const screenModeText = configSettings.screenMode;

  return `Screen mode: ${screenModeText}\nPause notifications: ${pauseNotificationText}\nSlack away: ${slackAwayStatusText}`;
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
