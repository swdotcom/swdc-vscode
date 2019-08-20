import { commands, Disposable, workspace, window, TreeView } from "vscode";
import {
    MusicControlManager,
    connectSpotify,
    disconnectSpotify,
    disconnectSlack
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
    connectPlaylistTreeView,
    playSelectedItem
} from "./music/MusicPlaylistProvider";
import { PlaylistItem, PlayerName, TrackStatus } from "cody-music";
import { MusicCommandManager } from "./music/MusicCommandManager";
import { SocialShareManager } from "./social/SocialShareManager";
import { connectSlack } from "./slack/SlackControlManager";
import { MusicManager } from "./music/MusicManager";
import { MusicStateManager } from "./music/MusicStateManager";

export function createCommands(): {
    dispose: () => void;
} {
    let cmds = [];

    //
    // Add the keystroke controller to the ext ctx, which
    // will then listen for text document changes.
    //
    const kpmController = new KpmController();
    if (isCodeTime()) {
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
        const musicMgr: MusicManager = MusicManager.getInstance();

        MusicStateManager.getInstance().setKpmController(kpmController);

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

        const nextCmd = commands.registerCommand("musictime.next", () => {
            controller.nextSong();
        });
        cmds.push(nextCmd);

        const previousCmd = commands.registerCommand(
            "musictime.previous",
            () => {
                controller.previousSong();
            }
        );
        cmds.push(previousCmd);

        const playCmd = commands.registerCommand(
            "musictime.play",
            (p: PlaylistItem) => {
                const notAssigned =
                    p && (!p.state || p.state === TrackStatus.NotAssigned)
                        ? true
                        : false;
                const isPlaylist =
                    p && p["itemType"] === "playlist" ? true : false;
                const hasTracks =
                    p && p.tracks && p.tracks["total"] && p.tracks["total"] > 0
                        ? true
                        : false;
                if (isPlaylist && !hasTracks) {
                    return;
                }
                if (notAssigned) {
                    playSelectedItem(p, false /*isExpand*/);
                } else {
                    controller.playSong();
                }
            }
        );
        cmds.push(playCmd);

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
            controller.pauseSong();
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
                musicMgr.launchTrackPlayer();
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

        const slackConnectCommand = commands.registerCommand(
            "musictime.connectSlack",
            () => {
                connectSlack();
            }
        );
        cmds.push(slackConnectCommand);

        const disconnectSpotifyCommand = commands.registerCommand(
            "musictime.disconnectSpotify",
            () => {
                disconnectSpotify();
            }
        );
        cmds.push(disconnectSpotifyCommand);

        const disconnectSlackCommand = commands.registerCommand(
            "musictime.disconnectSlack",
            () => {
                disconnectSlack();
            }
        );
        cmds.push(disconnectSlackCommand);

        const reconcilePlaylistCommand = commands.registerCommand(
            "musictime.reconcilePlaylist",
            async () => {
                await musicMgr.reconcilePlaylists();
                await musicMgr.clearSavedPlaylists();
                setTimeout(async () => {
                    commands.executeCommand("musictime.refreshPlaylist");
                }, 1000);
            }
        );
        cmds.push(reconcilePlaylistCommand);

        const refreshPlaylistCommand = commands.registerCommand(
            "musictime.refreshPlaylist",
            async () => {
                await musicMgr.clearPlaylists();
                await musicMgr.refreshPlaylists();
                setTimeout(() => {
                    treePlaylistProvider.refresh();
                }, 1000);
            }
        );
        cmds.push(refreshPlaylistCommand);

        const launchSpotifyCommand = commands.registerCommand(
            "musictime.launchSpotify",
            () => musicMgr.launchTrackPlayer(PlayerName.SpotifyWeb)
        );
        cmds.push(launchSpotifyCommand);

        const spotifyPremiumRequiredCommand = commands.registerCommand(
            "musictime.spotifyPremiumRequired",
            () => musicMgr.launchTrackPlayer(PlayerName.SpotifyWeb)
        );
        cmds.push(spotifyPremiumRequiredCommand);

        const launchSpotifyPlaylistCommand = commands.registerCommand(
            "musictime.spotifyPlaylist",
            () => musicMgr.launchTrackPlayer(PlayerName.SpotifyWeb)
        );
        cmds.push(launchSpotifyPlaylistCommand);

        const launchItunesCommand = commands.registerCommand(
            "musictime.launchItunes",
            () => musicMgr.launchTrackPlayer(PlayerName.ItunesDesktop)
        );
        cmds.push(launchItunesCommand);

        const launchItunesPlaylistCommand = commands.registerCommand(
            "musictime.itunesPlaylist",
            () => musicMgr.launchTrackPlayer(PlayerName.ItunesDesktop)
        );
        cmds.push(launchItunesPlaylistCommand);

        const generateWeeklyPlaylistCommand = commands.registerCommand(
            "musictime.generateWeeklyPlaylist",
            () => musicMgr.generateUsersWeeklyTopSongs()
        );
        cmds.push(generateWeeklyPlaylistCommand);

        const generateGlobalPlaylistCommand = commands.registerCommand(
            "musictime.generateGlobalPlaylist",
            () => musicMgr.createOrRefreshGlobalTopSongsPlaylist()
        );
        cmds.push(generateGlobalPlaylistCommand);

        if (!codeTimeExtInstalled()) {
            // code time is not installed, load the kpm controller for music time
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
