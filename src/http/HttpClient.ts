import axios from 'axios';

import {api_endpoint, app_url} from '../Constants';

import {
  logIt,
  getPluginId,
  getPluginName,
  getVersion,
  getOs,
  getOffsetSeconds,
  getPluginUuid,
  getItem,
  getEditorName,
} from '../Util';

// build the axios api base url
const beApi: any = axios.create({
  baseURL: `${api_endpoint}`,
  timeout: 15000,
});

const appApi: any = axios.create({
  baseURL: `${app_url}`,
  timeout: 15000,
});

const headers = {
  'X-SWDC-Plugin-Id': getPluginId(),
  'X-SWDC-Plugin-Name': getPluginName(),
  'X-SWDC-Plugin-Version': getVersion(),
  'X-SWDC-Plugin-OS': getOs(),
  'X-SWDC-Plugin-TZ': Intl.DateTimeFormat().resolvedOptions().timeZone,
  'X-SWDC-Plugin-Offset': getOffsetSeconds() / 60,
  'X-SWDC-Plugin-UUID': getPluginUuid(),
  'X-SWDC-Plugin-Type': 'codetime',
  'X-SWDC-Plugin-Editor': getEditorName(),
};

beApi.defaults.headers.common = {...beApi.defaults.headers.common, ...headers};
appApi.defaults.headers.common = {...appApi.defaults.headers.common, ...headers};

export async function appGet(api: string, queryParams: any = {}) {
  updateAppAPIAuthorization();

  return await appApi.get(api, {params: queryParams}).catch((err: any) => {
    logIt(`error for GET ${api}, message: ${err.message}`);
    return err;
  });
}

export async function appDelete(api: string, payload: any = {}) {
  updateAppAPIAuthorization();

  return await appApi.delete(api, payload).catch((err: any) => {
    logIt(`error for DELETE ${api}, message: ${err.message}`);
    return err;
  });
}

export async function serverIsAvailable() {
  const isAvail = await softwareGet('/ping', null)
    .then((result) => {
      return isResponseOk(result);
    })
    .catch((e) => {
      return false;
    });
  return isAvail;
}

/**
 * Response returns a paylod with the following...
 * data: <payload>, status: 200, statusText: "OK", config: Object
 * @param api
 * @param jwt
 */

export async function softwareGet(api: string, jwt: string | null, queryParams = {}) {
  if (jwt) {
    beApi.defaults.headers.common['Authorization'] = jwt;
  }

  return await beApi.get(api, {params: queryParams}).catch((err: any) => {
    logIt(`error fetching data for ${api}, message: ${err.message}`);
    return err;
  });
}

/**
 * perform a put request
 */
export async function softwarePut(api: string, payload: any, jwt: string) {
  // PUT the kpm to the PluginManager
  beApi.defaults.headers.common['Authorization'] = jwt;

  return await beApi
    .put(api, payload)
    .then((resp: any) => {
      return resp;
    })
    .catch((err: any) => {
      logIt(`error updating data for ${api}, message: ${err.message}`);
      return err;
    });
}

/**
 * perform a post request
 */
export async function softwarePost(api: string, payload: any, jwt = null) {
  // POST the kpm to the PluginManager
  if (jwt) {
    beApi.defaults.headers.common['Authorization'] = jwt;
  }
  return beApi
    .post(api, payload)
    .then((resp: any) => {
      return resp;
    })
    .catch((err: any) => {
      logIt(`error posting data for ${api}, message: ${err.message}`);
      return err;
    });
}

/**
 * perform a delete request
 */
export async function softwareDelete(api: string, jwt: string) {
  beApi.defaults.headers.common['Authorization'] = jwt;
  return beApi
    .delete(api)
    .then((resp: any) => {
      return resp;
    })
    .catch((err: any) => {
      logIt(`error with delete request for ${api}, message: ${err.message}`);
      return err;
    });
}

/**
 * Check if the spotify response has an expired token
 * {"error": {"status": 401, "message": "The access token expired"}}
 */
export function hasTokenExpired(resp: any) {
  // when a token expires, we'll get the following error data
  // err.response.status === 401
  // err.response.statusText = "Unauthorized"
  if (resp && resp.response && resp.response.status && resp.response.status === 401) {
    return true;
  }
  return false;
}

/**
 * check if the reponse is ok or not
 * axios always sends the following
 * status:200
 * statusText:"OK"
 *
    code:"ENOTFOUND"
    config:Object {adapter: , transformRequest: Object, transformResponse: Object, …}
    errno:"ENOTFOUND"
    host:"api.spotify.com"
    hostname:"api.spotify.com"
    message:"getaddrinfo ENOTFOUND api.spotify.com api.spotify.com:443"
    port:443
 */
export function isResponseOk(resp: any) {
  let status = getResponseStatus(resp);
  if (status && resp && status < 300) {
    return true;
  }
  return false;
}

function updateAppAPIAuthorization() {
  const token = getAuthorization();
  if (token) {
    appApi.defaults.headers.common['Authorization'] = token;
  }
}

function getResponseStatus(resp: any) {
  let status = null;
  if (resp?.status) {
    status = resp.status;
  } else if (resp?.response && resp.response.status) {
    status = resp.response.status;
  } else if (resp?.code === 'ECONNABORTED') {
    status = 500;
  } else if (resp?.code === 'ECONNREFUSED') {
    status = 503;
  }
  return status;
}

function getAuthorization() {
  let token = getItem('jwt');
  if (token?.includes('JWT ')) {
    token = `Bearer ${token.substring('JWT '.length)}`;
  }
  return token;
}
