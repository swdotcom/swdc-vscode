import { getItem, setItem, getNowTimes } from "../Util";
import { clearFileChangeInfoSummaryData } from "../storage/FileChangeInfoSummaryData";
import {
    clearSessionSummaryData,
    getSessionSummaryData,
    saveSessionSummaryToDisk
} from "../storage/SessionSummaryData";
import { WallClockManager } from "./WallClockManager";
import { clearTimeDataSummary } from "../storage/TimeSummaryData";
import { softwareGet, isResponseOk } from "../http/HttpClient";
import { SessionSummary } from "../model/models";
import { sendOfflineData, sendOfflineTimeData } from "./PayloadManager";

const wallClockMgr: WallClockManager = WallClockManager.getInstance();

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
            clearSessionSummaryData();
            // send the offline data
            await sendOfflineData(true);

            // send the offline TimeData payloads
            await sendOfflineTimeData();

            // day does't match. clear the wall clock time,
            // the session summary, time data summary,
            // and the file change info summary data
            wallClockMgr.clearWcTime();
            clearTimeDataSummary();

            clearFileChangeInfoSummaryData();

            // set the current day
            this._currentDay = nowTime.day;

            // update the current day
            setItem("currentDay", this._currentDay);
            // update the last payload timestamp
            setItem("latestPayloadTimestampEndUtc", 0);
        }
    }

    async updateSessionSummaryFromServer(isNewDay = false) {
        const jwt = getItem("jwt");
        const result = await softwareGet(`/sessions/summary?refresh=true`, jwt);
        if (isResponseOk(result) && result.data) {
            const data = result.data;

            // update the session summary data
            const summary: SessionSummary = getSessionSummaryData();

            Object.keys(data).forEach(key => {
                const val = data[key];
                if (val !== null && val !== undefined) {
                    if (key === "currentDayMinutes" && !isNewDay) {
                        if (summary.currentDayMinutes < val) {
                            summary.currentDayMinutes = val;
                        }
                    } else {
                        summary[key] = val;
                    }
                }
            });

            // if the summary.currentDayMinutes is greater than the wall
            // clock time then it means the plugin was installed on a
            // different computer or the session was deleted
            wallClockMgr.updateBasedOnSessionSeconds(
                summary.currentDayMinutes * 60
            );

            saveSessionSummaryToDisk(summary);
        }
    }
}
