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
- **The tavern** (`tavernOf`), 3 by 3 plots (12 metres), turned to face the market square if it
  stands on it, otherwise a street (whichever of its sides has an open plot in the middle): its
  door and the two squares in front of it (`front`), cleared, and the square outside them where
  whoever comes out stands (`outside`).

### Maps and links (core/interiors.js)

The town is one map; each floor of a building is another, on the same 1-metre squares:
`world.maps` is `{ town, taproom, upstairs }`, each `{ id, width, height, blocked, opaque (what
blocks sight), ground, origin }`. A floor is drawn as a plan, a row of characters for each row
of squares, north at the top:

```
TAPROOM                UPSTAIRS
<SSSS........K         .SSSS>WBBwWBBw       .  floor           W  wall      T  table
.............K         ......WBB.WBB.       D  door            H  hearth    b  bench
...bb.bb..C..K         ......W...W...       <  foot of stairs  C  bar       K  barrels
HH.TT.TT..C..K         ......W..cW..c       >  top of stairs   M  counter   B  bed
HH.bb.bb..C..K         ..MMM.WW.WWW.W       S  stairs          w  washstand c  chest
HH........C..K         ..............                          L  chaise    o  side table
HH.bb.bb..C..K         ......WW.WWW.W
...TT.TT.....K         ......W..cW..c
...bb.bb......         ....o.W...W...
..............         ......WBB.WBB.
......DD......         .LL...WBBwWBBw
```

The tavern's folk (`tavernFolk`, in `world.folk`): in the taproom, the barkeep behind the bar,
going between it (facing the room) and the barrels (drawing ale); two serving wenches, going
between the front of the bar and the tables, setting tankards down on them; and four patrons on
the benches facing the tables, raising their tankards every 5 to 16 seconds. Upstairs, the madam
keeps to her counter.

