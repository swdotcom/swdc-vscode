import { isResponseOk, softwareGet } from "../http/HttpClient";
import { getItem } from "../Util";

let initializedCache = false;
let teams = [];

export async function getTeams() {
  initializedCache = true;
  teams = [];
  const resp = await softwareGet("/v1/organizations", getItem("jwt"));
  if (isResponseOk(resp)) {
    const orgs = resp.data;
    if (orgs?.length) {
      orgs.forEach((org) => {
        org.teams.forEach((team) => {
          teams.push({
            ...team,
            org_name: org.name,
            org_id: org.id,
          });
        });
      });
    }
  }
  return teams;
}

export async function getCachedTeams() {
  if (!initializedCache) {
    return getTeams();
  }
  return teams;
}
