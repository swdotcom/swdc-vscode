import { CommitChangeStats } from "../model/models";
import { wrapExecPromise, isGitProject } from "../Util";
import { getResourceInfo } from "./KpmRepoManager";
import { CacheManager } from "../cache/CacheManager";

const path = require("path");
const moment = require("moment-timezone");

const ONE_HOUR_IN_SEC = 60 * 60;
const ONE_DAY_SEC = ONE_HOUR_IN_SEC * 24;
const ONE_WEEK_SEC = ONE_DAY_SEC * 7;

const cacheMgr: CacheManager = CacheManager.getInstance();
const cacheTimeoutSeconds = 60 * 10;

export async function getCommandResult(cmd, projectDir) {
    let result = await wrapExecPromise(cmd, projectDir);
    if (!result) {
        // something went wrong, but don't try to parse a null or undefined str
        return null;
    }
    result = result.trim();
    let resultList = result
        .replace(/\r\n/g, "\r")
        .replace(/\n/g, "\r")
        .replace(/^\s+/g, " ")
        .replace(/</g, "")
        .replace(/>/g, "")
        .split(/\r/);
    return resultList;
}

export async function getCommandResultString(cmd, projectDir) {
    let result = await wrapExecPromise(cmd, projectDir);
    if (!result) {
        // something went wrong, but don't try to parse a null or undefined str
        return null;
    }
    result = result.trim();
    result = result
        .replace(/\r\n/g, "\r")
        .replace(/\n/g, "\r")
        .replace(/^\s+/g, " ");
    return result;
}

/**
 * Looks through all of the lines for
 * files changed, insertions, and deletions and aggregates
 * @param results
 */
export function accumulateStatChanges(results): CommitChangeStats {
    const stats = new CommitChangeStats();
    if (results) {
        for (let i = 0; i < results.length; i++) {
            const line = results[i].trim();

            // look for the line with "insertion" and "deletion"
            if (
                line.includes("changed") &&
                (line.includes("insertion") || line.includes("deletion"))
            ) {
                // split by space, then the number before the keyword is our value
                const parts = line.split(" ");
                // the very first element is the number of files changed
                const fileCount = parseInt(parts[0], 10);
                stats.fileCount += fileCount;
                stats.commitCount += 1;
                for (let x = 1; x < parts.length; x++) {
                    const part = parts[x];
                    if (part.includes("insertion")) {
                        const insertions = parseInt(parts[x - 1], 10);
                        if (insertions) {
                            stats.insertions += insertions;
                        }
                    } else if (part.includes("deletion")) {
                        const deletions = parseInt(parts[x - 1], 10);
                        if (deletions) {
                            stats.deletions += deletions;
                        }
                    }
                }
            }
        }
    }

    return stats;
}

async function getChangeStats(
    projectDir: string,
    cmd: string
): Promise<CommitChangeStats> {
    let changeStats: CommitChangeStats = new CommitChangeStats();

    if (!projectDir || !isGitProject(projectDir)) {
        return changeStats;
    }

    /**
	 * example:
     * -mbp-2:swdc-vscode xavierluiz$ git diff --stat
        lib/KpmProviderManager.ts | 22 ++++++++++++++++++++--
        1 file changed, 20 insertions(+), 2 deletions(-)

        for multiple files it will look like this...
        7 files changed, 137 insertions(+), 55 deletions(-)
     */
    const resultList = await getCommandResult(cmd, projectDir);

    if (!resultList) {
        // something went wrong, but don't try to parse a null or undefined str
        return changeStats;
    }

    // just look for the line with "insertions" and "deletions"
    changeStats = accumulateStatChanges(resultList);

    return changeStats;
}

export async function getUncommitedChanges(
    projectDir
): Promise<CommitChangeStats> {
    if (!projectDir || !isGitProject(projectDir)) {
        new CommitChangeStats();
    }

    const noSpacesProjDir = projectDir.replace(/^\s+/g, "");
    const cacheId = `uncommitted-changes-${noSpacesProjDir}`;

    let commitChanges: CommitChangeStats = cacheMgr.get(cacheId);
    // return from cache if we have it
    if (commitChanges) {
        return commitChanges;
    }

    const cmd = `git diff --stat`;
    commitChanges = await getChangeStats(projectDir, cmd);

    if (commitChanges) {
        cacheMgr.set(cacheId, commitChanges, cacheTimeoutSeconds);
    }
    return commitChanges;
}

export async function getTodaysCommits(
    projectDir,
    useAuthor = true
): Promise<CommitChangeStats> {
    if (!projectDir || !isGitProject(projectDir)) {
        new CommitChangeStats();
    }

    const noSpacesProjDir = projectDir.replace(/^\s+/g, "");
    const cacheId = `todays-commits-${noSpacesProjDir}`;

    let commitChanges: CommitChangeStats = cacheMgr.get(cacheId);
    // return from cache if we have it
    if (commitChanges) {
        return commitChanges;
    }

    const { start, end } = getToday();

    commitChanges = await getCommitsInUtcRange(
        projectDir,
        start,
        end,
        useAuthor
    );

    if (commitChanges) {
        cacheMgr.set(cacheId, commitChanges, cacheTimeoutSeconds);
    }
    return commitChanges;
}

export async function getYesterdaysCommits(
    projectDir,
    useAuthor = true
): Promise<CommitChangeStats> {
    if (!projectDir || !isGitProject(projectDir)) {
        new CommitChangeStats();
    }

    const noSpacesProjDir = projectDir.replace(/^\s+/g, "");
    const cacheId = `yesterdays-commits-${noSpacesProjDir}`;

    let commitChanges: CommitChangeStats = cacheMgr.get(cacheId);
    // return from cache if we have it
    if (commitChanges) {
        return commitChanges;
    }

    const { start, end } = getYesterday();
    commitChanges = await getCommitsInUtcRange(
        projectDir,
        start,
        end,
        useAuthor
    );

    if (commitChanges) {
        cacheMgr.set(cacheId, commitChanges, cacheTimeoutSeconds);
    }
    return commitChanges;
}

