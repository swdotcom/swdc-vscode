import swdcTracker from "swdc-tracker";
import { api_endpoint } from "../Constants";
import { getPluginName, getItem, getPluginId, getVersion, getWorkspaceFolders } from "../Util";
import UIElement from "../model/UIElement";
const moment = require("moment-timezone");

export class TrackerManager {
	private static instance: TrackerManager;

	private trackerReady: boolean = false;

	private constructor() { }

	static getInstance(): TrackerManager {
		if (!TrackerManager.instance) {
			TrackerManager.instance = new TrackerManager();
		}

		return TrackerManager.instance;
	}

	public async init() {
		const pluginName = getPluginName();
		// initialize tracker with swdc api host, namespace, and appId
		const result = await swdcTracker.initialize(api_endpoint, "CodeTime", pluginName);
		if (result.status === 200) {
			this.trackerReady = true;
		}
	}

	public async trackUICommandInteraction(ui_element: UIElement) {
		this.trackUIInteraction("execute_command", ui_element);
	}

	public async trackUIClickInteraction(ui_element: UIElement) {
		this.trackUIInteraction("click", ui_element);
	}

	/**
	 * @param type execute_command | click
	 * @param ui_element {element_name, element_location, color, icon_name, cta_text}
	 */
	private async trackUIInteraction(interaction_type: string, ui_element: UIElement) {
		const jwt = getItem("jwt");
		if (!this.trackerReady || !jwt) {
			return;
		}

		const e = {
			interaction_type,
			...ui_element,
			...this.getBaseTrackerInfo()
		};

		swdcTracker.trackEditorAction(e).then(result => {
			console.log(`sent editor action: ${JSON.stringify(e)}`)
		}).catch(e => {
			console.log(`editor action send error: ${e.message}`);
		});
	}

	public async trackEditorAction(type: string, name: string, description: string) {
		const jwt = getItem("jwt");
		if (!this.trackerReady || !jwt) {
			return;
		}

		const e = {
			entity: "editor",
			type,
			name,
			description,
			...this.getBaseTrackerInfo()
		};

		swdcTracker.trackEditorAction(e).then(result => {
			console.log(`sent editor action: ${e.type} ${e.name} ${e.description}`)
		}).catch(e => {
			console.log(`editor action send error: ${e.message}`);
		});
	}

	getBaseTrackerInfo() {
		const jwt = getItem("jwt");
		const local = moment().local();
		const tz_offset_minutes =
			moment.parseZone(local).utcOffset();
		const workspaceFolders = getWorkspaceFolders();
		const project_directory = (workspaceFolders.length) ? workspaceFolders[0].uri.fsPath : "";
		const project_name = (workspaceFolders.length) ? workspaceFolders[0].name : "";

		const token = jwt.split("JWT ")[1];
		const baseInfo = {
			jwt: token,
			tz_offset_minutes,
			project_directory,
			project_name,
			plugin_id: getPluginId(),
			plugin_name: getPluginName(),
			plugin_version: getVersion()
		};
		return baseInfo;
	}
}