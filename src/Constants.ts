export const LOGIN_LABEL = 'Log in';
export const LOGOUT_LABEL = 'Log out';
export const UNTITLED = 'Untitled';
export const NO_PROJ_NAME = 'Unnamed';
export const CODE_TIME_PLUGIN_ID = 2;
export const CODE_TIME_EXT_ID = 'softwaredotcom.swdc-vscode';
export const MUSIC_TIME_EXT_ID = "softwaredotcom.music-time";
export const EDITOR_OPS_EXT_ID = "softwaredotcom.editor-ops";
export const CODE_TIME_TYPE = 'codetime';
export const YES_LABEL = 'Yes';
export const SIGN_UP_LABEL = 'Sign up';
export const DISCONNECT_LABEL = 'Disconnect';
export const HIDE_CODE_TIME_STATUS_LABEL = 'Hide Code Time status';
export const SHOW_CODE_TIME_STATUS_LABEL = 'Show Code Time status';

const isDev = process.env.APP_ENV === 'development'
export const SOFTWARE_DIRECTORY = isDev ? '.software-dev' : '.software';
export const websockets_url = isDev ? 'ws://localhost:5001/websockets' : 'wss://api.software.com/websockets';
export const app_url = isDev ? 'http://localhost:3000' : 'https://app.software.com';

export const vscode_issues_url = 'https://github.com/swdotcom/swdc-vscode/issues';

export const ONE_MIN_MILLIS = 1000 * 60;
