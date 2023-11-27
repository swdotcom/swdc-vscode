import { isGitProject } from '../Util';
import { CacheManager } from '../cache/CacheManager';
import { execCmd } from '../managers/ExecManager';

const cacheMgr: CacheManager = CacheManager.getInstance();
const cacheTimeoutSeconds = 60 * 15;

//
// use "git symbolic-ref --short HEAD" to get the git branch
// use "git config --get remote.origin.url" to get the remote url
export async function getResourceInfo(projectDir: string) {
  if (!projectDir || !isGitProject(projectDir)) {
    return null;
  }

  const noSpacesProjDir = projectDir.replace(/^\s+/g, '');
  const cacheId = `resource-info-${noSpacesProjDir}`;

  let resourceInfo = cacheMgr.get(cacheId);
  // return from cache if we have it
  if (resourceInfo) {
    return resourceInfo;
  }

  resourceInfo = {};

  const branch = execCmd('git symbolic-ref --short HEAD', projectDir);
  const first_remote = execCmd('git remote -v', projectDir);
  // returns something like: origin\thttps://github.com/swdotcom/swdc-vscode.git (fetch)'
  const identifier = first_remote.split('\t')[1].split(' ')[0];
  let email = execCmd('git config user.email', projectDir);
  const tag = execCmd('git describe --all', projectDir);

  // both should be valid to return the resource info
  if (branch && identifier) {
    resourceInfo = { branch, identifier, email, tag };
    cacheMgr.set(cacheId, resourceInfo, cacheTimeoutSeconds);
  }
  return resourceInfo;
}
