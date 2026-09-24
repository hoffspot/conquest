# Modernizing Last Colony

This document describes how the game in this repository relates to the book's code: where it came
from, what changed and why, which bugs were fixed, and what is still the same.

## Starting point

- **Source:** the final version of the game from the book's official repository,
  [Apress/pro-html5-games-17](https://github.com/Apress/pro-html5-games-17), folder
  `9781484229095/9781484229095_Ch13` (Chapter 13: client plus multiplayer server).
- **Previous contents of this repository:** a partial port of the book's *first* edition code
  (jQuery, `maps.js`, a `websocket`-package server in `js/server.js`), an AI-generated test suite
  for that code (`testsuite/`), notes about it (`CodeUpdates/`) and the Chapter 12 WebSocket demo
  (`websocketdemo/`). These were replaced by the modernized game and are still available in the
  git history.
- **Assets:** `client/images` and `client/audio` are the Chapter 13 assets, minus the files the
  game never uses: the map's debug grid overlay (`plains-debug.png`), the `click` sound, and the
  sprites for two terrain types (`bigrocks`, `smallrocks`) that no mission or map places. Every
  remaining image and sound is used. A few images in the old repository were first edition
  versions with a different layout (`buttons.png` and the character portraits) and were replaced;
  first edition images that the game no longer uses were removed.

## Where things went

| Book (Chapter 13) | This repository |
| --- | --- |
| `client/index.html`, `client/styles.css` | `client/index.html`, `client/styles.css` |
| `js/game.js` (game state, loop, grids, triggers, message box, keyboard) | `js/core/game.js`, `js/core/triggers.js`, `js/app/loop.js`, `js/app/renderer.js`, `js/app/ui.js`, `js/main.js` |
| `js/common.js` (`loader`, `loadItem`, `addItem`, `baseItem`) | `js/app/assets.js`, `js/core/entities/sprites.js`, `js/core/entities/entity.js` |
| `js/buildings.js` | `js/core/entities/buildings.js` (`Building`, `Base`, `Starport`, `GroundTurret`) |
| `js/vehicles.js`, `js/aircraft.js` | `js/core/entities/unit.js` (shared order handling), `vehicles.js`, `aircraft.js` |
| `js/bullets.js`, `js/terrain.js` | `js/core/entities/bullets.js`, `terrain.js` |
| `js/astar.js` | `js/core/pathfinding.js` |
| `js/fog.js` | `js/core/fog.js` (the grid) and `js/app/renderer.js` (painting it) |
| `js/levels.js` | `js/core/data/levels.js`, `js/core/data/maps.js` |
| `js/mouse.js` | `js/app/input.js` |
| `js/sidebar.js` | `js/app/sidebar.js` |
| `js/sounds.js`, `js/wAudio.js` | `js/app/sounds.js` |
| `js/singleplayer.js`, `js/multiplayer.js` | `js/app/singleplayer.js`, `js/app/multiplayer.js` |
| `server/server.js` | `server/index.js`, `server/lobby.js`, `server/static.js` |

Most methods keep the book's names (`processOrders`, `processActions`, `moveTo`, `findAngle`,
`turnTo`, `checkForCollisions`, `rebuildPassableGrid`, ...), so the chapters still work as a guide
to the code.

## What changed

### Code structure

- **ES modules instead of global variables.** Every file imports what it needs; nothing is
  attached to `window` (except `lastColony`, exposed for debugging from the console). There are
  no inline `onclick` handlers in the HTML.
- **Classes for entities.** The book built each item by merging `baseItem`, a category's
  `defaults` and a list entry. Entities are now classes with the same three layers:
  `Entity` → `Unit` → `Vehicle`/`Aircraft`, and `Building` → `Base`/`Starport`/`GroundTurret`,
  plus `Bullet` and `Terrain`. The logic that `vehicles.js` and `aircraft.js` duplicated lives
  once in `Unit`.
- **The simulation has no DOM code.** Everything under `client/js/core` runs in Node as well as
  the browser, which is what makes the automated tests possible (ESLint enforces this). The game
  reports what the player should see or hear through events (`message`, `sound`, `levelend`).
- **A `Game` class instead of a `game` singleton**, so tests can run several games side by side,
  for example two multiplayer clients to check they stay in sync.

### Game loop and timing

- The single player game advances in fixed 100 ms ticks driven by `requestAnimationFrame`, with
  the book's interpolation for smooth movement. It pauses automatically in a hidden tab, and the
  player can pause with **P**.
- **Triggers run on game time.** The book used `setTimeout`/`setInterval`, so mission events kept
  running on the wall clock while the game itself was throttled or paused, and the timer handles
  were stored on the shared level definitions.
