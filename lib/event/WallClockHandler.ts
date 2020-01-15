import { CacheManager } from "../cache/CacheManager";
import { getItem, humanizeMinutes, setItem } from "../Util";
import { commands, window } from "vscode";

const cacheMgr: CacheManager = CacheManager.getInstance();

// 1 minute
const CLOCK_INTERVAL = 1000 * 60;

export class WallClockHandler {
    private static instance: WallClockHandler;

    private _wcIntervalHandle = null;
    private _wctime: number = 0;

    private constructor() {
        this.util();
    }

    static getInstance(): WallClockHandler {
        if (!WallClockHandler.instance) {
            WallClockHandler.instance = new WallClockHandler();
        }

        return WallClockHandler.instance;
    }

    private util() {
        this._wctime = getItem("vscode_wctime") || 0;
        this._wcIntervalHandle = setInterval(() => {
            if (window.state.focused) {
                this._wctime += 60;
                WallClockHandler.getInstance().setWcTime(this._wctime);
                setItem("vscode_wctime", this._wctime);
                commands.executeCommand("codetime.refreshKpmTree");
            }
        }, CLOCK_INTERVAL);
    }

    public clearWcTime() {
        this._wctime = 0;
        setItem("vscode_wctime", this._wctime);
    }

    public getWcTime() {
        const wcHours = humanizeMinutes(this._wctime / 60);
        return wcHours;
    }

    public setWcTime(seconds) {
        this._wctime = seconds;
        setItem("vscode_wctime", seconds);
    }
}
