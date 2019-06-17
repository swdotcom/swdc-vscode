import {
    TreeDataProvider,
    TreeItemCollapsibleState,
    Disposable,
    TreeView,
    Command,
    TreeItem,
    EventEmitter,
    Event
} from "vscode";
import * as path from "path";
import { PlaylistItem, PlayerType } from "cody-music";
import { MusicStoreManager } from "./MusicStoreManager";
import {
    connectSpotify,
    createCodingFavoritesPlaylist
} from "./MusicControlManager";

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

            if (playlistItem.id === "connectspotify") {
                connectSpotify();
            } else if (playlistItem.id === "codingfavorites") {
                createCodingFavoritesPlaylist();
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
        return MusicStoreManager.getInstance().settings;
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
        if (treeItem.type === "connectspotify") {
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
        } else if (treeItem.type === "spotifyconnected") {
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
