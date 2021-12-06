import {commands, window} from 'vscode';
import {api_endpoint, DISCONNECT_LABEL, SIGN_UP_LABEL} from '../Constants';
import {
  getAuthCallbackState,
  getItem,
  getPluginId,
  getPluginType,
  getPluginUuid,
  getVersion,
  isActiveIntegration,
  launchWebUrl,
  setItem
} from '../Util';
import {showQuickPick} from '../menu/MenuManager';
import {softwareDelete} from '../http/HttpClient';
import { URLSearchParams } from 'url';
import { getCachedSlackIntegrations, getUser } from '../DataController';

// -------------------------------------------
// - public methods
// -------------------------------------------

// get saved slack integrations
export async function getSlackWorkspaces() {
  return (await getCachedSlackIntegrations()).filter((n: any) => isActiveIntegration('slack', n));
}

export async function hasSlackWorkspaces() {
  return !!(await getCachedSlackIntegrations()).length;
}

// connect slack flow
export async function connectSlackWorkspace() {
  if (!getItem('name')) {
    showModalSignupPrompt('Connecting Slack requires a registered account. Sign up or log in to continue.');
    return;
  }

  const params = new URLSearchParams();
  params.append('plugin', getPluginType());
  params.append('plugin_uuid', getPluginUuid());
  params.append('pluginVersion', getVersion());
  params.append('plugin_id', `${getPluginId()}`);
  params.append('auth_callback_state', getAuthCallbackState());
  params.append('integrate', 'slack');
  params.append('upgrade_features', 'flow');
  params.append('plugin_token', getItem('jwt'))

  const url = `${api_endpoint}/auth/slack?${params.toString()}`;

  // authorize the user for slack
  launchWebUrl(url);
}

export async function disconectAllSlackIntegrations(showPrompt = true) {
  const workspaces = await getSlackWorkspaces();
  if (workspaces?.length) {
    for await (const workspace of workspaces) {
      await disconnectSlackAuth(workspace.auth_id, showPrompt);
    }
  }
}

export async function disconnectSlackWorkspace() {
  // pick the workspace to disconnect
  const selectedTeamDomain = await showSlackWorkspaceSelection();

  if (selectedTeamDomain) {
    disconnectSlackAuth(selectedTeamDomain.auth_id);
  }
}

// disconnect slack flow
export async function disconnectSlackAuth(auth_id: string, showPrompt = true) {
  // get the domain
  const integration = (await getSlackWorkspaces()).find((n: any) => n.auth_id === auth_id);
  if (!integration) {
    window.showErrorMessage('Unable to find selected integration to disconnect');
    commands.executeCommand('codetime.refreshCodeTimeView');
    return;
  }
  // ask before disconnecting
  let selection: any = DISCONNECT_LABEL;
  if (showPrompt) {
    const team_domain = integration.meta?.domain ?? '';
    selection = await window.showInformationMessage(
      `Are you sure you would like to disconnect the '${team_domain}' Slack workspace?`,
      ...[DISCONNECT_LABEL]
    );
  }

  if (selection === DISCONNECT_LABEL) {
    await softwareDelete(`/integrations/${integration.id}`, getItem('jwt'));
    // disconnected, remove it from the integrations
    removeSlackIntegration(auth_id);

    commands.executeCommand('codetime.refreshCodeTimeView');
  }
}

// -------------------------------------------
// - private methods
// -------------------------------------------

async function showSlackWorkspaceSelection() {
  let menuOptions: any = {
    items: [],
    placeholder: `Select a Slack workspace`,
  };

  (await getSlackWorkspaces()).forEach((integration: any) => {
    menuOptions.items.push({
      label: integration.team_domain,
      value: integration.team_domain,
    });
  });

  menuOptions.items.push({
    label: 'Connect a Slack workspace',
    command: 'musictime.connectSlack',
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

/**
 * Remove an integration from the local copy
 * @param auth_id
 */
function removeSlackIntegration(auth_id: string) {
  getUser();
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
        commands.executeCommand('codetime.registerAccount');
      }
    });
}

export async function checkSlackConnection(showConnect = true) {
  if (!(await hasSlackWorkspaces())) {
    if (showConnect) {
      window
        .showInformationMessage(
          'Connect a Slack workspace to continue.',
          {
            modal: true,
          },
          'Connect'
        )
        .then(async (selection) => {
          if (selection === 'Connect') {
            commands.executeCommand('codetime.connectSlackWorkspace');
          }
        });
    }
    return false;
  }
  return true;
}

export async function checkSlackConnectionForFlowMode() {
  if (!(await hasSlackWorkspaces())) {
    const selection = await window.showInformationMessage(
      "Slack isn't connected",
      {modal: true},
      ...['Continue anyway', 'Connect Slack']
    );
    if (!selection) {
      // the user selected "cancel"
      return {continue: false, useSlackSettings: true};
    } else if (selection === 'Continue anyway') {
      // slack is not connected, but continue. set useSlackSettings to FALSE
      // set continue to TRUE
      setItem('vscode_CtskipSlackConnect', true);
      return {continue: true, useSlackSettings: false};
    } else {
      // connect was selected
      commands.executeCommand('codetime.manageSlackConnection');
      return {continue: false, useSlackSettings: true};
    }
  }
  return {continue: true, useSlackSettings: true};
}
