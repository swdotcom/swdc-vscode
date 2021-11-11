import {commands, Disposable, window, ExtensionContext} from 'vscode';
import {launchWebUrl, openFileInEditor, displayReadme, launchWebDashboard, setItem} from './Util';
import {KpmManager} from './managers/KpmManager';
import {KpmItem, UIInteractionType} from './model/models';
import {showExistingAccountMenu, showSignUpAccountMenu} from './menu/AccountManager';
import {TrackerManager} from './managers/TrackerManager';
import {connectSlackWorkspace, disconnectSlackAuth, disconnectSlackWorkspace} from './managers/SlackManager';
import {app_url, create_org_url, vscode_issues_url} from './Constants';
import {toggleDarkMode, toggleDock} from './managers/OsaScriptManager';
import {switchAverageComparison} from './menu/ContextMenuManager';
import {enableFlow, pauseFlow} from './managers/FlowManager';
import {showFullScreenMode, showNormalScreenMode, showZenMode} from './managers/ScreenManager';
import {showDashboard} from './managers/WebViewManager';
import {closeSettings, configureSettings, updateSettings} from './managers/ConfigManager';
import {
  getCodeTimeDashboardButton,
  getSwitchAccountButtonItem,
  getFeedbackButton,
  getHideStatusBarMetricsButton,
  getLearnMoreButton,
  getSignUpButton,
  getViewProjectSummaryButton,
  getWebViewDashboardButton,
} from './tree/TreeButtonProvider';
import {toggleStatusBar, updateFlowModeStatusBar, updateStatusBarWithSummaryData} from './managers/StatusBarManager';
import {launchEmailSignup, launchLogin} from './user/OnboardManager';
import {CodeTimeView} from './sidebar/CodeTimeView';
import {showSlackManageOptions} from './managers/PromptManager';
import {appDelete} from './http/HttpClient';
import {progressIt} from './managers/ProgressManager';
import {diconnectIntegration} from './DataController';

