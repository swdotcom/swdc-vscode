import { URLSearchParams } from 'url';
import { api_endpoint } from "../Constants";

import { logIt, getPluginId, getPluginName, getVersion, getOs, getOffsetSeconds, getPluginUuid, getItem } from "../Util";

const got = require('got');

const common_headers = {
  'X-SWDC-Plugin-Id': getPluginId(),
  'X-SWDC-Plugin-Name': getPluginName(),
  'X-SWDC-Plugin-Version': getVersion(),
  'X-SWDC-Plugin-OS': getOs(),
  'X-SWDC-Plugin-TZ': Intl.DateTimeFormat().resolvedOptions().timeZone,
  'X-SWDC-Plugin-Offset': getOffsetSeconds() / 60,
  'X-SWDC-Plugin-UUID': getPluginUuid(),
  'X-SWDC-Plugin-Editor': 'vscode',
};

export async function metricsGet(api, queryParams = {}) {
  let resp: any = {};
  let searchParams = new URLSearchParams(queryParams)
  try {
    resp = await got(`${api_endpoint}${api}`, {
      rejectUnauthorized: false,
      searchParams,
      headers: buildHeaders(),
      responseType: 'json'
    });
  } catch (e) {
    logIt(`error posting data for ${api}, message: ${e.message}`);
	  resp = e;
  }

  return isResponseOk(resp) ? {status: resp.statusCode, data: resp.body} : resp;
}

export async function metricsPost(api, payload) {
  let resp: any = {};

  try {
    resp = await got.post(`${api_endpoint}${api}`, {
      rejectUnauthorized: false,
      json: payload,
      headers: buildHeaders(),
      responseType: 'json'
    });
  } catch (e) {
    logIt(`Post api error for ${api}, message: ${e.message}`);
	  resp = e;
  }

  return isResponseOk(resp) ? {status: resp.statusCode, data: resp.body} : resp;
}

export async function metricsPut(api, payload) {
  let resp: any = {};

  try {
    resp = await got.put(`${api_endpoint}${api}`, {
      rejectUnauthorized: false,
      json: payload,
      headers: buildHeaders(),
      responseType: 'json'
    });
  } catch (e) {
    logIt(`Put api error for ${api}, message: ${e.message}`);
	  resp = e;
  }

  return isResponseOk(resp) ? {status: resp.statusCode, data: resp.body} : resp;
}

export async function metricsDelete(api) {
  let resp: any = {};

  try {
    resp = await got.delete(`${api_endpoint}${api}`, {
      rejectUnauthorized: false,
      headers: buildHeaders(),
      responseType: 'json'
    });
  } catch (e) {
    logIt(`Delete api error for ${api}, message: ${e.message}`);
	  resp = e;
  }

  return isResponseOk(resp) ? {status: resp.statusCode, data: resp.body} : resp;
}

export function isResponseOk(resp) {
  return !!(resp?.statusCode < 300)
}

function buildHeaders() {
  const headers = {
    ...common_headers
  }
  if (getItem("jwt")) {
    headers['Authorization'] = getItem("jwt");
  }
  return headers;
}
