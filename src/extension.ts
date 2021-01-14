// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, ExtensionContext, StatusBarAlignment, commands } from "vscode";
import { initializePreferences } from "./DataController";
import { onboardInit } from "./user/OnboardManager";
import {
  nowInSecs,
  getOffsetSeconds,
  getVersion,
  logIt,
  getPluginName,
  getItem,
  displayReadmeIfNotExists,
  setItem,
  deleteFile,
  getSoftwareDataStoreFile,
} from "./Util";
import { manageLiveshareSession } from "./LiveshareManager";
import { getApi } from "vsls";
import { createCommands } from "./command-helper";
import { KpmManager } from "./managers/KpmManager";
import { PluginDataManager } from "./managers/PluginDataManager";
import { setSessionSummaryLiveshareMinutes, updateStatusBarWithSummaryData } from "./storage/SessionSummaryData";
import { WallClockManager } from "./managers/WallClockManager";
import { TrackerManager } from "./managers/TrackerManager";

let TELEMETRY_ON = true;
let statusBarItem = null;
let _ls = null;

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

  if (_ls && _ls.id) {
    // the IDE is closing, send this off
    let nowSec = nowInSecs();
    let offsetSec = getOffsetSeconds();
    let localNow = nowSec - offsetSec;
    // close the session on our end
    _ls["end"] = nowSec;
    _ls["local_end"] = localNow;
    manageLiveshareSession(_ls);
    _ls = null;
  }

  // dispose the new day timer
  PluginDataManager.getInstance().dispose();
  WallClockManager.getInstance().dispose();

  clearInterval(liveshare_update_interval);

  // softwareDelete(`/integrations/${PLUGIN_ID}`, getItem("jwt")).then(resp => {
  //     if (isResponseOk(resp)) {
  //         if (resp.data) {
  //             console.log(`Uninstalled plugin`);
  //         } else {
  //             console.log(
  //                 "Failed to update Code Time about the uninstall event"
  //             );
  //         }
  //     }
  // });
}

export async function activate(ctx: ExtensionContext) {
  // add the code time commands
  ctx.subscriptions.push(createCommands(kpmController));

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

  // INIT the plugin data manager
  PluginDataManager.getInstance();

  // initialize the wall clock timer
  WallClockManager.getInstance();

  // add the interval jobs
  initializeIntervalJobs();

  // initialize preferences
  await initializePreferences();

  initializeLiveshare();

  const initializedVscodePlugin = getItem("vscode_CtInit");
  if (!initializedVscodePlugin) {
    setItem("vscode_CtInit", true);

    setTimeout(() => {
      commands.executeCommand("codetime.displayTree");
    }, 1000);
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
    statusBarItem.command = "codetime.displayTree";
    statusBarItem.show();

    // update the status bar
    updateStatusBarWithSummaryData();
  }, 0);

  // delete the data.json if it exists
  deleteFile(getSoftwareDataStoreFile());
}

// add the interval jobs
function initializeIntervalJobs() {
  // update liveshare in the offline kpm data if it has been initiated
  liveshare_update_interval = setInterval(async () => {
    if (window.state.focused) {
      updateLiveshareTime();
    }
  }, one_min_millis);
}

function updateLiveshareTime() {
  if (_ls) {
    let nowSec = nowInSecs();
    let diffSeconds = nowSec - parseInt(_ls["start"], 10);
    setSessionSummaryLiveshareMinutes(diffSeconds * 60);
  }
}

async function initializeLiveshare() {
  const liveshare = await getApi();
  if (liveshare) {
    // {access: number, id: string, peerNumber: number, role: number, user: json}
    logIt(`liveshare version - ${liveshare["apiVersion"]}`);
    liveshare.onDidChangeSession(async (event) => {
      let nowSec = nowInSecs();
      let offsetSec = getOffsetSeconds();
      let localNow = nowSec - offsetSec;
      if (!_ls) {
        _ls = {
          ...event.session,
        };
        _ls["apiVesion"] = liveshare["apiVersion"];
        _ls["start"] = nowSec;
        _ls["local_start"] = localNow;
        _ls["end"] = 0;

        await manageLiveshareSession(_ls);
      } else if (_ls && (!event || !event["id"])) {
        updateLiveshareTime();
        // close the session on our end
        _ls["end"] = nowSec;
        _ls["local_end"] = localNow;
        await manageLiveshareSession(_ls);
        _ls = null;
      }
    });
  }
}