Walls, hearths and stairs block walking and sight; furniture only walking. Each run of the same
thing is one piece (a table, a bed, a stretch of wall), for the art and the minimap. The maps
are joined by links, `world.links`: the tavern's door (from the town's `front` squares to the
taproom's `D` squares) and its stairs (from `<` to `>`). Each end of a link is `{ map, squares,
arrive, facing }`: the squares that go through it, and where (and which way facing) whoever
comes through it from the other end stands: just inside the door facing north into the room, at
the foot or the top of the stairs facing south, outside the tavern facing away from it.
`routeBetween` finds the links from one map to another.

## The battle (core/battle.js)

The battle runs in fixed steps of 50 ms, the same on every device, whatever the frame rate.
Each step makes events (`attack`, `projectile`, `hit`, `miss`, `death`, `respawn`,
`exhausted`, `cast`, `healed`, `stunned`...) for the drawing to show; `advance` hands over all
of them since it was last called (so a spell cast between frames is shown too). Nothing in it
draws anything.

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
- **Straight ahead.** An `ahead` order (`{ type: "ahead", facing, run }`) sends a character in a
  straight line the way it faces, as far as it can go: its path is the squares along that line
  (pathfinding.js `lineAhead`, stepping along it a fifth of a metre at a time), up to the first
  blocked square or the world's edge, never cutting a blocked corner. Running, it sprints while
  its stamina lasts, then walks.
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
- **Spells** (spells.js), cast with `cast(id, spell, target)`, take a moment to cast, then
  land. **Heal** is cast on yourself (0.6 s) and gives back a whole number of hit points from 10
  to 20, rolled, never above the most. **Stun** is cast on an enemy within 9 metres that the
  caster can see (0.4 s): for 3 seconds it can't move, attack, cast or think, and whatever it
  was starting is called off; the orc then turns on whoever stunned it. All of a character's
  spells share one cooldown: none can be cast for 3 seconds from when one was. A spell that
  can't be cast says why (`cooldown`, `busy` while staggered, stunned or casting, `full` at full
  health, `range`, `sight`, `dead`, `target`) and nothing happens. Casting stands still, and
  calls off an attack that hasn't landed; walking off doesn't stop a spell once it's begun.
- **Dying and coming back.** At no hit points a character falls; the player gets up in the
  market square 5 seconds later, with full health, and the orc back in its corner 30 seconds
  later (whichever map they fell on).
- **The folk** (`neutral`: the tavern's; `hostile(a, b)` says who fights whom) are on a team of
  their own, and no one fights them: nobody sets on them, casts at them or attacks them, and they
  fight no one. They go about their business (`ai: "routine"`): seated, raising a tankard every
  so often (an `act` event), or going from stop to stop, each in turn or, alternating, one of
  another group at random (the bar, then a table), waiting at each (seconds, from and to),
  facing its way, and doing its act there (serving, pouring). Someone standing on a stop, they
  stop next to it; unable to get to one for 8 seconds, they go on to the next. Their comings and
  goings use their own random numbers, so they don't change how the fighting goes.
- **Doors and stairs.** Every character is on a map (`actor.map`), and only sees, reaches,
  paths round and fights those on the same one. An `enter` order (`{ type: "enter", link }`)
  walks a character to one of the link's squares on its map; standing on one (or next to one
  someone else is standing on), it goes through, coming out at the other end's `arrive` square
  (or the nearest free one), facing its way (the `cross` event). A projectile whose target goes
  through fizzles. The orc, chasing someone who goes through a door or up the stairs within 3
  seconds of it last seeing them, follows them the same way; left on another map, it finds its
  way back through the links to its patrol. The player, set to fight someone who goes through,
  goes after them the same way.

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

| Spell | On | Reach | Casts in | Does | Cooldown (shared) |
| --- | --- | --- | --- | --- | --- |
| Heal | yourself | | 600 ms | 10–20 hit points back | 3000 ms |
| Stun | an enemy | 9 m, in sight | 400 ms | can't act for 3000 ms | 3000 ms |

Both sides have 50 hit points. In play-testing (test/combat.test.js simulates fights on
generated worlds), a sword fight with the orc lasts about 10 seconds and the player usually wins
with a fair few hit points to spare.

## Drawing the world

### The view (world/view.js)

A WebGL renderer with ACES tone mapping, a sky and fog, a studio environment map for the
characters' materials, a hemisphere light and a sun whose shadow map follows the player (a
little ahead of them, where more of the ground is in view, the further out the more: up to 12
of its 24 metres; snapped to whole shadow texels, so shadows don't shimmer). The camera looks
down from 45 degrees above the horizon (low enough to see well ahead of the player), zooming
between 5 and 32 metres away, from any side (`yaw`: from the south, looking north, to start
with).

**Following the player** (app/camera.js). While the player moves about near where it looks (the
zone: 1.4 metres round it, a couple of steps, however it's zoomed, and never nearer the screen's
edge than 60% of the way from its middle), the camera keeps still. Once they walk out of it, the way
the map would have to scroll, it follows them, catching up and turning round to look from behind
them, the way they're going, at the same height and zoom. It turns on a spring, gathering speed
and slowing smoothly, never faster than 3 radians a second (a half turn in about a second), and
the way they're going is averaged over a third of a second, so a path's corners don't swing it
about. Once they stop and it's caught up, it keeps still again, with a new middle. Put somewhere
else (coming back to life), it catches them up without turning. While following, it leans
towards whoever the player is fighting, so both stay in view. The minimap stays north up; what
the camera sees turns on it.

**Quality levels** trade looks for speed, chosen for the device (debug mode can change them):

| Level | Pixels | Shadow map | Antialiasing | Hair | Skin textures |
| --- | --- | --- | --- | --- | --- |
| Low (older phones) | 1× | 1024 | no | a fifth of the strands | 512 |
| Medium (phones) | up to 1.5× | 2048 | yes | 30% | 512 |
| High (computers) | up to 2× | 2048 | yes | 45% | 1024 |

**The cutaway.** A house can stand between the camera and the player, from whichever side it looks. The
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

### Inside and out (app/game.js)

Each map is drawn at its own place in the 3D world (`MAP_ORIGINS`: the taproom 2 kilometres east
of the town, upstairs 100 metres south of that), so nothing of one (shadows, blood, sounds) is
ever seen or heard on another; a character's place on its map is offset by its map's origin.
Only the map the player is on is shown: the town and its ground, or one floor inside. Going
through, the screen dips to black and fades back in over 0.45 s, the camera behind the player
the way they face. Indoors, the view (`setIndoors`) has a dark background and closer fog, a dim
warm light from above and the room's two lamps (for the taproom the hearth's fire and a candle
wheel; upstairs two red-shaded lamps), flickering. The two point lights are always in the
scene, out (at no intensity) outdoors, so that going in and out never makes Three.js recompile
every lit material's shaders.

**Doors and stairs** (app/doors.js). Each end of each link has a box a tap's ray can hit (the
tavern's front door, the inside of the door, the side of the stairs, the stairwell upstairs) and
a glow round its edge: a green ribbon with a softer band either side, drawn additively. A tap on
one (after enemies, before the ground) tells the player to go through; it glows for at least
1.2 s, and while the player's on their way, pulsing, then fades.

**The folk in the game.** Each is built at the start, like the player and the orc (their looks
and clothes are `presets.js`'s `FOLK`; with less hair than the player, as there are more of them,
and nothing worn that never shows), lit but casting no shadows. They have no name plates, can't
be tapped to fight, and show on the minimap as blue dots. Only those on the player's map are
drawn and animated; coming onto a map, everyone on it is put where they are. Their acts play
their animations, and a sound: tankards clinking (at the top of a toast, and softly as one's set
down) and ale pouring from a tap.

### Inside the tavern (world/interiors3d.js)

The rooms are built from their plans with the art kits' materials, five art pixels to the metre:
walls of plaster on a stone footing between timber posts under a beam, with windows of daylight
and curtained doorways; flagstones in the taproom and planks upstairs. In the taproom, the
tables with candles, tankards and plates, and benches; the bar, with tankards along its top, and
behind it two tiers of casks on a stillage, each with a brass tap, and shelves of tankards; the
hearth, a stone chimney breast with a mantel, logs and embers, three flames and a boar on a spit
turning slowly over them; a candle wheel; and the stairs, twelve steps and a handrail rising
3 metres along the north wall. Upstairs, rugs, the counter with a velvet runner, a ledger, a
bell, a candle and a vase of flowers, a chaise longue and side table, the stairwell with its
rail, and four bedrooms with canopied beds (their drapes red or purple), washstands and chests,
lit by red-shaded sconces. Everything that doesn't move is merged by material (about 100 draw
calls in all with the characters); the spit and the flames apart.

The flames are crossed quads with a shader of rising noise, drawn additively and flickering,
and embers rise from the hearth. The whole room is shown, like a doll's house with its near side
cut away: every interior material discards what's more than 1.25 metres above the floor and on
the camera's side of the player (`INTERIOR_CUT`: the player's position and the direction to the
camera, set each frame), so walls, the chimney breast and bed canopies between the camera and
the player are lowered, and everything beyond them stands full height.

### The town (world/town3d.js, world/art)

The art kits build every piece of the town's plan in the art's world pixels, five to a metre:

- **Houses** (kits/house.js) in four styles (whitewashed cottages with thatch, timber-framed,
  brick, stone), one or two storeys of about 3.5 metres, with 2-metre doors and 1-metre windows
  on their south sides, where the camera sees them.
- **Special buildings** (kits/landmarks.js): a two-storey tavern with a jettied, timber-framed
  upper floor, its name, *Wenches and Ale*, in gold blackletter (UnifrakturMaguntia, kits/signs.js,
  loaded as a web font) on an oxblood board along its front, and a hanging sign painted on a
  canvas (a barmaid in a red bodice raising two foaming tankards, in a gilt border, with the
  name on a scroll) swinging from an iron bracket by the door, turned to face the square; a stone church with buttresses, tall windows and a tower
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
seconds, or, where they made a wound, until it heals (no more than eight in anyone: the oldest
go). Every spark, puff, drop of blood and flame is a particle in one of two fixed-size buffers (one
glowing, one not) drawn in a draw call each; nothing adds a light (adding lights makes Three.js
rebuild every lit material's shaders).

**Blood** sprays from each blow's wound, thrown the way the blow went (more from worse wounds, none
from burns), and drips from the badly hurt: below half their hit points now and then, below a
quarter often, twice as often on the move. Drops that reach the ground leave a spot; a blow that
makes a wound (or kills) splashes the ground beyond; and the fallen bleed into a pool under their
chest, spreading over five seconds, drained away when they get up. Spots, splashes and pools are
one instanced mesh (256 at most, the oldest going first), each a picture from a 2 by 2 atlas
drawn as the game starts (three splashes, a pool), wet and a little glossy, fading after about 45
seconds. Burns smoke and throw embers while they smoulder.

### Battle damage (world/wounds.js)

Every blow that lands leaves a **mark** of its kind where it lands; falling below 75%, 50% and 25%
of their hit points (the thresholds: stages 1 to 3), the blow that did it leaves a **wound** for
each one it crossed, bigger and worse. The kind is the attack's reaction:

| Reaction (weapon) | Mark | Wound |
| --- | --- | --- |
| slash (sword) | a nick | a long cut, dark inside, raw at the edges, blood running down |
| hack (orc cleaver) | a cut | a deep, wide gash, bleeding more |
| pierce (bow) | a hole | a hole with the arrow left in it, blood welling and running |
| crush (war hammer) | a bruise | a swollen bruise, split open and bleeding |
| strike (staff) | a welt | a long welt, raw and bleeding along the middle |
| punch (spiked gauntlets) | a bruise pricked by spikes | a bruise torn by a row of spike holes, bleeding |
| fire (grimoire) | a scorch | charred black, raw round it, glowing embers a few seconds; burnt through clothes |
| arcane (wand) | a few veins | crooked veins spreading from it, glowing violet a few seconds, then dark |

A blow lands facing the way it came from (the most facing of a few dozen random points on the
body), at its kind's height (fists higher), never on the hands or head. Healed back above a
threshold, that stage's wounds and marks go (and the arrows in them); at full health, all of
them; coming back to life, all of them.

A character's damage is one 512-texel texture over the body's UV map, which its clothes share:
red for blood, green for bruising, blue for charring, alpha for cuts. Each wound is painted in 3D:
every texel knows where on the body it is (garments.js `texelMap`), so a wound is shaped round its
point across the body's surface (sideways, up it, and turned), wherever the UV map's seams fall,
and blood runs straight down. The body's material and a copy of each garment's (the originals
are shared with everyone who wears them) mix it in with a few lines added to their shaders:
- **Skin**: bruising darkens it purple; a cut is raw red at its edges and dark inside; blood is
  dark red, thicker where there's more, and wet (less rough); char is black.
- **Cloth**: scuffed paler where struck, soaked with blood and scorched; cut, torn or burnt through
  where the cut's deep, its edges frayed pale (singed brown round a burn), showing the skin and its
  wound beneath.
- **Metal**: scratched bright, dented dark, bloodied and blackened.

Burns' embers and arcane veins glow (added light, in the same shaders) for 4 and 5 seconds,
flickering as they die down.

The enemy the player is told to fight (tapped) has a red ring round it on the ground, with four
arrowheads pointing in: one mesh, its colours and see-through-ness in its vertices, drawn
without the scene's tone mapping so it stays red. It closes in on the enemy when it's chosen
(from nearly twice the size, in a quarter of a second), then turns slowly and pulses, following
it until it falls or the player is told to do something else. Its bar over its head is lit red
too.

Spells gather light in the caster's left hand as they're cast (green for Heal, violet for Stun).
A heal lands in a burst of green sparkles rising round the character and a green ring spreading
over the ground; a stun in a flash of violet and gold, and three gold stars circle the stunned character's
head (always facing the camera) until it wears off.

### The minimap (app/minimap.js)

The whole of the map the player is on from above, north up, in the top right of the screen under the menu button (a
canvas, a third of the screen's width on phones, up to 188 pixels). Each square is coloured for
its ground (grass, road, cobbles, soil, courtyard) or what stands on it (roofs over buildings,
blue-grey for the tavern, church and other landmarks, props, trees), with a little variation
from square to square; the buildings get a dark edge and a light ridge and the trees round
crowns. That's painted once, four pixels to the metre. Each frame (at most 30 times a second)
draws it scaled to fit, then what the camera sees (the ground under the screen's corners), where
the player is going, the enemies (red dots, the target ringed) and the player (an arrowhead
pointing the way they face). A tap on it walks the player there, or fights an enemy within 12
pixels of the tap; a double tap runs. Inside, each floor is painted from its plan: the floor,
walls, furniture in its colours, the stairs' treads, round barrels, the hearth's fire and the
doorway; only those on the same floor as the player are shown.

### Sound (audio/)

The effects and the town's sounds are made in code as the game starts; the music is played on
recordings of real instruments. `dsp.js` has the building blocks for the made ones: noise,
filters (biquads, sweeping for swings), envelopes, tones, and a plucked string (Karplus-Strong,
tuned between samples with an all-pass filter so it's in tune at any pitch). `sound.js` plays
it all with the Web Audio API, in three **buses**, each with its own volume (the sliders in Game
options, heard on a curve, `volume ** 2`, as ears hear loudness: halfway is 12 dB down),
turned on or off together by the Sound switch. The mix is turned down about 10 dB, gently
compressed, and limited just under full scale, so a busy fight turned up can't clip:

| Bus | What | To start with |
| --- | --- | --- |
| Effects | Blows, spells, footsteps, cues | 50% |
| Environment | The wind, birds, rustling trees; the tavern's hearth | 40% |
| Music | The town's score, or the tavern's jig | 35% |

The defaults are set for a phone at about 40% volume (a player's own setting): blows and spells
reach about −31 to −37 dBFS at their loudest, footsteps about −43, and the music averages about
−42, a little under the blows. Each slider has 9 to 18 dB of room to turn up. Settings saved on
the earlier, louder scale (`volumeScale` other than 2) have their volumes forgotten, for these.

**Effects** (`synth.js`), each in a few variants so repeats don't sound the same, and each made
about as loud as the others (by its loudest 30 ms), then played at its own volume:

- **Swings** for each melee attack, timed so they're loudest as the blow lands; **launches** for
  arrows, bolts and fireballs; a **hit** for each reaction (a blade's ring for slashes, a knock
  for the staff, a heavy thump for the hammer, a thunk for arrows, a zap for arcane bolts, a
  roar for fire, a meaty thud for punches); a body **falling** as it hits the ground.
- **Spells**: a rising chime casting Heal and a warm chord as it lands; the bolt's crackle
  casting Stun and a zap and warble as it lands.
- **Footsteps**, as each foot lands (the walker says when), on stone, dirt, grass or wooden
  boards (upstairs in the tavern), louder running.
- **A door**: its latch lifting, its hinges creaking and it banging shut, when anyone goes through
  the tavern's door on the player's side of it (so the orc following them in is heard).
- **Cues**: a target chosen, an enemy slain, falling, waking again, out of breath, the action
  wheel opening, and a flick refused.

They're heard from where they happen: full volume within 4 metres of the player, fading to
nothing at 34, and panned left or right; at most 24 at once.

**The environment**: out in the town, a quiet wind (a ten-second loop without a seam), birds now
and then (every 4 to 14 seconds), and leaves rustling in a tree within 22 metres (every 2.5 to 7
seconds), from where the tree is. In the taproom, instead, the hearth's fire crackles (a soft rush
of flame with a few pops and snaps, every 0.2 to 0.9 seconds, from the hearth).

**Music.** A score (`score.js`) in the style of the 1985 *Bard's Tale*: the old games' bard songs
were short, looping, old-world tunes, played on the Commodore 64's sound chip and the Apple II's
speaker. This one is original, and played on recordings of real, old instruments
(`instruments.js`), from the Versilian Community Sample Library (VCSL, CC0: public domain):

| Instrument | Plays | Recording |
| --- | --- | --- |
| Alto recorder | the tune, harmony, long notes | Baroque Alto Recorder, sustained |
| Ocarina (a small, round clay flute) | the tune, softly | sustained, with a gentle vibrato |
| Folk harp | arpeggios, the quiet verse's tune | Folk Harp, medium |
| Strumstick (a small plucked folk instrument, for a lute) | strummed chords | fingered, medium |
| Harpsichord | the bridge's arpeggios | Flemish harpsichord, 8' |
| Renaissance chamber organ | the bass, and chords above it | 8' stop |
| Hand chimes | a few notes over the choruses | Hand Chimes |
| Frame drum, tambourine | the beat | a large and a small hand drum's hits; a tambourine's |

Each pitched instrument was recorded every few semitones; a note plays the nearest recording,
a little faster or slower (never more than 2 semitones, but for the ocarina's three lowest
notes, below the library's lowest). Recorder, ocarina and organ notes sound for as long as the
note lasts, then fade; plucked and struck ones ring on.

**The tavern's music** (`tavern.js`) is a jig, lively, led by a lute: there's no recording of a
real lute under a free licence to be had, so it's played on the nearest, a classical guitar's
nylon strings (FreePats' Spanish classical guitar, CC0), with lute-like double stops (a second
voice a third below the tune's longer notes), and its quick notes stopped a third of a second
after they end, as a finger on the string would. In 6/8 at 108 dotted crotchets a minute, in D
Mixolydian (D major with a C natural, as old dance tunes often are), with a third strain in B
minor; like a dance tune, each strain is eight bars, played twice; about a minute and a half:

| Section | Bars | Tune | With |
| --- | --- | --- | --- |
| Intro | 4 | | the lute strumming, the drum and tambourine lightly |
| A, A again | 8, 8 | the lute; the recorder a third below the second time | the lute's bass and chords (a bass note on each beat, the chord between), the drums |
| B, B again | 8, 8 | the lute; then the recorder, the lute an octave below | long recorder notes, the drums, with a fill |
| C, C again | 8, 8 | the lute, in B minor; then the recorder, the lute a third below | the drums |
| A on the lute | 8 | the lute alone, over a bass note a bar | |
| Break | 4 | | the lute strumming, the drums, with fills |
| Last A, last B | 8, 8 | the lute with the recorder | the drums, with fills |
| Outro | 4 | the lute | ending on A, to lead back to D |

The drums play a jig's beat (the frame drum low on each beat and high on its last quaver, the
tambourine on the off-beats), and each beat's first quaver is leant on. It's about as loud as the
town's score.

**Where it's heard** (`setPlace`, told by the game whenever the player's map changes): each score
has its own track (its instruments' channels, into its own level and low-pass filter). Going into
the tavern, the town's music fades out over 1.5 seconds as the tavern's fades in, from its start;
coming back out, the town's comes back where it left off. Upstairs, the tavern's music is heard
through the floor: at 40% of its level (about 8 dB down) and muffled (low-passed at 650 Hz),
changing over 0.8 s on the stairs.

`npm run build:music` (`scripts/build-music.js`) makes the recordings: for each instrument, it
reads the library's SFZ file (which recording is which note), picks recordings every 4 semitones
or so across the notes the music plays, and downloads them (kept in `.cache`; the guitar's are
FLAC, decoded with `@wasm-audio-decoders/flac`). Each is mixed to
mono, started where its note starts (never a "release" recording, the sound after a note
ends, which some instruments also have), fine-tuned (by the SFZ's tuning),
resampled to 32 kHz, cut to as long as the score needs (0.6 to 2.6 seconds), faded out, made
about as loud as the others (by its loudest 50 ms in its first 0.6 seconds) and saved as an
80 kb/s MP3 named for what's in it: 56 recordings, about 1.1 megabytes in all, listed in
`samples.js`. (MP3 adds about 35 ms of silence at the start of each, the same for every one, so
the music is in time with itself.)

It's in D Dorian (D minor with a raised sixth, the old dances' mode), in 3/4 at 96 beats a
minute, 128 bars, four minutes long:

| Section | Bars | Tune | With |
| --- | --- | --- | --- |
| Intro | 8 | recorder fragment | harp, a low D on the organ |
| Verse | 16 | recorder | strumstick, organ bass, drum |
| Chorus | 16 | ocarina, recorder harmony in the second half | harp, organ, drum and tambourine |
| Verse | 16 | ocarina | long recorder notes under it, strumstick, organ bass, drum |
| Chorus | 16 | ocarina, recorder harmony | harp, organ, chimes, drum and tambourine |
| Bridge | 16 | recorder | harpsichord arpeggios, organ, drum and tambourine (to B flat and back) |
| Quiet verse | 16 | harp | organ, a few chimes |
| Last chorus | 16 | ocarina, recorder harmony | harp, strumstick, organ, chimes, drum and tambourine, with fills |
| Outro | 8 | recorder | harp fading, organ: ending on A, to lead back to D |

The accompaniment is written from each section's chords; the timing and loudness of every note
vary a little (seeded, so it's the same each time). `sound.js` plays it note by note, 1.2
seconds ahead (checked every 0.2 s), each instrument panned in its place in the band and through
a hall's reverb, and carries straight on round from the end to the beginning, so it loops
without a seam. It plays on every screen.

`worker.js` makes the sounds in a worker, the most needed first, so the page never waits
(without module workers they're made on the page, a few at a time). Meanwhile the music's
recordings are downloaded, six at a time, in the background (not on the loading screen: the
game doesn't wait for them), kept by the service worker, and decoded once sound starts; the
music begins when they all are. Offline without them, it just doesn't play. Browsers let a
page make sound only after a tap, click or key, so it starts on the first one (the start or end
of a touch, a click or a key: Safari on iPhones counts only the end of a touch, and wants
something played in it, so a moment of silence is). On an iPhone or iPad, Safari mutes a page's
Web Audio (which this is) while the ring switch is on silent. While the game
is paused, the music and the wind play on (the birds and leaves wait). Everything is silent
while the page is hidden, and off (suspended) when turned off in Game options.

The browser's sound can also stop on its own, and `sound.js` starts it again however it stops:

- **Suspended or interrupted** by the browser (a call, an alarm, a notification, another app's
  sound, the screen locking): asked to resume straight away, and when the page is shown or
  focused again (an interrupted one resumes when the interruption's over), and on the next tap,
  click or key suspended and then resumed, as Safari on iPhones won't resume an interrupted one
  otherwise (turning the sound off and on did the same).
- **Stuck**: Safari on iPhones can say it's playing with its clock standing still. A check every
  0.2 s notices the clock not moving for 1.5 s and starts it again the same way; if it's stuck
  again within 6 s, the browser's sound is made anew.
- **Closed**: made anew.

Made anew, it keeps every sample (the browser's copies work in the new one) and the music carries
on from the note it had got to. A note that can't be played is skipped rather than stopping the
rest, and the 24 effects allowed at once are counted by when each ends, so effects the browser
never says have ended can't use them up.

### The action wheel (app/wheel.js)

Press and hold (0.4 s, without moving) on the player or an enemy, and a see-through wheel
(SVG, 200 pixels across, kept on the screen) opens round them, cut into four slices: up, right,
down and left. Keep holding and flick: as soon as the finger is 30 pixels from where it opened,
the slice it's in is tried, lit gold if it's used; letting go before then does nothing. Each
wheel's slices (`WHEELS`) hold actions (`ACTIONS`), each with an icon (app/icons.js: SVG, in
colours that say what it does, a glowing green cross for Heal, gold stars round a violet dazed
head for Stun). The player's own wheel has Heal at the top; an enemy's, Stun; the other slices
are empty for now.

While spells are cooling down, their slices are greyed over as much of the slice as the cooldown
has left, the grey drawing back as it passes. A flick at a greyed slice, or an empty
one, flashes it red and is refused. The game plays on while it's open; a second finger (a pinch)
closes it.

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
   the game. A tap walks; a press and hold on the player or an enemy opens the action wheel; a second tap within 350 ms and 60 pixels of the first (going by when
   the taps happened, so a slow frame between them doesn't matter) turns it into a run, as does
   a Shift-click. A swipe up that starts on the player (40 pixels up within 600 ms, mostly up)
   sends them straight ahead the way they face, running (an `ahead` order), with the ring where
   they'll stop; blocked straight away, it's refused with a sound. The heads-up display
   (app/hud.js) shows the player's name and health in the bottom left corner (the zoom buttons
   in the bottom right), with an orange stamina bar under the health bar while stamina isn't
   full, "Out of breath" when a run
   ends for want of it, the minimap, bars over the other characters (the target's lit red), and
   the damage each blow does.
5. **The menu** (the menu button, or Escape) pauses the game: Resume, Game options, or back to
   the title. **Game options** has a switch for the minimap, a switch that turns all the sound
   on or off, and a slider (0 to 100%) for each bus: sound effects, environment and music (a
   sound plays as the first two are moved, to hear how loud). Back (or Escape) returns to the
   menu.

The character is saved in the browser's local storage as `pellagos.save`: `{ version, hero,
seed, created }`, where `hero` is `{ name, shape: { macro, details }, look: { skin, eyes, hair },
weapon }`. Settings (the minimap and sound switches, the three volumes, debug mode and its controls) are in
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
the game's hair detail), and again from the sun for shadows. In the taproom there are nine
characters (the folk casting no shadows): about 220 draw calls and 630,000 triangles; only the
characters on the player's map are drawn or animated. Building the eight folk adds about three
seconds to loading on a desktop computer. On phones the quality level draws
fewer pixels and thinner hair and uses smaller textures, and debug mode shows what each costs.
Everything that can be is built once: the town is merged, shaders are compiled while loading,
particles reuse two buffers, blood on the ground is one instanced mesh, and projectiles and
effects add no lights. Battle damage costs a texture lookup or two a pixel on each character,
and a small texture (a megabyte) each, uploaded again only when a blow lands or a wound heals.

## Testing

- `test/world.test.js`, `test/combat.test.js`: the world's layout and pathing on many seeds, and
  the battle: reach in every direction, line of sight, attack timing, projectiles, damage rolls,
  staggering, death and respawn, the orc's patrol, chase and giving up, running (its speed,
  speeding up and slowing down, charging), stamina (used, got back, running out, never below
  none or above its most), spells (heal rolls, stun freezing the orc and calling off its blow,
  the shared cooldown, every reason a cast fails), going straight ahead (to the first wall,
  sprinting, then walking with no stamina), and a simulated minute on a generated world.
  `test/pathfinding.test.js`: A* paths, and the line of squares straight ahead (stopping at a
  wall or the world's edge, never cutting a blocked corner).
- `test/interiors.test.js`: the tavern's folk (on benches facing tables, stops on the floor and
  reachable, toasting now and then without moving, the wenches serving round the tables and back
  to the bar, the barkeep pouring behind it, the madam at her counter, and no one fighting any of
  them); reading plans, the tavern's floors (every table, bench, bed and the
  bar reachable), the tavern's door clear and reachable on 40 seeds, routes between maps, going
  in, up, down and out, orders only on the map a character is on, fighting only there, the orc
  following through the door and up the stairs and finding its way back, the player going after
  a target that goes through, respawning on the map started on, arrows fizzling; and the doors
  and stairs to tap: a target at each end, hit by a tap on it on its map only, glowing when
  tapped and while the player makes for it.
- `test/characters.test.js` (with CHARACTERS.md's): the tavern's folk's bodies and clothes,
  skirts, gowns and aprons (hanging from the waist, flaring to the hem, skinned to the thighs and
  shins), sitting on a bench (thighs level, shins upright), and raising a tankard in a toast.
- `test/wounds.test.js`: battle damage on the real body: the thresholds, a kind for every
  reaction, a mark every blow and a wound for each threshold crossed, each kind painted its own
  way (cuts bleed, blunt blows bruise, fire chars and never bleeds, arcane light leaves veins),
  landing facing the blow at its kind's height (not on the hands or head), healing a stage at a
  time (their arrows with them), gone on coming back to life, glows fading, eight arrows at most,
  and the body's and garments' materials mixing it in.
- `test/camera.test.js`: the camera keeping still while the player moves a couple of steps about
  where it looks, following once they go further and turning behind the player (walked away from, it doesn't turn; walked towards, it turns
  all the way round), smoothly, steady through a path's corners, keeping still again once caught
  up, and catching up without turning when the player comes back to life elsewhere.
- `test/actions.test.js`: attacks (their timing, where the hands reach on different bodies,
  two-handed grips, alternating punches), reactions and falls, on the real body.
- `test/app.test.js`, `test/town3d.test.js`, `test/manifest.test.js`, `test/sw.test.js`: saving,
  heroes (and forgetting volumes saved on the old scale), the minimap's colours (in the town and
  inside), the action wheel (which slice a flick is in, its shapes, its
  actions and icons), the loader's byte counting, the ground's blending, the town's
  builders, the loading list and the service worker.
- `test/audio.test.js`: every sound (clean, as loud as the others, no clicks, swings timed to
  their blows, a sound for every attack, each on its bus, the bow's plucked string in tune), the
  wind's seamless loop, and playing them: from where they happen, on their buses at their
  sliders' volumes, timed, silent hidden or turned off, the music's recordings downloaded and
  decoded (or, offline, not, without fuss), the music scheduled ahead and round again without a
  gap, fading into the tavern's going in (from its start), quieter and muffled upstairs, and back
  to the town's where it left off, and the sound started again however it stops (interrupted, hidden, stuck, closed, a note
  going wrong, effects never ending).
- `test/music.test.js`: the score (its sections and length, every note in time and near a
  recording of its instrument, a tune in every section, in key, ending on A to lead back to D),
  the tavern's jig (its strains of eight bars, the lute in every one, the drums on every beat,
  in D Mixolydian with C sharp only where it should be, looping without a seam),
  the recordings (one for every instrument and kind of drum hit, each note played from the
  nearest, every file a small MP3 in `client/music` and nothing else there) and the build
  script's reading of the library's SFZ and WAV files.
- `e2e/pellagos.spec.js`: the whole game in Chromium: loading, debug mode, making a character
  through to playing them, carrying on with a saved character, a fight to the death, walking by
  tapping, running by double-clicking and double-tapping with the stamina bar showing and going,
  swiping up from the player to go straight ahead (running),
  a bow fight leaving arrows in bleeding wounds, blood on the ground and a pool under the fallen,
  healed and come back to life without them,
  the music's recordings downloaded and playing after a tap (and carrying on when the browser
  suspends or closes its sound), the camera keeping still for a step and following a long walk
  from behind, the target ring, tapping the tavern's door (lit green) to walk in and come out
  inside it facing the room, the folk there (seen, without name plates, toasting, not to be
  fought), up the stairs (the madam), down and out again, walking by the
  minimap, Game options and the volume sliders (remembered), the
  action wheel (stunning the orc, a flick refused while cooling down, then a heal), and a phone
  screen. Drawing without a GPU is slow, so fights are played on with
  `game.advance(seconds)`, which runs the game without drawing each frame.
