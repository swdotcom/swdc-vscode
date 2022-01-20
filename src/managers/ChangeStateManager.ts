import {commands, Disposable, window, workspace} from 'vscode';
import {TrackerManager} from './TrackerManager';
import {EditorFlow, EditorType, FlowEventType, ProjectChangeInfo, VSCodeInterface} from '@swdotcom/editor-flow';
import {configureSettings, showingConfigureSettingsPanel} from './ConfigManager';
import {getWorkspaceName, setItem} from '../Util';
import { checkWebsocketConnection } from '../websockets';

export class ChangeStateManager {
  private static instance: ChangeStateManager;
  private disposable: Disposable;
  private tracker: TrackerManager;

  constructor() {
    let subscriptions: Disposable[] = [];

    this.tracker = TrackerManager.getInstance();

    const iface: VSCodeInterface = {
      disposable: Disposable,
      window: window,
      workspace: workspace,
    };

    const editorFlow: EditorFlow = EditorFlow.getInstance(EditorType.VSCODE, iface);
    const emitter: any = editorFlow.getEmitter();

    emitter.on('editor_flow_data', (data: any) => {
      switch (data.flow_event_type) {
        case FlowEventType.SAVE:
          this.fileSaveHandler(data.event);
          break;
        case FlowEventType.UNFOCUS:
          this.windowStateChangeHandler(data.event);
          break;
        case FlowEventType.FOCUS:
          this.windowStateChangeHandler(data.event);
          break;
        case FlowEventType.THEME:
          this.themeKindChangeHandler(data.event);
          break;
        case FlowEventType.KPM:
          // get the project_change_info attribute and post it
          this.kpmHandler(data.project_change_info);
          break;
      }
    });

    this.disposable = Disposable.from(...subscriptions);
  }

  static getInstance(): ChangeStateManager {
    if (!ChangeStateManager.instance) {
      ChangeStateManager.instance = new ChangeStateManager();
    }

    return ChangeStateManager.instance;
  }

  private kpmHandler(projectChangeInfo: ProjectChangeInfo) {
    this.tracker.trackCodeTimeEvent(projectChangeInfo);
  }

  private fileSaveHandler(event: any) {
    this.tracker.trackEditorAction('file', 'save', event);
  }

  private windowStateChangeHandler(event: any) {
    if (event.focused) {
      this.tracker.trackEditorAction('editor', 'focus');
      setItem('vscode_primary_window', getWorkspaceName());
      // check if the websocket connection is stale
      checkWebsocketConnection();
    } else {
      this.tracker.trackEditorAction('editor', 'unfocus');
    }
  }

  private themeKindChangeHandler(event: any) {
    // let the sidebar know the new current color kind
    setTimeout(() => {
      commands.executeCommand('codetime.refreshCodeTimeView');
      if (showingConfigureSettingsPanel()) {
        setTimeout(() => {
          configureSettings();
        }, 500);
      }
    }, 150);
  }

  public dispose() {
    this.disposable.dispose();
  }
}
