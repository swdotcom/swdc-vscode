// Copyright (c) 2018 Software. All Rights Reserved.

import {
    workspace,
    Uri,
    Disposable,
    EventEmitter,
    TextDocumentContentProvider
} from "vscode";
import {
    getLastWeekCodeTimeStats,
    getLastMonthCodeTimeStats,
    getCodeTimeSummary,
    getGenreSummary,
    getTopCommitFiles,
    getWeeklyTopProjects,
    getYesterdayCodeTimeStats,
    getUserRankings,
    getAllTimeCodeTimeStatsData,
    buildCodeTimeStatsFromData
} from "./DashboardUtil";
import { getSectionHeader } from "./Util";

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
        let weeklyTopProjectsP = getWeeklyTopProjects();
        // let todaysCodeTimeStatsP = getTodaysCodeTimeStats();
        let genreSummaryP = showMusicMetrics ? getGenreSummary() : null;
        let topCommitFilesP = showGitMetrics ? getTopCommitFiles() : null;
        let yesterdayCodeTimeStatsP = getYesterdayCodeTimeStats();
        let lastWeekCodeTimeStatsP = getLastWeekCodeTimeStats();
        let lastMonthsCodeTimeStatsP = getLastMonthCodeTimeStats();
        let allTimeCodeTimeStatsP = getAllTimeCodeTimeStatsData();
        let userRankingsP = getUserRankings();

        this._dashboardContent = "SOFTWARE.COM DASHBOARD\n\n";

        // today
        let today = new Date();
        this._dashboardContent += getSectionHeader(
            `Today (${today.toLocaleDateString()})`
        );

        this._dashboardContent += await codeTimeSummaryP;

        // yesterday
        let yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        this._dashboardContent += getSectionHeader(
            `Yesterday (${yesterday.toLocaleDateString()})`
        );
        this._dashboardContent += await yesterdayCodeTimeStatsP;

        // last week
        let lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        this._dashboardContent += getSectionHeader(
            `Last week (${lastWeek.toLocaleDateString()} - ${today.toLocaleDateString()})`
        );
        this._dashboardContent += await lastWeekCodeTimeStatsP;
        if (genreSummaryP) {
            this._dashboardContent += await genreSummaryP;
        }
        if (topCommitFilesP) {
            this._dashboardContent += await topCommitFilesP;
        }
        this._dashboardContent += await weeklyTopProjectsP;
        this._dashboardContent += await userRankingsP;

        let allTimeCodeTimeStats = await allTimeCodeTimeStatsP;

        // get the "from" time from one of the items
        if (
            allTimeCodeTimeStats &&
            allTimeCodeTimeStats.data &&
            allTimeCodeTimeStats.data.length > 0
        ) {
            let from = parseInt(allTimeCodeTimeStats.data[0].from, 10) * 1000;
            let fromDate = new Date(from);
            this._dashboardContent += getSectionHeader(
                `All-time (${fromDate.toLocaleDateString()} - ${today.toLocaleDateString()})`
            );
            this._dashboardContent += await buildCodeTimeStatsFromData(
                allTimeCodeTimeStats.data
            );
        } else {
            this._dashboardContent += getSectionHeader(`All-time`);
            this._dashboardContent +=
                "  No all-time code time stats available\n";
        }
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
