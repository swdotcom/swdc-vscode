import { getItem, getOsUsername, getHostname, setItem, getPluginUuid, getAuthCallbackState, setAuthCallbackState, getNowTimes } from "../Util";
import { softwarePost, isResponseOk } from "../http/HttpClient";
import { showQuickPick } from "./MenuManager";
import { LOGIN_LABEL, SIGN_UP_LABEL } from "../Constants";
import jwt_decode = require("jwt-decode");

const switchAccountItem = {
  label: "Switch to a different account?",
  detail: "Click to link to a different account.",
};

export async function showSwitchAccountsMenu() {
  accountMenuSelection(switchAccountItem);
}

export async function showExistingAccountMenu() {
  showLogInMenuOptions();
}

export async function showSignUpAccountMenu() {
  showSignUpMenuOptions();
}

async function accountMenuSelection(placeholderItem: any) {
  const items = [];

  let placeholder = "";
  const name = getItem("name");
  if (name) {
    const authType = getItem("authType");
    let type = "email";
    if (authType === "google") {
      type = "Google";
    } else if (authType === "github") {
      type = "GitHub";
    }
    placeholder = `Connected using ${type} (${name})`;
  } else {
    placeholder = "Connect using one of the following";
  }

  if (placeholderItem) {
    items.push(placeholderItem);
  }
  const menuOptions = {
    items,
    placeholder,
  };
  const selection = await showQuickPick(menuOptions);
  if (selection) {
    // show the google, github, email menu options
    showLogInMenuOptions();
  }
}

function showLogInMenuOptions() {
  showAuthMenuOptions(LOGIN_LABEL, false /*isSignup*/);
}

function showSignUpMenuOptions() {
  showAuthMenuOptions(SIGN_UP_LABEL, true /*isSignup*/);
}

function showAuthMenuOptions(authText: string, isSignup: boolean = true) {
  const items = [];
  const placeholder = `${authText} using...`;
  items.push({
    label: `${authText} with Google`,
    command: "codetime.googleLogin",
    commandArgs: [null /*KpmItem*/, true /*switching_account*/],
  });
  items.push({
    label: `${authText} with GitHub`,
    command: "codetime.githubLogin",
    commandArgs: [null /*KpmItem*/, true /*switching_account*/],
  });
  if (isSignup) {
    items.push({
      label: `${authText} with Email`,
      command: "codetime.codeTimeSignup",
      commandArgs: [null /*KpmItem*/, true /*switching_account*/],
    });
  } else {
    items.push({
      label: `${authText} with Email`,
      command: "codetime.codeTimeLogin",
      commandArgs: [null /*KpmItem*/, true /*switching_account*/],
    });
  }
  const menuOptions = {
    items,
    placeholder,
  };
  showQuickPick(menuOptions);
}

/**
 * create an anonymous user based on github email or mac addr
 */
export async function createAnonymousUser(ignoreJwt: boolean = false): Promise<string> {
  const jwt = getItem("jwt");
  // check one more time before creating the anon user
  if (!jwt || ignoreJwt) {
    // this should not be undefined if its an account reset
    let plugin_uuid = getPluginUuid();
    let auth_callback_state = getAuthCallbackState();
    const username = await getOsUsername();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hostname = await getHostname();

    const resp = await softwarePost("/plugins/onboard", {
      timezone,
      username,
      plugin_uuid,
      hostname,
      auth_callback_state,
    });
    if (isResponseOk(resp) && resp.data && resp.data.jwt) {
      setItem("jwt", resp.data.jwt);
      if (!resp.data.user.registered) {
        setItem("name", null);
      }
      setItem("switching_account", false);
      setAuthCallbackState(null);
      return resp.data.jwt;
    }
  }

  return null;
}

export function getDecodedUserIdFromJwt(jwt) {
  try {
    if (jwt && jwt.includes("JWT")) {
      return jwt_decode(jwt.split("JWT")[1])["id"];
    }
  } catch (e) {}
  return -1;
}
