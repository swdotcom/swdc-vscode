import {ViewColumn, WebviewPanel, window, ProgressLocation} from 'vscode';
import {isResponseOk, appGet} from '../http/HttpClient';
import {getConnectionErrorHtml} from '../local/404';
import {checkRegistrationForReport} from '../Util';

let currentPanel: WebviewPanel | undefined = undefined;
let currentTitle: string = '';

export async function showDashboard() {
  if (!checkRegistrationForReport(true)) {
    return;
  }
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: 'Loading dashboard...',
      cancellable: false,
    },
    async () => {
      initiatePanel('Dashboard', 'dashboard');
      const html = await getDashboardHtml();
      if (currentPanel) {
        currentPanel.webview.html = html;
        currentPanel.reveal(ViewColumn.One);
      }
    }
  );
}

function initiatePanel(title: string, viewType: string) {
  if (currentPanel && title !== currentTitle) {
    // dipose the previous one
    currentPanel.dispose();
  }
  currentTitle = title;

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
}

async function getDashboardHtml() {
  const resp = await appGet('/plugin/dashboard');
  if (isResponseOk(resp)) {
    return resp.data.html;
  } else {
    window.showErrorMessage('Unable to generate dashboard. Please try again later.');
    return await getConnectionErrorHtml();
  }
}
