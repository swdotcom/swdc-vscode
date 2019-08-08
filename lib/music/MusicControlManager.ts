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
    playSpotifyTrack,
    playTrackInContext,
    playSpotifyPlaylist
} from "cody-music";
import { workspace, window, ViewColumn, Uri, commands } from "vscode";
import { MusicCommandManager } from "./MusicCommandManager";
import { showQuickPick } from "../MenuManager";
import {
    getUserStatus,
    serverIsAvailable,
    refetchSpotifyConnectStatusLazily,
    getLoggedInCacheState
} from "../DataController";
import {
    getItem,
    getMusicTimeFile,
    isLinux,
    logIt,
    launchWebUrl,
    launchLogin,
    createSpotifyIdFromUri,
    getMusicTimeMarkdownFile,
    getSoftwareDir,
    isMac
} from "../Util";
import { softwareGet, softwarePut, isResponseOk } from "../HttpClient";
import {
    api_endpoint,
    LOGIN_LABEL,
    REFRESH_CUSTOM_PLAYLIST_TITLE,
    GENERATE_CUSTOM_PLAYLIST_TITLE,
    REFRESH_CUSTOM_PLAYLIST_TOOLTIP,
    GENERATE_CUSTOM_PLAYLIST_TOOLTIP,
    SPOTIFY_LIKED_SONGS_PLAYLIST_NAME,
    PERSONAL_TOP_SONGS_PLID,
    NOT_NOW_LABEL,
    YES_LABEL
} from "../Constants";
import { MusicStateManager } from "./MusicStateManager";
import { SpotifyUser } from "cody-music/dist/lib/profile";
import { SocialShareManager } from "../social/SocialShareManager";
import { tmpdir } from "os";
import { connectSlack } from "../slack/SlackControlManager";
import { MusicManager } from "./MusicManager";
const moment = require("moment-timezone");
const clipboardy = require("clipboardy");
const fs = require("fs");

const NO_DATA = "MUSIC TIME\n\nNo data available\n";

let lastDayOfMonth = -1;

export class MusicControlManager {
    constructor() {
        //
    }

    async next(playerName: PlayerName = null) {
        if (!playerName) {
            let playerName = MusicManager.getInstance().currentPlayerName;
            await next(playerName);
        } else {
            await next(playerName);
        }
        await MusicStateManager.getInstance().musicStateCheck();
        MusicCommandManager.syncControls(
            MusicManager.getInstance().runningTrack
        );
    }

    async previous(playerName: PlayerName = null) {
        if (!playerName) {
            let playerName = MusicManager.getInstance().currentPlayerName;
            await previous(playerName);
        } else {
            await previous(playerName);
        }
        await MusicStateManager.getInstance().musicStateCheck();
        MusicCommandManager.syncControls(
            MusicManager.getInstance().runningTrack
        );
    }

    async play(playerName: PlayerName = null) {
        if (!playerName) {
            let playerName = MusicManager.getInstance().currentPlayerName;
            await play(playerName);
        } else {
            await play(playerName);
        }
        await MusicStateManager.getInstance().musicStateCheck();
        MusicCommandManager.syncControls(
            MusicManager.getInstance().runningTrack
        );
    }

    async pause(playerName: PlayerName = null) {
        if (!playerName) {
            let playerName = MusicManager.getInstance().currentPlayerName;
            await pause(playerName);
        } else {
            await pause(playerName);
        }
        await MusicStateManager.getInstance().musicStateCheck();
        MusicCommandManager.syncControls(
            MusicManager.getInstance().runningTrack
        );
    }

