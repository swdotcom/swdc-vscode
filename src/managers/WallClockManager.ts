import { getItem, humanizeMinutes, setItem } from "../Util";
import { commands, window } from "vscode";
import { updateStatusBarWithSummaryData } from "./StatusBarManager";
import { incrementEditorSeconds } from "../storage/TimeSummaryData";
import { KpmManager } from "./KpmManager";

const SECONDS_INTERVAL = 30;
const CLOCK_INTERVAL = 1000 * SECONDS_INTERVAL;
let clock_mgr_interval = null;

export class WallClockManager {
  private static instance: WallClockManager;

  private _wctime: number = 0;

  private constructor() {
    this.initTimer();
  }

  static getInstance(): WallClockManager {
    if (!WallClockManager.instance) {
      WallClockManager.instance = new WallClockManager();
    }

    return WallClockManager.instance;
  }

  public dispose() {
    clearInterval(clock_mgr_interval);
  }

  private initTimer() {
    const kpmMgr: KpmManager = KpmManager.getInstance();

    this._wctime = getItem("wctime") || 0;
    clock_mgr_interval = setInterval(async () => {
      // If the window is focused or we have in-memory keystroke data
      if (window.state.focused || kpmMgr.hasKeystrokeData()) {
        // set the wctime (deprecated, remove one day when all plugins use time data info)
        this._wctime = getItem("wctime");
        if (!this._wctime || isNaN(this._wctime)) {
          this._wctime = 0;
        }
        this._wctime += SECONDS_INTERVAL;
        setItem("wctime", this._wctime);

        // update the file info file
        incrementEditorSeconds(SECONDS_INTERVAL);
      }
      // dispatch to the various views (statusbar and treeview)
      this.dispatchStatusViewUpdate();
    }, CLOCK_INTERVAL);
  }

  public dispatchStatusViewUpdate() {
    // update the status bar
    updateStatusBarWithSummaryData();

    // update the code time metrics tree views
    commands.executeCommand("codetime.refreshCodeTimeView");
  }

  public getHumanizedWcTime() {
    return humanizeMinutes(this._wctime / 60);
  }

  public getWcTimeInSeconds() {
    return this._wctime;
  }
}
