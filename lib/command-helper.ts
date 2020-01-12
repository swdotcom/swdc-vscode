import { commands, Disposable, workspace, window, TreeView } from "vscode";
import { handleKpmClickedEvent, updatePreferences } from "./DataController";
import {
    displayCodeTimeMetricsDashboard,
    showMenuOptions
} from "./MenuManager";
import {
    launchWebUrl,
    handleCodeTimeStatusToggle,
    launchLogin,
    openFileInEditor
} from "./Util";
import { KpmController } from "./KpmController";
import { KpmProvider } from "./KpmProvider";
import { FileChangeProvider } from "./FileChangeProvider";
import { CommitProvider } from "./CommitProvider";
import { KpmItem } from "./models";
import { connectTreeView } from "./KpmProviderManager";

export function createCommands(
    kpmController: KpmController
): {
    dispose: () => void;
} {
    let cmds = [];

    cmds.push(kpmController);

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
    cmds.push(connectTreeView(kpmTreeView));

    // file change tree view
    const commitTreeProvider = new CommitProvider();
    const commitTreeView: TreeView<KpmItem> = window.createTreeView(
        "commit-tree",
        {
            treeDataProvider: commitTreeProvider,
            showCollapseAll: false
        }
    );
    commitTreeProvider.bindView(commitTreeView);
    cmds.push(connectTreeView(commitTreeView));

    // commit tree view
    const fileChangeTreeProvider = new FileChangeProvider();
    const fileChangeTreeView: TreeView<KpmItem> = window.createTreeView(
        "file-change-tree",
        {
            treeDataProvider: fileChangeTreeProvider,
            showCollapseAll: false
        }
    );
    fileChangeTreeProvider.bindView(fileChangeTreeView);
    cmds.push(connectTreeView(fileChangeTreeView));

    const kpmClickedCmd = commands.registerCommand(
        "codetime.softwareKpmDashboard",
        () => {
            handleKpmClickedEvent();
        }
    );
    cmds.push(kpmClickedCmd);

    const openFileInEditorCmd = commands.registerCommand(
        "codetime.openFileInEditor",
        file => {
            openFileInEditor(file);
        }
    );
    cmds.push(openFileInEditorCmd);

    const loginCmd = commands.registerCommand("codetime.codeTimeLogin", () => {
        launchLogin();
    });
    cmds.push(loginCmd);

    const refreshKpmTreeCmd = commands.registerCommand(
        "codetime.refreshKpmTree",
        () => {
            kpmTreeProvider.refresh();
            fileChangeTreeProvider.refresh();
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

    const codeTimeMetricsCmd = commands.registerCommand(
        "codetime.codeTimeMetrics",
        () => {
            displayCodeTimeMetricsDashboard();
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

    const configChangesHandler = workspace.onDidChangeConfiguration(e =>
        updatePreferences()
    );
    cmds.push(configChangesHandler);

    return Disposable.from(...cmds);
}
