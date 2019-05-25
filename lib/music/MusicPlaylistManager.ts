import * as CodyMusic from "cody-music";
import { MusicStoreManager } from "./MusicStoreManager";
import { PlaylistItem } from "cody-music/dist/lib/models";

export class MusicPlaylistManager {
    private static instance: MusicPlaylistManager;

    private constructor() {
        MusicStoreManager.getInstance().initializeSpotify();
    }

    static getInstance(): MusicPlaylistManager {
        if (!MusicPlaylistManager.instance) {
            MusicPlaylistManager.instance = new MusicPlaylistManager();
        }

        return MusicPlaylistManager.instance;
    }

    public getSpotifyWebPlaylists(): Promise<PlaylistItem[]> {
        return CodyMusic.getPlaylists(CodyMusic.PlayerName.SpotifyWeb);
    }
}
