import { isResponseOk, softwareGet } from "../http/HttpClient";
import { getItem } from "../Util";

let initializedCache = false;
let teams = [];

export async function buildTeams() {
  initializedCache = true;
  const resp = await softwareGet("/v1/organizations", getItem("jwt"));
  let org_teams = [];
  if (isResponseOk(resp)) {
    const orgs = resp.data;
    if (orgs?.length) {
      orgs.forEach((org) => {
        org_teams = org.teams.map((team) => {
          return {
            ...team,
            org_name: org.name,
            org_id: org.id,
          };
        });
      });
    }
  }
  // update the teams list
  teams = org_teams;
}

export async function getCachedTeams() {
  if (!initializedCache) {
    await buildTeams();
  }
  return teams;
}
