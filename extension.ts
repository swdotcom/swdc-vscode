// Copyright (c) 2018 Software. All Rights Reserved.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
    window,
    workspace,
    ExtensionContext,
    StatusBarAlignment,
    commands,
    extensions
} from "vscode";
import { KpmController } from "./lib/KpmController";
import {
    sendOfflineData,
    createAnonymousUser,
    requiresUserCreation,
    getUserStatus,
    clearUserStatusCache,
    updatePreferences,
    initializePreferences,
    pluginLogout,
    refetchUserStatusLazily
} from "./lib/DataController";
import {
    showStatus,
    launchWebUrl,
    nowInSecs,
    getOffsetSecends,
    getItem,
    getSoftwareSessionFile,
    deleteFile,
    getDashboardFile
} from "./lib/Util";
import { getRepoUsers, getHistoricalCommits } from "./lib/KpmRepoManager";
import {
    displayCodeTimeMetricsDashboard,
    showMenuOptions,
    buildWebDashboardUrl,
    buildSignupUrl,
    buildLoginUrl
} from "./lib/MenuManager";
import { gatherMusicInfo } from "./lib/MusicManager";
import {
    fetchDailyKpmSessionInfo,
    chekUserAuthenticationStatus
} from "./lib/KpmStatsManager";
import { manageLiveshareSession } from "./lib/LiveshareManager";
import * as vsls from "vsls/vscode";

const os = require("os");
const fs = require("fs");

let TELEMETRY_ON = true;
let statusBarItem = null;
let extensionVersion;
let _ls = null;

let token_check_interval = null;
let repo_user_interval = null;
let historical_commits_interval = null;
let gather_music_interval = null;
let kpm_session_info_interval = null;

const LEGACY_VIM_ID = "0q9p7n6m4k2j1VIM54t";

export function isTelemetryOn() {
    return TELEMETRY_ON;
}

export function getStatusBarItem() {
    return statusBarItem;
}

export function getVersion() {
    return extensionVersion;
}

export function getOs() {
    let parts = [];
    let osType = os.type();
    if (osType) {
        parts.push(osType);
    }
    let osRelease = os.release();
    if (osRelease) {
        parts.push(osRelease);
    }
    let platform = os.platform();
    if (platform) {
        parts.push(platform);
    }
    if (parts.length > 0) {
        return parts.join("_");
    }
    return "";
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

    clearInterval(repo_user_interval);
    clearInterval(token_check_interval);
    clearInterval(historical_commits_interval);
    clearInterval(gather_music_interval);
    clearInterval(kpm_session_info_interval);

    // console.log("Code Time: deactivating the plugin");
    // softwareDelete(`/integrations/${PLUGIN_ID}`, getItem("jwt")).then(resp => {
    //     if (isResponseOk(resp)) {
    //         if (resp.data) {
    //             console.log(`Code Time: Uninstalled plugin`);
    //         } else {
    //             console.log(
    //                 "Code Time: Failed to update Code Time about the uninstall event"
    //             );
    //         }
    //     }
    // });
}

