export class KpmItem {
    id: string = "";
    label: string = "";
    description: string = "";
    tooltip: string = "";
    command: string = "";
    type: string = "";
    contextValue: string = "";
    callback: any = null;
    icon: string = "";
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
    path: string = "";
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
}

export class SessionSummary {
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

export class LoggedInState {
    loggedIn: boolean = false;
}
