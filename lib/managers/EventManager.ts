import {
    KeystrokeAggregate,
    FileChangeInfo,
    CodeTimeEvent
} from "../model/models";
import {
    getSoftwareDataStoreFile,
    logIt,
    getItem,
    getPluginEventsFile,
    getNowTimes,
    getHostname
} from "../Util";
import * as path from "path";
import { softwarePost } from "../http/HttpClient";
import {
    getFileChangeSummaryAsJson,
    saveFileChangeInfoToDisk
} from "../storage/FileChangeInfoSummaryData";
import { incrementSessionSummaryData } from "../storage/SessionSummaryData";
import { commands } from "vscode";
import { NO_PROJ_NAME } from "../Constants";
const fs = require("fs");
const os = require("os");

export class EventManager {
    private static instance: EventManager;

    private constructor() {}

    static getInstance(): EventManager {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager();
        }

        return EventManager.instance;
    }

    sendBatchPayload(api, batch) {
        softwarePost(api, batch, getItem("jwt")).catch(e => {
            logIt(`Unable to send plugin data batch, error: ${e.message}`);
        });
    }

    /**
     * this should only be called if there's file data in the source
     * @param payload
     */
    storePayload(payload) {
        // get a mapping of the current files
        const fileChangeInfoMap = getFileChangeSummaryAsJson();

        const aggregate: KeystrokeAggregate = new KeystrokeAggregate();
        aggregate.directory = payload.project
            ? payload.project.directory || NO_PROJ_NAME
            : NO_PROJ_NAME;
        Object.keys(payload.source).forEach(key => {
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
        incrementSessionSummaryData(aggregate);

        // write the fileChangeInfoMap
        saveFileChangeInfoToDisk(fileChangeInfoMap);

        setTimeout(() => {
            // refresh the tree view
            commands.executeCommand("codetime.refreshKpmTree");
        }, 1000);

        // store the payload into the data.json file

        fs.appendFile(
            getSoftwareDataStoreFile(),
            JSON.stringify(payload) + os.EOL,
            err => {
                if (err)
                    logIt(
                        `Error appending to the Software data store file: ${err.message}`
                    );
            }
        );
    }

    storeEvent(event) {
        fs.appendFile(
            getPluginEventsFile(),
            JSON.stringify(event) + os.EOL,
            err => {
                if (err) {
                    logIt(
                        `Error appending to the events data file: ${err.message}`
                    );
                }
            }
        );
    }

    /**
     *
     * @param type i.e. window | mouse | etc...
     * @param name i.e. close | click | etc...
     * @param description
     */
    async createCodeTimeEvent(type: string, name: string, description: string) {
        const nowTimes = getNowTimes();
        const event: CodeTimeEvent = new CodeTimeEvent();
        event.timestamp = nowTimes.now_in_sec;
        event.timestamp_local = nowTimes.local_now_in_sec;
        event.type = type;
        event.name = name;
        event.description = description;
        event.hostname = await getHostname();
        EventManager.getInstance().storeEvent(event);
    }
}
