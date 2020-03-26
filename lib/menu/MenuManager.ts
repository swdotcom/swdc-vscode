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
    launchLogin,
    isStatusBarTextVisible
} from "../Util";
import {
    getUserStatus,
    writeCommitSummaryData,
    writeCodeTimeMetricsDashboard,
    getConnectState
} from "../DataController";
import { serverIsAvailable } from "../http/HttpClient";
import { launch_url, LOGIN_LABEL } from "../Constants";
import { LoggedInState } from "../model/models";
import { clearSessionSummaryData } from "../storage/SessionSummaryData";
import { EventManager } from "../managers/EventManager";

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

            if (item["eventDescription"]) {
                EventManager.getInstance().createCodeTimeEvent(
                    "mouse",
                    "click",
                    item["eventDescription"]
                );
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

    EventManager.getInstance().createCodeTimeEvent(
        "mouse",
        "click",
        "ShowPaletteMenu"
    );

    let loggedInState: LoggedInState = await getConnectState();

    if (serverIsOnline && !loggedInState.loggedIn) {
        // check if they're logged in yet
        loggedInState = await getUserStatus();
        if (loggedInState.loggedIn) {
            // clear it to fetch
            clearSessionSummaryData();
        }
    }

    // {placeholder, items: [{label, description, url, details, tooltip},...]}
    let kpmMenuOptions = {
        items: []
    };

    kpmMenuOptions.items.push({
        label: "Generate dashboard",
        detail: "View your latest coding metrics right here in your editor",
        url: null,
        cb: displayCodeTimeMetricsDashboard,
        eventDescription: "PaletteMenuLaunchDashboard"
    });

    let loginMsgDetail =
        "Finish creating your account and see rich data visualizations.";
    if (!serverIsOnline) {
        loginMsgDetail =
            "Our service is temporarily unavailable. Please try again later.";
    }
    if (!loggedInState.loggedIn) {
        kpmMenuOptions.items.push({
            label: LOGIN_LABEL,
            detail: loginMsgDetail,
            url: null,
            cb: launchLogin,
            eventDescription: "PaletteMenuLogin"
        });
    }

    let toggleStatusBarTextLabel = "Hide status bar metrics";
    if (!isStatusBarTextVisible()) {
        toggleStatusBarTextLabel = "Show status bar metrics";
    }
    kpmMenuOptions.items.push({
        label: toggleStatusBarTextLabel,
        detail: "Toggle the Code Time status bar metrics text",
        url: null,
        cb: null,
        command: "codetime.toggleStatusBar"
    });

    kpmMenuOptions.items.push({
        label: "Submit an issue on GitHub",
        detail: "Encounter a bug? Submit an issue on our GitHub page",
        url: "https://github.com/swdotcom/swdc-vscode/issues",
        cb: null
    });

    kpmMenuOptions.items.push({
        label: "Submit feedback",
        detail: "Send us an email at cody@software.com",
        cb: null,
        command: "codetime.sendFeedback"
    });

    if (loggedInState.loggedIn) {
        kpmMenuOptions.items.push({
            label: "Web dashboard",
            detail: "See rich data visualizations in the web app",
            url: null,
            cb: launchWebDashboardView,
            eventDescription: "PaletteMenuLaunchWebDashboard"
        });
    }

    // kpmMenuOptions.items.push({
    //     label:
    //         "___________________________________________________________________",
    //     cb: null,
    //     url: null,
    //     command: null
    // });

    // const atlassianAccessToken = getItem("atlassian_access_token");
    // if (!atlassianAccessToken) {
    //     kpmMenuOptions.items.push({
    //         label: "Connect Atlassian",
    //         detail: "To integrate with your Jira projects",
    //         cb: null,
    //         command: "codetime.connectAtlassian"
    //     });
    // }

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
