import { commands, window } from "vscode";
import { api_endpoint, DISCONNECT_LABEL, SIGN_UP_LABEL } from "../Constants";
import { getUserRegistrationState } from "../DataController";
import {
  getAuthCallbackState,
  getIntegrations,
  getItem,
  getPluginId,
  getPluginType,
  getPluginUuid,
  getVersion,
  launchWebUrl,
  setAuthCallbackState,
  syncIntegrations,
} from "../Util";
import { showQuickPick } from "../menu/MenuManager";
import { softwarePut } from "../http/HttpClient";

const queryString = require("query-string");
const { WebClient } = require("@slack/web-api");

let current_slack_status: string = "";
let current_slack_presence: string = "";

// -------------------------------------------
// - public methods
// -------------------------------------------

// get saved slack integrations
export function getSlackWorkspaces() {
  return getIntegrations().filter((n) => n.name.toLowerCase() === "slack" && n.status.toLowerCase() === "active");
}

export function hasSlackWorkspaces() {
  return !!getSlackWorkspaces().length;
}

// get the access token of a selected slack workspace
export async function getSlackAccessToken() {
  const selectedTeamDomain = await showSlackWorkspaceSelection();

  if (selectedTeamDomain) {
    return getWorkspaceAccessToken(selectedTeamDomain);
  }
  return null;
}

// connect slack flow
export async function connectSlackWorkspace() {
  const registered = await checkRegistration();
  if (!registered) {
    return;
  }

  const qryStr = queryString.stringify({
    plugin: getPluginType(),
    plugin_uuid: getPluginUuid(),
    pluginVersion: getVersion(),
    plugin_id: getPluginId(),
    auth_callback_state: getAuthCallbackState(),
    integrate: "slack",
  });

  const url = `${api_endpoint}/auth/slack?${qryStr}`;

  // authorize the user for slack
  launchWebUrl(url);
  // lazily check if the user has completed the slack authentication
  setTimeout(() => {
    refetchSlackConnectStatusLazily(40);
  }, 10000);
}

export async function disconnectSlackWorkspace() {
  const registered = await checkRegistration();
  if (!registered) {
    return;
  }
  // pick the workspace to disconnect
  const selectedTeamDomain = await showSlackWorkspaceSelection();

  if (selectedTeamDomain) {
    const slackIntegration = getSlackWorkspaces().find((n) => n.team_domain === selectedTeamDomain);
    disconnectSlackAuth(selectedTeamDomain.authId);
  }
}

// disconnect slack flow
export async function disconnectSlackAuth(authId) {
  // get the domain
  const integration = getSlackWorkspaces().find((n) => n.authId === authId);
  if (!integration) {
    window.showErrorMessage("Unable to find selected integration to disconnect");
    commands.executeCommand("codetime.refreshCodetimeMenuTree");
    return;
  }
  // ask before disconnecting
  const selection = await window.showInformationMessage(
    `Are you sure you would like to disconnect the '${integration.team_domain}' Slack workspace?`,
    ...[DISCONNECT_LABEL]
  );

  if (selection === DISCONNECT_LABEL) {
    await softwarePut(`/auth/slack/disconnect`, { authId }, getItem("jwt"));
    // disconnected, remove it from the integrations
    removeSlackIntegration(authId);

    commands.executeCommand("codetime.refreshFlowTree");

    setTimeout(() => {
      commands.executeCommand("codetime.refreshCodetimeMenuTree");
    }, 1000);
  }
}

// pause notification on all slack integrations
export async function pauseSlackNotifications() {
  const registered = await checkRegistration();
  if (!registered) {
    return;
  }

  const integrations = getSlackWorkspaces();
  let enabled = false;
  for await (const integration of integrations) {
    const web = new WebClient(integration.access_token);
    const result = await web.dnd.setSnooze({ num_minutes: 120 }).catch((err) => {
      console.log("Unable to activate do not disturb: ", err.message);
      return [];
    });
    if (result && result.ok) {
      enabled = true;
    }
  }

  if (enabled) {
    window.showInformationMessage("Slack notifications are paused for 2 hours");
  }

  commands.executeCommand("codetime.refreshFlowTree");
}

