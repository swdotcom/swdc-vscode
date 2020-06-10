import { softwareGet } from "./http/HttpClient"
const snowplow = require('snowplow-tracker')
const emitter = snowplow.emitter
const tracker = snowplow.tracker

const codetimeEventTracker = <any>{}

codetimeEventTracker.initialize = async () => {
	// fetch tracker_api from plugin config 
	const result = await softwareGet("/plugins/config", null);

	// set tracker configuration
	const tracker_api_host = result.data.tracker_api
	const namespace = "codetime"
	const appId = "swdc-vscode"
	const e = emitter(tracker_api_host)
	// initialize tracker
	codetimeEventTracker.tracker = tracker([e], namespace, appId, false)

	// track editor activation event
	codetimeEventTracker.trackEditorAction("editor", "activate", null)
};

codetimeEventTracker.trackEditorAction = (entity: string, type: string, tz_offset_minutes?: number) => {
	codetimeEventTracker.tracker.trackUnstructEvent({
		schema: "iglu:com.software/editor_action/jsonschema/1-0-0",
		data: {
			entity: entity,
			type: type,
			tz_offset_minutes: tz_offset_minutes
		}
	})
}


export default codetimeEventTracker;