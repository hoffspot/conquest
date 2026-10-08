# Dungeons

A dungeon is a place under the wilds: a way in above ground (a cave mouth, a hatch, steps down
into a ruin) that leads to one to three levels underground, each a map of its own, joined by
stairs, filled with enemies. Mini-bosses wait along the way. At the far end of the bottom level, a
final boss guards a chest of gold and gear matched to the players' power. Small chests lie about
the rest of it.

This document describes the **dungeon builder**, `client/js/core/dungeons/`. It cooks a whole
dungeon up from a seed and a theme. The builder is pure: no DOM, whole numbers and seeded streams
only. It's the same on every machine, so a host and the players who join it make the same
dungeon. It also describes [dungeons in play](#dungeons-in-play): their ways in out in the wilds,
the levels made as interiors and drawn, the host waking who's in them, the chests, and making one
again once it's cleared.

See any dungeon at <https://hoffspot.github.io/conquest/dungeon-map.html> (or `npm start` and
open <http://localhost:8080/dungeon-map.html>). Try `?seed=7&theme=caves&levels=2&tier=3`.

## What a dungeon is like

- **Its theme**: its look and feel, how its levels are dug, who's in it, and how each kind of room
  is dressed. Three to start, each dug its own way:
  - **caves** (`caves`): caverns scattered about and wandering tunnels between them, with goblins,
    cave spiders, bats, slimes, trolls and worse;
  - **an outlaws' hideout** (`hideout`): rooms dug one off another down short tunnels, with
    bandits, their hounds, hired ogres and hedge priests;
  - **an ancient temple** (`ancient`): pillared halls up a straight middle way, rooms off them
    either side, mirrored; the dead, cultists, wraiths, serpents and scorpions.
- **How deep**: one level (30% of dungeons), two (40%) or three (30%), by seed. Fewer levels are
  bigger, so each takes about the same 15 to 25 minutes to clear (`LEVEL_SIZES`):

  | Levels | Each level | Rooms on each |
  |---|---|---|
  | 1 | 88 m across (give or take 4) | 12 to 14 |
  | 2 | 78 m | 10 to 12 |
  | 3 | 68 m | 8 to 10 |

  In a deeper dungeon, a room is less likely to hold a pack (`PACK_ODDS`: every room that might have
  one, 90% as often in two levels, 75% in three).
- **How strong**: its `tier` (1 to 10: the land's, or its finders', whichever's higher, in play)
  for the first level's packs. Deeper levels' packs are a tier up. A mini-boss is a tier over its
  level, and the boss two over the bottom level's packs. One in ten of a pack is an elite a tier
  up on the first level, one in five on the second, three in ten on the third (`ELITE`).
- **Mini-bosses**: two in a one-level dungeon, two or three in two levels, three or four in three
  (`MINIS`), shared out between the levels. Each waits in a room on the way through, about 40% and
  75% of the way along, with one or two of a pack about it.
- **The boss** stands a few steps before its hoard in the arena, the great room at the far end of
  the bottom level (a dead end, 160 m² and more). Two or three of a pack stand about it. In an
  ancient temple the hoard's at the head of the sanctum, before the altar on the middle way.
  Elsewhere it's at the furthest walk in.
- **Small chests**: two to four on each level (two or three on the bottom level). They're likeliest
  in dead ends, then in rooms off the way through, and never in the room you come in by.
- **Torches** on the walls of most rooms, and on the floor camp fires, braziers and candles.
- **Its name** comes from its theme's words: "the Glittering Deeps", "the Rat's Den", "the Halls of
  Ur-Kalath".

## How a level's made

```
seed + generation
 └ plan: how deep, its mini-bosses shared out between the levels
   └ for each level, up to ATTEMPTS (20) times, each attempt from numbers of its own:
      1. dig      the theme's layout (layouts.js): squares (grid.js) and rooms
      2. read     the rooms back from the squares, and which join which (graph.js)
      3. fill     place.js: the way in, stairs down or the boss and its hoard, mini-bosses,
                  packs, small chests, props by room, torches
      4. check    every room joined, enough rooms, a long enough way through, the room
                  furthest in far enough in, stairs down, the arena big enough (checkLevel);
                  dug again from the next attempt's numbers if not (the best kept, if none pass)
      5. write    plan rows: a character for each square (interiors.js PLAN_KEY)
```

Every level is come into at the middle of its south edge, up a straight way in `WAY_IN` (7) long.
On the first level that's the front door: `DD` on the bottom row, as every building's floor has
it, so `comeIn` brings anyone in five steps. On the levels below, it's the foot of the stairs up:
`^` six squares, and `<` their landing. The stairs down (`V`, six squares dug into a wall of the
room furthest in, where they'll go) have their landing `>` before them. On every level, anyone
coming in arrives two steps off the landing or door, facing into the level. No one waits within
`ARRIVE_CLEAR` (5) rings of where anyone arrives, as with the places gone into (`WAY_IN_CLEAR`).

### The layouts (`layouts.js`)

- **`caves`**: the mouth by the way in. On the bottom level, a great arena far from it (a radius
  of 8 to 10 m). Then two or three great caverns, four to six middling and the rest small, each
  scattered at least 4 m of rock from the others. The caverns are joined along the shortest tree
  through their Gabriel graph, with the arena left out and then joined to its nearest, so it's a
  dead end. One to three more joins follow, the ones that save the most way round (25 m at the
  least: `LOOP_SAVES`). Each cavern is a squashed round whose edge wobbles with noise, and each
  join a wandering tunnel 3 to 5 m wide (a drunkard's walk leaning towards where it's going). The
  whole is smoothed twice (cellular-automaton rounds), and whatever can't be walked to is filled
  in.
- **`accretion`**: a gatehouse at the way in. Then mess halls, quarters, stores and dens, each dug
  off one already dug (the later ones likelier, so it reaches out) down a tunnel 2 to 7 m long.
  Each room only goes where there's solid rock for it and a square round it. On the bottom level
  comes the chief's great hall, off the room furthest in it'll fit off. Then one to three walls are
  broken through, two wide and up to four thick, where that saves 25 steps or more (Brogue's
  loops), never into the hall or the gatehouse.
- **`axial`**: halls up a straight middle way: a vestibule, then two to four pillared halls,
  galleries of tombs, rotundas or crossed chapels, as many as fit. At the top is a stair hall, or
  on the bottom level the sanctum. Rooms come off the halls either side, mirrored (shrines,
  ossuaries, cells), with a further cell up from some. Then comes a breach, a rough tunnel between
  two rooms on one side where the rock's broken in, or a wall broken through.

### What's put in (`place.js`)

After the stairs or the boss come mini-bosses, then packs, then small chests. Then each room is
dressed and lit as its theme has that kind of room (its *look*, chosen by seed). A look's props
each say where they go (`PROP_PLACES`):

- `wall`: against a wall, its open side free;
- `open`: free standing, with ground all round;
- `centre`: as near the room's middle as it can be;
- `corner`: in a corner;
- `rows`: pillars every third square across a hall, the middle way kept clear;
- `sides`: tombs along both long sides;
- `head`: against the north wall, centred on the middle way.

A look's props can be `mirror`ed across the middle way. Nothing that blocks touches anything else
that blocks, none goes within two squares of a room's ways in, and a prop is only put where every
square that can be walked on can still be walked to.

### What comes out (`buildDungeon`)

```
{ version, seed, theme, tier, generation, name, style, ground, sound,
  levels: [{ index, width, height, rows, tier, attempt, loops,
             rooms: [{ id, kind, area, x, y, w, h, centre, role }],   // role: entry, stairs,
             links, path,                                              //   arena, mini, pack, quiet
             entry: { squares, arrive, facing }, down: { ... } | null,
             packs: [{ id, role: "pack" | "mini" | "boss", room, title,
                       foes: [{ creature, tier, at, boss?, mini?, title? }] }],
             chests: [{ id, at, kind: "small" | "hoard", room }],
             lights: [{ at, kind: "torch" | "campfire" | "brazier" | "candles", wall? }] }] }
```

`rows` read with `readPlan` as every building's floors do. The new plan characters are
`V` stairs down, `^` stairs up, `*` rock standing up from a cave's floor, `%` crates, `y` a
brazier, and `$` a small chest. The rest are the ones the caves, lair and crypt already use:
`#` rock, `I` pillars, `t` tombs, `m` rubble, `j` bones, `h` the hoard, and so on.

## Dungeons in play

### Their ways in (`worldplan/settle.js`, `setpieces/neutral.js`)

- **About one to each square kilometre of dry land** (`DUNGEON_SITES`): some 55 in a world. Each
  is a site of kind `dungeon` in the world plan, thrown down at random and kept:
  - off water and beaches, and a cell clear of roads and rivers;
  - clear of the settlements;
  - `apart` cells (26: over a kilometre) from each other, `sites` cells from the other sites and
    `camps` cells from the camps.
- **Its theme by the land it's in** (`themes.js` `themeFor`, each theme's `lands`): caves likeliest
  in the mountains, the snows, the volcanic and the badlands; an outlaws' hideout in the woods,
  the farmland and the meadows; an ancient temple in the jungle and the savannah. Any theme can
  turn up anywhere, less often.
- **Its name** from its theme's names, each its own in the world.
- **Its way in**, set down into a hillside as a cave mouth is (`sites.js` `HILLSIDE.dungeon`), a
  mouth in the rock (`layoutNeutral({ kind: "dungeon", theme })`), dressed by its theme: stores
  and fallen timbers by an outlaws' hideout, columns (some fallen) and rubble by a temple, bones by
  caves.
- **On the maps**: an arch over steps going down (`app/mapicons.js` `dungeon`), on the minimap and
  on the world map once the land there's been seen, grey while it's cleared.

### Its levels (`insides.js`)

- **Made as a player comes near** (`DELVES.near`, 45 m from its way in), from the site's seed and
  theme, at the tier of the land it's in (`dungeonTier`: as the wilds' creatures there,
  `creatures.js` `tierAt`) and its generation (`buildDungeon`).
- **Each level its own map**, `site:dungeon-N/level-K` (`site:dungeon-N/gG/level-K` once it's been
  made again), read from its plan rows as any building's floor is. The levels sit well away from
  every other inside (`DUNGEON_ORIGINS`: a column of them for each dungeon, from x 20000).
- **Joined by stairs**: a flight for each level but the bottom (`building.flights`), from the
  stairs down on one level to the stairs up on the next, each end where one comes off it, facing
  into the level.

### Who's in it (`host.js` `#dungeons`, `dungeons/play.js`)

- **Each level's foes woken while a player's on it or on the level over it**, the first level's as
  soon as a player's near; let go once no one is. Each pack is a wild pack of its own (territorial,
  keeping near where it stood), its leader the boss or mini-boss if it has one.
