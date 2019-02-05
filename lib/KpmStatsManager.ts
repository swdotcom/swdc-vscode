import { window } from "vscode";
import {
    MILLIS_PER_MINUTE,
    NOT_NOW_LABEL,
    LOGIN_LABEL,
    SHORT_THRESHOLD_HOURS,
    LONG_THRESHOLD_HOURS,
    MILLIS_PER_HOUR
} from "./Constants";
import {
    getItem,
    setItem,
    showErrorStatus,
    showStatus,
    getSoftwareSessionFile,
    isEmptyObj,
    humanizeMinutes,
    isDashboardOpen
} from "./Util";
import { getTrackInfo } from "./MusicManager";
import { displayCodeTimeMetricsDashboard } from "./MenuManager";
import {
    isTelemetryOn,
    isAuthenticated,
    handleKpmClickedEvent
} from "../extension";
import {
    isResponseOk,
    isUserDeactivated,
    softwareGet,
    softwarePost
} from "./HttpClient";

const cp = require("child_process");
const fs = require("fs");

let confirmWindow = null;
let lastAuthenticationCheckTime = -1;
let kpmInfo = {};
let trackInfo = {};

export async function serverIsAvailable() {
    return await checkOnline();
}

async function checkOnline() {
    if (!isTelemetryOn()) {
        return true;
    }
    // non-authenticated ping, no need to set the Authorization header
    return isResponseOk(await softwareGet("/ping", null));
}

export async function chekUserAuthenticationStatus() {
    let nowMillis = Date.now();
    const sessionFile = getSoftwareSessionFile();
    // set the last auth check time to -1 if the sesison file doesn't yet exist
    const hasSessionFile = fs.existsSync(sessionFile);

    if (
        lastAuthenticationCheckTime !== -1 &&
        nowMillis - lastAuthenticationCheckTime < MILLIS_PER_MINUTE * 2
    ) {
        // it's less than 3 minutes, wait until the threshold has passed until we try again
        return;
    }
    lastAuthenticationCheckTime = nowMillis;

    const serverAvailablePromise = serverIsAvailable();
    const isAuthenticatedPromise = isAuthenticated();
    const pastThresholdTime = isPastTimeThreshold();

    const serverAvailable = await serverAvailablePromise;
    const authenticated = await isAuthenticatedPromise;

    if (
        serverAvailable &&
        !authenticated &&
        (pastThresholdTime || !hasSessionFile) &&
        !confirmWindow
    ) {
        //
        // Show the dialog if the user is not authenticated but online,
        // and it's past the threshold time and the confirm window is null
        //
        let infoMsg =
            "To see your coding data in Code Time, please log in to your account.";
        // set the last update time so we don't try to ask too frequently
        setItem("vscode_lastUpdateTime", Date.now());
        confirmWindow = window
            .showInformationMessage(infoMsg, ...[NOT_NOW_LABEL, LOGIN_LABEL])
            .then(selection => {
                if (selection === LOGIN_LABEL) {
                    handleKpmClickedEvent();
                }
                confirmWindow = null;
                setTimeout(() => {
                    checkTokenAvailability();
                }, 20000);
            });
    } else if (!authenticated) {
        showErrorStatus(null);
        setTimeout(() => {
            checkTokenAvailability();
        }, 10000);
    }
}

/**
 * Checks the last time we've updated the session info
 */
function isPastTimeThreshold() {
    const existingJwt = getItem("jwt");

    const thresholdHoursBeforeCheckingAgain = !existingJwt
        ? SHORT_THRESHOLD_HOURS
        : LONG_THRESHOLD_HOURS;
    const lastUpdateTime = getItem("vscode_lastUpdateTime");
    if (
        lastUpdateTime &&
        Date.now() - lastUpdateTime <
            MILLIS_PER_HOUR * thresholdHoursBeforeCheckingAgain
    ) {
        return false;
    }
    return true;
}

export function checkTokenAvailability() {
    if (!isTelemetryOn()) {
        return;
    }
    const tokenVal = getItem("token");

    if (!tokenVal) {
        return;
    }

    // need to get back...
    // response.data.user, response.data.jwt
    // non-authorization API
    softwareGet(`/users/plugin/confirm?token=${tokenVal}`, null)
        .then(resp => {
            if (
                isResponseOk(resp) &&
                resp.data &&
                resp.data.jwt &&
                resp.data.user
            ) {
                setItem("jwt", resp.data.jwt);
                setItem("user", resp.data.user);
                setItem("vscode_lastUpdateTime", Date.now());

                // fetch kpm data
                setTimeout(() => {
                    fetchDailyKpmSessionInfo();
                }, 1000);
            } else if (!isUserDeactivated(resp)) {
                console.log("Code Time: unable to obtain session token");
                // try again in 45 seconds
                setTimeout(() => {
                    checkTokenAvailability();
                }, 1000 * 45);
            } else if (isUserDeactivated(resp)) {
                console.log("Code Time: unable to obtain session token");
                // try again in a day
                setTimeout(() => {
                    checkTokenAvailability();
                }, 1000 * 60 * 60 * 24);
            }
        })
        .catch(err => {
            console.log(
                "Code Time: error confirming plugin token: ",
                err.message
            );
            setTimeout(() => {
                checkTokenAvailability();
            }, 1000 * 45);
        });
}

