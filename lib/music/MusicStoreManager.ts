import {
    Track,
    getAccessToken,
    setCredentials,
    getPlaylistTracks,
    PaginationItem,
    PlaylistItem,
    PlayerName,
    CodyResponse,
    CodyResponseType,
    getPlaylists,
    getRunningTrack,
    PlayerType
} from "cody-music";
import { serverIsAvailable, getSpotifyOauth } from "../DataController";

import {
    softwareGet,
    isResponseOk,
    softwareDelete,
    softwarePut
} from "../HttpClient";
import { getItem } from "../Util";
export class MusicStoreManager {
    private static instance: MusicStoreManager;

    private _spotifyPlaylists: PlaylistItem[] = [];
    private _runningPlaylists: PlaylistItem[] = [];
    private _codyPlaylists: PlaylistItem[] = [];
    private _codyFavorites: any[] = [];
    private _playlistTracks: any = {};
    private _currentPlayerType: PlayerType = PlayerType.NotAssigned;

    private constructor() {
        //
    }

    static getInstance(): MusicStoreManager {
        if (!MusicStoreManager.instance) {
            MusicStoreManager.instance = new MusicStoreManager();
        }

        return MusicStoreManager.instance;
    }

    //
    // getters
    //

    get codyPlaylists(): PlaylistItem[] {
        return this._codyPlaylists;
    }

    get spotifyPlaylists(): PlaylistItem[] {
        return this._spotifyPlaylists;
    }

    get codyFavorites(): any[] {
        return this._codyFavorites;
    }

    get runningPlaylists(): PlaylistItem[] {
        return this._runningPlaylists;
    }

    //
    // store functions
    //

    async initializeSpotify() {
        if (!this.hasSpotifyAccessToken()) {
            let serverIsOnline = await serverIsAvailable();
            const spotifyOauth = await getSpotifyOauth(serverIsOnline);
            if (spotifyOauth) {
                // update the CodyMusic credentials
                setCredentials({
                    refreshToken: spotifyOauth.spotify_refresh_token,
                    clientSecret: "2b40b4975b2743189c87f4712c0cd59e",
                    clientId: "eb67e22ba1c6474aad8ec8067480d9dc",
                    accessToken: spotifyOauth.spotify_access_token
                });
            }
        }
    }

    async fetchCodyPlaylists() {
        const response = await softwareGet("/music/playlist", getItem("jwt"));
        if (isResponseOk(response)) {
            this._codyPlaylists = response.data.map(item => {
                // transform the playlist_id to id
                item["id"] = item.playlist_id;
                delete item.playlist_id;
                return item;
            });
        }
    }

    async syncCodyPlaylists() {
        await this.fetchCodyPlaylists();

        this.reconcilePlaylists();
    }

    async reconcilePlaylists() {
        let hasSpotifyPlaylists = this._spotifyPlaylists.length > 0;
        let hasUpdates = false;
        if (this._codyPlaylists.length > 0) {
            for (let i = 0; i < this._codyPlaylists.length; i++) {
                let codyPlaylist = this._codyPlaylists[i];

                if (hasSpotifyPlaylists) {
                    let foundItem = this._spotifyPlaylists.find(element => {
                        return element.id === codyPlaylist.id;
                    });
                    if (!foundItem) {
                        // the playlist was deleted, delete the one on software
                        await softwareDelete(
                            `/music/playlist/${codyPlaylist.id}`,
                            getItem("jwt")
                        );
                        hasUpdates = true;
                    } else if (foundItem.name !== codyPlaylist.name) {
                        // update the name on software
                        const payload = {
                            name: foundItem.name
                        };
                        await softwarePut(
                            `/music/playlist/${codyPlaylist.id}`,
                            payload,
                            getItem("jwt")
                        );
                        hasUpdates = true;
                    }
                } else {
                    // either access token as removed or playlist(s) were
                    // deleted. delete our copy of the playlist ID
                    await softwareDelete(
                        `/music/playlist/${codyPlaylist.id}`,
                        getItem("jwt")
                    );
                    hasUpdates = true;
                }
            }
        }

        if (hasUpdates) {
            this.fetchCodyPlaylists();
        }
    }

