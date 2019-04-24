import {
    TreeDataProvider,
    ExtensionContext,
    TreeItem,
    TreeItemCollapsibleState,
    Command
} from "vscode";

// {"artist": "Coldplay","album": "Parachutes","genre": "",
// "disc_number": 1,"duration": 273426,"played_count": 0,"track_number": 6,
// "id": "spotify:track:0R8P9KfGJCDULmlEoBagcO","name": "Trouble","state":"playing"}
// interface Entry {
//     artist: string;
//     album: string;
//     genre: string;
//     disc_number: number;
//     duration: number;
//     played_count: number;
//     track_number: number;
//     id: string;
//     name: string;
//     state: string;
// }

// const createPlaylistTreeItem = (p: Entry) => {
//     return new PlaylistTreeItem(p, TreeItemCollapsibleState.None);
// };

// export class MusicPlaylistProvider implements TreeDataProvider<Entry> {
//     private playlists: Entry[];

//     constructor(private context: ExtensionContext) {
//         //
//     }

//     getParent(_p: Entry) {
//         // only one level tree data
//         return void 0;
//     }

//     async getChildren(element?: Entry): Promise<Entry[]> {
//         if (element) {
//             return Promise.resolve([]);
//         }
//         if (!this.playlists) {
//             return Promise.resolve([]);
//         }

//         return new Promise(resolve => {
//             resolve(this.playlists);
//         });
//     }

//     getTreeItem(p: Entry): PlaylistTreeItem {
//         return createPlaylistTreeItem(p);
//     }
// }

// class PlaylistTreeItem extends TreeItem {
//     constructor(
//         private readonly playlist: Entry,
//         public readonly collapsibleState: TreeItemCollapsibleState,
//         public readonly command?: Command
//     ) {
//         super(playlist.name, collapsibleState);
//     }

//     get tooltip(): string {
//         return `${this.playlist.name}:${this.playlist.artist}`;
//     }

//     // iconPath = {
//     //     light: path.join(
//     //         __filename,
//     //         "..",
//     //         "..",
//     //         "..",
//     //         "resources",
//     //         "light",
//     //         "playlist.svg"
//     //     ),
//     //     dark: path.join(
//     //         __filename,
//     //         "..",
//     //         "..",
//     //         "..",
//     //         "resources",
//     //         "dark",
//     //         "playlist.svg"
//     //     )
//     // };

//     contextValue = "playlist";
// }
