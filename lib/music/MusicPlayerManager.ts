import { Disposable } from "vscode";
import * as music from "cody-music";
import {
    wrapExecPromise,
    isWindows,
    isMac,
    getItem,
    isEmptyObj
} from "../Util";
import { softwareGet, isResponseOk, spotifyApiGet } from "../HttpClient";
import { Track, PlayerContext, PlayerDevice } from "./MusicStoreManager";
import { MusicStateManager } from "./MusicStateManager";
import {
    checkSpotifyApiResponse,
    extractAristFromSpotifyTrack
} from "./MusicUtil";

export enum TrackType {
    MacItunesDesktop = 1,
    MacSpotifyDesktop = 2,
    WindowsSpotifyDesktop = 3,
    WebSpotify = 4
}

export interface TrackState {
    /**
     * type of the player
     */
    type: TrackType;
    /**
     * The track data
     */
    track: Track;
}

export class MusicPlayerManager {
    private static instance: MusicPlayerManager;

    private _disposable: Disposable;
    // private _interval: any = null;
    private _spotifyDevices: PlayerDevice[] = null;

    static getInstance() {
        if (!MusicPlayerManager.instance) {
            MusicPlayerManager.instance = new MusicPlayerManager();
        }
        return MusicPlayerManager.instance;
    }

    private constructor() {
        // private to prevent non-singleton usage
        // if (!this._interval) {
        //     this._interval = setInterval(() => {
        //         this.updatePrimaryRunningPlayer();
        //     }, 1000 * 5);
        // }
        // this._disposable = new Disposable(() => this.dispose());
    }

    public dispose() {
        // if (this._interval) {
        //     clearInterval(this._interval);
        // }
        this._disposable.dispose();
    }

    public async getCurrentlyRunningTrackState(): Promise<TrackState> {
        let spotifyDesktopRunning = await this.isSpotifyDesktopRunning();
        let itunesDesktopRunning = await this.isItunesDesktopRunning();
        if (spotifyDesktopRunning || itunesDesktopRunning) {
            return await this.getDesktopTrackState();
        } else if (await this.isSpotifyWebRunning()) {
            return await this.getSpotifyWebCurrentTrack();
        }
        return null;
    }

