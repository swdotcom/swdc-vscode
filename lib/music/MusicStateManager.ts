import * as music from "cody-music";
import {
    wrapExecPromise,
    isWindows,
    isMac,
    getItem,
    isEmptyObj,
    isMusicTime
} from "../Util";
import { sendMusicData } from "../DataController";
import { softwareGet, isResponseOk } from "../HttpClient";

export interface TrackState {
    /**
     * type of the player
     */
    type: string;
    /**
     * The track data
     */
    track: any;
}

export class MusicStateManagerSingleton {
    private static WINDOWS_SPOTIFY_TRACK_FIND: string =
        'tasklist /fi "imagename eq Spotify.exe" /fo list /v | find " - "';

    private static existingTrack: any = {};
    private static lastTimeSent: number = null;
    private static gatheringMusic: boolean = false;
    private static serverTrack: any = null;

    private constructor() {
        // private to prevent non-singleton usage
    }

    public static clearServerTrack() {
        this.serverTrack = null;
    }

    public static async getServerTrack(trackState) {
        if (trackState && trackState.track) {
            let trackId = trackState.track.id;
            if (trackId.indexOf(":") !== -1) {
                // strip it down to just the last id part
                trackId = trackId.substring(trackId.lastIndexOf(":") + 1);
            }
            const type = trackState.type;
            // use the name and artist as well since we have it
            let trackName = trackState.track.name;
            let trackArtist = trackState.track.artist;

            // check if it's cached before hitting the server
            if (this.serverTrack) {
                if (this.serverTrack.trackId === trackState.track.id) {
                    return this.serverTrack;
                } else if (
                    this.serverTrack.name === trackName &&
                    this.serverTrack.artist === trackArtist
                ) {
                    return this.serverTrack;
                }
                // it doesn't match, might as well nullify it
                this.serverTrack = null;
            }

            if (!this.serverTrack) {
                const api = `/music/track/${trackId}/type/${type}?name=${trackName}&artist=${trackArtist}`;
                const resp = await softwareGet(api, getItem("jwt"));
                if (isResponseOk(resp)) {
                    this.serverTrack = { ...resp.data };
                }
            }
        }
        return this.serverTrack;
    }

    public static async getState(): Promise<TrackState> {
        let trackState: TrackState = null;
        let playingTrack: any = null;
        let pausedTrack: any = null;
        let pausedType: string = null;
        if (isMac()) {
            const spotifyRunning = await music.isRunning("Spotify");
            // spotify first
            if (spotifyRunning) {
                playingTrack = await music.getState("Spotify");
                if (playingTrack && playingTrack.state === "playing") {
                    trackState = { type: "spotify", track: playingTrack };
                } else if (playingTrack) {
                    // save this one if itunes isn't running
                    pausedTrack = playingTrack;
                    pausedType = "spotify";
                }
            }

            // next itunes
            const itunesRunning = await music.isRunning("iTunes");
            if (itunesRunning) {
                playingTrack = await music.getState("iTunes");
                if (playingTrack && playingTrack.state === "playing") {
                    trackState = { type: "itunes", track: playingTrack };
                } else if (!pausedTrack && playingTrack) {
                    pausedTrack = playingTrack;
                    pausedType = "itunes";
                }
            }

            if (pausedTrack) {
                trackState = { type: pausedType, track: pausedTrack };
            }
        } else if (isWindows()) {
            // supports only spotify for now
            const winSpotifyRunning = await MusicStateManagerSingleton.isWindowsSpotifyRunning();
            if (winSpotifyRunning) {
                playingTrack = await MusicStateManagerSingleton.getWindowsSpotifyTrackInfo();
                if (playingTrack) {
                    trackState = { type: "spotify", track: playingTrack };
                }
            }
        }

        // make sure it's not an advertisement
        if (trackState && !isEmptyObj(trackState.track)) {
            // "artist":"","album":"","id":"spotify:ad:000000012c603a6600000020316a17a1"
            if (
                trackState.type === "spotify" &&
                trackState.track.id.includes("spotify:ad:")
            ) {
                // it's a spotify ad
                trackState = null;
            } else if (!trackState.track.artist && !trackState.track.album) {
                // not enough info to send
                trackState = null;
            }
        }

        // get the matching server track if this is the music time plugin
        if (
            isMusicTime() &&
            trackState &&
            trackState.type === "spotify" &&
            !isEmptyObj(trackState.track)
        ) {
            // if it's spotify, get it from the server as well
            const serverTrack = await this.getServerTrack(trackState);
            if (serverTrack) {
                const liked = serverTrack.liked || 0;
                if (liked === 1) {
                    trackState.track["loved"] = true;
                } else {
                    trackState.track["loved"] = false;
                }
            }
        }

        return trackState;
    }

