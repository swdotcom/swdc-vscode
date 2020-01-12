import {
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    EventEmitter,
    Event,
    Disposable,
    TreeView,
    commands
} from "vscode";
import { KpmItem } from "./models";
import { KpmProviderManager } from "./KpmProviderManager";
import * as path from "path";

// this current path is in the out/lib. We need to find the resource files
// which are in out/resources
const resourcePath: string = path.join(__filename, "..", "..", "resources");

const kpmProviderMgr: KpmProviderManager = KpmProviderManager.getInstance();

let initializedTreeView = false;

export const connectKpmTreeView = (view: TreeView<KpmItem>) => {
    // view is {selection: Array[n], visible, message}
    return Disposable.from(
        // e is {selection: Array[n]}
        view.onDidChangeSelection(async e => {
            if (!e.selection || e.selection.length === 0) {
                return;
            }

            const item: KpmItem = e.selection[0];

            if (item.command) {
                const args = item.commandArgs || null;
                if (args) {
                    return commands.executeCommand(item.command, ...args);
                } else {
                    // run the command
                    return commands.executeCommand(item.command);
                }
            }
        }),
        view.onDidChangeVisibility(e => {
            if (e.visible) {
                if (initializedTreeView) {
                    commands.executeCommand("codetime.refreshKpmTree");
                }
                initializedTreeView = true;
            }
        })
    );
};
export class KpmProvider implements TreeDataProvider<KpmItem> {
    private _onDidChangeTreeData: EventEmitter<
        KpmItem | undefined
    > = new EventEmitter<KpmItem | undefined>();

    readonly onDidChangeTreeData: Event<KpmItem | undefined> = this
        ._onDidChangeTreeData.event;

    private view: TreeView<KpmItem>;

    constructor() {
        //
    }

    bindView(kpmTreeView: TreeView<KpmItem>): void {
        this.view = kpmTreeView;
    }

    getParent(_p: KpmItem) {
        return void 0; // all playlists are in root
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    refreshParent(parent: KpmItem) {
        this._onDidChangeTreeData.fire(parent);
    }

    getTreeItem(p: KpmItem): KpmTreeItem {
        let treeItem: KpmTreeItem = createKpmTreeItem(
            p,
            TreeItemCollapsibleState.None
        );

        return treeItem;
    }

    async getChildren(element?: KpmItem): Promise<KpmItem[]> {
        let kpmItems: KpmItem[] = [];
        if (element) {
            // return the children of this element
        } else {
            // return the parent elements
            kpmItems = await kpmProviderMgr.getTreeParents();
        }
        return kpmItems;
    }
}

/**
 * The TreeItem contains the "contextValue", which is represented as the "viewItem"
 * from within the package.json when determining if there should be decoracted context
 * based on that value.
 */
export class KpmTreeItem extends TreeItem {
    constructor(
        private readonly treeItem: KpmItem,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly command?: Command
    ) {
        super(treeItem.label, collapsibleState);

        const { lightPath, darkPath, contextValue } = getPlaylistIcon(treeItem);
        if (lightPath && darkPath) {
            this.iconPath.light = lightPath;
            this.iconPath.dark = darkPath;
        } else {
            // no matching tag, remove the tree item icon path
            delete this.iconPath;
        }
        this.contextValue = contextValue;
    }

    get tooltip(): string {
        if (!this.treeItem) {
            return "";
        }
        if (this.treeItem.tooltip) {
            return this.treeItem.tooltip;
        } else {
            return this.treeItem.label;
        }
    }

    iconPath = {
        light: "",
        dark: ""
    };

    contextValue = "treeItem";
}

function getPlaylistIcon(treeItem: KpmItem): any {
    const iconName = treeItem.icon || "Blank_button.svg";
    const lightPath = path.join(resourcePath, "light", iconName);
    const darkPath = path.join(resourcePath, "dark", iconName);
    const contextValue = treeItem.contextValue;
    return { lightPath, darkPath, contextValue };
}

/**
 * Create the playlist tree item (root or leaf)
 * @param p
 * @param cstate
 */
function createKpmTreeItem(p: KpmItem, cstate: TreeItemCollapsibleState) {
    return new KpmTreeItem(p, cstate);
}
