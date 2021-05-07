import { getCurrentColorKind } from "../extension";
import { isFlowModEnabled } from "../managers/FlowManager";
import { getSlackWorkspaces, hasSlackWorkspaces } from "../managers/SlackManager";
import { isStatusBarTextVisible } from "../managers/StatusBarManager";
import { getCachedTeams } from "../managers/TeamManager";
import { getItem } from "../Util";

/**
 * Returns:
 * authType: string (github, google, software),
 * registered: boolean,
 * email: string,
 * slackConnected: boolean
 * inFlowMode: boolean,
 * statusBarTextVisible: boolean,
 * slackWorkspaces: [slack integrations],
 * currentColorKind: number (2=dark, anything else is non-dark),
 * teams: [team]
 */
export async function getReactData() {
  const name = getItem("name");
  const authType = getItem("authType");

  return {
    authType,
    registered: !!name,
    email: name,
    inFlowMode: await isFlowModEnabled(),
    slackConnected: !!hasSlackWorkspaces(),
    statusBarTextVisible: isStatusBarTextVisible(),
    slackWorkspaces: getSlackWorkspaces(),
    currentColorKind: getCurrentColorKind(),
    teams: await getCachedTeams(),
    skipSlackConnect: getItem("vscode_CtskipSlackConnect"),
  };
}
