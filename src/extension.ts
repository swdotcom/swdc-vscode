// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {window, ExtensionContext, commands} from 'vscode';
import {initializePreferences} from './DataController';
import {onboardInit} from './user/OnboardManager';
import {getVersion, logIt, getPluginName, getItem, displayReadmeIfNotExists, setItem, getWorkspaceName} from './Util';
import {createCommands} from './command-helper';
import {KpmManager} from './managers/KpmManager';
import {TrackerManager} from './managers/TrackerManager';
import {initializeWebsockets, clearWebsocketConnectionRetryTimeout} from './websockets';
import {softwarePost} from './http/HttpClient';
import {initializeStatusBar} from './managers/StatusBarManager';
import {SummaryManager} from './managers/SummaryManager';
import {SyncManager} from './managers/SyncManger';
import {LocalStorageManager} from './managers/LocalStorageManager';
import {ChangeStateManager} from './managers/ChangeStateManager';
import { initializeFlowModeState } from './managers/FlowManager';

let TELEMETRY_ON = true;
let currentColorKind: number | undefined = undefined;

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
  tracker.trackEditorAction('editor', 'deactivate');

  TrackerManager.getInstance().dispose();
  ChangeStateManager.getInstance().dispose();

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

export function getLocalStorageValue(key: string) {
  return localStorage.getValue(key);
}

export function setLocalStorageValue(key: string, value: any) {
  localStorage.setValue(key, value);
}

function getRandomArbitrary(min: any, max: any) {
  max = max + 0.1;
  return parseInt(Math.random() * (max - min) + min, 10);
}

export async function intializePlugin(ctx: ExtensionContext, createdAnonUser: boolean) {
  logIt(`Loaded ${getPluginName()} v${getVersion()}`);

  // INIT websockets
  try {
    initializeWebsockets();
  } catch (e) {
    console.error('Failed to initialize websockets', e);
  }

  // INIT keystroke analysis tracker
  await tracker.init();

  // INIT session summary sync manager
  SyncManager.getInstance();

  // INIT doc change events
  ChangeStateManager.getInstance();

  // INIT preferences
  await initializePreferences();

  // show the sidebar if this is the 1st
  const initializedVscodePlugin = getItem('vscode_CtInit');
  if (!initializedVscodePlugin) {
    setItem('vscode_CtInit', true);

    setTimeout(() => {
      commands.executeCommand('codetime.displaySidebar');
    }, 1000);

    // activate the plugin
    softwarePost('/plugins/activate', {}, getItem('jwt'));
  }

  // show the readme if it doesn't exist
  displayReadmeIfNotExists();

  // show the status bar text info
  setTimeout(async () => {
    // INIT the status bar
    await initializeStatusBar();

    // INIT flow mode state
    initializeFlowModeState();

    SummaryManager.getInstance().updateSessionSummaryFromServer();
  }, 0);

  // store the activate event
  tracker.trackEditorAction('editor', 'activate');
}

export function getCurrentColorKind() {
  if (!currentColorKind) {
    currentColorKind = window.activeColorTheme.kind;
  }
  return currentColorKind;
}
