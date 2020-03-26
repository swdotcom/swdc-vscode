import { serverIsAvailable } from "../http/HttpClient";
import {
    getSoftwareDataStoreFile,
    deleteFile,
    logEvent,
    getPluginEventsFile,
    logIt,
    getFileDataPayloadsAsJson,
    getFileDataArray
} from "../Util";
import { EventManager } from "./EventManager";
import { getTimeDataSummaryFile } from "../storage/TimeSummaryData";
import { SummaryManager } from "./SummaryManager";

const fs = require("fs");

// batch offline payloads in 50. backend has a 100k body limit
const batch_limit = 50;

/**
 * send the offline TimeData payloads
 */
export async function sendOfflineTimeData() {
    batchSendArrayData("/data/time", getTimeDataSummaryFile());
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

    // fetch to get the users averages
    setTimeout(() => {
        SummaryManager.getInstance().updateSessionSummaryFromServer(isNewDay);
    }, 1000 * 60);
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
    if (payloads && payloads.length > 0) {
        logEvent(`sending batch payloads: ${JSON.stringify(payloads)}`);

        const eventHandler: EventManager = EventManager.getInstance();

        // send 50 at a time
        let batch = [];
        for (let i = 0; i < payloads.length; i++) {
            if (batch.length >= batch_limit) {
                await eventHandler.sendBatchPayload(api, batch);
                batch = [];
            }
            batch.push(payloads[i]);
        }
        // send the remaining
        if (batch.length > 0) {
            await eventHandler.sendBatchPayload(api, batch);
        }
    }
}
