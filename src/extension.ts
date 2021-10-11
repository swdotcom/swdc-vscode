// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, ExtensionContext, commands } from "vscode";
import { initializePreferences } from "./DataController";
import { onboardInit } from "./user/OnboardManager";
import { getVersion, logIt, getPluginName, getItem, displayReadmeIfNotExists, setItem, getWorkspaceName } from "./Util";
import { createCommands } from "./command-helper";
import { KpmManager } from "./managers/KpmManager";
import { PluginDataManager } from "./managers/PluginDataManager";
import { TrackerManager } from "./managers/TrackerManager";
import { initializeWebsockets, clearWebsocketConnectionRetryTimeout } from "./websockets";
import { softwarePost } from "./http/HttpClient";
import { configureSettings, showingConfigureSettingsPanel } from "./managers/ConfigManager";
import { initializeStatusBar } from "./managers/StatusBarManager";
import { SummaryManager } from "./managers/SummaryManager";
import { SyncManager } from "./managers/SyncManger";
import { LocalStorageManager } from "./managers/LocalStorageManager";
import { initializeFlowModeState } from './managers/FlowManager';

let TELEMETRY_ON = true;
let currentColorKind: number = undefined;

const tracker: TrackerManager = TrackerManager.getInstance();
let localStorage: LocalStorageManager;

//
// Add the keystroke controller to the ext ctx, which
// will then listen for text document changes.
//
const kpmController: KpmManager = KpmManager.getInstance();

export function isTelemetryOn() {
  return TELEMETRY_ON;
}

export function deactivate(ctx: ExtensionContext) {
  // store the deactivate event
  tracker.trackEditorAction("editor", "deactivate");

  // dispose the new day timer
  PluginDataManager.getInstance().dispose();

  TrackerManager.getInstance().dispose();

  // dispose the file watchers
  kpmController.dispose();

  clearWebsocketConnectionRetryTimeout();
}

export async function activate(ctx: ExtensionContext) {
  // add the code time commands
  ctx.subscriptions.push(createCommands(ctx, kpmController));

  localStorage = LocalStorageManager.getInstance(ctx);

  // onboard the user as anonymous if it's being installed
  if (window.state.focused) {
    onboardInit(ctx, intializePlugin /*successFunction*/);
    setLocalStorageValue('primary_window', getWorkspaceName());
  } else {
    // 9 to 20 second delay
    const secondDelay = getRandomArbitrary(9, 20);
    // initialize in 5 seconds if this is the secondary window
    setTimeout(() => {
      onboardInit(ctx, intializePlugin /*successFunction*/);
    }, 1000 * secondDelay);
  }
}

export function getLocalStorageValue(key : string) {
  return localStorage.getValue(key);
}

export function setLocalStorageValue(key: string, value: any) {
  localStorage.setValue(key, value);
}

function getRandomArbitrary(min, max) {
  max = max + 0.1;
  return parseInt(Math.random() * (max - min) + min, 10);
}

export async function intializePlugin(ctx: ExtensionContext, createdAnonUser: boolean) {
  logIt(`Loaded ${getPluginName()} v${getVersion()}`);

  try {
    initializeWebsockets();
  } catch (e) {
    console.error("Failed to initialize websockets", e);
  }

  await tracker.init();

  // initialize the sync manager
  SyncManager.getInstance();

  // store the activate event
  tracker.trackEditorAction("editor", "activate");

  activateColorKindChangeListener();

  // INIT the plugin data manager
  PluginDataManager.getInstance();

  // initialize preferences
  await initializePreferences();

  const initializedVscodePlugin = getItem("vscode_CtInit");
  if (!initializedVscodePlugin) {
    setItem("vscode_CtInit", true);

    setTimeout(() => {
      commands.executeCommand("codetime.displaySidebar");
    }, 1000);

    // activate the plugin
    softwarePost("/plugins/activate", {}, getItem("jwt"));
  }

  // show the readme if it doesn't exist
  displayReadmeIfNotExists();

  // show the status bar text info
  setTimeout(() => {
    initializeStatusBar();

    // INIT the flow mode state
    initializeFlowModeState();

    SummaryManager.getInstance().updateSessionSummaryFromServer();
  }, 0);
}

export function getCurrentColorKind() {
  if (!currentColorKind) {
    currentColorKind = window.activeColorTheme.kind;
  }
  return currentColorKind;
}

/**
 * Active color theme listener
 */
function activateColorKindChangeListener() {
  currentColorKind = window.activeColorTheme.kind;

  window.onDidChangeActiveColorTheme((event) => {
    let kindChanged = false;
    if (event.kind !== currentColorKind) {
      kindChanged = true;
    }

    currentColorKind = event.kind;
    if (kindChanged) {
      // check if the config panel is showing, update it if so
      if (showingConfigureSettingsPanel()) {
        setTimeout(() => {
          configureSettings();
        }, 500);
      }
    }

    // let the sidebar know the new current color kind
    setTimeout(() => {
      commands.executeCommand("codetime.refreshCodeTimeView");
    }, 250);
  });
}
