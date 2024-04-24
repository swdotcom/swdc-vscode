import { getFileNameFromPath, logIt } from '../Util';
import { LocalStorageManager } from './LocalStorageManager';

const fs = require('fs');
const path = require('path');

let storageMgr: LocalStorageManager | undefined = undefined;

function getStorageManager() {
  if (!storageMgr) {
    storageMgr = LocalStorageManager.getCachedStorageManager()
  }
  return storageMgr
}

export function getBooleanJsonItem(file: string, key: string) {
  const value = getJsonItem(file, key);
  try {
    return !!JSON.parse(value);
  } catch (e) {
    return false;
  }
}

export function getJsonItem(file: string, key: string, defaultValue: any = '') {
  return getStorageManager()?.getValue(`${getFileNameFromPath(file)}_${key}`) || defaultValue;
}

export function setJsonItem(file: string, key: string, value: any) {
  getStorageManager()?.setValue(`${getFileNameFromPath(file)}_${key}`, value);
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
