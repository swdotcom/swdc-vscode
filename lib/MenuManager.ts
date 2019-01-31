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

export async function showMenuOptions(showSoftwareGrubOptions) {
    // check if we've successfully logged in as this user yet
    const existingJwt = getItem("jwt");
    let tokenVal = getItem("token");

    let webUrl = launch_url;

    let addedToken = false;

    let appDashboardDetail = "Click to see more from Code Time";
    if (!tokenVal) {
        tokenVal = randomCode();
        addedToken = true;
        setItem("token", tokenVal);
    } else if (!existingJwt) {
        addedToken = true;
    } else if (!(await isAuthenticated())) {
        addedToken = true;
    }

    // add the token to the launch url
    if (addedToken) {
        webUrl = `${launch_url}/onboarding?token=${tokenVal}`;
        appDashboardDetail = `$(alert) To see your coding data in Code Time, please log in to your account.`;
    }

    // let uriKey = getUriKey();
    // let dashboardURI = Uri.parse(`${uriKey}://Software/SoftwareDashboard`);
    let filePath = getDashboardFile();

    let grubOptions = [
        {
            description:
                "Get your favorite tacos delivered fast to your door with Doordash. No Minimum Order Size.",
            detail: "⭐⭐⭐⭐ ",
            label: "Doordash",
            url: "https://www.doordash.com/?query=tacos"
        },
        {
            description:
                "Taco delivery, and much more, near you from Grubhub. Browse, Select, & Submit Your Order.",
            detail: "⭐⭐⭐⭐ ",
            label: "Grubhub",
            url:
                "https://www.grubhub.com/search?orderMethod=delivery&locationMode=DELIVERY&facetSet=umamiV2&pageSize=20&hideHateos=true&searchMetrics=true&queryText=tacos&latitude=37.41455459&longitude=-122.1899643&facet=open_now%3Atrue&variationId=otter&sortSetId=umamiV2&sponsoredSize=3&countOmittingTimes=true"
        },
        {
            description:
                "Get tacos deliverd at Uber Speed. Food Delivery by Uber",
            detail: "⭐⭐⭐⭐ ",
            label: "UberEats",
            url: "https://www.ubereats.com/en-US/search/?q=Tacos"
        },
        {
            description:
                "Hungry for taco delivery? Order Eat24 today. Delivery menus, ratings and reviews, coupons, and more",
            detail: "⭐⭐⭐⭐ ",
            label: "Eat24",
            url:
                "https://www.eat24.com/search?orderMethod=delivery&locationMode=DELIVERY&facetSet=umamiV2&pageSize=20&hideHateos=true&searchMetrics=true&queryText=tacos&facet=open_now%3Atrue&sortSetId=umamiV2&sponsoredSize=3&countOmittingTimes=true"
        }
    ];

    // {placeholder, items: [{label, description, url, details, tooltip},...]}
    let kpmMenuOptions = {
        items: [
            {
                label: "Code time report",
                description: "",
                detail: "View your latest coding metrics",
                url: null,
                uri: filePath
            },
            {
                label: "Software.com",
                description: "",
                detail: appDashboardDetail,
                url: webUrl
            }
        ]
    };
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
