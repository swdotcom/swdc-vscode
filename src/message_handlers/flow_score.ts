import { enableFlow, isAutoFlowModeEnabled, isFlowModeEnabled } from "../managers/FlowManager";
import { logIt } from '../Util';

export async function handleFlowScoreMessage(message: any) {

  if (isAutoFlowModeEnabled() && !isFlowModeEnabled()) {
    try {
      enableFlow({ automated: true });
    } catch (e: any) {
      logIt("Error handling flow score message: " + e.message);
    }
  }
}
