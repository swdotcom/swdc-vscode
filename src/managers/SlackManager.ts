import {commands, window} from 'vscode';
import {SIGN_UP_LABEL} from '../Constants';
import {
  isActiveIntegration,
  setItem
} from '../Util';
import {showQuickPick} from '../menu/MenuManager';
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
