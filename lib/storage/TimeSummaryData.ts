import {
    getSoftwareDir,
    isWindows,
    logIt,
    getFileDataArray,
    getNowTimes,
    getWorkspaceFolders
} from "../Util";
import { TimeData } from "../model/models";
import { getResourceInfo } from "../repo/KpmRepoManager";
import { WorkspaceFolder } from "vscode";
import { Project } from "../model/Project";
import { NO_PROJ_NAME, UNTITLED } from "../Constants";
import { updateStatusBarWithSummaryData } from "./SessionSummaryData";
import { WallClockManager } from "../managers/WallClockManager";
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

async function getNewTimeDataSummary(): Promise<TimeData> {
    const { utcEndOfDay, localEndOfDay, day } = getEndOfDayTimes();
    const project: Project = await getCurrentTimeSummaryProject();

    const timeData = new TimeData();
    timeData.day = day;
    timeData.project = project;
    timeData.timestamp = utcEndOfDay;
    timeData.timestamp_local = localEndOfDay;
    return timeData;
}

export async function clearTimeDataSummary() {
    const timeData = await getNewTimeDataSummary();
    saveTimeDataSummaryToDisk(timeData);
}

export async function getCurrentTimeSummaryProject(): Promise<Project> {
    const project: Project = new Project();

    const workspaceFolders: WorkspaceFolder[] = getWorkspaceFolders();
    let rootPath: string = "";
    let name: string = "";
    if (workspaceFolders && workspaceFolders.length) {
        rootPath = workspaceFolders[0].uri.fsPath;
        name = workspaceFolders[0].name;
    }
    if (rootPath) {
        // create the project
        project.directory = rootPath;
        project.name = name;

        try {
            const resource = await getResourceInfo(rootPath);
            if (resource) {
                project.resource = resource;
                project.identifier = resource.identifier;
            }
        } catch (e) {
            //
        }
    } else {
        project.directory = NO_PROJ_NAME;
        project.name = UNTITLED;
    }

    return project;
}

export async function updateEditorSeconds(editor_seconds: number) {
    const timeData: TimeData = await getTodayTimeDataSummary();
    timeData.editor_seconds += editor_seconds;

    // save the info to disk
    saveTimeDataSummaryToDisk(timeData);
}

export async function incrementSessionAndFileSeconds(minutes_since_payload) {
    // what is the gap from the previous start
    const timeData: TimeData = await getTodayTimeDataSummary();
    const session_seconds = minutes_since_payload * 60;
    timeData.session_seconds += session_seconds;
    timeData.file_seconds += 60;

    // save the info to disk
    saveTimeDataSummaryToDisk(timeData);
}

export async function getTodayTimeDataSummary(): Promise<TimeData> {
    const { day } = getEndOfDayTimes();

    const project: Project = await getCurrentTimeSummaryProject();

    let timeData: TimeData = null;

    const file = getTimeDataSummaryFile();
    const payloads: TimeData[] = getFileDataArray(file);
    if (payloads && payloads.length) {
        // find the one for this day
        timeData = payloads.find(
            n => n.day === day && n.project.directory === project.directory
        );
    }

    // not found, create one
    if (!timeData) {
        timeData = await getNewTimeDataSummary();
        saveTimeDataSummaryToDisk(timeData);
    }

    return timeData;
}

function getEndOfDayTimes() {
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
    return { utcEndOfDay, localEndOfDay, day };
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
