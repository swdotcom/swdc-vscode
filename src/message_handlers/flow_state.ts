import { initiateFlow, pauseFlowInitiate } from "../managers/FlowManager";

export async function handleFlowStateMessage(body: any) {
  // body contains {enable_flow: true | false}
  const { enable_flow } = body;

  if (enable_flow) {
	  // enable flow (but don't resend the flow_session POST)
	  initiateFlow({ automated: true, skipSlackCheck: true, process_flow_session: false });
  } else {
	  // disable it
	  pauseFlowInitiate();
  }
}
