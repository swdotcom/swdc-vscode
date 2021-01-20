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

export function toggleZenMode() {
  commands.executeCommand("workbench.action.toggleZenMode");
}

export function toggleFullScreenMode() {
  commands.executeCommand("workbench.action.toggleFullScreen");
}

export function showZenMode() {
  if (screenMode !== ZEN_MODE_ID) {
    commands.executeCommand("workbench.action.toggleZenMode");
  }
}

export function showFullScreenMode() {
  if (screenMode !== FULL_SCREEN_MODE_ID) {
    commands.executeCommand("workbench.action.toggleFullScreen");
  }
}

export function showNormalScreenMode() {
  if (screenMode !== NORMAL_SCREEN_MODE) {
    if (screenMode == FULL_SCREEN_MODE_ID) {
      commands.executeCommand("workbench.action.toggleFullScreen");
    } else if (screenMode == ZEN_MODE_ID) {
      commands.executeCommand("workbench.action.toggleZenMode");
    }
  }
}

export function isInZenMode() {
  return !!(screenMode === ZEN_MODE_ID);
}

export function isInFullScreenMode() {
  return !!(screenMode === FULL_SCREEN_MODE_ID);
}
