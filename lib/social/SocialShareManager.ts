import { buildQueryString, launchWebUrl, getItem } from "../Util";
import { showQuickPick } from "../MenuManager";
import {
    buildSpotifyLink,
    MusicControlManager
} from "../music/MusicControlManager";
import { showSlackChannelMenu } from "../slack/SlackControlManager";
const { WebClient } = require("@slack/web-api");

let musicId: string = "";
let title: string = "";
let spotifyLinkUrl: string = "";
let playlistSelected: boolean = false;

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
            // linkedin: {
            //     shareUrl: "https://www.linkedin.com/shareArticle",
            //     params: {
            //         url: options["url"],
            //         mini: true
            //     }
            // },
            twitter: {
                shareUrl: "https://twitter.com/intent/tweet/",
                params: {
                    text: options["title"],
                    url: options["url"],
                    hashtags: options["hashtags"],
                    via: options["via"]
                }
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
            },
            whatsapp: {
                shareUrl: "https://api.whatsapp.com/send",
                params: {
                    text: `${options["title"]}: ${options["url"]}`
                },
                isLink: true
            }
        };

        const sharerObj = sharers[sharer.toLowerCase()];
        const queryStr = buildQueryString(sharerObj.params);
        const shareUrl = `${sharerObj.shareUrl}${queryStr}`;
        return shareUrl;
    }

    async showMenu(id: string, label: string, isPlaylist: boolean) {
        musicId = id;
        playlistSelected = isPlaylist;

        let menuOptions = {
            items: []
        };

        const context = isPlaylist ? "Playlist" : "Song";
        title = `Check out this ${context}`;

        spotifyLinkUrl = buildSpotifyLink(musicId, isPlaylist);
        // facebook needs the hash
        menuOptions.items.push({
            label: "Facebook",
            detail: `Share your ${context.toLowerCase()}, ${label}, on Facebook.`,
            url: this.getShareUrl("facebook", {
                url: spotifyLinkUrl,
                hashtag: `#MusicTime`
            })
        });

        menuOptions.items.push({
            label: "Slack",
            detail: `Share your ${context.toLowerCase()}, ${label}, on Slack`,
            cb: this.shareSlack
        });

        // menuOptions.items.push({
        //     label: "LinkedIn",
        //     detail: `Share your ${context.toLowerCase()}, ${label}, on LinkedIn.`,
        //     url: this.getShareUrl("linkedin", {
        //         url: spotifyLinkUrl
        //     })
        // });

        menuOptions.items.push({
            label: "Tumblr",
            detail: `Share your ${context.toLowerCase()}, ${label}, on Tumblr.`,
            url: this.getShareUrl("tumblr", {
                url: spotifyLinkUrl,
                title,
                tags: ["MusicTime"],
                caption: "Software Audio Share"
            })
        });

        // twitter doesn't need the hash chars, "via" (optional: twitter username without @)
        menuOptions.items.push({
            label: "Twitter",
            detail: `Tweet ${context.toLowerCase()}, ${label}, on Twitter.`,
            url: this.getShareUrl("twitter", {
                url: spotifyLinkUrl,
                title,
                hashtags: ["MusicTime"]
            })
        });

        menuOptions.items.push({
            label: "WhatsApp",
            detail: `Send your ${context.toLowerCase()}, ${label}, through WhatsApp.`,
            url: this.getShareUrl("whatsapp", {
                url: spotifyLinkUrl,
                title
            })
        });

        menuOptions.items.push({
            label: `Copy ${context} Link`,
            detail: `Copy ${context.toLowerCase()} link to your clipboard.`,
            cb: this.copyLink
        });

        showQuickPick(menuOptions);
    }

    copyLink() {
        const controller: MusicControlManager = new MusicControlManager();
        controller.copySpotifyLink(musicId, playlistSelected);
    }

    async shareSlack() {
        const selectedChannel = await showSlackChannelMenu();
        const slackAccessToken = getItem("slack_access_token");
        const web = new WebClient(slackAccessToken);
        const result = await web.chat
            .postMessage({
                text: `${title} : ${spotifyLinkUrl}`,
                channel: selectedChannel
            })
            .catch(err => {
                console.log("error posting slack message: ", err);
            });
    }
}
