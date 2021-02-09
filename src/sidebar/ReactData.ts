import { getCurrentColorKind } from "../extension";
import { getConfiguredScreenMode, isFlowModEnabled, isInFlowMode } from "../managers/FlowManager";
import { getScreenMode } from "../managers/ScreenManager";
import { getSlackWorkspaces, hasSlackWorkspaces } from "../managers/SlackManager";
import { getItem, isStatusBarTextVisible } from "../Util";

export async function getReactData() {
  return {
    registered: !!getItem("name"),
    slackConnected: !!hasSlackWorkspaces(),
    inFlowMode: isFlowModEnabled(),
    statusBarTextVisible: isStatusBarTextVisible(),
    slackWorkspaces: getSlackWorkspaces(),
    currentColorKind: getCurrentColorKind(),
    flowModeScreenState: await getConfiguredScreenMode(),
  };
}
