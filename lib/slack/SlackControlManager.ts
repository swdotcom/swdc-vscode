import { api_endpoint } from "../Constants";
import { getItem, launchWebUrl } from "../Util";
import { refetchSlackConnectStatusLazily } from "../DataController";

export async function connectSlack() {
    // auth/slack/workspace is the other api endpoint to try
    // to get slack to show the workspace prompt but that's not working either
    const endpoint = `${api_endpoint}/auth/slack?integrate=slack&token=${getItem(
        "jwt"
    )}`;
    launchWebUrl(endpoint);
    refetchSlackConnectStatusLazily();
}
