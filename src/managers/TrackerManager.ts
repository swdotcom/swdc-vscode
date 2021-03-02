import swdcTracker from "swdc-tracker";
import { api_endpoint } from "../Constants";
import {
  getPluginName,
  getItem,
  getPluginId,
  getVersion,
  getWorkspaceFolders,
  getGitEventFile,
  isGitProject,
} from "../Util";
import { KpmItem, FileChangeInfo } from "../model/models";
import { getResourceInfo } from "../repo/KpmRepoManager";
import KeystrokeStats from "../model/KeystrokeStats";
import {
  getDefaultBranchFromRemoteBranch,
  getRepoIdentifierInfo,
  getLocalChanges,
  getLatestCommitForBranch,
  getChangesForCommit,
  authors,
  getCommitsForAuthors,
  getInfoForCommit,
  commitAlreadyOnRemote,
  isMergeCommit
} from '../repo/GitUtil';
import { getPreference } from "../DataController";

const fileIt = require("file-it");
const moment = require("moment-timezone");

export class TrackerManager {
  private static instance: TrackerManager;

  private trackerReady: boolean = false;
  private pluginParams: any = this.getPluginParams();
  private eventVersions: Map<string, number> = new Map();

  private constructor() { }

  static getInstance(): TrackerManager {
    if (!TrackerManager.instance) {
      TrackerManager.instance = new TrackerManager();
    }

    return TrackerManager.instance;
  }

  public async init() {
    // initialize tracker with swdc api host, namespace, and appId
    const result = await swdcTracker.initialize(
      api_endpoint,
      "CodeTime",
      "swdc-vscode"
    );
    if (result.status === 200) {
      this.trackerReady = true;
    }
  }

  public async trackCodeTimeEvent(keystrokeStats: KeystrokeStats) {
    if (!this.trackerReady) {
      return;
    }

    // extract the project info from the keystroke stats
    const projectInfo = {
      project_directory: keystrokeStats.project.directory,
      project_name: keystrokeStats.project.name,
    };

    // loop through the files in the keystroke stats "source"
    const fileKeys = Object.keys(keystrokeStats.source);
    for await (let file of fileKeys) {
      const fileData: FileChangeInfo = keystrokeStats.source[file];

      const codetime_entity = {
        keystrokes: fileData.keystrokes,
        lines_added: fileData.documentChangeInfo.linesAdded,
        lines_deleted: fileData.documentChangeInfo.linesDeleted,
        characters_added: fileData.documentChangeInfo.charactersAdded,
        characters_deleted: fileData.documentChangeInfo.charactersDeleted,
        single_deletes: fileData.documentChangeInfo.singleDeletes,
        multi_deletes: fileData.documentChangeInfo.multiDeletes,
        single_adds: fileData.documentChangeInfo.singleAdds,
        multi_adds: fileData.documentChangeInfo.multiAdds,
        auto_indents: fileData.documentChangeInfo.autoIndents,
        replacements: fileData.documentChangeInfo.replacements,
        start_time: moment.unix(fileData.start).utc().format(),
        end_time: moment.unix(fileData.end).utc().format(),
      };

      const file_entity = {
        file_name: fileData.fsPath?.split(fileData.projectDir)?.[1],
        file_path: fileData.fsPath,
        syntax: fileData.syntax,
        line_count: fileData.lines,
        character_count: fileData.length,
      };

      const repoParams = await this.getRepoParams(keystrokeStats.project.directory);

      const codetime_event = {
        ...codetime_entity,
        ...file_entity,
        ...projectInfo,
        ...this.pluginParams,
        ...this.getJwtParams(),
        ...repoParams,
      };

      swdcTracker.trackCodeTimeEvent(codetime_event);
    }
  }

  public async trackUIInteraction(item: KpmItem) {
    // ui interaction doesn't require a jwt, no need to check for that here
    if (!this.trackerReady) {
      return;
    }

    const ui_interaction = {
      interaction_type: item.interactionType,
    };

    const ui_element = {
      element_name: item.name,
      element_location: item.location,
      color: item.color ? item.color : null,
      icon_name: item.interactionIcon ? item.interactionIcon : null,
      cta_text: !item.hideCTAInTracker
        ? item.label || item.description || item.tooltip
        : "redacted",
    };

    const ui_event = {
      ...ui_interaction,
      ...ui_element,
      ...this.pluginParams,
      ...this.getJwtParams(),
    };

    swdcTracker.trackUIInteraction(ui_event);
  }

