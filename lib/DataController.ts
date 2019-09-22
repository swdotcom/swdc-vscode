import { workspace, ConfigurationTarget, env, window, commands } from "vscode";

import {
    softwareGet,
    softwarePut,
    isResponseOk,
    softwarePost
} from "./HttpClient";
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
    isMusicTime,
    showStatus,
    getPluginId,
    isCodeTime,
    logEvent,
    getOffsetSecends
} from "./Util";
import {
    requiresSpotifyAccessInfo,
    getSpotifyLikedSongs,
    Track,
    getTopSpotifyTracks
} from "cody-music";
import {
    updateShowMusicMetrics,
    buildWebDashboardUrl,
    fetchCodeTimeMetricsDashboard
} from "./MenuManager";
import {
    getSessionSummaryData,
    updateStatusBarWithSummaryData,
    clearSessionSummaryData,
    saveSessionSummaryToDisk
} from "./OfflineManager";
import { MusicManager } from "./music/MusicManager";
const fs = require("fs");

let loggedInCacheState = null;
let initializedPrefs = false;
let serverAvailable = true;
let serverAvailableLastCheck = 0;
let toggleFileEventLogging = null;

// batch offline payloads in 50. backend has a 100k body limit
const batch_limit = 50;

export function getLoggedInCacheState() {
    return loggedInCacheState;
}

export function getToggleFileEventLoggingState() {
    if (toggleFileEventLogging === null) {
        toggleFileEventLogging = workspace
            .getConfiguration()
            .get("toggleFileEventLogging");
    }
    return toggleFileEventLogging;
}

