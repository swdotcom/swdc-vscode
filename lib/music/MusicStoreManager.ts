import {
    Track,
    requiresSpotifyAccessInfo,
    setConfig,
    getPlaylistTracks,
    PaginationItem,
    PlaylistItem,
    PlayerName,
    CodyResponse,
    CodyResponseType,
    getPlaylists,
    getRunningTrack,
    PlayerType,
    PlaylistTrackInfo,
    PlayerDevice,
    getSpotifyDevices,
    CodyConfig,
    TrackStatus,
    play
} from "cody-music";
import { serverIsAvailable, getSpotifyOauth } from "../DataController";

import {
    softwareGet,
    isResponseOk,
    softwareDelete,
    softwarePut
} from "../HttpClient";
import { getItem } from "../Util";
import { PRODUCTIVITY_PLAYLIST_NAME } from "../Constants";
import { commands } from "vscode";
export class MusicStoreManager {
    private static instance: MusicStoreManager;

    private _spotifyPlaylists: PlaylistItem[] = [];
    private _runningPlaylists: PlaylistItem[] = [];
    private _runningTrack: Track = new Track();
    private _savedPlaylists: PlaylistItem[] = [];
    private _settings: PlaylistItem[] = [];
    private _userFavorites: any[] = [];
    private _globalFavorites: any[] = [];
    private _playlistTracks: any = {};
    private _currentPlayerType: PlayerType = PlayerType.NotAssigned;
    private _selectedPlaylist: PlaylistItem = null;
    private _selectedTrackItem: PlaylistItem = null;
    private _hasPlaylists: boolean = false;
    private _spotifyPlayerDevices: PlayerDevice[] = [];

    private constructor() {
        //
    }

    static getInstance(): MusicStoreManager {
        if (!MusicStoreManager.instance) {
            MusicStoreManager.instance = new MusicStoreManager();
        }

        return MusicStoreManager.instance;
    }

    //
    // getters
    //

    get savedPlaylists(): PlaylistItem[] {
        return this._savedPlaylists;
    }

    set savedPlaylists(lists: PlaylistItem[]) {
        this._savedPlaylists = lists;
    }

    get runningTrack(): Track {
        return this._runningTrack;
    }

    set runningTrack(track: Track) {
        this._runningTrack = track;
    }

    get settings(): PlaylistItem[] {
        return this._settings;
    }

    set settings(lists: PlaylistItem[]) {
        this._settings = lists;
    }

    get spotifyPlaylists(): PlaylistItem[] {
        return this._spotifyPlaylists;
    }

    set spotifyPlaylists(lists: PlaylistItem[]) {
        this._spotifyPlaylists = lists;
    }

    get userFavorites(): any[] {
        return this._userFavorites;
    }

    get globalFavorites(): any[] {
        return this._globalFavorites;
    }

    get runningPlaylists(): PlaylistItem[] {
        return this._runningPlaylists;
    }

    set runningPlaylists(list: PlaylistItem[]) {
        this._runningPlaylists = list;
    }

    get selectedPlaylist(): PlaylistItem {
        return this._selectedPlaylist;
    }

    set selectedPlaylist(item: PlaylistItem) {
        this._selectedPlaylist = item;
    }

    get selectedTrackItem(): PlaylistItem {
        return this._selectedTrackItem;
    }

    set selectedTrackItem(item: PlaylistItem) {
        this._selectedTrackItem = item;
    }

    get hasPlaylists(): boolean {
        return this._hasPlaylists;
    }

    set hasPlaylists(flag: boolean) {
        this._hasPlaylists = flag;
    }

    get spotifyPlayerDevices(): PlayerDevice[] {
        return this._spotifyPlayerDevices;
    }

    set spotifyPlayerDevices(devices: PlayerDevice[]) {
        this._spotifyPlayerDevices = devices;
    }

    //
    // store functions
    //

    async refreshPlaylists() {
        // refresh the playlists
        await this.clearPlaylists();
        this.runningTrack = await getRunningTrack();
        await this.syncRunningPlaylists();
    }

    async clearPlaylists() {
        this.selectedPlaylist = null;
        this.runningPlaylists = [];
        this.hasPlaylists = false;
    }

    async initializeSpotify() {
        if (!this.hasSpotifyAccessToken()) {
            let serverIsOnline = await serverIsAvailable();
            const spotifyOauth = await getSpotifyOauth(serverIsOnline);
            if (spotifyOauth) {
                // update the CodyMusic credentials
                let codyConfig: CodyConfig = new CodyConfig();
                codyConfig.spotifyClientId = "eb67e22ba1c6474aad8ec8067480d9dc";
                codyConfig.spotifyAccessToken =
                    spotifyOauth.spotify_access_token;
                codyConfig.spotifyRefreshToken =
                    spotifyOauth.spotify_refresh_token;
                codyConfig.spotifyClientSecret =
                    "2b40b4975b2743189c87f4712c0cd59e";
                setConfig(codyConfig);
            }
        }
    }

