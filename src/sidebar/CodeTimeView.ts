import {
  CancellationToken,
  commands,
  Disposable,
  Event,
  EventEmitter,
  Uri,
  ViewColumn,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
} from 'vscode';
import { appGet, isResponseOk } from '../http/HttpClient';
import { getConnectionErrorHtml } from '../local/404';
import { getBooleanItem, getItem } from '../Util';
import { createAnonymousUser } from '../menu/AccountManager';
import { isStatusBarTextVisible } from '../managers/StatusBarManager';
import { getLoadingHtml } from '../local/loading';

export class CodeTimeView implements Disposable, WebviewViewProvider {
  private _webview: WebviewView | undefined;
  private _disposable: Disposable | undefined;

  constructor(private readonly _extensionUri: Uri) {
    //
  }

  public async refresh() {
    if (!this._webview) {
      // its not available to refresh yet
      return;
    }
    this._webview.webview.html = await getLoadingHtml();

    const webviewScope = this._webview.webview;
    setTimeout(async () => {
      webviewScope.html = await this.getHtml();
    }, 2000);
  }

  private _onDidClose = new EventEmitter<void>();
  get onDidClose(): Event<void> {
    return this._onDidClose.event;
  }

  // this is called when a view first becomes visible. This may happen when the view is first loaded
  // or when the user hides and then shows a view again
  public async resolveWebviewView(
    webviewView: WebviewView,
    context: WebviewViewResolveContext<unknown>,
    token: CancellationToken
  ) {
    if (!this._webview) {
      this._webview = webviewView;
    }

    this._webview.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [this._extensionUri],
    };

    this._disposable = Disposable.from(this._webview.onDidDispose(this.onWebviewDisposed, this));

    this._webview.webview.onDidReceiveMessage(async (message: any) => {
      if (message?.action) {
        const cmd = message.action.includes('codetime.') ? message.action : `codetime.${message.action}`;
        switch (message.command) {
          case 'command_execute':
            if (message.payload && Object.keys(message.payload).length) {
              commands.executeCommand(cmd, message.payload);
            } else {
              commands.executeCommand(cmd);
            }
            break;
        }
      }
    });

    if (!getItem('jwt')) {
      // the sidebar can sometimes try to render before we've created an anon user, create that first
      await createAnonymousUser();
      setTimeout(() => {
        commands.executeCommand('codetime.refreshCodeTimeView');
      }, 2000);
    } else {
      this._webview.webview.html = await this.getHtml();
    }
  }

  dispose() {
    this._disposable && this._disposable.dispose();
  }

  private onWebviewDisposed() {
    this._onDidClose.fire();
  }

  get viewColumn(): ViewColumn | undefined {
    return undefined;
  }

  get visible() {
    return this._webview ? this._webview.visible : false;
  }

  private async getHtml(): Promise<string> {
    const params = {
      showing_statusbar: isStatusBarTextVisible(),
      skip_slack_connect: !!getBooleanItem('vscode_CtskipSlackConnect'),
    };
    const resp = await appGet('/plugin/sidebar', params);
    if (isResponseOk(resp)) {
      return resp.data;
    }

    return await getConnectionErrorHtml();
  }
}
