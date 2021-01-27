import { enableFlow, enabledFlow, enablingFlow } from "../managers/FlowManager";
import { window } from "vscode";
import { getConfigSettings } from "../managers/ConfigManager";
import ConfigSettings from "../model/ConfigSettings"

export async function handleFlowScoreMessage(message: any) {
  console.debug("[CodeTime] Received flow score message", message);
  const configSettings: ConfigSettings = getConfigSettings()

  if (configSettings.flowModeReminders && !enablingFlow && !enabledFlow) {
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