# conquest

Hacking on stuff. This application will be neither good nor bug free so YMMV.

This repository holds **Last Colony**, the real-time strategy game built in
[*Pro HTML5 Games*](https://www.apress.com/9781484229095) (2nd edition) by Aditya Ravi Shankar,
modernized from the book's final version (Chapter 13 of the
[official source code](https://github.com/Apress/pro-html5-games-17)).

It is the complete game: a three-mission single player campaign and two player multiplayer.
The game plays the same as the book's version, but the code has been brought up to date and
a number of bugs have been fixed. See [docs/MODERNIZATION.md](docs/MODERNIZATION.md) for the
details and for a map from the book's files to the new ones.

## Running the game

You need [Node.js](https://nodejs.org/) 22 or newer.

```sh
npm install
npm start
```

Then open <http://localhost:8080> in a browser. The same server runs the multiplayer lobby, so
for a two player game just open the page in two browser windows (or on two computers on the same
network, using this computer's address instead of `localhost`) and choose **Multiplayer**.

Set `PORT` to use a different port, for example `PORT=3000 npm start`. `npm run dev` restarts
the server whenever a server file changes.

The game is plain ES modules with no build step, so any static file server can serve the
`client/` folder. Only multiplayer needs the Node server. If the game is served from somewhere
else, point it at the multiplayer server with `?server=ws://host:8080` on the page URL.

## How to play

| Action | Mouse | Touch screen |
| --- | --- | --- |
| Select a unit or building | Left click | Tap |
| Select several units | Drag a box, or shift + click | Drag a box |
| Move, attack, guard a friendly unit | Right click | Double tap |
| Deploy a harvester | Right click an oil field | Double tap an oil field |
| Scroll the map | Move to the edge of the map, or arrow keys | Touch near the edge |

To build, select your base (for buildings) or a starport (for vehicles and aircraft) and use
the buttons in the sidebar. Buildings are placed with a left click; right click or Escape cancels.

| Key | Action |
| --- | --- |
| Arrow keys | Scroll the map |
| P | Pause or resume (campaign only) |
| M | Sound on or off |
| Escape | Cancel placing a building |
| Enter | Chat with the other player (multiplayer only) |

## Development

```sh
npm run lint        # ESLint
npm test            # unit and server tests (Node's built-in test runner, a few seconds)
npm run test:e2e    # plays the game in Chromium with Playwright
npm run check       # lint + unit tests
```

The end-to-end tests need a browser: run `npx playwright install chromium` once, or set
`CHROMIUM_PATH` to an existing Chromium or Chrome executable.

```
client/                 The game (static files)
  index.html
  styles.css
  images/, audio/       Artwork and sounds from the book
  js/main.js            Entry point: wires the browser UI to the game
  js/core/              The game simulation; no DOM, so it also runs in Node for the tests
    game.js             Game state, items, commands, map grids and the game tick
    entities/           Buildings, vehicles, aircraft, bullets and terrain
    pathfinding.js      A* path finding
    fog.js              Fog of war
    triggers.js         Level triggers (timed and conditional events)
    data/levels.js      The campaign missions and the multiplayer map
    data/maps.js        Map terrain data
  js/app/               The browser side: rendering, input, sidebar, screens, sound, game modes
server/                 Node server: static files + WebSocket multiplayer lobby
test/                   Unit, simulation and server tests
e2e/                    Playwright browser tests
```

Open the browser's developer console while playing to inspect the game through `lastColony`,
for example `lastColony.game.cash.blue = 10000`.

## Credits and license

Game code and design: *Pro HTML5 Games* by Aditya Ravi Shankar (Apress, 2017). The game code
in this repository is derived from the book's source code, which is covered by the book's
freeware license; see [LICENSE-BOOK-CODE.txt](LICENSE-BOOK-CODE.txt).

Artwork:

- "Hard Vacuum" artwork and game sprites by Daniel Cook (<http://www.lostgarden.com/>)
- Artwork from Open Game Art (<https://opengameart.org>):
  - Thief Portrait by Zeldyn (<http://opengameart.org/content/thief-portrait-female>)
  - Jacob Portrait by Gaspard (<http://opengameart.org/content/four-post-apocalyptic-portraits>)
  - Priest Portrait by Zeldyn (<http://opengameart.org/content/priest-portrait-female>)

Sounds: all sounds from Free Sound (<http://www.freesound.org/>).

The book used Andrea Giammarchi's A* implementation; this version has its own.

## Devlog

Initially, working through the book Pro HTML5 Games and all code and assets from the supporting materials.

This is a personal devlog

1/28/2022 Currently at listing 6-15
2/1/2022 Up to listing 6-19
2/15/2022 AM - Through end of chapter 6
2/15/2022 PM - Listing 7-3
2/22/2022 AM - Listing 7-6
2/28/2022 AM - Up to Listing 7-8
3/7/2022 PM - Listing 7-9
3/8/2022 PM - Working on Listing 7-10 up to processActions
5/3/2023 PM - Working to get back in the saddle
5/5/2023 AM - Got Github linked back up. Installed Copilot. Getting back to correct spot in code
6/19/2023 PM - Trying to enable new laptop
7/2/2025 AM - Since I'm never going to put in the direct work, using this project to learn about setting up Agentic AI. We'll see what that can do.
9/23/2026 - Replaced the partial first-edition code with a modernized version of the complete game from the 2nd edition's Chapter 13 (see docs/MODERNIZATION.md).
