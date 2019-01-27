import { softwareGet } from "./HttpClient";
import {
    getItem,
    humanizeMinutes,
    getDashboardRow,
    getBarChartRow,
    getGraphBar,
    getSectionHeader,
    getGitStackedGraphBar,
    DASHBOARD_VALUE_WIDTH
} from "./Util";

const ONE_DAY_SECONDS = 60 * 60 * 24;

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
    let content = await getSectionHeader("Weekly top files");
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
        content += "No weekly top files available\n";
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
    let content = await getSectionHeader("Code time by genre");
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
            let kpmBar = getGraphBar(kpmWidth);
            let minutesBarWidthPercent = entry.totalMinutes / maxMinutesScale;
            let minutesWidth = DASHBOARD_VALUE_WIDTH * minutesBarWidthPercent;
            let minutesBar = getGraphBar(minutesWidth);
            let kpmStr = "";
            if (entry.kpmAverage >= 1000) {
                kpmStr = entry.kpmAverage.toLocaleString();
            } else if (parseInt(entry.kpmAverage, 10) == entry.kpmAverage) {
                kpmStr = entry.kpmAverage.toFixed(0);
            } else {
                kpmStr = entry.kpmAverage.toFixed(2);
            }
            let minutesStr = humanizeMinutes(entry.totalMinutes);
            content += getBarChartRow(genre, `${kpmBar} ${kpmStr} KPM`);
            content += getBarChartRow("", `${minutesBar} ${minutesStr}`);
        }
    } else {
        content += "No code time by genre available\n";
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
    let content = await getSectionHeader("Code time summary");
    let start = new Date();
    // set it to the beginning of the day
    start.setHours(0, 0, 0, 0);
    const fromSeconds = Math.round(start.getTime() / 1000);
    let codeTimeSummary = await softwareGet(
        `/sessions?from=${fromSeconds}&summary=true`,
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

        content += getDashboardRow(
            "Session Time",
            `${sessionTimeIcon} ${sessionTime}`
        );
        let lastKpmStr = inFlow ? `🚀 ${lastKpm}` : `${lastKpm}`;
        content += getDashboardRow("Last KPM", lastKpmStr);
    } else {
        content += "No code time summary available\n";
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
    return await getCodeTimeStats(fromSeconds);
}

export async function getLastWeekCodeTimeStats() {
    let today = new Date();
    // set it to the beginning of the day
    today.setHours(0, 0, 0, 0);
    today.setDate(today.getDate() - 7);
    const fromSeconds = Math.round(today.getTime() / 1000);
    return await getCodeTimeStats(fromSeconds);
}

export async function getLastMonthCodeTimeStats() {
    let today = new Date();
    // set it to the beginning of the day
    today.setHours(0, 0, 0, 0);
    today.setMonth(today.getMonth() - 1);
    const fromSeconds = Math.round(today.getTime() / 1000);
    return await getCodeTimeStats(fromSeconds);
}

export async function getCodeTimeStats(fromSeconds) {
    let content = await getSectionHeader("Code time stats");
    // https://api.software.com/metrics?from=1540623600&to=1548489599
    let today = new Date();
    // set it to the beginning of the day
    today.setHours(0, 0, 0, 0);

    // set toSeconds to the end of the day
    let toSeconds = fromSeconds + ONE_DAY_SECONDS;
    let codeTimeStats = await softwareGet(
        `/metrics?from=${fromSeconds}&to=${toSeconds}`,
        getItem("jwt")
    );

    if (codeTimeStats && codeTimeStats.data) {
        let codeTimeStatsData = codeTimeStats.data;
        for (let i = 0; i < codeTimeStatsData.length; i++) {
            let stats = codeTimeStatsData[i];
            let total = stats.total || 0;
            if (total >= 1000) {
                content += getDashboardRow(stats.label, total.toLocaleString());
            } else {
                if (parseInt(total, 10) === total) {
                    content += getDashboardRow(stats.label, total.toFixed(0));
                } else {
                    content += getDashboardRow(stats.label, total.toFixed(2));
                }
            }
        }
    } else {
        content += "No code time stats available\n";
    }
    content += "\n";
    return content;
}
