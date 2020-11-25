import { window, commands } from "vscode";
import {
    getItem,
    getOsUsername,
    getHostname,
    setItem,
    getPluginUuid,
    setPluginUuid,
} from "../Util";
import { softwarePost, isResponseOk } from "../http/HttpClient";
import { showQuickPick } from "./MenuManager";
import { v4 as uuidv4 } from "uuid";

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

    const placeholder = `Connected using ${type} (${name})`;
    items.push({
        label: "Switch to a different account?",
        detail: "Click to link to a different account."
    });
    const menuOptions = {
        items,
        placeholder,
    };
    const selection = await showQuickPick(menuOptions);
    if (selection) {
        // show the google, github, email menu options
        showLogInMenuOptions();
    }
}

function showLogInMenuOptions() {
    const items = [];
    const placeholder = `Log in using...`;
    items.push({
        label: "Log in with Google",
        command: "codetime.googleLogin",
        commandArgs: [null /*KpmItem*/, true /*reset_data*/]
    });
    items.push({
        label: "Log in with GitHub",
        command: "codetime.githubLogin",
        commandArgs: [null /*KpmItem*/, true /*reset_data*/]
    });
    items.push({
        label: "Log in with Email",
        command: "codetime.codeTimeLogin",
        commandArgs: [null /*KpmItem*/, true /*reset_data*/]
    });
    const menuOptions = {
        items,
        placeholder,
    };
    showQuickPick(menuOptions);
}

/**
 * This is called if we ever get a 401
 */
export async function resetDataAndAlertUser() {
    await resetData()
    window.showWarningMessage("Your CodeTime session has expired. Please log in.", ...["Log In"]).then(selection => {
        if (selection === "Log In") {
            showLogInMenuOptions()
        }
    })
}

export async function resetData(refresh_tree: boolean = true) {
    // clear the session.json
    await resetUserData();

    // refresh the tree
    if (refresh_tree) {
        commands.executeCommand("codetime.refreshTreeViews");
    } else {
        // just refresh the menu part of the tree view
        commands.executeCommand("codetime.refreshCodetimeMenuTree");
    }

    // delete the current JWT and call the onboard logic so that we
    // create a anon user JWT
    await createAnonymousUser();
}

export async function resetUserData() {
    setItem("jwt", null);
    setItem("name", null);
    // reset the plugin uuid to allow the user to reauth
    setPluginUuid(null);
}

/**
 * create an anonymous user based on github email or mac addr
 */
export async function createAnonymousUser(): Promise<string> {
    const jwt = getItem("jwt");
    // check one more time before creating the anon user
    if (!jwt) {
        // this should not be undefined if its an account reset
        let plugin_uuid = getPluginUuid();
        if (!plugin_uuid) {
            plugin_uuid = uuidv4();
            // write the plugin uuid to the device.json file
            setPluginUuid(plugin_uuid);
        }
        const username = await getOsUsername();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const hostname = await getHostname();

        const resp = await softwarePost(
            "/plugins/onboard",
            {
                timezone,
                username,
                plugin_uuid,
                hostname,
            }
        );
        if (isResponseOk(resp) && resp.data && resp.data.jwt) {
            setItem("jwt", resp.data.jwt);
            return resp.data.jwt;
        }
    }

    return null;
}
