import { workspace, window, commands } from "vscode";
import {
    softwareGet,
    softwarePut,
    isResponseOk,
} from "./http/HttpClient";
import {
    getItem,
    setItem,
    nowInSecs,
    buildLoginUrl,
    launchWebUrl,
    logIt,
    getCommitSummaryFile,
    getSummaryInfoFile,
    getDashboardFile,
    getProjectCodeSummaryFile,
    getProjectContributorCodeSummaryFile,
    isLinux,
    formatNumber,
    getRightAlignedTableHeader,
    getRowLabels,
    getTableHeader,
    getColumnHeaders,
    findFirstActiveDirectoryOrWorkspaceDirectory,
    getDailyReportSummaryFile,
} from "./Util";
import { buildWebDashboardUrl } from "./menu/MenuManager";
import { DEFAULT_SESSION_THRESHOLD_SECONDS } from "./Constants";
import { CommitChangeStats } from "./model/models";
import {
    clearSessionSummaryData,
} from "./storage/SessionSummaryData";
import {
    getTodaysCommits,
    getThisWeeksCommits,
    getYesterdaysCommits,
} from "./repo/GitUtil";
import { KpmProviderManager, treeDataUpdateCheck } from "./tree/KpmProviderManager";

const fileIt = require("file-it");
const moment = require("moment-timezone");

let toggleFileEventLogging = null;
let slackFetchTimeout = null;
let userFetchTimeout = null;

export function getToggleFileEventLoggingState() {
    if (toggleFileEventLogging === null) {
        toggleFileEventLogging = workspace
            .getConfiguration()
            .get("toggleFileEventLogging");
    }
    return toggleFileEventLogging;
}

/**
 * get the app jwt
 */
export async function getAppJwt() {
    // get the app jwt
    let resp = await softwareGet(`/data/apptoken?token=${nowInSecs()}`, null);
    if (isResponseOk(resp)) {
        return resp.data.jwt;
    }
    return null;
}

