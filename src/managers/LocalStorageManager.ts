import { ExtensionContext, Memento } from "vscode";

export class LocalStorageManager {

  private static instance: LocalStorageManager;

  static getInstance(context: ExtensionContext): LocalStorageManager {
    if (!LocalStorageManager.instance) {
		LocalStorageManager.instance = new LocalStorageManager(context.workspaceState);
    }

    return LocalStorageManager.instance;
  }

  constructor(private storage: Memento) {
	  this.storage = storage;
  }

  public getValue(key : string) : any {
    return this.storage.get(key, null);
  }

  public setValue(key: string, value: any) {
    this.storage.update(key, value);
  }
}
