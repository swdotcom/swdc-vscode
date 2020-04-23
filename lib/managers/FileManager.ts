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
    getSoftwareDir,
    isWindows,
} from "../Util";
import {
    getTimeDataSummaryFile,
    clearTimeDataSummary,
} from "../storage/TimeSummaryData";
import KeystrokeStats from "../model/KeystrokeStats";

const fs = require("fs");

// batch offline payloads in 50. backend has a 100k body limit
const batch_limit = 50;

let latestPayload: KeystrokeStats = null;

export function clearLastSavedKeystrokeStats() {
    latestPayload = null;
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

export async function getLastSavedKeystrokesStats() {
    const dataFile = getSoftwareDataStoreFile();
    try {
        if (fs.existsSync(dataFile)) {
            const currentPayloads = getFileDataPayloadsAsJson(dataFile);
            if (currentPayloads && currentPayloads.length) {
                // sort in descending order
                currentPayloads.sort(
                    (a: KeystrokeStats, b: KeystrokeStats) => b.start - a.start
                );
                latestPayload = currentPayloads[0];
            }
        }
    } catch (e) {
        logIt(`Error fetching last payload: ${e.message}`);
    }
    // returns one in memory if not found in file
    return latestPayload;
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
