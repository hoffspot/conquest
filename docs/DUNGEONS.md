# Dungeons

A dungeon is a place under the wilds: a way in above ground (a cave mouth, a hatch, steps down
into a ruin) that leads to one to three levels underground (a hell's four: [Hells](#hells)), each
a map of its own, joined by stairs, filled with enemies. Mini-bosses wait along the way. At the far end of the bottom level, a
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
  is dressed. Four, three of them each dug its own way:
  - **caves** (`caves`): caverns scattered about and wandering tunnels between them, with goblins,
    cave spiders, bats, slimes, trolls and worse;
  - **an outlaws' hideout** (`hideout`): rooms dug one off another down short tunnels, with
    bandits, their hounds, hired ogres and hedge priests;
  - **an ancient temple** (`ancient`): pillared halls up a straight middle way, rooms off them
    either side, mirrored; the dead, cultists, wraiths, serpents and scorpions;
  - **an ants' nest** (`nest`): dug as ants dig, a gallery winding up through layered earth with
    chambers off it on short stalks, middens near the top and brood deep down; giant ants in their
    numbers, great centipedes in its deeper tunnels, packs of dungeon spiders each led by an elite
    dungeon spider, black widows hanging unseen under its galleries' roofs to drop on whoever passes
    beneath (a Widow matriarch among its mini-bosses), giant cockroaches at what the ants leave, dungeon wasps hovering in its
    galleries, a dungeon scorpion or two, and the Ant Monster, their great queen, at the bottom,
    calling her flock to her
    (*Who's in it*, below). All of them are drawn from models
    of their own, got ready at its door (docs/WILDS.md, *A place's creatures, ready before they're
    met*);
  - **a hell** (`hell`): four levels deep, each a realm of its own, gone down through portals, a
    master on every level and the Lord of the Pit at the bottom ([Hells](#hells)). Never dealt to a
    wild dungeon's way in (its `wild: false`: `themeFor`).
- **How deep**: one level (30% of dungeons), two (40%) or three (30%), by seed. Fewer levels are
  bigger, so each takes about the same 15 to 25 minutes to clear (`LEVEL_SIZES`):

  | Levels | Each level | Rooms on each |
  |---|---|---|
  | 1 | 88 m across (give or take 4) | 12 to 14 |
  | 2 | 78 m | 10 to 12 |
  | 3 | 68 m | 8 to 10 |
  | 4 (a hell's) | 66 m | 8 or 9 |

  In a deeper dungeon, a room is less likely to hold a pack (`PACK_ODDS`: every room that might have
  one, 90% as often in two levels, 75% in three, 70% in a hell's four).
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
- **Small chests**: two to four on each level (two or three on the bottom level); twice as many in
  an ants' nest (four to eight, four to six on the bottom level: its theme's `chests`). They're
  likeliest in dead ends, then in rooms off the way through, and never in the room you come in by.
- **The fallen** (an ants' nest's: its theme's `fallen`): the remains of the adventurers who died
  in it, many of them (one or more in most rooms, three to five in the queen's chamber, beside the
  bones of what the ants have eaten), each searched once for what was left on them (*Its chests*).
- **Torches** on the walls of most rooms, and on the floor camp fires, braziers and candles. An
  ants' nest has none but at its mouth (no ant lights a torch: its theme's `lit` is `"glow"`):
  it's lit by **colonies of glowing fungus** on its walls instead (each room's look's `glows`: one
  or two in a gallery, larder or brood chamber, two or three on a midden heap, four or five round
  the queen's chamber, none or one in a nook), each against rock two squares deep, at least three
  rings from the next (`place.js` `GLOW_APART`), dark between. A level whose rooms come to fewer
  than 0.8 colonies a room (`GLOW_LEAST`: a level of nooks, each with none or one) gets one more in
  each of those with fewest till it has that many, so it's never dark through.
- **Its name** comes from its theme's words: "the Glittering Deeps", "the Rat's Den", "the Halls of
  Ur-Kalath".

## Hells

A hell (`themes.js` `hell`) is a dungeon four levels deep, each level a realm of its own, met only
at the highest tiers. Two or three are in every world, each gone into from a cult's camp out in the
wilds, and only by night, once the cult keeping its rite there is slain ([The way in](#the-way-in-a-cults-camp-by-night)).

- **Its realms**, one a level, top to bottom (its `realms`, each a theme's fields for its level:
  `themes.js` `realmOf`; each level carries its own `realm`, `look`, `style`, `ground` and
  `sound`):

  | Level | Realm | Dug as | Drawn as | Heard as | Who's in it | Its master |
  |---|---|---|---|---|---|---|
  | 1 | the Breach | caves | `hell-breach`: sooty caves crusted with sulphur, embers glowing in their cracks and drifting, pools of lava against the rock, the rift over the cult's altar | its drone ([The sound of hell](#the-sound-of-hell)); lava belching, hissing close by; drips | the cult's faithful, magma slimes, salamanders, black shucks, wraiths, bats | the Breach Priest, a cultist |
  | 2 | the Halls of Bone | a hideout's rooms | `hell-bone`: walls of wet flesh, veins of blood beating in them, bone ribs arching over the halls, blood pooled on the floor, the heart in its last room | the drone a tone lower; a crypt's still air; the heart, louder nearer it; the dead groaning and wailing far off | skeletons, draugr, wraiths, ghosts, shadow stalkers | the Bone Lord, a wight lord |
  | 3 | the River of Fire | caves, flooded | `hell-fire`: black basalt, its caverns lakes of lava, causeways across them, embers in its rock and thick in its hot air, the Hellforge in its last room | the drone two tones lower; lava belching and roaring, hissing close by; the Hellforge's hammer | magma slimes, salamanders, black shucks, chimeras, wyverns | the Forge Beast, a chimera |
  | 4 | the Pit | an ancient temple's halls | `hell-pit`: polished black stone, sigils inlaid in its floor glowing violet, the lord's own colour, his horned throne, its lava only a rim along the throne hall's walls | the drone a fifth lower; a crypt's air, lower; wails far off | the legion (wraiths and skeletons), the faithful, draugr, shadow stalkers, hounds, slimes and salamanders | the Gatekeeper, an ogre; then the Lord of the Pit |

  Each realm's rooms are dressed its own way: the cult's altars and candles and pools of lava in
  the Breach, tombs and charnel heaps and pools of blood in the Halls of Bone, braziers and anvils and lakes of lava by the River of
  Fire, watching statues (winged guardians and cloaked figures only), braziers and the throne in the Pit (`world/dungeondressing.js` `CLUTTER`,
  `STREWN`). The room furthest in on a level, its master's, by the portal down, can have a look of
  its realm's own (its `rooms.goal`: `place.js`): the Breach's is the cult's altar, the rift torn
  open over it ([The Breach](#the-breach-brimstone-lava-and-the-rift)); the Halls of Bone's, the
  heart they beat to ([The Halls of Bone](#the-halls-of-bone-flesh-blood-and-the-heart)).
- **Stand-ins for now**: everyone in it but its lord is one of the wild's creatures, till bought
  models of demons take their places (docs/LICENSED_MODELS.md). Each master has a look of its own
  (`beasts/champions.js` `REGALIA`): scorched, burnt, horned or hooded.
- **The Lord of the Pit** (`creatures.js` `demonLord`, tier 10, met nowhere else): its fists
  burning and hellfire hurled from its hand (`weapons.js`). It's drawn from a bought model, the
  Greater Demon (`beasts/model.js` `MODELS.demonLord`, `client/models/beasts/LICENSE.md`): 3.2
  metres tall (3.4 as the boss), its wings spread 5 metres, under the Pit's 4.6-metre walls even
  roaring with its wings raised. Its clips are a human's played on its skeleton
  (`utilities/blenderpipeline`'s `retarget`), its wings beating to them: its smash a rake of its
  claws or a punch, its hellfire hurled from its fist as it punches (the special `wand`, as the
  weapon names it), and its roar as it rests; its walk at its pace (1 m/s, as it's drawn), its run
  a sprint (5.7 m/s) played slower at its chase. Till the model's read (and where the licensed
  models aren't, as in CI) it's drawn as its stand-in, a people-shaped brute as the wild's are
  (`beasts/looks.js`): bigger than a troll, red as a coal, horned and tusked. A people-shaped kind
  drawn from a model is a `BeastAvatar` once its model's read (`beast.js` `dressingCreature`), and
  one drawn as its stand-in is drawn again from the model once it's out of view, not attacking or
  fallen (the game's `#modelSince`). Its model's fetched with the rest of the hell's at its door
  (`modelsInside`: every level's foes).
- **How strong**: never below tier 9 (its `tiers`), however low it's asked to be made
  (`buildDungeon`); its packs, mini-bosses and masters its own, whatever the tiers they're met at
  elsewhere (`tiered: false`: `place.js` `chooseFoe`'s slack).
- **How deep**: four levels, each 66 m across (give or take 4), with 8 or 9 rooms (`LEVEL_SIZES`);
  a room 70% as likely to hold a pack as on a dungeon of one level (`PACK_ODDS`); two or three
  mini-bosses besides its masters (`MINIS`).
- **A master on every level** (its realm's `warden`; a pack with the role `"warden"`, its first
  foe `warden`): in the room furthest in, by the portal down, two or three of its guard about it;
  on the bottom level, in the last room on the way through before the arena. A rank of its own
  between a mini-boss's and the boss's (`play.js` `CHAMPIONS.floor`: three times the hit points,
  its blows 1.2 times as hard; drawn 1.16 times its kind's size, its eyes brighter:
  `beasts/champions.js` `CHAMPION_LOOKS.floor`). Its fall is told to whoever's in the hell: "The
  Breach Priest is slain, and the portal down is open."
- **Portals, not stairs**: each level's way down is a portal of fire where other dungeons have
  stairs (the same squares, the same landing): an arch of the level's rock at the landing's edge,
  runes cut in its face glowing like coals, a worn step before it, and in it the guild portals'
  swirl in a hell's reds and golds, lighting the room round it red (`world/interiors3d.js`
  `riftPortal`; `world/veil.js` `VEILS.hell`). The way back up is a portal too. Tapped, its arch's
  face glows (`app/doors.js`).
- **Sealed till its master falls**: going down a portal, the host asks whether the first of the
  level's master's pack has fallen (the link's `seal`: the map it's sealed from, the level and the
  pack; `host.js` `enter`). Till it has, whoever tries is told "The portal won't let you through
  while this level's master still stands." The way back up is never sealed.
- **The way out**: on the bottom level, beyond the throne, a portal dug into the arena's far wall
  as stairs down are (the level's `exit`: `place.js`), the Lord of the Pit between it and the way
  in. It leads back to the wilds, before the hell's way in. It's a way only out: its end outside
  has nothing to go in by (no squares), so no one's led in by it (`interiors.js` `routeBetween`,
  `battle.js`, `app/doors.js`), and the host won't send anyone in through it. It's sealed till
  the lord falls ("The way out stays shut while the lord of this place still stands.").

### The Breach: brimstone, lava and the rift

The first realm is where hell breaks through mortal rock (the research's "brimstone caves": Diablo's
Caves, its Outer Steppes), so its lava comes in small pools, never as the ground, and its rock is
still grey stone, crusted and scorched.

- **Its pools of lava** (`~`): in its grottos (one each), and now and then in its other caverns
  and nooks, two or three squares against the rock (`themes.js`, its rooms' `props`). Placed as
  any blocking thing is, so they never cut a way off; nothing else that blocks stands beside one.
  Drawn (`world/lava.js`, the research's phone recipe: a texture trick, not a simulation):
  - each pool a rounded shape in its squares, reaching in under the rock it lies against, its rim
    wandering in and out (`poolShape`);
  - its surface one material for every pool, worked out as it's drawn (`lavaMaterial`): molten,
    orange to yellow-white where it's hottest and churning; plates of black crust floating on it,
    their edges ragged and still glowing, every one of them crusted over at the bank and fewer
    towards the middle; the plates turning slowly round the pool, a whole turn each two minutes
    (the veils' clock, `VEIL`, so it never jumps); breathing slowly. About five texture-free noise
    lookups a pixel, its finer churning at medium quality and up;
  - its bank a low ridge of the rock's crust round it, darker than the rock, glowing on the inside;
  - its light a room's (`roomlight.js`), breathing slowly, and its glow on the rock and floor round
    it baked into their points (`poolGlowOn`: the rock's `glow`), brightest at the rim, out to
    2.2 m and up to 2.6 m, the floor less than the walls: the walls by a pool lit from below for
    nothing. The level's pools are two draws between them.
- **Its rock** (the look's `brimstone`): sulphur crusting it in yellow patches low down, and on the
  floor near the pools (`brimstoneTone`); soot darkening it towards the roof; and embers glowing in
  its cracks (`embersOn`: thin seams where a noise is near its middle, low down, more of them by a
  pool, each point's `seam`; brighter in the rock picture's dark grooves, brightening and dimming
  in slow waves across it: `dungeons3d.js` `rockMaterial`'s `seams`, `SEAMS.embers`).
- **The rift** (`interiors3d.js` `breachRift`): the room furthest in, by the portal down, where its
  master waits, is always the cult's altar, candles round it. Over the altar, a tear in the air
  2.2 m tall, its edges ragged and bent a little, the swirl of a hell's portal in it
  (`VEILS.hell`, its eye in the tear's middle), a ragged rim of fire round it, lighting the room
  red (its own light, `rift`). It stands across the altar's length, two faces back to back.

### The Halls of Bone: flesh, blood and the heart

The second realm is where the lava gives way to blood (the research: Diablo's Hell, "walls made
from bone, threaded glowing veins of blood along the walls"). Its halls and rooms are dug as an
outlaws' hideout's are, but drawn as the inside of some great body: no dressed stone, no lava.

- **Its walls are flesh** (`caverns.js` `SHELLS.flesh`): one surface, as a cave's rock is, swelling
  and sagging, its walls leaning in and rounding over into vaulted halls 3.4 to 4.8 m high. Raw
  red (the look's `tint`), darker in patches where blood's dried on it and streaked paler with
  sinew (`flesh.js` `fleshTone`), wet (the rock's material less rough: the look's `wet`). Its
  floor's near-black, so the bone-white dead stand out against it.
- **Veins of blood** glow in the walls and over the roof (`veinsOn`: great veins where a noise is
  near its middle, lesser ones branching off them, each point's `seam`), beating as a heart does,
  twice and then a rest, a beat every 1.2 seconds, the beat running out across the halls
  (`dungeons3d.js` `SEAMS.veins`). A hundred beats to the veils' two-minute loop, so it never
  jumps.
- **Ribs** rise out of the walls every other square along them (`ribPaths`), from the wall's foot,
  a little out of the flesh, up it and on out over the hall under the roof, so its narrower halls
  are ribcages; each a tube of old bone stained with blood towards its foot, thinning to its tip
  (`ribGeometry`). Drawn a mesh for each of the rock's 16 m tiles, lit by the room
  (`lifeMaterial`).
- **Blood pooled on the floor** (`&`, walked through): one or two in most of its rooms, each a
  dark pool wandering round its squares' middle, drops splashed round it, wet (`bloodGeometry`).
  Every pool on a level is one mesh.
- **The heart** (`@`): the room furthest in, by the portal down, where the Bone Lord waits, is
  always the heart's (the realm's `rooms.goal`). In its middle the heart stands on the floor, as
  tall as a man, narrowing to its apex, two chambers swelling at its top under a cap of fat,
  bruised in patches, veins glowing on it; its arteries rise from its top into the roof, its veins
  run from its foot across the floor and into the walls; and round it lie the sacs where the
  hell's demons are born, their membranes dark, glowing from within (`heartParts`). It swells as
  it beats, with the walls' veins, its glow brightening (`heartMaterial`), and its room light
  beats with it (`heartLight`).
- **The player's light** (the look's `carried`) is pale, as bone is, and the Halls have few
  torches.

### The River of Fire: lakes of lava and the Hellforge

The third realm is where lava's the ground (the research: Diablo II's River of Flame, "mostly
narrow strips of land connected by bridges"). Still dug as caves, but its caverns and grottos are
flooded wall to wall (the realm's `lava`: `place.js` `flood`), about a third of the level's open
ground: causeways three squares wide cross each from its ways in to its middle, an island or two
off them, so the lava's always to either side of the way through. None in the way in's room or
the room furthest in.

- **Its lakes** (the look's `lakes`: `lava.js` `lakesOf`): how far into the lava each point is,
  from the plan (a distance across its squares, smoothed); each body of lava flowing one way,
  along its length. The floor sinks under them (`caverns.js` `cavernFloor`'s `sink`, drawn half a
  metre apart there), 0.5 m at most, and their surface lies 0.22 m under the floor
  (`lakeGeometry`), so the shore's where the two meet, round the lava's edge, never square. The
  surface is the pools' material: molten, hottest in from the shore; its crust gathered in rafts
  with open channels between them, all crust at the shore; drifting the way the lake flows, 20 m
  each two minutes, a whole number of each of its noises' repeats, so it never jumps. Every lake
  on a level is one mesh.
- **Its light** is the lava's: a room light over each lake every five squares, the biggest
  first, twelve a level at most (`lakeLights`), and their glow on the rock and floor round them
  (`lavaGlowOn`), the floor less. Embers glow in the rock's cracks, more of them by the lava (the
  look's `embers`). Few torches.
- **The Hellforge** (`F`): the room furthest in, where the Forge Beast waits by the portal down,
  is always the forge's (the realm's `rooms.goal`; three squares by two, its back to the rock, or
  smaller where there's no room: its `tries`). A great furnace of the level's dark rock, banded
  with black iron, iron horns at its top corners, a chimney rising into the roof; its mouth full
  of molten metal, standing up, a fire roaring in it, lighting the room; before it a lip, a basin
  of molten metal in it (`interiors3d.js` `hellforge`). Anvils before it, braziers by it.

### The Pit: sigils, the rim and the throne

The last realm is darker and stranger than the River of Fire above it (the research: Diablo II's
Chaos Sanctuary, Diablo I's pentagram before Diablo): its lava pushed out to a rim, its light
the lord's own colour, violet, where every realm above was red and orange.

- **Its stone** is polished black (the look's `tint`, near black, and `wet`, glossy: walls and
  floor alike), its air close and its fog near. Its statues are only the winged guardians and the
  cloaked figures (the look's `statues`).
- **Its sigils** (the look's `sigils`: `world/pit.js`), inlaid in the floor and glowing violet,
  breathing slowly by the veils' clock: a seal in the middle of each of its halls (two rings,
  runes between them, a ring in the middle and spokes out to it), and before the throne a great
  pentagram, its one point towards whoever comes in. Every sigil on a level is one mesh.
- **Its lava only a rim** (the realm's `rim`: `place.js` `lavaRim`): the throne hall's side walls
  lined with it, a square deep, clear of its ways in by three squares and of the throne and the
  way out by two, every square that can be walked on still walked to. Drawn as the Breach's pools
  are, long and narrow.
- **The lord's throne** (the look's `throne`: `pit.js` `throneParts`, `interiors3d.js`
  `lordThrone`): on a plinth with a step before it, of black stone, its back rising 3.4 m to a
  crest, runes cut down each side of it glowing violet, two great horns rising from it, and his
  light over it, violet.

### The sound of hell

Each realm is its own place to the ear (its `sound`: `hellBreach`, `hellBone`, `hellFire`,
`hellPit`; `audio/ambience.js` `INDOORS`, `audio/sound.js` `PLACES`), none of the world's music
heard in any of them: another world's.

- **Its drone** (`audio/synth.js` `drone`, a made bed: `BEDS.hellDrone`), all through every
  realm: a buzzing root on A (55 Hz, its overtones carrying it on a phone's speaker) and a second
  voice a quarter of a hertz off it, throbbing; the tritone over them, the devil's interval,
  swelling and dying away; the deep's rumble under them, and a moan over them. Made in code, an
  eight-second loop without a seam, made in a worker once it's first wanted (a third of a second's
  work) and let go of a minute after it's last heard. Played lower and slower the deeper the realm
  (a place's `rates`): on A in the Breach, a tone lower in the Halls of Bone, two in the River of
  Fire, a fifth lower in the Pit, sliding down as the player comes down.
- **The Breach**: a great lair's belching spring under it (its lava), a cave's drips, and lava
  hissing and spitting close by (a magma slime's sizzle, lower).
- **The Halls of Bone**: a crypt's still air, and the heart they beat to (`synth.js` `heartbeat`,
  made: a deep lub and a softer dub, a beat every 1.2 seconds as it's drawn beating), heard faintly
  all through them, louder nearer it (`HELL.heart`; where it is, the drawn level's `heart`); the
  dead groaning (a wight lord's call, lower) and wailing (a ghost's, slowed) far off through the
  rock, muffled.
- **The River of Fire**: the belching spring louder, a brazier's roar two tones lower (its lava),
  lava hissing close by, and the Hellforge's hammer from the forge (the smith's, slowed and
  muffled through the rock: `HELL.forge`; where it is, the drawn level's `forge`), louder nearer
  it.
- **The Pit**: the stillest and deepest, a crypt's air two tones lower, wails and groans far off.
- **Its ways in and out** are portals: no door's heard.

### The way in: a cult's camp by night

- **Where** (`worldplan/settle.js` `hells`, `HELLS`): two or three a world, laid out last of all
  the sites, from numbers of their own, so nothing laid out before moves for them. Each is a
  dungeon's site of the hell's theme (`kind: "dungeon"`, `theme: "hell"`, ids `hell-1`,
  `hell-2`...), so everything that knows a dungeon's way in knows a hell's: its models fetched on
  the way and waited for at its door, its icon, its levels made as the player comes near (in the
  hells' own block, `HELL_ORIGINS`, by the id's number). Out in the wild (no people's lands), on dry
  land the cults keep to (the marshes, the jungle, the dark woods, volcanic land: the first three
  fifths of each round of darts only there, then anywhere wild), as far from every people's start
  as the wild goes: at least 3.2 km from each, failing that a little nearer each round (85% of the
  last). Six peoples share an 8 km world, so no wild land is more than about 4 km from every start
  (tier 4 or 5 from all of them); measured from a single player's home, as the game's tiers are, a
  hell's far out. Clear of the settlements (10 cells), every other site (8) and the camps (5), and
  60 cells (about 1.9 km) from each other and from the great lairs and dens. Over thirty seeds,
  every world got two or three, 1.6 to 3.9 km from the nearest start.
- **What stands there** (`setpieces/neutral.js` `hellCamp`, `HELL_CAMP`): a hamlet gone wrong,
  36 m by 32 (bigger than a dungeon's mouth: `neutralSize`), on level ground (its pad), never cut
  into a hill (`sites.js` `restingOf`). In its middle a pentagram scorched into the ground, 10 m
  across, candles at its five points; in the pentagram the portal, an arch on two pillars facing
  the way the camp's come at, gone into through its arch (its `entry`, inside `dungeon`); an altar
  behind it and four braziers round it; round them the cult's hovels at the back and sides, stakes
  topped with skulls, a cage, and the cart of what they've taken, its barrels beside it; bones
  about. Nothing stands across the way in from the front, and the hovels keep to its back and sides,
  clear of the cage and the cart. The ground round the ring is trodden bare (its `court`, a road's
  earth: `sites.js`), so nothing grows through the pentagram. Its heart, where the cult's high
  priest stands, is before the portal, in the ring.
- **How it's drawn** (`world/art/kits/neutral.js`, `CAMP`): the pentagram's double ring and star
  burnt black into the ground, ash either side; tallow candles standing in their wax at the
  star's points; the arch of rough dark stone, seven stones and a keystone, bone horns on it,
  runes cut in it, a step before it; the hovels, a hut or a lean-to each, hides over their
  doorways; stakes with skulls; a cage of lashed poles, bones or a slumped body in its straw. By
  day it's a dead place: cold candles and braziers, the runes and the pentagram dark, the arch's
  opening still and black. By night (with the evening, as the windows light: `WINDOW_LIGHT`) the
  candles and braziers burn (night-only fires: `candle-night`, `brazier-night`), the runes and the
  pentagram's lines smoulder, and in the arch the guild portals' veil swirls in a hell's reds and
  golds, out of doors (`world/veil.js` `openVeil`), lighting the camp red (the `hellgate` light).
  About 4,000 triangles a camp.
- **The rite** (`creatures.js` `RITES`, `lairOf`; `host.js` `#lairs`): kept as a lair's master and
  guards are, but by the site's theme, not its kind, and only after dark (light.js `torchesLit`:
  from a little past sunset to sunrise, 19 minutes of every hour). With a player within 110 m, the
  cult's high priest (`cultLeader`: "High priest of the cult", tier 10, robed as its faithful are
  and a head taller, its staff in hand, swinging it and calling hellfire down from 9 m, which
  burns) stands at its heart, six of the faithful (cultists, at tiers 9 and 10) round its ring,
  more against a bigger party (`strength.js`). At daybreak they're let go once no player's close by
  (within a third of that). No hoard of theirs: what they keep is the way in.
- **The gate** (`host.js` `enter`, `#riteHolds`): going in from the wilds by a hell's front door,
  the host asks the time and the rite. By day: "The portal stands cold and dark: whatever the cult
  calls through it, it calls after nightfall." By night, till every one of the cult is slain:
  "The cult's rite holds the portal shut while its keepers still stand." Once the last of them
  falls (`#riteFell`), it's let through till sunrise, and those near are told "The last of the cult
  falls, and their rite is broken: the portal stands open till daybreak." (`app/game.js`
  `#delved`). Its breaking is kept with the lairs' slain, but by the war's clock, as the night is
  (`#riteBroken`). The next night the cult's back at it, and the way's shut again. Anyone inside at
  daybreak plays on, and leaves by the way out beyond the throne whenever.
- **Word of it** (`core/cultword.js`): the nearest hell's cult is spoken of in the towns, which
  way it is from the town always true, more of it the nearer. Near (within 2.5 km of the town, or
  among the two settlements nearest the camp, however far): which way, how far on foot ("not an
  hour's walk", "an hour or two"), what stands by it (a site within 700 m, by its kind or name:
  "by the old ruins") and that it's after dark ("Robed folk out north-east of Ashford, an hour or
  two on foot, by the old ruins. Chanting, every night. Don't go after dark."). Farther (5 km):
  which way and that it's a long way. Far off: which way only, as hearsay. Never what it is: lights,
  chanting, robed folk, a ring burnt in the grass. Asked in talk (`dialogue.js`: `if: { hell: true
  }`, `{hellRumour}`) of the guild's receptionists, the barkeeps and the adventurers, who always
  know, and of the tavern's drinkers and the townsfolk, one in two of whom do (by who they are and
  which hell, so the same ones know it every time: `app/game.js` `#cultWords`). Each says it in
  their own voice; which of the band's ways of saying it comes round in turn (`talkVariety`).

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
- **`nest`** (an ants' nest, as real ones are dug: tunnels of near-steady width, flat-floored
  chambers budding off them like grapes on short stalks, big near the surface and smaller and
  further apart deeper down, refuse kept apart from brood; `NEST`):
  - **its gallery**: from the mouth by the way in, up to the far side of the level, bending to and
    fro across it (three or four bends on the top level, two deeper, and swinging less wide), 4 to
    5 m across, its width wavering a little. It's cut into stretches of 14 to 18 m, each a room of
    its own (a third of the level's rooms at most), so the way through runs from room to room.
  - **its chambers**: off the gallery every 9 to 12 m on the top level, 12 to 16 m between, 15 to
    20 m at the bottom, alternately either side, each where it's clear of the galleries and the
    others: a round 4 to 5.5 m across its middle on the top level, 3.5 to 4.5 between, 3 to 4 at the
    bottom, with two to four lobes round it, down a stalk 2 to 4 m long and 2.5 to 3 m wide (a
    passage). Where that's too few rooms, a side gallery or two runs off the main one out to the
    level's sides, with chambers of their own.
  - **the queen's chamber**, on the bottom level: past the gallery's far end, up a stalk 5 to 7 m
    long, 7 to 8 m round its middle with three or four lobes: a dead end.
  - **what each chamber is** (its kind, which its look follows: `themes.js` `nest.rooms`): the one
    or two out furthest to the level's sides middens on the top level, one between, none at the
    bottom; the smallest nooks; the rest larders, but at the bottom (and in the far half of a nest
    one level deep) brood. Its brood is heaped in the middle of a brood chamber (`E`), and what it's
    thrown out in the middle of a midden (`z`), each two squares by two that can't be walked over
    (but where a chamber has no room for it at its middle, about one in a hundred).
  - then smoothed once, so the lobes stay crisp, and one or two walls broken through where that
    saves 25 m or more, never into the queen's chamber.

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
- `head`: against the north wall, centred on the middle way;
- `back`: its long side against the rock beside it, whichever way that is.

A look's props can be `mirror`ed across the middle way, and one can have `tries` (each its own
`at` and `size`) tried in turn till it's placed. A realm's room furthest in can have a look of its
own (its `rooms.goal`): its first prop (the Breach's altar, the heart, the Hellforge) is placed
before the level's master and its guard wait there, the rest of it with the other rooms. A realm
whose ground is lava (its `lava`: the River of Fire) has its caverns and grottos flooded wall to
wall before anyone waits in them (`flood`), but for causeways three squares wide from each of a
room's ways in to its middle and an island or two off them; never the way in's room or the one
furthest in, and every square that can be walked on still walked to, or the room's left dry. Nothing that blocks touches anything else
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
             chests: [{ id, at, kind: "small" | "hoard" | "remains", room }],
             lights: [{ at, kind: "torch" | "glow" | "campfire" | "brazier" | "candles", wall? }] }] }
```

`rows` read with `readPlan` as every building's floors do. The new plan characters are
`V` stairs down, `^` stairs up, `*` rock standing up from a cave's floor, `%` crates, `y` a
brazier, `$` a small chest, an ants' nest's `E` brood and `z` midden heap, and a hell's `~` pool
of lava (blocking, not blocking sight, its squares one pool), `&` blood pooled on the floor (walked
through, its squares one pool) and `@` the heart its Halls of Bone beat to. The rest are the ones the caves, lair and crypt already use:
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
  the farmland and the meadows; an ancient temple in the jungle and the savannah; an ants' nest in
  the savannah and the badlands, and the meadows, farmland, heath and jungle. Any theme can turn up
  anywhere, less often.
- **At least two ants' nests in each people's lands** (`settle.js` `NESTS`): where a people's lands
  have fewer, those of their dungeons on the land a nest's likeliest in are made nests (named as
  nests are); and where they haven't enough dungeons for that, more ways in are thrown at their
  lands, 16 cells at least from the others. The rest of the world is as it was (the dungeons have
  their own stream of numbers): some 15 to 22 nests in a world, against 5 to 15 before.
- **Its name** from its theme's names, each its own in the world.
- **Its way in**, set down into a hillside as a cave mouth is (`sites.js` `HILLSIDE.dungeon`), a
  mouth in the rock (`layoutNeutral({ kind: "dungeon", theme })`), dressed by its theme: stores
  and fallen timbers by an outlaws' hideout, columns (some fallen) and rubble by a temple, the earth
  dug out heaped either side of an ants' nest, bones by caves.
- **On the maps**: an arch over steps going down (`app/mapicons.js` `dungeon`), on the minimap and
  on the world map once the land there's been seen, grey while it's cleared.

### Its levels (`insides.js`)

- **Made as a player comes near** (`DELVES.near`, 45 m from its way in), from the site's seed and
  theme, at the tier of the land it's in (`dungeonTier`: as the wilds' creatures there,
  `creatures.js` `tierAt`), or the mightiest of those finding it (in it, or by its way in) as a
  cache would be (`caches.js` `cacheTier`), whichever's the more (`host.js` `#findersTier`,
  `insides.js` `setTier`), and its generation (`buildDungeon`).
- **Each level's foes as many and as tough as the side there** as it wakes (docs/WILDS.md, *A
  side's strength*): the boss and mini-bosses tougher, more of each pack and each a little tougher,
  the more set on free ground beside those the plan has.
- **Each level its own map**, `site:dungeon-N/level-K` (`site:dungeon-N/gG/level-K` once it's been
  made again), read from its plan rows as any building's floor is. The levels sit well away from
  every other inside (`DUNGEON_ORIGINS`: a column of them for each dungeon, from x 20000; a hell's
  in a block of their own, `HELL_ORIGINS`, from x 26000, its rows 600 m apart for its four
  levels). A hell's level is named for its realm: "The Burning Pit: the Halls of Bone".
- **Joined by stairs**: a flight for each level but the bottom (`building.flights`), from the
  stairs down on one level to the stairs up on the next, each end where one comes off it, facing
  into the level.

### Who's in it (`host.js` `#dungeons`, `dungeons/play.js`)

- **Each level's foes woken while a player's on it or on the level over it**, the first level's as
  soon as a player's near; let go once no one is. Each pack is a wild pack of its own (territorial,
  keeping near where it stood), its leader the boss or mini-boss if it has one.
- **Drawn only once a player's among them** (app/game.js `#walledOff`, GAME.md): a level's foes
  aren't dressed while the player's on the level above, nor the first level's while the player's
  outside, nor the world outside's while the player's down in it; coming to a level, its foes are
  dressed the nearest first.
- **The boss and the mini-bosses stand out** (`CHAMPIONS`): the boss with four times its kind's
  hit points and blows 1.3 times as hard, a mini-boss twice the hit points and 1.12 times as hard,
  each named by its title (the Troll King, a Tomb champion).
- **And they look it** (`beasts/champions.js`): the host gives each its rank and its id in its
  theme (`wild.champion`, `wild.regalia`), and it's drawn bigger than its kind (a boss 1.22 times,
  a mini-boss 1.1 times, but no taller than 3.3 m for it, `CHAMPION_HEIGHT`, so a hideout's
  tunnels have room: a troll or an ogre, already big, only 5% bigger), what glows on it brighter (its eyes, a wraith's light), and each its own
  way (`REGALIA`): the Troll King and the Outlaw King crowned (the Goblin King in its own crown
  and cape, 15% bigger again), the Frost Troll in
  a silver circlet, the ogres in horned helms, the outlaw lieutenant in a soldier's helm, the
  priests hooded in black; the Broodmother vast and blood-marked, the Widow matriarch bigger, blacker and glossier, the cave bear and the old tusker
  grizzled, the tomb champion's bones gilded, the Tomb Lord's eyes and the Dread Wraith's light
  burning brighter. What's worn takes the place of whatever was in its slot. The rules know
  nothing of it.
- **The caves' Goblin King** is the goblins' elite (docs/WILDS.md *Goblins*) on its throne, and
  harder than met in the wild: as a boss, four times its kind's hit points (an elite three) and
  blows 1.3 times as hard (an elite 1.25), two tiers over its level; its big bombs three at a time
  (the others half to all of 3 metres about whoever it's after) every 4.5 seconds (the wild's one
  every 7: creatures.js `boss`); its own war band about it, raiders and bombers in turn (a boss's
  `guard` in its theme, in place of one of the theme's packs); and never thrown by a blast, as no
  dungeon's boss is.
- **An ants' nest's Ant Monster calls her flock** (creatures.js `call`, battle.js `#calls`,
  host.js `#flock`). Six seconds after she first sets on someone, then every 15 seconds as a boss
  (20 elsewhere), between blows, she stops to call (`CALL`): a motion of her own that strikes no
  one, heard far off and told to whoever she's after. As her call goes out, two to four ants (two
  or three elsewhere) come running from 7 m behind her (`FLOCK`). They come two tiers under her (her
  level's), of her pack, for anyone they see, and never more than six of them about her at once
  (four elsewhere), nor more bodies than `BODIES` has about anyone. They're kept with her level's
  foes and let go with them, and they leave only their gold and parts (`extra`). None of them is
  one of the nest's plan, so their falls aren't kept. Stunned or knocked down as she rears to
  call (a shield bash, a stunning spell), her call is cut short.
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
- **The fallen** in an ants' nest, set out with their level as its small chests are, each a coin
  glinting over the remains (`world/drops3d.js`). Searched (tapped, from beside them), each player
  near them gets a share of their own of what was left on them (`FALLEN`, `rollFallen` at the
  level's tier): 3 to 10 gold, more each tier, a piece of their gear 20% of the time, a healing
  draught 20% of the time, a cure poison draught 15% of the time. Once each, as a chest's opened
  once (kept with the chests opened).
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
    vault over all;
  - an ants' nest: dug earth (`SHELLS.nest`): low, flat roofs (3.6 m over a gallery, 4.6 m over a
    chamber's middle, at their height soon in from the walls), the walls smooth, leaning in a little
    and rounding tightly into the roof. The earth's laid down in layers (`STRATA`): every 0.9 to
    1.4 m up (each level its own), level across the level but for a gentle dip and a little warp,
    so a layer runs on through the rock from one chamber to the next; each layer's foot set back a
    few centimetres, the rock's bumps drawn out level. Its colour's the earth's (`earthTone`, on the
    reddened clay of the look's tint): a band of pale sand at each layer's foot, more of it the
    deeper the level, orange where iron's stained it, a speckle of grit, and the meadow's dark soil
    under the top level's roof. Its chambers are strewn with what the ants have dragged in, the
    bones of what they've eaten, roots through the earth (`dungeondressing.js` `CLUTTER.nest`,
    `STREWN`); where other dungeons have fallen rock (`m`), it has heaps of the earth the ants have
    dug out, no boulders (*An ants' nest's story*).
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
  stretched however the rock turns), the picture's grain under the theme's own colour; an ants'
  nest's walls an excavated soil wall's, scored by digging, and its floor red mud and stones.
  They're in the catalog (`client/models/assets.json`), downloaded only once a dungeon's wanted
  (about 3.4 MB in all); until they've come, the rock's drawn in its colours alone. Each is a KTX2,
  which the graphics card keeps compressed (`scripts/lib/ktx2.js`): the colour ETC1S, the normal
  map UASTC (sharper, the rock being seen close to), each with its mipmaps, read by three.js's
  `KTX2Loader` (`art/engine/models.js` `readKtx2`). A picture and its normal map take about
  0.5 MB of a phone's graphics memory, where as JPEGs, decoded, they took 2.8 MB.
- **Never cut away**: the rock and the temple's walls stand whole however the camera looks,
  since the camera's kept out of them (below), so nothing's ever seen from inside.
- **What's in its rooms**, by plan character: rock, bones, rubble, camp fires, bedrolls, barrels,
  crates and sacks, tables, weapon racks, the chief's seat, statues, pillars, tombs, candle stands,
  altars, shrines and braziers; gold heaped either side of the hoard.
- **Furnished with scanned and modelled things** (`dungeons3d.js` `furnish`, made by `npm run
  build:props`, 150 of them in 116 files): mostly CC0, from Poly Haven (furniture, barrels, crates,
  tableware, food, tools and arms, statues, rocks, logs, a rat), OpenGameArt (a skull; skulls and
  bones heaped, crossed, scattered) and museums' scans mirrored on Zenodo and Objaverse (a bronze
  cauldron, a sheepskin, a stone sarcophagus, a winged guardian, urns, a ritual bronze, a wolf's and
  a cave bear's skulls); some CC BY 4.0 from Sketchfab's makers through the same mirrors (a
  handcart, a wheelbarrow, an old chest, a weapon rack, a sword, a painted coffin, a carved urn, a
  clay basin, mushrooms, bracket fungus, a cow's, a stag's and a ram's skulls), and a ribcage and a
  pelvis from anatomy scans (NIH 3D, the Human Reference Atlas: CC BY 4.0, without pictures,
  coloured as bone), each maker named in the catalog and the README. Their pictures are KTX2
  (ETC1S, colour and normal map alike: `scripts/lib/ktx2.js`), kept compressed on the graphics
  card: every one of them together takes about 20 MB of a phone's graphics memory (ETC1; 41 MB as
  a desktop's BC7) where, decoded from JPEGs, they took 163 MB, and their files are 17.7 MB where
  they were 21.1 MB. Every bone among them, whoever scanned or painted it, is made one aged
  bone's colour (`build-props.js` `BONE`, sRGB 206, 192, 166): its picture's lighter half (a
  quarter of the ram's, half of it horn) brought to that colour and every pixel drawn halfway to
  bone's hue as light as it is, so its light and shade, stains and horn stay darker. A model that's a set (three candleholders, a heap of rocks, skulls and bones) is
  a prop for each thing in it, one file between them. The level's built with them placed
  (`dungeon`'s `props`: in metres, each `x`, `z`, its `size`, `fit` or `scale`, its `turn`, `pitch`
  and `roll`, `on` what it stands on, its `tint`, whether it casts a `shadow`), and they're added
  once their models have come: each model's copies in each of the rock's 16 m tiles drawn at once
  (instanced, one for each of its materials), so what's out of sight or a light's reach isn't drawn;
  small things cast no shadow. In the busiest room seen (an outlaws' chief's hall, from inside)
  that's about 390 draw calls (270 before, 250 of them the rock, lights and the rest); most rooms
  are 20 to 60 more than they were, 100 to 190 in all. Bigger squares (32 m) drew no fewer, and a
  lamp's shadow then drew a quarter to four fifths more triangles, every copy in the square, near or
  not. They're in the catalog, downloaded only once a dungeon's wanted (each dungeon only its
  theme's: about 4 to 9 MB), fetched as soon as a level's begun; one that can't be had is left out,
  and what's on it.
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
    same in the drake's lair, crypts and ruined halls); beasts' skulls by a cave's or a kennel's
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
- **An ants' nest's light and air** (`glowfungus.js`, `interiors3d.js` `DUNGEON_LOOKS.nest`):
  - **Its glowing fungus**: each colony grown on the rock where the rock is drawn (`caverns.js`
    `cavern`'s `open`: how far into the open a point is), seven to twelve little bell-capped
    mushrooms (as Mycena grow) on the wall round its middle, a hand's to a stride's height up,
    and at its foot, with two to four brackets (as Panellus grow) one over another. They glow
    their own cold green (fungi glow about 520 to 530 nm; a few colonies yellower, a few bluer),
    dim at their stems and brightest under their caps, where the gills are: drawn in their own
    light whatever's on them (one mesh for the level's, about 400 triangles a colony). Each is a
    room's light of its colour (`glowOf`: 2.4 strong, reaching 6 m), steady but for a slow breath
    (`roomlight.js` `strengthOf` `breathe`), and its threads glow faintly in patches in the earth
    round it, out to 1.4 m (`threadsOn`: a byte a colour at each of the rock's points, drawn by its
    material's glowing variant, `dungeons3d.js` `rockMaterial`).
  - **The light the player carries**: warm, over them (1.2 m over their middle), reaching 9 m, the
    view's second lamp wherever they go, casting no shadows (`view.js` `flicker`); the first lamp
    is still whichever of the level's lights lights them most.
  - **Its own air**: close, warm and dusty: the fog an umber dark (`0x1b120c`), from 9 m to all of
    it by 30 m (so nothing's drawn past 34 m), and dust lying low over its floor, thickest at it
    and thinning by e every 1.1 m up (`fog.js` `MIST`'s `w`: the low ground's mist, under a near
    fog). Spores drift in it, rising slowly, faintly glowing green (`motes.js` `MOTES.spores`;
    none on low quality), and now and then, somewhere near the player under the roof, soil
    trickles from it for a second or two, its dust sifting up off the floor (`trickles.js`,
    drawn as the fights' sparks and dust are: `effects.js` `trickle`, `sift`), heard where it
    falls.
  - **Its sound** (its theme's `sound`, `nest`: docs/GAME.md *The environment*): close, still
    earth, a little damp; its colony heard at work in it round about, one made murmur after
    another overlapping; now and then something chittering far off in its tunnels, slowed and
    muffled; the soil trickling where it falls. All of it either recorded already or made in
    code, so nothing more's downloaded.
- **An ants' nest's story** (`nestlife.js`, `dungeondressing.js`, drawn with its rock: `interiors3d.js`
  `nestLife`), told in what's left about it, in nine meshes at most a level, whatever's in it:
  - **Its brood**, round the middle of each brood chamber (`broodIn`, `NEST_LIFE.brood`): 18 to 26
    glossy ivory eggs heaped there, 8 to 13 cream larvae curled on their sides in a ring round them,
    their small heads amber, and 7 to 11 pupae in their papery tan cocoons round those, none on
    another or on what else is there; one instanced mesh for each kind, a shape made once and
    shared. A faint warm light breathes over it (a room's light, 1.4 strong, reaching 5 m).
  - **A midden's heap** (`heapOf`, `heapGeometry`): a lumpy mound 1.35 to 1.75 m out from its
    middle and 0.55 to 0.85 m high, rounded over its top and spread soft into the floor, of the
    floor's own earth (its picture, laid on as the floor's is) grey-brown with refuse, the dark of
    the ants' husks and the pale of bone. The gear of those the ants killed is thrown out on it
    and round its foot (`middenGearAt`: shields, helms, a mail shirt, blades laid flat, a lantern,
    skulls and long bones), lying on it, sunk a little, and a ribcage on its side.
  - **Dug earth** where other dungeons have fallen rock (`m`, in the gallery, the mouth, the
    chambers): a heap of what the ants have dug out (`heapOf` `"spoil"`), 0.6 to 0.85 m out and
    0.4 to 0.62 m high, piled against the rock, of the same earth, ochre and umber, fresher than
    the trodden floor, with three to five clods round it. All a level's heaps of a kind are one
    mesh.
  - **Roots through its roof** (`rootsUnder`): clusters of twisting tapered roots and their fine
    rootlets, over 1 open square in 20 on the top level, 1 in 67 below it and 1 in 125 at the
    bottom, none of them lower than 2.1 m over the floor and none under a roof lower than 2.6 m.
  - **A widow's web** where each black widow waits under the roof (its level's `lurks`: where those
    that lurk overhead are, `insides.js`): a tangle of 80 to 110 faint silk threads under the roof,
    each sagging, some anchored high on the walls, and 6 to 10 sticky threads hanging from it to
    the floor (`webAround`); one line mesh for all of them. And by the walls near each, one or two
    of its prey (`cocoonsOf`): a body 1.35 to 1.75 m long bound round and round in dusty silk,
    widest at its shoulders, hung by a thread from the roof, its feet clear of the floor.
  - **What the fallen were doing when they fell** (`fallenScene`), a scene or two a level: below
    its top level, one face down a few steps from the stairs up, an arm out towards them, their
    lantern fallen ahead of them and their sword dropped behind; and in a nook or a larder, one
    who'd begun to dig themselves a way out (pick and spade leant on the rock, the earth they'd
    dug heaped by them, their lantern out) or a last camp (a ring of stones round a cold fire, a
    sheepskin, a pack, two dead).
- **The camera kept out of the rock**: it comes in closer rather than go into a level's rock, and
  stays under its roof (never over it, as it can go over a building's ceiling).
- **Messages**: a slain boss ("… is slain, and the hoard it kept lies unlocked"), the hoard opened,
  and the dungeon cleared.
- **Its creatures drawn from models got ready first**: their models fetched as the player comes
  within 150 m of its way in, waited for at its door (a card saying how far they've got, Go in
  now after five seconds), kept while the player's in it, and let go of 30 s after they've left
  (docs/WILDS.md *A place's creatures, ready before they're met*). Which those are is its foes once
  it's made, or all its theme can hold before (beasts/model.js `modelsInside`). Today's themes
  hold none: a theme's packs, mini-bosses or bosses drawn from a model are got ready this way.

### Kept

The host keeps each dungeon's state by site (`host.dungeons`): its generation, its tier, which
levels are awake, the slain, the chests opened, and whether it's cleared. It goes into snapshots
(`SNAPSHOT_VERSION` 8; its tier from 26) and saves, and a game taken up again makes each dungeon's levels as many
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
    rooms: { kind: [{ id, weight, props: [{ char, count, at, size, mirror }], torches: [0, 2], glows: [0, 1] }], any: [...] },
    lit: "glow", // (or left out: torches, one more in the way in's room and the arena's)
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
how many triangles at most; a set's pieces; `bone` for a bone, so it's BONE's colour), made with
`npm run build:props` (then `npm run build:manifest`), and placed by `dungeondressing.js` (a kind
of what's left against a wall, in a theme's `CLUTTER`) or in `dungeon` for a plan character (the
shops' wares the same way, placed by `interiors3d.js` `shopWares`: docs/GAME.md *A shop*). Only
CC0 or CC BY (its maker named), and only what can be downloaded without an account. Its bosses'
and mini-bosses' looks: an entry each in `beasts/champions.js` `REGALIA`, by its id (one not
there looks as its rank has it).

## The model viewer (`model-viewer.html`, `js/lab/model-viewer.js`)

The model viewer (once the creature lab) shows each theme's bosses and mini-bosses as they're
drawn in a dungeon, one group of them for each theme ("Dungeons: caves" and so on), beside the
creatures of the wild they are. Each is named by its title and rank. Open one straight away with
`?creature=` and its theme, rank and id: `model-viewer.html?creature=caves:boss:trollKing`.
WILDS.md, *The model viewer*, says what else it does.

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
  lit, down its stairs to the next and out again. And a hell, the nearest to the start: its way
  in shut by day, no one there; by night its cult there, shut till they're slain to the last,
  then in; each level its realm's, drawn in its own air, a portal of fire on it; each portal down
  sealed till its level's master is slain; out beyond the throne once its lord is, to before its
  way in.
- **`test/world-plan.test.js`**: two or three hells' ways in a world, laid out last, out in the
  wild, at least 1.5 km from every people's start, clear of every other site and far from each
  other and the great lairs and dens. **`test/delves.test.js`**: a hell's way in laid out as a
  cult's camp (its pentagram, candles at its points, the portal in its middle gone into from its
  front, its altar, braziers, hovels, stakes, cage and cart, its ground levelled, nothing across the
  way in).
- **`test/cultword.test.js`**, word of the cults: of the nearest hell to a town, which way it is
  from there always true, more of it the nearer, what stands by it named only near; each hell
  spoken of as near somewhere; never what it is.
- **`test/hells.test.js`**, the hells:
  - four levels deep, each its realm's (dug, dressed, drawn and heard as its realm has it);
  - never below tier 9;
  - a master of its realm on every level, by the portal down (on the bottom level, before the
    arena), of a rank between a mini-boss's and a boss's, no pack besides in its room;
  - its packs and mini-bosses its realms' own, the Lord of the Pit at the bottom;
  - the way out on the bottom level beyond the lord;
  - never dealt to a wild dungeon's site;
  - in a world, at the nearest hell's way in: shut by day, no one there; by night the cult's high
    priest and its faithful there, shut while one of them stands, then in, its breaking told;
    back at it the next night, shut again;
  - its levels in a block of their own, named for their realms, each portal down sealed by its
    level's master and the way out by its lord, no one led in by it; nobody let down a portal
    till its master falls (and up again whenever), nor out till the lord falls, then out to before
    its way in.
- **`e2e/model-viewer.spec.js`**, with the licensed models: the Lord of the Pit drawn from the
  Greater Demon once it's read, not as its people-shaped stand-in: its claws and punch, its
  hellfire hurled from its fist, its roar; 3.2 metres tall.
- **`test/lava.test.js`**, the Breach's lava: pools on every level of it, each against the rock,
  every open square still walked to; lying in their squares, reaching in only under the rock; hot
  in the middle, cooled at the bank, the bank standing up round them, glowing inside; the rock and
  floor lit round them, brightest at the rim, none beyond its reach, the floor less than the
  walls; one material, worked out by the veils' clock. Its rock: sulphur in patches low down,
  soot higher up, sulphur on the floor only near a pool; embers only in a few points' cracks, low
  down, more by a pool. **`test/hells.test.js`** draws the levels: the Breach's lava (one mesh, its
  banks another, a light each), its rock glowing and with embers, the rift over its altar with its
  own light; on no other level.
- **`test/pit.test.js`**, the Pit: its sigils flat on the floor, facing up, within their rings,
  the pentagram's star across its middle; violet, breathing a whole number of times each loop;
  the lord's throne on its plinth, its back tall, its runes and horns; its lava only along its
  throne hall's side walls, clear of the throne and the way out. **`test/hells.test.js`** draws
  the Pit's sigils and the lord's light, on no other level.
- **`test/lava.test.js`**, the River of Fire's lakes: how far into the lava each point is, in it
  in a lava square's middle, out of it on open floor away from it; the floor sinking under them,
  under their surface wherever it's lava all round; each lake one body flowing along its length,
  its surface over all its squares, hotter in from the shore; a light over each, twelve at most,
  the rock glowing by them; their crust drifting a whole number of each noise's repeats a loop.
  **`test/hells.test.js`**: the River of Fire about a third lava, none in the way in's room, the
  Hellforge in the room furthest in, no lava on the Halls or the Pit; drawn, its lakes one mesh,
  the floor sinking, embers in the rock, the forge's basin and mouth molten.
- **`test/flesh.test.js`**, the Halls of Bone: veins of blood in a few of the walls' points, low
  down and high up; the flesh darker in patches, streaked paler; the veins beating every 1.2
  seconds, a whole number of beats to the veils' loop. The ribs: dozens on a level, each from
  its wall's foot up past 2.5 m and on under the roof, every point of them in the open; drawn as
  tubes, every face facing out, bloodier at the foot. The blood: in the Halls' rooms, flat on the
  floor in its squares, darker in the middle. The heart: in the last room of every level of the
  Halls, by the portal down; on the floor, as tall as a man, swelling as it beats, its arteries
  reaching the roof, glowing; its own material, swelling by the veils' clock, and its light
  beating with it. **`test/hells.test.js`** draws the Halls: their flesh veined and wet, their
  ribs, their blood and their heart, its light; on no other level. **`test/caverns.test.js`**
  checks the flesh as it does every rock.
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
