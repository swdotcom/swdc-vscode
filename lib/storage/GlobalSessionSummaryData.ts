import { getSoftwareDir, isWindows, logIt, getFileDataAsJson } from "../Util";
import { CacheManager } from "../cache/CacheManager";
import { GlobalSessionSummary } from "../model/models";
const fs = require("fs");

const cacheMgr: CacheManager = CacheManager.getInstance();

export function getGlobalSessionSummaryFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\globalSessionSummary.json";
    } else {
        file += "/globalSessionSummary.json";
    }
    return file;
}

export function clearGlobalSessionSummaryData() {
    const globalSessionSummary: GlobalSessionSummary = new GlobalSessionSummary();
    saveGlobalSessionSummaryToDisk(globalSessionSummary);
}

export function getGlobalSessionSummaryData(): GlobalSessionSummary {
    // let fileChangeInfoMap = cacheMgr.get("sessionSummary");
    let globalSessionSummaryData = getGlobalSessionSummaryFileAsJson();
    // make sure it's a valid structure
    if (!globalSessionSummaryData) {
        // set the defaults
        globalSessionSummaryData = new GlobalSessionSummary();
    }
    return globalSessionSummaryData;
}

export function getGlobalSessionSummaryFileAsJson(): GlobalSessionSummary {
    const file = getGlobalSessionSummaryFile();
    return getFileDataAsJson(file);
}

export function saveGlobalSessionSummaryToDisk(globalSessionSummaryData) {
    const file = getGlobalSessionSummaryFile();
    try {
        const content = JSON.stringify(globalSessionSummaryData, null, 4);
        fs.writeFileSync(file, content, err => {
            if (err)
                logIt(
                    `Deployer: Error writing session summary data: ${err.message}`
                );
        });
        // update the cache
        if (globalSessionSummaryData) {
            cacheMgr.set("globalSessionSummary", globalSessionSummaryData);
        }
    } catch (e) {
        //
    }
}
