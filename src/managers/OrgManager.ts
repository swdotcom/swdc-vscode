import {isResponseOk, softwareGet} from '../http/HttpClient';
import {getItem} from '../Util';

let initializedCache = false;
let orgs: any[] = [];

export async function rebuildOrgs() {
  initializedCache = true;
  const resp = await softwareGet('/v1/organizations', getItem('jwt'));
  orgs = isResponseOk(resp) ? await resp.data : [];
}

export async function getCachedOrgs() {
  if (!initializedCache) {
    await rebuildOrgs();
  }
  return orgs;
}
