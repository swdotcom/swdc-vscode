import {
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    EventEmitter,
    Event,
    Disposable,
    TreeView
} from "vscode";
import * as path from "path";
import { MusicStoreManager } from "./MusicStoreManager";
import {
    PlaylistItem,
    playTrackInContext,
    play,
    PlayerName,
    Track,
    PlayerType
} from "cody-music";

const createPlaylistTreeItem = (
    p: PlaylistItem,
    cstate: TreeItemCollapsibleState
) => {
    return new PlaylistTreeItem(p, cstate);
};

const musicstoreMgr = MusicStoreManager.getInstance();

export const connectPlaylistTreeView = (view: TreeView<PlaylistItem>) => {
    return Disposable.from(
        view.onDidChangeSelection(e => {
            if (
                e.selection &&
                e.selection.length === 1 &&
                e.selection[0].type === "track"
            ) {
                // play the track
                const selectedPlaylist: PlaylistItem =
                    musicstoreMgr.selectedPlaylist;
                const track = e.selection[0];
                let params = [track.name, selectedPlaylist.name];

                playTrackInContext(PlayerName.ItunesDesktop, params);
            }
        }),
        view.onDidChangeVisibility(e => {
            if (e.visible) {
                //
            }
        })
    );
};

export class MusicPlaylistProvider implements TreeDataProvider<PlaylistItem> {
    private _onDidChangeTreeData: EventEmitter<
        PlaylistItem | undefined
    > = new EventEmitter<PlaylistItem | undefined>();
    readonly onDidChangeTreeData: Event<PlaylistItem | undefined> = this
        ._onDidChangeTreeData.event;

    constructor() {
        //
    }

    getParent(_p: PlaylistItem) {
        return void 0; // all playlists are in root
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    play(): void {
        console.log("play");
    }

    pause(): void {
        console.log("pause");
    }

    getTreeItem(p: PlaylistItem): PlaylistTreeItem {
        if (p.type === "playlist") {
            // it's a track parent (playlist)
            if (p && p.tracks && p.tracks["total"] && p.tracks["total"] > 0) {
                if (!musicstoreMgr.hasTracksForPlaylistId(p.id)) {
                    musicstoreMgr.getTracksForPlaylistId(p.id);
                }
                return createPlaylistTreeItem(
                    p,
                    TreeItemCollapsibleState.Collapsed
                );
            }
            return createPlaylistTreeItem(p, TreeItemCollapsibleState.None);
        } else {
            // it's a track or a title
            return createPlaylistTreeItem(p, TreeItemCollapsibleState.None);
        }
    }

    async getChildren(element?: PlaylistItem): Promise<PlaylistItem[]> {
        if (element) {
            /** example...
                collaborative:false
                id:"MostRecents"
                name:"MostRecents"
                public:true
                tracks:PlaylistTrackInfo {href: "", total: 34}
                type:"playlist"
                playerType:"MacItunesDesktop"
             */
            musicstoreMgr.selectedPlaylist = element;
            // return track of the playlist parent
            let tracks = musicstoreMgr.getTracksForPlaylistId(element.id);
            return tracks;
        } else {
            // get the top level playlist parents
            let playlists = musicstoreMgr.runningPlaylists;
            return playlists;
        }
    }
}

class PlaylistTreeItem extends TreeItem {
    private treeItemIcon: string = "";

    private resourcePath: string = path.join(
        __filename,
        "..",
        "..",
        "..",
        "resources",
        "light"
    );

    constructor(
        private readonly musicTreeItem: PlaylistItem,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly command?: Command
    ) {
        super(musicTreeItem.name, collapsibleState);
        if (musicTreeItem.type === "playlist") {
            // for now, don't show the playlist icon
            delete this.iconPath;
        } else {
            if (musicTreeItem.playerType === PlayerType.MacItunesDesktop) {
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "icons8-itunes.svg"
                );
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "icons8-itunes.svg"
                );
            } else {
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "icons8-spotify.svg"
                );
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "icons8-spotify.svg"
                );
            }
        }
    }

    get tooltip(): string {
        return `${this.musicTreeItem.id}`;
    }

    iconPath = {
        light: "",
        dark: ""
    };

    contextValue = "musicTreeItem";
}
