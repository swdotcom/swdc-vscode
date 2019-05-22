import { getItem, setItem } from "../Util";
import {
    spotifyApiGet,
    hasTokenExpired,
    softwareGet,
    isResponseOk
} from "../HttpClient";
import { serverIsAvailable, getSpotifyOauth } from "../DataController";
import { Track } from "cody-music";

export async function checkSpotifyApiResponse(response: any, api: string) {
    if (hasTokenExpired(response)) {
        let accessToken = getItem("spotify_access_token");
        await this.refreshToken();
        accessToken = getItem("spotify_access_token");
        // call get playlists again
        response = await spotifyApiGet(api, accessToken);
    }
    return response;
}

export async function refreshToken() {
    if (this.refreshingToken) {
        return;
    }
    this.refreshingToken = true;
    let serverIsOnline = await serverIsAvailable();
    const jwt = getItem("jwt");
    // refresh the token then try again
    const refreshResponse = await softwareGet(
        "/auth/spotify/refreshToken",
        jwt
    );
    if (isResponseOk(refreshResponse)) {
        // get the user then get the playlists again
        await getSpotifyOauth(serverIsOnline);
    }
    this.refreshingToken = false;
}

export function extractAristFromSpotifyTrack(track: Track) {
    if (!track) {
        return;
    }

    if (track["artists"]) {
        const len = track["artists"].length;
        let artistNames = [];
        for (let y = 0; y < len; y++) {
            const artist = track["artists"][y];
            artistNames.push(artist.name);
        }
        track["artist"] = artistNames.join(", ");
    }
}
