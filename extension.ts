// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, ExtensionContext, StatusBarAlignment, commands } from "vscode";
import {
    getUserStatus,
    sendHeartbeat,
    initializePreferences
} from "./lib/DataController";
import { onboardPlugin, createAnonymousUser } from "./lib/user/OnboardManager";
import {
    showStatus,
    nowInSecs,
    getOffsetSecends,
    getVersion,
    softwareSessionFileExists,
    logIt,
    jwtExists,
    showLoginPrompt,
    getPluginName,
    getItem,
    displayReadmeIfNotExists,
    setItem
} from "./lib/Util";
import { serverIsAvailable } from "./lib/http/HttpClient";
import { getHistoricalCommits } from "./lib/repo/KpmRepoManager";
import { manageLiveshareSession } from "./lib/LiveshareManager";
import * as vsls from "vsls/vscode";
import { createCommands } from "./lib/command-helper";
import { KpmController } from "./lib/event/KpmController";
import { SummaryManager } from "./lib/controller/SummaryManager";
import { PayloadManager } from "./lib/controller/PayloadManager";
import {
    setSessionSummaryLiveshareMinutes,
    getSessionSummaryData
} from "./lib/storage/SessionSummaryData";
import { SessionSummary } from "./lib/model/models";

let TELEMETRY_ON = true;
let statusBarItem = null;
let _ls = null;

let token_check_interval = null;
let liveshare_update_interval = null;
let historical_commits_interval = null;
let gather_music_interval = null;
let offline_data_interval = null;
let session_check_interval = null;

//
// Add the keystroke controller to the ext ctx, which
// will then listen for text document changes.
//
const kpmController = KpmController.getInstance();

export function isTelemetryOn() {
    return TELEMETRY_ON;
}

export function getStatusBarItem() {
    return statusBarItem;
}

export function deactivate(ctx: ExtensionContext) {
    if (_ls && _ls.id) {
        // the IDE is closing, send this off
        let nowSec = nowInSecs();
        let offsetSec = getOffsetSecends();
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
    clearInterval(gather_music_interval);
    clearInterval(session_check_interval);

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

    const serverIsOnline = await serverIsAvailable();

    // get the user preferences whether it's music time or code time
    // this will also fetch the user and update loggedInCacheState if it's found
    await initializePreferences(serverIsOnline);

    let one_min_ms = 1000 * 60;

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
        statusBarItem.command = "codetime.softwarePaletteMenu";
        statusBarItem.show();

        showStatus("Code Time", null);
    }, 0);

    // update the status bar
    setTimeout(() => {
        const summaryData: SessionSummary = getSessionSummaryData();
        const forceFetch = summaryData.currentDayMinutes === 0 ? true : false;
        SummaryManager.getInstance().getSessionSummaryStatus(forceFetch);
    }, 1000);

    // every hour, look for repo members
    let hourly_interval_ms = 1000 * 60 * 60;

    // 35 min interval to check if the session file exists or not
    session_check_interval = setInterval(() => {
        periodicSessionCheck();
    }, 1000 * 60 * 60);

    // add the interval jobs

    // check on new commits every 45 minutes
    historical_commits_interval = setInterval(async () => {
        const isonline = await serverIsAvailable();
        getHistoricalCommits(isonline);
        commands.executeCommand("codetime.refreshCommitTree");
    }, 1000 * 60 * 30);

    // send heartbeats every 2 hours
    setInterval(async () => {
        const isonline = await serverIsAvailable();
        sendHeartbeat("HOURLY", isonline);

        // in for testing, take out when done testing
        await PayloadManager.getInstance().sendOfflineEvents();
    }, hourly_interval_ms * 2);

    // every half hour, send offline data
    const half_hour_ms = hourly_interval_ms / 2;
    offline_data_interval = setInterval(async () => {
        await PayloadManager.getInstance().sendOfflineData();
        await PayloadManager.getInstance().sendOfflineEvents();
    }, half_hour_ms);

    // in 2 minutes fetch the historical commits if any
    setTimeout(() => {
        getHistoricalCommits(serverIsOnline);
    }, one_min_ms * 2);

    // 10 minute interval tasks
    // check if the use has become a registered user
    // if they're already logged on, it will not send a request
    token_check_interval = setInterval(async () => {
        if (window.state.focused) {
            const name = getItem("name");
            // but only if checkStatus is true
            if (!name) {
                getUserStatus(serverIsOnline);
            }
        }
    }, one_min_ms * 10);

    // update liveshare in the offline kpm data if it has been initiated
    liveshare_update_interval = setInterval(async () => {
        if (window.state.focused) {
            updateLiveshareTime();
        }
    }, one_min_ms * 1);

    initializeLiveshare();

    // {loggedIn: true|false}
    await getUserStatus(serverIsOnline, true);

    const initializedVscodePlugin = getItem("vscodeCtInit");
    if (!initializedVscodePlugin) {
        setItem("vscodeCtInit", true);
        kpmController.buildBootstrapKpmPayload();
        // send a heartbeat that the plugin as been installed
        // (or the user has deleted the session.json and restarted the IDE)
        sendHeartbeat("INSTALLED", serverIsOnline);
    } else {
        // send a heartbeat
        sendHeartbeat("INITIALIZED", serverIsOnline);
    }

    if (createdAnonUser) {
        showLoginPrompt();
    }

    // show the readme if it doesn't exist
    displayReadmeIfNotExists();
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
        liveshare.onDidChangeSession(async event => {
            let nowSec = nowInSecs();
            let offsetSec = getOffsetSecends();
            let localNow = nowSec - offsetSec;
            if (!_ls) {
                _ls = {
                    ...event.session
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

async function periodicSessionCheck() {
    const serverIsOnline = await serverIsAvailable();
    if (serverIsOnline && (!softwareSessionFileExists() || !jwtExists())) {
        // session file doesn't exist
        // create the anon user
        let createdJwt = await createAnonymousUser(serverIsOnline);
        if (createdJwt) {
            await getUserStatus(serverIsOnline);
        }
    }
}