export async function getUserRegistrationState() {
    let jwt = getItem("jwt");
    if (jwt) {
        let api = "/users/plugin/state";
        let resp = await softwareGet(api, jwt);

        if (isResponseOk(resp) && resp.data) {
            // NOT_FOUND, ANONYMOUS, OK, UNKNOWN
            let state = resp.data.state ? resp.data.state : "UNKNOWN";
            if (state === "OK") {
                // set the authType based on...
                // github_access_token, google_access_token, or password being true
                if (resp.data.user) {
                    const user = resp.data.user;
                    if (user.github_access_token) {
                        setItem("authType", "github");
                    } else if (user.google_access_token) {
                        setItem("authType", "google");
                    } else {
                        setItem("authType", "software");
                    }
                }

                let sessionEmail = getItem("name");
                let email = resp.data.email;

                // set the name using the email
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
    // all else fails, set false and UNKNOWN
    return { loggedOn: false, state: "UNKNOWN" };
}

/**
 * return whether the user is logged on or not
 * {loggedIn: true|false}
 */
export async function isLoggedIn(): Promise<boolean> {
    const name = getItem("name");
    const authType = getItem("authType");
    if (name && authType) {
        return true;
    }

    const state = await getUserRegistrationState();
    if (state.loggedOn) {
        initializePreferences();
    }
    return state.loggedOn;
}

export async function getSlackOauth() {
    let jwt = getItem("jwt");
    if (jwt) {
        let user = await getUser(jwt);
        if (user && user.auths) {
            // get the one that is "slack"
            for (let i = 0; i < user.auths.length; i++) {
                if (user.auths[i].type === "slack") {
                    setItem("slack_access_token", user.auths[i].access_token);
                    return user.auths[i];
                }
            }
        }
    }
}

export async function getUser(jwt) {
    if (jwt) {
        let api = `/users/me`;
        let resp = await softwareGet(api, jwt);
        if (isResponseOk(resp)) {
            if (resp && resp.data && resp.data.data) {
                const user = resp.data.data;
                if (user.registered === 1) {
                    // update jwt to what the jwt is for this spotify user
                    setItem("name", user.email);
                }
                return user;
            }
        }
    }
    return null;
}

export async function initializePreferences() {
    let jwt = getItem("jwt");
    // use a default if we're unable to get the user or preferences
    let sessionThresholdInSec = DEFAULT_SESSION_THRESHOLD_SECONDS;

    // enable Git by default
    let disableGitData = false;

    if (jwt) {
        let user = await getUser(jwt);
        if (user && user.preferences) {
            // obtain the session threshold in seconds "sessionThresholdInSec"
            sessionThresholdInSec =
                user.preferences.sessionThresholdInSec ||
                DEFAULT_SESSION_THRESHOLD_SECONDS;

            disableGitData = !!user.preferences.disableGitData;
        }
    }

    // update values config
    setItem("sessionThresholdInSec", sessionThresholdInSec);
    setItem("disableGitData", disableGitData);
}

async function sendPreferencesUpdate(userId, userPrefs) {
    let api = `/users/${userId}`;
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

    // get the user's preferences and update them if they don't match what we have
    let jwt = getItem("jwt");
    if (jwt) {
        let user = await getUser(jwt);
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
                await sendPreferencesUpdate(parseInt(user.id, 10), prefs);
            }
        }
    }
}

export function refetchUserStatusLazily(
    tryCountUntilFoundUser = 50,
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
    let loggedIn: boolean = await isLoggedIn();
    if (!loggedIn) {
        // try again if the count is not zero
        if (tryCountUntilFoundUser > 0) {
            tryCountUntilFoundUser -= 1;
            refetchUserStatusLazily(tryCountUntilFoundUser, interval);
        }
    } else {
        clearSessionSummaryData();

        const message = "Successfully logged on to Code Time";
        window.showInformationMessage(message);

        commands.executeCommand("codetime.refreshTreeViews");

        // reset the updated tree date since they've established a new account
        setItem("updatedTreeDate", null);
        if (KpmProviderManager.getInstance().isKpmTreeOpen()) {
            treeDataUpdateCheck();
        }
    }
}

export function refetchSlackConnectStatusLazily(
    callback,
    tryCountUntilFound = 40
) {
    if (slackFetchTimeout) {
        return;
    }
    slackFetchTimeout = setTimeout(() => {
        slackFetchTimeout = null;
        slackConnectStatusHandler(callback, tryCountUntilFound);
    }, 10000);
}

async function slackConnectStatusHandler(callback, tryCountUntilFound) {
    let oauth = await getSlackOauth();
    if (!oauth) {
        // try again if the count is not zero
        if (tryCountUntilFound > 0) {
            tryCountUntilFound -= 1;
            refetchSlackConnectStatusLazily(callback, tryCountUntilFound);
        }
    } else {
        window.showInformationMessage(`Successfully connected to Slack`);
        if (callback) {
            callback();
        }
    }
}

export async function launchWebDashboard() {
    // {loggedIn: true|false}
    let loggedIn: boolean = await isLoggedIn();
    let webUrl = await buildWebDashboardUrl();

    if (!loggedIn) {
        webUrl = await buildLoginUrl();
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

    const result = await softwareGet(
        `/dashboard/commits`,
        getItem("jwt")
    ).catch((err) => {
        return null;
    });
    let content = "WEEKLY COMMIT SUMMARY";
    if (isResponseOk(result) && result.data) {
        // get the string content out
        content = result.data;
    }

    fileIt.writeContentFileSync(filePath, content);
}

export async function writeDailyReportDashboard(
    type = "yesterday",
    projectIds = []
) {
    let dashboardContent = "";

    const file = getDailyReportSummaryFile();
    fileIt.writeContentFileSync(file, dashboardContent);
}

export async function writeProjectCommitDashboardByStartEnd(
    start,
    end,
    projectIds
) {
    const qryStr = `?start=${start}&end=${end}&projectIds=${projectIds.join(
        ","
    )}`;
    const api = `/projects/codeSummary${qryStr}`;
    const result = await softwareGet(api, getItem("jwt"));
    await writeProjectCommitDashboard(result);
}

export async function writeProjectCommitDashboardByRangeType(
    type = "lastWeek",
    projectIds
) {
    projectIds = projectIds.filter((n) => n);
    const qryStr = `?timeRange=${type}&projectIds=${projectIds.join(",")}`;
    const api = `/projects/codeSummary${qryStr}`;
    const result = await softwareGet(api, getItem("jwt"));
    await writeProjectCommitDashboard(result);
}

export async function writeProjectCommitDashboard(apiResult) {
    let dashboardContent = "";
    // [{projectId, name, identifier, commits, files_changed, insertions, deletions, hours,
    //   keystrokes, characters_added, characters_deleted, lines_added, lines_removed},...]
    if (isResponseOk(apiResult)) {
        dashboardContent = apiResult.data;
    } else {
        dashboardContent += "No data available\n";
    }

    const file = getProjectCodeSummaryFile();
    fileIt.writeContentFileSync(file, dashboardContent);
}

export async function writeProjectContributorCommitDashboardFromGitLogs(
    identifier
) {
    const activeRootPath = findFirstActiveDirectoryOrWorkspaceDirectory();

    const userTodaysChangeStatsP: Promise<CommitChangeStats> = getTodaysCommits(
        activeRootPath
    );
    const userYesterdaysChangeStatsP: Promise<CommitChangeStats> = getYesterdaysCommits(
        activeRootPath
    );
    const userWeeksChangeStatsP: Promise<CommitChangeStats> = getThisWeeksCommits(
        activeRootPath
    );
    const contributorsTodaysChangeStatsP: Promise<CommitChangeStats> = getTodaysCommits(
        activeRootPath,
        false
    );
    const contributorsYesterdaysChangeStatsP: Promise<CommitChangeStats> = getYesterdaysCommits(
        activeRootPath,
        false
    );
    const contributorsWeeksChangeStatsP: Promise<CommitChangeStats> = getThisWeeksCommits(
        activeRootPath,
        false
    );

    let dashboardContent = "";

    const now = moment().unix();
    const formattedDate = moment.unix(now).format("ddd, MMM Do h:mma");
    dashboardContent = getTableHeader(
        "PROJECT SUMMARY",
        ` (Last updated on ${formattedDate})`
    );
    dashboardContent += "\n\n";
    dashboardContent += `Project: ${identifier}`;
    dashboardContent += "\n\n";

    // TODAY
    let projectDate = moment.unix(now).format("MMM Do, YYYY");
    dashboardContent += getRightAlignedTableHeader(`Today (${projectDate})`);
    dashboardContent += getColumnHeaders(["Metric", "You", "All Contributors"]);

    let summary = {
        activity: await userTodaysChangeStatsP,
        contributorActivity: await contributorsTodaysChangeStatsP,
    };
    dashboardContent += getRowNumberData(summary, "Commits", "commitCount");

    // files changed
    dashboardContent += getRowNumberData(summary, "Files changed", "fileCount");

    // insertions
    dashboardContent += getRowNumberData(summary, "Insertions", "insertions");

    // deletions
    dashboardContent += getRowNumberData(summary, "Deletions", "deletions");

    dashboardContent += "\n";

    // YESTERDAY
    projectDate = moment.unix(now).format("MMM Do, YYYY");
    let startDate = moment
        .unix(now)
        .subtract(1, "day")
        .startOf("day")
        .format("MMM Do, YYYY");
    dashboardContent += getRightAlignedTableHeader(`Yesterday (${startDate})`);
    dashboardContent += getColumnHeaders(["Metric", "You", "All Contributors"]);
    summary = {
        activity: await userYesterdaysChangeStatsP,
        contributorActivity: await contributorsYesterdaysChangeStatsP,
    };
    dashboardContent += getRowNumberData(summary, "Commits", "commitCount");

    // files changed
    dashboardContent += getRowNumberData(summary, "Files changed", "fileCount");

    // insertions
    dashboardContent += getRowNumberData(summary, "Insertions", "insertions");

    // deletions
    dashboardContent += getRowNumberData(summary, "Deletions", "deletions");

    dashboardContent += "\n";

    // THIS WEEK
    projectDate = moment.unix(now).format("MMM Do, YYYY");
    startDate = moment.unix(now).startOf("week").format("MMM Do, YYYY");
    dashboardContent += getRightAlignedTableHeader(
        `This week (${startDate} to ${projectDate})`
    );
    dashboardContent += getColumnHeaders(["Metric", "You", "All Contributors"]);

    summary = {
        activity: await userWeeksChangeStatsP,
        contributorActivity: await contributorsWeeksChangeStatsP,
    };
    dashboardContent += getRowNumberData(summary, "Commits", "commitCount");

    // files changed
    dashboardContent += getRowNumberData(summary, "Files changed", "fileCount");

    // insertions
    dashboardContent += getRowNumberData(summary, "Insertions", "insertions");

    // deletions
    dashboardContent += getRowNumberData(summary, "Deletions", "deletions");

    dashboardContent += "\n";

    const file = getProjectContributorCodeSummaryFile();
    fileIt.writeContentFileSync(file, dashboardContent);
}

export async function writeProjectContributorCommitDashboard(identifier) {
    const qryStr = `?identifier=${encodeURIComponent(identifier)}`;
    const api = `/projects/contributorSummary${qryStr}`;
    const result = await softwareGet(api, getItem("jwt"));

    let dashboardContent = "";

    // [{timestamp, activity, contributorActivity},...]
    // the activity and contributorActivity will have the following structure
    // [{projectId, name, identifier, commits, files_changed, insertions, deletions, hours,
    //   keystrokes, characters_added, characters_deleted, lines_added, lines_removed},...]
    if (isResponseOk(result)) {
        const data = result.data;
        // create the title
        const now = moment().unix();
        const formattedDate = moment.unix(now).format("ddd, MMM Do h:mma");
        dashboardContent = getTableHeader(
            "PROJECT SUMMARY",
            ` (Last updated on ${formattedDate})`
        );
        dashboardContent += "\n\n";
        dashboardContent += `Project: ${identifier}`;
        dashboardContent += "\n\n";

        for (let i = 0; i < data.length; i++) {
            const summary = data[i];
            let projectDate = moment.unix(now).format("MMM Do, YYYY");
            if (i === 0) {
                projectDate = `Today (${projectDate})`;
            } else if (i === 1) {
                let startDate = moment
                    .unix(now)
                    .startOf("week")
                    .format("MMM Do, YYYY");
                projectDate = `This week (${startDate} to ${projectDate})`;
            } else {
                let startDate = moment
                    .unix(now)
                    .startOf("month")
                    .format("MMM Do, YYYY");
                projectDate = `This month (${startDate} to ${projectDate})`;
            }
            dashboardContent += getRightAlignedTableHeader(projectDate);
            dashboardContent += getColumnHeaders([
                "Metric",
                "You",
                "All Contributors",
            ]);

            // show the metrics now
            // const userHours = summary.activity.session_seconds
            //     ? humanizeMinutes(summary.activity.session_seconds / 60)
            //     : humanizeMinutes(0);
            // const contribHours = summary.contributorActivity.session_seconds
            //     ? humanizeMinutes(
            //           summary.contributorActivity.session_seconds / 60
            //       )
            //     : humanizeMinutes(0);
            // dashboardContent += getRowLabels([
            //     "Code time",
            //     userHours,
            //     contribHours
            // ]);

            // commits
            dashboardContent += getRowNumberData(summary, "Commits", "commits");

            // files changed
            dashboardContent += getRowNumberData(
                summary,
                "Files changed",
                "files_changed"
            );

            // insertions
            dashboardContent += getRowNumberData(
                summary,
                "Insertions",
                "insertions"
            );

            // deletions
            dashboardContent += getRowNumberData(
                summary,
                "Deletions",
                "deletions"
            );
            dashboardContent += "\n";
        }

        dashboardContent += "\n";
    }

    const file = getProjectContributorCodeSummaryFile();
    fileIt.writeContentFileSync(file, dashboardContent);
}

function getRowNumberData(summary, title, attribute) {
    // files changed
    const userFilesChanged = summary.activity[attribute]
        ? formatNumber(summary.activity[attribute])
        : formatNumber(0);
    const contribFilesChanged = summary.contributorActivity[attribute]
        ? formatNumber(summary.contributorActivity[attribute])
        : formatNumber(0);
    return getRowLabels([title, userFilesChanged, contribFilesChanged]);
}

// start and end should be local_start and local_end
function createStartEndRangeByTimestamps(start, end) {
    return {
        rangeStart: moment.unix(start).utc().format("MMM Do, YYYY"),
        rangeEnd: moment.unix(end).utc().format("MMM Do, YYYY"),
    };
}

function createStartEndRangeByType(type = "lastWeek") {
    // default to "lastWeek"
    let startOf = moment().startOf("week").subtract(1, "week");
    let endOf = moment().startOf("week").subtract(1, "week").endOf("week");

    if (type === "yesterday") {
        startOf = moment().subtract(1, "day").startOf("day");
        endOf = moment().subtract(1, "day").endOf("day");
    } else if (type === "currentWeek") {
        startOf = moment().startOf("week");
        endOf = moment();
    } else if (type === "lastMonth") {
        startOf = moment().subtract(1, "month").startOf("month");
        endOf = moment().subtract(1, "month").endOf("month");
    }

    return {
        rangeStart: startOf.format("MMM Do, YYYY"),
        rangeEnd: endOf.format("MMM Do, YYYY"),
    };
}

export async function writeCodeTimeMetricsDashboard() {
    const summaryInfoFile = getSummaryInfoFile();

    // write the code time metrics summary to the summaryInfo file
    let api = `/dashboard?linux=${isLinux()}&showToday=true`;
    const result = await softwareGet(api, getItem("jwt"));

    if (isResponseOk(result)) {
        // get the string content out
        const content = result.data;
        fileIt.writeContentFileSync(summaryInfoFile, content);
    }

    // create the header
    let dashboardContent = "";

    // get the summary info we just made a call for and add it to the dashboard content
    const summaryContent = fileIt.readContentFileSync(summaryInfoFile);
    if (summaryContent) {
        // create the dashboard file
        dashboardContent += summaryContent;
    }

    // now write it all out to the dashboard file
    const dashboardFile = getDashboardFile();
    fileIt.writeContentFileSync(dashboardFile, dashboardContent);
}
