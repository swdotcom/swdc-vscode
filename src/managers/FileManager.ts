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
    isBatchSizeUnderThreshold,
} from "../Util";
import {
    getTimeDataSummaryFile,
    clearTimeDataSummary,
} from "../storage/TimeSummaryData";
import KeystrokeStats from "../model/KeystrokeStats";

const fs = require("fs");

// each file within the plugin data is about 1 to 2kb. the queue
// size limit is 256k. we should be able to safely send 50
// at a time, but the batch logic should check the size as well
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
export async function sendOfflineData() {
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
        // try to get the last paylaod from the file first (data.json)
        if (fs.existsSync(dataFile)) {
            const currentPayloads = getFileDataPayloadsAsJson(dataFile);
            if (currentPayloads && currentPayloads.length) {
                // sort in descending order
                currentPayloads.sort(
                    (a: KeystrokeStats, b: KeystrokeStats) => b.start - a.start
                );
                // get the 1st element
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
        // Check to see if these payloads are the plugin payloads.
        // If so, check to see how many files are in each. We'll want to
        // break out the files into another payload if it exceeds what the
        // queue can handle in size, which is 256k. If it's not a plugin payload,
        // for example an event payload, then just make sure it's batched with
        // a limit of 100 or so to keep it under the 256k per POST request.

        logEvent(`sending batch payloads: ${JSON.stringify(payloads)}`);

        // send batch_limit at a time
        let batch = [];
        for (let i = 0; i < payloads.length; i++) {
            if (batch.length >= batch_limit) {
                const resp = await processBatch(api, batch);
                if (!resp) {
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
            const resp = await processBatch(api, batch);
            if (!resp) {
                // there was a problem with the transmission.
                // bail out so we don't delete the offline data
                return;
            }
        }
    }

    // we're online so just delete the file
    deleteFile(file);
}

async function processBatch(api, batch) {
    const batchInfo = Buffer.byteLength(JSON.stringify(batch));
    // check if the batch data too large (256k is the max size but we'll use 250k)
    const isLargeFile = batchInfo >= 250000 ? true : false;
    if (isLargeFile) {
        // break these into their own batch size
        let newBatch = [];
        for (let x = 0; x < batch.length; x++) {
            const batchPayload = batch[x];

            // process the plugin data payloads one way
            if (batchPayload.source) {
                // plugin data payload
                const keys = Object.keys(batchPayload.source);
                if (keys && keys.length) {
                    const sourceData = batchPayload.source;
                    delete batchPayload.source;

                    let newSource = {};

                    for (let y = 0; y < keys.length; y++) {
                        const fileName = keys[y];
                        if (Object.keys(newSource).length >= batch_limit) {
                            const newPayload = {
                                ...batchPayload,
                                source: newSource,
                            };
                            newBatch.push(newPayload);
                            // send the current new batch
                            const resp = await sendBatchPayload(api, newBatch);
                            if (!isResponseOk(resp)) {
                                // there was a problem with the transmission.
                                // bail out so we don't delete the offline data
                                return false;
                            }
                            newSource = {};
                            // clear the array
                            newBatch = [];
                        }
                        newSource[fileName] = {
                            ...sourceData[fileName],
                        };
                    }

                    // process the remaining keys
                    if (Object.keys(newSource).length) {
                        const newPayload = {
                            ...batchPayload,
                            source: newSource,
                        };
                        newBatch.push(newPayload);
                        const resp = await sendBatchPayload(api, newBatch);
                        if (!isResponseOk(resp)) {
                            // there was a problem with the transmission.
                            // bail out so we don't delete the offline data
                            return false;
                        }
                        // clear the array
                        newBatch = [];
                    }
                }
            } else {
                // process non-plugin data payloads another way
                if (newBatch.length) {
                    if (!isBatchSizeUnderThreshold(newBatch)) {
                        const resp = await sendBatchPayload(api, newBatch);
                        if (!isResponseOk(resp)) {
                            // there was a problem with the transmission.
                            // bail out so we don't delete the offline data
                            return false;
                        }
                        // clear the array
                        newBatch = [];
                    }
                }

                newBatch.push(batchPayload);
            }
        }

        // send any remaining
        if (newBatch.length) {
            const resp = await sendBatchPayload(api, newBatch);
            if (!isResponseOk(resp)) {
                // there was a problem with the transmission.
                // bail out so we don't delete the offline data
                return false;
            }
        }
    } else {
        // the batch size is within bounds, send it off
        const resp = await sendBatchPayload(api, batch);
        if (!isResponseOk(resp)) {
            // there was a problem with the transmission.
            // bail out so we don't delete the offline data
            return false;
        }
    }
    return true;
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

export async function storeJsonData(fileName, data) {
    try {
        const content = JSON.stringify(data, null, 4);
        fs.writeFileSync(fileName, content, (err) => {
            if (err) logIt(`Error writing time data: ${err.message}`);
        });
    } catch (e) {
        //
    }
}
