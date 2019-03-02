import { workspace, commands, ConfigurationTarget } from "vscode";
const fs = require("fs");

import {
    softwareGet,
    softwarePut,
    isResponseOk,
    isUserDeactivated,
    softwarePost
} from "./HttpClient";
import { fetchDailyKpmSessionInfo } from "./KpmStatsManager";
import {
    getItem,
    setItem,
    getSoftwareDataStoreFile,
    deleteFile,
    randomCode,
    getMacAddress,
    getSoftwareSessionFile
} from "./Util";
import { updateShowMusicMetrics } from "./MenuManager";

let userStatus = null;
let lastRegisterUserCheck = null;

export function clearUserStatusCache() {
    lastRegisterUserCheck = null;
}

export async function serverIsAvailable() {
    return await softwareGet("/ping", null)
        .then(result => {
            return isResponseOk(result);
        })
        .catch(e => {
            return false;
        });
}

/**
 * checks if the user needs to be created
 */
export async function requiresUserCreation() {
    const sessionFile = getSoftwareSessionFile();
    // set the last auth check time to -1 if the sesison file doesn't yet exist
    const hasSessionFile = fs.existsSync(sessionFile);
    const serverAvailable = await serverIsAvailable();
    const existingJwt = getItem("jwt");
    const existingAppJwt = getItem("app_jwt");

    let authenticatingJwt = existingJwt ? existingJwt : existingAppJwt;

    if (serverAvailable && (!authenticatingJwt || !hasSessionFile)) {
        return true;
    }
    return false;
}

/**
 * User session will have...
 * { user: user, jwt: jwt }
 */
export async function isAuthenticated() {
    const tokenVal = getItem("token");
    if (!tokenVal) {
        return false;
    }

    // since we do have a token value, ping the backend using authentication
    // in case they need to re-authenticate
    const resp = await softwareGet("/users/ping", getItem("jwt"));
    if (isResponseOk(resp)) {
        return true;
    } else {
        console.log("Code Time: The user is not logged in");
        return false;
    }
}

/**
 * send the offline data
 */
export function sendOfflineData() {
    const dataStoreFile = getSoftwareDataStoreFile();
    try {
        if (fs.existsSync(dataStoreFile)) {
            const content = fs.readFileSync(dataStoreFile).toString();
            if (content) {
                console.log(`Code Time: sending batch payloads: ${content}`);
                const payloads = content
                    .split(/\r?\n/)
                    .map(item => {
                        let obj = null;
                        if (item) {
                            try {
                                obj = JSON.parse(item);
                            } catch (e) {
                                //
                            }
                        }
                        if (obj) {
                            return obj;
                        }
                    })
                    .filter(item => item);
                softwarePost("/data/batch", payloads, getItem("jwt")).then(
                    async resp => {
                        if (isResponseOk(resp) || isUserDeactivated(resp)) {
                            const serverAvailablePromise = await serverIsAvailable();
                            if (serverAvailablePromise) {
                                // everything is fine, delete the offline data file
                                deleteFile(getSoftwareDataStoreFile());
                            }
                        }
                    }
                );
            }
        }
    } catch (e) {
        //
    }
}

/**
 * send any music tracks
 */
export function sendMusicData(trackData) {
    // add the "local_start", "start", and "end"
    // POST the kpm to the PluginManager
    return softwarePost("/data/music", trackData, getItem("jwt"))
        .then(resp => {
            if (!isResponseOk(resp)) {
                return { status: "fail" };
            }
            return { status: "ok" };
        })
        .catch(e => {
            return { status: "fail" };
        });
}

/**
 * get the app jwt
 */
export async function getAppJwt() {
    let appJwt = getItem("app_jwt");

    let serverIsOnline = await serverIsAvailable();

    if (!appJwt && serverIsOnline) {
        let macAddress = await getMacAddress();
        if (macAddress) {
            // get the app jwt
            let resp = await softwareGet(
                `/data/token?addr=${encodeURIComponent(macAddress)}`,
                null
            );
            if (isResponseOk(resp)) {
                appJwt = resp.data.jwt;
                setItem("app_jwt", appJwt);
            }
        }
    }
    return getItem("app_jwt");
}

/**
 * create an anonymous user based on github email or mac addr
 */
export async function createAnonymousUser() {
    let appJwt = await getAppJwt();
    let jwt = await getItem("jwt");
    let macAddress = await getMacAddress();
    if (appJwt && !jwt && macAddress) {
        let plugin_token = getItem("token");
        if (!plugin_token) {
            plugin_token = randomCode();
            setItem("token", plugin_token);
        }

        let email = null; //await getGitEmail();
        if (!email) {
            email = macAddress;
        }

        let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        let resp = await softwarePost(
            `/data/onboard?addr=${encodeURIComponent(macAddress)}`,
            { email, plugin_token, timezone },
            getItem("app_jwt")
        );
        if (
            isResponseOk(resp) &&
            resp.data &&
            resp.data.jwt &&
            resp.data.user
        ) {
            setItem("jwt", resp.data.jwt);
            setItem("user", resp.data.user);
            setItem("vscode_lastUpdateTime", Date.now());
        } else {
            console.log(
                "Code Time: error confirming onboarding plugin token: ",
                resp.message
            );
        }
    }
}

