import { enableFlow, isFlowModeEnabled, pauseFlow } from "../managers/FlowManager";

export async function handleFlowStateMessage(body: any) {
  // body contains {enable_flow: true | false}
  const { enable_flow } = body;
  const flowModeEnabled = await isFlowModeEnabled();

  if (enable_flow && !flowModeEnabled) {
	  // enable flow (but don't resend the flow_session POST)
	  enableFlow({ automated: true, skipSlackCheck: true, process_flow_session: false });
  } else if (!enable_flow && flowModeEnabled) {
	  // disable it
	  pauseFlow();
  }
}
