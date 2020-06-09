const snowplow = require('snowplow-tracker');
const emitter = snowplow.emitter;
const tracker = snowplow.tracker;

// TODO: grab this from server
const e = emitter("com-software-prod1.mini.snplow.net")
const t = tracker([e], "CodeTimeTracker", "CodeTime", false);

export function codeEvent(type: string, jwt?: string) {
	console.log("CODE EVENT", type)
	t.trackUnstructEvent({
		"schema": "iglu:com.software/code_event/jsonschema/1-0-0",
		"data": {
			"type": type,
			"jwt": jwt
		}
	})
};

export function editorAction(entity: string, type: string, tz_offset_minutes: number) {
	console.log("EDITOR ACTION", entity);
	t.trackUnstructEvent({
		"schema": "iglu:com.software/editor_action/jsonschema/1-0-0",
		"data": {
			"entity": entity,
			"type": type,
			"tz_offset_minutes": tz_offset_minutes
		}
	})
}