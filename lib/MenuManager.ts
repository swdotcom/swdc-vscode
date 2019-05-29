import { window, workspace, QuickPickOptions, ViewColumn } from "vscode";
import {
    launchWebUrl,
    getItem,
    getDashboardFile,
    isLinux,
    toggleStatusBar,
    buildLoginUrl,
    logIt,
    nowInSecs
} from "./Util";
import { softwareGet, isResponseOk } from "./HttpClient";
import {
    getUserStatus,
    refetchUserStatusLazily,
    serverIsAvailable
} from "./DataController";
import { launch_url, LOGIN_LABEL } from "./Constants";

const fs = require("fs");

const NO_DATA = "CODE TIME\n\nNo data available\n";
const SERVICE_NOT_AVAIL =
    "Our service is temporarily unavailable.\n\nPlease try again later.\n";

let showMusicMetrics = false;
let lastDashboardFetchTime = 0;

/**
 * fetch the show music metrics flag
 */
export function updateShowMusicMetrics(val) {
    showMusicMetrics = val;
}

/**
 * Pass in the following array of objects
 * options: {placeholder, items: [{label, description, url, detail, tooltip},...]}
 */

export function showQuickPick(pickOptions) {
    if (!pickOptions || !pickOptions["items"]) {
        return;
    }
    let options: QuickPickOptions = {
        onDidSelectItem: item => {
            window.setStatusBarMessage(item["label"]);
        },
        matchOnDescription: false,
        matchOnDetail: false,
        placeHolder: pickOptions.placeholder || ""
    };
    window.showQuickPick(pickOptions.items, options).then(async item => {
        if (item) {
            let url = item["url"];
            let uri = item["uri"];
            let cb = item["cb"];
            if (url) {
                launchWebUrl(url);
            }
            if (cb) {
                cb();
            }
        }
    });
}

export async function buildWebDashboardUrl() {
    return launch_url;
}

export async function showMenuOptions() {
    let serverIsOnline = await serverIsAvailable();
    // {loggedIn: true|false}
    let userStatus = await getUserStatus(serverIsOnline);

    // {placeholder, items: [{label, description, url, details, tooltip},...]}
    let kpmMenuOptions = {
        items: []
    };

    kpmMenuOptions.items.push({
        label: "Code time dashboard",
        description: "",
        detail: "View your latest coding metrics right here in your editor",
        url: null,
        cb: displayCodeTimeMetricsDashboard
    });

    if (userStatus.loggedIn && showMusicMetrics) {
        kpmMenuOptions.items.push({
            label: "Software top 40",
            description: "",
            detail:
                "Top 40 most popular songs developers around the world listen to as they code",
            url: "https://api.software.com/music/top40",
            cb: null
        });
    }
    let loginMsgDetail =
        "To see your coding data in Code Time, please log in to your account";
    if (!serverIsOnline) {
        loginMsgDetail =
            "Our service is temporarily unavailable. Please try again later.";
    }
    if (!userStatus.loggedIn) {
        kpmMenuOptions.items.push({
            label: LOGIN_LABEL,
            description: "",
            detail: loginMsgDetail,
            url: null,
            cb: launchLogin
        });
    } else {
        kpmMenuOptions.items.push({
            label: "Web dashboard",
            description: "",
            detail: "See rich data visualizations in the web app",
            url: null,
            cb: launchWebDashboardView
        });
    }
    kpmMenuOptions.items.push({
        label: "Show/hide status bar metrics",
        description: "",
        detail: "Toggle the Code Time status bar metrics",
        url: null,
        cb: toggleStatusBar
    });

    showQuickPick(kpmMenuOptions);
}

export async function launchWebDashboardView() {
    let webUrl = await buildWebDashboardUrl();
    launchWebUrl(`${webUrl}/login`);
}

export async function launchLogin() {
    let loginUrl = await buildLoginUrl();
    launchWebUrl(loginUrl);
    refetchUserStatusLazily();
}

export async function fetchCodeTimeMetricsDashboard() {
    let filePath = getDashboardFile();

    let nowSec = nowInSecs();
    let diff = nowSec - lastDashboardFetchTime;
    if (lastDashboardFetchTime === 0 || diff > 60) {
        lastDashboardFetchTime = nowInSecs();

        logIt("retrieving dashboard metrics");

        let showMusicMetrics = workspace
            .getConfiguration()
            .get("showMusicMetrics");
        let showGitMetrics = workspace.getConfiguration().get("showGitMetrics");
        let showWeeklyRanking = workspace
            .getConfiguration()
            .get("showWeeklyRanking");

        const dashboardSummary = await softwareGet(
            `/dashboard?showMusic=${showMusicMetrics}&showGit=${showGitMetrics}&showRank=${showWeeklyRanking}&linux=${isLinux()}`,
            getItem("jwt")
        );

        // ECONNREFUSED
        let content = "";
        if (isResponseOk(dashboardSummary)) {
            // get the content
            content =
                dashboardSummary && dashboardSummary.data
                    ? dashboardSummary.data
                    : NO_DATA;
        } else {
            content = SERVICE_NOT_AVAIL;
        }

        fs.writeFileSync(filePath, content, err => {
            if (err) {
                logIt(
                    `Error writing to the Software session file: ${err.message}`
                );
            }
        });
    }
}

export async function displayCodeTimeMetricsDashboard() {
    let filePath = getDashboardFile();
    await fetchCodeTimeMetricsDashboard();

    workspace.openTextDocument(filePath).then(doc => {
        // only focus if it's not already open
        window.showTextDocument(doc, ViewColumn.One, false).then(e => {
            // done
        });
    });
}
