import { getNowTimes, isNewDay, setItem, getProjectFolder, getWorkspaceName, getHostname } from "../Util";
import { clearSessionSummaryData } from "../storage/SessionSummaryData";
import { clearFileChangeInfoSummaryData } from "../storage/FileChangeInfoSummaryData";
import KeystrokeStats from "../model/KeystrokeStats";
import { UNTITLED, NO_PROJ_NAME } from "../Constants";
import { WorkspaceFolder } from "vscode";
import { getResourceInfo } from "../repo/KpmRepoManager";
import Project from "../model/Project";
import { FileChangeInfo } from "../model/models";
import { TrackerManager } from "./TrackerManager";

const TWO_MIN_INTERVAL: number = 1000 * 60 * 2;

const tracker: TrackerManager = TrackerManager.getInstance();

export class PluginDataManager {
  private static instance: PluginDataManager;

  private dayCheckTimer: any = null;

  private constructor() {
    this.initializePluginDataMgr();
  }

  static getInstance(): PluginDataManager {
    if (!PluginDataManager.instance) {
      PluginDataManager.instance = new PluginDataManager();
    }

    return PluginDataManager.instance;
  }

  dispose() {
    if (this.dayCheckTimer) {
      clearInterval(this.dayCheckTimer);
    }
  }

  /**
   * Fetch the data from the timeCounter.json to
   * populate the tiemstamp and seconds values that may
   * have been set from another window or editor
   */
  initializePluginDataMgr() {
    // Initialize the midnight check handler
    this.dayCheckTimer = setInterval(() => {
      this.midnightCheckHandler();
    }, TWO_MIN_INTERVAL);
  }

  /**
   * If it's a new day...
   * Step 1)
   *   Send offline data
   * Step 2)
   *   Clear "cumulative_code_time_seconds"
   *   Clear "cumulative_active_code_time_seconds"
   * Step 3)
   *   Send other types of offline data like the time data
   * Step 4)
   *   Clear file metrics and set current day to today
   */
  async midnightCheckHandler() {
    if (isNewDay()) {

      // Clear the session summary data (report and status bar info)
      clearSessionSummaryData();

      // clear the file change info (metrics shown in the tree)
      clearFileChangeInfoSummaryData();

      // update the current day
      const nowTimes = getNowTimes();
      setItem("currentDay", nowTimes.day);
    }
  }

  async processPayloadHandler(payload: KeystrokeStats, nowTimes: any, isUnfocus: boolean = false) {
    // this should take the now_in_sec as the truth since the unfocus
    // will trigger the process payload and can happen under a minute
    const now = Math.min(nowTimes.now_in_sec, payload.start + 60);

    // set the payload's end times
    payload.end = now;
    payload.local_end = nowTimes.local_now_in_sec;
    // set the timezone
    payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // set the workspace name
    payload.workspace_name = getWorkspaceName();
    payload.hostname = await getHostname();

    // ensure the payload has the project info
    await this.populatePayloadProject(payload);

    // make sure all files have an end time
    await this.completeFileEndTimes(payload, nowTimes);

    // Update the latestPayloadTimestampEndUtc. It's used to determine session time and elapsed_seconds
    const latestPayloadTimestampEndUtc = getNowTimes().now_in_sec;
    setItem("latestPayloadTimestampEndUtc", latestPayloadTimestampEndUtc);

    // send the payload to the tracker manager
    tracker.trackCodeTimeEvent(payload);
  }


  /**
   * Populate the project information for this specific payload
   * @param payload
   */
  async populatePayloadProject(payload: KeystrokeStats) {
    // GET the project
    // find the best workspace root directory from the files within the payload
    const keys = Object.keys(payload.source);
    let directory = UNTITLED;
    let projName = NO_PROJ_NAME;
    let resourceInfo = null;
    for (let i = 0; i < keys.length; i++) {
      const fileName = keys[i];
      const workspaceFolder: WorkspaceFolder = getProjectFolder(fileName);
      if (workspaceFolder) {
        directory = workspaceFolder.uri.fsPath;
        projName = workspaceFolder.name;
        // since we have this, look for the repo identifier
        resourceInfo = await getResourceInfo(directory);
        break;
      }
    }

    // CREATE the project into the payload
    const p: Project = new Project();
    p.directory = directory;
    p.name = projName;
    p.resource = resourceInfo;
    p.identifier = resourceInfo?.identifier ?? "";
    payload.project = p;
  }

  /**
   * Set the end times for the files that didn't get a chance to set the end time
   * @param payload
   * @param nowTimes
   */
  async completeFileEndTimes(payload: KeystrokeStats, nowTimes) {
    const keys = Object.keys(payload.source);
    // go through each file and make sure the end time is set
    if (keys && keys.length > 0) {
      for await (let key of keys) {
        const fileInfo: FileChangeInfo = payload.source[key];
        // ensure there is an end time
        if (!fileInfo.end) {
          fileInfo.end = nowTimes.now_in_sec;
          fileInfo.local_end = nowTimes.local_now_in_sec;
        }

        payload.source[key] = fileInfo;
      }
    }
  }
}
