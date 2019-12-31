import {
    window,
    workspace,
    QuickPickOptions,
    ViewColumn,
    commands
} from "vscode";
import {
    launchWebUrl,
    getDashboardFile,
    getCommitSummaryFile,
    toggleStatusBar,
    launchLogin,
    isStatusBarTextVisible,
    clearDayHourVals
} from "./Util";
import {
    getUserStatus,
    serverIsAvailable,
    writeCommitSummaryData,
    writeCodeTimeMetricsDashboard,
    getLoggedInCacheState
} from "./DataController";
import { launch_url, LOGIN_LABEL } from "./Constants";
import { clearSessionSummaryData } from "./OfflineManager";

/**
 * Pass in the following array of objects
 * options: {placeholder, items: [{label, description, url, detail, tooltip},...]}
 */

export function showQuickPick(pickOptions): any {
    if (!pickOptions || !pickOptions["items"]) {
        return;
    }
    let options: QuickPickOptions = {
        matchOnDescription: false,
        matchOnDetail: false,
        placeHolder: pickOptions.placeholder || ""
    };

    return window.showQuickPick(pickOptions.items, options).then(async item => {
        if (item) {
            let url = item["url"];
            let cb = item["cb"];
            let command = item["command"];
            if (url) {
                launchWebUrl(url);
            } else if (cb) {
                cb();
            } else if (command) {
                commands.executeCommand(command);
            }
        }
        return item;
    });
}

export async function buildWebDashboardUrl() {
    return launch_url;
}

export async function showMenuOptions() {
    const serverIsOnline = await serverIsAvailable();

    let loggedInState = await getLoggedInCacheState();

    if (serverIsOnline && !loggedInState.loggedIn) {
        // check if they're logged in yet

        loggedInState = await getUserStatus(serverIsOnline, true);
        if (loggedInState.loggedIn) {
            // clear it to fetch
            clearSessionSummaryData();
            // clear the last moment date to be able to
            // retrieve the user's dashboard metrics
            clearDayHourVals();
        }
    }

    // {placeholder, items: [{label, description, url, details, tooltip},...]}
    let kpmMenuOptions = {
        items: []
    };

    kpmMenuOptions.items.push({
        label: "Code Time Dashboard",
        detail: "View your latest coding metrics right here in your editor",
        url: null,
        cb: displayCodeTimeMetricsDashboard
    });

    let loginMsgDetail =
        "To see your coding data in Code Time, please log in to your account";
    if (!serverIsOnline) {
        loginMsgDetail =
            "Our service is temporarily unavailable. Please try again later.";
    }
    if (!loggedInState.loggedIn) {
        kpmMenuOptions.items.push({
            label: LOGIN_LABEL,
            detail: loginMsgDetail,
            url: null,
            cb: launchLogin
        });
    }

    let toggleStatusBarTextLabel = "Hide Status Bar Metrics";
    if (!isStatusBarTextVisible()) {
        toggleStatusBarTextLabel = "Show Status Bar Metrics";
    }
    kpmMenuOptions.items.push({
        label: toggleStatusBarTextLabel,
        detail: "Toggle the Code Time status bar metrics text",
        url: null,
        cb: toggleStatusBar
    });

    kpmMenuOptions.items.push({
        label: "Submit an issue on GitHub",
        detail: "Encounter a bug? Submit an issue on our GitHub page",
        url: "https://github.com/swdotcom/swdc-vscode/issues",
        cb: null
    });

    kpmMenuOptions.items.push({
        label: "Submit Feedback",
        detail: "Send us an email at cody@software.com.",
        url: "mailto:cody@software.com",
        cb: null
    });

    if (loggedInState.loggedIn) {
        kpmMenuOptions.items.push({
            label: "Web Dashboard",
            detail: "See rich data visualizations in the web app",
            url: null,
            cb: launchWebDashboardView
        });
    }

    showQuickPick(kpmMenuOptions);
}

export async function launchWebDashboardView() {
    let webUrl = await buildWebDashboardUrl();
    launchWebUrl(`${webUrl}/login`);
}

export async function displayCodeTimeMetricsDashboard() {
    // 1st write the code time metrics dashboard file
    await writeCodeTimeMetricsDashboard();
    const filePath = getDashboardFile();

    workspace.openTextDocument(filePath).then(doc => {
        // only focus if it's not already open
        window.showTextDocument(doc, ViewColumn.One, false).then(e => {
            // done
        });
    });
}

export async function displayWeeklyCommitSummary() {
    // 1st write the commit summary data, then show it
    await writeCommitSummaryData();
    const filePath = getCommitSummaryFile();

    workspace.openTextDocument(filePath).then(doc => {
        // only focus if it's not already open
        window.showTextDocument(doc, ViewColumn.One, false).then(e => {
            // done
        });
    });
}
