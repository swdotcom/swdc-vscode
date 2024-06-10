import {window, ExtensionContext} from 'vscode';
import {
  getItem,
  setItem,
  launchWebUrl,
  getAuthQueryObject
} from '../Util';
import {createAnonymousUser} from '../menu/AccountManager';
import {app_url} from '../Constants';

let retry_counter = 0;
let authAdded = false;

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
  await createAnonymousUser();
  callback(ctx, true /*anonCreated*/);
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
  const name = getItem('name');
  let url = app_url;

  let params: any = getAuthQueryObject();

  // only send the plugin_token when registering for the 1st time
  if (!name) {
    params.append('plugin_token', getItem('jwt'));
  }

  if (loginType === 'github') {
    // github signup/login flow
    url = `${app_url}/auth/github`;
  } else if (loginType === 'google') {
    // google signup/login flow
    url = `${app_url}/auth/google`;
  } else {
    // email login
    params.append('token', getItem('jwt'));
    params.append('auth', 'software');
    url = `${app_url}/onboarding`;
  }

  updatedAuthAdded(false);
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
  return `${loginUrl}?${params.toString()}`;
}
