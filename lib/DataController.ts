const fs = require("fs");
import {
    softwareGet,
    isResponseOk,
    isUserDeactivated,
    softwarePost
} from "./HttpClient";
import { fetchDailyKpmSessionInfo } from "./KpmStatsManager";
import {
    showErrorStatus,
    getItem,
    setItem,
    getSoftwareDataStoreFile,
    deleteFile
} from "./Util";

export async function serverIsAvailable() {
    return await softwareGet("/ping", null)
        .then(result => {
            return isResponseOk(result);
        })
        .catch(e => {
            return false;
        });
}

/**
 * User session will have...
 * { user: user, jwt: jwt }
 */
export async function isAuthenticated() {
    const tokenVal = getItem("token");
    if (!tokenVal) {
        showErrorStatus(null);
        return false;
    }

    // since we do have a token value, ping the backend using authentication
    // in case they need to re-authenticate
    const resp = await softwareGet("/users/ping", getItem("jwt"));
    if (isResponseOk(resp)) {
        return true;
    } else {
        console.log("Code Time: The user is not logged in");
        return false;
    }
}

export function sendOfflineData() {
    const dataStoreFile = getSoftwareDataStoreFile();
    try {
        if (fs.existsSync(dataStoreFile)) {
            const content = fs.readFileSync(dataStoreFile).toString();
            if (content) {
                console.log(`Code Time: sending batch payloads: ${content}`);
                const payloads = content
                    .split(/\r?\n/)
                    .map(item => {
                        let obj = null;
                        if (item) {
                            try {
                                obj = JSON.parse(item);
                            } catch (e) {
                                //
                            }
                        }
                        if (obj) {
                            return obj;
                        }
                    })
                    .filter(item => item);
                softwarePost("/data/batch", payloads, getItem("jwt")).then(
                    async resp => {
                        if (isResponseOk(resp) || isUserDeactivated(resp)) {
                            const serverAvailablePromise = await serverIsAvailable();
                            if (serverAvailablePromise) {
                                // everything is fine, delete the offline data file
                                deleteFile(getSoftwareDataStoreFile());
                            }
                        }
                    }
                );
            }
        }
    } catch (e) {
        //
    }
}

export async function checkTokenAvailability() {
    const tokenVal = getItem("token");

    if (!tokenVal) {
        return;
    }

    // need to get back...
    // response.data.user, response.data.jwt
    // non-authorization API
    softwareGet(`/users/plugin/confirm?token=${tokenVal}`, null)
        .then(resp => {
            if (
                isResponseOk(resp) &&
                resp.data &&
                resp.data.jwt &&
                resp.data.user
            ) {
                setItem("jwt", resp.data.jwt);
                setItem("user", resp.data.user);
                setItem("vscode_lastUpdateTime", Date.now());

                // fetch kpm data
                setTimeout(() => {
                    fetchDailyKpmSessionInfo();
                }, 1000);
            } else if (!isUserDeactivated(resp)) {
                console.log("Code Time: unable to obtain session token");
                // try again in 45 seconds
                setTimeout(() => {
                    checkTokenAvailability();
                }, 1000 * 45);
            } else if (isUserDeactivated(resp)) {
                console.log("Code Time: unable to obtain session token");
                // try again in a day
                setTimeout(() => {
                    checkTokenAvailability();
                }, 1000 * 60 * 60 * 24);
            }
        })
        .catch(err => {
            console.log(
                "Code Time: error confirming plugin token: ",
                err.message
            );
            setTimeout(() => {
                checkTokenAvailability();
            }, 1000 * 45);
        });
}

export function sendMusicData(trackData) {
    // add the "local_start", "start", and "end"
    // POST the kpm to the PluginManager
    return softwarePost("/data/music", trackData, getItem("jwt"))
        .then(resp => {
            if (!isResponseOk(resp)) {
                return { status: "fail" };
            }
            return { status: "ok" };
        })
        .catch(e => {
            return { status: "fail" };
        });
}
