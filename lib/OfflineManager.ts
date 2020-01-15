import {
    logIt,
    getSoftwareDir,
    isWindows,
    deleteFile,
    humanizeMinutes,
    showStatus,
    getNowTimes,
    getItem
} from "./Util";
import { DEFAULT_SESSION_THRESHOLD_SECONDS } from "./Constants";
import {
    KeystrokeAggregate,
    SessionSummary,
    FileChangeInfo
} from "./model/models";
const fs = require("fs");
import { CacheManager } from "./cache/CacheManager";

// initialize the session summary structure
let sessionSummaryData: SessionSummary = new SessionSummary();
const cacheMgr: CacheManager = CacheManager.getInstance();

export function clearSessionSummaryData() {
    sessionSummaryData = new SessionSummary();
    saveSessionSummaryToDisk(sessionSummaryData);
}

export function clearFileChangeInfoSummaryData() {
    saveFileChangeInfoToDisk({});
}

export function setSessionSummaryLiveshareMinutes(minutes) {
    sessionSummaryData.liveshareMinutes = minutes;
}

export function getSessionThresholdSeconds() {
    const thresholdSeconds =
        getItem("sessionThresholdInSec") || DEFAULT_SESSION_THRESHOLD_SECONDS;
    return thresholdSeconds;
}

export function incrementSessionSummaryData(aggregates: KeystrokeAggregate) {
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
    sessionSummaryData.currentDayMinutes += incrementMinutes;
    sessionSummaryData.currentDayKeystrokes += aggregates.keystrokes;
    sessionSummaryData.currentCharactersAdded += aggregates.add;
    sessionSummaryData.currentCharactersDeleted += aggregates.delete;
    sessionSummaryData.currentPastes += aggregates.paste;
    sessionSummaryData.currentLinesAdded += aggregates.linesAdded;
    sessionSummaryData.currentLinesRemoved += aggregates.linesRemoved;
    sessionSummaryData.lastStart = nowInSec;

    saveSessionSummaryToDisk(sessionSummaryData);
}

export function updateStatusBarWithSummaryData() {
    // update the session summary data with what is found in the sessionSummary.json
    sessionSummaryData = getSessionSummaryFileAsJson();

    let currentDayMinutes = sessionSummaryData.currentDayMinutes;
    let currentDayMinutesTime = humanizeMinutes(currentDayMinutes);
    let averageDailyMinutes = sessionSummaryData.averageDailyMinutes;
    let averageDailyMinutesTime = humanizeMinutes(averageDailyMinutes);

    let inFlowIcon = currentDayMinutes > averageDailyMinutes ? "🚀 " : "";
    let msg = `${inFlowIcon}${currentDayMinutesTime}`;
    if (averageDailyMinutes > 0) {
        msg += ` | ${averageDailyMinutesTime}`;
    }
    showStatus(msg, null);
}

export function getSessionSummaryData(): SessionSummary {
    // let fileChangeInfoMap = cacheMgr.get("sessionSummary");
    sessionSummaryData = getSessionSummaryFileAsJson();
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

// returns a map of file change info
// {fileName => FileChangeInfo, fileName => FileChangeInfo}
export function getFileChangeInfoMap(): any {
    let fileChangeInfoMap = cacheMgr.get("fileChangeSummary");
    if (!fileChangeInfoMap) {
        fileChangeInfoMap = getFileChangeSummaryFileAsJson();
        if (fileChangeInfoMap) {
            cacheMgr.set("fileChangeSummary", fileChangeInfoMap);
        }
    }
    return fileChangeInfoMap;
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

export function getFileChangeSummaryFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\fileChangeSummary.json";
    } else {
        file += "/fileChangeSummary.json";
    }
    return file;
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

export function saveFileChangeInfoToDisk(fileChangeInfoData) {
    const file = getFileChangeSummaryFile();
    if (fileChangeInfoData) {
        try {
            const content = JSON.stringify(fileChangeInfoData, null, 4);
            fs.writeFileSync(file, content, err => {
                if (err)
                    logIt(
                        `Deployer: Error writing session summary data: ${err.message}`
                    );
            });
            // update the cache
            if (fileChangeInfoData) {
                cacheMgr.set("fileChangeSummary", fileChangeInfoData);
            }
        } catch (e) {
            //
        }
    }
}

export function getSessionSummaryFileAsJson() {
    const file = getSessionSummaryFile();
    return getFileDataAsJson(file);
}

export function getFileChangeSummaryFileAsJson(): FileChangeInfo[] {
    const file = getFileChangeSummaryFile();
    return getFileDataAsJson(file);
}

export function getFileDataAsJson(file) {
    let data = null;
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file).toString();
        if (content) {
            try {
                data = JSON.parse(content);
            } catch (e) {
                logIt(`unable to read session info: ${e.message}`);
                // error trying to read the session file, delete it
                deleteFile(file);
                data = {};
            }
        }
    }
    return data ? data : {};
}
