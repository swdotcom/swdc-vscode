import * as CodyMusic from "cody-music";
import { workspace, window, ViewColumn } from "vscode";
import { MusicCommandManager } from "./MusicCommandManager";
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
import { softwareGet, softwarePut, isResponseOk } from "../HttpClient";
import { api_endpoint, LOGIN_LABEL } from "../Constants";
import { MusicStateManager } from "./MusicStateManager";
import { PlayerType } from "cody-music/dist/lib/models";
const fs = require("fs");

const NO_DATA = "MUSIC TIME\n\nNo data available\n";

export class MusicControlManager {
    private msMgr: MusicStateManager = MusicStateManager.getInstance();

    async getPlayer(): Promise<PlayerType> {
        const track = await CodyMusic.getRunningTrack();
        if (track) {
            return track.playerType;
        }
        return null;
    }

    async next() {
        const playerType = await this.getPlayer();
        if (playerType) {
            if (playerType === PlayerType.WebSpotify) {
                await CodyMusic.next(CodyMusic.PlayerName.SpotifyWeb);
            } else if (playerType === PlayerType.MacItunesDesktop) {
                await CodyMusic.next(CodyMusic.PlayerName.ItunesDesktop);
            } else if (playerType === PlayerType.MacSpotifyDesktop) {
                await CodyMusic.next(CodyMusic.PlayerName.SpotifyDesktop);
            }
            MusicCommandManager.updateButtons();
        }
    }

    async previous() {
        const playerType = await this.getPlayer();
        if (playerType) {
            if (playerType === PlayerType.WebSpotify) {
                await CodyMusic.previous(CodyMusic.PlayerName.SpotifyWeb);
            } else if (playerType === PlayerType.MacItunesDesktop) {
                await CodyMusic.previous(CodyMusic.PlayerName.ItunesDesktop);
            } else if (playerType === PlayerType.MacSpotifyDesktop) {
                await CodyMusic.previous(CodyMusic.PlayerName.SpotifyDesktop);
            }
            MusicCommandManager.updateButtons();
        }
    }

    async play() {
        const playerType = await this.getPlayer();
        if (playerType) {
            if (playerType === PlayerType.WebSpotify) {
                await CodyMusic.play(CodyMusic.PlayerName.SpotifyWeb);
            } else if (playerType === PlayerType.MacItunesDesktop) {
                await CodyMusic.play(CodyMusic.PlayerName.ItunesDesktop);
            } else if (playerType === PlayerType.MacSpotifyDesktop) {
                await CodyMusic.play(CodyMusic.PlayerName.SpotifyDesktop);
            }
            MusicCommandManager.updateButtons();
        }
    }

    async pause() {
        const playerType = await this.getPlayer();
        if (playerType) {
            if (playerType === PlayerType.WebSpotify) {
                await CodyMusic.pause(CodyMusic.PlayerName.SpotifyWeb);
            } else if (playerType === PlayerType.MacItunesDesktop) {
                await CodyMusic.pause(CodyMusic.PlayerName.ItunesDesktop);
            } else if (playerType === PlayerType.MacSpotifyDesktop) {
                await CodyMusic.pause(CodyMusic.PlayerName.SpotifyDesktop);
            }
            MusicCommandManager.updateButtons();
        }
    }

