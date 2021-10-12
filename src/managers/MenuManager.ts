import {commands, QuickPickOptions, window} from 'vscode';
import {launchWebUrl} from '../Util';

export function showQuickPick(pickOptions: any): any {
  if (!pickOptions || !pickOptions['items']) {
    return;
  }
  const options: QuickPickOptions = {
    matchOnDescription: false,
    matchOnDetail: false,
    placeHolder: pickOptions.placeholder || '',
  };

  return window.showQuickPick(pickOptions.items, options).then(async (item: any) => {
    if (item) {
      const url: string = item['url'];
      const cb: any = item['cb'];
      const command: string = item['command'];
      const commandArgs: [] = item['commandArgs'] || [];
      if (url) {
        launchWebUrl(url);
      } else if (cb) {
        cb();
      } else if (command) {
        commands.executeCommand(command, ...commandArgs);
      }
    }
    return item;
  });
}
