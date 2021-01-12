import { workspace } from "vscode";
import ConfigSettings from "../model/ConfigSettings";

export function getConfigSettings(): ConfigSettings {
  const settings: ConfigSettings = new ConfigSettings();
  settings.pauseSlackNotifications = workspace.getConfiguration().get("pauseSlackNotifications");
  settings.slackAwayStatus = workspace.getConfiguration().get("slackAwayStatus");
  settings.slackAwayStatusText = workspace.getConfiguration().get("slackAwayStatusText");
  settings.zenMode = workspace.getConfiguration().get("zenMode");
  return settings;
}
