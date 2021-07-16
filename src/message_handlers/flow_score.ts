import { enableFlow, enabledFlow, enablingFlow } from "../managers/FlowManager";
import { getPreference } from "../DataController";
import { hasSlackWorkspaces } from "../managers/SlackManager";

export async function handleFlowScoreMessage(message: any) {
  console.debug("[CodeTime] Received flow score message", message);
  const flowModeSettings = getPreference("flowMode");

  if (flowModeSettings.editor.autoEnterFlowMode && !(enabledFlow || enablingFlow)) {
    try {
      enableFlow({ automated: true });
    } catch (e) {
      console.error("[CodeTime] handling flow score message", e);
    }
  }
}
