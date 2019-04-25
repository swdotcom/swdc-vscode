import { storePayload, getItem, getOs, getVersion, logIt } from "./Util";
import { softwarePost, isResponseOk } from "./HttpClient";
import { DEFAULT_DURATION_MILLIS, PLUGIN_ID } from "./Constants";
import { fetchDailyKpmSessionInfo } from "./KpmStatsManager";
import { isTelemetryOn } from "../extension";
import { sendOfflineData } from "./DataController";

// ? marks that the parameter is optional
type Project = {
    directory: String;
    name?: String;
    identifier: String;
    resource: {};
};

export class KpmDataManager {
    public source: {};
    public keystrokes: Number;
    public start: Number;
    public local_start: Number;
    public timezone: String;
    public project: Project;
    public pluginId: Number;
    public version: String;
    public os: String;

    constructor(project: Project) {
        (this.source = {}),
            (this.keystrokes = 0),
            (this.project = project),
            (this.pluginId = PLUGIN_ID);
        this.version = getVersion();
        this.os = getOs();
    }

    /**
     * check if the payload should be sent or not
     */
    hasData() {
        if ((this.keystrokes, 10 > 0)) {
            return true;
        }
        for (const fileName of Object.keys(this.source)) {
            const fileInfoData = this.source[fileName];
            // check if any of the metric values has data
            if (
                fileInfoData &&
                (fileInfoData.add > 0 ||
                    fileInfoData.paste > 0 ||
                    fileInfoData.open > 0 ||
                    fileInfoData.close > 0 ||
                    fileInfoData.delete > 0)
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * send the payload
     */
    postData() {
        const payload = JSON.parse(JSON.stringify(this));
        payload.keystrokes = String(payload.keystrokes);

        // ensure the start and end are exactly DEFAULT_DURATION apart
        let d = new Date();
        d = new Date(d.getTime() - DEFAULT_DURATION_MILLIS);
        // offset is the minutes from GMT.
        // it's positive if it's before, and negative after
        const offset = d.getTimezoneOffset();
        const offset_sec = offset * 60;
        payload.start = Math.round(d.getTime() / 1000);
        // subtract the offset_sec (it'll be positive before utc and negative after utc)
        payload.local_start = payload.start - offset_sec;
        payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const projectName =
            payload.project && payload.project.directory
                ? payload.project.directory
                : "null";

        // Null out the project if the project's name is 'null'
        if (projectName === "null") {
            payload.project = null;
        }

        if (!isTelemetryOn()) {
            storePayload(payload);
            logIt(
                "Software metrics are currently paused. Enable metrics to view your KPM info."
            );
            return;
        }

        sendOfflineData();

        logIt(`sending ${JSON.stringify(payload)}`);

        // POST the kpm to the PluginManager
        softwarePost("/data", payload, getItem("jwt")).then(async resp => {
            if (!isResponseOk(resp)) {
                storePayload(payload);
            }
            setTimeout(() => {
                fetchDailyKpmSessionInfo();
            }, 5000);
        });
    }
}