    async setLiked(liked: boolean) {
        const musicMgr = MusicManager.getInstance();
        let track: Track = musicMgr.runningTrack;
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
            let serverTrack = musicMgr.serverTrack;
            if (!serverTrack) {
                serverTrack = { ...track };
            }
            serverTrack.loved = liked;
            musicMgr.serverTrack = serverTrack;

            // update the music store running track liked state
            track.loved = liked;
            musicMgr.runningTrack = track;

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
        if (playlistId === SPOTIFY_LIKED_SONGS_PLAYLIST_NAME) {
            playlistId = null;
        }
        const deviceId = spotifyDevices.length > 0 ? spotifyDevices[0].id : "";
        let options = {};
        if (deviceId) {
            options["device_id"] = deviceId;
        }
        const trackId = playlistItem ? playlistItem.id : "";
        if (trackId) {
            options["track_ids"] = [trackId];
        } else {
            options["offset"] = { position: 0 };
        }
        if (playlistId) {
            const playlistUri = `${spotifyUser.uri}:playlist:${playlistId}`;
            options["context_uri"] = playlistUri;
        }

        /**
         * to play a track without the play list id
         * curl -X "PUT" "https://api.spotify.com/v1/me/player/play?device_id=4f38ae14f61b3a2e4ed97d537a5cb3d09cf34ea1"
         * --data "{\"uris\":[\"spotify:track:2j5hsQvApottzvTn4pFJWF\"]}"
         */

        if (!playlistId) {
            // just play by track id
            await playSpotifyTrack(playlistItem.id, deviceId);
        } else {
            // we have playlist id within the options, use that
            // await play(PlayerName.SpotifyWeb, options);
            await playSpotifyPlaylist(playlistId, trackId, deviceId);
        }

        if (checkTrackStateAndTryAgainCount > 0) {
            const track: Track = await getRunningTrack();
            if (playlistItem && track.id === playlistItem.id) {
                await MusicStateManager.getInstance().musicStateCheck();
            } else if (!playlistItem && track.id) {
                await MusicStateManager.getInstance().musicStateCheck();
            } else {
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
            }
        } else {
            await MusicStateManager.getInstance().musicStateCheck();
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
        const selectedItem: PlaylistItem = MusicManager.getInstance()
            .selectedTrackItem;
        this.copySpotifyLink(selectedItem.id, false);
    }

    copyCurrentPlaylistLink() {
        // example: https://open.spotify.com/playlist/0mwG8hCL4scWi8Nkt7jyoV
        const selectedItem: PlaylistItem = MusicManager.getInstance()
            .selectedPlaylist;
        this.copySpotifyLink(selectedItem.id, true);
    }

    shareCurrentPlaylist() {
        const socialShare: SocialShareManager = SocialShareManager.getInstance();
        const selectedItem: PlaylistItem = MusicManager.getInstance()
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

        let menuOptions = {
            items: []
        };

        const musicMgr: MusicManager = MusicManager.getInstance();

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

        const slackAccessToken = getItem("slack_access_token");
        if (!slackAccessToken && serverIsOnline) {
            menuOptions.items.push({
                label: "Connect Slack",
                detail:
                    "To share a playlist or track on Slack, please connect your account",
                url: null,
                cb: connectSlack
            });
        }

        if (accessToken) {
            const musicMgr: MusicManager = MusicManager.getInstance();
            // check if we already have a playlist
            const savedPlaylists: PlaylistItem[] = musicMgr.savedPlaylists;
            const hasSavedPlaylists =
                savedPlaylists && savedPlaylists.length > 0 ? true : false;

            const codingFavs: any[] = musicMgr.userTopSongs;
            const hasUserFavorites =
                codingFavs && codingFavs.length > 0 ? true : false;

            const customPlaylist = musicMgr.getMusicTimePlaylistByTypeId(
                PERSONAL_TOP_SONGS_PLID
            );

            let personalPlaylistLabel = !customPlaylist
                ? GENERATE_CUSTOM_PLAYLIST_TITLE
                : REFRESH_CUSTOM_PLAYLIST_TITLE;
            const personalPlaylistTooltip = !customPlaylist
                ? GENERATE_CUSTOM_PLAYLIST_TOOLTIP
                : REFRESH_CUSTOM_PLAYLIST_TOOLTIP;

            if (!hasSavedPlaylists && hasUserFavorites) {
                // show the generate playlist menu item
                menuOptions.items.push({
                    label: personalPlaylistLabel,
                    detail: personalPlaylistTooltip,
                    cb: musicMgr.generateUsersWeeklyTopSongs
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
            cb: displayMusicTimeMetricsMarkdownDashboard
        });

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

        if (musicMgr.currentPlayerName !== PlayerName.SpotifyWeb) {
            menuOptions.items.push({
                label: "Switch to Spotify",
                detail: "Launch the Spotify web player to view your playlist",
                command: "musictime.launchSpotify"
            });
        } else {
            if (isMac()) {
                menuOptions.items.push({
                    label: "Switch to iTunes",
                    detail:
                        "Launch the iTunes web player to view your playlist",
                    command: "musictime.launchItunes"
                });
            }
        }

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

export async function displayMusicTimeMetricsMarkdownDashboard() {
    let musicTimeFile = getMusicTimeMarkdownFile();
    await fetchMusicTimeMetricsMarkdownDashboard();

    const viewOptions = {
        viewColumn: ViewColumn.One,
        preserveFocus: false
    };
    const localResourceRoots = [Uri.file(getSoftwareDir()), Uri.file(tmpdir())];
    const panel = window.createWebviewPanel(
        "music-time-preview",
        `Music Time Dashboard`,
        viewOptions,
        {
            enableFindWidget: true,
            localResourceRoots,
            enableScripts: true // enables javascript that may be in the content
        }
    );

    const content = fs.readFileSync(musicTimeFile).toString();
    panel.webview.html = content;
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
    disconnectOauth("Spotify");
}

export async function disconnectSlack() {
    disconnectOauth("Slack");
}

export async function disconnectOauth(type: string) {
    const selection = await window.showInformationMessage(
        `Are you sure you would like to disconnect ${type}?`,
        ...[NOT_NOW_LABEL, YES_LABEL]
    );

    if (selection === YES_LABEL) {
        let serverIsOnline = await serverIsAvailable();
        if (serverIsOnline) {
            const type_lc = type.toLowerCase();
            let result = await softwarePut(
                `/disconnect/${type_lc}`,
                {},
                getItem("jwt")
            );

            if (isResponseOk(result)) {
                const musicMgr = MusicManager.getInstance();
                // oauth is not null, initialize spotify
                if (type_lc === "slack") {
                    await this.updateSlackAccessInfo(null);
                } else if (type_lc === "spotify") {
                    musicMgr.clearSpotifyAccessInfo();
                }

                // refresh the playlist
                commands.executeCommand("musictime.refreshPlaylist");
            }
        } else {
            window.showInformationMessage(
                `Our service is temporarily unavailable.\n\nPlease try again later.\n`
            );
        }
    }
}

export async function fetchMusicTimeMetricsMarkdownDashboard() {
    let file = getMusicTimeMarkdownFile();

    const dayOfMonth = moment()
        .startOf("day")
        .date();
    if (lastDayOfMonth !== dayOfMonth) {
        lastDayOfMonth = dayOfMonth;
        await fetchDashboardData(file, "music-time", true);
    }
}

export async function fetchMusicTimeMetricsDashboard() {
    let file = getMusicTimeFile();

    const dayOfMonth = moment()
        .startOf("day")
        .date();
    if (lastDayOfMonth !== dayOfMonth) {
        lastDayOfMonth = dayOfMonth;
        await fetchDashboardData(file, "music-time", false);
    }
}

async function fetchDashboardData(
    fileName: string,
    plugin: string,
    isHtml: boolean
) {
    const musicSummary = await softwareGet(
        `/dashboard?plugin=${plugin}&linux=${isLinux()}&html=${isHtml}`,
        getItem("jwt")
    );

    // get the content
    let content =
        musicSummary && musicSummary.data ? musicSummary.data : NO_DATA;

    fs.writeFileSync(fileName, content, err => {
        if (err) {
            logIt(
                `Error writing to the Software dashboard file: ${err.message}`
            );
        }
    });
}
