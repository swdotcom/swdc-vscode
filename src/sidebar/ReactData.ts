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
 * flowModeScreenState: number (0=NORMAL_SCREEN_MODE, 1=ZEN_MODE_ID, 2=FULL_SCREEN_MODE_ID),
 * teams: [teams]
 */
export async function getReactData() {
  const name = getItem("name");
  const authType = getItem("authType");

  let inFlowMode;
  if (!initialized) {
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
    flowModeScreenState: getConfiguredScreenMode(),
    teams: await getTeams(),
  };
}
