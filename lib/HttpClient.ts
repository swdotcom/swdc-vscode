import axios from "axios";

import { api_endpoint } from "./Constants";
import { showErrorStatus, getItem, logIt } from "./Util";

// build the axios api base url
const beApi = axios.create({
    baseURL: `${api_endpoint}`
});

/**
 * Response returns a paylod with the following...
 * data: <payload>, status: 200, statusText: "OK", config: Object
 * @param api
 * @param jwt
 */
export async function softwareGet(api, jwt) {
    if (jwt) {
        beApi.defaults.headers.common["Authorization"] = jwt;
    }
    return await beApi
        .get(api)
        .then(resp => {
            return resp;
        })
        .catch(err => {
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
    return beApi
        .put(api, payload)
        .then(resp => {
            return resp;
        })
        .catch(err => {
            logIt(`error posting data for ${api}, message: ${err.message}`);
            return err;
        });
}

/**
 * perform a post request
 */
export async function softwarePost(api, payload, jwt) {
    // POST the kpm to the PluginManager
    beApi.defaults.headers.common["Authorization"] = jwt;
    return beApi
        .post(api, payload)
        .then(resp => {
            return resp;
        })
        .catch(err => {
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
        .then(resp => {
            return resp;
        })
        .catch(err => {
            logIt(
                `error with delete request for ${api}, message: ${err.message}`
            );
            return err;
        });
}

/**
 * check if the reponse is ok or not
 */
export function isResponseOk(resp) {
    let status = getResponseStatus(resp);
    if (!resp || (status && status < 400)) {
        return true;
    }
    return false;
}

/**
 * check if the user has been deactived
 */
export async function isUserDeactivated(resp) {
    if (resp && !isResponseOk(resp)) {
        if (isUnauthenticatedAndDeactivated(resp)) {
            showErrorStatus(
                "To see your coding data in Code Time, please reactivate your account."
            );
            return true;
        }
    }
    resp = await softwareGet("/users/ping", getItem("jwt"));
    if (isUnauthenticatedAndDeactivated(resp)) {
        showErrorStatus(
            "To see your coding data in Code Time, please reactivate your account."
        );
        return true;
    }
    return false;
}

/**
 * get the response http status code
 */
function getResponseStatus(resp) {
    let status = null;
    if (resp && resp.status) {
        status = resp.status;
    } else if (resp && resp.response && resp.response.status) {
        status = resp.response.status;
    }
    return status;
}

/**
 * get the request's response data
 */
function getResponseData(resp) {
    let data = null;
    if (resp && resp.data) {
        data = resp.data;
    } else if (resp && resp.response && resp.response.data) {
        data = resp.response.data;
    }
    return data;
}

/**
 * check if the response has the deactivated code
 */
function isUnauthenticatedAndDeactivated(resp) {
    let status = getResponseStatus(resp);
    let data = getResponseData(resp);
    if (status && status >= 400 && data) {
        // check if we have the data object
        let code = data.code || "";
        if (code === "DEACTIVATED") {
            showErrorStatus(
                "To see your coding data in Code Time, please reactivate your account."
            );
            return true;
        }
    }
    return false;
}
