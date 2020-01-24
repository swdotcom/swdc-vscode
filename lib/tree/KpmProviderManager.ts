import {
    KpmItem,
    SessionSummary,
    LoggedInState,
    FileChangeInfo,
    CommitChangeStats
} from "../model/models";
import { getCachedLoggedInState } from "../DataController";
import {
    humanizeMinutes,
    getWorkspaceFolders,
    getItem,
    isStatusBarTextVisible,
    logIt,
    createCodeTimeEvent
} from "../Util";
import { getUncommitedChanges, getTodaysCommits } from "../repo/GitUtil";
import {
    WorkspaceFolder,
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    commands,
    TreeView
} from "vscode";
import * as path from "path";
import { getFileChangeSummaryAsJson } from "../storage/FileChangeInfoSummaryData";
import { getSessionSummaryData } from "../storage/SessionSummaryData";
import { WallClockManager } from "../managers/WallClockManager";
const numeral = require("numeral");
const moment = require("moment-timezone");

// this current path is in the out/lib. We need to find the resource files
// which are in out/resources
const resourcePath: string = path.join(
    __filename,
    "..",
    "..",
    "..",
    "resources"
);

const wallClockHandler: WallClockManager = WallClockManager.getInstance();

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
        let toggleStatusBarTextLabel = "Hide status bar metrics";
        let toggleStatusBarIcon = "not_visible.svg";
        if (!isStatusBarTextVisible()) {
            toggleStatusBarTextLabel = "Show status bar metrics";
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
            "Learn more",
            "View the Code Time Readme to learn more",
            "codetime.displayReadme",
            "document.svg"
        );
        treeItems.push(readmeButton);

        const feedbackButton: KpmItem = this.getActionButton(
            "Submit feedback",
            "Send us an email at cody@software.com",
            "codetime.sendFeedback",
            "feedback.svg"
        );
        treeItems.push(feedbackButton);

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

        // show the files changed metric
        const fileChangeInfoMap = getFileChangeSummaryAsJson();
        const filesChanged = fileChangeInfoMap
            ? Object.keys(fileChangeInfoMap).length
            : 0;
        if (filesChanged > 0) {
            treeItems.push(
                this.buildTreeMetricItem(
                    "Files changed",
                    "Files changed today",
                    `Today: ${filesChanged}`
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
                    "",
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
                        "Files changed",
                        todaysChagesSummary.fileCount,
                        "Number of total files changed today",
                        "files_changed.png"
                    )
                );

                const committedChangesFolder: KpmItem = this.buildParentItem(
                    name,
                    "",
                    committedChangesMetrics
                );

                committedChangesChildren.push(committedChangesFolder);
            }

            const openChangesParent: KpmItem = this.buildParentItem(
                "Open changes",
                "Lines added and deleted in this repo that have not yet been committed.",
                openChangesChildren
            );
            treeItems.push(openChangesParent);

            const committedChangesParent: KpmItem = this.buildParentItem(
                "Committed today",
                "",
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
            "sw-paw-circle.svg",
            "TreeViewLogin"
        );
        return item;
    }

    getWebViewDashboardButton(): KpmItem {
        const name = getItem("name");
        const item: KpmItem = this.getActionButton(
            "See advanced metrics",
            `See rich data visualizations in the web app (${name})`,
            "codetime.softwareKpmDashboard",
            "sw-paw-circle.svg",
            "TreeViewLaunchWebDashboard"
        );
        return item;
    }

    getCodeTimeDashboardButton(): KpmItem {
        const item: KpmItem = this.getActionButton(
            "Generate dashboard",
            "View your latest coding metrics right here in your editor",
            "codetime.codeTimeMetrics",
            "dashboard.png",
            "TreeViewLaunchDashboard"
        );
        return item;
    }

    getActionButton(
        label,
        tooltip,
        command,
        icon = null,
        eventDescription: string = null
    ): KpmItem {
        const item: KpmItem = new KpmItem();
        item.tooltip = tooltip;
        item.label = label;
        item.id = label;
        item.command = command;
        item.icon = icon;
        item.contextValue = "action_button";
        item.eventDescription = eventDescription;
        return item;
    }

    getSessionSummaryItems(data: SessionSummary): KpmItem[] {
        const items: KpmItem[] = [];

        const wallClktime = humanizeMinutes(wallClockHandler.getWcTime());

        items.push(
            this.buildTreeMetricItem(
                "Code time",
                "Code time: total time you have been typing in your editor today.",
                `Today: ${wallClktime}`,
                null,
                TreeItemCollapsibleState.Expanded
            )
        );

        const dayStr = moment().format("ddd");

        let values = [];
        const codeHours = humanizeMinutes(data.currentDayMinutes);
        values.push(`Today: ${codeHours}`);
        const avgMin = humanizeMinutes(data.averageDailyMinutes);
        values.push(`Your average (${dayStr}): ${avgMin}`);
        const globalCodeHours = humanizeMinutes(data.globalAverageSeconds / 60);
        values.push(`Global average: ${globalCodeHours}`);
        items.push(
            this.buildActivityComparisonNodes(
                "Active code time",
                "Active code time: total time you've spent in your editor today.",
                values,
                TreeItemCollapsibleState.Expanded
            )
        );

        values = [];
        const linesAdded = numeral(data.currentDayLinesAdded).format("0 a");
        values.push(`Today: ${linesAdded}`);
        const userLinesAddedAvg = numeral(data.averageLinesAdded).format("0 a");
        values.push(`Your average (${dayStr}): ${userLinesAddedAvg}`);
        const globalLinesAdded = numeral(data.globalAverageLinesAdded).format(
            "0 a"
        );
        values.push(`Global average: ${globalLinesAdded}`);
        items.push(
            this.buildActivityComparisonNodes("Lines added", "", values)
        );

        values = [];
        const linesRemoved = numeral(data.currentDayLinesRemoved).format("0 a");
        values.push(`Today: ${linesRemoved}`);
        const userLinesRemovedAvg = numeral(data.averageLinesRemoved).format(
            "0 a"
        );
        values.push(`Your average (${dayStr}): ${userLinesRemovedAvg}`);
        const globalLinesRemoved = numeral(
            data.globalAverageLinesRemoved
        ).format("0 a");
        values.push(`Global average: ${globalLinesRemoved}`);
        items.push(
            this.buildActivityComparisonNodes("Lines removed", "", values)
        );

        values = [];
        const keystrokes = numeral(data.currentDayKeystrokes).format("0 a");
        values.push(`Today: ${keystrokes}`);
        const userKeystrokesAvg = numeral(data.averageDailyKeystrokes).format(
            "0 a"
        );
        values.push(`Your average (${dayStr}): ${userKeystrokesAvg}`);
        const globalKeystrokes = numeral(
            data.globalAverageDailyKeystrokes
        ).format("0 a");
        values.push(`Global average: ${globalKeystrokes}`);
        items.push(this.buildActivityComparisonNodes("Keystrokes", "", values));

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

    buildTreeMetricItem(
        label,
        tooltip,
        value,
        icon = null,
        collapsibleState: TreeItemCollapsibleState = null
    ) {
        const childItem = this.buildMessageItem(value);
        const parentItem = this.buildMessageItem(label, tooltip, icon);
        if (collapsibleState) {
            parentItem.initialCollapsibleState = collapsibleState;
        }
        parentItem.children = [childItem];
        return parentItem;
    }

    buildActivityComparisonNodes(
        label,
        tooltip,
        values,
        collapsibleState: TreeItemCollapsibleState = null
    ) {
        const parent: KpmItem = this.buildMessageItem(label, tooltip);
        if (collapsibleState) {
            parent.initialCollapsibleState = collapsibleState;
        }
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
        label = label.toString();
        const item: KpmItem = new KpmItem();
        item.label = label;
        item.tooltip = tooltip;
        item.icon = icon;
        item.command = command;
        item.commandArgs = commandArgs;
        item.id = `${label}_message`;
        item.contextValue = "message_item";
        item.eventDescription = label ? label.replace(/\s/g, "") : "";
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

    buildParentItem(label: string, tooltip: string, children: KpmItem[]) {
        const item: KpmItem = new KpmItem();
        item.label = label;
        item.tooltip = tooltip;
        item.id = `${label}_title`;
        item.contextValue = "title_item";
        item.children = children;
        item.eventDescription = label ? label.replace(/\s/g, "") : "";
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
            "Top edited files",
            "",
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
            "Top KPM files",
            "",
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
            "Top Code Time files",
            "",
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

export const handleKpmChangeSelection = (
    view: TreeView<KpmItem>,
    item: KpmItem
) => {
    if (item.command) {
        const args = item.commandArgs || null;
        if (args) {
            commands.executeCommand(item.command, ...args);
        } else {
            // run the command
            commands.executeCommand(item.command);
        }

        // send event types
        if (item.eventDescription) {
            createCodeTimeEvent("mouse", "click", item.eventDescription);
        }
    }

    // deselect it
    try {
        // re-select the track without focus
        view.reveal(item, {
            focus: false,
            select: false
        });
    } catch (err) {
        logIt(`Unable to deselect track: ${err.message}`);
    }
};
