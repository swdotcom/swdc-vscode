import { getItem } from "../Util";
import {
    getSessionSummaryData,
    saveSessionSummaryToDisk,
    updateStatusBarWithSummaryData,
} from "../storage/SessionSummaryData";
import { updateSessionFromSummaryApi } from "../storage/TimeSummaryData";
import { softwareGet, isResponseOk } from "../http/HttpClient";
import { SessionSummary } from "../model/models";

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
        const result = await softwareGet(`/metrics/averages`, jwt);
        if (isResponseOk(result) && result.data) {
            const summary: SessionSummary = result.data;

            saveSessionSummaryToDisk(summary);
        }

        updateStatusBarWithSummaryData();
    }
}
