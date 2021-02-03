import { getItem, setItem } from "../Util";
import { getSessionSummaryFileAsJson, saveSessionSummaryToDisk } from "../storage/SessionSummaryData";
import { updateSessionAndEditorTime } from "../storage/TimeSummaryData";
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
      const existingSummary: SessionSummary = getSessionSummaryFileAsJson();
      const summary: SessionSummary = result.data;

      // update summary current day values with the existing current day values
      summary.currentDayKeystrokes = Math.max(summary.currentDayKeystrokes, existingSummary.currentDayKeystrokes);
      summary.currentDayKpm = Math.max(summary.currentDayKpm, existingSummary.currentDayKpm);
      summary.currentDayLinesAdded = Math.max(summary.currentDayLinesAdded, existingSummary.currentDayLinesAdded);
      summary.currentDayLinesRemoved = Math.max(summary.currentDayLinesRemoved, existingSummary.currentDayLinesRemoved);
      summary.currentDayMinutes = Math.max(summary.currentDayMinutes, existingSummary.currentDayMinutes);

      updateSessionAndEditorTime(summary.currentDayMinutes);
      saveSessionSummaryToDisk(summary);
    }

    // update the code time metrics tree views
    commands.executeCommand("codetime.refreshKpmTree");
  }
}
