import {getFlowChangeFile, getSessionSummaryFile, isPrimaryWindow} from '../Util';
import {updateFlowModeStatusBar, updateStatusBarWithSummaryData} from './StatusBarManager';
import {getSessionSummaryFileAsJson} from '../storage/SessionSummaryData';

const fs = require('fs');

const thirty_seconds: number = 1000 * 30;
let last_time_stats_synced: number = 0;
let last_time_flow_synced: number = 0;

export function passedThreshold(now_in_millis: number, synced_val: number) {
  if (!synced_val || now_in_millis - synced_val > thirty_seconds) {
    return true;
  }
  return false;
}

export class SyncManager {
  private static _instance: SyncManager;

  static getInstance(): SyncManager {
    if (!SyncManager._instance) {
      SyncManager._instance = new SyncManager();
    }

    return SyncManager._instance;
  }

  constructor() {
    // make sure the session file exists
    getSessionSummaryFileAsJson();

    // make sure the flow change file exists
    getFlowChangeFile();

    // session.json watch
    fs.watch(getSessionSummaryFile(), (curr: any, prev: any) => {
      // if there's a change and it's not the primary window, process
      if (curr === 'change' && !isPrimaryWindow()) {
        // prevent rapid session summary change issues
        const now_in_millis: number = new Date().valueOf();
        if (passedThreshold(now_in_millis, last_time_stats_synced)) {
          last_time_stats_synced = now_in_millis;
          updateStatusBarWithSummaryData();
        }
      }
    });

    // flowChange.json watch
    fs.watch(getFlowChangeFile(), (curr: any, prev: any) => {
      // if there's a change and it's not the primary window, process
      if (curr === 'change' && !isPrimaryWindow()) {
        // prevent rapid session summary change issues
        const now_in_millis: number = new Date().valueOf();
        if (passedThreshold(now_in_millis, last_time_flow_synced)) {
          last_time_flow_synced = now_in_millis;
          updateFlowModeStatusBar();
        }
      }
    });
  }
}
