import { window, StatusBarAlignment, StatusBarItem } from "vscode";
import { isMusicTime, getSongDisplayName } from "../Util";
import { MusicStateManager } from "./MusicStateManager";
import {
    getRunningTrack,
    PlayerType,
    TrackStatus,
    Track,
    requiresSpotifyAccessInfo,
    PlaylistItem
} from "cody-music";
import { MusicStoreManager } from "./MusicStoreManager";
import { MusicPlaylistProvider } from "./MusicPlaylistProvider";
import { MusicTimePlaylistProvider } from "./MusicTimePlaylistProvider";

export interface Button {
    /**
     * Id of button
     */
    id: string;
    tooltip: string;
    /**
     * Generator of text for button(Octicons)
     */
    dynamicText?: (cond: boolean) => string;
    /**
     * Generator of color for button
     */
    dynamicColor?: (cond: boolean) => string;
    /**
     * vscode status bar item
     */
    statusBarItem: StatusBarItem;
}

const songNameDisplayTimeoutMillis: number = 12000;

export class MusicCommandManager {
    private static _buttons: Button[] = [];
    private static _hideSongTimeout = null;
    private static _treeProvider: MusicPlaylistProvider;
    private static _musicTimeTreeProvider: MusicTimePlaylistProvider;

    private static msMgr: MusicStateManager;

    private constructor() {
        // private to prevent non-singleton usage
    }

    public static setTreeProvider(provider: MusicPlaylistProvider) {
        this._treeProvider = provider;
    }

    public static setMusicTimeTreeProvider(
        provider: MusicTimePlaylistProvider
    ) {
        this._musicTimeTreeProvider = provider;
    }

    /**
     * Initialize the music command manager.
     * Create the list of status bar buttons that will be displayed.
     */
    public static async initialize() {
        if (!isMusicTime()) {
            return;
        }
        if (!this.msMgr) {
            this.msMgr = MusicStateManager.getInstance();
        }
        this.createButton(
            "🎧",
            "Click to see more from Music Time",
            "musictime.menu",
            31
        );
        this.createButton(
            "$(chevron-left)",
            "Previous",
            "musictime.previous",
            30
        );
        this.createButton("$(play)", "Play", "musictime.play", 29);
        this.createButton(
            "$(primitive-square)",
            "Pause",
            "musictime.pause",
            29
        );
        this.createButton(
            "$(stop)",
            "Connect Spotify to add your top productivity tracks",
            "musictime.connectSpotify",
            29
        );
        this.createButton("$(chevron-right)", "Next", "musictime.next", 28);
        this.createButton("♡", "Like", "musictime.like", 27);
        this.createButton("♥", "Unlike", "musictime.unlike", 27);
        // button area for the current song name
        this.createButton(
            "",
            "Click to view track",
            "musictime.currentSong",
            26
        );

        const track = await getRunningTrack();
        this.syncControls(track);
    }

    /**
     * Sync the music button controls
     */
    public static async syncControls(track: Track) {
        const musicstoreMgr: MusicStoreManager = MusicStoreManager.getInstance();

        musicstoreMgr.runningTrack = track;
        // update the playlist
        const selectedPlaylist: PlaylistItem = musicstoreMgr.selectedPlaylist;
        if (selectedPlaylist) {
            musicstoreMgr.clearPlaylistTracksForId(selectedPlaylist.id);
            musicstoreMgr.getTracksForPlaylistId(selectedPlaylist.id);

            if (this._treeProvider) {
                this._treeProvider.refreshParent(selectedPlaylist);
            }
            if (this._musicTimeTreeProvider) {
                this._musicTimeTreeProvider.refreshParent(selectedPlaylist);
            }
        }

        // get the current track state
        this.updateButtons();
    }

    /**
     * Update the buttons based on the current track state
     */
    public static async updateButtons() {
        const track: Track = MusicStoreManager.getInstance().runningTrack;
        if (this._hideSongTimeout) {
            clearTimeout(this._hideSongTimeout);
        }

        if (!track || !track.id) {
            this.showLaunchPlayerControls();
            return;
        }

        // desktop returned a null track but we've determined there is a player running somewhere.
        // default by checking the spotify web player state
        if (track.playerType === PlayerType.WebSpotify) {
            if (track.state === TrackStatus.Playing) {
                // show the pause
                this.showPauseControls(track);
            } else {
                // show the play
                this.showPlayControls(track);
            }
            return;
        }

        // we have a running player (desktop or web). what is the state?

        // get the desktop player track state
        if (track) {
            if (track.state === TrackStatus.Playing) {
                // show the pause
                this.showPauseControls(track);
            } else {
                // show the play
                this.showPlayControls(track);
            }
            return;
        }
    }

    /**
     * Create a status bar button
     * @param text
     * @param tooltip
     * @param command
     * @param priority
     */
    private static createButton(
        text: string,
        tooltip: string,
        command: string,
        priority: number
    ) {
        let statusBarItem = window.createStatusBarItem(
            StatusBarAlignment.Left,
            priority
        );
        statusBarItem.text = text;
        statusBarItem.command = command;
        statusBarItem.tooltip = tooltip;

        let button: Button = {
            id: command,
            statusBarItem,
            tooltip: tooltip
        };

        this._buttons.push(button);
    }