    async setLiked(liked: boolean) {
        const track: CodyMusic.Track = await CodyMusic.getRunningTrack();
        if (track) {
            // set it to liked
            let trackId = track.id;
            if (trackId.indexOf(":") !== -1) {
                // strip it down to just the last id part
                trackId = trackId.substring(trackId.lastIndexOf(":") + 1);
            }
            let type = "spotify";
            if (track.playerType === CodyMusic.PlayerType.MacItunesDesktop) {
                type = "itunes";
            }
            // use the name and artist as well since we have it
            let trackName = encodeURIComponent(track.name);
            let trackArtist = encodeURIComponent(track.artist);
            const api = `/music/liked/track/${trackId}/type/${type}?name=${trackName}&artist=${trackArtist}`;
            const payload = { liked };
            const resp = await softwarePut(api, payload, getItem("jwt"));
            if (isResponseOk(resp)) {
                if (type === "itunes") {
                    // await so that the stateCheckHandler fetches
                    // the latest version of the itunes track
                    await CodyMusic.setItunesLoved(liked)
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
                this.msMgr.clearServerTrack();
                // update the buttons since the liked state changed
                MusicCommandManager.updateButtons();
            }
        }
    }

    launchTrackPlayer() {
        CodyMusic.getRunningTrack().then((track: CodyMusic.Track) => {
            if (track && track.id) {
                if (track.playerType === PlayerType.WebSpotify) {
                    CodyMusic.launchPlayer(CodyMusic.PlayerName.SpotifyWeb);
                } else if (track.playerType === PlayerType.MacItunesDesktop) {
                    CodyMusic.launchPlayer(CodyMusic.PlayerName.ItunesDesktop);
                } else {
                    CodyMusic.launchPlayer(CodyMusic.PlayerName.SpotifyDesktop);
                }
            }
        });
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

        const track: CodyMusic.Track = await CodyMusic.getRunningTrack();

        if (!track) {
            if (isMac()) {
                menuOptions.items.push({
                    label: "Launch Spotify Desktop",
                    description: "",
                    detail: "Launch your Spotify desktop player",
                    url: null,
                    cb: launchSpotifyPlayer
                });

                menuOptions.items.push({
                    label: "Launch iTunes Desktop",
                    description: "",
                    detail: "Launch your iTunes desktop player",
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
        }

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
    CodyMusic.launchPlayer(CodyMusic.PlayerName.SpotifyDesktop, {}).then(
        result => {
            MusicCommandManager.stateCheckHandler();
        }
    );
}

export function launchItunesPlayer() {
    CodyMusic.launchPlayer(CodyMusic.PlayerName.ItunesDesktop, {}).then(
        result => {
            MusicCommandManager.stateCheckHandler();
        }
    );
}

// export async function buildPlaylists() {
//     let playlists = store.getPlaylists();
//     if (playlists.length > 0) {
//         return playlists;
//     }

//     let api = `/v1/me/playlists?offset=0&limit=20`;
//     let accessToken = getItem("spotify_access_token");
//     let playlistResponse = await spotifyApiGet(api, accessToken);
//     // check if the token needs to be refreshed
//     playlistResponse = await checkSpotifyApiResponse(playlistResponse, api);

//     if (!isResponseOk(playlistResponse)) {
//         return;
//     }

//     //href:"https://api.spotify.com/v1/playlists/0mwG8hCL4scWi8Nkt7jyoV/tracks"
//     //uri, name, public, collaborative, tracks: {total: 3}
//     await populatePlaylists(playlistResponse, playlists, accessToken);

//     // are there any more pages?
//     while (playlistResponse.data.next !== null) {
//         playlistResponse = await spotifyApiGet(
//             playlistResponse.data.next,
//             accessToken
//         );
//         if (isResponseOk(playlistResponse)) {
//             await populatePlaylists(playlistResponse, playlists, accessToken);
//         } else {
//             break;
//         }
//     }

//     store.setPlaylists(playlists);

//     return playlists;
// }

// async function populatePlaylists(
//     playlistResponse: any,
//     playlists: Playlist[],
//     accessToken: string
// ) {
//     if (isResponseOk(playlistResponse)) {
//         const data = playlistResponse.data;
//         if (data && data.items) {
//             for (let i = 0; i < data.items.length; i++) {
//                 // populate the playlists
//                 const playlistItem = data.items[i];
//                 let playlist = new Playlist();
//                 playlist.player = "spotify";
//                 playlist.id = playlistItem.id;
//                 playlist.uri = playlistItem.uri;
//                 playlist.collaborative = playlistItem.collaborative;
//                 playlist.name = playlistItem.name;
//                 playlist.public = playlistItem.public;

//                 let tracks = [];
//                 // get the tracks
//                 if (playlistItem.tracks) {
//                     const trackReponse = await spotifyApiGet(
//                         playlistItem.tracks.href,
//                         accessToken
//                     );
//                     const trackData = trackReponse.data;
//                     if (trackData && trackData.items) {
//                         for (let x = 0; x < trackData.items.length; x++) {
//                             // populate the tracks
//                             const trackItemData = trackData.items[x];
//                             if (trackItemData.track) {
//                                 const trackItem = trackItemData.track;
//                                 let track = new Track();
//                                 track.duration_ms = trackItem.duration_ms;
//                                 track.name = trackItem.name;
//                                 track.explicit = trackItem.explicit;
//                                 track.disc_number = trackItem.disc_number;
//                                 track.popularity = trackItem.popularity;
//                                 track.id = trackItem.id;
//                                 track.uri = trackItem.uri;
//                                 // set the artist
//                                 if (trackItem.artists) {
//                                     const len = trackItem.artists.length;
//                                     let artistNames = [];
//                                     for (let y = 0; y < len; y++) {
//                                         const artist = trackItem.artists[y];
//                                         artistNames.push(artist.name);
//                                     }
//                                     track.artist = artistNames.join(", ");
//                                 }

//                                 if (trackItem.album) {
//                                     track.album = trackItem.album.name;
//                                 }
//                                 tracks.push(track);
//                             }
//                         }
//                     }
//                 }
//                 playlist.tracks = tracks;
//                 playlists.push(playlist);
//             }
//         }
//     }
// }
