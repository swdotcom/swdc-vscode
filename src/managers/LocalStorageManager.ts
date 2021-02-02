import { ExtensionContext } from "vscode";

let ctx: ExtensionContext = null;

export function initializeLocalStorageContext(context: ExtensionContext) {
  ctx = context;
}

export function updateGlobalState(key: string, val: any) {
  if (!ctx) {
    console.error("global state context is not set");
    return;
  }
  ctx.globalState.update(key, val);
}

export function getGlobalState(key: string): any {
  if (!ctx) {
    console.error("global state context is not set");
    return null;
  }
  return ctx.globalState.get(key);
}

export function clearGlobalState(key: string) {
  if (!ctx) {
    console.error("global state context is not set");
    return;
  }
  return ctx.globalState.update(key, null);
}
