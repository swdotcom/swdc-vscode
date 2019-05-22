import { Track } from "cody-music";

export interface MusicTreeItem {
    artist: string;
    album: string;
    name: string;
    id: string;
    type: string;
    uri: string;
}

// uri, name, public, collaborative, tracks
export class Playlist implements MusicTreeItem {
    artist: string;
    album: string;
    name: string;
    public: boolean;
    collaborative: boolean;
    id: string;
    tracks: Track[] = [];
    uri: string;
    total: number;
    type: string = "playlist";
    player: string; /** itunes vs spotify */
}

export class MusicStoreManager {
    private static instance: MusicStoreManager;
    private playlists: Playlist[] = [];
    private tracks: Track[] = [];

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
        return this.playlists;
    }

    setPlaylists(p: Playlist[]) {
        this.playlists = p;
    }

    getTracks(): Track[] {
        if (!this.tracks || this.tracks.length === 0) {
            // check if there are any playists to get tracks from
            if (this.playlists && this.playlists.length > 0) {
                for (let i = 0; i < this.playlists.length; i++) {
                    let playlist: Playlist = this.playlists[i];
                    if (playlist.tracks) {
                        for (let x = 0; x < playlist.tracks.length; x++) {
                            let track: Track = playlist.tracks[x];
                            this.tracks.push(track);
                        }
                    }
                }
            }
        }
        return this.tracks;
    }
}
