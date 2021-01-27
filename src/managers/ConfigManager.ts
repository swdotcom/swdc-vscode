import { ConfigurationTarget, ViewColumn, WebviewPanel, window, workspace, WorkspaceConfiguration } from "vscode";
import path = require("path");
import fs = require("fs");
import ConfigSettings from "../model/ConfigSettings";
import { config } from "process";

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

export function getConfigSettings(): ConfigSettings {
  const settings: ConfigSettings = new ConfigSettings();
  settings.pauseSlackNotifications = workspace.getConfiguration().get("pauseSlackNotifications");
  settings.slackAwayStatus = workspace.getConfiguration().get("slackAwayStatus");
  settings.slackAwayStatusText = workspace.getConfiguration().get("slackAwayStatusText");
  settings.screenMode = workspace.getConfiguration().get("screenMode");
  settings.flowModeReminders = workspace.getConfiguration().get("flowModeReminders");
  return settings;
}

export function configureSettings() {
  if (currentColorKind == null) {
    init();
  }
  const generatedHtml = getEditSettingsHtml();

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
      switch (message.command) {
        case "editSettings":
          updateConfigSettings(message.value);
          break;
      }
      if (currentPanel) {
        // dipose it
        currentPanel.dispose();
      }
    });
  }
  currentPanel.webview.html = generatedHtml;
  currentPanel.reveal(ViewColumn.One);
}

export function getEditSettingsTemplate() {
  const resourcePath: string = path.join(__dirname, "resources/templates");
  const file = path.join(resourcePath, "edit_settings.html");
  return file;
}

export function getEditSettingsHtml(): string {
  const { cardTextColor, cardBackgroundColor, cardInputHeaderColor } = getInputFormStyles();

  const configSettings: ConfigSettings = getConfigSettings();
  const slackAwayStatusPlaceholder: string = !configSettings.slackAwayStatusText ? "CodeTime!" : "";
  const slackAwayStatusText = configSettings.slackAwayStatusText ?? "";

  // create the 3 html select "selected" values for the basic html template we're using
  const zenSelected = configSettings.screenMode === "Zen" ? "selected" : "";
  const fullScreenSelected = configSettings.screenMode === "Full Screen" ? "selected" : "";
  const noneSelected = configSettings.screenMode === "None" ? "selected" : "";

  const templateVars = {
    cardTextColor,
    cardBackgroundColor,
    cardInputHeaderColor,
    slackAwayStatusPlaceholder,
    slackAwayStatusText,
    zenSelected,
    fullScreenSelected,
    noneSelected,
    pauseSlackNotifications: configSettings.pauseSlackNotifications ? "checked" : "",
    slackAwayStatus: configSettings.slackAwayStatus ? "checked" : "",
    flowModeReminders: configSettings.flowModeReminders ? "checked" : "",
  };

  const templateString = fs.readFileSync(getEditSettingsTemplate()).toString();
  const fillTemplate = function (templateString: string, templateVars: any) {
    return new Function("return `" + templateString + "`;").call(templateVars);
  };

  // return the html content
  return fillTemplate(templateString, templateVars);
}

// window.activeColorTheme.kind
// 1 = light color theme
// 2 = dark color theme
function getInputFormStyles() {
  let cardTextColor = "#FFFFFF";
  let cardBackgroundColor = "rgba(255,255,255,0.05)";
  let cardInputHeaderColor = "#e6e2e2";
  if (window.activeColorTheme.kind === 1) {
    cardTextColor = "#444444";
    cardBackgroundColor = "rgba(0,0,0,0.10)";
    cardInputHeaderColor = "#565758";
  }
  return { cardTextColor, cardBackgroundColor, cardInputHeaderColor };
}

async function updateConfigSettings(settings) {
  const configuration: WorkspaceConfiguration = workspace.getConfiguration();

  await Promise.all([
    configuration.update("pauseSlackNotifications", settings.pauseSlackNotifications, ConfigurationTarget.Global),
    configuration.update("slackAwayStatus", settings.slackAwayStatus, ConfigurationTarget.Global),
    configuration.update("slackAwayStatusText", settings.slackAwayStatusText, ConfigurationTarget.Global),
    configuration.update("screenMode", settings.screenMode, ConfigurationTarget.Global),
    configuration.update("flowModeReminders", settings.flowModeReminders, ConfigurationTarget.Global)
  ]).catch((e) => {
    console.error("error updating global code time settings: ", e.message);
  });
}
