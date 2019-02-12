import * as spotify from "spotify-node-applescript";
import * as itunes from "itunes-node-applescript";
import { wrapExecPromise, isWindows, getItem, isEmptyObj } from "./Util";
import { sendMusicData } from "./DataController";
import { softwareGet, isResponseOk } from "./HttpClient";

const WINDOWS_SPOTIFY_TRACK_FIND =
    'tasklist /fi "imagename eq Spotify.exe" /fo list /v | find " - "';

let trackInfo = {};

export function gatherMusicInfo() {
    const trackInfoDataP = getTrackInfo();
    trackInfoDataP
        .then(trackInfoData => {
            let d = new Date();
            // offset is the minutes from GMT. it's positive if it's before, and negative after
            const offset = d.getTimezoneOffset();
            const offset_sec = offset * 60;
            let nowInSec = Math.round(d.getTime() / 1000);
            // subtract the offset_sec (it'll be positive before utc and negative after utc)
            let localNowInSec = nowInSec - offset_sec;
            let state = "stopped";
            if (trackInfoData) {
                state = trackInfoData["state"] || "playing";
            }
            let isPaused =
                state.toLowerCase().indexOf("playing") !== -1 ? false : true;

            if (trackInfoData && trackInfoData["id"]) {
                // check if we have this track already in "trackInfo"
                let hasExistingTrackInfo = !isEmptyObj(trackInfo)
                    ? true
                    : false;
                let matchingTracks =
                    hasExistingTrackInfo &&
                    trackInfo["id"] === trackInfoData["id"]
                        ? true
                        : false;
                if (hasExistingTrackInfo && (!matchingTracks || isPaused)) {
                    // this means a new song has started, send a payload to complete
                    // the 1st one and another to start the next one
                    trackInfo["end"] = nowInSec - 1;
                    sendMusicData(trackInfo).then(result => {
                        if (!isPaused) {
                            // send the next payload starting the next song
                            trackInfo = {};
                            trackInfo = { ...trackInfoData };
                            trackInfo["start"] = nowInSec;
                            trackInfo["local_start"] = localNowInSec;
                            sendMusicData(trackInfo);
                        } else {
                            trackInfo = {};
                        }
                    });
                } else if (!hasExistingTrackInfo && !isPaused) {
                    // no previous track played, send this one to start it
                    trackInfo = { ...trackInfoData };
                    trackInfo["start"] = nowInSec;
                    trackInfo["local_start"] = localNowInSec;
                    sendMusicData(trackInfo);
                }
            } else if (!isEmptyObj(trackInfo)) {
                // end this song since we're not getting a current track
                // and the trackInfo is not empty
                trackInfo["end"] = nowInSec;
                sendMusicData(trackInfo).then(result => {
                    // clear out the trackInfo
                    trackInfo = {};
                });
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

function isSpotifyRunning() {
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

function isItunesRunning() {
    if (isWindows()) {
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
