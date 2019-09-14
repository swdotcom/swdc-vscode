import { commands } from "vscode";
import {
    getMusicSessionDataStoreFile,
    deleteFile,
    logIt,
    nowInSecs,
    getOffsetSecends,
    getOs,
    getVersion,
    getPluginId,
    isValidJson
} from "../Util";
import { sendMusicData } from "../DataController";
import {
    Track,
    getRunningTrack,
    TrackStatus,
    PlayerType,
    PlayerName,
    PlaylistItem,
    launchAndPlaySpotifyTrack
} from "cody-music";
import { MusicManager } from "./MusicManager";
import { KpmController } from "../KpmController";
import { SPOTIFY_LIKED_SONGS_PLAYLIST_NAME } from "../Constants";
const fs = require("fs");

export class MusicStateManager {
    static readonly WINDOWS_SPOTIFY_TRACK_FIND: string =
        'tasklist /fi "imagename eq Spotify.exe" /fo list /v | find " - "';

    private static instance: MusicStateManager;

    private existingTrack: any = {};
    private processingSong: boolean = false;
    private currentAlbumImage: any = null;

    private kpmControllerInstance: KpmController;

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

    public setKpmController(kpmController: KpmController) {
        this.kpmControllerInstance = kpmController;
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
        const tracksMatch = existingTrackId === playingTrackId;
        if (
            (!playingTrackId && existingTrackId) ||
            (!existingTrackId && playingTrackId) ||
            !tracksMatch
        ) {
            endPrevTrack = true;
        }

        let playerName = this.musicMgr.currentPlayerName;
        let playerNameChanged = false;
        // only update the currentPlayerName if the current track running
        // is "playing" AND the playerType doesn't match the current player type

        const isSpotifyPlayer =
            playerName === PlayerName.SpotifyDesktop ||
            playerName === PlayerName.SpotifyWeb
                ? true
                : false;

        if (playing) {
            if (
                isSpotifyPlayer &&
                playingTrack.playerType === PlayerType.MacItunesDesktop
            ) {
                this.musicMgr.currentPlayerName = PlayerName.ItunesDesktop;
                playerNameChanged = true;
            } else if (
                playerName === PlayerName.ItunesDesktop &&
                playingTrack.playerType !== PlayerType.MacItunesDesktop
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

        if (changeStatus.isNewTrack) {
            // set the current album image
            if (
                playingTrack &&
                playingTrack.album &&
                playingTrack.album.images &&
                playingTrack.album.images.length > 0
            ) {
                this.currentAlbumImage = playingTrack.album.images[0].url;
                // this.fillSidePanelWithAlbumImage(this.currentAlbumImage);
            }
        }

        const now = nowInSecs();

        // has the existing track ended?
        if (changeStatus.endPrevTrack && this.existingTrack.id) {
            let d = new Date();
            // offset is the minutes from GMT. it's positive if it's before, and negative after
            const offset = d.getTimezoneOffset();
            const offset_sec = offset * 60;

            // subtract a couple of seconds since our timer is every 5 seconds
            let end = now - 2;
            this.existingTrack["end"] = end;
            this.existingTrack["local_end"] = end - offset_sec;
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

            // if this track doesn't have album json data null it out
            if (this.existingTrack.album) {
                // check if it's a valid json
                if (!isValidJson(this.existingTrack.album)) {
                    // null these out. the backend will populate these
                    this.existingTrack.album = null;
                    this.existingTrack.artists = null;
                    this.existingTrack.features = null;
                }
            }

            // gather the coding metrics
            // but first end the kpm data collecting
            if (this.kpmControllerInstance) {
                await this.kpmControllerInstance.sendKeystrokeDataIntervalHandler(
                    false /*sendLazy*/
                );
            }

            // make sure duration_ms is set. it may not be defined
            // if it's coming from one of the players
            if (
                !this.existingTrack.duration_ms &&
                this.existingTrack.duration
            ) {
                this.existingTrack.duration_ms = this.existingTrack.duration;
            }

            let songSession = {
                ...this.existingTrack
            };
            setTimeout(async () => {
                songSession = {
                    ...songSession,
                    ...this.getMusicCodingData()
                };

                // send off the ended song session
                await sendMusicData(songSession);
            }, 500);

            // clear the track.
            this.existingTrack = {};
        }

        // do we have a new song or was it paused?
        // if it was paused we'll create a new start time anyway, so recreate.
        if (
            changeStatus.isNewTrack &&
            (changeStatus.playing || changeStatus.paused) &&
            changeStatus.isValidTrack
        ) {
            await this.musicMgr.getServerTrack(playingTrack);

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
            // new player (i.e. switched from itunes to spotify)
            // refresh the entire tree view
            commands.executeCommand("musictime.refreshPlaylist");
        } else if (needsRefresh) {
            // it's a new track or the track state changed.
            // no need to clear the playlists, just refresh the tree
            MusicManager.getInstance().refreshPlaylists();
        }

        // If the current playlist is the Liked Songs,
        // check if we should start the next track
        await this.playNextLikedSpotifyCheck(changeStatus);

        this.processingSong = false;
        return this.existingTrack || new Track();
    }

    private async playNextLikedSpotifyCheck(changeStatus) {
        // If the current playlist is the Liked Songs,
        // check if we should start the next track
        const playlistId = this.musicMgr.selectedPlaylist
            ? this.musicMgr.selectedPlaylist.id
            : "";
        if (
            playlistId === SPOTIFY_LIKED_SONGS_PLAYLIST_NAME &&
            changeStatus.endPrevTrack === true &&
            (changeStatus.stopped || changeStatus.paused)
        ) {
            // play the next song
            const nextTrack: Track = this.musicMgr.getNextSpotifyLikedSong();
            if (nextTrack) {
                let playlistItem: PlaylistItem = this.musicMgr.createPlaylistItemFromTrack(
                    nextTrack,
                    0
                );
                this.musicMgr.selectedTrackItem = playlistItem;
                // launch and play the next track
                await launchAndPlaySpotifyTrack(playlistItem.id, "");
            }
        }
    }

    public getMusicCodingData() {
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
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            offset: getOffsetSecends() / 60,
            pluginId: getPluginId(),
            os: getOs(),
            version: getVersion(),
            source: {},
            repoFileCount: 0,
            repoContributorCount: 0
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

                    // build the aggregated payload
                    const musicCodingData = this.buildAggregateData(
                        payloads,
                        initialValue
                    );
                    return musicCodingData;
                }
            } else {
                console.log("No keystroke data to send with the song session");
            }
        } catch (e) {
            logIt(`Unable to aggregate music session data: ${e.message}`);
        }
        return initialValue;
    }

    /**
     * 
     * @param payloads
     * Should return...
     *  add: 0,
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
        version: getVersion(),
        source: {},
        repoFileCount: 0,
        repoContributorCount: 0
     */
    private buildAggregateData(payloads, initialValue) {
        const numerics = [
            "add",
            "paste",
            "delete",
            "netkeys",
            "linesAdded",
            "linesRemoved",
            "open",
            "close",
            "keystrokes"
        ];
        if (payloads && payloads.length > 0) {
            payloads.forEach(element => {
                // set repoContributorCount and repoFileCount
                // if not already set
                if (initialValue.repoFileCount === 0) {
                    initialValue.repoFileCount = element.repoFileCount;
                }
                if (initialValue.repoContributorCount === 0) {
                    initialValue.repoContributorCount =
                        element.repoContributorCount;
                }

                // sum the keystrokes
                initialValue.keystrokes += element.keystrokes;
                if (element.source) {
                    // go through the source object
                    initialValue.source = element.source;
                    const keys = Object.keys(element.source);
                    if (keys && keys.length > 0) {
                        keys.forEach(key => {
                            let sourceObj = element.source[key];
                            const sourceObjKeys = Object.keys(sourceObj);
                            if (sourceObjKeys && sourceObjKeys.length > 0) {
                                sourceObjKeys.forEach(sourceObjKey => {
                                    const val = sourceObj[sourceObjKey];
                                    if (numerics.includes(sourceObjKey)) {
                                        // aggregate
                                        initialValue[sourceObjKey] += val;
                                    }
                                });
                            }

                            if (!initialValue.syntax && sourceObj.syntax) {
                                initialValue.syntax = sourceObj.syntax;
                            }

                            if (!sourceObj.timezone) {
                                sourceObj[
                                    "timezone"
                                ] = Intl.DateTimeFormat().resolvedOptions().timeZone;
                            }
                            if (!sourceObj.offset) {
                                sourceObj["offset"] = getOffsetSecends() / 60;
                            }
                            if (!sourceObj.pluginId) {
                                sourceObj["pluginId"] = getPluginId();
                            }
                            if (!sourceObj.os) {
                                sourceObj["os"] = getOs();
                            }
                            if (!sourceObj.version) {
                                sourceObj["version"] = getVersion();
                            }
                        });
                    }
                }
            });
        }
        return initialValue;
    }
}
