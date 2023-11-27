import { logIt } from '../Util';

const { execSync } = require('child_process');

export function execCmd(cmd: string = '', projectDir: string | null = null, returnLines: boolean = false): any {
  let result = returnLines ? [] : null;
  if (!cmd) {
    // no command to run, return default
    return result;
  }

  try {
    const opts = projectDir ? { cwd: projectDir, encoding: 'utf8' } : { encoding: 'utf8' };

    const cmdResult = execSync(cmd, opts);
    if (cmdResult && cmdResult.length) {
      const lines = cmdResult.trim().replace(/^\s+/g, ' ').replace(/</g, '').replace(/>/g, '').split(/\r?\n/);
      if (lines.length) {
        result = returnLines ? lines : lines[0];
      }
    }
  } catch (e: any) {
    logIt(`${e.message}`);
  }
  return result;
}
