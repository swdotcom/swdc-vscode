import { isResponseOk, softwareGet } from "../http/HttpClient";
import { getItem } from "../Util";

let initializedCache = false;
let teams = [];

export async function buildTeams() {
  initializedCache = true;
  const resp = await softwareGet("/v1/organizations", getItem("jwt"));
  // synchronized team gathering
  teams = isResponseOk(resp) ? await gatherTeamsFromOrgs(resp.data) : [];
}

export async function getCachedTeams() {
  if (!initializedCache) {
    await buildTeams();
  }
  return teams;
}

async function gatherTeamsFromOrgs(orgs) {
  let org_teams = [];

  if (orgs?.length) {
    orgs.forEach((org) => {
      // add every team from each org
      org.teams?.forEach((team) => {
        org_teams.push({
          ...team,
          org_name: org.name,
          org_id: org.id,
        });
      });
    });
  }
  return org_teams;
}
