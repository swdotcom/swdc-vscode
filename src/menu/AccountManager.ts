import { window } from "vscode";
import {
    getItem,
    getOsUsername,
    getHostname,
    setItem,
    getPluginUuid,
    getAuthCallbackState,
    setAuthCallbackState,
    getNowTimes,
} from "../Util";
import { softwarePost, isResponseOk } from "../http/HttpClient";
import { showQuickPick } from "./MenuManager";
import { v4 as uuidv4 } from "uuid";

const switchAccountItem = {
    label: "Switch to a different account?",
    detail: "Click to link to a different account."
};
const logIntoExistingItem = {
    label: "Log in with an existing account?",
    detail: "Click to link to an existing account."
};

export async function showSwitchAccountsMenu() {
    accountMenuSelection(switchAccountItem);
}

export async function showExistingAccountMenu() {
    accountMenuSelection(logIntoExistingItem);
}

async function accountMenuSelection(placeholderItem: any) {
    const items = [];
    
    let placeholder = "";
    const name = getItem("name");
    if (name) {
        const authType = getItem("authType");
        let type = "email";
        if (authType === "google") {
            type = "Google";
        } else if (authType === "github") {
            type = "GitHub";
        }
        placeholder = `Connected using ${type} (${name})`
    } else {
        placeholder = "Connect using one of the following";
    }

    items.push(placeholderItem);
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
        commandArgs: [null /*KpmItem*/, true /*switching_account*/]
    });
    items.push({
        label: "Log in with GitHub",
        command: "codetime.githubLogin",
        commandArgs: [null /*KpmItem*/, true /*switching_account*/]
    });
    items.push({
        label: "Log in with Email",
        command: "codetime.codeTimeLogin",
        commandArgs: [null /*KpmItem*/, true /*switching_account*/]
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
    const lastResetDay = getItem("lastResetDay");
    const { day } = getNowTimes();

    // don't let this get called infinitely if the JWT is bad
    if (!lastResetDay || lastResetDay !== day) {
        setItem("lastResetDay", day);
        await createAnonymousUser(true);
        window.showWarningMessage("Your CodeTime session has expired. Please log in.", ...["Log In"]).then(selection => {
            if (selection === "Log In") {
                showLogInMenuOptions()
            }
        });
    }
}

/**
 * create an anonymous user based on github email or mac addr
 */
export async function createAnonymousUser(ignoreJwt: boolean = false): Promise<string> {
    const jwt = getItem("jwt");
    // check one more time before creating the anon user
    if (!jwt || ignoreJwt) {
        // this should not be undefined if its an account reset
        let plugin_uuid = getPluginUuid();
        let auth_callback_state = getAuthCallbackState();
        if (!auth_callback_state) {
            auth_callback_state = uuidv4();
            setAuthCallbackState(auth_callback_state);
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
                auth_callback_state
            }
        );
        if (isResponseOk(resp) && resp.data && resp.data.jwt) {
            setItem("jwt", resp.data.jwt);
            if (!resp.data.user.registered) {
                setItem("name", null);
            }
            setItem("switching_account", false);
            setAuthCallbackState(null);
            return resp.data.jwt;
        }
    }

    return null;
}
