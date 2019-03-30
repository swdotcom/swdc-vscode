import * as spotify from "spotify-node-applescript";
import * as itunes from "itunes-node-applescript";
import { wrapExecPromise, isWindows, getItem, getCommandResult } from "./Util";
import { sendMusicData } from "./DataController";
import { softwareGet, isResponseOk } from "./HttpClient";

const applescript = require("applescript");

const WINDOWS_SPOTIFY_TRACK_FIND =
    'tasklist /fi "imagename eq Spotify.exe" /fo list /v | find " - "';

let existingTrack = {};
let lastTimeSent = null;

export async function isMacMusicPlayerActive(player) {
    const command = `pgrep -x ${player}`;
    const result = await getCommandResult(command, 1);
    if (result) {
        return true;
    }
    return false;
}

export function gatherMusicInfo() {
    const trackInfoDataP = getTrackInfo();
    trackInfoDataP
        .then(playingTrack => {
            let d = new Date();
            // offset is the minutes from GMT. it's positive if it's before, and negative after
            const offset = d.getTimezoneOffset();
            const offset_sec = offset * 60;
            let nowInSec = Math.round(d.getTime() / 1000);
            // subtract the offset_sec (it'll be positive before utc and negative after utc)
            let localNowInSec = nowInSec - offset_sec;
            let state = "stopped";
            let playingTrackId = playingTrack["id"] || null;
            if (playingTrackId) {
                state = playingTrack["state"] || "playing";
            }
            let isPaused =
                state.toLowerCase().indexOf("playing") !== -1 ? false : true;

            let existingTrackId = existingTrack["id"] || null;
            let playingTrackDuration = playingTrackId
                ? parseInt(playingTrack["duration"], 10)
                : null;

            if (!playingTrackId && existingTrackId) {
                // we don't have a track playing and we have an existing one, close it out
                existingTrack["end"] = nowInSec;
                sendMusicData(existingTrack).then(result => {
                    // clear out the trackInfo
                    existingTrack = {};
                    lastTimeSent = null;
                });
            } else if (playingTrackId && !existingTrackId) {
                // this means we don't have an existing track, the playing track will be our new existing track
                // it doesn't matter if it's paused or not since we don't have an existing track
                existingTrack = {};
                existingTrack = { ...playingTrack };
                existingTrack["start"] = nowInSec;
                existingTrack["local_start"] = localNowInSec;
                sendMusicData(existingTrack);
                lastTimeSent = nowInSec;
            } else if (playingTrackId && existingTrackId) {
                // we have a playing track and an existing track, are they the same ones?
                if (playingTrackId !== existingTrackId) {
                    // send the existing song now
                    existingTrack["end"] = nowInSec - 1;
                    sendMusicData(existingTrack).then(result => {
                        // clear out the trackInfo
                        existingTrack = {};
                        // start the new song
                        existingTrack = { ...playingTrack };
                        existingTrack["start"] = nowInSec;
                        existingTrack["local_start"] = localNowInSec;
                        sendMusicData(existingTrack);
                        lastTimeSent = nowInSec;
                    });
                } else {
                    // it's the same trackId, but we may need to send it again
                    // if the song is on repeat. the only way to find out is to check
                    // if it's not paused and the last time we sent this is longer than
                    // the duration.
                    // check if it's not paused and is beyond the track duration
                    let diffInSec = lastTimeSent ? nowInSec - lastTimeSent : 0;
                    if (
                        !isPaused &&
                        playingTrackDuration &&
                        lastTimeSent &&
                        diffInSec > playingTrackDuration
                    ) {
                        // it's on repeat, send it and start the next one
                        existingTrack["end"] = nowInSec - 1;
                        sendMusicData(existingTrack).then(result => {
                            // clear out the trackInfo
                            existingTrack = {};
                            // start the new song
                            existingTrack = { ...playingTrack };
                            existingTrack["start"] = nowInSec;
                            existingTrack["local_start"] = localNowInSec;
                            sendMusicData(existingTrack);
                            lastTimeSent = nowInSec;
                        });
                    }
                }
            }
        })
        .catch(err => {
            //
        });
}
/**
 * get the itunes track
 */
export async function getItunesTrackState() {
    let command = `osascript -e \'tell application "iTunes" to get player state\'`;
    let result = await wrapExecPromise(command, null);
    return result;
}

export async function getSpotifyTrackState() {
    let command = `osascript -e \'tell application "Spotify" to get player state\'`;
    let result = await wrapExecPromise(command, null);
    return result;
}

