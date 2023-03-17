import { getFileNameFromPath, getSoftwareSessionFile, logIt } from '../Util';
import { LocalStorageManager } from './LocalStorageManager';

const fs = require('fs');
const path = require('path');

let storageMgr: LocalStorageManager | undefined = undefined;

export function setSessionStorageManager(storageManager: LocalStorageManager) {
  storageMgr = storageManager;

  // convert old storage to new storage if needed
  if (!storageMgr?.getValue('session_jwt')) {
    const sessionJson = getFileDataAsJson(getSoftwareSessionFile());
    // set a closure storage var
    const storage = storageMgr;
    if (sessionJson) {
      Object.keys(sessionJson).forEach((key: string) => {
        storage?.setValue(`session_${key}`, sessionJson[key]);
      });
    }
  }
}

export function getBooleanJsonItem(file: string, key: string) {
  const value = getJsonItem(file, key);
  try {
    return !!JSON.parse(value);
  } catch (e) {
    return false;
  }
}

export function getJsonItem(file: string, key: string) {
  return storageMgr?.getValue(`${getFileNameFromPath(file)}_${key}`) || '';
}

export function setJsonItem(file: string, key: string, value: any) {
  const new_key = `${getFileNameFromPath(file)}_${key}`;
  storageMgr?.setValue(new_key, value);
}

export function getFileDataAsJson(filePath: string): any {
  try {
    let content: string = fs.readFileSync(filePath, 'utf8')?.trim();
    return JSON.parse(content);
  } catch (e: any) {
    logIt(`Unable to read ${getBaseName(filePath)} info: ${e.message}`, true);
  }
  return null;
}

/**
 * Single place to write json data (json obj or json array)
 * @param filePath
 * @param json
 */
export function storeJsonData(filePath: string, json: any) {
  try {
    const content: string = JSON.stringify(json);
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (e: any) {
    logIt(`Unable to write ${getBaseName(filePath)} info: ${e.message}`, true);
  }
}

function getBaseName(filePath: string) {
  let baseName = filePath;
  try { baseName = path.basename(filePath); } catch (e: any) {}
  return baseName;
}
