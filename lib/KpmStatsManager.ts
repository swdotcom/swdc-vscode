import { window, workspace } from "vscode";
import { NOT_NOW_LABEL, LOGIN_LABEL } from "./Constants";
import {
    getItem,
    showStatus,
    humanizeMinutes,
    getDashboardFile,
    isFileOpen,
    launchWebUrl
} from "./Util";
import { fetchCodeTimeMetricsDashboard, buildLoginUrl } from "./MenuManager";
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
    // Show the dialog if the user is not authenticated but online,
    // and it's past the threshold time and the confirm window is null
    //
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
                setTimeout(() => {
                    getUserStatus();
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

    if (result === "ok") {
        let filePath = getDashboardFile();
        if (isFileOpen(filePath)) {
            fetchCodeTimeMetricsDashboard();
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

                // only show average in status bar if enabled in settings and its nonzero
                let showAverage = workspace.getConfiguration().get("showAverage");
                if (showAverage && averageDailyMinutes > 0) {
                    msg += ` | Avg: ${averageDailyMinutesTime}`;
                }

                // only update status bar metrics updates if enabled in settings
                let showStatusBar = workspace.getConfiguration().get("showStatusBar");
                if (showStatusBar) {
                    showStatus(msg, null);
                } else {
                    showStatus("Code Time", "Update your settings to see metrics in your status bar.");
                }

                return "ok";
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
