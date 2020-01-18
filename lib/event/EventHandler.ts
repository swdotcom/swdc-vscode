import { KeystrokeAggregate, FileChangeInfo } from "../model/models";
import {
    getSoftwareDataStoreFile,
    logIt,
    getItem,
    getPluginEventsFile
} from "../Util";
import * as path from "path";
import { softwarePost } from "../http/HttpClient";
import { SummaryManager } from "../controller/SummaryManager";
import {
    getFileChangeInfoMap,
    saveFileChangeInfoToDisk
} from "../storage/FileChangeInfoSummaryData";
import {
    incrementSessionSummaryData,
    updateStatusBarWithSummaryData
} from "../storage/SessionSummaryData";
import { commands } from "vscode";
const fs = require("fs");
const os = require("os");

export class EventHandler {
    private static instance: EventHandler;

    private constructor() {}

    static getInstance(): EventHandler {
        if (!EventHandler.instance) {
            EventHandler.instance = new EventHandler();
        }

        return EventHandler.instance;
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
        const fileChangeInfoMap = getFileChangeInfoMap();

        const aggregate: KeystrokeAggregate = new KeystrokeAggregate();
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
}
