import { commands, Disposable, workspace, window, TreeView } from "vscode";
import {
    launchWebDashboard,
    updatePreferences,
    sendTeamInvite,
} from "./DataController";
import {
    displayCodeTimeMetricsDashboard,
} from "./menu/MenuManager";
import {
    launchWebUrl,
    launchLogin,
    openFileInEditor,
    displayReadmeIfNotExists,
    toggleStatusBar,
} from "./Util";
import { KpmManager } from "./managers/KpmManager";
import { KpmProvider, connectKpmTreeView } from "./tree/KpmProvider";
import {
    CodeTimeMenuProvider,
    connectCodeTimeMenuTreeView,
} from "./tree/CodeTimeMenuProvider";
import { KpmItem, UIInteractionType } from "./model/models";
import { KpmProviderManager } from "./tree/KpmProviderManager";
import { ProjectCommitManager } from "./menu/ProjectCommitManager";
import {
    CodeTimeTeamProvider,
    connectCodeTimeTeamTreeView,
} from "./tree/CodeTimeTeamProvider";
import { displayProjectContributorCommitsDashboard } from "./menu/ReportManager";
import { sendOfflineData } from "./managers/FileManager";
import {
    showSwitchAccountsMenu,
} from "./menu/AccountManager";
import { TrackerManager } from "./managers/TrackerManager";
import { getStatusBarKpmItem } from "./storage/SessionSummaryData";

