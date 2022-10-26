import {window, QuickPickOptions, commands} from 'vscode';
import {launchWebUrl} from '../Util';
import {app_url} from '../Constants';

/**
 * Pass in the following array of objects
 * options: {placeholder, items: [{label, description, url, detail, tooltip},...]}
 */

export function showQuickPick(pickOptions: any): any {
  if (!pickOptions || !pickOptions['items']) {
    return;
  }
  let options: QuickPickOptions = {
    matchOnDescription: false,
    matchOnDetail: false,
    placeHolder: pickOptions.placeholder || '',
  };

  return window.showQuickPick(pickOptions.items, options).then(async (item: any) => {
    if (item) {
      const url = item['url'];
      const cb = item['cb'];
      const command = item['command'];
      const commandArgs = item['commandArgs'] || [];
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

export async function launchWebDashboardView() {
  launchWebUrl(`${app_url}/login`);
}
