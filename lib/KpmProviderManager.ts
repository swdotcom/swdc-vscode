import {
    KpmItem,
    SessionSummary,
    LoggedInState,
    FileChangeInfo
} from "./models";
import { getCachedLoggedInState } from "./DataController";
import { getSessionSummaryData, getFileChangeInfoMap } from "./OfflineManager";
import { humanizeMinutes, getWorkspaceFolders } from "./Util";
import { getCurrentChanges } from "./KpmRepoManager";
import { WorkspaceFolder } from "vscode";

export class KpmProviderManager {
    private static instance: KpmProviderManager;

    constructor() {
        //
    }

    static getInstance(): KpmProviderManager {
        if (!KpmProviderManager.instance) {
            KpmProviderManager.instance = new KpmProviderManager();
        }

        return KpmProviderManager.instance;
    }

    async getTreeParents(): Promise<KpmItem[]> {
        const folders: WorkspaceFolder[] = getWorkspaceFolders();
        const treeItems: KpmItem[] = [];
        const loggedInCachState: LoggedInState = await getCachedLoggedInState();
        const sessionSummaryData: SessionSummary = getSessionSummaryData();

        if (!loggedInCachState.loggedIn) {
            treeItems.push(this.getCodyConnectButton());
        } else {
            // show the web dashboard button
            treeItems.push(this.getWebViewDashboardButton());
        }

        // codetime metrics editor dashboard
        treeItems.push(this.getCodeTimeDashboardButton());

        treeItems.push(this.getLineBreakItem());

        // get the session summary data
        const currentKeystrokesItems: KpmItem[] = this.getSessionSummaryItems(
            sessionSummaryData
        );

        // show the metrics per line
        treeItems.push(...currentKeystrokesItems);

        const fileChangeInfoMap = getFileChangeInfoMap();
        const filesChanged = fileChangeInfoMap
            ? Object.keys(fileChangeInfoMap).length
            : 0;
        if (filesChanged > 0) {
            treeItems.push(this.buildMetricItem("Files changed", filesChanged));
        }

        // show the git insertions and deletions
        if (folders && folders.length > 0) {
            treeItems.push(this.getLineBreakItem());
            for (let i = 0; i < folders.length; i++) {
                const workspaceFolder = folders[i];
                const { insertions, deletions } = await getCurrentChanges(
                    workspaceFolder.uri.fsPath
                );
                // get the folder name from the path
                const name = workspaceFolder.name;

                treeItems.push(this.buildTitleItem(name, "folder.svg"));

                treeItems.push(
                    this.buildMetricItem("Insertion(s)", insertions)
                );
                treeItems.push(this.buildMetricItem("Deletion(s)", deletions));
            }
        }

        // get the file change info
        if (filesChanged) {
            treeItems.push(this.getLineBreakItem());

            // turn this into an array
            const fileChangeInfos = Object.keys(fileChangeInfoMap).map(key => {
                return fileChangeInfoMap[key];
            });

            // show the file with the highest kpm (desc)
            const kpmSortedArray = fileChangeInfos.sort(
                (a: FileChangeInfo, b: FileChangeInfo) => b.kpm - a.kpm
            );
            treeItems.push(this.buildTitleItem("Highest KPM", "medal.svg"));
            treeItems.push(this.buildFileItem(kpmSortedArray[0].fsPath));
            treeItems.push(
                this.buildMetricItem("KPM", kpmSortedArray[0].kpm.toFixed(1))
            );

            treeItems.push(this.buildTitleItem("Largest File", "medal.svg"));
            const lengthSortedArray = fileChangeInfos.sort(
                (a: FileChangeInfo, b: FileChangeInfo) => b.length - a.length
            );
            treeItems.push(this.buildFileItem(lengthSortedArray[0].fsPath));
            treeItems.push(
                this.buildMetricItem("Characters", lengthSortedArray[0].length)
            );

            treeItems.push(
                this.buildTitleItem("Longest Keystroke Time", "medal.svg")
            );
            const durationSortedArray = fileChangeInfos.sort(
                (a: FileChangeInfo, b: FileChangeInfo) =>
                    b.duration_seconds - a.duration_seconds
            );
            treeItems.push(this.buildFileItem(durationSortedArray[0].fsPath));
            const duration_minutes =
                durationSortedArray[0].duration_seconds / 60;
            const codeHours = humanizeMinutes(duration_minutes);
            treeItems.push(this.buildMetricItem("Time", codeHours));
        }

        return treeItems;
    }

    getCodyConnectButton(): KpmItem {
        const item: KpmItem = new KpmItem();
        item.tooltip =
            "To see your coding data in Code Time, please connect to your account";
        item.label = "Connect";
        item.id = "connect";
        item.command = "codetime.codeTimeLogin";
        item.icon = "sw-paw-circle.svg";
        item.contextValue = "action_button";
        return item;
    }

    getWebViewDashboardButton(): KpmItem {
        const item: KpmItem = new KpmItem();
        item.tooltip = "See rich data visualizations in the web app";
        item.label = "Web Dashboard";
        item.id = "connect";
        item.command = "codetime.softwareKpmDashboard";
        item.icon = "sw-paw-circle.svg";
        item.contextValue = "action_button";
        return item;
    }

    getLineBreakItem(): KpmItem {
        const item: KpmItem = new KpmItem();
        item.id = "linebreak";
        item.label = "---------------------";
        item.contextValue = "linebreak";
        // item.icon = "blue-line-96.png";
        return item;
    }

    getCodeTimeDashboardButton(): KpmItem {
        const item: KpmItem = new KpmItem();
        item.tooltip =
            "View your latest coding metrics right here in your editor";
        item.label = "Code Time Dashboard";
        item.id = "dashboard";
        item.command = "codetime.codeTimeMetrics";
        item.icon = "activity.svg";
        item.contextValue = "action_button";
        return item;
    }

    getSessionSummaryItems(data: SessionSummary): KpmItem[] {
        const items: KpmItem[] = [];

        const codeHours = humanizeMinutes(data.currentDayMinutes);
        items.push(this.buildMetricItem("Time", codeHours));

        items.push(
            this.buildMetricItem("Keystrokes", data.currentDayKeystrokes)
        );

        items.push(
            this.buildMetricItem("Chars added", data.currentCharactersAdded)
        );
        items.push(
            this.buildMetricItem("Chars removed", data.currentCharactersDeleted)
        );

        items.push(this.buildMetricItem("Lines added", data.currentLinesAdded));
        items.push(
            this.buildMetricItem("Lines removed", data.currentLinesRemoved)
        );

        items.push(this.buildMetricItem("Copy+paste", data.currentPastes));
        return items;
    }

    buildMetricItem(label, value) {
        const item: KpmItem = new KpmItem();
        item.label = `${label}: ${value}`;
        item.id = `${label}_metric`;
        item.contextValue = "metric_item";
        return item;
    }

    buildTitleItem(label, icon = null) {
        const item: KpmItem = new KpmItem();
        item.label = label;
        item.id = `${label}_title`;
        item.contextValue = "title_item";
        item.icon = icon;
        return item;
    }

    buildFileItem(label, icon = null) {
        const item: KpmItem = new KpmItem();
        item.command = "codetime.openFileInEditor";
        item.commandArgs = [label];
        item.label = label;
        item.id = `${label}_file`;
        item.contextValue = "file_item";
        item.icon = icon;
        return item;
    }
}
