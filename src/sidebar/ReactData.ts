import { getCurrentColorKind } from "../extension";
import { determineFlowModeFromApi, getConfiguredScreenMode, isFlowModEnabled } from "../managers/FlowManager";
import { getSlackWorkspaces, hasSlackWorkspaces } from "../managers/SlackManager";
import { getTeams } from "../managers/TeamManager";
import { getItem, isStatusBarTextVisible } from "../Util";

let initialized = false;

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
 * teams: [teams]
 */
export async function getReactData() {
  const name = getItem("name");
  const authType = getItem("authType");
  const jwt = getItem("jwt");

  let inFlowMode;
  if (!initialized && jwt) {
    inFlowMode = await determineFlowModeFromApi();
    initialized = true;
  } else {
    inFlowMode = await isFlowModEnabled();
  }
  return {
    authType,
    registered: !!name,
    email: name,
    inFlowMode,
    slackConnected: !!hasSlackWorkspaces(),
    statusBarTextVisible: isStatusBarTextVisible(),
    slackWorkspaces: getSlackWorkspaces(),
    currentColorKind: getCurrentColorKind(),
    teams: await getTeams(),
    skipSlackConnect: getItem("vscode_CtskipSlackConnect"),
  };
}
