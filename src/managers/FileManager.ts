const fileIt = require("file-it");

// Synchronous file handling methods via "file-it"

export function storeJsonData(file, data) {
  fileIt.writeJsonFileSync(file, data);
}

export function storeContentData(file, content) {
  fileIt.writeContentFileSync(file, content);
}

export function setJsonItem(file, key, value) {
  fileIt.setJsonValue(file, key, value);
}

export function getJsonItem(file, key) {
  return fileIt.getJsonValue(file, key);
}

export function getFileDataAsJson(file) {
  try {
    return fileIt.readJsonFileSync(file);
  } catch (e) {
    return null;
  }
}

export function getFileDataArray(file) {
  return fileIt.readJsonArraySync(file);
}

export function appendJsonData(file, data) {
  fileIt.appendJsonFileSync(file, data);
}
