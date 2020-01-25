import { getItem, humanizeMinutes, setItem } from "../Util";
import { commands, window } from "vscode";
import { updateStatusBarWithSummaryData } from "../storage/SessionSummaryData";
import { TimeData } from "../model/models";
import {
    getTodayTimeDataSummary,
    updateTimeData
} from "../storage/TimeDataSummary";

// 1 minute
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
        this._wctime = getItem("vscode_wctime") || 0;
        this._wcIntervalHandle = setInterval(() => {
            if (window.state.focused) {
                this._wctime += 30;
                setItem("vscode_wctime", this._wctime);
                commands.executeCommand("codetime.refreshKpmTree");
                this.updateTimeData();
            }
        }, CLOCK_INTERVAL);
    }

    public clearWcTime() {
        this.setWcTime(1);
    }

    public getHumanizedWcTime() {
        return humanizeMinutes(this._wctime / 60);
    }

    public getWcTimeInSeconds() {
        return this._wctime;
    }

    public setWcTime(seconds) {
        this._wctime = seconds;
        setItem("vscode_wctime", seconds);
        clearInterval(this._wcIntervalHandle);
        this.initTimer();

        // update the status bar
        this.updateTimeData();
    }

    private updateTimeData() {
        // get the current time data and update
        const timeData: TimeData = getTodayTimeDataSummary();
        const editor_seconds = this._wctime;

        updateTimeData(
            editor_seconds,
            timeData.session_seconds,
            timeData.file_seconds
        );

        // update the status bar
        updateStatusBarWithSummaryData();
    }
}
