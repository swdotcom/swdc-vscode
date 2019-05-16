import { getItem, isEmptyObj, isMusicTime } from "../Util";
import { sendMusicData } from "../DataController";
import {
    softwareGet,
    isResponseOk,
    spotifyApiPut,
    spotifyApiPost
} from "../HttpClient";
import { Track } from "./MusicStoreManager";
import {
    MusicPlayerManager,
    TrackState,
    TrackType
} from "./MusicPlayerManager";

export class MusicStateManager {
    static readonly WINDOWS_SPOTIFY_TRACK_FIND: string =
        'tasklist /fi "imagename eq Spotify.exe" /fo list /v | find " - "';

    private static instance: MusicStateManager;

    private existingTrack: any = {};
    private lastTimeSent: number = null;
    private gatheringMusic: boolean = false;
    private serverTrack: any = null;
    private currentTrack: Track = null;

    private mpMgr: MusicPlayerManager = MusicPlayerManager.getInstance();

    private constructor() {
        // private to prevent non-singleton usage
    }

    static getInstance() {
        if (!MusicStateManager.instance) {
            MusicStateManager.instance = new MusicStateManager();
        }
        return MusicStateManager.instance;
    }

    public clearServerTrack() {
        this.serverTrack = null;
    }

    public getCurrentTrack(): Track {
        return this.currentTrack;
    }

    public async getServerTrack(track: Track) {
        if (track) {
            let trackId = track.id;
            if (trackId.indexOf(":") !== -1) {
                // strip it down to just the last id part
                trackId = trackId.substring(trackId.lastIndexOf(":") + 1);
            }
            const type = track.type;
            // use the name and artist as well since we have it
            let trackName = track.name;
            let trackArtist = track.artist;

            // check if it's cached before hitting the server
            if (this.serverTrack) {
                if (this.serverTrack.trackId === track.id) {
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

    public async updateLovedStateFromServer(trackState: TrackState) {
        if (!isMusicTime()) {
            return;
        }
        if (
            !trackState ||
            !trackState.track ||
            isEmptyObj(trackState.track) ||
            trackState.type === TrackType.MacItunesDesktop
        ) {
            return;
        }

        const serverTrack = await this.getServerTrack(trackState.track);
        if (serverTrack) {
            const liked = serverTrack.liked || 0;
            if (liked === 1) {
                trackState.track["loved"] = true;
            } else {
                trackState.track["loved"] = false;
            }
        }
    }

    public async gatherMusicInfo() {
        if (this.gatheringMusic) {
            return;
        }
        this.gatheringMusic = true;
        const playingState: TrackState = await this.mpMgr.getCurrentlyRunningTrackState();

        if (playingState) {
            const playingTrack: Track = playingState.track;

            playingTrack["start"] = 0;
            playingTrack["end"] = 0;

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
            let playingTrackDuration: number = null;
            if (playingTrack.duration && playingTrack.duration > 0) {
                playingTrackDuration = playingTrack.duration;
            } else if (
                playingTrack.duration_ms &&
                playingTrack.duration_ms > 0
            ) {
                playingTrackDuration = playingTrack.duration_ms;
            }

            if (!playingTrackId && existingTrackId) {
                // we don't have a track playing and we have an existing one, close it out
                this.existingTrack["end"] = nowInSec;

                // send the existing to close it out
                sendMusicData(this.existingTrack).then(result => {
                    // clear out the trackInfo
                    this.existingTrack = {};
                    this.lastTimeSent = null;
                });
            } else if (playingTrackId && !existingTrackId) {
                // first check if it needs to be synced in regard to the loved state
                await this.updateLovedStateFromServer(playingState);

                // this means we don't have an existing track, the playing track will be our new existing track
                // it doesn't matter if it's paused or not since we don't have an existing track
                this.existingTrack = {};
                this.existingTrack = { ...playingTrack };
                this.existingTrack["start"] = nowInSec;
                this.existingTrack["local_start"] = localNowInSec;

                // send the existing (which is the initial one for this session)
                sendMusicData(this.existingTrack);
                this.lastTimeSent = nowInSec;
            } else if (playingTrackId && existingTrackId) {
                // we have a playing track and an existing track, are they the same ones?
                if (playingTrackId !== existingTrackId) {
                    // send the existing song now to close it out
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
                        // close it out
                        sendMusicData(this.existingTrack).then(async result => {
                            // first check if it needs to be synced in regard to the loved state
                            await this.updateLovedStateFromServer(playingState);

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

    public async spotifyWebPlay() {
        const accessToken = getItem("spotify_access_token");
        // const payload = { uri: e.selection[0].uri };
        // i.e. { device_id: "92301de52072a44031e6823cfdd25bc05ed1e84e" }
        spotifyApiPut("/v1/me/player/play", {}, accessToken);
    }

    public async spotifyWebPause() {
        const accessToken = getItem("spotify_access_token");
        // const payload = { uri: e.selection[0].uri };
        spotifyApiPut("/v1/me/player/pause", {}, accessToken);
    }

    public async spotifyWebPrevious() {
        const accessToken = getItem("spotify_access_token");
        spotifyApiPost("/v1/me/player/previous", {}, accessToken);
    }

    public async spotifyWebNext() {
        const accessToken = getItem("spotify_access_token");
        spotifyApiPost("/v1/me/player/next", {}, accessToken);
    }
}
