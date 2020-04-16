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
} from "../Util";
import { DEFAULT_SESSION_THRESHOLD_SECONDS } from "../Constants";
import CodeTimeSummary from "../model/CodeTimeSummary";
import { getCodeTimeSummary } from "./TimeSummaryData";
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
    Object.keys(template).forEach((key) => {
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
        fs.writeFileSync(file, content, (err) => {
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

/**
 * Return {elapsedSeconds, sessionMinutes}
 * The session minutes is based on a threshold of 15 minutes
 */
export function getTimeBetweenLastPayload() {
    // default to 1 minute
    let sessionMinutes = 1;
    let elapsedSeconds = 0;

    const lastPayloadEnd = getItem("latestPayloadTimestampEndUtc");

    // the last payload end time is reset within the new day checker
    if (lastPayloadEnd && lastPayloadEnd > 0) {
        const nowTimes = getNowTimes();
        const nowInSec = nowTimes.now_in_sec;
        // diff from the previous end time
        elapsedSeconds = Math.max(0, nowInSec - lastPayloadEnd);

        // if it's less than the threshold then add the minutes to the session time
        if (
            elapsedSeconds > 0 &&
            elapsedSeconds <= getSessionThresholdSeconds()
        ) {
            // it's still the same session, add the gap time in minutes
            sessionMinutes = elapsedSeconds / 60;
        }
        sessionMinutes = Math.max(1, sessionMinutes);
    }
    // return Math.floor(sessionMinutes);
    return { sessionMinutes, elapsedSeconds };
}

export async function incrementSessionSummaryData(
    aggregates: KeystrokeAggregate,
    sessionMinutes: number
) {
    let sessionSummaryData = getSessionSummaryData();
    // fill in missing attributes
    sessionSummaryData = coalesceMissingAttributes(sessionSummaryData);
    sessionSummaryData.currentDayMinutes += sessionMinutes;

    // increment the current day attributes except for the current day minutes
    sessionSummaryData.currentDayKeystrokes += aggregates.keystrokes;
    sessionSummaryData.currentDayLinesAdded += aggregates.linesAdded;
    sessionSummaryData.currentDayLinesRemoved += aggregates.linesRemoved;

    saveSessionSummaryToDisk(sessionSummaryData);
}

/**
 * Updates the status bar text with the current day minutes (session minutes)
 */
export function updateStatusBarWithSummaryData() {
    const codeTimeSummary: CodeTimeSummary = getCodeTimeSummary();
    const data = getSessionSummaryData();

    const averageDailyMinutes = data.averageDailyMinutes;

    // const inFlowIcon = currentDayMinutes > averageDailyMinutes ? "🚀 " : "";
    const inFlowIcon =
        codeTimeSummary.activeCodeTimeMinutes > averageDailyMinutes
            ? "$(rocket)"
            : "$(clock)";
    const minutesStr = humanizeMinutes(codeTimeSummary.activeCodeTimeMinutes);

    const msg = `${inFlowIcon} ${minutesStr}`;
    showStatus(msg, null);
}
