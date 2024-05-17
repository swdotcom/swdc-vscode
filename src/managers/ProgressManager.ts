import {ProgressLocation, window} from 'vscode';

export class ProgressManager {
  private static instance: ProgressManager;

  public doneWriting: boolean = true;

  constructor() {
    //
  }

  static getInstance(): ProgressManager {
    if (!ProgressManager.instance) {
      ProgressManager.instance = new ProgressManager();
    }

    return ProgressManager.instance;
  }
}

export function progressIt(msg: string, asyncFunc: any, args: any[] = []) {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: msg,
      cancellable: false,
    },
    async (progress) => {
      if (typeof asyncFunc === 'function') {
        if (args?.length) {
          await asyncFunc(...args).catch((e: any) => {});
        } else {
          await asyncFunc().catch((e: any) => {});
        }
      } else {
        await asyncFunc;
      }
    }
  );
}
