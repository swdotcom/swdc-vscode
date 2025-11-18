import {DiffNumStats} from '../model/models';
import {isGitProject, noSpacesProjectDir} from '../Util';
import {CacheManager} from '../cache/CacheManager';
import {execCmd} from '../managers/ExecManager';

const ONE_HOUR_IN_SEC = 60 * 60;
const ONE_DAY_IN_SEC = ONE_HOUR_IN_SEC * 24;

const cacheMgr: CacheManager = CacheManager.getInstance();

export function accumulateNumStatChanges(results: any): DiffNumStats[] {
  /*
  //Insert  Delete    Filename
    10      0       src/api/billing_client.js
    5       2       src/api/projects_client.js
    -       -       binary_file.bin
  */
  const diffNumStatList = [];

  for (const result of results) {
    const diffNumStat = new DiffNumStats();
    const parts = result.split('\t');
    diffNumStat.insertions = Number(parts[0]);
    diffNumStat.deletions = Number(parts[1]);
    // Add backslash to match other filenames in tracking
    diffNumStat.file_name = `/${parts[2]}`;
    if (Number.isInteger(diffNumStat.insertions) && Number.isInteger(diffNumStat.deletions))
      diffNumStatList.push(diffNumStat);
  }

  return diffNumStatList;
}

export async function getDefaultBranchFromRemoteBranch(projectDir: string, remoteBranch: string): Promise<string> {
  if (!projectDir || !isGitProject(projectDir)) {
    return '';
  }

  const cacheId = `getDefaultBranchFromRemoteBranch-${noSpacesProjectDir(projectDir)}`;

  let defaultBranchFromRemoteBranch = cacheMgr.get(cacheId);
  if (defaultBranchFromRemoteBranch) {
    return defaultBranchFromRemoteBranch;
  }

  defaultBranchFromRemoteBranch = '';

  const remotes = execCmd('git remote', projectDir, true) || [];
  const remoteName = remotes.sort((a: any, b: any) => b.length - a.length).find((r: any) => remoteBranch.includes(r));

  if (remoteName) {
    // Check if the remote has a HEAD symbolic-ref defined
    const headBranchList = execCmd(`git symbolic-ref refs/remotes/${remoteName}/HEAD`, projectDir, true);
    if (headBranchList.length) {
      // Make sure it's not a broken HEAD ref
      const verify = execCmd(`git show-ref --verify '${headBranchList[0]}'`, projectDir, true);

      if (verify?.length) {
        defaultBranchFromRemoteBranch = headBranchList[0];
      }
    }

    if (!defaultBranchFromRemoteBranch) {
      const assumedDefaultBranch = await guessDefaultBranchForRemote(projectDir, remoteName);
      if (assumedDefaultBranch) {
        defaultBranchFromRemoteBranch = assumedDefaultBranch;
      }
    }
  }

  if (!defaultBranchFromRemoteBranch) {
    // Check if any HEAD branch is defined on any remote
    const remoteBranchesResult = execCmd("git branch -r -l '*/HEAD'", projectDir, true);
    if (remoteBranchesResult?.length) {
      // ['origin/HEAD - origin/main']
      const remoteBranches = remoteBranchesResult[0].split(' ');
      defaultBranchFromRemoteBranch = remoteBranches[remoteBranches.length - 1];
    }
  }

  if (!defaultBranchFromRemoteBranch) {
    const originIndex = remotes.indexOf('origin');
    if (originIndex > 0) {
      // Move origin to the beginning
      remotes.unshift(remotes.splice(originIndex, 1)[0]);
    }

    // Check each remote for a possible default branch
    for (const remote of remotes) {
      const assumedRemoteDefaultBranch = await guessDefaultBranchForRemote(projectDir, remote);

      if (assumedRemoteDefaultBranch) {
        defaultBranchFromRemoteBranch = assumedRemoteDefaultBranch;
      }
    }
  }

  if (defaultBranchFromRemoteBranch) {
    // cache for a day
    cacheMgr.set(cacheId, defaultBranchFromRemoteBranch, ONE_DAY_IN_SEC);
  }

  // We have no clue, return something
  return defaultBranchFromRemoteBranch || '';
}

async function guessDefaultBranchForRemote(projectDir: string, remoteName: string): Promise<string | undefined> {
  // Get list of branches for the remote
  const remoteBranchesList = execCmd(`git branch -r -l '${remoteName}/*'`, projectDir, true) || [];
  const possibleDefaultBranchNames = ['main', 'master'];
  let assumedDefault;

  for (const possibleDefault of possibleDefaultBranchNames) {
    assumedDefault = remoteBranchesList.find((b: any) => b.trim() === `${remoteName}/${possibleDefault}`);

    if (assumedDefault) break;
  }

  return assumedDefault?.trim();
}

export async function getLatestCommitForBranch(projectDir: string, branch: string): Promise<string> {
  const cmd = `git rev-parse ${branch}`;

  if (!projectDir || !isGitProject(projectDir)) {
    return '';
  }

  const resultList = execCmd(cmd, projectDir, true);
  return resultList?.length ? resultList[0] : '';
}

