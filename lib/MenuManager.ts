import { window, workspace, QuickPickOptions, ViewColumn } from "vscode";
import { launchWebUrl, getItem, getDashboardFile, isLinux } from "./Util";
import { softwareGet } from "./HttpClient";
import { getUserStatus, refetchUserStatusLazily } from "./DataController";
import { launch_url, LOGIN_LABEL } from "./Constants";

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

export async function buildLoginUrl() {
  let jwt = getItem("jwt");
  let encodedJwt = encodeURIComponent(jwt);
  let loginUrl = `${launch_url}/onboarding?token=${encodedJwt}`;
  return loginUrl;
}

export async function buildWebDashboardUrl() {
  let webUrl = launch_url;
  return webUrl;
}

export async function showMenuOptions() {
  let filePath = getDashboardFile();
  // {loggedIn: true|false}
  let userStatus = await getUserStatus();
  let webUrl = await buildWebDashboardUrl();
  let loginUrl = await buildLoginUrl();

  // {placeholder, items: [{label, description, url, details, tooltip},...]}
  let kpmMenuOptions = {
    items: []
  };

  kpmMenuOptions.items.push({
    label: "Code time dashboard",
    description: "",
    detail: "View your latest coding metrics right here in your editor",
    url: null,
    uri: filePath,
    cb: null
  });

  if (userStatus.loggedIn && showMusicMetrics) {
    kpmMenuOptions.items.push({
      label: "Software Top 40",
      description: "",
      detail:
        "Top 40 most popular songs developers around the world listen to as they code",
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
        "To see your coding data in Code Time, please log in to your account",
      url: loginUrl,
      uri: null,
      cb: null
    });
  } else {
    kpmMenuOptions.items.push({
      label: "Web dashboard",
      description: "",
      detail: "See rich data visualizations in the web app",
      url: webUrl + "/login",
      uri: null,
      cb: null
    });
  }
  showQuickPick(kpmMenuOptions);
}

export async function fetchCodeTimeMetricsDashboard() {
  let filePath = getDashboardFile();

  let showMusicMetrics = workspace.getConfiguration().get("showMusicMetrics");
  let showGitMetrics = workspace.getConfiguration().get("showGitMetrics");
  let showWeeklyRanking = workspace.getConfiguration().get("showWeeklyRanking");

  const dashboardSummary = await softwareGet(
    `/dashboard?showMusic=${showMusicMetrics}&showGit=${showGitMetrics}&showRank=${showWeeklyRanking}&linux=${isLinux()}`,
    getItem("jwt")
  );
  // get the content
  let content =
    dashboardSummary && dashboardSummary.data ? dashboardSummary.data : NO_DATA;

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
      // done
    });
  });
}
