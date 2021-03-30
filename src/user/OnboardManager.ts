import { window, ExtensionContext } from "vscode";
import {
  showOfflinePrompt,
  getItem,
  setItem,
  getAuthCallbackState,
  getPluginType,
  getVersion,
  getPluginId,
  getPluginUuid,
  launchWebUrl,
} from "../Util";
import { isResponseOk, serverIsAvailable, softwareGet } from "../http/HttpClient";
import { createAnonymousUser } from "../menu/AccountManager";
import { authenticationCompleteHandler } from "../DataController";
import { api_endpoint, launch_url } from "../Constants";
const queryString = require("query-string");

let retry_counter = 0;
let authAdded = false;
const one_min_millis = 1000 * 60;

export function updatedAuthAdded(val: boolean) {
  authAdded = val;
}

export async function onboardInit(ctx: ExtensionContext, callback: any) {
  let jwt = getItem("jwt");

  const windowState = window.state;

  if (jwt) {
    await handleIncompleteAuth();
    // we have the jwt, call the callback that anon was not created
    return callback(ctx, false /*anonCreated*/);
  }

  if (windowState.focused) {
    // perform primary window related work
    primaryWindowOnboarding(ctx, callback);
  } else {
    // call the secondary onboarding logic
    secondaryWindowOnboarding(ctx, callback);
  }
}

async function primaryWindowOnboarding(ctx: ExtensionContext, callback: any) {
  let serverIsOnline = await serverIsAvailable();
  if (serverIsOnline) {
    // great, it's online, create the anon user
    const jwt = await createAnonymousUser();
    if (jwt) {
      // great, it worked. call the callback
      return callback(ctx, true /*anonCreated*/);
    }
    // else its some kind of server issue, try again in a minute
    serverIsOnline = false;
  }

  if (!serverIsOnline) {
    // not online, try again in a minute
    if (retry_counter === 0) {
      // show the prompt that we're unable connect to our app 1 time only
      showOfflinePrompt(true);
    }
    // call activate again later
    setTimeout(() => {
      retry_counter++;
      onboardInit(ctx, callback);
    }, one_min_millis * 2);
  }
}

/**
 * This is called if there's no JWT. If it reaches a
 * 6th call it will create an anon user.
 * @param ctx
 * @param callback
 */
async function secondaryWindowOnboarding(ctx: ExtensionContext, callback: any) {
  const serverIsOnline = await serverIsAvailable();
  if (!serverIsOnline) {
    // not online, try again later
    setTimeout(() => {
      onboardInit(ctx, callback);
    }, one_min_millis);
    return;
  } else if (retry_counter < 5) {
    if (serverIsOnline) {
      retry_counter++;
    }
    // call activate again in about 15 seconds
    setTimeout(() => {
      onboardInit(ctx, callback);
    }, 1000 * 15);
    return;
  }

  // tried enough times, create an anon user
  await createAnonymousUser();
  // call the callback
  return callback(ctx, true /*anonCreated*/);
}

export async function lazilyPollForAuth(tries: number = 20) {
  authAdded = !authAdded ? await getUserRegistrationInfo() : authAdded;
  if (!authAdded && tries > 0) {
    // try again
    tries--;
    setTimeout(() => {
      lazilyPollForAuth(tries);
    }, 15000);
  }
}

export async function handleIncompleteAuth() {
  const name = getItem("name");
  if (!name) {
    // fetch the user
    getUserRegistrationInfo();
  }
}

async function getUserRegistrationInfo() {
  const token = getAuthCallbackState(false) || getItem("jwt");
  // fetch the user
  let resp = await softwareGet("/users/plugin/state", token);
  let user = isResponseOk(resp) && resp.data ? resp.data.user : null;

  if (user) {
    await authenticationCompleteHandler(user);
    return true;
  }
  return false;
}

export async function launchEmailSignup(switching_account: boolean = false) {
  setItem("authType", "software");
  setItem("switching_account", switching_account);

  // continue with onboaring
  const url = await buildEmailSignup();

  launchWebUrl(url);
}

export async function launchLogin(loginType: string = "software", switching_account: boolean = false) {
  setItem("authType", loginType);
  setItem("switching_account", switching_account);

  // continue with onboaring
  const url = await buildLoginUrl(loginType);

  launchWebUrl(url);
}

/**
 * @param loginType "software" | "existing" | "google" | "github"
 */
export async function buildLoginUrl(loginType: string) {
  const auth_callback_state = getAuthCallbackState(true);
  const name = getItem("name");
  let url = launch_url;

  let obj = getAuthQueryObject();

  // only send the plugin_token when registering for the 1st time
  if (!name) {
    obj["plugin_token"] = getItem("jwt");
  }

  if (loginType === "github") {
    // github signup/login flow
    obj["redirect"] = launch_url;
    url = `${api_endpoint}/auth/github`;
  } else if (loginType === "google") {
    // google signup/login flow
    obj["redirect"] = launch_url;
    url = `${api_endpoint}/auth/google`;
  } else {
    // email login
    obj["token"] = getItem("jwt");
    obj["auth"] = "software";
    url = `${launch_url}/onboarding`;
  }

  const qryStr = queryString.stringify(obj);

  updatedAuthAdded(false);
  setTimeout(() => {
    lazilyPollForAuth();
  }, 16000);
  return `${url}?${qryStr}`;
}

/**
 * @param loginType "software" | "existing" | "google" | "github"
 */
export async function buildEmailSignup() {
  let loginUrl = launch_url;

  let obj = getAuthQueryObject();
  obj["token"] = getItem("jwt");
  obj["auth"] = "software";

  loginUrl = `${launch_url}/email-signup`;

  const qryStr = queryString.stringify(obj);

  updatedAuthAdded(false);
  setTimeout(() => {
    lazilyPollForAuth();
  }, 16000);
  return `${loginUrl}?${qryStr}`;
}

function getAuthQueryObject() {
  let obj = {
    plugin: getPluginType(),
    pluginVersion: getVersion(),
    plugin_id: getPluginId(),
    auth_callback_state: getAuthCallbackState(true),
    plugin_uuid: getPluginUuid(),
    login: true,
  };
  return obj;
}
