import { getItem, humanizeMinutes, setItem } from "../Util";
import { commands, window } from "vscode";
import { updateStatusBarWithSummaryData } from "../storage/SessionSummaryData";
import { updateEditorSeconds } from "../storage/TimeSummaryData";

const CLOCK_INTERVAL = 1000 * 30;

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
            if (window.state.focused) {
                // set the wctime
                this._wctime = getItem("wctime") || 0;
                this._wctime += 30;
                setItem("wctime", this._wctime);

                // update the file info file
                this.updateTimeData(30);
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

    private async updateTimeData(editor_seconds_for_project) {
        await updateEditorSeconds(editor_seconds_for_project);

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
