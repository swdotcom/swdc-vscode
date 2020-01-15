import { getSoftwareDir, isWindows, logIt, getFileDataAsJson } from "../Util";
import { CacheManager } from "../cache/CacheManager";
import { FileChangeInfo } from "../model/models";
const fs = require("fs");

const cacheMgr: CacheManager = CacheManager.getInstance();

export function getFileChangeSummaryFile() {
    let file = getSoftwareDir();
    if (isWindows()) {
        file += "\\fileChangeSummary.json";
    } else {
        file += "/fileChangeSummary.json";
    }
    return file;
}

export function clearFileChangeInfoSummaryData() {
    saveFileChangeInfoToDisk({});
}

// returns a map of file change info
// {fileName => FileChangeInfo, fileName => FileChangeInfo}
export function getFileChangeInfoMap(): any {
    let fileChangeInfoMap = cacheMgr.get("fileChangeSummary");
    if (!fileChangeInfoMap) {
        fileChangeInfoMap = getFileChangeSummaryFileAsJson();
        if (fileChangeInfoMap) {
            cacheMgr.set("fileChangeSummary", fileChangeInfoMap);
        }
    }
    return fileChangeInfoMap;
}

export function getFileChangeSummaryFileAsJson(): FileChangeInfo[] {
    const file = getFileChangeSummaryFile();
    return getFileDataAsJson(file);
}

export function saveFileChangeInfoToDisk(fileChangeInfoData) {
    const file = getFileChangeSummaryFile();
    if (fileChangeInfoData) {
        try {
            const content = JSON.stringify(fileChangeInfoData, null, 4);
            fs.writeFileSync(file, content, err => {
                if (err)
                    logIt(
                        `Deployer: Error writing session summary data: ${err.message}`
                    );
            });
            // update the cache
            if (fileChangeInfoData) {
                cacheMgr.set("fileChangeSummary", fileChangeInfoData);
            }
        } catch (e) {
            //
        }
    }
}
