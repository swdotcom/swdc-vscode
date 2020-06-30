import { getSoftwareDir, isWindows, getFileDataAsJson } from "../Util";

const fileIt = require("file-it");

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
export function getFileChangeSummaryAsJson(): any {
    let fileChangeInfoMap = getFileDataAsJson(getFileChangeSummaryFile());
    if (!fileChangeInfoMap) {
        fileChangeInfoMap = {};
    }
    return fileChangeInfoMap;
}

export function saveFileChangeInfoToDisk(fileChangeInfoData) {
    const file = getFileChangeSummaryFile();
    if (fileChangeInfoData) {
        fileIt.writeJsonFileSync(file, fileChangeInfoData, { spaces: 4 });
    }
}
