import {
    Track,
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
    CodyConfig,
    TrackStatus,
    addTracksToPlaylist,
    createPlaylist,
    getUserProfile,
    replacePlaylistTracks,
    getSpotifyDevices
} from "cody-music";
import { serverIsAvailable, getSpotifyOauth } from "../DataController";

import {
    softwareGet,
    isResponseOk,
    softwareDelete,
    softwarePut,
    softwarePost
} from "../HttpClient";
import { getItem, setItem, logIt } from "../Util";
import {
    PERSONAL_TOP_SONGS_NAME,
    SOFTWARE_TOP_SONGS_NAME,
    PERSONAL_TOP_SONGS_PLID,
    SOFTWARE_TOP_SONGS_PLID
} from "../Constants";
import { commands, window } from "vscode";
import { SpotifyUser } from "cody-music/dist/lib/profile";
import { MusicCommandManager } from "./MusicCommandManager";
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
    private _spotifyPlayerDevices: PlayerDevice[] = [];
    private _initializedSpotifyPlaylist: boolean = false;
    private _refreshing: boolean = false;
    private _spotifyUser: SpotifyUser = null;
    private _serverTrack: Track = null;

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

    get spotifyUser(): SpotifyUser {
        return this._spotifyUser;
    }

    set spotifyUser(user: SpotifyUser) {
        this._spotifyUser = user;
    }

    get savedPlaylists(): PlaylistItem[] {
        return this._savedPlaylists;
    }

    set savedPlaylists(lists: PlaylistItem[]) {
        this._savedPlaylists = lists;
    }

    get refreshing(): boolean {
        return this._refreshing;
    }

    set refreshing(value: boolean) {
        this._refreshing = value;
    }

    get initializedSpotifyPlaylist(): boolean {
        return this._initializedSpotifyPlaylist;
    }

    set initializedSpotifyPlaylist(value: boolean) {
        this._initializedSpotifyPlaylist = value;
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

    get hasSpotifyPlaylists(): boolean {
        return this._spotifyPlaylists && this._spotifyPlaylists.length > 0;
    }

    get userFavorites(): any[] {
        return this._userFavorites;
    }

    get globalFavorites(): any[] {
        return this._globalFavorites;
    }

    get hasGlobalFavorites(): boolean {
        return this._globalFavorites && this._globalFavorites.length > 0;
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

    get spotifyPlayerDevices(): PlayerDevice[] {
        return this._spotifyPlayerDevices;
    }

    set spotifyPlayerDevices(devices: PlayerDevice[]) {
        this._spotifyPlayerDevices = devices;
    }

    get serverTrack(): Track {
        return this._serverTrack;
    }

    set serverTrack(track: Track) {
        this._serverTrack = track;
    }

    //
    // store functions
    //

    async refreshPlaylists() {
        if (this.refreshing) {
            return;
        }
        this.refreshing = true;
        let serverIsOnline = await serverIsAvailable();
        // refresh the playlists
        this.runningTrack = await getRunningTrack();
        await this.syncRunningPlaylists(serverIsOnline);
        MusicCommandManager.syncControls(this.runningTrack);
        this.refreshing = false;
    }

    async clearPlaylists() {
        this.runningPlaylists = [];
    }

    async initializeSpotify(serverIsOnline) {
        const spotifyOauth = await getSpotifyOauth(serverIsOnline);
        if (spotifyOauth) {
            // update the CodyMusic credentials
            this.updateSpotifyAccessInfo(spotifyOauth);
        } else {
            setItem("spotify_access_token", null);
            setItem("spotify_refresh_token", null);
        }
    }

    async updateSpotifyAccessInfo(spotifyOauth) {
        if (spotifyOauth) {
            // update the CodyMusic credentials
            let codyConfig: CodyConfig = new CodyConfig();
            codyConfig.spotifyClientId = "eb67e22ba1c6474aad8ec8067480d9dc";
            codyConfig.spotifyAccessToken = spotifyOauth.spotify_access_token;
            codyConfig.spotifyRefreshToken = spotifyOauth.spotify_refresh_token;
            codyConfig.spotifyClientSecret = "2b40b4975b2743189c87f4712c0cd59e";
            setConfig(codyConfig);

            setItem("spotify_access_token", spotifyOauth.spotify_access_token);
            setItem(
                "spotify_refresh_token",
                spotifyOauth.spotify_refresh_token
            );

            // get the user
            getUserProfile().then(user => {
                this._spotifyUser = user;
            });
        } else {
            this.clearSpotifyAccessInfo();
        }
    }

    async clearSpotifyAccessInfo() {
        setItem("spotify_access_token", null);
        setItem("spotify_refresh_token", null);
        let codyConfig: CodyConfig = new CodyConfig();
        codyConfig.spotifyClientId = "eb67e22ba1c6474aad8ec8067480d9dc";
        codyConfig.spotifyAccessToken = null;
        codyConfig.spotifyRefreshToken = null;
        codyConfig.spotifyClientSecret = "2b40b4975b2743189c87f4712c0cd59e";
        setConfig(codyConfig);
        this._spotifyUser = null;
    }

    async fetchSavedPlaylists(serverIsOnline) {
        let playlists = [];
        if (serverIsOnline) {
            const response = await softwareGet(
                "/music/playlist",
                getItem("jwt")
            );
            if (isResponseOk(response)) {
                playlists = response.data.map(item => {
                    // transform the playlist_id to id
                    item["id"] = item.playlist_id;
                    item["playlistTypeId"] = item.playlistTypeId;
                    delete item.playlist_id;
                    return item;
                });
            }
        }
        this.savedPlaylists = playlists;
    }

    async getServerTrack(track: Track) {
        if (track) {
            let trackId = track.id;
            if (trackId.indexOf(":") !== -1) {
                // strip it down to just the last id part
                trackId = trackId.substring(trackId.lastIndexOf(":") + 1);
            }
            let type = "spotify";
            if (track.playerType === PlayerType.MacItunesDesktop) {
                type = "itunes";
            }
            // use the name and artist as well since we have it
            let trackName = track.name;
            let trackArtist = track.artist;

            // check if it's cached before hitting the server
            if (this.serverTrack) {
                if (this.serverTrack.id === track.id) {
                    return this.serverTrack;
                } else if (
                    this.serverTrack.name === trackName &&
                    this.serverTrack.artist === trackArtist
                ) {
                    return this.serverTrack;
                }
                // it doesn't match, might as well nullify it
                this.serverTrack = null;
            }

            if (!this.serverTrack) {
                const api = `/music/track/${trackId}/type/${type}?name=${trackName}&artist=${trackArtist}`;
                const resp = await softwareGet(api, getItem("jwt"));
                if (isResponseOk(resp) && resp.data) {
                    let trackData = resp.data;
                    // set the server track to this one
                    this.serverTrack = { ...track };
                    // update the loved state
                    if (
                        trackData.liked !== null &&
                        trackData.liked !== undefined
                    ) {
                        // set the boolean value
                        if (isNaN(trackData.liked)) {
                            // it's not 0 or 1, use the bool
                            this.serverTrack.loved = trackData.liked;
                        } else {
                            // it's 0 or 1, convert it
                            this.serverTrack.loved =
                                trackData.liked === 0 ? false : true;
                        }

                        track.loved = this.serverTrack.loved;
                    }
                } else {
                    this.serverTrack = { ...track };
                }
            }
        }

        MusicCommandManager.syncControls(track);

        return this.serverTrack;
    }

    async setLiked(track: Track, liked: boolean) {
        if (track) {
            // set it to liked
            let trackId = track.id;
            if (trackId.indexOf(":") !== -1) {
                // strip it down to just the last id part
                trackId = trackId.substring(trackId.lastIndexOf(":") + 1);
            }
            let type = "spotify";
            if (track.playerType === PlayerType.MacItunesDesktop) {
                type = "itunes";
            }
            // use the name and artist as well since we have it
            let trackName = encodeURIComponent(track.name);
            let trackArtist = encodeURIComponent(track.artist);
            const api = `/music/liked/track/${trackId}/type/${type}?name=${trackName}&artist=${trackArtist}`;
            const payload = { liked };
            await softwarePut(api, payload, getItem("jwt"));
        }
    }

    getExistingPesonalPlaylist(): any {
        return this.savedPlaylists.find(element => {
            return parseInt(element["playlistTypeId"], 10) === 1;
        });
    }

    async reconcilePlaylists() {
        if (!this.initializedSpotifyPlaylist) {
            // its not ready yet
            return;
        }
        // fetch what we have from the app
        if (this.savedPlaylists) {
            this.savedPlaylists.map(async savedPlaylist => {
                let foundItem = this.spotifyPlaylists.find(element => {
                    return element.id === savedPlaylist.id;
                });
                if (!foundItem) {
                    // remove it from the server
                    await softwareDelete(
                        `/music/playlist/${savedPlaylist.id}`,
                        getItem("jwt")
                    );
                } else if (foundItem.name !== savedPlaylist.name) {
                    // update the name on software
                    const payload = {
                        name: foundItem.name
                    };
                    await softwarePut(
                        `/music/playlist/${savedPlaylist.id}`,
                        payload,
                        getItem("jwt")
                    );
                }
            });
        }
    }

    /**
     * These are the top productivity songs for this user
     */
    async syncUsersWeeklyTopSongs() {
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

    hasActivePlaylistItems() {
        if (this.runningPlaylists && this.runningPlaylists.length > 0) {
            for (let i = 0; i < this.runningPlaylists.length; i++) {
                const plItem = this.runningPlaylists[i];
                if (plItem.type === "track" || plItem.type === "playlist") {
                    return true;
                }
            }
        }
        return false;
    }

    async syncRunningPlaylists(serverIsOnline: boolean) {
        let playlists: PlaylistItem[] = [];

        // get the cody playlists
        await this.fetchSavedPlaylists(serverIsOnline);

        await this.syncSpotifyWebPlaylists(serverIsOnline);

        this._currentPlayerType =
            this.runningTrack.playerType || PlayerType.NotAssigned;

        const playerNotAssigned =
            !this.runningTrack.playerType ||
            this.runningTrack.playerType === PlayerType.NotAssigned;
        const noPlaylistsFound =
            this.spotifyPlaylists.length === 0 &&
            (playerNotAssigned || !this.runningTrack.id)
                ? true
                : false;

        let playlistPlayerType = PlayerType.NotAssigned;
        if (noPlaylistsFound) {
            // no player or track
            let noPlayerFoundItem: PlaylistItem = new PlaylistItem();
            noPlayerFoundItem.tracks = new PlaylistTrackInfo();
            noPlayerFoundItem.type = "title";
            noPlayerFoundItem.id = "title";
            noPlayerFoundItem.playerType = PlayerType.NotAssigned;
            noPlayerFoundItem.name = "No active music player found";
            playlists.push(noPlayerFoundItem);
        } else {
            // get the current running playlist
            if (this.runningTrack.playerType === PlayerType.MacItunesDesktop) {
                playlists = await getPlaylists(PlayerName.ItunesDesktop);
                // update so the playlist header shows the spotify related icons
                commands.executeCommand(
                    "setContext",
                    "treeview-type",
                    "itunes"
                );
                playlistPlayerType = PlayerType.MacItunesDesktop;
            } else {
                playlists = this.spotifyPlaylists;
                this._currentPlayerType = PlayerType.WebSpotify;

                // go through each playlist and find out it's state
                for (let i = 0; i < playlists.length; i++) {
                    const playlist = playlists[i];
                    let playlistState = await this.getPlaylistState(
                        playlist.id
                    );
                    playlist.state = playlistState;
                }
                // update so the playlist header shows the spotify related icons
                commands.executeCommand(
                    "setContext",
                    "treeview-type",
                    "spotify"
                );
                playlistPlayerType = PlayerType.WebSpotify;
            }
        }

        this.updateSettingsItems(serverIsOnline, playlistPlayerType);

        this.runningPlaylists = playlists;
        commands.executeCommand("musictime.refreshPlaylist");
        commands.executeCommand("musictime.refreshSettings");
    }

    /**
     * TreeView settings items
     * @param serverIsOnline
     */
    async updateSettingsItems(
        serverIsOnline: boolean,
        playlistPlayerType: PlayerType
    ) {
        let settingsList: PlaylistItem[] = [];
        const musicstoreMgr = MusicStoreManager.getInstance();

        if (this.requiresSpotifyAccess()) {
            // add the connect spotify link
            let listItem: PlaylistItem = new PlaylistItem();
            listItem.tracks = new PlaylistTrackInfo();
            listItem.type = "spotify";
            listItem.id = "connectspotify";
            listItem.command = "musictime.connectSpotify";
            listItem.playerType = PlayerType.WebSpotify;
            listItem.name = "Connect Spotify";
            listItem.tooltip = "Connect Spotify To View Your Playlists";
            settingsList.push(listItem);
        } else {
            // show that you've connected
            let connectedItem: PlaylistItem = new PlaylistItem();
            connectedItem.tracks = new PlaylistTrackInfo();
            connectedItem.type = "connected";
            connectedItem.id = "spotifyconnected";
            connectedItem.playerType = PlayerType.WebSpotify;
            connectedItem.name = "Spotify Connected";
            connectedItem.tooltip = "You've connected Spotify";
            settingsList.push(connectedItem);

            // let disconnectItem: PlaylistItem = new PlaylistItem();
            // disconnectItem.tracks = new PlaylistTrackInfo();
            // disconnectItem.type = "spotify";
            // disconnectItem.id = "disconnectspotify";
            // disconnectItem.playerType = PlayerType.WebSpotify;
            // disconnectItem.name = "Disconnect Spotify Access";
            // disconnectItem.tooltip = "Disconnect Spotify";
            // disconnectItem.command = "musictime.disconnectSpotify";
            // settingsList.push(disconnectItem);
        }

        const personalPlaylistInfo = this.getExistingPesonalPlaylist();
        const personalPlaylistLabel = !personalPlaylistInfo
            ? "Generate Software Playlist"
            : "Update Software Playlist";
        const personalPlaylistTooltip = !personalPlaylistInfo
            ? `Generate a new Spotify playlist (${PERSONAL_TOP_SONGS_NAME})`
            : `Update your Spotify playlist (${PERSONAL_TOP_SONGS_NAME})`;
        let showingSpotifyPlaylist = true;
        if (
            this.runningTrack &&
            this.runningTrack.playerType === PlayerType.MacItunesDesktop
        ) {
            showingSpotifyPlaylist = false;
        }

        if (showingSpotifyPlaylist && !this.requiresSpotifyAccess()) {
            // add the connect spotify link
            let listItem: PlaylistItem = new PlaylistItem();
            listItem.tracks = new PlaylistTrackInfo();
            listItem.type = "paw";
            listItem.id = "codingfavorites";
            listItem.command = "musictime.generateWeeklyPlaylist";
            listItem.playerType = PlayerType.WebSpotify;
            listItem.name = personalPlaylistLabel;
            listItem.tooltip = personalPlaylistTooltip;
            settingsList.push(listItem);

            // update the existing playlist that matches the personal playlist with a paw if found
            this.hasMusicTimePlaylistForType(PERSONAL_TOP_SONGS_PLID);

            // update the existing playlist that matches the global top 40 playlist with a paw if found
            const foundGlobalFavorites = this.hasMusicTimePlaylistForType(
                SOFTWARE_TOP_SONGS_PLID
            );

            // only create global favorites if the app is online and we're
            // unable to find the global playlist id for the user
            if (!foundGlobalFavorites && serverIsOnline) {
                if (!this.hasGlobalFavorites) {
                    await this.syncGlobalTopSongs();
                }
                // create the global top 40
                await this.createGlobalTopSongsPlaylist();
            }
        }

        const spotifyDevices: PlayerDevice[] = await getSpotifyDevices();
        const hasSpotifyDevices =
            !spotifyDevices || spotifyDevices.length === 0 ? false : true;

        // If iTunes is currently playing show .
        // If it's not then show the launch iTunes
        if (playlistPlayerType !== PlayerType.MacItunesDesktop) {
            let item: PlaylistItem = new PlaylistItem();
            item.tracks = new PlaylistTrackInfo();
            item.type = "itunes";
            item.id = "title";
            item.command = "musictime.launchItunes";
            item.playerType = PlayerType.MacItunesDesktop;
            item.name = "Launch iTunes";
            settingsList.push(item);
        }

        if (playlistPlayerType === PlayerType.MacItunesDesktop) {
            // show the launch spotify menu item
            let item: PlaylistItem = new PlaylistItem();
            item.tracks = new PlaylistTrackInfo();
            item.type = "spotify";
            item.id = "title";
            item.command = "musictime.launchSpotify";
            item.playerType = PlayerType.WebSpotify;
            item.name = "Launch Spotify";
            settingsList.push(item);
        }

        this.settings = settingsList;
    }

    async syncSpotifyWebPlaylists(serverIsOnline) {
        let playlists = [];
        if (serverIsOnline && !this.requiresSpotifyAccess()) {
            playlists = await getPlaylists(PlayerName.SpotifyWeb);
            if (playlists) {
                // update the type to "playlist";
                playlists.map(item => {
                    item.type = "playlist";
                });
            }
        }

        this.initializedSpotifyPlaylist = true;

        this.spotifyPlaylists = playlists;

        return this.spotifyPlaylists;
    }

    requiresSpotifyAccess() {
        let spotifyAccessToken = getItem("spotify_access_token");
        return spotifyAccessToken ? false : true;
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
        let result = false;
        if (this.spotifyPlaylists.length > 0) {
            for (let i = 0; i < this.spotifyPlaylists.length; i++) {
                const playlist: PlaylistItem = this.spotifyPlaylists[i];

                let foundPlaylist = null;
                for (let i = 0; i < this.savedPlaylists.length; i++) {
                    let savedPlaylist = this.savedPlaylists[i];
                    let savedPlaylistTypeId = parseInt(
                        savedPlaylist["playlistTypeId"],
                        10
                    );
                    if (
                        savedPlaylist.id === playlist.id &&
                        savedPlaylistTypeId === playlistTypeId
                    ) {
                        foundPlaylist = savedPlaylist;
                        break;
                    }
                }

                if (foundPlaylist) {
                    playlist.tag = "paw";
                    result = true;
                }
            }
        }

        return result;
    }

    async getTracksForPlaylistId(playlist_id: string) {
        let trackInfo = await this.getPlaylistTrackInfo(playlist_id);
        return trackInfo.tracks;
    }

    async getPlaylistState(playlist_id: string) {
        let trackInfo = await this.getPlaylistTrackInfo(playlist_id, true);
        return trackInfo.playlist_state;
    }

    async getPlaylistTrackInfo(
        playlist_id: string,
        skipCache: boolean = false
    ) {
        const hasActivePlaylistItems = this.hasActivePlaylistItems();

        if (this.runningTrack.playerType !== this._currentPlayerType) {
            // the player type has changed, clear the map
            this._playlistTracks[playlist_id] = null;
        }
        // don't update the current player type if we're already showing the
        // spotify playlist even if the running track is not defined
        if (!hasActivePlaylistItems) {
            this._currentPlayerType = this.runningTrack.playerType;
        }

        let playlistItems = [];
        let trackInfo = this._playlistTracks[playlist_id];
        if (trackInfo && !skipCache) {
            return trackInfo;
        }

        trackInfo = {
            tracks: [],
            playlist_state: TrackStatus.NotAssigned
        };

        let playlistTracks: CodyResponse;
        let noPlaylistType =
            !this._currentPlayerType ||
            this._currentPlayerType === PlayerType.NotAssigned;

        if (
            noPlaylistType ||
            this._currentPlayerType === PlayerType.WebSpotify
        ) {
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
            let playlist_state = TrackStatus.NotAssigned;
            let paginationItem: PaginationItem = playlistTracks.data;

            if (paginationItem && paginationItem.items) {
                playlistItems = paginationItem.items.map(
                    (track: Track, idx: number) => {
                        let playlistItem: PlaylistItem = new PlaylistItem();
                        playlistItem.type = "track";
                        playlistItem.name = track.name;
                        playlistItem.id = track.id;
                        playlistItem.popularity = track.popularity;
                        playlistItem.played_count = track.played_count;
                        playlistItem.position = idx + 1;
                        playlistItem["artists"] = track.artists.join(", ");
                        playlistItem.playerType = track.playerType;
                        delete playlistItem.tracks;

                        if (track.id === this.runningTrack.id) {
                            playlistItem.state = this.runningTrack.state;
                            this.selectedTrackItem = playlistItem;
                        } else {
                            playlistItem.state = TrackStatus.NotAssigned;
                        }

                        if (
                            playlistItem.state === TrackStatus.Playing ||
                            playlistItem.state === TrackStatus.Paused
                        ) {
                            playlist_state = playlistItem.state;
                        }

                        return playlistItem;
                    }
                );
            }

            trackInfo.tracks = playlistItems;
            trackInfo.playlist_state = playlist_state;

            this._playlistTracks[playlist_id] = trackInfo;
        }
        return trackInfo;
    }

    async createGlobalTopSongsPlaylist() {
        let musicstoreMgr = MusicStoreManager.getInstance();

        // 1st create the empty playlist
        const playlistResult: CodyResponse = await createPlaylist(
            SOFTWARE_TOP_SONGS_NAME,
            true
        );

        if (playlistResult.state === CodyResponseType.Failed) {
            window.showErrorMessage(
                `There was an unexpected error adding tracks to the playlist. ${
                    playlistResult.message
                }`,
                ...["OK"]
            );
            return;
        }

        const playlistId = playlistResult.data.id;

        if (playlistId) {
            await updateSavedPlaylists(
                playlistId,
                2,
                SOFTWARE_TOP_SONGS_NAME
            ).catch(err => {
                logIt("Error updating music time global playlist ID");
            });
        }

        let globalFavs: any[] = musicstoreMgr.globalFavorites;
        if (globalFavs && globalFavs.length > 0) {
            let tracksToAdd: string[] = globalFavs.map(item => {
                return item.uri;
            });
            await addTracks(
                playlistResult.data.id,
                SOFTWARE_TOP_SONGS_NAME,
                tracksToAdd
            );
        }

        // refresh the playlists
        musicstoreMgr.refreshPlaylists();
    }

    async generateUsersWeeklyTopSongs() {
        const existingPersonalPlaylist = this.getExistingPesonalPlaylist();

        let playlistId = null;
        if (!existingPersonalPlaylist) {
            let playlistResult: CodyResponse = await createPlaylist(
                PERSONAL_TOP_SONGS_NAME,
                true
            );

            if (playlistResult.state === CodyResponseType.Failed) {
                window.showErrorMessage(
                    `There was an unexpected error adding tracks to the playlist. ${
                        playlistResult.message
                    }`,
                    ...["OK"]
                );
                return;
            }

            playlistId = playlistResult.data.id;

            await updateSavedPlaylists(
                playlistId,
                1,
                PERSONAL_TOP_SONGS_NAME
            ).catch(err => {
                logIt("Error updating music time global playlist ID");
            });
        } else {
            // get the spotify playlist id from the app's existing playlist info
            playlistId = existingPersonalPlaylist.id;
        }

        let musicstoreMgr = MusicStoreManager.getInstance();
        // get the spotify track ids and create the playlist
        let codingFavs: any[] = musicstoreMgr.userFavorites;
        if (!codingFavs || codingFavs.length === 0) {
            await this.syncUsersWeeklyTopSongs();
            codingFavs = musicstoreMgr.userFavorites;
        }
        if (codingFavs && codingFavs.length > 0) {
            if (playlistId) {
                // add the tracks
                // list of [{uri, artist, name}...]
                const codingFavs: any[] = musicstoreMgr.userFavorites;
                if (codingFavs && codingFavs.length > 0) {
                    let tracksToAdd: string[] = codingFavs.map(item => {
                        return item.uri;
                    });

                    if (!existingPersonalPlaylist) {
                        await addTracks(
                            playlistId,
                            PERSONAL_TOP_SONGS_NAME,
                            tracksToAdd
                        );
                    } else {
                        await replacePlaylistTracks(
                            playlistId,
                            tracksToAdd
                        ).catch(err => {
                            logIt(
                                `Error replacing tracks, error: ${err.message}`
                            );
                        });
                    }
                }
            }
        }
        // refresh the playlists
        musicstoreMgr.refreshPlaylists();
    }
}

async function updateSavedPlaylists(
    playlist_id: string,
    playlistTypeId: number,
    name: string
) {
    // i.e. playlistTypeId 1 = TOP_PRODUCIVITY_TRACKS
    // playlistTypeId 2 = SOFTWARE_TOP_SONGS_NAME
    const payload = {
        playlist_id,
        playlistTypeId,
        name
    };
    let createResult = await softwarePost(
        "/music/playlist",
        payload,
        getItem("jwt")
    );

    return createResult;
}

async function addTracks(
    playlist_id: string,
    name: string,
    tracksToAdd: string[]
) {
    if (playlist_id) {
        // create the playlist_id in software
        const addTracksResult: CodyResponse = await addTracksToPlaylist(
            playlist_id,
            tracksToAdd
        );

        if (addTracksResult.state === CodyResponseType.Success) {
            window.showInformationMessage(
                `Successfully created ${name} and added tracks.`,
                ...["OK"]
            );
        } else {
            window.showErrorMessage(
                `There was an unexpected error adding tracks to the playlist. ${
                    addTracksResult.message
                }`,
                ...["OK"]
            );
        }
    }
}
