import {
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
import { Track, PlayerType, getRunningTrack, TrackStatus } from "cody-music";
const fs = require("fs");

export class MusicStateManager {
    static readonly WINDOWS_SPOTIFY_TRACK_FIND: string =
        'tasklist /fi "imagename eq Spotify.exe" /fo list /v | find " - "';

    private static instance: MusicStateManager;

    private existingTrack: any = {};
    private currentPlayerType: PlayerType = null;
    private processingSong: boolean = false;

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

    public async musicStateCheck() {
        const currTrack = this.musicstoreMgr.runningTrack;
        const track: Track = await this.gatherMusicInfo();
        this.musicstoreMgr.runningTrack = track;
        if (isMusicTime()) {
            // valid track shows that we're able to communicate to spotify web or local
            const isValidTrack = !isEmptyObj(track);

            // was there a previous track?
            const isValidCurrTrack = currTrack ? !isEmptyObj(currTrack) : false;
            if (isValidTrack) {
                // update the buttons to show player control changes
                MusicCommandManager.updateButtons();
            } else if (isValidCurrTrack) {
                // refresh
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
            ? this.existingTrack.state || TrackStatus.NotAssigned
            : TrackStatus.NotAssigned;
        const playingTrackState = playingTrack.state || "stopped";

        // return obj attributes
        const isNewTrack = existingTrackId !== playingTrackId;
        const endPrevTrack = existingTrackId !== null && isNewTrack;
        const trackStateChanged = existingTrackState !== playingTrackState;
        const playing = playingTrackState === TrackStatus.Playing;
        const paused = playingTrackState === TrackStatus.Paused;
        const isValidTrack = playingTrack.id ? true : false;

        return {
            isNewTrack,
            endPrevTrack,
            trackStateChanged,
            playing,
            paused,
            isValidTrack
        };
    }

    public async gatherMusicInfo(): Promise<any> {
        if (this.processingSong) {
            return this.existingTrack || new Track();
        }

        this.processingSong = true;
        let playingTrack = await getRunningTrack();

        const changeStatus = this.getChangeStatus(playingTrack);

        const now = nowInSecs();

        // has the existing track ended?
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

            // set existing track to playing track
            this.existingTrack = {};
        }

        // do we have a new song
        if (changeStatus.isNewTrack && changeStatus.isValidTrack) {
            this.musicstoreMgr.getServerTrack(playingTrack);

            let d = new Date();
            // offset is the minutes from GMT. it's positive if it's before, and negative after
            const offset = d.getTimezoneOffset();
            const offset_sec = offset * 60;

            playingTrack["start"] = now;
            playingTrack["local_start"] = now - offset_sec;
            playingTrack["end"] = 0;

            this.existingTrack = { ...playingTrack };
        }

        if (changeStatus.trackStateChanged) {
            // update the state so the requester gets this value
            this.existingTrack.state = playingTrack.state;
        }

        // this updates the buttons in the status bar and the playlist buttons
        if (changeStatus.isNewTrack || changeStatus.trackStateChanged) {
            await this.musicstoreMgr.refreshPlaylists();
        }

        this.processingSong = false;
        return this.existingTrack || new Track();
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
