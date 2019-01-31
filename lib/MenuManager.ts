import { window, workspace, QuickPickOptions } from "vscode";
import { launchWebUrl, getItem } from "./Util";
import { softwareGet } from "./HttpClient";

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

            fs.writeFileSync(uri, content, "UTF8");
            workspace.openTextDocument(uri).then(doc => {
                window.showTextDocument(doc);
            });
        }
    });
}
