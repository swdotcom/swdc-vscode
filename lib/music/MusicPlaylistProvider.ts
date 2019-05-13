import {
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    EventEmitter,
    Event,
    Disposable
} from "vscode";
import * as path from "path";
import { MusicTreeItem } from "./MusicStoreManager";
import { MusicStoreManager } from "./MusicStoreManager";
import { buildPlaylists } from "./MusicControlManager";
import { spotifyApiPut } from "../HttpClient";
import { getItem } from "../Util";
import * as music from "cody-music";

// const createPlaylistTreeItem = (
//     p: MusicTreeItem,
//     cstate: TreeItemCollapsibleState
// ) => {
//     return new PlaylistTreeItem(p, cstate);
// };

// export const connectPlaylistTreeView = (
//     view: TreeView<MusicTreeItem>,
//     musicStore: MusicStoreManager
// ) => {
//     return Disposable.from(
//         view.onDidChangeSelection(e => {
//             if (
//                 e.selection &&
//                 e.selection.length === 1 &&
//                 e.selection[0].type === "track"
//             ) {
//                 // play the selection
//                 // If the user making the request is non-premium, a
//                 // 403 FORBIDDEN response code will be returned.
//                 const accessToken = getItem("spotify_access_token");
//                 const payload = { uri: e.selection[0].uri };

//                 spotifyApiPut("/v1/me/player/play", payload, accessToken);
//             }
//             // https://api.spotify.com/v1/me/player/pause
//             /**
//              * selection:Array[1]
//                 0:Object
//                 type:"track"
//                 duration_ms:219146
//                 name:"you were good to me"
//                 explicit:false
//                 disc_number:1
//                 popularity:53
//                 artist:"Jeremy Zucker, Chelsea Cutler"
//                 album:"brent"
//                 id:"spotify:track:4CxFN5zON70B3VOPBYbd6P"
//              */
//         }),
//         view.onDidChangeVisibility(e => {
//             if (e.visible) {
//                 //
//             }
//         })
//     );
// };

export class MusicPlaylistProvider implements TreeDataProvider<MusicTreeItem> {
    private _onDidChangeTreeData: EventEmitter<
        MusicTreeItem | undefined
    > = new EventEmitter<MusicTreeItem | undefined>();
    readonly onDidChangeTreeData: Event<MusicTreeItem | undefined> = this
        ._onDidChangeTreeData.event;

    constructor(private readonly musicStore: MusicStoreManager) {}

    getParent(_p: MusicTreeItem) {
        return void 0; // all playlists are in root
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    play(): void {
        console.log("play");
    }

    pause(): void {
        console.log("pause");
    }

    getTreeItem(p: MusicTreeItem): PlaylistTreeItem {
        return null;
        // if (p && p["tracks"] && p["tracks"].length > 0) {
        //     return createPlaylistTreeItem(
        //         p,
        //         TreeItemCollapsibleState.Collapsed
        //     );
        // } else {
        //     return createPlaylistTreeItem(p, TreeItemCollapsibleState.None);
        // }
    }

    async getChildren(element?: MusicTreeItem): Promise<MusicTreeItem[]> {
        if (element && element.type === "playlist") {
            // return the tracks
            return element["tracks"];
        } else {
            // return the playlists
            const playlists: MusicTreeItem[] = await buildPlaylists();
            return Promise.resolve(playlists);
        }
    }
}

class PlaylistTreeItem extends TreeItem {
    constructor(
        private readonly musicTreeItem: MusicTreeItem,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly command?: Command
    ) {
        super(musicTreeItem.name, collapsibleState);
    }

    get tooltip(): string {
        return `${this.musicTreeItem.id}`;
    }

    iconPath = {
        light: path.join(
            __filename,
            "..",
            "..",
            "resources",
            "light",
            "paw.svg"
        ),
        dark: path.join(__filename, "..", "..", "resources", "dark", "paw.svg")
    };

    contextValue = "musicTreeItem";
}
