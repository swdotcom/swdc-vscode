import { isResponseOk, softwareGet } from "../http/HttpClient";
import { getItem } from "../Util";

let lastUpdateTime = 0;
let cachedTeams = [];
let SIX_HOURS_MILLIS = 1000 * 60 * 60 * 6;

export async function getTeams(hardRefresh = false) {
  if (!getItem("name")) {
    // not registered yet
    return cachedTeams;
  }
  const now = new Date().getTime();

  // fetch if its over 6 hours or its a hard refresh
  if (now - lastUpdateTime > SIX_HOURS_MILLIS || hardRefresh) {
    if (!hardRefresh) {
      // don't update the last udpate time if its a hard refresh so the
      // webview can pickup on the cached data
      lastUpdateTime = now;
    }
    const resp = await softwareGet("/teams", getItem("jwt"));
    if (isResponseOk(resp)) {
      cachedTeams = resp.data;
    }
  }
  return cachedTeams;
}
