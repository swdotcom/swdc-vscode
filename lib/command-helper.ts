import { commands, Disposable, workspace, window, TreeView } from "vscode";
import { MusicControlManager } from "./music/MusicControlManager";
import {
    handleCodeTimeLogin,
    handleSpotifyConnect,
    handleKpmClickedEvent,
    updatePreferences
} from "./DataController";
import {
    displayCodeTimeMetricsDashboard,
    showMenuOptions
} from "./MenuManager";
import {
    launchWebUrl,
    handleCodeTimeStatusToggle,
    isMusicTime,
    isCodeTime,
    codeTimeExtInstalled
} from "./Util";
import { KpmController } from "./KpmController";
import {
    MusicPlaylistProvider,
    connectPlaylistTreeView
} from "./music/MusicPlaylistProvider";
import { MusicStoreManager, MusicTreeItem } from "./music/MusicStoreManager";

export function createCommands(): {
    dispose: () => void;
} {
    let cmds = [];
    if (isCodeTime()) {
        //
        // Add the keystroke controller to the ext ctx, which
        // will then listen for text document changes.
        //
        const kpmController = new KpmController();
        cmds.push(kpmController);

        const kpmClickedCmd = commands.registerCommand(
            "extension.softwareKpmDashboard",
            () => {
                handleKpmClickedEvent();
            }
        );
        cmds.push(kpmClickedCmd);

        const loginCmd = commands.registerCommand(
            "extension.codeTimeLogin",
            () => {
                handleCodeTimeLogin();
            }
        );
        cmds.push(loginCmd);

        const codeTimeMetricsCmd = commands.registerCommand(
            "extension.codeTimeMetrics",
            () => {
                displayCodeTimeMetricsDashboard();
            }
        );
        cmds.push(codeTimeMetricsCmd);

        const paletteMenuCmd = commands.registerCommand(
            "extension.softwarePaletteMenu",
            () => {
                showMenuOptions();
            }
        );
        cmds.push(paletteMenuCmd);

        const top40Cmd = commands.registerCommand(
            "extension.viewSoftwareTop40",
            () => {
                launchWebUrl("https://api.software.com/music/top40");
            }
        );
        cmds.push(top40Cmd);

        const toggleStatusInfoCmd = commands.registerCommand(
            "extension.codeTimeStatusToggle",
            () => {
                handleCodeTimeStatusToggle();
            }
        );
        cmds.push(toggleStatusInfoCmd);

        const configChangesHandler = workspace.onDidChangeConfiguration(e =>
            updatePreferences()
        );
        cmds.push(configChangesHandler);
    } else if (isMusicTime()) {
        const musicStore: MusicStoreManager = MusicStoreManager.getInstance();
        const controller = new MusicControlManager();

        const nextCmd = commands.registerCommand("musictime.next", () => {
            controller.next();
        });
        cmds.push(nextCmd);

        const previousCmd = commands.registerCommand(
            "musictime.previous",
            () => {
                controller.previous();
            }
        );
        cmds.push(previousCmd);

        const playCmd = commands.registerCommand("musictime.play", () => {
            controller.play();
        });
        cmds.push(playCmd);

        const pauseCmd = commands.registerCommand("musictime.pause", () => {
            controller.pause();
        });
        cmds.push(pauseCmd);

        const menuCmd = commands.registerCommand("musictime.menu", () => {
            controller.showMenu();
        });
        cmds.push(menuCmd);

        const spotifyConnectCommand = commands.registerCommand(
            "musictime.connectSpotify",
            () => {
                handleSpotifyConnect();
            }
        );
        cmds.push(spotifyConnectCommand);

        const treePlaylistProvider = new MusicPlaylistProvider(musicStore);
        const playlistTreeView: TreeView<MusicTreeItem> = window.createTreeView(
            "music-time-playlists",
            {
                treeDataProvider: treePlaylistProvider,
                showCollapseAll: false
            }
        );
        cmds.push(connectPlaylistTreeView(playlistTreeView, musicStore));

        if (!codeTimeExtInstalled()) {
            // code time is not installed, load the kpm controller for music time
            const kpmController = new KpmController();
            cmds.push(kpmController);

            const top40Cmd = commands.registerCommand(
                "extension.viewSoftwareTop40",
                () => {
                    launchWebUrl("https://api.software.com/music/top40");
                }
            );
            cmds.push(top40Cmd);

            const configChangesHandler = workspace.onDidChangeConfiguration(e =>
                updatePreferences()
            );
            cmds.push(configChangesHandler);
        }
    }

    return Disposable.from(...cmds);
}