    private async isWindowsSpotifyRunning(): Promise<boolean> {
        /**
         * /tasklist /fi "imagename eq Spotify.exe" /fo list /v |find " - "
         * Window Title: Dexys Midnight Runners - Come On Eileen
         */
        return new Promise((resolve, reject) => {
            wrapExecPromise(
                MusicStateManager.WINDOWS_SPOTIFY_TRACK_FIND,
                null
            ).then(result => {
                if (result && result.toLowerCase().includes("title")) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
    }

    private async isSpotifyDesktopRunning() {
        let isRunning = false;
        if (isMac()) {
            isRunning = await music.isRunning("Spotify");
        } else if (isWindows()) {
            isRunning = await this.isWindowsSpotifyRunning();
        }
        // currently do not support linux desktop for spotify
        return isRunning;
    }

    private async isItunesDesktopRunning() {
        let isRunning = false;
        if (isMac()) {
            isRunning = await music.isRunning("iTunes");
        }
        // currently do not supoport windows or linux desktop for itunes
        return isRunning;
    }

    private async isSpotifyWebRunning(): Promise<boolean> {
        let accessToken = getItem("spotify_access_token");
        if (accessToken) {
            this._spotifyDevices = await this.spotifyWebUsersDevices();
            if (this._spotifyDevices.length > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * returns...
     * {
        "devices" : [ {
            "id" : "5fbb3ba6aa454b5534c4ba43a8c7e8e45a63ad0e",
            "is_active" : false,
            "is_private_session": true,
            "is_restricted" : false,
            "name" : "My fridge",
            "type" : "Computer",
            "volume_percent" : 100
        } ]
        }
     */
    private async spotifyWebUsersDevices() {
        let devices: PlayerDevice[] = [];
        const accessToken = getItem("spotify_access_token");

        let api = "/v1/me/player/devices";
        let response = await spotifyApiGet(api, accessToken);
        // check if the token needs to be refreshed
        response = await checkSpotifyApiResponse(response, api);
        if (response && response.data && response.data.devices) {
            devices = response.data.devices;
        }
        return devices;
    }

    private async getDesktopTrackState(): Promise<TrackState> {
        let trackState: TrackState = null;
        let playingTrack: Track = null;
        let pausedTrack: Track = null;
        let pausedType: TrackType = null;
        if (isMac()) {
            const spotifyRunning = await music.isRunning("Spotify");
            // spotify first
            if (spotifyRunning) {
                playingTrack = await music.getState("Spotify");
                if (playingTrack) {
                    playingTrack.type = "spotify";
                }
                if (playingTrack && playingTrack.state === "playing") {
                    trackState = {
                        type: TrackType.MacSpotifyDesktop,
                        track: playingTrack
                    };
                } else if (playingTrack) {
                    // save this one if itunes isn't running
                    pausedTrack = playingTrack;
                    pausedType = TrackType.MacSpotifyDesktop;
                }
            }

            // next itunes
            const itunesRunning = await music.isRunning("iTunes");
            if (itunesRunning) {
                playingTrack = await music.getState("iTunes");
                if (playingTrack) {
                    playingTrack.type = "itunes";
                }
                if (playingTrack && playingTrack.state === "playing") {
                    trackState = {
                        type: TrackType.MacItunesDesktop,
                        track: playingTrack
                    };
                } else if (!pausedTrack && playingTrack) {
                    pausedTrack = playingTrack;
                    pausedType = TrackType.MacItunesDesktop;
                }
            }

            if (pausedTrack) {
                trackState = { type: pausedType, track: pausedTrack };
            }
        } else if (isWindows()) {
            // supports only spotify for now
            const winSpotifyRunning = await this.isWindowsSpotifyRunning();
            if (winSpotifyRunning) {
                playingTrack = await this.getWindowsSpotifyTrackInfo();
                if (playingTrack) {
                    playingTrack.type = "spotify";
                    trackState = {
                        type: TrackType.MacSpotifyDesktop,
                        track: playingTrack
                    };
                }
            }
        }

        // make sure it's not an advertisement
        if (trackState && !isEmptyObj(trackState.track)) {
            // "artist":"","album":"","id":"spotify:ad:000000012c603a6600000020316a17a1"
            if (
                trackState.type === TrackType.MacSpotifyDesktop &&
                trackState.track.id.includes("spotify:ad:")
            ) {
                // it's a spotify ad
                trackState = null;
            } else if (!trackState.track.artist && !trackState.track.album) {
                // not enough info to send
                trackState = null;
            }
        }

        // include common attributes
        if (trackState && !isEmptyObj(trackState.track)) {
            // create the attributes
            trackState.track["duration_ms"] = trackState.track.duration;
        }

        return trackState;
    }

    /**
     * returns i.e.
     * track = {
            artist: 'Bob Dylan',
            album: 'Highway 61 Revisited',
            disc_number: 1,
            duration: 370,
            played count: 0,
            track_number: 1,
            starred: false,
            popularity: 71,
            id: 'spotify:track:3AhXZa8sUQht0UEdBJgpGc',
            name: 'Like A Rolling Stone',
            album_artist: 'Bob Dylan',
            artwork_url: 'http://images.spotify.com/image/e3d720410b4a0770c1fc84bc8eb0f0b76758a358',
            spotify_url: 'spotify:track:3AhXZa8sUQht0UEdBJgpGc' }
        }
    */
    private async getWindowsSpotifyTrackInfo() {
        let windowTitleStr = "Window Title:";
        // get the artist - song name from the command result, then get the rest of the info from spotify
        let songInfo = await wrapExecPromise(
            MusicStateManager.WINDOWS_SPOTIFY_TRACK_FIND,
            null
        );
        if (!songInfo || !songInfo.includes(windowTitleStr)) {
            // it must have paused, or an ad, or it was closed
            return null;
        }
        // fetch it from spotify
        // result will be something like: "Window Title: Dexys Midnight Runners - Come On Eileen"
        songInfo = songInfo.substring(windowTitleStr.length);
        let artistSong = songInfo.split("-");
        let artist = artistSong[0].trim();
        let song = artistSong[1].trim();
        let resp = await softwareGet(
            `/music/track?artist=${artist}&name=${song}`,
            getItem("jwt")
        );
        let trackInfo = null;
        if (isResponseOk(resp) && resp.data && resp.data.id) {
            trackInfo = resp.data;
            // set the other attributes like start and type
            trackInfo["type"] = "spotify";
            trackInfo["state"] = "playing";
            trackInfo["start"] = 0;
            trackInfo["end"] = 0;
            trackInfo["genre"] = "";
        }

        return trackInfo;
    }

    async getSpotifyWebCurrentTrack(): Promise<TrackState> {
        let accessToken = getItem("spotify_access_token");
        if (accessToken) {
            let api = "/v1/me/player/currently-playing";
            let response = await spotifyApiGet(api, accessToken);
            // check if the token needs to be refreshed
            response = await checkSpotifyApiResponse(response, api);
            if (response && response.data && response.data.item) {
                let track: Track = response.data.item;
                // override "type" with "spotify"
                track.type = "spotify";
                if (track.duration_ms) {
                    track.duration = track.duration_ms;
                }
                extractAristFromSpotifyTrack(track);

                let trackState: TrackState = {
                    type: TrackType.WebSpotify,
                    track
                };
                return trackState;
            }
        }
        return null;
    }

    public async getSpotifyWebPlayerState(): Promise<PlayerContext> {
        let accessToken = getItem("spotify_access_token");
        if (accessToken) {
            let api = "/v1/me/player";
            let response = await spotifyApiGet(api, accessToken);
            // check if the token needs to be refreshed
            response = await checkSpotifyApiResponse(response, api);
            if (response && response.data && response.data.item) {
                // override "type" with "spotify"
                response.data.item["type"] = "spotify";
                extractAristFromSpotifyTrack(response.data.item);
                return response.data;
            }
        }
        return null;
    }
}
