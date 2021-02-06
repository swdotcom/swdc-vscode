import { isFlowModEnabled, isInFlowMode } from "../managers/FlowManager";
import { hasSlackWorkspaces } from "../managers/SlackManager";
import { getItem } from "../Util";

export function getReactData() {
  return {
    registered: !!getItem("name"),
    slackConnected: !!hasSlackWorkspaces(),
    inFlowMode: isFlowModEnabled(),
  };
}
