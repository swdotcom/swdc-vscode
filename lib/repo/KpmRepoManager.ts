import { isResponseOk, softwareGet, softwarePost } from "../http/HttpClient";
import {
    wrapExecPromise,
    getItem,
    isWindows,
    getWorkspaceFolders,
    normalizeGithubEmail,
    getFileType,
    findFirstActiveDirectoryOrWorkspaceDirectory
} from "../Util";
import { serverIsAvailable } from "../http/HttpClient";
import { getCommandResult } from "./GitUtil";
import RepoContributorInfo from "../model/RepoContributorInfo";
import TeamMember from "../model/TeamMember";

let myRepoInfo = [];

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
    const serverAvailable = await serverIsAvailable();
    const jwt = getItem("jwt");
    if (serverAvailable && jwt) {
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

    const projectDir = getProjectDir(fileName);
    if (!projectDir) {
        return 0;
    }

    // all we need is the filename of the path
    // const baseName = path.basename(fileName);

    const cmd = `git log --pretty="%an" ${fileName}`;

    // get the list of users that modified this file
    let resultList = await getCommandResult(cmd, projectDir);
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

export async function getRepoFileCount(fileName) {
    const projectDir = getProjectDir(fileName);
    if (!projectDir) {
        return 0;
    }

    // windows doesn't support the wc -l so we'll just count the list
    let cmd = `git ls-files`;
    // get the author name and email
    let resultList = await getCommandResult(cmd, projectDir);
    if (!resultList) {
        // something went wrong, but don't try to parse a null or undefined str
        return 0;
    }

    return resultList.length;
}

export async function getTeamMembers(
    fileName: string = "",
    filterOutNonEmails: boolean = true
): Promise<TeamMember[]> {
    if (!fileName) {
        fileName = findFirstActiveDirectoryOrWorkspaceDirectory();
    }

    const repoContributorInfo: RepoContributorInfo = await getRepoContributorInfo(
        fileName,
        filterOutNonEmails
    );

    if (repoContributorInfo && repoContributorInfo.members) {
        return repoContributorInfo.members;
    }

    return [];
}

export async function getRepoContributorInfo(
    fileName: string,
    filterOutNonEmails: boolean = true
): Promise<RepoContributorInfo> {
    const projectDir = getProjectDir(fileName);
    if (!projectDir) {
        return null;
    }

    let repoContributorInfo: RepoContributorInfo = new RepoContributorInfo();

    // get the repo url, branch, and tag
    let resourceInfo = await getResourceInfo(projectDir);
    if (resourceInfo && resourceInfo.identifier) {
        repoContributorInfo.identifier = resourceInfo.identifier;
        repoContributorInfo.tag = resourceInfo.tag;
        repoContributorInfo.branch = resourceInfo.branch;

        // windows doesn't support the "uniq" command, so
        // we'll just go through all of them if it's windows....
        // username, email
        let cmd = `git log --pretty="%an,%ae" | sort`;
        if (!isWindows()) {
            cmd += " | uniq";
        }
        // get the author name and email
        let resultList = await getCommandResult(cmd, projectDir);
        if (!resultList) {
            // something went wrong, but don't try to parse a null or undefined str
            return repoContributorInfo;
        }

        let map = {};
        if (resultList && resultList.length > 0) {
            // count name email
            resultList.forEach(listInfo => {
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

    return repoContributorInfo;
}

//
// use "git symbolic-ref --short HEAD" to get the git branch
// use "git config --get remote.origin.url" to get the remote url
export async function getResourceInfo(projectDir) {
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
        return { branch, identifier, email, tag };
    }
    // we don't have git info, return an empty object
    return {};
}

export async function processRepoUsersForWorkspace() {
    let activeWorkspaceDir: string = findFirstActiveDirectoryOrWorkspaceDirectory();
    if (activeWorkspaceDir) {
        getRepoUsers(activeWorkspaceDir);
    }
}

/**
 * get the git repo users
 */
export async function getRepoUsers(fileName) {
    const repoContributorInfo: RepoContributorInfo = await getRepoContributorInfo(
        fileName
    );

    if (repoContributorInfo) {
        // send this to the backend
        softwarePost("/repo/members", repoContributorInfo, getItem("jwt"));
    }
}

/**
 * get the last git commit from the app server
 */
async function getLastCommit() {
    const projectDir = getProjectDir();
    if (!projectDir) {
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
        ).then(resp => {
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
export async function getHistoricalCommits(isonline) {
    if (!isonline) {
        return;
    }
    const projectDir = getProjectDir();
    if (!projectDir) {
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
            sinceOption = " --max-count=100";
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
                            changes: {}
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
                                deletions
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

        // send in batches of 25 (backend has a 2mb body limit)
        if (commits && commits.length > 0) {
            let batchCommits = [];
            for (let i = 0; i < commits.length; i++) {
                batchCommits.push(commits[i]);
                if (i > 0 && i % 25 === 0) {
                    let commitData = {
                        commits: batchCommits,
                        identifier,
                        tag,
                        branch
                    };
                    await sendCommits(commitData);
                    batchCommits = [];
                }
            }

            if (batchCommits.length > 0) {
                let commitData = {
                    commits: batchCommits,
                    identifier,
                    tag,
                    branch
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
