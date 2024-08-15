const axios = require('axios');
import { version, window } from 'vscode';
import { api_endpoint, app_url, TWENTY_SEC_TIMEOUT_MILLIS } from '../Constants';
import {
  logIt,
  getPluginId,
  getPluginName,
  getVersion,
  getOs,
  getOffsetSeconds,
  getPluginUuid,
  getItem,
  setItem
} from '../Util';

// build the axios api base url
const beApi: any = axios.create({
  baseURL: `${api_endpoint}`,
  timeout: TWENTY_SEC_TIMEOUT_MILLIS,
});

const appApi: any = axios.create({
  baseURL: `${app_url}`,
  timeout: 15000,
});

function initializeHeaders() {
  if (appApi.defaults.headers.common['X-SWDC-Plugin-Id']) {
    return
  }

  const headers = {
    'X-SWDC-Plugin-Id': getPluginId(),
    'X-SWDC-Plugin-Name': getPluginName(),
    'X-SWDC-Plugin-Version': getVersion(),
    'X-SWDC-Plugin-OS': getOs(),
    'X-SWDC-Plugin-TZ': Intl.DateTimeFormat().resolvedOptions().timeZone,
    'X-SWDC-Plugin-Offset': getOffsetSeconds() / 60,
    'X-SWDC-Plugin-UUID': getPluginUuid(),
    'X-SWDC-Plugin-Type': 'codetime',
    'X-SWDC-Plugin-Editor': 'vscode',
    'X-SWDC-Plugin-Editor-Version': version
  };
  
  beApi.defaults.headers.common = { ...beApi.defaults.headers.common, ...headers };
  appApi.defaults.headers.common = { ...appApi.defaults.headers.common, ...headers };

  beApi.defaults.headers.common = { ...beApi.defaults.headers.common, ...headers };
  appApi.defaults.headers.common = { ...appApi.defaults.headers.common, ...headers };
}

export async function appGet(api: string, queryParams: any = {}, token_override: any = '') {
  updateOutgoingHeader(token_override);

  return await appApi.get(api, { params: queryParams }).catch((err: any) => {
    logIt(`error for GET ${api}, message: ${err.message}`);
    if (getResponseStatus(err?.response) === 401) {
      // clear the JWT because it is invalid
      setItem('jwt', null)
    }
    return err;
  });
}

export async function appPut(api: string, payload: any) {
  updateOutgoingHeader();

  return await appApi.put(api, payload).catch((err: any) => {
    logIt(`error for PUT ${api}, message: ${err.message}`);
    return err;
  });
}

export async function appPost(api: string, payload: any) {
  updateOutgoingHeader();

  return await appApi.post(api, payload).catch((err: any) => {
    logIt(`error for POST ${api}, message: ${err.message}`);
    return err;
  });
}

export async function appDelete(api: string, payload: any = {}) {
  updateOutgoingHeader();

  return await appApi.delete(api, payload).catch((err: any) => {
    logIt(`error for DELETE ${api}, message: ${err.message}`);
    return err;
  });
}

/**
 * Response returns a paylod with the following...
 * data: <payload>, status: 200, statusText: "OK", config: Object
 * @param api
 * @param jwt
 */

export async function softwareGet(api: string, override_token: any = null) {
  updateOutgoingHeader(override_token);

  return await beApi.get(api).catch((err: any) => {
    logIt(`error fetching data for ${api}, message: ${err.message}`);
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

function updateOutgoingHeader(override_token: any = null) {
  initializeHeaders()
  const token = getAuthorization();
  if (token || override_token) {
    if (override_token) {
      appApi.defaults.headers.common['Authorization'] = override_token;
      beApi.defaults.headers.common['Authorization'] = override_token;
    } else {
      appApi.defaults.headers.common['Authorization'] = token;
      beApi.defaults.headers.common['Authorization'] = token;
    }
  }

  appApi.defaults.headers.common['X-SWDC-Is-Light-Mode'] = !!(window.activeColorTheme.kind === 1);
  beApi.defaults.headers.common['X-SWDC-Is-Light-Mode'] = !!(window.activeColorTheme.kind === 1);
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
