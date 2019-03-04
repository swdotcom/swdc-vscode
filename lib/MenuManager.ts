import { window, workspace, QuickPickOptions, ViewColumn } from "vscode";
import {
    launchWebUrl,
    getItem,
    getDashboardFile,
    setItem,
    randomCode,
    showLastStatus,
    getMacAddress
} from "./Util";
import { softwareGet } from "./HttpClient";
import {
    isAuthenticated,
    getUserStatus,
    pluginLogout,
    refetchUserStatusLazily
} from "./DataController";
import {
    launch_url,
    LOGIN_LABEL,
    LOGOUT_LABEL,
    SIGNUP_LABEL
} from "./Constants";

const fs = require("fs");

const NO_DATA = "CODE TIME\n\nNo data available\n";

let showMusicMetrics = false;

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
                if (url.includes("?")) {
                    refetchUserStatusLazily();
                }
            } else if (uri) {
                displayCodeTimeMetricsDashboard();
            }
            if (cb) {
                cb();
            }
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

export async function buildLoginUrl() {
    let macAddress = await getMacAddress();
    let loginUrl = `${launch_url}/login?addr=${macAddress}`;
    return loginUrl;
}

export async function buildSignupUrl() {
    let macAddress = await getMacAddress();
    let signupUrl = `${launch_url}/onboarding?addr=${macAddress}`;
    return signupUrl;
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
        if (macAddress) {
            webUrl += `/onboarding?addr=${encodeURIComponent(
                macAddress
            )}&token=${tokenVal}`;
        } else {
            webUrl += `/onboarding?token=${tokenVal}`;
        }
    }

    return webUrl;
}

export async function showMenuOptions() {
    let filePath = getDashboardFile();
    // {loggedIn: true|false, hasAccounts: true|false, hasUserAccounts: true|false}
    let userStatus = await getUserStatus();

    let needsToken = await userNeedsToken();
    // let requiresToken = needsToken || !userStatus.loggedIn ? true : false;
    let webUrl = await buildLaunchUrl(!userStatus.loggedIn);
    let loginUrl = await buildLoginUrl();
    let signupUrl = await buildSignupUrl();

    // {placeholder, items: [{label, description, url, details, tooltip},...]}
    let kpmMenuOptions = {
        items: []
    };

    kpmMenuOptions.items.push({
        label: "Code time dashboard",
        description: "",
        detail: "View your latest coding metrics right here in your editor.",
        url: null,
        uri: filePath,
        cb: null
    });

    if (userStatus.loggedIn && showMusicMetrics) {
        kpmMenuOptions.items.push({
            label: "Software Top 40",
            description: "",
            detail:
                "Top 40 most popular songs developers around the world listen to as they code.",
            url: "https://api.software.com/music/top40",
            uri: null,
            cb: null
        });
    }
    if (!userStatus.loggedIn) {
        kpmMenuOptions.items.push({
            label: LOGIN_LABEL,
            description: "",
            detail:
                "To see your coding data in Code Time, please log in to your account.",
            url: loginUrl,
            uri: null,
            cb: null
        });
        kpmMenuOptions.items.push({
            label: SIGNUP_LABEL,
            description: "",
            detail:
                "To see rich data visualizations and get weekly email reports, please sign in to our web app.",
            url: signupUrl,
            uri: null,
            cb: null
        });
    } else {
        kpmMenuOptions.items.push({
            label: "Web dashboard",
            description: "",
            detail: "See rich data visualizations in the web app.",
            url: webUrl,
            uri: null,
            cb: null
        });
        kpmMenuOptions.items.push({
            label: LOGOUT_LABEL,
            description: "",
            detail: `Log out from Code Time (${userStatus.email}).`,
            url: null,
            uri: null,
            cb: pluginLogout
        });
    }
    showQuickPick(kpmMenuOptions);
}

export async function fetchCodeTimeMetricsDashboard() {
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

    fs.writeFileSync(filePath, content, err => {
        if (err) {
            console.log(
                "Code Time: Error writing to the Software session file: ",
                err.message
            );
        }
    });
}

export async function displayCodeTimeMetricsDashboard() {
    let filePath = getDashboardFile();
    await fetchCodeTimeMetricsDashboard();

    workspace.openTextDocument(filePath).then(doc => {
        // only focus if it's not already open
        window.showTextDocument(doc, ViewColumn.One, false).then(e => {
            showLastStatus();
        });
    });
}
