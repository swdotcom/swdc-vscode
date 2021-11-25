import {window, ExtensionContext} from 'vscode';
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
} from '../Util';
import {isResponseOk, softwareGet} from '../http/HttpClient';
import {createAnonymousUser} from '../menu/AccountManager';
import {authenticationCompleteHandler} from '../DataController';
import {api_endpoint, app_url, TWENTY_SEC_TIMEOUT_MILLIS} from '../Constants';
import {URLSearchParams} from 'url';

let retry_counter = 0;
let authAdded = false;
const one_min_millis = 1000 * 60;

export function updatedAuthAdded(val: boolean) {
  authAdded = val;
}

export async function onboardInit(ctx: ExtensionContext, callback: any) {
  if (getItem('jwt')) {
    // we have the jwt, call the callback that anon was not created
    return callback(ctx, false /*anonCreated*/);
  }

  if (window.state.focused) {
    // perform primary window related work
    primaryWindowOnboarding(ctx, callback);
  } else {
    // call the secondary onboarding logic
    secondaryWindowOnboarding(ctx, callback);
  }
}

async function primaryWindowOnboarding(ctx: ExtensionContext, callback: any) {
  const jwt = await createAnonymousUser();
  if (jwt) {
    // great, it worked. call the callback
    return callback(ctx, true /*anonCreated*/);
  }

  // failed to get the jwt, try again in a minute
  if (retry_counter === 0) {
    // show the prompt that we're unable connect to our app 1 time only
    showOfflinePrompt(true);
  }
  retry_counter++;
  // call activate again later
  const retryMillis = retry_counter > 4 ? one_min_millis : 1000 * 15;
  setTimeout(() => {
    onboardInit(ctx, callback);
  }, retryMillis);
}

/**
 * This is called if there's no JWT. If it reaches a
 * 6th call it will create an anon user.
 * @param ctx
 * @param callback
 */
async function secondaryWindowOnboarding(ctx: ExtensionContext, callback: any) {
  if (getItem("jwt")) {
    return;
  }

  if (retry_counter < 5) {
    retry_counter++;
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
  if (authAdded) {
    return;
  }
  const registered =  await getUserRegistrationInfo();
  if (!registered && tries > 0) {
    // try again
    tries--;
    setTimeout(() => {
      lazilyPollForAuth(tries);
    }, 15000);
  }
}

async function getUserRegistrationInfo() {
  const token = getAuthCallbackState(false) || getItem('jwt');
  // fetch the user
  let resp = await softwareGet('/users/plugin/state', token);
  let user = isResponseOk(resp) && resp.data ? resp.data.user : null;

  // only update if its a registered, not anon user
  if (user && user.registered === 1) {
    await authenticationCompleteHandler(user);
    return true;
  }
  return false;
}

export async function launchEmailSignup(switching_account: boolean = false) {
  setItem('authType', 'software');
  setItem('switching_account', switching_account);

  // continue with onboaring
  const url = await buildEmailSignup();

  launchWebUrl(url);
}

export async function launchLogin(loginType: string = 'software', switching_account: boolean = false) {
  setItem('authType', loginType);
  setItem('switching_account', switching_account);

  // continue with onboaring
  const url = await buildLoginUrl(loginType);

  launchWebUrl(url);
}

/**
 * @param loginType "software" | "existing" | "google" | "github"
 */
export async function buildLoginUrl(loginType: string) {
  const auth_callback_state = getAuthCallbackState(true);
  const name = getItem('name');
  let url = app_url;

  let params: any = getAuthQueryObject();

  // only send the plugin_token when registering for the 1st time
  if (!name) {
    params.append('plugin_token', getItem('jwt'));
  }

  if (loginType === 'github') {
    // github signup/login flow
    params.append('redirect', app_url);
    url = `${api_endpoint}/auth/github`;
  } else if (loginType === 'google') {
    // google signup/login flow
    params.append('redirect', app_url);
    url = `${api_endpoint}/auth/google`;
  } else {
    // email login
    params.append('token', getItem('jwt'));
    params.append('auth', 'software');
    url = `${app_url}/onboarding`;
  }

  updatedAuthAdded(false);
  setTimeout(() => {
    lazilyPollForAuth();
  }, TWENTY_SEC_TIMEOUT_MILLIS);
  return `${url}?${params.toString()}`;
}

/**
 * @param loginType "software" | "existing" | "google" | "github"
 */
export async function buildEmailSignup() {
  let loginUrl = app_url;

  let params: any = getAuthQueryObject();
  params.append('auth', 'software');
  params.append('token', getItem('jwt'));

  loginUrl = `${app_url}/email-signup`;

  updatedAuthAdded(false);
  setTimeout(() => {
    lazilyPollForAuth();
  }, TWENTY_SEC_TIMEOUT_MILLIS);
  return `${loginUrl}?${params.toString()}`;
}

function getAuthQueryObject() {
  const params = new URLSearchParams();
  params.append('plugin', getPluginType());
  params.append('plugin_uuid', getPluginUuid());
  params.append('pluginVersion', getVersion());
  params.append('plugin_id', `${getPluginId()}`);
  params.append('auth_callback_state', getAuthCallbackState());
  params.append('login', 'true');
  return params;
}
