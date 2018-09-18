import { nowInSecs, storePayload, getItem } from "./Util";
import { softwarePost, isResponseOk } from "./HttpClient";
import { DEFAULT_DURATION } from "./Constants";
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
    public data: Number;
    public start: Number;
    public end: Number;
    public project: Project;
    public pluginId: Number;
    public version: String;

    constructor(project: Project) {
        const startOfEvent = nowInSecs() - DEFAULT_DURATION;

        (this.source = {}),
            (this.type = "Events"),
            (this.data = 0),
            (this.start = startOfEvent),
            (this.end = startOfEvent + 60),
            (this.project = project),
            (this.pluginId = 2);
        this.version = getVersion();
    }

    hasData() {
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
        payload.data = String(payload.data);

        // ensure the start and end are exactly DEFAULT_DURATION apart
        const now = nowInSecs();
        payload.start = now - DEFAULT_DURATION;
        payload.end = now;

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

        console.error(`Software.com: sending ${JSON.stringify(payload)}`);

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
