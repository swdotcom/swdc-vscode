import { window, ExtensionContext } from "vscode";
import { getAppJwt, getUser } from "../DataController";
import {
    showOfflinePrompt,
    getOsUsername,
    getHostname,
    setItem,
    getItem,
    getWorkspaceName,
} from "../Util";
import {
    softwarePost,
    isResponseOk,
    serverIsAvailable,
} from "../http/HttpClient";
import { EventManager } from "../managers/EventManager";

let retry_counter = 0;
// 2 minute
const one_min_millis = 1000 * 60;
let atlassianOauthFetchTimeout = null;

export function onboardInit(ctx: ExtensionContext, callback: any) {
    const jwt = getItem("jwt");
    if (jwt) {
        // we have the jwt, call the callback that anon was not created
        return callback(ctx, false /*anonCreated*/);
    }

    const windowState = window.state;
    if (windowState.focused) {
        // perform primary window related work
        primaryWindowOnboarding(ctx, callback);
    } else {
        // call the secondary onboarding logic
        secondaryWindowOnboarding(ctx, callback);
    }
}

async function primaryWindowOnboarding(ctx: ExtensionContext, callback: any) {
    const serverIsOnline = await serverIsAvailable();
    if (serverIsOnline) {
        // great, it's online, create the anon user
        await createAnonymousUser(serverIsOnline);
        // great, it worked. call the callback
        return callback(ctx, true /*anonCreated*/);
    } else {
        // not online, try again in a minute
        if (retry_counter === 0) {
            // show the prompt that we're unable connect to our app 1 time only
            showOfflinePrompt(true);
        }
        // call activate again later
        setTimeout(() => {
            retry_counter++;
            onboardInit(ctx, callback);
        }, one_min_millis);
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
    } else if (retry_counter < 5) {
        if (serverIsOnline) {
            retry_counter++;
        }
        // call activate again in about 6 seconds
        setTimeout(() => {
            onboardInit(ctx, callback);
        }, 1000 * 5);
    }

    // tried enough times, create an anon user
    await createAnonymousUser(serverIsOnline);
    // call the callback
    return callback(ctx, true /*anonCreated*/);
}

/**
 * create an anonymous user based on github email or mac addr
 */
export async function createAnonymousUser(serverIsOnline) {
    let appJwt = await getAppJwt(serverIsOnline);
    if (appJwt && serverIsOnline) {
        const jwt = getItem("jwt");
        // check one more time before creating the anon user
        if (!jwt) {
            const creation_annotation = "NO_SESSION_FILE";
            const username = await getOsUsername();
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const hostname = await getHostname();
            const workspace_name = getWorkspaceName();
            const eventType = `createanon-${workspace_name}`;
            EventManager.getInstance().createCodeTimeEvent(
                eventType,
                "anon_creation",
                "anon creation"
            );
            const resp = await softwarePost(
                "/data/onboard",
                {
                    timezone,
                    username,
                    creation_annotation,
                    hostname,
                },
                appJwt
            );
            if (isResponseOk(resp) && resp.data && resp.data.jwt) {
                setItem("jwt", resp.data.jwt);
                return resp.data.jwt;
            }
        }
    }
    return null;
}

export function refetchAtlassianOauthLazily(tryCountUntilFoundUser = 40) {
    if (atlassianOauthFetchTimeout) {
        return;
    }
    atlassianOauthFetchTimeout = setTimeout(() => {
        atlassianOauthFetchTimeout = null;
        refetchAtlassianOauthFetchHandler(tryCountUntilFoundUser);
    }, 10000);
}

async function refetchAtlassianOauthFetchHandler(tryCountUntilFoundUser) {
    const serverIsOnline = await serverIsAvailable();
    const oauth = await getAtlassianOauth(serverIsOnline);
    if (!oauth) {
        // try again if the count is not zero
        if (tryCountUntilFoundUser > 0) {
            tryCountUntilFoundUser -= 1;
            refetchAtlassianOauthLazily(tryCountUntilFoundUser);
        }
    } else {
        const message = "Successfully connected to Atlassian";
        window.showInformationMessage(message);
    }
}

export async function getAtlassianOauth(serverIsOnline) {
    let jwt = getItem("jwt");
    if (serverIsOnline && jwt) {
        let user = await getUser(serverIsOnline, jwt);
        if (user && user.auths) {
            // get the one that is "slack"
            for (let i = 0; i < user.auths.length; i++) {
                const oauthInfo = user.auths[i];
                if (oauthInfo.type === "atlassian") {
                    updateAtlassianAccessInfo(oauthInfo);
                    return oauthInfo;
                }
            }
        }
    }
    return null;
}

export async function updateAtlassianAccessInfo(oauth) {
    /**
     * {access_token, refresh_token}
     */
    if (oauth) {
        setItem("atlassian_access_token", oauth.access_token);
    } else {
        setItem("atlassian_access_token", null);
    }
}
