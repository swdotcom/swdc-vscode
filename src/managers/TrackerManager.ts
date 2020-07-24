import swdcTracker from "swdc-tracker";
import { api_endpoint } from "../Constants";
import { getPluginName, getItem, getPluginId, getVersion, getWorkspaceFolders } from "../Util";
import { KpmItem, FileChangeInfo } from "../model/models";
import { getResourceInfo } from "../repo/KpmRepoManager";
import KeystrokeStats from "../model/KeystrokeStats";

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

	private readyJwt() {
		if (!this.jwtParams || !this.jwtParams.jwt) {
			this.resetJwt();
		}
	}

	public async trackCodeTimeEvent(item: KeystrokeStats) {
		if (!this.trackerReady) {
			return;
		}

		this.readyJwt();

		// extract the project info from the keystroke stats
		const projectInfo = { project_directory: item.project.directory, project_name: item.project.name };

		// loop through the files in the keystroke stats "source"
		const fileKeys = Object.keys(item.source);
		for await (let file of fileKeys) {
			const fileData: FileChangeInfo = item.source[file];

			// missing "chars_pasted"
			const codetime_entity = {
				keystrokes: fileData.keystrokes,
				chars_added: fileData.add,
				chars_deleted: fileData.delete,
				pastes: fileData.paste,
				lines_added: fileData.linesAdded,
				lines_deleted: fileData.linesRemoved,
				start_time: moment.unix(fileData.start).utc().format(),
				end_time: moment.unix(fileData.end).utc().format(),
				tz_offset_minutes: this.tzOffsetParams.tz_offset_minutes
			};

			const file_entity = {
				file_name: fileData.name,
				file_path: fileData.fsPath,
				syntax: fileData.syntax,
				line_count: fileData.lines,
				character_count: fileData.length,
			}

			const repoParams = await this.getRepoParams(item.project.directory);

			const codetime_event = {
				...codetime_entity,
				...file_entity,
				...projectInfo,
				...this.pluginParams,
				...this.jwtParams,
				...this.tzOffsetParams,
				...repoParams
			}

			const resp = await swdcTracker.trackCodeTimeEvent(codetime_event);
		}
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

		const ui_event = {
			...ui_interaction,
			...ui_element,
			...this.pluginParams,
			...this.jwtParams,
			...this.tzOffsetParams
		};

		swdcTracker.trackUIInteraction(ui_event);
	}

	public async trackEditorAction(entity: string, type: string, event?: any) {
		if (!this.trackerReady) {
			return;
		}

		const projectParams = this.getProjectParams();
		const repoParams = await this.getRepoParams(projectParams.project_directory);

		const editor_event = {
			entity,
			type,
			...this.pluginParams,
			...this.jwtParams,
			...this.tzOffsetParams,
			...projectParams,
			...this.getFileParams(event, projectParams.project_directory),
			...repoParams
		};
		// send the event
		swdcTracker.trackEditorAction(editor_event);
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
		return { tz_offset_minutes: moment.parseZone(moment().local()).utcOffset() };
	}

	// Dynamic attributes

	getProjectParams() {
		const workspaceFolders = getWorkspaceFolders();
		const project_directory = (workspaceFolders.length) ? workspaceFolders[0].uri.fsPath : "";
		const project_name = (workspaceFolders.length) ? workspaceFolders[0].name : "";

		return { project_directory, project_name }
	}

	async getRepoParams(projectRootPath) {
		const resourceInfo = await getResourceInfo(projectRootPath);

		let ownerId = ""
		if (resourceInfo.identifier) {
			if (resourceInfo.identifier.includes(":")) {
				ownerId = resourceInfo.identifier.split("/")?.[0]?.split(":")?.[1]
			} else {
				ownerId = resourceInfo.identifier.split("/")?.slice(-2)?.[0]
			}
		}

		return {
			repo_identifier: resourceInfo.identifier,
			repo_name: resourceInfo.identifier?.split("/")?.slice(-1)?.[0]?.split(".git")?.[0],
			git_branch: resourceInfo.branch,
			git_tag: resourceInfo.tag,
			owner_id: ownerId
		}
	}

	getFileParams(event, projectRootPath) {
		if (!event)
			return {}
		// File Open and Close have document attributes on the event.
		// File Change has it on a `document` attribute
		const textDoc = event.document || event

		return {
			file_name: textDoc.fileName?.split(projectRootPath)?.[1],
			file_path: textDoc.uri?.path,
			syntax: textDoc.languageId || textDoc.fileName?.split(".")?.slice(-1)?.[0],
			line_count: textDoc.lineCount || 0,
			character_count: textDoc.getText()?.length || 0
		}
	}
}
