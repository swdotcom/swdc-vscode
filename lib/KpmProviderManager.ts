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
import {
    WorkspaceFolder,
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    commands,
    Disposable,
    TreeView
} from "vscode";
import * as path from "path";

// this current path is in the out/lib. We need to find the resource files
// which are in out/resources
const resourcePath: string = path.join(__filename, "..", "..", "resources");

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

    async getKpmTreeParents(): Promise<KpmItem[]> {
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

        // get the session summary data
        const currentKeystrokesItems: KpmItem[] = this.getSessionSummaryItems(
            sessionSummaryData
        );

        // show the metrics per line
        treeItems.push(...currentKeystrokesItems);

        return treeItems;
    }

    async getCommitTreeParents(): Promise<KpmItem[]> {
        const folders: WorkspaceFolder[] = getWorkspaceFolders();
        const treeItems: KpmItem[] = [];

        // show the git insertions and deletions
        if (folders && folders.length > 0) {
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

    async getFileChangeTreeParents(): Promise<KpmItem[]> {
        const treeItems: KpmItem[] = [];

        const fileChangeInfoMap = getFileChangeInfoMap();
        const filesChanged = fileChangeInfoMap
            ? Object.keys(fileChangeInfoMap).length
            : 0;
        if (filesChanged > 0) {
            treeItems.push(this.buildMetricItem("Files changed", filesChanged));
        }

        // get the file change info
        if (filesChanged) {
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

/**
 * The TreeItem contains the "contextValue", which is represented as the "viewItem"
 * from within the package.json when determining if there should be decoracted context
 * based on that value.
 */
export class KpmTreeItem extends TreeItem {
    constructor(
        private readonly treeItem: KpmItem,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly command?: Command
    ) {
        super(treeItem.label, collapsibleState);

        const { lightPath, darkPath, contextValue } = getTreeItemIcon(treeItem);
        if (lightPath && darkPath) {
            this.iconPath.light = lightPath;
            this.iconPath.dark = darkPath;
        } else {
            // no matching tag, remove the tree item icon path
            delete this.iconPath;
        }
        this.contextValue = contextValue;
    }

    get tooltip(): string {
        if (!this.treeItem) {
            return "";
        }
        if (this.treeItem.tooltip) {
            return this.treeItem.tooltip;
        } else {
            return this.treeItem.label;
        }
    }

    iconPath = {
        light: "",
        dark: ""
    };

    contextValue = "treeItem";
}

function getTreeItemIcon(treeItem: KpmItem): any {
    const iconName = treeItem.icon || "Blank_button.svg";
    const lightPath = path.join(resourcePath, "light", iconName);
    const darkPath = path.join(resourcePath, "dark", iconName);
    const contextValue = treeItem.contextValue;
    return { lightPath, darkPath, contextValue };
}

let initializedTreeView = false;

export const connectTreeView = (view: TreeView<KpmItem>) => {
    // view is {selection: Array[n], visible, message}
    return Disposable.from(
        // e is {selection: Array[n]}
        view.onDidChangeSelection(async e => {
            if (!e.selection || e.selection.length === 0) {
                return;
            }

            const item: KpmItem = e.selection[0];

            if (item.command) {
                const args = item.commandArgs || null;
                if (args) {
                    return commands.executeCommand(item.command, ...args);
                } else {
                    // run the command
                    return commands.executeCommand(item.command);
                }
            }
        }),
        view.onDidChangeVisibility(e => {
            if (e.visible) {
                // if (initializedTreeView) {
                //     commands.executeCommand("codetime.refreshKpmTree");
                // }
                // initializedTreeView = true;
            }
        })
    );
};
