import { workspace, commands, ConfigurationTarget } from "vscode";

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
    nowInSecs,
    getOsUsername
} from "./Util";
import { updateShowMusicMetrics } from "./MenuManager";
const fs = require("fs");

let userStatus = null;

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
 * User session will have...
 * { user: user, jwt: jwt }
 */
export async function isAuthenticated() {
    // since we do have a token value, ping the backend using authentication
    // in case they need to re-authenticate
    const resp = await softwareGet("/users/ping", getItem("jwt"));
    if (isResponseOk(resp)) {
        return true;
    } else {
        console.log("Code Time: Currently not logged in");
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
        // get the app jwt
        let resp = await softwareGet(
            `/data/apptoken?token=${nowInSecs()}`,
            null
        );
        if (isResponseOk(resp)) {
            return resp.data.jwt;
        }
    }
    return null;
}

/**
 * create an anonymous user based on github email or mac addr
 */
export async function createAnonymousUser(serverIsOnline) {
    let appJwt = await getAppJwt();
    if (appJwt && serverIsOnline) {
        let username = await getOsUsername();
        let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        let resp = await softwarePost(
            "/data/onboard",
            { timezone, username },
            appJwt
        );
        if (isResponseOk(resp) && resp.data && resp.data.jwt) {
            setItem("jwt", resp.data.jwt);
        } else {
            console.log(
                "Code Time: error confirming onboarding plugin token: ",
                resp.message
            );
        }
    }
}

async function isLoggedOn(serverIsOnline) {
    let jwt = getItem("jwt");
    if (serverIsOnline) {
        let api = "/users/plugin/state";
        let resp = await softwareGet(api, jwt);
        if (isResponseOk(resp) && resp.data) {
            // NOT_FOUND, ANONYMOUS, OK, UNKNOWN
            if (resp.data.state === "OK") {
                // check the jwt
                if (resp.data.jwt) {
                    let pluginJwt = resp.data.jwt;
                    if (pluginJwt !== jwt) {
                        // update it
                        setItem("jwt", pluginJwt);
                    }
                }
                return true;
            }
        }
    }
    return false;
}

/**
 * check if the user is registered or not
 * return {loggedIn: true|false}
 */
export async function getUserStatus() {
    let jwt = getItem("jwt");
    if (jwt && userStatus && userStatus.loggedIn) {
        // the user is logged on, no need to cause api traffic
        return userStatus;
    }

    let serverIsOnline = await serverIsAvailable();

    let loggedIn = false;
    if (!jwt) {
        // create an anonymous user
        await createAnonymousUser(serverIsOnline);
    } else {
        // check if we have a logged in user
        loggedIn = await isLoggedOn(serverIsOnline);
    }

    userStatus = {
        loggedIn
    };

    commands.executeCommand(
        "setContext",
        "codetime:loggedIn",
        userStatus.loggedIn
    );

    return userStatus;
}

export async function initializePreferences() {
    let jwt = getItem("jwt");
    let serverIsOnline = await serverIsAvailable();
    if (jwt && serverIsOnline) {
        let api = `/users/me`;
        let resp = await softwareGet(api, jwt);
        if (isResponseOk(resp)) {
            if (
                resp &&
                resp.data &&
                resp.data.data &&
                resp.data.data.preferences
            ) {
                let userId = parseInt(resp.data.data.id);
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
