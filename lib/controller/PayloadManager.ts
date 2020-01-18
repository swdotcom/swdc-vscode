import { serverIsAvailable } from "../http/HttpClient";
import {
    getSoftwareDataStoreFile,
    deleteFile,
    logEvent,
    getPluginEventsFile
} from "../Util";
import { EventHandler } from "../event/EventHandler";

const fs = require("fs");

const eventHandler: EventHandler = EventHandler.getInstance();
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

    async sendOfflineEvents() {
        let isonline = await serverIsAvailable();
        if (!isonline) {
            return;
        }
        const eventsFile = getPluginEventsFile();
    }

    /**
     * send the offline data
     */
    async sendOfflineData() {
        let isonline = await serverIsAvailable();
        if (!isonline) {
            return;
        }
        const dataStoreFile = getSoftwareDataStoreFile();
        try {
            if (fs.existsSync(dataStoreFile)) {
                const content = fs.readFileSync(dataStoreFile).toString();
                // we're online so just delete the datastore file
                deleteFile(getSoftwareDataStoreFile());
                if (content) {
                    logEvent(`sending batch payloads: ${content}`);
                    const payloads = content
                        .split(/\r?\n/)
                        .map(item => {
                            let obj = null;
                            if (item) {
                                try {
                                    obj = JSON.parse(item);
                                } catch (e) {
                                    //
                                }
                            }
                            if (obj) {
                                return obj;
                            }
                        })
                        .filter(item => item);

                    // send 50 at a time
                    let batch = [];
                    for (let i = 0; i < payloads.length; i++) {
                        if (batch.length >= batch_limit) {
                            await eventHandler.sendBatchPayload(batch);
                            batch = [];
                        }
                        batch.push(payloads[i]);
                    }
                    if (batch.length > 0) {
                        await eventHandler.sendBatchPayload(batch);
                    }
                }
            }
        } catch (e) {
            //
        }
    }
}
