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
    showStatus,
    getSoftwareSessionFile,
    humanizeMinutes,
    isCodeTimeMetricsFocused
} from "./Util";
import { displayCodeTimeMetricsDashboard } from "./MenuManager";
import { isTelemetryOn, handleKpmClickedEvent } from "../extension";
import {
    serverIsAvailable,
    checkTokenAvailability,
    createAnonymousUser,
    isRegisteredUser
} from "./DataController";
import { isResponseOk, isUserDeactivated, softwareGet } from "./HttpClient";

const fs = require("fs");

let confirmWindow = null;
let lastAuthenticationCheckTime = -1;

/**
 * check if the user needs to see the login prompt or not
 */
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

    const lastUpdateTime = getItem("vscode_lastUpdateTime");
    const serverAvailable = await serverIsAvailable();
    const registeredUser = await isRegisteredUser();

    if (
        serverAvailable &&
        !lastUpdateTime &&
        !registeredUser &&
        !confirmWindow
    ) {
        //lkjflkjsdlkslksdlkfj
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
                    setTimeout(() => {
                        checkTokenAvailability();
                    }, 20000);
                }
                confirmWindow = null;
            });
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

export async function fetchDailyKpmSessionInfo() {
    if (!isTelemetryOn()) {
        // telemetry is paused
        return;
    }

    // make sure we send the beginning of the day
    let result = await getSessionStatus();

    if (result === "ok") {
        let alreadyFocused = isCodeTimeMetricsFocused();
        if (alreadyFocused) {
            // it currently focuses the tab, comment out until update this to not focus the tab
            displayCodeTimeMetricsDashboard();
        }
    }
}

async function getSessionStatus() {
    let result = await softwareGet(`/sessions?summary=true`, getItem("jwt"))
        .then(resp => {
            if (isResponseOk(resp)) {
                const sessions = resp.data;
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
                return "ok";
            } else if (!isUserDeactivated(resp)) {
                checkTokenAvailability();
            }
            return "notok";
        })
        .catch(err => {
            console.log(
                "Code Time: error fetching session kpm info: ",
                err.message
            );
            return "error";
        });
    return result;
}
