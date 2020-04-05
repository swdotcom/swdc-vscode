import { CodeTimeEvent } from "../model/models";
import { logIt, getPluginEventsFile, getNowTimes, getHostname } from "../Util";

const fs = require("fs");
const os = require("os");

export class EventManager {
    private static instance: EventManager;

    private constructor() {}

    static getInstance(): EventManager {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager();
        }

        return EventManager.instance;
    }

    storeEvent(event) {
        fs.appendFile(
            getPluginEventsFile(),
            JSON.stringify(event) + os.EOL,
            (err) => {
                if (err) {
                    logIt(
                        `Error appending to the events data file: ${err.message}`
                    );
                }
            }
        );
    }

    /**
     *
     * @param type i.e. window | mouse | etc...
     * @param name i.e. close | click | etc...
     * @param description
     */
    async createCodeTimeEvent(type: string, name: string, description: string) {
        const nowTimes = getNowTimes();
        const event: CodeTimeEvent = new CodeTimeEvent();
        event.timestamp = nowTimes.now_in_sec;
        event.timestamp_local = nowTimes.local_now_in_sec;
        event.type = type;
        event.name = name;
        event.description = description;
        event.hostname = await getHostname();
        this.storeEvent(event);
    }
}