// enable notifications on all slack integrations
export async function enableSlackNotifications() {
  const registered = await checkRegistration();
  if (!registered) {
    return;
  }

  const integrations = getSlackWorkspaces();
  let enabled = false;
  for await (const integration of integrations) {
    const web = new WebClient(integration.access_token);
    const result = await web.dnd.endSnooze().catch((err) => {
      console.log("Error ending slack snooze: ", err.message);
      return [];
    });
    if (result && result.ok) {
      enabled = true;
    }
  }

  if (enabled) {
    window.showInformationMessage("Slack notifications enabled");
  }
  commands.executeCommand("codetime.refreshFlowTree");
}

export async function shareSlackMessage(message) {
  const registered = await checkRegistration();
  if (!registered) {
    return;
  }
  const { selectedChannel, access_token } = await showSlackChannelMenu();
  if (!selectedChannel) {
    return;
  }

  postMessage(selectedChannel, access_token, message);
}

/**
 * check if snooze is enabled for a slack workspace
 * @param domain
 * @returns {dnd_enabled (bool), next_dnd_end_ts (unix), next_dnd_start_ts (unix), snooze_endtime (unix), ok (bool), snooze_enabled (bool)}
 * ts is in unix seconds
 */
export async function getSlackDnDInfo() {
  const integrations = getSlackWorkspaces();
  for await (const integration of integrations) {
    const dndInfo = await getSlackDnDInfoPerDomain(integration.team_domain);
    if (dndInfo) {
      return dndInfo;
    }
  }
  return null;
}

// set the slack profile status
export async function setProfileStatus() {
  const registered = await checkRegistration();
  if (!registered) {
    return;
  }

  // palette prompt to clear or set a new status
  const decision = current_slack_status ? await showStatusUpdateOptions() : "update";
  if (!decision) {
    return;
  }

  let status = {
    status_text: "",
    status_emoji: "",
  };
  if (decision === "update") {
    const message = await showMessageInputPrompt(100);
    if (!message) {
      return;
    }
    status.status_text = message;
    status["status_expiration"] = 0;
  }

  // example:
  // { status_text: message, status_emoji: ":mountain_railway:", status_expiration: 0 }
  let profileStatusUpdated = await setSlackStatus(status);

  if (profileStatusUpdated) {
    window.showInformationMessage(`Slack profile status updated`);
    commands.executeCommand("codetime.refreshFlowTree");
  }
}

export async function setSlackStatus(status) {
  let profileStatusUpdated = false;
  const integrations = getSlackWorkspaces();
  // example:
  // { status_text: message, status_emoji: ":mountain_railway:", status_expiration: 0 }
  for await (const integration of integrations) {
    const web = new WebClient(integration.access_token);
    await web.users.profile
      .set({ profile: status })
      .then(() => {
        profileStatusUpdated = true;
      })
      .catch((e) => {
        console.error("error setting profile status: ", e.message);
      });
  }
  return profileStatusUpdated;
}

// Get the users slack status
export async function getSlackStatus() {
  const registered = await checkRegistration(false);
  if (!registered) {
    return null;
  }
  const integrations = getSlackWorkspaces();
  for await (const integration of integrations) {
    const web = new WebClient(integration.access_token);
    // {profile: {avatar_hash, display_name, display_name_normalized, email, first_name,
    //  image_1024, image_192, etc., last_name, is_custom_image, phone, real_name, real_name_normalized,
    //  status_text, status_emoji, skype, status_expireation, status_text_canonical, title } }
    const data = await web.users.profile.get().catch((e) => {
      console.error("error fetching slack profile: ", e.message);
    });
    // set the cached var and return it
    current_slack_status = data?.profile?.status_text ?? "";
    return current_slack_status;
  }
  return null;
}

/**
 * Return the users presence:
 * {auto_away (bool), connection_count (int), last_activity (unix), manual_away (bool), ok (bool), online (bool), presence: ['active'|'away']}
 */
export async function getSlackPresence() {
  const registered = await checkRegistration(false);
  if (!registered) {
    return null;
  }
  // return the 1st one
  const integrations = getSlackWorkspaces();
  for await (const integration of integrations) {
    const web = new WebClient(integration.access_token);
    const data = await web.users.getPresence().catch((e) => {
      console.error("error fetching slack presence: ", e.message);
    });
    // set the cached var and return it
    current_slack_presence = data?.presence ?? "active";
    return current_slack_presence;
  }
  return null;
}

