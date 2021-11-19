import {SessionSummary} from '../model/models';
import {getItem, getSessionSummaryFile} from '../Util';
import {DEFAULT_SESSION_THRESHOLD_SECONDS} from '../Constants';
import {getFileDataAsJson, storeJsonData} from '../managers/FileManager';

export function getSessionThresholdSeconds() {
  const thresholdSeconds = getItem('sessionThresholdInSec') || DEFAULT_SESSION_THRESHOLD_SECONDS;
  return thresholdSeconds;
}

export function clearSessionSummaryData() {
  const sessionSummaryData = new SessionSummary();
  saveSessionSummaryToDisk(sessionSummaryData);
}

export function getSessionSummaryData(): SessionSummary {
  let sessionSummaryData = getSessionSummaryFileAsJson();
  // make sure it's a valid structure
  if (!sessionSummaryData) {
    // set the defaults
    sessionSummaryData = new SessionSummary();
  }
  // fill in missing attributes
  sessionSummaryData = coalesceMissingAttributes(sessionSummaryData);
  return sessionSummaryData;
}

function coalesceMissingAttributes(data: any): SessionSummary {
  // ensure all attributes are defined
  const template: SessionSummary = new SessionSummary();
  Object.keys(template).forEach((key) => {
    if (!data[key]) {
      data[key] = 0;
    }
  });
  return data;
}

export function getSessionSummaryFileAsJson(): SessionSummary {
  const file = getSessionSummaryFile();
  let sessionSummary = getFileDataAsJson(file);
  if (!sessionSummary) {
    sessionSummary = new SessionSummary();
    saveSessionSummaryToDisk(sessionSummary);
  }
  return sessionSummary;
}

export function saveSessionSummaryToDisk(sessionSummaryData: any) {
  const file = getSessionSummaryFile();
  storeJsonData(file, sessionSummaryData);
}
