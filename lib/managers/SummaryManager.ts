import { getItem, setItem, getNowTimes } from "../Util";
import { SessionSummary } from "../model/models";
import { PayloadManager } from "./PayloadManager";
import {
    softwareGet,
    isResponseOk,
    serverIsAvailable
} from "../http/HttpClient";
import { commands } from "vscode";
import { clearFileChangeInfoSummaryData } from "../storage/FileChangeInfoSummaryData";
import {
    clearSessionSummaryData,
    getSessionSummaryData,
    saveSessionSummaryToDisk,
    updateStatusBarWithSummaryData
} from "../storage/SessionSummaryData";
import { WallClockManager } from "./WallClockManager";
import { clearTimeDataSummary } from "../storage/TimeSummaryData";

const payloadMgr: PayloadManager = PayloadManager.getInstance();
const wallClockMgr: WallClockManager = WallClockManager.getInstance();

const moment = require("moment-timezone");

// every 1 min
const DAY_CHECK_TIMER_INTERVAL = 1000 * 60;

export class SummaryManager {
    private static instance: SummaryManager;

    private _dayCheckTimer: any = null;
    private _currentDay = null;

    constructor() {
        this.init();
    }

    static getInstance(): SummaryManager {
        if (!SummaryManager.instance) {
            SummaryManager.instance = new SummaryManager();
        }

        return SummaryManager.instance;
    }

    init() {
        // fetch the current day from the sessions.json
        this._currentDay = getItem("currentDay");

        // start timer to check if it's a new day or not
        this._dayCheckTimer = setInterval(async () => {
            SummaryManager.getInstance().newDayChecker();
        }, DAY_CHECK_TIMER_INTERVAL);

        setTimeout(() => {
            this.newDayChecker(true /*isInit*/);
        }, 1000);
    }

    /**
     * Check if its a new day, if so we'll clear the session sumary and
     * file change info summary, then we'll force a fetch from the app
     */
    async newDayChecker(isInit = false) {
        const nowTime = getNowTimes();
        if (nowTime.day !== this._currentDay) {
            // send the offline data
            await payloadMgr.sendOfflineData();

            // send the offline TimeData payloads
            await payloadMgr.sendOfflineTimeData();

            // day does't match. clear the wall clock time,
            // the session summary, time data summary,
            // and the file change info summary data
            wallClockMgr.clearWcTime();
            clearTimeDataSummary();
            clearSessionSummaryData();
            clearFileChangeInfoSummaryData();

            // set the current day
            this._currentDay = nowTime.day;

            // update the current day
            setItem("currentDay", this._currentDay);
            // update the last payload timestamp
            setItem("latestPayloadTimestampEndUtc", 0);

            // refresh everything
            commands.executeCommand("codetime.refreshSessionSummary");
        } else if (isInit) {
            commands.executeCommand("codetime.refreshSessionSummary");
        }
    }

    async getSessionSummaryStatus(): Promise<SessionSummary> {
        const jwt = getItem("jwt");
        const serverOnline = await serverIsAvailable();
        let data: SessionSummary = getSessionSummaryData();

        // if it's online, has a jwt and the requester wants it directly from the API
        if (serverOnline && jwt) {
            // Returns:
            // data: { averageDailyKeystrokes:982.1339, averageDailyKpm:26, averageDailyMinutes:38,
            // currentDayKeystrokes:8362, currentDayKpm:26, currentDayMinutes:332.99999999999983,
            // currentSessionGoalPercent:0, dailyMinutesGoal:38, inFlow:true, lastUpdatedToday:true,
            // latestPayloadTimestamp:1573050489, liveshareMinutes:null, timePercent:876, velocityPercent:100,
            // volumePercent:851 }
            const result = await softwareGet(`/sessions/summary`, jwt).catch(
                err => {
                    return null;
                }
            );
            if (isResponseOk(result) && result.data) {
                const dataMinutes = result.data.currentDayMinutes;
                const respData = result.data;

                if (dataMinutes === 0 || dataMinutes < data.currentDayMinutes) {
                    console.log("syncing current day minutesSinceLastPayload");
                    // incoming data current metrics is behind, use the local info
                    respData.currentDayMinutes = data.currentDayMinutes;
                    respData.currentDayKeystrokes = data.currentDayKeystrokes;
                    respData.currentDayKpm = data.currentDayKpm;
                    respData.currentDayLinesAdded = data.currentDayLinesAdded;
                    respData.currentDayLinesRemoved =
                        data.currentDayLinesRemoved;
                }

                // update it from the app
                data = { ...respData };

                // update the file
                saveSessionSummaryToDisk(data);

                // latestPayloadTimestampEndUtc:1580043777
                // check if we need to update the latestPayloadTimestampEndUtc
                const currentTs = getItem("latestPayloadTimestampEndUtc");
                if (
                    !currentTs ||
                    data.latestPayloadTimestampEndUtc > currentTs
                ) {
                    // update the currentTs
                    setItem(
                        "latestPayloadTimestampEndUtc",
                        data.latestPayloadTimestampEndUtc
                    );
                }
            }
        }

        // update the wallclock time if it's
        // lagging behind the newly gathered current day seconds
        const session_seconds = data.currentDayMinutes * 60;
        wallClockMgr.updateBasedOnSessionSeconds(session_seconds);

        return data;
    }
}
