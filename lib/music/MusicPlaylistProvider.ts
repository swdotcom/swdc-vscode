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
import { MusicStoreManager } from "./MusicStoreManager";
import {
    PlaylistItem,
    playTrackInContext,
    PlayerName,
    PlayerType,
    play,
    TrackStatus,
    pause,
    getSpotifyDevices,
    PlayerDevice,
    launchPlayer
} from "cody-music";
import { connectSpotify } from "./MusicControlManager";
import { MusicCommandManager } from "./MusicCommandManager";

const createPlaylistTreeItem = (
    p: PlaylistItem,
    cstate: TreeItemCollapsibleState
) => {
    return new PlaylistTreeItem(p, cstate);
};

export const connectPlaylistTreeView = (view: TreeView<PlaylistItem>) => {
    return Disposable.from(
        view.onDidChangeSelection(async e => {
            if (!e.selection || e.selection.length === 0) {
                return;
            }
            let playlistItem: PlaylistItem = e.selection[0];

            const selectedPlaylist: PlaylistItem = MusicStoreManager.getInstance()
                .selectedPlaylist;

            if (playlistItem.command) {
                // run the command
                commands.executeCommand(playlistItem.command);
                return;
            }

            const musicstoreMgr = MusicStoreManager.getInstance();

            let syncControlsDelay = 1000;
            if (playlistItem.type === "track") {
                musicstoreMgr.selectedTrackItem = playlistItem;

                if (playlistItem.playerType === PlayerType.WebSpotify) {
                    // check if there's any spotify devices
                    const spotifyDevices: PlayerDevice[] = await getSpotifyDevices();

                    let track_id = playlistItem.id;

                    if (playlistItem["state"] !== TrackStatus.Playing) {
                        if (!spotifyDevices || spotifyDevices.length === 0) {
                            // no spotify devices found, lets launch the web player with the track
                            let options = {
                                track_id
                            };
                            await launchPlayer(PlayerName.SpotifyWeb, options);
                            syncControlsDelay = 10000;
                        } else {
                            // a device is found, play using the device
                            let options = {
                                track_ids: [track_id]
                            };
                            if (spotifyDevices.length > 0) {
                                options["device_id"] = spotifyDevices[0].id;
                            }
                            await play(PlayerName.SpotifyWeb, options);
                        }
                    } else {
                        await pause(PlayerName.SpotifyWeb);
                    }
                } else {
                    let playerName =
                        playlistItem.playerType === PlayerType.MacItunesDesktop
                            ? PlayerName.ItunesDesktop
                            : PlayerName.SpotifyDesktop;
                    // play the track
                    let params = [playlistItem.name, selectedPlaylist.name];

                    if (playlistItem["state"] !== TrackStatus.Playing) {
                        await playTrackInContext(playerName, params);
                    } else {
                        await pause(playerName);
                    }
                }

                // setTimeout(() => {
                //     MusicCommandManager.syncControls();
                // }, syncControlsDelay);
            }
        }),
        view.onDidChangeVisibility(e => {
            /**
            if (e.visible) {
                //
            }
            **/
        })
    );
};

export class MusicPlaylistProvider implements TreeDataProvider<PlaylistItem> {
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

    getTreeItem(p: PlaylistItem): PlaylistTreeItem {
        if (p.type === "playlist") {
            // it's a track parent (playlist)
            if (p && p.tracks && p.tracks["total"] && p.tracks["total"] > 0) {
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
            let tracks = await MusicStoreManager.getInstance().getTracksForPlaylistId(
                element.id
            );

            // reveal the selected track
            setTimeout(() => {
                this.revealSelectedTrackItem(element);
            }, 500);

            return tracks;
        } else {
            // get the top level playlist parents
            let playlists = MusicStoreManager.getInstance().runningPlaylists;
            return playlists;
        }
    }

    async revealSelectedTrackItem(element: PlaylistItem) {
        const musicstoreMgr = MusicStoreManager.getInstance();
        let tracks = await musicstoreMgr.getTracksForPlaylistId(element.id);
        // reveal the selected track
        setTimeout(() => {
            const selectedPlaylistItem: PlaylistItem =
                musicstoreMgr.selectedTrackItem;

            let foundItem = tracks.find(element => {
                return element.id === selectedPlaylistItem.id;
            });

            if (foundItem) {
                this.view.reveal(foundItem, {
                    focus: true,
                    select: false
                });
            }
        }, 500);
    }
}

class PlaylistTreeItem extends TreeItem {
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
        if (treeItem.type === "playlist") {
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
            } else {
                // for now, don't show the playlist icon
                delete this.iconPath;
            }
        } else if (treeItem.type === "title") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "icons8-playlist-16.png"
            );
            this.iconPath.light = path.join(
                this.resourcePath,
                "dark",
                "icons8-playlist-16.png"
            );
        } else if (treeItem.type === "spotify") {
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
        } else if (treeItem.type === "track") {
            this.contextValue = treeItem["state"];

            if (treeItem.playerType === PlayerType.MacItunesDesktop) {
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
            } else {
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
            }
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
