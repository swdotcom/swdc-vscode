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
import { sendOfflineData } from "./lib/DataController";
import {
    showStatus,
    launchWebUrl,
    nowInSecs,
    getOffsetSecends
} from "./lib/Util";
import { getRepoUsers, getHistoricalCommits } from "./lib/KpmRepoManager";
import {
    displayCodeTimeMetricsDashboard,
    showMenuOptions,
    userNeedsToken,
    buildLaunchUrl
} from "./lib/MenuManager";
import { gatherMusicInfo } from "./lib/MusicManager";
import {
    fetchDailyKpmSessionInfo,
    chekUserAuthenticationStatus
} from "./lib/KpmStatsManager";
import { manageLiveshareSession } from "./lib/LiveshareManager";
import * as vsls from "vsls/vscode";

let TELEMETRY_ON = true;
let statusBarItem = null;
let extensionVersion;
let _ls = null;

export function isTelemetryOn() {
    return TELEMETRY_ON;
}

export function getStatusBarItem() {
    return statusBarItem;
}

export function getVersion() {
    return extensionVersion;
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

    // 1 minute interval to fetch daily kpm info
    setInterval(() => {
        fetchDailyKpmSessionInfo();
    }, one_min);

    // 15 second interval to check music info
    setInterval(() => {
        gatherMusicInfo();
    }, 1000 * 15);

    setTimeout(() => {
        // check if the user is authenticated with what is saved in the software config
        chekUserAuthenticationStatus();
    }, 5000);

    // send any offline data
    setTimeout(() => {
        // send any offline data
        sendOfflineData();
    }, 10000);

    // every hour, look for repo members
    let hourly_interval = 1000 * 60 * 60;
    setInterval(() => {
        getRepoUsers();
    }, hourly_interval);

    // fire it off once in 1 minutes
    setTimeout(() => {
        getRepoUsers();
    }, one_min);

    // check on new commits once an hour
    setInterval(() => {
        getHistoricalCommits();
    }, hourly_interval + one_min);

    // fire off the commit gathering in a couple of minutes
    setTimeout(() => {
        getHistoricalCommits();
    }, one_min * 2);

    ctx.subscriptions.push(
        commands.registerCommand("extension.softwareKpmDashboard", () => {
            handleKpmClickedEvent();
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

    initializeLiveshare();
}

function configUpdated(ctx) {
    // the software settings were updated, take action here
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
    let requiresToken = await userNeedsToken();
    let url = await buildLaunchUrl(requiresToken);
    if (requiresToken) {
        setTimeout(() => {
            chekUserAuthenticationStatus();
        }, 1000 * 30);
    }
    launchWebUrl(url);
}

export async function handlePaletteMenuEvent() {
    let requiresToken = await userNeedsToken();
    let url = await buildLaunchUrl(requiresToken);
    if (requiresToken) {
        launchWebUrl(url);

        setTimeout(() => {
            chekUserAuthenticationStatus();
        }, 1000 * 30);
    } else {
        showMenuOptions(requiresToken, false /*showSoftwareGrubOptions*/);
    }
}