export async function getThisWeeksCommits(
    projectDir,
    useAuthor = true
): Promise<CommitChangeStats> {
    if (!projectDir || !isGitProject(projectDir)) {
        new CommitChangeStats();
    }

    const noSpacesProjDir = projectDir.replace(/^\s+/g, "");
    const cacheId = `this-weeks-commits-${noSpacesProjDir}`;

    let commitChanges: CommitChangeStats = cacheMgr.get(cacheId);
    // return from cache if we have it
    if (commitChanges) {
        return commitChanges;
    }

    const { start, end } = getThisWeek();
    commitChanges = await getCommitsInUtcRange(
        projectDir,
        start,
        end,
        useAuthor
    );

    if (commitChanges) {
        cacheMgr.set(cacheId, commitChanges, cacheTimeoutSeconds);
    }
    return commitChanges;
}

async function getCommitsInUtcRange(projectDir, start, end, useAuthor = true) {
    if (!projectDir || !isGitProject(projectDir)) {
        new CommitChangeStats();
    }

    const noSpacesProjDir = projectDir.replace(/^\s+/g, "");
    const cacheId = `commits-in-range-${noSpacesProjDir}`;

    let commitChanges: CommitChangeStats = cacheMgr.get(cacheId);
    // return from cache if we have it
    if (commitChanges) {
        return commitChanges;
    }

    const resourceInfo = await getResourceInfo(projectDir);
    const authorOption =
        useAuthor && resourceInfo && resourceInfo.email
            ? ` --author=${resourceInfo.email}`
            : ``;
    const cmd = `git log --stat --pretty="COMMIT:%H,%ct,%cI,%s" --since=${start} --until=${end}${authorOption}`;
    commitChanges = await getChangeStats(projectDir, cmd);
    if (commitChanges) {
        cacheMgr.set(cacheId, commitChanges, cacheTimeoutSeconds);
    }
    return commitChanges;
}

export async function getSlackReportCommits(projectDir) {
    if (!projectDir || !isGitProject(projectDir)) {
        return [];
    }
    const startEnd = getThisWeek();
    const resourceInfo = await getResourceInfo(projectDir);
    if (!resourceInfo || !resourceInfo.email) {
        return [];
    }
    const authorOption = ` --author=${resourceInfo.email}`;
    const cmd = `git log --pretty="%s" --since=${startEnd.start} --until=${startEnd.end}${authorOption}`;
    const resultList = await getCommandResult(cmd, projectDir);
    return resultList;
}

export async function getLastCommitId(projectDir, email) {
    if (!projectDir || !isGitProject(projectDir)) {
        return {};
    }

    const fileName = path.basename(projectDir);
    const noSpacesProjDir = fileName.replace(/^\s+/g, "");
    const cacheId = `last-commit-id_${email}_${noSpacesProjDir}`;

    let lastCommitIdInfo = cacheMgr.get(cacheId);
    // return from cache if we have it
    if (lastCommitIdInfo) {
        return lastCommitIdInfo;
    }

    lastCommitIdInfo = {};

    const authorOption = email ? ` --author=${email}` : "";
    const cmd = `git log --pretty="%H,%s"${authorOption} --max-count=1`;
    const list = await getCommandResult(cmd, projectDir);
    if (list && list.length) {
        const parts = list[0].split(",");
        if (parts && parts.length === 2) {
            lastCommitIdInfo = {
                commitId: parts[0],
                comment: parts[1],
            };

            // cache it
            cacheMgr.set(cacheId, lastCommitIdInfo, cacheTimeoutSeconds);
        }
    }
    return lastCommitIdInfo;
}

export async function getRepoConfigUserEmail(projectDir) {
    if (!projectDir || !isGitProject(projectDir)) {
        return "";
    }
    const cmd = `git config user.email`;
    return await getCommandResultString(cmd, projectDir);
}

export async function getRepoUrlLink(projectDir) {
    if (!projectDir || !isGitProject(projectDir)) {
        return "";
    }

    const noSpacesProjDir = projectDir.replace(/^\s+/g, "");
    const cacheId = `repo-link-url-${noSpacesProjDir}`;

    let repoUrlLink = cacheMgr.get(cacheId);
    // return from cache if we have it
    if (repoUrlLink) {
        return repoUrlLink;
    }

    const cmd = `git config --get remote.origin.url`;
    repoUrlLink = await getCommandResultString(cmd, projectDir);

    if (repoUrlLink && repoUrlLink.endsWith(".git")) {
        repoUrlLink = repoUrlLink.substring(0, repoUrlLink.lastIndexOf(".git"));
    }
    if (repoUrlLink) {
        // cache it
        cacheMgr.set(cacheId, repoUrlLink, cacheTimeoutSeconds);
    }
    return repoUrlLink;
}

/**
 * Returns the user's today's start and end in UTC time
 * @param {Object} user
 */
export function getToday() {
    const start = moment().startOf("day").unix();
    const end = start + ONE_DAY_SEC;
    return { start, end };
}

/**
 * Returns the user's yesterday start and end in UTC time
 */
export function getYesterday() {
    const start = moment().subtract(1, "day").startOf("day").unix();
    const end = start + ONE_DAY_SEC;
    return { start, end };
}

/**
 * Returns the user's this week's start and end in UTC time
 */
export function getThisWeek() {
    const start = moment().startOf("week").unix();
    const end = start + ONE_WEEK_SEC;
    return { start, end };
}