function sendMusicData(trackData) {
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

export function fetchDailyKpmSessionInfo() {
    if (!isTelemetryOn()) {
        // telemetry is paused
        return;
    }

    // make sure we send the beginning of the day
    softwareGet(`/sessions?summary=true`, getItem("jwt"))
        .then(resp => {
            if (isResponseOk(resp)) {
                const sessions = resp.data;
                const inFlow =
                    sessions.inFlow !== undefined && sessions.inFlow !== null
                        ? sessions.inFlow
                        : true;
                let lastKpm = sessions.lastKpm
                    ? parseInt(sessions.lastKpm, 10)
                    : 0;
                let currentSessionMinutes = sessions.currentSessionMinutes;
                let sessionTime = humanizeMinutes(currentSessionMinutes);

                let currentSessionGoalPercent = sessions.currentSessionGoalPercent
                    ? parseFloat(sessions.currentSessionGoalPercent)
                    : 0;

                let currentDayMinutes = sessions.currentDayMinutes;
                let currentDayMinutesTime = humanizeMinutes(currentDayMinutes);
                let averageDailyMinutes = sessions.averageDailyMinutes;
                let averageDailyMinutesTime = humanizeMinutes(
                    averageDailyMinutes
                );

                let inFlowIcon =
                    currentDayMinutes > averageDailyMinutes ? "🚀 " : "";
                let msg = `Code time: ${inFlowIcon}${currentDayMinutesTime}`;
                if (averageDailyMinutes > 0) {
                    msg += ` | Avg: ${averageDailyMinutesTime}`;
                }
                showStatus(msg, null);

                if (isDashboardOpen()) {
                    // it currently focuses the tab, comment out until update this to not focus the tab
                    displayCodeTimeMetricsDashboard();
                }
            } else if (!isUserDeactivated(resp)) {
                checkTokenAvailability();
            }
        })
        .catch(err => {
            console.log(
                "Code Time: error fetching session kpm info: ",
                err.message
            );
        });

    // setTimeout(() => {
    //     // is it taco time?
    //     if (isTacoTime()) {
    //         showTacoTime();
    //     }
    // }, 5000);
}

export function gatherMusicInfo() {
    const trackInfoDataP = getTrackInfo();
    trackInfoDataP
        .then(trackInfoData => {
            let d = new Date();
            // offset is the minutes from GMT. it's positive if it's before, and negative after
            const offset = d.getTimezoneOffset();
            const offset_sec = offset * 60;
            let nowInSec = Math.round(d.getTime() / 1000);
            // subtract the offset_sec (it'll be positive before utc and negative after utc)
            let localNowInSec = nowInSec - offset_sec;
            let state = "stopped";
            if (trackInfoData) {
                state = trackInfoData["state"] || "playing";
            }
            let isPaused =
                state.toLowerCase().indexOf("playing") !== -1 ? false : true;

            if (trackInfoData && trackInfoData["id"]) {
                // check if we have this track already in "trackInfo"
                let hasExistingTrackInfo = !isEmptyObj(trackInfo)
                    ? true
                    : false;
                let matchingTracks =
                    hasExistingTrackInfo &&
                    trackInfo["id"] === trackInfoData["id"]
                        ? true
                        : false;
                if (hasExistingTrackInfo && (!matchingTracks || isPaused)) {
                    // this means a new song has started, send a payload to complete
                    // the 1st one and another to start the next one
                    trackInfo["end"] = nowInSec - 1;
                    sendMusicData(trackInfo).then(result => {
                        if (!isPaused) {
                            // send the next payload starting the next song
                            trackInfo = {};
                            trackInfo = { ...trackInfoData };
                            trackInfo["start"] = nowInSec;
                            trackInfo["local_start"] = localNowInSec;
                            sendMusicData(trackInfo);
                        } else {
                            trackInfo = {};
                        }
                    });
                } else if (!hasExistingTrackInfo && !isPaused) {
                    // no previous track played, send this one to start it
                    trackInfo = { ...trackInfoData };
                    trackInfo["start"] = nowInSec;
                    trackInfo["local_start"] = localNowInSec;
                    sendMusicData(trackInfo);
                }
            } else if (!isEmptyObj(trackInfo)) {
                // end this song since we're not getting a current track
                // and the trackInfo is not empty
                trackInfo["end"] = nowInSec;
                sendMusicData(trackInfo).then(result => {
                    // clear out the trackInfo
                    trackInfo = {};
                });
            }
        })
        .catch(err => {
            //
        });
}
