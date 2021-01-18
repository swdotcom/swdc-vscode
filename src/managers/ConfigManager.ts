import { ConfigurationTarget, ViewColumn, WebviewPanel, window, workspace, WorkspaceConfiguration } from "vscode";
import path = require("path");
import fs = require("fs");
import ConfigSettings from "../model/ConfigSettings";

let currentPanel: WebviewPanel | undefined = undefined;

export function getConfigSettings(): ConfigSettings {
  const settings: ConfigSettings = new ConfigSettings();
  settings.pauseSlackNotifications = workspace.getConfiguration().get("pauseSlackNotifications");
  settings.slackAwayStatus = workspace.getConfiguration().get("slackAwayStatus");
  settings.slackAwayStatusText = workspace.getConfiguration().get("slackAwayStatusText");
  settings.screenMode = workspace.getConfiguration().get("screenMode");
  return settings;
}

export function configureSettings() {
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
  const { cardTextColor, cardBackgroundColor, cardGrayedLevel } = getInputFormStyles();

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
    cardGrayedLevel,
    slackAwayStatusPlaceholder,
    slackAwayStatusText,
    zenSelected,
    fullScreenSelected,
    noneSelected,
    pauseSlackNotifications: configSettings.pauseSlackNotifications ? "checked" : "",
    slackAwayStatus: configSettings.slackAwayStatus ? "checked" : "",
  };

  const templateString = fs.readFileSync(getEditSettingsTemplate()).toString();
  const fillTemplate = function (templateString: string, templateVars: any) {
    return new Function("return `" + templateString + "`;").call(templateVars);
  };

  // return the html content
  return fillTemplate(templateString, templateVars);
}

function getInputFormStyles() {
  let cardTextColor = "#FFFFFF";
  let cardBackgroundColor = "rgba(255,255,255,0.05)";
  let cardGrayedLevel = "#474747";
  if (window.activeColorTheme.kind === 1) {
    cardTextColor = "#444444";
    cardBackgroundColor = "rgba(0,0,0,0.10)";
    cardGrayedLevel = "#B5B5B5";
  }
  return { cardTextColor, cardBackgroundColor, cardGrayedLevel };
}

async function updateConfigSettings(settings) {
  const configuration: WorkspaceConfiguration = workspace.getConfiguration();

  await Promise.all([
    configuration.update("pauseSlackNotifications", settings.pauseSlackNotifications, ConfigurationTarget.Global),
    configuration.update("slackAwayStatus", settings.slackAwayStatus, ConfigurationTarget.Global),
    configuration.update("slackAwayStatusText", settings.slackAwayStatusText, ConfigurationTarget.Global),
    configuration.update("screenMode", settings.screenMode, ConfigurationTarget.Global),
  ]).catch((e) => {
    console.error("error updating global code time settings: ", e.message);
  });
}
