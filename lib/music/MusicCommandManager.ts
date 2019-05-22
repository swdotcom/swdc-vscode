import { window, StatusBarAlignment, StatusBarItem } from "vscode";
import { isMusicTime } from "../Util";
import * as CodyMusic from "cody-music";
import { MusicStateManager } from "./MusicStateManager";

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

export class MusicCommandManager {
    private static _buttons: Button[] = [];

    private static msMgr: MusicStateManager;

    private constructor() {
        // private to prevent non-singleton usage
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
            10
        );
        this.createButton("$(triangle-right)", "Play", "musictime.play", 10);
        this.createButton(
            "$(primitive-square)",
            "Pause",
            "musictime.pause",
            10
        );
        this.createButton("$(chevron-right)", "Next", "musictime.next", 10);
        this.createButton("♡", "Like", "musictime.like", 10);
        this.createButton("♥", "Unlike", "musictime.unlike", 10);
        this.createButton(
            "🎧",
            "Click to see more from Music Time",
            "musictime.menu",
            10
        );

        // get the current track state
        this.updateButtons();
    }

    public static async updateButtons() {
        const track = await CodyMusic.getRunningTrack();

        if (!track) {
            this.showLaunchPlayerControls();
            return;
        }

        // desktop returned a null track but we've determined there is a player running somewhere.
        // default by checking the spotify web player state
        if (track.playerType === CodyMusic.PlayerType.WebSpotify) {
            if (track.status === CodyMusic.TrackStatus.Playing) {
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
            if (track.status === CodyMusic.TrackStatus.Playing) {
                // show the pause
                this.showPauseControls(track);
            } else {
                // show the play
                this.showPlayControls(track);
            }
            return;
        }

        // no other choice, show the launch player
        this.showLaunchPlayerControls();
    }

    public static async stateCheckHandler() {
        await this.msMgr.gatherMusicInfo();
        if (isMusicTime()) {
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
        this._buttons = this._buttons.map(button => {
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
            } else {
                if (songInfo && btnCmd === "musictime.play") {
                    // show the song info over the play button
                    button.statusBarItem.tooltip = `${
                        button.tooltip
                    } - ${songInfo}`;
                }
                button.statusBarItem.show();
            }

            return button;
        });
    }

    private static showPauseControls(trackInfo) {
        const songInfo = `${trackInfo.name} (${trackInfo.artist})`;
        const loved = trackInfo ? trackInfo["loved"] || false : false;
        this._buttons = this._buttons.map(button => {
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
            } else {
                if (btnCmd === "musictime.pause") {
                    button.statusBarItem.tooltip = `${
                        button.tooltip
                    } - ${songInfo}`;
                }
                button.statusBarItem.show();
            }
            return button;
        });
    }
}
