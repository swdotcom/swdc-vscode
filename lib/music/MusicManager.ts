import {
    PlaylistItem,
    PlayerType,
    PlayerName,
    getPlaylists,
    TrackStatus,
    Track,
    CodyResponse,
    getPlaylistTracks,
    PaginationItem,
    CodyResponseType,
    getSpotifyLikedSongs,
    PlaylistTrackInfo,
    getRunningTrack,
    createPlaylist,
    addTracksToPlaylist,
    replacePlaylistTracks,
    CodyConfig,
    setConfig,
    getUserProfile,
    getSpotifyDevices,
    launchPlayer,
    PlayerDevice,
    quitMacPlayer
} from "cody-music";
import {
    PERSONAL_TOP_SONGS_NAME,
    SOFTWARE_TOP_SONGS_NAME,
    PERSONAL_TOP_SONGS_PLID,
    SOFTWARE_TOP_SONGS_PLID,
    REFRESH_CUSTOM_PLAYLIST_TITLE,
    GENERATE_CUSTOM_PLAYLIST_TITLE,
    REFRESH_CUSTOM_PLAYLIST_TOOLTIP,
    GENERATE_CUSTOM_PLAYLIST_TOOLTIP,
    SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET,
    GENERATE_GLOBAL_PLAYLIST_TITLE,
    GENERATE_GLOBAL_PLAYLIST_TOOLTIP,
    SPOTIFY_LIKED_SONGS_PLAYLIST_NAME,
    LOGIN_LABEL
} from "../Constants";
import { commands, window } from "vscode";
import {
    serverIsAvailable,
    getSpotifyOauth,
    getSlackOauth,
    getLoggedInCacheState,
    getUserStatus
} from "../DataController";
import { getItem, logIt, setItem, launchLogin } from "../Util";
import {
    isResponseOk,
    softwareGet,
    softwarePost,
    softwareDelete,
    softwarePut
} from "../HttpClient";
import { SpotifyUser } from "cody-music/dist/lib/profile";
import { MusicCommandManager } from "./MusicCommandManager";
import { MusicControlManager } from "./MusicControlManager";

export class MusicManager {
    private static instance: MusicManager;

    private _itunesPlaylists: PlaylistItem[] = [];
    private _spotifyPlaylists: PlaylistItem[] = [];
    private _playlistMap: {} = {};
    private _savedPlaylists: PlaylistItem[] = [];
    private _musictimePlaylists: PlaylistItem[] = [];
    private _softwareTopSongs: any[] = [];
    private _userTopSongs: any[] = [];
    private _playlistTrackMap: any = {};
    private _runningTrack: Track = null;
    // default to starting with spotify
    private _currentPlayerName: PlayerName = PlayerName.SpotifyWeb;
    private _selectedTrackItem: PlaylistItem = null;
    private _selectedPlaylist: PlaylistItem = null;
    private _spotifyUser: SpotifyUser = null;
    private _buildingPlaylists: boolean = false;
    private _serverTrack: Track = null;
    private _initialized: boolean = false;

    private constructor() {
        //
    }
    static getInstance(): MusicManager {
        if (!MusicManager.instance) {
            MusicManager.instance = new MusicManager();
        }

        return MusicManager.instance;
    }

    get musictimePlaylists() {
        return this._musictimePlaylists;
    }

    get buildingPlaylists() {
        return this._buildingPlaylists;
    }

    set runningTrack(track: Track) {
        this._runningTrack = track;
    }

    get runningTrack(): Track {
        return this._runningTrack;
    }

    get savedPlaylists(): PlaylistItem[] {
        return this._savedPlaylists;
    }

    get userTopSongs(): PlaylistItem[] {
        return this._userTopSongs;
    }

    get spotifyUser(): SpotifyUser {
        return this._spotifyUser;
    }

    set spotifyUser(user: SpotifyUser) {
        this._spotifyUser = user;
    }

    get selectedPlaylist(): PlaylistItem {
        return this._selectedPlaylist;
    }

    set selectedPlaylist(playlist: PlaylistItem) {
        this._selectedPlaylist = playlist;
    }

    get selectedTrackItem(): PlaylistItem {
        return this._selectedTrackItem;
    }

    set selectedTrackItem(trackItem: PlaylistItem) {
        this._selectedTrackItem = trackItem;
    }

    get currentPlayerName(): PlayerName {
        return this._currentPlayerName;
    }

