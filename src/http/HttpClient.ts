import axios from 'axios';
import { commands, version, window } from 'vscode';
import { app_url } from '../Constants';
import {
  logIt,
  getPluginId,
  getPluginName,
  getVersion,
  getOs,
  getPluginUuid,
  getItem
} from '../Util';

// build the axios client
const appApi: any = axios.create({
  baseURL: app_url,
  timeout: 15000,
  headers: {
    'X-SWDC-Plugin-Id': getPluginId(),
    'X-SWDC-Plugin-Name': getPluginName(),
    'X-SWDC-Plugin-Version': getVersion(),
    'X-SWDC-Plugin-OS': getOs(),
    'X-SWDC-Plugin-UUID': getPluginUuid(),
    'X-SWDC-Plugin-Type': 'codetime',
    'X-SWDC-Plugin-Editor': 'vscode',
    'X-SWDC-Plugin-Editor-Version': version
  }
});

// Evaluate these headers on every request since these values can change
async function dynamicHeaders(override_token?: string) {
  let headers: any = {
    'X-SWDC-Is-Light-Mode': (!!(window.activeColorTheme.kind === 1)).toString(),
    'X-SWDC-Plugin-TZ': Intl.DateTimeFormat().resolvedOptions().timeZone,
    'X-SWDC-Plugin-Offset': new Date().getTimezoneOffset()
  }

  const token = await getAuthorization()

  if (token || override_token) {
    if (override_token) {
      headers['Authorization'] = override_token;
    } else {
      headers['Authorization'] = token;
    }
  }

  return headers
}

export async function appGet(api: string, queryParams: any = {}, token_override: any = '') {
  return await appApi.get(api, { params: queryParams, headers: await dynamicHeaders(token_override) }).catch((err: any) => {
    logIt(`error for GET ${api}, message: ${err.message}`);
    if (getResponseStatus(err?.response) === 401) {
      // clear the JWT because it is invalid
      commands.executeCommand('codetime.sessionReset');
    }
    return err;
  });
}

export async function appPut(api: string, payload: any) {
  return await appApi.put(api, payload, { headers: await dynamicHeaders() }).catch((err: any) => {
    logIt(`error for PUT ${api}, message: ${err.message}`);
    return err;
  });
}

export async function appPost(api: string, payload: any) {
  return await appApi.post(api, payload, { headers: await dynamicHeaders() }).catch((err: any) => {
    logIt(`error for POST ${api}, message: ${err.message}`);
    return err;
  });
}

export async function appDelete(api: string) {
  return await appApi.delete(api, { headers: await dynamicHeaders() }).catch((err: any) => {
    logIt(`error for DELETE ${api}, message: ${err.message}`);
    return err;
  });
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

async function getAuthorization() {
  const token = getItem('jwt');

  // Split the string and return the last portion incase it has a prefix like `JWT `
  return token?.trim().split(' ').at(-1);
}
