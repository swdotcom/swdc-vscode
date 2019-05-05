import * as music from "cody-music";
import { MusicPlayerManagerSingleton } from "./MusicPlayerManager";
import { showQuickPick } from "../MenuManager";
import {
    handleSpotifyConnect,
    serverIsAvailable,
    getSpotifyAccessToken
} from "../DataController";
import { getItem, setItem } from "../Util";
import {
    softwareGet,
    spotifyApiGet,
    hasTokenExpired,
    isResponseOk
} from "../HttpClient";

export class MusicController {
    getPlayer(): string {
        const trackState = MusicPlayerManagerSingleton.getTrackState();
        if (trackState) {
            return trackState.type;
        }
        return null;
    }

    async next() {
        const player = this.getPlayer();
        if (player) {
            await music.next(player);
            MusicPlayerManagerSingleton.updateButtons();
        }
    }
    async previous() {
        const player = this.getPlayer();
        if (player) {
            await music.previous(player);
            MusicPlayerManagerSingleton.updateButtons();
        }
    }
    async play() {
        const player = this.getPlayer();
        if (player) {
            await music.play(player);
            MusicPlayerManagerSingleton.updateButtons();
        }
    }
    async pause() {
        const player = this.getPlayer();
        if (player) {
            await music.pause(player);
            MusicPlayerManagerSingleton.updateButtons();
        }
    }

    async showMenu() {
        let kpmMenuOptions = {
            items: []
        };

        kpmMenuOptions.items.push({
            label: "Software Top 40",
            description: "",
            detail:
                "Top 40 most popular songs developers around the world listen to as they code",
            url: "https://api.software.com/music/top40",
            uri: null,
            cb: null
        });

        kpmMenuOptions.items.push({
            label: "Connect Spotify",
            description: "",
            detail:
                "To see your Spotify playlists in Music Time, please connect your account",
            url: null,
            uri: null,
            cb: handleSpotifyConnect
        });

        kpmMenuOptions.items.push({
            label: "Search Playlist",
            description: "",
            detail: "Find a playlist",
            url: null,
            uri: null,
            cb: this.getPlaylists
        });

        kpmMenuOptions.items.push({
            label: "Current spotify track",
            description: "",
            detail: "Get the current spotify track",
            url: null,
            uri: null,
            cb: this.getCurrentTrack
        });

        showQuickPick(kpmMenuOptions);
    }

    async getPlaylists() {
        let api = "/v1/me/playlists";
        let accessToken = getItem("spotify_access_token");
        let response = await spotifyApiGet(api, accessToken);
        if (hasTokenExpired(response)) {
            await refreshToken();
            accessToken = getItem("spotify_access_token");
            // call get playlists again
            response = await spotifyApiGet(api, accessToken);
        }
        console.log("respnose: ", response);
    }

    async getCurrentTrack() {
        let api = "/v1/me/player/currently-playing";
        let accessToken = getItem("spotify_access_token");
        // /v1/me/player/currently-playing
        let response = await spotifyApiGet(api, accessToken);
        if (hasTokenExpired(response)) {
            await refreshToken();
            accessToken = getItem("spotify_access_token");
            // call get playlists again
            response = await spotifyApiGet(api, accessToken);
        }
        console.log("respnose: ", response);
    }
}

export async function refreshToken() {
    let serverIsOnline = await serverIsAvailable();
    const jwt = getItem("jwt");
    // refresh the token then try again
    const refreshResponse = await softwareGet(
        "/auth/spotify/refreshToken",
        jwt
    );
    if (isResponseOk(refreshResponse)) {
        // get the user then get the playlists again
        let accessToken = await getSpotifyAccessToken(serverIsOnline);
        if (accessToken) {
            setItem("spotify_access_token", accessToken);
        }
    }
}