    set currentPlayerName(playerName: PlayerName) {
        this._currentPlayerName = playerName;
    }

    get serverTrack(): Track {
        return this._serverTrack;
    }

    set serverTrack(track: Track) {
        this._serverTrack = track;
    }

    get currentPlaylists(): PlaylistItem[] {
        if (this._currentPlayerName === PlayerName.ItunesDesktop) {
            return this._itunesPlaylists;
        }
        return this._spotifyPlaylists;
    }

    //
    // Clear all of the playlists and tracks
    //
    clearPlaylists() {
        this._itunesPlaylists = [];
        this._spotifyPlaylists = [];
        this._playlistMap = {};
        this._musictimePlaylists = [];
        this._playlistTrackMap = {};
    }

    clearSavedPlaylists() {
        this._savedPlaylists = [];
    }

    clearSpotify() {
        this._spotifyPlaylists = [];
        this._playlistMap = {};
        this._playlistTrackMap = {};
    }

    tryRefreshAgain() {
        this.refreshPlaylists();
    }

    async refreshPlaylists() {
        if (this._buildingPlaylists) {
            // try again in a second
            setTimeout(() => {
                this.tryRefreshAgain();
            }, 1000);
        }
        this._buildingPlaylists = true;

        let serverIsOnline = await serverIsAvailable();
        this._runningTrack = await getRunningTrack();
        if (
            !this._initialized &&
            this._runningTrack.playerType === PlayerType.MacItunesDesktop
        ) {
            this._currentPlayerName = PlayerName.ItunesDesktop;
        }
        this._initialized = true;

        if (this._currentPlayerName === PlayerName.ItunesDesktop) {
            await this.showItunesPlaylists(serverIsOnline);
        } else {
            await this.showSpotifyPlaylists(serverIsOnline);
        }
        MusicCommandManager.syncControls(this._runningTrack);

        // update the context showing that the track play/pause is ready
        // commands.executeCommand("setContext", "trackReady", true);

        this._buildingPlaylists = false;
    }

    getPlaylistById(playlist_id: string) {
        return this._playlistMap[playlist_id];
    }

    async refreshPlaylistState() {
        if (this._spotifyPlaylists.length > 0) {
            this._spotifyPlaylists.forEach(async playlist => {
                let playlistItemTracks: PlaylistItem[] = this._playlistTrackMap[
                    playlist.id
                ];

                if (playlistItemTracks && playlistItemTracks.length > 0) {
                    let playlistState = await this.getPlaylistState(
                        playlist.id
                    );
                    playlist.state = playlistState;
                }
            });
        }

        if (this._itunesPlaylists.length > 0) {
            this._itunesPlaylists.forEach(async playlist => {
                let playlistItemTracks: PlaylistItem[] = this._playlistTrackMap[
                    playlist.id
                ];

                if (playlistItemTracks && playlistItemTracks.length > 0) {
                    let playlistState = await this.getPlaylistState(
                        playlist.id
                    );
                    playlist.state = playlistState;
                }
            });
        }
    }

    private async showItunesPlaylists(serverIsOnline) {
        let foundPlaylist = this._itunesPlaylists.find(element => {
            return element.type === "playlist";
        });
        // if no playlists are found for itunes, then fetch
        if (!foundPlaylist) {
            await this.refreshPlaylistForPlayer(
                PlayerName.ItunesDesktop,
                serverIsOnline
            );
        }
    }

    private async showSpotifyPlaylists(serverIsOnline) {
        // if no playlists are found for spotify, then fetch
        let foundPlaylist = this._spotifyPlaylists.find(element => {
            return element.type === "playlist";
        });
        if (!foundPlaylist) {
            await this.refreshPlaylistForPlayer(
                PlayerName.SpotifyWeb,
                serverIsOnline
            );
        }
    }

