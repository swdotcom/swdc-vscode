import { workspace, commands, ConfigurationTarget, env } from "vscode";

import {
    softwareGet,
    softwarePut,
    isResponseOk,
    softwarePost
} from "./HttpClient";
import { MusicStoreManager } from "./music/MusicStoreManager";
import { fetchDailyKpmSessionInfo } from "./KpmStatsManager";
import {
    getItem,
    setItem,
    getSoftwareDataStoreFile,
    deleteFile,
    nowInSecs,
    getOsUsername,
    getSessionFileCreateTime,
    getOs,
    getVersion,
    getHostname,
    getEditorSessionToken,
    showOfflinePrompt,
    buildLoginUrl,
    launchWebUrl,
    logIt,
    buildSpotifyConnectUrl,
    isMusicTime
} from "./Util";
import { getAccessToken } from "cody-music";
import { updateShowMusicMetrics, buildWebDashboardUrl } from "./MenuManager";
import { PLUGIN_ID } from "./Constants";
const fs = require("fs");

let loggedInCacheState = null;
let initializedPrefs = false;
let serverAvailable = true;
let serverAvailableLastCheck = 0;

// batch offline payloads in 25. backend has a 100k body limit
const batch_limit = 25;

export async function serverIsAvailable() {
    let nowSec = nowInSecs();
    let diff = nowSec - serverAvailableLastCheck;
    if (serverAvailableLastCheck === 0 || diff > 10) {
        serverAvailableLastCheck = nowInSecs();
        serverAvailable = await softwareGet("/ping", null)
            .then(result => {
                return isResponseOk(result);
            })
            .catch(e => {
                return false;
            });
    }
    return serverAvailable;
}

async function sendBatchPayload(batch) {
    await softwarePost("/data/batch", batch, getItem("jwt")).catch(e => {
        logIt(`Unable to send plugin data batch, error: ${e.message}`);
    });
}

/**
 * send the offline data
 */
export async function sendOfflineData() {
    const dataStoreFile = getSoftwareDataStoreFile();
    try {
        if (fs.existsSync(dataStoreFile)) {
            let isonline = await serverIsAvailable();
            if (isonline) {
                const content = fs.readFileSync(dataStoreFile).toString();
                if (content) {
                    logIt(`sending batch payloads: ${content}`);
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

                    // send 50 at a time
                    let batch = [];
                    for (let i = 0; i < payloads.length; i++) {
                        if (batch.length >= batch_limit) {
                            await sendBatchPayload(batch);
                            batch = [];
                        }
                        batch.push(payloads[i]);
                    }
                    if (batch.length > 0) {
                        await sendBatchPayload(batch);
                    }
                    // we're online so just delete the datastore file
                    deleteFile(getSoftwareDataStoreFile());
                }
            }
        }
    } catch (e) {
        //
    }
}

/**
 * send any music tracks
 */
