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
    getSpotifyDevices,
    quitMacPlayer
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
    launchLogin,
    createSpotifyIdFromUri
} from "../Util";
import { softwareGet, softwarePut, isResponseOk } from "../HttpClient";
import {
    api_endpoint,
    LOGIN_LABEL,
    REFRESH_CUSTOM_PLAYLIST_TITLE,
    GENERATE_CUSTOM_PLAYLIST_TITLE,
    REFRESH_CUSTOM_PLAYLIST_TOOLTIP,
    GENERATE_CUSTOM_PLAYLIST_TOOLTIP
} from "../Constants";
import { MusicStateManager } from "./MusicStateManager";
import { SpotifyUser } from "cody-music/dist/lib/profile";
import { SocialShareManager } from "../social/SocialShareManager";

const clipboardy = require("clipboardy");
const fs = require("fs");

const NO_DATA = "MUSIC TIME\n\nNo data available\n";

export class MusicControlManager {
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

    async next(playerName: PlayerName = null) {
        if (!playerName) {
            const playerType = await this.getPlayer();
            if (playerType) {
                if (playerType === PlayerType.WebSpotify) {
                    await next(PlayerName.SpotifyWeb);
                } else if (playerType === PlayerType.MacItunesDesktop) {
                    await next(PlayerName.ItunesDesktop);
                } else if (playerType === PlayerType.MacSpotifyDesktop) {
                    await next(PlayerName.SpotifyDesktop);
                }
            }
        } else {
            await next(playerName);
        }

        MusicStoreManager.getInstance().refreshPlaylists();
    }

    async previous(playerName: PlayerName = null) {
        if (!playerName) {
            const playerType = await this.getPlayer();
            if (playerType) {
                if (playerType === PlayerType.WebSpotify) {
                    await previous(PlayerName.SpotifyWeb);
                } else if (playerType === PlayerType.MacItunesDesktop) {
                    await previous(PlayerName.ItunesDesktop);
                } else if (playerType === PlayerType.MacSpotifyDesktop) {
                    await previous(PlayerName.SpotifyDesktop);
                }
            }
        } else {
            await previous(playerName);
        }
        MusicStoreManager.getInstance().refreshPlaylists();
    }

    async play(playerName: PlayerName = null) {
        if (!playerName) {
            const playerType = await this.getPlayer();
            if (playerType) {
                if (playerType === PlayerType.WebSpotify) {
                    await play(PlayerName.SpotifyWeb);
                } else if (playerType === PlayerType.MacItunesDesktop) {
                    await play(PlayerName.ItunesDesktop);
                } else if (playerType === PlayerType.MacSpotifyDesktop) {
                    await play(PlayerName.SpotifyDesktop);
                }
            }
        } else {
            await play(playerName);
        }
        MusicStoreManager.getInstance().refreshPlaylists();
    }

    async pause(playerName: PlayerName = null) {
        if (!playerName) {
            const playerType = await this.getPlayer();
            if (playerType) {
                if (playerType === PlayerType.WebSpotify) {
                    await pause(PlayerName.SpotifyWeb);
                } else if (playerType === PlayerType.MacItunesDesktop) {
                    await pause(PlayerName.ItunesDesktop);
                } else if (playerType === PlayerType.MacSpotifyDesktop) {
                    await pause(PlayerName.SpotifyDesktop);
                }
            }
        } else {
            await pause(playerName);
        }
        MusicStoreManager.getInstance().refreshPlaylists();
    }

    async setLiked(liked: boolean) {
        const musicstoreMgr = MusicStoreManager.getInstance();
        let track: Track = musicstoreMgr.runningTrack;
        if (track) {
            if (track.playerType === PlayerType.MacItunesDesktop) {
                // await so that the stateCheckHandler fetches
                // the latest version of the itunes track
                await setItunesLoved(liked).catch(err => {
                    logIt(`Error updating itunes loved state: ${err.message}`);
                });
            }

            // set the server track to liked to keep it cached
            // until the song session is sent from the MusicStateManager
            let serverTrack = musicstoreMgr.serverTrack;
            if (!serverTrack) {
                serverTrack = { ...track };
            }
            serverTrack.loved = liked;
            musicstoreMgr.serverTrack = serverTrack;

            // update the music store running track liked state
            track.loved = liked;
            musicstoreMgr.runningTrack = track;

            // get the current track state
            MusicCommandManager.syncControls(track);
        }
    }

