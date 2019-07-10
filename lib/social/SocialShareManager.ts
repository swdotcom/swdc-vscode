import { buildQueryString, launchWebUrl } from "../Util";
import { showQuickPick } from "../MenuManager";
import { buildSpotifyLink } from "../music/MusicControlManager";

export class SocialShareManager {
    private static instance: SocialShareManager;

    private shareUrls = {
        facebook: "https://www.facebook.com/sharer/sharer.php"
    };

    private constructor() {
        //
    }

    static getInstance(): SocialShareManager {
        if (!SocialShareManager.instance) {
            SocialShareManager.instance = new SocialShareManager();
        }

        return SocialShareManager.instance;
    }

    shareIt(sharer: string, url: string, hashtag: string) {
        let shareUrl = this.buildShareUrl(sharer, url, hashtag);
        launchWebUrl(shareUrl);
    }

    buildShareUrl(sharer: string, url: string, hashtag: string) {
        sharer = sharer.toLowerCase();
        let shareUrl = this.shareUrls[sharer];

        if (hashtag.indexOf("#") !== 0) {
            hashtag = `#${hashtag}`;
        }

        let options = {
            u: encodeURIComponent(url),
            hashtag: `${encodeURIComponent(hashtag)}`
        };

        shareUrl += buildQueryString(options);

        return shareUrl;
    }

    async showMenu(id: string, isPlaylist: boolean) {
        let menuOptions = {
            items: []
        };

        const spotifyLinkUrl = buildSpotifyLink(id, true);
        menuOptions.items.push({
            label: "Facebook",
            url: this.buildShareUrl("facebook", spotifyLinkUrl, "MyFavs!")
        });

        showQuickPick(menuOptions);
    }
}
