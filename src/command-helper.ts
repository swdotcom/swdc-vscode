import { commands, Disposable, workspace, window, TreeView } from "vscode";
import { launchWebDashboard } from "./DataController";
import { launchWebUrl, launchLogin, openFileInEditor, displayReadmeIfNotExists, toggleStatusBar, launchEmailSignup } from "./Util";
import { KpmManager } from "./managers/KpmManager";
import { KpmProvider, connectKpmTreeView } from "./tree/KpmProvider";
import { CodeTimeMenuProvider, connectCodeTimeMenuTreeView } from "./tree/CodeTimeMenuProvider";
import { KpmItem, UIInteractionType } from "./model/models";
import { ProjectCommitManager } from "./menu/ProjectCommitManager";
import { displayProjectContributorCommitsDashboard } from "./menu/ReportManager";
import { showExistingAccountMenu, showSwitchAccountsMenu, showSignUpAccountMenu } from "./menu/AccountManager";
import { TrackerManager } from "./managers/TrackerManager";
import { getStatusBarKpmItem } from "./storage/SessionSummaryData";
import {
  connectSlackWorkspace,
  disconnectSlackAuth,
  disconnectSlackWorkspace,
  clearSlackInfoCache,
} from "./managers/SlackManager";
import { vscode_issues_url } from "./Constants";
import { CodeTimeFlowProvider, connectCodeTimeFlowTreeView } from "./tree/CodeTimeFlowProvider";
import { toggleDarkMode, toggleDock } from "./managers/OsaScriptManager";
import { switchAverageComparison } from "./menu/ContextMenuManager";
import { enableFlow, pauseFlow } from "./managers/FlowManager";
import {
  FULL_SCREEN_MODE_ID,
  getScreenMode,
  NORMAL_SCREEN_MODE,
  showFullScreenMode,
  showNormalScreenMode,
  showZenMode,
  ZEN_MODE_ID,
} from "./managers/ScreenManager";
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

