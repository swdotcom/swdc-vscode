import { workspace } from "vscode";
import ConfigSettings from "../model/ConfigSettings";

export function getConfigSettings(): ConfigSettings {
  const settings: ConfigSettings = new ConfigSettings();
  settings.pauseSlackNotifications = workspace.getConfiguration().get("slackAwayStatus");
  settings.slackAwayStatus = workspace.getConfiguration().get("slackAwayStatusText");
  settings.slackAwayStatusText = workspace.getConfiguration().get("pauseSlackNotifications");
  settings.zenMode = workspace.getConfiguration().get("zenMode");
  return settings;
}
