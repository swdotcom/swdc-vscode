import Project from "./Project";

export default class TimeData {
    timestamp: number = 0;
    timestamp_local: number = 0;
    now_local: number = 0;
    editor_seconds: number = 0;
    session_seconds: number = 0;
    file_seconds: number = 0;
    day: string = "";
    project: Project = new Project();
}
