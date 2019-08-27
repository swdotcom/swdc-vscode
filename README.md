[![](https://vsmarketplacebadge.apphb.com/version-short/softwaredotcom.swdc-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=softwaredotcom.swdc-vscode) [![](https://vsmarketplacebadge.apphb.com/installs-short/softwaredotcom.swdc-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=softwaredotcom.swdc-vscode) [![](https://vsmarketplacebadge.apphb.com/rating-short/softwaredotcom.swdc-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=softwaredotcom.swdc-vscode)
[![](https://aka.ms/vsls-badge)](https://aka.ms/vsls)

# Music Time for Visual Studio Code

> Use AI and data to discover the music that makes you the most productive while coding

<p align="center" style="margin: 0 10%">
  <img src="https://s3-us-west-1.amazonaws.com/swdc-static-assets/vs-code-dashboard.gif" alt="Music Time for VS Code" />
</p>

## Features

**Integrated music controls**
Control your music right from the status bar of your editor. 

**Embedded playlists**
Browse and play your Spotify and iTunes playlists and songs from your editor.

**Weekly music dashboard**
See your top songs, artists, and genres each week by productivity score and plays while coding.

**Metrics profile**
Explore your music history and coding productivity based on attributes such as tempo, loudness, and speechiness.

**Slack integration**
Share the music that makes you most productive with your team.

**MWeb app visualizations**
Understand and learn from your music in a whole different way with an array of data visualizations.

| Feature                           | Plugin            | Plugin + Web App  |
| --------------------------------- |:-----------------:|:-----------------:|
| Music controls                    |         X         |         X         |
| Playlists                         |         X         |         X         |
| Music dashboard                   |         X         |         X         |
| Global playlists                  |         X         |         X         |
| Slack integration                 |         X         |         X         |
| Sortable playlists                |                   |         X         |
| Metrics profile                   |                   |         X         |
| Advanced data visualizations      |                   |         X         |
| Personalized song recommendations |                   |         X         |

## How it works

We use the (cody-music)[https://www.npmjs.com/package/cody-music] NPM for all player controls. The NPM uses a Spotify API connection and osascript for player controls.

Music Time is fully supported for both Spotify and iTunes on Mac. On Windows and Linux you must integrate your Spotify account to use the player controls. iTunes is currently not supported on Windows or Linux. 

| Player controls                   | MacOS             | Windows, Linux    |
| --------------------------------- |:-----------------:|:-----------------:|
| Spotify | Premium users, non-premium users with the desktop app installed | Premium users only |
| iTunes | Supported | Not supported |

## Slack integration

How to install: The "Connect Slack" option is available on Mac. 

On Mac, we can show the "Generate Playlist" option, but we can't on Windows for either premium or non-premium Spotify users. Since the purpose of the Slack integration is to share playlists, the Slack integration is not available on Windows.

## FAQs

**Does it work with a non-premium Spotify account?**
Unlike premium users, non-premium accounts have limited API access. Non-premium users must have the Spotify desktop app installed to use Music Time on Mac. 

Both premium and non-premium Spotify users must have a premium account to use the player controls on Windows. Windows users with a non-premium account will be able to see their currently playing track and a heart option, but unlike premium users, they will not see a playlist view.

**What players are supported?**
We support iTunes and Spotify. We will support Google Play in the future.

**Why do I need to sign into Spotify?**
TBD

**How do you calculate my productivity score?**
TBD

**How are songs recommended?**
TBD

**How do I sign up for Music Time if I already have a Code Time account?**
TBD 

**How is my music data correlated with my coding metrics?**
TBD

**Why is there latency when using the player controls?**
On Windows, music controls work via the Spotify API which may result in a slight lag in responsiveness.

**Why do only 50 of my playlists appear in my tree view?**
This is the limit in the Spotify API call.

**What happens to my personalized playlist if I disconnect Spotify?**
If you disconnect Spotify, your personalized top 40 playlist ID will stay the same. If you connect to another Spotify account, it will now instead show up in your playlists in the bottom section instead of the top.

**When does the global top 40 playlist get created in my Spotify account?**
The Software Global Top 40 gets created during initialization; if you delete it during the day, we won't try to create it again until the next day or the next time you initialize.


## Contributing & Feedback

Definitely let us know if you have more questions!

Contact [cody@software.com](mailto:cody@software.com) with any additional questions or comments.
