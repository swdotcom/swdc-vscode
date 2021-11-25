import { logIt } from '../Util';

const fs = require('fs');

export function getJsonItem(file: string, key: string) {
  const data: any = getFileDataAsJson(file);
  return data ? data[key] : null;
}

export function setJsonItem(file: string, key: string, value: any) {
  let json: any = getFileDataAsJson(file);
  if (!json) {
    json = {};
  }
  json[key] = value;
  storeJsonData(file, json);
}

export function getFileDataAsJson(filePath: string): any {
  const content: string = fs.readFileSync(filePath, { encoding: 'utf8' });
  try {
    return JSON.parse(content);
  } catch (e: any) {
    logIt(`Unable to read session info: ${e.message}`, true);
  }
  return null;
}

export function storeJsonData(filePath: string, json: any) {
  try {
    const content: string = JSON.stringify(json);
    fs.writeFileSync(filePath, content, { encoding: 'utf8' });
  } catch (e: any) {
    logIt(`Unable to write session info: ${e.message}`, true);
  }
}
