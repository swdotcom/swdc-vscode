import { KpmItem } from "./models";

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
        let item: KpmItem = new KpmItem();
        item.tooltip = "foo";
        item.label = "foo";
        item.name = "foo";
        item.id = "foo";
        item.command = "codetime.codeTimeMetrics";
        return [item];
    }
}
