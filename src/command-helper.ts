import { commands, Disposable, workspace, window, TreeView } from "vscode";
import { launchWebDashboard, updatePreferences } from "./DataController";
import { displayCodeTimeMetricsDashboard } from "./menu/MenuManager";
import { launchWebUrl, launchLogin, openFileInEditor, displayReadmeIfNotExists, toggleStatusBar } from "./Util";
import { KpmManager } from "./managers/KpmManager";
import { KpmProvider, connectKpmTreeView } from "./tree/KpmProvider";
import { CodeTimeMenuProvider, connectCodeTimeMenuTreeView } from "./tree/CodeTimeMenuProvider";
import { KpmItem, UIInteractionType } from "./model/models";
import { KpmProviderManager } from "./tree/KpmProviderManager";
import { ProjectCommitManager } from "./menu/ProjectCommitManager";
import { CodeTimeTeamProvider, connectCodeTimeTeamTreeView } from "./tree/CodeTimeTeamProvider";
import { displayProjectContributorCommitsDashboard } from "./menu/ReportManager";
import { showExistingAccountMenu, showSwitchAccountsMenu } from "./menu/AccountManager";
import { TrackerManager } from "./managers/TrackerManager";
import { getStatusBarKpmItem } from "./storage/SessionSummaryData";
import { shareSlackMessage } from "./managers/SlackManager";

export function createCommands(
  kpmController: KpmManager
): {
  dispose: () => void;
} {
  let cmds = [];

  const tracker: TrackerManager = TrackerManager.getInstance();
  const kpmProviderMgr: KpmProviderManager = KpmProviderManager.getInstance();

  cmds.push(kpmController);

  // MENU TREE: INIT
  const codetimeMenuTreeProvider = new CodeTimeMenuProvider();
  const codetimeMenuTreeView: TreeView<KpmItem> = window.createTreeView("ct-menu-tree", {
    treeDataProvider: codetimeMenuTreeProvider,
    showCollapseAll: false,
  });
  codetimeMenuTreeProvider.bindView(codetimeMenuTreeView);
  cmds.push(connectCodeTimeMenuTreeView(codetimeMenuTreeView));

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

  // MENU TREE: REFRESH
  cmds.push(
    commands.registerCommand("codetime.refreshCodetimeMenuTree", () => {
      codetimeMenuTreeProvider.refresh();
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

  // TEAM TREE: INIT
  const codetimeTeamTreeProvider = new CodeTimeTeamProvider();
  const codetimeTeamTreeView: TreeView<KpmItem> = window.createTreeView("ct-team-tree", {
    treeDataProvider: codetimeTeamTreeProvider,
    showCollapseAll: false,
  });
  codetimeTeamTreeProvider.bindView(codetimeTeamTreeView);
  cmds.push(connectCodeTimeTeamTreeView(codetimeTeamTreeView));

  cmds.push(
    commands.registerCommand("codetime.refreshTreeViews", () => {
      codetimeMenuTreeProvider.refresh();
      kpmTreeProvider.refresh();
      codetimeTeamTreeProvider.refresh();
    })
  );

  // SHOW WEB ANALYTICS
  cmds.push(
    commands.registerCommand("codetime.softwareKpmDashboard", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = kpmProviderMgr.getWebViewDashboardButton();
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
        item = kpmProviderMgr.getHideStatusBarMetricsButton();
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
        item = kpmProviderMgr.getSignUpButton("email", "grey");
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      launchLogin("software", switching_account);
    })
  );

  // LAUNCH EXISTING ACCOUNT LOGIN
  cmds.push(
    commands.registerCommand("codetime.codeTimeExisting", (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = kpmProviderMgr.getSignUpButton("existing", "blue");
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

  // LAUNCH GOOGLE LOGIN
  cmds.push(
    commands.registerCommand("codetime.googleLogin", (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = kpmProviderMgr.getSignUpButton("Google", null);
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
        item = kpmProviderMgr.getSignUpButton("GitHub", "white");
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      launchLogin("github", switching_account);
    })
  );

  // REFRESH DAILY METRICS
  cmds.push(
    commands.registerCommand("codetime.refreshKpmTree", () => {
      kpmTreeProvider.refresh();
    })
  );

  // DISPLAY README MD
  cmds.push(
    commands.registerCommand("codetime.displayReadme", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = kpmProviderMgr.getLearnMoreButton();
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

  // DISPLAY CODE TIME METRICS REPORT
  cmds.push(
    commands.registerCommand("codetime.codeTimeMetrics", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = kpmProviderMgr.getCodeTimeDashboardButton();
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
        item.name = "ct_summary_cmd";
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      displayCodeTimeMetricsDashboard();
    })
  );

  // DISPLAY PROJECT METRICS REPORT
  cmds.push(
    commands.registerCommand("codetime.generateProjectSummary", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = kpmProviderMgr.getViewProjectSummaryButton();
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

  // DISPLAY REPO COMMIT CONTRIBUTOR REPORT
  cmds.push(
    commands.registerCommand("codetime.generateContributorSummary", (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = kpmProviderMgr.getContributorReportButton(item.value);
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
        item = kpmProviderMgr.getFeedbackButton();
        item.location = "ct_command_palette";
        item.interactionType = UIInteractionType.Keyboard;
      }
      tracker.trackUIInteraction(item);
      launchWebUrl("mailto:cody@software.com");
    })
  );

  // SELECT TEXT command
  cmds.push(
    commands.registerCommand("codetime.shareTextToSlack", () => {
      const editor = window.activeTextEditor;
      const text = editor && editor.selection ? editor.document.getText(editor.selection) : null;
      if (text) {
        shareSlackMessage(text);
      } else {
        window.showInformationMessage("Highlight and select text to share via Slack to continue.");
      }
    })
  );

  cmds.push(workspace.onDidChangeConfiguration((e) => updatePreferences()));

  return Disposable.from(...cmds);
}
