// {"artist": "Coldplay","album": "Parachutes","genre": "",
// "disc_number": 1,"duration": 273426,"played_count": 0,"track_number": 6,
// "id": "spotify:track:0R8P9KfGJCDULmlEoBagcO","name": "Trouble","state":"playing"}
export interface Track {
    artist: string;
    album: string;
    genre: string;
    disc_number: number;
    duration: number;
    played_count: number;
    track_number: number;
    id: string;
    name: string;
    state: string;
}

export interface Playlist {
    name: string;
    id: string;
    tracks: any;
}

class MusicTreeManager {
    //
}

export const musicTreeManager = new MusicTreeManager();
