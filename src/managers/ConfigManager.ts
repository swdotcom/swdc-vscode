import { ConfigurationTarget, ViewColumn, WebviewPanel, window, workspace, WorkspaceConfiguration } from "vscode";
import { initializePreferences } from "../DataController";
import path = require("path");
import fs = require("fs");
import { softwareGet, isResponseOk } from "../http/HttpClient";
import { getItem } from "../Util";

let currentPanel: WebviewPanel | undefined = undefined;
let currentColorKind: number = undefined;

function init() {
  currentColorKind = window.activeColorTheme.kind;
  window.onDidChangeActiveColorTheme((event) => {
    const kind = event?.kind ?? currentColorKind;
    if (kind !== currentColorKind) {
      // reload the current panel if its not null/undefined
      if (currentPanel) {
        setTimeout(() => {
          configureSettings();
        }, 250);
      }
      currentColorKind = kind;
    }
  });
}

export async function configureSettings() {
  if (currentColorKind == null) {
    init();
  }

  if (currentPanel) {
    // dipose the previous one. always use the same tab
    currentPanel.dispose();
  }

  if (!currentPanel) {
    currentPanel = window.createWebviewPanel("edit_settings", "Code Time Settings", ViewColumn.One, { enableScripts: true });
    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
    });
    currentPanel.webview.onDidReceiveMessage(async (message) => {
      await initializePreferences();

      if (currentPanel) {
        // dipose it
        currentPanel.dispose();
      }
    });
  }
  currentPanel.webview.html = await getEditSettingsHtml();
  currentPanel.reveal(ViewColumn.One);
}

export async function getEditSettingsHtml(): Promise<string> {
  const resp = await softwareGet(
    `/users/me/edit_preferences`,
    getItem("jwt"),
    {
      isLightMode: window.activeColorTheme.kind == 1,
      editor: "vscode"
    }
  );

  if (isResponseOk(resp)) {
    return resp.data.html;
  } else {
    window.showErrorMessage("Unable to generate view. Please try again later.");
  }
}
