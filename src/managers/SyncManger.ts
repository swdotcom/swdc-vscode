import { getSessionSummaryFile } from "../Util";
import { updateStatusBarWithSummaryData } from "./StatusBarManager";
import { getSessionSummaryFileAsJson } from "../storage/SessionSummaryData";
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
    // make sure the file exists
    getSessionSummaryFileAsJson();

    // fs.watch replaces fs.watchFile and fs.unwatchFile
    fs.watch(getSessionSummaryFile(), (curr, prev) => {
      if (curr === "change") {
        updateStatusBarWithSummaryData();
      }
    });
  }
}
