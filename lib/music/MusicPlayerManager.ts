import { workspace, window, StatusBarAlignment, StatusBarItem } from "vscode";
import { isMusicTime } from "../Util";
import { MusicStateManagerSingleton, TrackState } from "./MusicStateManager";

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
        this.createButton("$(heart)", "Like", "musictime.like", 10);
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

    private static showPlayControls(trackState: TrackState) {
        const songInfo =
            trackState && trackState.track
                ? `${trackState.track.name} (${trackState.track.artist})`
                : null;
        this._buttons = this._buttons.map(button => {
            if (button.statusBarItem.command === "musictime.pause") {
                button.statusBarItem.hide();
            } else {
                if (
                    songInfo &&
                    button.statusBarItem.command === "musictime.play"
                ) {
                    button.statusBarItem.tooltip = `${
                        button.tooltip
                    } - ${songInfo}`;
                }
                button.statusBarItem.show();
            }
            return button;
        });
    }

    private static showPauseControls(trackState: TrackState) {
        const songInfo = `${trackState.track.name} (${
            trackState.track.artist
        })`;
        this._buttons = this._buttons.map(button => {
            if (button.statusBarItem.command === "musictime.play") {
                button.statusBarItem.hide();
            } else {
                if (button.statusBarItem.command === "musictime.pause") {
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
