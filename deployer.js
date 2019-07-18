#!/usr/bin/env node
const { exec } = require("child_process");
const fs = require("fs");

const KEY_MAP = {
    "code-time": "swdc-vscode",
    "music-time": "music-time"
};

const CODE_TIME_DESC =
    "Code Time is an open source plugin that provides programming metrics right in Visual Studio Code.";
const MUSIC_TIME_DESC =
    "Music Time is an open source plugin that curates and launches playlists for coding right from your editor.";
const CODE_TIME_VERSION = "1.1.16";
const MUSIC_TIME_VERSION = "0.2.6";
const CODE_TIME_DISPLAY = "Code Time";
const MUSIC_TIME_DISPLAY = "Music Time";

// copy the scripts data to dist/scripts
async function deploy() {
    const args = process.argv;
    let packageIt = false;
    if (!args || args.length <= 2) {
        console.error("Usage: node deployer <code-time|music-time> [package]");
        process.exit(1);
    }
    let pluginKey = process.argv[2];
    if (process.argv[3]) {
        packageIt = process.argv[3] === "package";
    }
    if (!KEY_MAP[pluginKey]) {
        console.error("No matching plugin found");
        console.error("Usage: node deployer <code-time|music-time> [package]");
        process.exit(1);
    }
    let pluginName = KEY_MAP[pluginKey];

    if (!pluginName) {
        console.error(
            `The plugin extension name is not found based on the key: ${key}`
        );
        console.error("Usage: node deployer name={swdc-vscode|music-time}");
        process.exit(1);
    }

    debug(`------------- Building plugin: ${pluginName}`);

    let extInfoJson = getJsonFromFile(getExtensionFile());
    extInfoJson["name"] = pluginName;

    let packageJson = getJsonFromFile(getPackageFile());
    packageJson["name"] = pluginName;
    if (pluginName === "swdc-vscode") {
        // remove contributes.viewsContainers and contributes.views
        if (
            packageJson.contributes &&
            packageJson.contributes.viewsContainers
        ) {
            delete packageJson.contributes.viewsContainers;
        }
        if (packageJson.contributes && packageJson.contributes.views) {
            delete packageJson.contributes.views;
        }
        if (packageJson.contributes && packageJson.contributes.menus) {
            delete packageJson.contributes.menus;
        }
        packageJson["description"] = CODE_TIME_DESC;
        packageJson["version"] = CODE_TIME_VERSION;
        packageJson["displayName"] = CODE_TIME_DISPLAY;
        extInfoJson["displayName"] = CODE_TIME_DISPLAY;

        let codeTimeCommands = [];
        let existingCommands = packageJson.contributes["commands"];
        for (let i = 0; i < existingCommands.length; i++) {
            let commandObj = existingCommands[i];
            if (commandObj.command.indexOf("musictime.") === -1) {
                codeTimeCommands.push(commandObj);
            }
        }
        packageJson.contributes["commands"] = codeTimeCommands;
    } else if (pluginName === "music-time") {
        //
        // add the viewsContainers and views
        packageJson.contributes["viewsContainers"] = {
            activitybar: [
                {
                    id: "music-time",
                    title: "Music Time",
                    icon: "resources/dark/headphone-symbol.svg"
                }
            ]
        };
        packageJson.contributes["views"] = {
            "music-time": [
                {
                    id: "music-time-playlists",
                    name: "Music Time"
                },
                {
                    id: "my-playlists",
                    name: "My Playlists"
                },
                {
                    id: "music-time-players",
                    name: "Players"
                }
            ]
        };
        packageJson.contributes["menus"] = {
            "view/item/context": [
                {
                    command: "musictime.play",
                    when: "viewItem =~ /.*item-paused$/",
                    group: "inline"
                },
                {
                    command: "musictime.pause",
                    when: "viewItem =~ /.*item-playing$/",
                    group: "inline"
                },
                {
                    command: "musictime.sharePlaylist",
                    when: "viewItem =~ /playlist-item.*/",
                    group: "inline"
                },
                {
                    command: "musictime.shareTrack",
                    when: "viewItem =~ /track-item.*/",
                    group: "inline"
                }
            ],
            "view/title": [
                {
                    command: "musictime.refreshReconcile",
                    group: "navigation",
                    when: "view  =~ /.*-playlists/"
                }
            ]
        };
        packageJson["description"] = MUSIC_TIME_DESC;
        packageJson["version"] = MUSIC_TIME_VERSION;
        packageJson["displayName"] = MUSIC_TIME_DISPLAY;
        extInfoJson["displayName"] = MUSIC_TIME_DISPLAY;
        let commands = [];
        commands.push({
            command: "musictime.next",
            title: "Play Next Song"
        });
        commands.push({
            command: "musictime.previous",
            title: "Play Previous Song"
        });
        commands.push({
            command: "musictime.play",
            title: "Play",
            icon: {
                light: "resources/light/play-button.svg",
                dark: "resources/dark/play-button.svg"
            }
        });
        commands.push({
            command: "musictime.copyTrack",
            title: "Copy Track Link",
            icon: {
                light: "resources/light/icons8-copy-to-clipboard-16.png",
                dark: "resources/dark/icons8-copy-to-clipboard-16.png"
            }
        });
        commands.push({
            command: "musictime.copyPlaylist",
            title: "Copy Playlist Link",
            icon: {
                light: "resources/light/icons8-copy-to-clipboard-16.png",
                dark: "resources/dark/icons8-copy-to-clipboard-16.png"
            }
        });
        commands.push({
            command: "musictime.shareTrack",
            title: "Share Track",
            icon: {
                light: "resources/light/share.svg",
                dark: "resources/dark/share.svg"
            }
        });
        commands.push({
            command: "musictime.sharePlaylist",
            title: "Share Playlist",
            icon: {
                light: "resources/light/share.svg",
                dark: "resources/dark/share.svg"
            }
        });

        commands.push({
            command: "musictime.pause",
            title: "Pause",
            icon: {
                light: "resources/light/pause-button.svg",
                dark: "resources/dark/pause-button.svg"
            }
        });
        commands.push({
            command: "musictime.itunesPlaylist",
            title: "Switch to iTunes",
            icon: {
                light: "resources/light/icons8-itunes.svg",
                dark: "resources/dark/icons8-itunes.svg"
            }
        });
        commands.push({
            command: "musictime.spotifyPlaylist",
            title: "Switch to Spotify",
            icon: {
                light: "resources/light/icons8-spotify.svg",
                dark: "resources/dark/icons8-spotify.svg"
            }
        });
        commands.push({
            command: "musictime.refreshReconcile",
            title: "Refresh Playlists",
            icon: {
                light: "resources/light/refresh.svg",
                dark: "resources/dark/refresh.svg"
            }
        });
        commands.push({
            command: "musictime.like",
            title: "Like Song"
        });
        commands.push({
            command: "musictime.unlike",
            title: "Unlike Song"
        });
        commands.push({
            command: "musictime.menu",
            title: "Click to see more from Music Time"
        });
        commands.push({
            command: "musictime.currentSong",
            title: "Click to view track"
        });
        commands.push({
            command: "musictime.connectSpotify",
            title: "Connect your Spotify account",
            tooltip: "Connect your Spotify account to view your playlists"
        });
        commands.push({
            command: "musictime.disconnectSpotify",
            title: "Disconnect your Spotify account",
            tooltip: "Disconnect your Spotify account"
        });
        commands.push({
            command: "musictime.refreshPlaylist",
            title: "Refresh"
        });
        commands.push({
            command: "musictime.refreshSettings",
            title: "Refresh"
        });

        packageJson.contributes["commands"] = commands;
    }

    updateJsonContent(extInfoJson, getExtensionFile());
    updateJsonContent(packageJson, getPackageFile());

    const copyCmd = !isWindows() ? "cp" : "copy";
    const pathSep = !isWindows() ? "/" : "\\";
    await runCommand(
        `mkdir -p out${pathSep}lib`,
        "Creating the out/lib directory if it doesn't exist",
        true
    );

    await runCommand(
        `mkdir -p out${pathSep}resources`,
        "Creating the out/resources directory if it doesn't exist",
        true
    );

    await runCommand(
        `${copyCmd} lib${pathSep}extensioninfo.json out${pathSep}lib${pathSep}.`,
        "Copy the extensioninfo.json to the out/lib directory"
    );

    await runCommand(
        `${copyCmd} -R resources${pathSep}* out${pathSep}resources${pathSep}.`,
        "Copy the resources to the out dir"
    );

    if (packageIt) {
        await runCommand("vsce package", "package the plugin");
    }
}