    public static async gatherMusicInfo() {
        if (this.gatheringMusic) {
            return;
        }
        this.gatheringMusic = true;
        const playingState: TrackState = await MusicStateManagerSingleton.getState();

        if (playingState) {
            const playingTrack = playingState.track;
            const type = playingState.type;

            playingTrack["start"] = 0;
            playingTrack["end"] = 0;
            playingTrack["type"] = type;

            let d = new Date();
            // offset is the minutes from GMT. it's positive if it's before, and negative after
            const offset = d.getTimezoneOffset();
            const offset_sec = offset * 60;
            let nowInSec: number = Math.round(d.getTime() / 1000);
            // subtract the offset_sec (it'll be positive before utc and negative after utc)
            let localNowInSec = nowInSec - offset_sec;
            let state = "stopped";
            let playingTrackId = playingTrack["id"] || null;
            if (
                playingTrack["state"] !== undefined &&
                playingTrack["state"] !== null
            ) {
                state = playingTrack["state"];
            }

            let isPaused =
                state.toLowerCase().indexOf("playing") !== -1 ? false : true;

            let existingTrackId = this.existingTrack["id"] || null;
            let playingTrackDuration = playingTrackId
                ? parseInt(playingTrack["duration"], 10)
                : null;

            if (!playingTrackId && existingTrackId) {
                // we don't have a track playing and we have an existing one, close it out
                this.existingTrack["end"] = nowInSec;
                sendMusicData(this.existingTrack).then(result => {
                    // clear out the trackInfo
                    this.existingTrack = {};
                    this.lastTimeSent = null;
                });
            } else if (playingTrackId && !existingTrackId) {
                // this means we don't have an existing track, the playing track will be our new existing track
                // it doesn't matter if it's paused or not since we don't have an existing track
                this.existingTrack = {};
                this.existingTrack = { ...playingTrack };
                this.existingTrack["start"] = nowInSec;
                this.existingTrack["local_start"] = localNowInSec;
                sendMusicData(this.existingTrack);
                this.lastTimeSent = nowInSec;
            } else if (playingTrackId && existingTrackId) {
                // we have a playing track and an existing track, are they the same ones?
                if (playingTrackId !== existingTrackId) {
                    // send the existing song now
                    this.existingTrack["end"] = nowInSec - 1;
                    sendMusicData(this.existingTrack).then(result => {
                        // clear out the trackInfo
                        this.existingTrack = {};
                        // start the new song
                        this.existingTrack = { ...playingTrack };
                        this.existingTrack["start"] = nowInSec;
                        this.existingTrack["local_start"] = localNowInSec;
                        sendMusicData(this.existingTrack);
                        this.lastTimeSent = nowInSec;
                    });
                } else {
                    // it's the same trackId, but we may need to send it again
                    // if the song is on repeat. the only way to find out is to check
                    // if it's not paused and the last time we sent this is longer than
                    // the duration.
                    // check if it's not paused and is beyond the track duration
                    let diffInSec: number = this.lastTimeSent
                        ? nowInSec - this.lastTimeSent
                        : 0;
                    if (
                        !isPaused &&
                        playingTrackDuration &&
                        this.lastTimeSent &&
                        diffInSec > playingTrackDuration
                    ) {
                        // it's on repeat, send it and start the next one
                        this.existingTrack["end"] = nowInSec - 1;
                        sendMusicData(this.existingTrack).then(result => {
                            // clear out the trackInfo
                            this.existingTrack = {};
                            // start the new song
                            this.existingTrack = { ...playingTrack };
                            this.existingTrack["start"] = nowInSec;
                            this.existingTrack["local_start"] = localNowInSec;
                            sendMusicData(this.existingTrack);
                            this.lastTimeSent = nowInSec;
                        });
                    }
                }
            }
        }

        this.gatheringMusic = false;
    }

    public static async isWindowsSpotifyRunning(): Promise<boolean> {
        /**
             * tasklist /fi "imagename eq Spotify.exe" /fo list /v |find " - "
                Window Title: Dexys Midnight Runners - Come On Eileen
            */
        return new Promise((resolve, reject) => {
            wrapExecPromise(
                MusicStateManagerSingleton.WINDOWS_SPOTIFY_TRACK_FIND,
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
    private static async getWindowsSpotifyTrackInfo() {
        let windowTitleStr = "Window Title:";
        // get the artist - song name from the command result, then get the rest of the info from spotify
        let songInfo = await wrapExecPromise(
            MusicStateManagerSingleton.WINDOWS_SPOTIFY_TRACK_FIND,
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
}