    async syncPlaylistFavorites() {
        const response = await softwareGet(
            "/music/playlist/favorites",
            getItem("jwt")
        );

        if (isResponseOk(response) && response.data.length > 0) {
            this._codyFavorites = response.data;
        } else {
            // clear the favorites
            this._codyFavorites = [];
        }
    }

    async syncPairedSpotifyPlaylists() {
        // get the spotify web playlists, then the cody playlists
        this.syncSpotifyWebPlaylists().then(() => {
            this.syncCodyPlaylists();
        });
    }

    async syncRunningPlaylists() {
        let runningTrack: Track = await getRunningTrack();
        if (runningTrack.playerType !== this._currentPlayerType) {
            this._runningPlaylists = [];
        }
        this._currentPlayerType = runningTrack.playerType;

        if (this._runningPlaylists.length === 0) {
            if (
                this.hasSpotifyAccessToken() &&
                (this._currentPlayerType === PlayerType.NotAssigned ||
                    this._currentPlayerType === PlayerType.WebSpotify)
            ) {
                // fetch spotify and sync what we have
                await this.syncPairedSpotifyPlaylists();
            } else if (
                this._currentPlayerType === PlayerType.MacItunesDesktop
            ) {
                this._runningPlaylists = await getPlaylists(
                    PlayerName.ItunesDesktop
                );
            } else {
                this._runningPlaylists = await getPlaylists(
                    PlayerName.SpotifyDesktop
                );
            }
        }
    }

    async syncSpotifyWebPlaylists() {
        if (this.hasSpotifyAccessToken()) {
            this._spotifyPlaylists = await getPlaylists(PlayerName.SpotifyWeb);
            if (this._spotifyPlaylists) {
                // update the type to "playlist";
                this._spotifyPlaylists.map(item => {
                    item.type = "playlist";
                });
            }
        } else {
            this._spotifyPlaylists = [];
        }
    }

    hasSpotifyAccessToken() {
        return getAccessToken() ? true : false;
    }

    hasTracksForPlaylistId(playlist_id: string): boolean {
        return this._playlistTracks[playlist_id] ? true : false;
    }

    async getTracksForPlaylistId(playlist_id: string) {
        let runningTrack: Track = await getRunningTrack();
        if (runningTrack.playerType !== this._currentPlayerType) {
            // clear the map
            this._playlistTracks[playlist_id] = null;
        }
        this._currentPlayerType = runningTrack.playerType;

        let playlistItems = [];
        let tracks = this._playlistTracks[playlist_id];
        if (tracks) {
            return tracks;
        }

        let playlistTracks: CodyResponse;
        if (
            this.hasSpotifyAccessToken() &&
            (this._currentPlayerType === PlayerType.NotAssigned ||
                this._currentPlayerType === PlayerType.WebSpotify)
        ) {
            playlistTracks = await getPlaylistTracks(
                PlayerName.SpotifyWeb,
                playlist_id
            );
        } else if (this._currentPlayerType === PlayerType.MacItunesDesktop) {
            playlistTracks = await getPlaylistTracks(
                PlayerName.ItunesDesktop,
                playlist_id
            );
        } else {
            playlistTracks = await getPlaylistTracks(
                PlayerName.SpotifyDesktop,
                playlist_id
            );
        }

        if (playlistTracks.state === CodyResponseType.Success) {
            let paginationItem: PaginationItem = playlistTracks.data;
            if (paginationItem && paginationItem.items) {
                playlistItems = paginationItem.items.map((track: Track) => {
                    let playlistItem: PlaylistItem = new PlaylistItem();
                    playlistItem.type = "track";
                    playlistItem.name = track.name;
                    playlistItem.id = track.id;
                    playlistItem["artists"] = track.artists.join(", ");
                    // since this is a track, delete the tracks attribute
                    delete playlistItem.tracks;
                    return playlistItem;
                });
            }

            this._playlistTracks[playlist_id] = playlistItems;
        }
        return playlistItems;
    }
}
