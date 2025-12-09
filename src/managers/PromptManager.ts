import {commands, window} from 'vscode';
import { SIGN_UP_LABEL } from '../Constants';

export function showModalSignupPrompt(msg: string) {
  window
    .showInformationMessage(
      msg,
      SIGN_UP_LABEL
    )
    .then((selection: string | undefined) => {
      if (selection === SIGN_UP_LABEL) {
        commands.executeCommand('codetime.registerAccount');
      }
    });
}
