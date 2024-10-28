import {getFlowChangeFile, isFlowModeEnabled} from '../Util';
import {updateFlowModeStatusBar} from './StatusBarManager';
import { isInFlowLocally, updateInFlowLocally } from './FlowManager';
import { commands } from 'vscode';

import * as fs from 'fs';


export class SyncManager {
  private static _instance: SyncManager;

  static getInstance(): SyncManager {
    if (!SyncManager._instance) {
      SyncManager._instance = new SyncManager();
    }

    return SyncManager._instance;
  }

  constructor() {
    // make sure the flow change file exists
    getFlowChangeFile();

    // flowChange.json watch
    fs.watch(getFlowChangeFile(), (curr: any, prev: any) => {
      const currFlowState = isFlowModeEnabled();
      if (curr === 'change' && isInFlowLocally() !== currFlowState) {
        updateInFlowLocally(currFlowState);
        // update the status bar
        updateFlowModeStatusBar();
        // update the sidebar
        commands.executeCommand('codetime.refreshCodeTimeView');
      }
    });
  }
}