- **The boss and the mini-bosses stand out** (`CHAMPIONS`): the boss with four times its kind's
  hit points and blows 1.3 times as hard, a mini-boss twice the hit points and 1.12 times as hard,
  each named by its title (the Troll King, a Tomb champion).
- **And they look it** (`beasts/champions.js`): the host gives each its rank and its id in its
  theme (`wild.champion`, `wild.regalia`), and it's drawn bigger than its kind (a boss 1.22 times,
  a mini-boss 1.1 times, but no taller than 3.3 m for it, `CHAMPION_HEIGHT`, so a hideout's
  tunnels have room: a troll or an ogre, already big, only 5% bigger), what glows on it brighter (its eyes, a wraith's light), and each its own
  way (`REGALIA`): the Troll King, the Goblin King and the Outlaw King crowned, the Frost Troll in
  a silver circlet, the ogres in horned helms, the outlaw lieutenant in a soldier's helm, the
  priests hooded in black; the Broodmother vast and blood-marked, the cave bear and the old tusker
  grizzled, the tomb champion's bones gilded, the Tomb Lord's eyes and the Dread Wraith's light
  burning brighter. What's worn takes the place of whatever was in its slot. The rules know
  nothing of it.
- **The slain stay slain** (`foeKey`: level, pack, place in it) till the dungeon's made again,
  however often a level's woken and let go.

### Its chests

- **Small chests** set out on each level as it's woken, unlocked. Opened, each player near it gets
  a share of their own (`COFFER`, `rollCoffer` at the level's tier): 6 to 18 gold, more each tier,
  a piece of gear 40% of the time, a healing draught 30% of the time.
- **The boss's hoard**, locked (`REFUSALS.kept`) till the boss falls. Opened, every player in the
  dungeon gets a share at their own power (`hoardTier`: their might plus one, or the bottom level's
  tier, whichever's higher; `HOARD`, `rollHoard`): 80 to 150 gold, more each tier; three to five
  pieces of gear made two tiers better than a cache's; one or two healing draughts.
- **Opening the hoard clears the dungeon.** Its icon goes grey. Once every player's left it and is
  `DELVES.far` (120 m) from its way in, it's made again: its foes and what's left on its floors
  gone, its levels thrown away and made anew from the next generation (`Interiors.remake`), with
  other rooms, other foes and other chests.

### Drawn (`world/interiors3d.js` `dungeon`, `world/caverns.js`, `world/dungeons3d.js`, `world/view.js`)

- **By its theme's look** (`DUNGEON_LOOKS`):
  - caves: their rock as one surface, walls standing up from the floor along the open ground's
    edge, bulging and hollowed, leaning in as they rise and rounding over into a roof that's
    highest over a cavern's middle and lowest over a tunnel; dark grey rock over stony earth;
  - an outlaws' hideout: the same, dug: smoother walls, a flatter, lower roof, quarried rock over
    trodden earth, its tunnels shored up with timber posts and caps every few squares;
  - an ancient temple: walls of dressed stone on a darker plinth under a cornice, flagstones, a
    vault over all.
- **The rock as one surface** (`caverns.js`): how far into the open each point of the level is,
  from its plan's squares (a distance transform, a quarter of a metre at a time, its corners
  rounded), shapes walls and roof together, with noise for the rock's bulges; the surface is
  drawn where that's nought, as a surface net (a point in each cell of a 0.45 m lattice it passes
  through, joined into quads), each point shaded darker where the rock closes round it. Below
  head height the walls only ever go further into the rock, never into the ground anyone walks
  on; over every open square there's room to stand. It's worked out a step at a time, over
  frames, and cut into 16 m tiles, so what's out of sight or out of a light's reach isn't drawn.
- **Drawn with photographs** (`dungeons3d.js`, CC0, from ambientCG and Poly Haven, made by
  `npm run build:textures`): the rock, earth, stone, flagstones and timber each a colour picture
  and a normal map, laid over the surface from all three sides at once (triplanar: never
  stretched however the rock turns), the picture's grain under the theme's own colour. They're
  in the catalog (`client/models/assets.json`), downloaded only once a dungeon's wanted (about
  1.8 MB in all); until they've come, the rock's drawn in its colours alone.
