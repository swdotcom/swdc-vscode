import { enableFlow, isFlowModeEnabled } from "../managers/FlowManager";
import { getPreference } from "../DataController";
import { commands } from 'vscode';
import { triggerChangeEvent } from '../storage/SessionSummaryData';
import { logIt } from '../Util';

export async function handleFlowScoreMessage(message: any) {
  const flowModeSettings = getPreference("flowMode");

  if (flowModeSettings.editor.autoEnterFlowMode && !isFlowModeEnabled()) {
    try {
      enableFlow({ automated: true });
    } catch (e: any) {
      logIt("Error handling flow score message: " + e.message);
    }
  }
  setTimeout(() => {
    commands.executeCommand('codetime.updateViewMetrics');
    triggerChangeEvent();
  }, 1500);
}
