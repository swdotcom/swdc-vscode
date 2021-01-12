import { KpmItem, SessionSummary, FileChangeInfo } from "../model/models";
import {
  humanizeMinutes,
  getItem,
  isStatusBarTextVisible,
  logIt,
  findFirstActiveDirectoryOrWorkspaceDirectory,
  getNowTimes,
  setItem,
  isMac,
  getPercentOfReferenceAvg,
} from "../Util";
import { getLastCommitId, getRepoUrlLink } from "../repo/GitUtil";
import { TreeItem, TreeItemCollapsibleState, Command, commands, TreeView } from "vscode";
import { getSessionSummaryData, getSessionSummaryFileAsJson } from "../storage/SessionSummaryData";
import TeamMember from "../model/TeamMember";
import { getRepoContributors } from "../repo/KpmRepoManager";
import CodeTimeSummary from "../model/CodeTimeSummary";
import { getCodeTimeSummary } from "../storage/TimeSummaryData";
import { SummaryManager } from "../managers/SummaryManager";
import { getSlackDnDInfo, getSlackPresence, getSlackStatus, getSlackWorkspaces } from "../managers/SlackManager";
import { isDarkMode } from "../managers/OsaScriptManager";
import { LOGIN_LABEL, SIGN_UP_LABEL } from "../Constants";
import { isInFlowMode } from "../managers/FlowManager";
import { isInFullScreenMode } from "../managers/ScreenManager";

const numeral = require("numeral");
const moment = require("moment-timezone");
const path = require("path");
const resourcePath: string = path.join(__dirname, "resources");

export class KpmProviderManager {
  private static instance: KpmProviderManager;

  private kpmTreeOpen: boolean = false;

  public showingFullScreen: boolean = false;

  constructor() { }

  static getInstance(): KpmProviderManager {
    if (!KpmProviderManager.instance) {
      KpmProviderManager.instance = new KpmProviderManager();
    }

    return KpmProviderManager.instance;
  }

  public isKpmTreeOpen() {
    return this.kpmTreeOpen;
  }

  public setKpmTreeOpen(isOpen: boolean) {
    this.kpmTreeOpen = isOpen;
  }

  async getCodeTimeTreeMenu(): Promise<KpmItem[]> {
    const treeItems: KpmItem[] = [];
    treeItems.push(...(await this.getOptionsTreeParents()));
    return treeItems;
  }

  async getOptionsTreeParents(): Promise<KpmItem[]> {
    const name = getItem("name");
    const treeItems: KpmItem[] = [];

    // signup, login buttons if they're not already logged in
    // else get the "Logged in with <auth>" button
    if (!name) {
      treeItems.push(this.getGeneralSignupButton());
      treeItems.push(this.getGeneralLoginToExistingButton());
    } else {
      treeItems.push(this.getLoggedInButton());
      treeItems.push(this.getSwitchAccountsButton());
    }

    treeItems.push(this.getLearnMoreButton());
    treeItems.push(this.getFeedbackButton());
    treeItems.push(this.getHideStatusBarMetricsButton());

    treeItems.push(await this.getSlackIntegrationsTree());

    return treeItems;
  }

  getLoggedInTree(collapsibleState: TreeItemCollapsibleState): KpmItem {
    const connectedToInfo = this.getAuthTypeIconAndLabel();
    const children: KpmItem[] = [];
    children.push(this.getSwitchAccountsButton());
    return this.buildTreeForChildren(collapsibleState, children, connectedToInfo.label, connectedToInfo.tooltip, connectedToInfo.icon);
  }

  getLoggedInButton(): KpmItem {
    const connectedToInfo = this.getAuthTypeIconAndLabel();
    const item: KpmItem = this.buildMessageItem(connectedToInfo.label, connectedToInfo.tooltip, connectedToInfo.icon);
    return item;
  }

  buildTreeForChildren(
    collapsibleState: TreeItemCollapsibleState,
    children: KpmItem[],
    label: string,
    tooltip: string,
    icon: string = null
  ): KpmItem {
    const parent: KpmItem = this.buildMessageItem(label, tooltip, icon);
    if (collapsibleState) {
      parent.initialCollapsibleState = collapsibleState;
    }
    parent.children.push(...children);
    return parent;
  }

