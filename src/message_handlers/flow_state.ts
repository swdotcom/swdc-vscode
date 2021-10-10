import { enableFlow, isFlowModeEnabled, pauseFlow } from "../managers/FlowManager";

export async function handleFlowStateMessage(body: any) {
  // body contains {enable_flow: true | false}
  const { enable_flow } = body;

  if (enable_flow) {
	  // enable flow (but don't resend the flow_session POST)
	  enableFlow({ automated: true, skipSlackCheck: true, process_flow_session: false });
  } else {
	  // disable it
	  pauseFlow();
  }
}
