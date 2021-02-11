import { getCurrentColorKind } from "../extension";
import { getConfiguredScreenMode, isFlowModEnabled } from "../managers/FlowManager";
import { getSlackWorkspaces, hasSlackWorkspaces } from "../managers/SlackManager";
import { getTeams } from "../managers/TeamManager";
import { getItem, isStatusBarTextVisible } from "../Util";

export async function getReactData() {
  const name = getItem("name");
  const authType = getItem("authType");
  return {
    authType,
    registered: !!name,
    email: name,
    slackConnected: !!hasSlackWorkspaces(),
    inFlowMode: isFlowModEnabled(),
    statusBarTextVisible: isStatusBarTextVisible(),
    slackWorkspaces: getSlackWorkspaces(),
    currentColorKind: getCurrentColorKind(),
    flowModeScreenState: getConfiguredScreenMode(),
    teams: await getTeams(),
  };
}
