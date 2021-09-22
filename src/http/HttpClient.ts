import axios from "axios";

import { api_endpoint, app_endpoint } from "../Constants";

import { logIt, getPluginId, getPluginName, getVersion, getOs, getOffsetSeconds, getPluginUuid, getItem } from "../Util";

// api.software.com
const beApi = axios.create({
  baseURL: `${api_endpoint}`,
  timeout: 30000,
});

// app.software.com
const appApi = axios.create({
  baseURL: `${app_endpoint}`,
  timeout: 30000
});

const headers = {
  'X-SWDC-Plugin-Id': getPluginId(),
  'X-SWDC-Plugin-Name': getPluginName(),
  'X-SWDC-Plugin-Version': getVersion(),
  'X-SWDC-Plugin-OS': getOs(),
  'X-SWDC-Plugin-TZ': Intl.DateTimeFormat().resolvedOptions().timeZone,
  'X-SWDC-Plugin-Offset': getOffsetSeconds() / 60,
  'X-SWDC-Plugin-UUID': getPluginUuid()
}

beApi.defaults.headers.common = {...beApi.defaults.headers.common, ...headers};
appApi.defaults.headers.common = {...beApi.defaults.headers.common, ...headers};

const spotifyApi = axios.create({});

export async function appGet(api, queryParams: any = {}) {
  updateAppAPIAuthorization();
  return await appApi.get(api, { params: queryParams }).catch((err: any) => {
    logIt(`error for GET ${api}, message: ${err.message}`);
    return err;
  });
}

export async function serverIsAvailable() {
  const isAvail = await softwareGet("/ping", null)
    .then((result) => {
      return isResponseOk(result);
    })
    .catch((e) => {
      return false;
    });
  return isAvail;
}

export async function spotifyApiPut(api, payload, accessToken) {
  if (api.indexOf("https://api.spotify.com") === -1) {
    api = "https://api.spotify.com" + api;
  }
  spotifyApi.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
  return await spotifyApi.put(api, payload).catch((err) => {
    logIt(`error posting data for ${api}, message: ${err.message}`);
    return err;
  });
}

/**
 * Response returns a paylod with the following...
 * data: <payload>, status: 200, statusText: "OK", config: Object
 * @param api
 * @param jwt
 */

export async function softwareGet(api, jwt, queryParams = {}) {
  if (jwt) {
    beApi.defaults.headers.common["Authorization"] = jwt;
  }

  return await beApi.get(api, { params: queryParams }).catch((err) => {
    logIt(`error fetching data for ${api}, message: ${err.message}`);
    return err;
  });
}

/**
 * perform a put request
 */
export async function softwarePut(api, payload, jwt) {
  // PUT the kpm to the PluginManager
  beApi.defaults.headers.common["Authorization"] = jwt;

  return await beApi
    .put(api, payload)
    .then((resp) => {
      return resp;
    })
    .catch((err) => {
      logIt(`error posting data for ${api}, message: ${err.message}`);
      return err;
    });
}

/**
 * perform a post request
 */
export async function softwarePost(api, payload, jwt = null) {
  // POST the kpm to the PluginManager
  if (jwt) {
    beApi.defaults.headers.common["Authorization"] = jwt;
  }
  return beApi
    .post(api, payload)
    .then((resp) => {
      return resp;
    })
    .catch((err) => {
      logIt(`error posting data for ${api}, message: ${err.message}`);
      return err;
    });
}

/**
 * perform a delete request
 */
export async function softwareDelete(api, jwt) {
  beApi.defaults.headers.common["Authorization"] = jwt;
  return beApi
    .delete(api)
    .then((resp) => {
      return resp;
    })
    .catch((err) => {
      logIt(`error with delete request for ${api}, message: ${err.message}`);
      return err;
    });
}

/**
 * Check if the spotify response has an expired token
 * {"error": {"status": 401, "message": "The access token expired"}}
 */
export function hasTokenExpired(resp) {
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
export function isResponseOk(resp) {
  let status = getResponseStatus(resp);
  if (status && resp && status < 300) {
    return true;
  }
  return false;
}

/**
 * get the response http status code
 * axios always sends the following
 * status:200
 * statusText:"OK"
 */
function getResponseStatus(resp) {
  let status = null;
  if (resp && resp.status) {
    status = resp.status;
  } else if (resp && resp.response && resp.response.status) {
    status = resp.response.status;
  } else if (resp && resp.code && resp.code === "ECONNABORTED") {
    status = 500;
  }
  return status;
}

function updateAppAPIAuthorization() {
  const token = getBearerAuthorization();
  if (token) {
    appApi.defaults.headers.common['Authorization'] = token;
  }
}

function getBearerAuthorization() {
  let token = getItem("jwt");
  if (token.includes('JWT ')) {
    token = `Bearer ${token.substring('JWT '.length)}`;
  }
  return token;
}
