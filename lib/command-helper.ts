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
import { KpmController } from "./EventControls/KpmController";
import { KpmProvider, connectKpmTreeView } from "./TreeProviders/KpmProvider";
import {
    FileChangeProvider,
    connectFileChangeTreeView
} from "./TreeProviders/FileChangeProvider";
import {
    CommitProvider,
    connectCommitTreeView
} from "./TreeProviders/CommitProvider";
import {
    CodeTimeProvider,
    connectCodeTimeTreeView
} from "./TreeProviders/CodeTimeProvider";
import { KpmItem } from "./models";

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
    cmds.push(connectCommitTreeView(commitTreeView));

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
    cmds.push(connectFileChangeTreeView(fileChangeTreeView));

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
            codetimeTreeProvider.refresh();
            kpmTreeProvider.refresh();
            fileChangeTreeProvider.refresh();
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