  async getStatsTreeItems(): Promise<KpmItem[]> {
    const treeItems: KpmItem[] = [];

    let refClass = getItem("reference-class") || "user";

    const sessionSummary: SessionSummary = getSessionSummaryData();

    // get the editor and session time
    const codeTimeSummary: CodeTimeSummary = getCodeTimeSummary();

    if (refClass === "user") {
      treeItems.push(this.getDescriptionButton("Today vs.", "your daily average", "", "codetime.switchAverageComparison", "today.svg"));
    } else {
      treeItems.push(this.getDescriptionButton("Today vs.", "the global daily average", "", "codetime.switchAverageComparison", "today.svg"));
    }

    const wallClktimeStr = humanizeMinutes(codeTimeSummary.codeTimeMinutes);
    const avgCodeTimeMinutes = refClass === "user" ? sessionSummary.averageDailyCodeTimeMinutes : sessionSummary.globalAverageDailyCodeTimeMinutes;
    const codeTimeAvgStr = humanizeMinutes(avgCodeTimeMinutes);
    const codeTimeTooltip = getPercentOfReferenceAvg(codeTimeSummary.codeTimeMinutes, avgCodeTimeMinutes, codeTimeAvgStr);
    const codeTimeIcon = codeTimeSummary.codeTimeMinutes > sessionSummary.averageDailyCodeTimeMinutes ? "bolt.svg" : "bolt-grey.svg";
    treeItems.push(this.getDescriptionButton(`Code time: ${wallClktimeStr}`, `(${codeTimeAvgStr} avg)`, codeTimeTooltip, "", codeTimeIcon));

    const dayMinutesStr = humanizeMinutes(codeTimeSummary.activeCodeTimeMinutes);
    const avgMinutes = refClass === "user" ? sessionSummary.averageDailyMinutes : sessionSummary.globalAverageDailyMinutes;
    const activeCodeTimeAvgStr = humanizeMinutes(avgMinutes);
    const activeCodeTimeTooltip = getPercentOfReferenceAvg(codeTimeSummary.activeCodeTimeMinutes, avgMinutes, activeCodeTimeAvgStr);
    const activeCodeTimeIcon = codeTimeSummary.activeCodeTimeMinutes > sessionSummary.averageDailyMinutes ? "bolt.svg" : "bolt-grey.svg";
    treeItems.push(
      this.getDescriptionButton(`Active code time: ${dayMinutesStr}`, `(${activeCodeTimeAvgStr} avg)`, activeCodeTimeTooltip, "", activeCodeTimeIcon)
    );

    const currLinesAdded = sessionSummary.currentDayLinesAdded;
    const linesAdded = numeral(currLinesAdded).format("0 a");
    const avgLinesAdded = refClass === "user" ? sessionSummary.averageLinesAdded : sessionSummary.globalAverageLinesAdded;
    const linesAddedAvgStr = numeral(avgLinesAdded).format("0 a");
    const linesAddedTooltip = getPercentOfReferenceAvg(currLinesAdded, avgLinesAdded, linesAddedAvgStr);
    const linesAddedIcon = sessionSummary.currentDayLinesAdded > sessionSummary.averageLinesAdded ? "bolt.svg" : "bolt-grey.svg";
    treeItems.push(this.getDescriptionButton(`Lines added: ${linesAdded}`, `(${linesAddedAvgStr} avg)`, linesAddedTooltip, "", linesAddedIcon));

    const currLinesRemoved = sessionSummary.currentDayLinesRemoved;
    const linesRemoved = numeral(currLinesRemoved).format("0 a");
    const avgLinesRemoved = refClass === "user" ? sessionSummary.averageLinesAdded : sessionSummary.globalAverageLinesRemoved;
    const linesRemovedAvgStr = numeral(avgLinesAdded).format("0 a");
    const linesRemovedTooltip = getPercentOfReferenceAvg(currLinesRemoved, avgLinesRemoved, linesRemovedAvgStr);
    const linesRemovedIcon = sessionSummary.currentDayLinesRemoved > sessionSummary.averageLinesAdded ? "bolt.svg" : "bolt-grey.svg";
    treeItems.push(
      this.getDescriptionButton(`Lines removed: ${linesRemoved}`, `(${linesRemovedAvgStr} avg)`, linesRemovedTooltip, "", linesRemovedIcon)
    );

    const currKeystrokes = sessionSummary.currentDayKeystrokes;
    const keystrokes = numeral(currKeystrokes).format("0 a");
    const avgKeystrokes = refClass === "user" ? sessionSummary.averageDailyKeystrokes : sessionSummary.globalAverageDailyKeystrokes;
    const keystrokesAvgStr = numeral(avgLinesAdded).format("0 a");
    const keystrokesTooltip = getPercentOfReferenceAvg(keystrokes, avgKeystrokes, keystrokesAvgStr);
    const keystrokesIcon = sessionSummary.currentDayKeystrokes > sessionSummary.averageDailyKeystrokes ? "bolt.svg" : "bolt-grey.svg";
    treeItems.push(this.getDescriptionButton(`Keystrokes: ${keystrokes}`, `(${keystrokesAvgStr} avg)`, keystrokesTooltip, "", keystrokesIcon));

    treeItems.push(this.getCodeTimeDashboardButton());
    treeItems.push(this.getViewProjectSummaryButton());
    treeItems.push(this.getWebViewDashboardButton());

    return treeItems;
  }

