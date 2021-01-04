import { ViewColumn, WebviewPanel, window } from "vscode";
import path = require("path");
import fs = require("fs");

let currentPanel: WebviewPanel | undefined = undefined;
let currentTitle: string = "";

export async function showReportGenerator() {
  initiatePanel("Report Generator", "report_generator");

  const html = getReportGeneratorHtml();

  currentPanel.webview.html = html;
  currentPanel.reveal(ViewColumn.One);
}

export async function showDashboard() {
  initiatePanel("Dashboard", "dasboard");
  const html = getDashboardHtml();
  currentPanel.webview.html = html;
  currentPanel.reveal(ViewColumn.One);
}

function initiatePanel(title: string, viewType: string) {
  if (currentPanel && title !== currentTitle) {
    // dipose the previous one
    currentPanel.dispose();
  }
  currentTitle = title;

  if (!currentPanel) {
    currentPanel = window.createWebviewPanel(viewType, title, ViewColumn.One, { enableScripts: true });
    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
    });
  }

  // commandMessage can be anything; object, number, string, etc
  currentPanel.webview.onDidReceiveMessage(async (commandMessage: any) => {
    //
  });
}

function getReportGeneratorHtml() {
  // fetch the html from the app
  return "<html><body><div>html goes here</div></body></html>";
}

function getDashboardHtml() {
  const template = path.join(__dirname, "/templates/dashboard.html");
  const html = fs.readFileSync(template).toString();
  return html
}