import {
    serverIsAvailable,
    softwarePost,
    isResponseOk,
} from "../http/HttpClient";
import {
    getSoftwareDataStoreFile,
    deleteFile,
    logEvent,
    getPluginEventsFile,
    logIt,
    getFileDataPayloadsAsJson,
    getFileDataArray,
    getItem,
    getNowTimes,
    setItem,
    getSoftwareDir,
    isWindows,
    getFormattedDay,
} from "../Util";
import {
    getTimeDataSummaryFile,
    incrementSessionAndFileSecondsAndFetch,
    getTodayTimeDataSummary,
    clearTimeDataSummary,
} from "../storage/TimeSummaryData";
import {
    getFileChangeSummaryAsJson,
    saveFileChangeInfoToDisk,
} from "../storage/FileChangeInfoSummaryData";
import { KeystrokeAggregate, FileChangeInfo } from "../model/models";
import { NO_PROJ_NAME, UNTITLED_WORKSPACE } from "../Constants";
import {
    incrementSessionSummaryData,
    getTimeBetweenLastPayload,
} from "../storage/SessionSummaryData";
import TimeData from "../model/TimeData";
import RepoContributorInfo from "../model/RepoContributorInfo";
import {
    getRepoContributorInfo,
    getRepoFileCount,
    getFileContributorCount,
} from "../repo/KpmRepoManager";
import KeystrokeStats from "../model/KeystrokeStats";
const os = require("os");
const fs = require("fs");
const path = require("path");

// batch offline payloads in 50. backend has a 100k body limit
const batch_limit = 50;
let lastSavedKeystrokeStats: KeystrokeStats = null;

export async function getLastSavedKeystrokeStats() {
    if (!lastSavedKeystrokeStats) {
        // build it then return it
        await updateLastSavedKeystrokesStats();
    }
    return lastSavedKeystrokeStats;
}

/**
 * send the offline TimeData payloads
 */
export async function sendOfflineTimeData() {
    batchSendArrayData("/data/time", getTimeDataSummaryFile());

    // clear time data data. this will also clear the
    // code time and active code time numbers
    clearTimeDataSummary();
}

/**
 * send the offline Event payloads
 */
export async function sendOfflineEvents() {
    batchSendData("/data/event", getPluginEventsFile());
}

/**
 * send the offline data.
 */
export async function sendOfflineData(isNewDay = false) {
    batchSendData("/data/batch", getSoftwareDataStoreFile());
}

/**
 * batch send array data
 * @param api
 * @param file
 */
export async function batchSendArrayData(api, file) {
    let isonline = await serverIsAvailable();
    if (!isonline) {
        return;
    }
    try {
        if (fs.existsSync(file)) {
            const payloads = getFileDataArray(file);
            batchSendPayloadData(api, file, payloads);
        }
    } catch (e) {
        logIt(`Error batch sending payloads: ${e.message}`);
    }
}

export async function batchSendData(api, file) {
    let isonline = await serverIsAvailable();
    if (!isonline) {
        return;
    }
    try {
        if (fs.existsSync(file)) {
            const payloads = getFileDataPayloadsAsJson(file);
            batchSendPayloadData(api, file, payloads);
        }
    } catch (e) {
        logIt(`Error batch sending payloads: ${e.message}`);
    }
}

export async function updateLastSavedKeystrokesStats() {
    const dataFile = getSoftwareDataStoreFile();
    try {
        if (fs.existsSync(dataFile)) {
            const currentPayloads = getFileDataPayloadsAsJson(dataFile);
            if (currentPayloads && currentPayloads.length) {
                // sort in descending order
                currentPayloads.sort(
                    (a: KeystrokeStats, b: KeystrokeStats) => b.start - a.start
                );
                lastSavedKeystrokeStats = currentPayloads[0];
            }
        }
    } catch (e) {
        logIt(`Error batch sending payloads: ${e.message}`);
    }
}

export async function batchSendPayloadData(api, file, payloads) {
    // send the batch
    if (payloads && payloads.length > 0) {
        logEvent(`sending batch payloads: ${JSON.stringify(payloads)}`);

        // send 50 at a time
        let batch = [];
        for (let i = 0; i < payloads.length; i++) {
            if (batch.length >= batch_limit) {
                let resp = await sendBatchPayload(api, batch);
                if (!isResponseOk(resp)) {
                    // there was a problem with the transmission.
                    // bail out so we don't delete the offline data
                    return;
                }
                batch = [];
            }
            batch.push(payloads[i]);
        }
        // send the remaining
        if (batch.length > 0) {
            let resp = await sendBatchPayload(api, batch);
            if (!isResponseOk(resp)) {
                // there was a problem with the transmission.
                // bail out so we don't delete the offline data
                return;
            }
        }
    }

    // we're online so just delete the file
    deleteFile(file);
}