  async getFlowTreeParents(): Promise<KpmItem[]> {
    const treeItems: KpmItem[] = [];
    const [slackStatus, slackPresence, slackDnDInfo] = await Promise.all([getSlackStatus(), getSlackPresence(), getSlackDnDInfo()]);

    if (!isInFlowMode()) {
      treeItems.push(this.getActionButton("Enable flow", "Enable your code flow", "codetime.enableFlow", "paw.svg"));
    } else {
      treeItems.push(this.getActionButton("Pause flow", "Pause your code flow", "codetime.pauseFlow", "paw.svg"));
    }

    treeItems.push(this.getActionButton("Toggle Zen Mode", "", "codetime.toggleZenMode", "zen.svg"));

    let fullScreenToggleLabel = "Enter full screen";
    let fullScreenIcon = "expand.svg";
    if (isInFullScreenMode()) {
      fullScreenToggleLabel = "Exit full screen";
      fullScreenIcon = "compress.svg";
    }
    treeItems.push(this.getActionButton(fullScreenToggleLabel, "", "codetime.toggleFullScreen", fullScreenIcon));

    // slack status setter

    treeItems.push(this.getDescriptionButton("Update profile status", slackStatus, "", "codetime.updateProfileStatus", "profile.svg"));
    // pause/enable slack notification
    if (slackDnDInfo?.snooze_enabled) {
      const description = `(${moment.unix(slackDnDInfo.snooze_endtime).format("h:mm a")})`;
      // show the disable button
      treeItems.push(
        this.getDescriptionButton("Turn on notifications", description, "", "codetime.enableSlackNotifications", "notifications-on.svg")
      );
    } else {
      // show the enable button
      treeItems.push(this.getActionButton("Pause notifications", "", "codetime.pauseSlackNotifications", "notifications-off.svg"));
    }
    if (slackPresence === "active") {
      treeItems.push(this.getActionButton("Set presence to away", "", "codetime.toggleSlackPresence", "presence.svg"));
    } else {
      treeItems.push(this.getActionButton("Set presence to active", "", "codetime.toggleSlackPresence", "presence.svg"));
    }

    if (isMac()) {
      const darkmode = await isDarkMode();
      if (darkmode) {
        treeItems.push(this.getActionButton("Turn off dark mode", "", "codetime.toggleDarkMode", "adjust.svg"));
      } else {
        treeItems.push(this.getActionButton("Turn on dark mode", "", "codetime.toggleDarkMode", "adjust.svg"));
      }

      treeItems.push(this.getActionButton("Toggle dock position", "", "codetime.toggleDocPosition", "position.svg"));
    }

    return treeItems;
  }

