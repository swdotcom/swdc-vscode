import { window } from "vscode";
import { showQuickPick } from "./MenuManager";

export class JiraManager {
    private static instance: JiraManager;
    private _snippet: string = "";

    private constructor() {
        //
    }

    static getInstance(): JiraManager {
        if (!JiraManager.instance) {
            JiraManager.instance = new JiraManager();
        }

        return JiraManager.instance;
    }

    async showJiraTicketMenu(snippet: string) {
        this._snippet = snippet;
        let menuOptions = {
            items: [],
            placeholder: "Select a ticket",
        };

        // get the user's tickets
        // const channelNames = await getChannelNames();
        // channelNames.sort();

        // channelNames.forEach(channelName => {
        //     menuOptions.items.push({
        //         label: channelName
        //     });
        // });

        const pick = await showQuickPick(menuOptions);
        if (pick && pick.label) {
            return pick.label;
        }
        return null;
    }

    async showInputBox(value: string, placeHolder: string) {
        return await window.showInputBox({
            value,
            placeHolder,
            validateInput: (text) => {
                return !text
                    ? "Please enter a valid message to continue."
                    : null;
            },
        });
    }
}
