import * as music from "cody-music";
import { workspace, window, ViewColumn } from "vscode";
import { MusicPlayerManagerSingleton } from "./MusicPlayerManager";
import { showQuickPick } from "../MenuManager";
import {
    getUserStatus,
    serverIsAvailable,
    refetchSpotifyConnectStatusLazily
} from "../DataController";
import {
    getItem,
    getMusicTimeFile,
    isLinux,
    logIt,
    buildLoginUrl,
    launchWebUrl,
    isMac
} from "../Util";
import {
    softwareGet,
    softwarePut,
    spotifyApiGet,
    isResponseOk
} from "../HttpClient";
import { MusicStoreManager, Playlist, Track } from "./MusicStoreManager";
import { api_endpoint, LOGIN_LABEL } from "../Constants";
import { MusicStateManagerSingleton, TrackState } from "./MusicStateManager";
const fs = require("fs");

const store: MusicStoreManager = MusicStoreManager.getInstance();
const NO_DATA = "MUSIC TIME\n\nNo data available\n";

export class MusicControlManager {
    async getPlayer(): Promise<string> {
        const trackState: TrackState = await MusicStateManagerSingleton.getState();
        if (trackState) {
            return trackState.type;
        } else {
            const webTrack: Track = await MusicStateManagerSingleton.getSpotifyWebCurrentTrack();
            if (webTrack) {
                return "spotify-web";
            }
        }
        return null;
    }

    async next() {
        const player = await this.getPlayer();
        if (player) {
            if (player === "spotify-web") {
                await MusicStateManagerSingleton.spotifyWebNext();
            } else {
                await music.next(player);
            }
            MusicPlayerManagerSingleton.updateButtons();
        }
    }

    async previous() {
        const player = await this.getPlayer();
        if (player) {
            if (player === "spotify-web") {
                await MusicStateManagerSingleton.spotifyWebPrevious();
            } else {
                await music.previous(player);
            }
            MusicPlayerManagerSingleton.updateButtons();
        }
    }

    async play() {
        const player = await this.getPlayer();
        if (player) {
            if (player === "spotify-web") {
                await MusicStateManagerSingleton.spotifyWebPlay();
            } else {
                await music.play(player);
            }
            MusicPlayerManagerSingleton.updateButtons();
        }
    }

    async pause() {
        const player = await this.getPlayer();
        if (player) {
            if (player === "spotify-web") {
                await MusicStateManagerSingleton.spotifyWebPause();
            } else {
                await music.pause(player);
            }
            MusicPlayerManagerSingleton.updateButtons();
        }
    }

    launchPlayerMenu() {
        let menuOptions = {
            items: []
        };

        if (isMac()) {
            menuOptions.items.push({
                label: "Launch Spotify",
                description: "",
                detail: "Launch your Spotify player",
                url: null,
                cb: launchSpotifyPlayer
            });

            menuOptions.items.push({
                label: "Launch iTunes",
                description: "",
                detail: "Launch your iTunes player",
                url: null,
                cb: launchItunesPlayer
            });
        }

        menuOptions.items.push({
            label: "Launch Spotify Web",
            description: "",
            detail: "Launch your Spotify web player",
            url: null,
            cb: launchSpotifyWebPlayer
        });

        showQuickPick(menuOptions);
    }

    async setLiked(liked: boolean) {
        const track: Track = await MusicStateManagerSingleton.getCurrentTrack();
        if (track) {
            // set it to liked
            let trackId = track.id;
            if (trackId.indexOf(":") !== -1) {
                // strip it down to just the last id part
                trackId = trackId.substring(trackId.lastIndexOf(":") + 1);
            }
            const type = track.type;
            // use the name and artist as well since we have it
            let trackName = encodeURIComponent(track.name);
            let trackArtist = encodeURIComponent(track.artist);
            const api = `/music/liked/track/${trackId}/type/${type}?name=${trackName}&artist=${trackArtist}`;
            const payload = { liked };
            const resp = await softwarePut(api, payload, getItem("jwt"));
            if (isResponseOk(resp)) {
                if (type === "itunes") {
                    music
                        .setItunesLoved(liked)
                        .then(result => {
                            console.log("updated itunes loved state");
                        })
                        .catch(err => {
                            console.log(
                                "unable to update itunes loved state, error: ",
                                err.message
                            );
                        });
                }
                // update the buttons
                MusicStateManagerSingleton.clearServerTrack();
                MusicPlayerManagerSingleton.stateCheckHandler();
            }
        }
    }

    async showMenu() {
        let serverIsOnline = await serverIsAvailable();
        // {loggedIn: true|false}
        let userStatus = await getUserStatus(serverIsOnline);
        let loginUrl = await buildLoginUrl();

        let loginMsgDetail =
            "To see your music data in Music Time, please log in to your account";
        if (!serverIsOnline) {
            loginMsgDetail =
                "Our service is temporarily unavailable. Please try again later.";
            loginUrl = null;
        }

        let menuOptions = {
            items: []
        };

        menuOptions.items.push({
            label: "Software top 40",
            description: "",
            detail:
                "Top 40 most popular songs developers around the world listen to as they code",
            url: "https://api.software.com/music/top40",
            cb: null
        });

        menuOptions.items.push({
            label: "Music time dashboard",
            description: "",
            detail: "View your latest music metrics right here in your editor",
            url: null,
            cb: displayMusicTimeMetricsDashboard
        });

        if (!userStatus.loggedIn) {
            menuOptions.items.push({
                label: LOGIN_LABEL,
                description: "",
                detail: loginMsgDetail,
                url: loginUrl,
                cb: null
            });
        }

        // check if the user has the spotify_access_token
        const accessToken = getItem("spotify_access_token");
        if (!accessToken) {
            menuOptions.items.push({
                label: "Connect Spotify",
                description: "",
                detail:
                    "To see your Spotify playlists in Music Time, please connect your account",
                url: null,
                cb: connectSpotify
            });
        }

        // menuOptions.items.push({
        //     label: "Search Playlist",
        //     description: "",
        //     detail: "Find a playlist",
        //     url: null,
        //     cb: buildPlaylists
        // });

        showQuickPick(menuOptions);
    }
}

