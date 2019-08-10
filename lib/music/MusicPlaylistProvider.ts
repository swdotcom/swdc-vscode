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
import {
    PlaylistItem,
    PlayerName,
    PlayerType,
    TrackStatus,
    getSpotifyDevices,
    PlayerDevice,
    launchPlayer,
    playItunesTrackNumberInPlaylist
} from "cody-music";
import { SpotifyUser } from "cody-music/dist/lib/profile";
import { MusicControlManager } from "./MusicControlManager";
import { SPOTIFY_LIKED_SONGS_PLAYLIST_NAME } from "../Constants";
import { MusicManager } from "./MusicManager";

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
 * Launch the Spotify player if it's not already launched, then play the track
 * @param track
 * @param spotifyUser
 */
export const launchAndPlayTrack = async (
    track: PlaylistItem,
    spotifyUser: SpotifyUser
) => {
    const musicMgr: MusicManager = MusicManager.getInstance();
    const musicCtrlMgr = new MusicControlManager();
    const currentPlaylist: PlaylistItem = musicMgr.selectedPlaylist;
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
                track,
                spotifyDevices,
                20 /* checkTrackStateAndTryAgain */
            );
        }, 1000);
    } else {
        // a device is found, play using the device
        await musicCtrlMgr.playSpotifyTrackFromPlaylist(
            spotifyUser,
            currentPlaylist.id,
            track,
            spotifyDevices
        );
    }
};

export const playSelectedItem = async (
    playlistItem: PlaylistItem,
    isExpand = true
) => {
    const musicCtrlMgr = new MusicControlManager();
    const musicMgr = MusicManager.getInstance();
    if (playlistItem.type === "track") {
        let currentPlaylistId = playlistItem["playlist_id"];

        musicMgr.selectedTrackItem = playlistItem;
        if (!musicMgr.selectedPlaylist) {
            const playlist: PlaylistItem = await musicMgr.getPlaylistById(
                currentPlaylistId
            );
            musicMgr.selectedPlaylist = playlist;
        }

        const notPlaying =
            playlistItem.state !== TrackStatus.Playing ? true : false;

        if (playlistItem.playerType === PlayerType.MacItunesDesktop) {
            if (notPlaying) {
                const pos: number = playlistItem.position || 1;
                await playItunesTrackNumberInPlaylist(
                    musicMgr.selectedPlaylist.name,
                    pos
                );
            } else {
                musicCtrlMgr.pauseSong(PlayerName.ItunesDesktop);
            }
        } else if (musicMgr.currentPlayerName === PlayerName.SpotifyDesktop) {
            // ex: ["spotify:track:0R8P9KfGJCDULmlEoBagcO", "spotify:playlist:6ZG5lRT77aJ3btmArcykra"]
            // make sure the track has spotify:track and the playlist has spotify:playlist
            let track_uri = playlistItem.id.includes("spotify:track:")
                ? playlistItem.id
                : `spotify:track:${playlistItem.id}`;
            let playlist_uri = musicMgr.selectedPlaylist.id.includes(
                "spotify:playlist:"
            )
                ? musicMgr.selectedPlaylist.id
                : `spotify:playlist:${musicMgr.selectedPlaylist.id}`;
            let params = [track_uri, playlist_uri];
            musicCtrlMgr.playSongInContext(params);
        } else {
            if (notPlaying) {
                await launchAndPlayTrack(playlistItem, musicMgr.spotifyUser);
            } else {
                musicCtrlMgr.pauseSong(musicMgr.currentPlayerName);
            }
        }
    } else {
        // to play a playlist
        // {device_id: <spotify_device_id>,
        //   uris: ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh", "spotify:track:1301WleyT98MSxVHPZCA6M"],
        //   context_uri: <playlist_uri, album_uri>}
        musicMgr.selectedPlaylist = playlistItem;

        if (!isExpand) {
            if (playlistItem.playerType === PlayerType.MacItunesDesktop) {
                const pos: number = 1;
                await playItunesTrackNumberInPlaylist(
                    musicMgr.selectedPlaylist.name,
                    pos
                );
            } else {
                const spotifyDevices: PlayerDevice[] = await getSpotifyDevices();
                if (!spotifyDevices || spotifyDevices.length === 0) {
                    // no spotify devices found, lets launch the web player with the track

                    // launch it
                    await launchPlayer(PlayerName.SpotifyWeb);
                }

                // get the tracks
                const tracks: PlaylistItem[] = await MusicManager.getInstance().getPlaylistItemTracksForPlaylistId(
                    playlistItem.id
                );
                const selectedTrack: PlaylistItem =
                    tracks && tracks.length > 0 ? tracks[0] : null;
                if (playlistItem.name === SPOTIFY_LIKED_SONGS_PLAYLIST_NAME) {
                    // play the 1st track in the non-playlist liked songs folder
                    if (selectedTrack) {
                        musicCtrlMgr.playSpotifyTrackFromPlaylist(
                            musicMgr.spotifyUser,
                            playlistItem.id,
                            selectedTrack /* track */,
                            spotifyDevices,
                            20 /* checkTrackStateAndTryAgain */
                        );
                    }
                } else {
                    // use the normal play playlist by offset 0 call
                    musicCtrlMgr.playSpotifyTrackFromPlaylist(
                        musicMgr.spotifyUser,
                        playlistItem.id,
                        null /* track */,
                        spotifyDevices,
                        20 /* checkTrackStateAndTryAgain */
                    );
                }

                if (selectedTrack) {
                    musicMgr.selectedTrackItem = selectedTrack;
                }
            }
        }
    }
};

