import { Disposable, extensions } from 'vscode';
import { getExtensionsFile, getItem, getOs } from '../Util';
import { getJsonItem, setJsonItem, storeJsonData } from './FileManager';
import { TrackerManager } from './TrackerManager';

export class ExtensionManager {
  private static instance: ExtensionManager;

  private _disposable: Disposable;
  private tracker: TrackerManager;
  private ONE_WEEK_MILLIS: number = 1000 * 60 * 60 * 24 * 7;
  private INSTALLED_ACTION: string = 'installed';
  private UNINSTALLED_ACTION: string = 'uninstalled';

  constructor() {
    let subscriptions: Disposable[] = [];
    this.tracker = TrackerManager.getInstance();
    subscriptions.push(extensions.onDidChange(this.onExtensionChange, this));
    this._disposable = Disposable.from(...subscriptions);
  }

  static getInstance(): ExtensionManager {
    if (!ExtensionManager.instance) {
      ExtensionManager.instance = new ExtensionManager();
    }

    return ExtensionManager.instance;
  }

  public dispose() {
    this._disposable.dispose();
  }

  public initialize() {
    if (getItem('jwt')) {
      this.initializeExtensionsFile();
      this.reconcileInstalledAndUninstalledPlugins();
    }
  }

  private initializeExtensionsFile() {
    const jwt = getItem('jwt');
    // initialize the extension file if it doesn't already exist
    const extensionsFile: string = getExtensionsFile();
    const eventDate = getJsonItem(extensionsFile, 'eventDate');
    const extensionsJwt = getJsonItem(extensionsFile, 'jwt')

    // initialize or re-send the installed plugins
    const now = new Date().toISOString();
    if (!eventDate || (new Date().getTime() - new Date(eventDate).getTime() > this.ONE_WEEK_MILLIS) || jwt !== extensionsJwt) {
      storeJsonData(extensionsFile, {eventDate: now, jwt: jwt, data: {}});
      this.getInstalledPlugins(now);
    }
  }

  private async onExtensionChange() {
    if (getItem('jwt')) {
      this.reconcileInstalledAndUninstalledPlugins();
    }
  }

  private reconcileInstalledAndUninstalledPlugins(): void {
    const now = new Date().toISOString();
    const extensionsFile: string = getExtensionsFile();
    const extensionData: any = getJsonItem(extensionsFile, 'data');
    const installedPlugins: any[] = this.getInstalledPlugins(now);
    const missingPlugins: any[] = Object.keys(extensionData).map(
      (key: string) => {
        if (!installedPlugins.find((n) => n.id === extensionData[key].id)) {
          const missingPlugin = extensionData[key];
          delete extensionData[key];
          return missingPlugin;
        }
      }
    ).filter((n) => n != null);

    // update the file
    setJsonItem(extensionsFile, 'data', extensionData);

    if (missingPlugins.length) {
      // send these events
      missingPlugins.forEach((plugin) => {
        plugin['action'] = this.UNINSTALLED_ACTION;
        this.tracker.trackVSCodeExtension(plugin);
      });
    }
  }

  private getInstalledPlugins(now: string): any[] {
    const extensionsFile: string = getExtensionsFile();
    const extensionData: any = getJsonItem(extensionsFile, 'data');
    const os = getOs();
    const plugins = extensions.all.filter(
      (extension: any) => extension.packageJSON.publisher != 'vscode' && !extension.packageJSON.isBuiltin
    ).map((extension: any) => {
      const pkg: any = extension.packageJSON;
      const existingExtension: any = extensionData[pkg.id];

      // set the plugin info into the extensions file if it doesn't exist
      if (!existingExtension) {
        const plugin: any = this.buildInstalledExtensionInfo(pkg, now, os);
        extensionData[pkg.id] = plugin;
        // Track the newly installed extension
        this.tracker.trackVSCodeExtension(plugin);
      }

      return extensionData[pkg.id];
    });
    // write the data back to the file
    setJsonItem(extensionsFile, 'data', extensionData);

    return plugins;
  }

  private buildInstalledExtensionInfo(pkg: any, eventDate: string, os: string) {
    return {
      action: this.INSTALLED_ACTION,
      event_at: eventDate,
      os: os,
      id: pkg.id,
      publisher: pkg.publisher,
      name: pkg.name,
      display_name: pkg.displayName,
      author: pkg.author?.name || pkg.publisher,
      version: pkg.version,
      description: this.truncateString(pkg.description, 2048),
      categories: pkg.categories,
      extension_kind: pkg.extensionKind ? [].concat(pkg.extensionKind) : null
    }
  }

  private truncateString(str: string, maxLen: number) {
    if (str && str.length > maxLen) {
      return str.slice(0, maxLen - 3) + "...";
    } else {
      return str;
    }
  }
}