  public async trackGitLocalEvent(gitEventName: string, branch?: string, commit?: string) {
    if (!this.trackerReady) {
      return;
    }
    const projectParams = this.getProjectParams();

    if (gitEventName === "uncommitted_change") {
      this.trackUncommittedChangeGitEvent(projectParams);
    } else if (gitEventName === "local_commit" && branch) {
      this.trackLocalCommitGitEvent(projectParams, branch, commit)
    } else {
      return;
    }
  }

  public async trackGitRemoteEvent(event) {
    if (!this.trackerReady) {
      return;
    }
    const projectParams = this.getProjectParams();
    const remoteBranch = event.path.split(".git/")[1]

    this.trackBranchCommitGitEvent(projectParams, remoteBranch, event.path)
  }

  public async trackGitDeleteEvent(event) {
    this.removeBranchFromTrackingHistory(event.path);
  }

  private async trackUncommittedChangeGitEvent(projectParams) {
    const uncommittedChanges = await this.getUncommittedChangesParams(projectParams.project_directory);

    this.sendGitEvent("uncommitted_change", projectParams, uncommittedChanges)
  }

  private async trackLocalCommitGitEvent(projectParams, branch: string, commit?: string) {
    if (!commit) {
      commit = await getLatestCommitForBranch(projectParams.project_directory, branch)
    }
    if (await commitAlreadyOnRemote(projectParams.project_directory, commit)) {
      return;
    }
    if (await isMergeCommit(projectParams.project_directory, commit)) {
      return;
    }
    const commitInfo = await getInfoForCommit(projectParams.project_directory, commit)
    const file_changes = await getChangesForCommit(projectParams.project_directory, commit)
    const eventData = { commit_id: commit, git_event_timestamp: commitInfo.authoredTimestamp, file_changes }

    this.sendGitEvent("local_commit", projectParams, eventData)
  }

  private async trackBranchCommitGitEvent(projectParams, remoteBranch: string, event_path: string) {
    const defaultBranch = await getDefaultBranchFromRemoteBranch(projectParams.project_directory, remoteBranch)
    const gitAuthors = await authors(projectParams.project_directory);
    let lastTrackedRef = this.getLatestTrackedCommit(event_path)
    let gitEventName;

    if (remoteBranch === defaultBranch) {
      gitEventName = "default_branch_commit"
    } else {
      gitEventName = "branch_commit"
      // If we have not tracked this branch before, then pull all commits
      // based on the default branch being the parent. This may not be true
      // but it will prevent us from pulling the entire commit history of
      // the author.
      if (lastTrackedRef === "") {
        lastTrackedRef = defaultBranch;
      }
    }

    const commits = await getCommitsForAuthors(
      projectParams.project_directory,
      remoteBranch,
      lastTrackedRef,
      gitAuthors
    )

    for (const commit of commits) {
      const file_changes = await getChangesForCommit(projectParams.project_directory, commit.commit)
      const eventData = { commit_id: commit.commit, git_event_timestamp: commit.authoredTimestamp, file_changes }

      this.sendGitEvent(gitEventName, projectParams, eventData)
    }

    // Save the latest commit SHA
    if (commits[0]) {
      this.setLatestTrackedCommit(event_path, commits[0].commit)
    }
  }

  private async sendGitEvent(gitEventName: string, projectParams, eventData?: any) {
    if (getPreference("disableGitData") === true) return;

    const repoParams = await this.getRepoParams(projectParams.project_directory);
    const gitEvent = {
      git_event_type: gitEventName,
      ...eventData,
      ...this.pluginParams,
      ...this.getJwtParams(),
      ...projectParams,
      ...repoParams,
    };
    // send the event
    swdcTracker.trackGitEvent(gitEvent);
  }

