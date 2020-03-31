import { getItem, humanizeMinutes, setItem } from "../Util";
import { commands, window } from "vscode";
import { updateStatusBarWithSummaryData } from "../storage/SessionSummaryData";
import { updateEditorSeconds } from "../storage/TimeSummaryData";
import { KpmManager } from "./KpmManager";

const SECONDS_INTERVAL = 30;
const CLOCK_INTERVAL = 1000 * SECONDS_INTERVAL;

export class WallClockManager {
    private static instance: WallClockManager;

    private _wcIntervalHandle = null;
    private _wctime: number = 0;

    private constructor() {
        this.initTimer();
    }

    static getInstance(): WallClockManager {
        if (!WallClockManager.instance) {
            WallClockManager.instance = new WallClockManager();
        }

        return WallClockManager.instance;
    }

    private initTimer() {
        const kpmMgr: KpmManager = KpmManager.getInstance();

        // this was used the 1st few days of release, if found, it should be removed
        let deprecatedWcTime = 0;
        if (getItem("vscode_wctime")) {
            deprecatedWcTime = getItem("vscode_wctime");
            setItem("vscode_wctime", null);
        }

        this._wctime = getItem("wctime") || 0;
        if (deprecatedWcTime > this._wctime) {
            this._wctime = deprecatedWcTime;
            setItem("wctime", deprecatedWcTime);
        }
        this._wcIntervalHandle = setInterval(() => {
            // If the window is focused
            if (window.state.focused || kpmMgr.hasKeystrokeData()) {
                // set the wctime
                this._wctime = getItem("wctime") || 0;
                this._wctime += SECONDS_INTERVAL;
                setItem("wctime", this._wctime);

                // update the file info file
                updateEditorSeconds(SECONDS_INTERVAL);
            }

            // dispatch to the various views (statusbar and treeview)
            this.dispatchStatusViewUpdate();
        }, CLOCK_INTERVAL);
    }

    private dispatchStatusViewUpdate() {
        // update the status bar
        updateStatusBarWithSummaryData();

        // update the code time metrics tree views
        commands.executeCommand("codetime.refreshKpmTree");
    }

    public clearWcTime() {
        this.setWcTime(0);
    }

    public getHumanizedWcTime() {
        return humanizeMinutes(this._wctime / 60);
    }

    public getWcTimeInSeconds() {
        return this._wctime;
    }

    public setWcTime(seconds) {
        this._wctime = seconds;
        setItem("wctime", seconds);

        this.dispatchStatusViewUpdate();
    }

    public updateBasedOnSessionSeconds(session_seconds: number) {
        let editor_seconds = this.getWcTimeInSeconds();

        // check to see if the session seconds has gained before the editor seconds
        // if so, then update the editor seconds
        if (editor_seconds < session_seconds) {
            editor_seconds = session_seconds + 1;
            this.setWcTime(editor_seconds);
        }
    }
}