async function getAuthenticatedPluginAccounts(token = null) {
    let jwt = getItem("jwt");
    let appJwt = getItem("app_jwt");
    let serverIsOnline = await serverIsAvailable();
    let tokenQryStr = "";
    if (!token) {
        let macAddress = await getMacAddress();
        tokenQryStr = `?token=${encodeURIComponent(macAddress)}`;
    } else {
        tokenQryStr = `?token=${token}`;
    }

    let authenticatingJwt = jwt ? jwt : appJwt;

    let macAddress = !token ? await getMacAddress() : token;
    if (authenticatingJwt && serverIsOnline && macAddress) {
        let api = `/users/plugin/accounts${tokenQryStr}`;
        let resp = await softwareGet(api, authenticatingJwt);
        if (isResponseOk(resp)) {
            if (
                resp &&
                resp.data &&
                resp.data.users &&
                resp.data.users.length > 0
            ) {
                for (let i = 0; i < resp.data.users.length; i++) {
                    return resp.data.users;
                }
            }
        }
    }

    return null;
}

async function isLoggedIn(authAccounts) {
    let macAddress = await getMacAddress();
    if (authAccounts && authAccounts.length > 0) {
        let foundUser = null;
        for (let i = 0; i < authAccounts.length; i++) {
            let user = authAccounts[i];
            let userId = parseInt(user.id, 10);
            let userMacAddr = user.mac_addr;
            let userEmail = user.email;
            if (userMacAddr === macAddress && userEmail !== macAddress) {
                // having a mac_addr present and the email not equal to the mac address
                // means they are logged in with this account
                let cachedUser = getItem("user");
                if (cachedUser && !cachedUser.id) {
                    // turn it into an object
                    cachedUser = cachedUser ? JSON.parse(cachedUser) : null;
                }
                let cachedUserId = cachedUser ? cachedUser.id : null;

                if (cachedUser && userId !== cachedUserId) {
                    // save this user in case we don't find a matching userId
                    foundUser = user;
                } else if (cachedUser && userId === cachedUserId) {
                    return user;
                }
            }

            if (foundUser) {
                // update the user, they've switched accounts
                let foundUserObj = { id: foundUser.id };
                setItem("jwt", foundUser.plugin_jwt);
                setItem("user", foundUserObj);
                setItem("vscode_lastUpdateTime", Date.now());
                return foundUser;
            }
        }
    }
    return null;
}

async function hasRegisteredAccounts(authAccounts) {
    let macAddress = await getMacAddress();
    if (authAccounts && authAccounts.length > 0) {
        for (let i = 0; i < authAccounts.length; i++) {
            let user = authAccounts[i];
            if (user.email !== macAddress) {
                return true;
            }
        }
    }
    return false;
}

async function hasPluginAccount(authAccounts) {
    if (authAccounts && authAccounts.length > 0) {
        return true;
    }
    return false;
}

/**
 * check if the user is registered or not
 * return {loggedIn: true|false, hasAccounts: true|false, hasUserAccounts: true|false, email}
 */
export async function getUserStatus(token = null) {
    let nowMillis = Date.now();
    if (userStatus !== null && lastRegisterUserCheck !== null) {
        if (nowMillis - lastRegisterUserCheck <= 10000) {
            return userStatus;
        }
    }

    let authAccounts = await getAuthenticatedPluginAccounts(token);
    let loggedInP = isLoggedIn(authAccounts);
    let hasAccountsP = hasPluginAccount(authAccounts);
    let hasUserAccountsP = hasRegisteredAccounts(authAccounts);

    let loggedInUser = await loggedInP;

    userStatus = {
        loggedIn: loggedInUser ? true : false,
        email: loggedInUser ? loggedInUser.email : "",
        hasAccounts: await hasAccountsP,
        hasUserAccounts: await hasUserAccountsP
    };

    commands.executeCommand(
        "setContext",
        "codetime:loggedIn",
        userStatus.loggedIn
    );

    lastRegisterUserCheck = Date.now();
    return userStatus;
}

