import {commands, Disposable, window, ExtensionContext} from 'vscode';
import {launchWebUrl, displayReadme, setItem} from './Util';
import {KpmManager} from './managers/KpmManager';
import {KpmItem} from './model/models';
import {showSignUpAccountMenu} from './menu/AccountManager';
import {TrackerManager} from './managers/TrackerManager';
import {app_url, vscode_issues_url} from './Constants';
import {enableFlow, pauseFlow} from './managers/FlowManager';
import {showDashboard} from './managers/WebViewManager';
import {closeSettings} from './managers/ConfigManager';
import {toggleStatusBar, updateFlowModeStatusBar, updateStatusBarWithSummaryData} from './managers/StatusBarManager';
import {launchEmailSignup, launchLogin} from './user/OnboardManager';
import {CodeTimeView} from './sidebar/CodeTimeView';
import { getHideStatusBarMetricsButton } from './events/KpmItems';

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

  // TOGGLE STATUS BAR METRIC VISIBILITY
  cmds.push(
    commands.registerCommand('codetime.toggleStatusBar', () => {
      tracker.trackUIInteraction(getHideStatusBarMetricsButton());
      toggleStatusBar();
      commands.executeCommand('codetime.refreshCodeTimeView');
    })
  );

  // LAUNCH EMAIL LOGIN
  cmds.push(
    commands.registerCommand('codetime.codeTimeLogin', (item: KpmItem, switching_account: boolean) => {
      launchLogin('software', switching_account);
    })
  );

  // LAUNCH EMAIL LOGIN
  cmds.push(
    commands.registerCommand('codetime.codeTimeSignup', (item: KpmItem, switching_account: boolean) => {
      launchEmailSignup(switching_account);
    })
  );

  // LAUNCH SIGN UP FLOW
  cmds.push(
    commands.registerCommand('codetime.registerAccount', () => {
      // launch the auth selection flow
      showSignUpAccountMenu();
    })
  );

  // LAUNCH GOOGLE LOGIN
  cmds.push(
    commands.registerCommand('codetime.googleLogin', (item: KpmItem, switching_account: boolean) => {
      launchLogin('google', switching_account);
    })
  );

  // LAUNCH GITHUB LOGIN
  cmds.push(
    commands.registerCommand('codetime.githubLogin', (item: KpmItem, switching_account: boolean) => {
      launchLogin('github', switching_account);
    })
  );

  // SUBMIT AN ISSUE
  cmds.push(
    commands.registerCommand('codetime.submitAnIssue', (item: KpmItem) => {
      launchWebUrl(vscode_issues_url);
    })
  );

  // DISPLAY README MD
  cmds.push(
    commands.registerCommand('codetime.displayReadme', () => {
      displayReadme();
    })
  );

  // DISPLAY PROJECT METRICS REPORT
  cmds.push(
    commands.registerCommand('codetime.viewProjectReports', () => {
      launchWebUrl(`${app_url}/reports`);
    })
  );

  // DISPLAY CODETIME DASHBOARD WEBVIEW
  cmds.push(
    commands.registerCommand('codetime.viewDashboard', () => {
      showDashboard();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.connectSlack', () => {
      launchWebUrl(`${app_url}/data_sources/integration_types/slack`);
    })
  );

  cmds.push(
    commands.registerCommand('codetime.disconnectSlackWorkspace', (auth_id: any) => {
      launchWebUrl(`${app_url}/data_sources/integration_types/slack`);
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
    commands.registerCommand('codetime.manageSlackConnection', () => {
      launchWebUrl(`${app_url}/data_sources/integration_types/slack`);
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
    commands.registerCommand('codetime.updateViewMetrics', () => {
      updateFlowModeStatusBar();
      updateStatusBarWithSummaryData();
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
