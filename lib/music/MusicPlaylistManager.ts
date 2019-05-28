import { PlayerName, getPlaylists, PlaylistItem } from "cody-music";
import { MusicStoreManager } from "./MusicStoreManager";

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
        return getPlaylists(PlayerName.SpotifyWeb);
    }
}
