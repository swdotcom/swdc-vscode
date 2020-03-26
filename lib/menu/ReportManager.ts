import {
    writeProjectCommitDashboard,
    writeProjectContributorCommitDashboard
} from "../DataController";
import {
    getProjectCodeSummaryFile,
    getProjectContributorCodeSummaryFile
} from "../Util";
import { workspace, window, ViewColumn } from "vscode";

export async function displayProjectCommitsDashboard(
    type = "lastWeek",
    projectIds = []
) {
    // 1st write the code time metrics dashboard file
    await writeProjectCommitDashboard(type, projectIds);
    const filePath = getProjectCodeSummaryFile();

    workspace.openTextDocument(filePath).then(doc => {
        // only focus if it's not already open
        window.showTextDocument(doc, ViewColumn.One, false).then(e => {
            // done
        });
    });
}

export async function displayProjectContributorCommitsDashboard(identifier) {
    // 1st write the code time metrics dashboard file
    await writeProjectContributorCommitDashboard(identifier);
    const filePath = getProjectContributorCodeSummaryFile();

    workspace.openTextDocument(filePath).then(doc => {
        // only focus if it's not already open
        window.showTextDocument(doc, ViewColumn.One, false).then(e => {
            // done
        });
    });
}
