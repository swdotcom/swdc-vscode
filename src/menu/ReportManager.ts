import {
  writeProjectContributorCommitDashboardFromGitLogs,
  writeProjectCommitDashboardByRangeType,
  writeProjectCommitDashboardByStartEnd,
} from "../DataController";
import {
  getProjectCodeSummaryFile,
  getProjectContributorCodeSummaryFile
} from "../Util";
import { workspace, window, ViewColumn, ProgressLocation } from "vscode";
import { ProgressManager } from "../managers/ProgressManager";

export async function displayProjectCommitsDashboardByStartEnd(start, end, projectIds = []) {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Loading project summary...",
      cancellable: false,
    },
    async (progress, token) => {
      const progressMgr: ProgressManager = ProgressManager.getInstance();
      progressMgr.doneWriting = false;
      progressMgr.reportProgress(progress, 20);
      // 1st write the code time metrics dashboard file
      await writeProjectCommitDashboardByStartEnd(start, end, projectIds);
      progressMgr.doneWriting = true;
      openProjectCommitDocument();
      progress.report({ increment: 100 });
    }
  );
}

export async function displayProjectCommitsDashboardByRangeType(
  type = "lastWeek",
  projectIds = []
) {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Loading project summary...",
      cancellable: false,
    },
    async (progress, token) => {
      const progressMgr: ProgressManager = ProgressManager.getInstance();
      progressMgr.doneWriting = false;
      progressMgr.reportProgress(progress, 20);
      // 1st write the code time metrics dashboard file
      await writeProjectCommitDashboardByRangeType(type, projectIds);
      progressMgr.doneWriting = true;
      openProjectCommitDocument();
      progress.report({ increment: 100 });
    }
  );
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
