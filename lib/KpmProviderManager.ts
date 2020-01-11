import { KpmItem, SessionSummary } from "./models";
import {
    isLoggedOn,
    serverIsAvailable,
    getCachedLoggedInState
} from "./DataController";
import { getSessionSummaryData } from "./OfflineManager";
import { humanizeMinutes } from "./Util";

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
        const treeItems: KpmItem[] = [];
        const loggedInCachState = await getCachedLoggedInState();
        const sessionSummaryData: SessionSummary = getSessionSummaryData();

        if (!loggedInCachState.loggedOn) {
            const codyConnectButton: KpmItem = this.getCodyConnectButton();
            treeItems.push(codyConnectButton);
        }

        const codetimeDashboardButton: KpmItem = this.getCodeTimeDashboardButton();
        treeItems.push(codetimeDashboardButton);

        const currentKeystrokesItems: KpmItem[] = this.getSessionSummaryItems(
            sessionSummaryData
        );
        treeItems.push(...currentKeystrokesItems);

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
        items.push(this.buildSessionSummaryItrem("Time", codeHours));

        items.push(
            this.buildSessionSummaryItrem(
                "Keystrokes",
                data.currentDayKeystrokes
            )
        );

        items.push(
            this.buildSessionSummaryItrem(
                "Chars +",
                data.currentCharactersAdded
            )
        );
        items.push(
            this.buildSessionSummaryItrem(
                "Chars -",
                data.currentCharactersDeleted
            )
        );
        return items;
    }

    buildSessionSummaryItrem(label, value) {
        const item: KpmItem = new KpmItem();
        item.label = `${label}: ${value}`;
        item.id = `${label}_metric`;
        item.contextValue = "metric_item";
        return item;
    }

    getInsertionsItem(sessionSummaryData): KpmItem {
        const item: KpmItem = new KpmItem();
        item.tooltip = "";
        item.label = `Insertions: ${sessionSummaryData.currentDayKeystrokes}`;
        item.id = "current_insertions";
        item.contextValue = "metric_item";
        return item;
    }

    getDeletionsItem(sessionSummaryData): KpmItem {
        const item: KpmItem = new KpmItem();
        item.tooltip = "";
        item.label = `Deletions: ${sessionSummaryData.currentDayKeystrokes}`;
        item.id = "current_deletions";
        item.contextValue = "metric_item";
        return item;
    }
}
