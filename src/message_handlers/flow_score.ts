import { enableFlow } from "../managers/FlowManager";
import { window } from "vscode";

export async function handleFlowScoreMessage(message: any) {
  console.debug("[CodeTime] Received flow score message", message);

  if (message.body?.notificationText) {
    const selection = await window.showInformationMessage(
      message.body.notificationText,
      "Enable Flow Mode"
    );

    if (selection === "Enable Flow Mode") {
      enableFlow();
    }
  }
}