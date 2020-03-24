import {
    getSoftwareDir,
    isWindows,
    logIt,
    getFileDataArray,
    getNowTimes,
    getActiveProjectWorkspace
} from "../Util";
import { TimeData } from "../model/models";
import { getResourceInfo } from "../repo/KpmRepoManager";
import { WorkspaceFolder } from "vscode";
import { Project } from "../model/Project";
import { NO_PROJ_NAME, UNTITLED } from "../Constants";
const fs = require("fs");
const moment = require("moment-timezone");

export function getTimeDataSummaryFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\projectTimeData.json";
    } else {
        file += "/projectTimeData.json";
    }
    return file;
}

async function getNewTimeDataSummary(): Promise<TimeData> {
    const { utcEndOfDay, localEndOfDay, day, nowLocal } = getEndOfDayTimes();

    const activeWorkspace: WorkspaceFolder = getActiveProjectWorkspace();

    const project: Project = await getCurrentTimeSummaryProject(
        activeWorkspace
    );

    const timeData = new TimeData();
    timeData.day = day;
    timeData.project = project;
    timeData.timestamp = utcEndOfDay;
    timeData.timestamp_local = localEndOfDay;
    timeData.now_local = nowLocal;
    return timeData;
}

export async function clearTimeDataSummary() {
    const timeData = await getNewTimeDataSummary();
    saveTimeDataSummaryToDisk(timeData);
}

export async function getCurrentTimeSummaryProject(
    workspaceFolder: WorkspaceFolder
): Promise<Project> {
    const project: Project = new Project();
    if (!workspaceFolder || !workspaceFolder.name) {
        // no workspace folder
        project.directory = NO_PROJ_NAME;
        project.name = UNTITLED;
    } else {
        let rootPath: string = workspaceFolder.uri.fsPath;
        let name: string = workspaceFolder.name;
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
        }
    }

    return project;
}

export async function updateEditorSeconds(editor_seconds: number) {
    const activeWorkspace: WorkspaceFolder = getActiveProjectWorkspace();

    // only increment if we have an active workspace
    if (activeWorkspace && activeWorkspace.name) {
        const { nowLocal } = getEndOfDayTimes();
        const project: Project = await getCurrentTimeSummaryProject(
            activeWorkspace
        );
        const timeData: TimeData = await getTodayTimeDataSummary(project);
        timeData.editor_seconds += editor_seconds;
        // update the now local timestamp
        timeData.now_local = nowLocal;

        // save the info to disk
        saveTimeDataSummaryToDisk(timeData);
    }
}

export async function incrementSessionAndFileSeconds(minutes_since_payload) {
    const activeWorkspace: WorkspaceFolder = getActiveProjectWorkspace();

    // only increment if we have an active workspace
    if (activeWorkspace && activeWorkspace.name) {
        const project: Project = await getCurrentTimeSummaryProject(
            activeWorkspace
        );

        // what is the gap from the previous start
        const timeData: TimeData = await getTodayTimeDataSummary(project);
        const session_seconds = minutes_since_payload * 60;
        timeData.session_seconds += session_seconds;
        timeData.file_seconds += 60;

        // save the info to disk
        saveTimeDataSummaryToDisk(timeData);
    }
}

export async function getTodayTimeDataSummary(
    project: Project
): Promise<TimeData> {
    const { day } = getEndOfDayTimes();

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
    return {
        utcEndOfDay,
        localEndOfDay,
        day,
        nowLocal: nowTime.local_now_in_sec
    };
}

function saveTimeDataSummaryToDisk(data: TimeData) {
    if (!data) {
        return;
    }

    const file = getTimeDataSummaryFile();

    let payloads: TimeData[] = getFileDataArray(file);

    if (payloads && payloads.length) {
        // find the one for this day
        const idx = payloads.findIndex(
            n =>
                n.day === data.day &&
                n.project.directory === data.project.directory
        );
        if (idx !== -1) {
            payloads[idx] = data;
        } else {
            // add it
            payloads.push(data);
        }
    } else {
        payloads = [data];
    }

    try {
        const content = JSON.stringify(payloads, null, 4);
        fs.writeFileSync(file, content, err => {
            if (err) logIt(`Deployer: Error writing time data: ${err.message}`);
        });
    } catch (e) {
        //
    }
}
