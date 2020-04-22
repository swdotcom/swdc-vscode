import {
    getSoftwareDataStoreFile,
    logIt,
    getItem,
    getNowTimes,
    setItem,
    getFormattedDay,
    isNewDay,
} from "../Util";
import { incrementSessionAndFileSecondsAndFetch } from "../storage/TimeSummaryData";
import {
    getFileChangeSummaryAsJson,
    saveFileChangeInfoToDisk,
} from "../storage/FileChangeInfoSummaryData";
import { KeystrokeAggregate, FileChangeInfo } from "../model/models";
import { NO_PROJ_NAME, UNTITLED } from "../Constants";
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
import { SummaryManager } from "./SummaryManager";
import {
    sendBatchPayload,
    updateLastSavedKeystrokesStats,
    getLastSavedKeystrokeStats,
} from "./FileManager";
import { WallClockManager } from "./WallClockManager";

const os = require("os");
const fs = require("fs");
const path = require("path");

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
    // This will find a time data object based on the current day
    let td: TimeData = await incrementSessionAndFileSecondsAndFetch(
        payload.project,
        sessionMinutes
    );

    // default error to empty
    payload.project_null_error = "";
    payload.editor_seconds_error = "";
    payload.session_seconds_error = "";

    let lastPayload: KeystrokeStats = await getLastSavedKeystrokeStats();

    // check to see if we're in a new day
    if (isNewDay()) {
        lastPayload = null;
        if (td) {
            // don't rely on the previous TimeData
            td = null;
            payload.project_null_error = `TimeData should be null as its a new day`;
        }
        await SummaryManager.getInstance().newDayChecker();
    }

    const lastPayloadEnd = getItem("latestPayloadTimestampEndUtc");
    payload.new_day = lastPayloadEnd === 0 ? 1 : 0;

    // set the project null error if we're unable to find the time project metrics for this payload
    if (!td) {
        // We don't have a TimeData value, use the last recorded kpm data
        payload.project_null_error = `TimeData not found using ${payload.project.directory} for editor and session seconds`;
    }

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
            directory: UNTITLED,
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
    await updateAggregateInfo(fileChangeInfoMap, payload, sessionMinutes);

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

    // update the status and tree
    WallClockManager.getInstance().dispatchStatusViewUpdate();
}

export async function updateAggregateInfo(
    fileChangeInfoMap,
    payload,
    sessionMinutes
) {
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
}
