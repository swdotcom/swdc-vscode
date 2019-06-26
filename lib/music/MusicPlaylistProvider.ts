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
    launchPlayer,
    getRunningTrack
} from "cody-music";
import { SpotifyUser } from "cody-music/dist/lib/profile";
import { MusicStateManager } from "./MusicStateManager";

const createPlaylistTreeItem = (
    p: PlaylistItem,
    cstate: TreeItemCollapsibleState
) => {
    return new PlaylistTreeItem(p, cstate);
};

export const playTrackFromPlaylist = async (
    spotifyUser: SpotifyUser,
    playlistId: string,
    trackId: string,
    spotifyDevices: PlayerDevice[],
    checkTrackStateAndTryAgainCount: number = 0
) => {
    const playlistUri = `${spotifyUser.uri}:playlist:${playlistId}`;
    let options = {
        context_uri: playlistUri,
        track_ids: [trackId]
    };
    if (spotifyDevices.length > 0) {
        options["device_id"] = spotifyDevices[0].id;
    }

    await play(PlayerName.SpotifyWeb, options);

    // invoke the music gather
    setTimeout(() => {
        MusicStateManager.getInstance().musicStateCheck();
    }, 1000);

    if (checkTrackStateAndTryAgainCount > 0) {
        getRunningTrack().then(async track => {
            if (!track || !track.id) {
                checkTrackStateAndTryAgainCount--;
                spotifyDevices = await getSpotifyDevices();
                setTimeout(() => {
                    playTrackFromPlaylist(
                        spotifyUser,
                        playlistId,
                        trackId,
                        spotifyDevices,
                        checkTrackStateAndTryAgainCount
                    );
                }, 1000);
            }
        });
    }
};

export const launchAndPlayTrack = async (
    track: PlaylistItem,
    spotifyUser: SpotifyUser
) => {
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
            playTrackFromPlaylist(
                spotifyUser,
                currentPlaylist.id,
                track.id,
                spotifyDevices,
                10 /* checkTrackStateAndTryAgain */
            );
        }, 4000);
    } else {
        // a device is found, play using the device
        playTrackFromPlaylist(
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

            const currentPlaylist: PlaylistItem = MusicStoreManager.getInstance()
                .selectedPlaylist;

            if (playlistItem.command) {
                // run the command
                commands.executeCommand(playlistItem.command);
                return;
            }

            const musicstoreMgr = MusicStoreManager.getInstance();

            //
            // MusicStateManager.gatherMusicInfo() will be called
            // after pause or play has been invoked. That will also
            // update the button states
            //

            if (playlistItem.type === "track") {
                musicstoreMgr.selectedTrackItem = playlistItem;

                if (playlistItem.playerType === PlayerType.WebSpotify) {
                    if (playlistItem["state"] !== TrackStatus.Playing) {
                        await launchAndPlayTrack(
                            playlistItem,
                            musicstoreMgr.spotifyUser
                        );
                    } else {
                        await pause(PlayerName.SpotifyWeb);
                    }
                } else {
                    let playerName =
                        playlistItem.playerType === PlayerType.MacItunesDesktop
                            ? PlayerName.ItunesDesktop
                            : PlayerName.SpotifyDesktop;
                    if (playlistItem["state"] !== TrackStatus.Playing) {
                        await play(playerName);
                    } else {
                        await pause(playerName);
                    }
                }
            } else {
                // if playlist isn't already running or it's a diffent playlist, play the 1st track in the playlist
                musicstoreMgr.selectedPlaylist = playlistItem;
                if (
                    !currentPlaylist ||
                    playlistItem.id !== currentPlaylist.id
                ) {
                    // start the playlist by playing the 1st track in the playlist
                    let tracks = await musicstoreMgr.getTracksForPlaylistId(
                        playlistItem.id
                    );
                    if (tracks && tracks.length > 0) {
                        const firstTrack: PlaylistItem = tracks[0];

                        if (
                            playlistItem.playerType !==
                            PlayerType.MacItunesDesktop
                        ) {
                            await launchAndPlayTrack(
                                firstTrack,
                                musicstoreMgr.spotifyUser
                            );
                        } else {
                            const playlistName = playlistItem.name;
                            const trackName = firstTrack.name;
                            const params = [trackName, playlistName];
                            await playTrackInContext(
                                PlayerName.ItunesDesktop,
                                params
                            );
                        }
                    }
                }
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
