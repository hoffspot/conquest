# conquest

[![CI](https://github.com/hoffspot/conquest/actions/workflows/ci.yml/badge.svg)](https://github.com/hoffspot/conquest/actions/workflows/ci.yml)

**Pellagos**: make a character, choose a weapon, and defend a market town from the orc that
prowls its fields. It's drawn in real-time 3D with [Three.js](https://threejs.org), plays in the
browser on phones, tablets and computers, and can be installed as an app.

**Play it at <https://hoffspot.github.io/conquest/>.** The character lab, for building and
dressing characters and watching them walk and fight, is at
<https://hoffspot.github.io/conquest/character-lab.html>.

[docs/GAME.md](docs/GAME.md) describes how the game works: the world, the fighting, the drawing,
the screens and debug mode. [docs/CHARACTERS.md](docs/CHARACTERS.md) describes the character
engine.

## How to play

**Loading.** The first screen lists everything the game downloads (about 3 MB: the 3D engine,
the game's code, the body characters are made from, its skin details, and the props and trees),
with a bar for each and one for the whole. Then the title screen offers to **Continue** with your
character, or make a **New character**.

**Making a character** takes three steps:

1. **Look.** Shape the body (build, height, bust, heritage and physique), the face, and the
   colours and hair (skin, eyes, hairstyle, beard). **Random** makes someone new. Drag across the
   picture to walk round them; each tab frames what it changes.
2. **Weapon.** Everyone starts in a tunic, leather bracers, leather pants and leather boots, and
   chooses one weapon (a bow comes with a quiver of arrows on the back):

   | Weapon | School | Reach | Damage | Attacks a second | Hits |
   | --- | --- | --- | --- | --- | --- |
   | Sword | Melee | Next square | 4–8 | 0.9 | Slash: twists away |
   | Staff | Melee | Next square | 3–7 | 1.0 | Strike: rocks back |
   | Wand | Magic | 7 m | 2–6 | 1.0 | Arcane bolt: a shudder |
   | Grimoire | Magic | 7 m | 4–9 | 0.6 | Fireball: shields their face from the fire |
   | War hammer | Melee | Next square | 6–12 | 0.6 | Crush: knocked back, knees buckling |
   | Bow | Ranged | 9 m | 3–7 | 0.7 | Arrow: a jolt, and it sticks |
   | Spiked gauntlets | Melee | Next square | 2–5 | 1.7 | Punch: the head snaps round |

   The damage is rolled for every blow: any whole number between the two, each as likely.
3. **Name.** Type one, or ask for a suggestion, and **Begin**.

Your character is saved in the browser, with the town they live in.

**In the town.** You wake in the market square. **Tap or click the ground** to walk there, or
**an enemy** to go and fight them: a red ring round it marks it as your target, and its name
lights up, until it falls or you're told to go elsewhere. **Double-tap** (or double-click) to run there instead, as much
faster than walking as people sprint: 7.9 metres a second to your walking 1.7. Running tires you:
it uses 3 points of **stamina** a second, and anything else gets 1 a second back. You have as
much stamina as hit points (50). While it isn't full, an orange bar under your health shows
what's left; with none left you're out of breath, and walk the rest of the way. Standing still,
you attack whatever is within your weapon's reach on your own: melee weapons reach the eight
squares round yours; ranged ones anything in range that you can see. **Swipe up from yourself**
(a quick flick upwards, starting on your character) to go straight ahead the way you're facing,
as far as you can until something's in the way: sprinting while you have stamina, then walking.

**The camera** keeps still while you move a couple of steps either way. Go further, the way the
map would have to scroll, and it follows you, turning round smoothly to look from behind you the
way you're going (at the same height and zoom), until you stop.

**Blows leave their mark.** Every blow that lands leaves a mark of its weapon's kind where it
hits, on the body and through the clothes: a sword's cut, a cleaver's gash, an arrow left
sticking out of a bleeding hole, a staff's welt, a hammer's swollen bruise split open, a spiked
fist's row of holes, fire's charred, smouldering burn (smoke and embers rising from it a while),
arcane light's glowing violet veins. Falling below three quarters, a half and a quarter of their
hit points, the blow that did it leaves a much worse wound. Blood sprays with each blow, gushes
from the worst, splashes the ground and, once they're badly hurt, drips from them, leaving a
trail; the fallen lie in a spreading pool. Clothes are cut, torn and burnt through where they're
hit, showing the wound beneath. Healing back above a threshold heals that stage's wounds and
marks (all of them, at full health); coming back to life, all of them.

An orc patrols the fields from the north-west corner, halfway down the west side and back. When
it sees you (within 12 metres, with nothing in the way) it chases you and attacks whenever you're
within reach, giving up if it loses sight of you for three seconds. Each blow knocks off hit
points; at none, a character falls. You get up again in the market square five seconds later,
with full health; the orc comes back to its corner half a minute after it falls.

**The minimap**, in the top right under the menu button, shows the whole town and its fields
from above: roads, roofs, trees, what the camera can see, you (an arrow pointing the way you
face), where you're going, and the orc (red; ringed when it's your target). Tap it to walk
there, or tap the orc on it to go and fight it; double-tap to run.

**Spells.** Press and hold on yourself or on an enemy, and a see-through wheel opens round
them, cut in four like a pizza: up, right, down and left. Keep holding and flick towards a slice
to cast what's in it; let go in the middle to change your mind. For now there are two spells,
both at the top. On yourself, **Heal** (a green cross) gives back 10 to 20 hit points, rolled,
after a 0.6-second cast. On an enemy, **Stun** (violet, with stars) reaches 9 metres, if you can
see it: 0.4 seconds later it's dazed for three seconds, unable to move, attack or cast (stars
circle its head). All spells share one cooldown of three seconds from when one's cast: while it
runs, their slices are greyed over, and the grey sweeps back as it passes. A flick at a greyed
slice, or at an empty one, is refused, and a spell that can't be cast (out of reach, out of
sight, already at full health) says why.

