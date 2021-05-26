import { SessionSummary } from "../model/models";
import { getFileDataAsJson, getSessionSummaryFile } from "../Util";
import { updateStatusBarWithSummaryData } from "./StatusBarManager";
import { saveSessionSummaryToDisk } from "../storage/SessionSummaryData";
const fs = require("fs");

export class SyncManager {
  private static _instance: SyncManager;

  static getInstance(): SyncManager {
    if (!SyncManager._instance) {
      SyncManager._instance = new SyncManager();
    }

    return SyncManager._instance;
  }

  constructor() {
    const file = getSessionSummaryFile();

    // make sure the file exists before we start listening to it
    let sessionSummary = getFileDataAsJson(file);
    if (!sessionSummary) {
      sessionSummary = new SessionSummary();
      saveSessionSummaryToDisk(sessionSummary);
    }
    // fs.watch replaces fs.watchFile and fs.unwatchFile
    fs.watch(file, (curr, prev) => {
      if (curr === "change") {
        updateStatusBarWithSummaryData();
      }
    });
  }
}
