import swdcTracker from "swdc-tracker";
import { api_endpoint } from "../Constants";
import { getPluginName, getItem, getPluginId, getVersion, getWorkspaceFolders } from "../Util";
import UIElement from "../model/UIElement";
import { KpmItem } from "../model/models";
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

	/**
	 * @param type execute_command | click
	 * @param ui_element {element_name, element_location, color, icon_name, cta_text}
	 */
	public async trackUIInteraction(item: KpmItem) {
		if (!this.trackerReady) {
			return;
		}

		const ui_element: UIElement = UIElement.transformKpmItemToUIElement(item);

		const baseInfo = this.getBaseTrackerInfo();
		if (!baseInfo.jwt) {
			return;
		}

		const e = {
			interaction_type: item.interactionType,
			...ui_element,
			...baseInfo
		};

		// send the editor action
		swdcTracker.trackUIInteraction(e);
	}

	public async trackEditorAction(type: string, name: string, description: string) {
		if (!this.trackerReady) {
			return;
		}

		const baseInfo = this.getBaseTrackerInfo();
		if (!baseInfo.jwt) {
			return;
		}

		const e = {
			entity: "editor",
			type,
			name,
			description,
			...baseInfo
		};

		// send the 
		swdcTracker.trackEditorAction(e);
	}

	getBaseTrackerInfo() {
		const jwt = getItem("jwt");
		const local = moment().local();
		const tz_offset_minutes =
			moment.parseZone(local).utcOffset();
		const workspaceFolders = getWorkspaceFolders();
		const project_directory = (workspaceFolders.length) ? workspaceFolders[0].uri.fsPath : "";
		const project_name = (workspaceFolders.length) ? workspaceFolders[0].name : "";

		// if the jwt is null, just set it to null so the
		// caller can key off of the baseInfo.jwt to determine if
		// it should be sent or not
		const token = jwt ? jwt.split("JWT ")[1] : null;
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