**Sound**, in three kinds, each with its own volume:

- **Effects**: swords, staffs, hammers and fists swish; bows twang and spells crackle and chime;
  every kind of blow sounds different where it lands; feet step on cobbles, dirt and grass.
- **Environment**: the wind blows, birds sing, and the trees near you rustle.
- **Music**: a four-minute score in the style of *The Bard's Tale* (1985), played on recordings
  of real, old instruments: an alto recorder, an ocarina, a folk harp, a strumstick (a
  small plucked folk instrument, for a lute), a Renaissance chamber organ, hand chimes, a frame
  drum and a tambourine, with harpsichord arpeggios in the bridge. It's in D Dorian, in 3/4, with
  an intro, verses, choruses, a bridge, a quiet verse, a last chorus and an outro that leads back
  into the intro, so it loops without a seam. It's quiet to start with, under the effects.

The effects and the town's sounds are made in code as the game starts (in a worker, so nothing
waits for them); the music's recordings (about a megabyte) are downloaded meanwhile. Effects and
the town are heard from where you stand: quieter further away, and to the left or right.

**Game options**, in the menu: turn the minimap on or off, turn all the sound on or off, and set
how loud the effects (50% to start with), the environment (40%) and the music (35%) are. The
defaults suit a phone at about 40% volume, with plenty of room to turn each up. They're
remembered.

| Action | Touch | Mouse and keyboard |
| --- | --- | --- |
| Walk | Tap the ground | Click the ground |
| Run | Double-tap the ground | Double-click (or Shift-click) the ground |
| Fight | Tap an enemy (double-tap to run at them) | Click an enemy (double-click to run at them) |
| Zoom | Pinch, or the + and − buttons | Scroll, or the + and − buttons |
| Walk or fight on the map | Tap the minimap (double-tap to run) | Click the minimap (double-click to run) |
| Cast a spell | Hold on yourself or an enemy, then flick to a slice | Hold the button down on them, then flick the mouse |
| Pause, Game options | The menu button | The menu button or Escape |