    async fetchSavedPlaylists() {
        let playlists = [];
        const response = await softwareGet("/music/playlist", getItem("jwt"));
        if (isResponseOk(response)) {
            playlists = response.data.map(item => {
                // transform the playlist_id to id
                item["id"] = item.playlist_id;
                item["playlistTypeId"] = item.playlistTypeId;
                delete item.playlist_id;
                return item;
            });
        }
        this.savedPlaylists = playlists;
    }

    async reconcilePlaylists() {
        let hasSpotifyPlaylists = this._spotifyPlaylists.length > 0;
        let hasUpdates = false;
        if (this._savedPlaylists.length > 0) {
            for (let i = 0; i < this._savedPlaylists.length; i++) {
                let codyPlaylist = this._savedPlaylists[i];

                if (hasSpotifyPlaylists) {
                    let foundItem = this._spotifyPlaylists.find(element => {
                        return element.id === codyPlaylist.id;
                    });
                    if (!foundItem) {
                        // the playlist was deleted, delete the one on software
                        await softwareDelete(
                            `/music/playlist/${codyPlaylist.id}`,
                            getItem("jwt")
                        );
                        hasUpdates = true;
                    } else if (foundItem.name !== codyPlaylist.name) {
                        // update the name on software
                        const payload = {
                            name: foundItem.name
                        };
                        await softwarePut(
                            `/music/playlist/${codyPlaylist.id}`,
                            payload,
                            getItem("jwt")
                        );
                        hasUpdates = true;
                    }
                } else {
                    // either access token as removed or playlist(s) were
                    // deleted. delete our copy of the playlist ID
                    await softwareDelete(
                        `/music/playlist/${codyPlaylist.id}`,
                        getItem("jwt")
                    );
                    hasUpdates = true;
                }
            }
        }

        if (hasUpdates) {
            await this.clearPlaylists();
            this.runningTrack = await getRunningTrack();
            await this.syncRunningPlaylists();
        }
    }

    /**
     * These are the top productivity songs for this user
     */
    async syncUserTopSongs() {
        const response = await softwareGet(
            "/music/playlist/favorites",
            getItem("jwt")
        );

        if (isResponseOk(response) && response.data.length > 0) {
            this._userFavorites = response.data;
        } else {
            // clear the favorites
            this._userFavorites = [];
        }
    }

    async syncGlobalTopSongs() {
        const response = await softwareGet(
            "/music/playlist/favorites?global=true",
            getItem("jwt")
        );

        if (isResponseOk(response) && response.data.length > 0) {
            this._globalFavorites = response.data;
        } else {
            // clear the favorites
            this._globalFavorites = [];
        }
    }

    async syncRunningPlaylists() {
        let playlists: PlaylistItem[] = [];

        this._currentPlayerType = this.runningTrack.playerType;

        if (
            this.runningTrack.playerType === PlayerType.NotAssigned ||
            !this.runningTrack.id
        ) {
            // no player or track
            let noPlayerFoundItem: PlaylistItem = new PlaylistItem();
            noPlayerFoundItem.tracks = new PlaylistTrackInfo();
            noPlayerFoundItem.type = "title";
            noPlayerFoundItem.id = "title";
            noPlayerFoundItem.playerType = PlayerType.NotAssigned;
            noPlayerFoundItem.name = "No active music player found";
            playlists.push(noPlayerFoundItem);

            if (this.hasSpotifyAccessToken()) {
                let launchSpotifyItem: PlaylistItem = new PlaylistItem();
                launchSpotifyItem.tracks = new PlaylistTrackInfo();
                launchSpotifyItem.type = PlayerType.WebSpotify;
                launchSpotifyItem.id = "title";
                launchSpotifyItem.command = "musictime.launchSpotify";
                launchSpotifyItem.playerType = PlayerType.WebSpotify;
                launchSpotifyItem.name = "Launch Spotify";
                playlists.push(launchSpotifyItem);
            }

            this.updateSettingsItems(playlists);

            this.runningPlaylists = playlists;
            commands.executeCommand("musictime.refreshPlaylist");
            commands.executeCommand("musictime.refreshSettings");

            return;
        }

        // also get the player devices
        this.spotifyPlayerDevices = await getSpotifyDevices();

        // get the cody playlists
        await this.fetchSavedPlaylists();

        if (this.spotifyPlayerDevices.length > 0) {
            // fetch spotify and sync what we have
            playlists = await this.syncSpotifyWebPlaylists();
            this._currentPlayerType = PlayerType.WebSpotify;
        } else if (
            this.runningTrack.playerType === PlayerType.MacItunesDesktop
        ) {
            playlists = await getPlaylists(PlayerName.ItunesDesktop);
        }

        this.updateSettingsItems(playlists);

        this.runningPlaylists = playlists;
        commands.executeCommand("musictime.refreshPlaylist");
        commands.executeCommand("musictime.refreshSettings");
    }

