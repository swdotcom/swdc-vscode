const fileIt = require('file-it');

// Synchronous file handling methods via "file-it"

export function storeJsonData(file: string, data: any) {
  fileIt.writeJsonFileSync(file, data);
}

export function storeContentData(file: string, content: any) {
  fileIt.writeContentFileSync(file, content);
}

export function setJsonItem(file: string, key: string, value: any) {
  fileIt.setJsonValue(file, key, value);
}

export function getJsonItem(file: string, key: string) {
  return fileIt.getJsonValue(file, key);
}

export function getFileDataAsJson(file: string) {
  try {
    return fileIt.readJsonFileSync(file);
  } catch (e) {
    return null;
  }
}

export function getFileDataArray(file: string) {
  return fileIt.readJsonArraySync(file);
}

export function appendJsonData(file: string, data: any) {
  fileIt.appendJsonFileSync(file, data);
}
