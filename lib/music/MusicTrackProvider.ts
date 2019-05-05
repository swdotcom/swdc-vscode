import {
    TreeDataProvider,
    ExtensionContext,
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    Disposable,
    EventEmitter,
    Event
} from "vscode";
import * as path from "path";
import { Track, Playlist } from "./MusicStoreManager";

const createTrackTreeItem = (
    t: Track,
    playlist: Playlist,
    trackIndex: number
) => {
    return new TrackTreeItem(t, TreeItemCollapsibleState.None, {
        command: "spotify.playTrack",
        title: "Play track",
        arguments: [trackIndex, playlist]
    });
};

export class MusicTrackProvider implements TreeDataProvider<Track> {
    private _onDidChangeTreeData: EventEmitter<
        Track | undefined
    > = new EventEmitter<Track | undefined>();
    readonly onDidChangeTreeData: Event<Track | undefined> = this
        ._onDidChangeTreeData.event;

    private tracks: Track[];
    private selectedPlaylist?: Playlist;
    private selectedTrack?: Track;

    constructor() {
        // get the tracks, selectedPaylist, and selectedTrack
        // getStore().subscribe(() => {
        // 	const { tracks, selectedPlaylist, selectedTrack } = getState();
        // 	const newTracks = tracks.get((selectedPlaylist || { id: '' }).id);
        // 	if (this.tracks !== newTracks || this.selectedTrack !== selectedTrack) {
        // 		if (this.selectedTrack !== selectedTrack) {
        // 			this.selectedTrack = selectedTrack!;
        // 			this.selectedTrack && this.view && this.view.reveal(this.selectedTrack, { focus: true, select: true });
        // 		}
        // 		this.selectedPlaylist = selectedPlaylist!;
        // 		this.selectedTrack = selectedTrack!;
        // 		this.tracks = newTracks || [];
        // 		this.refresh();
        // 	}
        // });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getParent(_p: Track) {
        // only one level tree data
        return void 0;
    }

    async getChildren(element?: Track): Promise<Track[]> {
        return Promise.resolve([]);
        // if (element) {
        //     return Promise.resolve([]);
        // }
        // if (!this.tracks) {
        //     return Promise.resolve([]);
        // }

        // return new Promise(resolve => {
        //     resolve(this.tracks);
        // });
    }

    getTreeItem(t: Track): TrackTreeItem {
        //return createPlaylistTreeItem(p);
        const { selectedPlaylist, tracks } = this;
        const index = tracks.findIndex(track => {
            return t.id === track.id;
        });
        return createTrackTreeItem(t, selectedPlaylist!, index);
    }
}

class TrackTreeItem extends TreeItem {
    constructor(
        private readonly track: Track,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly command?: Command
    ) {
        super(track.name, collapsibleState);
    }

    get tooltip(): string {
        return `${this.track.name}:${this.track.artist}`;
    }

    iconPath = {
        light: path.join(
            __filename,
            "..",
            "..",
            "resources",
            "light",
            "track.svg"
        ),
        dark: path.join(
            __filename,
            "..",
            "..",
            "resources",
            "dark",
            "track.svg"
        )
    };

    contextValue = "track";
}
