import { getFileNameFromPath, getSoftwareSessionFile, isWindows, logIt } from '../Util';
import { LocalStorageManager } from './LocalStorageManager';

const fs = require('fs');
const path = require('path');

let storageMgr: LocalStorageManager | undefined = undefined;

export function setSessionStorageManager(storageManager: LocalStorageManager) {
  storageMgr = storageManager;

  // convert old storage to new storage if needed
  if (storageMgr && !storageManager.getValue('session_jwt')) {
    const sessionJson = getFileDataAsJson(getSoftwareSessionFile());
    // set a closure storage var
    const storage = storageMgr;
    if (sessionJson) {
      Object.keys(sessionJson).forEach((key: string) => {
        storage.setValue(`session_${key}`, sessionJson[key]);
      });
    }
  }
}

export function getJsonItem(file: string, key: string) {
  if (storageMgr) {
    try {
      return storageMgr.getValue(`${getFileNameFromPath(file)}_${key}`);
    } catch (e) {
      return getJsonItemForFile(file, key);
    }
  } else {
    return getJsonItemForFile(file, key);
  }
}

export function setJsonItem(file: string, key: string, value: any) {
  if (storageMgr) {
    try {
      const new_key = `${getFileNameFromPath(file)}_${key}`;
      storageMgr.setValue(new_key, value);
    } catch (e) {
      setJsonItemForFile(file, key, value);
    }
  } else {
    setJsonItemForFile(file, key, value);
  }
}

function getJsonItemForFile(file: string, key: string) {
  const data: any = getFileDataAsJson(file);
  return data ? data[key] : null;
}

function setJsonItemForFile(file: string, key: string, value: any) {
  let json: any = getFileDataAsJson(file);
    if (!json) {
      json = {};
    }
    json[key] = value;
    storeJsonData(file, json);
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
