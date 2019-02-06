import * as spotify from "spotify-node-applescript";
import * as itunes from "itunes-node-applescript";
import { wrapExecPromise, isWindows } from "./Util";

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

    if (isWindows()) {
        return trackInfo;
    }

    let isSpotifyRunning = await this.isItunesRunningPromise();
    let isItunesRunning = await this.isItunesRunningPromise();

    if (isSpotifyRunning) {
        trackInfo = await getSpotifyTrackPromise();
        let spotifyStopped =
            !trackInfo || (trackInfo && trackInfo["state"] !== "playing")
                ? true
                : false;
        if ((!trackInfo || spotifyStopped) && isItunesRunning) {
            // get that track data.
            trackInfo = await getItunesTrackPromise();
        }
    } else if (isItunesRunning) {
        trackInfo = await getItunesTrackPromise();
    }

    return trackInfo || {};
}

/**
 * returns true or an error.
 */
function getSpotifyRunningPromise() {
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

function isItunesRunningPromise() {
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
