import { window, workspace, QuickPickOptions, ViewColumn } from "vscode";
import {
    launchWebUrl,
    getItem,
    getDashboardFile,
    setItem,
    randomCode,
    updateDashboardIsOpen,
    isDashboardOpen,
    showLoading,
    showLastStatus
} from "./Util";
import { softwareGet } from "./HttpClient";
import { isAuthenticated } from "../extension";
import { launch_url } from "./Constants";

const fs = require("fs");

const NO_DATA = "CODE TIME\n\nNo data available\n";

/**
 * Pass in the following array of objects
 * options: {placeholder, items: [{label, description, url, detail, tooltip},...]}
 */

export function showQuickPick(pickOptions) {
    let options: QuickPickOptions = {
        onDidSelectItem: item => {
            window.setStatusBarMessage(item["label"]);
        },
        matchOnDescription: false,
        matchOnDetail: false,
        placeHolder: pickOptions.placeholder || ""
    };
    window.showQuickPick(pickOptions.items, options).then(async item => {
        let url = item["url"];
        let uri = item["uri"];
        if (url) {
            launchWebUrl(url);
        } else if (uri) {
            displayCodeTimeMetricsDashboard();
        }
    });
}

export async function userNeedsToken() {
    let requiresToken = false;
    const existingJwt = getItem("jwt");
    let tokenVal = getItem("token");
    if (!tokenVal || !existingJwt || !(await isAuthenticated())) {
        requiresToken = true;
    }
    return requiresToken;
}

export async function buildLaunchUrl(requiresToken) {
    let webUrl = launch_url;
    if (requiresToken) {
        let tokenVal = getItem("token");
        if (!tokenVal) {
            tokenVal = randomCode();
            setItem("token", tokenVal);
        }
        webUrl = `${launch_url}/onboarding?token=${tokenVal}`;
    }

    return webUrl;
}

export async function showMenuOptions(requiresToken, showSoftwareGrubOptions) {
    let appDashboardDetail = "Click to see more from Code Time";

    // add the token to the launch url
    if (requiresToken) {
        appDashboardDetail = `$(alert) To see your coding data in Code Time, please log in to your account.`;
    }

    let webUrl = await buildLaunchUrl(requiresToken);
    let filePath = getDashboardFile();

    // {placeholder, items: [{label, description, url, details, tooltip},...]}
    let kpmMenuOptions = {
        items: [
            {
                label: "Software.com",
                description: "",
                detail: appDashboardDetail,
                url: webUrl,
                uri: null
            }
        ]
    };
    if (!requiresToken) {
        kpmMenuOptions.items.unshift({
            label: "Code time report",
            description: "",
            detail: "View your latest coding metrics",
            url: null,
            uri: filePath
        });
    }
    showQuickPick(kpmMenuOptions);
}

export async function displayCodeTimeMetricsDashboard() {
    let focus = isDashboardOpen() ? false : true;
    if (focus) {
        showLoading();
    }
    let filePath = getDashboardFile();
    let showMusicMetrics = workspace
        .getConfiguration("feature")
        .get("showMusicMetrics");
    let showGitMetrics = workspace
        .getConfiguration("feature")
        .get("showGitMetrics");

    const dashboardSummary = await softwareGet(
        `/dashboard?showMusic=${showMusicMetrics}&showGit=${showGitMetrics}`,
        getItem("jwt")
    );
    let content =
        dashboardSummary && dashboardSummary.data
            ? dashboardSummary.data
            : NO_DATA;

    fs.chmodSync(filePath, 755);
    // Error: EPERM: operation not permitted, open 'C:\Users\Software\.software\CodeTime'
    fs.writeFileSync(filePath, content, "UTF8");
    workspace.openTextDocument(filePath).then(doc => {
        // only focus if it's not already open
        updateDashboardIsOpen(true);
        window.showTextDocument(doc, ViewColumn.One, focus).then(e => {
            showLastStatus();
        });
    });
}