export function activate(ctx: ExtensionContext) {
    const extension = extensions.getExtension("softwaredotcom.swdc-vscode")
        .packageJSON;

    extensionVersion = extension.version;
    console.log(`Code Time: Loaded v${extensionVersion}`);

    //
    // Add the keystroke controller to the ext ctx, which
    // will then listen for text document changes.
    //
    const controller = new KpmController();
    ctx.subscriptions.push(controller);

    ctx.subscriptions.push(
        workspace.onDidChangeConfiguration(e => configUpdated(ctx))
    );

    let one_min = 1000 * 60;

    setTimeout(() => {
        statusBarItem = window.createStatusBarItem(
            StatusBarAlignment.Right,
            10
        );
        statusBarItem.tooltip = "Click to see more from Code Time";
        statusBarItem.command = "extension.softwarePaletteMenu";
        statusBarItem.show();

        showStatus("Code Time", null);
        // initiate kpm fetch
        fetchDailyKpmSessionInfo();
    }, 100);

    // 50 second interval to fetch daily kpm info
    kpm_session_info_interval = setInterval(() => {
        fetchDailyKpmSessionInfo();
    }, 1000 * 50);

    // 15 second interval to check music info
    gather_music_interval = setInterval(() => {
        gatherMusicInfo();
    }, 1000 * 15);

    // send any offline data
    setTimeout(() => {
        // send any offline data
        sendOfflineData();
    }, 10000);

    // every hour, look for repo members
    let hourly_interval = 1000 * 60 * 60;
    repo_user_interval = setInterval(() => {
        getRepoUsers();
    }, hourly_interval);

    // fire it off once in 1 minutes
    setTimeout(() => {
        getRepoUsers();
    }, one_min);

    // check on new commits once an hour
    historical_commits_interval = setInterval(() => {
        getHistoricalCommits();
    }, hourly_interval + one_min);

    // fire off the commit gathering in a couple of minutes
    setTimeout(() => {
        getHistoricalCommits();
    }, one_min * 2);

    // every minute and a half, get the user's jwt if they've logged
    // in if they're still not a registered user.
    let ninetysec = one_min + 30;
    token_check_interval = setInterval(() => {
        clearUserStatusCache();
        getUserStatus();
    }, ninetysec);

    ctx.subscriptions.push(
        commands.registerCommand("extension.softwareKpmDashboard", () => {
            handleKpmClickedEvent();
        })
    );
    ctx.subscriptions.push(
        commands.registerCommand("codeTime.superDashboard", () => {
            handleCodeTimeDashboardEvent();
        })
    );
    ctx.subscriptions.push(
        commands.registerCommand("extension.softwarePaletteMenu", () => {
            handlePaletteMenuEvent();
        })
    );
    ctx.subscriptions.push(
        commands.registerCommand("extension.codeTimeMetrics", () => {
            handleCodeTimeDashboardEvent();
        })
    );
    ctx.subscriptions.push(
        commands.registerCommand("extension.viewSoftwareTop40", () => {
            handleViewSoftwareTopSongsEvent();
        })
    );
    ctx.subscriptions.push(
        commands.registerCommand("extension.codeTimeLogout", () => {
            handleCodeTimeLogout();
        })
    );
    ctx.subscriptions.push(
        commands.registerCommand("extension.codeTimeSignup", () => {
            handleCodeTimeSignup();
        })
    );
    ctx.subscriptions.push(
        commands.registerCommand("extension.codeTimeLogin", () => {
            handleCodeTimeLogin();
        })
    );

    initializeLiveshare();

    initializeUserInfo();
}

function configUpdated(ctx) {
    // the software settings were updated, take action here
    updatePreferences();
}

function handlePauseMetricsEvent() {
    TELEMETRY_ON = false;
    showStatus("Code Time Paused", "Enable metrics to resume");
}

function handleEnableMetricsEvent() {
    TELEMETRY_ON = true;
    showStatus("Code Time", null);
}

function handleCodeTimeDashboardEvent() {
    displayCodeTimeMetricsDashboard();
}

function handleViewSoftwareTopSongsEvent() {
    launchWebUrl("https://api.software.com/music/top40");
}

function handleCodeTimeLogout() {
    pluginLogout();
}

async function handleCodeTimeSignup() {
    let signupUrl = await buildSignupUrl();
    launchWebUrl(signupUrl);
    // delete the session.json file
    const dashboardFile = getDashboardFile();
    if (fs.existsSync(dashboardFile)) {
        deleteFile(dashboardFile);
    }
    refetchUserStatusLazily(4);
}

async function handleCodeTimeLogin() {
    let loginUrl = await buildLoginUrl();
    launchWebUrl(loginUrl);
    // delete the session.json file
    const dashboardFile = getDashboardFile();
    if (fs.existsSync(dashboardFile)) {
        deleteFile(dashboardFile);
    }
    // retry 8 times, each retry is 10 seconds long
    refetchUserStatusLazily(8);
}

async function initializeUserInfo() {
    let tokenVal = getItem("token");
    // vim plugin id check
    if (tokenVal && tokenVal === LEGACY_VIM_ID) {
        // delete the session json to re-establish a handshake without the vim token id
        const sessionFile = getSoftwareSessionFile();
        deleteFile(sessionFile);
    }

    if (await requiresUserCreation()) {
        await createAnonymousUser();
    }

    // {loggedIn: true|false, hasAccounts: true|false, hasUserAccounts: true|false}
    let userStatus = await getUserStatus();
    if (userStatus.loggedIn) {
        initializePreferences();
    } else {
        setTimeout(() => {
            chekUserAuthenticationStatus();
        }, 8000);
    }
}

async function initializeLiveshare() {
    const liveshare = await vsls.getApi();
    if (liveshare) {
        // {access: number, id: string, peerNumber: number, role: number, user: json}

        console.log(
            `Code Time: liveshare version - ${liveshare["apiVersion"]}`
        );
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

export async function handleKpmClickedEvent() {
    // {loggedIn: true|false, hasAccounts: true|false, hasUserAccounts: true|false}
    let userStatus = await getUserStatus();
    let webUrl = await buildWebDashboardUrl();
    if (!userStatus.loggedIn && userStatus.hasUserAccounts) {
        webUrl = await buildLoginUrl();
    } else if (!userStatus.loggedIn) {
        webUrl = await buildSignupUrl();
    }
    launchWebUrl(webUrl);
}

export async function handlePaletteMenuEvent() {
    showMenuOptions();
}
