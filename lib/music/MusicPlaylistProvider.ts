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
    PlayerName,
    PlayerType,
    play
} from "cody-music";
import { connectSpotify, createDevBeatsPlaylist } from "./MusicControlManager";

const createPlaylistTreeItem = (
    p: PlaylistItem,
    cstate: TreeItemCollapsibleState
) => {
    return new PlaylistTreeItem(p, cstate);
};

export const connectPlaylistTreeView = (view: TreeView<PlaylistItem>) => {
    return Disposable.from(
        view.onDidChangeSelection(e => {
            if (!e.selection || e.selection.length === 0) {
                return;
            }
            let playlistItem: PlaylistItem = e.selection[0];

            const selectedPlaylist: PlaylistItem = MusicStoreManager.getInstance()
                .selectedPlaylist;

            if (playlistItem.type === "track") {
                if (playlistItem.playerType === PlayerType.WebSpotify) {
                    // get the 1st device

                    let track_id = playlistItem.id;
                    if (track_id.indexOf("spotify:track:") === -1) {
                        track_id = `spotify:track:${track_id}`;
                    }
                    let options = {
                        track_ids: [track_id]
                    };
                    let devices = MusicStoreManager.getInstance()
                        .spotifyPlayerDevices;
                    if (devices.length > 0) {
                        options["device_id"] = devices[0].id;
                    }
                    play(PlayerName.SpotifyWeb, options).then(result => {
                        console.log("play result: ", result);
                    });
                } else {
                    // play the track

                    MusicStoreManager.getInstance();
                    let params = [playlistItem.name, selectedPlaylist.name];

                    playTrackInContext(PlayerName.ItunesDesktop, params).then(
                        result => {
                            // console.log("result: ", result);
                        }
                    );
                }
            } else if (playlistItem.id === "connectspotify") {
                connectSpotify();
            } else if (playlistItem.id === "addtop40") {
                createDevBeatsPlaylist();
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
        //MusicStoreManager.getInstance().clearPlaylists();
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
                if (
                    !MusicStoreManager.getInstance().hasTracksForPlaylistId(
                        p.id
                    )
                ) {
                    MusicStoreManager.getInstance().getTracksForPlaylistId(
                        p.id
                    );
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
            MusicStoreManager.getInstance().selectedPlaylist = element;
            // return track of the playlist parent
            let tracks = MusicStoreManager.getInstance().getTracksForPlaylistId(
                element.id
            );
            return tracks;
        } else {
            // get the top level playlist parents
            let playlists = MusicStoreManager.getInstance().runningPlaylists;
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
        private readonly treeItem: PlaylistItem,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly command?: Command
    ) {
        super(treeItem.name, collapsibleState);
        if (treeItem.type === "playlist") {
            if (treeItem["tag"] && treeItem["tag"] === "cody") {
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "pl-paw.svg"
                );
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "pl-paw.svg"
                );
            } else {
                // for now, don't show the playlist icon
                delete this.iconPath;
            }
        } else {
            if (treeItem.playerType === PlayerType.MacItunesDesktop) {
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "icons8-itunes.svg"
                );
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "icons8-itunes.svg"
                );
            } else if (
                treeItem.playerType === PlayerType.MacSpotifyDesktop ||
                treeItem.playerType === PlayerType.WebSpotify
            ) {
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "icons8-spotify.svg"
                );
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "icons8-spotify.svg"
                );
            } else {
                delete this.iconPath;
            }
        }
    }

    get tooltip(): string {
        return `${this.treeItem.id}`;
    }

    iconPath = {
        light: "",
        dark: ""
    };

    contextValue = "treeItem";
}
