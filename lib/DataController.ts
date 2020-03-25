import { workspace, ConfigurationTarget, window, commands } from "vscode";

import {
    softwareGet,
    softwarePut,
    isResponseOk,
    softwarePost,
    serverIsAvailable
} from "./http/HttpClient";
import {
    getItem,
    setItem,
    nowInSecs,
    getSessionFileCreateTime,
    getOs,
    getVersion,
    getHostname,
    getEditorSessionToken,
    buildLoginUrl,
    launchWebUrl,
    logIt,
    getPluginId,
    getCommitSummaryFile,
    getSummaryInfoFile,
    getSectionHeader,
    humanizeMinutes,
    getDashboardRow,
    getDashboardFile,
    getProjectCodeSummaryFile,
    isLinux,
    formatNumber
} from "./Util";
import { buildWebDashboardUrl } from "./menu/MenuManager";
import { DEFAULT_SESSION_THRESHOLD_SECONDS } from "./Constants";
import { LoggedInState, SessionSummary } from "./model/models";
import { CacheManager } from "./cache/CacheManager";
import { WallClockManager } from "./managers/WallClockManager";
import { getSessionSummaryData } from "./storage/SessionSummaryData";
import TeamMember from "./model/TeamMember";

const fs = require("fs");
const moment = require("moment-timezone");

const cacheMgr: CacheManager = CacheManager.getInstance();

let toggleFileEventLogging = null;

let userFetchTimeout = null;

export function getConnectState() {
    return cacheMgr.get("connectState") || new LoggedInState();
}

export function getToggleFileEventLoggingState() {
    if (toggleFileEventLogging === null) {
        toggleFileEventLogging = workspace
            .getConfiguration()
            .get("toggleFileEventLogging");
    }
    return toggleFileEventLogging;
}

export async function getRegisteredTeamMembers(
    identifier
): Promise<TeamMember[]> {
    const encodedIdentifier = encodeURIComponent(identifier);
    const api = `/team/members?identifier=${encodedIdentifier}`;

    let teamMembers: TeamMember[] = [];
    // returns: [{email, name, identifier},..]
    const resp = await softwareGet(api, getItem("jwt"));
    if (isResponseOk(resp)) {
        teamMembers = resp.data;
    }
    return teamMembers;
}

export async function sendTeamInvite(identifier, emails) {
    const payload = {
        identifier,
        emails
    };
    const api = `/team/invite`;
    const resp = await softwarePost(api, payload, getItem("jwt"));
    if (isResponseOk(resp)) {
        window.showInformationMessage("Sent team invitation.");
    } else {
        window.showErrorMessage(resp.data.message);
    }
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

export async function isLoggedOn(serverIsOnline) {
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
                if (email && sessionEmail !== email) {
                    setItem("name", email);
                }
                // check the jwt
                let pluginJwt = resp.data.jwt;
                if (pluginJwt && pluginJwt !== jwt) {
                    // update it
                    setItem("jwt", pluginJwt);
                }

                // if we need the user it's "resp.data.user"

                return { loggedOn: true, state };
            }
            // return the state that is returned
            return { loggedOn: false, state };
        }
    }
    return { loggedOn: false, state: "UNKNOWN" };
}

export function clearCachedLoggedInState() {
    cacheMgr.set("connectState", null);
}

export async function getCachedLoggedInState(): Promise<LoggedInState> {
    let connectState: LoggedInState = cacheMgr.get("connectState");
    if (!connectState || !connectState.loggedIn) {
        const serverIsOnline = await serverIsAvailable();
        // doesn't exist yet, use the api
        await getUserStatus();
    }
    return cacheMgr.get("connectState");
}

/**
 * return whether the user is logged on or not
 * {loggedIn: true|false}
 */
