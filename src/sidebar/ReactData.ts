import { getCurrentColorKind } from "../extension";
import { isFlowModEnabled, isInFlowMode } from "../managers/FlowManager";
import { getSlackWorkspaces, hasSlackWorkspaces } from "../managers/SlackManager";
import { getItem, isStatusBarTextVisible } from "../Util";

export function getReactData() {
  return {
    registered: !!getItem("name"),
    slackConnected: !!hasSlackWorkspaces(),
    inFlowMode: isFlowModEnabled(),
    statusBarTextVisible: isStatusBarTextVisible(),
    slackWorkspaces: getSlackWorkspaces(),
    currentColorKind: getCurrentColorKind(),
  };
}