export async function getTrackInfo() {
    let trackInfo = {};

    let spotifyRunning = await isSpotifyRunning();
    let itunesRunning = await isItunesRunning();

    if (spotifyRunning) {
        trackInfo = await getSpotifyTrackPromise();
        let spotifyStopped =
            !trackInfo || (trackInfo && trackInfo["state"] !== "playing")
                ? true
                : false;
        if ((!trackInfo || spotifyStopped) && itunesRunning) {
            // get that track data.
            trackInfo = await getItunesTrackPromise();
        }
    } else if (itunesRunning) {
        trackInfo = await getItunesTrackPromise();
    }

    return trackInfo || {};
}

async function isSpotifyRunning() {
    if (isWindows()) {
        /**
         * tasklist /fi "imagename eq Spotify.exe" /fo list /v |find " - "
            Window Title: Dexys Midnight Runners - Come On Eileen
         */
        return new Promise((resolve, reject) => {
            wrapExecPromise(WINDOWS_SPOTIFY_TRACK_FIND, null).then(result => {
                if (result && result.toLowerCase().includes("title")) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
    } else {
        let isActive = await isMacMusicPlayerActive("Spotify");
        if (!isActive) {
            return false;
        }
        return new Promise((resolve, reject) => {
            spotify.isRunning((err, isRunning) => {
                if (err) {
                    resolve(false);
                } else {
                    resolve(isRunning);
                }
            });
        });
    }
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
async function getSpotifyTrackPromise() {
    if (isWindows()) {
        let windowTitleStr = "Window Title:";
        // get the artist - song name from the command result, then get the rest of the info from spotify
        let songInfo = await wrapExecPromise(WINDOWS_SPOTIFY_TRACK_FIND, null);
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
    } else {
        let state = await getSpotifyTrackState();
        return new Promise((resolve, reject) => {
            spotify.getTrack((err, track) => {
                if (err || !track) {
                    resolve(null);
                } else {
                    // convert the duration to seconds
                    let duration = Math.round(track.duration / 1000);
                    let trackInfo = {
                        id: track.id,
                        name: track.name,
                        artist: track.artist,
                        genre: "", // spotify doesn't provide genre from their app.
                        start: 0,
                        end: 0,
                        state,
                        duration,
                        type: "spotify"
                    };
                    resolve(trackInfo);
                }
            });
        });
    }
}

async function isItunesRunning() {
    if (isWindows()) {
        return false;
    }
    let isActive = await isMacMusicPlayerActive("iTunes");
    if (!isActive) {
        return false;
    }
    return new Promise((resolve, reject) => {
        itunes.isRunning((err, isRunning) => {
            if (err) {
                resolve(false);
            } else {
                resolve(isRunning);
            }
        });
    });
}

/**
 * returns an array of data, i.e.
 * { genre, artist, album, id, index, name, time }
 * 0:"Dance"
    1:"Martin Garrix"
    2:"High on Life (feat. Bonn) - Single"
    3:4938 <- is this the track ID?
    4:375
    5:"High on Life (feat. Bonn)"
    6:"3:50"
 */
async function getItunesTrackPromise() {
    let state = await getItunesTrackState();
    return new Promise((resolve, reject) => {
        itunes.track((err, track) => {
            if (err || !track) {
                resolve(null);
            } else {
                let trackInfo = {
                    id: "",
                    name: "",
                    artist: "",
                    genre: "", // spotify doesn't provide genre from their app.
                    start: 0,
                    end: 0,
                    state,
                    duration: 0,
                    type: "itunes"
                };
                if (track.length > 0) {
                    trackInfo["genre"] = track[0];
                }
                if (track.length >= 1) {
                    trackInfo["artist"] = track[1];
                }
                if (track.length >= 3) {
                    trackInfo["id"] = `itunes:track:${track[3]}`;
                }
                if (track.length >= 5) {
                    trackInfo["name"] = track[5];
                }
                if (track.length >= 6) {
                    // get the duration "4:41"
                    let durationParts = track[6].split(":");
                    if (durationParts && durationParts.length === 2) {
                        let durationInSec =
                            parseInt(durationParts[0], 10) * 60 +
                            parseInt(durationParts[1]);
                        trackInfo["duration"] = durationInSec;
                    }
                }
                // stopped/‌playing/‌paused
                resolve(trackInfo);
            }
        });
    });
}
