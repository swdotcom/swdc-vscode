import {
    PlayerType,
    getRunningTrack,
    play,
    pause,
    previous,
    next,
    PlayerName,
    Track,
    setItunesLoved,
    launchPlayer,
    PlaylistItem,
    PlayerDevice,
    getSpotifyDevices
} from "cody-music";
import { workspace, window, ViewColumn } from "vscode";
import { MusicCommandManager } from "./MusicCommandManager";
import { showQuickPick } from "../MenuManager";
import {
    getUserStatus,
    serverIsAvailable,
    refetchSpotifyConnectStatusLazily,
    getLoggedInCacheState
} from "../DataController";
import { MusicStoreManager } from "./MusicStoreManager";
import {
    getItem,
    getMusicTimeFile,
    isLinux,
    logIt,
    launchWebUrl,
    launchLogin
} from "../Util";
import { softwareGet, softwarePut, isResponseOk } from "../HttpClient";
import {
    api_endpoint,
    LOGIN_LABEL,
    PERSONAL_TOP_SONGS_NAME
} from "../Constants";
import { MusicStateManager } from "./MusicStateManager";
const fs = require("fs");

const NO_DATA = "MUSIC TIME\n\nNo data available\n";

export class MusicControlManager {
    private msMgr: MusicStateManager = MusicStateManager.getInstance();

    constructor() {
        //
    }

    async getPlayer(): Promise<PlayerType> {
        const track = MusicStoreManager.getInstance().runningTrack;
        if (track) {
            return track.playerType;
        }
        return null;
    }

    async next() {
        const playerType = await this.getPlayer();
        if (playerType) {
            if (playerType === PlayerType.WebSpotify) {
                await next(PlayerName.SpotifyWeb);
            } else if (playerType === PlayerType.MacItunesDesktop) {
                await next(PlayerName.ItunesDesktop);
            } else if (playerType === PlayerType.MacSpotifyDesktop) {
                await next(PlayerName.SpotifyDesktop);
            }
            MusicCommandManager.syncControls();
        }
    }

    async previous() {
        const playerType = await this.getPlayer();
        if (playerType) {
            if (playerType === PlayerType.WebSpotify) {
                await previous(PlayerName.SpotifyWeb);
            } else if (playerType === PlayerType.MacItunesDesktop) {
                await previous(PlayerName.ItunesDesktop);
            } else if (playerType === PlayerType.MacSpotifyDesktop) {
                await previous(PlayerName.SpotifyDesktop);
            }
            MusicCommandManager.syncControls();
        }
    }

    async play() {
        const playerType = await this.getPlayer();
        if (playerType) {
            if (playerType === PlayerType.WebSpotify) {
                await play(PlayerName.SpotifyWeb);
            } else if (playerType === PlayerType.MacItunesDesktop) {
                await play(PlayerName.ItunesDesktop);
            } else if (playerType === PlayerType.MacSpotifyDesktop) {
                await play(PlayerName.SpotifyDesktop);
            }
            MusicCommandManager.syncControls();
        }
    }

    async pause() {
        const playerType = await this.getPlayer();
        if (playerType) {
            if (playerType === PlayerType.WebSpotify) {
                await pause(PlayerName.SpotifyWeb);
            } else if (playerType === PlayerType.MacItunesDesktop) {
                await pause(PlayerName.ItunesDesktop);
            } else if (playerType === PlayerType.MacSpotifyDesktop) {
                await pause(PlayerName.SpotifyDesktop);
            }
            MusicCommandManager.syncControls();
        }
    }

    async setLiked(liked: boolean) {
        let track: Track = MusicStoreManager.getInstance().runningTrack;
        if (track) {
            if (track.playerType === PlayerType.MacItunesDesktop) {
                // await so that the stateCheckHandler fetches
                // the latest version of the itunes track
                await setItunesLoved(liked).catch(err => {
                    logIt(`Error updating itunes loved state: ${err.message}`);
                });
            }

            // update the music store running track liked state
            track.loved = liked;
            MusicStoreManager.getInstance().runningTrack = track;

            // get the current track state
            MusicCommandManager.updateButtons();
        }
    }

    launchTrackPlayer(playerName: PlayerName = null) {
        if (!playerName) {
            getRunningTrack().then((track: Track) => {
                if (track && track.id) {
                    let options = {
                        trackId: track.id
                    };
                    let playerType: PlayerType = track.playerType;
                    let devices: PlayerDevice[] = MusicStoreManager.getInstance()
                        .spotifyPlayerDevices;

                    if (
                        playerType === PlayerType.WebSpotify &&
                        devices &&
                        devices.length === 1 &&
                        !devices[0].name.includes("Web Player")
                    ) {
                        // launch the spotify desktop only if we have
                        //
                        playerType = PlayerType.MacSpotifyDesktop;
                    }
                    if (playerType === PlayerType.NotAssigned) {
                        playerType = PlayerType.WebSpotify;
                    }

                    if (playerType === PlayerType.WebSpotify) {
                        launchPlayer(PlayerName.SpotifyWeb, options);
                    } else if (playerType === PlayerType.MacItunesDesktop) {
                        launchPlayer(PlayerName.ItunesDesktop, options);
                    } else {
                        launchPlayer(PlayerName.SpotifyDesktop, options);
                    }
                }
            });
        } else if (playerName === PlayerName.ItunesDesktop) {
            launchPlayer(PlayerName.ItunesDesktop);
        } else {
            this.launchSpotifyPlayer();
        }
    }

