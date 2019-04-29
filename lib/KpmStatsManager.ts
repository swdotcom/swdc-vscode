import { window } from "vscode";
import { NOT_NOW_LABEL, LOGIN_LABEL } from "./Constants";
import {
    getItem,
    showStatus,
    humanizeMinutes,
    launchWebUrl,
    buildLoginUrl,
    logIt,
    isCodeTimeMetricsFocused
} from "./Util";
import { fetchCodeTimeMetricsDashboard } from "./MenuManager";
import {
    getUserStatus,
    refetchUserStatusLazily,
    serverIsAvailable
} from "./DataController";
import { isResponseOk, softwareGet } from "./HttpClient";

/**
 * check if the user needs to see the login prompt or not
 */
export async function showLoginPrompt() {
    let infoMsg =
        "To see your coding data in Code Time, please log in to your account.";
    // set the last update time so we don't try to ask too frequently
    window
        .showInformationMessage(infoMsg, ...[NOT_NOW_LABEL, LOGIN_LABEL])
        .then(async selection => {
            if (selection === LOGIN_LABEL) {
                let loginUrl = await buildLoginUrl();
                launchWebUrl(loginUrl);
                refetchUserStatusLazily(10);
                setTimeout(async () => {
                    let serverIsOnline = await serverIsAvailable();
                    getUserStatus(serverIsOnline);
                }, 15000);
            }
        });
}

export async function fetchDailyKpmSessionInfo() {
    let serverIsOnline = await serverIsAvailable();
    if (!serverIsOnline) {
        showStatus(
            "Code Time",
            "The code time app is currently not available, we'll try retrieving your dashboard metrics again later."
        );
        return;
    }

    // make sure we send the beginning of the day
    let result = await getSessionStatus();

    if (result === "ok" && isCodeTimeMetricsFocused()) {
        fetchCodeTimeMetricsDashboard();
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
                let msg = `${inFlowIcon}${currentDayMinutesTime}`;
                if (averageDailyMinutes > 0) {
                    msg += ` | ${averageDailyMinutesTime}`;
                }
                showStatus(msg, null);
                return "ok";
            }
            return "notok";
        })
        .catch(err => {
            logIt(`error fetching session kpm info: ${err.message}`);
            return "error";
        });
    return result;
}
