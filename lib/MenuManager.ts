import { window, workspace, QuickPickOptions } from "vscode";
import { launchWebUrl } from "./Util";

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
    window.showQuickPick(pickOptions.items, options).then(item => {
        let url = item["url"];
        let uri = item["uri"];
        if (url) {
            launchWebUrl(url);
        } else if (uri) {
            workspace.openTextDocument(uri).then(doc => {
                window.showTextDocument(doc);
            });
        }
    });
}
