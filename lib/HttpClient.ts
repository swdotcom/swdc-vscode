import axios from "axios";

import { api_endpoint } from "./Constants";
import { showErrorStatus, getItem } from "./Util";

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
    beApi.defaults.headers.common["Authorization"] = jwt;
    return await beApi
        .get(api)
        .then(resp => {
            return resp;
        })
        .catch(err => {
            console.log(
                `Software.com: error fetching data for ${api}, message: ${
                    err.message
                }`
            );
            return err;
        });
}

export async function softwarePost(api, payload, jwt) {
    // POST the kpm to the PluginManager
    beApi.defaults.headers.common["Authorization"] = jwt;
    return beApi
        .post(api, payload)
        .then(resp => {
            return resp;
        })
        .catch(err => {
            console.log(
                `Software.com: error posting data for ${api}, message: ${
                    err.message
                }`
            );
            return err;
        });
}

export async function softwareDelete(api, jwt) {
    beApi.defaults.headers.common["Authorization"] = jwt;
    return beApi
        .delete(api)
        .then(resp => {
            return resp;
        })
        .catch(err => {
            console.log(
                `Software.com: error with delete request for ${api}, message: ${
                    err.message
                }`
            );
            return err;
        });
}

export function isResponseOk(resp) {
    if (
        (!resp.response && resp.errno) ||
        (resp.response &&
            resp.response.status &&
            resp.response.status >= 400) ||
        (resp.status && resp.status >= 400) ||
        (resp.code &&
            (resp.code === "ECONNREFUSED" || resp.code === "ENOTFOUND"))
    ) {
        return false;
    }
    return true;
}

export async function isUserDeactivated(resp) {
    if (!isResponseOk(resp)) {
        if (isUnauthenticatedAndDeactivated(resp)) {
            showErrorStatus(
                "To see your coding data in Software.com, please reactivate your account."
            );
            return true;
        } else {
            resp = await softwareGet("/users/ping", getItem("jwt"));
            if (isUnauthenticatedAndDeactivated(resp)) {
                showErrorStatus(
                    "To see your coding data in Software.com, please reactivate your account."
                );
                return true;
            }
        }
    }
    return false;
}

function isUnauthenticatedAndDeactivated(resp) {
    if (
        resp &&
        resp.response &&
        resp.response.status &&
        resp.response.status >= 400 &&
        resp.response.data
    ) {
        // check if we have the data object
        let code = resp.response.data.code || "";
        if (code === "DEACTIVATED") {
            showErrorStatus(
                "To see your coding data in Software.com, please reactivate your account."
            );
            return true;
        }
    }
    return false;
}
