import { env, commands } from "vscode";
import {
    getMusicSessionDataStoreFile,
    deleteFile,
    logIt,
    nowInSecs,
    getOffsetSecends,
    getOs,
    getVersion,
    getPluginId
} from "../Util";
import { sendMusicData } from "../DataController";
import {
    Track,
    getRunningTrack,
    TrackStatus,
    PlayerType,
    isRunning,
    PlayerName
} from "cody-music";
import { MusicManager } from "./MusicManager";
const fs = require("fs");

export class MusicStateManager {
    static readonly WINDOWS_SPOTIFY_TRACK_FIND: string =
        'tasklist /fi "imagename eq Spotify.exe" /fo list /v | find " - "';

    private static instance: MusicStateManager;

    private existingTrack: any = {};
    private processingSong: boolean = false;

    private musicMgr: MusicManager;

    private constructor() {
        // private to prevent non-singleton usage
        if (!this.musicMgr) {
            this.musicMgr = MusicManager.getInstance();
        }
    }

    static getInstance() {
        if (!MusicStateManager.instance) {
            MusicStateManager.instance = new MusicStateManager();
        }
        return MusicStateManager.instance;
    }

    public async musicStateCheck() {
        const track: Track = await this.gatherMusicInfo();
        this.musicMgr.runningTrack = track;
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
        const stopped = playingTrackState === "stopped";
        const paused = playingTrackState === TrackStatus.Paused;
        const isNewTrack = existingTrackId !== playingTrackId;
        const trackStateChanged = existingTrackState !== playingTrackState;
        const playing = playingTrackState === TrackStatus.Playing;

        const isValidTrack = playingTrack.id ? true : false;

        // to determine if we should end the previous track, the
        // existing track should be existing and playing
        let endPrevTrack = false;
        if (existingTrackId && existingTrackId !== playingTrackId) {
            endPrevTrack = true;
        } else if (
            existingTrackId === playingTrackId &&
            existingTrackState === TrackStatus.Playing &&
            playingTrackState !== TrackStatus.Playing
        ) {
            endPrevTrack = true;
        }

        let playerName = this.musicMgr.currentPlayerName;
        let playerNameChanged = false;
        // only update the currentPlayerName if the current track running
        // is "playing" AND the playerType doesn't match the current player type

        if (playing) {
            if (
                playerName === PlayerName.SpotifyWeb &&
                playingTrack.playerType === PlayerType.MacItunesDesktop
            ) {
                this.musicMgr.currentPlayerName = PlayerName.ItunesDesktop;
                playerNameChanged = true;
            } else if (
                playerName === PlayerName.ItunesDesktop &&
                playingTrack.playerType === PlayerType.WebSpotify
            ) {
                this.musicMgr.currentPlayerName = PlayerName.SpotifyWeb;
                playerNameChanged = true;
            }
        }

        return {
            isNewTrack,
            endPrevTrack,
            trackStateChanged,
            playing,
            paused,
            stopped,
            isValidTrack,
            playerNameChanged
        };
    }

    private getChangeStatusStringResult(changeStatus) {
        return `{isNewTrack: ${changeStatus.isNewTrack}, endPrevTrack: ${
            changeStatus.endPrevTrack
        },
                trackStateChanged: ${
                    changeStatus.trackStateChanged
                }, playing: ${changeStatus.playing},
                paused: ${changeStatus.paused}, stopped: ${
            changeStatus.stopped
        }, isValidTrack: ${changeStatus.isValidTrack}`;
    }

    public buildBootstrapSongSession() {
        const now = nowInSecs();
        let d = new Date();
        // offset is the minutes from GMT. it's positive if it's before, and negative after
        const offset = d.getTimezoneOffset();
        const offset_sec = offset * 60;
        // send the music time bootstrap payload
        let track: Track = new Track();
        track.id = "music-time-init";
        track.name = "music-time-init";
        track.artist = "music-time-init";
        track.type = "init";
        track["start"] = now;
        track["local_start"] = now - offset_sec;
        track["end"] = now + 1;
        track = {
            ...track,
            ...this.getMusicCodingData()
        };

        sendMusicData(track);
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
            // subtract a couple of seconds since our timer is every 5 seconds
            this.existingTrack["end"] = now - 2;
            this.existingTrack["coding"] = false;
            // set the spotify playlistId
            if (
                this.existingTrack.playerType === PlayerType.WebSpotify &&
                this.musicMgr.selectedPlaylist &&
                this.musicMgr.selectedPlaylist.id
            ) {
                this.existingTrack[
                    "playlistId"
                ] = this.musicMgr.selectedPlaylist.id;
            }
            // gather the coding metrics
            this.existingTrack = {
                ...this.existingTrack,
                ...this.getMusicCodingData()
            };

            if (parseInt(this.existingTrack.keystrokes, 10) > 0) {
                this.existingTrack["coding"] = true;
            }

            // update the loved state
            if (this.musicMgr.serverTrack) {
                this.existingTrack.loved = this.musicMgr.serverTrack.loved;
            }

            // send off the ended song session
            await sendMusicData(this.existingTrack);

            // set existing track to playing track
            if (changeStatus.paused) {
                this.existingTrack = { ...playingTrack };
            } else {
                this.existingTrack = {};
            }
        }

