import { getVersion, getPluginId, getOs } from "../Util";
import { NO_PROJ_NAME } from "../Constants";
import { TreeItemCollapsibleState } from "vscode";

export enum UIInteractionType {
  Keyboard = "keyboard",
  Click = "click",
}

export class KpmItem {
  id: string = "";
  label: string = "";
  description: string = "";
  value: string = "";
  tooltip: string = "";
  command: string = "";
  commandArgs: any[] = [];
  type: string = "";
  contextValue: string = "";
  callback: any = null;
  icon: string = null;
  children: KpmItem[] = [];
  color: string = "";
  location: string = "";
  name: string = "";
  eventDescription: string = null;
  initialCollapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.Collapsed;
  interactionType: UIInteractionType = UIInteractionType.Click;
  interactionIcon: string = "";
  hideCTAInTracker: boolean = false;
}

export class KeystrokeAggregate {
  add: number = 0;
  close: number = 0;
  delete: number = 0;
  linesAdded: number = 0;
  linesRemoved: number = 0;
  open: number = 0;
  paste: number = 0;
  keystrokes: number = 0;
  directory: string = NO_PROJ_NAME;
}

export class DocumentChangeInfo {
  linesAdded: number = 0;
  linesDeleted: number = 0;
  charactersAdded: number = 0;
  charactersDeleted: number = 0;
  singleDeletes: number = 0;
  multiDeletes: number = 0;
  singleAdds: number = 0;
  multiAdds: number = 0;
  autoIndents: number = 0;
  replacements: number = 0;
}

export class FileChangeInfo {
  name: string = "";
  fsPath: string = "";
  projectDir: string = "";
  kpm: number = 0;
  keystrokes: number = 0;
  add: number = 0;
  netkeys: number = 0;
  paste: number = 0;
  charsPasted: number = 0;
  open: number = 0;
  close: number = 0;
  delete: number = 0;
  length: number = 0;
  lines: number = 0;
  linesAdded: number = 0;
  linesRemoved: number = 0;
  syntax: string = "";
  fileAgeDays: number = 0;
  repoFileContributorCount: number = 0;
  start: number = 0;
  end: number = 0;
  local_start: number = 0;
  local_end: number = 0;
  update_count: number = 0;
  duration_seconds: number = 0;
  documentChangeInfo: DocumentChangeInfo = new DocumentChangeInfo();
}

export class SessionSummary {
  currentDayMinutes: number = 0;
  averageDailyMinutes: number = 0;
}

export class LoggedInState {
  loggedIn: boolean = false;
}

export class CommitChangeStats {
  insertions: number = 0;
  deletions: number = 0;
  fileCount: number = 0;
  commitCount: number = 0;
}

export class DiffNumStats {
  file_name: string = "";
  insertions: number = 0;
  deletions: number = 0;
}

// example: {type: "window", name: "close", timestamp: 1234,
// timestamp_local: 1233, description: "OnboardPrompt"}
export class CodeTimeEvent {
  type: string = "";
  name: string = "";
  timestamp: number = 0;
  timestamp_local: number = 0;
  description: string = "";
  pluginId: number = getPluginId();
  os: string = getOs();
  version: string = getVersion();
  hostname: string = ""; // this is gathered using an await
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
}
