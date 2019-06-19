import {
    logIt,
    getSoftwareDir,
    isWindows,
    deleteFile,
    humanizeMinutes,
    showStatus
} from "./Util";
const fs = require("fs");

/**
 * {
    "currentDayMinutes": 2,
    "averageDailyMinutes": 1.516144578313253,
    "averageDailyKeystrokes": 280.07014725568945,
    "currentDayKeystrokes": 49,
    "liveshareMinutes": null
    }
    */
let sessionSummaryData = {
    currentDayMinutes: 0,
    averageDailyMinutes: 0,
    averageDailyKeystrokes: 0,
    currentDayKeystrokes: 0,
    liveshareMinutes: null
};

export function clearSessionSummaryData() {
    sessionSummaryData = {
        currentDayMinutes: 0,
        averageDailyMinutes: 0,
        averageDailyKeystrokes: 0,
        currentDayKeystrokes: 0,
        liveshareMinutes: null
    };

    saveSessionSummaryToDisk(getSessionSummaryData());
}

export function setSessionSummaryLiveshareMinutes(minutes) {
    sessionSummaryData.liveshareMinutes = minutes;
}

export function incrementSessionSummaryData(minutes, keystrokes) {
    sessionSummaryData.currentDayMinutes += minutes;
    sessionSummaryData.currentDayKeystrokes += keystrokes;
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

export function getSessionSummaryData() {
    return sessionSummaryData;
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

export function saveSessionSummaryToDisk(sessionSummaryData) {
    try {
        // JSON.stringify(data, replacer, number of spaces)
        const content = JSON.stringify(sessionSummaryData, null, 4);
        fs.writeFileSync(getSessionSummaryFile(), content, err => {
            if (err)
                logIt(
                    `Deployer: Error writing session summary data: ${
                        err.message
                    }`
                );
        });
    } catch (e) {
        //
    }
}

export function getSessionSummaryFileAsJson() {
    let data = null;
    let file = getSessionSummaryFile();
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
