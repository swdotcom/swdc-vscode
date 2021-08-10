import { enableFlow, isFlowModeEnabled } from "../managers/FlowManager";
import { getPreference } from "../DataController";

export async function handleFlowScoreMessage(message: any) {
  const flowModeSettings = getPreference("flowMode");
  const flowModeEnabled = await isFlowModeEnabled();

  if (flowModeSettings.editor.autoEnterFlowMode && !flowModeEnabled) {
    try {
      enableFlow({ automated: true });
    } catch (e) {
      console.error("[CodeTime] handling flow score message", e);
    }
  }
}
