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
    isWindows,
    isMac,
    nowInSecs,
    showStatus,
    getSoftwareSessionFile
} from "./Util";
import {
    isTelemetryOn,
    isAuthenticated,
    handleKpmClickedEvent
} from "../extension";
import { isResponseOk, softwareGet } from "./HttpClient";

const cp = require("child_process");
const fs = require("fs");

let confirmWindow = null;
let lastAuthenticationCheckTime = -1;
let kpmInfo = {};

async function serverIsAvailable() {
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
            "To see your coding data in Software.com, please log in to your account.";
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
                }, 15000);
            });
    } else if (!authenticated) {
        showErrorStatus();
        checkTokenAvailability();
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
            if (isResponseOk(resp)) {
                if (resp.data) {
                    setItem("jwt", resp.data.jwt);
                    setItem("user", resp.data.user);
                    setItem("vscode_lastUpdateTime", Date.now());
                }
                // fetch kpm data
                setTimeout(() => {
                    fetchDailyKpmSessionInfo();
                }, 1000);
            } else {
                console.log("Software.com: unable to obtain session token");
                // try again in 2 minutes
                setTimeout(() => {
                    checkTokenAvailability();
                }, 1000 * 45);
            }
        })
        .catch(err => {
            console.log(
                "Software.com: error confirming plugin token: ",
                err.message
            );
        });
}

export function launchWebUrl(url) {
    let open = "open";
    let args = [`${url}`];
    if (isWindows()) {
        open = "cmd";
        // adds the following args to the beginning of the array
        args.unshift("/c", "start", '""');
    } else if (!isMac()) {
        open = "xdg-open";
    }

    let process = cp.execFile(open, args, (error, stdout, stderr) => {
        if (error != null) {
            console.log(
                "Software.com: Error launching Software authentication: ",
                error.toString()
            );
        }
    });
}

export function fetchDailyKpmSessionInfo() {
    if (!isTelemetryOn()) {
        // telemetry is paused
        return;
    }

    const fromSeconds = nowInSecs();
    softwareGet(`/sessions?from=${fromSeconds}&summary=true`, getItem("jwt"))
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

                let sessionTimeIcon = "";
                if (currentSessionGoalPercent > 0) {
                    if (currentSessionGoalPercent < 0.45) {
                        sessionTimeIcon = "❍";
                    } else if (currentSessionGoalPercent < 0.7) {
                        sessionTimeIcon = "◒";
                    } else if (currentSessionGoalPercent < 0.95) {
                        sessionTimeIcon = "◍";
                    } else {
                        sessionTimeIcon = "●";
                    }
                }
                // const avgKpm = totalKpm > 0 ? totalKpm / sessionLen : 0;
                kpmInfo["kpmAvg"] = lastKpm.toFixed(0);
                kpmInfo["sessionTime"] = sessionTime;
                if (lastKpm > 0 || currentSessionMinutes > 0) {
                    let kpmMsg = `${kpmInfo["kpmAvg"]} KPM`;
                    let sessionMsg = `${kpmInfo["sessionTime"]}`;

                    // if inFlow then show the rocket
                    if (inFlow) {
                        kpmMsg = "🚀" + " " + kpmMsg;
                    }
                    // if we have session avg percent info, show the icon that corresponds
                    if (sessionTimeIcon) {
                        sessionMsg = sessionTimeIcon + " " + sessionMsg;
                    }

                    let fullMsg = "<S> " + kpmMsg + ", " + sessionMsg;
                    showStatus(fullMsg, null);
                } else {
                    showStatus("Software.com", null);
                }
            } else {
                checkTokenAvailability();
            }
        })
        .catch(err => {
            console.log(
                "Software.com: error fetching session kpm info: ",
                err.message
            );
        });
}

function humanizeMinutes(min) {
    min = parseInt(min, 0) || 0;
    let str = "";
    if (min === 60) {
        str = "1 hr";
    } else if (min > 60) {
        str = (min / 60).toFixed(2) + " hrs";
    } else if (min === 1) {
        str = "1 min";
    } else {
        // less than 60 seconds
        str = min.toFixed(0) + " min";
    }
    return str;
}
