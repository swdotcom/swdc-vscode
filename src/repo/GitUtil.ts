import { CommitChangeStats, DiffNumStats } from "../model/models";
import { wrapExecPromise, isGitProject, noSpacesProjectDir } from "../Util";
import { getResourceInfo } from "./KpmRepoManager";
import { CacheManager } from "../cache/CacheManager";
import { config } from "process";

const path = require("path");
const moment = require("moment-timezone");

const ONE_HOUR_IN_SEC = 60 * 60;
const ONE_DAY_SEC = ONE_HOUR_IN_SEC * 24;
const ONE_WEEK_SEC = ONE_DAY_SEC * 7;

const cacheMgr: CacheManager = CacheManager.getInstance();
const cacheTimeoutSeconds = 60 * 10;

export async function getCommandResult(cmd, projectDir): Promise<string[] | null> {
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
  result = result.replace(/\r\n/g, "\r").replace(/\n/g, "\r").replace(/^\s+/g, " ");
  return result;
}

export function accumulateNumStatChanges(results): DiffNumStats[] {
  /*
  //Insert  Delete    Filename
    10      0       src/api/billing_client.js
    5       2       src/api/projects_client.js
    -       -       binary_file.bin
  */
  const diffNumStatList = [];

  for (const result of results) {
    const diffNumStat = new DiffNumStats();
    const parts = result.split("\t")
    diffNumStat.insertions = Number(parts[0]);
    diffNumStat.deletions = Number(parts[1]);
    // Add backslash to match other filenames in tracking
    diffNumStat.file_name = `/${parts[2]}`;
    if (Number.isInteger(diffNumStat.insertions) && Number.isInteger(diffNumStat.deletions))
      diffNumStatList.push(diffNumStat)
  }

  return diffNumStatList;
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
      if (line.includes("changed") && (line.includes("insertion") || line.includes("deletion"))) {
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


async function getChangeStats(projectDir: string, cmd: string): Promise<CommitChangeStats> {
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

export async function getDefaultBranchFromRemoteBranch(projectDir, remoteBranch: string): Promise<string> {
  if (!projectDir || !isGitProject(projectDir)) {
    return "";
  }

  const remotes = await getCommandResult("git remote", projectDir) || [];
  const remoteName = remotes.sort((a, b) => b.length - a.length).find(r => remoteBranch.includes(r))

  if (remoteName) {
    // Check if the remote has a HEAD symbolic-ref defined
    const headBranchList = await getCommandResult(
      `git symbolic-ref refs/remotes/${remoteName}/HEAD`,
      projectDir
    )
    if (headBranchList) {
      // Make sure it's not a broken HEAD ref
      const verify = await getCommandResult(`git show-ref --verify '${headBranchList[0]}'`, projectDir)

      if (verify) return headBranchList[0];
    }

    const assumedDefaultBranch = await guessDefaultBranchForRemote(projectDir, remoteName)
    if (assumedDefaultBranch) return assumedDefaultBranch;
  }

  // Check if any HEAD branch is defined on any remote
  const remoteBranchesResult = await getCommandResult("git branch -r -l '*/HEAD'", projectDir);
  if (remoteBranchesResult) {
    // ['origin/HEAD - origin/main']
    const remoteBranches = remoteBranchesResult[0].split(" ")
    return remoteBranches[remoteBranches.length - 1]
  }

  const originIndex = remotes.indexOf("origin")
  if (originIndex > 0) {
    // Move origin to the beginning
    remotes.unshift(remotes.splice(originIndex, 1)[0])
  }

  // Check each remote for a possible default branch
  for (const remote of remotes) {
    const assumedRemoteDefaultBranch = await guessDefaultBranchForRemote(projectDir, remote);

    if (assumedRemoteDefaultBranch) return assumedRemoteDefaultBranch;
  }

  // We have no clue, return something
  return ""
}

async function guessDefaultBranchForRemote(projectDir, remoteName: string): Promise<string | undefined> {
  // Get list of branches for the remote
  const remoteBranchesList = await getCommandResult(`git branch -r -l '${remoteName}/*'`, projectDir) || [];
  const possibleDefaultBranchNames = ['main', 'master'];
  let assumedDefault;

  for (const possibleDefault of possibleDefaultBranchNames) {
    assumedDefault = remoteBranchesList.find(b => b.trim() === `${remoteName}/${possibleDefault}`)

    if (assumedDefault) break;
  }

  return assumedDefault?.trim();
}

export async function getLatestCommitForBranch(projectDir, branch: string): Promise<string> {
  const cmd = `git rev-parse ${branch}`;

  if (!projectDir || !isGitProject(projectDir)) {
    return "";
  }

  const resultList = await getCommandResult(cmd, projectDir);
  if (!resultList) {
    // something went wrong, but don't try to parse a null or undefined str
    return "";
  }

  return resultList[0] || ""
}

export async function commitAlreadyOnRemote(projectDir: string, commit: string): Promise<boolean> {
  const resultList = await getCommandResult(
    `git branch -r --contains ${commit}`,
    projectDir
  )

  // If results returned, then that means the commit exists on
  // at least 1 remote branch, so return true.
  return resultList?.length ? true : false;
}

export async function isMergeCommit(projectDir: string, commit: string): Promise<boolean> {
  const resultList = await getCommandResult(
    `git rev-list --parents -n 1 ${commit}`,
    projectDir
  )

  const parents = resultList?.[0]?.split(" ")

  // If more than 2 commit SHA's are returned, then it
  // has multiple parents and is therefore a merge commit.
  return parents?.length > 2 ? true : false;
}

export async function getInfoForCommit(projectDir, commit: string) {
  const resultList = await getCommandResult(
    `git show ${commit} --pretty=format:"%aI" -s`,
    projectDir
  )

  return { authoredTimestamp: resultList[0] }
}

// Returns an array of authors including names and emails from the git config
export async function authors(projectDir: string): Promise<string[]> {
  if (!projectDir || !isGitProject(projectDir)) {
    return [];
  }

  const cacheId = `git-authors-${noSpacesProjectDir(projectDir)}`;

  let authors = cacheMgr.get(cacheId);
  if (authors) {
    return authors;
  }
  const configUsers = await getCommandResult(`git config --get-regex "^user\\."`, projectDir)

  authors = configUsers.map(configUser => {
    let [_, ...author] = configUser.split(" ")
    return author.join(" ")
  });
  const uniqueAuthors = authors.filter((author, index, self) => {
    return self.indexOf(author) === index;
  });

  cacheMgr.set(cacheId, uniqueAuthors, ONE_HOUR_IN_SEC);

  return uniqueAuthors
}

export async function getCommitsForAuthors(projectDir, branch: string, startRef: string, authors: string[]) {
  if (!projectDir || !isGitProject(projectDir)) {
    return [];
  }

  // If there is no startRef, then only pull 2 weeks of history
  const range = startRef !== "" ? `${startRef}..HEAD` : `HEAD --since="2 weeks ago"`
  let cmd = `git log ${branch} ${range} --no-merges --pretty=format:"%aI =.= %H"`
  for (const author of authors) {
    cmd += ` --author="${author}"`
  }

  const resultList = await getCommandResult(cmd, projectDir);

  return resultList?.map(result => {
    const [authoredTimestamp, commit] = result.split(" =.= ")
    return { commit, authoredTimestamp }
  }) || [];
}

export async function getChangesForCommit(projectDir, commit: string): Promise<DiffNumStats[]> {
  let diffNumStats: DiffNumStats[];

  if (!projectDir || !isGitProject(projectDir) || !commit) {
    return diffNumStats;
  }

  const cmd = `git diff --numstat ${commit}~ ${commit}`;
  const resultList = await getCommandResult(cmd, projectDir);
  if (!resultList) {
    // something went wrong, but don't try to parse a null or undefined str
    return diffNumStats;
  }

  // just look for the line with "insertions" and "deletions"
  diffNumStats = accumulateNumStatChanges(resultList);

  return diffNumStats;
}

export async function getLocalChanges(projectDir): Promise<DiffNumStats[]> {
  let diffNumStats: DiffNumStats[];

  if (!projectDir || !isGitProject(projectDir)) {
    return diffNumStats;
  }

  const cmd = `git diff --numstat`;
  const resultList = await getCommandResult(cmd, projectDir);
  if (!resultList) {
    // something went wrong, but don't try to parse a null or undefined str
    return diffNumStats;
  }

  // just look for the line with "insertions" and "deletions"
  diffNumStats = accumulateNumStatChanges(resultList);

  return diffNumStats;
}

export async function getUncommitedChanges(projectDir): Promise<CommitChangeStats> {
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

export async function getTodaysCommits(projectDir, useAuthor = true): Promise<CommitChangeStats> {
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

  commitChanges = await getCommitsInUtcRange(projectDir, start, end, useAuthor);

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
  commitChanges = await getCommitsInUtcRange(projectDir, start, end, useAuthor);

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
  commitChanges = await getCommitsInUtcRange(projectDir, start, end, useAuthor);

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
    useAuthor && resourceInfo && resourceInfo.email ? ` --author=${resourceInfo.email}` : ``;
  const cmd = `git log --stat --pretty="COMMIT:%H,%ct,%cI,%s" --since=${start} --until=${end}${authorOption}`;
  commitChanges = await getChangeStats(projectDir, cmd);
  if (commitChanges) {
    cacheMgr.set(cacheId, commitChanges, cacheTimeoutSeconds);
  }
  return commitChanges;
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

function stripOutSlashes(str) {
  var parts = str.split("//");
  return parts.length === 2 ? parts[1] : str;
}

function stripOutAmpersand(str) {
  var parts = str.split("@");
  return parts.length === 2 ? parts[1] : str;
}

function replaceColonWithSlash(str) {
  return str.replace(":", "/");
}

function normalizeRepoIdentifier(identifier) {
  if (identifier) {
    // repos['standardId'] = repos['identifier']
    // repos['standardId'] = repos['standardId'].str.split('\//').str[-1].str.strip()
    // repos['standardId'] = repos['standardId'].str.split('\@').str[-1].str.strip()
    // repos['standardId'] = repos['standardId'].str.replace(':', "/")
    identifier = stripOutSlashes(identifier);
    identifier = stripOutAmpersand(identifier);
    identifier = replaceColonWithSlash(identifier);
  }

  return identifier || "";
}

/**
 * Retrieve the github org name and repo name from the identifier
 * i.e. https://github.com\\swdotcom\\swdc-codemetrics-service.git
 * would return "swdotcom"
 * Returns: {identifier, org_name, repo_name}
 */
export function getRepoIdentifierInfo(identifier) {
  identifier = normalizeRepoIdentifier(identifier);

  if (!identifier) {
    // no identifier to pull out info
    return { identifier: "", org_name: "", repo_name: "" };
  }

  // split the identifier into parts
  const parts = identifier.split(/[\\/]/);

  // it needs to have at least 3 parts
  // for example, this shouldn't return an org "github.com//string.git"
  let owner_id = "";
  const gitMatch = parts[0].match(/.*github.com/i);
  if (parts && parts.length > 2 && gitMatch) {
    // return the 2nd part
    owner_id = parts[1];
  }

  let repo_name = "";
  if (parts && parts.length > 2 && identifier.indexOf(".git") !== -1) {
    // https://github.com/swdotcom/swdc-atom.git
    // this will return "swdc-atom"
    repo_name = identifier.split("/").slice(-1)[0].split(".git")[0];
  }

  return { identifier, owner_id, repo_name };
}
