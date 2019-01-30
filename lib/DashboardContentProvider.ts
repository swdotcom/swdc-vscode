// Copyright (c) 2018 Software. All Rights Reserved.

import {
    workspace,
    Uri,
    Disposable,
    EventEmitter,
    TextDocumentContentProvider
} from "vscode";
import { softwareGet } from "./HttpClient";
import { getItem } from "./Util";

export default class DashboardContentProvider
    implements TextDocumentContentProvider {
    // private attributes
    private _onDidChange = new EventEmitter<Uri>();
    private _dashboardContent: string = null;
    private _subscriptions: Disposable;

    constructor(uri) {
        workspace.registerTextDocumentContentProvider(uri, this);
    }

    dispose() {
        this._subscriptions.dispose();
        this._onDidChange.dispose();
    }

    get onDidChange() {
        return this._onDidChange.event;
    }

    update(uri: Uri) {
        this._onDidChange.fire(uri);
    }

    public async getDashboardContent() {
        let showMusicMetrics = workspace
            .getConfiguration("feature")
            .get("showMusicMetrics");
        let showGitMetrics = workspace
            .getConfiguration("feature")
            .get("showGitMetrics");

        const NO_DATA = "SOFTWARE.COM DASHBOARD\n\n No data available\n";

        const dashboardSummary = await softwareGet(
            `/dashboard?showMusic=${showMusicMetrics}&showGit=${showGitMetrics}`,
            getItem("jwt")
        );
        return (this._dashboardContent =
            dashboardSummary && dashboardSummary.data
                ? dashboardSummary.data
                : NO_DATA);
    }

    public async provideTextDocumentContent(uri: Uri): Promise<string> {
        if (this._dashboardContent) {
            return this._dashboardContent;
        }
        return await this.getDashboardContent();
    }
}
