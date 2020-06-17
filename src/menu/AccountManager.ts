import { window, commands } from "vscode";
import { EventManager } from "../managers/EventManager";
import {
    getItem,
    getOsUsername,
    getHostname,
    getWorkspaceName,
    setItem,
} from "../Util";
import { getAppJwt } from "../DataController";
import { softwarePost, isResponseOk } from "../http/HttpClient";
import { showQuickPick } from "./MenuManager";

export async function showSwitchAccountsMenu() {
    const items = [];
    const authType = getItem("authType");
    const name = getItem("name");
    let type = "email";
    if (authType === "google") {
        type = "Google";
    } else if (authType === "github") {
        type = "GitHub";
    }

    const label = `Connected as ${name} using ${type}`;
    items.push({
        label,
        command: null,
    });
    items.push({
        label: "Switch accounts",
        detail: "Click to log out and link to a different account.",
        cb: resetData,
    });
    const menuOptions = {
        items,
        placeholder: "Switch accounts",
    };
    await showQuickPick(menuOptions);
}

export async function processSwitchAccounts() {
    const selection = await window.showInformationMessage(
        "Are you sure you would like to switch accounts?",
        { modal: true },
        ...["Yes"]
    );
    if (selection && selection === "Yes") {
        await resetData();
    }
}

async function resetData() {
    // clear the session.json
    await resetUserData();

    // refresh the tree
    commands.executeCommand("codetime.refreshTreeViews");

    // delete the current JWT and call the onboard logic so that we
    // create a anon user JWT
    await createAnonymousUser();
}

export async function resetUserData() {
    setItem("jwt", null);
    setItem("name", null);
}

/**
 * create an anonymous user based on github email or mac addr
 */
export async function createAnonymousUser() {
    let appJwt = await getAppJwt();
    if (appJwt) {
        const jwt = getItem("jwt");
        // check one more time before creating the anon user
        if (!jwt) {
            const creation_annotation = "NO_SESSION_FILE";
            const username = await getOsUsername();
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const hostname = await getHostname();
            const workspace_name = getWorkspaceName();
            const eventType = `createanon-${workspace_name}`;
            EventManager.getInstance().createCodeTimeEvent(
                eventType,
                "anon_creation",
                "anon creation"
            );
            const resp = await softwarePost(
                "/data/onboard",
                {
                    timezone,
                    username,
                    creation_annotation,
                    hostname,
                },
                appJwt
            );
            if (isResponseOk(resp) && resp.data && resp.data.jwt) {
                setItem("jwt", resp.data.jwt);
                return resp.data.jwt;
            }
        }
    }
    return null;
}
