import { initiateFlow, pauseFlowInitiate } from "../managers/FlowManager";

export async function handleFlowStateMessage(body: any) {
  // body contains {enable_flow: true | false}
  const { enable_flow } = body;

  if (!enable_flow) {
	  initiateFlow({ automated: true, skipSlackCheck: true});
  } else {
	  // disable it
	  pauseFlowInitiate();
  }
}