    //
    // Fetch the playlist names for a specific player
    //
    private async refreshPlaylistForPlayer(
        playerName: PlayerName,
        serverIsOnline: boolean
    ) {
        let items: PlaylistItem[] = [];

        let needsSpotifyAccess = this.requiresSpotifyAccess();

        let playlists: PlaylistItem[] = [];
        let type = "spotify";
        if (playerName === PlayerName.ItunesDesktop) {
            type = "itunes";
        }
        playlists = await getPlaylists(playerName);

        if (this._savedPlaylists.length === 0) {
            // fetch and reconcile the saved playlists against the spotify list
            await this.fetchSavedPlaylists(serverIsOnline);
        }

        // sort
        this.sortPlaylists(playlists);

        // go through each playlist and find out it's state
        if (playlists && playlists.length > 0) {
            for (let i = 0; i < playlists.length; i++) {
                let playlist = playlists[i];
                this._playlistMap[playlist.id] = playlist;
                let playlistItemTracks: PlaylistItem[] = this._playlistTrackMap[
                    playlist.id
                ];

                if (playlistItemTracks && playlistItemTracks.length > 0) {
                    let playlistState = await this.getPlaylistState(
                        playlist.id
                    );
                    playlist.state = playlistState;
                }
                playlist["itemType"] = "playlist";
                playlist.tag = type;
            }
        }

        // filter out the music time playlists into it's own list if we have any
        this.retrieveMusicTimePlaylist(playlists);

        // add the buttons to the playlist
        await this.addSoftwareLoginButtonIfRequired(serverIsOnline, items);

        // add the no music time connection button if we're not online
        if (!serverIsOnline) {
            items.push(this.getNoMusicTimeConnectionButton());
        }

        // add the connect to spotify if they still need to connect
        if (needsSpotifyAccess) {
            items.push(this.getConnectToSpotifyButton());
        }

        if (playerName === PlayerName.ItunesDesktop) {
            // add the action items specific to itunes
            items.push(this.getItunesConnectedButton());
            items.push(this.getSwitchToSpotifyButton());

            if (playlists.length > 0) {
                items.push(this.getLineBreakButton());
            }

            playlists.forEach(item => {
                items.push(item);
            });

            this._itunesPlaylists = items;
        } else {
            // add the action items specific to spotify
            if (!needsSpotifyAccess) {
                playlists.push(this.getSpotifyLikedPlaylistFolder());
                items.push(this.getSpotifyConnectedButton());
            }
            items.push(this.getSwitchToItunesButton());

            // get the custom playlist button
            if (serverIsOnline && !needsSpotifyAccess) {
                items.push(this.getLineBreakButton());

                if (!this.globalPlaylistIdExists()) {
                    // server is online, we have spotify access, and no global playlist exists.
                    // auto-create the global top 40
                    setTimeout(() => {
                        commands.executeCommand(
                            "musictime.generateGlobalPlaylist"
                        );
                    }, 1000 * 2);
                }

                const customPlaylistButton: PlaylistItem = this.getCustomPlaylistButton();
                if (customPlaylistButton) {
                    items.push(customPlaylistButton);
                }
            }

            // add the music time playlists that were found
            if (
                this._musictimePlaylists &&
                this._musictimePlaylists.length > 0
            ) {
                for (let i = 0; i < this._musictimePlaylists.length; i++) {
                    const musicTimePlaylist = this._musictimePlaylists[i];
                    musicTimePlaylist.tag = "paw";
                    items.push(musicTimePlaylist);
                }
            }

            if (playlists.length > 0) {
                items.push(this.getLineBreakButton());
            }

            playlists.forEach(item => {
                items.push(item);
            });

            this._spotifyPlaylists = items;
        }
    }

    sortPlaylists(playlists) {
        if (playlists && playlists.length > 0) {
            playlists.sort((a: PlaylistItem, b: PlaylistItem) => {
                const nameA = a.name.toLowerCase(),
                    nameB = b.name.toLowerCase();
                if (nameA < nameB)
                    //sort string ascending
                    return -1;
                if (nameA > nameB) return 1;
                return 0; //default return value (no sorting)
            });
        }
    }

    async addSoftwareLoginButtonIfRequired(
        serverIsOnline,
        items: PlaylistItem[]
    ) {
        let loggedInCacheState = getLoggedInCacheState();
        let userStatus = {
            loggedIn: loggedInCacheState
        };
        if (loggedInCacheState === null) {
            // update it since it's null
            // {loggedIn: true|false}
            userStatus = await getUserStatus(serverIsOnline);
        }

        if (!userStatus.loggedIn) {
            items.push(this.getSoftwareLoginButton());
        }
    }

    getSpotifyLikedPlaylistFolder() {
        const item: PlaylistItem = new PlaylistItem();
        item.type = "playlist";
        item.id = SPOTIFY_LIKED_SONGS_PLAYLIST_NAME;
        item.tracks = new PlaylistTrackInfo();
        // set set a number so it shows up
        item.tracks.total = 1;
        item.playerType = PlayerType.WebSpotify;
        item.tag = "spotify";
        item["itemType"] = "playlist";
        item.name = SPOTIFY_LIKED_SONGS_PLAYLIST_NAME;
        return item;
    }

