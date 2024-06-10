// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {window, ExtensionContext, commands, authentication} from 'vscode';
import {getUser} from './DataController';
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
  getBooleanItem
} from './Util';
import {createCommands} from './command-helper';
import {KpmManager} from './managers/KpmManager';
import {TrackerManager} from './managers/TrackerManager';
import {initializeWebsockets, disposeWebsocketTimeouts} from './websockets';
import {
  initializeStatusBar,
  updateFlowModeStatusBar,
  updateStatusBarWithSummaryData,
} from './managers/StatusBarManager';
import {SummaryManager} from './managers/SummaryManager';
import {SyncManager} from './managers/SyncManger';
import {ChangeStateManager} from './managers/ChangeStateManager';
import {initializeFlowModeState} from './managers/FlowManager';
import { ExtensionManager } from './managers/ExtensionManager';
import { LocalStorageManager } from './managers/LocalStorageManager';
import { setEndOfDayNotification } from './notifications/endOfDay';
import { AUTH_TYPE } from './auth/Auth0AuthenticationProvider';

let currentColorKind: number | undefined = undefined;
let storageManager: LocalStorageManager | undefined = undefined;
let user: any = null;

const tracker: TrackerManager = TrackerManager.getInstance();

//
// Add the keystroke controller to the ext ctx, which
// will then listen for text document changes.
//
const kpmController: KpmManager = KpmManager.getInstance();

export function deactivate(ctx: ExtensionContext) {
  // store the deactivate event
  tracker.trackEditorAction('editor', 'deactivate');

  TrackerManager.getInstance().dispose();
  ChangeStateManager.getInstance().dispose();
  ExtensionManager.getInstance().dispose();

  // dispose the file watchers
  kpmController.dispose();

  if (isPrimaryWindow()) {
    if (storageManager) storageManager.clearDupStorageKeys();
  }

  disposeWebsocketTimeouts();
}

export async function activate(ctx: ExtensionContext) {
  storageManager = LocalStorageManager.getInstance(ctx);
  initializeSession(storageManager);

  // add the code time commands
  ctx.subscriptions.push(createCommands(ctx, kpmController, storageManager));
  TrackerManager.storageMgr = storageManager;

  // session: {id: <String>, accessToken: <String>, account: {label: <String>, id: <Number>}, scopes: [<String>,...]}
  const session = await authentication.getSession(AUTH_TYPE, [], { createIfNone: false });
  let jwt = getItem('jwt');
  if (session) {
    // fetch the user with the non-session jwt to compare
    user = await getUser();
    if (!user || user.email != session.account.label) {
      jwt = session.accessToken;
      // update the local storage with the new user
      setItem('name', session.account.label);
      setItem('jwt', jwt);
      user = await getUser(jwt);
    }
  }

  if (jwt) {
    intializePlugin();
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

export async function intializePlugin() {
  logIt(`Loaded ${getPluginName()} v${getVersion()}`);

  // INIT websockets
  try {
    initializeWebsockets();
  } catch (e: any) {
    logIt(`Failed to initialize websockets: ${e.message}`);
  }

  // INIT keystroke analysis tracker
  await tracker.init();

  // initialize user and preferences
  if (!user) user = await getUser();

  // show the sidebar if this is the 1st
  if (!getBooleanItem('vscode_CtInit')) {
    setItem('vscode_CtInit', true);

    setTimeout(() => {
      commands.executeCommand('codetime.displaySidebar');
    }, 1000);

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

    // INIT extension manager change listener
    ExtensionManager.getInstance().initialize();

    // INIT session summary sync manager
    SyncManager.getInstance();
  }, 3000);

  setTimeout(() => {
    // Set the end of the day notification trigger if it's enabled
    setEndOfDayNotification();
  }, 5000);
}

export function getCurrentColorKind() {
  if (!currentColorKind) {
    currentColorKind = window.activeColorTheme.kind;
  }
  return currentColorKind;
}

function initializeSession(storageManager: LocalStorageManager) {
  if (window.state.focused) {
    setItem('vscode_primary_window', getWorkspaceName());
    if (storageManager) storageManager.clearDupStorageKeys();
  }
}
