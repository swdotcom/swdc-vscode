// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, ExtensionContext, StatusBarAlignment } from "vscode";
import {
    sendOfflineData,
    getUserStatus,
    sendHeartbeat,
    createAnonymousUser,
    serverIsAvailable
} from "./lib/DataController";
import { MusicStoreManager } from "./lib/music/MusicStoreManager";
import {
    showStatus,
    nowInSecs,
    getOffsetSecends,
    getVersion,
    softwareSessionFileExists,
    showOfflinePrompt,
    logIt,
    isCodeTime,
    codeTimeExtInstalled,
    isMusicTime,
    jwtExists
} from "./lib/Util";
import { getHistoricalCommits } from "./lib/KpmRepoManager";
import {
    fetchDailyKpmSessionInfo,
    showLoginPrompt
} from "./lib/KpmStatsManager";
import { manageLiveshareSession } from "./lib/LiveshareManager";
import * as vsls from "vsls/vscode";
import { MusicCommandManager } from "./lib/music/MusicCommandManager";
import { createCommands } from "./lib/command-helper";

let TELEMETRY_ON = true;
let statusBarItem = null;
let _ls = null;

let token_check_interval = null;
let historical_commits_interval = null;
let gather_music_interval = null;
let kpm_session_info_interval = null;
let kpmController = null;

const check_online_interval_ms = 1000 * 60 * 10;

let retry_counter = 0;
let secondary_window_activate_counter = 0;

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
    clearInterval(historical_commits_interval);
    clearInterval(gather_music_interval);
    clearInterval(kpm_session_info_interval);

    // console.log("deactivating the plugin");
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
    let windowState = window.state;
    // check if window state is focused or not and the
    // secondary_window_activate_counter is equal to zero
    if (!windowState.focused && secondary_window_activate_counter === 0) {
        // This window is not focused, call activate in 1 minute in case
        // there's another vscode editor that is focused. Allow that one
        // to activate right away.
        setTimeout(() => {
            secondary_window_activate_counter++;
            activate(ctx);
        }, 1000 * 5);
    } else {
        // check session.json existence
        const serverIsOnline = await serverIsAvailable();
        if (!softwareSessionFileExists() || !jwtExists()) {
            // session file doesn't exist
            // check if the server is online before creating the anon user
            if (!serverIsOnline) {
                if (retry_counter === 0) {
                    showOfflinePrompt(true);
                }
                // call activate again later
                setTimeout(() => {
                    retry_counter++;
                    activate(ctx);
                }, check_online_interval_ms);
            } else {
                // create the anon user
                const result = await createAnonymousUser(serverIsOnline);
                if (!result) {
                    if (retry_counter === 0) {
                        showOfflinePrompt(true);
                    }
                    // call activate again later
                    setTimeout(() => {
                        retry_counter++;
                        activate(ctx);
                    }, check_online_interval_ms);
                } else {
                    intializePlugin(ctx, true);
                }
            }
        } else {
            // has a session file, continue with initialization of the plugin
            intializePlugin(ctx, false);
        }
    }
}

export async function intializePlugin(
    ctx: ExtensionContext,
    createdAnonUser: boolean
) {
    logIt(`Loaded v${getVersion()}`);

    let serverIsOnline = await serverIsAvailable();

    // initialize the music player
    setTimeout(() => {
        MusicCommandManager.initialize();
    }, 1000);

    let one_min = 1000 * 60;
    let userStatusInterval = 1000 * 120;

    if (isCodeTime()) {
        // only code time will show the status bar text info
        setTimeout(() => {
            statusBarItem = window.createStatusBarItem(
                StatusBarAlignment.Right,
                10
            );
            statusBarItem.tooltip = "Click to see more from Code Time";
            statusBarItem.command = "extension.softwarePaletteMenu";
            statusBarItem.show();

            showStatus("Code Time", null);
        }, 100);

        // 5 minute kpm session info fetch in case the user
        // is offline then backonline, we'll then be able to fetch
        // the data again
        let kpmFetchInterval = one_min * 5;
        kpm_session_info_interval = setInterval(() => {
            fetchDailyKpmSessionInfo();
        }, kpmFetchInterval);
    }

    // 15 second interval to check music info
    gather_music_interval = setInterval(() => {
        MusicCommandManager.stateCheckHandler();
    }, 1000 * 5);

    // send any offline data
    setTimeout(() => {
        // send any offline data
        sendOfflineData();
    }, 1000 * 10);

    // every hour, look for repo members
    let hourly_interval = 1000 * 60 * 60;

    if (isCodeTime() || !codeTimeExtInstalled()) {
        // check on new commits once an hour
        historical_commits_interval = setInterval(async () => {
            let isonline = await serverIsAvailable();
            sendHeartbeat("HOURLY", isonline);
            getHistoricalCommits(isonline);
        }, hourly_interval);

        // fire off the hourly jobs like
        // commit gathering in a couple of minutes
        // for initialization
        let two_min = one_min * 2;
        setTimeout(() => {
            getHistoricalCommits(serverIsOnline);
        }, two_min);

        // every minute and a half, get the user's jwt if they've logged
        // in if they're still not a registered user.
        token_check_interval = setInterval(async () => {
            getUserStatus(serverIsOnline);
        }, userStatusInterval);
    }

    // add the player commands
    ctx.subscriptions.push(createCommands());

    initializeLiveshare();
    initializeUserInfo(createdAnonUser, serverIsOnline);
}

function handlePauseMetricsEvent() {
    TELEMETRY_ON = false;
    showStatus("Code Time Paused", "Enable metrics to resume");
}

function handleEnableMetricsEvent() {
    TELEMETRY_ON = true;
    showStatus("Code Time", null);
}

async function initializeUserInfo(
    createdAnonUser: boolean,
    serverIsOnline: boolean
) {
    // {loggedIn: true|false}
    await getUserStatus(serverIsOnline);
    if (createdAnonUser) {
        showLoginPrompt();
        if (kpmController) {
            kpmController.buildBootstrapKpmPayload();
        }
        // send a heartbeat that the plugin as been installed
        // (or the user has deleted the session.json and restarted the IDE)
        sendHeartbeat("INSTALLED", serverIsOnline);
    } else {
        // send a heartbeat
        sendHeartbeat("INITIALIZED", serverIsOnline);
    }

    if (isCodeTime()) {
        // initiate kpm fetch
        setTimeout(() => {
            fetchDailyKpmSessionInfo();
        }, 1000);
    } else if (isMusicTime()) {
        MusicStoreManager.getInstance().initializeSpotify();

        // fetch the favorites every 10 minutes
        setInterval(() => {
            MusicStoreManager.getInstance().syncPlaylistFavorites();
        }, 1000 * 60 * 10);
        // and once right now
        MusicStoreManager.getInstance().syncPlaylistFavorites();

        // sync the spotify playlist and what's on software every 15 seconds
        setInterval(() => {
            MusicStoreManager.getInstance().syncPairedPlaylists();
        }, 1000 * 15);
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
                // close the session on our end
                _ls["end"] = nowSec;
                _ls["local_end"] = localNow;
                await manageLiveshareSession(_ls);
                _ls = null;
            }
        });
    }
}
