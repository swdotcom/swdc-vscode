import {commands, window} from 'vscode';

export const SIGN_UP_LABEL = 'Sign up';

export function showModalSignupPrompt(msg: string) {
  window
    .showInformationMessage(
      msg,
      {
        modal: true,
      },
      SIGN_UP_LABEL
    )
    .then((selection: string | undefined) => {
      if (selection === SIGN_UP_LABEL) {
        commands.executeCommand('');
      }
    });
}
