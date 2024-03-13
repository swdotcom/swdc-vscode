import { commands, window } from 'vscode';
import { SIGN_UP_LABEL } from '../Constants';
import {
  isActiveIntegration,
  setItem
} from '../Util';
import { getCachedSlackIntegrations } from '../DataController';

export async function getSlackWorkspaces() {
  return (await getCachedSlackIntegrations()).filter((n: any) => isActiveIntegration('slack', n));
}

export async function hasSlackWorkspaces() {
  return !!(await getCachedSlackIntegrations()).length;
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
      { modal: true },
      ...['Continue anyway', 'Connect Slack']
    );
    if (!selection) {
      // the user selected "cancel"
      return { continue: false, useSlackSettings: true };
    } else if (selection === 'Continue anyway') {
      // slack is not connected, but continue. set useSlackSettings to FALSE
      // set continue to TRUE
      setItem('vscode_CtskipSlackConnect', true);
      return { continue: true, useSlackSettings: false };
    } else {
      // connect was selected
      commands.executeCommand('codetime.manageSlackConnection');
      return { continue: false, useSlackSettings: true };
    }
  }
  return { continue: true, useSlackSettings: true };
}
