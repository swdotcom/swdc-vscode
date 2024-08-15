import {window, ExtensionContext} from 'vscode';
import {getItem} from '../Util';
import {createAnonymousUser} from '../menu/AccountManager';

let retry_counter = 0;

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