  public async trackEditorAction(entity: string, type: string, event?: any) {
    if (!this.trackerReady) {
      return;
    }

    const projectParams = this.getProjectParams();

    if (type == 'save') {
      if (this.eventVersionIsTheSame(event)) return;
      if (isGitProject(projectParams.project_directory)) {
        this.trackGitLocalEvent("uncommitted_change", event);
      }
    }

    const repoParams = await this.getRepoParams(projectParams.project_directory);

    const editor_event = {
      entity,
      type,
      ...this.pluginParams,
      ...this.getJwtParams(),
      ...projectParams,
      ...this.getFileParams(event, projectParams.project_directory),
      ...repoParams,
    };
    // send the event
    swdcTracker.trackEditorAction(editor_event);
  }

  // Static attributes
  getPluginParams(): any {
    return {
      plugin_id: getPluginId(),
      plugin_name: getPluginName(),
      plugin_version: getVersion(),
    };
  }

  // Dynamic attributes

  getJwtParams(): any {
    return { jwt: getItem("jwt")?.split("JWT ")[1] };
  }

  getProjectParams() {
    const workspaceFolders = getWorkspaceFolders();
    const project_directory = workspaceFolders.length ? workspaceFolders[0].uri.fsPath : "";
    const project_name = workspaceFolders.length ? workspaceFolders[0].name : "";

    return { project_directory, project_name };
  }

  async getRepoParams(projectRootPath) {
    const resourceInfo = await getResourceInfo(projectRootPath);
    if (!resourceInfo || !resourceInfo.identifier) {
      // return empty data, no need to parse further
      return {
        identifier: "",
        org_name: "",
        repo_name: "",
        repo_identifier: "",
        git_branch: "",
        git_tag: "",
      };
    }

    // retrieve the git identifier info
    const gitIdentifiers = getRepoIdentifierInfo(resourceInfo.identifier);

    return {
      ...gitIdentifiers,
      repo_identifier: resourceInfo.identifier,
      git_branch: resourceInfo.branch,
      git_tag: resourceInfo.tag,
    };
  }

  async getUncommittedChangesParams(projectRootPath) {
    const stats = await getLocalChanges(projectRootPath);

    return { file_changes: stats };
  }

  eventVersionIsTheSame(event) {
    const isSame = this.eventVersions.get(event.fileName) == event.version;
    if (isSame) {
      return true;
    } else {
      // Add filename and version to map
      this.eventVersions.set(event.fileName, event.version)
      if (this.eventVersions.size > 5) {
        // remove oldest entry in map to stay small
        this.eventVersions.delete(this.eventVersions.keys().next().value);
      }
      return false;
    }
  }

  getFileParams(event, projectRootPath) {
    if (!event) return {};
    // File Open and Close have document attributes on the event.
    // File Change has it on a `document` attribute
    const textDoc = event.document || event;
    if (!textDoc) {
      return {
        file_name: "",
        file_path: "",
        syntax: "",
        line_count: 0,
        character_count: 0,
      };
    }

    let character_count = 0;
    if (typeof textDoc.getText === "function") {
      character_count = textDoc.getText().length;
    }

    return {
      file_name: textDoc.fileName?.split(projectRootPath)?.[1],
      file_path: textDoc.fileName,
      syntax: textDoc.languageId || textDoc.fileName?.split(".")?.slice(-1)?.[0],
      line_count: textDoc.lineCount || 0,
      character_count,
    };
  }

  setLatestTrackedCommit(dotGitFilePath: string, commit: string) {
    // dotGitFilePath: /Users/somebody/code/repo_name/.git/refs/remotes/origin/main
    fileIt.setJsonValue(
      getGitEventFile(),
      dotGitFilePath,
      { latestTrackedCommit: commit },
      { spaces: 2 }
    );
  }

  getLatestTrackedCommit(dotGitFilePath: string): string {
    // dotGitFilePath: /Users/somebody/code/repo_name/.git/refs/remotes/origin/main
    const data = fileIt.getJsonValue(getGitEventFile(), dotGitFilePath);

    return data?.latestTrackedCommit || ""
  }

  removeBranchFromTrackingHistory(dotGitFilePath: string) {
    let data = fileIt.readJsonFileSync(getGitEventFile())

    delete data[dotGitFilePath];

    fileIt.writeJsonFileSync(getGitEventFile(), data, { spaces: 2 })
  }
}
