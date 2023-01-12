import {saveSessionSummaryToDisk} from '../storage/SessionSummaryData';
import {updateStatusBarWithSummaryData} from './StatusBarManager';
import {isResponseOk, appGet} from '../http/HttpClient';
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
    const result = await appGet('/api/v1/user/session_summary');
    if (isResponseOk(result) && result.data) {
      const summary: SessionSummary = result.data;
      if (summary) {
        saveSessionSummaryToDisk(summary);
        this.updateCurrentDayStats(summary);
      }
    }
  }

  updateCurrentDayStats(summary: SessionSummary) {
    if (summary) {
      saveSessionSummaryToDisk(summary);
    }
    updateStatusBarWithSummaryData();
  }
}
