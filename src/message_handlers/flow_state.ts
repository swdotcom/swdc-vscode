import { enableFlow, isFlowModeEnabled, pauseFlow } from "../managers/FlowManager";

export async function handleFlowStateMessage(body: any) {
  // body contains {enable_flow: true | false}
  const {enable_flow} = body;
  const flowModeEnabled = await isFlowModeEnabled();

  if (enable_flow && !flowModeEnabled) {
	  // enable flow
	  enableFlow({ automated: true });
  } else if (!enable_flow && flowModeEnabled) {
	  // disable it
	  pauseFlow();
  }
}