    updateSettingsItems(playlists: PlaylistItem[]) {
        let settingsList: PlaylistItem[] = [];

        if (!this.hasSpotifyAccessToken()) {
            // add the connect spotify link
            let listItem: PlaylistItem = new PlaylistItem();
            listItem.tracks = new PlaylistTrackInfo();
            listItem.type = "connectspotify";
            listItem.id = "connectspotify";
            listItem.playerType = PlayerType.WebSpotify;
            listItem.name = "Connect Spotify";
            listItem.tooltip = "Connect Spotify To View Your Playlists";
            settingsList.push(listItem);
        } else {
            // show that you've connected
            let listItem: PlaylistItem = new PlaylistItem();
            listItem.tracks = new PlaylistTrackInfo();
            listItem.type = "spotifyconnected";
            listItem.id = "spotifyconnected";
            listItem.playerType = PlayerType.WebSpotify;
            listItem.name = "Spotify Connected";
            listItem.tooltip = "You've connected Spotify";
            settingsList.push(listItem);
        }

        if (this._currentPlayerType === PlayerType.WebSpotify) {
            const foundCodingFavorites = this.hasMusicTimePlaylistForType(1);

            if (!foundCodingFavorites) {
                // add the connect spotify link
                let listItem: PlaylistItem = new PlaylistItem();
                listItem.tracks = new PlaylistTrackInfo();
                listItem.type = "addtop40";
                listItem.id = "addtop40";
                listItem.playerType = PlayerType.WebSpotify;
                listItem.name = `Create Spotify Coding Playlist`;
                listItem.tooltip = `Create a Spotify playlist (${PRODUCTIVITY_PLAYLIST_NAME}) based on your weekly top 40`;
                settingsList.push(listItem);
            }
        }

        this.settings = settingsList;
    }

    async syncSpotifyWebPlaylists() {
        let playlists = [];
        if (this.hasSpotifyAccessToken()) {
            playlists = await getPlaylists(PlayerName.SpotifyWeb);
            if (playlists) {
                // update the type to "playlist";
                playlists.map(item => {
                    item.type = "playlist";
                });
            }
        }

        this.spotifyPlaylists = playlists;

        return this.spotifyPlaylists;
    }

    hasSpotifyAccessToken() {
        return requiresSpotifyAccessInfo() ? false : true;
    }

    hasTracksForPlaylistId(playlist_id: string): boolean {
        return this._playlistTracks[playlist_id] ? true : false;
    }

    clearPlaylistTracksForId(playlist_id: string) {
        if (this._playlistTracks[playlist_id]) {
            this._playlistTracks[playlist_id] = null;
        }
    }

    /**
     * Checks if the user's spotify playlists contains either
     * the global top 40 or the user's coding favorites playlist.
     * The playlistTypeId is used to match the set ID from music time
     * app. 1 = user's coding favorites, 2 = global top 40
     */
    hasMusicTimePlaylistForType(playlistTypeId: number) {
        if (this.spotifyPlaylists.length > 0) {
            for (let i = 0; i < this.spotifyPlaylists.length; i++) {
                const playlist: PlaylistItem = this.spotifyPlaylists[i];
                const foundItem: PlaylistItem = this.savedPlaylists.find(
                    element => {
                        return (
                            element.id === playlist.id &&
                            element["playlistTypeId"] === playlistTypeId
                        );
                    }
                );

                if (foundItem) {
                    playlist.tag = "cody";
                    return true;
                }
            }
        }

        return false;
    }

    async getTracksForPlaylistId(playlist_id: string) {
        if (this.runningTrack.playerType !== this._currentPlayerType) {
            // clear the map
            this._playlistTracks[playlist_id] = null;
        }
        this._currentPlayerType = this.runningTrack.playerType;

        let playlistItems = [];
        let tracks = this._playlistTracks[playlist_id];
        if (tracks) {
            return tracks;
        }

        let playlistTracks: CodyResponse;

        if (this.spotifyPlayerDevices.length > 0) {
            // get the playlist tracks
            playlistTracks = await getPlaylistTracks(
                PlayerName.SpotifyWeb,
                playlist_id
            );
        } else if (this._currentPlayerType === PlayerType.MacItunesDesktop) {
            playlistTracks = await getPlaylistTracks(
                PlayerName.ItunesDesktop,
                playlist_id
            );
        } else {
            playlistTracks = await getPlaylistTracks(
                PlayerName.SpotifyDesktop,
                playlist_id
            );
        }

        if (playlistTracks.state === CodyResponseType.Success) {
            let paginationItem: PaginationItem = playlistTracks.data;
            if (paginationItem && paginationItem.items) {
                playlistItems = paginationItem.items.map((track: Track) => {
                    let playlistItem: PlaylistItem = new PlaylistItem();
                    playlistItem.type = "track";
                    playlistItem.name = track.name;
                    playlistItem.id = track.id;
                    playlistItem["artists"] = track.artists.join(", ");
                    playlistItem.playerType = track.playerType;
                    delete playlistItem.tracks;

                    if (track.id === this.runningTrack.id) {
                        playlistItem["state"] = this.runningTrack.state;
                        this.selectedTrackItem = playlistItem;
                    } else {
                        playlistItem["state"] = TrackStatus.NotAssigned;
                    }
                    // since this is a track, delete the tracks attribute

                    return playlistItem;
                });
            }

            this._playlistTracks[playlist_id] = playlistItems;
        }
        return playlistItems;
    }
}
