import {
    getItem,
    isEmptyObj,
    isMusicTime,
    getMusicSessionDataStoreFile,
    deleteFile,
    logIt,
    nowInSecs
} from "../Util";
import { sendMusicData } from "../DataController";
import { MusicStoreManager } from "./MusicStoreManager";
import { MusicCommandManager } from "./MusicCommandManager";
import { softwareGet, isResponseOk } from "../HttpClient";
import { Track, PlayerType, getRunningTrack, TrackStatus } from "cody-music";
const fs = require("fs");

export class MusicStateManager {
    static readonly WINDOWS_SPOTIFY_TRACK_FIND: string =
        'tasklist /fi "imagename eq Spotify.exe" /fo list /v | find " - "';

    private static instance: MusicStateManager;

    private existingTrack: any = {};
    private lastTimeSent: number = null;
    private serverTrack: any = null;
    private currentPlayerType: PlayerType = null;

    private musicstoreMgr: MusicStoreManager;

    private constructor() {
        // private to prevent non-singleton usage
        if (!this.musicstoreMgr) {
            this.musicstoreMgr = MusicStoreManager.getInstance();
        }
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

    public async getServerTrack(track: Track) {
        if (track) {
            let trackId = track.id;
            if (trackId.indexOf(":") !== -1) {
                // strip it down to just the last id part
                trackId = trackId.substring(trackId.lastIndexOf(":") + 1);
            }
            let type = "spotify";
            if (track.playerType === PlayerType.MacItunesDesktop) {
                type = "itunes";
            }
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

    public async updateLovedStateFromServer(track: Track) {
        if (!isMusicTime()) {
            return;
        }
        if (
            !track ||
            isEmptyObj(track) ||
            track.playerType === PlayerType.MacItunesDesktop
        ) {
            return;
        }

        const serverTrack = await this.getServerTrack(track);
        if (serverTrack) {
            const liked = serverTrack.liked || 0;
            if (liked === 1) {
                track["loved"] = true;
            } else {
                track["loved"] = false;
            }
        }
    }

    public async musicStateCheck() {
        const track: Track = (await this.gatherMusicInfo()) || new Track();
        this.musicstoreMgr.runningTrack = track;
        if (isMusicTime()) {
            // update the buttons to show player control changes
            MusicCommandManager.updateButtons();

            const foundGlobalFavorites = this.musicstoreMgr.hasMusicTimePlaylistForType(
                2
            );
            const hasSpotifyAccess = this.musicstoreMgr.hasSpotifyAccessToken();

            if (
                this.currentPlayerType !== track.playerType ||
                (!foundGlobalFavorites && hasSpotifyAccess)
            ) {
                // add the global favorites since the user has spotify access
                await this.musicstoreMgr.refreshPlaylists();
            }

            this.currentPlayerType = track.playerType;
        }
    }

    private getChangeStatus(playingTrack: Track): any {
        const existingTrackId = this.existingTrack
            ? this.existingTrack.id || null
            : null;
        const playingTrackId = playingTrack.id || null;
        const existingTrackState = this.existingTrack
            ? this.existingTrack.state || null
            : null;
        const playingTrackState = playingTrack.state || "stopped";

        // return obj attributes
        const isNewTrack = existingTrackId !== playingTrackId;
        const endPrevTrack = existingTrackId !== null && isNewTrack;
        const trackStateChanged = existingTrackState !== playingTrackState;
        const playing = playingTrackState === "playing";

        return {
            isNewTrack,
            endPrevTrack,
            trackStateChanged,
            playing
        };
    }

    public async gatherMusicInfo(): Promise<any> {
        let playingTrack = await getRunningTrack();

        const changeStatus = this.getChangeStatus(playingTrack);

        const now = nowInSecs();

        const isNewAndPlaying = changeStatus.isNewTrack && changeStatus.playing;

        if (changeStatus.endPrevTrack) {
            // subtract a few seconds since our timer is every 5 seconds
            this.existingTrack["end"] = now - 3;
            this.existingTrack["coding"] = false;
            // gather the coding metrics
            this.existingTrack = {
                ...this.existingTrack,
                ...this.getMusicCodingData()
            };

            if (parseInt(this.existingTrack.keystrokes, 10) > 0) {
                this.existingTrack["coding"] = true;
            }

            // send off the ended song session
            await sendMusicData(this.existingTrack);
            this.existingTrack = {};
        }

        if (isNewAndPlaying) {
            let d = new Date();
            // offset is the minutes from GMT. it's positive if it's before, and negative after
            const offset = d.getTimezoneOffset();
            const offset_sec = offset * 60;

            playingTrack["start"] = now;
            playingTrack["local_start"] = now - offset_sec;
            playingTrack["end"] = 0;

            // set existing track to playing track
            this.existingTrack = {};
            this.existingTrack = { ...playingTrack };
        }

        return this.existingTrack;
    }

    /**
     * 
    public async gatherMusicInfo_old(): Promise<any> {
        let playingTrack = await getRunningTrack();

        if (!playingTrack) {
            playingTrack = new Track();
        }

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

        let isPlaying = state.toLowerCase() === "playing" ? true : false;

        let existingTrackId = this.existingTrack["id"] || null;
        let playingTrackDuration: number = null;
        if (playingTrack.duration && playingTrack.duration > 0) {
            playingTrackDuration = playingTrack.duration;
        } else if (playingTrack.duration_ms && playingTrack.duration_ms > 0) {
            playingTrackDuration = playingTrack.duration_ms;
        }

        const trackChanged = this.getChangeStatus(playingTrack);

        // don't send this track if it's stopped and the exsting track doesn't exist
        if (state === "stopped" || state === TrackStatus.NotAssigned) {
            // set playingTrackId to null;
            playingTrackId = null;
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
            await this.updateLovedStateFromServer(playingTrack);

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
                    isPlaying &&
                    playingTrackDuration &&
                    this.lastTimeSent &&
                    diffInSec > playingTrackDuration
                ) {
                    // it's on repeat, send it and start the next one
                    this.existingTrack["end"] = nowInSec - 1;

                    // close it out
                    sendMusicData(this.existingTrack).then(async result => {
                        // first check if it needs to be synced in regard to the loved state
                        await this.updateLovedStateFromServer(playingTrack);

                        // clear out the trackInfo
                        this.existingTrack = {};
                        // start the new song
                        this.existingTrack = { ...playingTrack };
                        this.existingTrack["start"] = nowInSec;
                        this.existingTrack["local_start"] = localNowInSec;
                        sendMusicData(this.existingTrack);
                        this.lastTimeSent = nowInSec;
                    });
                } else if (this.existingTrack.state !== playingTrack.state) {
                    // track IDs are the same but it's not on repeat,
                    // just update the state so they're in sync
                    this.existingTrack.state = playingTrack.state;
                }
            }
        }

        if (trackChanged.trackStateChanged || trackChanged.isNewTrack) {
            MusicCommandManager.syncControls();
        }

        return playingTrack;
    }**/

    private codingDataReducer(accumulator, current) {
        const numberList: string[] = [
            "add",
            "paste",
            "delete",
            "netkeys",
            "linesRemoved",
            "linesAdded",
            "open",
            "close"
        ];
        if (current && accumulator) {
            const currObjectKeys = Object.keys(current);

            let sourceJson = current.source;
            Object.keys(sourceJson).forEach(file => {
                accumulator.source[file] = sourceJson[file];
            });

            const keystrokes = parseInt(current.keystrokes, 10) || 0;
            accumulator.keystrokes += keystrokes;
            if (!accumulator.syntax) {
                accumulator.syntax = current.syntax || "";
            }

            currObjectKeys.forEach(currObjectKey => {
                const sourceObj = current[currObjectKey];

                Object.keys(sourceObj).forEach(sourceKey => {
                    const fileObj = sourceObj[sourceKey];

                    Object.keys(fileObj).forEach(fileKey => {
                        const val = fileObj[fileKey];

                        if (numberList.indexOf(fileKey) !== -1) {
                            if (accumulator[fileKey] && val) {
                                accumulator[fileKey] =
                                    parseInt(val, 10) +
                                    parseInt(accumulator[fileKey], 10);
                            } else if (val) {
                                accumulator[fileKey] = parseInt(val, 10);
                            }
                        }
                    });
                });
            });
        }
        return accumulator;
    }

    private getMusicCodingData() {
        const file = getMusicSessionDataStoreFile();
        const initialValue = {
            add: 0,
            paste: 0,
            delete: 0,
            netkeys: 0,
            linesAdded: 0,
            linesRemoved: 0,
            open: 0,
            close: 0,
            keystrokes: 0,
            syntax: "",
            source: {}
        };
        try {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file).toString();
                // we're online so just delete the datastore file
                deleteFile(file);
                if (content) {
                    const payloads = content
                        .split(/\r?\n/)
                        .map(item => {
                            let obj = null;
                            if (item) {
                                try {
                                    obj = JSON.parse(item);
                                } catch (e) {
                                    //
                                }
                            }
                            if (obj) {
                                return obj;
                            }
                        })
                        .filter(item => item);

                    const musicCodingData = payloads.reduce(
                        this.codingDataReducer,
                        initialValue
                    );
                    return musicCodingData;
                }
            }
        } catch (e) {
            logIt(`Unable to aggregate music session data: ${e.message}`);
        }
        return initialValue;
    }
}
