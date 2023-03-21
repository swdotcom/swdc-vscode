import { commands } from "vscode";
import { getUserPreferences } from "../DataController";

export const NORMAL_SCREEN_MODE = 0;
export const ZEN_MODE_ID = 1;
export const FULL_SCREEN_MODE_ID = 2;

let preferredScreenMode: number = 0;
let currentModeId: number = 0;

export async function getConfiguredScreenMode() {
  const preferences: any = await getUserPreferences();

  const flowModeSettings = preferences?.flowMode || {};
  const screenMode = flowModeSettings?.editor?.vscode?.screenMode;
  if (screenMode?.includes("Full Screen")) {
    preferredScreenMode = FULL_SCREEN_MODE_ID;
  } else if (screenMode?.includes("Zen")) {
    preferredScreenMode = ZEN_MODE_ID;
  } else {
    preferredScreenMode = NORMAL_SCREEN_MODE;
  }
  return preferredScreenMode;
}

export function showZenMode() {
  if (currentModeId !== ZEN_MODE_ID) {
    currentModeId = ZEN_MODE_ID;
    commands.executeCommand("workbench.action.toggleZenMode");
  }
}

export function showFullScreenMode() {
  if (currentModeId !== FULL_SCREEN_MODE_ID) {
    commands.executeCommand("workbench.action.toggleFullScreen");
    currentModeId = FULL_SCREEN_MODE_ID;
  }
}

export function showNormalScreenMode() {
  if (currentModeId !== NORMAL_SCREEN_MODE) {
    if (currentModeId === FULL_SCREEN_MODE_ID) {
      currentModeId = NORMAL_SCREEN_MODE;
      commands.executeCommand("workbench.action.toggleFullScreen");
    } else if (currentModeId === ZEN_MODE_ID) {
      currentModeId = NORMAL_SCREEN_MODE;
      commands.executeCommand("workbench.action.toggleZenMode");
    }
  }
}

export function isInZenMode() {
  return !!(currentModeId === ZEN_MODE_ID);
}

export function isInFullScreenMode() {
  return !!(currentModeId === FULL_SCREEN_MODE_ID);
}
