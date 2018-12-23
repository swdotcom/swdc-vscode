import { isResponseOk, softwareGet, softwarePost } from "./HttpClient";
import { wrapExecPromise, getItem, isWindows } from "./Util";

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
        // we'll just go through all of them if it's windows
        let cmd = `git log --pretty="%an,%ae" | sort`;
        if (!isWindows()) {
            cmd += " | uniq";
        }
        // get the author name and email
        let devOutput = await wrapExecPromise(cmd, projectDir);
        // will look like this...
        // <name1>, <email1>
        // <name2>, <email2>
        let devList = devOutput
            .replace(/\r\n/g, "\r")
            .replace(/\n/g, "\r")
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

export async function getHistoricalCommits(projectDir) {
    // git log --stat --pretty="COMMIT:%H, %ct, %cI, %s, %ae"
    let commitHistory = await wrapExecPromise(
        "git log --stat --pretty='COMMIT:%H, %ct, %cI, %s, %ae'",
        projectDir
    );
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
    return {};
}
