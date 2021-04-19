import { window, QuickPickOptions, commands } from "vscode";
import { launchWebUrl, getItem } from "../Util";
import { launch_url, LOGIN_LABEL } from "../Constants";
import { showDashboard } from "../managers/WebViewManager";
import { isStatusBarTextVisible } from "../managers/StatusBarManager";
import { launchLogin } from "../user/OnboardManager";

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
      const url = item["url"];
      const cb = item["cb"];
      const command = item["command"];
      const commandArgs = item["commandArgs"] || [];
      if (url) {
        launchWebUrl(url);
      } else if (cb) {
        cb();
      } else if (command) {
        commands.executeCommand(command, ...commandArgs);
      }
    }
    return item;
  });
}

export async function showMenuOptions() {
  const email = getItem("name");

  // {placeholder, items: [{label, description, url, details, tooltip},...]}
  let kpmMenuOptions = {
    items: [],
  };

  kpmMenuOptions.items.push({
    label: "Generate dashboard",
    detail: "View your latest coding metrics right here in your editor",
    url: null,
    cb: showDashboard,
    eventDescription: "PaletteMenuLaunchDashboard",
  });

  let loginMsgDetail = "Finish creating your account and see rich data visualizations.";
  if (!email) {
    kpmMenuOptions.items.push({
      label: LOGIN_LABEL,
      detail: loginMsgDetail,
      url: null,
      cb: launchLogin,
      eventDescription: "PaletteMenuLogin",
    });
  }

  let toggleStatusBarTextLabel = "Hide Code Time status";
  if (!isStatusBarTextVisible()) {
    toggleStatusBarTextLabel = "Show Code Time status";
  }
  kpmMenuOptions.items.push({
    label: toggleStatusBarTextLabel,
    detail: "Toggle the Code Time status",
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

  if (email) {
    kpmMenuOptions.items.push({
      label: "Web dashboard",
      detail: "See rich data visualizations in the web app",
      url: null,
      cb: launchWebDashboardView,
      eventDescription: "PaletteMenuLaunchWebDashboard",
    });
  }

  showQuickPick(kpmMenuOptions);
}

export async function launchWebDashboardView() {
  launchWebUrl(`${launch_url}/login`);
}