- Multiplayer keeps the book's lockstep design and protocol. Ticks still come from the server.
- Map scrolling is time-based (600 px/s), so it no longer runs faster on high refresh rate screens.
  The arrow keys also scroll the map.

### Browser APIs

- **Web Audio** replaces `<audio>` elements and the `wAudio.js` workaround. Sounds can overlap,
  are decoded after the first click or key press (as browsers' autoplay rules require), and a
  missing sound no longer stops the game from loading. **M** toggles sound.
- **Pointer Events** replace separate mouse and touch handlers. Pointer capture keeps a drag
  selection working if the pointer leaves the map, and `touch-action: none` stops touch gestures
  from scrolling the page.
- Assets load with promises; a missing file shows an error instead of leaving the loading screen
  up forever.
- Text is inserted with `textContent`, never `innerHTML`, so chat messages can't inject markup.
- Buttons are `<button>` elements with labels and visible keyboard focus. The message box answers
  to Enter and Escape, and the multiplayer lobby can be used from the keyboard.

### Server

- One Node server (`npm start`) serves the game and runs the multiplayer lobby on the same port.
  The book needed the page opened separately and a WebSocket server on port 8080.
- The unmaintained `websocket` package was replaced with [`ws`](https://github.com/websockets/ws).
- The lobby logic (`server/lobby.js`) is independent of the network code, so it can be tested
  directly.
- Every client message is validated, and commands are rebuilt from known fields before they are
  passed on to the other player (see `client/js/core/commands.js`, shared by the server and the
  game). Dead connections are detected with WebSocket pings.

### Phones and tablets

The game is designed for phones held sideways (tuned for an iPhone 16 Pro), and adapts to any
screen from small phones to large monitors.

- **Layout.** The book scaled a fixed 640x480 screen to fit the window. The menus still do, since
  they are the book's artwork, but the game screen now fills the whole screen: the map takes
  all the space the sidebar doesn't, and the sidebar artwork is scaled to the height of the
  screen. The 80 pixel message strip across the top is gone; messages appear over the map and
  fade after a few seconds. Everything keeps clear of notches, the Dynamic Island, rounded
  corners and the home indicator (`env(safe-area-inset-*)` with `viewport-fit=cover`).
- **Zoom.** A camera (`js/app/camera.js`) lets the map be zoomed. Computers start at the book's
  proportions; touch screens start zoomed in so that units are big enough to tap. Pinch, the
  mouse wheel or the + and - keys zoom.
- **Minimap.** The book's sidebar art has an empty black square at the top. It now shows the
  whole map with the fog of war, units as coloured dots and the part of the map on screen;
  tap or click it to move there.
- **Sharp graphics.** Canvases are drawn at the screen's pixel density (up to 2x).
- **Touch controls.** The book used a tap to select, a double tap for every order and holding a
  finger at the edge of the map to scroll. Now a tap selects or gives the obvious order, one
  finger drags the map (with momentum), two fingers pinch to zoom, touch and hold draws a
  selection box, and double tapping a unit selects all units of that type. Items near a finger
  count as tapped. Buildings are placed by tapping where they should go and confirming.
  Coloured rings confirm each order.
- **On-screen buttons** replace the keyboard and right mouse button: a menu (pause, sound, full
  screen, quit), select all combat units, deselect, confirm or cancel a building, and chat.
- **Landscape only.** In portrait, phones and tablets show a "turn your device" screen and the
  game pauses. On Android the game goes full screen and locks to landscape when a game starts.
  iPhones don't let web pages lock the orientation, so there the "turn your device" screen
  does the job.
- **Installable app.** A web app manifest with icons makes the game installable (Add to Home
  Screen on iPhone, install prompt on Android). The installed game opens full screen and in
  landscape without the browser's toolbars. A service worker keeps a copy of the game so that
  the campaign also works offline (when served over HTTPS).
- **Pause when away.** The campaign pauses when the phone is turned upright or the game goes to
  the background.
- The lobby's rows are taller on touch screens and scroll, and small buttons have larger touch
  areas.

### Tooling

- `npm test`: 102 unit, simulation and server tests using Node's built-in test runner. They
  include a scripted playthrough of mission 1, every mission running for 12 minutes of game time,
  and two simulated multiplayer clients checked for identical state after every tick.
- `npm run test:e2e`: Playwright tests that play the game in Chromium, covering the campaign,
  selection and orders, zooming, the minimap, construction and a two player game with a mouse,
  and on an emulated iPhone 16 Pro in landscape: the layout, taps, dragging, pinching, touch and
  hold selection, placing buildings and the portrait "turn your device" screen.
- `npm run lint`: ESLint.
- GitHub Actions runs all of the above on every push.

## Bugs fixed

These bugs are in the book's Chapter 13 code.

**Campaign and levels**

1. The campaign started at the second mission: `singleplayer.start()` set `currentLevel = 1`.
2. In "Under Siege", the trigger that fails the mission when a transport is destroyed had no
   `type`, so it never ran and losing transports went unpunished.
3. In "Under Siege", the "pilot is hurt" trigger threw a `TypeError` every second once the pilot
   had been shot down.
4. In "Assault", reinforcements arriving after the hero tank had died were given a guard order
   with no target and threw errors.
5. Level definitions were changed while playing: `game.add` wrote uids into the level's items,
   and units shared (and rewrote) the level's order objects. Restarting a mission, or playing a
   second multiplayer game, then produced duplicate uids, so commands could reach the wrong unit.
6. After a multiplayer game ended, its trigger timers were never cleared, and each new game
   started more of them.

**Units and buildings**

7. `findAngleForFiring` added a target building's width to the y offset and its height to the
   x offset, so units aimed off-center at non-square buildings such as the starport.
8. A starport given a second order while a unit was still teleporting in dropped the first unit,
   although its cost had already been paid. In multiplayer, two quick clicks were enough, because
   the button stays enabled until the first order has run.
9. The base built whatever it was told to: in multiplayer, where commands run a few ticks after
   the click, cash could go negative and buildings could appear on top of units.
10. The starport's opening animation read one frame past its sprite sequence.
11. A vehicle exactly on the right edge of the map counted as inside it for path finding.

**Multiplayer**

12. When a game ended, the server removed players from the room while looping over the same
    array, so one player stayed behind. The room was marked empty but still held that player,
    and the next person to join was paired with them.
13. A malformed message (invalid JSON, an unknown room id, a non-string chat message) could crash
    the server, and a third player could join a full room.
14. Commands weren't checked on either side. A player could command the opponent's units, crash
    or freeze both games with an incomplete or made-up order, or "deploy" a harvester onto an
    enemy base to remove it. Now the server and the game both rebuild every command from the
    fields its type needs (targets must be real items named by id, positions must be numbers,
    new units may only start with simple orders), the server attaches the sender's team to each
    command, and clients only obey commands for that team's units.
15. If a player joined a room before their latency had been measured, the room's tick lag was
    `NaN` and the game never started ticking.
16. Spawn locations were sent as single-element arrays and only worked through type coercion.
17. The server registered two `close` handlers for every connection.
18. Leaving a game room while the game was starting left the room in a broken state: if the
    player who left had already loaded the level, the server started the game with one player
    missing and crashed. Now leaving a starting (or running) game ends it for the other player,
    and the player who left stays in the lobby.
19. Clicking **Multiplayer** again while connecting opened extra connections that were never
    closed.

**Input, display and sound**

20. The touch handler read the deprecated global `window.event` instead of its own argument.
21. Releasing the mouse outside the map during a drag selection left the drag stuck.
22. Clicking **Enter Mission** or **Join** left the cursor inside the map's scrolling zone, so the
    view immediately scrolled away from the starting position.
23. The loading screen waited forever if an asset failed to load, or if a browser never fired
    `canplaythrough` for a sound (common on mobile).
24. A sound could not play again until the previous play had finished, and rejected `play()`
    promises were never handled.
25. The caller portrait could disappear early when two messages arrived within six seconds.

## Things that play differently

- The campaign starts with mission 1, "Rescue" (bug 1).
- Losing a transport in "Under Siege" now fails the mission, as the level was written to (bug 2).
- Path finding is proper A*, so units sometimes take slightly different (shorter) routes.
- The game and its mission timers pause when the tab is hidden or the player presses P.
- The game screen fills the screen instead of being a fixed 640x480 box, with messages over
  the map, a minimap and zoom. On touch screens a single tap gives orders (the book used a
  double tap) and dragging scrolls the map.

## Known limitations

These are the same as in the book:

- Multiplayer lockstep assumes both browsers compute identical floating-point results. Two copies
  of the same browser always do, but `Math.sin`, `Math.cos` and `Math.atan2` are not guaranteed
  to give bit-identical results in different browser engines, so a long game between, say,
  Chrome and Firefox could drift apart.
- Browsers slow down timers in background tabs, so a multiplayer game slows down for both players
  while one of them has the game in a hidden tab.
- A dropped connection ends the multiplayer game; there is no reconnecting.