export async function toggleSlackPresence() {
  const registered = await checkRegistration();
  if (!registered) {
    return;
  }

  // presence val can be either: auto or away
  const presenceVal = current_slack_presence === "active" ? "away" : "auto";
  let presenceUpdated = await setSlackStatusPresence(presenceVal);

  if (presenceUpdated) {
    window.showInformationMessage(`Slack presence updated`);
    commands.executeCommand("codetime.refreshFlowTree");
  }
}

export async function setSlackStatusPresence(presence) {
  let presenceUpdated = false;
  const integrations = getSlackWorkspaces();
  for await (const integration of integrations) {
    const web = new WebClient(integration.access_token);
    await web.users
      .setPresence({ presence })
      .then(() => {
        presenceUpdated = true;
      })
      .catch((e) => {
        console.error("error updating slack presence: ", e.message);
      });
  }
  return presenceUpdated;
}

// -------------------------------------------
// - private methods
// -------------------------------------------

async function showSlackWorkspaceSelection() {
  let menuOptions = {
    items: [],
    placeholder: `Select a Slack workspace`,
  };

  const integrations = getSlackWorkspaces();
  integrations.forEach((integration) => {
    menuOptions.items.push({
      label: integration.team_domain,
      value: integration.team_domain,
    });
  });

  menuOptions.items.push({
    label: "Connect a Slack workspace",
    command: "musictime.connectSlack",
  });

  const pick = await showQuickPick(menuOptions);
  if (pick && pick.label) {
    const pick = await showQuickPick(menuOptions);
    if (pick) {
      if (pick.value) {
        return pick.value;
      } else if (pick.command) {
        commands.executeCommand(pick.command);
        return null;
      }
    }
  }
  return null;
}

async function showMessageInputPrompt(maxChars = 0) {
  return await window.showInputBox({
    value: "",
    placeHolder: "Enter a message to appear in your profile status",
    validateInput: (text) => {
      if (!text) {
        return "Please enter a valid message to continue.";
      }
      if (maxChars && text.length > maxChars) {
        return "The Slack status must be 100 characters or less.";
      }
      return null;
    },
  });
}

/**
 * Show the list of channels in the command palette
 */
export async function showSlackChannelMenu() {
  let menuOptions = {
    items: [],
    placeholder: "Select a channel",
  };

  // get the available channels
  let { channels, access_token } = await getChannels();
  channels.sort(compareLabels);

  // make sure the object array has labels
  channels = channels.map((n) => {
    return { ...n, label: n.name };
  });

  menuOptions.items = channels;

  const pick = await showQuickPick(menuOptions);
  if (pick && pick.label) {
    return { selectedChannel: pick.id, access_token };
  }
  return { selectedChannel: null, access_token };
}

function getTextSnippet(text) {
  return text.length > 20 ? text.substring(0, 20) + "..." : text;
}

function getWorkspaceAccessToken(team_domain) {
  const integration = getSlackWorkspaces().find((n) => n.team_domain === team_domain);
  if (integration) {
    return integration.access_token;
  }
  return null;
}

async function getChannels() {
  const access_token = await getSlackAccessToken();
  if (!access_token) {
    return;
  }
  const web = new WebClient(access_token);
  const result = await web.conversations.list({ exclude_archived: true }).catch((err) => {
    console.log("Unable to retrieve slack channels: ", err.message);
    return [];
  });
  if (result && result.ok) {
    /**
    created:1493157509
    creator:'U54G1N6LC'
    id:'C53QCUUKS'
    is_archived:false
    is_channel:true
    is_ext_shared:false
    is_general:true
    is_group:false
    is_im:false
    is_member:true
    is_mpim:false
    is_org_shared:false
    is_pending_ext_shared:false
    is_private:false
    is_shared:false
    name:'company-announcements'
    name_normalized:'company-announcements'
    num_members:20
    */
    return { channels: result.channels, access_token };
  }
  return { channels: [], access_token: null };
}

/**
 * Recursive function to determine slack connection
 * @param tryCountUntilFoundUser
 */
async function refetchSlackConnectStatusLazily(tryCountUntilFoundUser) {
  const slackAuth = await getSlackAuth();
  if (!slackAuth) {
    // try again if the count is not zero
    if (tryCountUntilFoundUser > 0) {
      tryCountUntilFoundUser -= 1;
      setTimeout(() => {
        refetchSlackConnectStatusLazily(tryCountUntilFoundUser);
      }, 10000);
    } else {
      // clear the auth callback state
      setAuthCallbackState(null);
    }
  } else {
    // clear the auth callback state
    setAuthCallbackState(null);
    window.showInformationMessage("Successfully connected to Slack");

    commands.executeCommand("codetime.refreshFlowTree");

    setTimeout(() => {
      commands.executeCommand("codetime.refreshCodetimeMenuTree");
    }, 1000);
  }
}