    launchSpotifyPlayer() {
        window.showInformationMessage(
            `After you select and play your first song in Spotify, standard controls (play, pause, next, etc.) will appear in your status bar.`,
            ...["OK"]
        );
        setTimeout(() => {
            launchPlayer(PlayerName.SpotifyWeb);
        }, 3000);
    }

    async showMenu() {
        let loggedInCacheState = getLoggedInCacheState();
        let serverIsOnline = await serverIsAvailable();
        let userStatus = {
            loggedIn: loggedInCacheState
        };
        if (loggedInCacheState === null) {
            // update it since it's null
            // {loggedIn: true|false}
            userStatus = await getUserStatus(serverIsOnline);
        }

        let loginFunction = launchLogin;
        let loginMsgDetail =
            "To see your music data in Music Time, please log in to your account";
        if (!serverIsOnline) {
            loginMsgDetail =
                "Our service is temporarily unavailable. Please try again later.";
            loginFunction = null;
        }

        const spotifyDevices: PlayerDevice[] = await getSpotifyDevices();

        let menuOptions = {
            items: []
        };

        const musicstoreMgr = MusicStoreManager.getInstance();

        // check if the user has the spotify_access_token
        const accessToken = getItem("spotify_access_token");
        if (!accessToken) {
            menuOptions.items.push({
                label: "Connect Spotify",
                detail:
                    "To see your Spotify playlists in Music Time, please connect your account",
                url: null,
                cb: connectSpotify
            });
        } else {
            // check if we already have a playlist
            const savedPlaylists: PlaylistItem[] = musicstoreMgr.savedPlaylists;
            const hasSavedPlaylists =
                savedPlaylists && savedPlaylists.length > 0 ? true : false;

            const codingFavs: any[] = musicstoreMgr.userFavorites;
            const hasUserFavorites =
                codingFavs && codingFavs.length > 0 ? true : false;

            const personalPlaylistInfo = musicstoreMgr.getExistingPesonalPlaylist();
            let personalPlaylistLabel = !personalPlaylistInfo
                ? "Generate Software Playlist"
                : "Update Software Playlist";
            const personalPlaylistTooltip = !personalPlaylistInfo
                ? `Generate a new Spotify playlist (${PERSONAL_TOP_SONGS_NAME})`
                : `Update your Spotify playlist (${PERSONAL_TOP_SONGS_NAME})`;

            if (!hasSavedPlaylists && hasUserFavorites) {
                // show the generate playlist menu item
                menuOptions.items.push({
                    label: personalPlaylistLabel,
                    detail: personalPlaylistTooltip,
                    url: null,
                    cb: MusicStoreManager.getInstance()
                        .generateUsersWeeklyTopSongs
                });
            }

            if (!spotifyDevices || spotifyDevices.length === 0) {
                menuOptions.items.push({
                    label: "Launch Spotify",
                    detail:
                        "Launch the Spotify web player to view your playlist",
                    url: null,
                    cb: this.launchSpotifyPlayer
                });
            }
        }

        if (!userStatus.loggedIn) {
            menuOptions.items.push({
                label: LOGIN_LABEL,
                detail: loginMsgDetail,
                url: null,
                cb: loginFunction
            });
        }

        menuOptions.items.push({
            label: "Music Time Dashboard",
            detail: "View your latest music metrics right here in your editor",
            url: null,
            cb: displayMusicTimeMetricsDashboard
        });

        menuOptions.items.push({
            label: "Software Top 40",
            detail:
                "Top 40 most popular songs developers around the world listen to as they code",
            url: "https://api.software.com/music/top40",
            cb: null
        });

        menuOptions.items.push({
            label: "Submit an issue on GitHub",
            detail: "Encounter a bug? Submit an issue on our GitHub page",
            url: "https://github.com/swdotcom/swdc-vscode/issues",
            cb: null
        });

        menuOptions.items.push({
            label: "Submit Feedback",
            detail: "Send us an email at cody@software.com.",
            url: "mailto:cody@software.com",
            cb: null
        });

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
    const endpoint = `${api_endpoint}/auth/spotify?integrate=spotify&token=${getItem(
        "jwt"
    )}`;
    launchWebUrl(endpoint);
    refetchSpotifyConnectStatusLazily();
}

export async function disconnectSpotify() {
    let serverIsOnline = await serverIsAvailable();
    if (serverIsOnline) {
        let result = await softwarePut(
            "/disconnect/spotify",
            {},
            getItem("jwt")
        );

        if (isResponseOk(result)) {
            const musicstoreMgr = MusicStoreManager.getInstance();
            // oauth is not null, initialize spotify
            musicstoreMgr.clearSpotifyAccessInfo();

            musicstoreMgr.refreshPlaylists();
        }
    } else {
        window.showInformationMessage(
            `Our service is temporarily unavailable.\n\nPlease try again later.\n`
        );
    }
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