- **Never cut away**: the rock and the temple's walls stand whole however the camera looks,
  since the camera's kept out of them (below), so nothing's ever seen from inside.
- **What's in its rooms**, by plan character: rock, bones, rubble, camp fires, bedrolls, barrels,
  crates and sacks, tables, weapon racks, the chief's seat, statues, pillars, tombs, candle stands,
  altars, shrines and braziers; gold heaped either side of the hoard.
- **Furnished with scanned and modelled things** (`dungeons3d.js` `furnish`, made by
  `npm run build:props`, 150 of them in 116 files): mostly CC0, from Poly Haven
  (furniture, barrels, crates, tableware, food, tools and arms, statues, rocks, logs, a rat),
  OpenGameArt (a skull; skulls and bones heaped, crossed, scattered) and museums' scans mirrored
  on Zenodo and Objaverse (a bronze cauldron, a sheepskin, a stone sarcophagus, a winged guardian,
  urns, a ritual bronze, a wolf's and a cave bear's skulls); some CC BY 4.0 from Sketchfab's makers
  through the same mirrors (a handcart, a wheelbarrow, an old chest, a weapon rack, a sword, a
  painted coffin, a carved urn, a clay basin, mushrooms, bracket fungus, a cow's, a stag's and a
  ram's skulls), and a ribcage and a pelvis from anatomy scans (NIH 3D, the Human Reference
  Atlas: CC BY 4.0, without pictures, coloured as bone), each maker named in the catalog and the
  README. A model that's a set (three candleholders, a heap of rocks, skulls and bones) is a prop
  for each thing in it, one file between them. The level's built with them placed (`dungeon`'s
  `props`: in metres, each `x`, `z`, its `size`, `fit` or `scale`, its `turn`, `pitch` and
  `roll`, `on` what it stands on, its `tint`, whether it casts a `shadow`), and they're added once
  their models have come: each model's copies in each of the rock's 16 m tiles drawn at once
  (instanced, one for each of its materials), so what's out of sight or a light's reach isn't
  drawn; small things cast no shadow. In the busiest room seen (an outlaws' chief's hall, from
  inside) that's about 390 draw calls (270 before, 250 of them the rock, lights and the rest);
  most rooms are 20 to 60 more than they were, 100 to 190 in all. Bigger squares (32 m) drew no
  fewer, and a lamp's shadow then drew a quarter to four fifths more triangles, every copy in
  the square, near or not.
  They're in the catalog, downloaded only once a dungeon's wanted (each dungeon only its
  theme's: about 4 to 9 MB), fetched as soon as a level's begun; one that can't be had is left
  out, and what's on it.
- **Dressed by its theme's rooms** (`dungeondressing.js`): each piece of the plan is dressed as
  its room's look has it, the same way every time (by the numbers of its own square):
  - what's left against a wall (`d`): a cave's mossy rocks, boulders, logs, roots, branches,
    mushrooms, bones and heaped skulls; an outlaws' buckets, baskets, barrels and staves, crates
    with something on them, jars, tools leant on the wall, a ladder, a cauldron, a chest, a
    shield, rats; a temple's urns and vessels, candleholders, skulls in a row, a painted coffin
    stood up (`CLUTTER`, by theme and look);
  - the remains of someone who died there (`i`): a skull, ribs, hips and the long bones laid out
    a body's length, now and then a sword or an estoc, a shield, a lantern gone out; old bones
    (`j`): a heap, a skull on crossed bones, a ribcage, or a skull and its bones scattered (the
    same in the dragon's lair, crypts and ruined halls); beasts' skulls by a cave's or a kennel's
    walls;
  - shelves (`e`) and what's kept on them, a side table (`o`) with a light on it, a stand of arms
    (`n`: a shield and weapons leant on the wall, or a weapon rack), an offering's vessels (`v`),
    a workbench (`X`) and its tools, a chopping block (`A`), a handcart or a barrow (`J`);
  - round what's built: stools and tableware at a table, a pot or a cauldron and firewood by a
    fire, a light and a sheepskin by a bedroll, a sheepskin before the chief's chair, swords and
    estocs by a rack, a stone sarcophagus for some tombs, a winged guardian for some statues,
    bronze vessels on altars, plunder in the hoard;
  - and small things along the walls to walk over (stones, bark, a branch, a dropped bone,
    mushrooms), casting no shadow.
- **Its stairs**: down through the floor into the dark, or up into the rock, the dark at their
  head. They glow green to tap as a building's stairs do (`app/doors.js`).
- **Daylight at the way in** on its first level; **torches** on its walls.
- **Lit by what's near the player**: a level has more flames than the view's list of lights holds
  (`ROOM_LIGHTS`, 16), so each frame the 16 nearest the player light it, and the light all round
  comes from those within 18 m (`roomlight.js` `NEAR_FILL`).
- **The camera kept out of the rock**: it comes in closer rather than go into a level's rock, and
  stays under its roof (never over it, as it can go over a building's ceiling).
- **Messages**: a slain boss ("… is slain, and the hoard it kept lies unlocked"), the hoard opened,
  and the dungeon cleared.

### Kept

The host keeps each dungeon's state by site (`host.dungeons`): its generation, which levels are
awake, the slain, the chests opened, and whether it's cleared. It goes into snapshots
(`SNAPSHOT_VERSION` 8) and saves, and a game taken up again makes each dungeon's levels as many
times over as they had been, so a player saved deep in a dungeon is back where they were.

## Always the same, and stable as it grows (`seeds.js`)

- One seed for a dungeon, and from it a stream of its own for each stage of each level and attempt
  (`streamOf(seed, "level", generation, index, attempt)`), so a change to how rooms are dressed
  never moves a room.
- No `Math.random`, no clock, no `Math.sin` or `Math.log`: `exact.js` and `random.js` only. Loops
  stop by count, never by time (rot.js's diggers stop after a second of wall-clock time, so a slow
  phone could dig another map).
- Packs, mini-bosses, bosses, room looks and names are chosen by **rendezvous hashing**
  (`pickStable`): each candidate is scored by its own hash of (seed, slot, its id), weighted, and
  the best taken. Adding a creature or a look to a theme then changes only the choices it wins,
  so the dungeons already found stay as they were.
- `DUNGEON_VERSION` is bumped whenever what a seed makes changes.
- A dungeon cleared and made again is the next `generation`: the same name and way in, new levels.

## Adding a theme

```js
import { registerTheme } from "./core/dungeons/themes.js";
import { registerLayout } from "./core/dungeons/layouts.js";

registerLayout("mine", (options) => ...);          // optional: dig({ width, height, rooms, arena, random })
registerTheme({
    id: "mine", name: "an old mine", layout: "mine", style: "dungeon-mine", ground, sound,
    names: { forms: ["the {adj} Workings"], adj: [...], place: [...] },
    packs: [{ id, creatures: [...], size: [2, 4], weight }],
    minis: [{ id, creature, title, weight }],
    bosses: [{ id, creature, title, weight }],
    rooms: { kind: [{ id, weight, props: [{ char, count, at, size, mirror }], torches: [0, 2] }], any: [...] },
});
```

A layout gives back `{ grid, count, entryRoom, goalRoom, kinds, entrance, loops }`, and digs its
way in with `digWayIn` (two wide, up from the middle of the south edge). Every pack's creatures
must suit every tier (a test checks a pack suits each tier from 1 to 10, within a tier of where
it's met in the wilds). New art goes in by the theme's `style`: a look in `interiors3d.js`
`DUNGEON_LOOKS` (its rock's shell, `caverns.js` `SHELLS`, or walls of dressed stone; its pictures,
added to `scripts/build-textures.js` `PICTURES` and made with `npm run build:textures`). New
furniture: a model added to `scripts/build-props.js` `PROPS` (Poly Haven's id, or its own files:
a GLB, or an OBJ or STL and its pictures, with whose it is and its licence; how big its pictures,
how many triangles at most; a set's pieces), made with `npm run build:props` (then `npm run
build:manifest`), and placed by `dungeondressing.js` (a kind of what's left against a wall, in a
theme's `CLUTTER`) or in `dungeon` for a plan character. Only CC0 or CC BY (its maker named), and
only what can be downloaded without an account. Its bosses' and mini-bosses' looks:
an entry each in `beasts/champions.js` `REGALIA`, by its id (one not there looks as its rank has it).

## The creature lab (`creature-lab.html`, `js/lab/creature-lab.js`)

The creature lab shows each theme's bosses and mini-bosses as they're drawn in a dungeon, one
group of them for each theme ("Dungeons: caves" and so on), beside the creatures of the wild they
are. Each is named by its title and rank. Open one straight away with `?creature=` and its theme,
rank and id: `creature-lab.html?creature=caves:boss:trollKing`.

## The dungeon map (`dungeon-map.html`, `js/lab/dungeon-map.js`)

The dungeon map draws a dungeon from above, level by level. It shows rock and ground in the
theme's colours, and tints each room by its part: green for the way in, blue for the stairs down,
red for the arena, orange for a mini-boss's room. It also draws the way through (a dashed line
from room to room), props, torches, chests, and who's in it (the boss large and red, mini-bosses
orange, packs small). Point at a square to see what's there. Choose the seed, the theme, how many
levels (or by seed), the tier, and which generation.

## Research

The design comes from a survey of procedural dungeon generation:

- BSP;
- separation steering (TinyKeep);
- Delaunay or Gabriel graphs, a tree through them and loops added back;
- mission and space grammars (Dormans) and cyclic generation (Unexplored);
- cellular-automaton caves;
- drunkard's walks and tunnellers;
- Wave Function Collapse;
- prefab stitching (Spelunky, Dead Cells, Enter the Gungeon);
- Brogue CE's accretion, loops, choke points and item heat map;
- Hauberk's rooms and mazes.

The picks for each theme came from that survey:

- **Graph first, then cellular automata, for caves.** Pure cellular automata can't promise
  how many caverns there are or put the boss at the far end. Unexplored does the same: a graph
  first, then cellular automata within it.
- **Accretion for a hideout.** It looks dug out and added to over time.
- **An axial plan for a temple.** It reads as designed: symmetric and processional.

The research also set:

- the pacing: 8 to 14 rooms a level, loops only where they save 25 m or more, the end at least 60%
  of the furthest walk in, mini-bosses about 40% and 75% along;
- the rules that keep a dungeon the same everywhere: streams by stage, no wall-clock limits, exact
  sums, total-order sorts, rendezvous choosing, and a version saved with each dungeon.

Brogue CE (AGPL-3.0) and Dungeon Crawl Stone Soup (GPL) were read for ideas only; none of their
code is here.

## Tests

- **`test/delves.test.js`**, dungeons in play:
  - about one way in to a square kilometre of dry land, apart from each other, the roads and the
    other places, each named and themed; every theme in a world;
  - the theme by the land; the way in laid out by its theme; its icon;
  - what's in the small chests and the hoard, and the tier a share is at;
  - in a world: made as a player comes near, its first level woken and its chests set out; gone
    into and down its stairs, each level woken and the one above let go; the hoard locked till the
    boss falls; a share of a small chest and of the hoard; cleared; kept in a snapshot and taken up
    again with the player in it; made again once everyone's gone, the next generation.
- **`e2e/pellagos.spec.js`**: in the game, a dungeon's way in gone into, its first level drawn and
  lit, down its stairs to the next and out again.
- **`test/caverns.test.js`**, the rock as one surface: how far into the open each point is; its
  walls never in the open ground below head height; room to stand under its roof over every open
  square; every triangle facing the open; the floor under all the open ground but the stairs'
  hole; its tiles the whole of it, smooth where they meet; and the photographs each in the
  catalog, on disk.
- **`test/champions.test.js`**, the bosses' looks: every theme's boss and mini-boss with one,
  bigger than its kind (a boss more than a mini-boss, none made taller than 3.3 m by it), wearing only what a people-shaped one can on
  its head, in place of what was there; and a sculpted one bigger, its body tinted and what glows
  on it brighter. `test/delves.test.js` checks the boss carries its rank and its id.
- **`test/dressing.test.js`**, the rooms dressed: every theme's every look leaves its own things
  against a wall, each kind of them sound by every wall (models in the catalog, sizes and turns
  that are numbers, nothing far off its square); the same square dressed the same way every time,
  and squares differently; tables, seats, shelves, side tables, workbenches, stands, vessels,
  blocks, bones and remains sound; small things strewn by the walls that cast no shadow.
- **`test/furnishings.test.js`**, the scanned models: each in the catalog, on disk, and small;
  every theme's levels furnished on open ground, each thing on what's placed before it, with the
  models each theme wants; and the models placed as asked (on the floor or on what's under them,
  sized, turned, laid down, made to fit), a tile at a time, with what can't be read left out and
  what's on it.
- **`test/dungeons.test.js`**:
  - seeds mix the same parts the same way, and stable choosing changes only the slots a new entry
    wins (by weight);
  - the Gabriel graph's tree and its loops;
  - rooms read back from a grid;
  - the same dungeon from the same seed, tier and generation, and another level layout the next
    generation;
  - one to three levels deep by seed;
  - names;
  - every theme at every depth for three seeds:
    - every level reads as a plan, is joined and passes its checks;
    - the front door or stairs up is at the middle of the south edge;
    - stairs down on every level but the bottom;
    - every square that can be walked on can be walked to;
    - foes stand on open ground of their own, of the theme's creatures, at their tiers, none
      within `ARRIVE_CLEAR` of where anyone arrives;
    - one boss before one hoard in the arena at the end of the way through;
    - one to four small chests, none in the way in's room;
    - torches on walls;
    - the right number of mini-bosses;
  - every plan character used is one the interiors know;
  - each theme's creatures and props exist, and a pack suits every tier;
  - a new theme and layout can be added.
- **`e2e/dungeon-map.spec.js`**: the dungeon map draws a dungeon for a seed, shows its bottom level's
  boss, and makes another for another theme or seed.
