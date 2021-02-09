import { commands, Disposable, window, ExtensionContext } from "vscode";
import {
  launchWebUrl,
  launchLogin,
  openFileInEditor,
  displayReadmeIfNotExists,
  toggleStatusBar,
  launchEmailSignup,
  launchWebDashboard,
} from "./Util";
import { KpmManager } from "./managers/KpmManager";
import { KpmItem, UIInteractionType } from "./model/models";
import { ProjectCommitManager } from "./menu/ProjectCommitManager";
import { displayProjectContributorCommitsDashboard } from "./menu/ReportManager";
import { showExistingAccountMenu, showSwitchAccountsMenu, showSignUpAccountMenu } from "./menu/AccountManager";
import { TrackerManager } from "./managers/TrackerManager";
import { connectSlackWorkspace, disconnectSlackAuth, disconnectSlackWorkspace } from "./managers/SlackManager";
import { organizations_url, vscode_issues_url } from "./Constants";
import { toggleDarkMode, toggleDock } from "./managers/OsaScriptManager";
import { switchAverageComparison } from "./menu/ContextMenuManager";
import { enableFlow, pauseFlow } from "./managers/FlowManager";
import { showFullScreenMode, showNormalScreenMode, showZenMode } from "./managers/ScreenManager";
import { showDashboard } from "./managers/WebViewManager";
import { configureSettings } from "./managers/ConfigManager";
import {
  getCodeTimeDashboardButton,
  getContributorReportButton,
  getFeedbackButton,
  getHideStatusBarMetricsButton,
  getLearnMoreButton,
  getSignUpButton,
  getViewProjectSummaryButton,
  getWebViewDashboardButton,
} from "./tree/TreeButtonProvider";
import { CodeTimeWebviewSidebar } from "./sidebar/CodeTimeWebviewSidebar";

