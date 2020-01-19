import { getVersion, getPluginId, getHostname, getOs } from "../Util";

export class KpmItem {
    id: string = "";
    label: string = "";
    description: string = "";
    tooltip: string = "";
    command: string = "";
    commandArgs: any[] = [];
    type: string = "";
    contextValue: string = "";
    callback: any = null;
    icon: string = null;
    children: KpmItem[] = [];
    eventDescription: string = null;
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
}

export class SessionSummary {
    currentDayEditorMinutes: number = 0;
    currentDayMinutes: number = 0;
    averageDailyMinutes: number = 0;
    averageDailyKeystrokes: number = 0;
    currentDayKeystrokes: number = 0;
    liveshareMinutes: any = null;
    lastStart: any = null;
    // the attributes below are based on local changes only
    currentCharactersAdded: number = 0;
    currentCharactersDeleted: number = 0;
    currentLinesAdded: number = 0;
    currentLinesRemoved: number = 0;
    currentPastes: number = 0;
}

export class GlobalSessionSummary {
    avg_session_seconds: number = 0;
    avg_keystrokes: number = 0;
    avg_lines_added: number = 0;
    avg_lines_removed: number = 0;
    avg_chars_added: number = 0;
    avg_chars_deleted: number = 0;
    avg_paste: number = 0;
    avg_non_work_seconds: number = 0;
    avg_work_seconds: number = 0;
    avg_start: number = 0;
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
