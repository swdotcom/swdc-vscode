import {
    getSoftwareDir,
    isWindows,
    logIt,
    getFileDataArray,
    getNowTimes,
    getActiveProjectWorkspace,
    setItem,
} from "../Util";
import { getResourceInfo } from "../repo/KpmRepoManager";
import { WorkspaceFolder } from "vscode";
import { NO_PROJ_NAME, UNTITLED } from "../Constants";
import { getMinutesSinceLastPayload } from "./SessionSummaryData";
import CodeTimeSummary from "../model/CodeTimeSummary";
import Project from "../model/Project";
import TimeData from "../model/TimeData";
import { WallClockManager } from "../managers/WallClockManager";
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

async function getNewTimeDataSummary(
    keystrokeProject: Project
): Promise<TimeData> {
    const { utcEndOfDay, localEndOfDay, day, nowLocal } = getEndOfDayTimes();

    let project: Project;
    if (!keystrokeProject) {
        const activeWorkspace: WorkspaceFolder = getActiveProjectWorkspace();
        project = await getCurrentTimeSummaryProject(activeWorkspace);
    } else {
        project = { ...keystrokeProject };
    }

    const timeData = new TimeData();
    timeData.day = day;
    timeData.project = project;
    timeData.timestamp = utcEndOfDay;
    timeData.timestamp_local = localEndOfDay;
    timeData.now_local = nowLocal;
    return timeData;
}

export async function clearTimeDataSummary() {
    const file = getTimeDataSummaryFile();
    let payloads: TimeData[] = [];
    try {
        const content = JSON.stringify(payloads, null, 4);
        fs.writeFileSync(file, content, (err) => {
            if (err) logIt(`Deployer: Error writing time data: ${err.message}`);
        });
    } catch (e) {
        //
    }
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

export async function incrementEditorSeconds(editor_seconds: number) {
    const activeWorkspace: WorkspaceFolder = getActiveProjectWorkspace();

    // only increment if we have an active workspace
    if (activeWorkspace && activeWorkspace.name) {
        const { nowLocal } = getEndOfDayTimes();
        const project: Project = await getCurrentTimeSummaryProject(
            activeWorkspace
        );
        if (project && project.directory) {
            const timeData: TimeData = await getTodayTimeDataSummary(project);
            timeData.editor_seconds += editor_seconds;
            timeData.editor_seconds = Math.max(
                timeData.editor_seconds,
                timeData.session_seconds
            );
            // update the now local timestamp
            timeData.now_local = nowLocal;

            // save the info to disk
            saveTimeDataSummaryToDisk(timeData);
        }
    }
}

export async function updateSessionFromSummaryApi(currentDayMinutes: number) {
    const { utcEndOfDay, localEndOfDay, day, nowLocal } = getEndOfDayTimes();

    const codeTimeSummary: CodeTimeSummary = getCodeTimeSummary();

    // find out if there's a diff
    const diffActiveCodeMinutesToAdd =
        codeTimeSummary.activeCodeTimeMinutes < currentDayMinutes
            ? currentDayMinutes - codeTimeSummary.activeCodeTimeMinutes
            : 0;

    // get the current open project
    const activeWorkspace: WorkspaceFolder = getActiveProjectWorkspace();
    let project: Project = null;
    let timeData: TimeData = null;
    if (activeWorkspace) {
        project = await getCurrentTimeSummaryProject(activeWorkspace);
        timeData = await getTodayTimeDataSummary(project);
    } else {
        const file = getTimeDataSummaryFile();
        const payloads: TimeData[] = getFileDataArray(file);
        const filtered_payloads: TimeData[] = payloads.filter(
            (n: TimeData) => n.day === day
        );
        if (filtered_payloads && filtered_payloads.length) {
            timeData = filtered_payloads[0];
        }
    }

    if (!timeData) {
        // create a untitled one
        project = new Project();
        project.directory = NO_PROJ_NAME;
        project.name = UNTITLED;

        timeData = new TimeData();
        timeData.day = day;
        timeData.project = project;
        timeData.timestamp = utcEndOfDay;
        timeData.timestamp_local = localEndOfDay;
        timeData.now_local = nowLocal;
    }

    // save the info to disk
    const secondsToAdd = diffActiveCodeMinutesToAdd * 60;
    timeData.session_seconds += secondsToAdd;
    timeData.editor_seconds += secondsToAdd;
    // make sure editor seconds isn't less
    saveTimeDataSummaryToDisk(timeData);
}

export async function incrementSessionAndFileSeconds(project: Project) {
    // get the matching time data object or create one
    const timeData: TimeData = await getTodayTimeDataSummary(project);
    // what is the gap from the previous start (1 minute or the gap)
    const incrementMinutes = Math.max(1, getMinutesSinceLastPayload());
    if (timeData) {
        const session_seconds = incrementMinutes * 60;
        timeData.session_seconds += session_seconds;
        // update the editor seconds in case its lagging
        timeData.editor_seconds = Math.max(
            timeData.editor_seconds,
            timeData.session_seconds
        );
        timeData.file_seconds += 60;
        timeData.file_seconds = Math.min(
            timeData.file_seconds,
            timeData.session_seconds
        );

        // save the info to disk
        saveTimeDataSummaryToDisk(timeData);
    }

    WallClockManager.getInstance().dispatchStatusViewUpdate();
}

export function getCodeTimeSummary(): CodeTimeSummary {
    const summary: CodeTimeSummary = new CodeTimeSummary();

    const { day } = getEndOfDayTimes();

    // gather the time data elements for today
    const file = getTimeDataSummaryFile();
    const payloads: TimeData[] = getFileDataArray(file);

    const filtered_payloads: TimeData[] = payloads.filter(
        (n: TimeData) => n.day === day
    );

    if (filtered_payloads && filtered_payloads.length) {
        filtered_payloads.forEach((n: TimeData) => {
            summary.activeCodeTimeMinutes += n.session_seconds / 60;
            summary.codeTimeMinutes += n.editor_seconds / 60;
            summary.fileTimeMinutes += n.file_seconds / 60;
        });
    }

    return summary;
}

export async function getTodayTimeDataSummary(
    project: Project
): Promise<TimeData> {
    if (!project || !project.directory) {
        return null;
    }
    const { day } = getEndOfDayTimes();

    let timeData: TimeData = null;

    const file = getTimeDataSummaryFile();
    const payloads: TimeData[] = getFileDataArray(file);

    if (payloads && payloads.length) {
        // find the one for this day
        timeData = payloads.find(
            (n) => n.day === day && n.project.directory === project.directory
        );
    }

    // not found, create one
    if (!timeData) {
        timeData = await getNewTimeDataSummary(project);
        saveTimeDataSummaryToDisk(timeData);
    }

    return timeData;
}

function getEndOfDayTimes() {
    const nowTime = getNowTimes();
    const day = moment.unix(nowTime.local_now_in_sec).format("YYYY-MM-DD");
    const utcEndOfDay = moment.unix(nowTime.now_in_sec).endOf("day").unix();
    const localEndOfDay = moment
        .unix(nowTime.local_now_in_sec)
        .endOf("day")
        .unix();
    return {
        utcEndOfDay,
        localEndOfDay,
        day,
        nowLocal: nowTime.local_now_in_sec,
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
            (n) =>
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
        fs.writeFileSync(file, content, (err) => {
            if (err) logIt(`Deployer: Error writing time data: ${err.message}`);
        });
    } catch (e) {
        //
    }
}
