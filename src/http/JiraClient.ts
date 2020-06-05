import axios, { AxiosInstance } from "axios";
import { logIt, getItem } from "../Util";

export const ROOT_API = "https://sftwco.atlassian.net";

const jiraClient: AxiosInstance = axios.create({
    baseURL: ROOT_API
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

        const resp = await jiraClient.get(api).catch(err => {
            logIt(`error fetching data for ${api}, message: ${err.message}`);
            return err;
        });
        return resp;
    }

    async fetchIssues() {
        const accessToken = getItem("atlassian_access_token");
        return this.apiGet("/rest/api/3/issuetype", accessToken);
    }
}
