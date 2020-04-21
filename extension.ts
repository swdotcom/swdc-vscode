// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, ExtensionContext, StatusBarAlignment, commands } from "vscode";
import {
    isLoggedIn,
    sendHeartbeat,
    initializePreferences,
} from "./lib/DataController";
import { onboardPlugin } from "./lib/user/OnboardManager";
import {
    showStatus,
    nowInSecs,
    getOffsetSeconds,
    getVersion,
    logIt,
    getPluginName,
    getItem,
    displayReadmeIfNotExists,
    setItem,
} from "./lib/Util";
import { serverIsAvailable } from "./lib/http/HttpClient";
import {
    getHistoricalCommits,
    processRepoUsersForWorkspace,
} from "./lib/repo/KpmRepoManager";
import { manageLiveshareSession } from "./lib/LiveshareManager";
import * as vsls from "vsls/vscode";
import { createCommands } from "./lib/command-helper";
import { KpmManager } from "./lib/managers/KpmManager";
import { SummaryManager } from "./lib/managers/SummaryManager";
import {
    setSessionSummaryLiveshareMinutes,
    updateStatusBarWithSummaryData,
} from "./lib/storage/SessionSummaryData";
import { WallClockManager } from "./lib/managers/WallClockManager";
import { EventManager } from "./lib/managers/EventManager";
import {
    sendOfflineEvents,
    updateLastSavedKeystrokesStats,
} from "./lib/managers/FileManager";

let TELEMETRY_ON = true;
let statusBarItem = null;
let _ls = null;

let token_check_interval = null;
let liveshare_update_interval = null;
let historical_commits_interval = null;
let offline_data_interval = null;
let user_status_check_interval = null;

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
    // store the deactivate event
    EventManager.getInstance().createCodeTimeEvent(
        "resource",
        "unload",
        "EditorDeactivate"
    );

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

    clearInterval(token_check_interval);
    clearInterval(liveshare_update_interval);
    clearInterval(historical_commits_interval);
    clearInterval(offline_data_interval);

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
    onboardPlugin(ctx, intializePlugin /*successFunction*/);
}

export async function intializePlugin(
    ctx: ExtensionContext,
    createdAnonUser: boolean
) {
    logIt(`Loaded ${getPluginName()} v${getVersion()}`);

    // store the activate event
    EventManager.getInstance().createCodeTimeEvent(
        "resource",
        "load",
        "EditorActivate"
    );

    // initialize the wall clock timer
    WallClockManager.getInstance();

    const serverIsOnline = await serverIsAvailable();

    // get the user preferences whether it's music time or code time
    // this will also fetch the user and update loggedInCacheState if it's found
    await initializePreferences(serverIsOnline);

    let one_min_ms = 1000 * 60;

    // every hour, look for repo members
    let hourly_interval_ms = 1000 * 60 * 60;

    // add the interval jobs

    // every 50 minutes check repo members
    setInterval(() => {
        processRepoUsersForWorkspace();
    }, 1000 * 60 * 15);

    // every 45 minute tasks
    historical_commits_interval = setInterval(async () => {
        const isonline = await serverIsAvailable();
        getHistoricalCommits(isonline);
        commands.executeCommand("codetime.refreshKpmTree");
    }, 1000 * 60 * 15);

    // every 40 minute tasks
    historical_commits_interval = setInterval(async () => {
        sendOfflineEvents();
    }, 1000 * 60 * 30);

    // every hour tasks
    setInterval(async () => {
        const isonline = await serverIsAvailable();
        sendHeartbeat("HOURLY", isonline);
    }, hourly_interval_ms);

    // every 15 minute tasks
    const half_hour_ms = hourly_interval_ms / 2;
    offline_data_interval = setInterval(async () => {
        commands.executeCommand("codetime.sendOfflineData");
    }, half_hour_ms / 2);

    // update the last saved keystrokes in memory
    updateLastSavedKeystrokesStats();

    // in 1 minute task
    setTimeout(() => {
        commands.executeCommand("codetime.sendOfflineData");
    }, one_min_ms);

    // in 2 minutes task
    setTimeout(() => {
        getHistoricalCommits(serverIsOnline);
    }, one_min_ms * 2);

    // in 3 minutes task
    setTimeout(() => {
        // check for repo users
        processRepoUsersForWorkspace();
    }, one_min_ms * 3);

    // in 4 minutes task
    setTimeout(() => {
        sendOfflineEvents();
    }, one_min_ms * 4);

    // 15 minute interval tasks
    // check if the use has become a registered user
    // if they're already logged on, it will not send a request
    token_check_interval = setInterval(async () => {
        if (window.state.focused) {
            const name = getItem("name");
            // but only if checkStatus is true
            if (!name) {
                isLoggedIn();
            }
        }
    }, one_min_ms * 15);

    // update liveshare in the offline kpm data if it has been initiated
    liveshare_update_interval = setInterval(async () => {
        if (window.state.focused) {
            updateLiveshareTime();
        }
    }, one_min_ms * 1);

    initializeLiveshare();

    // {loggedIn: true|false}
    const loggedIn: boolean = await isLoggedIn();

    const initializedVscodePlugin = getItem("vscode_CtInit");
    if (!initializedVscodePlugin) {
        setItem("vscode_CtInit", true);

        // send a bootstrap kpm payload
        kpmController.buildBootstrapKpmPayload();

        // send a heartbeat that the plugin as been installed
        // (or the user has deleted the session.json and restarted the IDE)
        sendHeartbeat("INSTALLED", serverIsOnline);

        setTimeout(() => {
            commands.executeCommand("codetime.displayTree");
        }, 1200);
    }

    // initialize the day check timer
    SummaryManager.getInstance().updateSessionSummaryFromServer();

    // show the readme if it doesn't exist
    displayReadmeIfNotExists();

    if (!loggedIn) {
        // create a 35 min interval to check if a user is logged in
        // or not, but only if they're still an anon user
        user_status_check_interval = setInterval(() => {
            const name = getItem("name");
            if (!name) {
                isLoggedIn();
            }
        }, one_min_ms * 35);
    }

    // show the status bar text info
    setTimeout(() => {
        statusBarItem = window.createStatusBarItem(
            StatusBarAlignment.Right,
            10
        );
        // add the name to the tooltip if we have it
        const name = getItem("name");
        let tooltip = "Click to see more from Code Time";
        if (name) {
            tooltip = `${tooltip} (${name})`;
        }
        statusBarItem.tooltip = tooltip;
        // statusBarItem.command = "codetime.softwarePaletteMenu";
        statusBarItem.command = "codetime.displayTree";
        statusBarItem.show();

        // update the status bar
        updateStatusBarWithSummaryData();
    }, 0);
}

function handlePauseMetricsEvent() {
    TELEMETRY_ON = false;
    showStatus("Code Time Paused", "Enable metrics to resume");
}

function handleEnableMetricsEvent() {
    TELEMETRY_ON = true;
    showStatus("Code Time", null);
}

function updateLiveshareTime() {
    if (_ls) {
        let nowSec = nowInSecs();
        let diffSeconds = nowSec - parseInt(_ls["start"], 10);
        setSessionSummaryLiveshareMinutes(diffSeconds * 60);
    }
}

async function initializeLiveshare() {
    const liveshare = await vsls.getApi();
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
