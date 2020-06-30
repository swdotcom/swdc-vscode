import { commands, Disposable, workspace, window, TreeView } from "vscode";
import {
    handleKpmClickedEvent,
    updatePreferences,
    sendTeamInvite,
} from "./DataController";
import {
    displayCodeTimeMetricsDashboard,
    showMenuOptions,
} from "./menu/MenuManager";
import {
    launchWebUrl,
    handleCodeTimeStatusToggle,
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
import { KpmItem } from "./model/models";
import { KpmProviderManager } from "./tree/KpmProviderManager";
import { ProjectCommitManager } from "./menu/ProjectCommitManager";
import {
    CodeTimeTeamProvider,
    connectCodeTimeTeamTreeView,
} from "./tree/CodeTimeTeamProvider";
import { displayProjectContributorCommitsDashboard } from "./menu/ReportManager";
import { sendOfflineData } from "./managers/FileManager";
import { PluginDataManager } from "./managers/PluginDataManager";
import {
    processSwitchAccounts,
    showSwitchAccountsMenu,
} from "./menu/AccountManager";
import { TrackerManager } from "./managers/TrackerManager";

export function createCommands(
    kpmController: KpmManager
): {
    dispose: () => void;
} {
    let cmds = [];

    const trackerMgr: TrackerManager = TrackerManager.getInstance();
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

    // MENU TREE: REVEAL
    cmds.push(
        commands.registerCommand("codetime.displayTree", () => {
            codetimeMenuTreeProvider.revealTree();
        })
    );

    // SWITCH ACCOUNTS MENU BUTTON
    cmds.push(
        commands.registerCommand("codetime.showAccountInfoMenu", () => {
            showSwitchAccountsMenu();
        })
    );

    // SWITCH ACCOUNTS PROCESS BUTTON
    cmds.push(
        commands.registerCommand("codetime.switchAccounts", () => {
            processSwitchAccounts();
        })
    );

    // MENU TREE: REFRESH
    cmds.push(
        commands.registerCommand("codetime.refreshCodetimeMenuTree", () => {
            codetimeMenuTreeProvider.refresh();
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

    // TEAM TREE: REFRESH
    cmds.push(
        commands.registerCommand("codetime.refreshCodetimeTeamTree", () => {
            codetimeTeamTreeProvider.refresh();
        })
    );

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
            // clear the time counter stats
            PluginDataManager.getInstance().clearStatsForPayloadProcess();
        })
    );

    // SHOW ASCII DASHBOARD
    cmds.push(
        commands.registerCommand("codetime.softwareKpmDashboard", () => {
            handleKpmClickedEvent();
        })
    );

    // OPEN SPECIFIED FILE IN EDITOR
    cmds.push(
        commands.registerCommand("codetime.openFileInEditor", (file) => {
            openFileInEditor(file);
        })
    );

    // REFRESH MENU
    cmds.push(
        commands.registerCommand("codetime.toggleStatusBar", () => {
            toggleStatusBar();
            setTimeout(() => {
                commands.executeCommand("codetime.refreshCodetimeMenuTree");
            }, 500);
        })
    );

    // LAUNCH EMAIL LOGIN
    cmds.push(
        commands.registerCommand("codetime.codeTimeLogin", () => {
            launchLogin("software");
        })
    );

    // LAUNCH GOOGLE LOGIN
    cmds.push(
        commands.registerCommand("codetime.googleLogin", () => {
            launchLogin("google");
        })
    );

    // LAUNCH GITHUB LOGIN
    cmds.push(
        commands.registerCommand("codetime.githubLogin", () => {
            launchLogin("github");
        })
    );

    // LAUNCH LINK ACCOUNT OPTION
    cmds.push(
        commands.registerCommand("codetime.linkAccount", () => {
            // disabled for now
            // launchLogin("linkAccount");
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
        commands.registerCommand("codetime.displayReadme", () => {
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
                trackerMgr.trackUICommandInteraction(item);
            } else {
                // it's from the tree menu
                trackerMgr.trackUIClickInteraction(item);
            }

            displayCodeTimeMetricsDashboard();
        })
    );

    // DISPLAY PROJECT METRICS REPORT
    cmds.push(
        commands.registerCommand("codetime.generateProjectSummary", () => {
            ProjectCommitManager.getInstance().launchProjectCommitMenuFlow();
        })
    );

    // DISPLAY REPO COMMIT CONTRIBUTOR REPORT
    cmds.push(
        commands.registerCommand(
            "codetime.generateContributorSummary",
            (identifier) => {
                displayProjectContributorCommitsDashboard(identifier);
            }
        )
    );

    // LAUNCH COMMIT URL
    cmds.push(
        commands.registerCommand("codetime.launchCommitUrl", (commitLink) => {
            launchWebUrl(commitLink);
        })
    );

    // DISPLAY PALETTE MENU
    cmds.push(
        commands.registerCommand("codetime.softwarePaletteMenu", () => {
            showMenuOptions();
        })
    );

    cmds.push(
        commands.registerCommand("codetime.viewSoftwareTop40", () => {
            launchWebUrl("https://api.software.com/music/top40");
        })
    );

    cmds.push(
        commands.registerCommand("codetime.codeTimeStatusToggle", () => {
            handleCodeTimeStatusToggle();
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
