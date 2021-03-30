import { authenticationCompleteHandler } from "../DataController";
import { updatedAuthAdded } from "../user/OnboardManager";

export async function handleAuthenticatedPluginUser(user: any) {
  updatedAuthAdded(true);
  authenticationCompleteHandler(user);
}