  async getTeamTreeParents(): Promise<KpmItem[]> {
    const treeItems: KpmItem[] = [];

    const activeRootPath = findFirstActiveDirectoryOrWorkspaceDirectory();

    // get team members
    const teamMembers: TeamMember[] = await getRepoContributors(activeRootPath, false);

    const remoteUrl: string = await getRepoUrlLink(activeRootPath);

    if (teamMembers && teamMembers.length) {
      // get the 1st one to get the identifier
      const item: KpmItem = KpmProviderManager.getInstance().getContributorReportButton(teamMembers[0].identifier);
      treeItems.push(item);

      for (let i = 0; i < teamMembers.length; i++) {
        const member: TeamMember = teamMembers[i];
        const item: KpmItem = new KpmItem();
        item.label = member.name;
        item.description = member.email;
        item.value = member.identifier;

        // get their last commit
        const lastCommitInfo: any = await getLastCommitId(activeRootPath, member.email);
        if (lastCommitInfo && Object.keys(lastCommitInfo).length) {
          // add this as child
          const commitItem: KpmItem = new KpmItem();
          commitItem.label = lastCommitInfo.comment;
          commitItem.command = "codetime.launchCommitUrl";

          commitItem.location = "ct_contributors_tree";
          commitItem.name = "ct_contributor_last_commit_url_link";
          commitItem.interactionIcon = "none";
          commitItem.hideCTAInTracker = true;

          commitItem.commandArgs = [commitItem, `${remoteUrl}/commit/${lastCommitInfo.commitId}`];
          item.children = [commitItem];
        }

        // check to see if this email is in the registered list
        item.contextValue = "unregistered-member";
        item.icon = "unregistered-user.svg";
        treeItems.push(item);
      }
    }

    return treeItems;
  }

  getGeneralSignupButton() {
    const item: KpmItem = this.getActionButton(SIGN_UP_LABEL, "", "codetime.signUpAccount", "paw.svg", "", "blue");
    return item;
  }

  getGeneralLoginToExistingButton() {
    const item: KpmItem = this.getActionButton(LOGIN_LABEL, "", "codetime.codeTimeExisting", "paw.svg", "", "blue");
    item.location = "ct_menu_tree";
    item.name = `ct_log_in_btn`;
    item.interactionIcon = "paw.svg";
    return item;
  }

  getSignUpButton(signUpAuthName: string, iconColor?: string): KpmItem {
    const authType = getItem("authType");
    const signupText = authType ? LOGIN_LABEL : SIGN_UP_LABEL;
    const nameText = authType ? "log_in" : "sign_up";
    let label = `${signupText} with ${signUpAuthName}`;
    let icon = "email.svg";
    let iconName = "email";
    let command = "codetime.codeTimeLogin";
    const lcType = signUpAuthName.toLowerCase();
    if (lcType === "google") {
      icon = "google.svg";
      command = "codetime.googleLogin";
      iconName = "google";
    } else if (lcType === "github") {
      icon = "github.svg";
      command = "codetime.githubLogin";
      iconName = "github";
    } else if (lcType === "existing") {
      label = `${LOGIN_LABEL} with existing account`;
      icon = "paw.svg";
      command = "codetime.codeTimeExisting";
      iconName = "paw";
    }
    const item: KpmItem = this.getActionButton(label, "", command, icon, "", iconColor);
    item.location = "ct_menu_tree";
    item.name = `ct_${nameText}_${lcType}_btn`;
    item.interactionIcon = iconName;
    return item;
  }

  getWebViewDashboardButton(): KpmItem {
    const name = getItem("name");
    const loggedInMsg = name ? ` Connected as ${name}` : "";
    const item: KpmItem = this.getActionButton(
      "More data at Software.com",
      `See rich data visualizations in the web app.${loggedInMsg}`,
      "codetime.softwareKpmDashboard",
      "paw.svg",
      "TreeViewLaunchWebDashboard",
      "blue"
    );
    item.location = "ct_menu_tree";
    item.name = "ct_web_metrics_btn";
    item.interactionIcon = "paw";
    return item;
  }

  getDividerButton(): KpmItem {
    const dividerButton: KpmItem = this.getActionButton("", "", "", "blue-line-96.png");
    return dividerButton;
  }

  getSwitchAccountsButton(): KpmItem {
    const name = getItem("name");
    const loggedInMsg = name ? ` Connected as ${name}` : "";
    const tooltip = `Switch to a different account.${loggedInMsg}`;
    const item: KpmItem = this.getActionButton("Switch account", tooltip, "codetime.switchAccounts", "paw.svg", "TreeViewSwitchAccounts", "blue");
    item.location = "ct_menu_tree";
    item.name = "ct_switch_accounts_btn";
    item.interactionIcon = "paw";
    return item;
  }

