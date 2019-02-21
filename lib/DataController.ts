import { workspace, ConfigurationTarget } from "vscode";
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
    getSoftwareSessionFile,
    getGitEmail
} from "./Util";

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

    if (serverAvailable && (!existingJwt || !hasSessionFile)) {
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
 * confirm the token that was saved in the app
 */
export async function checkTokenAvailability() {
    const tokenVal = getItem("token");

    if (!tokenVal) {
        return;
    }

    let macAddress = await getMacAddress();

    // need to get back...
    // response.data.user, response.data.jwt
    // non-authorization API
    let tokenCheckResult = await confirmUser(tokenVal);
    if (!tokenCheckResult) {
        tokenCheckResult = await confirmUser(macAddress);
    }

    if (tokenCheckResult && tokenCheckResult["status"] === "success") {
        let data = tokenCheckResult["data"];
        setItem("jwt", data.jwt);
        setItem("user", data.user);
        setItem("vscode_lastUpdateTime", Date.now());

        // fetch kpm data
        setTimeout(() => {
            fetchDailyKpmSessionInfo();
        }, 1000);
    }
}

async function confirmUser(token) {
    let result = softwareGet(`/users/plugin/confirm?token=${token}`, null)
        .then(resp => {
            if (
                isResponseOk(resp) &&
                resp.data &&
                resp.data.jwt &&
                resp.data.user
            ) {
                return { status: "success", data: resp.data };
            }
        })
        .catch(err => {
            return { status: "failed", message: err.message };
        });
    if (result["status"] === "success") {
        return result;
    } else {
        return null;
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
        } else {
            console.log(
                "Code Time: error confirming onboarding plugin token: ",
                resp.message
            );
        }
    }
}

/**
 * check if the user is registered or not
 */
export async function isRegisteredUser() {
    let jwt = getItem("jwt");
    let user = getItem("user");
    let serverIsOnline = await serverIsAvailable();
    let macAddress = await getMacAddress();
    if (jwt && serverIsOnline && user && macAddress) {
        let userObj = JSON.parse(user);

        let api = `/users/${parseInt(userObj.id, 10)}`;
        let resp = await softwareGet(api, jwt);
        if (isResponseOk(resp)) {
            if (
                resp &&
                resp.data &&
                resp.data.data &&
                resp.data.data.email !== macAddress
            ) {
                initializePreferences();
                return true;
            }
        }
    }
    return false;
}

export async function initializePreferences() {
    let user = getItem("user");
    let jwt = getItem("jwt");
    let serverIsOnline = await serverIsAvailable();
    if (jwt && serverIsOnline && user) {
        let userObj = JSON.parse(user);
        let userId = parseInt(userObj.id, 10);

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

                if (!prefsShowMusic || !prefsShowGit || !prefsShowRank) {
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

    // get the user's preferences and update them if they don't match what we have
    let user = getItem("user");
    let jwt = getItem("jwt");
    let serverIsOnline = await serverIsAvailable();
    if (jwt && serverIsOnline && user) {
        let userObj = JSON.parse(user);
        let userId = parseInt(userObj.id, 10);

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
