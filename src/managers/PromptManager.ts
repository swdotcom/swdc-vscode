import {commands, window} from 'vscode';
import {getCachedSlackIntegrations} from '../DataController';
import {showQuickPick} from './MenuManager';

export const SIGN_UP_LABEL = 'Sign up';

export async function showSlackManageOptions() {
  const items: any = [];

  items.push({
    label: 'Add workspace',
    command: 'codetime.connectSlack',
  });

  const slackIntegrations = await getCachedSlackIntegrations();
  slackIntegrations.forEach((integration: any) => {
    let domain = integration.integration_type.name;
    try {
      domain = JSON.parse(integration.meta).domain;
    } catch (e) {}
    items.push({
      label: `Disconnect ${domain} - ${integration.email}`,
      command: 'codetime.disconnectIntegration',
      commandArgs: [{id: integration.integration_type.id}],
    });
  });

  const menuOptions = {
    items,
    placeholder: 'Slack...',
  };
  showQuickPick(menuOptions);
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
    .then((selection: string | undefined) => {
      if (selection === SIGN_UP_LABEL) {
        commands.executeCommand('');
      }
    });
}