    async playSpotifyTrackFromPlaylist(
        spotifyUser: SpotifyUser,
        playlistId: string,
        playlistItem: PlaylistItem,
        spotifyDevices: PlayerDevice[],
        checkTrackStateAndTryAgainCount: number = 0
    ) {
        const musicstoreMgr = MusicStoreManager.getInstance();

        let options = {
            track_ids: []
        };
        if (spotifyDevices.length > 0) {
            options["device_id"] = spotifyDevices[0].id;
        }
        options.track_ids = [playlistItem.id];
        if (playlistId) {
            const playlistUri = `${spotifyUser.uri}:playlist:${playlistId}`;
            options["context_uri"] = playlistUri;
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
                        this.playSpotifyTrackFromPlaylist(
                            spotifyUser,
                            playlistId,
                            playlistItem,
                            spotifyDevices,
                            checkTrackStateAndTryAgainCount
                        );
                    }, 1000);
                } else {
                    musicstoreMgr.refreshPlaylists();
                }
            });
        } else {
            musicstoreMgr.refreshPlaylists();
        }
    }

    async launchTrackPlayer(playerName: PlayerName = null) {
        const musicstoreMgr = MusicStoreManager.getInstance();

        const currentlyRunningType = musicstoreMgr.currentPlayerType;
        if (playerName === PlayerName.ItunesDesktop) {
            musicstoreMgr.currentPlayerType = PlayerType.MacItunesDesktop;
        } else {
            musicstoreMgr.currentPlayerType = PlayerType.WebSpotify;
        }
        const musicCtrlMgr = new MusicControlManager();
        const currentTrack = musicstoreMgr.runningTrack;
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
            if (
                currentTrack &&
                currentTrack.playerType !== PlayerType.MacItunesDesktop
            ) {
                // end the spotify web track
                if (currentlyRunningType !== PlayerType.MacSpotifyDesktop) {
                    musicCtrlMgr.pause(PlayerName.SpotifyWeb);
                } else {
                    await quitMacPlayer(PlayerName.SpotifyDesktop);
                }
            }
            launchPlayer(PlayerName.ItunesDesktop);
        } else {
            // end the itunes track
            // musicCtrlMgr.pause(PlayerName.ItunesDesktop);
            // quit the app
            await quitMacPlayer(PlayerName.ItunesDesktop);
            const spotifyDevices: PlayerDevice[] = await getSpotifyDevices();
            if (!spotifyDevices || spotifyDevices.length === 0) {
                this.launchSpotifyPlayer();
            }
        }
    }

    async copySpotifyLink(id: string, isPlaylist: boolean) {
        let link = buildSpotifyLink(id, true);
        let messageContext = "";
        if (isPlaylist) {
            messageContext = "playlist";
        } else {
            messageContext = "track";
        }

        try {
            clipboardy.writeSync(link);
            window.showInformationMessage(
                `Spotify ${messageContext} link copied to clipboard.`,
                ...["OK"]
            );
        } catch (err) {
            logIt(`Unable to copy to clipboard, error: ${err.message}`);
        }
    }

    copyCurrentTrackLink() {
        // example: https://open.spotify.com/track/7fa9MBXhVfQ8P8Df9OEbD8
        // get the current track
        const selectedItem: PlaylistItem = MusicStoreManager.getInstance()
            .selectedTrackItem;
        this.copySpotifyLink(selectedItem.id, false);
    }

    copyCurrentPlaylistLink() {
        // example: https://open.spotify.com/playlist/0mwG8hCL4scWi8Nkt7jyoV
        const selectedItem: PlaylistItem = MusicStoreManager.getInstance()
            .selectedPlaylist;
        this.copySpotifyLink(selectedItem.id, true);
    }

    shareCurrentPlaylist() {
        const socialShare: SocialShareManager = SocialShareManager.getInstance();
        const selectedItem: PlaylistItem = MusicStoreManager.getInstance()
            .selectedPlaylist;
        const url = buildSpotifyLink(selectedItem.id, true);

        socialShare.shareIt("facebook", { u: url, hashtag: "OneOfMyFavs" });
    }

    launchSpotifyPlayer() {
        window.showInformationMessage(
            `After you select and play your first song in Spotify, standard controls (play, pause, next, etc.) will appear in your status bar.`,
            ...["OK"]
        );
        setTimeout(() => {
            launchPlayer(PlayerName.SpotifyWeb);
        }, 3200);
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
        if (!accessToken && serverIsOnline) {
            menuOptions.items.push({
                label: "Connect Spotify",
                detail:
                    "To see your Spotify playlists in Music Time, please connect your account",
                url: null,
                cb: connectSpotify
            });
        }

        if (accessToken) {
            // check if we already have a playlist
            const savedPlaylists: PlaylistItem[] = musicstoreMgr.savedPlaylists;
            const hasSavedPlaylists =
                savedPlaylists && savedPlaylists.length > 0 ? true : false;

            const codingFavs: any[] = musicstoreMgr.userFavorites;
            const hasUserFavorites =
                codingFavs && codingFavs.length > 0 ? true : false;

            const personalPlaylistInfo = musicstoreMgr.getExistingPesonalPlaylist();
            let personalPlaylistLabel = !personalPlaylistInfo
                ? GENERATE_CUSTOM_PLAYLIST_TITLE
                : REFRESH_CUSTOM_PLAYLIST_TITLE;
            const personalPlaylistTooltip = !personalPlaylistInfo
                ? GENERATE_CUSTOM_PLAYLIST_TOOLTIP
                : REFRESH_CUSTOM_PLAYLIST_TOOLTIP;

            if (!hasSavedPlaylists && hasUserFavorites) {
                // show the generate playlist menu item
                menuOptions.items.push({
                    label: personalPlaylistLabel,
                    detail: personalPlaylistTooltip,
                    cb: MusicStoreManager.getInstance()
                        .generateUsersWeeklyTopSongs
                });
            }

            console.log(
                "current player type: ",
                musicstoreMgr.currentPlayerType
            );
            if (musicstoreMgr.currentPlayerType !== PlayerType.WebSpotify) {
                menuOptions.items.push({
                    label: "Switch to Spotify",
                    detail:
                        "Launch the Spotify web player to view your playlist",
                    command: "musictime.launchSpotify"
                });
            } else {
                menuOptions.items.push({
                    label: "Switch to iTunes",
                    detail:
                        "Launch the iTunes web player to view your playlist",
                    command: "musictime.launchItunes"
                });
            }
        }

        if (!userStatus.loggedIn) {
            menuOptions.items.push({
                label: LOGIN_LABEL,
                detail: loginMsgDetail,
                cb: loginFunction
            });
        }

        menuOptions.items.push({
            label: "Music Time Dashboard",
            detail: "View your latest music metrics right here in your editor",
            cb: displayMusicTimeMetricsDashboard
        });

        // if (
        //     musicstoreMgr.selectedPlaylist &&
        //     musicstoreMgr.selectedPlaylist.id
        // ) {
        //     menuOptions.items.push({
        //         label: "Share Playlist",
        //         detail: "Share the current playlist to....",
        //         cb: this.shareCurrentPlaylist
        //     });
        // }

        // menuOptions.items.push({
        //     label: "Software Top 40",
        //     detail:
        //         "Top 40 most popular songs developers around the world listen to as they code",
        //     url: "https://api.software.com/music/top40"
        // });

        menuOptions.items.push({
            label: "Submit an issue on GitHub",
            detail: "Encounter a bug? Submit an issue on our GitHub page",
            url: "https://github.com/swdotcom/swdc-vscode/issues"
        });

        menuOptions.items.push({
            label: "Submit Feedback",
            detail: "Send us an email at cody@software.com.",
            url: "mailto:cody@software.com"
        });

        showQuickPick(menuOptions);
    }
}

export function buildSpotifyLink(id: string, isPlaylist: boolean) {
    let link = "";
    id = createSpotifyIdFromUri(id);
    if (isPlaylist) {
        link = `https://open.spotify.com/playlist/${id}`;
    } else {
        link = `https://open.spotify.com/track/${id}`;
    }

    return link;
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
