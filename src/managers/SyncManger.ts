import {getSessionSummaryFile} from '../Util';
import {updateStatusBarWithSummaryData} from './StatusBarManager';
import {getSessionSummaryFileAsJson} from '../storage/SessionSummaryData';
const fs = require('fs');
export class SyncManager {
  private static _instance: SyncManager;

  private last_time_synced: number | undefined = undefined;
  private one_min: number = 1000 * 60;

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
    fs.watch(getSessionSummaryFile(), (curr: any, prev: any) => {
      if (curr === 'change') {
        const now_in_millis: number = new Date().valueOf();
        // prevent rapid session summary change issues
        if (!this.last_time_synced || now_in_millis - this.last_time_synced > this.one_min) {
          this.last_time_synced = now_in_millis;
          updateStatusBarWithSummaryData();
        }
      }
    });
  }
}