export async function serverIsAvailable() {
    let nowSec = nowInSecs();
    let diff = nowSec - serverAvailableLastCheck;
    if (serverAvailableLastCheck === 0 || diff > 60) {
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

export async function sendBatchPayload(batch) {
    await softwarePost("/data/batch", batch, getItem("jwt")).catch(e => {
        logIt(`Unable to send plugin data batch, error: ${e.message}`);
    });
}

/**
 * send the offline data
 */
export async function sendOfflineData() {
    let isonline = await serverIsAvailable();
    if (!isonline) {
        return;
    }
    const dataStoreFile = getSoftwareDataStoreFile();
    try {
        if (fs.existsSync(dataStoreFile)) {
            const content = fs.readFileSync(dataStoreFile).toString();
            // we're online so just delete the datastore file
            deleteFile(getSoftwareDataStoreFile());
            if (content) {
                logEvent(`sending batch payloads: ${content}`);
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
            }
        }
    } catch (e) {
        //
    }

    // clear the stats cache
    clearSessionSummaryData();

    // update the statusbar
    await fetchSessionSummaryInfo(true /*forceRefresh*/);
}

/**
 * send any music tracks
 */
export async function sendMusicData(trackData) {
    if (trackData.available_markets) {
        delete trackData.available_markets;
    }
    if (trackData.images) {
        delete trackData.images;
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
    let api = `/music/session`;
    return softwarePost(api, trackData, getItem("jwt"))
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

export async function getSlackOauth(serverIsOnline) {
    let jwt = getItem("jwt");
    if (serverIsOnline && jwt) {
        let user = await getUser(serverIsOnline, jwt);
        if (user && user.oauths && user.oauths.Slack) {
            /**
             * Slack:
             * {name, email, login, slack_id, permissions, slack_scopes, slack_access_token}
             */

            return user.oauths.Slack;
        }
    }
}

export async function getSpotifyOauth(serverIsOnline) {
    let jwt = getItem("jwt");
    if (serverIsOnline && jwt) {
        let user = await getSpotifyUser(serverIsOnline, jwt);
        if (user && user.auths) {
            /**
             * Spotify:
             * {email, login, name, permissions,
             *  spotify_access_token, spotify_id, spotify_refresh_token}
             */
            // get the one that is "spotify"
            for (let i = 0; i < user.auths.length; i++) {
                if (user.auths[i].type === "spotify") {
                    // update jwt to what the jwt is for this spotify user
                    setItem("name", user.email);
                    setItem("jwt", user.plugin_jwt);
                    // update it to null, they've logged in
                    setItem("check_status", null);

                    return { loggedOn: true, state: "OK", auth: user.auths[i] };
                }
            }
        }
    }
    return { loggedOn: false, state: "UNKNOWN", auth: null };
}

async function isLoggedOn(serverIsOnline) {
    let jwt = getItem("jwt");
    if (serverIsOnline && jwt) {
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

                let checkStatus = getItem("check_status");
                if (checkStatus) {
                    // update it to null, they've logged in
                    setItem("check_status", null);
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
    if (loggedInCacheState !== null && loggedInCacheState === true) {
        // commands.executeCommand("setContext", "codetime:loggedIn", true);
        return { loggedIn: true };
    }

    let loggedIn = false;
    if (serverIsOnline) {
        // refetch the jwt then check if they're logged on
        let loggedInResp = null;
        if (isCodeTime()) {
            loggedInResp = await isLoggedOn(serverIsOnline);
        } else {
            loggedInResp = await getSpotifyOauth(serverIsOnline);
        }
        // set the loggedIn bool value
        loggedIn = loggedInResp.loggedOn;
    }

    logIt(`Checking login status, logged in: ${loggedIn}`);

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

    if (
        serverIsOnline &&
        loggedInCacheState !== null &&
        loggedInCacheState !== loggedIn
    ) {
        sendHeartbeat(`STATE_CHANGE:LOGGED_IN:${loggedIn}`, serverIsOnline);
        setTimeout(() => {
            // update the status bar
            // clear the stats cache
            clearSessionSummaryData();

            // update the statusbar
            fetchSessionSummaryInfo();
        }, 1000);

        if (requiresSpotifyAccessInfo() && isMusicTime()) {
            // check if they have a connected spotify auth
            setTimeout(() => {
                refetchSpotifyConnectStatusLazily(1);
            }, 1000);
        }
    }

    loggedInCacheState = loggedIn;

    return userStatus;
}

export async function getSpotifyUser(serverIsOnline, jwt) {
    if (jwt && serverIsOnline) {
        const api = `/auth/spotify/user`;
        const resp = await softwareGet(api, jwt);
        if (isResponseOk(resp)) {
            if (resp && resp.data) {
                return resp.data;
            }
        }
    }
    return null;
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
                    // await workspace
                    //     .getConfiguration()
                    //     .update(
                    //         "showMusicMetrics",
                    //         prefsShowMusic,
                    //         ConfigurationTarget.Global
                    //     );
                    // updateShowMusicMetrics(prefsShowMusic);
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
                    // await workspace
                    //     .getConfiguration()
                    //     .update(
                    //         "showWeeklyRanking",
                    //         prefsShowRank,
                    //         ConfigurationTarget.Global
                    //     );
                }
            }
        }
    }
}

async function sendPreferencesUpdate(userId, userPrefs) {
    let api = `/users/${userId}`;
    // let showMusicMetrics = workspace.getConfiguration().get("showMusicMetrics");
    let showGitMetrics = workspace.getConfiguration().get("showGitMetrics");
    // let showWeeklyRanking = workspace
    //     .getConfiguration()
    //     .get("showWeeklyRanking");
    // userPrefs["showMusic"] = showMusicMetrics;
    userPrefs["showGit"] = showGitMetrics;
    // userPrefs["showRank"] = showWeeklyRanking;

    // updateShowMusicMetrics(showMusicMetrics);

    // update the preferences
    // /:id/preferences
    api = `/users/${userId}/preferences`;
    let resp = await softwarePut(api, userPrefs, getItem("jwt"));
    if (isResponseOk(resp)) {
        logIt("update user code time preferences");
    }
}

export async function updatePreferences() {
    toggleFileEventLogging = workspace
        .getConfiguration()
        .get("toggleFileEventLogging");

    // let showMusicMetrics = workspace.getConfiguration().get("showMusicMetrics");
    let showGitMetrics = workspace.getConfiguration().get("showGitMetrics");
    // let showWeeklyRanking = workspace
    //     .getConfiguration()
    //     .get("showWeeklyRanking");

    // updateShowMusicMetrics(showMusicMetrics);

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

                if (prefsShowGit === null || prefsShowGit !== showGitMetrics) {
                    await sendPreferencesUpdate(parseInt(user.id, 10), prefs);
                }
            }
        }
    }
}