/**
 * Handles the playlist onDidChangeSelection event
 */
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
            } else if (playlistItem["cb"]) {
                const cbFunc = playlistItem["cb"];
                cbFunc();
                return;
            }

            // play it
            playSelectedItem(playlistItem);
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

    isTrackInPlaylistRunning(p: PlaylistItem) {
        return (
            p.state === TrackStatus.Playing || p.state === TrackStatus.Paused
        );
    }

    getTreeItem(p: PlaylistItem): PlaylistTreeItem {
        let treeItem: PlaylistTreeItem = null;
        if (p.type === "playlist") {
            // it's a track parent (playlist)
            if (p && p.tracks && p.tracks["total"] && p.tracks["total"] > 0) {
                const folderState: TreeItemCollapsibleState = this.isTrackInPlaylistRunning(
                    p
                )
                    ? TreeItemCollapsibleState.Expanded
                    : TreeItemCollapsibleState.Collapsed;
                return createPlaylistTreeItem(p, folderState);
            }
            treeItem = createPlaylistTreeItem(p, TreeItemCollapsibleState.None);
        } else {
            // it's a track or a title
            treeItem = createPlaylistTreeItem(p, TreeItemCollapsibleState.None);

            // reveal the track state if it's playing or paused
            if (this.isTrackInPlaylistRunning(p)) {
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
        const musicMgr: MusicManager = MusicManager.getInstance();

        if (element) {
            // return track of the playlist parent
            let tracks: PlaylistItem[] = await musicMgr.getPlaylistItemTracksForPlaylistId(
                element.id
            );
            return tracks;
        } else {
            // get the top level playlist parents
            return musicMgr.currentPlaylists;
        }
    }
}

/**
 * The TreeItem contains the "contextValue", which is represented as the "viewItem"
 * from within the package.json when determining if there should be decoracted context
 * based on that value.
 */
export class PlaylistTreeItem extends TreeItem {
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

        if (treeItem.tag === "spotify" || treeItem.type === "spotify") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "spotify-logo.svg"
            );
            this.iconPath.dark = path.join(
                this.resourcePath,
                "dark",
                "spotify-logo.svg"
            );
        } else if (treeItem.tag === "itunes" || treeItem.type === "itunes") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "itunes-logo.svg"
            );
            this.iconPath.dark = path.join(
                this.resourcePath,
                "dark",
                "itunes-logo.svg"
            );
        } else if (treeItem.tag === "paw") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "sw-paw-circle.svg"
            );
            this.iconPath.dark = path.join(
                this.resourcePath,
                "dark",
                "sw-paw-circle.svg"
            );
        } else if (treeItem.type === "connected") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "radio-tower.svg"
            );
            this.iconPath.dark = path.join(
                this.resourcePath,
                "dark",
                "radio-tower.svg"
            );
        } else if (treeItem.type === "offline") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "nowifi.svg"
            );
            this.iconPath.dark = path.join(
                this.resourcePath,
                "dark",
                "nowifi.svg"
            );
        } else if (treeItem.type === "action" || treeItem.tag === "action") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "gear.svg"
            );
            this.iconPath.dark = path.join(
                this.resourcePath,
                "dark",
                "gear.svg"
            );
        } else if (treeItem.type === "login" || treeItem.tag === "login") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "sign-in.svg"
            );
            this.iconPath.dark = path.join(
                this.resourcePath,
                "dark",
                "sign-in.svg"
            );
        } else if (treeItem.type === "divider") {
            this.iconPath.light = path.join(
                this.resourcePath,
                "light",
                "blue-line-96.png"
            );
            this.iconPath.dark = path.join(
                this.resourcePath,
                "dark",
                "blue-line-96.png"
            );
        } else {
            // no matching tag, remove the tree item icon path
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
