import { ExtensionContext, Memento } from "vscode";

export class LocalStorageManager {

  private static instance: LocalStorageManager;
  private storage: Memento;

  constructor(ctx: ExtensionContext) {
    this.storage = ctx.globalState;
  }

  static getInstance(ctx: ExtensionContext): LocalStorageManager {
    if (!LocalStorageManager.instance) {
      LocalStorageManager.instance = new LocalStorageManager(ctx);
    }
    return LocalStorageManager.instance;
  }

  public getValue<T>(key : string) : string {
    return this.storage.get<string>(key,'');
  }

  public setValue<T>(key : string, value : string) {
    this.storage.update(key, value);
  }

  public deleteValue(key: string) {
    this.storage.update(key, undefined);
  }
}
