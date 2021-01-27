import { enableFlow } from "../managers/FlowManager";
import { window } from "vscode";
import { getConfigSettings } from "../managers/ConfigManager";
import ConfigSettings from "../model/ConfigSettings"
import { getSlackDnDInfo, getSlackPresence, getSlackStatus } from "../managers/SlackManager";

export async function handleFlowScoreMessage(message: any) {
  console.debug("[CodeTime] Received flow score message", message);
  const configSettings: ConfigSettings = getConfigSettings()

  const [slackStatus, slackPresence, slackDnDInfo] = await Promise.all([getSlackStatus(), getSlackPresence(), getSlackDnDInfo()]);


  if (configSettings.flowModeReminders && ) {
    try {

      const { notificationText, cta } = message.body;

      if (notificationText) {
        const selection = await window.showInformationMessage(notificationText, cta);

        if (selection === cta) {
          enableFlow();
        }
      }
    } catch (e) {
      console.error("[CodeTime] error handling flow score message", e);
    }
  }
}