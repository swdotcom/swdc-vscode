import * as CodyMusic from "cody-music";
import { serverIsAvailable, getSpotifyOauth } from "../DataController";
import { MusicPlaylistManager } from "./MusicPlaylistManager";
import { PlaylistItem } from "cody-music/dist/lib/models";

export class MusicStoreManager {
    private static instance: MusicStoreManager;
    private playlists: PlaylistItem[] = [];
    private tracks: CodyMusic.Track[] = [];

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
                this.updatePlaylists();
            }
        }
    }

    getPlaylists(): PlaylistItem[] {
        return this.playlists;
    }

    async updatePlaylists() {
        this.playlists = await MusicPlaylistManager.getInstance().getSpotifyWebPlaylists();
    }

    getTracks(): CodyMusic.Track[] {
        if (!this.tracks || this.tracks.length === 0) {
            // check if there are any playists to get tracks from
            if (this.playlists && this.playlists.length > 0) {
                for (let i = 0; i < this.playlists.length; i++) {
                    let playlist: PlaylistItem = this.playlists[i];
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
