import {commands, ViewColumn, WebviewPanel, window, ProgressLocation} from 'vscode';
import {appGet, isResponseOk} from '../http/HttpClient';
import {checkRegistrationForReport, isPrimaryWindow} from '../Util';
import { getDashboardErrorHtml } from '../local/dashboardError';

let currentPanel: WebviewPanel | undefined = undefined;

export async function showDashboard(params: any = {}) {
  if (!checkRegistrationForReport(true)) {
    return;
  }
  initiatePanel('Dashboard', 'dashboard');
  if (isPrimaryWindow()) {
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: 'Loading dashboard...',
        cancellable: false,
      },
      async () => {
        loadDashboard(params);
      }
    );
  } else {
    // no need to show the loading notification for secondary windows
    loadDashboard(params);
  }
}

async function loadDashboard(params: any) {
  const html = await getDashboardHtml(params);
  if (currentPanel) {
    currentPanel.webview.html = html;
    currentPanel.reveal(ViewColumn.One);
  }
}

function initiatePanel(title: string, viewType: string) {
  if (currentPanel) {
    // dipose the previous one
    currentPanel.dispose();
  }

  if (!currentPanel) {
    currentPanel = window.createWebviewPanel(viewType, title, ViewColumn.One, {enableScripts: true});
    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
    });
  }

  // commandMessage can be anything; object, number, string, etc
  currentPanel.webview.onDidReceiveMessage(async (commandMessage: any) => {
    //
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

async function getDashboardHtml(params: any) {
  const qryString = new URLSearchParams(params).toString()
  const resp = await appGet(`/plugin/dashboard?${qryString}`);
  if (isResponseOk(resp)) {
    return resp.data.html;
  } else {
    window.showErrorMessage('Unable to generate Code Time dashboard. Please try again later.');
    return await getDashboardErrorHtml();
  }
}
