import { enableFlow, enabledFlow, enablingFlow } from "../managers/FlowManager";
import { getPreference } from "../DataController";
import { window } from "vscode";

export async function handleFlowScoreMessage(message: any) {
  console.debug("[CodeTime] Received flow score message", message);
  const flowModeSettings = getPreference("flowMode");

  if (flowModeSettings.editor.flowModeReminders && !enablingFlow && !enabledFlow) {
    try {

      const { notificationText, cta } = message.body;

      if (notificationText) {
        const selection = await window.showInformationMessage(notificationText, cta);

        if (selection === cta) {
          enableFlow({automated: true});
        }
      }
    } catch (e) {
      console.error("[CodeTime] error handling flow score message", e);
    }
  }
}
