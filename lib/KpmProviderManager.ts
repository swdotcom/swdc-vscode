import { KpmItem, SessionSummary, LoggedInState } from "./models";
import { getCachedLoggedInState } from "./DataController";
import { getSessionSummaryData } from "./OfflineManager";
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
        }

        treeItems.push(this.getCodeTimeDashboardButton());

        treeItems.push(this.getLineBreakItem());

        const currentKeystrokesItems: KpmItem[] = this.getSessionSummaryItems(
            sessionSummaryData
        );
        treeItems.push(...currentKeystrokesItems);

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

    getLineBreakItem(): KpmItem {
        const item: KpmItem = new KpmItem();
        item.id = "linebreak";
        item.contextValue = "linebreak";
        item.icon = "blue-line-96.png";
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
}
