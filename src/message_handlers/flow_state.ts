import { commands } from 'vscode';
import { enableFlow, isFlowModeEnabled, pauseFlow } from "../managers/FlowManager";
import { triggerChangeEvent } from '../storage/SessionSummaryData';

export async function handleFlowStateMessage(body: any) {
  // body contains {enable_flow: true | false}
  const { enable_flow } = body;

  if (enable_flow && !await isFlowModeEnabled()) {
	  // enable flow (but don't resend the flow_session POST)
	  enableFlow({ automated: true, skipSlackCheck: true, process_flow_session: false });
  } else if (!enable_flow && await isFlowModeEnabled()) {
	  // disable it
	  pauseFlow();
  }

  setTimeout(() => {
    commands.executeCommand('codetime.updateViewMetrics');
    triggerChangeEvent();
  }, 1500);
}
