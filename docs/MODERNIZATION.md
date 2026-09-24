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
  screen. The 80 pixel message strip across the top is gone. In the campaign, messages from the
  mission's characters open in a dialog with the caller's portrait, and the game pauses until the
  player presses Continue (long messages scroll; several at once are shown one by one). Status
  messages and multiplayer chat appear over the map and fade after a few seconds; older ones
  that no longer fit are removed whole rather than cut off. Everything keeps clear of notches, the Dynamic Island, rounded
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

### 3D units

Every vehicle, aircraft and building is drawn as a 3D model with [Three.js](https://threejs.org)
instead of a sprite. Only the oil fields are still sprites, and shots and explosions are drawn as
[effects](#effects). The map, fog of war, selection and the rest of the game stay 2D.

- **Engine.** Three.js r186 with its WebGL 2 renderer. Before choosing it we compared Three.js,
  Babylon.js, PlayCanvas, OGL, twgl.js, regl and plain WebGL 2:
  - Three.js is the smallest full-featured option that runs as plain ES modules without a
    bundler: 196 KB gzipped, minified. It is MIT licensed, widely used, and has a glTF loader.
  - Babylon.js is about 1.8 MB gzipped and needs a bundler for ES modules.
  - PlayCanvas is about 630 KB gzipped and wants to run the whole game.
  - OGL, twgl.js and regl are small, but have no glTF loading or animation, or aren't actively
    maintained.
  - WebGPU is left for later. Three.js still calls its WebGPU renderer experimental, and iPhones
    before iOS 26 don't have WebGPU. WebGL 2 works everywhere the game runs.
- **Loading.** Three.js is vendored into `client/vendor/three-r186/` so the game keeps working
  offline and on GitHub Pages, and loaded through an import map in `index.html`.
  - Three.js stopped publishing minified builds in r186, so `npm run vendor:three` minifies it with
    esbuild, along with the three add-ons the game uses (the glTF loader, and the utilities it
    needs to copy animated models). That is a one-off step when upgrading, not a build step for
    the game.
  - The game loads `js/app/units3d.js`, Three.js and the models behind the loading screen, with
    the sprites and sounds, rather than as part of the page.
  - If a browser can't run it (no WebGL, or the phone takes the GPU away while the game is in the
    background), units and buildings are drawn as sprites. A model that fails to load falls back
    to its sprite on its own.
- **The models.** Free low-poly models, chosen from about a hundred candidates rendered in the
  game's view (details and licenses in `client/models/CREDITS.md`):

  | Unit or building | Model | Author and license |
  | --- | --- | --- |
  | Heavy tank | "Tank" (Animated Tanks Pack) | Quaternius, CC0 |
  | Scout tank | "Tank2" (Animated Tanks Pack) | Quaternius, CC0 |
  | Harvester | "Rover_Round" (Ultimate Space Kit) | Quaternius, CC0 |
  | Transport | "Rover_2" (Ultimate Space Kit) | Quaternius, CC0 |
  | Chopper | "AH-64 Apache Attack Helicopter Low Poly" | PolyDucky, CC BY 4.0 |
  | Wraith | "Striker" (Ultimate Spaceships Pack) | Quaternius, CC0 |
  | Base | Generator, dish and tanks on a pad, assembled from the Space Kit | Kenney, CC0 |
  | Starport | Landing pad and control blocks, assembled from the Space Kit | Kenney, CC0 |
  | Harvester rig | Support tower, drill pipe and generator, assembled from the Space Kit | Kenney, CC0 |
  | Ground turret | "Turret_Gun" (Cyberpunk Game Kit) | Quaternius, CC0 |

  - The models were compressed with glTF Transform: vertex positions quantized
    (`KHR_mesh_quantization`, which Three.js reads without a decoder), detailed ones simplified,
    and textures kept at 256 pixels or less. All eleven files add up to about 760 KB.
  - `js/app/models.js` lists each model's file, its size on the map, which way its front points,
    how it takes the team colour, and its moving parts. Adding or swapping a model only needs a
    line there.
- **How the models fit into the 2D game.** Every frame, the models on screen are rendered in one
  pass into a hidden WebGL canvas, each in its own square cell. When the 2D renderer reaches a
  unit or building in its usual back-to-front order, it copies that cell onto the map instead of
  drawing the sprite (`Entity.draw` asks `view.drawModel` first).
  - Draw order stays correct: a unit in front of a building covers it, and a unit behind it is
    covered. Selection rings stay under units, and life bars and fog of war stay over them.
  - Tapping, selecting, fog of war and the minimap work as before.
  - We also considered two other approaches. A separate 3D canvas layered over or under the map
    can't mix with the 2D draw order. Moving the whole game into a 3D scene is a much bigger
    rewrite.
- **Camera.** An orthographic camera looks down at the map from 60° above the horizon, which is
  the book's viewing angle. Ground positions are stretched away from the camera
  (`z = y / sin 60°`), so a point on the ground lands exactly where it is on the painted map, while
  height moves things up the screen. Unit tests check both.
- **Sizes.** Each model is scaled to fit the space the game gives it: a unit's longest side is
  about the size of its sprite, and a building fits inside its base area on the map (the ground
  turret's is 20 × 18 pixels, which keeps it in scale with the tanks).
- **Team colours.** The book's sprites were drawn once per team. The models are coloured in the
  game instead:
  - Models with plain coloured materials (the tanks, the Kenney buildings and the turret) give
    their trim materials the team's hue, keeping each material's own lightness so shading
    survives.
  - Models painted with one small shared texture (the rovers and the chopper) are tinted towards
    the team colour.
  - The wraith comes with blue and green skins, so each team has its own file.
- **Animation.**
  - Units turn smoothly between game ticks, the short way round.
  - The chopper's main and tail rotors spin.
  - The ground turret's gun turns to aim while its base stays still.
  - Buildings rise out of the ground while the starport teleports them in or a harvester deploys,
    following the progress of the sprite animation they replace.
  - Damaged units and buildings are drawn darker.
  - Aircraft are drawn above a shadow on the ground, at the same height as their sprites.
  - Tanks rock back when they fire, and gun barrels recoil (see [Effects](#effects)).
  - Rotors and recoil run on game time, so they stop while the game is paused.
- **Lighting.** Materials are converted to simple (Lambert) lighting, lit by the sky and by
  sunlight from the north-west, as in the book's art. Some Kenney materials are metallic or unlit,
  which looked flat or black with this camera.
- **Performance.**
  - A rendered frame is copied from the WebGL canvas once, into a 2D canvas, and each unit is
    copied from there. Copying from the WebGL canvas once per unit made the browser read it back
    from the GPU again and again.
  - Only units and buildings near the view are rendered, and each cell is only as big as its
    model on screen (aircraft are rendered on the ground, and lifted when they are copied).
  - When nothing on screen has moved, turned or changed since the last frame, the 3D render is
    skipped and the last one reused.
  - Three.js renders at one canvas pixel per screen pixel, with antialiasing, and asks for the
    low-power GPU on devices that have two.

### Effects

Shots, hits and destroyed units used to be small sprite animations of three to seven frames.
They are now drawn by `js/app/effects.js` with particles on the 2D canvas, and tanks rock back
when they fire.

- **Research.** The effects follow common practice in game visual effects: Riot's League of
  Legends VFX style guide, the Real-Time VFX community's explosion breakdowns, Jan Willem
  Nijman's "The Art of Screenshake" talk, Squirrel Eiserloh's GDC 2016 talk on camera shake,
  Allen Chou's articles on damped springs, and MDN's advice on canvas performance.
- **Layers.** An explosion is built from layers that each last a different time:
  - a white-hot flash that also lights up the ground (about 0.1 s);
  - a fireball of ragged flames that billow out and cool from white through yellow and orange
    to dark red (about 0.5 s);
  - sparks and debris thrown out, falling back and bouncing; debris kicks up dust where it lands;
  - a shock wave ring racing out across the ground (0.25 s);
  - dark smoke that rises and spreads (1–3 s);
  - a scorch mark that fades over about 20 seconds.
- **Each weapon looks different.**
  - Heavy tank and turret cannons: a star-shaped muzzle flash along the barrel, sparks, a puff
    of smoke and a ring of dust kicked up around the tank; a glowing shell with a tapering
    tracer; a medium explosion.
  - Scout tanks: the same, smaller.
  - Chopper missiles: a smoke trail and a bright exhaust; a bigger explosion.
  - Wraith fireballs: a flickering fireball leaving flames behind it.
  - Destroyed units: a big explosion with a rising column of smoke, then burning wreckage for a
    few seconds. Buildings go up in several blasts across their base. A destroyed aircraft
    explodes in the air and leaves a burnt patch where it falls.
  - Damaged units smoke, and damaged buildings smoke and burn.
- **Recoil.** When a tank fires, its hull is pushed back and tips nose-up, then rocks forward
  past where it started and settles, like a damped spring. Its gun barrel slides back and
  returns. The ground turret's barrel slides back too. Each model's recoil and the position of
  its gun's muzzle are set in `js/app/models.js`.
- **Screen shake.** Destroyed units and buildings shake the view by a few pixels for a moment,
  less the further they are from the middle of the screen. There is no shake for players who
  have asked their device for reduced motion.
- **How it fits in.**
  - The game reports what happened through events ("fire", "hit" and "destroyed"). The effects
    only draw them and never change the game, so multiplayer games stay in step.
  - The effects run on game time, so they freeze while the game is paused.
  - Anything hidden by the fog of war shows no effects.
  - Scorch marks are drawn under the units, and everything else over them, under the fog of
    war. Shots in flight are drawn with the effects rather than as sprites.
- **Performance.**
  - Particles are drawn with a few small images painted once when the game starts: soft glows
    and ragged flames in each colour of fire, smoke puffs, a muzzle flash and tracers. Building
    gradients or using canvas shadows for every particle would be much slower.
  - Fire, light and sparks are drawn with additive blending ("lighter"), so overlapping flames
    brighten each other. Switching blend modes is slow on phones, so each frame draws
    everything in two passes, one per blend mode.
  - Particles live in a fixed pool of at most 400. When it is nearly full, trails and
    lingering smoke are skipped first.
  - In a 20-second test battle (85 shots, 11 units destroyed) on the iPhone profile, drawing the
    effects took 0.3 ms per frame on average and 0.6 ms at the 95th percentile.

### Tooling

- `npm test`: 123 unit, simulation and server tests using Node's built-in test runner. They
  include a scripted playthrough of mission 1, every mission running for 12 minutes of game time,
  and two simulated multiplayer clients checked for identical state after every tick.
- `npm run test:e2e`: Playwright tests that play the game in Chromium, covering the campaign,
  selection and orders, zooming, the minimap, construction, 3D models for units and buildings
  (and sprites when WebGL is missing), explosions and other effects and a two player game with a mouse,
  and on an emulated iPhone 16 Pro in landscape: the layout, taps, dragging, pinching, touch and
  hold selection, placing buildings and the portrait "turn your device" screen.
- `npm run lint`: ESLint.
- GitHub Actions runs all of the above on every push.
- Every change to `main` is published to GitHub Pages (<https://hoffspot.github.io/conquest/>)
  after the lint and unit tests pass. That copy has no multiplayer server, so its menu only offers
  the campaign (`client/js/app/hosting.js` says where the multiplayer server is).

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
- In the campaign, the game pauses while a message from the operator, driver or pilot is on
  screen. The book kept playing while messages scrolled past in the strip at the top.
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