export async function getUserStatus() {
    const expireInSec = 60 * 30;
    let connectState: LoggedInState = new LoggedInState();
    const name = getItem("name");
    if (name) {
        // name/email is set, they're connected
        connectState.loggedIn = true;
        cacheMgr.set("connectState", connectState, expireInSec);
        return connectState;
    }

    const serverIsOnline = await serverIsAvailable();

    let loggedIn = false;
    if (serverIsOnline) {
        // refetch the jwt then check if they're logged on
        const loggedInResp = await isLoggedOn(serverIsOnline);
        // set the loggedIn bool value
        loggedIn = loggedInResp.loggedOn;
    }

    connectState = new LoggedInState();
    connectState.loggedIn = loggedIn;

    if (serverIsOnline && loggedIn) {
        if (loggedIn) {
            // they've logged in, update the preferences
            initializePreferences(serverIsOnline);
        }
    }

    cacheMgr.set("connectState", connectState, expireInSec);
    return connectState;
}

export async function getUser(serverIsOnline, jwt) {
    let connectState: LoggedInState = cacheMgr.get("connectState");
    if (jwt && serverIsOnline) {
        let api = `/users/me`;
        let resp = await softwareGet(api, jwt);
        if (isResponseOk(resp)) {
            if (resp && resp.data && resp.data.data) {
                const user = resp.data.data;
                if (user.registered === 1) {
                    // update jwt to what the jwt is for this spotify user
                    setItem("name", user.email);

                    if (!connectState) {
                        connectState = new LoggedInState();
                    }
                    connectState.loggedIn = true;
                    cacheMgr.set("connectState", connectState);
                }
                return user;
            }
        }
    }
    return null;
}