export function sendBatchPayload(api, batch) {
    return softwarePost(api, batch, getItem("jwt")).catch((e) => {
        logIt(`Unable to send plugin data batch, error: ${e.message}`);
    });
}

/**
 * This will update the cumulative editor and session seconds.
 * It will also provide any error details if any are encountered.
 * @param payload
 * @param sessionMinutes
 */
async function validateAndUpdateCumulativeData(
    payload: KeystrokeStats,
    sessionMinutes: number
) {
    // increment the projects session and file seconds
    const td: TimeData = await incrementSessionAndFileSecondsAndFetch(
        payload.project,
        sessionMinutes
    );

    const lastPayloadEnd = getItem("latestPayloadTimestampEndUtc");
    const isNewDay = lastPayloadEnd === 0 ? 1 : 0;

    // get the current payloads so we can compare our last cumulative seconds.
    let lastPayload: KeystrokeStats = await getLastSavedKeystrokeStats();
    if (lastPayload) {
        // Also check if it's a new day. if so, don't use the last payload
        if (
            getFormattedDay(lastPayload.local_start) !==
            getFormattedDay(payload.local_start)
        ) {
            // it's a new day
            lastPayload = null;
        }
    }

    // default error to empty
    payload.project_null_error = "";
    payload.editor_seconds_error = "";
    payload.session_seconds_error = "";

    // set the project null error if we're unable to find the time project metrics for this payload
    if (!td) {
        // We don't have a TimeData value, use the last recorded kpm data
        payload.project_null_error = `TimeData not found using ${payload.project.directory} for editor and session seconds`;
    }

    // isNewDay = 1 if the last payload timestamp is zero
    // based on getting reset for a new day
    payload.new_day = isNewDay;

    // get the editor seconds
    let cumulative_editor_seconds = 60;
    let cumulative_session_seconds = 60;
    if (td) {
        // We found a TimeData object, use that info
        cumulative_editor_seconds = td.editor_seconds;
        cumulative_session_seconds = td.session_seconds;
    } else if (lastPayload) {
        // use the last saved keystrokestats
        if (lastPayload.cumulative_editor_seconds) {
            cumulative_editor_seconds =
                lastPayload.cumulative_editor_seconds + 60;
        } else {
            payload.editor_seconds_error = `No editor seconds in last payload`;
        }
        if (lastPayload.cumulative_session_seconds) {
            cumulative_session_seconds =
                lastPayload.cumulative_session_seconds + 60;
        } else {
            payload.editor_seconds_error = `No session seconds in last payload`;
        }
    }

    // Check if the final cumulative editor seconds is less than the cumulative session seconds
    if (cumulative_editor_seconds < cumulative_session_seconds) {
        const diff = cumulative_session_seconds - cumulative_editor_seconds;
        // Only log an error if it's greater than 30 seconds
        if (diff > 30) {
            payload.editor_seconds_error = `Cumulative editor seconds is behind session seconds by ${diff} seconds`;
        }
        // make sure to set it to at least the session seconds
        cumulative_editor_seconds = cumulative_session_seconds;
    }

    // update the cumulative editor seconds
    payload.cumulative_editor_seconds = cumulative_editor_seconds;
    payload.cumulative_session_seconds = cumulative_session_seconds;
}

export async function processPayload(payload: KeystrokeStats, sendNow = false) {
    // set the end time for the session
    let nowTimes = getNowTimes();

    payload.end = nowTimes.now_in_sec;
    payload.local_end = nowTimes.local_now_in_sec;
    const keys = Object.keys(payload.source);

    // Get time between payloads
    const { sessionMinutes, elapsedSeconds } = getTimeBetweenLastPayload();

    // make sure we have a project in case for some reason it made it here without one
    if (!payload.project || !payload.project.directory) {
        payload.project = {
            directory: UNTITLED_WORKSPACE,
            name: NO_PROJ_NAME,
            identifier: "",
            resource: {},
        };
    }

    // REPO contributor count
    const repoContributorInfo: RepoContributorInfo = await getRepoContributorInfo(
        payload.project.directory,
        true
    );
    payload.repoContributorCount = repoContributorInfo
        ? repoContributorInfo.count || 0
        : 0;

    // REPO file count
    const repoFileCount = await getRepoFileCount(payload.project.directory);
    payload.repoFileCount = repoFileCount || 0;

    // validate the cumulative data
    await validateAndUpdateCumulativeData(payload, sessionMinutes);

    // set the elapsed seconds (last end time to this end time)
    payload.elapsed_seconds = elapsedSeconds;

    // go through each file and make sure the end time is set
    if (keys && keys.length > 0) {
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const fileInfo: FileChangeInfo = payload.source[key];
            // ensure there is an end time
            if (!fileInfo.end) {
                // set the end time for this file event
                let nowTimes = getNowTimes();
                fileInfo.end = nowTimes.now_in_sec;
                fileInfo.local_end = nowTimes.local_now_in_sec;
            }

            const repoFileContributorCount = await getFileContributorCount(key);
            fileInfo.repoFileContributorCount = repoFileContributorCount || 0;
            payload.source[key] = fileInfo;
        }
    }

    // set the timezone
    payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // async for either
    if (sendNow) {
        sendBatchPayload("/data/batch", [payload]);
        logIt(`sending kpm metrics`);
    } else {
        storePayload(payload, sessionMinutes);
        logIt(`storing kpm metrics`);

        let nowTimes = getNowTimes();

        // Update the latestPayloadTimestampEndUtc. It's used to determine session time and elapsed_seconds
        setItem("latestPayloadTimestampEndUtc", nowTimes.now_in_sec);
    }
}

