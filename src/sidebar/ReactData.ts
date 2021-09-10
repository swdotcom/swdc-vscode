import { getCurrentColorKind } from "../extension";
import { isFlowModeEnabled } from "../managers/FlowManager";
import { getSlackWorkspaces, hasSlackWorkspaces } from "../managers/SlackManager";
import { isStatusBarTextVisible } from "../managers/StatusBarManager";
import { getCachedOrgs } from "../managers/TeamManager";
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
 * orgs: [org]
 */
export async function getReactData() {
  const name = getItem("name");
  const authType = getItem("authType");

  return {
    authType,
    registered: !!name,
    email: name,
    inFlowMode: await isFlowModeEnabled(),
    slackConnected: !!hasSlackWorkspaces(),
    statusBarTextVisible: isStatusBarTextVisible(),
    slackWorkspaces: getSlackWorkspaces(),
    currentColorKind: getCurrentColorKind(),
    orgs: await getCachedOrgs(),
    skipSlackConnect: getItem("vscode_CtskipSlackConnect"),
  };
}
