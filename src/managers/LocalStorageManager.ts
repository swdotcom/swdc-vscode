import { ExtensionContext, Memento } from 'vscode';
import { logIt } from '../Util';

export class LocalStorageManager {

  private static instance: LocalStorageManager;

  static getInstance(context: ExtensionContext): LocalStorageManager {
    if (!LocalStorageManager.instance) {
		  LocalStorageManager.instance = new LocalStorageManager(context.workspaceState);
    }

    return LocalStorageManager.instance;
  }

  constructor(private storage: Memento) {
	  this.storage = storage;
  }

  public getValue(key: string) : any {
    return this.storage.get(key, null);
  }

  public setValue(key: string, value: any) {
    this.storage.update(key, value);
  }
}

let localStorage: LocalStorageManager;

export function initializeLocalStorage(context: ExtensionContext) {
  localStorage = LocalStorageManager.getInstance(context);
}

export function getStorageValue(key: string) {
  if (localStorage) {
    return localStorage.getValue(key);
  } else {
    logIt('local storage has not been initialized')
  }
}

export function setStorageValue(key: string, value: any) {
  if (localStorage) {
    return localStorage.setValue(key, value);
  } else {
    logIt('local storage has not been initialized')
  }
}

export function getAutoFlowModeTrigger() {
  return getFirstEnabledTriggerByName('flow_mode_enabled');
}

export function getAutoFlowModeDisabledTrigger() {
  return getFirstEnabledTriggerByName('flow_mode_disabled');
}

export function getCronTriggers() {
  return getTriggerByName('cron');
}

export function getEditorFocusTriggers() {
  return getTriggerByName('editor_focus');
}

export function getEditorUnFocusTriggers() {
  return getTriggerByName('editor_unfocus');
}

export function getProtectedCodeTimeStartTriggers() {
  return getTriggerByName('protected_code_time_started');
}

export function getProtectedCodeTimeEndTriggers() {
  return getTriggerByName('protected_code_time_ended');
}

export function getFirstEnabledTriggerByName(name: string) {
  const triggers = getStorageValue('automation_triggers');
  if (triggers?.length) {
    for (const trigger of triggers) {
      if (trigger.automation_trigger_type.name === name && trigger.enabled) {
        return trigger
      }
    }
  }
  return null;
}

export function getTriggerByName(name: string) {
  const triggers = getStorageValue('automation_triggers');
  if (!triggers) {
    return [];
  }
  return triggers.filter((trigger: any) => trigger.automation_trigger_type.name === name);
}
