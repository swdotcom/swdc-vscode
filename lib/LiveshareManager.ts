import { softwarePost, isResponseOk } from "./HttpClient";
import { getItem } from "./Util";

export async function manageLiveshareSession(session) {
    softwarePost("/data/liveshare", session, getItem("jwt"))
        .then(async resp => {
            if (isResponseOk(resp)) {
                console.log("Code Time: completed liveshare sync");
            } else {
                console.log(
                    `Code Time: unable to sync liveshare metrics: ${
                        resp.message
                    }`
                );
            }
        })
        .catch(err => {
            console.log(
                `Code Time: unable to sync liveshare metrics: ${err.message}`
            );
        });
}
