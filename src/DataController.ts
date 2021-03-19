import { window, commands } from "vscode";
import { softwareGet, isResponseOk, softwarePost } from "./http/HttpClient";
import {
  getItem,
  setItem,
  getProjectCodeSummaryFile,
  getDailyReportSummaryFile,
  getAuthCallbackState,
  setAuthCallbackState,
  syncIntegrations,
  getIntegrations,
} from "./Util";
import { DEFAULT_SESSION_THRESHOLD_SECONDS } from "./Constants";
import { clearSessionSummaryData } from "./storage/SessionSummaryData";
import { clearTimeDataSummary } from "./storage/TimeSummaryData";
import { initializeWebsockets } from "./websockets";
import { SummaryManager } from "./managers/SummaryManager";
import { userEventEmitter } from "./events/userEventEmitter";
import { getTeams } from "./managers/TeamManager";
const { WebClient } = require("@slack/web-api");
const fileIt = require("file-it");

export async function getUserRegistrationState(isIntegration = false) {
  const jwt = getItem("jwt");
  const name = getItem("name");
  const auth_callback_state = getAuthCallbackState(false /*autoCreate*/);

  const token = auth_callback_state ? auth_callback_state : jwt;

  let resp = await softwareGet("/users/plugin/state", token);
  let user = isResponseOk(resp) && resp.data ? resp.data.user : null;

  const integrationOrNoUser = isIntegration || !name ? true : false;

  // try with the jwt if no user is found
  if (!user && integrationOrNoUser && auth_callback_state) {
    resp = await softwareGet("/users/plugin/state", jwt);
    user = resp.data ? resp.data.user : null;
  }

  if (user) {
    const registered = user.registered;

    const currentAuthType = getItem("authType");
    if (!currentAuthType) {
      setItem("authType", "software");
    }

    setItem("switching_account", false);
    setAuthCallbackState(null);

    // if we need the user it's "resp.data.user"
    return { loggedOn: registered === 1, state: "OK", user };
  }

  // all else fails, set false and UNKNOWN
  return { loggedOn: false, state: "UNKNOWN", user: null };
}

export async function fetchSlackIntegrations(user) {
  let foundNewIntegration = false;
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
      const foundInCurrentIntegrations = currentIntegrations.find((n) => n.authId === integration.authId);
      if (isSlackIntegration && !foundInCurrentIntegrations) {
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
          // add it
          currentIntegrations.push(integration);

          foundNewIntegration = true;
        }
      }
    }

    syncIntegrations(currentIntegrations);
  }
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

        await fetchSlackIntegrations(user);
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
  // clear the auth callback state
  setItem("switching_account", false);
  setItem("vscode_CtskipSlackConnect", false);
  setAuthCallbackState(null);

  setItem("jwt", user.plugin_jwt);

  if (user.registered === 1) {
    setItem("name", user.email);
  }

  const currentAuthType = getItem("authType");
  if (!currentAuthType) {
    setItem("authType", "software");
  }

  setItem("switching_account", false);
  setAuthCallbackState(null);

  clearSessionSummaryData();
  clearTimeDataSummary();

  // fetch after logging on
  SummaryManager.getInstance().updateSessionSummaryFromServer();

  // clear out the previous ones locally
  removeAllSlackIntegrations();
  // update this users integrations
  await fetchSlackIntegrations(user);

  const message = "Successfully logged on to Code Time";
  window.showInformationMessage(message);

  try {
    initializeWebsockets();
  } catch (e) {
    console.error("Failed to initialize codetime websockets", e);
  }

  // fetch any teams for this user
  await getTeams();

  commands.executeCommand("codetime.refreshCodeTimeView");

  initializePreferences();
}

export function removeAllSlackIntegrations() {
  const currentIntegrations = getIntegrations();

  const newIntegrations = currentIntegrations.filter((n) => n.name.toLowerCase() !== "slack");
  syncIntegrations(newIntegrations);
}

export async function writeDailyReportDashboard(type = "yesterday", projectIds = []) {
  let dashboardContent = "";

  const file = getDailyReportSummaryFile();
  fileIt.writeContentFileSync(file, dashboardContent);
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

  const file = getProjectCodeSummaryFile();
  fileIt.writeContentFileSync(file, dashboardContent);
}
