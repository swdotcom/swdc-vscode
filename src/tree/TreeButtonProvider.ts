import { LOGIN_LABEL, SIGN_UP_LABEL } from "../Constants";
import { isStatusBarTextVisible } from "../managers/StatusBarManager";
import { KpmItem, UIInteractionType } from "../model/models";
import { getItem } from "../Util";

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

export function getStatusBarButtonItem() {
  const item: KpmItem = getActionButton("status bar metrics button", "Code Time", "codetime.displaySidebar");
  item.location = "ct_menu_tree";
  item.name = `ct_status_bar_metrics_btn`;
  return item;
}

export function getSwitchAccountButtonItem() {
  const item: KpmItem = getActionButton("switch account button", "Code Time", "codetime.switchAccounts");
  item.location = "ct_status_bar";
  item.name = `ct_switch_accounts_btn`;
  return item;
}

export function configureSettingsKpmItem(): KpmItem {
  const item: KpmItem = new KpmItem();
  item.name = "ct_configure_settings_btn";
  item.description = "End of day notification - configure settings";
  item.location = "ct_notification";
  item.label = "Settings";
  item.interactionType = UIInteractionType.Click;
  item.interactionIcon = null;
  item.color = null;
  return item;
}

export function showMeTheDataKpmItem(): KpmItem {
  const item: KpmItem = new KpmItem();
  item.name = "ct_show_me_the_data_btn";
  item.description = "End of day notification - Show me the data";
  item.location = "ct_notification";
  item.label = "Show me the data";
  item.interactionType = UIInteractionType.Click;
  item.interactionIcon = null;
  item.color = null;
  return item;
}
