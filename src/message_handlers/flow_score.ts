import { enableFlow } from "../managers/FlowManager";
import { window } from "vscode";

export async function handleFlowScoreMessage(message: any) {
  console.debug("[CodeTime] Received flow score message", message);

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