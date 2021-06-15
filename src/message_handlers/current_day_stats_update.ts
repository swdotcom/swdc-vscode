import { SummaryManager } from "../managers/SummaryManager";

// { user_id: row["USER_ID"], data: SessionSummary, action: "update" }
export async function handleCurrentDayStatsUpdate(currentDayStatsInfo) {
  if (currentDayStatsInfo.data) {
    // update the session summary data
    SummaryManager.getInstance().updateCurrentDayStats(currentDayStatsInfo.data);
  }
}
