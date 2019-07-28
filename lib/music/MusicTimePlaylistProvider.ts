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
import * as path from "path";
import { PlaylistItem, TrackStatus } from "cody-music";
import { playSelectedItem } from "./MusicPlaylistProvider";
import { MusicStateManager } from "./MusicStateManager";
import { MusicManager } from "./MusicManager";

/**
 * Create the playlist tree item (root or leaf)
 * @param p
 * @param cstate
 */
const createMusicTimePlaylistTreeItem = (
    p: PlaylistItem,
    cstate: TreeItemCollapsibleState
) => {
    return new MusicTimePlaylistTreeItem(p, cstate);
};

export const connectPlaylistTreeView = (view: TreeView<PlaylistItem>) => {
    return Disposable.from(
        view.onDidChangeSelection(async e => {
            if (!e.selection || e.selection.length === 0) {
                return;
            }
            let playlistItem: PlaylistItem = e.selection[0];

            if (playlistItem.command) {
                // run the command
                commands.executeCommand(playlistItem.command);
                return;
            }

            // play it
            playSelectedItem(playlistItem);
        }),
        view.onDidChangeVisibility(e => {
            if (e.visible) {
                MusicStateManager.getInstance().musicStateCheck();
            }
        })
    );
};

export class MusicTimePlaylistProvider
    implements TreeDataProvider<PlaylistItem> {
    private _onDidChangeTreeData: EventEmitter<
        PlaylistItem | undefined
    > = new EventEmitter<PlaylistItem | undefined>();

    readonly onDidChangeTreeData: Event<PlaylistItem | undefined> = this
        ._onDidChangeTreeData.event;

    private view: TreeView<PlaylistItem>;

    constructor() {
        //
    }

    bindView(view: TreeView<PlaylistItem>): void {
        this.view = view;
    }

    getParent(_p: PlaylistItem) {
        return void 0; // all playlists are in root
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    refreshParent(parent: PlaylistItem) {
        this._onDidChangeTreeData.fire(parent);
    }

    getTreeItem(p: PlaylistItem): MusicTimePlaylistTreeItem {
        let treeItem: MusicTimePlaylistTreeItem = null;
        if (p.type === "playlist") {
            // it's a track parent (playlist)
            if (p && p.tracks && p.tracks["total"] && p.tracks["total"] > 0) {
                return createMusicTimePlaylistTreeItem(
                    p,
                    TreeItemCollapsibleState.Collapsed
                );
            }
            treeItem = createMusicTimePlaylistTreeItem(
                p,
                TreeItemCollapsibleState.None
            );
        } else {
            // it's a track or a title
            treeItem = createMusicTimePlaylistTreeItem(
                p,
                TreeItemCollapsibleState.None
            );

            // reveal the track state if it's playing or paused
            if (
                p.state === TrackStatus.Playing ||
                p.state === TrackStatus.Paused
            ) {
                // don't "select" it thought. that will invoke the pause/play action
                this.view.reveal(p, {
                    focus: true,
                    select: false
                });
            }
        }

        return treeItem;
    }

    async getChildren(element?: PlaylistItem): Promise<PlaylistItem[]> {
        if (element) {
            // {id, type, name, ...}

            // return track of the playlist parent
            let tracks: PlaylistItem[] = await MusicManager.getInstance().getPlaylistItemTracksForPlaylistId(
                element.id
            );

            return tracks;
        } else {
            // get the top level playlist parents
            let playlists: PlaylistItem[] = MusicManager.getInstance()
                .musictimePlaylists;
            return playlists;
        }
    }
}

/**
 * The TreeItem contains the "contextValue", which is represented as the "viewItem"
 * from within the package.json when determining if there should be decoracted context
 * based on that value.
 */
export class MusicTimePlaylistTreeItem extends TreeItem {
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

        // set the track's context value to the playlist item state
        // if it's a track that's playing or paused it will show the appropriate button.
        // if it's a playlist folder that has a track that is playing or paused it will show the appropriate button
        const stateVal =
            treeItem.state !== TrackStatus.Playing ? "notplaying" : "playing";
        this.contextValue = "";
        if (treeItem.tag === "action") {
            this.contextValue = "treeitem-action";
        } else if (
            treeItem["itemType"] === "track" ||
            treeItem["itemType"] === "playlist"
        ) {
            this.contextValue = `${treeItem.type}-item-${stateVal}`;
        }

        if (treeItem.type === "playlist" || treeItem.tag === "action") {
            if (treeItem.tag === "paw") {
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
            } else if (treeItem.tag === "action") {
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "light",
                    "settings.svg"
                );
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "dark",
                    "settings.svg"
                );
            } else {
                // for now, don't show the playlist icon
                delete this.iconPath;
            }
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

    contextValue = "playlistItem";
}
