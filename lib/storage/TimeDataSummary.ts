import {
    getSoftwareDir,
    isWindows,
    logIt,
    getNowTimes,
    getFileDataPayloadsAsJson
} from "../Util";
import { CacheManager } from "../cache/CacheManager";
import { TimeData } from "../model/models";
const fs = require("fs");
const moment = require("moment-timezone");

const cacheMgr: CacheManager = CacheManager.getInstance();

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

export function updateTimeData(
    editor_seconds: number,
    session_seconds: number,
    file_seconds: number
) {
    const timeData: TimeData = getTodayTimeDataSummary();
    timeData.editor_seconds = editor_seconds;
    timeData.session_seconds = session_seconds;
    timeData.file_seconds = file_seconds;
    const nowTimes = getNowTimes();
    timeData.timestamp = nowTimes.now_in_sec;
    timeData.timestamp_local = nowTimes.local_now_in_sec;
    // save the info to disk
    saveTimeDataSummaryToDisk(timeData);
}

export function getTodayTimeDataSummary(): TimeData {
    const day = moment().format("YYYY-MM-DD");
    let timeData: TimeData = cacheMgr.get(`timeDataSummary_${day}`);
    if (!timeData) {
        const file = getTimeDataSummaryFile();
        const payloads: TimeData[] = getFileDataPayloadsAsJson(file);
        if (payloads && payloads.length) {
            // find the one for this day
            timeData = payloads.find(n => n.day === day);
        }
        if (!timeData) {
            timeData = new TimeData();
            timeData.day = day;
        }
    }
    return timeData;
}

function saveTimeDataSummaryToDisk(data: TimeData) {
    if (!data) {
        return;
    }
    const day = moment().format("YYYY-MM-DD");
    const file = getTimeDataSummaryFile();
    const payloads: TimeData[] = getFileDataPayloadsAsJson(file);
    let newPayloads: TimeData[] = [];
    if (payloads && payloads.length) {
        // find the one for this day
        // const existingTimeData = payloads.find(n => n.day === day);
        // create a new array and overwrite the file
        newPayloads = payloads.map(item => {
            return item.day === day ? data : item;
        });
    } else {
        newPayloads.push(data);
    }

    try {
        const content = JSON.stringify(newPayloads, null, 4);
        fs.writeFileSync(file, content, err => {
            if (err) logIt(`Deployer: Error writing time data: ${err.message}`);
        });
        // update the cache
        const day = moment().format("YYYY-MM-DD");
        cacheMgr.set(`timeDataSummary_${day}`, data);
    } catch (e) {
        //
    }
}
