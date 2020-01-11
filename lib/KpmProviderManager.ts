import { KpmItem } from "./models";
import { isLoggedOn, serverIsAvailable } from "./DataController";

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

        if (!loggedInResp.loggedOn) {
            const codyConnectButton: KpmItem = this.getCodyConnectButton();
            treeItems.push(codyConnectButton);
        }

        const keystrokesCountButton: KpmItem = this.getKeystrokeCountButton();
        treeItems.push(keystrokesCountButton);

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

    getKeystrokeCountButton(): KpmItem {
        const item: KpmItem = new KpmItem();
        item.tooltip =
            "View your latest coding metrics right here in your editor";
        item.label = "Code Time Dashboard";
        item.id = "dashboard";
        item.command = "codetime.codeTimeMetrics";
        item.icon = "activity.svg";
        item.contextValue = "metric_item";
        return item;
    }
}