  getHideStatusBarMetricsButton(): KpmItem {
    let toggleStatusBarTextLabel = "Hide status bar metrics";
    if (!isStatusBarTextVisible()) {
      toggleStatusBarTextLabel = "Show status bar metrics";
    }

    const item: KpmItem = this.getActionButton(
      toggleStatusBarTextLabel,
      "Toggle the Code Time status bar metrics text",
      "codetime.toggleStatusBar",
      "visible.svg"
    );
    item.location = "ct_menu_tree";
    item.name = "ct_toggle_status_bar_metrics_btn";
    item.color = "blue";
    item.interactionIcon = "slash-eye";
    return item;
  }

  getLearnMoreButton(): KpmItem {
    const learnMoreLabel = `Documentation`;
    const item: KpmItem = this.getActionButton(
      learnMoreLabel,
      "View the Code Time Readme to learn more",
      "codetime.displayReadme",
      "readme.svg",
      "",
      "yellow"
    );
    item.location = "ct_menu_tree";
    item.name = "ct_learn_more_btn";
    item.interactionIcon = "document";
    return item;
  }

  getFeedbackButton(): KpmItem {
    const feedbackButton: KpmItem = this.getActionButton(
      "Submit an issue",
      "Send us an email at cody@software.com",
      "codetime.submitOnIssue",
      "message.svg",
      "",
      "green"
    );
    feedbackButton.name = "ct_submit_feedback_btn";
    feedbackButton.location = "ct_menu_tree";
    feedbackButton.interactionIcon = "text-bubble";
    return feedbackButton;
  }

  async getSlackIntegrationsTree(): Promise<KpmItem> {
    const parentItem = this.buildMessageItem("Slack workspaces", "", "slack.svg", null, null);
    parentItem.contextValue = "slack_connection_parent";
    parentItem.children = [];
    const workspaces = getSlackWorkspaces();
    if (workspaces.length) {
      for await (const integration of workspaces) {
        const workspaceItem = this.buildMessageItem(integration.team_domain, "", "");
        workspaceItem.contextValue = "slack_connection_node";
        workspaceItem.description = `(${integration.team_name})`;
        workspaceItem.value = integration.authId;
        parentItem.children.push(workspaceItem);
      }
    }
    return parentItem;
  }

  getContributorReportButton(identifier: string): KpmItem {
    const item: KpmItem = new KpmItem();
    item.label = identifier;
    item.icon = "github.svg";
    item.command = "codetime.generateContributorSummary";
    item.color = "white";
    item.value = identifier;
    item.tooltip = "Generate contributor commit summary";
    item.location = "ct_contributors_tree";
    item.name = "ct_contributor_repo_identifier_btn";
    item.interactionIcon = "repo";
    item.hideCTAInTracker = true;
    return item;
  }

  getViewProjectSummaryButton(): KpmItem {
    const commitSummitLabel = `Project summary`;
    const item: KpmItem = this.getActionButton(commitSummitLabel, "", "codetime.generateProjectSummary", "folder.svg", "", "red");
    item.location = "ct_menu_tree";
    item.name = "ct_project_summary_btn";
    item.interactionIcon = "folder";
    return item;
  }

  getCodeTimeDashboardButton(): KpmItem {
    const item: KpmItem = this.getActionButton(
      `Dashboard`,
      "View your latest coding metrics right here in your editor",
      "codetime.viewDashboard",
      "dashboard.svg",
      "TreeViewLaunchDashboard",
      "purple"
    );
    item.location = "ct_menu_tree";
    item.name = "ct_summary_btn";
    item.interactionIcon = "guage";
    return item;
  }

  getAuthTypeIconAndLabel() {
    const authType = getItem("authType");
    const name = getItem("name");
    let tooltip = name ? `Connected as ${name}` : "";
    if (authType === "google") {
      return {
        icon: "google.svg",
        label: name,
        tooltip,
      };
    } else if (authType === "github") {
      return {
        icon: "github.svg",
        label: name,
        tooltip,
      };
    }
    return {
      icon: "email.svg",
      label: name,
      tooltip,
    };
  }

