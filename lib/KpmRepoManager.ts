import { isResponseOk, softwareGet, softwarePost } from "./HttpClient";
import { wrapExecPromise, getItem, isWindows } from "./Util";

// this will contain the latest commit per repo/branch/tag
// i.e. repo1_branch1_tag1 => {commitId, timestamp, email}
let latestCommitMap = {};

//
// use "git symbolic-ref --short HEAD" to get the git branch
// use "git config --get remote.origin.url" to get the remote url
export async function getResourceInfo(projectDir) {
    let branch = await wrapExecPromise(
        "git symbolic-ref --short HEAD",
        projectDir
    );
    let identifier = await wrapExecPromise(
        "git config --get remote.origin.url",
        projectDir
    );
    let email = await wrapExecPromise("git config user.email", projectDir);
    let tag = await wrapExecPromise("git describe --all", projectDir);

    // both should be valid to return the resource info
    if (branch && identifier) {
        return { branch, identifier, email, tag };
    }
    // we don't have git info, return an empty object
    return {};
}

export async function getRepoUsers(projectDir) {
    if (!projectDir || projectDir === "") {
        return;
    }

    // get the repo url, branch, and tag
    let resourceInfo = await getResourceInfo(projectDir);
    if (resourceInfo && resourceInfo.identifier) {
        let identifier = resourceInfo.identifier;
        let tag = resourceInfo.tag;
        let branch = resourceInfo.branch;

        let members = [];
        // windows doesn't support the "uniq" command, so
        // we'll just go through all of them if it's windows....
        let cmd = `git log --pretty="%an,%ae" | sort`;
        if (!isWindows()) {
            cmd += " | uniq";
        }
        // get the author name and email
        let devOutput = await wrapExecPromise(cmd, projectDir);
        if (!devOutput) {
            // something went wrong, but don't try to parse a null or undefined str
            return;
        }
        // will look like this...
        // <name1>, <email1>
        // <name2>, <email2>
        let devList = devOutput
            .replace(/\r\n/g, "\r")
            .replace(/\n/g, "\r")
            .replace(/^\s+/g, "")
            .split(/\r/);

        let map = {};
        if (devList && devList.length > 0) {
            for (let i = 0; i < devList.length; i++) {
                let devInfo = devList[i];
                let devInfos = devInfo.split(",");
                if (devInfos && devInfos.length > 1) {
                    let devInfoObj = {
                        name: devInfos[0].trim(),
                        email: devInfos[1].trim()
                    };
                    if (!map[devInfoObj.email]) {
                        members.push(devInfoObj);
                    }
                    map[devInfoObj.email] = devInfoObj;
                }
            }
            let repoData = {
                members,
                identifier,
                tag,
                branch
            };

            // send this to the backend
            softwarePost("/repo/members", repoData, getItem("jwt")).then(
                resp => {
                    if (isResponseOk(resp)) {
                        // everything is fine, delete the offline data file
                        console.log("Software.com: repo membership updated");
                    }
                }
            );
        }
    }
}

function buildRepoKey(identifier, branch, tag) {
    return `${identifier}_${branch}_${tag}`;
}

async function getLastCommit(projectDir) {
    // get the repo info to get the last commit from the app
    if (!projectDir || projectDir === "") {
        return;
    }

    // get the repo url, branch, and tag
    let resourceInfo = await getResourceInfo(projectDir);
    let key = null;
    if (resourceInfo && resourceInfo.identifier) {
        let identifier = resourceInfo.identifier;
        let tag = resourceInfo.tag;
        let branch = resourceInfo.branch;
        key = buildRepoKey(identifier, branch, tag);

        if (!latestCommitMap[key]) {
            let encodedIdentifier = encodeURIComponent(identifier);
            let encodedTag = encodeURIComponent(tag);
            let encodedBranch = encodeURIComponent(branch);
            // call the app
            await softwareGet(
                `/commits/latest?identifier=${encodedIdentifier}&tag=${encodedTag}&branch=${encodedBranch}`,
                getItem("jwt")
            ).then(resp => {
                if (isResponseOk(resp)) {
                    // will get a single commit object back with the following attributes
                    // commitId, message, changes, email, timestamp
                    let commit =
                        resp.data && resp.data.commit ? resp.data.commit : null;
                    if (commit) {
                        latestCommitMap[key] = commit;
                    }
                }
            });
        }
    }

    if (key && !latestCommitMap[key]) {
        return latestCommitMap[key];
    }
    return null;
}

export async function getHistoricalCommits(projectDir) {
    if (!projectDir || projectDir === "") {
        return;
    }

    // get the repo url, branch, and tag
    let resourceInfo = await getResourceInfo(projectDir);
    if (resourceInfo && resourceInfo.identifier) {
        let identifier = resourceInfo.identifier;
        let tag = resourceInfo.tag;
        let branch = resourceInfo.branch;
        let key = buildRepoKey(identifier, branch, tag);

        await getLastCommit(projectDir);

        let latestCommit = latestCommitMap[key];
        let sinceOption = latestCommit
            ? ` --since=${parseInt(latestCommit.timestamp, 10)}`
            : "";

        // git log --stat --pretty="COMMIT:%H, %ct, %cI, %s, %ae"
        let commitHistory = await wrapExecPromise(
            `git log --stat --pretty="COMMIT:%H,%ct,%cI,%s" --author=${
                resourceInfo.email
            }${sinceOption}`,
            projectDir
        );

        if (!commitHistory) {
            // something went wrong, but don't try to parse a null or undefined str
            return;
        }

        let commitHistoryList = commitHistory
            .replace(/\r\n/g, "\r")
            .replace(/\n/g, "\r")
            .split(/\r/);

        if (commitHistoryList && commitHistoryList.length > 0) {
            let commits = [];
            let commit = null;
            for (let i = 0; i < commitHistoryList.length; i++) {
                let line = commitHistoryList[i].trim();
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
                                changes: {
                                    __sftwTotal__: {
                                        insertions: 0,
                                        deletions: 0
                                    }
                                }
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
                                let lastPlusIdx = addAndDeletes.lastIndexOf(
                                    "+"
                                );
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
                                commit.changes.__sftwTotal__.insertions += insertions;
                                commit.changes.__sftwTotal__.deletions += deletions;
                            }
                        }
                    }
                }
            }
            if (commit) {
                // add it to the commits
                commits.push(commit);
            }

            if (commits && commits.length > 0) {
                let batchCommits = [];
                for (let i = 0; i < commits.length; i++) {
                    batchCommits.push(commits[i]);
                    if (i > 0 && i % 100 === 0) {
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
    }

    function sendCommits(commitData) {
        // send this to the backend
        softwarePost("/commits", commitData, getItem("jwt")).then(resp => {
            if (isResponseOk(resp)) {
                if (resp.data) {
                    console.log(`Software.com: ${resp.data.message}`);
                } else {
                    // everything is fine, delete the offline data file
                    console.log("Software.com: repo commits updated");
                }
            }
        });
    }
}
