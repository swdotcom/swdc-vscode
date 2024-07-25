import { authenticationCompleteHandler } from "../DataController";

export async function handleAuthenticatedPluginUser(user: any) {
  authenticationCompleteHandler(user);
}