    getNoMusicTimeConnectionButton() {
        return this.buildActionItem(
            "offline",
            "offline",
            null,
            PlayerType.NotAssigned,
            "Music Time Offline",
            "Unable to connect to Music Time"
        );
    }

    getSpotifyConnectedButton() {
        return this.buildActionItem(
            "spotifyconnected",
            "connected",
            null,
            PlayerType.WebSpotify,
            "Spotify Connected",
            "You've connected Spotify"
        );
    }

    getItunesConnectedButton() {
        return this.buildActionItem(
            "itunesconnected",
            "connected",
            null,
            PlayerType.MacItunesDesktop,
            "iTunes Connected",
            "You've connected iTunes"
        );
    }

    getConnectToSpotifyButton() {
        return this.buildActionItem(
            "connectspotify",
            "spotify",
            "musictime.connectSpotify",
            PlayerType.WebSpotify,
            "Connect Spotify",
            "Connect Spotify to view your playlists"
        );
    }

    getSoftwareLoginButton() {
        return this.buildActionItem(
            "login",
            "login",
            null,
            PlayerType.NotAssigned,
            LOGIN_LABEL,
            "To see your music data in Music Time, please log in to your account",
            null,
            launchLogin
        );
    }

    getSwitchToSpotifyButton() {
        return this.buildActionItem(
            "title",
            "spotify",
            "musictime.launchSpotify",
            PlayerType.WebSpotify,
            "Switch to Spotify"
        );
    }

    getSwitchToItunesButton() {
        return this.buildActionItem(
            "title",
            "itunes",
            "musictime.launchItunes",
            PlayerType.MacItunesDesktop,
            "Switch to iTunes"
        );
    }

    getLineBreakButton() {
        return this.buildActionItem(
            "title",
            "",
            null,
            PlayerType.NotAssigned,
            "--------------------",
            ""
        );
    }

    buildActionItem(
        id,
        type,
        command,
        playerType: PlayerType,
        name,
        tooltip = "",
        itemType: string = "",
        callback: any = null
    ) {
        let item: PlaylistItem = new PlaylistItem();
        item.tracks = new PlaylistTrackInfo();
        item.type = type;
        item.id = id;
        item.command = command;
        item["cb"] = callback;
        item.playerType = playerType;
        item.name = name;
        item.tooltip = tooltip;
        item["itemType"] = itemType;

        return item;
    }

    //
    // Fetch the playlist overall state
    //
    async getPlaylistState(playlist_id: string): Promise<TrackStatus> {
        let playlistState: TrackStatus = TrackStatus.NotAssigned;

        const playlistTrackItems: PlaylistItem[] = await this.getPlaylistItemTracksForPlaylistId(
            playlist_id
        );

        if (playlistTrackItems && playlistTrackItems.length > 0) {
            for (let i = 0; i < playlistTrackItems.length; i++) {
                const playlistItem: PlaylistItem = playlistTrackItems[i];
                if (playlistItem.id === this._runningTrack.id) {
                    return this._runningTrack.state;
                } else {
                    // update theis track status to not assigned to ensure it's also updated
                    playlistItem.state = TrackStatus.NotAssigned;
                }
            }
        }

        return playlistState;
    }

    clearPlaylistTracksForId(playlist_id) {
        this._playlistTrackMap[playlist_id] = null;
    }

    //
    // Fetch the tracks for a given playlist ID
    //
    async getPlaylistItemTracksForPlaylistId(
        playlist_id: string
    ): Promise<PlaylistItem[]> {
        let playlistItemTracks: PlaylistItem[] = this._playlistTrackMap[
            playlist_id
        ];

        if (!playlistItemTracks || playlistItemTracks.length === 0) {
            if (this._currentPlayerName === PlayerName.ItunesDesktop) {
                // get the itunes tracks based on this playlist id name
                const codyResp: CodyResponse = await getPlaylistTracks(
                    PlayerName.ItunesDesktop,
                    playlist_id
                );
                playlistItemTracks = this.getPlaylistItemTracksFromCodyResponse(
                    codyResp
                );
            } else {
                // fetch from spotify web
                if (playlist_id === SPOTIFY_LIKED_SONGS_PLAYLIST_NAME) {
                    let tracks: Track[] = await getSpotifyLikedSongs();
                    playlistItemTracks = this.getPlaylistItemTracksFromTracks(
                        tracks
                    );
                } else {
                    // get the playlist tracks from the spotify api
                    const codyResp: CodyResponse = await getPlaylistTracks(
                        PlayerName.SpotifyWeb,
                        playlist_id
                    );
                    playlistItemTracks = this.getPlaylistItemTracksFromCodyResponse(
                        codyResp
                    );
                }
            }

            // update the map
            this._playlistTrackMap[playlist_id] = playlistItemTracks;
        }

        if (playlistItemTracks && playlistItemTracks.length > 0) {
            for (let i = 0; i < playlistItemTracks.length; i++) {
                playlistItemTracks[i]["playlist_id"] = playlist_id;
            }
        }

        return playlistItemTracks;
    }

