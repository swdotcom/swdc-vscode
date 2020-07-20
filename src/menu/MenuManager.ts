import {
  window,
  workspace,
  QuickPickOptions,
  ViewColumn,
  commands,
  ProgressLocation,
} from "vscode";
import {
  launchWebUrl,
  getDashboardFile,
  getCommitSummaryFile,
  launchLogin,
  isStatusBarTextVisible,
} from "../Util";
import {
  writeCommitSummaryData,
  writeCodeTimeMetricsDashboard,
  isLoggedIn,
} from "../DataController";
import { launch_url, LOGIN_LABEL } from "../Constants";
import { EventManager } from "../managers/EventManager";
import { ProgressManager } from "../managers/ProgressManager";

/**
 * Pass in the following array of objects
 * options: {placeholder, items: [{label, description, url, detail, tooltip},...]}
 */

export function showQuickPick(pickOptions): any {
  if (!pickOptions || !pickOptions["items"]) {
    return;
  }
  let options: QuickPickOptions = {
    matchOnDescription: false,
    matchOnDetail: false,
    placeHolder: pickOptions.placeholder || "",
  };

  return window.showQuickPick(pickOptions.items, options).then(async (item) => {
    if (item) {
      let url = item["url"];
      let cb = item["cb"];
      let command = item["command"];
      if (url) {
        launchWebUrl(url);
      } else if (cb) {
        cb();
      } else if (command) {
        commands.executeCommand(command);
      }

      if (item["eventDescription"]) {
        EventManager.getInstance().createCodeTimeEvent("mouse", "click", item["eventDescription"]);
      }
    }
    return item;
  });
}

export async function buildWebDashboardUrl() {
  return launch_url;
}

export async function showMenuOptions() {
  EventManager.getInstance().createCodeTimeEvent("mouse", "click", "ShowPaletteMenu");

  const loggedIn: boolean = await isLoggedIn();

  // {placeholder, items: [{label, description, url, details, tooltip},...]}
  let kpmMenuOptions = {
    items: [],
  };

  kpmMenuOptions.items.push({
    label: "Generate dashboard",
    detail: "View your latest coding metrics right here in your editor",
    url: null,
    cb: displayCodeTimeMetricsDashboard,
    eventDescription: "PaletteMenuLaunchDashboard",
  });

  let loginMsgDetail = "Finish creating your account and see rich data visualizations.";
  if (!loggedIn) {
    kpmMenuOptions.items.push({
      label: LOGIN_LABEL,
      detail: loginMsgDetail,
      url: null,
      cb: launchLogin,
      eventDescription: "PaletteMenuLogin",
    });
  }

  let toggleStatusBarTextLabel = "Hide status bar metrics";
  if (!isStatusBarTextVisible()) {
    toggleStatusBarTextLabel = "Show status bar metrics";
  }
  kpmMenuOptions.items.push({
    label: toggleStatusBarTextLabel,
    detail: "Toggle the Code Time status bar metrics text",
    url: null,
    cb: null,
    command: "codetime.toggleStatusBar",
  });

  kpmMenuOptions.items.push({
    label: "Submit an issue on GitHub",
    detail: "Encounter a bug? Submit an issue on our GitHub page",
    url: "https://github.com/swdotcom/swdc-vscode/issues",
    cb: null,
  });

  kpmMenuOptions.items.push({
    label: "Submit feedback",
    detail: "Send us an email at cody@software.com",
    cb: null,
    command: "codetime.sendFeedback",
  });

  if (loggedIn) {
    kpmMenuOptions.items.push({
      label: "Web dashboard",
      detail: "See rich data visualizations in the web app",
      url: null,
      cb: launchWebDashboardView,
      eventDescription: "PaletteMenuLaunchWebDashboard",
    });
  }

  // kpmMenuOptions.items.push({
  //     label:
  //         "___________________________________________________________________",
  //     cb: null,
  //     url: null,
  //     command: null
  // });

  // const atlassianAccessToken = getItem("atlassian_access_token");
  // if (!atlassianAccessToken) {
  //     kpmMenuOptions.items.push({
  //         label: "Connect Atlassian",
  //         detail: "To integrate with your Jira projects",
  //         cb: null,
  //         command: "codetime.connectAtlassian"
  //     });
  // }

  showQuickPick(kpmMenuOptions);
}

export async function launchWebDashboardView() {
  let webUrl = await buildWebDashboardUrl();
  launchWebUrl(`${webUrl}/login`);
}

export async function displayCodeTimeMetricsDashboard() {
  // 1st write the code time metrics dashboard file
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Loading summary...",
      cancellable: false,
    },
    async (progress, token) => {
      const progressMgr: ProgressManager = ProgressManager.getInstance();
      progressMgr.doneWriting = false;
      progressMgr.reportProgress(progress, 20);
      await writeCodeTimeMetricsDashboard();
      progressMgr.doneWriting = true;
      const filePath = getDashboardFile();
      workspace.openTextDocument(filePath).then((doc) => {
        // only focus if it's not already open
        window.showTextDocument(doc, ViewColumn.One, false).then((e) => {
          // done
        });
        progress.report({ increment: 100 });
      });
    }
  );
}

export async function displayWeeklyCommitSummary() {
  // 1st write the commit summary data, then show it
  await writeCommitSummaryData();
  const filePath = getCommitSummaryFile();

  workspace.openTextDocument(filePath).then((doc) => {
    // only focus if it's not already open
    window.showTextDocument(doc, ViewColumn.One, false).then((e) => {
      // done
    });
  });
}