**Debug mode.** The switch on the title screen shows an overlay, on every screen, of how the game
is running: frame rate and a graph of frame times, how long updating and drawing take, what's
drawn (draw calls, triangles, textures, shaders), memory, the GPU and screen, the battle, and how
long each part took to download and build. Its controls change the drawing quality, render
scale and shadows, and show the squares characters walk on and their paths. See
[docs/GAME.md](docs/GAME.md#debug-mode).

## Quick start

You need [Node.js](https://nodejs.org/) 22 or newer.

```sh
npm install
npm start
```

Open <http://localhost:8080>. To go straight into a game with a random character, open
<http://localhost:8080/?play> (add `&weapon=bow`, `&seed=12` for another town, or
`&quality=low`).

The game is plain ES modules with no build step, so any static web server can serve the
`client/` folder.

| Setting | How |
| --- | --- |
| Port | `PORT=3000 npm start` (default 8080) |
| Network interface | `HOST=127.0.0.1 npm start` (default: all interfaces) |
| Restart the server when its code changes | `npm run dev` |

To play on a phone on the same Wi-Fi network, open the address the server prints, for example
`http://192.168.1.20:8080`, or use the online copy. For full screen without the browser's
toolbars, install it: on iPhone tap **Share** then **Add to Home Screen**; on Android use
**Install app** in the browser's menu. Installed from the online copy (or any HTTPS address), it
also plays offline.

### Hosting on GitHub Pages

[.github/workflows/pages.yml](.github/workflows/pages.yml) publishes the `client/` folder to
GitHub Pages every time `main` changes, once the lint and unit tests pass. To set it up, in the
repository's **Settings > Pages**, set **Source** to **GitHub Actions**. The workflow can also be
run by hand from the **Actions** tab.

## Development

```sh
npm run lint        # ESLint
npm test            # unit tests (Node's built-in test runner)
npm run test:e2e    # plays the game in Chromium using Playwright
npm run check       # lint + unit tests
npm run build:manifest  # after changing what the game downloads: lists it for the loading screen
npm run vendor:three    # after changing the three version in package.json: copies it to client/vendor
npm run build:characters -- --mpfb2=../mpfb2  # rebuilds client/characters from MakeHuman's MPFB2
npm run build:music     # remakes client/music, the music's instrument recordings, from the VCSL
```

`npm test` checks that `client/js/app/manifest.js` (the loading screen's list of files and their
sizes) is up to date, so run `npm run build:manifest` after changing the game's code or data. The
browser tests need Chromium: run `npx playwright install chromium` once, or set `CHROMIUM_PATH`
to an existing Chromium or Chrome executable.

While the game is running, the browser console reaches it through `pellagos`: for example
`pellagos.game.battle.actor("orc")`, or `pellagos.game.advance(10)` to play on ten seconds
without drawing (handy on slow machines).

```
client/                 The game (static files served to the browser)
  index.html            The screens: loading, title, making a character, the game, the menu, debug
  styles.css            Layout for every screen size, from phones to desktops
  manifest.webmanifest  Lets the game be installed as an app
  sw.js                 Service worker: keeps a copy of the game for offline play
  characters/           The body characters are made from (made by npm run build:characters),
                        MakeHuman's texture masks, and motion capture clips
  models/kaykit/        Props and trees (KayKit Medieval Hexagon, CC0)
  music/                The music's instruments: short recordings of real ones, as MP3s (made by
                        npm run build:music from the Versilian Community Sample Library, CC0)
  images/icons/         The app's icons
  character-lab.html    The character lab (with character-lab.css)
  vendor/three-r186/    Three.js (minified by scripts/vendor-three.js; loaded through an import map)
  js/main.js            The screens, from loading to playing (no Three.js: it loads first)
  js/app/               The game on the page
    loader.js           Downloads everything, counting every byte; manifest.js lists it
    session.js          The 3D view and the character kit, and starting games
    creator.js          Making a character; heroes.js has random ones and names
    game.js             Playing: the world, the battle, the characters, taps and the camera
    camera.js           How the camera follows the player: still in the middle, then from behind
    hud.js              Health, stamina, names, damage numbers and messages over the game
    wheel.js            The action wheel: hold, flick, cooldowns; icons.js draws its icons
    minimap.js          The minimap: the world from above, with everyone on it
    debug.js            Debug mode's overlay
    save.js             The saved character and settings (local storage)
    device.js           Full screen and the service worker
  js/core/              The rules. No DOM or Three.js, so they also run in Node
    world.js            The world: a town on 1-metre squares, fields, trees, where everyone starts
    battle.js           Moving, fighting, damage, dying and coming back; the orc's patrol
    weapons.js          The weapons and their attacks
    spells.js           The spells: heal and stun, and their shared cooldown
    pathfinding.js      A* paths on the squares
    random.js           Seeded random numbers
    setpieces/          Town (and castle) layouts, and the pieces they're made from
  js/audio/             The sound: dsp.js has the building blocks; synth.js makes the effects
                        and the town's sounds (worker.js away from the page); score.js writes
                        the music; instruments.js and samples.js are the band's recordings;
                        sound.js plays it all
  js/world/             Drawing the world
    view.js             The renderer, lights, sky, the camera, quality levels, the cutaway
    ground.js           The ground: textures blended square by square
    town3d.js           The town's buildings, props and trees, merged into few meshes
    art/                The art kits the town is built with: houses, landmarks, props, trees
    avatar.js           A character in the world, following its place in the battle
    effects.js          Arrows, bolts, fireballs, sparks, dust, fire, arcane light, blood and
                        its splashes and pools, smoke and embers, the target ring, spells' light
                        and the stars round a stunned head
    wounds.js           Battle damage: each blow's mark and each threshold's wound, painted on
                        the body and its clothes
    squares.js          Debug mode's squares and paths
  js/characters/        The character engine (see docs/CHARACTERS.md)
    body.js             Loading and shaping the body; macro.js and details.js are the sliders
    rig.js              The skeleton, anatomical joint angles and their limits, two-bone IK
    character.js        A character: its meshes, look and equipment
    skin.js, hair.js    Painting skin and eyes; growing hair and beards
    garments.js         Clothing and armour fitted to the body
    items.js            Weapons, shields, helmets and packs; equipment.js has slots and sockets
    gait.js             Walking and running data; locomotion.js walks and runs a character with it
    actions.js          Attacking, casting, flinching when hit, falling
    bvh.js              Motion capture: reading BVH files and retargeting them
    presets.js          The human, heroine and orc
  js/lab/character-lab.js  The character lab
server/                 A static file server for playing locally (npm start)
test/                   Unit tests
e2e/                    Playwright browser tests
scripts/                vendor-three.js, build-characters.js, build-manifest.js, build-music.js
.github/workflows/      CI (ci.yml) and publishing to GitHub Pages (pages.yml)
docs/GAME.md            How the game works
docs/CHARACTERS.md      The character engine, and the research behind it
docs/MODERNIZATION.md   The history: the book's Last Colony, modernized, before Pellagos replaced it
```

## Credits and license

- Props and trees: the KayKit Medieval Hexagon Pack by Kay Lousberg
  (<https://kaylousberg.com>), CC0 (`client/models/kaykit/LICENSE.txt`).
- Characters: the body, its shapes, skeleton and skin weights, the texture masks and the walk and
  zombie walk motion capture clips are from MakeHuman (<https://github.com/makehumancommunity>),
  CC0. Gait data from the normal datasets bundled with pyCGM2 (<https://github.com/pyCGM2/pyCGM2>).
- Town layouts after Watabou's Medieval Fantasy City Generator
  (<https://github.com/watabou/TownGeneratorOS>); castle pieces after Castle Builder by Jon
  Rubashkin (<https://github.com/JonRubashkin/Castle-Builder>).
- Music's instruments: recordings from the Versilian Community Sample Library by Versilian
  Studios (<https://github.com/sgossner/VCSL>), CC0, trimmed and made into MP3s by
  `scripts/build-music.js` (with its SFZ files from <https://github.com/smpldsnds/sgossner-vcsl>).
- 3D engine: [Three.js](https://threejs.org) (MIT license, in `client/vendor/three-r186/LICENSE`).

This repository began as a modernization of Last Colony, the real-time strategy game from
[*Pro HTML5 Games*](https://www.apress.com/9781484229095) by Aditya Ravi Shankar. Pellagos has
replaced it (the book's game is in the git history, and
[docs/MODERNIZATION.md](docs/MODERNIZATION.md) describes it); the book's license for its code and
assets is in [LICENSE-BOOK-CODE.txt](LICENSE-BOOK-CODE.txt).

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
- 9/25/2026 - Replaced the strategy game with Pellagos: one character, made by the player, against an orc, in a town in real-time 3D (see docs/GAME.md).
