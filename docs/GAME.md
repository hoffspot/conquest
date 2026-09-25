# How Pellagos works

Pellagos is one character, made by the player, in a market town on a map of 1-metre squares,
against an orc that patrols the fields. Everything is drawn in real-time 3D with Three.js, sized
so that people and buildings look right beside each other, and made to run on phones.

The code is in three layers, each only using the ones below it:

- **The rules** (`client/js/core`): the world, the battle, the weapons. Plain JavaScript with
  seeded random numbers and no DOM or Three.js, so it runs the same everywhere and is tested in
  Node. One player's game could later be the authority for others'.
- **The drawing** (`client/js/world`, `client/js/characters`): the 3D view, the town, the ground,
  the characters, their animations and the effects.
- **The page** (`client/js/app`, `client/js/main.js`): the loading screen, the title, making a
  character, the game's controls and heads-up display, saving, debug mode.

## The world (core/world.js)

`generateWorld({ seed })` makes the world from one seed, so a saved character always comes back
to the same town:

- **A town** laid out by `setpieces/town.js` on a coarser plan of 4-metre squares ("plots"): 18
  by 16 plots of streets, houses of 8 to 16 metres, a market square of 20 to 28 metres with a
  well and stalls, and special buildings (a tavern, church, blacksmith, market hall and windmill).
