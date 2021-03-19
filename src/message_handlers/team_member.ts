import { commands } from "vscode";

export async function handleTeamMemberSocketEvent(body: any) {
  // status = created | invited | accepted | active | inactive (left the team)
  // action = add, update, remove
  const { status, action } = body;
  console.debug("[CodeTime] Received team member event", status, action);

  if (status === "active" || status === "inactive") {
    commands.executeCommand("codetime.reloadTeams");
  }
}