export async function initializePreferences() {
    let user = getItem("user");
    let jwt = getItem("jwt");
    let serverIsOnline = await serverIsAvailable();
    if (jwt && serverIsOnline && user) {
        let cachedUser = user;
        if (!cachedUser.id) {
            cachedUser = JSON.parse(cachedUser);
        }
        let userId = parseInt(cachedUser.id, 10);

        let api = `/users/${userId}`;
        let resp = await softwareGet(api, jwt);
        if (isResponseOk(resp)) {
            if (
                resp &&
                resp.data &&
                resp.data.data &&
                resp.data.data.preferences
            ) {
                let prefs = resp.data.data.preferences;
                let prefsShowMusic =
                    prefs.showMusic !== null && prefs.showMusic !== undefined
                        ? prefs.showMusic
                        : null;
                let prefsShowGit =
                    prefs.showGit !== null && prefs.showGit !== undefined
                        ? prefs.showGit
                        : null;
                let prefsShowRank =
                    prefs.showRank !== null && prefs.showRank !== undefined
                        ? prefs.showRank
                        : null;

                if (
                    prefsShowMusic === null ||
                    prefsShowGit === null ||
                    prefsShowRank === null
                ) {
                    await sendPreferencesUpdate(userId, prefs);
                } else {
                    if (prefsShowMusic !== null) {
                        await workspace
                            .getConfiguration()
                            .update(
                                "showMusicMetrics",
                                prefsShowMusic,
                                ConfigurationTarget.Global
                            );
                        updateShowMusicMetrics(prefsShowMusic);
                    }
                    if (prefsShowGit !== null) {
                        await workspace
                            .getConfiguration()
                            .update(
                                "showGitMetrics",
                                prefsShowGit,
                                ConfigurationTarget.Global
                            );
                    }
                    if (prefsShowRank !== null) {
                        await workspace
                            .getConfiguration()
                            .update(
                                "showWeeklyRanking",
                                prefsShowRank,
                                ConfigurationTarget.Global
                            );
                    }
                }
            }
        }
    }
}

async function sendPreferencesUpdate(userId, userPrefs) {
    let api = `/users/${userId}`;
    let showMusicMetrics = workspace.getConfiguration().get("showMusicMetrics");
    let showGitMetrics = workspace.getConfiguration().get("showGitMetrics");
    let showWeeklyRanking = workspace
        .getConfiguration()
        .get("showWeeklyRanking");
    userPrefs["showMusic"] = showMusicMetrics;
    userPrefs["showGit"] = showGitMetrics;
    userPrefs["showRank"] = showWeeklyRanking;

    updateShowMusicMetrics(showMusicMetrics);

    // update the preferences
    // /:id/preferences
    api = `/users/${userId}/preferences`;
    let resp = await softwarePut(api, userPrefs, getItem("jwt"));
    if (isResponseOk(resp)) {
        console.log("Code Time: update user code time preferences");
    }
}

export async function updatePreferences() {
    let showMusicMetrics = workspace.getConfiguration().get("showMusicMetrics");
    let showGitMetrics = workspace.getConfiguration().get("showGitMetrics");
    let showWeeklyRanking = workspace
        .getConfiguration()
        .get("showWeeklyRanking");

    updateShowMusicMetrics(showMusicMetrics);

    // get the user's preferences and update them if they don't match what we have
    let user = getItem("user");
    let jwt = getItem("jwt");
    let serverIsOnline = await serverIsAvailable();
    if (jwt && serverIsOnline && user) {
        let cachedUser = user;
        if (!cachedUser.id) {
            cachedUser = JSON.parse(cachedUser);
        }
        let userId = parseInt(cachedUser.id, 10);

        let api = `/users/${userId}`;
        let resp = await softwareGet(api, jwt);
        if (isResponseOk(resp)) {
            if (
                resp &&
                resp.data &&
                resp.data.data &&
                resp.data.data.preferences
            ) {
                let prefs = resp.data.data.preferences;
                let prefsShowMusic =
                    prefs.showMusic !== null && prefs.showMusic !== undefined
                        ? prefs.showMusic
                        : null;
                let prefsShowGit =
                    prefs.showGit !== null && prefs.showGit !== undefined
                        ? prefs.showGit
                        : null;
                let prefsShowRank =
                    prefs.showRank !== null && prefs.showRank !== undefined
                        ? prefs.showRank
                        : null;

                if (
                    prefsShowMusic === null ||
                    prefsShowGit === null ||
                    prefsShowRank === null ||
                    prefsShowMusic !== showMusicMetrics ||
                    prefsShowGit !== showGitMetrics ||
                    prefsShowRank !== showWeeklyRanking
                ) {
                    await sendPreferencesUpdate(userId, prefs);
                }
            }
        }
    }
}

export async function refetchUserStatusLazily() {
    setTimeout(() => {
        clearUserStatusCache();
        getUserStatus();
    }, 8000);
}

export async function pluginLogout() {
    let resp = await softwarePost("/users/plugin/logout", {}, getItem("jwt"));

    clearUserStatusCache();
    getUserStatus();

    if (isResponseOk(resp)) {
        // delete the session.json file
        const sessionFile = getSoftwareSessionFile();
        if (fs.existsSync(sessionFile)) {
            deleteFile(sessionFile);
        }
        if (await requiresUserCreation()) {
            await createAnonymousUser();
        }

        setTimeout(() => {
            fetchDailyKpmSessionInfo();
        }, 1000);
    } else {
        console.log("error logging out");
    }
}
