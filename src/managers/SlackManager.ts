import { commands, ProgressLocation, window } from "vscode";
import { api_endpoint, DISCONNECT_LABEL, SIGN_UP_LABEL } from "../Constants";
import { foundNewSlackIntegrations, getUserRegistrationState } from "../DataController";
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
import { softwareDelete, softwarePut } from "../http/HttpClient";

const queryString = require("query-string");
const { WebClient } = require("@slack/web-api");

let slackDndInfo: any = undefined;
let slackPresence: string = undefined;
let slackStatusMessage: any = undefined;

// -------------------------------------------
// - public methods
// -------------------------------------------

export function clearSlackInfoCache() {
  slackDndInfo = null;
  slackPresence = null;
  slackStatusMessage = null;
}

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

export async function disconectAllSlackIntegrations() {
  const workspaces = getSlackWorkspaces();
  if (workspaces?.length) {
    for await (const workspace of workspaces) {
      await disconnectSlackAuth(workspace.authId);
    }
  }
}

export async function disconnectSlackWorkspace() {
  const registered = await checkRegistration();
  if (!registered) {
    return;
  }
  // pick the workspace to disconnect
  const selectedTeamDomain = await showSlackWorkspaceSelection();

  if (selectedTeamDomain) {
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
    // await softwarePut(`/auth/slack/disconnect`, { authId }, getItem("jwt"));
    await softwareDelete(`/integrations/${integration.id}`, getItem("jwt"));
    // disconnected, remove it from the integrations
    removeSlackIntegration(authId);

    commands.executeCommand("codetime.refreshTreeViews");
  }
}

// Get the users slack status
export async function getSlackStatus() {
  const registered = await checkRegistration(false);
  if (!registered) {
    return null;
  }

  // use the cached value if its available
  if (slackStatusMessage) {
    return slackStatusMessage;
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
    slackStatusMessage = data?.profile?.status_text ?? "";
    return slackStatusMessage;
  }
  return null;
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
  if (pick) {
    if (pick.value) {
      return pick.value;
    } else if (pick.command) {
      commands.executeCommand(pick.command);
      return null;
    }
  }

  return null;
}

function getWorkspaceAccessToken(team_domain) {
  const integration = getSlackWorkspaces().find((n) => n.team_domain === team_domain);
  if (integration) {
    return integration.access_token;
  }
  return null;
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
    showSuccessMessage("Successfully connected to Slack");

    commands.executeCommand("codetime.refreshTreeViews");
  }
}

/**
 * Get the slack Oauth from the registered user
 */
async function getSlackAuth() {
  const { user } = await getUserRegistrationState(true /*isIntegration*/);
  return await foundNewSlackIntegrations(user);
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

export function checkRegistration(showSignup = true) {
  if (!getItem("name")) {
    if (showSignup) {
      showModalSignupPrompt("Connecting Slack requires a registered account. Sign up or log in to continue.");
    }
    return false;
  }
  return true;
}

export function showModalSignupPrompt(msg: string) {
  window
    .showInformationMessage(
      msg,
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

export function checkSlackConnection(showConnect = true) {
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

export async function checkSlackConnectionForFlowMode() {
  if (!hasSlackWorkspaces()) {
    const selection = await window.showInformationMessage("Slack isn't connected", { modal: true }, ...["Continue anyway", "Connect Slack"]);
    if (!selection) {
      // the user selected "cancel"
      return { continue: false, useSlackSettings: true };
    } else if (selection === "Continue anyway") {
      // slack is not connected, but continue. set useSlackSettings to FALSE
      // set continue to TRUE
      return { continue: true, useSlackSettings: false };
    } else {
      // connect was selected
      commands.executeCommand("codetime.connectSlackWorkspace");
      return { continue: false, useSlackSettings: true };
    }
  }
  return { continue: true, useSlackSettings: true };
}

function showSuccessMessage(message: string) {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: message,
      cancellable: false,
    },
    (progress) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve(true);
        }, 1000);
      });
    }
  );
}