export function createCommands(
  ctx: ExtensionContext,
  kpmController: KpmManager
): {
  dispose: () => void;
} {
  let cmds = [];

  const tracker: TrackerManager = TrackerManager.getInstance();

  cmds.push(kpmController);

  // INITALIZE SIDEBAR WEB VIEW PROVIDER
  const sidebar: CodeTimeView = new CodeTimeView(ctx.extensionUri);
  cmds.push(
    window.registerWebviewViewProvider('codetime.webView', sidebar, {
      webviewOptions: {
        retainContextWhenHidden: false,
      },
    })
  );

  // REFRESH EDITOR OPS SIDEBAR
  cmds.push(
    commands.registerCommand('codetime.refreshCodeTimeView', () => {
      sidebar.refresh();
    })
  );

  // DISPLAY EDITOR OPS SIDEBAR
  cmds.push(
    commands.registerCommand('codetime.displaySidebar', () => {
      // opens the sidebar manually from a the above command
      commands.executeCommand('workbench.view.extension.code-time-sidebar');
    })
  );

  // SWITCH ACCOUNT
  cmds.push(
    commands.registerCommand('codetime.switchAccount', () => {
      tracker.trackUIInteraction(getSwitchAccountButtonItem());
      showExistingAccountMenu();
    })
  );

  // SHOW WEB ANALYTICS
  cmds.push(
    commands.registerCommand('codetime.softwareKpmDashboard', (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getWebViewDashboardButton();
        item.location = 'ct_command_palette';
        item.interactionType = UIInteractionType.Keyboard;
        item.name = 'ct_web_metrics_cmd';
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      launchWebDashboard();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.createOrg', () => {
      launchWebUrl(create_org_url);
    })
  );

  // OPEN SPECIFIED FILE IN EDITOR
  cmds.push(
    commands.registerCommand('codetime.openFileInEditor', (file) => {
      openFileInEditor(file);
    })
  );

  // TOGGLE STATUS BAR METRIC VISIBILITY
  cmds.push(
    commands.registerCommand('codetime.toggleStatusBar', (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getHideStatusBarMetricsButton();
        item.location = 'ct_command_palette';
        item.interactionType = UIInteractionType.Keyboard;
        item.name = 'ct_toggle_status_bar_metrics_cmd';
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      toggleStatusBar();
      commands.executeCommand('codetime.refreshCodeTimeView');
    })
  );

  // LAUNCH EMAIL LOGIN
  cmds.push(
    commands.registerCommand('codetime.codeTimeLogin', (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getSignUpButton('email', 'grey');
        item.location = 'ct_command_palette';
        item.interactionType = UIInteractionType.Keyboard;
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      launchLogin('software', switching_account);
    })
  );

  // LAUNCH EMAIL LOGIN
  cmds.push(
    commands.registerCommand('codetime.codeTimeSignup', (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getSignUpButton('email', 'grey');
        item.location = 'ct_command_palette';
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
    commands.registerCommand('codetime.login', (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getSignUpButton('existing', 'blue');
        item.location = 'ct_command_palette';
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
    commands.registerCommand('codetime.registerAccount', (item: KpmItem, switching_account: boolean) => {
      // launch the auth selection flow
      showSignUpAccountMenu();
    })
  );

  // LAUNCH GOOGLE LOGIN
  cmds.push(
    commands.registerCommand('codetime.googleLogin', (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getSignUpButton('Google', null);
        item.location = 'ct_command_palette';
        item.interactionType = UIInteractionType.Keyboard;
        item.interactionIcon = null;
        item.color = null;
      }
      item.interactionIcon = 'google';
      tracker.trackUIInteraction(item);
      launchLogin('google', switching_account);
    })
  );

  // LAUNCH GITHUB LOGIN
  cmds.push(
    commands.registerCommand('codetime.githubLogin', (item: KpmItem, switching_account: boolean) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getSignUpButton('GitHub', 'white');
        item.location = 'ct_command_palette';
        item.interactionType = UIInteractionType.Keyboard;
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      launchLogin('github', switching_account);
    })
  );

  // SUBMIT AN ISSUE
  cmds.push(
    commands.registerCommand('codetime.submitAnIssue', (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getFeedbackButton();
        item.location = 'ct_command_palette';
        item.interactionType = UIInteractionType.Keyboard;
      }
      tracker.trackUIInteraction(item);
      launchWebUrl(vscode_issues_url);
    })
  );

  // DISPLAY README MD
  cmds.push(
    commands.registerCommand('codetime.displayReadme', (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getLearnMoreButton();
        item.location = 'ct_command_palette';
        item.interactionType = UIInteractionType.Keyboard;
        item.name = 'ct_learn_more_cmd';
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      displayReadme();
    })
  );

  // DISPLAY PROJECT METRICS REPORT
  cmds.push(
    commands.registerCommand('codetime.viewProjectReports', (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getViewProjectSummaryButton();
        item.location = 'ct_command_palette';
        item.interactionType = UIInteractionType.Keyboard;
        item.name = 'ct_project_summary_cmd';
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      launchWebUrl(`${app_url}/reports`);
    })
  );

  // DISPLAY CODETIME DASHBOARD WEBVIEW
  cmds.push(
    commands.registerCommand('codetime.viewDashboard', (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getCodeTimeDashboardButton();
        item.location = 'ct_command_palette';
        item.interactionType = UIInteractionType.Keyboard;
        item.name = 'ct_dashboard_cmd';
        item.interactionIcon = null;
        item.color = null;
      }
      tracker.trackUIInteraction(item);
      showDashboard();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.sendFeedback', (item: KpmItem) => {
      if (!item) {
        // it's from the command palette, create a kpm item so
        // it can build the ui_element in the tracker manager
        item = getFeedbackButton();
        item.location = 'ct_command_palette';
        item.interactionType = UIInteractionType.Keyboard;
      }
      tracker.trackUIInteraction(item);
      launchWebUrl('mailto:cody@software.com');
    })
  );

  cmds.push(
    commands.registerCommand('codetime.connectSlack', () => {
      connectSlackWorkspace();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.disconnectSlackWorkspace', (authId: any) => {
      if (authId) {
        disconnectSlackAuth(authId);
      } else {
        disconnectSlackWorkspace();
      }
    })
  );

  // INTEGRATION DISCONECT
  cmds.push(
    commands.registerCommand('codetime.disconnectIntegration', (payload) => {
      appDelete(`/data_sources/integration_connections/${payload.id}`).then((resp: any) => {
        progressIt('Disconnecting integration...', diconnectIntegration, [payload.id]);
      });
    })
  );

  cmds.push(
    commands.registerCommand('codetime.showZenMode', () => {
      showZenMode();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.showFullScreen', () => {
      showFullScreenMode();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.exitFullScreen', () => {
      showNormalScreenMode();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.toggleDarkMode', () => {
      toggleDarkMode();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.toggleDocPosition', () => {
      toggleDock();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.switchAverageComparison', () => {
      // launch the options command palette
      switchAverageComparison();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.enableFlowMode', () => {
      enableFlow({automated: false});
    })
  );

  cmds.push(
    commands.registerCommand('codetime.exitFlowMode', () => {
      pauseFlow();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.configureSettings', () => {
      configureSettings();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.showOrgDashboard', (org_name) => {
      launchWebUrl(`${app_url}/dashboard/devops_performance?organization_slug=${org_name}`);
    })
  );

  cmds.push(
    commands.registerCommand('codetime.skipSlackConnect', () => {
      setItem('vscode_CtskipSlackConnect', true);
      // refresh the view
      commands.executeCommand('codetime.refreshCodeTimeView');
    })
  );

  cmds.push(
    commands.registerCommand('codetime.reloadOrgs', async () => {
      commands.executeCommand('codetime.refreshCodeTimeView');
    })
  );

  cmds.push(
    commands.registerCommand('codetime.updateViewMetrics', () => {
      updateFlowModeStatusBar();
      updateStatusBarWithSummaryData();
    })
  );

  // MANAGE SLACK CONNECTION
  cmds.push(
    commands.registerCommand('codetime.manageSlackConnection', () => {
      progressIt('Manage Slack connections...', showSlackManageOptions);
    })
  );

  // Update the settings preferences
  cmds.push(
    commands.registerCommand('codetime.updateSettings', (payload: any) => {
      progressIt('Updating settings...', updateSettings, [payload.path, payload.json]);
    })
  );

  // Close the settings view
  cmds.push(
    commands.registerCommand('codetime.closeSettings', (payload: any) => {
      closeSettings();
    })
  );

  return Disposable.from(...cmds);
}
