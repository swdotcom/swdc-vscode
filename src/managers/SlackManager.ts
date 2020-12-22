import { commands, window } from "vscode";
import { api_endpoint, DISCONNECT_LABEL, YES_LABEL } from "../Constants";
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

// -------------------------------------------
// - public methods
// -------------------------------------------

// get saved slack integrations
export function getSlackWorkspaces() {
  return getIntegrations().filter((n) => n.name.toLowerCase() === "slack");
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

// share a message to a selected slack channel
export async function shareSlackMessage(message) {
  const registered = await checkRegistration();
  if (!registered) {
    return;
  }

  let slackAccessToken = getSlackAccessToken();
  if (!slackAccessToken) {
    // prompt to connect
    window.showInformationMessage("To share a message on Slack, please connect your account", ...["Connect"]).then((selection) => {
      if (selection === "Connect") {
        connectSlackWorkspace();
      }
    });
    return;
  }

  const selectedChannel = await showSlackChannelMenu(message);
  if (!selectedChannel) {
    return;
  }

  window
    .showInformationMessage(
      `Post your message to the '${selectedChannel}' channel?`,
      {
        modal: true,
      },
      "Continue"
    )
    .then(async (selection) => {
      if (selection === "Continue") {
        postMessage(selectedChannel, message);
      }
    });
}

// get the slack do not disturb info
export async function getSlackDnDInfo(team_domain) {
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

// check if snooze is enabled for a slack workspace
export async function isSlackDnDEnabled(domain) {
  const dndInfo = await getSlackDnDInfo(domain);
  return dndInfo && dndInfo.snooze_enabled;
}

// get the number of integrations that have snooze enabled
export async function getSlackDnDEnabledCount() {
  const integrations = getSlackWorkspaces();
  let dnd_enabled_count = 0;
  for await (const integration of integrations) {
    if (await isSlackDnDEnabled(integration.team_domain)) {
      dnd_enabled_count++;
    }
  }
  return dnd_enabled_count;
}

// set the slack profile status
export async function setProfileStatus() {
  const registered = await checkRegistration();
  if (!registered) {
    return;
  }

  const message = await showMessageInputPrompt();
  if (!message) {
    return;
  }

  const integrations = getSlackWorkspaces();
  // example:
  // { status_text: message, status_emoji: ":mountain_railway:", status_expiration: 0 }
  for await (const integration of integrations) {
    const web = new WebClient(integration.access_token);
    await web.users.profile
      .set({ profile: { status_text: message, status_expiration: 0 } })
      .then((result) => {
        window.showInformationMessage(`Updated your profile status to '${message}'`);
      })
      .catch((e) => {
        console.error("error setting profile status: ", e.message);
      });
  }
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
    });
  });

  menuOptions.items.push({
    label: "Connect a Slack workspace",
  });

  const pick = await showQuickPick(menuOptions);
  if (pick && pick.label) {
    return pick.label;
  }
  return null;
}

async function showMessageInputPrompt() {
  return await window.showInputBox({
    value: "",
    placeHolder: "Enter a message to appear in your profile status",
    validateInput: (text) => {
      return !text ? "Please enter a valid message to continue." : null;
    },
  });
}

/**
 * Show the list of channels in the command palette
 */
async function showSlackChannelMenu(message) {
  let menuOptions = {
    items: [],
    placeholder: `Select a channel to post: "${getTextSnippet(message)}"`,
  };

  // get the available channels
  const channelNames = await getChannelNames();
  // sort
  channelNames.sort();

  channelNames.forEach((channelName) => {
    menuOptions.items.push({
      label: channelName,
    });
  });

  const pick = await showQuickPick(menuOptions);
  if (pick && pick.label) {
    return pick.label;
  }
  return null;
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

/**
 * retrieve the slack channels to display
 */
async function getChannels(team_doamin) {
  const slackAccessToken = getWorkspaceAccessToken(team_doamin);
  const web = new WebClient(slackAccessToken);
  const result = await web.conversations.list({ exclude_archived: true, exclude_members: true }).catch((err) => {
    console.log("Unable to retrieve slack channels: ", err.message);
    return [];
  });
  if (result && result.ok) {
    return result.channels;
  }
  return [];
}

/**
 * return the channel names
 */
async function getChannelNames() {
  const selectedTeamDomain = await showSlackWorkspaceSelection();
  if (selectedTeamDomain) {
    const channels = await getChannels(selectedTeamDomain);
    if (channels && channels.length > 0) {
      return channels.map((channel) => {
        return channel.name;
      });
    }
  }
  return [];
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
  const { user } = await getUserRegistrationState();
  if (user && user.integrations) {
    const currentIntegrations = getIntegrations();
    // find the slack auth
    for (const integration of user.integrations) {
      // {access_token, name, plugin_uuid, scopes, pluginId, authId, refresh_token, scopes}
      if (integration.name.toLowerCase() === "slack") {
        // check if it exists
        const foundIntegration = currentIntegrations.find((n) => n.authId === integration.authId);
        if (!foundIntegration) {
          // get the workspace domain using the authId
          const web = new WebClient(integration.access_token);
          const usersIdentify = await web.users.identity((e) => {
            console.log("error fetching slack team info: ", e.message);
            return null;
          });
          // usersIdentity returns
          // {team: {id, name, domain, image_102, image_132, ....}...}
          // set the domain
          integration["team_domain"] = usersIdentify?.team?.domain;
          integration["team_name"] = usersIdentify?.team?.name;
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

/**
 * Post the message to the slack channel
 * @param selectedChannel
 * @param message
 */
async function postMessage(selectedChannel: any, message: string) {
  message = "```" + message + "```";
  let slackAccessToken = getSlackAccessToken();
  const web = new WebClient(slackAccessToken);
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
  const currentIntegrations = getIntegrations();

  const newIntegrations = currentIntegrations.filter((n) => n.authId !== authId);
  syncIntegrations(newIntegrations);
}

async function checkRegistration() {
  if (!getItem("name")) {
    window
      .showInformationMessage(
        "Connecting Slack requires a registered account. Sign up or log in to continue.",
        {
          modal: true,
        },
        "Sign up"
      )
      .then(async (selection) => {
        if (selection === "Sign up") {
          commands.executeCommand("codetime.signUpAccount");
        }
      });
    return false;
  }
  return true;
}
