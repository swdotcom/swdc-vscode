import { enableFlow } from "../managers/FlowManager";
import { window } from "vscode";

export async function handleFlowScoreMessage(message: any) {
  console.debug("[CodeTime] Received flow score message", message);

  const { notificationText } = message;

  if (notificationText) {
    const selection = await window.showInformationMessage(
      notificationText,
      ...["Yes"]
    );

    if (selection === "Yes") {
      enableFlow();
    }
  }
}