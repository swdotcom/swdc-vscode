import { TreeItemCollapsibleState } from "vscode";
import { LOGIN_LABEL, SIGN_UP_LABEL } from "../Constants";
import { FileChangeInfo, KpmItem } from "../model/models";
import { getItem, isStatusBarTextVisible } from "../Util";

export function getContributorReportButton(identifier: string): KpmItem {
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

export function getViewProjectSummaryButton(): KpmItem {
  const commitSummitLabel = `Project summary`;
  const item: KpmItem = this.getActionButton(commitSummitLabel, "", "codetime.generateProjectSummary", "folder.svg", "", "red");
  item.location = "ct_menu_tree";
  item.name = "ct_project_summary_btn";
  item.interactionIcon = "folder";
  return item;
}

export function getCodeTimeDashboardButton(): KpmItem {
  const item: KpmItem = this.getActionButton(
    `Dashboard`,
    "View your latest coding metrics right here in your editor",
    "codetime.viewDashboard",
    "dashboard.svg",
    "TreeViewLaunchDashboard",
    "purple"
  );
  item.location = "ct_menu_tree";
  item.name = "ct_dashboard_btn";
  item.interactionIcon = "guage";
  return item;
}

export function getAuthTypeIconAndLabel() {
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

export function getActionButton(
  label,
  tooltip,
  command,
  icon = null,
  eventDescription: string = "",
  color = null,
  description: string = ""
): KpmItem {
  const item: KpmItem = new KpmItem();
  item.tooltip = tooltip ?? "";
  item.label = label;
  item.id = label;
  item.command = command;
  item.icon = icon;
  item.contextValue = "action_button";
  item.eventDescription = eventDescription;
  item.color = color;
  item.description = description;
  return item;
}

export function getDescriptionButton(label, description, tooltip, command, icon = null) {
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

export function buildEmptyButton(id) {
  const item: KpmItem = new KpmItem();
  item.id = id;
  return item;
}

export function buildMetricItem(label, value, tooltip = "", icon = null, name = "", location = "ct_metrics_tree") {
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

export function buildTreeMetricItem(
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

export function buildActivityComparisonNodes(
  label,
  tooltip,
  values,
  collapsibleState: TreeItemCollapsibleState = null,
  name = "",
  location = "ct_metrics_tree"
) {
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

export function buildMessageItem(label, tooltip: any = "", icon = null, command = null, commandArgs = null, name = "", location = ""): KpmItem {
  const item: KpmItem = new KpmItem();
  item.label = label;
  item.tooltip = tooltip ?? "";
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

export function buildTitleItem(label, icon = null) {
  const item: KpmItem = new KpmItem();
  item.label = label;
  item.id = `${label}_title`;
  item.contextValue = "title_item";
  item.icon = icon;
  return item;
}

export function buildParentItem(label: string, tooltip: string, children: KpmItem[], name = "", location = "ct_metrics_tree") {
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

export function buildFileItem(fileChangeInfo: FileChangeInfo) {
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

export function getWebViewDashboardButton(): KpmItem {
  const name = getItem("name");
  const loggedInMsg = name ? ` Connected as ${name}` : "";
  const item: KpmItem = getActionButton(
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

export function getSignUpButton(signUpAuthName: string, iconColor?: string): KpmItem {
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
  const item: KpmItem = getActionButton(label, "", command, icon, "", iconColor);
  item.location = "ct_menu_tree";
  item.name = `ct_${nameText}_${lcType}_btn`;
  item.interactionIcon = iconName;
  return item;
}

export function getSwitchAccountsButton(): KpmItem {
  const name = getItem("name");
  const loggedInMsg = name ? ` Connected as ${name}` : "";
  const tooltip = `Switch to a different account.${loggedInMsg}`;
  const item: KpmItem = getActionButton("Switch account", tooltip, "codetime.switchAccounts", "paw.svg", "TreeViewSwitchAccounts", "blue");
  item.location = "ct_menu_tree";
  item.name = "ct_switch_accounts_btn";
  item.interactionIcon = "paw";
  return item;
}

export function getHideStatusBarMetricsButton(): KpmItem {
  let toggleStatusBarTextLabel = "Hide status bar metrics";
  if (!isStatusBarTextVisible()) {
    toggleStatusBarTextLabel = "Show status bar metrics";
  }

  const item: KpmItem = getActionButton(
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

export function getLearnMoreButton(): KpmItem {
  const learnMoreLabel = `Documentation`;
  const item: KpmItem = getActionButton(
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

export function getFeedbackButton(): KpmItem {
  const feedbackButton: KpmItem = getActionButton(
    "Submit an issue",
    "Send us an email at cody@software.com",
    "codetime.submitAnIssue",
    "message.svg",
    "",
    "green"
  );
  feedbackButton.name = "ct_submit_feedback_btn";
  feedbackButton.location = "ct_menu_tree";
  feedbackButton.interactionIcon = "text-bubble";
  return feedbackButton;
}

export function getLoggedInButton(): KpmItem {
  const connectedToInfo = getAuthTypeIconAndLabel();
  const item: KpmItem = buildMessageItem(connectedToInfo.label, connectedToInfo.tooltip, connectedToInfo.icon);
  return item;
}

export function getGeneralSignupButton() {
  const item: KpmItem = getActionButton(SIGN_UP_LABEL, "", "codetime.signUpAccount", "paw.svg", "", "blue");
  return item;
}

export function getGeneralLoginToExistingButton() {
  const item: KpmItem = getActionButton(LOGIN_LABEL, "", "codetime.codeTimeExisting", "paw.svg", "", "blue");
  item.location = "ct_menu_tree";
  item.name = `ct_log_in_btn`;
  item.interactionIcon = "paw.svg";
  return item;
}
