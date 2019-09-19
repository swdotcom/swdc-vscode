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
    launchPlayer,
    quitMacPlayer,
    isPlayerRunning,
    getSpotifyDevices,
    PlayerDevice,
    getSpotifyPlaylist,
    isItunesDesktopEnabled
} from "cody-music";
import {
    PERSONAL_TOP_SONGS_NAME,
    PERSONAL_TOP_SONGS_PLID,
    REFRESH_CUSTOM_PLAYLIST_TITLE,
    GENERATE_CUSTOM_PLAYLIST_TITLE,
    REFRESH_CUSTOM_PLAYLIST_TOOLTIP,
    GENERATE_CUSTOM_PLAYLIST_TOOLTIP,
    SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET,
    SPOTIFY_LIKED_SONGS_PLAYLIST_NAME,
    LOGIN_LABEL,
    SOFTWARE_TOP_40_PLAYLIST_ID
} from "../Constants";
import { commands, window } from "vscode";
import {
    serverIsAvailable,
    getSpotifyOauth,
    getSlackOauth,
    getLoggedInCacheState,
    getUserStatus
} from "../DataController";
import { getItem, setItem, launchLogin, isMac } from "../Util";
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
    private _spotifyLikedSongs: Track[] = [];
    // default to starting with spotify
    private _currentPlayerName: PlayerName = PlayerName.SpotifyWeb;
    private _selectedTrackItem: PlaylistItem = null;
    private _selectedPlaylist: PlaylistItem = null;
    private _spotifyUser: SpotifyUser = null;
    private _buildingPlaylists: boolean = false;
    private _serverTrack: any = null;
    private _initialized: boolean = false;
    private _buildingCustomPlaylist: boolean = false;

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

    /**
     * Even if the _currentPlayer is set to SpotifyWeb
     * it may return SpotifyDesktop if it's mac and it requires access
     */
    get currentPlayerName(): PlayerName {
        const requiresSpotifyAccess = this.requiresSpotifyAccess();
        const hasSpotifyPlaybackAccess = this.hasSpotifyPlaybackAccess();
        const currentlySetToSpotifyWeb =
            this._currentPlayerName === PlayerName.SpotifyWeb;
        const currentlySetToItunes =
            this._currentPlayerName === PlayerName.ItunesDesktop;

        if (
            !currentlySetToItunes &&
            currentlySetToSpotifyWeb &&
            isMac() &&
            (!hasSpotifyPlaybackAccess || requiresSpotifyAccess)
        ) {
            this._currentPlayerName = PlayerName.SpotifyDesktop;
        }

        return this._currentPlayerName;
    }

    set currentPlayerName(playerName: PlayerName) {
        this._currentPlayerName = playerName;
    }

    get serverTrack(): any {
        return this._serverTrack;
    }

    set serverTrack(track: any) {
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
            this._runningTrack.playerType === PlayerType.MacItunesDesktop &&
            isItunesDesktopEnabled()
        ) {
            this.currentPlayerName = PlayerName.ItunesDesktop;
        }
        this._initialized = true;

        if (this.currentPlayerName === PlayerName.ItunesDesktop) {
            await this.showItunesPlaylists(serverIsOnline);
        } else {
            await this.showSpotifyPlaylists(serverIsOnline);
        }
        MusicCommandManager.syncControls(this._runningTrack);

        this._buildingPlaylists = false;
    }

    getPlaylistById(playlist_id: string) {
        return this._playlistMap[playlist_id];
    }

    async refreshPlaylistState() {
        if (this._spotifyPlaylists.length > 0) {
            // build the spotify playlist
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

        if (isItunesDesktopEnabled() && isMac()) {
            // build the itunes playlist
            if (this._itunesPlaylists.length > 0) {
                this._itunesPlaylists.forEach(async playlist => {
                    let playlistItemTracks: PlaylistItem[] = this
                        ._playlistTrackMap[playlist.id];

                    if (playlistItemTracks && playlistItemTracks.length > 0) {
                        let playlistState = await this.getPlaylistState(
                            playlist.id
                        );
                        playlist.state = playlistState;
                    }
                });
            }
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
        // there's nothing to get if it's windows and they don't have
        // a premium spotify account
        let premiumAccountRequired =
            !isMac() && !this.hasSpotifyPlaybackAccess() ? true : false;

        let allowSpotifyPlaylistFetch = true;
        if (needsSpotifyAccess || premiumAccountRequired) {
            allowSpotifyPlaylistFetch = false;
        }

        if (
            allowSpotifyPlaylistFetch ||
            playerName === PlayerName.ItunesDesktop
        ) {
            playlists = await getPlaylists(playerName);
        }

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
                playlist.itemType = "playlist";
                playlist.tag = type;
            }
        }

        // filter out the music time playlists into it's own list if we have any
        this.retrieveMusicTimePlaylist(playlists);

        // -- Removing the support to login without Spotify connect: 9/18/19 --
        // add the buttons to the playlist
        // await this.addSoftwareLoginButtonIfRequired(serverIsOnline, items);

        if (playerName === PlayerName.ItunesDesktop) {
            // add the action items specific to itunes
            items.push(this.getItunesConnectedButton());
        }

        if (
            playerName !== PlayerName.ItunesDesktop &&
            allowSpotifyPlaylistFetch
        ) {
            items.push(this.getSpotifyConnectedButton());
        }

        // add the no music time connection button if we're not online
        if (!serverIsOnline) {
            items.push(this.getNoMusicTimeConnectionButton());
        }

        if (premiumAccountRequired) {
            // show the spotify premium account required button
            items.push(this.getSlackPremiumAccountRequiredButton());
        }

        // add the connect to spotify if they still need to connect
        if (needsSpotifyAccess) {
            items.push(this.getConnectToSpotifyButton());
        }

        if (playerName === PlayerName.ItunesDesktop) {
            // add the action items specific to itunes
            items.push(this.getSwitchToSpotifyButton());

            if (playlists.length > 0) {
                items.push(this.getLineBreakButton());
            }

            playlists.forEach(item => {
                items.push(item);
            });

            this._itunesPlaylists = items;
        } else {
            // show the devices listening folder if they've already connected oauth
            if (!this.requiresSpotifyAccess()) {
                const {
                    title,
                    tooltip,
                    loggedIn
                } = await this.getActiveSpotifyDevicesTitleAndTooltip();
                const devicesFoundButton = this.createSpotifyDevicesButton(
                    title,
                    tooltip,
                    loggedIn
                );
                items.push(devicesFoundButton);
            }

            // add the action items specific to spotify
            if (allowSpotifyPlaylistFetch) {
                playlists.push(this.getSpotifyLikedPlaylistFolder());
            }

            if (isItunesDesktopEnabled() && isMac()) {
                items.push(this.getSwitchToItunesButton());
            }

            // get the custom playlist button
            if (serverIsOnline && allowSpotifyPlaylistFetch) {
                items.push(this.getLineBreakButton());

                const customPlaylistButton: PlaylistItem = this.getCustomPlaylistButton();
                if (customPlaylistButton) {
                    items.push(customPlaylistButton);
                }
            }

            // get the Software Top 40 Playlist
            const softwareTop40: PlaylistItem = await getSpotifyPlaylist(
                SOFTWARE_TOP_40_PLAYLIST_ID
            );
            if (softwareTop40 && softwareTop40.id) {
                softwareTop40.itemType = "playlist";
                softwareTop40.tag = "paw";
                // add it to music time playlist
                items.push(softwareTop40);
            }

            // add the music time playlists that were found
            if (
                this._musictimePlaylists &&
                this._musictimePlaylists.length > 0
            ) {
                for (let i = 0; i < this._musictimePlaylists.length; i++) {
                    const musicTimePlaylist = this._musictimePlaylists[i];
                    if (
                        musicTimePlaylist.playlistTypeId ===
                        PERSONAL_TOP_SONGS_PLID
                    ) {
                        items.push(musicTimePlaylist);
                    }
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
        item.tag = "spotify-liked-songs";
        item.itemType = "playlist";
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

    getSlackPremiumAccountRequiredButton() {
        return this.buildActionItem(
            "spotifypremium",
            "action",
            "musictime.spotifyPremiumRequired",
            PlayerType.NotAssigned,
            "Spotify Premium Required",
            "Connect to your premium Spotify account to use the play, pause, next, and previous controls"
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
            "Launch Spotify"
        );
    }

    getSwitchToItunesButton() {
        return this.buildActionItem(
            "title",
            "itunes",
            "musictime.launchItunes",
            PlayerType.MacItunesDesktop,
            "Launch iTunes"
        );
    }

    createSpotifyDevicesButton(title, tooltip, loggedIn) {
        const button = this.buildActionItem(
            "title",
            "spotify",
            null,
            PlayerType.WebSpotify,
            title,
            tooltip
        );
        button.tag = loggedIn ? "active" : "disabled";
        return button;
    }

    getLineBreakButton() {
        return this.buildActionItem(
            "title",
            "divider",
            null,
            PlayerType.NotAssigned,
            "",
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
        item.itemType = itemType;

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

    async getActiveSpotifyDevicesTitleAndTooltip() {
        const devices = await getSpotifyDevices();
        let inactiva_devices_names = [];
        if (devices && devices.length > 0) {
            for (let i = 0; i < devices.length; i++) {
                const device: PlayerDevice = devices[i];
                if (device.is_active) {
                    // done, found an active device
                    return {
                        title: `Listening on ${device.name}`,
                        tooltip: "Spotify devices available",
                        loggedIn: true
                    };
                } else {
                    inactiva_devices_names.push(device.name);
                }
            }
        }

        if (inactiva_devices_names.length > 0) {
            return {
                title: `Available on ${inactiva_devices_names.join(", ")}`,
                tooltip: "Spotify devices found but are not currently active",
                loggedIn: true
            };
        }

        return {
            title: "No Devices Found",
            tooltip:
                "No Spotify devices found, you may need to login to your player",
            loggedIn: false
        };
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
                    this._spotifyLikedSongs = await getSpotifyLikedSongs();

                    playlistItemTracks = this.getPlaylistItemTracksFromTracks(
                        this._spotifyLikedSongs
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
        playlistItem.position = position;
        playlistItem.artist = track.artist;
        playlistItem.playerType = track.playerType;
        playlistItem.itemType = "track";
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
            this.currentPlayerName !== PlayerName.ItunesDesktop &&
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
                const typeId = playlist.playlistTypeId;
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
        this._musictimePlaylists = [];
        if (this._savedPlaylists.length > 0 && playlists.length > 0) {
            for (let i = 0; i < this._savedPlaylists.length; i++) {
                let savedPlaylist: PlaylistItem = this._savedPlaylists[i];
                let savedPlaylistTypeId = savedPlaylist.playlistTypeId;

                for (let x = playlists.length - 1; x >= 0; x--) {
                    let playlist = playlists[x];
                    if (playlist.id === savedPlaylist.id) {
                        playlist.playlistTypeId = savedPlaylistTypeId;
                        playlist.tag = "paw";
                        playlists.splice(x, 1);
                        this._musictimePlaylists.push(playlist);
                        break;
                    }
                }
            }
        }
    }

    /**
     * Return the next Spotify Track from the Liked Songs list.
     * It will return null if the Liked Songs list doesn't exist or the current track ID is not assigned.
     * It will return the 1st track if the current track ID is not assigned and the Liked Songs list exists.
     */
    getNextSpotifyLikedSong(): Track {
        const currentTrackId = this.selectedTrackItem.id;
        const hasLikedSongs =
            this._spotifyLikedSongs && this._spotifyLikedSongs.length > 0;
        if (currentTrackId && hasLikedSongs) {
            let currTrackIndex = this._spotifyLikedSongs.findIndex(
                i => i.id === currentTrackId
            );
            if (currTrackIndex !== -1) {
                // if the curr track index is the last element, return zero, else return the next one
                if (currTrackIndex + 1 < this._spotifyLikedSongs.length) {
                    return this._spotifyLikedSongs[currTrackIndex + 1];
                } else {
                    return this._spotifyLikedSongs[0];
                }
            }
        } else if (!currentTrackId && hasLikedSongs) {
            return this._spotifyLikedSongs[0];
        }
        return null;
    }

    async fetchSavedPlaylists(serverIsOnline) {
        let playlists = [];
        if (serverIsOnline) {
            const response = await softwareGet(
                "/music/generatedPlaylist",
                getItem("jwt")
            );

            if (isResponseOk(response)) {
                // only return the non-deleted playlists
                for (let i = 0; i < response.data.length; i++) {
                    const savedPlaylist = response.data[i];
                    if (savedPlaylist && savedPlaylist["deleted"] !== 1) {
                        savedPlaylist.id = savedPlaylist.playlist_id;
                        savedPlaylist.playlistTypeId =
                            savedPlaylist.playlistTypeId;
                        delete savedPlaylist.playlist_id;
                        playlists.push(savedPlaylist);
                    }
                }
            }
        }
        this._savedPlaylists = playlists;
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

    async generateUsersWeeklyTopSongs() {
        if (this._buildingCustomPlaylist) {
            return;
        }
        const serverIsOnline = await serverIsAvailable();

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

        this._buildingCustomPlaylist = true;

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
                    `There was an unexpected error adding tracks to the playlist. ${playlistResult.message}`,
                    ...["OK"]
                );
                this._buildingCustomPlaylist = false;
                return;
            }

            playlistId = playlistResult.data.id;

            await this.updateSavedPlaylists(
                playlistId,
                1,
                PERSONAL_TOP_SONGS_NAME
            ).catch(err => {
                // logIt("Error updating music time global playlist ID");
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
                            // logIt(
                            //     `Error replacing tracks, error: ${err.message}`
                            // );
                        }
                    );

                    window.showInformationMessage(
                        `Successfully refreshed ${PERSONAL_TOP_SONGS_NAME}.`,
                        ...["OK"]
                    );
                }
            } else {
                window.showInformationMessage(
                    `Successfully created ${PERSONAL_TOP_SONGS_NAME}, but we're unable to add any songs at the moment.`,
                    ...["OK"]
                );
            }
        }

        setTimeout(() => {
            this.clearSpotify();
            commands.executeCommand("musictime.refreshPlaylist");
        }, 500);

        await this.fetchSavedPlaylists(serverIsOnline);

        // update building custom playlist to false
        this._buildingCustomPlaylist = false;
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
            } else {
                window.showErrorMessage(
                    `There was an unexpected error adding tracks to the playlist. ${addTracksResult.message}`,
                    ...["OK"]
                );
            }
        }
    }

    async updateSavedPlaylists(
        playlist_id: string,
        playlistTypeId: number,
        name: string
    ) {
        // playlistTypeId 1 = personal custom top 40
        const payload = {
            playlist_id,
            playlistTypeId,
            name
        };
        let jwt = getItem("jwt");
        let createResult = await softwarePost(
            "/music/generatedPlaylist",
            payload,
            jwt
        );

        return createResult;
    }

    async initializeSlack() {
        const serverIsOnline = await serverIsAvailable();
        if (serverIsOnline) {
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
        } else {
            setItem("slack_access_token", null);
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
            codyConfig.spotifyAccessToken = spotifyOauth.access_token;
            codyConfig.spotifyRefreshToken = spotifyOauth.refresh_token;
            codyConfig.spotifyClientSecret = SPOTIFY_CLIENT_SECRET;
            codyConfig.enableItunesDesktop = false;
            codyConfig.enableSpotifyDesktop = isMac() ? true : false;
            codyConfig.enableItunesDesktopSongTracking = isMac() ? true : false;
            setConfig(codyConfig);

            setItem("spotify_access_token", spotifyOauth.spotify_access_token);
            setItem(
                "spotify_refresh_token",
                spotifyOauth.spotify_refresh_token
            );

            // get the user
            getUserProfile().then(user => {
                this.spotifyUser = user;
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
        this.spotifyUser = null;
    }

    // reconcile. meaning the user may have deleted the lists our 2 buttons created;
    // global and custom.  We'll remove them from our db if we're unable to find a matching
    // playlist_id we have saved.
    async reconcilePlaylists() {
        // fetch what we have from the app
        if (this._savedPlaylists.length === 0) {
            let serverIsOnline = await serverIsAvailable();
            // fetch and reconcile the saved playlists against the spotify list
            await this.fetchSavedPlaylists(serverIsOnline);
        }
        if (this._savedPlaylists.length > 0) {
            const currentSpotifyPlaylists = await getPlaylists(
                PlayerName.SpotifyWeb,
                { all: true, limit: 100, offset: 0 }
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
                        `/music/generatedPlaylist/${savedPlaylist.id}`,
                        getItem("jwt")
                    );
                } else if (foundItem.name !== savedPlaylist.name) {
                    // update the name on software
                    const payload = {
                        name: foundItem.name
                    };
                    await softwarePut(
                        `/music/generatedPlaylist/${savedPlaylist.id}`,
                        payload,
                        getItem("jwt")
                    );
                }
            });
        }
    }

    async launchTrackPlayer(playerName: PlayerName = null) {
        // if the player name is null, this means all we want to do is launch the currently set player
        if (!playerName) {
            launchPlayer(this.currentPlayerName, { quietly: false });
            return;
        }

        // it's not null, this means we want to launch a player and we need to pause the other player
        if (this.currentPlayerName === PlayerName.ItunesDesktop) {
            await quitMacPlayer(PlayerName.ItunesDesktop);
        } else {
            const musicCtrlMgr = new MusicControlManager();
            musicCtrlMgr.pauseSong(this.currentPlayerName);
        }

        if (playerName !== PlayerName.ItunesDesktop) {
            if (isMac() && isPlayerRunning(PlayerName.SpotifyDesktop)) {
                // just launch the desktop
                launchPlayer(PlayerName.SpotifyDesktop);
            } else {
                // this will show a prompt as to why we're launching the web player
                this.launchSpotifyPlayer();
            }
        } else {
            launchPlayer(playerName);
        }

        // update the current player type to what was selected
        this.currentPlayerName = playerName;

        this.clearPlaylists();
        setTimeout(() => {
            commands.executeCommand("musictime.refreshPlaylist");
        }, 500);
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
        // set it to null so neither heart is displayed
        this.serverTrack = null;
        let server_track = null;

        let trackId = track.id;
        let type = "spotify";
        if (track.playerType === PlayerType.MacItunesDesktop) {
            type = "itunes";
        }
        const api = `/music/liked/track/${trackId}?type=${type}`;
        const resp = await softwareGet(api, getItem("jwt"));
        if (isResponseOk(resp) && resp.data) {
            server_track = resp.data;
            server_track.loved = server_track.liked === 1 ? true : false;
            delete server_track.liked;
        }

        if (!server_track) {
            server_track = {
                loved: false,
                trackId: track.id,
                type
            };
        }
        track.loved = server_track.loved;
        MusicCommandManager.syncControls(track);
        this.serverTrack = server_track;
    }

    hasSpotifyPlaybackAccess() {
        if (this.spotifyUser && this.spotifyUser.product === "premium") {
            return true;
        }
        return false;
    }
}