export async function sendMusicData(trackData) {
    if (trackData.album) {
        delete trackData.album;
    }
    if (trackData.available_markets) {
        delete trackData.available_markets;
    }
    if (trackData.images) {
        delete trackData.images;
    }
    if (trackData.artists) {
        delete trackData.artists;
    }
    if (trackData.external_urls) {
        delete trackData.external_urls;
    }
    if (trackData.href) {
        delete trackData.href;
    }
    logIt(`sending ${JSON.stringify(trackData)}`);
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
export async function getAppJwt(serverIsOnline) {
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
    let appJwt = await getAppJwt(serverIsOnline);
    if (appJwt && serverIsOnline) {
        const jwt = getItem("jwt");
        // check one more time before creating the anon user
        if (!jwt) {
            const creation_annotation = "NO_SESSION_FILE";
            const username = await getOsUsername();
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const hostname = await getHostname();
            let resp = await softwarePost(
                "/data/onboard",
                {
                    timezone,
                    username,
                    creation_annotation,
                    hostname
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

export async function getSpotifyOauth(serverIsOnline) {
    let jwt = getItem("jwt");
    if (serverIsOnline && jwt) {
        let user = await getUser(serverIsOnline, jwt);
        if (
            user &&
            user.oauths &&
            user.oauths.Spotify &&
            user.oauths.Spotify.spotify_access_token
        ) {
            /**
             * Spotify:
                email:"..."
                login:"..."
                name:"..."
                permissions:Array(0) []
                spotify_access_token:"BQDcTyejy1MGT..."
                spotify_id:"citipzzers..."
                spotify_refresh_token:"AQAEQ-kFK5c3I..."
             */
            setItem(
                "spotify_access_token",
                user.oauths.Spotify.spotify_access_token
            );
            setItem(
                "spotify_refresh_token",
                user.oauths.Spotify.spotify_refresh_token
            );

            return user.oauths.Spotify;
        }
    }
    return null;
}

async function isLoggedOn(serverIsOnline, jwt) {
    if (serverIsOnline) {
        let api = "/users/plugin/state";
        let resp = await softwareGet(api, jwt);
        if (isResponseOk(resp) && resp.data) {
            // NOT_FOUND, ANONYMOUS, OK, UNKNOWN
            let state = resp.data.state ? resp.data.state : "UNKNOWN";
            if (state === "OK") {
                let sessionEmail = getItem("name");
                let email = resp.data.email;
                if (sessionEmail !== email) {
                    setItem("name", email);
                }
                // check the jwt
                let pluginJwt = resp.data.jwt;
                if (pluginJwt && pluginJwt !== jwt) {
                    // update it
                    setItem("jwt", pluginJwt);
                    // re-initialize preferences
                    initializedPrefs = false;
                }
                return { loggedOn: true, state };
            }
            // return the state that is returned
            return { loggedOn: false, state };
        }
    }
    return { loggedOn: false, state: "UNKNOWN" };
}

/**
 * check if the user is registered or not
 * return {loggedIn: true|false}
 */
export async function getUserStatus(serverIsOnline) {
    let jwt = getItem("jwt");

    let loggedIn = false;
    if (serverIsOnline) {
        // refetch the jwt then check if they're logged on
        let loggedInResp = await isLoggedOn(serverIsOnline, jwt);
        // set the loggedIn bool value
        loggedIn = loggedInResp.loggedOn;
    }

    if (serverIsOnline && loggedIn && !initializedPrefs) {
        initializePreferences(serverIsOnline);
        initializedPrefs = true;
    }

    let userStatus = {
        loggedIn
    };

    if (!loggedIn) {
        let name = getItem("name");
        // only update the name if it's not null
        if (name) {
            setItem("name", null);
        }
    }

    commands.executeCommand(
        "setContext",
        "codetime:loggedIn",
        userStatus.loggedIn
    );

    if (
        serverIsOnline &&
        loggedInCacheState !== null &&
        loggedInCacheState !== loggedIn
    ) {
        sendHeartbeat(`STATE_CHANGE:LOGGED_IN:${loggedIn}`, serverIsOnline);
        setTimeout(() => {
            fetchDailyKpmSessionInfo();
        }, 1000);

        if (!getAccessToken() && isMusicTime()) {
            // check if they have a connected spotify auth
            setTimeout(() => {
                refetchSpotifyConnectStatusLazily();
            }, 1000);
        }
    }

    loggedInCacheState = loggedIn;

    return userStatus;
}

export async function getUser(serverIsOnline, jwt) {
    if (jwt && serverIsOnline) {
        let api = `/users/me`;
        let resp = await softwareGet(api, jwt);
        if (isResponseOk(resp)) {
            if (resp && resp.data && resp.data.data) {
                return resp.data.data;
            }
        }
    }
    return null;
}

export async function initializePreferences(serverIsOnline) {
    let jwt = getItem("jwt");
    if (jwt && serverIsOnline) {
        let user = await getUser(serverIsOnline, jwt);
        if (user && user.preferences) {
            let userId = parseInt(user.id, 10);
            let prefs = user.preferences;
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
        logIt("update user code time preferences");
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
    let jwt = getItem("jwt");
    let serverIsOnline = await serverIsAvailable();
    if (jwt && serverIsOnline) {
        let user = await getUser(serverIsOnline, jwt);
        if (!user) {
            return;
        }
        let api = `/users/${user.id}`;
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
                    await sendPreferencesUpdate(parseInt(user.id, 10), prefs);
                }
            }
        }
    }
}

export function refetchSpotifyConnectStatusLazily(tryCountUntilFound = 3) {
    setTimeout(() => {
        spotifyConnectStatusHandler(tryCountUntilFound);
    }, 10000);
}

async function spotifyConnectStatusHandler(tryCountUntilFound) {
    let serverIsOnline = await serverIsAvailable();
    let oauth = await getSpotifyOauth(serverIsOnline);
    if (!oauth) {
        // try again if the count is not zero
        if (tryCountUntilFound > 0) {
            tryCountUntilFound -= 1;
            refetchSpotifyConnectStatusLazily(tryCountUntilFound);
        }
    } else {
        // oauth is not null, initialize spotify
        MusicStoreManager.getInstance().initializeSpotify();
    }
}

export function refetchUserStatusLazily(tryCountUntilFoundUser = 3) {
    setTimeout(() => {
        userStatusFetchHandler(tryCountUntilFoundUser);
    }, 10000);
}

async function userStatusFetchHandler(tryCountUntilFoundUser) {
    let serverIsOnline = await serverIsAvailable();
    let userStatus = await getUserStatus(serverIsOnline);
    if (!userStatus.loggedIn) {
        // try again if the count is not zero
        if (tryCountUntilFoundUser > 0) {
            tryCountUntilFoundUser -= 1;
            refetchUserStatusLazily(tryCountUntilFoundUser);
        }
    }
}

export async function sendHeartbeat(reason, serverIsOnline) {
    let jwt = getItem("jwt");
    if (serverIsOnline && jwt) {
        const version = `${env.appName}_${getVersion()}`;
        let heartbeat = {
            pluginId: PLUGIN_ID,
            os: getOs(),
            start: nowInSecs(),
            version,
            hostname: await getHostname(),
            session_ctime: getSessionFileCreateTime(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            trigger_annotation: reason,
            editor_token: getEditorSessionToken()
        };
        let api = `/data/heartbeat`;
        softwarePost(api, heartbeat, jwt).then(async resp => {
            if (!isResponseOk(resp)) {
                logIt("unable to send heartbeat ping");
            }
        });
    }
}

export async function handleCodeTimeLogin() {
    if (!(await serverIsAvailable())) {
        showOfflinePrompt(false);
    } else {
        let loginUrl = await buildLoginUrl();
        launchWebUrl(loginUrl);
        // retry 10 times, each retry is 10 seconds long
        refetchUserStatusLazily(10);
    }
}

export async function handleKpmClickedEvent() {
    let serverIsOnline = await serverIsAvailable();
    // {loggedIn: true|false}
    let userStatus = await getUserStatus(serverIsOnline);
    let webUrl = await buildWebDashboardUrl();

    if (!userStatus.loggedIn) {
        webUrl = await buildLoginUrl();
        refetchUserStatusLazily(10);
    }
    launchWebUrl(webUrl);
}