    //
    // Build the playlist items from the list of tracks
    //
    getPlaylistItemTracksFromTracks(tracks: Track[]): PlaylistItem[] {
        let playlistItems: PlaylistItem[] = [];
        if (tracks && tracks.length > 0) {
            for (let i = 0; i < tracks.length; i++) {
                let track = tracks[i];
                const position = i + 1;
                let playlistItem: PlaylistItem = this.createPlaylistItemFromTrack(
                    track,
                    position
                );
                playlistItems.push(playlistItem);
            }
        }
        return playlistItems;
    }

    getPlaylistItemTracksFromCodyResponse(
        codyResponse: CodyResponse
    ): PlaylistItem[] {
        let playlistItems: PlaylistItem[] = [];
        if (codyResponse && codyResponse.state === CodyResponseType.Success) {
            let paginationItem: PaginationItem = codyResponse.data;

            if (paginationItem && paginationItem.items) {
                playlistItems = paginationItem.items.map(
                    (track: Track, idx: number) => {
                        const position = idx + 1;
                        let playlistItem: PlaylistItem = this.createPlaylistItemFromTrack(
                            track,
                            position
                        );

                        return playlistItem;
                    }
                );
            }
        }

        return playlistItems;
    }

    createPlaylistItemFromTrack(track: Track, position: number) {
        let playlistItem: PlaylistItem = new PlaylistItem();
        playlistItem.type = "track";
        playlistItem.name = track.name;
        playlistItem.id = track.id;
        playlistItem.popularity = track.popularity;
        playlistItem.played_count = track.played_count;
        playlistItem.position = position;
        playlistItem["artist"] = track.artist;
        playlistItem.playerType = track.playerType;
        playlistItem["itemType"] = "track";
        delete playlistItem.tracks;

        if (track.id === this._runningTrack.id) {
            playlistItem.state = this._runningTrack.state;
            this._selectedTrackItem = playlistItem;
        } else {
            playlistItem.state = TrackStatus.NotAssigned;
        }
        return playlistItem;
    }

    requiresSpotifyAccess() {
        let spotifyAccessToken = getItem("spotify_access_token");
        return spotifyAccessToken ? false : true;
    }

    // get the custom playlist button by checkinf if the custom playlist
    // exists or not. if it doesn't exist then it will show the create label,
    // otherwise, it will show the refresh label
    getCustomPlaylistButton() {
        // update the existing playlist that matches the personal playlist with a paw if found
        const customPlaylist = this.getMusicTimePlaylistByTypeId(
            PERSONAL_TOP_SONGS_PLID
        );

        const personalPlaylistLabel = !customPlaylist
            ? GENERATE_CUSTOM_PLAYLIST_TITLE
            : REFRESH_CUSTOM_PLAYLIST_TITLE;
        const personalPlaylistTooltip = !customPlaylist
            ? GENERATE_CUSTOM_PLAYLIST_TOOLTIP
            : REFRESH_CUSTOM_PLAYLIST_TOOLTIP;

        if (
            this._currentPlayerName === PlayerName.SpotifyWeb &&
            !this.requiresSpotifyAccess()
        ) {
            // add the connect spotify link
            let listItem: PlaylistItem = new PlaylistItem();
            listItem.tracks = new PlaylistTrackInfo();
            listItem.type = "action";
            listItem.tag = "action";
            listItem.id = "codingfavorites";
            listItem.command = "musictime.generateWeeklyPlaylist";
            listItem.playerType = PlayerType.WebSpotify;
            listItem.name = personalPlaylistLabel;
            listItem.tooltip = personalPlaylistTooltip;
            return listItem;
        }
        return null;
    }