export async function initializePreferences(serverIsOnline) {
    let jwt = getItem("jwt");
    // use a default if we're unable to get the user or preferences
    let sessionThresholdInSec = DEFAULT_SESSION_THRESHOLD_SECONDS;

    if (jwt && serverIsOnline) {
        let user = await getUser(serverIsOnline, jwt);
        if (user && user.preferences) {
            // obtain the session threshold in seconds "sessionThresholdInSec"
            sessionThresholdInSec =
                user.preferences.sessionThresholdInSec ||
                DEFAULT_SESSION_THRESHOLD_SECONDS;

            let userId = parseInt(user.id, 10);
            let prefs = user.preferences;
            let prefsShowGit =
                prefs.showGit !== null && prefs.showGit !== undefined
                    ? prefs.showGit
                    : null;
            let prefsShowRank =
                prefs.showRank !== null && prefs.showRank !== undefined
                    ? prefs.showRank
                    : null;

            if (prefsShowGit === null || prefsShowRank === null) {
                await sendPreferencesUpdate(userId, prefs);
            } else {
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

    // update the session threshold in seconds config
    setItem("sessionThresholdInSec", sessionThresholdInSec);
}

async function sendPreferencesUpdate(userId, userPrefs) {
    let api = `/users/${userId}`;

    let showGitMetrics = workspace.getConfiguration().get("showGitMetrics");
    // let showWeeklyRanking = workspace
    //     .getConfiguration()
    //     .get("showWeeklyRanking");
    userPrefs["showGit"] = showGitMetrics;
    // userPrefs["showRank"] = showWeeklyRanking;

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

    let showGitMetrics = workspace.getConfiguration().get("showGitMetrics");
    // let showWeeklyRanking = workspace
    //     .getConfiguration()
    //     .get("showWeeklyRanking");

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

export function refetchUserStatusLazily(
    tryCountUntilFoundUser = 43,
    interval = 10000
) {
    if (userFetchTimeout) {
        return;
    }
    userFetchTimeout = setTimeout(() => {
        userFetchTimeout = null;
        userStatusFetchHandler(tryCountUntilFoundUser, interval);
    }, interval);
}

async function userStatusFetchHandler(tryCountUntilFoundUser, interval) {
    let serverIsOnline = await serverIsAvailable();
    let userStatus = await getUserStatus();
    if (!userStatus.loggedIn) {
        // try again if the count is not zero
        if (tryCountUntilFoundUser > 0) {
            tryCountUntilFoundUser -= 1;
            refetchUserStatusLazily(tryCountUntilFoundUser, interval);
        }
    } else {
        clearCachedLoggedInState();

        sendHeartbeat(`STATE_CHANGE:LOGGED_IN:true`, serverIsOnline);

        const message = "Successfully logged on to Code Time";
        window.showInformationMessage(message);

        commands.executeCommand("codetime.sendOfflineData");

        commands.executeCommand("codetime.refreshCodetimeMenuTree");
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

export async function handleKpmClickedEvent() {
    let serverIsOnline = await serverIsAvailable();
    // {loggedIn: true|false}
    let userStatus = await getUserStatus();
    let webUrl = await buildWebDashboardUrl();

    if (!userStatus.loggedIn) {
        webUrl = await buildLoginUrl(serverIsOnline);
        refetchUserStatusLazily();
    } else {
        // add the token=jwt
        const jwt = getItem("jwt");
        const encodedJwt = encodeURIComponent(jwt);
        webUrl = `${webUrl}?token=${encodedJwt}`;
    }
    launchWebUrl(webUrl);
}

export async function writeCommitSummaryData() {
    const filePath = getCommitSummaryFile();
    const serverIsOnline = await serverIsAvailable();
    if (serverIsOnline) {
        const result = await softwareGet(
            `/dashboard/commits`,
            getItem("jwt")
        ).catch(err => {
            return null;
        });
        if (isResponseOk(result) && result.data) {
            // get the string content out
            const content = result.data;
            fs.writeFileSync(filePath, content, err => {
                if (err) {
                    logIt(
                        `Error writing to the weekly commit summary content file: ${err.message}`
                    );
                }
            });
        }
    }

    if (!fs.existsSync(filePath)) {
        // just create an empty file
        fs.writeFileSync(filePath, "WEEKLY COMMIT SUMMARY", err => {
            if (err) {
                logIt(
                    `Error writing to the weekly commit summary content file: ${err.message}`
                );
            }
        });
    }
}

export async function writeProjectCommitDashboard(
    type = "lastWeek",
    projectIds = []
) {
    const qryStr = `?timeRange=${type}&projectIds=${projectIds.join(",")}`;
    const api = `/projects/codeSummary${qryStr}`;
    const result = await softwareGet(api, getItem("jwt"));
    let dashboardContent = "";
    // [{projectId, name, identifier, commits, files_changed, insertions, deletions, hours,
    //   keystrokes, characters_added, characters_deleted, lines_added, lines_removed},...]
    if (isResponseOk(result)) {
        const codeCommitData = result.data;
        // create the title
        const formattedDate = moment().format("ddd, MMM Do h:mma");
        dashboardContent = `CODE TIME PROJECT SUMMARY     (Last updated on ${formattedDate})`;
        dashboardContent += "\n\n";

        // create the header
        const { rangeStart, rangeEnd } = createStartEndRangeByType(type);

        if (codeCommitData && codeCommitData.length) {
            codeCommitData.forEach(el => {
                dashboardContent += getDashboardRow(
                    el.name,
                    `${rangeStart} to ${rangeEnd}`,
                    true
                );

                // hours
                const hours = humanizeMinutes(el.session_seconds / 60);
                dashboardContent += getDashboardRow("Code time", hours);

                // keystrokes
                const keystrokes = el.keystrokes
                    ? formatNumber(el.keystrokes)
                    : 0;
                dashboardContent += getDashboardRow("Keystrokes", keystrokes);

                // commits
                const commits = el.commits ? formatNumber(el.commits) : 0;
                dashboardContent += getDashboardRow("Commits", commits);

                // files_changed
                const files_changed = el.files_changed
                    ? formatNumber(el.files_changed)
                    : 0;
                dashboardContent += getDashboardRow(
                    "Files changed",
                    files_changed
                );

                // insertions
                const insertions = el.insertions
                    ? formatNumber(el.insertions)
                    : 0;
                dashboardContent += getDashboardRow("Insertions", insertions);

                // deletions
                const deletions = el.deletions ? formatNumber(el.deletions) : 0;
                dashboardContent += getDashboardRow("Deletions", deletions);

                dashboardContent += "\n";
            });
        } else {
            dashboardContent += "No data available";
        }

        dashboardContent += "\n";
    }

    const file = getProjectCodeSummaryFile();
    fs.writeFileSync(file, dashboardContent, err => {
        if (err) {
            logIt(
                `Error writing to the code time summary content file: ${err.message}`
            );
        }
    });
}

function createStartEndRangeByType(type = "lastWeek") {
    // default to "lastWeek"
    let startOf = moment()
        .startOf("week")
        .subtract(1, "week");
    let endOf = moment()
        .startOf("week")
        .subtract(1, "week")
        .endOf("week");

    if (type === "yesterday") {
        startOf = moment()
            .subtract(1, "day")
            .startOf("day");
        endOf = moment()
            .subtract(1, "day")
            .endOf("day");
    } else if (type === "currentWeek") {
        startOf = moment().startOf("week");
        endOf = moment();
    } else if (type === "lastMonth") {
        startOf = moment()
            .subtract(1, "month")
            .startOf("month");
        endOf = moment()
            .subtract(1, "month")
            .endOf("month");
    }

    return {
        rangeStart: startOf.format("MMM Do, YYYY"),
        rangeEnd: endOf.format("MMM Do, YYYY")
    };
}

export async function writeCodeTimeMetricsDashboard() {
    const summaryInfoFile = getSummaryInfoFile();
    const serverIsOnline = await serverIsAvailable();

    // write the code time metrics summary to the summaryInfo file
    if (serverIsOnline) {
        let showGitMetrics = workspace.getConfiguration().get("showGitMetrics");

        let api = `/dashboard?showMusic=false&showGit=${showGitMetrics}&showRank=false&linux=${isLinux()}&showToday=false`;
        const result = await softwareGet(api, getItem("jwt"));

        if (isResponseOk(result)) {
            // get the string content out
            const content = result.data;
            fs.writeFileSync(summaryInfoFile, content, err => {
                if (err) {
                    logIt(
                        `Error writing to the code time summary content file: ${err.message}`
                    );
                }
            });
        }
    }

    // create the header
    let dashboardContent = "";
    const formattedDate = moment().format("ddd, MMM Do h:mma");
    dashboardContent = `CODE TIME          (Last updated on ${formattedDate})`;
    dashboardContent += "\n\n";

    const todayStr = moment().format("ddd, MMM Do");
    dashboardContent += getSectionHeader(`Today (${todayStr})`);

    // get the top section of the dashboard content (today's data)
    const sessionSummary: SessionSummary = getSessionSummaryData();
    if (sessionSummary) {
        const averageTimeStr = humanizeMinutes(
            sessionSummary.averageDailyMinutes
        );
        const currentDayMinutesStr = humanizeMinutes(
            sessionSummary.currentDayMinutes
        );
        let liveshareTimeStr = null;
        if (sessionSummary.liveshareMinutes) {
            liveshareTimeStr = humanizeMinutes(sessionSummary.liveshareMinutes);
        }
        const currentEditorMinutesStr = WallClockManager.getInstance().getHumanizedWcTime();
        dashboardContent += getDashboardRow(
            "Editor time today",
            currentEditorMinutesStr
        );
        dashboardContent += getDashboardRow(
            "Code time today",
            currentDayMinutesStr
        );
        dashboardContent += getDashboardRow("90-day avg", averageTimeStr);
        if (liveshareTimeStr) {
            dashboardContent += getDashboardRow("Live Share", liveshareTimeStr);
        }
        dashboardContent += "\n";
    }

    // get the summary info we just made a call for and add it to the dashboard content
    if (fs.existsSync(summaryInfoFile)) {
        const summaryContent = fs.readFileSync(summaryInfoFile).toString();

        // create the dashboard file
        dashboardContent += summaryContent;
    }

    // now write it all out to the dashboard file
    const dashboardFile = getDashboardFile();
    fs.writeFileSync(dashboardFile, dashboardContent, err => {
        if (err) {
            logIt(
                `Error writing to the code time dashboard content file: ${err.message}`
            );
        }
    });
}
