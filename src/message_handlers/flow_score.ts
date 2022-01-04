import { enableFlow } from "../managers/FlowManager";
import { getItem, logIt } from '../Util';

export async function handleFlowScoreMessage(message: any) {

  try {
    if (!getItem("name")) {
      enableFlow({ automated: true });
    }
  } catch (e: any) {
    logIt("Error handling flow score message: " + e.message);
  }
}