    /**
     * Checks if the user's spotify playlists contains either
     * the global top 40 or the user's coding favorites playlist.
     * The playlistTypeId is used to match the set ID from music time
     * app. 1 = user's coding favorites, 2 = global top 40
     */
    getMusicTimePlaylistByTypeId(playlistTypeId: number) {
        if (this._musictimePlaylists.length > 0) {
            for (let i = 0; i < this._musictimePlaylists.length; i++) {
                const playlist = this._musictimePlaylists[i];
                const typeId = parseInt(playlist["playlistTypeId"], 10);
                if (typeId === playlistTypeId) {
                    return playlist;
                }
            }
        }
        return null;
    }

    /**
     * Checks if the user's spotify playlists contains either
     * the global top 40 or the user's coding favorites playlist.
     * The playlistTypeId is used to match the set ID from music time
     * app. 1 = user's coding favorites, 2 = global top 40
     */
    retrieveMusicTimePlaylist(playlists: PlaylistItem[]) {
        if (this._savedPlaylists.length > 0 && playlists.length > 0) {
            for (let i = 0; i < this._savedPlaylists.length; i++) {
                let savedPlaylist: PlaylistItem = this._savedPlaylists[i];
                let savedPlaylistTypeId = parseInt(
                    savedPlaylist["playlistTypeId"],
                    10
                );

                for (let x = playlists.length - 1; x >= 0; x--) {
                    let playlist = playlists[x];
                    if (playlist.id === savedPlaylist.id) {
                        playlist["playlistTypeId"] = savedPlaylistTypeId;
                        playlist.tag = "paw";
                        playlists.splice(x, 1);
                        this._musictimePlaylists.push(playlist);
                        break;
                    }
                }
            }
        } else {
            this._musictimePlaylists = [];
        }
    }

