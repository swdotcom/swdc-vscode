export interface IConfig {
  name: string;
  description: string;
  users: IUser[];
}
export interface IUser {
  name: string;
  active: boolean;
  roles: string[];
}

export interface ICommand {
  action: CommandAction;
  content: IConfig;
}

export enum CommandAction {
  Save,
}
