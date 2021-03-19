import { commands, ProgressLocation, window } from "vscode";
import { getSlackAuth } from "../managers/SlackManager";
import { setAuthCallbackState } from "../Util";

export async function handleIntegrationConnectionSocketEvent(body: any) {
  // integration_type_id = 14 (slack)
  // action = add, update, remove
  const { integration_type_id, integration_type, action } = body;
  console.debug("[CodeTime] Received team member event", integration_type_id, integration_type, action);

  if (integration_type_id === 14) {
    await getSlackAuth();

    if (action === "add") {
      // refresh the slack integrations
      // clear the auth callback state
      setAuthCallbackState(null);
      showSuccessMessage("Successfully connected to Slack");
    }

    commands.executeCommand("codetime.refreshCodeTimeView");
  }
}

function showSuccessMessage(message: string) {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: message,
      cancellable: false,
    },
    (progress) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve(true);
        }, 1000);
      });
    }
  );
}
