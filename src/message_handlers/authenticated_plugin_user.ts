import { authenticationCompleteHandler } from "../DataController";

export async function handleAuthenticatedPluginUser(user: any) {
  console.debug("[CodeTime] Received authenticated plugin user message", user);

  authenticationCompleteHandler(user);
}
