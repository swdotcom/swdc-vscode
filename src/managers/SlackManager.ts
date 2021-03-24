import { commands, window } from "vscode";
import { api_endpoint, DISCONNECT_LABEL, SIGN_UP_LABEL } from "../Constants";
import { fetchSlackIntegrations, getUserRegistrationState } from "../DataController";
import {
  getAuthCallbackState,
  getIntegrations,
  getItem,
  getPluginId,
  getPluginType,
  getPluginUuid,
  getVersion,
  launchWebUrl,
  syncIntegrations,
} from "../Util";
import { showQuickPick } from "../menu/MenuManager";
import { softwareDelete } from "../http/HttpClient";

const queryString = require("query-string");

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
    upgrade_features: "dnd",
    plugin_token: getItem("jwt"),
  });

  const url = `${api_endpoint}/auth/slack?${qryStr}`;

  // authorize the user for slack
  launchWebUrl(url);
}

export async function disconectAllSlackIntegrations(showPrompt = true) {
  const workspaces = getSlackWorkspaces();
  if (workspaces?.length) {
    for await (const workspace of workspaces) {
      await disconnectSlackAuth(workspace.authId, showPrompt);
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
export async function disconnectSlackAuth(authId, showPrompt = true) {
  // get the domain
  const integration = getSlackWorkspaces().find((n) => n.authId === authId);
  if (!integration) {
    window.showErrorMessage("Unable to find selected integration to disconnect");
    commands.executeCommand("codetime.refreshCodeTimeView");
    return;
  }
  // ask before disconnecting
  let selection = DISCONNECT_LABEL;
  if (showPrompt) {
    selection = await window.showInformationMessage(
      `Are you sure you would like to disconnect the '${integration.team_domain}' Slack workspace?`,
      ...[DISCONNECT_LABEL]
    );
  }

  if (selection === DISCONNECT_LABEL) {
    // await softwarePut(`/auth/slack/disconnect`, { authId }, getItem("jwt"));
    await softwareDelete(`/integrations/${integration.id}`, getItem("jwt"));
    // disconnected, remove it from the integrations
    removeSlackIntegration(authId);

    commands.executeCommand("codetime.refreshCodeTimeView");
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
 * Get the slack Oauth from the registered user
 */
export async function getSlackAuth() {
  const { user } = await getUserRegistrationState(true /*isIntegration*/);
  return await fetchSlackIntegrations(user);
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
