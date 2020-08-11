import { window, commands } from "vscode";
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

    const placeholder = `Connected using ${type} (${name})`;
    items.push({
        label: "Switch to a different account?",
        detail: "Click to link to a different account.",
        cb: resetData,
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
        command: "codetime.googleLogin"
    });
    items.push({
        label: "Log in with GitHub",
        command: "codetime.githubLogin"
    });
    items.push({
        label: "Log in with Email",
        command: "codetime.codeTimeLogin"
    });
    const menuOptions = {
        items,
        placeholder,
    };
    showQuickPick(menuOptions);
}

export async function processSwitchAccounts() {
    const selection = await window.showInformationMessage(
        "Switch to a different account?",
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
