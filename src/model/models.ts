import {getVersion, getPluginId, getOs} from '../Util';
import {TreeItemCollapsibleState} from 'vscode';

export enum UIInteractionType {
  Keyboard = 'keyboard',
  Click = 'click',
}

export class KpmItem {
  id: string = '';
  label: string = '';
  description: string | null = '';
  value: string = '';
  tooltip: string = '';
  command: string = '';
  commandArgs: any[] = [];
  type: string = '';
  contextValue: string = '';
  callback: any = null;
  icon: string | null = null;
  children: KpmItem[] = [];
  color: string | null = '';
  location: string = '';
  name: string = '';
  eventDescription: string | null = null;
  initialCollapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.Collapsed;
  interactionType: UIInteractionType = UIInteractionType.Click;
  interactionIcon: string | null = '';
  hideCTAInTracker: boolean = false;
}

export class SessionSummary {
  currentDayMinutes: number = 0;
  averageDailyMinutes: number = 0;
}

export class DiffNumStats {
  file_name: string = '';
  insertions: number = 0;
  deletions: number = 0;
}

// example: {type: "window", name: "close", timestamp: 1234,
// timestamp_local: 1233, description: "OnboardPrompt"}
export class CodeTimeEvent {
  type: string = '';
  name: string = '';
  timestamp: number = 0;
  timestamp_local: number = 0;
  description: string = '';
  pluginId: number = getPluginId();
  os: string = getOs();
  version: string = getVersion();
  hostname: string = ''; // this is gathered using an await
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
}
