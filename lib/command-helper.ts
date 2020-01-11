import { commands, Disposable, workspace, window, TreeView } from "vscode";
import {
    handleCodeTimeLogin,
    handleKpmClickedEvent,
    updatePreferences
} from "./DataController";
import {
    displayCodeTimeMetricsDashboard,
    showMenuOptions
} from "./MenuManager";
import { launchWebUrl, handleCodeTimeStatusToggle } from "./Util";
import { KpmController } from "./KpmController";
import { KpmProvider, connectKpmTreeView } from "./KpmProvider";
import { KpmItem } from "./models";

export function createCommands(
    kpmController: KpmController
): {
    dispose: () => void;
} {
    let cmds = [];

    cmds.push(kpmController);

    // playlist tree view
    const treeProvider = new KpmProvider();
    const kpmTreeView: TreeView<KpmItem> = window.createTreeView(
        "kpm-metrics",
        {
            treeDataProvider: treeProvider,
            showCollapseAll: false
        }
    );
    treeProvider.bindView(kpmTreeView);
    cmds.push(connectKpmTreeView(kpmTreeView));

    const kpmClickedCmd = commands.registerCommand(
        "codetime.softwareKpmDashboard",
        () => {
            handleKpmClickedEvent();
        }
    );
    cmds.push(kpmClickedCmd);

    const loginCmd = commands.registerCommand("codetime.codeTimeLogin", () => {
        handleCodeTimeLogin();
    });
    cmds.push(loginCmd);

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
