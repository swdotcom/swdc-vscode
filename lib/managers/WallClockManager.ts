import { getItem, humanizeMinutes, setItem } from "../Util";
import { commands, window } from "vscode";
import { updateStatusBarWithSummaryData } from "../storage/SessionSummaryData";
import { TimeData } from "../model/models";
import {
    getTodayTimeDataSummary,
    updateTimeSummaryData
} from "../storage/TimeSummaryData";

const CLOCK_INTERVAL = 1000 * 30;

let counter = 0;

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
                this._wctime += 30;
                setItem("wctime", this._wctime);
                commands.executeCommand("codetime.refreshKpmTree");
                this.updateTimeData();
            }
        }, CLOCK_INTERVAL);
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
        clearInterval(this._wcIntervalHandle);
        this.initTimer();

        // update the status bar
        this.updateTimeData();
    }

    private updateTimeData() {
        // get the current time data and update
        const timeData: TimeData = getTodayTimeDataSummary();
        const editor_seconds = this._wctime;

        updateTimeSummaryData(
            editor_seconds,
            timeData.session_seconds,
            timeData.file_seconds
        );

        // update the status bar
        updateStatusBarWithSummaryData();
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
