// {"artist": "Coldplay","album": "Parachutes","genre": "",
// "disc_number": 1,"duration_ms": 273426,"played_count": 0,"track_number": 6,
// "id": "spotify:track:0R8P9KfGJCDULmlEoBagcO","name": "Trouble","state":"playing"}
export class Track {
    artist: string;
    album: string;
    genre: string;
    disc_number: number;
    duration_ms: number;
    played_count: number;
    track_number: number;
    popularity: number;
    id: string;
    name: string;
    state: string;
    explicit: boolean;
    // href:"https://api.spotify.com/v1/playlists/0mwG8hCL4scWi8Nkt7jyoV/tracks"
    href: string;
    constructor() {
        //
    }
}

// uri, name, public, collaborative, tracks
export class Playlist {
    name: string;
    public: boolean;
    collaborative: boolean;
    id: string;
    tracks: Track[];
    uri: string;
    total: number;
    player: string; /** itunes vs spotify */
    constructor() {
        //
    }
}

export class MusicStoreManager {
    private static instance: MusicStoreManager;
    private playlists: Playlist[];
    private tracks: Track[];

    private constructor() {
        //
    }

    static getInstance(): MusicStoreManager {
        if (!MusicStoreManager.instance) {
            MusicStoreManager.instance = new MusicStoreManager();
        }

        return MusicStoreManager.instance;
    }

    getPlaylists(): Playlist[] {
        if (!this.playlists) {
            this.playlists = [];
        }
        return this.playlists;
    }

    getTracks(): Track[] {
        if (this.tracks) {
            this.tracks = [];
        }
        return this.tracks;
    }
}
