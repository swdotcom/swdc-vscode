import { getItem, setItem, getNowTimes } from "../Util";
import { PayloadManager } from "./PayloadManager";
import { clearFileChangeInfoSummaryData } from "../storage/FileChangeInfoSummaryData";
import { clearSessionSummaryData } from "../storage/SessionSummaryData";
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
        }
    }
}
