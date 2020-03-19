import { commands, Disposable, workspace, window, TreeView } from "vscode";
import { handleKpmClickedEvent, updatePreferences } from "./DataController";
import {
    displayCodeTimeMetricsDashboard,
    showMenuOptions
} from "./menu/MenuManager";
import {
    launchWebUrl,
    handleCodeTimeStatusToggle,
    launchLogin,
    openFileInEditor,
    displayReadmeIfNotExists,
    toggleStatusBar
} from "./Util";
import { KpmManager } from "./managers/KpmManager";
import { KpmProvider, connectKpmTreeView } from "./tree/KpmProvider";
import { CommitProvider, connectCommitTreeView } from "./tree/CommitProvider";
import {
    CodeTimeProvider,
    connectCodeTimeTreeView
} from "./tree/CodeTimeProvider";
import { KpmItem } from "./model/models";
import { KpmProviderManager } from "./tree/KpmProviderManager";
import { ProjectCommitManager } from "./menu/ProjectCommitManager";
import { ProjectNoteManager } from "./menu/ProjectNoteManager";

export function createCommands(
    kpmController: KpmManager
): {
    dispose: () => void;
} {
    let cmds = [];

    cmds.push(kpmController);

    // options tree view
    const codetimeTreeProvider = new CodeTimeProvider();
    const codetimeTreeView: TreeView<KpmItem> = window.createTreeView(
        "kpm-options-tree",
        {
            treeDataProvider: codetimeTreeProvider,
            showCollapseAll: false
        }
    );
    codetimeTreeProvider.bindView(codetimeTreeView);
    cmds.push(connectCodeTimeTreeView(codetimeTreeView));

    // kpm tree view
    const kpmTreeProvider = new KpmProvider();
    const kpmTreeView: TreeView<KpmItem> = window.createTreeView(
        "kpm-metrics-tree",
        {
            treeDataProvider: kpmTreeProvider,
            showCollapseAll: false
        }
    );
    kpmTreeProvider.bindView(kpmTreeView);
    cmds.push(connectKpmTreeView(kpmTreeView));

    // commit change tree view
    const commitTreeProvider = new CommitProvider();
    const commitTreeView: TreeView<KpmItem> = window.createTreeView(
        "commit-tree",
        {
            treeDataProvider: commitTreeProvider,
            showCollapseAll: false
        }
    );
    commitTreeProvider.bindView(commitTreeView);
    cmds.push(connectCommitTreeView(commitTreeView));

    const kpmClickedCmd = commands.registerCommand(
        "codetime.softwareKpmDashboard",
        () => {
            handleKpmClickedEvent();
            setTimeout(() => {
                commands.executeCommand("codetime.refreshCodetimeTree");
            }, 500);
        }
    );
    cmds.push(kpmClickedCmd);

    const displayTreeCmd = commands.registerCommand(
        "codetime.displayTree",
        () => {
            codetimeTreeProvider.revealTree();
        }
    );
    cmds.push(displayTreeCmd);

    const openFileInEditorCmd = commands.registerCommand(
        "codetime.openFileInEditor",
        file => {
            openFileInEditor(file);
            setTimeout(() => {
                commands.executeCommand("codetime.refreshKpmTree");
            }, 500);
        }
    );
    cmds.push(openFileInEditorCmd);

    const toggleStatusBarCmd = commands.registerCommand(
        "codetime.toggleStatusBar",
        () => {
            toggleStatusBar();
            setTimeout(() => {
                commands.executeCommand("codetime.refreshCodetimeTree");
            }, 500);
        }
    );
    cmds.push(toggleStatusBarCmd);

    const loginCmd = commands.registerCommand("codetime.codeTimeLogin", () => {
        launchLogin("software");
    });
    cmds.push(loginCmd);

    const googleLoginCmd = commands.registerCommand(
        "codetime.googleLogin",
        () => {
            launchLogin("google");
        }
    );
    cmds.push(googleLoginCmd);

    const githubLoginCmd = commands.registerCommand(
        "codetime.githubLogin",
        () => {
            launchLogin("github");
        }
    );
    cmds.push(githubLoginCmd);

    const refreshCodetimeTreeCmd = commands.registerCommand(
        "codetime.refreshCodetimeTree",
        () => {
            codetimeTreeProvider.refresh();
        }
    );
    cmds.push(refreshCodetimeTreeCmd);

    const refreshKpmTreeCmd = commands.registerCommand(
        "codetime.refreshKpmTree",
        keystrokeStats => {
            KpmProviderManager.getInstance().setCurrentKeystrokeStats(
                keystrokeStats
            );
            codetimeTreeProvider.refresh();
            kpmTreeProvider.refresh();
            commitTreeProvider.refresh();
        }
    );
    cmds.push(refreshKpmTreeCmd);

    const refreshCommitTreeCmd = commands.registerCommand(
        "codetime.refreshCommitTree",
        () => {
            commitTreeProvider.refresh();
        }
    );
    cmds.push(refreshCommitTreeCmd);

    const showReadmeCmd = commands.registerCommand(
        "codetime.displayReadme",
        () => {
            displayReadmeIfNotExists(true /*override*/);
            setTimeout(() => {
                commands.executeCommand("codetime.refreshCodetimeTree");
            }, 500);
        }
    );
    cmds.push(showReadmeCmd);

    const codeTimeMetricsCmd = commands.registerCommand(
        "codetime.codeTimeMetrics",
        () => {
            displayCodeTimeMetricsDashboard();
            setTimeout(() => {
                commands.executeCommand("codetime.refreshCodetimeTree");
            }, 500);
        }
    );
    cmds.push(codeTimeMetricsCmd);

    const generateProjectSummaryCmd = commands.registerCommand(
        "codetime.generateProjectSummary",
        () => {
            ProjectCommitManager.getInstance().launchProjectCommitMenuFlow();
            setTimeout(() => {
                commands.executeCommand("codetime.refreshCodetimeTree");
            }, 500);
        }
    );
    cmds.push(generateProjectSummaryCmd);

    const paletteMenuCmd = commands.registerCommand(
        "codetime.softwarePaletteMenu",
        () => {
            showMenuOptions();
        }
    );
    cmds.push(paletteMenuCmd);

    const top40Cmd = commands.registerCommand(
        "codetime.viewSoftwareTop40",
        () => {
            launchWebUrl("https://api.software.com/music/top40");
        }
    );
    cmds.push(top40Cmd);

    const toggleStatusInfoCmd = commands.registerCommand(
        "codetime.codeTimeStatusToggle",
        () => {
            handleCodeTimeStatusToggle();
        }
    );
    cmds.push(toggleStatusInfoCmd);

    const sendFeedbackCmd = commands.registerCommand(
        "codetime.sendFeedback",
        () => {
            launchWebUrl("mailto:cody@software.com");
        }
    );
    cmds.push(sendFeedbackCmd);

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

    const configChangesHandler = workspace.onDidChangeConfiguration(e =>
        updatePreferences()
    );
    cmds.push(configChangesHandler);

    return Disposable.from(...cmds);
}