  getActionButton(label, tooltip, command, icon = null, eventDescription: string = "", color = null): KpmItem {
    const item: KpmItem = new KpmItem();
    item.tooltip = tooltip;
    item.label = label;
    item.id = label;
    item.command = command;
    item.icon = icon;
    item.contextValue = "action_button";
    item.eventDescription = eventDescription;
    item.color = color;
    return item;
  }

  getDescriptionButton(label, description, tooltip, command, icon = null) {
    const item: KpmItem = new KpmItem();
    item.tooltip = tooltip;
    item.description = description;
    item.label = label;
    item.id = label;
    item.command = command;
    item.icon = icon;
    item.contextValue = "detail_button";
    return item;
  }

  buildMetricItem(label, value, tooltip = "", icon = null, name = "", location = "ct_metrics_tree") {
    const item: KpmItem = new KpmItem();
    item.label = `${label}: ${value}`;
    item.id = `${label}_metric`;
    item.contextValue = "metric_item";
    item.tooltip = tooltip;
    item.icon = icon;
    item.location = location;
    item.name = name;
    return item;
  }

  buildTreeMetricItem(
    label,
    tooltip,
    value,
    icon = null,
    collapsibleState: TreeItemCollapsibleState = null,
    name = "",
    location = "ct_metrics_tree"
  ) {
    const childItem = this.buildMessageItem(value);
    const parentItem = this.buildMessageItem(label, tooltip, icon, null, null, name, location);
    if (collapsibleState) {
      parentItem.initialCollapsibleState = collapsibleState;
    }
    parentItem.children = [childItem];
    return parentItem;
  }

  buildActivityComparisonNodes(label, tooltip, values, collapsibleState: TreeItemCollapsibleState = null, name = "", location = "ct_metrics_tree") {
    const parent: KpmItem = this.buildMessageItem(label, tooltip, null, null, null, name, location);
    if (collapsibleState) {
      parent.initialCollapsibleState = collapsibleState;
    }
    values.forEach((element) => {
      const label = element.label || "";
      const tooltip = element.tooltip || "";
      const icon = element.icon || "";
      const child = this.buildMessageItem(label, tooltip, icon);
      parent.children.push(child);
    });
    return parent;
  }

  buildMessageItem(label, tooltip = "", icon = null, command = null, commandArgs = null, name = "", location = ""): KpmItem {
    const item: KpmItem = new KpmItem();
    item.label = label;
    item.tooltip = tooltip;
    item.icon = icon;
    item.command = command;
    item.commandArgs = commandArgs;
    item.id = `${label}_message`;
    item.contextValue = "message_item";
    item.eventDescription = null;
    item.name = name;
    item.location = location;
    return item;
  }

  buildTitleItem(label, icon = null) {
    const item: KpmItem = new KpmItem();
    item.label = label;
    item.id = `${label}_title`;
    item.contextValue = "title_item";
    item.icon = icon;
    return item;
  }

  buildParentItem(label: string, tooltip: string, children: KpmItem[], name = "", location = "ct_metrics_tree") {
    const item: KpmItem = new KpmItem();
    item.label = label;
    item.tooltip = tooltip;
    item.id = `${label}_title`;
    item.contextValue = "title_item";
    item.children = children;
    item.eventDescription = null;
    item.name = name;
    item.location = location;
    return item;
  }

  buildFileItem(fileChangeInfo: FileChangeInfo) {
    const item: KpmItem = new KpmItem();
    item.command = "codetime.openFileInEditor";
    item.commandArgs = [fileChangeInfo.fsPath];
    item.label = fileChangeInfo.name;
    item.tooltip = `Click to open ${fileChangeInfo.fsPath}`;
    item.id = `${fileChangeInfo.name}_file`;
    item.contextValue = "file_item";
    item.icon = "readme.svg";
    return item;
  }

