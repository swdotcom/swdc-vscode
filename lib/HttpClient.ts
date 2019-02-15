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
                `Code Time: error fetching data for ${api}, message: ${
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
                `Code Time: error posting data for ${api}, message: ${
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
                `Code Time: error with delete request for ${api}, message: ${
                    err.message
                }`
            );
            return err;
        });
}

export function isResponseOk(resp) {
    let status = resp && resp.status ? resp.status : null;
    if (!status) {
        status =
            resp && resp.response && resp.response.status
                ? resp.response.status
                : null;
    }
    if (status && status === 200) {
        return true;
    }
    let isNotOkStatus = (status && status >= 400) || !status ? true : false;
    if (!isNotOkStatus) {
        return false;
    }
    return true;
}

export async function isUserDeactivated(resp) {
    if (!isResponseOk(resp)) {
        if (isUnauthenticatedAndDeactivated(resp)) {
            showErrorStatus(
                "To see your coding data in Code Time, please reactivate your account."
            );
            return true;
        } else {
            resp = await softwareGet("/users/ping", getItem("jwt"));
            if (isUnauthenticatedAndDeactivated(resp)) {
                showErrorStatus(
                    "To see your coding data in Code Time, please reactivate your account."
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
                "To see your coding data in Code Time, please reactivate your account."
            );
            return true;
        }
    }
    return false;
}
