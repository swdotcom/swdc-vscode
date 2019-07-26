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
    getRunningTrack
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
    SPOTIFY_LIKED_SONGS_PLAYLIST_NAME
} from "../Constants";
import { commands } from "vscode";
import { serverIsAvailable } from "../DataController";
import { getItem } from "../Util";
import { isResponseOk, softwareGet } from "../HttpClient";

export class MusicManager {
    private static instance: MusicManager;

    private _itunesPlaylists: PlaylistItem[] = [];
    private _spotifyPlaylists: PlaylistItem[] = [];
    private _savedPlaylists: PlaylistItem[] = [];
    private _playlistTrackMap: any = {};
    private _runningTrack: Track = null;
    private _currentPlayerName: PlayerName = PlayerName.SpotifyWeb;
    private _selectedTrackItem: PlaylistItem = null;
    private _selectedPlaylist: PlaylistItem = null;

    private constructor() {
        //
    }

    get currentPlayerName(): PlayerName {
        return this._currentPlayerName;
    }
    get currentPlaylists(): PlaylistItem[] {
        if (this._currentPlayerName === PlayerName.ItunesDesktop) {
            return this._itunesPlaylists;
        }
        return this._spotifyPlaylists;
    }

    static getInstance(): MusicManager {
        if (!MusicManager.instance) {
            MusicManager.instance = new MusicManager();
        }

        return MusicManager.instance;
    }

    async init() {
        this._runningTrack = await getRunningTrack();
        if (
            this._runningTrack.playerType === PlayerType.MacItunesDesktop &&
            this._runningTrack.state !== TrackStatus.NotAssigned
        ) {
            this._currentPlayerName = PlayerName.ItunesDesktop;
            await this.showItunesPlaylists();
        } else {
            await this.showSpotifyPlaylists();
        }
    }

    showItunesPlaylists() {
        // if no playlists are found for itunes, then fetch
        if (this._itunesPlaylists.length === 0) {
            this.getPlaylistsForPlayer(PlayerName.ItunesDesktop);
        }
    }

    showSpotifyPlaylists() {
        // if no playlists are found for spotify, then fetch
        if (this._spotifyPlaylists.length === 0) {
            this.getPlaylistsForPlayer(PlayerName.SpotifyWeb);
        }
    }

    //
    // Clear all of the playlists and tracks
    //
    clearPlaylists() {
        this._itunesPlaylists = [];
        this._spotifyPlaylists = [];
        this._playlistTrackMap = {};
    }

