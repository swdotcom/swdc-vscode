import {
    getSoftwareDir,
    isWindows,
    logIt,
    getFileDataArray,
    getNowTimes
} from "../Util";
import { TimeData } from "../model/models";
const fs = require("fs");
const moment = require("moment-timezone");

export function getTimeDataSummaryFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\timeDataSummary.json";
    } else {
        file += "/timeDataSummary.json";
    }
    return file;
}

export function clearTimeDataSummary() {
    const data: TimeData = new TimeData();
    saveTimeDataSummaryToDisk(data);
}

export function updateTimeSummaryData(
    editor_seconds: number,
    session_seconds: number,
    file_seconds: number
) {
    const nowTime = getNowTimes();
    const day = moment.unix(nowTime.local_now_in_sec).format("YYYY-MM-DD");
    const utcEndOfDay = moment
        .unix(nowTime.now_in_sec)
        .endOf("day")
        .unix();
    const localEndOfDay = moment
        .unix(nowTime.local_now_in_sec)
        .endOf("day")
        .unix();

    const timeData: TimeData = getTodayTimeDataSummary();
    timeData.editor_seconds = editor_seconds;
    timeData.session_seconds = session_seconds;
    timeData.file_seconds = file_seconds;
    timeData.timestamp = utcEndOfDay;
    timeData.timestamp_local = localEndOfDay;
    timeData.day = day;
    // save the info to disk
    saveTimeDataSummaryToDisk(timeData);
}

export function getTodayTimeDataSummary(): TimeData {
    const nowTime = getNowTimes();
    const day = moment.unix(nowTime.local_now_in_sec).format("YYYY-MM-DD");

    let timeData: TimeData = null;

    const file = getTimeDataSummaryFile();
    const payloads: TimeData[] = getFileDataArray(file);
    if (payloads && payloads.length) {
        // find the one for this day
        timeData = payloads.find(n => n.day === day);
    }
    if (!timeData) {
        timeData = new TimeData();
        timeData.day = day;
        saveTimeDataSummaryToDisk(timeData);
    }

    return timeData;
}

function saveTimeDataSummaryToDisk(data: TimeData) {
    if (!data) {
        return;
    }

    const file = getTimeDataSummaryFile();

    try {
        const content = JSON.stringify(data, null, 4);
        fs.writeFileSync(file, content, err => {
            if (err) logIt(`Deployer: Error writing time data: ${err.message}`);
        });
    } catch (e) {
        //
    }
}
