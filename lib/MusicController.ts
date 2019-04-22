import * as music from "cody-music";
import { MusicPlayerManagerSingleton } from "./MusicPlayerManager";
import { showQuickPick } from "./MenuManager";
import { getUserStatus, serverIsAvailable } from "./DataController";

export class MusicController {
    getPlayer(): string {
        const trackState = MusicPlayerManagerSingleton.getTrackState();
        if (trackState) {
            return trackState.type;
        }
        return null;
    }

    async next() {
        const player = this.getPlayer();
        if (player) {
            await music.next(player);
            MusicPlayerManagerSingleton.updateButtons();
        }
    }
    async previous() {
        const player = this.getPlayer();
        if (player) {
            await music.previous(player);
            MusicPlayerManagerSingleton.updateButtons();
        }
    }
    async play() {
        const player = this.getPlayer();
        if (player) {
            await music.play(player);
            MusicPlayerManagerSingleton.updateButtons();
        }
    }
    async pause() {
        const player = this.getPlayer();
        if (player) {
            await music.pause(player);
            MusicPlayerManagerSingleton.updateButtons();
        }
    }

    async showMenu() {
        let kpmMenuOptions = {
            items: []
        };

        kpmMenuOptions.items.push({
            label: "Software Top 40",
            description: "",
            detail:
                "Top 40 most popular songs developers around the world listen to as they code",
            url: "https://api.software.com/music/top40",
            uri: null,
            cb: null
        });

        showQuickPick(kpmMenuOptions);
    }
}
