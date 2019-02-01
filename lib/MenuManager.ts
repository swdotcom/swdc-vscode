import { window, workspace, QuickPickOptions } from "vscode";
import {
    launchWebUrl,
    getItem,
    getDashboardFile,
    setItem,
    randomCode
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
    // check if we've successfully logged in as this user yet
    let tokenVal = getItem("token");

    let appDashboardDetail = "Click to see more from Code Time";

    // add the token to the launch url
    if (requiresToken) {
        appDashboardDetail = `$(alert) To see your coding data in Code Time, please log in to your account.`;
    }

    let webUrl = await buildLaunchUrl(requiresToken);

    // let uriKey = getUriKey();
    // let dashboardURI = Uri.parse(`${uriKey}://Software/SoftwareDashboard`);
    let filePath = getDashboardFile();

    let grubOptions = [
        {
            description:
                "Get your favorite tacos delivered fast to your door with Doordash. No Minimum Order Size.",
            detail: "⭐⭐⭐⭐ ",
            label: "Doordash",
            url: "https://www.doordash.com/?query=tacos",
            uri: null
        },
        {
            description:
                "Taco delivery, and much more, near you from Grubhub. Browse, Select, & Submit Your Order.",
            detail: "⭐⭐⭐⭐ ",
            label: "Grubhub",
            url:
                "https://www.grubhub.com/search?orderMethod=delivery&locationMode=DELIVERY&facetSet=umamiV2&pageSize=20&hideHateos=true&searchMetrics=true&queryText=tacos&latitude=37.41455459&longitude=-122.1899643&facet=open_now%3Atrue&variationId=otter&sortSetId=umamiV2&sponsoredSize=3&countOmittingTimes=true",
            uri: null
        },
        {
            description:
                "Get tacos deliverd at Uber Speed. Food Delivery by Uber",
            detail: "⭐⭐⭐⭐ ",
            label: "UberEats",
            url: "https://www.ubereats.com/en-US/search/?q=Tacos",
            uri: null
        },
        {
            description:
                "Hungry for taco delivery? Order Eat24 today. Delivery menus, ratings and reviews, coupons, and more",
            detail: "⭐⭐⭐⭐ ",
            label: "Eat24",
            url:
                "https://www.eat24.com/search?orderMethod=delivery&locationMode=DELIVERY&facetSet=umamiV2&pageSize=20&hideHateos=true&searchMetrics=true&queryText=tacos&facet=open_now%3Atrue&sortSetId=umamiV2&sponsoredSize=3&countOmittingTimes=true",
            uri: null
        }
    ];

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
    if (showSoftwareGrubOptions) {
        kpmMenuOptions.items.push(...grubOptions);
    }
    showQuickPick(kpmMenuOptions);
}

export async function displayCodeTimeMetricsDashboard() {
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

    fs.writeFileSync(filePath, content, "UTF8");
    workspace.openTextDocument(filePath).then(doc => {
        window.showTextDocument(doc);
    });
}
