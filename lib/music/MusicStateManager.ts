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
import { SOFTWARE_TOP_SONGS_PLID } from "../Constants";
const fs = require("fs");

export class MusicStateManager {
    static readonly WINDOWS_SPOTIFY_TRACK_FIND: string =
        'tasklist /fi "imagename eq Spotify.exe" /fo list /v | find " - "';

    private static instance: MusicStateManager;

    private existingTrack: any = {};
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
            // valid track shows that we're able to communicate to spotify web or local
            const isValidTrack = !isEmptyObj(track);
            if (isValidTrack) {
                // update the buttons to show player control changes
                MusicCommandManager.updateButtons();

                const foundGlobalFavorites = this.musicstoreMgr.hasMusicTimePlaylistForType(
                    SOFTWARE_TOP_SONGS_PLID
                );
                const hasSpotifyAccess = this.musicstoreMgr.requiresSpotifyAccess();

                if (
                    this.currentPlayerType !== track.playerType ||
                    (!foundGlobalFavorites && hasSpotifyAccess)
                ) {
                    // add the global favorites since the user has spotify access
                    await this.musicstoreMgr.refreshPlaylists();
                }
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

        // this updates the buttons in the status bar and the playlist buttons
        if (changeStatus.isNewTrack || changeStatus.trackStateChanged) {
            MusicCommandManager.syncControls();
        }

        return this.existingTrack;
    }

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
