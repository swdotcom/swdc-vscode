import { workspace, window, StatusBarAlignment, StatusBarItem } from "vscode";
import { isMusicTime, isWindows } from "../Util";
import { MusicStateManagerSingleton, TrackState } from "./MusicStateManager";
import * as music from "cody-music";

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

export class MusicPlayerManagerSingleton {
    private static _buttons: Button[] = [];
    private static _currentTrackState: TrackState = null;

    private constructor() {
        // private to prevent non-singleton usage
    }

    public static async initialize() {
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
            "Click to launch your music player",
            "musictime.launchplayer",
            10
        );
        this.createButton(
            "$(grabber)",
            "Click to see more from Music Time",
            "musictime.menu",
            10
        );

        // get the current track state
        this.updateButtons();
    }

    public static async updateButtons() {
        // get the current track state
        this._currentTrackState = await MusicStateManagerSingleton.getState();
        if (
            !this._currentTrackState ||
            !this._currentTrackState.track ||
            this._currentTrackState.track.state !== "playing"
        ) {
            this.showPlayControls(this._currentTrackState);
        } else {
            this.showPauseControls(this._currentTrackState);
        }
    }

    private static getConfig() {
        return workspace.getConfiguration("player");
    }

    public static stateCheckHandler() {
        MusicStateManagerSingleton.gatherMusicInfo();
        if (isMusicTime()) {
            this.updateButtons();
        }
    }

    public static getTrackState(): TrackState {
        return this._currentTrackState;
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

    private static async showPlayControls(trackState: TrackState) {
        // check if the player is actually on since we're in the show play controls function
        let spotifyRunning = false;
        let itunesRunning = false;
        if (isWindows()) {
            // supports only spotify for now
            spotifyRunning = await MusicStateManagerSingleton.isWindowsSpotifyRunning();
        } else {
            spotifyRunning = await music.isRunning("Spotify");
            itunesRunning = await music.isRunning("iTunes");
        }
        if (!spotifyRunning && !itunesRunning) {
            // hide all except for the launch player button
            this._buttons = this._buttons.map(button => {
                const btnCmd = button.statusBarItem.command;
                if (
                    btnCmd === "musictime.launchplayer" ||
                    btnCmd === "musictime.menu"
                ) {
                    button.statusBarItem.show();
                } else {
                    button.statusBarItem.hide();
                }
                return button;
            });
        } else {
            const trackInfo = trackState ? trackState.track || null : null;
            const songInfo = trackInfo
                ? `${trackInfo.name} (${trackInfo.artist})`
                : null;
            const loved = trackInfo ? trackInfo.loved || false : false;
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
                } else if (btnCmd === "musictime.launchplayer") {
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

                return button;
            });
        }
    }

    private static showPauseControls(trackState: TrackState) {
        const trackInfo = trackState.track;
        const songInfo = `${trackInfo.name} (${trackInfo.artist})`;
        const loved = trackInfo ? trackInfo.loved || false : false;
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
            } else if (btnCmd === "musictime.launchplayer") {
                button.statusBarItem.hide();
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
