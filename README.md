# conquest

[![CI](https://github.com/hoffspot/conquest/actions/workflows/ci.yml/badge.svg)](https://github.com/hoffspot/conquest/actions/workflows/ci.yml)

**Last Colony**, the real-time strategy game from
[*Pro HTML5 Games*](https://www.apress.com/9781484229095) (2nd edition) by Aditya Ravi Shankar,
modernized from the book's final version (Chapter 13 of the
[official source code](https://github.com/Apress/pro-html5-games-17)).

This is the complete game: a three-mission single player campaign and two player multiplayer
over WebSocket. It plays like the book's version, but the code has been brought up to date,
bugs in the book's code have been fixed, and it comes with automated tests. It is designed to be
played on a phone in landscape (it's tuned for an iPhone 16 Pro) as well as on tablets and computers:
the map fills the screen, it has touch controls, pinch to zoom and a minimap, and it can be
installed as an app.
[docs/MODERNIZATION.md](docs/MODERNIZATION.md) describes every change and maps the book's files
to the new ones, so the book is still a good guide to the code.

**Play it now at <https://hoffspot.github.io/conquest/>** (the campaign; multiplayer needs the
game's server, see below).

## Quick start

You need [Node.js](https://nodejs.org/) 22 or newer.

```sh
npm install
npm start
```

Open <http://localhost:8080> and choose **Campaign** or **Multiplayer**.

For a multiplayer game, open the page in two browser windows, or on two computers on the same
network using this computer's address instead of `localhost`. Both players pick the same game
room in the lobby and press **Join**.

### Playing on a phone

1. Open <https://hoffspot.github.io/conquest/> on the phone. For multiplayer, start the server on
   a computer instead (`npm start`), connect the phone to the same Wi-Fi network and open the
   address the server prints, for example `http://192.168.1.20:8080`.
2. Turn the phone sideways: the game is played in landscape (in portrait it asks you to turn the
   phone and pauses).
3. For full screen without the browser's toolbars, install the game: on iPhone tap **Share** then
   **Add to Home Screen**; on Android use **Install app** on the start screen or the browser menu.
   The installed game opens in landscape. On Android the game also goes full screen by itself when
   a game starts. Installed from the online copy (or any HTTPS address), the campaign also works
   offline.

| Setting | How |
| --- | --- |
| Port | `PORT=3000 npm start` (default 8080) |
| Network interface | `HOST=127.0.0.1 npm start` (default: all interfaces) |
| Restart the server when server code changes | `npm run dev` |
| Use a multiplayer server on another host | add `?server=ws://host:8080` to the page URL |

The game is plain ES modules with no build step, so any static web server can serve the
`client/` folder; only multiplayer needs the Node server.

### Hosting on GitHub Pages

[.github/workflows/pages.yml](.github/workflows/pages.yml) publishes the `client/` folder to
GitHub Pages every time `main` changes, once the lint and unit tests pass. Setting it up takes one
step: in the repository's **Settings > Pages**, set **Source** to **GitHub Actions**. The workflow
can also be run by hand from the **Actions** tab.

GitHub Pages only serves files, so the published copy has no multiplayer server and its menu only
offers the campaign. To add multiplayer, run the server on a host that supports WebSockets and set
the repository variable `MULTIPLAYER_SERVER` (**Settings > Secrets and variables > Actions >
Variables**) to its address, for example `wss://last-colony.example.com`. The workflow writes it
into `client/js/app/hosting.js`.

## How to play

**The campaign.** In *Rescue*, find a lost convoy and escort it back to base. In *Assault*, build
up your defences and destroy the rebel base. In *Under Siege*, hold out until the evacuation
fleet arrives and don't lose a single transport. Messages from your operator appear at the top of
the map and tell you what to do next.

**Multiplayer.** Both players start with a base, a harvester and a few tanks. Deploy the harvester
on an oil field to earn money, build up an army and destroy everything the other player has.

To build, select your base (for buildings) or a starport (for vehicles and aircraft) and use the
buttons in the sidebar, which show each item's price. A button is only enabled when you have the
right building selected and enough money. The minimap at the top of the sidebar shows the whole
map; tap or click it to jump there.

**On a touch screen:**

| Action | Gesture |
| --- | --- |
| Select a unit or building | Tap it |
| Move the selected units | Tap the ground |
| Attack | Tap an enemy while your units are selected |
| Deploy a harvester | Select it, then tap an oil field |
| Guard a friendly unit | Touch and hold it while your units are selected |
| Select several units | Touch and hold, then drag a box |
| Select all units of one kind on screen | Double tap one of them |
| Scroll the map | Drag with one finger (flick to keep it moving) |
| Zoom | Pinch |
| Place a building | Tap where it should go, then tap it again or press ✓ (✕ cancels) |

The buttons over the map open the menu (pause, sound, full screen, quit), select all your combat
units, deselect, and in multiplayer open the chat.

**With a mouse and keyboard:**

| Action | Mouse |
| --- | --- |
| Select a unit or building | Left click (shift + click adds or removes) |
| Select several units | Drag a box |
| Select all units of one kind on screen | Double click one of them |
| Move, attack an enemy, guard a friendly unit, deploy a harvester | Right click |
| Place a building | Left click on the highlighted squares (right click cancels) |
| Scroll the map | Move to the edge of the map, or drag with the middle button |
| Zoom | Mouse wheel or trackpad pinch |

| Key | Action |
| --- | --- |
| Arrow keys | Scroll the map |
| + and - | Zoom in and out |
| P | Pause menu |
| M | Sound on or off |
| Escape | Cancel placing a building, deselect, or open the menu |
| Enter | Chat with the other player (multiplayer) |

## What's new compared to the book

- **Modern code:** ES modules and classes instead of global objects; a game simulation that is
  independent of the browser (so it can be tested in Node); a fixed-timestep game loop with
  triggers on game time; Web Audio; Pointer Events for mouse, touch and pen.
- **One server:** `npm start` serves the game and runs the multiplayer lobby, using the `ws`
  package instead of the unmaintained `websocket` package. Every message is validated, and
  commands are rebuilt from known fields before they reach the other player.
- **Bug fixes:** the book's version skipped the first mission, never ran one of mission 3's
  failure conditions, duplicated unit ids when a mission was restarted, left a player stuck in a
  multiplayer room after each game, and let players command each other's units. See
  [the full list](docs/MODERNIZATION.md#bugs-fixed).
- **Made for phones:** a full-screen layout that fits any screen (keeping clear of notches and the
  home indicator), touch controls designed for fingers, pinch to zoom, a minimap, sharp graphics
  on high-resolution screens, landscape lock and an installable app (which also works offline
  when the game is served over HTTPS).
- **Small additions:** a pause menu, mute, keyboard scrolling and zoom, keyboard support for menus
  and the multiplayer lobby, prices on the build buttons, markers that confirm each order, clearer
  error messages when something fails to load or connect.
- **Tests:** unit, simulation and server tests, browser tests with Playwright, ESLint and GitHub
  Actions CI.

## Development

```sh
npm run lint        # ESLint
npm test            # unit, simulation and server tests (Node's built-in test runner)
npm run test:e2e    # plays the game in Chromium using Playwright
npm run check       # lint + unit tests
```

The browser tests need Chromium: run `npx playwright install chromium` once, or set
`CHROMIUM_PATH` to an existing Chromium or Chrome executable. They play the game with a mouse on
a desktop screen, and with touch gestures on an emulated iPhone 16 Pro held sideways.

While the game is running, the browser console gives access to the game through `lastColony`,
for example `lastColony.game.cash.blue = 10000` or `lastColony.singleplayer.currentLevel`.

```
client/                 The game (static files served to the browser)
  index.html            Screens: menu, briefing, game, lobby, pause menu, message box, loading
  styles.css            Layout for every screen size, from phones to desktops
  manifest.webmanifest  Lets the game be installed as an app (landscape, full screen)
  sw.js                 Service worker: keeps a copy of the game for offline play
  images/, audio/       Artwork and sounds from the book
  js/main.js            Entry point: creates the game and wires up the browser UI
  js/core/              The game simulation. No DOM code, so it also runs in Node
    game.js             Game state, items, commands, map grids and the game tick
    commands.js         Validation of player commands (shared with the server)
    entities/           Buildings, vehicles, aircraft, bullets and terrain
    pathfinding.js      A* path finding
    fog.js              Fog of war
    triggers.js         Timed and conditional mission events
    data/levels.js      The campaign missions and the multiplayer map
    data/maps.js        Map terrain data
  js/app/               The browser side
    camera.js           Scrolling and zooming the view
    renderer.js         Drawing the map, units and fog on the canvases
    minimap.js          The overview map in the sidebar
    input.js            Mouse, touch and keyboard controls
    hud.js              The buttons over the map
    device.js           Landscape lock, full screen, installing the app
    hosting.js          Where the multiplayer server is (changed for GitHub Pages)
    loop.js             The game loop
    sidebar.js          Cash display and construction buttons
    ui.js               Screens, message box and in-game messages
    sounds.js           Sound effects (Web Audio)
    assets.js           Image loading with a progress display
    singleplayer.js     The campaign
    multiplayer.js      The multiplayer lobby and lockstep game
server/
  index.js              HTTP + WebSocket server (npm start)
  lobby.js              Game rooms, players and the lockstep game clock
  static.js             Serves the client folder
test/                   Unit, simulation and server tests
e2e/                    Playwright browser tests
.github/workflows/      CI (ci.yml) and publishing to GitHub Pages (pages.yml)
docs/MODERNIZATION.md   What changed compared to the book, and why
```

### How multiplayer works

The game uses deterministic lockstep, as in the book. Players never send unit positions, only
the commands they give. The server collects each player's commands and sends them to both
players as part of numbered game ticks, ten per second. Each game only moves on to a tick once
it has that tick's commands. Both players run the same simulation with the same commands, so
their games stay identical.

## Credits and license

Game code and design: *Pro HTML5 Games* by Aditya Ravi Shankar (Apress, 2017). The game code and
assets in this repository are derived from the book's source code, which is distributed under
the book's own freeware license (reproduced in [LICENSE-BOOK-CODE.txt](LICENSE-BOOK-CODE.txt));
it allows personal use and modification, but not commercial use.

Artwork:

- "Hard Vacuum" artwork and game sprites by Daniel Cook (<http://www.lostgarden.com/>)
- Artwork from Open Game Art (<https://opengameart.org>):
  - Thief Portrait by Zeldyn (<http://opengameart.org/content/thief-portrait-female>)
  - Jacob Portrait by Gaspard (<http://opengameart.org/content/four-post-apocalyptic-portraits>)
  - Priest Portrait by Zeldyn (<http://opengameart.org/content/priest-portrait-female>)

Sounds: all sounds from Free Sound (<http://www.freesound.org/>).

The book used Andrea Giammarchi's A* implementation; this version has its own.

## Devlog

Working through the book Pro HTML5 Games, with all code and assets from the supporting materials.
This application will be neither good nor bug free so YMMV.

- 1/28/2022 Currently at listing 6-15
- 2/1/2022 Up to listing 6-19
- 2/15/2022 AM - Through end of chapter 6
- 2/15/2022 PM - Listing 7-3
- 2/22/2022 AM - Listing 7-6
- 2/28/2022 AM - Up to Listing 7-8
- 3/7/2022 PM - Listing 7-9
- 3/8/2022 PM - Working on Listing 7-10 up to processActions
- 5/3/2023 PM - Working to get back in the saddle
- 5/5/2023 AM - Got Github linked back up. Installed Copilot. Getting back to correct spot in code
- 6/19/2023 PM - Trying to enable new laptop
- 7/2/2025 AM - Since I'm never going to put in the direct work, using this project to learn about setting up Agentic AI. We'll see what that can do.
- 9/23/2026 - Replaced the partial first-edition code with a modernized version of the complete game from the 2nd edition's Chapter 13 (see docs/MODERNIZATION.md).