function isWindows() {
    return process.platform.indexOf("win32") !== -1;
}

function getExtensionFile() {
    return __dirname + "/lib/extensioninfo.json";
}

function getPackageFile() {
    return __dirname + "/package.json";
}

function getJsonFromFile(filename) {
    let content = fs.readFileSync(filename).toString();
    if (content) {
        try {
            const data = JSON.parse(content);
            return data;
        } catch (e) {
            //
        }
    }
    return null;
}

function updateJsonContent(packageJson, filename) {
    try {
        // JSON.stringify(data, replacer, number of spaces)
        const content = JSON.stringify(packageJson, null, 4);
        fs.writeFileSync(filename, content, err => {
            if (err)
                console.log(
                    "Deployer: Error updating the package content: ",
                    err.message
                );
            process.exit(1);
        });
    } catch (e) {
        //
    }
}

async function runCommand(cmd, execMsg, ignoreError = false) {
    debug("Executing task to " + execMsg + ".");
    let execResult = await wrapExecPromise(cmd);

    if (execResult && execResult.status === "failed" && !ignoreError) {
        /* error happened */
        debug("Failed to " + execMsg + ", reason: " + execResult.message);
        process.exit(1);
    }
}

async function wrapExecPromise(cmd, dir) {
    let result = null;
    try {
        let dir = __dirname;
        let opts = dir !== undefined && dir !== null ? { cwd: dir } : {};
        result = await execPromise(cmd, opts);
    } catch (e) {
        result = { status: "failed", message: e.message };
    }
    return result;
}

function execPromise(command, opts) {
    return new Promise(function(resolve, reject) {
        exec(command, opts, (error, stdout, stderr) => {
            if (stderr) {
                resolve({ status: "failed", message: stderr.trim() });
                return;
            } else if (error) {
                resolve({ status: "failed", message: error.message });
                return;
            } else {
                resolve({ status: "success", message: stdout.trim() });
            }
        });
    });
}

function debug(message) {
    console.log("-- " + message + "\n");
}

deploy();
