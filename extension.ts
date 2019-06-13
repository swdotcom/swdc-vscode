// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, ExtensionContext, StatusBarAlignment } from "vscode";
import {
    sendOfflineData,
    getUserStatus,
    sendHeartbeat,
    createAnonymousUser,
    serverIsAvailable,
    setSessionSummaryLiveshareMinutes
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
    isMusicTime,
    jwtExists,
    showLoginPrompt
} from "./lib/Util";
import { getHistoricalCommits } from "./lib/KpmRepoManager";
import { manageLiveshareSession } from "./lib/LiveshareManager";
import * as vsls from "vsls/vscode";
import { MusicStateManager } from "./lib/music/MusicStateManager";
import { MusicCommandManager } from "./lib/music/MusicCommandManager";
import { createCommands } from "./lib/command-helper";
import { Track, getRunningTrack, setConfig, CodyConfig } from "cody-music";

let TELEMETRY_ON = true;
let statusBarItem = null;
let _ls = null;

let token_check_interval = null;
let historical_commits_interval = null;
let gather_music_interval = null;
let offline_data_interval = null;
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
    clearInterval(offline_data_interval);
    clearInterval(gather_music_interval);

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

    let one_min = 1000 * 60;

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
    }

    if (isMusicTime()) {
        // initialize the music player
        setTimeout(() => {
            MusicCommandManager.initialize();
        }, 1000);
    }

    // every hour, look for repo members
    let hourly_interval = 1000 * 60 * 60;

    if (isCodeTime()) {
        // check on new commits once an hour
        historical_commits_interval = setInterval(async () => {
            let isonline = await serverIsAvailable();
            sendHeartbeat("HOURLY", isonline);
            getHistoricalCommits(isonline);
        }, hourly_interval);

        // every half hour, send offline data
        let offlineInterval = hourly_interval / 2;
        offline_data_interval = setInterval(() => {
            sendOfflineData();
        }, offlineInterval);

        // in 2 minutes fetch the historical commits if any
        setTimeout(() => {
            getHistoricalCommits(serverIsOnline);
        }, one_min * 2);

        // 1 minute interval tasks
        // check if the use has become a registered user
        // if they're already logged on, it will not send a request
        token_check_interval = setInterval(async () => {
            getUserStatus(serverIsOnline);
            updateLiveshareTime();
        }, one_min * 1);
    }

    if (isMusicTime()) {
        // 15 second interval to check music info
        gather_music_interval = setInterval(() => {
            MusicStateManager.getInstance().musicStateCheck();
        }, 1000 * 5);
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
        // initiate kpm fetch by sending any offline data
        setTimeout(() => {
            sendOfflineData();
        }, 1000);

        let codyConfig: CodyConfig = new CodyConfig();
        codyConfig.enableItunesDesktop = false;
        codyConfig.enableSpotifyDesktop = false;
        setConfig(codyConfig);
    } else if (isMusicTime()) {
        let codyConfig: CodyConfig = new CodyConfig();
        codyConfig.enableItunesDesktop = true;
        setConfig(codyConfig);

        const musicstoreMgr: MusicStoreManager = MusicStoreManager.getInstance();

        // this needs to happen first to enable spotify playlist and control logic
        await musicstoreMgr.initializeSpotify();

        let runningTrack: Track = await getRunningTrack();
        musicstoreMgr.runningTrack = runningTrack;
        await musicstoreMgr.syncRunningPlaylists();

        // fetch the favorites every 10 minutes
        setInterval(() => {
            musicstoreMgr.syncPlaylistFavorites();
        }, 1000 * 60 * 10);
        // and once right now
        musicstoreMgr.syncPlaylistFavorites();

        // every 2 minutes reconcile
        setInterval(() => {
            musicstoreMgr.reconcilePlaylists();
        }, 1000 * 60 * 2);
    }
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