    private static async showLaunchPlayerControls() {
        // hide all except for the launch player button
        this._buttons = this._buttons.map(button => {
            const btnCmd = button.statusBarItem.command;

            let isMusicTimeMenu = btnCmd === "musictime.menu";
            let isConnectSpotify = btnCmd === "musictime.connectSpotify";

            if (isMusicTimeMenu) {
                button.statusBarItem.show();
            } else if (isConnectSpotify && requiresSpotifyAccessInfo()) {
                button.statusBarItem.show();
            } else {
                button.statusBarItem.hide();
            }
            return button;
        });
    }

    /**
     * Show the buttons to play a track
     * @param trackInfo
     */
    private static async showPlayControls(trackInfo: Track) {
        const songInfo = trackInfo
            ? `${trackInfo.name} (${trackInfo.artist})`
            : null;
        // get the server track
        let serverTrack = MusicStoreManager.getInstance().serverTrack;
        let showLoved = true;
        if (serverTrack && serverTrack.id !== trackInfo.id) {
            showLoved = false;
        }
        let loved = false;
        if (!serverTrack || serverTrack.id !== trackInfo.id) {
            loved = trackInfo ? trackInfo.loved || false : false;
        } else {
            loved = serverTrack.loved;
        }

        this._buttons.map(button => {
            const btnCmd = button.statusBarItem.command;
            if (btnCmd === "musictime.pause") {
                button.statusBarItem.hide();
            } else if (btnCmd === "musictime.like") {
                if (loved || !showLoved) {
                    button.statusBarItem.hide();
                } else {
                    button.statusBarItem.show();
                }
            } else if (btnCmd === "musictime.unlike") {
                if (loved && showLoved) {
                    button.statusBarItem.show();
                } else {
                    button.statusBarItem.hide();
                }
            } else if (btnCmd === "musictime.currentSong") {
                button.statusBarItem.tooltip = `(${trackInfo.name}) ${
                    button.tooltip
                }`;
                button.statusBarItem.text = getSongDisplayName(trackInfo.name);
                button.statusBarItem.show();
                this._hideSongTimeout = setTimeout(() => {
                    // hide this name in 10 seconds
                    this.hideSongDisplay();
                }, songNameDisplayTimeoutMillis);
            } else if (btnCmd === "musictime.connectSpotify") {
                button.statusBarItem.hide();
            } else {
                if (songInfo && btnCmd === "musictime.play") {
                    // show the song info over the play button
                    button.statusBarItem.tooltip = `${
                        button.tooltip
                    } - ${songInfo}`;
                }
                button.statusBarItem.show();
            }
        });
    }

    /**
     * Show the buttons to pause a track
     * @param trackInfo
     */
    private static showPauseControls(trackInfo: Track) {
        const songInfo = `${trackInfo.name} (${trackInfo.artist})`;
        // get the server track
        let serverTrack = MusicStoreManager.getInstance().serverTrack;
        let showLoved = true;
        if (serverTrack && serverTrack.id !== trackInfo.id) {
            showLoved = false;
        }
        let loved = false;
        if (!serverTrack || serverTrack.id !== trackInfo.id) {
            loved = trackInfo ? trackInfo.loved || false : false;
        } else {
            loved = serverTrack.loved;
        }

        this._buttons.map(button => {
            const btnCmd = button.statusBarItem.command;
            if (btnCmd === "musictime.play") {
                button.statusBarItem.hide();
            } else if (btnCmd === "musictime.like") {
                if (loved || !showLoved) {
                    button.statusBarItem.hide();
                } else {
                    button.statusBarItem.show();
                }
            } else if (btnCmd === "musictime.unlike") {
                if (loved && showLoved) {
                    button.statusBarItem.show();
                } else {
                    button.statusBarItem.hide();
                }
            } else if (btnCmd === "musictime.currentSong") {
                button.statusBarItem.tooltip = `(${trackInfo.name}) ${
                    button.tooltip
                }`;
                button.statusBarItem.text = getSongDisplayName(trackInfo.name);
                button.statusBarItem.show();
                this._hideSongTimeout = setTimeout(() => {
                    // hide this name in 10 seconds
                    this.hideSongDisplay();
                }, songNameDisplayTimeoutMillis);
            } else if (btnCmd === "musictime.connectSpotify") {
                button.statusBarItem.hide();
            } else {
                if (btnCmd === "musictime.pause") {
                    button.statusBarItem.tooltip = `${
                        button.tooltip
                    } - ${songInfo}`;
                }
                button.statusBarItem.show();
            }
        });
    }

    /**
     * Hide the song name display
     */
    private static hideSongDisplay() {
        this._buttons.map(button => {
            const btnCmd = button.statusBarItem.command;
            if (btnCmd === "musictime.currentSong") {
                button.statusBarItem.hide();
            }
        });
        this._hideSongTimeout = null;
    }
}
