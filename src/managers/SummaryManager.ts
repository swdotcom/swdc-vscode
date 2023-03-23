import {updateStatusBarWithSummaryData} from './StatusBarManager';
import {isResponseOk, appGet} from '../http/HttpClient';
import { getSessionSummaryFile } from '../Util';
import { setJsonItem } from './FileManager';

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
      this.updateCurrentDayStats(result.data);
    }
  }

  updateCurrentDayStats(summary: any) {
    if (summary) {
      Object.keys(summary).forEach((key: string) => {
        setJsonItem(getSessionSummaryFile(), key, summary[key])
      });
    }
    updateStatusBarWithSummaryData();
  }
}
