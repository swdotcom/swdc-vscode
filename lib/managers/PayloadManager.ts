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
import { getTimeDataSummaryFile } from "../storage/TimeDataSummary";

const fs = require("fs");

const eventHandler: EventManager = EventManager.getInstance();
// batch offline payloads in 50. backend has a 100k body limit
const batch_limit = 50;

export class PayloadManager {
    private static instance: PayloadManager;

    constructor() {}

    static getInstance(): PayloadManager {
        if (!PayloadManager.instance) {
            PayloadManager.instance = new PayloadManager();
        }

        return PayloadManager.instance;
    }

    /**
     * send the offline TimeData payloads
     */
    async sendOfflineTimeData() {
        this.batchSendArrayData("/data/time", getTimeDataSummaryFile());
    }

    /**
     * send the offline Event payloads
     */
    async sendOfflineEvents() {
        this.batchSendData("/data/event", getPluginEventsFile());
    }

    /**
     * send the offline data.
     */
    async sendOfflineData() {
        this.batchSendData("/data/batch", getSoftwareDataStoreFile());
    }

    /**
     * batch send array data
     * @param api
     * @param file
     */
    async batchSendArrayData(api, file) {
        let isonline = await serverIsAvailable();
        if (!isonline) {
            return;
        }
        try {
            if (fs.existsSync(file)) {
                const payloads = getFileDataArray(file);
                this.batchSendPayloadData(api, file, payloads);
            }
        } catch (e) {
            logIt(`Error batch sending payloads: ${e.message}`);
        }
    }

    async batchSendData(api, file) {
        let isonline = await serverIsAvailable();
        if (!isonline) {
            return;
        }
        try {
            if (fs.existsSync(file)) {
                const payloads = getFileDataPayloadsAsJson(file);
                this.batchSendPayloadData(api, file, payloads);
            }
        } catch (e) {
            logIt(`Error batch sending payloads: ${e.message}`);
        }
    }

    async batchSendPayloadData(api, file, payloads) {
        // we're online so just delete the file
        deleteFile(file);
        if (payloads && payloads.length > 0) {
            logEvent(`sending batch payloads: ${JSON.stringify(payloads)}`);

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
}