- **Fields** round it, 5 plots (20 metres) deep on every side, with the town's streets carrying
  on as roads to the edge, and trees dotted about (about one for every 70 square metres, kept
  clear of the roads, the orc's patrol and where people start).
- **Squares**: the map is 112 by 104 squares of 1 metre, each blocked or not, with the kind of
  ground on it. Houses and special buildings block their whole plots; props and trees only the
  middle half of theirs (a well or tent 4 metres across, barrels or a trunk 2), so people can
  walk round them.
- **Where everyone starts**: the player in the middle of the market square, the orc 3 squares in
  from the north-west corner, and the orc's patrol from there halfway down the map's west side.

## The battle (core/battle.js)

The battle runs in fixed steps of 50 ms, the same on every device, whatever the frame rate.
Each step returns events (`attack`, `projectile`, `hit`, `miss`, `death`, `respawn`,
`exhausted`...) for the drawing to show; nothing in it draws anything.

- **Moving.** Each character stands on one square and walks from square middle to square middle
  along A* paths (8 directions, no cutting corners past blocked squares). It never steps into a
  square another character is on or stepping into; if someone is in the way for 0.4 s it finds a
  way round. The player walks at 1.7 m/s; the orc patrols at 1.1 and chases at 1.8.
- **Running and stamina.** Told to run (a move or fight order with `run`), a character sprints
  at `SPRINT` times its walking speed, 6.5 / 1.4 (about 4.6): as much faster as people sprint
  (about 6.5 m/s) than walk (about 1.4 m/s). For the player that's 7.9 m/s. It speeds up at
  6 m/s each second (a second from a walk to a sprint) and slows at 7, slowing in time to arrive
  (or to reach an enemy it's charging) at a walk. Running uses 3 points of stamina a second;
  walking, standing and fighting get 1 a second back. A character has as much stamina as hit
  points, and it never goes above that or below none. With none left, a runner walks the rest of
  the way (the `exhausted` event). Coming back to life, a character is rested. The orc doesn't
  run.
- **Reach.** A melee attack reaches the eight squares touching the attacker's: N, NE, E, SE, S,
  SW, W and NW (Chebyshev distance 1). A ranged attack reaches any square whose middle is within
  its range and that the attacker can see: a line between the two squares' middles that crosses
  no blocked square.
- **Fighting on its own.** Standing still, the player attacks the nearest enemy within reach. Told
  to walk somewhere, they go there (walking away calls off an attack that hasn't landed yet).
  Told to fight someone, they walk until that enemy is within reach, then attack.
- **The orc.** It patrols between its two points, waiting a moment at each end. When it sees the
  player (within 12 squares, in sight) it chases them, finding a new path at most every 0.5 s as
  they move, and attacks whenever they're within reach. If it loses sight of them for 3 seconds it
  goes back to its patrol. Hit, it turns on whoever hit it.
- **An attack** (weapons.js) lands its blow `hitAt` into it and lasts `duration`, and can't be
  repeated for `interval`. A melee blow hits if the target is still within reach. A ranged attack
  lets go of a projectile (an arrow at 22 m/s, a bolt at 14, a fireball at 9) that homes in on its
  target and hits when it arrives.
- **Damage** is rolled for each hit: a whole number from the attack's least to its most, each
  equally likely (the battle's seeded random numbers). It comes off the target's hit points and
  staggers them for a moment (they can't move or start an attack): a punch 0.08 s, a hammer 0.45.
- **Dying and coming back.** At no hit points a character falls; the player gets up in the
  market square 5 seconds later, with full health, and the orc back in its corner 30 seconds
  later.

Each weapon has one or more attacks, used in order of preference by whichever can reach, so a
weapon can have melee and ranged attacks (a staff that strikes up close and casts from afar
would be one line in weapons.js):

| Weapon | Attack | Reach | Damage | Blow lands | Lasts | Every | Stagger | Reaction |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sword | slash | melee | 4–8 | 380 ms | 760 ms | 1100 ms | 150 ms | slash |
| Staff | strike | melee | 3–7 | 330 | 700 | 1000 | 150 | strike |
| Wand | bolt | 7 m | 2–6 | 300 | 620 | 1000 | 150 | arcane |
| Grimoire | fireball | 7 m | 4–9 | 720 | 1100 | 1800 | 250 | fire |
| War hammer | smash | melee | 6–12 | 640 | 1100 | 1700 | 450 | crush |
| Bow | arrow | 9 m | 3–7 | 660 | 1000 | 1400 | 150 | pierce |
| Spiked gauntlets | punch | melee | 2–5 | 170 | 420 | 600 | 80 | punch |
| Orc cleaver | hack | melee | 3–8 | 520 | 900 | 1400 | 200 | hack |

Both sides have 50 hit points. In play-testing (test/combat.test.js simulates fights on
generated worlds), a sword fight with the orc lasts about 10 seconds and the player usually wins
with a fair few hit points to spare.

## Drawing the world

### The view (world/view.js)

A WebGL renderer with ACES tone mapping, a sky and fog, a studio environment map for the
characters' materials, a hemisphere light and a sun whose shadow map follows the player (snapped
to whole shadow texels, so shadows don't shimmer). The camera looks north over the player from
55 degrees above the horizon, zooming between 5 and 32 metres away; it leans towards whoever the
player is fighting so both stay in view.

**Quality levels** trade looks for speed, chosen for the device (debug mode can change them):

| Level | Pixels | Shadow map | Antialiasing | Hair | Skin textures |
| --- | --- | --- | --- | --- | --- |
| Low (older phones) | 1× | 1024 | no | a fifth of the strands | 512 |
| Medium (phones) | up to 1.5× | 2048 | yes | 30% | 512 |
| High (computers) | up to 2× | 2048 | yes | 45% | 1024 |

**The cutaway.** The camera looks north, so a house can stand between it and the player. The
view marches along the line from the player to the camera over the town's height map, and when
something is in the way the town's materials cut a round, dithered hole through whatever is
nearer the camera than the player (a few lines added to their shaders; the shadows they cast
stay whole).

### The ground (world/ground.js)

One flat mesh under the whole map, carrying on 110 metres past its edges into the fog. A small
"splat" texture, four texels to a metre made from the world's ground plan, says how much road,
cobbles, soil and courtyard earth is at each point, with soft, ragged edges; the shader blends
tiling textures by it over grass, each at its real size (cobbles about 16 cm across), and shades
everything by a much larger copy of the grass so the repeats don't show from afar.

### The town (world/town3d.js, world/art)

The art kits build every piece of the town's plan in the art's world pixels, five to a metre:

- **Houses** (kits/house.js) in four styles (whitewashed cottages with thatch, timber-framed,
  brick, stone), one or two storeys of about 3.5 metres, with 2-metre doors and 1-metre windows
  on their south sides, where the camera sees them.
- **Special buildings** (kits/landmarks.js): a two-storey tavern with a jettied, timber-framed
  upper floor and a sign over the door; a stone church with buttresses, tall windows and a tower
  and spire; a blacksmith's workshop with an open shed over the forge, anvil and quenching
  trough; a market hall on stone columns with stalls of produce beneath; a windmill with a
  thatched cap and four sails. (KayKit's buildings were tried first, but they're toy-like: their
  doors are twice a person's height.)
- **Props and trees** (kits/town.js) are KayKit's models, sized to what they are: barrels 95 cm
  tall, crates 85, a wheelbarrow 1.6 metres long, a well 3.4 metres tall, trees 7 to 10.
- **A forest** round the outside of the map, leaving the roads' ways out clear.

Textures are sized in metres too: bricks courses of 10 cm, slates of 15, stone courses of 35.
Everything that doesn't move is merged into one mesh per material, so the whole town draws in a
few dozen draw calls (about 40,000 triangles), however many houses it has. While it's built,
`buildTown` also records how tall whatever stands on each square is, for the cutaway.

### Characters in the world (world/avatar.js)

An avatar is a character (characters/character.js) kept in step with its actor in the battle.
The game shows everyone between where they were at the last two battle steps, so they move
smoothly at any frame rate, and the avatar follows that on a spring (critically damped, of
stiffness 12 a second). The spring rounds off the corners of the battle's square-by-square
paths, so a sprint runs in smooth lines instead of zig-zagging from square to square; it trails
by under a third of a metre walking and about a metre and a quarter sprinting, and catches up
as the character slows to arrive. The walk's stride follows how far the avatar really moved, and
it turns smoothly to face the way it's going (standing or attacking, the way its actor faces). Characters in the game grow only part
of their hair (the quality level's share, in fewer, wider strands: at the game's distance it
looks the same), which roughly halves their triangles.

Attacks, flinches and falls (characters/actions.js, described in
[CHARACTERS.md](CHARACTERS.md#fighting-actionsjs)) are started by the battle's events: an
`attack` event starts the weapon's attack, timed so its blow lands when the battle's does; a
`hit` makes the target flinch in the way the attack's `reaction` says, from the side the blow came
from, flushes their skin red for a moment and shows the damage; a `death` makes them fall away
from the killing blow, lie still for 4 seconds and sink out of sight until they come back.

### Effects (world/effects.js)

Arrows, bolts and fireballs fly from the attacker's hand to the target's chest (arrows arcing a
little), bolts and fireballs leaving trails. Where each blow lands there's a burst for its
reaction: sparks for cuts and arrows, dust and a flash for blunt blows, fire for fireballs, a
swirl of violet light for arcane bolts. Arrows stick in whoever they hit for a couple of
seconds. Every spark, puff and flame is a particle in one fixed-size buffer drawn in one draw
call; nothing adds a light (adding lights makes Three.js rebuild every lit material's shaders).

The enemy the player is told to fight (tapped) has a red ring round it on the ground, with four
arrowheads pointing in: one mesh, its colours and see-through-ness in its vertices, drawn
without the scene's tone mapping so it stays red. It closes in on the enemy when it's chosen
(from nearly twice the size, in a quarter of a second), then turns slowly and pulses, following
it until it falls or the player is told to do something else. Its bar over its head is lit red
too.

### The minimap (app/minimap.js)

The whole world from above, north up, in the top right of the screen under the menu button (a
canvas, a third of the screen's width on phones, up to 188 pixels). Each square is coloured for
its ground (grass, road, cobbles, soil, courtyard) or what stands on it (roofs over buildings,
blue-grey for the tavern, church and other landmarks, props, trees), with a little variation
from square to square; the buildings get a dark edge and a light ridge and the trees round
crowns. That's painted once, four pixels to the metre. Each frame (at most 30 times a second)
draws it scaled to fit, then what the camera sees (the ground under the screen's corners), where
the player is going, the enemies (red dots, the target ringed) and the player (an arrowhead
pointing the way they face). A tap on it walks the player there, or fights an enemy within 12
pixels of the tap; a double tap runs.

### Sound (audio/)

There are no sound files: `synth.js` makes every sound from noise and tones, shaped by filters
(biquads, sweeping for swings), envelopes and a plucked string (Karplus-Strong for the bow),
each in a few variants so repeats don't sound the same. Every sound is made about as loud as
the others (by its loudest 30 ms), then played at its own volume.

- **Swings** for each melee attack, timed so they're loudest as the blow lands; **launches** for
  arrows, bolts and fireballs; a **hit** for each reaction (a blade's ring for slashes, a knock
  for the staff, a heavy thump for the hammer, a thunk for arrows, a zap for arcane bolts, a
  roar for fire, a meaty thud for punches); a body **falling** as it hits the ground.
- **Footsteps**, as each foot lands (the walker says when), on stone, dirt or grass, louder
  running.
- **Cues**: a target chosen, an enemy slain, falling, waking again, out of breath.
- **The town**: a quiet wind (a ten-second loop without a seam) and birds now and then.

`worker.js` makes them in a worker, the most needed first, so the page never waits (without
module workers they're made on the page, a few at a time). `sound.js` plays them with the Web
Audio API, each from where it happens: full volume within 4 metres of the player, fading to
nothing at 34, and panned left or right; at most 24 at once, through a compressor. Browsers let
a page make sound only after a tap, click or key, so it starts on the first one. It's silent
while the game is paused, and off (suspended) when turned off in Game options.

## The screens (main.js)

1. **Loading.** The loader (app/loader.js) downloads everything listed in `app/manifest.js`
   (made by `npm run build:manifest`, which follows the game's imports, and checked by a test),
   six files at a time, reading each as it arrives. The bar shows the bytes downloaded out of the
   total (the files' sizes on disk, which is what arrives, whatever compression the server uses),
   and each group of files has its own row and bar: the 3D engine, the game's code, the body and
   its shapes, its skin details, and the props and trees. The data is kept in memory and handed
   to the character kit and the model loader from there; the code is imported from the browser's
   cache. Then the last part of the bar is starting the 3D view and unpacking the body. Nothing
   before the loader imports Three.js, so the engine's download is counted too.
2. **The title.** Continue with the saved character, or make a new one (which asks before
   replacing a saved one), and the debug mode switch.
3. **Making a character** (app/creator.js): the character stands on a plinth, lit from the front
   and edged in blue light from behind, while the panel beside it (below it on an upright phone)
   changes them. The camera frames what each tab changes: the whole body, the face close up, the
   head and shoulders for colours and hair. The weapon step shows each weapon held on guard and
   swung every few seconds.
4. **Playing** (app/game.js): building the world, with a progress bar for each part (the ground,
   each piece of the town, the characters, compiling every shader before the first frame), then
   the game. A tap walks; a second tap within 350 ms and 60 pixels of the first (going by when
   the taps happened, so a slow frame between them doesn't matter) turns it into a run, as does
   a Shift-click. The heads-up display (app/hud.js) shows the player's name and health, with an
   orange stamina bar under the health bar while stamina isn't full, "Out of breath" when a run
   ends for want of it, the minimap, bars over the other characters (the target's lit red), and
   the damage each blow does.
5. **The menu** (the menu button, or Escape) pauses the game: Resume, Game options, or back to
   the title. **Game options** has a switch each for the minimap and the sound; Back (or Escape)
   returns to the menu.

The character is saved in the browser's local storage as `pellagos.save`: `{ version, hero,
seed, created }`, where `hero` is `{ name, shape: { macro, details }, look: { skin, eyes, hair },
weapon }`. Settings (the minimap and sound switches, debug mode and its controls) are in
`pellagos.settings`. A save of another
version, or one naming a weapon the game doesn't know, is ignored rather than misread; if the
browser won't store anything (private browsing), the game still plays, it just forgets.

## Debug mode

The switch on the title screen turns on an overlay (app/debug.js) on every screen, until it's
switched off (in the game, under the minimap). It folds away to just the frame rate. It shows:

- the frame rate, a graph of the last 120 frames' times (green under a sixtieth of a second, amber
  under a thirtieth, red over), and how long each frame's update and drawing take on the CPU;
- what was drawn: draw calls, triangles, points; geometries, textures and shader programs in
  memory; the quality level, pixel ratio and drawing buffer size;
- the GPU (where the browser says), the JavaScript heap (Chrome), the screen, cores and memory;
- the battle: its time, how many steps each frame ran, projectiles in flight, and each character's
  place, hit points, stamina and what it's doing (with its speed, running);
- how much was downloaded and how long each group took, and how long each part of the world took
  to build.

Its controls change the quality level, the render scale (drawing fewer pixels), whether the sun
casts shadows, and show the squares characters walk on (blocked ones red) with everyone's path.

## Performance

A frame draws the town (a few dozen draw calls, about 40,000 triangles), the ground (one draw
call) and two characters (a body, garments and hair each, about 35,000 to 45,000 triangles at
the game's hair detail), and again from the sun for shadows. On phones the quality level draws
fewer pixels and thinner hair and uses smaller textures, and debug mode shows what each costs.
Everything that can be is built once: the town is merged, shaders are compiled while loading,
particles reuse one buffer, and projectiles and effects add no lights.

## Testing

- `test/world.test.js`, `test/combat.test.js`: the world's layout and pathing on many seeds, and
  the battle: reach in every direction, line of sight, attack timing, projectiles, damage rolls,
  staggering, death and respawn, the orc's patrol, chase and giving up, running (its speed,
  speeding up and slowing down, charging), stamina (used, got back, running out, never below
  none or above its most), and a simulated minute on a generated world.
- `test/actions.test.js`: attacks (their timing, where the hands reach on different bodies,
  two-handed grips, alternating punches), reactions and falls, on the real body.
- `test/app.test.js`, `test/town3d.test.js`, `test/manifest.test.js`, `test/sw.test.js`: saving,
  heroes, the minimap's colours, the loader's byte counting, the ground's blending, the town's
  builders, the loading list and the service worker.
- `test/audio.test.js`: every sound (clean, as loud as the others, no clicks, swings timed to
  their blows, a sound for every attack), the wind's seamless loop, and playing them: from
  where they happen, timed, silent paused or turned off.
- `e2e/pellagos.spec.js`: the whole game in Chromium: loading, debug mode, making a character
  through to playing them, carrying on with a saved character, a fight to the death, walking by
  tapping, running by double-clicking and double-tapping with the stamina bar showing and going,
  the target ring, walking by the minimap, Game options (remembered), and a phone screen. Drawing without a GPU is slow, so fights are played on with
  `game.advance(seconds)`, which runs the game without drawing each frame.
