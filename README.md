# conquest

[![CI](https://github.com/hoffspot/conquest/actions/workflows/ci.yml/badge.svg)](https://github.com/hoffspot/conquest/actions/workflows/ci.yml)

**Last Colony**, the real-time strategy game from
[*Pro HTML5 Games*](https://www.apress.com/9781484229095) (2nd edition) by Aditya Ravi Shankar,
modernized from the book's final version (Chapter 13 of the
[official source code](https://github.com/Apress/pro-html5-games-17)).

This is the complete game: a three-mission single player campaign and two player multiplayer
over WebSocket. It plays like the book's version, but the code has been brought up to date,
bugs in the book's code have been fixed, and it comes with automated tests.
[docs/MODERNIZATION.md](docs/MODERNIZATION.md) describes every change and maps the book's files
to the new ones, so the book is still a good guide to the code.

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

| Setting | How |
| --- | --- |
| Port | `PORT=3000 npm start` (default 8080) |
| Network interface | `HOST=127.0.0.1 npm start` (default: all interfaces) |
| Restart the server when server code changes | `npm run dev` |
| Use a multiplayer server on another host | add `?server=ws://host:8080` to the page URL |

The game is plain ES modules with no build step, so any static web server can serve the
`client/` folder; only multiplayer needs the Node server.

## How to play

**The campaign.** In *Rescue*, find a lost convoy and escort it back to base. In *Assault*, build
up your defences and destroy the rebel base. In *Under Siege*, hold out until the evacuation
fleet arrives and don't lose a single transport. Messages from your operator at the top of the
screen tell you what to do next.

**Multiplayer.** Both players start with a base, a harvester and a few tanks. Deploy the harvester
on an oil field to earn money, build up an army and destroy everything the other player has.

To build, select your base (for buildings) or a starport (for vehicles and aircraft) and use the
buttons in the sidebar. A button is only enabled when you have the right building selected and
enough money. Buildings are placed with a left click on the highlighted squares; right click or
Escape cancels.

| Action | Mouse | Touch screen |
| --- | --- | --- |
| Select a unit or building | Left click | Tap |
| Select several units | Drag a box, or shift + click | Drag a box |
| Move, attack an enemy, or guard a friendly unit | Right click | Double tap |
| Deploy a harvester | Right click an oil field | Double tap an oil field |
| Scroll the map | Move to the edge of the map | Touch near the edge |

| Key | Action |
| --- | --- |
| Arrow keys | Scroll the map |
| P | Pause or resume (campaign) |
| M | Sound on or off |
| Escape | Cancel placing a building |
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
- **Small additions:** pause, mute, keyboard scrolling, keyboard support for menus and the
  multiplayer lobby, clearer error messages when something fails to load or connect.
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
`CHROMIUM_PATH` to an existing Chromium or Chrome executable.

While the game is running, the browser console gives access to the game through `lastColony`,
for example `lastColony.game.cash.blue = 10000` or `lastColony.singleplayer.currentLevel`.

```
client/                 The game (static files served to the browser)
  index.html            Screens: menu, briefing, game, message box, lobby, loading
  styles.css
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
    renderer.js         Drawing the map, units and fog on the canvases
    input.js            Mouse, touch and keyboard controls
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