    //
    // Fetch the playlist names for a specific player
    //
    async getPlaylistsForPlayer(playerName: PlayerName) {
        let serverIsOnline = await serverIsAvailable();
        let needsSpotifyAccess = this.requiresSpotifyAccess();

        let playlists: PlaylistItem[] = [];
        let type = "spotify";
        if (playerName === PlayerName.ItunesDesktop) {
            type = "itunes";
        }
        playlists = await getPlaylists(playerName);

        // update so the playlist header shows the spotify related icons
        commands.executeCommand("setContext", "treeview-type", type);

        // go through each playlist and find out it's state
        if (playlists && playlists.length > 0) {
            for (let i = 0; i < playlists.length; i++) {
                let playlist = playlists[i];
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

        let topItems: PlaylistItem[] = [];

        if (!serverIsOnline) {
            topItems.push(this.getNoMusicTimeConnectionButton());
        }

        if (needsSpotifyAccess) {
            topItems.push(this.getConnectToSpotifyButton());
        }

        if (playerName === PlayerName.ItunesDesktop) {
            this._itunesPlaylists = playlists;
            // add the action items specific to itunes
            topItems.push(this.getItunesConnectedButton());
            topItems.push(this.getSwitchToSpotifyButton());

            topItems.push(this.getLineBreakButton());

            this._spotifyPlaylists = [...topItems, ...this._itunesPlaylists];
        } else {
            this._spotifyPlaylists = playlists;
            // add the action items specific to spotify
            if (!needsSpotifyAccess) {
                topItems.push(this.getSpotifyConnectedButton());
            }
            topItems.push(this.getSwitchToItunesButton());

            topItems.push(this.getLineBreakButton());

            // get the custom playlist button
            if (serverIsOnline && !needsSpotifyAccess) {
                const globalPlaylistButton: PlaylistItem = this.getGlobalPlaylistButton();
                if (globalPlaylistButton) {
                    topItems.push(globalPlaylistButton);
                }
                const customPlaylistButton: PlaylistItem = this.getCustomPlaylistButton();
                if (customPlaylistButton) {
                    topItems.push(customPlaylistButton);
                }
            }

            topItems.push(this.getLineBreakButton());

            this._spotifyPlaylists = [...topItems, ...this._spotifyPlaylists];
        }
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
            "______________________",
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
        itemType: string = ""
    ) {
        let item: PlaylistItem = new PlaylistItem();
        item.tracks = new PlaylistTrackInfo();
        item.type = type;
        item.id = id;
        item.command = command;
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

        const currentRunningTrack: Track = this._runningTrack;

        const playlistTrackItems: PlaylistItem[] = await this.getPlaylistItemTracksForPlaylistId(
            playlist_id
        );

        if (playlistTrackItems && playlistTrackItems.length > 0) {
            for (let i = 0; i < playlistTrackItems.length; i++) {
                const playlistItem: PlaylistItem = playlistTrackItems[i];
                if (playlistItem.id === currentRunningTrack.id) {
                    return currentRunningTrack.state;
                } else {
                    // update theis track status to not assigned to ensure it's also updated
                    playlistItem.state = TrackStatus.NotAssigned;
                }
            }
        }

        return playlistState;
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

    getGlobalPlaylistButton() {
        // update the existing playlist that matches the global top 40 playlist with a paw if found
        let hasGlobalPlaylist = this.hasMusicTimePlaylistForType(
            SOFTWARE_TOP_SONGS_PLID
        );

        const personalPlaylistLabel = GENERATE_GLOBAL_PLAYLIST_TITLE;
        const personalPlaylistTooltip = GENERATE_GLOBAL_PLAYLIST_TOOLTIP;

        if (
            this._currentPlayerName === PlayerName.SpotifyWeb &&
            !hasGlobalPlaylist &&
            !this.requiresSpotifyAccess()
        ) {
            // add the connect spotify link
            let listItem: PlaylistItem = new PlaylistItem();
            listItem.tracks = new PlaylistTrackInfo();
            listItem.type = "action";
            listItem.tag = "action";
            listItem.id = "codingfavorites";
            listItem.command = "musictime.generateGlobalPlaylist";
            listItem.playerType = PlayerType.WebSpotify;
            listItem.name = personalPlaylistLabel;
            listItem.tooltip = personalPlaylistTooltip;
            return listItem;
        }
        return null;
    }

    // get the custom playlist button by checkinf if the custom playlist
    // exists or not. if it doesn't exist then it will show the create label,
    // otherwise, it will show the refresh label
    getCustomPlaylistButton() {
        // update the existing playlist that matches the personal playlist with a paw if found
        const hasCustomPlaylist = this.hasMusicTimePlaylistForType(
            PERSONAL_TOP_SONGS_PLID
        );

        const personalPlaylistLabel = !hasCustomPlaylist
            ? GENERATE_CUSTOM_PLAYLIST_TITLE
            : REFRESH_CUSTOM_PLAYLIST_TITLE;
        const personalPlaylistTooltip = !hasCustomPlaylist
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
    hasMusicTimePlaylistForType(playlistTypeId: number) {
        let result = false;
        if (this._spotifyPlaylists.length > 0 && this._savedPlaylists) {
            for (let i = 0; i < this._spotifyPlaylists.length; i++) {
                const playlist: PlaylistItem = this._spotifyPlaylists[i];

                let foundPlaylist = null;
                for (let i = 0; i < this._savedPlaylists.length; i++) {
                    let savedPlaylist = this._savedPlaylists[i];
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
        this._savedPlaylists = playlists;
    }
}
