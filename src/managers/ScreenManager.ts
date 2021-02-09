import { commands } from "vscode";

export const NORMAL_SCREEN_MODE = 0;
export const ZEN_MODE_ID = 1;
export const FULL_SCREEN_MODE_ID = 2;

let screenMode: number = 0;

export function updateScreenMode(screen_mode: number) {
  screenMode = screen_mode;
}

export function getScreenMode() {
  return screenMode;
}

export function showZenMode() {
  if (screenMode !== ZEN_MODE_ID) {
    screenMode = ZEN_MODE_ID;
    commands.executeCommand("workbench.action.toggleZenMode");
    return true;
  }
  return false;
}

export function showFullScreenMode() {
  if (screenMode !== FULL_SCREEN_MODE_ID) {
    commands.executeCommand("workbench.action.toggleFullScreen");
    screenMode = FULL_SCREEN_MODE_ID;
    return true;
  }
  return false;
}

export function showNormalScreenMode() {
  if (screenMode !== NORMAL_SCREEN_MODE) {
    if (screenMode === FULL_SCREEN_MODE_ID) {
      screenMode = NORMAL_SCREEN_MODE;
      commands.executeCommand("workbench.action.toggleFullScreen");
      return true;
    } else if (screenMode === ZEN_MODE_ID) {
      screenMode = NORMAL_SCREEN_MODE;
      commands.executeCommand("workbench.action.toggleZenMode");
      return true;
    }
  }
  return false;
}

export function isInZenMode() {
  return !!(screenMode === ZEN_MODE_ID);
}

export function isInFullScreenMode() {
  return !!(screenMode === FULL_SCREEN_MODE_ID);
}
