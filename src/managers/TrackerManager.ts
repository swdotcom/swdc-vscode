import swdcTracker from 'swdc-tracker';
import {api_endpoint} from '../Constants';
import {version} from 'vscode';
import {
  getPluginName,
  getItem,
  getPluginId,
  getVersion,
  getWorkspaceFolders,
  getGitEventFile,
  isGitProject,
  getEditorName
} from '../Util';
import {KpmItem} from '../model/models';
import {getResourceInfo} from '../repo/KpmRepoManager';
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
  isMergeCommit,
} from '../repo/GitUtil';
import {getFileDataAsJson, getJsonItem, setJsonItem, storeJsonData} from './FileManager';
import {DocChangeInfo, ProjectChangeInfo} from '@swdotcom/editor-flow';
import { LocalStorageManager } from './LocalStorageManager';
import { getUserPreferences } from '../DataController';

export class TrackerManager {
  private static instance: TrackerManager;

  private trackerReady: boolean = false;
  private pluginParams: any = this.getPluginParams();
  private eventVersions: Map<string, number> = new Map();
  public static storageMgr: LocalStorageManager | undefined = undefined;

  private constructor() {}

  static getInstance(): TrackerManager {
    if (!TrackerManager.instance) {
      TrackerManager.instance = new TrackerManager();
    }

    return TrackerManager.instance;
  }

  public dispose() {
    swdcTracker.dispose();
  }

  public async init() {
    // initialize tracker with swdc api host, namespace, and appId
    const result = await swdcTracker.initialize(api_endpoint, 'CodeTime', 'swdc-vscode');
    if (result.status === 200) {
      this.trackerReady = true;
    }
  }