export function createCommands(
    kpmController: KpmManager
): {
    dispose: () => void;
} {
    let cmds = [];

    const tracker: TrackerManager = TrackerManager.getInstance();
    const kpmProviderMgr: KpmProviderManager = KpmProviderManager.getInstance();

    cmds.push(kpmController);

    // MENU TREE: INIT
    const codetimeMenuTreeProvider = new CodeTimeMenuProvider();
    const codetimeMenuTreeView: TreeView<KpmItem> = window.createTreeView(
        "ct-menu-tree",
        {
            treeDataProvider: codetimeMenuTreeProvider,
            showCollapseAll: false,
        }
    );
    codetimeMenuTreeProvider.bindView(codetimeMenuTreeView);
    cmds.push(connectCodeTimeMenuTreeView(codetimeMenuTreeView));

    // STATUS BAR CLICK - MENU TREE REVEAL
    cmds.push(
        commands.registerCommand("codetime.displayTree", () => {
            const item: KpmItem = getStatusBarKpmItem();
            tracker.trackUIInteraction(item);
            codetimeMenuTreeProvider.revealTree();
        })
    );

    // SWITCH ACCOUNT BUTTON
    cmds.push(
        commands.registerCommand("codetime.switchAccounts", (item: KpmItem) => {
            tracker.trackUIInteraction(item);
            showSwitchAccountsMenu();
        })
    );

    // MENU TREE: REFRESH
    cmds.push(
        commands.registerCommand("codetime.refreshCodetimeMenuTree", () => {
            codetimeMenuTreeProvider.refresh();
        })
    );

    // PROCESS KEYSTROKES NOW
    cmds.push(
        commands.registerCommand("codetime.processKeystrokeData", () => {
            kpmController.processKeystrokeData(true /*isUnfocus*/);
        })
    );

    // DAILY METRICS TREE: INIT
    const kpmTreeProvider = new KpmProvider();
    const kpmTreeView: TreeView<KpmItem> = window.createTreeView(
        "ct-metrics-tree",
        {
            treeDataProvider: kpmTreeProvider,
            showCollapseAll: false,
        }
    );
    kpmTreeProvider.bindView(kpmTreeView);
    cmds.push(connectKpmTreeView(kpmTreeView));

    // TEAM TREE: INIT
    const codetimeTeamTreeProvider = new CodeTimeTeamProvider();
    const codetimeTeamTreeView: TreeView<KpmItem> = window.createTreeView(
        "ct-team-tree",
        {
            treeDataProvider: codetimeTeamTreeProvider,
            showCollapseAll: false,
        }
    );
    codetimeTeamTreeProvider.bindView(codetimeTeamTreeView);
    cmds.push(connectCodeTimeTeamTreeView(codetimeTeamTreeView));

    cmds.push(
        commands.registerCommand("codetime.refreshTreeViews", () => {
            codetimeMenuTreeProvider.refresh();
            kpmTreeProvider.refresh();
            codetimeTeamTreeProvider.refresh();
        })
    );

    // TEAM TREE: INVITE MEMBER
    cmds.push(
        commands.registerCommand(
            "codetime.inviteTeamMember",
            async (item: KpmItem) => {
                // the identifier will be in the value
                const identifier = item.value;
                // email will be the description
                const email = item.description;
                const name = item.label;
                const msg = `Send invitation to ${email}?`;
                const selection = await window.showInformationMessage(
                    msg,
                    { modal: true },
                    ...["YES"]
                );
                if (selection && selection === "YES") {
                    sendTeamInvite(identifier, [email]);
                }
            }
        )
    );

    // SEND OFFLINE DATA
    cmds.push(
        commands.registerCommand("codetime.sendOfflineData", () => {
            sendOfflineData();
        })
    );

    // SHOW ASCII DASHBOARD
    cmds.push(
        commands.registerCommand("codetime.softwareKpmDashboard", (item: KpmItem) => {
            if (!item) {
                // it's from the command palette, create a kpm item so
                // it can build the ui_element in the tracker manager
                item = kpmProviderMgr.getWebViewDashboardButton();
                item.location = "ct_command_palette";
                item.interactionType = UIInteractionType.Keyboard;
            }
            tracker.trackUIInteraction(item);
            launchWebDashboard();
        })
    );

    // OPEN SPECIFIED FILE IN EDITOR
    cmds.push(
        commands.registerCommand("codetime.openFileInEditor", (file) => {
            openFileInEditor(file);
        })
    );

    // TOGGLE STATUS BAR METRIC VISIBILITY
    cmds.push(
        commands.registerCommand("codetime.toggleStatusBar", (item: KpmItem) => {
            if (!item) {
                // it's from the command palette, create a kpm item so
                // it can build the ui_element in the tracker manager
                item = kpmProviderMgr.getHideStatusBarMetricsButton();
                item.location = "ct_command_palette";
                item.interactionType = UIInteractionType.Keyboard;
            }
            tracker.trackUIInteraction(item);
            toggleStatusBar();
            setTimeout(() => {
                commands.executeCommand("codetime.refreshCodetimeMenuTree");
            }, 500);
        })
    );

    // LAUNCH EMAIL LOGIN
    cmds.push(
        commands.registerCommand("codetime.codeTimeLogin", (item: KpmItem) => {
            if (!item) {
                // it's from the command palette, create a kpm item so
                // it can build the ui_element in the tracker manager
                item = kpmProviderMgr.getSignUpButton("email", "grey");
                item.location = "ct_command_palette";
                item.interactionType = UIInteractionType.Keyboard;
            }
            tracker.trackUIInteraction(item);
            launchLogin("software");
        })
    );

    // LAUNCH GOOGLE LOGIN
    cmds.push(
        commands.registerCommand("codetime.googleLogin", (item: KpmItem) => {
            if (!item) {
                // it's from the command palette, create a kpm item so
                // it can build the ui_element in the tracker manager
                item = kpmProviderMgr.getSignUpButton("Google", null);
                item.location = "ct_command_palette";
                item.interactionType = UIInteractionType.Keyboard;
            }
            item.interactionIcon = "google";
            tracker.trackUIInteraction(item);
            launchLogin("google");
        })
    );

    // LAUNCH GITHUB LOGIN
    cmds.push(
        commands.registerCommand("codetime.githubLogin", (item: KpmItem) => {
            if (!item) {
                // it's from the command palette, create a kpm item so
                // it can build the ui_element in the tracker manager
                item = kpmProviderMgr.getSignUpButton("GitHub", "white");
                item.location = "ct_command_palette";
                item.interactionType = UIInteractionType.Keyboard;
            }
            tracker.trackUIInteraction(item);
            launchLogin("github");
        })
    );

    // REFRESH DAILY METRICS
    cmds.push(
        commands.registerCommand(
            "codetime.refreshKpmTree",
            (keystrokeStats) => {
                if (keystrokeStats) {
                    KpmProviderManager.getInstance().setCurrentKeystrokeStats(
                        keystrokeStats
                    );
                }
                kpmTreeProvider.refresh();
            }
        )
    );

    // DISPLAY README MD
    cmds.push(
        commands.registerCommand("codetime.displayReadme", (item: KpmItem) => {
            if (!item) {
                // it's from the command palette, create a kpm item so
                // it can build the ui_element in the tracker manager
                item = kpmProviderMgr.getLearnMoreButton();
                item.location = "ct_command_palette";
                item.interactionType = UIInteractionType.Keyboard;
            }
            tracker.trackUIInteraction(item);
            displayReadmeIfNotExists(true /*override*/);
        })
    );

    // DISPLAY CODE TIME METRICS REPORT
    cmds.push(
        commands.registerCommand("codetime.codeTimeMetrics", (item: KpmItem) => {
            if (!item) {
                // it's from the command palette, create a kpm item so
                // it can build the ui_element in the tracker manager
                item = kpmProviderMgr.getCodeTimeDashboardButton();
                item.location = "ct_command_palette";
                item.interactionType = UIInteractionType.Keyboard;
            }
            tracker.trackUIInteraction(item);
            displayCodeTimeMetricsDashboard();
        })
    );

    // DISPLAY PROJECT METRICS REPORT
    cmds.push(
        commands.registerCommand("codetime.generateProjectSummary", (item: KpmItem) => {
            if (!item) {
                // it's from the command palette, create a kpm item so
                // it can build the ui_element in the tracker manager
                item = kpmProviderMgr.getViewProjectSummaryButton();
                item.location = "ct_command_palette";
                item.interactionType = UIInteractionType.Keyboard;
            }
            tracker.trackUIInteraction(item);
            ProjectCommitManager.getInstance().launchViewProjectSummaryMenuFlow();
        })
    );

    // DISPLAY REPO COMMIT CONTRIBUTOR REPORT
    cmds.push(
        commands.registerCommand(
            "codetime.generateContributorSummary",
            (item: KpmItem) => {
                if (!item) {
                    // it's from the command palette, create a kpm item so
                    // it can build the ui_element in the tracker manager
                    item = kpmProviderMgr.getContributorReportButton(item.value);
                    item.location = "ct_command_palette";
                    item.interactionType = UIInteractionType.Keyboard;
                }
                tracker.trackUIInteraction(item);
                displayProjectContributorCommitsDashboard(item.value);
            }
        )
    );

    // LAUNCH COMMIT URL
    cmds.push(
        commands.registerCommand("codetime.launchCommitUrl", (item: KpmItem, commitLink: string) => {
            // this only comes from the tree view so item will be available
            tracker.trackUIInteraction(item);
            launchWebUrl(commitLink);
        })
    );

    cmds.push(
        commands.registerCommand("codetime.viewSoftwareTop40", () => {
            launchWebUrl("https://api.software.com/music/top40");
        })
    );

    cmds.push(
        commands.registerCommand("codetime.sendFeedback", () => {
            launchWebUrl("mailto:cody@software.com");
        })
    );

    // // CONNECT SLACK
    // cmds.push(
    //     commands.registerCommand("codetime.connectSlack", () => {
    //         connectSlack();
    //     })
    // );

    // // DISCONNECT SLACK
    // cmds.push(
    //     commands.registerCommand("codetime.disconnectSlack", () => {
    //         disconnectSlack();
    //     })
    // );

    // // SLACK CONTRIBUTOR
    // cmds.push(
    //     commands.registerCommand("musictime.slackContributor", () => {
    //         slackContributor();
    //     })
    // );

    // // GENERATE SLACK REPORT
    // cmds.push(
    //     commands.registerCommand("codetime.generateSlackReport", () => {
    //         generateSlackReport();
    //     })
    // );

    // const addProjectNoteCmd = commands.registerCommand(
    //     "codetime.addProjectNote",
    //     () => {
    //         ProjectNoteManager.getInstance().addNote();
    //     }
    // );
    // cmds.push(addProjectNoteCmd);

    // const connectAtlassianCmd = commands.registerCommand(
    //     "codetime.connectAtlassian",
    //     () => {
    //         connectAtlassian();
    //     }
    // );
    // cmds.push(connectAtlassianCmd);

    // const copyToJiraCmd = commands.registerCommand(
    //     "codetime.copyToJira",
    //     doc => {
    //         /**
    //         authority:""
    //         fragment:""
    //         fsPath:"/Users/xavierluiz/software/swdc-job-service/app/jobs/songStats.job.js"
    //         path:"/Users/xavierluiz/software/swdc-job-service/app/jobs/songStats.job.js"
    //         query:""
    //         scheme:"file"
    //          */
    //         KpmController.getInstance().processSelectedTextForJira();
    //     }
    // );
    // cmds.push(copyToJiraCmd);

    cmds.push(workspace.onDidChangeConfiguration((e) => updatePreferences()));

    return Disposable.from(...cmds);
}
