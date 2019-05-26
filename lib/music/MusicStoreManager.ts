import * as CodyMusic from "cody-music";
import { serverIsAvailable, getSpotifyOauth } from "../DataController";
import { MusicPlaylistManager } from "./MusicPlaylistManager";
import { PlaylistItem } from "cody-music/dist/lib/models";
import { softwareGet, isResponseOk } from "../HttpClient";
import { getItem } from "../Util";

export class MusicStoreManager {
    private static instance: MusicStoreManager;

    private _playlists: PlaylistItem[] = [];
    private _codyPlaylists: PlaylistItem[] = [];
    private _codyFavorites: any[] = [];
    private _tracks: CodyMusic.Track[] = [];

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
        if (!CodyMusic.getAccessToken()) {
            let serverIsOnline = await serverIsAvailable();
            const spotifyOauth = await getSpotifyOauth(serverIsOnline);
            if (spotifyOauth) {
                // update the CodyMusic credentials
                CodyMusic.setCredentials({
                    refreshToken: spotifyOauth.spotify_refresh_token,
                    clientSecret: "2b40b4975b2743189c87f4712c0cd59e",
                    clientId: "eb67e22ba1c6474aad8ec8067480d9dc",
                    accessToken: spotifyOauth.spotify_access_token
                });

                // fetch playlists
                this.syncSpotifyWebPlaylists();
            }
        }
    }

    async syncCodyPlaylists() {
        const response = await softwareGet("/music/playlist", getItem("jwt"));
        if (isResponseOk(response)) {
            this._codyPlaylists = response.data(item => {
                item["id"] = item.playlist_id;
                delete item.playlist_id;
                return item;
            });
        }
    }

    async syncPlaylistFavorites() {
        const response = await softwareGet(
            "/music/playlist/favorites",
            getItem("jwt")
        );

        if (isResponseOk(response) && response.data.length > 0) {
            this._codyFavorites = response.data(item => {
                return item;
            });
        } else {
            // clear the favorites
            this._codyFavorites = [];
        }
    }

    async syncSpotifyWebPlaylists() {
        this._playlists = await MusicPlaylistManager.getInstance().getSpotifyWebPlaylists();
    }

    get codyPlaylists(): PlaylistItem[] {
        return this._codyPlaylists;
    }

    get playlists(): PlaylistItem[] {
        return this._playlists;
    }

    get codyFavorites(): any[] {
        return this._codyFavorites;
    }

    get tracks(): CodyMusic.Track[] {
        if (!this._tracks || this._tracks.length === 0) {
            // check if there are any playists to get tracks from
            if (this._playlists && this._playlists.length > 0) {
                for (let i = 0; i < this._playlists.length; i++) {
                    let playlist: PlaylistItem = this._playlists[i];
                    if (playlist.tracks) {
                        for (let x = 0; x < playlist.tracks.length; x++) {
                            let track: CodyMusic.Track = playlist.tracks[x];
                            this.tracks.push(track);
                        }
                    }
                }
            }
        }
        return this.tracks;
    }
}