export async function commitAlreadyOnRemote(projectDir: string, commit: string): Promise<boolean> {
  const resultList = execCmd(`git branch -r --contains ${commit}`, projectDir, true);

  // If results returned, then that means the commit exists on
  // at least 1 remote branch, so return true.
  return resultList?.length ? true : false;
}

export async function isMergeCommit(projectDir: string, commit: string): Promise<boolean> {
  const resultList = execCmd(`git rev-list --parents -n 1 ${commit}`, projectDir, true);

  const parents = resultList?.[0]?.split(' ');

  // If more than 2 commit SHA's are returned, then it
  // has multiple parents and is therefore a merge commit.
  return parents?.length > 2 ? true : false;
}

export async function getInfoForCommit(projectDir: string, commit: string) {
  const resultList = execCmd(`git show -s --pretty=format:%aI ${commit}`, projectDir, true);

  return {authoredTimestamp: resultList?.length ? resultList[0] : ''};
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
  const configUsers = execCmd(`git config --get-regex "^user\\."`, projectDir, true);

  authors = configUsers?.length
    ? configUsers.map((configUser: any) => {
        let [_, ...author] = configUser.split(' ');
        return author.join(' ');
      })
    : [];
  const uniqueAuthors = authors.filter((author: string, index: number, self: any) => {
    return self.indexOf(author) === index;
  });

  cacheMgr.set(cacheId, uniqueAuthors, ONE_HOUR_IN_SEC);

  return uniqueAuthors;
}

export async function getCommitsForAuthors(projectDir: string, branch: string, startRef: string, authors: string[]) {
  if (!projectDir || !isGitProject(projectDir)) {
    return [];
  }

  // If there is no startRef, then only pull 2 weeks of history
  const range = startRef !== '' ? `${startRef}..HEAD` : `HEAD --since="2 weeks ago"`;
  let cmd = `git log ${branch} ${range} --no-merges --pretty=format:"%aI =.= %H"`;
  for (const author of authors) {
    cmd += ` --author="${author}"`;
  }

  const resultList = execCmd(cmd, projectDir, true);

  if (resultList?.length) {
    return resultList.map((result: string) => {
      const [authoredTimestamp, commit] = result.split(' =.= ');
      return {commit, authoredTimestamp};
    });
  }
  return [];
}

export async function getChangesForCommit(projectDir: string, commit: string): Promise<DiffNumStats[]> {
  if (!projectDir || !isGitProject(projectDir) || !commit) {
    return [];
  }

  const cmd = `git diff --numstat ${commit}~ ${commit}`;
  const resultList = execCmd(cmd, projectDir, true);

  if (resultList?.length) {
    // just look for the line with "insertions" and "deletions"
    return accumulateNumStatChanges(resultList);
  }

  return [];
}

export async function getLocalChanges(projectDir: string): Promise<DiffNumStats[]> {
  if (!projectDir || !isGitProject(projectDir)) {
    return [];
  }

  const cmd = `git diff --numstat`;
  const resultList = execCmd(cmd, projectDir, true);

  if (resultList?.length) {
    // just look for the line with "insertions" and "deletions"
    return accumulateNumStatChanges(resultList);
  }

  return [];
}

function stripOutSlashes(str: string) {
  var parts = str.split('//');
  return parts.length === 2 ? parts[1] : str;
}

function stripOutAmpersand(str: string) {
  var parts = str.split('@');
  return parts.length === 2 ? parts[1] : str;
}

function replaceColonWithSlash(str: string) {
  return str.replace(':', '/');
}

function normalizeRepoIdentifier(identifier: string) {
  if (identifier) {
    // repos['standardId'] = repos['identifier']
    // repos['standardId'] = repos['standardId'].str.split('\//').str[-1].str.strip()
    // repos['standardId'] = repos['standardId'].str.split('\@').str[-1].str.strip()
    // repos['standardId'] = repos['standardId'].str.replace(':', "/")
    identifier = stripOutSlashes(identifier);
    identifier = stripOutAmpersand(identifier);
    identifier = replaceColonWithSlash(identifier);
  }

  return identifier || '';
}

/**
 * Retrieve the github org name and repo name from the identifier
 * i.e. https://github.com\\swdotcom\\swdc-codemetrics-service.git
 * would return "swdotcom"
 * Returns: {identifier, org_name, repo_name}
 */
export function getRepoIdentifierInfo(identifier: string) {
  identifier = normalizeRepoIdentifier(identifier);

  if (!identifier) {
    // no identifier to pull out info
    return {identifier: '', org_name: '', repo_name: ''};
  }

  // split the identifier into parts
  const parts = identifier.split(/[\\/]/);

  // it needs to have at least 3 parts
  // for example, this shouldn't return an org "github.com//string.git"
  let owner_id = '';
  const gitMatch = parts[0].match(/.*github.com/i);
  if (parts && parts.length > 2 && gitMatch) {
    // return the 2nd part
    owner_id = parts[1];
  }

  let repo_name = '';
  if (parts && parts.length > 2 && identifier.indexOf('.git') !== -1) {
    // https://github.com/swdotcom/swdc-atom.git
    // this will return "swdc-atom"
    repo_name = identifier.split('/').slice(-1)[0].split('.git')[0];
  }

  return {identifier, owner_id, repo_name};
}
