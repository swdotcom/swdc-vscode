import { SessionSummary, KeystrokeAggregate } from "../model/models";
import {
    isWindows,
    getSoftwareDir,
    logIt,
    getNowTimes,
    getItem,
    showStatus,
    getFileDataAsJson,
    humanizeMinutes,
    setItem
} from "../Util";
import { DEFAULT_SESSION_THRESHOLD_SECONDS } from "../Constants";
import { WallClockManager } from "../managers/WallClockManager";
const fs = require("fs");

export function getSessionThresholdSeconds() {
    const thresholdSeconds =
        getItem("sessionThresholdInSec") || DEFAULT_SESSION_THRESHOLD_SECONDS;
    return thresholdSeconds;
}

export function clearSessionSummaryData() {
    const sessionSummaryData = new SessionSummary();
    saveSessionSummaryToDisk(sessionSummaryData);
}

export function getSessionSummaryFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\sessionSummary.json";
    } else {
        file += "/sessionSummary.json";
    }
    return file;
}

export function getSessionSummaryData(): SessionSummary {
    let sessionSummaryData = getSessionSummaryFileAsJson();
    // make sure it's a valid structure
    if (!sessionSummaryData) {
        // set the defaults
        sessionSummaryData = new SessionSummary();
    }
    // fill in missing attributes
    sessionSummaryData = coalesceMissingAttributes(sessionSummaryData);
    return sessionSummaryData;
}

function coalesceMissingAttributes(data): SessionSummary {
    // ensure all attributes are defined
    const template: SessionSummary = new SessionSummary();
    Object.keys(template).forEach(key => {
        if (!data[key]) {
            data[key] = 0;
        }
    });
    return data;
}

export function sessionSummaryExists(): boolean {
    const file = getSessionSummaryFile();
    return fs.existsSync(file);
}

export function getSessionSummaryFileAsJson(): SessionSummary {
    const file = getSessionSummaryFile();
    let sessionSummary = getFileDataAsJson(file);
    if (!sessionSummary) {
        sessionSummary = new SessionSummary();
        saveSessionSummaryToDisk(sessionSummary);
    }
    return sessionSummary;
}

export function saveSessionSummaryToDisk(sessionSummaryData) {
    const file = getSessionSummaryFile();
    try {
        // JSON.stringify(data, replacer, number of spaces)
        const content = JSON.stringify(sessionSummaryData, null, 4);
        fs.writeFileSync(file, content, err => {
            if (err)
                logIt(
                    `Deployer: Error writing session summary data: ${err.message}`
                );
        });
    } catch (e) {
        //
    }
}

export function setSessionSummaryLiveshareMinutes(minutes) {
    let sessionSummaryData = getSessionSummaryData();
    sessionSummaryData.liveshareMinutes = minutes;

    saveSessionSummaryToDisk(sessionSummaryData);
}

export function getMinutesSinceLastPayload() {
    let minutesSinceLastPayload = 0;
    const lastPayloadEnd = getItem("latestPayloadTimestampEndUtc");
    if (lastPayloadEnd && lastPayloadEnd > 0) {
        const nowTimes = getNowTimes();
        const nowInSec = nowTimes.now_in_sec;
        // diff from the previous end time
        const diffInSec = nowInSec - lastPayloadEnd;

        // if it's less than the threshold then add the minutes to the session time
        if (diffInSec > 0 && diffInSec <= getSessionThresholdSeconds()) {
            // it's still the same session, add the gap time in minutes
            minutesSinceLastPayload = diffInSec / 60;
        }
    }
    return minutesSinceLastPayload;
}

export async function incrementSessionSummaryData(
    aggregates: KeystrokeAggregate
) {
    let sessionSummaryData = getSessionSummaryData();
    // fill in missing attributes
    sessionSummaryData = coalesceMissingAttributes(sessionSummaryData);

    const incrementMinutes = getMinutesSinceLastPayload();
    if (incrementMinutes > 0) {
        sessionSummaryData.currentDayMinutes += incrementMinutes;
    }

    // now update the payload timestamp end utc
    let nowTimes = getNowTimes();

    // Update the latestPayloadTimestampEndUtc. It's used to determine session time
    setItem("latestPayloadTimestampEndUtc", nowTimes.now_in_sec);

    const wallClkHandler: WallClockManager = WallClockManager.getInstance();
    const session_seconds = sessionSummaryData.currentDayMinutes * 60;
    wallClkHandler.updateBasedOnSessionSeconds(session_seconds);

    sessionSummaryData.currentDayKeystrokes += aggregates.keystrokes;
    sessionSummaryData.currentDayLinesAdded += aggregates.linesAdded;
    sessionSummaryData.currentDayLinesRemoved += aggregates.linesRemoved;

    saveSessionSummaryToDisk(sessionSummaryData);
}

/**
 * Updates the status bar text with the current day minutes (session minutes)
 */
export function updateStatusBarWithSummaryData() {
    let data = getSessionSummaryData();

    const currentDayMinutes = data.currentDayMinutes;
    const averageDailyMinutes = data.averageDailyMinutes;

    // const inFlowIcon = currentDayMinutes > averageDailyMinutes ? "🚀 " : "";
    const inFlowIcon =
        currentDayMinutes > averageDailyMinutes ? "$(rocket)" : "$(clock)";
    const minutesStr = humanizeMinutes(currentDayMinutes);

    const msg = `${inFlowIcon} ${minutesStr}`;
    showStatus(msg, null);
}
