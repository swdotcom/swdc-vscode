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

  reportProgress(progress: any, increment: number): void {
    if (this.doneWriting) {
      return;
    }

    if (increment < 80) {
      increment += 10;
    } else if (increment < 90) {
      increment += 1;
    }

    increment = Math.min(90, increment);

    setTimeout(() => {
      progress.report({increment});
      this.reportProgress(progress, increment);
    }, 450);
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
      if (args?.length) {
        await asyncFunc(...args).catch((e: any) => {});
      } else {
        await asyncFunc().catch((e: any) => {});
      }
    }
  );
}