/**
 * Get the slack Oauth from the registered user
 */
async function getSlackAuth() {
  let foundNewIntegration = false;
  const { user } = await getUserRegistrationState(true /*isIntegration*/);
  if (user && user.integrations) {
    const currentIntegrations = getSlackWorkspaces();
    // find the slack auth
    for (const integration of user.integrations) {
      // {access_token, name, plugin_uuid, scopes, pluginId, authId, refresh_token, scopes}
      if (integration.name.toLowerCase() === "slack" && integration.status.toLowerCase() === "active") {
        // check if it exists
        const foundIntegration = currentIntegrations.find((n) => n.authId === integration.authId);
        if (!foundIntegration) {
          // get the workspace domain using the authId
          const web = new WebClient(integration.access_token);
          const usersIdentify = await web.users.identity().catch((e) => {
            console.log("error fetching slack team info: ", e.message);
            return null;
          });
          if (usersIdentify) {
            // usersIdentity returns
            // {team: {id, name, domain, image_102, image_132, ....}...}
            // set the domain
            integration["team_domain"] = usersIdentify.team?.domain;
            integration["team_name"] = usersIdentify.team?.name;
            // add it
            currentIntegrations.push(integration);

            foundNewIntegration = true;
          }
        }
      }
    }

    syncIntegrations(currentIntegrations);
  }
  return foundNewIntegration;
}

/**
 * Post the message to the slack channel
 * @param selectedChannel
 * @param message
 */
async function postMessage(selectedChannel: any, access_token, message: string) {
  message = "```" + message + "```";
  const web = new WebClient(access_token);
  web.chat
    .postMessage({
      text: message,
      channel: selectedChannel,
      as_user: true,
    })
    .catch((err) => {
      if (err.message) {
        console.log("error posting slack message: ", err.message);
      }
    });
}

/**
 * Remove an integration from the local copy
 * @param authId
 */
function removeSlackIntegration(authId) {
  const currentIntegrations = getSlackWorkspaces();

  const newIntegrations = currentIntegrations.filter((n) => n.authId !== authId);
  syncIntegrations(newIntegrations);
}

export async function checkRegistration(showSignup = true) {
  if (!getItem("name")) {
    if (showSignup) {
      window
        .showInformationMessage(
          "Connecting Slack requires a registered account. Sign up or log in to continue.",
          {
            modal: true,
          },
          SIGN_UP_LABEL
        )
        .then(async (selection) => {
          if (selection === SIGN_UP_LABEL) {
            commands.executeCommand("codetime.signUpAccount");
          }
        });
    }
    return false;
  }
  return true;
}

export async function checkSlackConnection(showConnect = true) {
  if (!hasSlackWorkspaces()) {
    if (showConnect) {
      window
        .showInformationMessage(
          "Connect a Slack workspace to continue.",
          {
            modal: true,
          },
          "Connect"
        )
        .then(async (selection) => {
          if (selection === "Connect") {
            commands.executeCommand("codetime.connectSlackWorkspace");
          }
        });
    }
    return false;
  }
  return true;
}

/**
 * Show the list of channels in the command palette
 */
async function showStatusUpdateOptions() {
  let menuOptions = {
    items: [
      {
        label: "Clear your status",
        value: "clear",
      },
      {
        label: "Set a new status",
        value: "update",
      },
    ],
    placeholder: "Select clear or update to continue",
  };

  const pick = await showQuickPick(menuOptions);
  if (pick && pick.label) {
    return pick.value;
  }
  return null;
}

// get the slack do not disturb info
async function getSlackDnDInfoPerDomain(team_domain) {
  let dndInfo = null;
  const accessToken = getWorkspaceAccessToken(team_domain);
  if (accessToken) {
    const web = new WebClient(accessToken);
    dndInfo = await web.dnd.info().catch((e) => {
      console.error("Error fetching slack do not disturb info: ", e.message);
      return null;
    });
  }
  return dndInfo;
}

function compareLabels(a, b) {
  if (a.name > b.name) return 1;
  if (b.name > a.name) return -1;

  return 0;
}