export async function displayMusicTimeMetricsDashboard() {
    let musicTimeFile = getMusicTimeFile();
    await fetchMusicTimeMetricsDashboard();

    workspace.openTextDocument(musicTimeFile).then(doc => {
        // only focus if it's not already open
        window.showTextDocument(doc, ViewColumn.One, false).then(e => {
            // done
        });
    });
}

export async function connectSpotify() {
    const endpoint = `${api_endpoint}/auth/spotify?integrate=spotify`;
    launchWebUrl(endpoint);
    refetchSpotifyConnectStatusLazily(15);
}

export async function fetchMusicTimeMetricsDashboard() {
    let musicTimeFile = getMusicTimeFile();

    const musicSummary = await softwareGet(
        `/dashboard?plugin=music-time&linux=${isLinux()}`,
        getItem("jwt")
    );
    // get the content
    let content =
        musicSummary && musicSummary.data ? musicSummary.data : NO_DATA;

    fs.writeFileSync(musicTimeFile, content, err => {
        if (err) {
            logIt(`Error writing to the Software session file: ${err.message}`);
        }
    });
}

export function launchSpotifyWebPlayer() {
    launchWebUrl("https://open.spotify.com/collection/playlists");
}

export function launchSpotifyPlayer() {
    music.startSpotifyIfNotRunning().then(result => {
        MusicPlayerManagerSingleton.stateCheckHandler();
    });
}

export function launchItunesPlayer() {
    music.startItunesIfNotRunning().then(result => {
        MusicPlayerManagerSingleton.stateCheckHandler();
    });
}

export async function buildPlaylists() {
    let playlists = store.getPlaylists();
    if (playlists.length > 0) {
        return playlists;
    }

    let api = `/v1/me/playlists?offset=0&limit=20`;
    let accessToken = getItem("spotify_access_token");
    let playlistResponse = await spotifyApiGet(api, accessToken);
    // check if the token needs to be refreshed
    playlistResponse = await MusicStateManagerSingleton.checkSpotifyApiResponse(
        playlistResponse,
        api
    );

    if (!isResponseOk(playlistResponse)) {
        return;
    }

    //href:"https://api.spotify.com/v1/playlists/0mwG8hCL4scWi8Nkt7jyoV/tracks"
    //uri, name, public, collaborative, tracks: {total: 3}
    await populatePlaylists(playlistResponse, playlists, accessToken);

    // are there any more pages?
    while (playlistResponse.data.next !== null) {
        playlistResponse = await spotifyApiGet(
            playlistResponse.data.next,
            accessToken
        );
        if (isResponseOk(playlistResponse)) {
            await populatePlaylists(playlistResponse, playlists, accessToken);
        } else {
            break;
        }
    }

    store.setPlaylists(playlists);

    return playlists;
}

async function populatePlaylists(
    playlistResponse: any,
    playlists: Playlist[],
    accessToken: string
) {
    if (isResponseOk(playlistResponse)) {
        const data = playlistResponse.data;
        if (data && data.items) {
            for (let i = 0; i < data.items.length; i++) {
                // populate the playlists
                const playlistItem = data.items[i];
                let playlist = new Playlist();
                playlist.player = "spotify";
                playlist.id = playlistItem.id;
                playlist.uri = playlistItem.uri;
                playlist.collaborative = playlistItem.collaborative;
                playlist.name = playlistItem.name;
                playlist.public = playlistItem.public;

                let tracks = [];
                // get the tracks
                if (playlistItem.tracks) {
                    const trackReponse = await spotifyApiGet(
                        playlistItem.tracks.href,
                        accessToken
                    );
                    const trackData = trackReponse.data;
                    if (trackData && trackData.items) {
                        for (let x = 0; x < trackData.items.length; x++) {
                            // populate the tracks
                            const trackItemData = trackData.items[x];
                            if (trackItemData.track) {
                                const trackItem = trackItemData.track;
                                let track = new Track();
                                track.duration_ms = trackItem.duration_ms;
                                track.name = trackItem.name;
                                track.explicit = trackItem.explicit;
                                track.disc_number = trackItem.disc_number;
                                track.popularity = trackItem.popularity;
                                track.id = trackItem.id;
                                track.uri = trackItem.uri;
                                // set the artist
                                if (trackItem.artists) {
                                    const len = trackItem.artists.length;
                                    let artistNames = [];
                                    for (let y = 0; y < len; y++) {
                                        const artist = trackItem.artists[y];
                                        artistNames.push(artist.name);
                                    }
                                    track.artist = artistNames.join(", ");
                                }

                                if (trackItem.album) {
                                    track.album = trackItem.album.name;
                                }
                                tracks.push(track);
                            }
                        }
                    }
                }
                playlist.tracks = tracks;
                playlists.push(playlist);
            }
        }
    }
}
