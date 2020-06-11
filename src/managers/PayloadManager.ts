import { getSoftwareDataStoreFile, logIt } from "../Util";
import KeystrokeStats from "../model/KeystrokeStats";

const os = require("os");
const fs = require("fs");
const path = require("path");

export async function processPayload(payload: KeystrokeStats, sendNow = false) {
    //
}

/**
 * this should only be called if there's file data in the source
 * @param payload
 */
export async function storePayload(payload: KeystrokeStats) {
    // store the payload into the data.json file
    fs.appendFileSync(
        getSoftwareDataStoreFile(),
        JSON.stringify(payload) + os.EOL,
        (err) => {
            if (err)
                logIt(
                    `Error appending to the Software data store file: ${err.message}`
                );
        }
    );
}
