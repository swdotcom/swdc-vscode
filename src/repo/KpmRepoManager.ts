import { isResponseOk, softwareGet, softwarePost } from "../http/HttpClient";
import {
    wrapExecPromise,
    getItem,
    getWorkspaceFolders,
    normalizeGithubEmail,
    getFileType,
    findFirstActiveDirectoryOrWorkspaceDirectory,
    isGitProject,
    isBatchSizeUnderThreshold,
} from "../Util";
import { getCommandResult } from "./GitUtil";
import RepoContributorInfo from "../model/RepoContributorInfo";
import TeamMember from "../model/TeamMember";
import { CacheManager } from "../cache/CacheManager";

let myRepoInfo = [];

const cacheMgr: CacheManager = CacheManager.getInstance();
const cacheTimeoutSeconds = 60 * 10;

function getProjectDir(fileName = null) {
    let workspaceFolders = getWorkspaceFolders();

    if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
    }

    // VSCode allows having multiple workspaces.
    // for now we only support using the 1st project directory
    // in a given set of workspaces if the provided fileName is null.
    if (workspaceFolders && workspaceFolders.length > 0) {
        if (!fileName) {
            return workspaceFolders[0].uri.fsPath;
        }

        for (let i = 0; i < workspaceFolders.length; i++) {
            const dir = workspaceFolders[i].uri.fsPath;
            if (fileName.includes(dir)) {
                return dir;
            }
        }
    }
    return null;
}

export async function getMyRepoInfo() {
    if (myRepoInfo.length > 0) {
        return myRepoInfo;
    }
    const jwt = getItem("jwt");
    if (jwt) {
        // list of [{identifier, tag, branch}]
        const resp = await softwareGet("/repo/info", jwt);
        if (isResponseOk(resp)) {
            myRepoInfo = resp.data;
        }
    }
    return myRepoInfo;
}

export async function getFileContributorCount(fileName) {
    let fileType = getFileType(fileName);

    if (fileType === "git") {
        return 0;
    }

    const directory = getProjectDir(fileName);
    if (!directory || !isGitProject(directory)) {
        return 0;
    }

    const cmd = `git log --pretty="%an" ${fileName}`;

    // get the list of users that modified this file
    let resultList = await getCommandResult(cmd, directory);
    if (!resultList) {
        // something went wrong, but don't try to parse a null or undefined str
        return 0;
    }

    if (resultList.length > 0) {
        let map = {};
        for (let i = 0; i < resultList.length; i++) {
            const name = resultList[i];
            if (!map[name]) {
                map[name] = name;
            }
        }
        return Object.keys(map).length;
    }
    return 0;
}

/**
 * Returns the number of files in this directory
 * @param directory 
 */
export async function getRepoFileCount(directory) {
    if (!directory || !isGitProject(directory)) {
        return 0;
    }

    // windows doesn't support the wc -l so we'll just count the list
    let cmd = `git ls-files`;
    // get the author name and email
    let resultList = await getCommandResult(cmd, directory);
    if (!resultList) {
        // something went wrong, but don't try to parse a null or undefined str
        return 0;
    }

    return resultList.length;
}

export async function getRepoContributors(
    fileName: string = "",
    filterOutNonEmails: boolean = true
): Promise<TeamMember[]> {
    if (!fileName) {
        fileName = findFirstActiveDirectoryOrWorkspaceDirectory();
    }

    const noSpacesFileName = fileName.replace(/^\s+/g, "");
    const cacheId = `file-repo-contributors-info-${noSpacesFileName}`;

    let teamMembers: TeamMember[] = cacheMgr.get(cacheId);
    // return from cache if we have it
    if (teamMembers) {
        return teamMembers;
    }

    teamMembers = [];

    const repoContributorInfo: RepoContributorInfo = await getRepoContributorInfo(
        fileName,
        filterOutNonEmails
    );

    if (repoContributorInfo && repoContributorInfo.members) {
        teamMembers = repoContributorInfo.members;
        cacheMgr.set(cacheId, teamMembers, cacheTimeoutSeconds);
    }

    return teamMembers;
}

