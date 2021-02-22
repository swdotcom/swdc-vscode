import { isResponseOk, softwareGet } from "../http/HttpClient";
import { getItem } from "../Util";

let cachedTeams = [];
let lastUpdateTime = 0;
let TWO_HOURS_MILLIS = 1000 * 60 * 60 * 2;

export async function getTeams() {
  if (refreshTeamCache()) {
    cachedTeams = [];
  }
  if (cachedTeams.length) {
    return cachedTeams;
  }
  const resp = await softwareGet("/teams", getItem("jwt"));
  if (isResponseOk(resp)) {
    // id and name
    cachedTeams = resp.data;
  }
  return cachedTeams;
}

function refreshTeamCache() {
  const now = new Date().getTime();
  return !!(now - lastUpdateTime > TWO_HOURS_MILLIS);
}
