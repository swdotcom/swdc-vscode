import { getCurrentColorKind } from "../extension";
import { getConfiguredScreenMode, isFlowModEnabled } from "../managers/FlowManager";
import { getSlackWorkspaces, hasSlackWorkspaces } from "../managers/SlackManager";
import { getTeams } from "../managers/TeamManager";
import { getItem, isStatusBarTextVisible } from "../Util";

export async function getReactData() {
  return {
    registered: !!getItem("name"),
    slackConnected: !!hasSlackWorkspaces(),
    inFlowMode: isFlowModEnabled(),
    statusBarTextVisible: isStatusBarTextVisible(),
    slackWorkspaces: getSlackWorkspaces(),
    currentColorKind: getCurrentColorKind(),
    flowModeScreenState: getConfiguredScreenMode(),
    teams: await getTeams(),
  };
}