export function createCommands(
  kpmController: KpmManager
): {
  dispose: () => void;
} {
  let cmds = [];

  const tracker: TrackerManager = TrackerManager.getInstance();

  cmds.push(kpmController);

  // MENU TREE: INIT
  const codetimeMenuTreeProvider = new CodeTimeMenuProvider();
  const codetimeMenuTreeView: TreeView<KpmItem> = window.createTreeView("ct-menu-tree", {
    treeDataProvider: codetimeMenuTreeProvider,
    showCollapseAll: false,
  });
  codetimeMenuTreeProvider.bindView(codetimeMenuTreeView);
  cmds.push(connectCodeTimeMenuTreeView(codetimeMenuTreeView));

  // FLOW TREE: INIT
  const codetimeNormalModeFlowTreeProvider = new CodeTimeFlowProvider(NORMAL_SCREEN_MODE);
  const codetimeNormalModeFlowTreeView: TreeView<KpmItem> = window.createTreeView("ct-flow-tree", {
    treeDataProvider: codetimeNormalModeFlowTreeProvider,
    showCollapseAll: false,
  });
  codetimeNormalModeFlowTreeProvider.bindView(codetimeNormalModeFlowTreeView);
  cmds.push(connectCodeTimeFlowTreeView(codetimeNormalModeFlowTreeProvider, codetimeNormalModeFlowTreeView, NORMAL_SCREEN_MODE));

  // FULL SCREEN FLOW TREE: INIT
  const codetimeFullScreenFlowTreeProvider = new CodeTimeFlowProvider(FULL_SCREEN_MODE_ID);
  const codetimeFullScreenFlowTreeView: TreeView<KpmItem> = window.createTreeView("ct-fullscreen-flow-tree", {
    treeDataProvider: codetimeFullScreenFlowTreeProvider,
    showCollapseAll: false,
  });
  codetimeFullScreenFlowTreeProvider.bindView(codetimeFullScreenFlowTreeView);
  cmds.push(connectCodeTimeFlowTreeView(codetimeFullScreenFlowTreeProvider, codetimeFullScreenFlowTreeView, FULL_SCREEN_MODE_ID));

  // ZEN SCREEN FLOW TREE: INIT
  const codetimeZenModeFlowTreeProvider = new CodeTimeFlowProvider(ZEN_MODE_ID);
  const codetimeZenModeFlowTreeView: TreeView<KpmItem> = window.createTreeView("ct-zenmode-flow-tree", {
    treeDataProvider: codetimeZenModeFlowTreeProvider,
    showCollapseAll: false,
  });
  codetimeZenModeFlowTreeProvider.bindView(codetimeZenModeFlowTreeView);
  cmds.push(connectCodeTimeFlowTreeView(codetimeZenModeFlowTreeProvider, codetimeZenModeFlowTreeView, ZEN_MODE_ID));

  // STATUS BAR CLICK - MENU TREE REVEAL
  cmds.push(
    commands.registerCommand("codetime.displayTree", () => {
      const item: KpmItem = getStatusBarKpmItem();
      tracker.trackUIInteraction(item);
      codetimeMenuTreeProvider.revealTree();
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

  // DAILY METRICS TREE: INIT
  const kpmTreeProvider = new KpmProvider();
  const kpmTreeView: TreeView<KpmItem> = window.createTreeView("ct-metrics-tree", {
    treeDataProvider: kpmTreeProvider,
    showCollapseAll: false,
  });
  kpmTreeProvider.bindView(kpmTreeView);
  cmds.push(connectKpmTreeView(kpmTreeView));

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
      setTimeout(() => {
        commands.executeCommand("codetime.refreshCodetimeMenuTree");
      }, 500);
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

  // REFRESH ALL TREE VIEWS
  cmds.push(
    commands.registerCommand("codetime.refreshTreeViews", () => {
      // run the specific commands as each command may have its own specific logic to perform
      commands.executeCommand("codetime.refreshCodetimeMenuTree");
      // commands.executeCommand("codetime.refreshFlowTree");
      commands.executeCommand("codetime.refreshKpmTree");
    })
  );

  // REFRESH DAILY METRICS
  cmds.push(
    commands.registerCommand("codetime.refreshKpmTree", () => {
      kpmTreeProvider.refresh();
    })
  );

  // MENU TREE: REFRESH
  cmds.push(
    commands.registerCommand("codetime.refreshCodetimeMenuTree", () => {
      codetimeMenuTreeProvider.refresh();
    })
  );

  // FLOW TREE: REFRESH
  cmds.push(
    commands.registerCommand("codetime.refreshFlowTree", () => {
      // clear the cache items to force a fetch from the Slack API
      clearSlackInfoCache();
      const screenMode = getScreenMode();

      if (screenMode === NORMAL_SCREEN_MODE) {
        // refresh the flow tree provider
        codetimeNormalModeFlowTreeProvider.refresh();
      } else if (screenMode === FULL_SCREEN_MODE_ID) {
        codetimeFullScreenFlowTreeProvider.refresh();
      } else {
        codetimeZenModeFlowTreeProvider.refresh();
      }
    })
  );

  // FLOW TREE: SCHEDULE REFRESH
  cmds.push(
    commands.registerCommand("codetime.scheduleFlowRefresh", () => {
      // clear the cache items to force a fetch from the Slack API
      clearSlackInfoCache();
      codetimeNormalModeFlowTreeProvider.scheduleRefresh();
      codetimeFullScreenFlowTreeProvider.scheduleRefresh();
      codetimeZenModeFlowTreeProvider.scheduleRefresh();
    })
  );

  // SUBMIT AN ISSUE
  cmds.push(
    commands.registerCommand("codetime.submitOnIssue", (item: KpmItem) => {
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
    commands.registerCommand("codetime.disconnectSlackWorkspace", (kptmItem: any) => {
      if (kptmItem && kptmItem.value) {
        disconnectSlackAuth(kptmItem.value);
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
      enableFlow({automated: false});
    })
  );

  cmds.push(
    commands.registerCommand("codetime.pauseFlow", () => {
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
