import { softwareGet } from "./HttpClient";
import {
    getItem,
    humanizeMinutes,
    getDashboardRow,
    getBarChartRow,
    getGraphBar,
    formatNumber,
    getSubSectionHeader,
    getGitStackedGraphBar,
    DASHBOARD_VALUE_WIDTH
} from "./Util";

const ONE_DAY_SECONDS = 60 * 60 * 24;

/**
 * max,
        userRank: {
            percentile: 0.75,
            totalMinutes: 0,
            kpm: 0,
        },
        totalMinutes: 0,
        items: [
            {
            "maxMinutes": 4,
            "totalMinutes": 6,
            "kpm": 0,
            "count": 3,
            "percentile": 0.05
            }
        ],
        activeUsers,
        averageMinutes: 0,
    
    items contains...
    {maxMinutes, totalMinutes, kpm, count: 1, percentile}
 */
export async function getUserRankings() {
    // /users/rankings
    let content = await getSubSectionHeader("User rankings");
    let userRankings = await softwareGet(`/users/rankings`, getItem("jwt"));
    if (userRankings && userRankings.data && userRankings.data.items) {
        let userRankingsData = userRankings.data;
        let currentPercentile = userRankingsData.userRank.percentile * 100;
        let activeUsers = parseInt(userRankingsData.activeUsers, 10);
        if (currentPercentile < 0.5) {
            // skip showing this
            return "";
        }
        content += getDashboardRow("Rank", `${currentPercentile}%`);
        content += getDashboardRow("Active users", formatNumber(activeUsers));
    }
    content += "\n";
    return content;
}

export async function getWeeklyTopProjects() {
    // { entries: projectListSorted, totalMinutes, maxMinutes }
    // entries: {directory, linesAdded, linesRemoved, minutesTotal, name, projectId}
    // /projects/summary
    let content = await getSubSectionHeader("Weekly top projects");
    let weeklyTopProjects = await softwareGet(
        `/projects/summary`,
        getItem("jwt")
    );
    if (
        weeklyTopProjects &&
        weeklyTopProjects.data &&
        weeklyTopProjects.data.entries.length > 0
    ) {
        let weeklyTopProjectsData = weeklyTopProjects.data;
        let maxTotal = weeklyTopProjectsData.maxMinutes;
        let len = weeklyTopProjectsData.entries.length;
        for (let i = 0; i < len; i++) {
            let entry = weeklyTopProjectsData.entries[i];
            let name = entry.name;
            let minutesTotal = parseInt(entry.minutesTotal, 10);
            let minutesStr = humanizeMinutes(minutesTotal);

            let minutesTotalPercent = minutesTotal / maxTotal;
            let minutesWidth = DASHBOARD_VALUE_WIDTH * minutesTotalPercent;
            let minutesBar = getGraphBar(
                minutesWidth,
                minutesTotal,
                minutesStr
            );
            content += getBarChartRow(name, minutesBar);
        }
    } else {
        content += "  No weekly top projects available\n";
    }
    content += "\n";
    return content;
}

/**
 * {
 *    maxAdditions, maxDeletions, maxTotal,
 * entries: [
 * {
 * fileIdentifier: n,
    repo: filesObj[n].repo,
    branch: filesObj[n].branch,
    tag: filesObj[n].tag,
    fileName: filesObj[n].fileName,
    Additions: filesObj[n].Additions,
    Deletions: filesObj[n].Deletions,
    total: filesObj[n].total
}
 * ]
* }
 */
export async function getTopCommitFiles() {
    // /commits/topfiles
    let content = await getSubSectionHeader("Weekly top commit files");
    let weeklyTopFiles = await softwareGet(`/commits/topfiles`, getItem("jwt"));
    if (
        weeklyTopFiles &&
        weeklyTopFiles.data &&
        weeklyTopFiles.data.entries.length > 0
    ) {
        let weeklyTopFilesData = weeklyTopFiles.data;
        let maxTotal = weeklyTopFilesData.maxTotal;
        let len = weeklyTopFilesData.entries.length;
        for (let i = len - 1; i >= 0; i--) {
            let entry = weeklyTopFilesData.entries[i];
            let fileName = entry.fileName;
            let Additions = parseInt(entry.Additions, 10);
            let Deletions = parseInt(entry.Deletions, 10);
            let additionsPercent = Additions / maxTotal;
            let deletionsPercent = Deletions / maxTotal;
            let additionsWidth = DASHBOARD_VALUE_WIDTH * additionsPercent;
            let deletionsWidth = DASHBOARD_VALUE_WIDTH * deletionsPercent;
            let stackedBar = getGitStackedGraphBar(
                additionsWidth,
                deletionsWidth
            );
            content += getBarChartRow(fileName, stackedBar);
        }
    } else {
        content += "  No weekly top commit files available\n";
    }
    content += "\n";
    return content;
}

