import { commands, Disposable, workspace, window, TreeView } from "vscode";
import {
    MusicControlManager,
    connectSpotify,
    disconnectSpotify
} from "./music/MusicControlManager";
import {
    handleCodeTimeLogin,
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
import { MusicTimePlaylistProvider } from "./music/MusicTimePlaylistProvider";
import { PlaylistItem, PlayerName, PlaylistTrackInfo } from "cody-music";
import {
    MusicSettingsProvider,
    connectSettingsTreeView
} from "./music/MusicSettingsProvider";
import { MusicCommandManager } from "./music/MusicCommandManager";
import { MusicStoreManager } from "./music/MusicStoreManager";
import { SocialShareManager } from "./social/SocialShareManager";

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

        // const copyTrackLinkCmd = commands.registerCommand(
        //     "musictime.copyTrack",
        //     (node: PlaylistTreeItem) => {
        //         controller.copySpotifyLink(node.id, false);
        //     }
        // );
        // cmds.push(copyTrackLinkCmd);

        // const copyPlaylistLinkCmd = commands.registerCommand(
        //     "musictime.copyPlaylist",
        //     (node: PlaylistTreeItem) => {
        //         controller.copySpotifyLink(node.id, true);
        //     }
        // );
        // cmds.push(copyPlaylistLinkCmd);

        const sharePlaylistLinkCmd = commands.registerCommand(
            "musictime.sharePlaylist",
            (node: PlaylistItem) => {
                SocialShareManager.getInstance().showMenu(
                    node.id,
                    node.name,
                    true
                );
            }
        );
        cmds.push(sharePlaylistLinkCmd);

        const shareTrackLinkCmd = commands.registerCommand(
            "musictime.shareTrack",
            (node: PlaylistItem) => {
                SocialShareManager.getInstance().showMenu(
                    node.id,
                    node.name,
                    false
                );
            }
        );
        cmds.push(shareTrackLinkCmd);

        const pauseCmd = commands.registerCommand("musictime.pause", () => {
            controller.pause();
        });
        cmds.push(pauseCmd);

        const likeCmd = commands.registerCommand("musictime.like", () => {
            controller.setLiked(true);
        });
        cmds.push(likeCmd);

        const unlikeCmd = commands.registerCommand("musictime.unlike", () => {
            controller.setLiked(false);
        });
        cmds.push(unlikeCmd);

        const menuCmd = commands.registerCommand("musictime.menu", () => {
            controller.showMenu();
        });
        cmds.push(menuCmd);

        const launchTrackPlayerCmd = commands.registerCommand(
            "musictime.currentSong",
            () => {
                controller.launchTrackPlayer();
            }
        );
        cmds.push(launchTrackPlayerCmd);

        const spotifyConnectCommand = commands.registerCommand(
            "musictime.connectSpotify",
            () => {
                connectSpotify();
            }
        );
        cmds.push(spotifyConnectCommand);

        const disconnectSpotifyCommand = commands.registerCommand(
            "musictime.disconnectSpotify",
            () => {
                disconnectSpotify();
            }
        );
        cmds.push(disconnectSpotifyCommand);

        // music time playlist provider
        const treeMusicTimePlaylistProvider = new MusicTimePlaylistProvider();
        const musicTimePlaylistTreeView: TreeView<
            PlaylistItem
        > = window.createTreeView("music-time-playlists", {
            treeDataProvider: treeMusicTimePlaylistProvider,
            showCollapseAll: false
        });
        MusicCommandManager.setMusicTimeTreeProvider(
            treeMusicTimePlaylistProvider
        );
        treeMusicTimePlaylistProvider.bindView(musicTimePlaylistTreeView);
        cmds.push(connectPlaylistTreeView(musicTimePlaylistTreeView));

        // playlist tree view
        const treePlaylistProvider = new MusicPlaylistProvider();
        const playlistTreeView: TreeView<PlaylistItem> = window.createTreeView(
            "my-playlists",
            {
                treeDataProvider: treePlaylistProvider,
                showCollapseAll: false
            }
        );
        MusicCommandManager.setTreeProvider(treePlaylistProvider);
        treePlaylistProvider.bindView(playlistTreeView);
        cmds.push(connectPlaylistTreeView(playlistTreeView));

        // settings tree view
        const treeSettingsProvider = new MusicSettingsProvider();
        const settingsTreeView: TreeView<PlaylistItem> = window.createTreeView(
            "music-time-players",
            {
                treeDataProvider: treeSettingsProvider,
                showCollapseAll: false
            }
        );
        cmds.push(connectSettingsTreeView(settingsTreeView));

        const refreshReconcileCommand = commands.registerCommand(
            "musictime.refreshReconcile",
            () => {
                MusicStoreManager.getInstance()
                    .refreshPlaylists()
                    .then(() => {
                        MusicStoreManager.getInstance().reconcilePlaylists();
                    });
            }
        );
        cmds.push(refreshReconcileCommand);

        const refreshPlaylistCommand = commands.registerCommand(
            "musictime.refreshPlaylist",
            () => {
                treePlaylistProvider.refresh();
                treeMusicTimePlaylistProvider.refresh();
            }
        );
        cmds.push(refreshPlaylistCommand);

        const refreshSettingsCommand = commands.registerCommand(
            "musictime.refreshSettings",
            () => treeSettingsProvider.refresh()
        );
        cmds.push(refreshSettingsCommand);

        const launchSpotifyCommand = commands.registerCommand(
            "musictime.launchSpotify",
            () => controller.launchTrackPlayer(PlayerName.SpotifyWeb)
        );
        cmds.push(launchSpotifyCommand);

        const launchSpotifyPlaylistCommand = commands.registerCommand(
            "musictime.spotifyPlaylist",
            () => controller.launchTrackPlayer(PlayerName.SpotifyWeb)
        );
        cmds.push(launchSpotifyPlaylistCommand);

        const launchItunesCommand = commands.registerCommand(
            "musictime.launchItunes",
            () => controller.launchTrackPlayer(PlayerName.ItunesDesktop)
        );
        cmds.push(launchItunesCommand);

        const launchItunesPlaylistCommand = commands.registerCommand(
            "musictime.itunesPlaylist",
            () => controller.launchTrackPlayer(PlayerName.ItunesDesktop)
        );
        cmds.push(launchItunesPlaylistCommand);

        const generateWeeklyPlaylistCommand = commands.registerCommand(
            "musictime.generateWeeklyPlaylist",
            () => MusicStoreManager.getInstance().generateUsersWeeklyTopSongs()
        );
        cmds.push(generateWeeklyPlaylistCommand);

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
