import {workspace, Disposable, RelativePattern, Uri} from 'vscode';
import { getUserPreferences } from '../DataController';
import { getFirstWorkspaceFolder, logIt } from '../Util';
import { TrackerManager } from './TrackerManager';

const fs = require('fs');
export class KpmManager {
  private static instance: KpmManager;

  private _disposable: Disposable;

  private tracker: TrackerManager;

  constructor() {
    let subscriptions: Disposable[] = [];
    this.tracker = TrackerManager.getInstance();

    const workspaceFolder = getFirstWorkspaceFolder();
    if (workspaceFolder) {
      // Watch .git directory changes
      // Only works if the git directory is in the workspace
      const localGitWatcher = workspace.createFileSystemWatcher(
        new RelativePattern(workspaceFolder, '{**/.git/refs/heads/**}')
      );
      const remoteGitWatcher = workspace.createFileSystemWatcher(
        new RelativePattern(workspaceFolder, '{**/.git/refs/remotes/**}')
      );
      subscriptions.push(localGitWatcher);
      subscriptions.push(remoteGitWatcher);
      subscriptions.push(localGitWatcher.onDidChange(this._onCommitHandler, this));
      subscriptions.push(remoteGitWatcher.onDidChange(this._onCommitHandler, this));
      subscriptions.push(remoteGitWatcher.onDidCreate(this._onCommitHandler, this));
      subscriptions.push(remoteGitWatcher.onDidDelete(this._onBranchDeleteHandler, this));
    }

    this._disposable = Disposable.from(...subscriptions);
  }

  static getInstance(): KpmManager {
    if (!KpmManager.instance) {
      KpmManager.instance = new KpmManager();
    }

    return KpmManager.instance;
  }

  private async _onCommitHandler(event: Uri) {
    const preferences: any = await getUserPreferences();
    if (preferences?.disableGitData) return;

    // Branches with naming style of "feature/fix_the_thing" will fire an
    // event when the /feature directory is created. Check if file.
    const stat = fs.statSync(event.path);
    if (!stat?.isFile()) return;

    if (event.path.includes('/.git/refs/heads/')) {
      // /.git/refs/heads/<branch_name>
      const branch = event.path.split('.git/')[1];
      let commit;
      try {
        commit = fs.readFileSync(event.path, 'utf8').trimEnd();
      } catch (err: any) {
        logIt(`Error reading ${event.path}: ${err.message}`);
      }
      this.tracker.trackGitLocalEvent('local_commit', branch, commit);
    } else if (event.path.includes('/.git/refs/remotes/')) {
      // /.git/refs/remotes/<branch_name>
      this.tracker.trackGitRemoteEvent(event);
    }
  }

  private async _onBranchDeleteHandler(event: Uri) {
    this.tracker.trackGitDeleteEvent(event);
  }

  public dispose() {
    this._disposable.dispose();
  }
}
