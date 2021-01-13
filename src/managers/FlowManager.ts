import { commands, window } from "vscode";
import ConfigSettings from "../model/ConfigSettings";
import { setItem } from "../Util";
import { getConfigSettings } from "./ConfigManager";
import {
  checkRegistration,
  checkSlackConnection,
  pauseSlackNotifications,
  setSlackStatus,
  setSlackStatusPresence,
  enableSlackNotifications,
} from "./SlackManager";
import { KpmProviderManager } from "../tree/KpmProviderManager";

export async function enableFlow() {
  const registered = checkRegistration(true);
  if (!registered) {
    return;
  }
  const connected = checkSlackConnection(true);
  if (!connected) {
    return;
  }

  const configSettings: ConfigSettings = getConfigSettings();

  // set slack status to away
  if (configSettings.slackAwayStatus) {
    await setSlackStatusPresence("away");
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
    commands.executeCommand("workbench.action.toggleFullScreen");
  } else if (configSettings.screenMode.includes("Zen")) {
    commands.executeCommand("workbench.action.toggleZenMode");
  }

  KpmProviderManager.getInstance().showingFullScreen = !KpmProviderManager.getInstance().showingFullScreen;
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

  const configSettings: ConfigSettings = getConfigSettings();

  // set slack status to away
  await setSlackStatusPresence("auto");

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

  KpmProviderManager.getInstance().showingFullScreen = !KpmProviderManager.getInstance().showingFullScreen;
  commands.executeCommand("workbench.action.toggleFullScreen");
}

export function isInFlowMode(slackDnDInfo) {
  const configSettings: ConfigSettings = getConfigSettings();
  if (slackDnDInfo?.snooze_enabled && configSettings.pauseSlackNotifications) {
    return true;
  } else if (KpmProviderManager.getInstance().showingFullScreen) {
    return true;
  }
  return false;
}
