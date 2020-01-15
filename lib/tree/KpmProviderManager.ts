import {
    KpmItem,
    SessionSummary,
    LoggedInState,
    FileChangeInfo,
    CommitChangeStats,
    GlobalSessionSummary
} from "../model/models";
import { getCachedLoggedInState } from "../DataController";
import {
    humanizeMinutes,
    getWorkspaceFolders,
    getItem,
    isStatusBarTextVisible
} from "../Util";
import { getUncommitedChanges, getTodaysCommits } from "../repo/GitUtil";
import {
    WorkspaceFolder,
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    commands
} from "vscode";
import * as path from "path";
import { getFileChangeInfoMap } from "../storage/FileChangeInfoSummaryData";
import { getSessionSummaryData } from "../storage/SessionSummaryData";
import { getGlobalSessionSummaryData } from "../storage/GlobalSessionSummaryData";
import { WallClockHandler } from "../event/WallClockHandler";
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

const wallClockHandler: WallClockHandler = WallClockHandler.getInstance();

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

        // toggle status bar button
        let toggleStatusBarTextLabel = "Hide Status Bar Metrics";
        let toggleStatusBarIcon = "not_visible.svg";
        if (!isStatusBarTextVisible()) {
            toggleStatusBarTextLabel = "Show Status Bar Metrics";
            toggleStatusBarIcon = "visible.svg";
        }
        const toggleStatusBarButton: KpmItem = this.getActionButton(
            toggleStatusBarTextLabel,
            "Toggle the Code Time status bar metrics text",
            "codetime.toggleStatusBar",
            toggleStatusBarIcon
        );
        treeItems.push(toggleStatusBarButton);

        // readme button
        const readmeButton: KpmItem = this.getActionButton(
            "Learn More",
            "View the Code Time Readme to learn more",
            "codetime.displayReadme",
            "document.svg"
        );
        treeItems.push(readmeButton);

        return treeItems;
    }

    async getKpmTreeParents(): Promise<KpmItem[]> {
        const treeItems: KpmItem[] = [];
        const sessionSummaryData: SessionSummary = getSessionSummaryData();
        const globalSessionSummaryData: GlobalSessionSummary = getGlobalSessionSummaryData();

        // get the session summary data
        const currentKeystrokesItems: KpmItem[] = this.getSessionSummaryItems(
            sessionSummaryData,
            globalSessionSummaryData
        );

        // show the metrics per line
        treeItems.push(...currentKeystrokesItems);

        // show the files changed metric
        const fileChangeInfoMap = getFileChangeInfoMap();
        const filesChanged = fileChangeInfoMap
            ? Object.keys(fileChangeInfoMap).length
            : 0;
        if (filesChanged > 0) {
            treeItems.push(
                this.buildTreeMetricItem(
                    "Files changed",
                    filesChanged,
                    "Files changed today"
                )
            );

            // get the file change info
            if (filesChanged) {
                // turn this into an array
                const fileChangeInfos = Object.keys(fileChangeInfoMap).map(
                    key => {
                        return fileChangeInfoMap[key];
                    }
                );

                // Highest KPM
                const highKpmParent = this.buildHighestKpmFileItem(
                    fileChangeInfos
                );
                if (highKpmParent) {
                    treeItems.push(highKpmParent);
                }

                // Most Edited File
                const mostEditedFileItem: KpmItem = this.buildMostEditedFileItem(
                    fileChangeInfos
                );
                if (mostEditedFileItem) {
                    treeItems.push(mostEditedFileItem);
                }

                // Longest Code Time
                const longestCodeTimeParent = this.buildLongestFileCodeTime(
                    fileChangeInfos
                );
                if (longestCodeTimeParent) {
                    treeItems.push(longestCodeTimeParent);
                }
            }
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
                        todaysChagesSummary.insertions,
                        "Number of total insertions today"
                    )
                );
                committedChangesMetrics.push(
                    this.buildMetricItem(
                        "Deletion(s)",
                        todaysChagesSummary.deletions,
                        "Number of total deletions today"
                    )
                );

                committedChangesMetrics.push(
                    this.buildMetricItem(
                        "Commit(s)",
                        todaysChagesSummary.commitCount,
                        "Number of total commits today",
                        "commit.png"
                    )
                );

                committedChangesMetrics.push(
                    this.buildMetricItem(
                        "Files Changed",
                        todaysChagesSummary.fileCount,
                        "Number of total files changed today",
                        "files_changed.png"
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

    getCodyConnectButton(): KpmItem {
        const item: KpmItem = this.getActionButton(
            "See advanced metrics",
            `To see your coding data in Code Time, please log in to your account`,
            "codetime.codeTimeLogin",
            "sw-paw-circle.svg"
        );
        return item;
    }

    getWebViewDashboardButton(): KpmItem {
        const name = getItem("name");
        const item: KpmItem = this.getActionButton(
            "See advanced metrics",
            `See rich data visualizations in the web app (${name})`,
            "codetime.softwareKpmDashboard",
            "sw-paw-circle.svg"
        );
        return item;
    }

    getCodeTimeDashboardButton(): KpmItem {
        const item: KpmItem = this.getActionButton(
            "Code Time Dashboard",
            "View your latest coding metrics right here in your editor",
            "codetime.codeTimeMetrics",
            "dashboard.png"
        );
        return item;
    }

    getActionButton(label, tooltip, command, icon = null): KpmItem {
        const item: KpmItem = new KpmItem();
        item.tooltip = tooltip;
        item.label = label;
        item.id = label;
        item.command = command;
        item.icon = icon;
        item.contextValue = "action_button";
        return item;
    }

    getSessionSummaryItems(
        data: SessionSummary,
        global: GlobalSessionSummary
    ): KpmItem[] {
        const items: KpmItem[] = [];

        items.push(
            this.buildTreeMetricItem(
                "Editor Time",
                wallClockHandler.getWcTime()
            )
        );

        let values = [];
        const codeHours = humanizeMinutes(data.currentDayMinutes);
        values.push(`Today: ${codeHours}`);
        const globalCodeHours = humanizeMinutes(
            global.avg_session_seconds / 60
        );
        values.push(`Global average: ${globalCodeHours}`);
        items.push(this.buildActivityComparisonNodes("Session Time", values));

        values = [];
        const keystrokes = numeral(data.currentDayKeystrokes).format("0 a");
        values.push(`Today: ${keystrokes}`);
        const globalKeystrokes = numeral(global.avg_keystrokes).format("0 a");
        values.push(`Global average: ${globalKeystrokes}`);
        items.push(this.buildActivityComparisonNodes("Keystrokes", values));

        values = [];
        const charsAdded = numeral(data.currentCharactersAdded).format("0 a");
        values.push(`Today: ${charsAdded}`);
        const globalCharsAdded = numeral(global.avg_chars_added).format("0 a");
        values.push(`Global average: ${globalCharsAdded}`);
        items.push(this.buildActivityComparisonNodes("Chars added", values));

        values = [];
        const charsDeleted = numeral(data.currentCharactersDeleted).format(
            "0 a"
        );
        values.push(`Today: ${charsDeleted}`);
        const globalCharsDeleted = numeral(global.avg_chars_deleted).format(
            "0 a"
        );
        values.push(`Global average: ${globalCharsDeleted}`);
        items.push(this.buildActivityComparisonNodes("Chars removed", values));

        values = [];
        const linesAdded = numeral(data.currentLinesAdded).format("0 a");
        values.push(`Today: ${linesAdded}`);
        const globalLinesAdded = numeral(global.avg_lines_added).format("0 a");
        values.push(`Global average: ${globalLinesAdded}`);
        items.push(this.buildActivityComparisonNodes("Lines added", values));

        values = [];
        const linesRemoved = numeral(data.currentLinesRemoved).format("0 a");
        values.push(`Today: ${linesRemoved}`);
        const globalLinesRemoved = numeral(global.avg_lines_removed).format(
            "0 a"
        );
        values.push(`Global average: ${globalLinesRemoved}`);
        items.push(this.buildActivityComparisonNodes("Lines removed", values));

        values = [];
        const pastes = numeral(data.currentPastes).format("0 a");
        values.push(`Today: ${pastes}`);
        const globalPastes = numeral(global.avg_paste).format("0 a");
        values.push(`Global average: ${globalPastes}`);
        items.push(this.buildActivityComparisonNodes("Copy+paste", values));
        return items;
    }

    buildMetricItem(label, value, tooltip = "", icon = null) {
        const item: KpmItem = new KpmItem();
        item.label = `${label}: ${value}`;
        item.id = `${label}_metric`;
        item.contextValue = "metric_item";
        item.tooltip = tooltip;
        item.icon = icon;
        return item;
    }

    buildTreeMetricItem(label, value, tooltip = "", icon = null) {
        const childItem = this.buildMessageItem(value);
        const parentItem = this.buildMessageItem(label, tooltip, icon);
        parentItem.children = [childItem];
        return parentItem;
    }

    buildActivityComparisonNodes(label, values) {
        const parent = this.buildMessageItem(label);
        values.forEach(element => {
            const child = this.buildMessageItem(element);
            parent.children.push(child);
        });
        return parent;
    }

    buildMessageItem(
        label,
        tooltip = "",
        icon = null,
        command = null,
        commandArgs = null
    ) {
        const item: KpmItem = new KpmItem();
        item.label = label;
        item.tooltip = tooltip;
        item.icon = icon;
        item.command = command;
        item.commandArgs = commandArgs;
        item.id = `${label}_message`;
        item.contextValue = "message_item";
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

    buildFileItem(fileChangeInfo: FileChangeInfo) {
        const item: KpmItem = new KpmItem();
        item.command = "codetime.openFileInEditor";
        item.commandArgs = [fileChangeInfo.fsPath];
        item.label = fileChangeInfo.name;
        item.tooltip = `Click to open ${fileChangeInfo.fsPath}`;
        item.id = `${fileChangeInfo.name}_file`;
        item.contextValue = "file_item";
        item.icon = "document.svg";
        return item;
    }

    buildMostEditedFileItem(fileChangeInfos: FileChangeInfo[]): KpmItem {
        if (!fileChangeInfos || fileChangeInfos.length === 0) {
            return null;
        }
        // Most Edited File
        const sortedArray = fileChangeInfos.sort(
            (a: FileChangeInfo, b: FileChangeInfo) =>
                b.keystrokes - a.keystrokes
        );
        const mostEditedChildren: KpmItem[] = [];
        const len = Math.min(3, sortedArray.length);
        for (let i = 0; i < len; i++) {
            const fileName = sortedArray[i].name;
            const keystrokes = numeral(sortedArray[i].keystrokes).format("0 a");
            const label = `${fileName} | ${keystrokes}`;
            const messageItem = this.buildMessageItem(
                label,
                "",
                null,
                "codetime.openFileInEditor",
                [sortedArray[i].fsPath]
            );
            mostEditedChildren.push(messageItem);
        }
        const mostEditedParent = this.buildParentItem(
            "Most Edited File",
            mostEditedChildren
        );

        return mostEditedParent;
    }

    buildHighestKpmFileItem(fileChangeInfos: FileChangeInfo[]): KpmItem {
        if (!fileChangeInfos || fileChangeInfos.length === 0) {
            return null;
        }
        // Highest KPM
        const sortedArray = fileChangeInfos.sort(
            (a: FileChangeInfo, b: FileChangeInfo) => b.kpm - a.kpm
        );
        const highKpmChildren: KpmItem[] = [];
        const len = Math.min(3, sortedArray.length);
        for (let i = 0; i < len; i++) {
            const fileName = sortedArray[i].name;
            const kpm = sortedArray[i].kpm.toFixed(1);
            const label = `${fileName} | ${kpm}`;
            const messageItem = this.buildMessageItem(
                label,
                "",
                null,
                "codetime.openFileInEditor",
                [sortedArray[i].fsPath]
            );
            highKpmChildren.push(messageItem);
        }
        const highKpmParent = this.buildParentItem(
            "Highest KPM",
            highKpmChildren
        );
        return highKpmParent;
    }

    buildLongestFileCodeTime(fileChangeInfos: FileChangeInfo[]): KpmItem {
        if (!fileChangeInfos || fileChangeInfos.length === 0) {
            return null;
        }
        // Longest Code Time
        const sortedArray = fileChangeInfos.sort(
            (a: FileChangeInfo, b: FileChangeInfo) =>
                b.duration_seconds - a.duration_seconds
        );
        const longestCodeTimeChildren: KpmItem[] = [];
        const len = Math.min(3, sortedArray.length);
        for (let i = 0; i < len; i++) {
            const fileName = sortedArray[i].name;
            const duration_minutes = sortedArray[i].duration_seconds / 60;
            const codeHours = humanizeMinutes(duration_minutes);
            const label = `${fileName} | ${codeHours}`;
            const messageItem = this.buildMessageItem(
                label,
                "",
                null,
                "codetime.openFileInEditor",
                [sortedArray[i].fsPath]
            );
            longestCodeTimeChildren.push(messageItem);
        }
        const longestCodeTimeParent = this.buildParentItem(
            "Longest Code Time",
            longestCodeTimeChildren
        );
        return longestCodeTimeParent;
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
    const iconName = treeItem.icon;
    const lightPath =
        iconName && treeItem.children.length === 0
            ? path.join(resourcePath, "light", iconName)
            : null;
    const darkPath =
        iconName && treeItem.children.length === 0
            ? path.join(resourcePath, "dark", iconName)
            : null;
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
