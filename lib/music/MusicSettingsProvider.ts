import {
    TreeDataProvider,
    TreeItemCollapsibleState,
    Disposable,
    TreeView,
    Command,
    TreeItem,
    EventEmitter,
    Event,
    commands
} from "vscode";
import * as path from "path";
import { PlaylistItem } from "cody-music";

const createSettingsTreeItem = (
    p: PlaylistItem,
    cstate: TreeItemCollapsibleState
) => {
    return new SettingsTreeItem(p, cstate);
};

export const connectSettingsTreeView = (view: TreeView<PlaylistItem>) => {
    return Disposable.from(
        view.onDidChangeSelection(e => {
            if (!e.selection || e.selection.length === 0) {
                return;
            }
            let playlistItem: PlaylistItem = e.selection[0];

            if (playlistItem.command) {
                // run the command
                commands.executeCommand(playlistItem.command);
                // clear the selection and refresh the playlist
                commands.executeCommand("musictime.refreshPlaylist");
            }
        }),
        view.onDidChangeVisibility(e => {
            if (e.visible) {
                //
            }
        })
    );
};

export class MusicSettingsProvider implements TreeDataProvider<PlaylistItem> {
    private _onDidChangeTreeData: EventEmitter<
        PlaylistItem | undefined
    > = new EventEmitter<PlaylistItem | undefined>();
    readonly onDidChangeTreeData: Event<PlaylistItem | undefined> = this
        ._onDidChangeTreeData.event;

    constructor() {
        //
    }

    getParent?(
        element: PlaylistItem
    ): import("vscode").ProviderResult<PlaylistItem> {
        return void 0;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PlaylistItem): SettingsTreeItem {
        return createSettingsTreeItem(element, TreeItemCollapsibleState.None);
    }

    getChildren(
        element?: PlaylistItem
    ): import("vscode").ProviderResult<PlaylistItem[]> {
        return [];
    }
}

class SettingsTreeItem extends TreeItem {
    private treeItemIcon: string = "";

    private resourcePath: string = path.join(
        __filename,
        "..",
        "..",
        "..",
        "resources"
    );

    constructor(
        private readonly treeItem: PlaylistItem,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly command?: Command
    ) {
        super(treeItem.name, collapsibleState);
        if (treeItem.type === "spotify") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "icons8-spotify.svg"
            );
            this.iconPath.light = path.join(
                this.resourcePath,
                "dark",
                "icons8-spotify.svg"
            );
        } else if (treeItem.type === "itunes") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "icons8-itunes.svg"
            );
            this.iconPath.light = path.join(
                this.resourcePath,
                "dark",
                "icons8-itunes.svg"
            );
        } else if (treeItem.type === "connected") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "wifi.svg"
            );
            this.iconPath.light = path.join(
                this.resourcePath,
                "dark",
                "wifi.svg"
            );
        } else if (treeItem.type === "offline") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "nowifi.svg"
            );
            this.iconPath.light = path.join(
                this.resourcePath,
                "dark",
                "nowifi.svg"
            );
        } else if (treeItem.type === "paw") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "pl-paw.svg"
            );
            this.iconPath.light = path.join(
                this.resourcePath,
                "dark",
                "pl-paw.svg"
            );
        } else {
            delete this.iconPath;
        }
    }

    get tooltip(): string {
        return `${this.treeItem.tooltip}`;
    }

    iconPath = {
        light: "",
        dark: ""
    };

    contextValue = "settingsItem";
}
