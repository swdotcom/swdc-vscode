import { isResponseOk, softwareGet } from "../http/HttpClient";
import { getItem } from "../Util";

let initializedCache = false;
let cachedTeams = [];

export async function getTeams() {
  initializedCache = true;
  cachedTeams = [];
  const resp = await softwareGet("/teams", getItem("jwt"));
  if (isResponseOk(resp)) {
    cachedTeams = resp.data;
  }
  return cachedTeams;
}

export async function getCachedTeams() {
  if (!initializedCache) {
    return getTeams();
  }
  return cachedTeams;
}
