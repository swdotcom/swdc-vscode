import { api_endpoint } from "../Constants";
import { getItem, launchWebUrl, setItem } from "../Util";
import { refetchSlackConnectStatusLazily } from "../DataController";
const { WebClient } = require("@slack/web-api");
import { showQuickPick } from "./MenuManager";
import { softwarePut } from "../http/HttpClient";
import { window } from "vscode";

/**
 * This won't be available until they've connected to spotify
 */
export async function connectSlack() {
    const slackAccessToken = getItem("slack_access_token");
    if (slackAccessToken) {
        window.showInformationMessage("Slack is already connected");
        return;
    }
    const jwt = getItem("jwt");
    const encodedJwt = encodeURIComponent(jwt);
    const qryStr = `integrate=slack&plugin=musictime&token=${encodedJwt}`;

    // authorize the user for slack
    const endpoint = `${api_endpoint}/auth/slack?${qryStr}`;
    launchWebUrl(endpoint);
    refetchSlackConnectStatusLazily();
}

export async function disconnectSlack() {
    const selection = await window.showInformationMessage(
        `Are you sure you would like to disconnect Slack?`,
        ...["Yes"]
    );

    if (selection === "Yes") {
        let result = await softwarePut(
            `/auth/slack/disconnect`,
            {},
            getItem("jwt")
        );

        // oauth is not null, initialize spotify
        setItem("slack_access_token", null);

        window.showInformationMessage(
            `Successfully disconnected your Slack connection.`
        );
    }
}

async function showSlackMessageInputPrompt() {
    return await window.showInputBox({
        value: "",
        placeHolder: "Enter a message to appear in the selected channel",
        validateInput: text => {
            return !text ? "Please enter a valid message to continue." : null;
        }
    });
}

export async function slackContributor() {
    const selectedChannel = await showSlackChannelMenu();
    if (!selectedChannel) {
        return;
    }
    // !!! important, need to use the get instance as this
    // method may be called within a callback and "this" will be undefined !!!
    const message = await showSlackMessageInputPrompt();
    if (!message) {
        return;
    }
    const slackAccessToken = getItem("slack_access_token");
    const msg = `${message}`;
    const web = new WebClient(slackAccessToken);
    await web.chat
        .postMessage({
            text: msg,
            channel: selectedChannel,
            as_user: true
        })
        .catch(err => {
            // try without sending "as_user"
            web.chat
                .postMessage({
                    text: msg,
                    channel: selectedChannel
                })
                .catch(err => {
                    if (err.message) {
                        console.log(
                            "error posting slack message: ",
                            err.message
                        );
                    }
                });
        });
}

export async function showSlackChannelMenu() {
    let menuOptions = {
        items: [],
        placeholder: "Select a channel"
    };

    // get the available channels
    const channelNames = await getChannelNames();
    channelNames.sort();

    channelNames.forEach(channelName => {
        menuOptions.items.push({
            label: channelName
        });
    });

    const pick = await showQuickPick(menuOptions);
    if (pick && pick.label) {
        return pick.label;
    }
    return null;
}

async function getChannels() {
    const slackAccessToken = getItem("slack_access_token");
    const web = new WebClient(slackAccessToken);
    const result = await web.channels
        .list({ exclude_archived: true, exclude_members: false })
        .catch(err => {
            console.log("Unable to retrieve slack channels: ", err.message);
            return [];
        });
    if (result && result.ok) {
        return result.channels;
    }
    return [];
}

async function getChannelNames() {
    const channels = await getChannels();
    if (channels && channels.length > 0) {
        return channels.map(channel => {
            return channel.name;
        });
    }
    return [];
}
