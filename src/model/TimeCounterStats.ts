export default class TimeCounterStats {
    last_focused_timestamp_utc: number = 0;
    last_unfocused_timestamp_utc: number = 0;
    elapsed_code_time_seconds: number = 0;
    elapsed_active_code_time_seconds: number = 0;
    elapsed_seconds: number = 0;
    focused_editor_seconds: number = 0;
    cumulative_code_time_seconds: number = 0;
    cumulative_active_code_time_seconds: number = 0;
    last_payload_end_utc: number = 0;
    current_day: string = "";
}
