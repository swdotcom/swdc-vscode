import { window, StatusBarAlignment, StatusBarItem } from "vscode";
import { isMusicTime, getSongDisplayName } from "../Util";
import { MusicStateManager } from "./MusicStateManager";
import { MusicStoreManager } from "./MusicStoreManager";
import { getRunningTrack, PlayerType, TrackStatus } from "cody-music";

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

    private static msMgr: MusicStateManager;

    private constructor() {
        // private to prevent non-singleton usage
        MusicStoreManager.getInstance().initializeSpotify();
    }

    public static async initialize() {
        if (!this.msMgr) {
            this.msMgr = MusicStateManager.getInstance();
        }
        if (!isMusicTime()) {
            return;
        }
        this.createButton(
            "$(chevron-left)",
            "Previous",
            "musictime.previous",
            30
        );
        this.createButton("$(triangle-right)", "Play", "musictime.play", 29);
        this.createButton(
            "$(primitive-square)",
            "Pause",
            "musictime.pause",
            29
        );
        this.createButton("$(chevron-right)", "Next", "musictime.next", 28);
        this.createButton("♡", "Like", "musictime.like", 27);
        this.createButton("♥", "Unlike", "musictime.unlike", 27);
        this.createButton(
            "🎧",
            "Click to see more from Music Time",
            "musictime.menu",
            26
        );
        // button area for the current song name
        this.createButton(
            "",
            "Click to launch track player",
            "musictime.currentSong",
            25
        );

        // get the current track state
        this.updateButtons();
    }

    public static async updateButtons() {
        if (this._hideSongTimeout) {
            clearTimeout(this._hideSongTimeout);
        }
        const track = await getRunningTrack();
        if (!track || !track.id) {
            this.showLaunchPlayerControls();
            return;
        }

        if (track.playerType !== PlayerType.MacItunesDesktop) {
            // get the liked state
            await this.msMgr.updateLovedStateFromServer(track);
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

    public static async stateCheckHandler() {
        const hasChanges = await this.msMgr.gatherMusicInfo();
        if (hasChanges && isMusicTime()) {
            this.updateButtons();
        }
    }

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
            if (btnCmd === "musictime.menu") {
                button.statusBarItem.show();
            } else {
                button.statusBarItem.hide();
            }
            return button;
        });
    }

    private static async showPlayControls(trackInfo) {
        const songInfo = trackInfo
            ? `${trackInfo.name} (${trackInfo.artist})`
            : null;
        const loved = trackInfo ? trackInfo["loved"] || false : false;
        this._buttons.map(button => {
            const btnCmd = button.statusBarItem.command;
            if (btnCmd === "musictime.pause") {
                button.statusBarItem.hide();
            } else if (btnCmd === "musictime.like") {
                if (loved) {
                    button.statusBarItem.hide();
                } else {
                    button.statusBarItem.show();
                }
            } else if (btnCmd === "musictime.unlike") {
                if (loved) {
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

    private static showPauseControls(trackInfo) {
        const songInfo = `${trackInfo.name} (${trackInfo.artist})`;
        const loved = trackInfo ? trackInfo["loved"] || false : false;
        this._buttons.map(button => {
            const btnCmd = button.statusBarItem.command;
            if (btnCmd === "musictime.play") {
                button.statusBarItem.hide();
            } else if (btnCmd === "musictime.like") {
                if (loved) {
                    button.statusBarItem.hide();
                } else {
                    button.statusBarItem.show();
                }
            } else if (btnCmd === "musictime.unlike") {
                if (loved) {
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