export function refetchSlackConnectStatusLazily(tryCountUntilFound = 20) {
    setTimeout(() => {
        slackConnectStatusHandler(tryCountUntilFound);
    }, 10000);
}

async function slackConnectStatusHandler(tryCountUntilFound) {
    let serverIsOnline = await serverIsAvailable();
    let oauth = await getSlackOauth(serverIsOnline);
    if (!oauth) {
        // try again if the count is not zero
        if (tryCountUntilFound > 0) {
            tryCountUntilFound -= 1;
            refetchSlackConnectStatusLazily(tryCountUntilFound);
        }
    } else {
        // oauth is not null, initialize slack
        await MusicManager.getInstance().updateSlackAccessInfo(oauth);

        window.showInformationMessage(`Successfully connected to Slack`);

        setTimeout(() => {
            commands.executeCommand("musictime.refreshPlaylist");
        }, 1000);
    }
}

export function refetchSpotifyConnectStatusLazily(tryCountUntilFound = 20) {
    setTimeout(() => {
        spotifyConnectStatusHandler(tryCountUntilFound);
    }, 10000);
}

async function spotifyConnectStatusHandler(tryCountUntilFound) {
    let serverIsOnline = await serverIsAvailable();
    let oauthResult = await getSpotifyOauth(serverIsOnline);
    if (!oauthResult.auth) {
        // try again if the count is not zero
        if (tryCountUntilFound > 0) {
            tryCountUntilFound -= 1;
            refetchSpotifyConnectStatusLazily(tryCountUntilFound);
        }
    } else {
        const musicMgr = MusicManager.getInstance();
        // oauth is not null, initialize spotify
        await musicMgr.updateSpotifyAccessInfo(oauthResult.auth);
        // update the login status
        await getUserStatus(serverIsOnline);
        window.showInformationMessage(`Successfully connected to Spotify`);

        // send the "Liked Songs" to software app so we can be in sync
        await seedLikedSongsToSoftware();

        // send the top spotify songs from the users playlists to help seed song sessions
        await seedTopSpotifySongs();

        setTimeout(() => {
            musicMgr.clearSpotify();
            commands.executeCommand("musictime.refreshPlaylist");
        }, 1000);
    }
}

async function seedLikedSongsToSoftware() {
    // send the "Liked Songs" to software app so we can be in sync
    let tracks: Track[] = await getSpotifyLikedSongs();
    if (tracks && tracks.length > 0) {
        let uris = tracks.map(track => {
            return track.uri;
        });
        const api = `/music/liked/tracks?type=spotify`;
        await softwarePut(api, { liked: true, uris }, getItem("jwt"));
    }
}

