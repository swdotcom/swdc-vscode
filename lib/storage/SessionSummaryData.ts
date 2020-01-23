import { SessionSummary, KeystrokeAggregate, TimeData } from "../model/models";
import {
    isWindows,
    getSoftwareDir,
    logIt,
    getNowTimes,
    getItem,
    humanizeMinutes,
    showStatus,
    getFileDataAsJson
} from "../Util";
import { CacheManager } from "../cache/CacheManager";
import { DEFAULT_SESSION_THRESHOLD_SECONDS } from "../Constants";
import { WallClockHandler } from "../event/WallClockHandler";
import { updateTimeData, getTodayTimeDataSummary } from "./TimeDataSummary";
const fs = require("fs");
const moment = require("moment-timezone");

const cacheMgr: CacheManager = CacheManager.getInstance();

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
    // let fileChangeInfoMap = cacheMgr.get("sessionSummary");
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

export function getSessionSummaryFileAsJson(): SessionSummary {
    const file = getSessionSummaryFile();
    let sessionSummary: SessionSummary = getFileDataAsJson(file);
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
        // update the cache
        if (sessionSummaryData) {
            cacheMgr.set("sessionSummary", sessionSummaryData);
        }
    } catch (e) {
        //
    }
}

export function setSessionSummaryLiveshareMinutes(minutes) {
    let sessionSummaryData = cacheMgr.get("sessionSummary");
    if (!sessionSummaryData) {
        sessionSummaryData = getSessionSummaryData();
    }
    sessionSummaryData.liveshareMinutes = minutes;

    saveSessionSummaryToDisk(sessionSummaryData);
}

export function incrementSessionSummaryData(aggregates: KeystrokeAggregate) {
    const wallClkHandler: WallClockHandler = WallClockHandler.getInstance();
    let sessionSummaryData = cacheMgr.get("sessionSummary");
    if (!sessionSummaryData) {
        sessionSummaryData = getSessionSummaryData();
    }
    // fill in missing attributes
    sessionSummaryData = coalesceMissingAttributes(sessionSummaryData);

    // what is the gap from the previous start
    const nowTimes = getNowTimes();
    const nowInSec = nowTimes.now_in_sec;
    let incrementMinutes = 1;
    if (sessionSummaryData.lastStart) {
        const lastStart = parseInt(sessionSummaryData.lastStart, 10);
        // get the diff from the prev start
        const diffInSec = nowInSec - lastStart - 60;
        // If it's less or equal to the session threshold seconds
        // then add to the minutes increment. But check if it's a positive
        // number in case the system clock has been moved to the future
        if (diffInSec > 0 && diffInSec <= getSessionThresholdSeconds()) {
            // it's still the same session, add the gap time in minutes
            const diffInMin = diffInSec / 60;
            incrementMinutes += diffInMin;
        }
    }

    const session_seconds = sessionSummaryData.currentDayMinutes * 60;
    let editor_seconds = wallClkHandler.getWcTimeInSeconds();

    // check to see if the session seconds has gained before the editor seconds
    // if so, then update the editor seconds
    if (editor_seconds < session_seconds) {
        wallClkHandler.setWcTime(session_seconds);
        editor_seconds = session_seconds;
        wallClkHandler.setWcTime(editor_seconds);
    }

    sessionSummaryData.currentDayMinutes += incrementMinutes;
    sessionSummaryData.currentDayKeystrokes += aggregates.keystrokes;
    sessionSummaryData.currentCharactersAdded += aggregates.add;
    sessionSummaryData.currentCharactersDeleted += aggregates.delete;
    sessionSummaryData.currentPastes += aggregates.paste;
    sessionSummaryData.currentLinesAdded += aggregates.linesAdded;
    sessionSummaryData.currentLinesRemoved += aggregates.linesRemoved;
    sessionSummaryData.lastStart = nowInSec;

    saveSessionSummaryToDisk(sessionSummaryData);

    // get the current time data and update
    const timeData: TimeData = getTodayTimeDataSummary();
    const file_seconds = (timeData.file_seconds += 60);

    updateTimeData(editor_seconds, session_seconds, file_seconds);
}

export function updateStatusBarWithSummaryData() {
    let sessionSummaryData = cacheMgr.get("sessionSummary");
    if (!sessionSummaryData) {
        sessionSummaryData = getSessionSummaryData();
    }
    // update the session summary data with what is found in the sessionSummary.json
    sessionSummaryData = getSessionSummaryFileAsJson();

    let currentDayMinutes = sessionSummaryData.currentDayMinutes;
    let currentDayMinutesTime = humanizeMinutes(currentDayMinutes);
    let averageDailyMinutes = sessionSummaryData.averageDailyMinutes;
    let averageDailyMinutesTime = humanizeMinutes(averageDailyMinutes);

    let inFlowIcon = currentDayMinutes > averageDailyMinutes ? "🚀 " : "";
    const wcTime = WallClockHandler.getInstance().getWcTime();

    const time = moment().format("h:mm a");
    const msg = `${inFlowIcon}${wcTime} | Active: ${currentDayMinutesTime}`;

    // if (averageDailyMinutes > 0) {
    //     msg += ` | ${averageDailyMinutesTime}`;
    // }
    showStatus(msg, null);
}