export async function getRepoContributorInfo(
    fileName: string,
    filterOutNonEmails: boolean = true
): Promise<RepoContributorInfo> {
    const directory = getProjectDir(fileName);
    if (!directory || !isGitProject(directory)) {
        return null;
    }

    const noSpacesProjDir = directory.replace(/^\s+/g, "");
    const cacheId = `project-repo-contributor-info-${noSpacesProjDir}`;

    let repoContributorInfo: RepoContributorInfo = cacheMgr.get(cacheId);
    // return from cache if we have it
    if (repoContributorInfo) {
        return repoContributorInfo;
    }

    repoContributorInfo = new RepoContributorInfo();

    // get the repo url, branch, and tag
    let resourceInfo = await getResourceInfo(directory);
    if (resourceInfo && resourceInfo.identifier) {
        repoContributorInfo.identifier = resourceInfo.identifier;
        repoContributorInfo.tag = resourceInfo.tag;
        repoContributorInfo.branch = resourceInfo.branch;

        // username, email
        let cmd = `git log --format='%an,%ae' | sort -u`;
        // get the author name and email
        let resultList = await getCommandResult(cmd, directory);
        if (!resultList) {
            // something went wrong, but don't try to parse a null or undefined str
            return repoContributorInfo;
        }

        let map = {};
        if (resultList && resultList.length > 0) {
            // count name email
            resultList.forEach((listInfo) => {
                const devInfo = listInfo.split(",");
                const name = devInfo[0];
                const email = normalizeGithubEmail(
                    devInfo[1],
                    filterOutNonEmails
                );
                if (email && !map[email]) {
                    const teamMember: TeamMember = new TeamMember();
                    teamMember.name = name;
                    teamMember.email = email;
                    teamMember.identifier = resourceInfo.identifier;
                    repoContributorInfo.members.push(teamMember);
                    map[email] = email;
                }
            });
        }
        repoContributorInfo.count = repoContributorInfo.members.length;
    }

    if (repoContributorInfo && repoContributorInfo.count > 0) {
        cacheMgr.set(cacheId, repoContributorInfo, cacheTimeoutSeconds);
    }

    return repoContributorInfo;
}

//
// use "git symbolic-ref --short HEAD" to get the git branch
// use "git config --get remote.origin.url" to get the remote url
export async function getResourceInfo(projectDir) {
    if (!projectDir || !isGitProject(projectDir)) {
        return {};
    }

    const noSpacesProjDir = projectDir.replace(/^\s+/g, "");
    const cacheId = `resource-info-${noSpacesProjDir}`;

    let resourceInfo = cacheMgr.get(cacheId);
    // return from cache if we have it
    if (resourceInfo) {
        return resourceInfo;
    }

    resourceInfo = {};

    const branch = await wrapExecPromise(
        "git symbolic-ref --short HEAD",
        projectDir
    );
    const identifier = await wrapExecPromise(
        "git config --get remote.origin.url",
        projectDir
    );
    let email = await wrapExecPromise("git config user.email", projectDir);
    const tag = await wrapExecPromise("git describe --all", projectDir);

    // both should be valid to return the resource info
    if (branch && identifier) {
        resourceInfo = { branch, identifier, email, tag };
        cacheMgr.set(cacheId, resourceInfo, cacheTimeoutSeconds);
    }
    return resourceInfo;
}

export async function processRepoUsersForWorkspace() {
    let activeWorkspaceDir: string = findFirstActiveDirectoryOrWorkspaceDirectory();
    if (activeWorkspaceDir) {
        postRepoContributors(activeWorkspaceDir);
    }
}

/**
 * get the git repo users
 */
export async function postRepoContributors(fileName) {
    const repoContributorInfo: RepoContributorInfo = await getRepoContributorInfo(
        fileName
    );

    if (repoContributorInfo) {
        // send this to the backend
        softwarePost("/repo/contributors", repoContributorInfo, getItem("jwt"));
    }
}

/**
 * get the last git commit from the app server
 */
async function getLastCommit() {
    const projectDir = getProjectDir();
    if (!projectDir || !isGitProject(projectDir)) {
        return null;
    }

    // get the repo url, branch, and tag
    const resourceInfo = await getResourceInfo(projectDir);
    let commit = null;
    if (resourceInfo && resourceInfo.identifier) {
        const identifier = resourceInfo.identifier;
        const tag = resourceInfo.tag;
        const branch = resourceInfo.branch;

        const encodedIdentifier = encodeURIComponent(identifier);
        const encodedTag = encodeURIComponent(tag);
        const encodedBranch = encodeURIComponent(branch);
        // call the app
        commit = await softwareGet(
            `/commits/latest?identifier=${encodedIdentifier}&tag=${encodedTag}&branch=${encodedBranch}`,
            getItem("jwt")
        ).then((resp) => {
            if (isResponseOk(resp)) {
                // will get a single commit object back with the following attributes
                // commitId, message, changes, email, timestamp
                let commit =
                    resp.data && resp.data.commit ? resp.data.commit : null;
                return commit;
            }
        });
    }

    return commit;
}

/**
 * get the historical git commits
 */
