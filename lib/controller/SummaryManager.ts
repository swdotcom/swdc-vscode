import { getItem, setItem } from "../Util";
import { SessionSummary, GlobalSessionSummary } from "../model/models";
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
import {
    getGlobalSessionSummaryData,
    saveGlobalSessionSummaryToDisk
} from "../storage/GlobalSessionSummaryData";
import { WallClockHandler } from "../event/WallClockHandler";

const payloadMgr: PayloadManager = PayloadManager.getInstance();
const wallClockMgr: WallClockHandler = WallClockHandler.getInstance();

const moment = require("moment-timezone");

// 5 minutes
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

        this.newDayChecker();
    }

    /**
     * Check if its a new day, if so we'll clear the session sumary and
     * file change info summary, then we'll force a fetch from the app
     */
    async newDayChecker() {
        const day = moment().format("YYYY-MM-DD");
        if (day !== this._currentDay) {
            // send the offline data
            await payloadMgr.sendOfflineData();

            // send the offline TimeData payloads
            await payloadMgr.sendOfflineTimeData();

            // day does't match.
            // clear the session summary, and the file change info summary data
            wallClockMgr.clearWcTime();
            clearSessionSummaryData();
            clearFileChangeInfoSummaryData();

            // fetch it the api data
            await this.getGlobalSessionSummaryStatus(true);

            // set the current day
            this._currentDay = day;
            // set the sessions.json
            setItem("currentDay", this._currentDay);
        }
    }

    async getGlobalSessionSummaryStatus(
        forceSummaryFetch = false
    ): Promise<GlobalSessionSummary> {
        let globalSessionSummaryData: GlobalSessionSummary = getGlobalSessionSummaryData();
        const jwt = getItem("jwt");
        const serverOnline = await serverIsAvailable();
        if (serverOnline && jwt && forceSummaryFetch) {
            const result = await softwareGet(
                `/sessions/summary/global`,
                jwt
            ).catch(err => {
                return null;
            });
            if (isResponseOk(result) && result.data) {
                globalSessionSummaryData = { ...result.data };
                saveGlobalSessionSummaryToDisk(globalSessionSummaryData);
            }
        }

        // refresh the tree view
        commands.executeCommand("codetime.refreshKpmTree");

        return globalSessionSummaryData;
    }

    async getSessionSummaryStatus(
        forceSummaryFetch = false
    ): Promise<SessionSummary> {
        const jwt = getItem("jwt");
        const serverOnline = await serverIsAvailable();
        let sessionSummaryData: SessionSummary = getSessionSummaryData();

        // if it's online, has a jwt and the requester wants it directly from the API
        if (serverOnline && jwt && forceSummaryFetch) {
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
                // get the lastStart
                const lastStart = sessionSummaryData.lastStart;
                // update it from the app
                sessionSummaryData = { ...result.data };
                const currentDaySeconds =
                    sessionSummaryData.currentDayMinutes * 60;
                wallClockMgr.setWcTime(currentDaySeconds + 1);
                sessionSummaryData.lastStart = lastStart;

                // update the file
                saveSessionSummaryToDisk(sessionSummaryData);
            }
        }

        // update the status bar
        updateStatusBarWithSummaryData();

        // refresh the tree view
        commands.executeCommand("codetime.refreshKpmTree");

        return sessionSummaryData;
    }
}
