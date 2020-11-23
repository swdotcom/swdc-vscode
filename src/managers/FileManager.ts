import {
    getSoftwareDir,
    isWindows,
} from "../Util";
import KeystrokeStats from "../model/KeystrokeStats";

const fileIt = require("file-it");

let latestPayload: KeystrokeStats = null;

export function clearLastSavedKeystrokeStats() {
    latestPayload = null;
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
    storeJsonData(this.getCurrentPayloadFile(), payload);
}

export async function storeJsonData(fileName, data) {
    fileIt.writeJsonFileSync(fileName, data);
}
