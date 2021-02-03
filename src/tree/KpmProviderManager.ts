import { KpmItem, SessionSummary } from "../model/models";
import { humanizeMinutes, getItem, isMac, getPercentOfReferenceAvg } from "../Util";
import { TreeItem, TreeItemCollapsibleState, Command, MarkdownString } from "vscode";
import { getSessionSummaryData } from "../storage/SessionSummaryData";
import CodeTimeSummary from "../model/CodeTimeSummary";
import { getCodeTimeSummary } from "../storage/TimeSummaryData";
import { getSlackDnDInfo, getSlackPresence, getSlackStatus, getSlackWorkspaces } from "../managers/SlackManager";
import { isDarkMode } from "../managers/OsaScriptManager";
import { getConfigSettingsTooltip, isInFlowMode } from "../managers/FlowManager";
import { FULL_SCREEN_MODE_ID, getScreenMode, ZEN_MODE_ID } from "../managers/ScreenManager";
import {
  buildEmptyButton,
  buildMessageItem,
  getActionButton,
  getCodeTimeDashboardButton,
  getDescriptionButton,
  getFeedbackButton,
  getGeneralLoginToExistingButton,
  getGeneralSignupButton,
  getHideStatusBarMetricsButton,
  getLearnMoreButton,
  getLoggedInButton,
  getSwitchAccountsButton,
  getViewProjectSummaryButton,
  getWebViewDashboardButton,
} from "./TreeButtonProvider";

const numeral = require("numeral");
const moment = require("moment-timezone");
const path = require("path");
const resourcePath: string = path.join(__dirname, "resources");

export async function getCodeTimeTreeMenu(): Promise<KpmItem[]> {
  const treeItems: KpmItem[] = [];
  treeItems.push(...(await getOptionsTreeParents()));
  return treeItems;
}

export async function getOptionsTreeParents(): Promise<KpmItem[]> {
  const name = getItem("name");
  const treeItems: KpmItem[] = [];

  // signup, login buttons if they're not already logged in
  // else get the "Logged in with <auth>" button
  if (!name) {
    treeItems.push(getGeneralSignupButton());
    treeItems.push(getGeneralLoginToExistingButton());
  } else {
    treeItems.push(getLoggedInButton());
    treeItems.push(getSwitchAccountsButton());
  }

  treeItems.push(getLearnMoreButton());
  treeItems.push(getFeedbackButton());
  treeItems.push(getHideStatusBarMetricsButton());

  treeItems.push(await getSlackIntegrationsTree());

  return treeItems;
}

