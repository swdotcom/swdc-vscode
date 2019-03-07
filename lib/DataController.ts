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
    getIdentity,
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
    setItem("app_jwt", null);

    let serverIsOnline = await serverIsAvailable();

    if (serverIsOnline) {
        let identity = await getIdentity();
        if (identity) {
            // get the app jwt
            let resp = await softwareGet(
                `/data/token?addr=${encodeURIComponent(identity)}`,
                null
            );
            if (isResponseOk(resp)) {
                return resp.data.jwt;
            }
        }
    }
    return null;
}

/**
 * create an anonymous user based on github email or mac addr
 */
export async function createAnonymousUser(updateJson) {
    let appJwt = await getAppJwt();
    let identityId = await getIdentity();
    if (appJwt && identityId) {
        let plugin_token = getItem("token");
        if (!plugin_token) {
            plugin_token = randomCode();
            setItem("token", plugin_token);
        }

        let email = identityId;

        let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        let resp = await softwarePost(
            `/data/onboard?addr=${encodeURIComponent(identityId)}`,
            { email, plugin_token, timezone },
            appJwt
        );
        if (
            isResponseOk(resp) &&
            resp.data &&
            resp.data.jwt &&
            resp.data.user &&
            updateJson
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

async function getAuthenticatedPluginAccounts(macAddr, token = null) {
    let serverIsOnline = await serverIsAvailable();
    let tokenQryStr = "";
    if (!token) {
        tokenQryStr = `?token=${encodeURIComponent(macAddr)}`;
    } else {
        tokenQryStr = `?token=${token}`;
    }

    if (serverIsOnline) {
        let api = `/users/plugin/accounts${tokenQryStr}`;
        let resp = await softwareGet(api, null);
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

function getLoggedInUser(macAddr, authAccounts) {
    if (authAccounts && authAccounts.length > 0) {
        for (let i = 0; i < authAccounts.length; i++) {
            let user = authAccounts[i];
            let userMacAddr = user.mac_addr;
            let userEmail = user.email;
            let userMacAddrShare = user.mac_addr_share;
            if (
                userEmail !== userMacAddr &&
                userEmail !== macAddr &&
                userEmail !== userMacAddrShare &&
                userMacAddr === macAddr
            ) {
                return user;
            }
        }
    }
    return null;
}

function hasRegisteredUserAccount(macAddr, authAccounts) {
    if (authAccounts && authAccounts.length > 0) {
        for (let i = 0; i < authAccounts.length; i++) {
            let user = authAccounts[i];
            let userMacAddr = user.mac_addr;
            let userEmail = user.email;
            let userMacAddrShare = user.mac_addr_share;
            if (
                userEmail !== userMacAddr &&
                userEmail !== macAddr &&
                userEmail !== userMacAddrShare
            ) {
                return true;
            }
        }
    }
    return false;
}

function getAnonymousUser(macAddr, authAccounts) {
    if (authAccounts && authAccounts.length > 0) {
        for (let i = 0; i < authAccounts.length; i++) {
            let user = authAccounts[i];
            let userMacAddr = user.mac_addr;
            let userEmail = user.email;
            let userMacAddrShare = user.mac_addr_share;
            if (
                userEmail === userMacAddr ||
                userEmail === macAddr ||
                userEmail === userMacAddrShare
            ) {
                return user;
            }
        }
    }
    return null;
}

function updateSessionUserInfo(user) {
    let userObj = { id: user.id };
    setItem("jwt", user.plugin_jwt);
    setItem("user", userObj);
    setItem("vscode_lastUpdateTime", Date.now());
}

/**
 * check if the user is registered or not
 * return {loggedIn: true|false, asUserAccounts: true|false, email}
 */
export async function getUserStatus(token = null) {
    let nowMillis = Date.now();
    if (userStatus !== null && lastRegisterUserCheck !== null) {
        if (nowMillis - lastRegisterUserCheck <= 5000) {
            return userStatus;
        }
    }

    let identity = await getIdentity();

    let authAccounts = await getAuthenticatedPluginAccounts(identity, token);
    let loggedInUser = getLoggedInUser(identity, authAccounts);
    let anonUser = getAnonymousUser(identity, authAccounts);
    if (!anonUser) {
        let updateJson = !loggedInUser ? true : false;
        // create the anonymous user
        await createAnonymousUser(updateJson);
        authAccounts = await getAuthenticatedPluginAccounts(identity, token);
        anonUser = getAnonymousUser(identity, authAccounts);
    }
    let hasUserAccounts = hasRegisteredUserAccount(identity, authAccounts);

    if (loggedInUser) {
        updateSessionUserInfo(loggedInUser);
    } else if (anonUser) {
        updateSessionUserInfo(anonUser);
    }

    userStatus = {
        loggedIn: loggedInUser ? true : false,
        email: loggedInUser ? loggedInUser.email : "",
        hasUserAccounts
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

export async function refetchUserStatusLazily(tryCountUntilFoundUser = 3) {
    setTimeout(async () => {
        clearUserStatusCache();
        let userStatus = await getUserStatus();
        if (!userStatus.loggedIn) {
            // try again if the count is not zero
            if (tryCountUntilFoundUser > 0) {
                tryCountUntilFoundUser -= 1;
                refetchUserStatusLazily(tryCountUntilFoundUser);
            }
        } else {
            setTimeout(() => {
                fetchDailyKpmSessionInfo();
            }, 1000);
        }
    }, 10000);
}

export async function pluginLogout() {
    let resp = await softwarePost("/users/plugin/logout", {}, getItem("jwt"));

    clearUserStatusCache();

    await getUserStatus();

    setTimeout(() => {
        fetchDailyKpmSessionInfo();
    }, 1000);
}
