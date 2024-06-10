import {commands, Disposable, window, ExtensionContext, authentication} from 'vscode';
import {launchWebUrl, displayReadme, setItem, showInformationMessage, getItem} from './Util';
import {KpmManager} from './managers/KpmManager';
import {KpmItem} from './model/models';
import {createAnonymousUser, showExistingAccountMenu, showSignUpAccountMenu} from './menu/AccountManager';
import {FIVE_SECONDS_IN_MILLIS, app_url, vscode_issues_url} from './Constants';
import {enableFlow, pauseFlow} from './managers/FlowManager';
import {showDashboard} from './managers/WebViewManager';
import {closeSettings, configureSettings, updateSettings} from './managers/ConfigManager';
import {toggleStatusBar, updateFlowModeStatusBar, updateStatusBarWithSummaryData} from './managers/StatusBarManager';
import {launchEmailSignup, launchLogin} from './user/OnboardManager';
import {CodeTimeView} from './sidebar/CodeTimeView';
import { progressIt } from './managers/ProgressManager';
import { LocalStorageManager } from './managers/LocalStorageManager';
import { getCachedUser, reload } from './DataController';
import { AUTH_TYPE, Auth0AuthenticationProvider } from './auth/Auth0AuthenticationProvider';

export function createCommands(
  ctx: ExtensionContext,
  kpmController: KpmManager,
  storageManager: LocalStorageManager
): {
  dispose: () => void;
} {
  let cmds = [];

  const auth0Provider = new Auth0AuthenticationProvider(ctx);
  ctx.subscriptions.push(auth0Provider);

  cmds.push(kpmController);

  // INITALIZE SIDEBAR WEB VIEW PROVIDER
  const sidebar: CodeTimeView = new CodeTimeView(ctx.extensionUri);
  cmds.push(
    commands.registerCommand('codetime.softwareKpmDashboard', () => {
      launchWebUrl(`${app_url}/dashboard/code_time`)
    })
  )

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
      showExistingAccountMenu();
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
      launchWebUrl(`${app_url}/code_time/reports`);
    })
  );

  // DISPLAY CODETIME DASHBOARD WEBVIEW
  cmds.push(
    commands.registerCommand('codetime.viewDashboard', (params: any) => {
      showDashboard(params);
    })
  );

  cmds.push(
    commands.registerCommand('codetime.connectSlack', () => {
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
      launchWebUrl(`${app_url}/organizations/new`);
    })
  );

  // show the Software.com flow mode info
  cmds.push(
    commands.registerCommand('codetime.displayFlowModeInfo', () => {
      launchWebUrl("https://www.software.com/src/auto-flow-mode");
    })
  )

  cmds.push(
    commands.registerCommand('codetime.logout', async () => {
      const user = await getCachedUser()
      if (user?.registered) {
        // clear the storage and recreate an anon user
        storageManager.clearStorage();

        // reset the user session
        await createAnonymousUser();

        // update the login status
        showInformationMessage(`Successfully logged out of your Code Time account`);
        await reload()
      }
    })
  )

  cmds.push(
    commands.registerCommand('codetime.authSignIn', async () => {
      const session = await authentication.getSession(AUTH_TYPE, [], { createIfNone: true });
      if (session) {
        const latestUpdate = getItem('updatedAt');
        if (!latestUpdate || new Date().getTime() - latestUpdate > FIVE_SECONDS_IN_MILLIS) {
          window
            .showInformationMessage(
              'You are already signed in. Would you like to switch accounts?',
              {
                modal: true,
              },
              'Switch Account'
            )
            .then(async (selection) => {
              if (selection === "Switch Account") {
                await auth0Provider.removeSession(session.account.id);
                await authentication.getSession(AUTH_TYPE, [], { createIfNone: true });
              }
            });
          return;
        }
      }
    })
  )

  cmds.push(
    authentication.onDidChangeSessions(async e => {
      await authentication.getSession(AUTH_TYPE, ['profile'], { createIfNone: false });
    })
  )

  return Disposable.from(...cmds);
}