  buildMostEditedFileItem(fileChangeInfos: FileChangeInfo[]): KpmItem {
    if (!fileChangeInfos || fileChangeInfos.length === 0) {
      return null;
    }
    // Most Edited File
    const sortedArray = fileChangeInfos.sort((a: FileChangeInfo, b: FileChangeInfo) => b.keystrokes - a.keystrokes);
    const mostEditedChildren: KpmItem[] = [];
    const len = Math.min(3, sortedArray.length);
    for (let i = 0; i < len; i++) {
      const fileName = sortedArray[i].name;
      const keystrokes = sortedArray[i].keystrokes || 0;
      const keystrokesStr = numeral(keystrokes).format("0 a");
      const label = `${fileName} | ${keystrokesStr}`;
      const messageItem = this.buildMessageItem(label, "", null, "codetime.openFileInEditor", [sortedArray[i].fsPath]);
      mostEditedChildren.push(messageItem);
    }
    const mostEditedParent = this.buildParentItem("Top files by keystrokes", "", mostEditedChildren, "ct_top_files_by_keystrokes_toggle_node");

    return mostEditedParent;
  }

  buildHighestKpmFileItem(fileChangeInfos: FileChangeInfo[]): KpmItem {
    if (!fileChangeInfos || fileChangeInfos.length === 0) {
      return null;
    }
    // Highest KPM
    const sortedArray = fileChangeInfos.sort((a: FileChangeInfo, b: FileChangeInfo) => b.kpm - a.kpm);
    const highKpmChildren: KpmItem[] = [];
    const len = Math.min(3, sortedArray.length);
    for (let i = 0; i < len; i++) {
      const fileName = sortedArray[i].name;
      const kpm = sortedArray[i].kpm || 0;
      const kpmStr = kpm.toFixed(2);
      const label = `${fileName} | ${kpmStr}`;
      const messageItem = this.buildMessageItem(label, "", null, "codetime.openFileInEditor", [sortedArray[i].fsPath]);
      highKpmChildren.push(messageItem);
    }
    const highKpmParent = this.buildParentItem(
      "Top files by KPM",
      "Top files by KPM (keystrokes per minute)",
      highKpmChildren,
      "ct_top_files_by_kpm_toggle_node"
    );
    return highKpmParent;
  }

  buildLongestFileCodeTime(fileChangeInfos: FileChangeInfo[]): KpmItem {
    if (!fileChangeInfos || fileChangeInfos.length === 0) {
      return null;
    }
    // Longest Code Time
    const sortedArray = fileChangeInfos.sort((a: FileChangeInfo, b: FileChangeInfo) => b.duration_seconds - a.duration_seconds);
    const longestCodeTimeChildren: KpmItem[] = [];
    const len = Math.min(3, sortedArray.length);
    for (let i = 0; i < len; i++) {
      const fileName = sortedArray[i].name;
      const minutes = sortedArray[i].duration_seconds || 0;
      const duration_minutes = minutes > 0 ? minutes / 60 : 0;
      const codeHours = humanizeMinutes(duration_minutes);
      const label = `${fileName} | ${codeHours}`;
      const messageItem = this.buildMessageItem(label, "", null, "codetime.openFileInEditor", [sortedArray[i].fsPath]);
      longestCodeTimeChildren.push(messageItem);
    }
    const longestCodeTimeParent = this.buildParentItem("Top files by code time", "", longestCodeTimeChildren, "ct_top_files_by_codetime_toggle_node");
    return longestCodeTimeParent;
  }
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

export const handleKpmChangeSelection = (view: TreeView<KpmItem>, item: KpmItem) => {
  if (item.command) {
    const args = item.commandArgs || [];
    if (args.length) {
      commands.executeCommand(item.command, ...args);
    } else {
      // run the command
      commands.executeCommand(item.command, item);
    }
  }

  // deselect it
  try {
    // re-select the track without focus
    view.reveal(item, {
      focus: false,
      select: false,
    });
  } catch (err) {
    logIt(`Unable to deselect track: ${err.message}`);
  }
};

export const treeDataUpdateCheck = () => {
  const { day } = getNowTimes();
  const currentDay = getItem("updatedTreeDate");
  const existingSummary: SessionSummary = getSessionSummaryFileAsJson();
  if (currentDay !== day || existingSummary.globalAverageDailyMinutes === 0) {
    SummaryManager.getInstance().updateSessionSummaryFromServer();
    setItem("updatedTreeDate", day);
  }
};
