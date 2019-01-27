// Copyright (c) 2018 Software. All Rights Reserved.

import {
    workspace,
    Uri,
    Disposable,
    EventEmitter,
    TextDocumentContentProvider
} from "vscode";
import {
    getTodaysCodeTimeStats,
    getLastWeekCodeTimeStats,
    getLastMonthCodeTimeStats,
    getCodeTimeSummary,
    getGenreSummary,
    getTopCommitFiles
} from "./DashboardUtil";

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

        let codeTimeSummaryP = getCodeTimeSummary();
        let todaysCodeTimeStatsP = getTodaysCodeTimeStats();
        let genreSummaryP = showMusicMetrics ? getGenreSummary() : null;
        let topCommitFilesP = showGitMetrics ? getTopCommitFiles() : null;
        let getLastWeekCodeTimeStatsP = getLastWeekCodeTimeStats();
        let lastMonthsCodeTimeStatsP = getLastMonthCodeTimeStats();

        this._dashboardContent = "SOFTWARE METRICs\n\n";
        this._dashboardContent += `TODAY'S SUMMARY (${new Date().toLocaleDateString()})\n\n`;
        this._dashboardContent += await codeTimeSummaryP;
        this._dashboardContent += await todaysCodeTimeStatsP;

        this._dashboardContent += "LAST WEEK'S SUMMARY\n\n";
        this._dashboardContent += await getLastWeekCodeTimeStatsP;
        if (genreSummaryP) {
            this._dashboardContent += await genreSummaryP;
        }
        if (topCommitFilesP) {
            this._dashboardContent += await topCommitFilesP;
        }

        this._dashboardContent += `LAST MONTH'S SUMMARY\n\n`;
        this._dashboardContent += await lastMonthsCodeTimeStatsP;
        this._dashboardContent += "\n";

        return this._dashboardContent;
    }

    public async provideTextDocumentContent(uri: Uri): Promise<string> {
        if (this._dashboardContent) {
            return this._dashboardContent;
        }
        return await this.getDashboardContent();
    }
}
