import { storePayload, getItem } from "./Util";
import { softwarePost, isResponseOk } from "./HttpClient";
import { DEFAULT_DURATION, DEFAULT_DURATION_MILLIS } from "./Constants";
import { getVersion, isTelemetryOn, sendOfflineData } from "../extension";
import { deleteProjectNameFromMap } from "./KpmController";
import { chekUserAuthenticationStatus } from "./KpmStatsManager";

// ? marks that the parameter is optional
type Project = {
    directory: String;
    name?: String;
    identifier: String;
    resource: {};
};

export class KpmDataManager {
    public source: {};
    public type: String;
    public keystrokes: Number;
    public start: Number;
    public local_start: Number;
    public offset: Number;
    public timezone: String;
    public project: Project;
    public pluginId: Number;
    public version: String;

    constructor(project: Project) {
        (this.source = {}),
            (this.type = "Events"),
            (this.keystrokes = 0),
            (this.project = project),
            (this.pluginId = 2);
        this.version = getVersion();
    }

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

    postData() {
        const payload = JSON.parse(JSON.stringify(this));
        payload.keystrokes = String(payload.keystrokes);

        // ensure the start and end are exactly DEFAULT_DURATION apart
        let d = new Date();
        d = new Date(d.getTime() - DEFAULT_DURATION_MILLIS);
        // offset is the minutes from GMT. it's positive if it's before, and negative after
        const offset = d.getTimezoneOffset();
        const offset_sec = offset * 60;
        payload.start = Math.round(d.getTime() / 1000);
        // subtract the offset_sec (it'll be positive before utc and negative after utc)
        payload.local_start = payload.start - offset_sec;
        payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        payload.offset = offset;

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
            console.log(
                "Software metrics are currently paused. Enable metrics to view your KPM info."
            );
            return;
        }

        sendOfflineData();

        console.log(`Software.com: sending ${JSON.stringify(payload)}`);

        // POST the kpm to the PluginManager
        softwarePost("/data", payload, getItem("jwt")).then(resp => {
            deleteProjectNameFromMap(projectName);
            if (!isResponseOk(resp)) {
                storePayload(payload);
                chekUserAuthenticationStatus();
            }
        });
    }
}
