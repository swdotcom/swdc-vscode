// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {window, ExtensionContext, commands} from 'vscode';
import {initializePreferences} from './DataController';
import {onboardInit} from './user/OnboardManager';
import {
  getVersion,
  logIt,
  getPluginName,
  getItem,
  setItem,
  getWorkspaceName,
  isPrimaryWindow,
  displayReadme,
  getRandomNumberWithinRange,
} from './Util';
import {createCommands} from './command-helper';
import {KpmManager} from './managers/KpmManager';
import {TrackerManager} from './managers/TrackerManager';
import {initializeWebsockets, disposeWebsocketTimeouts} from './websockets';
import {softwarePost} from './http/HttpClient';
import {
  initializeStatusBar,
  updateFlowModeStatusBar,
  updateStatusBarWithSummaryData,
} from './managers/StatusBarManager';
import {SummaryManager} from './managers/SummaryManager';
import {SyncManager} from './managers/SyncManger';
import {ChangeStateManager} from './managers/ChangeStateManager';
import {initializeFlowModeState} from './managers/FlowManager';

let TELEMETRY_ON = true;
let currentColorKind: number | undefined = undefined;

const tracker: TrackerManager = TrackerManager.getInstance();

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
  tracker.trackEditorAction('editor', 'deactivate');

  TrackerManager.getInstance().dispose();
  ChangeStateManager.getInstance().dispose();

  // dispose the file watchers
  kpmController.dispose();

  disposeWebsocketTimeouts();
}

export async function activate(ctx: ExtensionContext) {
  if (window.state.focused) {
    setItem('vscode_ct_primary_window', getWorkspaceName());
  }

  // add the code time commands
  ctx.subscriptions.push(createCommands(ctx, kpmController));

  if (getItem("jwt")) {
    intializePlugin(ctx, false);
  } else if (window.state.focused) {
    onboardInit(ctx, intializePlugin /*successFunction*/);
  } else {
    // 5 to 10 second delay
    const secondDelay = getRandomNumberWithinRange(6, 10);
    setTimeout(() => {
      onboardInit(ctx, intializePlugin /*successFunction*/);
    }, 1000 * secondDelay);
  }
}

export async function intializePlugin(ctx: ExtensionContext, createdAnonUser: boolean) {
  logIt(`Loaded ${getPluginName()} v${getVersion()}`);

  // INIT websockets
  try {
    initializeWebsockets();
  } catch (e: any) {
    logIt(`Failed to initialize websockets: ${e.message}`);
  }

  // INIT keystroke analysis tracker
  await tracker.init();

  // INIT preferences
  initializePreferences();

  // show the sidebar if this is the 1st
  const initializedVscodePlugin = getItem('vscode_CtInit');
  if (!initializedVscodePlugin) {
    setItem('vscode_CtInit', true);

    setTimeout(() => {
      commands.executeCommand('codetime.displaySidebar');
    }, 1000);

    // activate the plugin
    softwarePost('/plugins/activate', {}, getItem('jwt'));

    displayReadme();
  }

  initializeStatusBar();

  if (isPrimaryWindow()) {
    // store the activate event
    tracker.trackEditorAction('editor', 'activate');
    // it's the primary window. initialize flow mode and session summary information
    initializeFlowModeState();
    SummaryManager.getInstance().updateSessionSummaryFromServer();
  } else {
    // it's a secondary window. update the statusbar
    updateFlowModeStatusBar();
    updateStatusBarWithSummaryData();
  }

  setTimeout(() => {
    // INIT doc change events
    ChangeStateManager.getInstance();

    // INIT session summary sync manager
    SyncManager.getInstance();
  }, 1000);
}

export function getCurrentColorKind() {
  if (!currentColorKind) {
    currentColorKind = window.activeColorTheme.kind;
  }
  return currentColorKind;
}
