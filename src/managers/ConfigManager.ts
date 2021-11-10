import {commands, ViewColumn, WebviewPanel, window} from 'vscode';
import {initializePreferences} from '../DataController';
import {isResponseOk, appGet, appPut} from '../http/HttpClient';
import {getConnectionErrorHtml} from '../local/404';

let currentPanel: WebviewPanel | undefined = undefined;

export function showingConfigureSettingsPanel() {
  return !!currentPanel;
}

export function closeSettings() {
  if (currentPanel) {
    // dispose the previous one. always use the same tab
    currentPanel.dispose();
  }
}

export async function configureSettings() {
  if (currentPanel) {
    // dispose the previous one. always use the same tab
    currentPanel.dispose();
  }

  if (!currentPanel) {
    currentPanel = window.createWebviewPanel('edit_settings', 'Code Time Settings', ViewColumn.One, {
      enableScripts: true,
    });
    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
    });

    currentPanel.webview.onDidReceiveMessage(async (message: any) => {
      if (message?.action) {
        const cmd = message.action.includes('codetime.') ? message.action : `codetime.${message.action}`;
        switch (message.command) {
          case 'command_execute':
            if (message.payload && Object.keys(message.payload).length) {
              commands.executeCommand(cmd, message.payload);
            } else {
              commands.executeCommand(cmd);
            }
            break;
        }
      }
    });
  }
  currentPanel.webview.html = await getEditSettingsHtml();
  currentPanel.reveal(ViewColumn.One);
}

export async function getEditSettingsHtml(): Promise<string> {
  const resp = await appGet(`/plugin/settings`, {editor: 'vscode'});

  if (isResponseOk(resp)) {
    return resp.data.html;
  }
  return await getConnectionErrorHtml();
}

export async function updateSettings(path: string, jsonData: any) {
  await appPut(path, jsonData);
  await initializePreferences();
  // update the sidebar
  commands.executeCommand('codetime.refreshCodeTimeView');
}
