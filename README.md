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

The game is starting to move from commanding many units to playing one character against
enemies. The first piece is the **character lab** at
<https://hoffspot.github.io/conquest/character-lab.html>: build a human or an orc, change their
body, face, skin and hair, dress and arm them, and watch them walk. See
[docs/CHARACTERS.md](docs/CHARACTERS.md).

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
fleet arrives and don't lose a single transport. Your operator and the other characters call in
to tell you what to do next: the game waits while you read each message, then carries on when you
press **Continue**.

**A new map every time.** Each mission is played on a newly generated map, so the lakes, rivers,
lava and trees, and where the bases, convoys and patrols are, change every time, as in Diablo.
The mission briefing shows the map as the mission starts (under the fog of war, apart from around
your base), its number, and buttons to try a **New map** or play on
**The book's map** instead. If you fail a mission, trying again keeps the same map. To play a map
again later, add its number to the address: `?seed=123456`.

**Multiplayer.** Both players start with a base, a harvester and a few tanks, on a map generated
for the game. Deploy the harvester on an oil field to earn money, build up an army and destroy
everything the other player has.

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
| Enter, Space or Escape | Continue after a message from a mission character |

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
- **3D units:** every vehicle, aircraft and building is a 3D model drawn with
  [Three.js](https://threejs.org), seen from the same angle as the book's art. Models are in team
  colours, turn smoothly, and show damage. Rotors spin, turret guns aim, and buildings rise as they
  are built. The models are free low-poly models by Quaternius, Kenney and PolyDucky (see
  [Credits](#credits-and-license)). See [3D units](docs/MODERNIZATION.md#3d-units).
- **Explosions and fire:** muzzle flashes, glowing tracer shells and missile smoke trails;
  explosions with a fireball, sparks, debris, a shock wave, smoke and scorch marks; burning wrecks
  and smoking damaged units; tanks rock back when they fire. See
  [Effects](docs/MODERNIZATION.md#effects).
- **Generated maps:** every mission and multiplayer game gets a new map, built from the book's
  own tiles, with the mission's bases, convoys and patrols placed to suit it and every route they
  need checked to be passable. The book's map is still available. See
  [Generated maps](docs/MODERNIZATION.md#generated-maps).
- **Castle and town art:** a generator that builds castles and towns as 3D models and renders
  them from the game's own camera, with layouts that tanks can drive through. It isn't on the maps yet. See
  [Castle and town art](docs/MODERNIZATION.md#castle-and-town-art).
- **Characters:** a character engine for a single hero and their enemies, tried out in the
  character lab (`character-lab.html`). It uses MakeHuman's body (CC0), with body, heritage, face
  and physique sliders, and a 52-bone Mixamo-named skeleton whose joints are limited to real
  ranges of motion. Skin, eyes,
  hair and beards are painted and grown procedurally, and whole skin textures can be loaded.
  Clothing and armour are fitted to the body; weapons, shields, helmets and packs sit on sockets.
  Walking is made from gait-lab data, with planted feet, and motion capture clips are retargeted
  to any body. See [docs/CHARACTERS.md](docs/CHARACTERS.md).
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
npm run vendor:three  # after changing the three version in package.json: copies it to client/vendor
npm run extract:tileset  # after changing the book's map image: rebuilds the tiles generated maps use
npm run build:art   # after changing tools/artgen: redraws the castle and town sprite sheets
npm run build:characters -- --mpfb2=../mpfb2  # rebuilds client/characters from MakeHuman's MPFB2
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
  images/art/           Castle and town sprite sheets (made by npm run build:art)
  models/               3D models of the units and buildings (credits in models/CREDITS.md)
  characters/           The body characters are made from (made by npm run build:characters),
                        MakeHuman's texture masks, and motion capture clips
  character-lab.html    The character lab (with character-lab.css)
  vendor/three-r186/    Three.js (minified by scripts/vendor-three.js; loaded through an import map)
  js/main.js            Entry point: creates the game and wires up the browser UI
  js/core/              The game simulation. No DOM code, so it also runs in Node
    game.js             Game state, items, commands, map grids and the game tick
    commands.js         Validation of player commands (shared with the server)
    entities/           Buildings, vehicles, aircraft, bullets and terrain
    pathfinding.js      A* path finding
    mapgen.js           Generating maps: terrain, obstacles and mission sites, with checked routes
    missions.js         Getting a level ready to play on the book's map or a generated one
    sites.js            Helpers for placing a level's units at its sites
    random.js           Seeded random numbers and noise (the same in every browser)
    fog.js              Fog of war
    triggers.js         Timed and conditional mission events
    data/levels.js      The campaign missions and the multiplayer map, with the sites they use
    data/maps.js        Map terrain data
    data/tileset.js     The book's map cut into tiles (made by scripts/extract-tileset.js)
    setpieces/          Castle and town layouts, and the pieces they are built from
  js/characters/        The character engine (see docs/CHARACTERS.md)
    body.js             Loading and shaping the body; macro.js and details.js are the sliders
    rig.js              The skeleton, anatomical joint angles and their limits, two-bone IK
    character.js        A character: its meshes, look and equipment
    skin.js, hair.js    Painting skin and eyes; growing hair and beards
    garments.js         Clothing and armour fitted to the body
    items.js            Weapons, shields, helmets and packs; equipment.js has slots and sockets
    gait.js             Walking data; locomotion.js walks a character with it
    bvh.js              Motion capture: reading BVH files and retargeting them
    presets.js          The human, heroine and orc
  js/lab/character-lab.js  The character lab
  js/app/               The browser side
    camera.js           Scrolling and zooming the view
    renderer.js         Drawing the map, units and fog on the canvases
    units3d.js          Drawing units and buildings as 3D models with Three.js
    models.js           Which model each unit and building uses, its size, team colours and parts
    effects.js          Muzzle flashes, shells, explosions, fire, smoke and scorch marks
    perspective.js      The angle the game is seen from (shared by the models and the effects)
    minimap.js          The overview map in the sidebar
    input.js            Mouse, touch and keyboard controls
    hud.js              The buttons over the map
    device.js           Landscape lock, full screen, installing the app
    hosting.js          Where the multiplayer server is (changed for GitHub Pages)
    loop.js             The game loop
    sidebar.js          Cash display and construction buttons
    ui.js               Screens, message box, character messages and status messages
    sounds.js           Sound effects (Web Audio)
    assets.js           Image loading with a progress display
    singleplayer.js     The campaign
    mapchoice.js        Whether to play on generated maps or the book's map
    multiplayer.js      The multiplayer lobby and lockstep game
server/
  index.js              HTTP + WebSocket server (npm start)
  lobby.js              Game rooms, players and the lockstep game clock
  static.js             Serves the client folder
test/                   Unit, simulation and server tests
e2e/                    Playwright browser tests
scripts/vendor-three.js Copies Three.js from node_modules into client/vendor
scripts/extract-tileset.js  Cuts the book's map into the tiles generated maps are built from
scripts/build-art.js    Runs the art generator in headless Chromium and saves its sprite sheets
scripts/build-characters.js  Prepares MakeHuman's body, shapes and skeleton for the character engine
tools/artgen/           The art generator: builds castle and town pieces in 3D and renders them
.github/workflows/      CI (ci.yml) and publishing to GitHub Pages (pages.yml)
docs/MODERNIZATION.md   What changed compared to the book, and why
docs/CHARACTERS.md      The character engine, and the research behind it
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

3D models (details in [client/models/CREDITS.md](client/models/CREDITS.md)):

- Tanks, rovers, the wraith and the ground turret by Quaternius (<https://quaternius.com>), CC0
- The base, starport and harvester rig are assembled from Kenney's Space Kit
  (<https://kenney.nl/assets/space-kit>), CC0
- The chopper is based on "AH-64 Apache Attack Helicopter Low Poly"
  (<https://sketchfab.com/3d-models/ah-64-apache-attack-helicopter-low-poly-34986214decd4b3db90e91f12e624d78>)
  by PolyDucky (<https://sketchfab.com/salphytheunemployed>), licensed under CC-BY-4.0
  (<http://creativecommons.org/licenses/by/4.0/>). Changes: compressed for the game.

Castle and town art (made by `tools/artgen`):

- Landmarks, props and trees from the KayKit Medieval Hexagon Pack by Kay Lousberg
  (<https://kaylousberg.com>), CC0
- Castle pieces designed after Castle Builder by Jon Rubashkin
  (<https://github.com/JonRubashkin/Castle-Builder>); town layouts after Watabou's Medieval
  Fantasy City Generator (<https://github.com/watabou/TownGeneratorOS>)

Characters: the body, its shapes, skeleton and skin weights, the texture masks and the walk and
zombie walk motion capture clips are from MakeHuman (<https://github.com/makehumancommunity>),
CC0. Gait data from the normal datasets bundled with pyCGM2 (<https://github.com/pyCGM2/pyCGM2>).

3D engine: [Three.js](https://threejs.org) (MIT license, in `client/vendor/three-r186/LICENSE`).

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