async function seedTopSpotifySongs() {
    /**
     * album:Object {album_type: "ALBUM", artists: Array(1), available_markets: Array(79), …}
    artists:Array(1) [Object]
    available_markets:Array(79) ["AD", "AE", "AR", …]
    disc_number:1
    duration_ms:251488
    explicit:false
    external_ids:Object {isrc: "GBF088590110"}
    external_urls:Object {spotify: "https://open.spotify.com/track/4RvWPyQ5RL0ao9LPZeS…"}
    href:"https://api.spotify.com/v1/tracks/4RvWPyQ5RL0ao9LPZeSouE"

     */
    const fileMetrics = {
        add: 0,
        paste: 0,
        delete: 0,
        netkeys: 0,
        linesAdded: 0,
        linesRemoved: 0,
        open: 0,
        close: 0,
        keystrokes: 0,
        syntax: "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: getOffsetSecends() / 60,
        pluginId: getPluginId(),
        os: getOs(),
        version: getVersion(),
        source: {},
        repoFileCount: 0,
        repoContributorCount: 0
    };
    let tracks: Track[] = await getTopSpotifyTracks();
    if (tracks && tracks.length > 0) {
        // add the empty file metrics
        const tracksToSave = tracks.map(track => {
            return {
                ...track,
                ...fileMetrics
            };
        });

        let api = `/music/seedTopSpotifyTracks`;
        return softwarePut(api, { tracks: tracksToSave }, getItem("jwt"))
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
}

export function refetchUserStatusLazily(tryCountUntilFoundUser = 20) {
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
        } else {
            // set the check_status to true
            setItem("check_status", true);
        }
    } else {
        let message = "";
        if (isCodeTime()) {
            message = "Successfully logged on to Code Time";
        } else if (isMusicTime()) {
            message = "Successfully logged on to Music Time";
            MusicManager.getInstance().fetchSavedPlaylists(serverIsOnline);
            setTimeout(() => {
                commands.executeCommand("musictime.refreshPlaylist");
            }, 1000);
        } else {
            message = "Successfully logged on";
        }
        window.showInformationMessage(message);
    }
}

export async function sendHeartbeat(reason, serverIsOnline) {
    let jwt = getItem("jwt");
    if (serverIsOnline && jwt) {
        let heartbeat = {
            pluginId: getPluginId(),
            os: getOs(),
            start: nowInSecs(),
            version: getVersion(),
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
        // each retry is 10 seconds long
        refetchUserStatusLazily();
    }
}

export async function handleKpmClickedEvent() {
    let serverIsOnline = await serverIsAvailable();
    // {loggedIn: true|false}
    let userStatus = await getUserStatus(serverIsOnline);
    let webUrl = await buildWebDashboardUrl();

    if (!userStatus.loggedIn) {
        webUrl = await buildLoginUrl();
        refetchUserStatusLazily();
    }
    launchWebUrl(webUrl);
}

export async function fetchSessionSummaryInfo(forceRefresh = false) {
    // make sure we send the beginning of the day
    let result = await getSessionSummaryStatus(forceRefresh);

    if (result.status === "OK") {
        fetchCodeTimeMetricsDashboard(result.data);
    }
}

export async function getSessionSummaryStatus(forceRefresh = false) {
    let sessionSummaryData = getSessionSummaryData();
    if (sessionSummaryData.currentDayMinutes === 0 || forceRefresh) {
        let serverIsOnline = await serverIsAvailable();
        if (!serverIsOnline) {
            showStatus(
                "Code Time",
                "The code time app is currently not available, we'll try retrieving your dashboard metrics again later."
            );
            return { data: sessionSummaryData, status: "CONN_ERR" };
        }
        let result = await softwareGet(`/sessions/summary`, getItem("jwt"))
            .then(resp => {
                if (isResponseOk(resp)) {
                    // update the cache summary
                    sessionSummaryData = resp.data;
                    // update the file
                    saveSessionSummaryToDisk(sessionSummaryData);
                    // update the status bar
                    updateStatusBarWithSummaryData();
                    return { data: sessionSummaryData, status: "OK" };
                }
                return { status: "NO_DATA", data: sessionSummaryData };
            })
            .catch(err => {
                updateStatusBarWithSummaryData();
                return { status: "ERROR", data: sessionSummaryData };
            });
        return result;
    } else {
        updateStatusBarWithSummaryData();
        return { data: sessionSummaryData, status: "OK" };
    }
}
