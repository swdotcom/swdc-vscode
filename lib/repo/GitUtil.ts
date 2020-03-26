import { CommitChangeStats } from "../model/models";
import { wrapExecPromise } from "../Util";
import { getResourceInfo } from "./KpmRepoManager";
const moment = require("moment-timezone");

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
            if (line.includes("insertion") && line.includes("deletion")) {
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

    if (!projectDir) {
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
    const cmd = `git diff --stat`;
    return getChangeStats(projectDir, cmd);
}

export async function getTodaysCommits(projectDir) {
    const startOfDay = moment()
        .startOf("day")
        .unix();
    const resourceInfo = await getResourceInfo(projectDir);
    const authorOption =
        resourceInfo && resourceInfo.email
            ? ` --author=${resourceInfo.email}`
            : ``;
    const cmd = `git log --stat --pretty="COMMIT:%H,%ct,%cI,%s" --since=${startOfDay}${authorOption}`;
    return getChangeStats(projectDir, cmd);
}

export async function getRepoConfigUserEmail(projectDir) {
    const cmd = `git config --get --global user.email`;
    return await getCommandResultString(cmd, projectDir);
}
