import {
    KpmItem,
    SessionSummary,
    LoggedInState,
    FileChangeInfo,
    CommitChangeStats
} from "../model/models";
import { getCachedLoggedInState } from "../DataController";
import { getSessionSummaryData, getFileChangeInfoMap } from "../OfflineManager";
import { humanizeMinutes, getWorkspaceFolders } from "../Util";
import { getUncommitedChanges, getTodaysCommits } from "../repo/GitUtil";
import {
    WorkspaceFolder,
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    commands
} from "vscode";
import * as path from "path";
const numeral = require("numeral");

// this current path is in the out/lib. We need to find the resource files
// which are in out/resources
const resourcePath: string = path.join(
    __filename,
    "..",
    "..",
    "..",
    "resources"
);

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

    async getOptionsTreeParents(): Promise<KpmItem[]> {
        const treeItems: KpmItem[] = [];
        const loggedInCachState: LoggedInState = await getCachedLoggedInState();

        if (!loggedInCachState.loggedIn) {
            treeItems.push(this.getCodyConnectButton());
        } else {
            // show the web dashboard button
            treeItems.push(this.getWebViewDashboardButton());
        }

        // codetime metrics editor dashboard
        treeItems.push(this.getCodeTimeDashboardButton());

        return treeItems;
    }

    async getKpmTreeParents(): Promise<KpmItem[]> {
        const treeItems: KpmItem[] = [];
        const sessionSummaryData: SessionSummary = getSessionSummaryData();

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

        return treeItems;
    }

    async getCommitTreeParents(): Promise<KpmItem[]> {
        const folders: WorkspaceFolder[] = getWorkspaceFolders();
        const treeItems: KpmItem[] = [];

        // show the git insertions and deletions
        if (folders && folders.length > 0) {
            const openChangesChildren: KpmItem[] = [];
            const committedChangesChildren: KpmItem[] = [];
            for (let i = 0; i < folders.length; i++) {
                const workspaceFolder = folders[i];
                const projectDir = workspaceFolder.uri.fsPath;
                const currentChagesSummary: CommitChangeStats = await getUncommitedChanges(
                    projectDir
                );
                // get the folder name from the path
                const name = workspaceFolder.name;

                const openChangesMetrics: KpmItem[] = [];
                openChangesMetrics.push(
                    this.buildMetricItem(
                        "Insertion(s)",
                        currentChagesSummary.insertions
                    )
                );
                openChangesMetrics.push(
                    this.buildMetricItem(
                        "Deletion(s)",
                        currentChagesSummary.deletions
                    )
                );

                const openChangesFolder: KpmItem = this.buildParentItem(
                    name,
                    openChangesMetrics
                );

                openChangesChildren.push(openChangesFolder);

                const todaysChagesSummary: CommitChangeStats = await getTodaysCommits(
                    projectDir
                );

                const committedChangesMetrics: KpmItem[] = [];
                committedChangesMetrics.push(
                    this.buildMetricItem(
                        "Insertion(s)",
                        todaysChagesSummary.insertions
                    )
                );
                committedChangesMetrics.push(
                    this.buildMetricItem(
                        "Deletion(s)",
                        todaysChagesSummary.deletions
                    )
                );

                committedChangesMetrics.push(
                    this.buildMetricItem(
                        "Commit(s)",
                        todaysChagesSummary.commitCount
                    )
                );

                committedChangesMetrics.push(
                    this.buildMetricItem(
                        "Files Changed",
                        todaysChagesSummary.fileCount
                    )
                );

                const committedChangesFolder: KpmItem = this.buildParentItem(
                    name,
                    committedChangesMetrics
                );

                committedChangesChildren.push(committedChangesFolder);
            }

            const openChangesParent: KpmItem = this.buildParentItem(
                "Open Changes",
                openChangesChildren
            );
            treeItems.push(openChangesParent);

            const committedChangesParent: KpmItem = this.buildParentItem(
                "Committed Today",
                committedChangesChildren
            );
            treeItems.push(committedChangesParent);
        }

        return treeItems;
    }

    async getFileChangeTreeParents(): Promise<KpmItem[]> {
        const treeItems: KpmItem[] = [];

        const fileChangeInfoMap = getFileChangeInfoMap();
        const filesChanged = fileChangeInfoMap
            ? Object.keys(fileChangeInfoMap).length
            : 0;

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

            // Highest KPM
            const highKpmChildren: KpmItem[] = [];
            highKpmChildren.push(this.buildFileItem(kpmSortedArray[0]));
            highKpmChildren.push(
                this.buildMetricItem("KPM", kpmSortedArray[0].kpm.toFixed(1))
            );
            const highKpmParent = this.buildParentItem(
                "Highest KPM",
                highKpmChildren
            );
            treeItems.push(highKpmParent);

            // Most Edited File
            const keystrokesSortedArray = fileChangeInfos.sort(
                (a: FileChangeInfo, b: FileChangeInfo) =>
                    b.keystrokes - a.keystrokes
            );
            const mostEditedChildren: KpmItem[] = [];
            mostEditedChildren.push(
                this.buildFileItem(keystrokesSortedArray[0])
            );
            const keystrokes = numeral(
                keystrokesSortedArray[0].keystrokes
            ).format("0 a");
            mostEditedChildren.push(
                this.buildMetricItem("Keystrokes", keystrokes)
            );
            const mostEditedParent = this.buildParentItem(
                "Most Edited File",
                mostEditedChildren
            );
            treeItems.push(mostEditedParent);

            // Longest Code Time
            const durationSortedArray = fileChangeInfos.sort(
                (a: FileChangeInfo, b: FileChangeInfo) =>
                    b.duration_seconds - a.duration_seconds
            );
            const longestCodeTimeChildren: KpmItem[] = [];
            longestCodeTimeChildren.push(
                this.buildFileItem(durationSortedArray[0])
            );
            const duration_minutes =
                durationSortedArray[0].duration_seconds / 60;
            const codeHours = humanizeMinutes(duration_minutes);
            longestCodeTimeChildren.push(
                this.buildMetricItem("Time", codeHours)
            );
            const longestCodeTimeParent = this.buildParentItem(
                "Longest Code Time",
                longestCodeTimeChildren
            );
            treeItems.push(longestCodeTimeParent);
        }

        return treeItems;
    }

    getCodyConnectButton(): KpmItem {
        const item: KpmItem = new KpmItem();
        item.tooltip =
            "To see your coding data in Code Time, please connect to your account";
        item.label = "See more metrics";
        item.id = "connect";
        item.command = "codetime.codeTimeLogin";
        item.icon = "sw-paw-circle.svg";
        item.contextValue = "action_button";
        return item;
    }

    getWebViewDashboardButton(): KpmItem {
        const item: KpmItem = new KpmItem();
        item.tooltip = "See rich data visualizations in the web app";
        item.label = "See more metrics";
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

        const keystrokes = numeral(data.currentDayKeystrokes).format("0 a");
        items.push(this.buildMetricItem("Keystrokes", keystrokes));

        const charsAdded = numeral(data.currentCharactersAdded).format("0 a");
        items.push(this.buildMetricItem("Chars added", charsAdded));

        const charsDeleted = numeral(data.currentCharactersDeleted).format(
            "0 a"
        );
        items.push(this.buildMetricItem("Chars removed", charsDeleted));

        const linesAdded = numeral(data.currentLinesAdded).format("0 a");
        items.push(this.buildMetricItem("Lines added", linesAdded));

        const linesRemoved = numeral(data.currentLinesRemoved).format("0 a");
        items.push(this.buildMetricItem("Lines removed", linesRemoved));

        const pastes = numeral(data.currentPastes).format("0 a");
        items.push(this.buildMetricItem("Copy+paste", pastes));
        return items;
    }

    buildMetricItem(label, value, tooltip = "") {
        const item: KpmItem = new KpmItem();
        item.label = `${label}: ${value}`;
        item.id = `${label}_metric`;
        item.contextValue = "metric_item";
        item.tooltip = tooltip;
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

    buildParentItem(label: string, children: KpmItem[]) {
        const item: KpmItem = new KpmItem();
        item.label = label;
        item.id = `${label}_title`;
        item.contextValue = "title_item";
        item.children = children;
        return item;
    }

    buildFileItem(fileChangeInfo: FileChangeInfo, icon = null) {
        const item: KpmItem = new KpmItem();
        item.command = "codetime.openFileInEditor";
        item.commandArgs = [fileChangeInfo.fsPath];
        item.label = `File: ${fileChangeInfo.name}`;
        item.tooltip = `Click to open ${fileChangeInfo.fsPath}`;
        item.id = `${fileChangeInfo.name}_file`;
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
    const lightPath =
        iconName === "none" || treeItem.children.length
            ? null
            : path.join(resourcePath, "light", iconName);
    const darkPath =
        iconName == "none" || treeItem.children.length
            ? null
            : path.join(resourcePath, "dark", iconName);
    const contextValue = treeItem.contextValue;
    return { lightPath, darkPath, contextValue };
}

export const handleKpmChangeSelection = (item: KpmItem) => {
    if (item.command) {
        const args = item.commandArgs || null;
        if (args) {
            return commands.executeCommand(item.command, ...args);
        } else {
            // run the command
            return commands.executeCommand(item.command);
        }
    }
};
