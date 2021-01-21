import { TreeDataProvider, TreeItemCollapsibleState, EventEmitter, Event, TreeView, Disposable } from "vscode";
import { checkToDisableFlow } from "../managers/FlowManager";
import { getScreenMode, updateScreenMode } from "../managers/ScreenManager";
import { KpmItem } from "../model/models";
import { getFlowTreeParents, KpmTreeItem } from "./KpmProviderManager";
import { handleChangeSelection } from "./TreeUtil";
import { clearSlackInfoCache } from "../managers/SlackManager";

const collapsedStateMap = {};

let initialized = false;

export const connectCodeTimeFlowTreeView = (treeProvider: CodeTimeFlowProvider, view: TreeView<KpmItem>, screen_mode: number) => {
  let screenMode = screen_mode;
  let provider: CodeTimeFlowProvider = treeProvider;

  return Disposable.from(
    view.onDidCollapseElement(async (e) => {
      const item: KpmItem = e.element;
      collapsedStateMap[item.label] = TreeItemCollapsibleState.Collapsed;
    }),

    view.onDidExpandElement(async (e) => {
      const item: KpmItem = e.element;
      collapsedStateMap[item.label] = TreeItemCollapsibleState.Expanded;
    }),

    view.onDidChangeSelection(async (e) => {
      if (!e.selection || e.selection.length === 0) {
        return;
      }
      const item: KpmItem = e.selection[0];
      handleChangeSelection(view, item);
    }),

    view.onDidChangeVisibility((e) => {
      if (e.visible) {
        const prevScreenMode = getScreenMode();
        // set the screen mode based on screen mode this flow is associated with
        // full, zen, normal
        updateScreenMode(screenMode);

        let refreshProvider = false;
        const screenModeChanged = prevScreenMode !== screenMode;
        if (screenModeChanged || !initialized) {
          refreshProvider = true;
        }

        // refresh this provider if the screen mode changed or we're initializing
        if (refreshProvider || provider.refresh_scheduled) {
          provider.refresh_scheduled = false;
          clearSlackInfoCache();
          setTimeout(() => {
            initialized = true;
            provider.refresh();
          }, 0);
        }

        if (screenModeChanged) {
          // check to see if flow mode has ended manually
          setTimeout(() => {
            checkToDisableFlow();
          }, 0);
        }
      }
    })
  );
};

export class CodeTimeFlowProvider implements TreeDataProvider<KpmItem> {
  private _onDidChangeTreeData: EventEmitter<KpmItem | undefined> = new EventEmitter<KpmItem | undefined>();

  readonly onDidChangeTreeData: Event<KpmItem | undefined> = this._onDidChangeTreeData.event;

  private view: TreeView<KpmItem>;
  public screen_mode: number = 0;
  public refresh_scheduled: boolean = false;

  constructor(screenMode: number) {
    this.screen_mode = screenMode;
  }

  bindView(kpmTreeView: TreeView<KpmItem>): void {
    this.view = kpmTreeView;
  }

  getParent(_p: KpmItem) {
    return void 0; // all playlists are in root
  }

  refresh(): void {
    if (this.view && this.view.visible) {
      this._onDidChangeTreeData.fire(null);
    }
  }

  scheduleRefresh(): void {
    this.refresh_scheduled = true;
  }

  refreshParent(parent: KpmItem) {
    if (this.view && this.view.visible) {
      this._onDidChangeTreeData.fire(parent);
    }
  }

  getTreeItem(p: KpmItem): KpmTreeItem {
    let treeItem: KpmTreeItem = null;
    try {
      if (p.children.length) {
        let collasibleState = collapsedStateMap[p.label];
        if (p.initialCollapsibleState !== undefined) {
          treeItem = createKpmTreeItem(p, p.initialCollapsibleState);
        } else if (!collasibleState) {
          treeItem = createKpmTreeItem(p, TreeItemCollapsibleState.Collapsed);
        } else {
          treeItem = createKpmTreeItem(p, collasibleState);
        }
      } else {
        treeItem = createKpmTreeItem(p, TreeItemCollapsibleState.None);
      }
    } catch (e) {}

    return treeItem;
  }

  async getChildren(element?: KpmItem): Promise<KpmItem[]> {
    let kpmItems: KpmItem[] = [];
    if (initialized && this.view.visible) {
      try {
        if (element) {
          // return the children of this element
          kpmItems = element.children;
        } else {
          // return the parent elements
          kpmItems = await getFlowTreeParents();
        }
      } catch (e) {}
    }
    return kpmItems;
  }
}

/**
 * Create the tree item (root or leaf)
 * @param p
 * @param cstate
 */
function createKpmTreeItem(p: KpmItem, cstate: TreeItemCollapsibleState) {
  return new KpmTreeItem(p, cstate);
}