        // do we have a new song
        if (
            changeStatus.isNewTrack &&
            changeStatus.playing &&
            changeStatus.isValidTrack
        ) {
            this.musicMgr.getServerTrack(playingTrack);

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

        const needsRefresh =
            changeStatus.isNewTrack || changeStatus.trackStateChanged;

        if (changeStatus.playerNameChanged) {
            // refresh the entire tree view
            commands.executeCommand("musictime.refreshPlaylist");
        } else if (needsRefresh) {
            MusicManager.getInstance().refreshPlaylists();
        }

        this.processingSong = false;
        return this.existingTrack || new Track();
    }

    private codingDataReducer(accumulator, current) {
        const version = `${env.appName}_${getVersion()}`;
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
        const keystrokeList: string[] = [
            "add",
            "paste",
            "delete",
            "linesRemoved",
            "linesAdded"
        ];
        if (current && accumulator) {
            const currObjectKeys = Object.keys(current);

            const sourceJson = current.source;
            const keys = Object.keys(sourceJson);
            if (keys && keys.length > 0) {
                for (let i = 0; i < keys.length; i++) {
                    const file = keys[i];
                    accumulator.source[file] = sourceJson[file];
                }
            }

            const keystrokes = parseInt(current.keystrokes, 10) || 0;
            accumulator.keystrokes += keystrokes;
            if (!accumulator.syntax) {
                accumulator.syntax = current.syntax || "";
            }

            // set the other top level attributes
            accumulator["timezone"] = current.timezone;
            accumulator["os"] = current.os;
            accumulator["version"] = current.version;
            accumulator["pluginId"] = current.pluginId;
            // set the: start, local_start, end, local_end, offset
            accumulator["start"] = current.start;
            accumulator["local_start"] = current.local_start;
            accumulator["end"] = current.end;
            accumulator["local_end"] = current.local_end;
            // set the minutes offset
            accumulator["offset"] = getOffsetSecends() / 60;

            if (currObjectKeys && currObjectKeys.length > 0) {
                for (let i = 0; i < currObjectKeys.length; i++) {
                    let currObjectKey = currObjectKeys[i];

                    const sourceObj = current[currObjectKey];

                    const sourceObjKeys = Object.keys(sourceObj);
                    if (sourceObjKeys && sourceObjKeys.length > 0) {
                        for (let x = 0; x < sourceObjKeys.length; x++) {
                            const sourceKey = sourceObjKeys[x];
                            const fileObj = sourceObj[sourceKey];
                            if (!fileObj.timezone) {
                                fileObj[
                                    "timezone"
                                ] = Intl.DateTimeFormat().resolvedOptions().timeZone;
                            }
                            if (!fileObj.offset) {
                                fileObj["offset"] = getOffsetSecends() / 60;
                            }
                            if (!fileObj.pluginId) {
                                fileObj["pluginId"] = getPluginId();
                            }
                            if (!fileObj.os) {
                                fileObj["os"] = getOs();
                            }
                            if (!fileObj.version) {
                                fileObj["version"] = version;
                            }
                            let keystrokesTotal = 0;
                            let foundfile = false;

                            const fileObjKeys = Object.keys(fileObj);
                            if (fileObjKeys && fileObjKeys.length > 0) {
                                for (let y = 0; y < fileObjKeys.length; y++) {
                                    const fileKey = fileObjKeys[y];
                                    const val = fileObj[fileKey];
                                    if (numberList.indexOf(fileKey) !== -1) {
                                        foundfile = true;
                                        const intVal = parseInt(val, 10);
                                        if (accumulator[fileKey] && val) {
                                            // aggregate
                                            accumulator[fileKey] =
                                                intVal +
                                                parseInt(
                                                    accumulator[fileKey],
                                                    10
                                                );
                                        } else if (val) {
                                            // doesn't exist yet, just set it
                                            accumulator[fileKey] = intVal;
                                        }
                                        // aggregate keystrokes
                                        if (
                                            keystrokeList.indexOf(fileKey) !==
                                            -1
                                        ) {
                                            keystrokesTotal += intVal;
                                        }
                                    }
                                }
                            }

                            if (foundfile) {
                                // set the keystrokes for this file object
                                accumulator.source[sourceKey][
                                    "keystrokes"
                                ] = keystrokesTotal;
                            }
                        }
                    }
                }
            }
        }
        return accumulator;
    }

    public getMusicCodingData() {
        const file = getMusicSessionDataStoreFile();
        const version = `${env.appName}_${getVersion()}`;
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
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            offset: getOffsetSecends() / 60,
            pluginId: getPluginId(),
            os: getOs(),
            version,
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
                    console.log("music coding data: ", musicCodingData);
                    return musicCodingData;
                }
            } else {
            }
        } catch (e) {
            logIt(`Unable to aggregate music session data: ${e.message}`);
        }
        console.log("initial value: ", initialValue);
        return initialValue;
    }
}
