import {commands, Disposable, window, ExtensionContext} from 'vscode';
import {launchWebUrl, displayReadme, setItem} from './Util';
import {KpmManager} from './managers/KpmManager';
import {KpmItem} from './model/models';
import {showExistingAccountMenu, showSignUpAccountMenu} from './menu/AccountManager';
import {TrackerManager} from './managers/TrackerManager';
import {app_url, vscode_issues_url} from './Constants';
import {enableFlow, pauseFlow} from './managers/FlowManager';
import {showDashboard} from './managers/WebViewManager';
import {closeSettings, configureSettings, updateSettings} from './managers/ConfigManager';
import {toggleStatusBar, updateFlowModeStatusBar, updateStatusBarWithSummaryData} from './managers/StatusBarManager';
import {launchEmailSignup, launchLogin} from './user/OnboardManager';
import {CodeTimeView} from './sidebar/CodeTimeView';
import { progressIt } from './managers/ProgressManager';

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
      toggleStatusBar();
      commands.executeCommand('codetime.refreshCodeTimeView');
    })
  );

  // LAUNCH SWITCH ACCOUNT
  cmds.push(
    commands.registerCommand('codetime.switchAccount', () => {
      launchLogin('software', true);
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

  // LAUNCH EXISTING ACCOUNT LOGIN
  cmds.push(
    commands.registerCommand('codetime.login', () => {
      // launch the auth selection flow
      showExistingAccountMenu();
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

  cmds.push(
    commands.registerCommand('codetime.configureSettings', () => {
      configureSettings();
    })
  );

  cmds.push(
    commands.registerCommand('codetime.updateSidebarSettings', (payload: any) => {
      progressIt('Updating settings...', updateSettings, [payload.path, payload.json, true]);
    })
  );

  // Update the settings preferences
  cmds.push(
    commands.registerCommand('codetime.updateSettings', (payload: any) => {
      progressIt('Updating settings...', updateSettings, [payload.path, payload.json]);
    })
  );

  // show the org overview
  cmds.push(
    commands.registerCommand('codetime.showOrgDashboard', (slug: string) => {
      launchWebUrl(`${app_url}/organizations/${slug}/overview`);
    })
  );

  // show the connect org view
  cmds.push(
    commands.registerCommand('codetime.createOrg', () => {
      launchWebUrl(`${app_url}/organizations/new?`);
    })
  );

  return Disposable.from(...cmds);
}