/**
 * {
    "entries": [
        {genre, duration, totalMinutes, keystrokes, kpmAverage, count}
    ],
    "maxKpmAverage": 0,
    "maxKeystrokes": 0,
    "maxAudioMinutes": 0,
    "totalMinutes": 50400,
    "totalAudioMinutes": 0
}
 */
export async function getGenreSummary() {
    let content = await getSubSectionHeader("Code time by genre");
    let genreSumary = await softwareGet(`/music/genre`, getItem("jwt"));
    if (
        genreSumary &&
        genreSumary.data &&
        genreSumary.data.entries.length > 0
    ) {
        let genreSumaryData = genreSumary.data;
        let maxKpmScale = genreSumaryData.maxKpmAverage;
        let maxMinutesScale = genreSumaryData.maxAudioMinutes;
        let len = genreSumaryData.entries.length;
        for (let i = len - 1; i >= 0; i--) {
            let entry = genreSumaryData.entries[i];
            let genre = entry.genre;
            let kpmBarWidthPercent = entry.kpmAverage / maxKpmScale;
            let kpmWidth = DASHBOARD_VALUE_WIDTH * kpmBarWidthPercent;

            let totalMinutes = parseInt(entry.totalMinutes, 10);
            let minutesBarWidthPercent = totalMinutes / maxMinutesScale;
            let minutesWidth = DASHBOARD_VALUE_WIDTH * minutesBarWidthPercent;

            let kpmAverage = parseFloat(entry.kpmAverage);
            let kpmStr = formatNumber(kpmAverage);

            let kpmBar = getGraphBar(kpmWidth, kpmAverage, `${kpmStr} KPM`);
            let minutesStr = humanizeMinutes(totalMinutes);
            let minutesBar = getGraphBar(
                minutesWidth,
                totalMinutes,
                minutesStr
            );
            content += getBarChartRow(genre, kpmBar);
            content += getBarChartRow("", minutesBar);
        }
    } else {
        content += "  No code time by genre available\n";
    }
    content += "\n";
    return content;
}

/**
 * averageDailyKpm: 11.094485152333204
 averageDailyMinutes: 216.08333333333334
 averageTotalKeystrokes: 2397.3333333333335
currentDayKeystrokes: 233
currentDayKpm: 10.590909090909092
currentDayMinutes: 22
currentSessionGoalPercent: 0.001074718645667595
currentSessionKpm: 0.13043478260869565
currentSessionMinutes: 23
dailyHoursGoal: 3.601388888888889
end: 1548517509
inFlow: false
lastKpm: 0
offset: 480
start: 1548516189
timezone: "America/Los_Angeles"
totalKeystrokes: 244002
totalMinutes: 21400.950000000077
*/
export async function getCodeTimeSummary() {
    let content = "";
    let start = new Date();
    // set it to the beginning of the day
    start.setHours(0, 0, 0, 0);
    const fromSeconds = Math.round(start.getTime() / 1000);
    const endSeconds = Math.round(new Date().getTime() / 1000);
    let codeTimeSummary = await softwareGet(
        `/sessions?start=${fromSeconds}&end=${endSeconds}&summary=true`,
        getItem("jwt")
    );
    if (codeTimeSummary && codeTimeSummary.data) {
        const codeTimeSummaryData = codeTimeSummary.data;
        const inFlow =
            codeTimeSummaryData.inFlow !== undefined &&
            codeTimeSummaryData.inFlow !== null
                ? codeTimeSummaryData.inFlow
                : true;
        let lastKpm = codeTimeSummaryData.lastKpm
            ? parseInt(codeTimeSummaryData.lastKpm, 10)
            : 0;
        let currentSessionMinutes = codeTimeSummaryData.currentSessionMinutes;
        let sessionTime = humanizeMinutes(currentSessionMinutes);

        let currentDayMinutes = codeTimeSummaryData.currentDayMinutes;
        let hoursCodedToday = humanizeMinutes(currentDayMinutes);

        let currentSessionGoalPercent = codeTimeSummaryData.currentSessionGoalPercent
            ? parseFloat(codeTimeSummaryData.currentSessionGoalPercent)
            : 0;

        let sessionTimeIcon = "";
        if (currentSessionGoalPercent > 0) {
            if (currentSessionGoalPercent < 0.4) {
                sessionTimeIcon = "🌘";
            } else if (currentSessionGoalPercent < 0.7) {
                sessionTimeIcon = "🌗";
            } else if (currentSessionGoalPercent < 0.93) {
                sessionTimeIcon = "🌖";
            } else if (currentSessionGoalPercent < 1.3) {
                sessionTimeIcon = "🌕";
            } else {
                sessionTimeIcon = "🌔";
            }
        }

        content += getDashboardRow("Hours coded today", hoursCodedToday);
        content += getDashboardRow(
            "Session Time",
            `${sessionTimeIcon} ${sessionTime}`
        );
        let lastKpmStr = inFlow ? `🚀 ${lastKpm}` : `${lastKpm}`;
        content += getDashboardRow("Last KPM", lastKpmStr);
    } else {
        content += "  No code time summary available\n";
    }
    content += "\n";
    return content;
}

