import { getItem, setItem } from "../Util";
import { getSessionSummaryFileAsJson, saveSessionSummaryToDisk } from "../storage/SessionSummaryData";
import { updateStatusBarWithSummaryData } from "./StatusBarManager";
import { softwareGet, isResponseOk } from "../http/HttpClient";
import { SessionSummary } from "../model/models";
import { commands } from "vscode";
import { format } from "date-fns";

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
    const jwt = getItem("jwt");

    const result = await softwareGet(`/sessions/summary`, jwt);
    const nowDay = format(new Date(), "MM/dd/yyyy");
    setItem("updatedTreeDate", nowDay);
    if (isResponseOk(result) && result.data) {
      const summary: SessionSummary = result.data;
      this.updateCurrentDayStats(summary);
    }

    // update the code time metrics tree views
    commands.executeCommand("codetime.refreshCodeTimeView");
  }

  updateCurrentDayStats(summary: SessionSummary) {
    saveSessionSummaryToDisk(summary);

    updateStatusBarWithSummaryData();
  }
}
