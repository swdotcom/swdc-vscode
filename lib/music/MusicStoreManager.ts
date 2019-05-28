import {
    Track,
    getAccessToken,
    setCredentials,
    getPlaylistTracks
} from "cody-music";
import { serverIsAvailable, getSpotifyOauth } from "../DataController";
import { MusicPlaylistManager } from "./MusicPlaylistManager";
import {
    softwareGet,
    isResponseOk,
    softwareDelete,
    softwarePut
} from "../HttpClient";
import { getItem } from "../Util";
import {
    PlaylistItem,
    PlayerName,
    CodyResponse,
    CodyResponseType
} from "cody-music/dist/lib/models";

export class MusicStoreManager {
    private static instance: MusicStoreManager;

    private _spotifyPlaylists: PlaylistItem[] = [];
    private _codyPlaylists: PlaylistItem[] = [];
    private _codyFavorites: any[] = [];
    private _playlistTracks: any = {};

    private constructor() {
        //
    }

    static getInstance(): MusicStoreManager {
        if (!MusicStoreManager.instance) {
            MusicStoreManager.instance = new MusicStoreManager();
        }

        return MusicStoreManager.instance;
    }

    async initializeSpotify() {
        if (!getAccessToken()) {
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
                    // the playlist was deleted, delete the one on software
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

        // get the spotify web playlists, then the cody playlists
        this.syncPairedPlaylists();
    }

    async syncPairedPlaylists() {
        // get the spotify web playlists, then the cody playlists
        this.syncSpotifyWebPlaylists().then(() => {
            this.syncCodyPlaylists();
        });
    }

    async syncSpotifyWebPlaylists() {
        this._spotifyPlaylists = await MusicPlaylistManager.getInstance().getSpotifyWebPlaylists();
        if (this._spotifyPlaylists) {
            // update the type to "playlist";
            this._spotifyPlaylists.map(item => {
                item["type"] = "playlist";
            });
        }
    }

    get codyPlaylists(): PlaylistItem[] {
        return this._codyPlaylists;
    }

    get spotifyPlaylists(): PlaylistItem[] {
        return this._spotifyPlaylists;
    }

    get codyFavorites(): any[] {
        return this._codyFavorites;
    }

    hasTracksForPlaylistId(playlist_id: string): boolean {
        return this._playlistTracks[playlist_id] ? true : false;
    }

    async getTracksForPlaylistId(playlist_id: string) {
        let playlistItems = [];
        let tracks = this._playlistTracks[playlist_id];
        if (tracks) {
            return tracks;
        }

        let playlistTracks: CodyResponse = await getPlaylistTracks(
            PlayerName.SpotifyWeb,
            playlist_id
        );
        /**
         * album: { id: '4KaiavWFhR7j9tY1f7V6UL', name: 'Nightmare' },
            id: '340UVheS8z3ncW9TTUhAbc',
            name: 'Nightmare',
            artists: [ 'Halsey' ]
         */
        // result.data.items[0].track
        if (playlistTracks.state === CodyResponseType.Success) {
            playlistItems = playlistTracks.data.items.map(item => {
                let track: any = item.track;
                // turn it into a PlaylistItem
                let playlistItem: PlaylistItem = new PlaylistItem();
                playlistItem.id = track.id;
                playlistItem["type"] = "track";
                playlistItem["name"] = track.name;
                playlistItem["artists"] = track.artists.join(", ");

                // remove the tracks attribute as this is a track element
                delete playlistItem.tracks;
                return playlistItem;
            });
            this._playlistTracks[playlist_id] = playlistItems;
        }
        return playlistItems;
    }
}
