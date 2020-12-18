import { commands, window } from "vscode";
import { api_endpoint } from "../Constants";
import { getUserRegistrationState, isLoggedIn } from "../DataController";
import {
  getAuthCallbackState,
  getItem,
  getPluginId,
  getPluginType,
  getPluginUuid,
  getVersion,
  launchWebUrl,
  setItem,
} from "../Util";
import { showQuickPick } from "../menu/MenuManager";

const queryString = require("query-string");
const { WebClient } = require("@slack/web-api");

// -------------------------------------------
// - public methods
// -------------------------------------------

export function getSlackAccessToken() {
  return getItem("slack_access_token");
}

export async function connectSlack() {
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

/**
 * Shares a message to a selected slack user channel
 * @param message
 */
export async function shareSlackMessage(message) {
  if (!getItem("name")) {
    window
      .showInformationMessage(
        "Log in with Code Time to continue.",
        {
          modal: true,
        },
        "Log in"
      )
      .then(async (selection) => {
        if (selection === "Log in") {
          commands.executeCommand("codetime.codeTimeExisting");
        }
      });
    return;
  }
  let slackAccessToken = getSlackAccessToken();
  if (!slackAccessToken) {
    // prompt to connect
    window
      .showInformationMessage("To share a message on Slack, please connect your account", ...["Connect"])
      .then((selection) => {
        if (selection === "Connect") {
          connectSlack();
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

// -------------------------------------------
// - private methods
// -------------------------------------------

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

/**
 * retrieve the slack channels to display
 */
async function getChannels() {
  const slackAccessToken = getItem("slack_access_token");
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
  const channels = await getChannels();
  if (channels && channels.length > 0) {
    return channels.map((channel) => {
      return channel.name;
    });
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
    }
  } else {
    window.showInformationMessage("Successfully connected to Slack");
  }
}

/**
 * Get the slack Oauth from the registered user
 */
async function getSlackAuth() {
  let slackAuth = null;
  const { user } = await getUserRegistrationState();
  if (user && user.auths) {
    // find the slack auth
    for (let i = 0; i < user.auths.length; i++) {
      if (user.auths[i].type === "slack") {
        slackAuth = user.auths[i];
        setItem("slack_access_token", slackAuth.access_token);
      }
    }
  }
  return slackAuth;
}

/**
 * Post the message to the slack channel
 * @param selectedChannel
 * @param message
 */
function postMessage(selectedChannel: any, message: string) {
  let slackAccessToken = getSlackAccessToken();
  const web = new WebClient(slackAccessToken);
  web.chat
    .postMessage({
      text: message,
      channel: selectedChannel,
      as_user: true,
    })
    .catch(() => {
      // try without sending "as_user"
      web.chat
        .postMessage({
          text: message,
          channel: selectedChannel,
        })
        .catch((err) => {
          if (err.message) {
            console.log("error posting slack message: ", err.message);
          }
        });
    });
}