    /**
     * Returns whether we've created the global playlist or not.
     */
    globalPlaylistIdExists() {
        if (this._savedPlaylists.length > 0) {
            for (let i = 0; i < this._savedPlaylists.length; i++) {
                let savedPlaylist: PlaylistItem = this._savedPlaylists[i];
                let savedPlaylistTypeId = parseInt(
                    savedPlaylist["playlistTypeId"],
                    10
                );
                if (savedPlaylistTypeId === SOFTWARE_TOP_SONGS_PLID) {
                    return true;
                }
            }
        }
        return false;
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

                console.log("found the following saved playlists: ", playlists);
            }
        }
        this._savedPlaylists = playlists;
    }

    async syncGlobalTopSongs() {
        const response = await softwareGet(
            "/music/playlist/favorites?global=true",
            getItem("jwt")
        );

        if (isResponseOk(response) && response.data.length > 0) {
            this._softwareTopSongs = response.data;
        } else {
            // clear the favorites
            this._softwareTopSongs = [];
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
            this._userTopSongs = response.data;
        } else {
            // clear the favorites
            this._userTopSongs = [];
        }
    }

    async createOrRefreshGlobalTopSongsPlaylist() {
        const serverIsOnline = serverIsAvailable();

        if (!serverIsOnline) {
            window.showInformationMessage(
                "Our service is temporarily unavailable, please try again later."
            );
            return;
        }

        if (this.requiresSpotifyAccess()) {
            // don't create or refresh, no spotify access provided
            return;
        }

        // get the global top songs
        await this.syncGlobalTopSongs();

        let globalPlaylist = this.getMusicTimePlaylistByTypeId(
            SOFTWARE_TOP_SONGS_PLID
        );

        let playlistId = null;
        if (!globalPlaylist) {
            console.log("global playlist doesn't exist, creating it");
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

            playlistId = playlistResult.data.id;

            if (playlistId) {
                await this.updateSavedPlaylists(
                    playlistId,
                    2,
                    SOFTWARE_TOP_SONGS_NAME
                ).catch(err => {
                    logIt("Error updating music time global playlist ID");
                });
            }
        } else {
            // global playlist exists, get the id to refresh
            console.log("global playlist exists, refreshing the list");
            playlistId = globalPlaylist.id;
        }

        if (this._softwareTopSongs && this._softwareTopSongs.length > 0) {
            let tracksToAdd: string[] = this._softwareTopSongs.map(item => {
                return item.trackId;
            });
            console.log("setting global playlist with tracks: ", tracksToAdd);
            if (tracksToAdd && tracksToAdd.length > 0) {
                if (!globalPlaylist) {
                    // no global playlist, add the tracks for the 1st time
                    await this.addTracks(
                        playlistId,
                        SOFTWARE_TOP_SONGS_NAME,
                        tracksToAdd
                    );
                } else {
                    // it exists, refresh it with new tracks
                    await replacePlaylistTracks(playlistId, tracksToAdd).catch(
                        err => {
                            logIt(
                                `Error replacing tracks, error: ${err.message}`
                            );
                        }
                    );
                }
            }
        }

        await this.fetchSavedPlaylists(serverIsOnline);
    }

    async generateUsersWeeklyTopSongs() {
        const serverIsOnline = serverIsAvailable();

        if (!serverIsOnline) {
            window.showInformationMessage(
                "Our service is temporarily unavailable, please try again later."
            );
            return;
        }

        if (this.requiresSpotifyAccess()) {
            // don't create or refresh, no spotify access provided
            return;
        }

        let customPlaylist = this.getMusicTimePlaylistByTypeId(
            PERSONAL_TOP_SONGS_PLID
        );

        // sync the user's weekly top songs
        await this.syncUsersWeeklyTopSongs();

        let playlistId = null;
        if (!customPlaylist) {
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

            await this.updateSavedPlaylists(
                playlistId,
                1,
                PERSONAL_TOP_SONGS_NAME
            ).catch(err => {
                logIt("Error updating music time global playlist ID");
            });
        } else {
            // get the spotify playlist id from the app's existing playlist info
            playlistId = customPlaylist.id;
        }

        // get the spotify track ids and create the playlist
        if (playlistId) {
            // add the tracks
            // list of [{trackId, artist, name}...]
            if (this._userTopSongs && this._userTopSongs.length > 0) {
                let tracksToAdd: string[] = this._userTopSongs.map(item => {
                    return item.trackId;
                });

                if (!customPlaylist) {
                    await this.addTracks(
                        playlistId,
                        PERSONAL_TOP_SONGS_NAME,
                        tracksToAdd
                    );
                } else {
                    await replacePlaylistTracks(playlistId, tracksToAdd).catch(
                        err => {
                            logIt(
                                `Error replacing tracks, error: ${err.message}`
                            );
                        }
                    );
                }
            }
        }

        await this.fetchSavedPlaylists(serverIsOnline);
    }

    async addTracks(playlist_id: string, name: string, tracksToAdd: string[]) {
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

                setTimeout(() => {
                    this.clearSpotify();
                    commands.executeCommand("musictime.refreshPlaylist");
                }, 1000);
            } else {
                window.showErrorMessage(
                    `There was an unexpected error adding tracks to the playlist. ${
                        addTracksResult.message
                    }`,
                    ...["OK"]
                );
            }

            commands.executeCommand("musictime.refreshPlaylist");
        }
    }

    async updateSavedPlaylists(
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
        let jwt = getItem("jwt");
        let createResult = await softwarePost("/music/playlist", payload, jwt);

        return createResult;
    }

    async initializeSlack() {
        if (!getItem("slack_access_token")) {
            const serverIsOnline = await serverIsAvailable();
            const spotifyOauth = await getSlackOauth(serverIsOnline);
            if (spotifyOauth) {
                // update the CodyMusic credentials
                this.updateSlackAccessInfo(spotifyOauth);
            } else {
                setItem("slack_access_token", null);
            }
        }
    }

    async updateSlackAccessInfo(slackOauth) {
        /**
         * Slack:
         * {name, email, login, slack_id, permissions, slack_scopes, slack_access_token}
         */
        if (slackOauth) {
            setItem("slack_access_token", slackOauth.slack_access_token);
        }
    }

    async initializeSpotify() {
        if (
            !getItem("spotify_access_token") ||
            !getItem("spotify_refresh_token")
        ) {
            const serverIsOnline = await serverIsAvailable();
            const spotifyOauth = await getSpotifyOauth(serverIsOnline);
            if (spotifyOauth) {
                // update the CodyMusic credentials
                this.updateSpotifyAccessInfo(spotifyOauth);
            } else {
                setItem("spotify_access_token", null);
                setItem("spotify_refresh_token", null);
            }
        } else {
            const spotifyOauth = {
                spotify_access_token: getItem("spotify_access_token"),
                spotify_refresh_token: getItem("spotify_refresh_token")
            };
            this.updateSpotifyAccessInfo(spotifyOauth);
        }
    }

    async updateSpotifyAccessInfo(spotifyOauth) {
        if (spotifyOauth) {
            // update the CodyMusic credentials
            let codyConfig: CodyConfig = new CodyConfig();
            codyConfig.spotifyClientId = SPOTIFY_CLIENT_ID;
            codyConfig.spotifyAccessToken = spotifyOauth.spotify_access_token;
            codyConfig.spotifyRefreshToken = spotifyOauth.spotify_refresh_token;
            codyConfig.spotifyClientSecret = SPOTIFY_CLIENT_SECRET;
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
        codyConfig.spotifyClientId = SPOTIFY_CLIENT_ID;
        codyConfig.spotifyAccessToken = null;
        codyConfig.spotifyRefreshToken = null;
        codyConfig.spotifyClientSecret = SPOTIFY_CLIENT_SECRET;
        setConfig(codyConfig);
        this._spotifyUser = null;
    }

    // reconcile. meaning the user may have deleted the lists our 2 buttons created;
    // global and custom.  We'll remove them from our db if we're unable to find a matching
    // playlist_id we have saved.
    async reconcilePlaylists() {
        // fetch what we have from the app
        if (this._savedPlaylists.length > 0) {
            const currentSpotifyPlaylists = await getPlaylists(
                PlayerName.SpotifyWeb
            );
            this._savedPlaylists.map(async savedPlaylist => {
                let foundItem = currentSpotifyPlaylists.find(element => {
                    return element.id === savedPlaylist.id;
                });
                // the backend should protect this from deleting the global top 40
                // as we're unsure if the playlist we're about to reconcile/delete
                // is the custom playlist or global top 40
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

    async launchTrackPlayer(playerName: PlayerName = null) {
        // update the current player type to what was selected
        if (this._currentPlayerName === PlayerName.ItunesDesktop) {
            this._currentPlayerName = PlayerName.SpotifyWeb;
        } else {
            this._currentPlayerName = PlayerName.ItunesDesktop;
        }

        // launch the player
        const musicCtrlMgr = new MusicControlManager();
        if (!playerName) {
            await getRunningTrack().then(async (track: Track) => {
                if (track && track.id) {
                    let options = {
                        trackId: track.id
                    };
                    let playerType: PlayerType = track.playerType;
                    const spotifyDevices: PlayerDevice[] = await getSpotifyDevices();

                    if (
                        playerType === PlayerType.WebSpotify &&
                        spotifyDevices &&
                        spotifyDevices.length === 1 &&
                        !spotifyDevices[0].name.includes("Web Player")
                    ) {
                        // launch the spotify desktop only if we have
                        playerType = PlayerType.MacSpotifyDesktop;
                    }
                    if (playerType === PlayerType.NotAssigned) {
                        playerType = PlayerType.WebSpotify;
                    }

                    if (playerType === PlayerType.WebSpotify) {
                        launchPlayer(PlayerName.SpotifyWeb, options);
                    } else if (playerType === PlayerType.MacItunesDesktop) {
                        launchPlayer(PlayerName.ItunesDesktop, options);
                    } else {
                        launchPlayer(PlayerName.SpotifyDesktop, options);
                    }
                }
            });
        } else if (playerName === PlayerName.ItunesDesktop) {
            if (
                this._runningTrack &&
                this._runningTrack.playerType !== PlayerType.MacItunesDesktop
            ) {
                // end the spotify web track
                musicCtrlMgr.pause(PlayerName.SpotifyWeb);
            }
            launchPlayer(PlayerName.ItunesDesktop);
        } else {
            // end the itunes track
            // musicCtrlMgr.pause(PlayerName.ItunesDesktop);
            // quit the app
            await quitMacPlayer(PlayerName.ItunesDesktop);
            const spotifyDevices: PlayerDevice[] = await getSpotifyDevices();
            if (!spotifyDevices || spotifyDevices.length === 0) {
                this.launchSpotifyPlayer();
            }
        }

        this.clearPlaylists();
        commands.executeCommand("musictime.refreshPlaylist");
    }

    launchSpotifyPlayer() {
        window.showInformationMessage(
            `After you select and play your first song in Spotify, standard controls (play, pause, next, etc.) will appear in your status bar.`,
            ...["OK"]
        );
        setTimeout(() => {
            launchPlayer(PlayerName.SpotifyWeb);
        }, 3200);
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
                const api = `/music/spotify/track/${trackId}/type/${type}?name=${trackName}&artist=${trackArtist}`;
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
}
