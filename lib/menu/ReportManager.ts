import {
    writeProjectCommitDashboard,
    writeProjectContributorCommitDashboardFromGitLogs,
    writeDailyReportDashboard,
    writeProjectCommitDashboardByRangeType,
    writeProjectCommitDashboardByStartEnd,
} from "../DataController";
import {
    getProjectCodeSummaryFile,
    getProjectContributorCodeSummaryFile,
    getDailyReportSummaryFile,
} from "../Util";
import { workspace, window, ViewColumn } from "vscode";
import { sendGeneratedReportReport } from "./SlackManager";

export async function displayProjectCommitsDashboardByStartEnd(
    start,
    end,
    projectIds = []
) {
    // 1st write the code time metrics dashboard file
    await writeProjectCommitDashboardByStartEnd(start, end, projectIds);
    openProjectCommitDocument();
}

export async function displayProjectCommitsDashboardByRangeType(
    type = "lastWeek",
    projectIds = []
) {
    // 1st write the code time metrics dashboard file
    await writeProjectCommitDashboardByRangeType(type, projectIds);
    openProjectCommitDocument();
}

function openProjectCommitDocument() {
    const filePath = getProjectCodeSummaryFile();
    workspace.openTextDocument(filePath).then((doc) => {
        // only focus if it's not already open
        window.showTextDocument(doc, ViewColumn.One, false).then((e) => {
            // done
        });
    });
}

export async function displayProjectContributorCommitsDashboard(identifier) {
    // 1st write the code time metrics dashboard file
    await writeProjectContributorCommitDashboardFromGitLogs(identifier);
    const filePath = getProjectContributorCodeSummaryFile();

    workspace.openTextDocument(filePath).then((doc) => {
        // only focus if it's not already open
        window.showTextDocument(doc, ViewColumn.One, false).then((e) => {
            // done
        });
    });
}

export async function generateDailyReport(type = "yesterday", projectIds = []) {
    await writeDailyReportDashboard(type, projectIds);
    const filePath = getDailyReportSummaryFile();

    workspace.openTextDocument(filePath).then((doc) => {
        // only focus if it's not already open
        window.showTextDocument(doc, ViewColumn.One, false).then(async (e) => {
            const submitToSlack = await window.showInformationMessage(
                "Submit report to slack?",
                ...["Yes"]
            );
            if (submitToSlack && submitToSlack === "Yes") {
                // take the content and send it to a selected channel
                sendGeneratedReportReport();
            }
        });
    });
}
