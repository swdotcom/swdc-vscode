// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, ExtensionContext, StatusBarAlignment, commands } from "vscode";
import { initializePreferences } from "./DataController";
import { onboardInit } from "./user/OnboardManager";
import { nowInSecs, getOffsetSeconds, getVersion, logIt, getPluginName, getItem, displayReadmeIfNotExists, setItem } from "./Util";
import { getApi } from "vsls";
import { createCommands } from "./command-helper";
import { KpmManager } from "./managers/KpmManager";
import { PluginDataManager } from "./managers/PluginDataManager";
import { updateStatusBarWithSummaryData } from "./storage/SessionSummaryData";
import { WallClockManager } from "./managers/WallClockManager";
import { TrackerManager } from "./managers/TrackerManager";
import { initializeWebsockets, clearWebsocketConnectionRetryTimeout } from "./websockets";
import { softwarePost } from "./http/HttpClient";
import { configureSettings, showingConfigureSettingsPanel } from "./managers/ConfigManager";

let TELEMETRY_ON = true;
let statusBarItem = null;
let _ls = null;
let currentColorKind: number = undefined;
let liveshare_update_interval = null;

const one_min_millis = 1000 * 60;

const tracker: TrackerManager = TrackerManager.getInstance();

//
// Add the keystroke controller to the ext ctx, which
// will then listen for text document changes.
//
const kpmController: KpmManager = KpmManager.getInstance();

export function isTelemetryOn() {
  return TELEMETRY_ON;
}

export function getStatusBarItem() {
  return statusBarItem;
}

export function deactivate(ctx: ExtensionContext) {
  // Process this window's keystroke data since the window has become unfocused/deactivated
  commands.executeCommand("codetime.processKeystrokeData");

  // store the deactivate event
  tracker.trackEditorAction("editor", "deactivate");

  // dispose the new day timer
  PluginDataManager.getInstance().dispose();
  WallClockManager.getInstance().dispose();

  clearInterval(liveshare_update_interval);

  clearWebsocketConnectionRetryTimeout();
}

export async function activate(ctx: ExtensionContext) {
  // add the code time commands
  ctx.subscriptions.push(createCommands(ctx, kpmController));

  // onboard the user as anonymous if it's being installed
  if (window.state.focused) {
    onboardInit(ctx, intializePlugin /*successFunction*/);
  } else {
    // 9 to 20 second delay
    const secondDelay = getRandomArbitrary(9, 20);
    // initialize in 5 seconds if this is the secondary window
    setTimeout(() => {
      onboardInit(ctx, intializePlugin /*successFunction*/);
    }, 1000 * secondDelay);
  }
}

function getRandomArbitrary(min, max) {
  max = max + 0.1;
  return parseInt(Math.random() * (max - min) + min, 10);
}

export async function intializePlugin(ctx: ExtensionContext, createdAnonUser: boolean) {
  logIt(`Loaded ${getPluginName()} v${getVersion()}`);
  await tracker.init();

  // store the activate event
  tracker.trackEditorAction("editor", "activate");

  activateColorKindChangeListener();

  // INIT the plugin data manager
  PluginDataManager.getInstance();

  // initialize the wall clock timer
  WallClockManager.getInstance();

  // initialize preferences
  await initializePreferences();

  try {
    initializeWebsockets();
  } catch (e) {
    console.error("Failed to initialize websockets", e);
  }

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
    statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 10);
    // add the name to the tooltip if we have it
    const name = getItem("name");
    let tooltip = "Click to see more from Code Time";
    if (name) {
      tooltip = `${tooltip} (${name})`;
    }
    statusBarItem.tooltip = tooltip;
    statusBarItem.command = "codetime.displaySidebar";
    statusBarItem.show();

    // update the status bar
    updateStatusBarWithSummaryData();
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
