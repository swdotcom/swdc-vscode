import { serverIsAvailable, softwarePost } from "../http/HttpClient";
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
} from "../Util";
import {
    getTimeDataSummaryFile,
    incrementSessionAndFileSeconds,
    getTodayTimeDataSummary,
    clearTimeDataSummary,
} from "../storage/TimeSummaryData";
import {
    getFileChangeSummaryAsJson,
    saveFileChangeInfoToDisk,
} from "../storage/FileChangeInfoSummaryData";
import { KeystrokeAggregate, FileChangeInfo } from "../model/models";
import { NO_PROJ_NAME, UNTITLED_WORKSPACE } from "../Constants";
import * as path from "path";
import { incrementSessionSummaryData } from "../storage/SessionSummaryData";
import TimeData from "../model/TimeData";
import RepoContributorInfo from "../model/RepoContributorInfo";
import {
    getRepoContributorInfo,
    getRepoFileCount,
    getFileContributorCount,
} from "../repo/KpmRepoManager";
const os = require("os");
const fs = require("fs");

// batch offline payloads in 50. backend has a 100k body limit
const batch_limit = 50;

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

export async function batchSendPayloadData(api, file, payloads) {
    // we're online so just delete the file
    deleteFile(file);

    // send the batch
    if (payloads && payloads.length > 0) {
        logEvent(`sending batch payloads: ${JSON.stringify(payloads)}`);

        // send 50 at a time
        let batch = [];
        for (let i = 0; i < payloads.length; i++) {
            if (batch.length >= batch_limit) {
                await sendBatchPayload(api, batch);
                batch = [];
            }
            batch.push(payloads[i]);
        }
        // send the remaining
        if (batch.length > 0) {
            await sendBatchPayload(api, batch);
        }
    }
}

export function sendBatchPayload(api, batch) {
    softwarePost(api, batch, getItem("jwt")).catch((e) => {
        logIt(`Unable to send plugin data batch, error: ${e.message}`);
    });
}

export async function processPayload(payload, sendNow = false) {
    // set the end time for the session
    let nowTimes = getNowTimes();

    payload["end"] = nowTimes.now_in_sec;
    payload["local_end"] = nowTimes.local_now_in_sec;
    const keys = Object.keys(payload.source);

    // increment the projects session and file seconds
    await incrementSessionAndFileSeconds(payload.project);

    // get the time data summary (get the latest editor seconds)
    const td: TimeData = await getTodayTimeDataSummary(payload.project);

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

    // get the editor seconds
    let editor_seconds = 60;
    if (td) {
        editor_seconds = Math.max(td.editor_seconds, td.session_seconds);
    }

    // go through each file and make sure the end time is set
    // and the cumulative_editor_seconds is set
    if (keys && keys.length > 0) {
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            // ensure there is an end time
            const end = parseInt(payload.source[key]["end"], 10) || 0;
            if (end === 0) {
                // set the end time for this file event
                let nowTimes = getNowTimes();
                payload.source[key]["end"] = nowTimes.now_in_sec;
                payload.source[key]["local_end"] = nowTimes.local_now_in_sec;
            }

            const repoFileContributorCount = await getFileContributorCount(key);
            payload.source[key]["repoFileContributorCount"] =
                repoFileContributorCount || 0;

            // update the set of files to the editor seconds
            payload["cumulative_editor_seconds"] = editor_seconds;
        }
    }

    payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (!payload.project || !payload.project.directory) {
        payload["project"] = {
            directory: UNTITLED_WORKSPACE,
            name: NO_PROJ_NAME,
            identifier: "",
            resource: {},
        };
    }

    // async for either
    if (sendNow) {
        sendBatchPayload("/data/batch", [payload]);
        logIt(`sending kpm metrics`);
    } else {
        storePayload(payload);
        logIt(`storing kpm metrics`);
    }
}

/**
 * this should only be called if there's file data in the source
 * @param payload
 */
export async function storePayload(payload) {
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
    await incrementSessionSummaryData(aggregate);

    // write the fileChangeInfoMap
    saveFileChangeInfoToDisk(fileChangeInfoMap);

    // store the payload into the data.json file
    fs.appendFile(
        getSoftwareDataStoreFile(),
        JSON.stringify(payload) + os.EOL,
        (err) => {
            if (err)
                logIt(
                    `Error appending to the Software data store file: ${err.message}`
                );
        }
    );

    let nowTimes = getNowTimes();
    // Update the latestPayloadTimestampEndUtc. It's used to determine session time
    setItem("latestPayloadTimestampEndUtc", nowTimes.now_in_sec);
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
