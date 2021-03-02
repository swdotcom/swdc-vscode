import { window } from "vscode";
import { showDashboard } from "../managers/WebViewManager";
import { getItem } from "../Util";
import { softwareGet, isResponseOk } from "../http/HttpClient";
import { configureSettings } from "../managers/ConfigManager";
import { TrackerManager } from "../managers/TrackerManager";
import { KpmItem, UIInteractionType } from "../model/models";

const moment = require("moment-timezone");

let timer = undefined;

export const setEndOfDayNotification = async (user: any) => {
  // clear any existing timer
  if (timer) {
    clearTimeout(timer);
  }

  // If the end of day notification setting is turned on (if undefined or null, will default to true)
  if (user.preferences?.notifications?.endOfDayNotification !== false) {
    const jwt = getItem("jwt");

    if (jwt) {
      // get the user's work hours from their profile
      const response = await softwareGet("/users/profile", jwt);
      if (isResponseOk(response) && response.data?.work_hours) {
        // get the m-f work hours
        const workHours = response.data.work_hours.map((workHours: any) => {
          return buildStartEndFormatsOfUnixTuple(workHours);
        });

        // get milliseconds until the end of the day
        const now = moment().tz(Intl.DateTimeFormat().resolvedOptions().timeZone);
        const todaysWorkHours = workHours.find((wh) => wh.day === now.format("dddd"));
        const { end } = todaysWorkHours;
        const msUntilEndOfTheDay = 1000 // end.valueOf() - now.valueOf();

        // if the end of the day is in the future...
        if (msUntilEndOfTheDay > 0) {
          // set a timer to show the end of day notification at the end of the day
          timer = setTimeout(showEndOfDayNotification, msUntilEndOfTheDay);
        }
      } else {
        console.error("[CodeTime] error response from /users/profile", response);
      }
    }
  }
};

export const showEndOfDayNotification = async () => {
  const tracker: TrackerManager = TrackerManager.getInstance();
  const selection = await window.showInformationMessage("It's the end of your work day! Would you like to see your code time stats for today?", ...["Settings", "Show me the data"]);

  if (selection === "Show me the data") {
    let item = showMeTheDataKpmItem();
    tracker.trackUIInteraction(item);
    showDashboard();
  } else if (selection === "Settings") {
    let item = configureSettingsKpmItem();
    tracker.trackUIInteraction(item);
    configureSettings();
  }
}

export function configureSettingsKpmItem(): KpmItem {
  const item: KpmItem = new KpmItem();
  item.name = "ct_configure_settings_btn";
  item.description = "End of day notification - configure settings";
  item.location = "ct_notification";
  item.label = "Settings"
  item.interactionType = UIInteractionType.Click
  item.interactionIcon = null;
  item.color = null;
  return item;
}


export function showMeTheDataKpmItem(): KpmItem {
  const item: KpmItem = new KpmItem();
  item.name = "ct_show_me_the_data_btn";
  item.description = "End of day notification - Show me the data";
  item.location = "ct_notification";
  item.label = "Show me the data"
  item.interactionType = UIInteractionType.Click
  item.interactionIcon = null;
  item.color = null;
  return item;
}

const buildStartEndFormatsOfUnixTuple = (tuple: any, startOfUnit = "week") => {
  if (!tuple || tuple.length !== 2) {
    return {};
  }

  // get the 1st timestamp as the start
  let start = tuple[0];
  // get the 2nd one as the end of the time range
  let end = tuple[1];

  // create the moment start and end starting from
  // the beginning of the week as the unix timestamp
  // is the number of seconds since the beginning of the week.
  let momentStart = moment().startOf(startOfUnit).add(start, "seconds");
  let momentEnd = moment().startOf(startOfUnit).add(end, "seconds");

  // return as an example: {"9:00am", "6:00pm", "Friday"}
  return {
    start: momentStart,
    end: momentEnd,
    day: momentStart.format("dddd"),
  };
};
