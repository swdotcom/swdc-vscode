import { enableFlow } from "../managers/FlowManager";
import { logIt } from '../Util';

export async function handleFlowScoreMessage(message: any) {

  try {
    enableFlow({ automated: true });
  } catch (e: any) {
    logIt("Error handling flow score message: " + e.message);
  }
}
