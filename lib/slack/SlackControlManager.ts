import { api_endpoint } from "../Constants";
import { getItem, launchWebUrl } from "../Util";
import { refetchSlackConnectStatusLazily } from "../DataController";

export async function connectSlack() {
    const endpoint = `${api_endpoint}/auth/slack?integrate=slack&token=${getItem(
        "jwt"
    )}`;
    launchWebUrl(endpoint);
    refetchSlackConnectStatusLazily();
}