export async function getStatsTreeItems(): Promise<KpmItem[]> {
  const treeItems: KpmItem[] = [];

  let refClass = getItem("reference-class") || "user";

  const sessionSummary: SessionSummary = getSessionSummaryData();

  // get the editor and session time
  const codeTimeSummary: CodeTimeSummary = getCodeTimeSummary();

  if (refClass === "user") {
    treeItems.push(getDescriptionButton("Today vs.", "your daily average", "", "codetime.switchAverageComparison", "today.svg"));
  } else {
    treeItems.push(getDescriptionButton("Today vs.", "the global daily average", "", "codetime.switchAverageComparison", "today.svg"));
  }

  const wallClktimeStr = humanizeMinutes(codeTimeSummary.codeTimeMinutes);
  const avgCodeTimeMinutes = refClass === "user" ? sessionSummary.averageDailyCodeTimeMinutes : sessionSummary.globalAverageDailyCodeTimeMinutes;
  const codeTimeAvgStr = humanizeMinutes(avgCodeTimeMinutes);
  const codeTimeTooltip = getPercentOfReferenceAvg(codeTimeSummary.codeTimeMinutes, avgCodeTimeMinutes, codeTimeAvgStr);
  const codeTimeIcon = codeTimeSummary.codeTimeMinutes > sessionSummary.averageDailyCodeTimeMinutes ? "bolt.svg" : "bolt-grey.svg";
  treeItems.push(getDescriptionButton(`Code time: ${wallClktimeStr}`, `(${codeTimeAvgStr} avg)`, codeTimeTooltip, "", codeTimeIcon));

  const dayMinutesStr = humanizeMinutes(codeTimeSummary.activeCodeTimeMinutes);
  const avgMinutes = refClass === "user" ? sessionSummary.averageDailyActiveCodeTimeMinutes : sessionSummary.globalAverageDailyActiveCodeTimeMinutes;
  const activeCodeTimeAvgStr = humanizeMinutes(avgMinutes);
  const activeCodeTimeTooltip = getPercentOfReferenceAvg(codeTimeSummary.activeCodeTimeMinutes, avgMinutes, activeCodeTimeAvgStr);
  const activeCodeTimeIcon = codeTimeSummary.activeCodeTimeMinutes > sessionSummary.averageDailyActiveCodeTimeMinutes ? "bolt.svg" : "bolt-grey.svg";
  treeItems.push(
    getDescriptionButton(`Active code time: ${dayMinutesStr}`, `(${activeCodeTimeAvgStr} avg)`, activeCodeTimeTooltip, "", activeCodeTimeIcon)
  );

  const currLinesAdded = sessionSummary.currentDayLinesAdded;
  const linesAdded = numeral(currLinesAdded).format("0 a");
  const avgLinesAdded = refClass === "user" ? sessionSummary.averageLinesAdded : sessionSummary.globalAverageLinesAdded;
  const linesAddedAvgStr = numeral(avgLinesAdded).format("0 a");
  const linesAddedTooltip = getPercentOfReferenceAvg(currLinesAdded, avgLinesAdded, linesAddedAvgStr);
  const linesAddedIcon = sessionSummary.currentDayLinesAdded > sessionSummary.averageLinesAdded ? "bolt.svg" : "bolt-grey.svg";
  treeItems.push(getDescriptionButton(`Lines added: ${linesAdded}`, `(${linesAddedAvgStr} avg)`, linesAddedTooltip, "", linesAddedIcon));

  const currLinesRemoved = sessionSummary.currentDayLinesRemoved;
  const linesRemoved = numeral(currLinesRemoved).format("0 a");
  const avgLinesRemoved = refClass === "user" ? sessionSummary.averageLinesAdded : sessionSummary.globalAverageLinesRemoved;
  const linesRemovedAvgStr = numeral(avgLinesAdded).format("0 a");
  const linesRemovedTooltip = getPercentOfReferenceAvg(currLinesRemoved, avgLinesRemoved, linesRemovedAvgStr);
  const linesRemovedIcon = sessionSummary.currentDayLinesRemoved > sessionSummary.averageLinesAdded ? "bolt.svg" : "bolt-grey.svg";
  treeItems.push(getDescriptionButton(`Lines removed: ${linesRemoved}`, `(${linesRemovedAvgStr} avg)`, linesRemovedTooltip, "", linesRemovedIcon));

  const currKeystrokes = sessionSummary.currentDayKeystrokes;
  const keystrokes = numeral(currKeystrokes).format("0 a");
  const avgKeystrokes = refClass === "user" ? sessionSummary.averageDailyKeystrokes : sessionSummary.globalAverageDailyKeystrokes;
  const keystrokesAvgStr = numeral(avgLinesAdded).format("0 a");
  const keystrokesTooltip = getPercentOfReferenceAvg(keystrokes, avgKeystrokes, keystrokesAvgStr);
  const keystrokesIcon = sessionSummary.currentDayKeystrokes > sessionSummary.averageDailyKeystrokes ? "bolt.svg" : "bolt-grey.svg";
  treeItems.push(getDescriptionButton(`Keystrokes: ${keystrokes}`, `(${keystrokesAvgStr} avg)`, keystrokesTooltip, "", keystrokesIcon));

  treeItems.push(getCodeTimeDashboardButton());
  treeItems.push(getViewProjectSummaryButton());
  treeItems.push(getWebViewDashboardButton());

  return treeItems;
}

export async function getFlowTreeParents(): Promise<KpmItem[]> {
  const treeItems: KpmItem[] = [];
  const location = "ct-flow-tree";

  const [slackStatus, slackPresence, slackDnDInfo] = await Promise.all([getSlackStatus(), getSlackPresence(), getSlackDnDInfo()]);

  const inFlowSettingsTooltip = getConfigSettingsTooltip();
  const mdstr: MarkdownString = new MarkdownString(inFlowSettingsTooltip);
  let flowModeButton: KpmItem = null;
  if (!isInFlowMode(slackStatus, slackPresence, slackDnDInfo)) {
    flowModeButton = getActionButton("Enable Flow Mode", mdstr, "codetime.enableFlow", "dot-outlined.svg");
  } else {
    flowModeButton = getActionButton("Pause Flow Mode", mdstr, "codetime.pauseFlow", "dot.svg");
  }
  flowModeButton.location = location;
  treeItems.push(flowModeButton);

  treeItems.push(getActionButton("Configure settings", "", "codetime.configureSettings", "profile.svg"));

  treeItems.push(await getAutomationsTree(slackStatus, slackPresence, slackDnDInfo));

  treeItems.push(buildEmptyButton("empty-flow-button"));

  return treeItems;
}

