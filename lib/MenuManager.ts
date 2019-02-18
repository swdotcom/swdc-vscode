import { window, workspace, QuickPickOptions, ViewColumn } from "vscode";
import {
    launchWebUrl,
    getItem,
    getDashboardFile,
    setItem,
    randomCode,
    isCodeTimeMetricsClosed,
    showLastStatus,
    isCodeTimeMetricsFocused
} from "./Util";
import { softwareGet } from "./HttpClient";
import {
    isAuthenticated,
    isRegisteredUser,
    getMacAddress
} from "./DataController";
import { launch_url, LOGIN_LABEL } from "./Constants";

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
    if (!existingJwt || !(await isAuthenticated())) {
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
        let macAddress = await getMacAddress();
        webUrl = `${launch_url}/onboarding?token=${tokenVal}&addr=${encodeURIComponent(
            macAddress
        )}`;
    }

    return webUrl;
}

export async function showMenuOptions() {
    let filePath = getDashboardFile();
    let registeredUser = await isRegisteredUser();
    let needsToken = await userNeedsToken();
    let requiresToken = registeredUser && !needsToken ? false : true;
    let webUrl = await buildLaunchUrl(requiresToken);

    // {placeholder, items: [{label, description, url, details, tooltip},...]}
    let kpmMenuOptions = {
        items: [
            {
                label: "Code time dashboard",
                description: "",
                detail: "View your latest coding metrics",
                url: null,
                uri: filePath
            }
        ]
    };
    if (registeredUser) {
        kpmMenuOptions.items.push({
            label: "Software.com",
            description: "",
            detail: "Click to see more from Code Time",
            url: webUrl,
            uri: null
        });
    }
    kpmMenuOptions.items.push({
        label: "Software Top 40",
        description: "",
        detail:
            "Top 40 most popular songs developers around the world listen to as they code.",
        url: "https://api.software.com/music/top40",
        uri: null
    });
    if (!registeredUser) {
        kpmMenuOptions.items.push({
            label: LOGIN_LABEL,
            description: "",
            detail:
                "To see rich data visualizations in our web app, please create an account.",
            url: webUrl,
            uri: null
        });
    }
    showQuickPick(kpmMenuOptions);
}

export async function displayCodeTimeMetricsDashboard() {
    let alreadyFocused = isCodeTimeMetricsFocused();
    let isClosed = isCodeTimeMetricsClosed();

    let filePath = getDashboardFile();
    let showMusicMetrics = workspace.getConfiguration().get("showMusicMetrics");
    let showGitMetrics = workspace.getConfiguration().get("showGitMetrics");
    let showWeeklyRanking = workspace
        .getConfiguration()
        .get("showWeeklyRanking");

    const dashboardSummary = await softwareGet(
        `/dashboard?showMusic=${showMusicMetrics}&showGit=${showGitMetrics}&showRank=${showWeeklyRanking}`,
        getItem("jwt")
    );
    // get the content
    let content =
        dashboardSummary && dashboardSummary.data
            ? dashboardSummary.data
            : NO_DATA;

    // Error: EPERM: operation not permitted, open 'C:\Users\Software\.software\CodeTime'
    fs.writeFileSync(filePath, content, "UTF8", { mode: 0o755 });
    workspace.openTextDocument(filePath).then(doc => {
        // only focus if it's not already open
        if (alreadyFocused || isClosed) {
            window.showTextDocument(doc, ViewColumn.One, true).then(e => {
                showLastStatus();
            });
        }
    });

    // remove the file without the extension if it exists
    let legacyFile = filePath.substring(0, filePath.lastIndexOf("."));
    if (fs.existsSync(legacyFile)) {
        fs.unlinkSync(legacyFile);
    }
}
