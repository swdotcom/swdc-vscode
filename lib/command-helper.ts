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
import { KpmController } from "./event/KpmController";
import { KpmProvider, connectKpmTreeView } from "./tree/KpmProvider";
import { CommitProvider, connectCommitTreeView } from "./tree/CommitProvider";
import {
    CodeTimeProvider,
    connectCodeTimeTreeView
} from "./tree/CodeTimeProvider";
import { KpmItem } from "./model/models";

export function createCommands(
    kpmController: KpmController
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
        launchLogin();
    });
    cmds.push(loginCmd);

    const refreshCodetimeTreeCmd = commands.registerCommand(
        "codetime.refreshCodetimeTree",
        () => {
            codetimeTreeProvider.refresh();
        }
    );
    cmds.push(refreshCodetimeTreeCmd);

    const refreshKpmTreeCmd = commands.registerCommand(
        "codetime.refreshKpmTree",
        () => {
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

    const configChangesHandler = workspace.onDidChangeConfiguration(e =>
        updatePreferences()
    );
    cmds.push(configChangesHandler);

    return Disposable.from(...cmds);
}
