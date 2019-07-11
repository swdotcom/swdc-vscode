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
            },
            linkedin: {
                shareUrl: "https://www.linkedin.com/shareArticle",
                params: {
                    url: options["url"],
                    mini: true
                }
            },
            whatsapp: {
                shareUrl: "https://api.whatsapp.com/send",
                params: {
                    text: `${options["title"]}: ${options["url"]}`
                },
                isLink: true
            },
            tumblr: {
                shareUrl: "http://tumblr.com/widgets/share/tool",
                params: {
                    canonicalUrl: options["url"],
                    content: options["url"],
                    posttype: "link",
                    title: options["title"],
                    caption: options["caption"],
                    tags: options["tags"]
                }
            }
        };

        const sharerObj = sharers[sharer.toLowerCase()];
        const queryStr = buildQueryString(sharerObj.params);
        const shareUrl = `${sharerObj.shareUrl}${queryStr}`;
        return shareUrl;
    }

    async showMenu(musicId: string, label: string, isPlaylist: boolean) {
        let menuOptions = {
            items: []
        };

        const context = isPlaylist ? "playlist" : "song";
        const title = `Check out this ${context}`;

        const spotifyLinkUrl = buildSpotifyLink(musicId, isPlaylist);
        // facebook needs the hash
        menuOptions.items.push({
            label: "Facebook",
            detail: `Share your ${context}, ${label}, on Facebook.`,
            url: this.getShareUrl("facebook", {
                url: spotifyLinkUrl,
                hashtag: `#MusicTime`
            })
        });

        // twitter doesn't need the hash chars, "via" (optional: twitter username without @)
        menuOptions.items.push({
            label: "Twitter",
            detail: `Tweet ${context}, ${label}, on Twitter.`,
            url: this.getShareUrl("twitter", {
                url: spotifyLinkUrl,
                title,
                hashtags: ["MusicTime"]
            })
        });

        menuOptions.items.push({
            label: "LinkedIn",
            detail: `Share your ${context}, ${label}, on LinkedIn.`,
            url: this.getShareUrl("linkedin", {
                url: spotifyLinkUrl
            })
        });

        menuOptions.items.push({
            label: "WhatsApp",
            detail: `Send your ${context}, ${label}, through WhatsApp.`,
            url: this.getShareUrl("whatsapp", {
                url: spotifyLinkUrl,
                title
            })
        });

        menuOptions.items.push({
            label: "Tumblr",
            detail: `Share your ${context}, ${label}, on Tumblr.`,
            url: this.getShareUrl("tumblr", {
                url: spotifyLinkUrl,
                title,
                tags: ["MusicTime"],
                caption: "Software Audio Share"
            })
        });

        showQuickPick(menuOptions);
    }
}
