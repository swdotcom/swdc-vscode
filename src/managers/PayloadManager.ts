import {
    getSoftwareDataStoreFile,
    logIt,
    getNowTimes,
    setItem,
    isNewDay,
    getProjectFolder,
    getWorkspaceName,
    getHostname,
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
    getResourceInfo,
} from "../repo/KpmRepoManager";
import KeystrokeStats from "../model/KeystrokeStats";
import { SummaryManager } from "./SummaryManager";
import { sendBatchPayload, getLastSavedKeystrokesStats } from "./FileManager";
import { WallClockManager } from "./WallClockManager";
import { WorkspaceFolder } from "vscode";
import Project from "../model/Project";

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

    // get the latest payload (in-memory or on file)
    let lastPayload: KeystrokeStats = await getLastSavedKeystrokesStats();

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

    // set the workspace name
    payload.workspace_name = getWorkspaceName();
    payload.hostname = await getHostname();

    // set the project null error if we're unable to find the time project metrics for this payload
    if (!td) {
        // We don't have a TimeData value, use the last recorded kpm data
        payload.project_null_error = `No TimeData for: ${payload.project.directory}`;
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
        }
        if (lastPayload.cumulative_session_seconds) {
            cumulative_session_seconds =
                lastPayload.cumulative_session_seconds + 60;
        }
    }

    // Check if the final cumulative editor seconds is less than the cumulative session seconds
    if (cumulative_editor_seconds < cumulative_session_seconds) {
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

    // Get time between payloads
    const { sessionMinutes, elapsedSeconds } = getTimeBetweenLastPayload();

    // GET the project
    // find the best workspace root directory from the files within the payload
    const keys = Object.keys(payload.source);
    let directory = UNTITLED;
    let projName = NO_PROJ_NAME;
    let resourceInfo = null;
    for (let i = 0; i < keys.length; i++) {
        const fileName = keys[i];
        const workspaceFolder: WorkspaceFolder = getProjectFolder(fileName);
        if (workspaceFolder) {
            directory = workspaceFolder.uri.fsPath;
            projName = workspaceFolder.name;
            // since we have this, look for the repo identifier
            resourceInfo = await getResourceInfo(directory);
            break;
        }
    }

    // CREATE the project into the payload
    const p: Project = new Project();
    p.directory = directory;
    p.name = projName;
    p.resource = resourceInfo;
    p.identifier =
        resourceInfo && resourceInfo.identifier ? resourceInfo.identifier : "";
    payload.project = p;

    // validate the cumulative data
    await validateAndUpdateCumulativeData(payload, sessionMinutes);

    payload.end = nowTimes.now_in_sec;
    payload.local_end = nowTimes.local_now_in_sec;

    if (p.identifier) {
        // REPO contributor count
        const repoContributorInfo: RepoContributorInfo = await getRepoContributorInfo(
            directory,
            true
        );
        payload.repoContributorCount = repoContributorInfo
            ? repoContributorInfo.count || 0
            : 0;

        // REPO file count
        const repoFileCount = await getRepoFileCount(directory);
        payload.repoFileCount = repoFileCount || 0;
    } else {
        payload.repoContributorCount = 0;
        payload.repoFileCount = 0;
    }

    // set the elapsed seconds (last end time to this end time)
    payload.elapsed_seconds = elapsedSeconds;

    // go through each file and make sure the end time is set
    if (keys && keys.length > 0) {
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const fileInfo: FileChangeInfo = payload.source[key];
            // ensure there is an end time
            if (!fileInfo.end) {
                fileInfo.end = nowTimes.now_in_sec;
                fileInfo.local_end = nowTimes.local_now_in_sec;
            }

            // only get the contributor info if we have a repo identifier
            if (p.identifier) {
                // set the contributor count per file
                const repoFileContributorCount = await getFileContributorCount(
                    key
                );
                fileInfo.repoFileContributorCount =
                    repoFileContributorCount || 0;
            }
            payload.source[key] = fileInfo;
        }
    }

    // set the timezone
    payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // async for either
    if (sendNow) {
        // send the payload now (only called when getting installed)
        sendBatchPayload("/data/batch", [payload]);
        logIt(`sending kpm metrics`);
    } else {
        // store to send the batch later
        storePayload(payload, sessionMinutes);
        logIt(`storing kpm metrics`);
    }

    // Update the latestPayloadTimestampEndUtc. It's used to determine session time and elapsed_seconds
    setItem("latestPayloadTimestampEndUtc", nowTimes.now_in_sec);
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
