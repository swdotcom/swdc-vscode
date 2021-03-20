import { getWorkspaceFolders, normalizeGithubEmail, getFileType, isGitProject } from "../Util";
import RepoContributorInfo from "../model/RepoContributorInfo";
import TeamMember from "../model/TeamMember";
import { CacheManager } from "../cache/CacheManager";
import { execCmd } from "../managers/ExecManager";

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
  let resultList = execCmd(cmd, directory, true);

  if (resultList?.length) {
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
  let resultList = execCmd(cmd, directory, true);
  if (!resultList) {
    // something went wrong, but don't try to parse a null or undefined str
    return 0;
  }

  return resultList.length;
}

export async function getRepoContributorInfo(fileName: string, filterOutNonEmails: boolean = true): Promise<RepoContributorInfo> {
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
    let resultList = execCmd(cmd, directory, true);
    if (!resultList) {
      // something went wrong, but don't try to parse a null or undefined str
      return repoContributorInfo;
    }

    let map = {};
    if (resultList.length) {
      // count name email
      resultList.forEach((listInfo) => {
        const devInfo = listInfo.split(",");
        const name = devInfo[0];
        const email = normalizeGithubEmail(devInfo[1], filterOutNonEmails);
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
    return null;
  }

  const noSpacesProjDir = projectDir.replace(/^\s+/g, "");
  const cacheId = `resource-info-${noSpacesProjDir}`;

  let resourceInfo = cacheMgr.get(cacheId);
  // return from cache if we have it
  if (resourceInfo) {
    return resourceInfo;
  }

  resourceInfo = {};

  const branch = wrapExecCmd("git symbolic-ref --short HEAD", projectDir);
  const identifier = wrapExecCmd("git config --get remote.origin.url", projectDir);
  let email = wrapExecCmd("git config user.email", projectDir);
  const tag = wrapExecCmd("git describe --all", projectDir);

  // both should be valid to return the resource info
  if (branch && identifier) {
    resourceInfo = { branch, identifier, email, tag };
    cacheMgr.set(cacheId, resourceInfo, cacheTimeoutSeconds);
  }
  return resourceInfo;
}
