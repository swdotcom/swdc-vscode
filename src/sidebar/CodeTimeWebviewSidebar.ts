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
} from "vscode";
import path = require("path");
import fs = require("fs");
import { getItem } from "../Util";
import { hasSlackWorkspaces } from "../managers/SlackManager";
import { isFlowModEnabled } from "../managers/FlowManager";
import { getReactData } from "./ReactData";

export class CodeTimeWebviewSidebar implements Disposable, WebviewViewProvider {
  private _webview: WebviewView | undefined;
  private _disposable: Disposable | undefined;

  constructor(private readonly _extensionUri: Uri) {
    //
  }

  public async refresh() {
    this._webview.webview.html = await this.getHtml();
  }

  private _onDidClose = new EventEmitter<void>();
  get onDidClose(): Event<void> {
    return this._onDidClose.event;
  }

  // this is called when a view first becomes visible. This may happen when teh view is first loaded
  // or when teh user hides and then shows a view again
  public async resolveWebviewView(webviewView: WebviewView, context: WebviewViewResolveContext<unknown>, token: CancellationToken) {
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

    this._webview.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "command_execute":
          commands.executeCommand(message.action);
          break;
        // case "showDashboard":
        //   commands.executeCommand("codetime.viewDashboard");
        //   break;
        // case "showProjectSummary":
        //   commands.executeCommand("codetime.generateProjectSummary");
        //   break;
        // case "accountLogIn":
        //   commands.executeCommand("codetime.codeTimeExisting");
        //   break;
        // case "accountSignUp":
        //   commands.executeCommand("codetime.signUpAccount");
        //   break;
        // case "enterFlowMode":
        //   commands.executeCommand("codetime.enterFlowMode");
        //   break;
        // case "exitFlowMode":
        //   commands.executeCommand("codetime.exitFlowMode");
        //   break;
        // case "connectSlackWorkspace":
        //   commands.executeCommand("codetime.connectSlackWorkspace");
        //   break;
      }
    });

    this._webview.webview.html = await this.getReactHtml();
  }

  private getReactHtml(): string {
    const reactAppPathOnDisk = Uri.file(path.join(__dirname, "webviewSidebar.js"));
    const reactAppUri = reactAppPathOnDisk.with({ scheme: "vscode-resource" });
    const stateData = JSON.stringify(getReactData());

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Config View</title>
          <meta http-equiv="Content-Security-Policy"
                      content="default-src 'none';
                              img-src https:;
                              script-src 'unsafe-eval' 'unsafe-inline' vscode-resource:;
                              style-src vscode-resource: 'unsafe-inline';">
          <script>
            window.acquireVsCodeApi = acquireVsCodeApi;
            window.stateData = ${stateData}
          </script>
      </head>
      <body>
          <div id="root"></div>
          <script src="${reactAppUri}"></script>
      </body>
      </html>`;
  }

  private async getHtml(): Promise<string> {
    const currentSetupHtml = this.getCurrentSetupHtml();
    const flowModeHtml = this.getFlowModeHtml();

    return `<!DOCTYPE html>
	  <html lang="en">
		  <head>
			  <meta http-equiv="Content-type" content="text/html;charset=UTF-8" />
        <style>${this.getCss()}</style>
			  <title>CodeTime</title>
		  </head>
	  
		  <body class="codestream">
			  <div id="app">
          ${currentSetupHtml}
          <div class="row">
            Flow Mode
          </div>
          ${flowModeHtml}
          <div class="row">
            <div class="linebreak"></div>
          </div>
          <div class="row textbutton">
            <a href="#" id="ct_dashboard">Dashboard</a>
          </div>
          <div class="row textbutton">
            <a href="#" id="ct_projectsummary">Project summary</a>
          </div>
          <div class="row textbutton">
            <a href="https://app.software.com/dashboard">More data at Software.com</a>
          </div>
			  </div>
		  </body>
      <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener("load", () => {
          const loginButton = document.getElementById("ct_login");
          const signupButton = document.getElementById("ct_signup");
          const projectSummaryButton = document.getElementById("ct_projectsummary");
          const dashboardButton = document.getElementById("ct_dashboard")
          const enterFlowModeButton = document.getElementById("ct_enter_flowmode");
          const exitFlowModeButton = document.getElementById("ct_exit_flowmode");
          const connectSlackWorkspaceButton = document.getElementById("ct_connect_slack_workspace");

          // add the onclick events
          loginButton.addEventListener("click", function() {
            vscode.postMessage({ command: "accountLogIn" });
          });

          signupButton.addEventListener("click", function() {
            vscode.postMessage({ command: "accountSignUp" });
          });

          projectSummaryButton.addEventListener("click", function() {
            vscode.postMessage({ command: "showProjectSummary" });
          });

          dashboardButton.addEventListener("click", function() {
            vscode.postMessage({ command: "showDashboard" });
          });

          enterFlowModeButton.addEventListener("click", function() {
            vscode.postMessage({ command: "enterFlowMode" });
          });

          exitFlowModeButton.addEventListener("click", function() {
            vscode.postMessage({ command: "exitFlowMode" });
          });

          connectSlackWorkspaceButton.addEventListener("click", function() {
            vscode.postMessage({ command: "connectSlackWorkspace" })
          });
        });
    </script>
	  </html>`;
  }

  private getCss() {
    return fs.readFileSync(path.join(__dirname, "resources", "css", "base.css")).toString();
  }

  private getCurrentSetupHtml() {
    // if the user hasn't registered, show the registration button
    if (!getItem("name")) {
      return `<div class="row">
          Setup
        </div>
        <div class="row">
          <button id="ct_signup">Register your account</button>
        </div>
        <div class="row">
          or <a href="#" id="ct_login">log in</a> to your account
        </div>
        ${this.getLineBreak()}
        `;
    } else if (!hasSlackWorkspaces()) {
      // if the user hasn't connected slack, show the connect slack button
      return `<div class="row">
          Setup
        </div>
        <div class="row">
          <button id="ct_connect_slack_workspace">Connect a Slack workspace</button>
        </div>
        ${this.getLineBreak()}`;
    }
    return "";
  }

  private getLineBreak() {
    return `<div class="row"><div class="linebreak"></div></div>`;
  }

  private getFlowModeHtml() {
    if (isFlowModEnabled()) {
      return `<div class="row">
            <button id="ct_exit_flowmode">Exit Flow Mode</button>
          </div>`;
    }
    return `<div class="row">
            <button id="ct_enter_flowmode">Enter Flow Mode</button>
          </div>`;
  }

  dispose() {
    this._disposable && this._disposable.dispose();
  }

  private onWebviewDisposed() {
    this._onDidClose.fire();
  }

  get viewColumn(): ViewColumn | undefined {
    return undefined; // this._view._panel.viewColumn;
  }

  get visible() {
    return this._webview ? this._webview.visible : false; // this._panel.visible;
  }
}