  public async trackCodeTimeEvent(projectChangeInfo: ProjectChangeInfo) {
    if (!this.trackerReady) {
      return;
    }

    // extract the project info from the keystroke stats
    const projectInfo = {
      project_directory: projectChangeInfo.project_directory,
      project_name: projectChangeInfo.project_name,
    };

    // loop through the files in the keystroke stats "source"
    const fileKeys = Object.keys(projectChangeInfo.docs_changed);
    for await (const file of fileKeys) {
      const docChangeInfo: DocChangeInfo = projectChangeInfo.docs_changed[file];

      const startDate = new Date(docChangeInfo.start).toISOString();
      const endDate = new Date(docChangeInfo.end).toISOString();

      // check if this is a dup (i.e. secondary workspace or window sending the same event)
      if (this.isDupCodeTimeEvent(startDate, endDate)) return;

      const codetime_entity = {
        keystrokes: docChangeInfo.keystrokes,
        lines_added: docChangeInfo.linesAdded,
        lines_deleted: docChangeInfo.linesDeleted,
        characters_added: docChangeInfo.charactersAdded,
        characters_deleted: docChangeInfo.charactersDeleted,
        single_deletes: docChangeInfo.singleDeletes,
        multi_deletes: docChangeInfo.multiDeletes,
        single_adds: docChangeInfo.singleAdds,
        multi_adds: docChangeInfo.multiAdds,
        auto_indents: docChangeInfo.autoIndents,
        replacements: docChangeInfo.replacements,
        start_time: startDate,
        end_time: endDate,
      };

      const file_entity = {
        file_name: docChangeInfo.file_name,
        file_path: docChangeInfo.file_path,
        syntax: docChangeInfo.syntax,
        line_count: docChangeInfo.line_count,
        character_count: docChangeInfo.character_count,
      };

      const repoParams = await this.getRepoParams(projectChangeInfo.project_directory);

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
    if (!this.trackerReady || !item) {
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
      cta_text: !item.hideCTAInTracker ? item.label || item.description || item.tooltip : 'redacted',
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

    if (gitEventName === 'uncommitted_change') {
      this.trackUncommittedChangeGitEvent(projectParams);
    } else if (gitEventName === 'local_commit' && branch) {
      this.trackLocalCommitGitEvent(projectParams, branch, commit);
    } else {
      return;
    }
  }

  public async trackGitRemoteEvent(event: any) {
    if (!this.trackerReady) {
      return;
    }
    const projectParams = this.getProjectParams();
    const remoteBranch = event.path.split('.git/')[1];

    this.trackBranchCommitGitEvent(projectParams, remoteBranch, event.path);
  }

  public async trackGitDeleteEvent(event: any) {
    this.removeBranchFromTrackingHistory(event.path);
  }

  private async trackUncommittedChangeGitEvent(projectParams: any) {
    const uncommittedChanges = await this.getUncommittedChangesParams(projectParams.project_directory);

    this.sendGitEvent('uncommitted_change', projectParams, uncommittedChanges);
  }

  private async trackLocalCommitGitEvent(projectParams: any, branch: string, commit?: string) {
    if (!commit) {
      commit = await getLatestCommitForBranch(projectParams.project_directory, branch);
    }
    if (await commitAlreadyOnRemote(projectParams.project_directory, commit)) {
      return;
    }
    if (await isMergeCommit(projectParams.project_directory, commit)) {
      return;
    }
    const commitInfo = await getInfoForCommit(projectParams.project_directory, commit);
    const file_changes = await getChangesForCommit(projectParams.project_directory, commit);
    const eventData = {commit_id: commit, git_event_timestamp: commitInfo.authoredTimestamp, file_changes};

    this.sendGitEvent('local_commit', projectParams, eventData);
  }

  private async trackBranchCommitGitEvent(projectParams: any, remoteBranch: string, event_path: string) {
    const defaultBranch = await getDefaultBranchFromRemoteBranch(projectParams.project_directory, remoteBranch);
    const gitAuthors = await authors(projectParams.project_directory);
    let lastTrackedRef = this.getLatestTrackedCommit(event_path);
    let gitEventName;

    if (remoteBranch === defaultBranch) {
      gitEventName = 'default_branch_commit';
    } else {
      gitEventName = 'branch_commit';
      // If we have not tracked this branch before, then pull all commits
      // based on the default branch being the parent. This may not be true
      // but it will prevent us from pulling the entire commit history of
      // the author.
      if (lastTrackedRef === '') {
        lastTrackedRef = defaultBranch;
      }
    }

    const commits = await getCommitsForAuthors(
      projectParams.project_directory,
      remoteBranch,
      lastTrackedRef,
      gitAuthors
    );

    for (const commit of commits) {
      const file_changes = await getChangesForCommit(projectParams.project_directory, commit.commit);
      const eventData = {commit_id: commit.commit, git_event_timestamp: commit.authoredTimestamp, file_changes};

      this.sendGitEvent(gitEventName, projectParams, eventData);
    }

    // Save the latest commit SHA
    if (commits[0]) {
      this.setLatestTrackedCommit(event_path, commits[0].commit);
    }
  }

  private async sendGitEvent(gitEventName: string, projectParams: any, eventData?: any) {
    const preferences: any = await getUserPreferences();
    if (preferences?.disableGitData) return;

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
        this.trackGitLocalEvent('uncommitted_change', event);
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

  // action: installed | uninstalled | enabled | disabled
  public async trackVSCodeExtension(eventData: any) {
    if (!this.trackerReady) {
      return;
    }

    const vscode_extension_event = {
      ...eventData,
      ...this.pluginParams,
      ...this.getJwtParams(),
    }

    swdcTracker.trackVSCodeExtension(vscode_extension_event)
  }

  // Static attributes
  getPluginParams(): any {
    return {
      plugin_id: getPluginId(),
      plugin_name: getPluginName(),
      plugin_version: getVersion(),
      editor_name: getEditorName(),
      editor_version: version,
    };
  }

  // Dynamic attributes

  getJwtParams(): any {
    let token: string = getItem('jwt');
    if (token?.match(/\s/)) {
      return {jwt: token?.split(/\s/)[1]};
    }
    return {jwt: token};
  }

  getProjectParams() {
    const workspaceFolders = getWorkspaceFolders();
    const project_directory = workspaceFolders.length ? workspaceFolders[0].uri.fsPath : '';
    const project_name = workspaceFolders.length ? workspaceFolders[0].name : '';

    return {project_directory, project_name};
  }

  async getRepoParams(projectRootPath: string) {
    const resourceInfo = await getResourceInfo(projectRootPath);
    if (!resourceInfo || !resourceInfo.identifier) {
      // return empty data, no need to parse further
      return {
        identifier: '',
        org_name: '',
        repo_name: '',
        repo_identifier: '',
        git_branch: '',
        git_tag: '',
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

  async getUncommittedChangesParams(projectRootPath: string) {
    const stats = await getLocalChanges(projectRootPath);

    return {file_changes: stats};
  }

  eventVersionIsTheSame(event: any) {
    const isSame = this.eventVersions.get(event.fileName) == event.version;
    if (isSame) {
      return true;
    } else {
      // Add filename and version to map
      this.eventVersions.set(event.fileName, event.version);
      if (this.eventVersions.size > 5) {
        // remove oldest entry in map to stay small
        this.eventVersions.delete(this.eventVersions.keys().next().value);
      }
      return false;
    }
  }

  getFileParams(event: any, projectRootPath: string) {
    if (!event) return {};
    // File Open and Close have document attributes on the event.
    // File Change has it on a `document` attribute
    const textDoc = event.document || event;
    if (!textDoc) {
      return {
        file_name: '',
        file_path: '',
        syntax: '',
        line_count: 0,
        character_count: 0,
      };
    }

    let character_count = 0;
    if (typeof textDoc.getText === 'function') {
      character_count = textDoc.getText().length;
    }

    return {
      file_name: textDoc.fileName?.split(projectRootPath)?.[1],
      file_path: textDoc.fileName,
      syntax: textDoc.languageId || textDoc.fileName?.split('.')?.slice(-1)?.[0],
      line_count: textDoc.lineCount || 0,
      character_count,
    };
  }

  setLatestTrackedCommit(dotGitFilePath: string, commit: string) {
    // dotGitFilePath: /Users/somebody/code/repo_name/.git/refs/remotes/origin/main
    setJsonItem(getGitEventFile(), dotGitFilePath, {latestTrackedCommit: commit});
  }

  getLatestTrackedCommit(dotGitFilePath: string): string {
    // dotGitFilePath: /Users/somebody/code/repo_name/.git/refs/remotes/origin/main
    const data = getJsonItem(getGitEventFile(), dotGitFilePath, null);
    if (data) {
      try {
        const jsonData = JSON.parse(data)
        return jsonData.latestTrackedCommit || '';
      } catch (e) {
        // ignore
      }
    }
    return '';
  }

  removeBranchFromTrackingHistory(dotGitFilePath: string) {
    let data = getFileDataAsJson(getGitEventFile());

    delete data[dotGitFilePath];
    storeJsonData(getGitEventFile(), data);
  }

  isDupCodeTimeEvent(startDate: string, endDate: string) {
    // check if this is a dup (i.e. secondary workspace or window sending the same event)
    const key = `$ct_event_${startDate}`
    if (TrackerManager.storageMgr) {
      const dupEvent = TrackerManager.storageMgr.getValue(key);
      if (dupEvent) {
        return true;
      } else {
        TrackerManager.storageMgr.setValue(key, endDate);
        // delete the key/value after 10 seconds
        setTimeout(() => {
          TrackerManager.storageMgr?.deleteValue(key);
        }, 1000 * 10);
      }
    }
    return false;
  }
}
