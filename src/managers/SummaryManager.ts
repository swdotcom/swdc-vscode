import { getItem } from "../Util";
import {
    getSessionSummaryData,
    getSessionSummaryFileAsJson,
    saveSessionSummaryToDisk,
    updateStatusBarWithSummaryData,
} from "../storage/SessionSummaryData";
import { updateSessionFromSummaryApi } from "../storage/TimeSummaryData";
import { softwareGet, isResponseOk } from "../http/HttpClient";
import { SessionSummary } from "../model/models";
import { commands } from "vscode";

// every 1 min
const DAY_CHECK_TIMER_INTERVAL = 1000 * 60;

export class SummaryManager {
    private static instance: SummaryManager;

    constructor() {
        //
    }

    static getInstance(): SummaryManager {
        if (!SummaryManager.instance) {
            SummaryManager.instance = new SummaryManager();
        }

        return SummaryManager.instance;
    }

    /**
     * This is only called from the new day checker
     */
    async updateSessionSummaryFromServer() {
        const jwt = getItem("jwt");
        const result = await softwareGet(`/sessions/summary`, jwt);
        if (isResponseOk(result) && result.data) {
            const existingSummary: SessionSummary = getSessionSummaryFileAsJson();
            const summary: SessionSummary = result.data;

            // update summary current day values with the existing current day values since
            // any caller on this would have cleared the existing summary on a new day
            summary.currentDayKeystrokes = Math.max(summary.currentDayKeystrokes, existingSummary.currentDayKeystrokes);
            summary.currentDayKpm = Math.max(summary.currentDayKpm, existingSummary.currentDayKpm);
            summary.currentDayLinesAdded = Math.max(summary.currentDayLinesAdded, existingSummary.currentDayLinesAdded);
            summary.currentDayLinesRemoved = Math.max(summary.currentDayLinesRemoved, existingSummary.currentDayLinesRemoved);
            summary.currentDayMinutes = Math.max(summary.currentDayMinutes, existingSummary.currentDayMinutes);

            updateSessionFromSummaryApi(summary.currentDayMinutes);
            saveSessionSummaryToDisk(summary);
        }

        // update the code time metrics tree views
        commands.executeCommand("codetime.refreshKpmTree");
    }
}