/**
 * [{key: "hoursCoded", label: "Hours coded", description: "Hours coded", total: 108.41249999999998,…}
description: "Hours coded"
from: 1545868800
github_access_token: false
google_access_token: false
key: "hoursCoded"
label: "Hours coded"
password: false
salt: false
to: 1548460800
total: 108.41249999999998
1: {key: "keystrokes", label: "Total keystrokes", description: "Total keystrokes", total: 76536,…},..]
 */
export async function getTodaysCodeTimeStats() {
    let today = new Date();
    // set it to the beginning of the day
    today.setHours(0, 0, 0, 0);
    const fromSeconds = Math.round(today.getTime() / 1000);
    const toSeconds = fromSeconds + ONE_DAY_SECONDS;
    return await getCodeTimeStats(fromSeconds, toSeconds);
}

export async function getYesterdayCodeTimeStats() {
    let today = new Date();
    // set it to the beginning of the day
    today.setHours(0, 0, 0, 0);
    today.setDate(today.getDate() - 1);
    const fromSeconds = Math.round(today.getTime() / 1000);
    const toSeconds = fromSeconds + ONE_DAY_SECONDS;
    return await getCodeTimeStats(fromSeconds, toSeconds);
}

export async function getLastWeekCodeTimeStats() {
    let today = new Date();
    // set it to the beginning of the day
    today.setHours(0, 0, 0, 0);
    today.setDate(today.getDate() - 7);
    const fromSeconds = Math.round(today.getTime() / 1000);
    const sevenDaysSeconds = ONE_DAY_SECONDS * 7;
    const toSeconds = fromSeconds + sevenDaysSeconds;
    return await getCodeTimeStats(fromSeconds, toSeconds);
}

export async function getLastMonthCodeTimeStats() {
    let today = new Date();
    // set it to the beginning of the day
    today.setHours(0, 0, 0, 0);
    today.setMonth(today.getMonth() - 1);
    const fromSeconds = Math.round(today.getTime() / 1000);

    let endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    const toSeconds = Math.round(endDate.getTime() / 1000);
    return await getCodeTimeStats(fromSeconds, toSeconds);
}

export async function getAllTimeCodeTimeStats() {
    let endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    const toSeconds = Math.round(endDate.getTime() / 1000);
    return await getCodeTimeStats(-1, toSeconds);
}

export async function getCodeTimeStats(fromSeconds, toSeconds) {
    let content = "";
    // https://api.software.com/metrics?from=1540623600&to=1548489599
    let codeTimeStats = await softwareGet(
        `/metrics?from=${fromSeconds}&to=${toSeconds}`,
        getItem("jwt")
    );

    if (codeTimeStats && codeTimeStats.data) {
        let codeTimeStatsData = codeTimeStats.data;
        for (let i = 0; i < codeTimeStatsData.length; i++) {
            let stats = codeTimeStatsData[i];
            let total = stats.total || 0;
            let totalStr = formatNumber(total);
            content += getDashboardRow(stats.label, totalStr);
        }
    } else {
        content += "  No code time stats available\n";
    }
    content += "\n";
    return content;
}
