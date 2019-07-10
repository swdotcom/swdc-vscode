import { buildQueryString, launchWebUrl } from "../Util";
import { showQuickPick } from "../MenuManager";
import { buildSpotifyLink } from "../music/MusicControlManager";

export class SocialShareManager {
    private static instance: SocialShareManager;

    private constructor() {
        //
    }

    static getInstance(): SocialShareManager {
        if (!SocialShareManager.instance) {
            SocialShareManager.instance = new SocialShareManager();
        }

        return SocialShareManager.instance;
    }

    shareIt(sharer: string, options: any) {
        let shareUrl = this.getShareUrl(sharer, options);
        launchWebUrl(shareUrl);
    }

    getShareUrl(sharer: string, options: any) {
        const sharers = {
            facebook: {
                shareUrl: "https://www.facebook.com/sharer/sharer.php",
                params: {
                    u: options["url"],
                    hashtag: options["hashtag"]
                }
            },
            twitter: {
                shareUrl: "https://twitter.com/intent/tweet/",
                params: {
                    text: options["title"],
                    url: options["url"],
                    hashtags: options["hashtags"],
                    via: options["via"]
                }
            }
        };

        const sharerObj = sharers[sharer.toLowerCase()];
        const queryStr = buildQueryString(sharerObj.params);
        const shareUrl = `${sharerObj.shareUrl}${queryStr}`;
        return shareUrl;
    }

    async showMenu(id: string, isPlaylist: boolean) {
        let menuOptions = {
            items: []
        };

        const spotifyLinkUrl = buildSpotifyLink(id, true);
        // facebook needs the hash
        menuOptions.items.push({
            label: "Facebook",
            url: this.getShareUrl("facebook", {
                url: spotifyLinkUrl,
                hashtag: "#MyFavs!"
            })
        });

        // twitter doesn't need the hash chars, "via" (optional: twitter username without @)
        menuOptions.items.push({
            label: "Twitter",
            url: this.getShareUrl("twitter", {
                url: spotifyLinkUrl,
                title: "Xavier's Coding Favorites",
                hashtags: ["Coding", "MyFavs!"]
            })
        });

        showQuickPick(menuOptions);
    }
}