async function getSlackIntegrationsTree(): Promise<KpmItem> {
  const workspaces = getSlackWorkspaces();
  // show the slack icon next to the folder if its empty
  const folderIcon = workspaces?.length ? null : "slack.svg";
  const parentItem = buildMessageItem("Slack workspaces", "", folderIcon);
  parentItem.contextValue = "slack_connection_parent";
  parentItem.children = [];

  if (workspaces.length) {
    for await (const integration of workspaces) {
      const workspaceItem = buildMessageItem(integration.team_domain, "", "slack.svg");
      workspaceItem.contextValue = "slack_connection_node";
      workspaceItem.description = `(${integration.team_name})`;
      workspaceItem.value = integration.authId;
      parentItem.children.push(workspaceItem);
    }
  }
  return parentItem;
}

async function getAutomationsTree(slackStatus, slackPresence, slackDnDInfo): Promise<KpmItem> {
  const screen_mode = getScreenMode();
  const parentItem: KpmItem = buildMessageItem("Automations", "", null);

  let zenModeScreeCommand = "codetime.showZenMode";
  if (screen_mode === ZEN_MODE_ID) {
    zenModeScreeCommand = "codetime.exitFullScreen";
  }

  parentItem.children.push(getActionButton("Toggle Zen Mode", "", zenModeScreeCommand, "zen.svg"));

  let fullScreenToggleLabel = "Enter full screen";
  let fullScreenIcon = "expand.svg";
  let fullScreenCommand = "codetime.showFullScreen";
  if (screen_mode === FULL_SCREEN_MODE_ID || screen_mode === ZEN_MODE_ID) {
    fullScreenToggleLabel = "Exit full screen";
    fullScreenIcon = "compress.svg";
    fullScreenCommand = "codetime.exitFullScreen";
  }
  const fullScreenButton = getActionButton(fullScreenToggleLabel, "", fullScreenCommand, fullScreenIcon);
  fullScreenButton.location = "ct-flow-tree";
  parentItem.children.push(fullScreenButton);

  // slack status setter
  parentItem.children.push(getDescriptionButton("Update profile status", slackStatus, "", "codetime.updateProfileStatus", "profile.svg"));

  // pause/enable slack notification
  if (slackDnDInfo?.snooze_enabled) {
    const description = `(${moment.unix(slackDnDInfo.snooze_endtime).format("h:mm a")})`;
    // show the disable button
    parentItem.children.push(
      getDescriptionButton("Turn on notifications", description, "", "codetime.enableSlackNotifications", "notifications-on.svg")
    );
  } else {
    // show the enable button
    parentItem.children.push(getActionButton("Pause notifications", "", "codetime.pauseSlackNotifications", "notifications-off.svg"));
  }
  if (slackPresence === "active") {
    parentItem.children.push(getActionButton("Set presence to away", "", "codetime.toggleSlackPresence", "presence.svg"));
  } else {
    parentItem.children.push(getActionButton("Set presence to active", "", "codetime.toggleSlackPresence", "presence.svg"));
  }

  if (isMac()) {
    const darkmode = await isDarkMode();
    if (darkmode) {
      parentItem.children.push(getActionButton("Turn off dark mode", "", "codetime.toggleDarkMode", "adjust.svg"));
    } else {
      parentItem.children.push(getActionButton("Turn on dark mode", "", "codetime.toggleDarkMode", "adjust.svg"));
    }

    parentItem.children.push(getActionButton("Toggle dock position", "", "codetime.toggleDocPosition", "position.svg"));
  }

  return parentItem;
}

/**
 * The TreeItem contains the "contextValue", which is represented as the "viewItem"
 * from within the package.json when determining if there should be decoracted context
 * based on that value.
 */
export class KpmTreeItem extends TreeItem {
  constructor(private readonly treeItem: KpmItem, public readonly collapsibleState: TreeItemCollapsibleState, public readonly command?: Command) {
    super(treeItem.label, collapsibleState);

    const { lightPath, darkPath } = getTreeItemIcon(treeItem);

    if (treeItem.description) {
      this.description = treeItem.description;
    }

    if (lightPath && darkPath) {
      this.iconPath.light = lightPath;
      this.iconPath.dark = darkPath;
    } else {
      // no matching tag, remove the tree item icon path
      delete this.iconPath;
    }

    this.tooltip = treeItem.tooltip;

    this.contextValue = getTreeItemContextValue(treeItem);
  }

  iconPath = {
    light: "",
    dark: "",
  };

  contextValue = "treeItem";
}

function getTreeItemIcon(treeItem: KpmItem): any {
  const iconName = treeItem.icon;
  const lightPath = iconName ? path.join(resourcePath, "light", iconName) : null;
  const darkPath = iconName ? path.join(resourcePath, "dark", iconName) : null;
  return { lightPath, darkPath };
}

function getTreeItemContextValue(treeItem: KpmItem): string {
  if (treeItem.contextValue) {
    return treeItem.contextValue;
  }
  if (treeItem.children.length) {
    return "parent";
  }
  return "child";
}
