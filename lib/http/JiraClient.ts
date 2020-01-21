import axios, { AxiosInstance } from "axios";
import { logIt } from "../Util";

export const SPOTIFY_ROOT_API = "https://api.spotify.com";

const jiraClient: AxiosInstance = axios.create({
    baseURL: SPOTIFY_ROOT_API
});

export class JiraClient {
    private static instance: JiraClient;
    private constructor() {
        //
    }
    static getInstance() {
        if (!JiraClient.instance) {
            JiraClient.instance = new JiraClient();
        }
        return JiraClient.instance;
    }

    async apiGet(api: string, accessToken: string) {
        jiraClient.defaults.headers.common[
            "Authorization"
        ] = `Bearer ${accessToken}`;
        return await jiraClient.get(api).catch(err => {
            logIt(`error fetching data for ${api}, message: ${err.message}`);
            return err;
        });
    }
}
