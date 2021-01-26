import { ConfigurationTarget, ViewColumn, WebviewPanel, window, workspace, WorkspaceConfiguration } from "vscode";
import path = require("path");
import fs = require("fs");
import { softwareGet, isResponseOk } from "../http/HttpClient";
import { getItem } from "../Util";
import ConfigSettings from "../model/ConfigSettings";

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
  settings.setSlackToAway = workspace.getConfiguration().get("setSlackToAway");
  settings.slackStatusText = workspace.getConfiguration().get("slackStatusText");
  settings.screenMode = workspace.getConfiguration().get("screenMode");
<<<<<<< HEAD
  settings.flowModeReminders = workspace.getConfiguration().get("flowModeReminders");
=======
  settings.durationMinutes = workspace.getConfiguration().get("durationMinutes");
>>>>>>> moving config page to be server side and updating names of variables
  return settings;
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
  currentPanel.webview.html = await getEditSettingsHtml();
  currentPanel.reveal(ViewColumn.One);
}

<<<<<<< HEAD
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
=======
export async function getEditSettingsHtml(): Promise<string> {
  const resp = await softwareGet(
    `/users/me/edit_preferences`,
    getItem("jwt"),
    {
      isLightMode: window.activeColorTheme.kind == 1
    }
  );
>>>>>>> moving config page to be server side and updating names of variables

  if (isResponseOk(resp)) {
    return resp.data.html;
  } else {
    window.showErrorMessage("Unable to generate view. Please try again later.");
  }
}

async function updateConfigSettings(settings) {
  const configuration: WorkspaceConfiguration = workspace.getConfiguration();

  await Promise.all([
    configuration.update("pauseSlackNotifications", settings.pauseSlackNotifications, ConfigurationTarget.Global),
    configuration.update("setSlackToAway", settings.setSlackToAway, ConfigurationTarget.Global),
    configuration.update("slackStatusText", settings.slackStatusText, ConfigurationTarget.Global),
    configuration.update("screenMode", settings.screenMode, ConfigurationTarget.Global),
<<<<<<< HEAD
    configuration.update("flowModeReminders", settings.flowModeReminders, ConfigurationTarget.Global)
=======
    configuration.update("durationMinutes", settings.durationMinutes, ConfigurationTarget.Global),
>>>>>>> moving config page to be server side and updating names of variables
  ]).catch((e) => {
    console.error("error updating global code time settings: ", e.message);
  });
}
