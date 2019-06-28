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
    PlayerName,
    PlayerType,
    TrackStatus,
    pause,
    getSpotifyDevices,
    PlayerDevice,
    launchPlayer,
    playTrackInLibrary
} from "cody-music";
import { SpotifyUser } from "cody-music/dist/lib/profile";
import { MusicControlManager } from "./MusicControlManager";

/**
 * Create the playlist tree item (root or leaf)
 * @param p
 * @param cstate
 */
const createPlaylistTreeItem = (
    p: PlaylistItem,
    cstate: TreeItemCollapsibleState
) => {
    return new PlaylistTreeItem(p, cstate);
};

/**
 * Play an iTunes track from the currently selected playlist
 * @param playlistItem
 */
export const playItunesTrackFromPlaylist = async (
    playlistItem: PlaylistItem
) => {
    const musicstoreMgr = MusicStoreManager.getInstance();
    const playlistName = musicstoreMgr.selectedPlaylist.name;
    const trackName = playlistItem.name;
    const params = [trackName, playlistName];

    await playTrackInLibrary(PlayerName.ItunesDesktop, params);
};

/**
 * Launch the Spotify player if it's not already launched, then play the track
 * @param track
 * @param spotifyUser
 */
export const launchAndPlayTrack = async (
    track: PlaylistItem,
    spotifyUser: SpotifyUser
) => {
    const musicCtrlMgr = new MusicControlManager();
    const currentPlaylist: PlaylistItem = MusicStoreManager.getInstance()
        .selectedPlaylist;
    // check if there's any spotify devices
    const spotifyDevices: PlayerDevice[] = await getSpotifyDevices();
    if (!spotifyDevices || spotifyDevices.length === 0) {
        // no spotify devices found, lets launch the web player with the track

        // launch it
        await launchPlayer(PlayerName.SpotifyWeb);
        // now select it from within the playlist
        setTimeout(() => {
            musicCtrlMgr.playSpotifyTrackFromPlaylist(
                spotifyUser,
                currentPlaylist.id,
                track.id,
                spotifyDevices,
                10 /* checkTrackStateAndTryAgain */
            );
        }, 2000);
    } else {
        // a device is found, play using the device
        musicCtrlMgr.playSpotifyTrackFromPlaylist(
            spotifyUser,
            currentPlaylist.id,
            track.id,
            spotifyDevices
        );
    }
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

            const musicstoreMgr = MusicStoreManager.getInstance();

            //
            // MusicStateManager gatherMusicInfo will be called
            // after pause or play has been invoked. That will also
            // update the button states
            //

            if (playlistItem.type === "track") {
                musicstoreMgr.selectedTrackItem = playlistItem;

                const notPlaying =
                    playlistItem.state !== TrackStatus.Playing ? true : false;

                if (playlistItem.playerType === PlayerType.MacItunesDesktop) {
                    if (notPlaying) {
                        await playItunesTrackFromPlaylist(playlistItem);
                    } else {
                        await pause(PlayerName.ItunesDesktop);
                    }
                } else {
                    if (notPlaying) {
                        await launchAndPlayTrack(
                            playlistItem,
                            musicstoreMgr.spotifyUser
                        );
                    } else {
                        await pause(PlayerName.SpotifyWeb);
                    }
                }
            } else {
                musicstoreMgr.selectedPlaylist = playlistItem;
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

            // return track of the playlist parent
            let tracks = await MusicStoreManager.getInstance().getTracksForPlaylistId(
                element.id
            );

            // reveal the selected track
            this.revealSelectedTrackItem(element, tracks);

            return tracks;
        } else {
            // get the top level playlist parents
            let playlists = MusicStoreManager.getInstance().runningPlaylists;
            return playlists;
        }
    }

    async revealSelectedTrackItem(element: PlaylistItem, tracks) {
        const musicstoreMgr = MusicStoreManager.getInstance();

        // reveal the selected track

        const selectedPlaylistItem: PlaylistItem =
            musicstoreMgr.selectedTrackItem;

        let foundItem = null;
        if (selectedPlaylistItem && selectedPlaylistItem.id) {
            foundItem = tracks.find(element => {
                return element && element.id
                    ? element.id === selectedPlaylistItem.id
                    : null;
            });
        }

        if (foundItem) {
            this.view.reveal(foundItem, {
                focus: true,
                select: false
            });
        }
    }
}

/**
 * The TreeItem contains the "contextValue", which is represented as the "viewItem"
 * from within the package.json when determining if there should be decoracted context
 * based on that value.
 */
class PlaylistTreeItem extends TreeItem {
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
            // set the track's context value to the track.state
            this.contextValue = treeItem.state;

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
