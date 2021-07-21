import { window, commands } from "vscode";
import { softwareGet, isResponseOk, softwarePost } from "./http/HttpClient";
import {
  getItem,
  setItem,
  getProjectCodeSummaryFile,
  getDailyReportSummaryFile,
  setAuthCallbackState,
  getIntegrations,
  syncSlackIntegrations,
} from "./Util";
import { DEFAULT_SESSION_THRESHOLD_SECONDS } from "./Constants";
import { clearSessionSummaryData } from "./storage/SessionSummaryData";
import { clearTimeDataSummary } from "./storage/TimeSummaryData";
import { initializeWebsockets } from "./websockets";
import { SummaryManager } from "./managers/SummaryManager";
import { userEventEmitter } from "./events/userEventEmitter";
import { buildTeams } from "./managers/TeamManager";
import { updateFlowModeStatus } from "./managers/StatusBarManager";
import { storeContentData } from "./managers/FileManager";
const { WebClient } = require("@slack/web-api");

export async function reconcileSlackIntegrations(user) {
  let foundNewIntegration = false;
  const slackIntegrations = [];
  if (user && user.integrations) {
    const currentIntegrations = getIntegrations();
    // find the slack auth
    for (const integration of user.integrations) {
      // {access_token, name, plugin_uuid, scopes, pluginId, authId, refresh_token, scopes}
      const isSlackIntegration = !!(
        integration.name.toLowerCase() === "slack" &&
        integration.status.toLowerCase() === "active" &&
        integration.access_token
      );

      if (isSlackIntegration) {
        const currentIntegration = currentIntegrations.find((n) => n.authId === integration.authId);
        if (!currentIntegration || !currentIntegration.team_domain) {
          // get the workspace domain using the authId
          const web = new WebClient(integration.access_token);
          const usersIdentify = await web.users.identity().catch((e) => {
            console.log("Error fetching slack team info: ", e.message);
            return null;
          });
          if (usersIdentify) {
            // usersIdentity returns
            // {team: {id, name, domain, image_102, image_132, ....}...}
            // set the domain
            integration["team_domain"] = usersIdentify.team?.domain;
            integration["team_name"] = usersIdentify.team?.name;
            integration["integration_id"] = usersIdentify.user?.id;

            foundNewIntegration = true;
            slackIntegrations.push(integration);
          }
        } else {
          // add the existing one back
          slackIntegrations.push(currentIntegration);
        }
      }
    }
  }

  syncSlackIntegrations(slackIntegrations);

  return foundNewIntegration;
}

export async function getUser() {
  let api = `/users/me`;
  let resp = await softwareGet(api, getItem("jwt"));
  if (isResponseOk(resp)) {
    if (resp && resp.data && resp.data.data) {
      const user = resp.data.data;
      if (user.registered === 1) {
        // update jwt to what the jwt is for this spotify user
        setItem("name", user.email);

        await reconcileSlackIntegrations(user);
      }
      return user;
    }
  }
  return null;
}

export async function initializePreferences() {
  let jwt = getItem("jwt");
  // use a default if we're unable to get the user or preferences
  let sessionThresholdInSec = DEFAULT_SESSION_THRESHOLD_SECONDS;

  // enable Git by default
  let disableGitData = false;

  let flowMode = {};

  if (jwt) {
    let user = await getUser();
    userEventEmitter.emit("user_object_updated", user);
    // obtain the session threshold in seconds "sessionThresholdInSec"
    sessionThresholdInSec = user?.preferences?.sessionThresholdInSec || DEFAULT_SESSION_THRESHOLD_SECONDS;
    disableGitData = !!user?.preferences?.disableGitData;
    flowMode = user?.preferences?.flowMode;
  }

  // update values config
  setPreference("sessionThresholdInSec", sessionThresholdInSec);
  setPreference("disableGitData", disableGitData);
  setPreference("flowMode", flowMode);
}

export function setPreference(preference: string, value) {
  return setItem(preference, value);
}

export function getPreference(preference: string) {
  return getItem(preference);
}

export async function authenticationCompleteHandler(user) {
  let updatedUserInfo = false;
  // clear the auth callback state
  setItem("switching_account", false);
  setAuthCallbackState(null);

  if (user?.registered === 1) {
    updatedUserInfo = true;
    // new user
    if (user.plugin_jwt) {
      setItem("jwt", user.plugin_jwt);
    }
    setItem("name", user.email);

    const currentAuthType = getItem("authType");
    if (!currentAuthType) {
      setItem("authType", "software");
    }

    // update the login status
    window.showInformationMessage(`Successfully logged on to Code Time`);

    updateFlowModeStatus();

    try {
      initializeWebsockets();
    } catch (e) {
      console.error("Failed to initialize codetime websockets", e);
    }

    // fetch any teams for this user
    await buildTeams();

    clearSessionSummaryData();
    clearTimeDataSummary();
    // fetch after logging on
    SummaryManager.getInstance().updateSessionSummaryFromServer();

    initializePreferences();

    setItem("vscode_CtskipSlackConnect", false);
  }

  // update this users integrations
  await reconcileSlackIntegrations(user);

  commands.executeCommand("codetime.refreshCodeTimeView");

  return updatedUserInfo;
}

export function removeAllSlackIntegrations() {
  const currentIntegrations = getIntegrations();

  const newIntegrations = currentIntegrations.filter((n) => n.name.toLowerCase() !== "slack");
  syncSlackIntegrations(newIntegrations);
}

export async function writeDailyReportDashboard(type = "yesterday", projectIds = []) {
  let dashboardContent = "";
  storeContentData(getDailyReportSummaryFile(), dashboardContent);
}

export async function writeProjectCommitDashboardByStartEnd(start, end, project_ids) {
  const api = `/v1/user_metrics/project_summary`;
  const result = await softwarePost(api, { project_ids, start, end }, getItem("jwt"));
  await writeProjectCommitDashboard(result);
}

export async function writeProjectCommitDashboardByRangeType(type = "lastWeek", project_ids) {
  project_ids = project_ids.filter((n) => n);
  const api = `/v1/user_metrics/project_summary`;
  const result = await softwarePost(api, { project_ids, time_range: type }, getItem("jwt"));
  await writeProjectCommitDashboard(result);
}

export async function writeProjectCommitDashboard(apiResult) {
  let dashboardContent = "";
  // [{projectId, name, identifier, commits, files_changed, insertions, deletions, hours,
  //   keystrokes, characters_added, characters_deleted, lines_added, lines_removed},...]
  if (isResponseOk(apiResult)) {
    dashboardContent = apiResult.data;
  } else {
    dashboardContent += "No data available\n";
  }

  storeContentData(getProjectCodeSummaryFile(), dashboardContent);
}