export async function getHistoricalCommits() {
    const projectDir = getProjectDir();
    if (!projectDir || !isGitProject(projectDir)) {
        return null;
    }

    // get the repo url, branch, and tag
    const resourceInfo = await getResourceInfo(projectDir);
    if (resourceInfo && resourceInfo.identifier) {
        const identifier = resourceInfo.identifier;
        const tag = resourceInfo.tag;
        const branch = resourceInfo.branch;

        const latestCommit = await getLastCommit();

        let sinceOption = "";
        if (latestCommit) {
            // add a second
            const newTimestamp = parseInt(latestCommit.timestamp, 10) + 1;
            sinceOption = ` --since=${newTimestamp}`;
        } else {
            sinceOption = " --max-count=50";
        }

        const cmd = `git log --stat --pretty="COMMIT:%H,%ct,%cI,%s" --author=${resourceInfo.email}${sinceOption}`;

        // git log --stat --pretty="COMMIT:%H, %ct, %cI, %s, %ae"
        const resultList = await getCommandResult(cmd, projectDir);

        if (!resultList) {
            // something went wrong, but don't try to parse a null or undefined str
            return null;
        }

        let commits = [];
        let commit = null;
        for (let i = 0; i < resultList.length; i++) {
            let line = resultList[i].trim();
            if (line && line.length > 0) {
                if (line.indexOf("COMMIT:") === 0) {
                    line = line.substring("COMMIT:".length);
                    if (commit) {
                        // add it to the commits
                        commits.push(commit);
                    }
                    // split by comma
                    let commitInfos = line.split(",");
                    if (commitInfos && commitInfos.length > 3) {
                        let commitId = commitInfos[0].trim();
                        if (
                            latestCommit &&
                            commitId === latestCommit.commitId
                        ) {
                            commit = null;
                            // go to the next one
                            continue;
                        }
                        let timestamp = parseInt(commitInfos[1].trim(), 10);
                        let date = commitInfos[2].trim();
                        let message = commitInfos[3].trim();
                        commit = {
                            commitId,
                            timestamp,
                            date,
                            message,
                            changes: {},
                        };
                    }
                } else if (commit && line.indexOf("|") !== -1) {
                    // get the file and changes
                    // i.e. backend/app.js                | 20 +++++++++-----------
                    line = line.replace(/ +/g, " ");
                    // split by the pipe
                    let lineInfos = line.split("|");
                    if (lineInfos && lineInfos.length > 1) {
                        let file = lineInfos[0].trim();
                        let metricsLine = lineInfos[1].trim();
                        let metricsInfos = metricsLine.split(" ");
                        if (metricsInfos && metricsInfos.length > 1) {
                            let addAndDeletes = metricsInfos[1].trim();
                            // count the number of plus signs and negative signs to find
                            // out how many additions and deletions per file
                            let len = addAndDeletes.length;
                            let lastPlusIdx = addAndDeletes.lastIndexOf("+");
                            let insertions = 0;
                            let deletions = 0;
                            if (lastPlusIdx !== -1) {
                                insertions = lastPlusIdx + 1;
                                deletions = len - insertions;
                            } else if (len > 0) {
                                // all deletions
                                deletions = len;
                            }
                            commit.changes[file] = {
                                insertions,
                                deletions,
                            };
                        }
                    }
                }
            }
        }
        if (commit) {
            // add it to the commits
            commits.push(commit);
        }

        let commit_batch_size = 15;

        // send in batches of 15
        if (commits && commits.length > 0) {
            let batchCommits = [];
            for (let commit of commits) {
                batchCommits.push(commit);

                // if the batch size is greather than the theshold
                // send it off
                if (!isBatchSizeUnderThreshold(batchCommits)) {
                    // send off this set of commits
                    let commitData = {
                        commits: batchCommits,
                        identifier,
                        tag,
                        branch,
                    };
                    await sendCommits(commitData);
                    batchCommits = [];
                }
            }

            // send the remaining
            if (batchCommits.length > 0) {
                let commitData = {
                    commits: batchCommits,
                    identifier,
                    tag,
                    branch,
                };
                await sendCommits(commitData);
                batchCommits = [];
            }
        }

        // clear out the repo info in case they've added another one
        myRepoInfo = [];
    }

    /**
     * We'll get commitId, unixTimestamp, unixDate, commitMessage, authorEmail
     * then we'll gather the files
     * COMMIT:52d0ac19236ac69cae951b2a2a0b4700c0c525db, 1545507646, 2018-12-22T11:40:46-08:00, updated wlb to use local_start, xavluiz@gmail.com

        backend/app.js                  | 20 +++++++++-----------
        backend/app/lib/audio.js        |  5 -----
        backend/app/lib/feed_helpers.js | 13 +------------
        backend/app/lib/sessions.js     | 25 +++++++++++++++----------
        4 files changed, 25 insertions(+), 38 deletions(-)
    */
    function sendCommits(commitData) {
        // send this to the backend
        softwarePost("/commits", commitData, getItem("jwt"));
    }
}
