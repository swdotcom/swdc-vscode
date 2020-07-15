import swdcTracker from "swdc-tracker";
import { api_endpoint } from "../Constants";
import { getPluginName, getItem, getPluginId, getVersion, getWorkspaceFolders } from "../Util";
import { KpmItem } from "../model/models";
const moment = require("moment-timezone");

export class TrackerManager {
	private static instance: TrackerManager;

	private trackerReady: boolean = false;
	private pluginParams: any = this.getPluginParams();
	private tzOffsetParams: any = this.getTzOffsetParams();
	private jwtParams: any = this.getJwtParams();

	private constructor() { }

	static getInstance(): TrackerManager {
		if (!TrackerManager.instance) {
			TrackerManager.instance = new TrackerManager();
		}

		return TrackerManager.instance;
	}

	public async init() {
		// initialize tracker with swdc api host, namespace, and appId
		const result = await swdcTracker.initialize(api_endpoint, "CodeTime", this.pluginParams.plugin_name);
		if (result.status === 200) {
			this.trackerReady = true;
		}
	}

	public resetJwt() {
		this.jwtParams = this.getJwtParams();
	}

	public async trackUIInteraction(item: KpmItem) {
		if (!this.trackerReady) {
			return;
		}

		const ui_interaction = {
			interaction_type: item.interactionType,
		}

		const ui_element = {
			element_name: item.name,
			element_location: item.location,
			color: item.color ? item.color : null,
			icon_name: item.interactionIcon ? item.interactionIcon : null,
			cta_text: !item.hideCTAInTracker ? item.label || item.description || item.tooltip : "redacted"
		}

		const event = {
			...ui_interaction,
			...ui_element,
			...this.pluginParams,
			...this.jwtParams,
			...this.tzOffsetParams
		};

		swdcTracker.trackUIInteraction(event);
	}

	public async trackEditorAction(entity: string, type: string) {
		if (!this.trackerReady) {
			return;
		}

		const e = {
			entity,
			type,
			...this.pluginParams,
			...this.jwtParams,
			...this.tzOffsetParams,
			...this.getFileParams(),
			...this.getProjectParams(),
			...this.getRepoParams()
		};
		// send the event
		swdcTracker.trackEditorAction(e);
	}

	// Static attributes

	getJwtParams(): any {
		return { jwt: getItem("jwt")?.split("JWT ")[1] }
	}

	getPluginParams(): any {
		return {
			plugin_id: getPluginId(),
			plugin_name: getPluginName(),
			plugin_version: getVersion()
		}
	}

	getTzOffsetParams(): any {
		return { tz_offset_minutes: moment.parseZone(moment().local()).utcOffset() }
	}

	// Dynamic attributes

	getProjectParams() {
		const workspaceFolders = getWorkspaceFolders();
		const project_directory = (workspaceFolders.length) ? workspaceFolders[0].uri.fsPath : "";
		const project_name = (workspaceFolders.length) ? workspaceFolders[0].name : "";

		return { project_directory, project_name }
	}

	getRepoParams() {
		return {}
	}

	getFileParams() {
		return {}
	}
}