/**
 * this should only be called if there's file data in the source
 * @param payload
 */
export async function storePayload(
    payload: KeystrokeStats,
    sessionMinutes: number
) {
    // get a mapping of the current files
    const fileChangeInfoMap = getFileChangeSummaryAsJson();

    const aggregate: KeystrokeAggregate = new KeystrokeAggregate();
    aggregate.directory = payload.project
        ? payload.project.directory || NO_PROJ_NAME
        : NO_PROJ_NAME;
    Object.keys(payload.source).forEach((key) => {
        const fileInfo: FileChangeInfo = payload.source[key];
        /**
         * update the project info
         * project has {directory, name}
         */
        const baseName = path.basename(key);
        fileInfo.name = baseName;
        fileInfo.fsPath = key;
        fileInfo.projectDir = payload.project.directory;
        fileInfo.duration_seconds = fileInfo.end - fileInfo.start;

        // update the aggregate info
        aggregate.add += fileInfo.add;
        aggregate.close += fileInfo.close;
        aggregate.delete += fileInfo.delete;
        aggregate.keystrokes += fileInfo.keystrokes;
        aggregate.linesAdded += fileInfo.linesAdded;
        aggregate.linesRemoved += fileInfo.linesRemoved;
        aggregate.open += fileInfo.open;
        aggregate.paste += fileInfo.paste;

        const existingFileInfo: FileChangeInfo = fileChangeInfoMap[key];
        if (!existingFileInfo) {
            fileInfo.update_count = 1;
            fileInfo.kpm = aggregate.keystrokes;
            fileChangeInfoMap[key] = fileInfo;
        } else {
            // aggregate
            existingFileInfo.update_count += 1;
            existingFileInfo.keystrokes += fileInfo.keystrokes;
            existingFileInfo.kpm =
                existingFileInfo.keystrokes / existingFileInfo.update_count;
            existingFileInfo.add += fileInfo.add;
            existingFileInfo.close += fileInfo.close;
            existingFileInfo.delete += fileInfo.delete;
            existingFileInfo.keystrokes += fileInfo.keystrokes;
            existingFileInfo.linesAdded += fileInfo.linesAdded;
            existingFileInfo.linesRemoved += fileInfo.linesRemoved;
            existingFileInfo.open += fileInfo.open;
            existingFileInfo.paste += fileInfo.paste;
            existingFileInfo.duration_seconds += fileInfo.duration_seconds;

            // non aggregates, just set
            existingFileInfo.lines = fileInfo.lines;
            existingFileInfo.length = fileInfo.length;
        }
    });

    // this will increment and store it offline
    await incrementSessionSummaryData(aggregate, sessionMinutes);

    // write the fileChangeInfoMap
    saveFileChangeInfoToDisk(fileChangeInfoMap);

    // store the payload into the data.json file
    fs.appendFileSync(
        getSoftwareDataStoreFile(),
        JSON.stringify(payload) + os.EOL,
        (err) => {
            if (err)
                logIt(
                    `Error appending to the Software data store file: ${err.message}`
                );
        }
    );

    // update the payloads in memory
    updateLastSavedKeystrokesStats();
}

export function getCurrentPayloadFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\latestKeystrokes.json";
    } else {
        file += "/latestKeystrokes.json";
    }
    return file;
}

export async function storeCurrentPayload(payload) {
    try {
        const content = JSON.stringify(payload, null, 4);
        fs.writeFileSync(this.getCurrentPayloadFile(), content, (err) => {
            if (err) logIt(`Deployer: Error writing time data: ${err.message}`);
        });
    } catch (e) {
        //
    }
}
