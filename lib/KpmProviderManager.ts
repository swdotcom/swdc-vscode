import { KpmItem } from "./models";
import { isLoggedOn, serverIsAvailable } from "./DataController";
import { getSessionSummaryData } from "./OfflineManager";

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
        const serverIsOnline = await serverIsAvailable();
        const loggedInResp = await isLoggedOn(serverIsOnline);
        const sessionSummaryData = getSessionSummaryData(true /*useCache*/);

        if (!loggedInResp.loggedOn) {
            const codyConnectButton: KpmItem = this.getCodyConnectButton();
            treeItems.push(codyConnectButton);
        }

        const codetimeDashboardButton: KpmItem = this.getCodeTimeDashboardButton();
        treeItems.push(codetimeDashboardButton);

        const currentKeystrokesItem: KpmItem = this.getCurrentKeystrokesItem(
            sessionSummaryData
        );
        treeItems.push(currentKeystrokesItem);

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

    getCurrentKeystrokesItem(sessionSummaryData): KpmItem {
        const item: KpmItem = new KpmItem();
        item.tooltip = "";
        item.label = `Current KPM:    ${sessionSummaryData.currentDayKeystrokes}`;
        item.id = "current_kpm";
        item.contextValue = "metric_item";
        return item;
    }
}
