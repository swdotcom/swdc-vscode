import { isRegistered } from '../DataController';
import { enableFlow } from "../managers/FlowManager";
import { logIt } from '../Util';

export async function handleFlowScoreMessage(message: any) {

  try {
    if (!isRegistered()) {
      enableFlow({ automated: true });
    }
  } catch (e: any) {
    logIt("Error handling flow score message: " + e.message);
  }
}
