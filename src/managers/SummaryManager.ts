import {getItem} from '../Util';
import {saveSessionSummaryToDisk} from '../storage/SessionSummaryData';
import {updateStatusBarWithSummaryData} from './StatusBarManager';
import {softwareGet, isResponseOk} from '../http/HttpClient';
import {SessionSummary} from '../model/models';
import {commands} from 'vscode';

export class SummaryManager {
  private static instance: SummaryManager;

  constructor() {
    //
  }

  static getInstance(): SummaryManager {
    if (!SummaryManager.instance) {
      SummaryManager.instance = new SummaryManager();
    }

    return SummaryManager.instance;
  }

  /**
   * This is only called from the new day checker
   */
  async updateSessionSummaryFromServer() {
    const jwt = getItem('jwt');

    const result = await softwareGet(`/sessions/summary`, jwt);
    if (isResponseOk(result) && result.data) {
      const summary: SessionSummary = result.data;
      if (summary) {
        saveSessionSummaryToDisk(summary);
        this.updateCurrentDayStats(summary);
      }
    }

    // update the code time metrics tree views
    commands.executeCommand('codetime.refreshCodeTimeView');
  }

  updateCurrentDayStats(summary: SessionSummary) {
    if (summary) {
      saveSessionSummaryToDisk(summary);
    }
    updateStatusBarWithSummaryData();
  }
}