export function createCommands(
  ctx: ExtensionContext,
  kpmController: KpmManager
): {
  dispose: () => void;
} {
  let cmds = [];

  const tracker: TrackerManager = TrackerManager.getInstance();

  cmds.push(kpmController);

  // WEB VIEW PROVIDER
  const ctWebviewSidebar: CodeTimeWebviewSidebar = new CodeTimeWebviewSidebar(ctx.extensionUri);
  cmds.push(
    window.registerWebviewViewProvider("codetime.webView", ctWebviewSidebar, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    })
  );

  cmds.push(
    commands.registerCommand("codetime.refreshCodeTimeView", () => {
      ctWebviewSidebar.refresh();
    })
  );

  // SWITCH ACCOUNT BUTTON
  cmds.push(
    commands.registerCommand("codetime.switchAccounts", (item: KpmItem) => {
      tracker.trackUIInteraction(item);
      showSwitchAccountsMenu();
    })
  );

  // PROCESS KEYSTROKES NOW
  cmds.push(
    commands.registerCommand("codetime.processKeystrokeData", () => {
      kpmController.processKeystrokeData(true /*isUnfocus*/);
    })
  );

  // SHOW WEB ANALYTICS
  cmds.push(
    commands.registerCommand("codetime.softwareKpmDashboard", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getWebViewDashboardButton();
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.name = "ct_web_metrics_cmd";
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      launchWebDashboard();
    })
  );

  cmds.push(
    commands.registerCommand("codetime.createTeam", () => {
      launchWebUrl(organizations_url);
    })
  );

  // OPEN SPECIFIED FILE IN EDITOR
  cmds.push(
    commands.registerCommand("codetime.openFileInEditor", (file) => {
      openFileInEditor(file);
    })
  );

  // TOGGLE STATUS BAR METRIC VISIBILITY
  cmds.push(
    commands.registerCommand("codetime.toggleStatusBar", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getHideStatusBarMetricsButton();
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.name = "ct_toggle_status_bar_metrics_cmd";
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      toggleStatusBar();
    })
  );

  // LAUNCH EMAIL LOGIN
  cmds.push(
    commands.registerCommand("codetime.codeTimeLogin", (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getSignUpButton("email", "grey");
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      launchLogin("software", switching_account);
    })
  );

  // LAUNCH EMAIL LOGIN
  cmds.push(
    commands.registerCommand("codetime.codeTimeSignup", (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getSignUpButton("email", "grey");
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      launchEmailSignup(switching_account);
    })
  );

  // LAUNCH EXISTING ACCOUNT LOGIN
  cmds.push(
    commands.registerCommand("codetime.codeTimeExisting", (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getSignUpButton("existing", "blue");
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      // launch the auth selection flow
      showExistingAccountMenu();
    })
  );

  // LAUNCH SIGN UP FLOW
  cmds.push(
    commands.registerCommand("codetime.signUpAccount", (item: KpmItem, switching_account: boolean) => {
      // launch the auth selection flow
      showSignUpAccountMenu();
    })
  );

  // LAUNCH GOOGLE LOGIN
  cmds.push(
    commands.registerCommand("codetime.googleLogin", (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getSignUpButton("Google", null);
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.interactionIcon = null;
        item.color = null;
      }
      item.interactionIcon = "google";
      tracker.trackUIInteraction(item);
      launchLogin("google", switching_account);
    })
  );

  // LAUNCH GITHUB LOGIN
  cmds.push(
    commands.registerCommand("codetime.githubLogin", (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getSignUpButton("GitHub", "white");
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      launchLogin("github", switching_account);
    })
  );

  // SUBMIT AN ISSUE
  cmds.push(
    commands.registerCommand("codetime.submitAnIssue", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getFeedbackButton();
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
      }
      tracker.trackUIInteraction(item);
      launchWebUrl(vscode_issues_url);
    })
  );

  // DISPLAY README MD
  cmds.push(
    commands.registerCommand("codetime.displayReadme", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getLearnMoreButton();
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.name = "ct_learn_more_cmd";
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      displayReadmeIfNotExists(true /*override*/);
    })
  );

  // DISPLAY PROJECT METRICS REPORT
  cmds.push(
    commands.registerCommand("codetime.generateProjectSummary", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getViewProjectSummaryButton();
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.name = "ct_project_summary_cmd";
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      ProjectCommitManager.getInstance().launchViewProjectSummaryMenuFlow();
    })
  );

  // DISPLAY CODETIME DASHBOARD WEBVIEW
  cmds.push(
    commands.registerCommand("codetime.viewDashboard", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getCodeTimeDashboardButton();
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.name = "ct_dashboard_cmd";
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      showDashboard();
    })
  );

  // DISPLAY REPO COMMIT CONTRIBUTOR REPORT
  cmds.push(
    commands.registerCommand("codetime.generateContributorSummary", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getContributorReportButton(item.value);
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.name = "ct_contributor_repo_identifier_cmd";
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      displayProjectContributorCommitsDashboard(item.value);
    })
  );

  // LAUNCH COMMIT URL
  cmds.push(
    commands.registerCommand("codetime.launchCommitUrl", (item: KpmItem, commitLink: string) => {
      // this only comes from the tree view so item will be available
      tracker.trackUIInteraction(item);
      launchWebUrl(commitLink);
    })
  );

  cmds.push(
    commands.registerCommand("codetime.viewSoftwareTop40", () => {
      launchWebUrl("https://api.software.com/music/top40");
    })
  );

  cmds.push(
    commands.registerCommand("codetime.sendFeedback", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getFeedbackButton();
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
      }
      tracker.trackUIInteraction(item);
      launchWebUrl("mailto:cody@software.com");
    })
  );

  cmds.push(
    commands.registerCommand("codetime.connectSlackWorkspace", () => {
      connectSlackWorkspace();
    })
  );

  cmds.push(
    commands.registerCommand("codetime.disconnectSlackWorkspace", (authId: any) => {
      if (authId) {
        disconnectSlackAuth(authId);
      } else {
        disconnectSlackWorkspace();
      }
    })
  );

  cmds.push(
    commands.registerCommand("codetime.showZenMode", () => {
      showZenMode();
    })
  );

  cmds.push(
    commands.registerCommand("codetime.showFullScreen", () => {
      showFullScreenMode();
    })
  );

  cmds.push(
    commands.registerCommand("codetime.exitFullScreen", () => {
      showNormalScreenMode();
    })
  );

  cmds.push(
    commands.registerCommand("codetime.toggleDarkMode", () => {
      toggleDarkMode();
    })
  );

  cmds.push(
    commands.registerCommand("codetime.toggleDocPosition", () => {
      toggleDock();
    })
  );

  cmds.push(
    commands.registerCommand("codetime.switchAverageComparison", () => {
      // launch the options command palette
      switchAverageComparison();
    })
  );

  cmds.push(
    commands.registerCommand("codetime.enableFlow", () => {
      enableFlow({ automated: false });
    })
  );

  cmds.push(
    commands.registerCommand("codetime.exitFlowMode", () => {
      pauseFlow();
    })
  );

  cmds.push(
    commands.registerCommand("codetime.configureSettings", () => {
      configureSettings();
    })
  );

  return Disposable.from(...cmds);
}
