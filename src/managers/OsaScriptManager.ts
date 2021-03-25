import { commands, window } from "vscode";
import { getItem, setItem } from "../Util";
import { execCmd } from "./ExecManager";

const cp = require("child_process");

export async function toggleDarkMode() {
  setItem("checked_sys_events", true);
  const darkModeCmd = `osascript -e \'
        tell application "System Events"
          tell appearance preferences
            set dark mode to not dark mode
          end tell
        end tell \'`;

  await cp.exec(darkModeCmd);
  commands.executeCommand("codetime.refreshCodeTimeView");
}

export async function isDarkMode() {
  let isDarkMode = false;

  // first check to see if the user has "System Events" authorized
  const checked_sys_events = getItem("checked_sys_events");

  if (checked_sys_events) {
    const getDarkModeFlag = `osascript -e \'
      try
        tell application "System Events"
          tell appearance preferences
            set t_info to dark mode
          end tell
        end tell
      on error
        return false
      end try\'`;
    const isDarkModeStr = execCmd(getDarkModeFlag);
    // convert it to a string
    if (isDarkModeStr !== undefined && isDarkModeStr !== null && isDarkModeStr !== "") {
      try {
        isDarkMode = JSON.parse(`${isDarkModeStr}`);
      } catch (e) {}
    } else {
      // it's not defined, set it
      isDarkMode = false;
    }
  }
  return isDarkMode;
}

// change the position of the dock depending on user input
export async function toggleDockPosition() {
  setItem("checked_sys_events", true);
  let newPosition = await window.showInputBox({ placeHolder: "left, right, or bottom?" });

  function setPosition(position: any) {
    return `osascript -e \'
      tell application "System Events"
        tell dock preferences
          set properties to {screen edge:${position}}
        end tell
      end tell \'`;
  }

  if (newPosition) {
    cp.exec(setPosition(newPosition));
  }
}

// hide and unhide the dock
export async function toggleDock() {
  setItem("checked_sys_events", true);
  let toggleDockCmd = `osascript -e \'
    tell application "System Events"
      tell dock preferences
        set x to autohide
        if x is false then
          set properties to {autohide:true}
        else
          set properties to {autohide:false}
        end if
      end tell
    end tell \'`;

  cp.exec(toggleDockCmd);
}

async function execPromise(command: string, opts: {} = {}) {
  return new Promise((resolve, reject) => {
    cp.exec(command, opts, (error: any, stdout: string, stderr: any) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}
