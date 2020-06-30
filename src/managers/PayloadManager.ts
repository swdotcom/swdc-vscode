import { getSoftwareDataStoreFile } from "../Util";
import KeystrokeStats from "../model/KeystrokeStats";

const fileIt = require("file-it");

/**
 * this should only be called if there's file data in the source
 * @param payload
 */
export async function storePayload(payload: KeystrokeStats) {
    // store the payload into the data.json file
    fileIt.appendJsonFileSync(getSoftwareDataStoreFile(), payload);
}
