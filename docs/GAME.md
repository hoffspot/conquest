# How Pellagos works

Pellagos is one character, made by the player, in a market town set in a world 8 kilometres
square, all of it on 1-metre squares, against an orc that patrols the fields. Everything is drawn in real-time 3D with Three.js, sized
so that people and buildings look right beside each other, and made to run on phones.

The code is in three layers, each only using the ones below it:

- **The rules** (`client/js/core`): the world, the battle, the weapons. Plain JavaScript with
  seeded random numbers and no DOM or Three.js, so it runs the same everywhere and is tested in
  Node. The world's **host** (`core/host.js`) is the one authority over it: the game only shows
  it, and sends what its player does as commands, so other players can later hop in and out
  (see [WAR.md](WAR.md), *Hop in, hop out*).
- **The drawing** (`client/js/world`, `client/js/characters`): the 3D view, the town, the ground,
  the characters, their animations and the effects.
- **The page** (`client/js/app`, `client/js/main.js`): the loading screen, the title, making a
  character, the game's controls and heads-up display, saving, debug mode.

## The world (core/overworld.js, core/world.js)

`buildWorld({ seed, race })` makes the world from one seed, so a saved character always comes
back to the same world:

- **Its plan** (`worldplan/`, [WORLD.md](WORLD.md)): the land, the peoples, their settlements,
  roads, rivers, sites and camps.
- **The town**, `generateWorld`'s (below), set into the world where a player of their people
  starts (their town nearest their capital: humans, for now), with everything in it (the spawns,
  the orc's patrol, the tavern, the links' ends) moved to its place. The world's `origin` is the
  town's corner, `[x, y]`; `stamp` is where the town is and its own squares; `home` is the town as
  it was made, on its own. The town's main streets head out the ways the plan's roads leave it.
- **The world outside** (`Overworld`, the `town` map): all of it, on 1-metre squares, made a
  chunk 64 metres square at a time from the plan as it's needed, the town's squares in the chunks
  it's in, and its streets carrying on as the plan's roads (see WORLD.md, *The world in chunks*).
  The roads keep to an easy grade, cut into the land and built up over it, climbing what's too
  steep for them in hairpins; and foot paths lead off them up into the hills and mountains, to
  the caves, ruins, shrines, standing stones, ruined castles and lairs there, zigzagging up the
  steepest slopes (`core/trails.js`). Each people's castle and high places stand on a rise, on a
  mound; their pools lie in hollows; and the enemies' camps are pitched on level ground, not on
  a mountain's side (`core/terrain/flats.js`).
- **Every other settlement** (`core/settlements.js`: the plan's capitals, cities, towns,
  villages, hamlets and farmsteads), laid out by `layoutTown` from its own seed the first time
  the world within a chunk of it is made, and set into the chunks it's in as the town is, the
  plan's roads carried on to its streets' ends.

`generateWorld({ seed, kind, exits })` makes the town:

- **A town** laid out by `setpieces/town.js` (below), in metres, its main streets leaving the
  ways `exits` asks.
- **Fields** round it, with the town's streets carrying on as roads to the edge, and trees dotted
  about (about one for every 70 square metres, kept clear of the roads, the town, the orc's
  patrol and where people start).
- **Squares**: the map is 132 by 132 squares of 1 metre, each blocked or not, with the kind of
  ground on it. A building blocks the squares under it (whose middles are more than 0.3 metres
  inside it, turned as it stands); a prop only the middle half of its footprint (a well or stall
  4 metres across, barrels 2); a tree the four squares round its trunk; so people can walk round
  them. Apart from that, each square says whether it can be seen through (`opaque`): houses, the
  special buildings and trees (in town and in the fields) are taller than anyone's eyes and hide
  what's behind them; props (`SEE_OVER`: a well, barrels, crates, a cart) are in the way but can be
  seen over. Everything that depends on seeing uses it (the battle's `canSee`).
- **Where everyone starts**: the player in the middle of the market place, the orc 3 squares in
  from the north-west corner, and the orc's patrol from there halfway down the map's west side.
- **The tavern** (`tavernOf`), 12 metres square, facing the market place whichever way that is:
  its door, the two squares at it (`front`), the square to come out onto (`outside`), and the way
  up to it cleared (every square in front of the door 2.4 metres wide, out past its front, so
  that it's squares side by side at any angle, not only corner to corner).

### Towns (core/setpieces/town.js)

`layoutTown({ seed, kind, exits })` lays out a settlement the way old towns grew (after
Watabou's Medieval Fantasy City Generator, written afresh at the game's scale), in metres, x
east and y south. See any at `town-map.html?seed=5&kind=town` (`SETTLEMENT_KINDS`):

| Kind | Radius (m) | Rings of lanes | Landmarks round the market (or green) |
| --- | --- | --- | --- |
| Farmstead | 13 | | None: a farmhouse, its barns, stable and sheds round a yard |
| Hamlet | 17 | | A tavern, on a green |
| Village | 30 | | A tavern, a church, a smithy and an adventurers' guild; sometimes a windmill |
| Town | 48 | 1 | The same, and half the time a second tavern; a town hall |
| City | 84 | 3 | The same, a market hall and a second tavern; often a third tavern and a second smithy; a town hall |
| Capital | 112 | 4 | The same, a market hall, three taverns (often four) and two smithies; the keep |

A farmstead's or hamlet's streets are earth, not cobbled; a farmstead's yard is beaten earth and
a hamlet's middle is a green. Its houses have one storey, or two now and then.

- **A market place** near the middle: a polygon of five to seven corners, 10 to 13 metres out
  (in a town), cobbled.
- **Main streets** (4.4 metres wide) from it to where the roads leave (`exits`: the ways the
  world's roads go; ways closer than 50 degrees made one; three or four round if none are
  given), bending as they go (their heading wandering smoothly up to 26 degrees either way of the
  way out), cobbled in the middle of town and earth further out.
- **Lanes** (3 metres) curving round between neighbouring main streets, a ring of them (a city
  three), wandering in and out, and alleys off them.
- **Houses** along both sides of every street and round the market, one lot after another, 6 to
  10 metres across and 8 to 12 deep, each turned to face its street where it stands (so they
  stand at every angle as the streets bend), 0.4 metres back from it (up to 2 metres more where
  the street bends towards its corners), wall to wall with their neighbours or nearly, a yard
  behind most (with a vegetable bed, a tree, or barrels, crates, sacks or a cart by the back
  wall). Fewer lots are built on towards the edge, and none past it (the edge wanders).
- **Back buildings** (outhouses, workshops, barns: 4.5 to 7.5 metres) filling the blocks behind
  the houses, each lined up with the street nearest it and facing it, a narrow way between them.
- **Landmarks**: the tavern, church, smithy and guild (and in a city, the market hall) facing
  the market, slid along its edge if need be but never round its corner (or, failing that,
  facing a main street near it); a well and stalls on it, clear of where the main streets leave;
  a windmill out at the edge, by a main street. A layout that can't place the four that can be
  entered (tavern, church, smithy, guild) is laid out again. Each has an `id` of its
  own in the layout (`tavern-1`) and a seed.
- **Where it's ruled from**: in a town or a city, a town hall; in a capital, the keep. Once all
  else is laid out, the biggest house within six tenths of the radius of the market (the nearest,
  of two as big) is made over into it, keeping its style and storeys (two at least), so nothing
  else in the layout moves. It can be entered too (`ENTERED` has them all). A tavern has its name, sign and storeys, and what's
  upstairs (`core/lore/taverns.js`: below); a church its patron, one of the Six
  (`core/lore/gods.js`: below).
- **Trees** dotted about the open ground left.

**Each people's own** (`layoutTown({ ..., people })`, `PEOPLE_TOWNS`): the same builder, laid
out their way, their buildings built by their own kits (below, *Each people's buildings*). The
cat folk's houses stand in lots of their own, with walled compounds out past the town houses; the
orcs' settlements are ring forts, four straight ways crossing at a big market with a ring road
round them, their longhouses on long lots; the lizard folk's houses stand on stilts over a
lagoon, a ragged band of water round the middle over a bed of mud, with plank walks on stilts
along the streets over it; the elves' ways wind among trees (a tree tried every 45 square metres
of open ground); the dark elves' is an orb web, seven spokes and three rings round a big market,
their houses packed close. None has a windmill: their towns, cities and capitals raise their own
special places instead (up to three, by size). From a size of their own each is walled in their
way, a gatehouse across each main street where it leaves. The cat folk's, orcs' and lizard folk's
markets and main streets are trodden earth, as their roads are, not cobbled; their trees are mostly their own
(`homeTree`: three in five). The humans' layouts are just as they were.

Every piece is a rectangle turned to face some way (`facing`, as characters face): its middle,
its size in plots as the art kits build it, and `footprint(piece)` its corners. A town is 20 to
50 houses, a city 50 to 80, a capital 90 or more, a village 5 to 15, a hamlet or farmstead 3 to
8 buildings.

**Taverns' names** (`core/lore/taverns.js`, `nameTavern`) are made the ways old inns were named,
the name and the picture on the sign going together: The (adjective) (thing) (The Golden Crown,
The Drunken Boar), The (thing) and (thing) (The Rose and Crown, The Fox and Hounds), The
(creature)'s Head, The (number) (things) (The Three Bells, The Seven Stars: the sign shows that
many). What's upstairs goes with the name: rooms to let (an inn), rooms with a courtesan or two,
or a whole house of courtesans, most often named as one (The Velvet Garter, The Silken Sheets).
A one-storey tavern has nothing upstairs. No two taverns in a settlement share a name. The start
town's first tavern is *Wenches and Ale*, as it always was.

**The Six** (`core/lore/gods.js`). In the beginning there was only the Silence, and in it one
ember, the Hearth. Lonely, it broke into six sparks, and each woke as a god:

| God | Title | Of | Sign |
| --- | --- | --- | --- |
| Aurelia | the Dawnmother | Life, health and vigour | A golden sun rising over a green bough |
| Brannoc | the Red Horn | Battle and the hunt | A stag's antlers over a crossed spear and bow |
| Ithriel | the Veiled Star | Magic and the arcane | An eye within a seven-pointed star |
| Morvaine | the Keeper of the Last Gate | Death and what lies after | A lantern hanging from a key |
| Seliane | the Rose of Evening | Love and romance | A red rose twined through two rings |
| Dunmar | Anvilhand | Skills, crafts and trades | A hammer crossed with a chisel over an anvil |

A seventh spark would not wake: the Hollow One, which only wanted, and fed on the others' light.
The Six drove it into the dark under the world, but its hunger seeps out still, and the orcs are
what it made of the first hunters it caught. Each god has a story, a festival and sayings; every
temple is to all six, under one of them as its patron. All the arithmetic is exact (`core/exact.js`:
sines, cosines, arctangents and square roots with + - * / alone), so the same seed gives the same
town in every browser. Laying out a town takes about 20 to 80 ms.

### Maps and links (core/interiors.js)

The world outside (the town in it) is one map; each floor of a building is another, on the same
1-metre squares, and
bigger inside than the building looks from outside (18 by 15 metres in a tavern 12 metres
square), to walk about in easily: two metres and more between the tables, round the hearth,
behind the bar and on the stairs, a hallway three metres wide upstairs, and doorways two wide:
`world.maps` is `{ town, taproom, upstairs }`, each `{ id, width, height, blocked, opaque (what
blocks sight), ground, origin }`. A floor is drawn as a plan, a row of characters for each row
of squares, north at the top:

```
TAPROOM              UPSTAIRS
<SSSSS............   .SSSSS>.W.BBwW.BBw   .  floor           W  wall      T  table
<SSSSS...........K   .SSSSS>.W.BB.W.BB.   D  door            H  hearth    b  bench
.................K   ........W....W....   <  foot of stairs  C  bar       K  barrels
..............C..K   ........Wc...Wc...   >  top of stairs   M  counter   B  bed
....bb...bb...C..K   ........W....W....   S  stairs          w  washstand c  chest
....TT...TT...C..K   ..MMM...WW..WWW..W                      L  chaise    o  side table
HH..bb...bb...C..K   ..................
HH............C..K   ..................
HH............C..K   ..................
HH..bb...bb...C..K   ........WW..WWW..W
....TT...TT...C..K   ........W....W....
....bb...bb......K   ....o...Wc...Wc...
.................K   ........W....W....
..................   ........W.BB.W.BB.
........DD........   .LL.....W.BBwW.BBw
```

The tavern's folk (`tavernFolk`, in `world.folk`): in the taproom, the barkeep behind the bar,
going between it (facing the room) and the barrels (drawing ale); two serving wenches, going
between the front of the bar and the tables, setting tankards down on them; and four patrons on
the benches facing the tables. Upstairs, the madam keeps to her counter, and a courtesan waits
in each of the four bedrooms, just inside its door looking out into the hallway, or by the bed
(listed after everyone else, so everyone else keeps the name they had). Each has a title (what
they are: "Barkeep"), a class (`role`: roles.js, how they pass the time and talk) and a sex, and
a name drawn from the world's seed (`names.js`: a given name for their sex and a byname, such as
"Maud Thatcher", none used twice), so a saved world keeps its people's names.

Walls, hearths and stairs block walking and sight; furniture only walking. Each run of the same
thing is one piece (a table, a bed, a stretch of wall), for the art and the minimap. The maps
are joined by links, `world.links`: the tavern's door (from the town's `front` squares to the
taproom's `D` squares) and its stairs (from `<` to `>`). Each end of a link is `{ map, squares,
arrive, facing }`: the squares that go through it, and where (and which way facing) whoever
comes through it from the other end stands: a couple of steps clear of it, turned back to face
it (two squares in from the door, before the foot of the stairs and before their top, and on the
square outside the tavern), so that it's in view to tap, and a tap on the ground round the
player is a step, not straight back through.
`routeBetween` finds the links from one map to another (breadth first, looking only at the links
of each map on the way: a list of them by map, made again when links are added).

### Every building's inside (core/insides.js)

Wenches and Ale's floors are made with the town, as above. Every other building that can be gone
into (`ENTERABLE`: taverns, smithies, temples, adventurers' guilds, town halls and keeps), in the start town and in
every settlement as it's laid out, is known to the world's `interiors` (`Interiors`, by key:
`${place}:${piece id}`, such as `home:tavern-2`), and its front door is one of the world's links
from the start (`${key}/door`), its inside end still to make (`pending`). Its floors and folk are
made the first time they're wanted (`ensure`, `make`): when the game gets them ready as the
player comes near, or when anyone (the player, or the orc after them) goes through its door. They
join `world.maps` and `world.links` in place (so the battle and the doors see them at once), each
building at a place of its own past the world's edge (from 10.2 km east, 100 metres apart), and
are kept.

- **The door** (`ENTRANCES`, `entranceOf`) is where the art builds it: so far in from the front
  of the lot, so far along it and so wide, for each kind (a tavern's in the middle, 1.8 metres
  in; a church's up its steps; a smithy's off to one side, behind its open front). The squares up
  to it are cleared (`openEntrances`), as the start town's tavern's always were.
- **A tavern's taproom** (`taproomPlan`) is Wenches and Ale's room, 18 by 15 metres, with its
  hearth, bar and barrels, and its tables set out one of five ways (`LAYOUTS`: four, six, two long
  ones, a hall of four long ones, or a few), stairs up along the north wall if there's a floor
  above, and walls of one of five finishes (`FINISHES`: plaster, whitewash, ochre, planks or
  stone). From the tavern's own seed, the same every time.
- **Upstairs**, if it's two storeys, as its name has it (`core/lore/taverns.js`): a madam's house
  (a madam at the counter and four courtesans in the rooms), an inn with a courtesan or two
  (an innkeeper, and one or two), or rooms to let (an innkeeper alone), in rose and velvet or in
  whitewash and wool.
- **Its folk** (`tavernFolkOf`) are worked out from its plan: the barkeep behind the bar and at
  the barrels, one or two serving wenches between the bar and the tables' ends, four to six
  patrons on the benches (the drinker, the alewife, the farmer, the greybeard, a tinker, a
  drover), and upstairs whoever keeps it, and the courtesans. They're named from the building's
  seed, each with an id of their own (`${key}/barkeep`) and a seed for their looks.
- **A smithy** (`smithyRooms`) is a workshop 16 by 12 metres, and is known by its smith once
  they're named ("Oakes's Forge"):

  ```
  RRRRR..FFFF..OOO   F  forge (hearth and hood)   P  bellows      A  anvil
  .......FFFF..OOO   Q  quenching trough          G  grindstone   R  racks
  ......PFFFF.....   X  workbench                 O  charcoal
  ................
  .QQ.............
  .QQ.....A.......
  ................
  ...........G....
  X...............
  X..............R
  X..............R
  X......DD......R
  ```

  Its folk (`smithyFolkOf`): the smith, going from the forge (heating the work: `heat`) to the
  anvil (hammering it: `forge`), to the trough (quenching it: `quench`) and back to the anvil;
  and the apprentice, at the bellows (`pump`) and the grindstone (`crank`).
- **A temple** (`templeRooms`) is a nave 16 by 18 metres, to all of the Six under its patron
  ("the Temple of Aurelia"): the patron's altar on a dais at the north end, their statue behind
  it; a shrine to each of the other five along the walls (`shrinesOf`: in the order they woke),
  and a stand of votive candles; pews either side of the aisle, facing the altar; and a basin of
  water either side of the door:

  ```
  ................   Z  the patron's statue   a  altar    s  shrine
  ......ZZZZ......   v  votive candles        p  pew      f  basin
  ......aaaa......
  ................
  s..............s
  ................
  ..pppp....pppp..
  ................
  s.pppp....pppp.s
  ................
  ..pppp....pppp..
  ................
  s.pppp....pppp.v
  ................
  ..pppp....pppp..
  ................
  f..............f
  .......DD.......
  ```

  Its folk (`templeFolkOf`): the priest (a man or a woman), going between the altar, where they
  bless the pews (`bless`), and the shrines, lighting their candles (`light`); an acolyte, at
  the votive candles and the basins; and two to four worshippers seated in the pews.
- **An adventurers' guild** (`guildRooms`) is a hall 20 by 16 metres ("the Adventurers'
  Guild"), as the guilds of adventure stories have them: the counter across the north end, with
  shelves of ledgers and scrolls on the wall behind it; the quest board along the west wall;
  four tables with benches; the hearth on the east wall; and barrels either side of the door:

  ```
  eeeeeeee............   e  shelves     M  counter   q  quest board
  ....................   T  table       b  bench     H  hearth
  ..MMMMMMMM..........   K  barrels
  ....................
  q...................
  q.....bbb.....bbb...
  q.....TTT.....TTT..H
  q.....bbb.....bbb..H
  q..................H
  ......bbb.....bbb...
  ......TTT.....TTT...
  ......bbb.....bbb...
  ....................
  ....................
  KK................KK
  .........DD.........
  ```

  Its folk (`guildFolkOf`): the receptionist behind the counter, stamping notices at either end
  of it (`stamp`) and filing them on the shelves behind her (`file`); two adventurers at the
  quest board, reading the notices (`read`), one going up to the counter now and then; and two
  to four more at the tables, drinking to their last job. Each adventurer has a calling
  (warrior, ranger, mage, rogue or cleric: every one before any comes twice), dressed and armed
  as it has them, their weapons sheathed; those at the tables hold tankards instead of their
  swords, staves and hammers. The quest board's notices can't be taken yet.
- **A town hall** (`hallRooms`) is a chamber 18 by 14 metres: shelves of the town's rolls along
  the north wall and the reeve's long desk before them, the council table with its benches, the
  notices on the west wall, a hearth on the east, strongboxes, and petitioners' benches by the
  door. Its folk (`hallFolkOf`): the reeve at the desk (stamping, and at the rolls), the clerk
  between the rolls and the notices, and a petitioner or three on the benches, waiting.
- **A keep** (`keepRooms`) is a great hall 22 by 16 metres: two thrones on a dais against the
  north wall, a red carpet from them to the door, pillars down the hall, the council's two
  tables, a hearth in each side wall, the steward's desk and shelves, strongboxes, and the
  armoury's racks of swords, spears and shields. Its folk (`keepFolkOf`): the ruler on the
  throne (crowned; named and titled for their people's ruler by the host, or a governor if the
  keep isn't its holders' seat), the steward, councillors at the tables, and four sentries in
  mail by the thrones and the door. What the officials of both do is in
  [WAR.md](WAR.md) (*The player's people*).

## The battle (core/battle.js)

The battle runs in fixed steps of 50 ms, the same on every device, whatever the frame rate.
Each step makes events (`attack`, `draw`, `projectile`, `hit`, `miss`, `death`, `respawn`,
`exhausted`, `cast`, `healed`, `stunned`...) for the drawing to show; `advance` hands over all
of them since it was last called (so a spell cast between frames is shown too). Nothing in it
draws anything.

- **Moving.** Each character is a circle 0.3 metres across the middle (`BODY`), anywhere on the
  ground: its `x, y` are metres, and the square it's on is the one under its middle. It finds
  its way over its map's navigation mesh (`core/navigation.js` `navigatorOf`, below, and
  [WORLD.md](WORLD.md#navigation-meshes)): the corners of the shortest way round walls and
  furniture, over bridges, along roads (which count for less), off cliffs and out of deep
  water, kept to the centimetre. It walks straight from corner to corner, a fifth of a metre at
  a time, facing the way it's going, so it turns only at corners. It never walks into anyone:
  where someone's in the way it steps aside round them, turning 30°, 60°, 90° or 120° (away from
  them first), wherever its body's clear of the blocked squares; having stepped aside near a
  corner of its way, it heads on for the next. Where there's no room it waits; after 0.4 s, with
  whoever it's after within reach it stops to fight, with someone standing where it was going
  it stops there, and now and then it finds its way again. Getting no nearer where it's going
  for 1.5 s (two jostling in a narrow way), it squeezes past whoever's there for 2 s. Sent to
  fight someone, it stops as soon as they're within reach (with a blow up close, once it's
  within 1.2 metres of them). Everything else is still the squares': where it's put, what it
  can see and reach, where it's going (`core/grid.js`: `blocked`, `opaque` and `ground` for any
  square, blocked off the map, whether kept in rows or in chunks). The player walks at 1.7 m/s;
  the orc patrols at 1.1 and chases at 1.8.
- **The navigation meshes.** The world outside has the overworld's tiled mesh, baked from the
  terrain and what stands on it. A map of squares on its own (a building's floor, a town laid
  out on its own, a test's rows) has a mesh of its own, baked from its squares a 32-metre tile
  at a time as it's wanted (`navigation/squares.js`): flat, each square that isn't blocked two
  triangles of floor, in voxels a tenth of a metre across, kept 0.3 metres from walls, so a
  doorway or a passage a square wide is still walked. A tavern's floor takes about 25 ms to bake
  the first time anyone walks it. The 16 maps of squares last walked keep their meshes. The
  battle's ways are the only thing it asks of the meshes: what's in the way, and where someone
  can be put, are still asked of the squares, so a copy of a world someone else hosts needs
  nothing of the meshes at all (below).
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
  straight line the way it faces, as far as it can go: its way is one corner, where a line along
  the mesh that way (up to 400 metres) meets the mesh's edge (a wall, less its body's width, or
  the world's). Running, it sprints while its stamina lasts, then walks.
- **Reach.** A melee attack reaches the eight squares touching the attacker's: N, NE, E, SE, S,
  SW, W and NW (Chebyshev distance 1). A ranged attack reaches any square whose middle is within
  its range and that the attacker can see: a line between the two squares' middles that crosses
  no opaque square (a wall or a house hides a target; a table or barrels don't). The line is
  looked along four points a metre, each square it crosses asked about once.
- **Looking for enemies.** Every step, each armed character asks whether it's in a fight, and
  each on patrol, in the wild or following someone which enemy it can see is nearest: each of
  them about everyone else. How two peoples stand in the war takes the longest to ask (the war's
  realms, their overlords and what's between them), so the cheap questions come first: someone
  dead, on another map, or more than 12 squares off either way (further than anyone sees) and not
  after it isn't asked about; nor is anyone no nearer than the nearest enemy yet. The answers are
  the same. With these and the walled-in goals, a step of 68 fighting outside the town (40
  raiders, the town's guards and the player, in Node; every character where it was and doing what
  it was every half second, as before) takes 0.35 to 0.41 ms on average, where it took 0.89 to
  1.07, and one in a hundred more than 2.8 ms, where it was 16 to 20.
- **Spiked boots** (`boots`, or the boots on their own: weapons.js `armsOf`) add kicks. With a
  melee weapon, each blow is a kick or the weapon, one or the other at random (the battle's seeded
  random numbers), both doing the damage halfway between the two: a range with halves, rolled as
  the whole numbers inside it, evenly (3.5–7.5 rolls 4 to 7). With a bow, wand or grimoire, a kick
  comes first for whoever is next to it, doing the boots' own damage; the ranged attack is for
  anyone further off.
- **Drawing weapons and putting them away.** Everyone starts with their weapon put away
  (`armed`: false). A character draws it (a `draw` event, `on`) in a fight: attacking or told to
  fight, an enemy in sight, or an enemy after it (chasing it, attacking it, or told to fight it).
  It can strike 700 ms later (`DRAW_MS`), and an attack waits for it. With no enemy in sight or
  after it for 10 seconds (`SHEATHE_AFTER_MS`), and not attacking, it puts the weapon away
  (`on`: false, taking `SHEATHE_MS`). Coming back to life, it's put away.
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
- **Spells** (spells.js: every one, in docs/MAGIC.md), cast with `cast(id, spell, target)`,
  take a moment to cast, then land: healing (on anyone), harming (an enemy, and those round them
  or it leaps to), stunning, lasting on whoever it's cast on, and the wonders the host works.
  **Stun** (the Hexes') is cast on an enemy within 9 metres that the caster can see (0.4 s): for
  3 seconds it can't move, attack, cast or think, and whatever it was starting is called off;
  the orc then turns on whoever stunned it. Each spell has its own cooldown, and after any, none
  can be cast for a second. A spell that can't be cast says why (`cooldown`, `busy` while
  staggered, stunned or casting, `healthy` at full health, `range`, `sight`, `lifeless` with no
  one living there, `friendly` on someone who isn't an enemy...) and nothing happens; none of
  these shares a name with the host's own refusals (so healing at full health says "Already at
  full health", not "Your pack is full"). Casting stands still, and calls off an attack that
  hasn't landed; walking off doesn't stop a spell once it's begun.
- **Dying and coming back.** At no hit points a character falls; the player gets up in the
  market square 5 seconds later, with full health, and the orc back in its corner 30 seconds
  later (whichever map they fell on; 10 minutes, if the town's soldiers felled it: docs/WAR.md).
- **The folk** (`neutral`: the tavern's; `hostile(a, b)` says who fights whom) are on a team of
  their own, and no one fights them: nobody sets on them, casts at them or attacks them, and they
  fight no one. They go about their business (`ai: "routine"`): seated, or going from stop to
  stop, each in turn or, alternating, one of another group at random (the bar, then a table),
  waiting at each (seconds, from and to), facing its way, and doing its act there (serving,
  pouring: an `act` event). Someone standing on a stop, they stop next to it; unable to get to
  one for 8 seconds, they go on to the next. Their comings and goings use their own random
  numbers, so they don't change how the fighting goes.
- **Resting.** While the player can see them (`canSee`), the folk rest now and then: every 4 to
  9 seconds, seated or waiting at a stop, one of their class's five rests (roles.js), never the
  same twice running (a `rest` event: `{ id, role, rest }`), staying where they are until it's
  done. Not straight after an act, nor the moment the player first sees them (0.8 to 3 seconds
  later); unseen, never.
- **Talking.** Told to `approach` someone (`{ type: "approach", target }`), a character walks to
  the nearest square it could talk to them from (`canTalk`: seeing them, next to them, or up to
  3.2 squares away across something in the way: the bar, a table, a counter), there (searching
  outwards from where it stands) or after them as they move, and stops facing them (an `arrived`
  event). `talk(id, withId)` has someone talk to another (null: stop): the folk stop what they're
  doing and turn to face them (seated, they stay facing their table); the player turns to them
  while standing.
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
| Spiked boots | kick | melee | 3–7 | 360 | 760 | 1050 | 220 | kick |
| Orc cleaver | hack | melee | 3–8 | 520 | 900 | 1400 | 200 | hack |

| Spell | On | Reach | Casts in | Does | Cooldown |
| --- | --- | --- | --- | --- | --- |
| Vigor | anyone | 8 m | 500 ms | 8–12 hit points back | 4000 ms |
| Burn | an enemy | 8 m, in sight | 450 ms | 9–15, may set them burning | 2500 ms |
| Stun | an enemy | 9 m, in sight | 400 ms | can't act for 3000 ms | 3000 ms |

(The rest, each school's tiers and the tomes' spells, are in docs/MAGIC.md.)

Both sides have 50 hit points. In play-testing (test/combat.test.js simulates fights on
generated worlds), a sword fight with the orc lasts about 10 seconds and the player usually wins
with a fair few hit points to spare.

## Drawing the world

### The view (world/view.js)

A WebGL renderer with ACES tone mapping, a sky and fog, light from all round (below) and a sun
whose shadow map follows the player (a little ahead of them, where more of the ground is in view,
the further out the more: up to 12 of its 24 metres). The camera looks
down from 35 degrees above the horizon to start with (low enough to see well ahead of the
player, high enough to see a little of the sky over the rooftops: `pitch`), zooming between 5 and
32 metres away, from any side (`yaw`: from the south, looking north, to start with), at the
player's middle (0.8 metres up).

**The sky** (world/sky.js), outdoors, a fair day: deep blue overhead paling to the haze at the
horizon (the fog's colour, so the world's far edge melts into it), the sun where the shadows come
from (a bright disc in a warm glow), and clouds drifting slowly across on the wind, soft-edged,
white where the sun's on them and grey-blue underneath, thinning towards the horizon. It's one
dome round the camera, drawn first and behind everything (it writes no depth), in the picture's
own colours (untouched by the tone mapping, as the fog and the background are): a gradient, the
sun, and two reads of a small tiling texture of noise (128 texels) for the clouds, drifting at
their own speeds, so it costs little even when it fills the screen. Worked out in the picture's
colours, it's put out in light's when it's drawn into a texture rather than onto the screen (the
light from all round is drawn from it, and so is the world behind the open pack, where the sky
was once pale grey, turned into the picture's colours twice). Indoors there's none.

**The light from all round** (world/environment.js). Every lit material (in three.js r186 the
buildings' and the ground's as well as the characters') takes the light on its shaded side, and
anything shiny its reflection, from one environment map. Outdoors it's the game's own sky above
(the dome, clouds and all) and the sunlit ground below (a warm grey); indoors, a dim room of
warm plaster and dark boards, lit low on one side by a fire and from above by lamps. Each is
drawn once, when the view's made, into a map 128 pixels a face (3 MB for the two), both the same
size, so going in or out changes only which is read, never a shader. They replace a
photographer's studio room (6 MB, twice as long to make) and a hemisphere light, under which a
white wall in the shade got twice as much light as the sun gave it in the open, so nothing had a
sunny side and a shaded one, and steel mirrored grey walls. Now, outdoors, a wall in the sun gets
about three times the light of one in the shade, which is sky-blue (the sun a little stronger,
3.5, to make up the sunny side's share); steel mirrors the sky and the ground; indoors the light
is warm. The character maker keeps a studio's light of its own (made when it opens, let go when
it closes), so colours are chosen as they are.

**Glows** (lamps, faerie fire, lava: world/art/engine/atlas.js glowMaterial) are shown in their
own colours, untouched by the tone mapping, as the flames indoors are, not dulled and paled to a
lit surface's.

**Steady shadows** (world/shadows.js). The sun's shadow map moves in whole texels across the
sun's own view as it follows the player, so its texels stay put on the ground and shadows' edges
stand still as the player walks. (Whole texels along the world's own axes, as it once moved,
aren't whole texels to a sun looking down at a slant: edges crawled.) Shadows fade out over the
outer fifth of the map rather than stopping along a straight line, which shows when the camera's
drawn back or looks towards the horizon. Their soft edge (about 5 cm on medium and high) is
about the sun's own: the half-degree sun blurs a 2 m figure's shadow by 2 cm, a house's eaves' by
7 cm.

**Left as they are.** The fog is plain distance fog: the ground is level and the sun high (about
50 degrees up), so haze thickening near the ground, or glowing warm towards the sun, would change
almost nothing seen, for a change to every material's shader. The tone mapping stays ACES: AgX
(tried, pictures with the change) greyed the lamplit taproom and dulled the painted colours, and
Khronos Neutral turned the taproom orange.

**Following the player** (app/camera.js). From the player's first step, the camera keeps up
with them and turns round to look from behind them, the way they're going, at the same height
and zoom. It turns on a spring, gathering speed and slowing smoothly, never faster than 4.2
radians a second: a half turn (the player turning back towards it) is three-quarters done in
0.8 s and done in about 1.2 s. The way they're going is averaged over a third of a second, so a
path's corners don't swing it about. Stood still, it stays where it's turned. Put somewhere else
(coming back to life), it catches them up without turning. It leans towards whoever the player
is fighting, so both stay in view. The minimap stays north up; what the camera sees turns on it.

**Turning it by hand.** A drag (a finger, or the mouse held down) turns the camera round the
player: across the screen's width, half round, the view turning the way the drag goes (dragged
right, it looks further right); up or down its height, it tilts 60 degrees (dragged up, it looks
further up, lower down). It tilts between 75 degrees (almost straight down) and, outdoors, 45
degrees *above* the horizon: looking up into the sky, the camera comes down behind the player to
just over the ground (0.45 metres) and then tilts up from there, the player sinking down the
picture and, at the last, out of it. Indoors it stops with the top of the picture 6 degrees
below the horizon (24 degrees down on a wide screen, 31 on a tall one), so there's no more of the
room to draw than there is. While held, it doesn't turn itself; let go, it stays where it was
turned while the player stands, and once they walk again, it swings back round behind them,
facing the way they go (keeping its tilt, unless it was looking up past 15 degrees down: then it
eases back down to 35 to see where they're going).
A drag that starts on the player and sets off mostly upwards is a swipe (straight ahead), not a
turn; two fingers are a pinch (zoom). Tilting costs nothing: the town is a few merged meshes,
drawn whole whichever way the camera looks (about 90 draw calls and 170,000 triangles either way).

**Quality levels** trade looks for speed, chosen for the device (debug mode can change them):

| Level | Pixels | Shadow map | Antialiasing | Hair | Skin textures | Undergrowth | Frames a second, at most |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Low (older phones) | 1× | 1024 | no | a fifth of the strands | 512 | half | 30 |
| Medium (phones) | up to 1.5× | 2048 | yes | 30% | 512 | three-quarters | 60 |
| High (computers) | up to 2× | 2048 | yes | 45% | 1024 | all of it | as the screen refreshes |

**How often it's drawn** (`app/pacing.js`). The browser asks for a frame each time the screen
refreshes: 60 times a second on most screens, 90, 120 or 144 on many phones and monitors. Drawn
every time, a phone with a 120 Hz screen did twice the work of 60 for a picture no one can tell
from it, grew hot, and slowed itself down to cool. A quality level draws no oftener than its
rate (`frameRate`): a frame's drawn when the browser asks within 0.6 of the screen's refresh of
when one's due, so the frames keep to the screen's beat. At 60: every other frame at 120 Hz, every
other at 144 (72 a second), every frame at 90 (which has no even 60; never fewer frames than the
rate asks for, rather than uneven ones). Low draws a steady 30. A frame that takes longer to draw
than the rate allows is followed by the next at once. The screen's refresh is the shortest time
between the browser's askings over the last 30 (so it follows a screen changing its rate). The
battle keeps its own time, whatever the frame rate (a step each twentieth of a second).

**Fewer pixels when the drawing can't keep up** (`app/governor.js`). The quality level is a guess
from what the browser says of the device, and some say little: Safari tells nothing of a phone's
memory, so every iPhone with more than four cores is taken for a medium one, however old. Played,
a device shows what it can do. After 5 seconds of play (things being got ready make it slower at
first), judged over 3 seconds: if its frames come more than 1.25 times the rate's time apart (the
median: a hitch now and then doesn't count), while the page's own work each frame is under 0.6 of
that time (so it's the drawing that's slow, and fewer pixels will help), it draws 85% of the pixels
across and down, and 70% if it still can't keep up after another 3 seconds; no further, and it
doesn't step back up (a device at the edge would go up and down). The drawing buffer changes size
at most twice a game (a few milliseconds each). It stays so for the rest of the page's life. Only
with the quality and the render scale left to the game ("auto", 1); choosing either draws every
pixel again. Not under automation (`navigator.webdriver`): a test's frames, drawn in software, are
always late, and what it measures mustn't change size. Debug mode shows it on the quality line.

**Clear of buildings.** In the town, a building can stand between the camera and the player,
from whichever side it looks. The view marches out along its line from where it looks over the
height of what's built on each square (`buildings`: houses, landmarks, walls, towers,
gatehouses and keeps, not props or trees) and, finding one in the way, comes in closer than it
(staying 0.6 metres clear of it), or rises over it (up to 85 degrees), whichever leaves the
camera furthest from the player, a degree higher counting as 0.15 metres nearer, and never nearer
than 2.6 metres: a building a little way behind brings it in, one right behind lifts it over.
It comes in (and rises) quickly, and goes back out slowly once the way is clear.

**The cutaway.** Whatever still hides the player (a tree, or a building too close to come in
front of), the view finds by marching along the line from the player to the camera over the
town's height map (everything, trees and props too), and the town's materials cut a round,
dithered hole through whatever is nearer the camera than the player (a few lines added to their
shaders; the shadows they cast stay whole).

### The ground (world/ground.js)

A mesh under each chunk of the world, rising and falling with the ground (WORLD.md, *The ground
in play*): its corners a metre apart in the chunk the player's in, and further apart further off
(`QUALITY.ground`, view.js: on high, a metre in the ring of chunks round it too and two metres
beyond; on medium and low, two metres in that ring and four beyond, deep in the fog), redrawn
finer or coarser as the player moves, lit by its slope worked out from the corners round each (across
into the chunks beside it). A skirt hangs two metres down round each chunk's edge, so where
chunks drawn at different spacings meet no gap shows between them. Where the ground's steeper
than about 33°, rock shows through the grass, all rock by about 45°: a rock texture seven metres
across laid from the side and from above, as the slope faces, at two sizes turned against each
other so it doesn't repeat. (A town on its own, in the labs, has one flat mesh under it all,
carrying on 110 metres past its edges into the fog.) A small "splat" texture, four texels to a metre made
from the chunk's squares (and one more round it, so the edges blend across chunks as if there
were none), says how much road, cobbles, soil and courtyard earth is at each point, with soft,
ragged edges, the same wherever the world's cut (mipmapped, so a far road's ragged edge, many
texels to a pixel, doesn't crawl as the camera moves); the shader blends tiling textures by it over
grass, each at its real size (cobbles about 16 cm across), and shades everything by a much larger
copy of the grass so the repeats don't show from afar. The grass takes its land's colour
(`LAND_COLOURS`: a little yellower in farmland, darker in the woods, dark in the darkwood, pale
gold on the savannah, rust in the badlands, ash grey on volcanic land, grey on mountains, white
with snow, sand on beaches), from one texture of the whole world a texel to the plan's cell,
blended between cells, with the edges wandering 26 metres or so so the cells don't show. Every
chunk's ground shares one shader; chunks of grass alone share a material too.

**Where something stands on it** (a house, a wall, a rock, a trunk: the squares that can't be
seen through), less of the sky reaches the ground, so less of the light from all round (view.js)
does there. A chunk's field of it is worked out when it's drawn, from seven squares round it:
where things stand, blurred three squares across and along, twice over, a byte a square. At a
great building's foot it's about half (as a tall wall hides half the sky), a third a couple of
metres out, next to none round a lone trunk; the ground loses that share of its light from all
round, not of the sun's, so sunlit ground stays bright while its shade darkens towards the walls,
and buildings past the sun's shadows still sit on the ground.

**Under everyone standing on it** (world/contacts.js): townsfolk and soldiers cast no shadow of
the sun (there are too many of them), and would look set down on the street rather than standing
on it. Under each is a soft round shadow of the light from all round that their body keeps off
the ground at their feet, lying along the ground's slope (flat on a bridge's deck): half as dark
in the middle (`CONTACT.strength`), fading out over about half their height. It fades as they rise off the ground (Levitate), over half a second as they
fall dead, and to a fifth for someone unseen (Invisibility). Everyone's is one instanced mesh, a
single draw call, the list made again each frame from those drawn (only those listed sent to the
GPU); a creature casts its own shadow and has none.

**Each people's homeland** (the world plan's territories, as first claimed) has its own ground
over the grass (`HOMES`, painted as the materials `home-cat` and so on: painters.js): the cat
folk's gold grass on red earth, the orcs' red clay baked hard and cracked into plates with black
grit between, the lizard folk's black mire shining wet in its hollows with moss spreading over
it, the elves' deep moss and clover strewn with fallen gold leaves and white blossom, the dark
elves' black leaf litter with violet in it. Two small textures a texel to the plan's cell say
how much of each people's homeland is at each point (one with four peoples in its channels, the
other the fifth), read where the land's colour is, so the edges wander the same way; the most
of any there draws that people's ground from a texture array of the five (6 metres to a copy,
read again at 17 metres turned, so the repeats don't show), over the land's colour. None is laid
under the sea or lakes. The patches (below) show less over it.

The grass isn't the same everywhere (`PATCHES`): from a little texture of noise (128 texels,
tiling, a different noise in each of its four channels: made once), read coarse (170 metres to
a copy) and fine (43), it's drier and straw-coloured in broad patches, lusher and darker in
others, and here and there worn to bare earth (the earth taking the land's colour where that's
strong: grey ash, sand, snow), the patches' edges ragged. None of it touches the roads, fields
and streets, and it costs a texture read or two.

### The world outside (world/chunks3d.js)

The world is drawn a chunk at a time round the player: the 25 chunks within two of theirs (160
metres or more each way, into the fog). Loading, those round where they start are built (about
a second); after, as they go, the nearest chunk not yet drawn is built, and those more than three
chunks away are thrown away, so however far they go there's only so much of it, and never a
loading screen. A chunk is drawn a step at a time, hidden till it's whole: its ground's splat a
few rows at a time, the looks its features want (each made the first time it's wanted) one a
step, then its features, its trees. Each frame draws what it can in its budget (`BUILD_BUDGET`, 6
ms, shared with the settlements' buildings and the undergrowth), a step at least, and begins no
more than one chunk; while the game loads, a turn gets 40 ms (`LOAD_BUDGET`). A chunk is 64
metres, so it's a few frames from begun to drawn, two chunks off in the fog. The settlements a
little further off (within five chunks) are laid out ahead in a worker (world/layouts.js: see
WORLD.md), so coming near a town doesn't stall a frame laying it out. Each chunk has:

- **Its ground** (above).
- **Water** (world/water.js): a sheet over the lakes, the sea, rivers and mountain streams, its
  corners at the water's surface every 2 m (a river runs down its valley; out of a river's
  channel, a lake's or the sea's level wherever that can stand, so still water beside a river
  higher up is never drawn at the river's height). Where the surface drops 0.6 m or more over a
  lip, the sheet leaves it out, and the fall's own sheet is drawn. It's drawn
  where a field says, worked out when the chunk's drawn, four bytes a square, from nine squares
  round the chunk so it meets its neighbours'. It's worked out a few rows a step, about 3.5 ms a
  water chunk in all on a desktop.
  - **How far each square is into the water** from the nearest dry one (or out of it, on land),
    softened and sampled between squares, so the shore runs in curves rather than stepping
    square by square.
  - **How the water runs** (metres a second, east and south): a river's current, the way its
    course goes through the wandering, still in lakes and the sea.
  - **How deep it is**: its surface less the ground under it.

  It's drawn like this:
  - **Ripples.** A small tiling picture of slopes (whole waves running ten ways, so it tiles
    without the lines a noise lattice leaves) is read twice, half a cycle (1.6 s) apart. Each
    read is carried along by the current from where it last started over, and faded out as it
    starts again, so neither's restart shows (flow maps, after Valve's Portal 2 water). The
    cycles are set off from place to place so they don't pulse together, and a lake's ripples
    drift with the wind.
    - On medium quality and up, a finer picture is laid over it the same way (`QUALITY.water`).
    - Water ripples harder the faster it runs, and gentler further off.
    - That's three texture reads a pixel on low and five on medium and high. There's no depth
      pass, reflection pass or refraction pass.
  - **Foam:** a broken line along the shore, and streaks where water runs faster than about
    2 m/s (rapids, lips), more the faster.
  - **Colour.** The bed's light comes up through the water, each colour less the further it has to
    come (Beer and Lambert: 0.85, 0.4 and 0.5 of red, green and blue taken out a metre, red
    first, so the shallows are green and the deep blue-green).
    - One share of the bed behind can't be kept more of one colour than another. So the bed is
      kept as much as its red comes through, and the rest of its green and blue are added as
      the bed would look under the light falling on the water there.
    - Shadows on the water darken what's under them too.
    - The water's own colour is what it takes out. The sky and sun are reflected off it, more
      the more glancing the look (Fresnel, after Schlick, 0.02 square on).
  - **The bed** is drawn as packed earth (the land sets soil there, drawn ploughed, whose furrows
    showed through). The ground reads the water's field too (world/ground.js):
    - It's wet, so darker, under the water and a metre and more up its banks.
    - There's no rock at the water's edge or under it: the bed's own ground, not a channel's cut
      edge drawn square by square as cliff. Where it's all but sheer, as the rock a fall drops
      down, it's rock all the same.
    - On medium quality and up, light gathers under the water where the ripples bend it
      (caustics): a small tiling picture of a cell pattern's edges, read twice, drifting its own
      ways, wobbled by each other, the dimmer of the two kept, fading the deeper it is.

  Water can't be walked into, but can be seen over, except where it's shallow and slow enough to
  wade (fords, lakes' shallows, and mountain streams, stepped across: WORLD.md).
- **Waterfalls** (world/falls.js), wherever a river or stream spills over a lip 0.6 m high or
  more:
  - **A sheet** falls from the lip across the river's width. Thrown forward as fast as the water
    comes over (faster the higher the lip) and pulled down as anything falls, it arcs out and
    spreads a tenth wider to its foot, 0.3 m under the pool below. Its foam-white streaks run down
    it fast over green-blue water, fading at its sides and breaking up at its foot. Where a
    stream runs into a river, its fall is where its water meets the river's, at the bank, not at
    the river's middle, where its course ends.
  - **Mist** rises off the pool below a lip 1.5 m high or more (on medium quality and up): eight
    puffs a fall, each a soft round square turned to face the eye, rising and spreading over 4.5
    seconds as it fades in and out, all of a chunk's in one draw.
  - Each chunk draws the falls whose lips are in it, its sheets in one draw and its mist in
    another.
- **Bridges**, where roads cross rivers: each a straight deck of boards laid across it, from a
  little way onto one bank to a little way onto the other, along the road, with a dark beam along
  each edge and a rail on posts along each side. Anyone on one stands on its boards, 16 cm up
  (stepping up onto it and down off it smoothly).
- **Trees** (`Woodland`, kits/trees.js): every variant kept once and drawn wherever it's planted
  (Three.js's BatchedMesh), all the world's wood in one draw call and its leaves in another, only
  the trees in view (and, into the sun's shadows, only those in its); the crowns' shells and the
  patches round the feet merged a chunk at a time. Merged a chunk at a time as the town's are, a
  wood of 25 chunks would take 100 megabytes or more.

- **The settlements' buildings, props and trees**: each piece whose middle is in the chunk,
  built by the art kits as the town's are and merged with the one material (the atlas, above);
  the trees are the chunk's. Buildings are built a few at a time, within 6 ms a frame, so walking
  up to a city never stalls a frame; while loading, the game waits for those round the start.
  Each piece's meshes are made ready to merge (baked to their places, drawn into the atlas:
  town3d.js `partsOf`) in a step of their own after it's built, so the chunk's merge once they're
  all built is only joining them (`joined`): a capital's chunk's was one piece of 10 to 28 ms.
- **Each people's castle, special places and watchtowers** (core/sites.js: WORLD.md), each
  whose middle is in the chunk, built by its people's kit as a settlement's pieces are (the
  humans' castle laid out by castle.js, their abbey, windmill and manor as their landmarks).
- **The land's own features** (core/wilds.js places them: see WORLD.md, *The world in chunks*;
  kits/wilds.js draws them), one mesh a chunk with the atlas, casting shadows:
  - boulders (granite, pale limestone, red sandstone, black basalt; mossy in the woods and
    marsh, snow on their tops in the snow and the mountains, flecked with lichen), rocky
    outcrops, basalt columns in the volcanic lands, cairns and standing stones;
  - trees long fallen and gone silver (their trunks bending and tapering, broken branches, the
    root plate torn up with earth still in it), old stumps (sawn or broken, roots flaring,
    shelf fungus), dead trees still standing, piles of logs;
  - bushes (with red, black or white berries, pink or white flowers, the heath's yellow gorse),
    termite mounds on the savannah, haystacks and scarecrows in the fields, stretches of ruined
    wall, and in the badlands now and then the ribs, spine and horned skull of some great beast;
  - in each people's homeland, their own besides the land's (`HOMELANDS`): the cat folk's red
    termite spires and granite kopjes, the orcs' horned skulls on poles hung with red rags,
    clusters of sharpened stakes and the wrack of old fights (a broken cart wheel, a shield,
    spears, a helm, bones), the lizard folk's mangrove roots arching out of the mud and stelae
    carved with glyphs under a serpent's head, the elves' moonstones (a crescent cut in each that
    holds the light) and bud lamps hanging from curling verdigris posts, the dark elves' stumps
    shrouded in web, silk cocoons and clusters of black crystal with violet hearts.
- **Undergrowth**, near the player only (every chunk whose nearest edge is within 64 metres,
  let go past 84), built a few things at a time in the same 6 ms a frame and drawn in tiles 32
  metres square, each only while it's within 56 metres of the player:
  - grass in tufts (short and tall, with seed heads; dry straw on the savannah and in the
    badlands, marram on beaches, sedge and reeds with bulrushes by water and in the marsh);
  - wildflowers in drifts of one kind: daisies, poppies, cornflowers, buttercups, dandelions
    and their clocks, foxgloves, cow parsley, yarrow, campion, thistles, heather, lavender,
    bluebells in the woods, cotton grass in the marsh and tundra;
  - ferns and bracken, mushrooms (fly agaric, clusters of brown caps, puffballs, and now and then
    a fairy ring), pebbles and stones (scree in the mountains), sticks and fallen branches,
    fallen leaves, molehills, rabbit holes, bones and horned skulls, cacti and tumbleweed,
    shards of obsidian, shells and driftwood, and the stone ring and charred sticks of someone's
    old campfire;
  - in each people's homeland, its own among them (`HOME_UNDERGROWTH`): the cat folk's potsherds
    and horned skulls, the orcs' bone piles and broken blades, the lizard folk's eggshells and
    glyph stones, the elves' white petals and glowing moon buds, the dark elves' glowing caps and
    blackthorn.

  Where each thing grows comes from its square: grass, not blocked, no road, bridge or water;
  how much and of what from its land (`UNDERGROWTH`: in a lush meadow about a quarter of the
  squares have something) and from smooth noise fields across the world, so there are bare
  stretches and lush ones, flowers in drifts of a kind, tufts in clumps, pebbles where it's
  rocky, sticks and mushrooms where the land's been let go and in the trees' shade, reeds by the
  water; thinner, and only the tidier kinds, in the towns. The same every time.

  **How it's drawn cheaply.** Every look is made once, the first time it's wanted, eight of each
  kind for each land, from a seed: rocks are balls pushed in and out by noise and cut flat by a
  few planes (their facets); trunks and branches tapered, bent tubes; stumps, mounds, haystacks
  and mushrooms turned on a lathe. Blades of grass and petals are real triangles, not pictures
  with holes in (a blade is one triangle, a flower's head five), so nothing is drawn twice over
  the same pixel and the GPU keeps its early depth test. Each thing is placed turned its own way,
  stretched, tinted and its texture shifted, so no two look alike, and a tile's are baked into
  one mesh (a lush chunk's undergrowth is about 20,000 triangles, 4 ms to build, grown a step at
  a time in the frames' budget: where it grows a few rows of squares at a time, the looks it
  wants made one a step, placed a millisecond at a time, a tile's mesh a step). Its material is
  the atlas's (`wildsMaterial`): both sides lit as the ground is, each blade's tip stirring in the
  breeze (a `sway` for each vertex), and past 40 metres from the player everything sinking into
  the ground, gone by 56, so nothing pops in or out. How thick it grows follows the quality level.

The chunks also say how tall their trees, features and buildings are on each square, for the
cutaway. The minimap is painted from the same chunks.

### What flies (world/flyers3d.js)

Now and then (a try every 5 to 14 seconds, seven in ten coming to something, three flocks at
most) a flock of the land's birds flies by: songbirds and crows over the fields and woods, gulls
by the water, vultures circling high over the savannah, the badlands and the mountains, herons
over the marsh, parrots over the jungle, geese in a V over the tundra and the snow (`LAND_BIRDS`).
A flock comes from 95 metres off to one side and flies across, passing by near the player, or
circles a while over somewhere near them (vultures mostly do) before it goes; it's gone once it's
115 metres off. Each bird flies at its kind's height (songbirds 5 to 16 metres up, vultures 28 to
42) and speed, bobbing a little out of its place in the flock, its wings beating in time of their
own and, as much of the time as its kind does (a vulture nearly always), held out to glide. Each
kind of bird is one instanced mesh (a dozen or two triangles a bird, drawn whatever the number),
its wings beaten in the shader; so a sky full of birds costs a draw call a kind.

Over the wild lands wyverns hunt in (the mountains, the badlands, volcanic land and the snow),
a wyvern flies over now and then (a try every 40 to 110 seconds), 18 to 30 metres up; and within
420 metres of a dragon's lair, while its dragon's alive and not down on the ground to be fought,
the dragon circles over its lair's side of the player, 28 to 40 metres up. They're the creatures
as they're drawn on the ground (beasts/), flying: legs tucked up, neck out ahead, tail streaming,
wings spread wide, beating or held out to glide, leaning into their turns. A wyvern or the dragon
put out near the player (within 140 metres) to fight is seen coming down out of the sky to where
it is: one already flying about, if there is one, or from far up behind (`BeastAvatar.arrive`),
gliding lower all the way, then flaring, nose up and beating hard, and touching down facing the
way it will fight. It's where its battle's creature is all along; it's only drawn coming down.
Nothing in the air can be fought. Each player's game draws its own fliers, from its own random
numbers. A wyvern or the dragon is built a little each frame (2 ms) before it comes (`hatching`),
so the first of each of its looks, a tenth of a second or more to sculpt, stalls no frame; the
labs' and tests' `send` puts one up at once.

### Inside and out (app/game.js)

Each map is drawn at its own place in the 3D world (`MAP_ORIGINS`: the world outside at the
origin, the taproom 10 kilometres east, past the world's edge, upstairs 100 metres south of
that), so nothing of one (shadows, blood, sounds) is ever seen or heard on another; a
character's place on its map is offset by its map's origin. Only the map the player is on is
shown: the world outside and the town, or one floor inside. Going
through, the screen dips to black and fades back in over 0.45 s, the camera behind the player
the way they face. Indoors, the view (`setIndoors`) has a dark background and closer fog, a dim
warm light from above and the room's two lamps (for the taproom the hearth's fire and a candle
wheel; upstairs two red-shaded lamps), flickering. The two point lights are always in the
scene, out (at no intensity) outdoors, so that going in and out never makes Three.js recompile
every lit material's shaders.

**Getting buildings ready.** Every half a second, outside, the game looks over the buildings
that can be gone into: one whose door is within 22 metres of the player (or whose door they're
making for) is got ready: its plans made, then each floor built and each of its folk, one to a
piece of work, for at most 6 ms a frame, so it's ready well before the player's at the door. A
floor is built a step at a time too (interiors3d.js `buildingInterior`: its rooms and furniture
laid out, made into meshes, made ready to merge, merged), and each of its folk (CHARACTERS.md,
*Built a step at a time*). If
they're through it first, whatever's still to build is built at once. Once the player is 90
metres away (and outside), it's let go: its folk out of the battle, their characters and its
floors thrown away (built again if they come back); the plans are kept. Wenches and Ale is
built at the start and kept.

**Doors and stairs** (app/doors.js). Each end of each link has a box a tap's ray can hit (a
building's front door, the inside of the door, the side of the stairs, the stairwell upstairs)
and a glow round its edge (new doors, as settlements are laid out and buildings made, are picked
up by `sync`): a green ribbon with a softer band either side, drawn additively. A tap on
one (after enemies, before the ground) tells the player to go through; it glows for at least
1.2 s, and while the player's on their way, pulsing, then fades.

**The folk in the game.** Wenches and Ale's are built at the start, like the player and the orc
(their looks and clothes are `presets.js`'s `FOLK`), and every other building's as it's got
ready, each of the people whose place it is (docs/WAR.md M5: a cat folk's town's are cat folk,
named in their own tongue) and looking as their part, sex and seed have them (`characters/folk.js`, `folkLook`:
their height, build and face, their forebears' skin, eyes and hair, how they wear their hair and
beard, and what their part wears: the barkeep's apron, a wench's bodice and skirt, a patron's
tunic or kirtle, the madam's gown, a courtesan's lingerie in one of four colours, the priest's
white vestments, the guild receptionist's uniform, an adventurer's calling's arms and armour,
sheathed); the receptionist has the youthful look of a heroine of an adventure story, a young
woman with big bright eyes, a small nose and mouth and a soft jaw, and bright hair in twin tails
or a bob; all with less
hair than the player, as there are more of them, and nothing worn that never shows, lit but
casting no shadows. They have no name plates, can't
be tapped to fight (a tap walks up to them to talk), and show on the minimap as blue dots. Only
those on the player's map are drawn and animated; coming onto a map, everyone on it is put where
they are. Their acts and rests play their animations, and a sound: tankards clinking (at the top
of a toast, and softly as one's set down), ale pouring from a tap, a tankard thumped on a table.
In a smithy, each of the smith's three blows rings on the anvil and throws sparks off it; the
work hisses in the trough, steam rising; the bellows breathe and the forge's fire flares with
them (`view.flare`); and the grindstone rasps and turns while it's cranked (`interior.drive`). In
a temple, the priest's blessing chimes softly and a golden glimmer rises over the pews, and a
lit candle sends up a spark. In a guild, each of the receptionist's stamps thumps on the counter,
and paper rustles as she files a notice and as the adventurers read the board.

**Classes and resting** (core/roles.js). Everyone has a class (a role): the barkeep, a serving
wench, a patron, an innkeeper, the madam, a courtesan, the blacksmith and the apprentice, the
priest, an acolyte and the worshippers, the guild's receptionist, and adventurers (the player,
and those at the guild). A class has a title and five resting
animations, shared by everyone of it (their poses: actions.js `RESTS`, see
[CHARACTERS.md](CHARACTERS.md#resting)):

| Class | Its rests |
| --- | --- |
| Barkeep | wiping the bar, stroking his beard, leaning on the bar, arms folded, rubbing his neck |
| Innkeeper | wiping the counter, a hand to the chin, leaning on the counter, arms folded, rubbing the neck |
| Serving wench | wiping her brow, a hand on her hip, tucking back her hair, a curtsy, stretching her back |
| Patron (seated) | a toast, a long drink, a belly laugh, thumping the table, looking about |
| Madam | fanning herself, hands on her hips, touching her necklace, drumming her fingers, smoothing her gown |
| Courtesan | twirling her hair, a slow stretch, a hand on her hip, blowing a kiss, smoothing down her sides |
| Blacksmith | wiping the brow, looking over the work, rolling the shoulders, stretching the back, shifting the weight |
| Priest | hands folded in prayer, arms raised in praise, a bow of the head, the sign of the Hearth, hands clasped behind |
| Acolyte | hands folded in prayer, a bow of the head, looking about, the sign of the Hearth, a yawn |
| Worshipper (seated) | praying, head bowed, looking up, the sign of the Hearth, hands in the lap |
| Apprentice | wiping the brow, looking about, rolling the shoulders, a yawn, stretching |
| Guild receptionist | a cheerful wave, chin in her hands, a little bow, tidying the papers, tucking back her hair |
| Adventurer (the player, and at the guild) | stretching, looking about, rolling the shoulders, a yawn, shifting the weight |

The folk rest when the battle says (every 4 to 9 seconds while the player can see them).

**Beckoning.** A class can beckon (`beckons`: the courtesans). When the player comes into her
sight (on her map, within sight, with no wall between: so only through her doorway, from the
hallway in front of it), a courtesan turns to them and beckons them into her room (an "act"
event, `beckon`: `BECKON`'s timing), and the screen says so ("Gisela beckons you over"). She
does it once while they stay in sight, and again only after they've been out of it for 6 seconds
(`BECKON.again`), so walking up and down the hallway doesn't set her off at every step. Standing
her ground until she's done, she rests as the other folk do after. The
player rests after standing for 15 seconds (`PLAYER_RESTS_AFTER`) with no input (a tap, a click,
a key, the mouse wheel), no enemy in sight or after them, and no one to talk to: at once, then
every 4 to 9 seconds after each, any of the five but the last. Anything the player does eases
them out of it.

### Talking (core/dialogue.js, app/talk.js)

Tapping one of the folk (after enemies) walks the player up to them (the battle's `approach`),
and once there, a talk opens: a panel across the bottom of the screen with their name (as the
world named them) and title, what they're saying, and the player's replies, one button each
(or its number on a keyboard). Escape, the cross, walking off (any other order), getting more
than 4 squares apart, or an enemy in sight or after the player ends it. They stop what they
were doing and face the player until it's over.

A conversation is a tree (`TREES`, one for each class; `OWN_TREES` for folk with their own, by
id, such as the greybeard's siege story; and for folk who talk as another class does, `talk`:
the adventurers drinking at a guild's tables are patrons who talk as adventurers). Each node has what they say and the replies to it:

- **Lines**: one, or a few to pick from (never the same twice running), or groups for different
  moments (`{ if, lines }`: a stranger is greeted differently from someone they've met, and the
  madam knows if the barkeep sent the player). Words are filled in: `{player}`, `{name}`,
  `{fullName}`, `{title}`, `{place}` (the building they're in), `{town}`, and the given names of the folk
  there by their part (`{madam}`, `{barkeep}`..., and `{keeper}`: whoever keeps the rooms
  upstairs). What's upstairs (`if: { upstairs }`: anything, nothing, or which) chooses what the
  barkeep says of it, and whether there's a bed to ask for; an innkeeper has a talk of their own.
- **Replies** (`choices`: or another node's, `choices: "more"`, so a talk comes back round to
  what can be asked), each leading to another node (`next`) or ending the talk (`next: null`);
  with none to offer, just "Farewell."
- **Conditions** (`if`) show a reply, or choose lines: `met`, what they remember of the player
  (`flag`, `notFlag`), what the player knows from anyone (`knows`, `notKnows`), and `all`,
  `any`, `not`. Anything else (gold, a quest's state) is asked of the game (`check`), and holds
  until the game knows better.
- **Effects** (`do`) of a reply: `remember` and `forget` (theirs, about the player) and `learn`
  (the player's, known to every conversation after) are kept now, and saved with the character
  (save.js `saveTalks`: for a saved character only, set aside for another). Everything else is
  something done in the world, handed to the game (`onEffect`): buying (`{ buy: "ale", price:
  2 }`), paying, renting a room, a quest moving on (`{ quest: "orc", step: "accepted" }`). The
  world doesn't change yet: the game keeps the last 50 (`game.done`) for when it does.

**The guild's talk.** The receptionist is cheerful and a little flustered: she welcomes a
stranger to the town's branch of the guild, and signs the player up as an adventurer
(remembered, and the player learns `guildMember`: "Rank: Copper. Everyone starts at Copper,
don't pout!"), and tells of the quest board, the ranks (Copper, Iron, Bronze, Silver, Gold and
Mithril) and the other branches. The adventurers are wry and give advice ("Be nice to
{receptionist}. She decides who gets the good notices.").

**The courtesans' talk** (`TREES.courtesan`) is warm and teasing, all innuendo and nothing
explicit, and built to lead to things done in the world once the game does them. Each greets a
stranger, someone she's met, or someone she's danced with differently, and she offers:

- **Herself**: where she came from (one of a few stories), once, and whether she misses home.
- **What she offers**: her company for the evening (`{ hire: "company", price: 20 }`, and the
  talk ends as the door closes), a dance (remembered, so she teases about it after), or just talk.
- **What she's heard**: secrets from her callers, for a price (`{ pay: 5 }`, and the player
  learns `courtesanRumours`): the east gate, the miller's gold, the greybeard's friends at the
  keep, the ruins east of town, and the orc (which the player learns of, if they hadn't).
- **A favour** (once she's told of herself): a merchant keeps her mother's locket. Promising to
  get it back starts a quest (`{ quest: "locket", step: "accepted" }`); once the player knows
  they have it (`locketFound`, for the game to teach them when it gives them the locket), they
  can give it back (`{ quest: "locket", step: "returned" }`).

### Inside the taverns (world/interiors3d.js)

The rooms are built from their plans with the art kits' materials, five art pixels to the metre:
walls of plaster on a stone footing between timber posts under a beam, with windows of daylight
and curtained doorways; flagstones in the taproom and planks upstairs. In the taproom, the
tables with candles, tankards and plates, and benches; the bar, with tankards along its top, and
behind it two tiers of casks on a stillage, each with a brass tap, and shelves of tankards; the
hearth, a stone chimney breast with a mantel, logs and embers, three flames and a boar on a spit
turning slowly over them; a candle wheel; and the stairs, two metres wide, twelve steps and a
handrail rising 3 metres along the north wall. Upstairs, rugs, the counter with a velvet runner, a ledger, a
bell, a candle and a vase of flowers, a chaise longue and side table, the stairwell with its
rail, and four bedrooms with canopied beds (their drapes red or purple), washstands and chests,
lit by red-shaded sconces; at an inn, whitewashed walls, beds hung in green, blue and ochre wool
and linen, and plain glass in the sconces. Each floor is built by its style (`map.style`), each
taproom with its own walls (`map.finish`). Everything that doesn't move is drawn from the atlas, as
the buildings outside are (atlas.js `atlasVariant`: their textures lit as relief, what shines
shining, cut away in front of the player as below): a mesh for the walls and one for the rest, only
the daylight in the windows, the candle flames, the roast and the lights apart. That's 4 to 11
meshes a floor, where each material was a mesh of its own (23 to 43), and nothing painted for
them (the taproom drew with 79 draw calls in all, with the characters and the sun's shadows; now
42). The spit turns as one mesh, and each fire is one. What's painted, dyed or woven in gold or
silver inside is cloth (`cloth-gold`...: banners' devices, a rug's border), not metal.

A smithy has bare stone walls and beaten earth dark with soot; the forge, waist-high stone with a
bed of glowing coals, two flames and a hood narrowing to the chimney, tongs and pokers hanging
from its beam, and its fire the room's light; the bellows beside it, their nozzle into the
forge; the anvil on its stump, a glowing bar on it; the quenching trough, open, iron-banded; a
grindstone in its frame; racks of tools along the north wall, and of swords and a shield along
the east; the workbench with its vice and files; and the charcoal heaped in a corner, sacks by
it. In the smithy the town's music is heard as if through its walls, under the forge's crackle.

A temple has whitewashed walls between pillars, tall windows down both sides, and pale
flagstones with a red runner up the aisle to the dais: two broad steps to the altar, stone under
a white cloth bordered in gold, with candlesticks and a book; behind it the patron's statue, a
robed figure in white with arms held out in blessing and a halo in the god's colour, on a
plinth, their colours hanging either side. Each shrine is a niche of its god's colour with a
small white statue of them and three candles before it. There are pews with high backs, a stand
of votive candles in three iron tiers, stone basins of water on pedestals, and a great ring of
candles hanging over the nave. In a temple the town's music is hushed, far off.

An adventurers' guild has floorboards and ochre plaster walls with windows on two sides, and the
guild's banners, blue with a gold shield, either side of the counter and by the door. Behind the
counter, shelves of ledgers, scrolls in their pigeonholes and a strongbox. The counter is dark
wood with the guild's crest on its front and a blue runner along its top, and on it a bell, a
ledger, a stamp and its pad, a stack of notices and a quill in its pot. The quest board is a
framed board thick with notices, each pinned or sealed in red wax, some curling. The tables have
tankards, a map, dice and candles; the hearth has a fire and a great horned skull over it; a ring
of candles hangs over the tables. In the guild the tavern's jig plays as lively as in a taproom.

The flames are crossed quads with a shader of rising noise, drawn additively and flickering,
and embers rise from the hearth. The room is open above, and what stands in front of the player
is taken down, so they're always in view whichever way the camera looks: a strip 5 metres wide
from them to the camera (`INTERIOR_CUT`: the player's position, the direction to the camera and
the floor's bounds, set each frame by `cutFor`). In it, the walls (and what's on them: posts,
beams, lintels, doorway curtains, windows, sconces, the chimney breast and the door) come down to
their stone footing (built apart, and never cut), a whole square's length at a time, as each
square's middle is in the strip or not (the walls round the edge counting as the square inside
them), so a wall is never sliced along its length; and anything else, above head height (1.7
metres: bed canopies, the shelves over the barrels). Every other wall stands full height, so the
rooms keep their shape. Every interior material is drawn on both sides, and where a cut shows
the inside of something (a wall's end, a post), it's dark wood (`cap`), as if solid. `cutsAway`
does the same sums as the shaders, for tests. Wherever a wall has a gap of one or two squares,
it's a doorway, with a lintel and its curtains tied back at either side (`doorways`).

### The town (world/town3d.js, world/art)

The art kits build every piece of the town's layout in the art's world pixels, five to a metre,
facing south; each is turned about its middle to face the way the layout says:

- **Houses** (kits/house.js) in four styles, each house its own from its seed: whitewashed
  cottages under thick thatch (half-hipped or hipped, pitched over 50 degrees, their eaves
  rounded and their ridges a raised block with a scalloped edge), timber-framed houses (their
  upper floors jettied out 30 to 55 cm on a bressummer, with joists' ends and brackets under
  it), brick houses with stone quoins, bands and dressings, and stone houses with deep-set
  windows and pointed-arched doors. Barns and stables behind the houses are boarded, with wide
  doors. The layout says how many storeys each has (a village's mostly one, a town's one to
  three, a city's mostly two or three; a cottage has rooms in its roof, lit by dormers) and
  which trade a house on the market or a main street keeps a shop for (baker, butcher,
  greengrocer, potter, weaver, chandler, cooper, cobbler, apothecary), its front open over a
  counter of boards, its goods set out, the upper shutter propped up as an awning.

  A house is laid out as a builder would (a facade grammar, after Wonka and Müller's split
  grammars; its sizes the carpenters', and BlendBuildingCreator's, studied not copied): its
  storeys, then each wall split into bays, each bay given a door, a window or nothing (the front
  a door and a window on every floor, bay over bay; the sides and back fewer), then each opening
  let into its wall (a real hole, its reveal going back to leaded glass, glass with a glazing
  bar, or a dark opening with shutters, as the house can afford), dressed with a sill and lintel,
  shutters (painted on a better-off house, open at a slant), window boxes of flowers, a door's
  strap hinges and step; then the timber frame (kits/framing.js) fitted round the openings:
  sole plate and top plate, posts at the corners and between the bays, a rail at the sills,
  studs cut where the windows are, and in the solid panels braces (an upturned V in the lower
  panels, a St Andrew's cross under a window, a corner brace up top), or close studding on a
  rich house; then the roof (kits/roofs.js: gabled, hipped or half-hipped, with thickness, the
  fascia and soffit at its eaves, the verges' bargeboards, ridge and hip tiles, an old ridge
  sagging), the gables carried up under it (framed on a timber house, with a little window),
  the chimney stack (up a gable end outside, or through the roof) and dormers.

  Its weathering is painted on its corners: dirt splashed up the foot of the walls, shade under
  the eaves and jetties and in the reveals, streaks, moss on the roof where it faces north (as
  the house stands), and each house's limewash a little its own colour. A colour worked out at
  corners is blended between them, so a plain stretch of wall drawn as one face from its foot to
  its eaves would blend the dirt into the shade: one grey, a tenth darker than it's meant to be
  over the walls of 391 houses, and more than a little wrong over nearly half their area. So the
  weathering says where it turns (its `bands`: where the dirt fades out at 1.25 m, where the shade
  under the eaves begins 0.9 m below them, and just over the eaves, where it stops, so a gable
  isn't shaded all the way up), and every upright face half a metre wide or more is cut level
  there (Solid.face). The walls are then drawn within 2% of their weathering, 5% of their area
  more than a little out (the rest mostly timbers, too narrow and dark to be worth cutting), for
  15% more triangles; each people's weathering says where it turns too (their walls from 18 to
  51% of their area out to 7 to 18%, for 4 to 7% more). In the start town a frame draws 5 to 6%
  more triangles for it (the same draw calls), and building a piece takes about as much longer
  as it has more (the slowest, a cat folk's castle, about 20 ms rather than 16 on a desktop: the
  weathering, worked out for every corner, now reads its numbers without taking lists apart,
  which V8 didn't do for free). Most houses are 300 to 2,000 triangles (a two-storey timber
  house with a jettied front about 2,400).
- **Special buildings** (kits/landmarks.js), each from its piece of the layout:
  - **Taverns**, built as the houses are (timber-framed, stone or brick, as the tavern's seed
    says), one storey or two, with a wide door in the middle of the front. The tavern's name is
    painted in gold blackletter (UnifrakturMaguntia, kits/signs.js, loaded as a web font) on a
    board along the upper floor (over the door, on one storey), on a ground of oxblood, green,
    blue or black. Its sign hangs from an iron bracket by the door: the tavern's emblem
    (kits/emblems.js: 25 of them, a stag, a boar, bells, a crown, a rose, a ship, keys... one of
    them or as many as the name says) painted in gold on a coloured field in a gilt frame, the
    name on a scroll under it. A lantern hangs on the other side of the door, with barrels and a
    bench outside. *Wenches and Ale* is stone below and a jettied, timber-framed floor above,
    its sign a barmaid in a red bodice raising two foaming tankards.
  - **The adventurers' guild**: a two-storey hall of stone, timber or brick, 16 by 12 metres,
    its name on a blue board, its crest (a shield over crossed swords) hanging by the door,
    blue banners with gold either side, and a board of notices outside.
  - **The town hall**: the house it was, in its street's look (a cottage's made timber, for a
    storey above), with a wide door in the middle of its front up a stone step, "Town Hall" on a
    dark red board over it, the sign of the town's keys by the door, and a lantern either side.
  - **The keep**: a great stone tower, battlemented, a round turret at each corner under a cone
    of slate, a hipped roof inside the battlements, arrow slits and taller lights on every face,
    and a door of dressed stone up two steps between two long red banners, the crown's sign by it.
  - **The church**: a stone nave, buttressed, with tall windows, and a tower with a spire at the
    front, the Six's gilded sun of six rays on its top, and its patron's sign by the door (the
    patron's emblem: Aurelia's sun, Brannoc's stag, Ithriel's star, Morvaine's lantern,
    Seliane's rose, Dunmar's anvil).
  - **The smithy**: a stone workshop with an open shed over the forge, anvil and quenching
    trough, and its sign (an anvil and hammer) by the door.
  - A market hall on stone columns with stalls of produce beneath, and a windmill with a
    thatched cap and four sails.

  (KayKit's buildings were tried first, but they're toy-like: their doors are twice a person's
  height.)
- **Props** (kits/props.js) are built for the game in the same hand: a well (a ring of stone,
  two posts, a windlass and bucket, a roof of shingles), barrels of staves bellying out under
  iron hoops, crates battened at their edges, sacks tied at the neck, a handcart, a stack of
  logs, a pile of stone, a rack of spears, an archery butt painted in rings, and market stalls
  with striped awnings over counters of goods. (KayKit's models were the town's props before;
  next to the houses they looked like toys.)
- **Trees** (kits/trees.js) are grown for the game, nothing to download: seven kinds, each grown
  several ways (24 variants in all, each from its own seed, so the same every time), each tree
  where it stands turned its own way and a little bigger or smaller.

  | Kind | How it grows | Height |
  | --- | --- | --- |
  | Oak | A short trunk splitting into crooked, spreading limbs; a broad crown of lobed leaves; dark furrowed bark | 7 to 9 m |
  | Beech | A tall smooth grey trunk; boughs in a dome; bright oval leaves | 8 to 10 m |
  | Birch | A slender white trunk with black marks; arching boughs, drooping twigs, small pale leaves | 7.5 to 9.5 m |
  | Scots pine | A bare trunk, orange and scaly higher up; a flat crown of upturned boughs, needles in tufts | 8.5 to 10.5 m |
  | Spruce | Whorls of boughs in tiers to a point, drooping, needles in flat sprays | 7.5 to 9.5 m |
  | Lombardy poplar | Short boughs straight up, a column | 9.5 to 12 m |
  | Apple | Low and twisted, a round crown, apples among the leaves | 4 to 5 m |

  A tree grows as a trunk that leans a little and tapers from its foot; boughs round it
  (by the golden angle, or in whorls), as long as the kind's crown shape says for how far up
  they are, bending up to the light or down under their weight (resting on the ground rather
  than going into it) and crooked; and branches on those. The wood is tubes, their bark running
  up them; the leaves are cards (squares with a picture of a cluster of leaves on a twig, or a
  spray or tuft of needles) round the branches' ends, turned every which way (a spruce's lying
  level along its boughs), lit as if the crown were one rounded mass (their normals point out
  from its middle, and they're lit the same from either side), darker deep inside it, and each a
  little warmer or cooler. Their edges are soft where the picture's drawn multisampled
  (alpha-to-coverage, as the hair's and the banners' are), a plain cut-out where it isn't.

  **Rooted.** The trunk's foot (`rootedFoot`) swells out towards the ground, all round and more
  in a buttress over each root (2 or 3 for a birch, 5 or 6 for a beech, as the kind's `foot`
  says), and carries on 20 cm into the ground, so there's no edge where it stands. Each root
  runs on down from its buttress as one spur, broad and low along the ground (its top showing
  as a ridge in the earth), then steeply into it while still thick: going in gently, a round
  root shows as a long thin point, like a claw. The bark is darker and mossy low down, to the
  full colour 1.1 metres up (a birch's nearly black at the foot). Round each foot lies a patch
  of bare earth, moss and what's fallen (oak, beech, birch, poplar or apple leaves in their
  autumn colours, a few windfall apples, or pine and spruce needles and cones), fading into
  the grass: each kind's drawn on a canvas, laid a centimetre over the ground and drawn over it.
  These add about 240 triangles, so a tree is about 1,900 triangles on average.

  **Shadows.** The leaves don't cast shadows themselves: thousands of overlapping cards, each
  tested against its picture, cost more to draw into the sun's shadow map than everything else
  in the view (on the software renderer in the browser tests, a frame at the forest's edge took
  1.1 seconds instead of 0.35). Each crown's shadow is cast by its shell instead: 180 triangles
  round the middles of its leaf cards (as far as they reach in each direction, smoothed, so a
  spruce's comes to a point and a poplar's is tall and narrow), drawn only into the shadows
  (`onBeforeShadow` and `onBeforeRender` switch it on and off). Three.js draws a shell's far
  side into them, so a crown's own leaves, inside it, aren't in its shadow, while the ground,
  the buildings and folk under it are. Its own depth material (`dapple`) makes holes in it with
  a noise in the world, a few where the sun looks through the middle of a crown and more towards
  its edge, so the shadow is dappled with a broken, leafy edge. The bark casts its own shadow.

  The pictures (bark, leaves and litter) are drawn on canvases when the game starts (each kind's
  side by side on one picture), so every tree shares three materials. The leaves stir in a
  breeze (`TREE_WIND`: each part of a crown in its own time, more the higher up), and anything
  of a tree within 3 to 7 metres of the camera fades out in a dithered pattern, so the camera
  never looks through a wall of leaves. Planted (`plantTrees`), the trees are merged a tile of
  the map 24 metres square at a time, so the camera and the sun's shadows draw only the tiles in
  view (about 250,000 to 300,000 triangles a frame, shadows included, on the market square or at
  the forest's edge); the crowns' shells and the patches round the feet are one mesh each.

The world round the town, its trees too, is drawn a chunk at a time (world/chunks3d.js, above).

Textures are sized in metres too: bricks courses of 10 cm, slates of 15, stone courses of 35.
Each is painted (engine/painters.js) with how high each pixel stands as well as its colour:
mortar low between the bricks, a slate's lower edge over the next, the grain of the timbers.

**One material** (engine/atlas.js). Everything built (houses, landmarks, props) is drawn with
one Three.js material: every texture is a layer of one texture array (256 pixels square, 26
layers), painted in workers while the land is laid (asked for before they're done, the texture
takes theirs once they are, rather than painting them all again on the page: 1.4 s of it in
headless Chromium, about 5 s on a phone); each vertex says which layer it's drawn
from, and its colour (a plain material's colour, times its weathering) multiplies the layer's.
The kits still ask for their materials by name (engine/materials.js `material`), and a textured
one's own picture is painted only when it's first wanted (drawn, or asked for: `paintPicture`):
out in the world it's drawn with the atlas instead, so it never is. They were painted as the kits
first asked for each: the start town's while loading (28 pictures, 352 ms in headless Chromium;
then 14, 181 ms: the ground's and the tavern's insides; now 8, the ground's alone, the insides
drawn from the atlas too), the rest in the middle of building a chunk as the player first reached
another people's lands (57 in all: 1.1 s in Node, up to 118 ms for one). A bridge's planks are
painted as it's made.
Its heights are lit as relief (bump mapping: how the height the one read of the texture gives
changes to the next pixel, across and up), so walls and roofs have depth close up at no cost in
triangles. (It read the heights at the next pixels again: a frame of the start town took a tenth
longer in software rendering, for the same picture.) Glass (windows, leaded ones too; water in a
well or a pool; obsidian), iron, gold and silver, and slate shine (`SHINES`): a highlight where
the sun or a lamp catches them, and the sky reflected in them, more of it at a glancing look
(Fresnel, less so the rougher the surface: Karis's fit for phones), and that much less of the
sky's light taken in beneath. Glass mirrors the sky sharply; iron has a broad dull sheen; gold
and silver reflect in their own colour, their own paint half as bright; slate has a soft sheen,
mostly at a glancing look. What's painted, dyed or woven in gold or silver has a colour of its
own that doesn't shine (`paint-gold`, `cloth-gold`, `cloth-saffron`, `cloth-silver`; golden
fruit are `quinces`). A vertex's shine rides on its layer (256 times it, added: no more
kept for it), so everything's still one material; only what shines does any more work.
Everything that doesn't move is merged a
block of the town (32 metres square) at a time, so each block is a draw call or two, and only
the blocks in view (and in the sun's shadows) are drawn: a town of 23,000 to 39,000 triangles
of buildings and props. What's only worth drawing near (a timber's sides and ends, a band's or a
strap's: anything standing no more than 10 cm proud of its wall, whose front is drawn anyway)
is kept apart as it's built (Solid's near faces) and merged last (town3d.js `joined`: the mesh's
userData.far says where it begins), and a chunk more than 40 metres from the player draws only
what comes before it (chunks3d.js `DETAIL_NEAR`, `drawFar`): a third fewer triangles in the
humans' buildings from there, and nothing to see missing, those sides being thinner than a
pixel at that distance even on a phone. While it's built, `buildTown` also records how tall whatever stands on
each of the town's squares is (a
`heightMap`, read anywhere with `at(x, z)`; a building over the squares under it and its eaves,
as it's turned, not its turned box), for the cutaway.

### Each people's buildings (world/art/peoples)

Every people builds with the same engine as the humans (engine/solid.js: walls with real
openings, lathes, lofts, tubes, the one atlas material and its weathering) and the same pieces
of a layout (a house of a type and size, a landmark, a structure, a wall, a tower, a gatehouse,
a prop), each people's kit (`PEOPLE_KITS`, `builderFor`) building them its own way; the humans'
are the kits above. What's turned on a lathe, run along a tube or lofted is shaded as the round
thing it is: each corner has its own normal (straight out from a rod's path, tipped along it as
far as it narrows; round and up a lathe's outline), so huts, domes, thatch cones, pots, rods,
spikes and ribs look round rather than cut in facets, at no cost. Where an outline turns sharply
(over 40°: a hut's wall meeting its roof) it keeps its edge, and what's meant to be faceted says
so (`smooth: false`: pinnacles, needle spires, the dark elves' pyramid roofs and obsidian
shards, the orcs' hide pyramids). A spike let into a wall, a spout, a post on what it stands on
has only its outer end capped. Each builds from its seed, never the same twice, within a budget of
triangles (a house under 6,000, a landmark 9,000, a special place 14,000). A solid's faces work
out each corner's texture position and colour once, however many triangles it's in, and keep
their corners as they're drawn, 32-bit floats in room that grows (`Floats`), not lists of
numbers turned into them after: the same bytes, a quarter less time building a capital's and
a city's chunks of each people, and less garbage to collect.

- **The cat folk** (cat.js, cat-landmarks.js, cat-places.js), after the Sahel's mud-brick
  (Djenné, Timbuktu, the Tiébélé compounds): round huts and beehive huts of mud under thatch,
  granaries, figure-eight houses, flat-roofed block houses and Sahel town houses with timber
  spikes (toron) and pinnacles, walled compounds, their walls battered and whitewashed in bands;
  a court tavern, a Djenné-style temple, a smithy with its clay furnace, a domed guild hall, a
  town hall with stone cats, a kasbah keep and a mat-roofed market; the sun temple, pride rock
  and the watering hole; a kasbah castle, mud walls, gatehouse and bastions.
- **The orcs** (orc.js, orc-places.js): bow-sided longhouses of hide on battered basalt, round
  hide huts on rings of stone, basalt block houses and hide tents; a grog hall, a broch temple, a
  great forge, the war council's and chieftain's halls, a broch keep and a loot market; the war
  totem, the skull pit and the fighting pit; a ring-fort castle, a palisade of sharpened stakes,
  a gate and lookouts; skulls, horns, iron spikes and war-red banners.
- **The lizard folk** (lizard.js, lizard-places.js), after the Maya's houses and temples:
  apsidal marsh huts, deck houses and saddle-roofed clan houses on stilts, reed-arch halls, palm
  thatch and bamboo; a reed-hall tavern, a stepped temple, a forge shed, a spirit house, a
  palace hall, a platform keep and a floating market; the ziggurat, the hatchery and the serpent
  pool; a temple-fortress, a serpent wall, a gate and a lookout; serpents' heads and frets.
- **The elves** (elf.js, sylvan.js): ground houses and pagodas of pale stone under petal roofs,
  houses round great trees and up in their canopies; a hall of leaves, a colonnaded temple, a
  pavilion smithy, a stave-roofed guild, a council tree, a tiered keep and a market under leaf
  canopies; the moonwell, the tree hall and the starwatch; a tree castle, wave-topped walls and
  an ogee gate. A piece can grow great trees with the town's.
- **The dark elves** (darkelf.js, sylvan.js: the same flowing lines, turned sharp): thorn
  houses of black stone and charred planks under swept hips with fins and fangs, spire houses
  and pods; a hall tavern with a spider on its sign, an octagon temple gripped by spider-leg
  buttresses, a smithy, a stepped-gable guild, the Archon's hall, the Black Tower and a
  web-strung market; the spider shrine, the obsidian spire and the shadow gate; a ring castle,
  thorn walls and a gate; faerie fire violet in their lancets and along their eaves.

Each has its own well and stalls on its market (props.js), and builds its insides of its own
stuff (world/interiors3d.js: the cat folk's mud and laterite, the orcs' basalt, hides and logs,
the lizard folk's lime and bamboo, the elves' marble and heartwood, the dark elves' black stone
and charred planks), lighting its lamps its own way (firelight, pale moonlight, violet) and
dressing its walls (sun discs, horned skulls, a Maya fret, a vine with moon buds, obsidian fangs
and webs).

**Their trees** (kits/trees.js, `HOME_TREES`): in each people's homeland most of the trees
(seven in ten) are their own, and in their settlements three in five: the cat folk's acacia (a
short trunk forking into climbing limbs, spreading level at the top in a flat umbrella), the
orcs' ironbark (squat, blasted and twisted, a few rust-red leaves left on it), the lizard folk's
weeping willow, the elves' silverbark (tall and straight, pale as birch without the black, its
leaves gold-green) and the dark elves' nightspire (a spruce's tiers, taller and narrower, black,
its needles violet). They're grown by the same rules as the rest, three ways each.

**Their war camps** (camps3d.js, peoples/camp.js): the humans pitch ridge tents of canvas in
their colour; the cat folk low domes of matting banded with ochre, a mat on forked posts over
the door; the orcs cones of hide on poles crossed above them, a horned skull lashed at the top;
the lizard folk palm thatch on decks of planks on bamboo legs; the elves leaves of green cloth, a
silver rib along each; the dark elves steep violet and black pyramids, a spike at the top and
silk strung over the door. Each people's tent is built once and copied.

See them all at `building-lab.html?people=cat&show=street` (or `landmarks`, `structures`,
`insides`, `castle`, `place`, `village`..., `home` for the middle of their homeland, `camps` for
every people's camp).

### Characters in the world (world/avatar.js)

An avatar is a character (characters/character.js) kept in step with its actor in the battle.
The game shows everyone between where they were at the last two battle steps, so they move
smoothly at any frame rate, and the avatar follows that on a spring (critically damped, of
stiffness 12 a second). The spring rounds off the corners of the battle's ways (and its steps
aside round others), so a sprint runs in smooth lines; it trails
by under a third of a metre walking and about a metre and a quarter sprinting, and catches up
as the character slows to arrive. The walk's stride follows how far the avatar really moved, and
it turns smoothly to face the way it's going (standing or attacking, the way its actor faces). Characters in the game grow only part
of their hair (the quality level's share, in fewer, wider strands: at the game's distance it
looks the same), which roughly halves their triangles.

**Posed as often as they're seen.** Posing a body (the walk, what's layered over it, the feet on
the ground and the hands reaching) is most of what a character costs a frame, so it's done only
as often as it can be seen to be (`Avatar.every`, `posingEvery`, from `View.heightOnScreen`: how
tall it looked when the world was last drawn, or out of view): the player every frame, and anyone
150 pixels tall on the screen or taller; smaller, every 2, 3 or 4 frames; out of view, every 8,
and at once when it comes back into it. Anyone moving fast enough for it to show is posed more
often: a foot on the ground mustn't slide more than a pixel and a half with the body between
poses, and in a blow, a flinch or a fall the hands count as going 4 metres a second, so a fight
is posed every frame unless it's tiny. Everyone follows their actor every frame whatever; a
body's posed for all the time and way since it last was. One that casts a shadow (a player's) is
never taken to be out of view. Creatures are posed every frame: they cost 10 to 40 µs. They're
drawn only in view, and the wight lord's cape is blown about only in view (WILDS.md, *Drawn
only in view*).

**Fewer triangles from afar.** By the same measure, anyone but a player is drawn with a quarter of
its body's and outfit's triangles under 140 pixels tall, and in full again over 170
(`Character.fitDetail`, characters/lod.js, described in [CHARACTERS.md](CHARACTERS.md#performance)):
the same vertices, pictures and bones, a second list of triangles made once for everyone in a
worker.

Attacks, flinches and falls (characters/actions.js, described in
[CHARACTERS.md](CHARACTERS.md#fighting-actionsjs)) are started by the battle's events: an
`attack` event starts the weapon's attack (in any of its five ways but the one it last used),
timed so its blow lands when the battle's does (a kick with a weapon in hand leaves the hands on
guard); a `draw` event draws the weapon from where it's put away with its flourish, or puts it back,
with its sound as the hand takes it or lets it go (a blade's ring leaving its scabbard and the click
of its hilt going home, something slung off the back or taken from the belt, knuckles cracking);
a character only stands on guard with its weapon out; a
`hit` makes the target flinch in the way the attack's `reaction` says, from the side the blow came
from, flushes their skin red for a moment and shows the damage; a `death` makes them fall away
from the killing blow, lie still for 4 seconds and sink out of sight until they come back.

**Everyone but a player** has their garments drawn all at once, one mesh with one picture of
the whole outfit (docs/CHARACTERS.md, "Equipment"), so a soldier in their people's uniform is 12
to 17 draw calls rather than 21 to 26. A player's own are drawn one by one: they change what
they wear.

### The paperdoll (app/pack.js, world/view.js)

The pack's Gear tab shows the player themself in the middle of its slots, drawn live
(`View.renderPreview`): while it's open, the world isn't drawn. It was drawn once as the pack
opened, into a picture half as sharp, which is shown behind the panel, still and dimmed. Then
each frame the player alone (their character and the lights on a layer of their own, `PREVIEW`)
is drawn into the paperdoll's box, from in front of them, framed on the whole box (as much of it
as isn't scrolled out of sight: a scissor, and the camera's view offset), without redrawing the
shadows. So what they wear shows at once as it goes on, walking on the spot, and dragging across
them turns them round. The panel's clear there, its ground drawn round the box.

### Effects (world/effects.js)

Arrows, bolts and fireballs fly from the attacker's hand to the target's chest (arrows arcing a
little), bolts and fireballs leaving trails. Where each blow lands there's a burst for its
reaction: sparks for cuts and arrows, dust and a flash for blunt blows, fire for fireballs, a
swirl of violet light for arcane bolts. Arrows stick in whoever they hit for a couple of
seconds, or, where they made a wound, until it heals (no more than eight in anyone: the oldest
go).

**Five looks.** Fireballs, arcane bolts, heals and stuns each come in five looks (`LOOKS`), all
plainly what they are but none quite like another, and chosen like the attacks' ways
(`core/variety.js`): any at first, then any but the caster's last. A fireball may be a blaze, a
roaring red one (bigger, a deeper whoosh), a small bright comet with a long tail, one spiralling
round its path, or a smouldering one trailing smoke; a bolt an orb, a spark jittering about its
path, a pulsing one, two balls circling each other, or a streak drawn out along its path. Each
bursts where it lands in its own colours and size, and its whoosh is pitched to it. A spell is
cast and lands in the same look: the light gathering in the hand is in its colours.

Every spark, puff, drop of blood and flame is a particle in one of two fixed-size buffers (one
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
red for blood, green for bruising, blue for charring, alpha for cuts. It's made at the first blow
and let go once they're all healed (or back to life): till then they're drawn with one texel of no
damage, shared by everyone, rather than 1.3 MB of GPU memory and 1 MB of the page's each, most
never struck (the starting town's 8 who can be wounded: 67 textures drawn with, now 60). Each
wound is painted in 3D:
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

Spells gather light in the caster's left hand as they're cast (in their school's colours; a
heal's or a stun's in the look it'll land in), and each lands in its own look, grander the higher
its tier (world/spellfx.js: docs/MAGIC.md, "How spells look"). A heal lands in green light round the character and a
ring (or two, one after the other) spreading over the ground: sparkles swirling up round them, a
fountain thrown up from their feet, a tight spiral column, petals of light falling from over their
head, or a white flash. A stun lands in a flash, and stars circle the stunned character's head
(always facing the camera) until it wears off: three gold stars, four quick ones in a whirl, a
crown of five small gold and white ones, two big comets on a tilted circle, or three lilac ones
on a wobbling halo.

### The minimap (app/minimap.js)

The map the player is on from above, north up, in the top right of the screen under the menu
button (a canvas, a third of the screen's width on phones, up to 188 pixels): out in the world,
the 128 metres round the player; inside, the whole floor. Each square is coloured for its ground
(grass in its land's colour, road, cobbles, soil, courtyard, water, bridges) or what stands on it
(roofs over buildings, blue-grey for the tavern, church and other landmarks, props, trees), with
a little variation from square to square; the buildings get a dark edge and a light ridge and
the trees round crowns, and the land's features marks of their own (boulders grey, fallen trees
and walls lines, bushes dark green). That's painted four pixels to the metre: the town once, and the world a
patch 192 metres square at a time round the player, the town's picture laid in it and the other
settlements' buildings and props painted over their ground the same way. Once the player's 16
metres from the patch's middle, the next is begun, as far ahead of them again, and painted a step
at a time (a chunk's squares, the town, a settlement, a chunk's trees: at most 2 ms a drawing),
then shown in its place, well before what's shown would reach this one's edge (only a leap across
the world paints one at once). Painting a whole patch in one frame was 6 to 13 ms on a desktop,
several times that on a phone, every 32 metres or so. Each frame (at most 30 times a second)
draws it scaled to fit, then what the camera sees (the ground under the screen's corners), where
the player is going, the enemies (red dots, the target ringed), an icon over each building the
player has gone into, and the player (an arrowhead pointing the way they face). A tap on it walks
the player there, or fights an enemy within 12 pixels of the tap; a double tap runs; holding it
(0.55 s, without moving) opens the world map. Inside, each floor is painted from its plan: the
floor, walls, furniture in its colours, the stairs' treads, round barrels, the hearth's fire and
the doorway; only those on the same floor as the player are shown.

**The icons** (`app/mapicons.js`) are only over the buildings that can be gone into, and only once
the player has been inside (a house that can't be entered never has one): a round dark badge
rimmed in the colour of what it is, with its sign: a foaming tankard for a tavern (amber), an
anvil throwing a spark for a smithy (steel), a temple's columns under its pediment for a temple
(white and gold), crossed swords behind a blue shield for an adventurers' guild (gold), crossed
gold keys for a town hall (red), and a jewelled crown for a keep (violet). They're
drawn on a canvas from paths on a 24-unit grid, the same on the minimap (22 pixels), the world
map (24) and its key.

**What the player's found** (`core/explored.js` `Explored`): the buildings they've gone into (by
key: marked the first time they cross into one of its floors) and the chunks of the world they've
set foot in (64 metres square; the chunk they're standing in is marked as they go, out in the
world). The chunks are a bit each, 128 by 128 of them in 2 KB; kept with a saved game in
`pellagos.explored` (`{ created, seed, entered, visited }`, the chunks as base64), for that
character only, as the talks are.

### The world map (app/worldmap.js)

Held on the minimap (or M on a keyboard), the whole screen becomes a map of the world, the game
paused under it, until it's closed (the cross, Escape, or M again). It opens on the player, about
900 metres across the screen's shorter side; drag to look about, pinch or scroll to zoom (from a
quarter of a metre to a pixel out to the whole world), or use its buttons: where you are, zoom in,
zoom out. A key in the corner shows the four icons and the fog.

- **The land** is one picture of the world's plan, four pixels to a cell (32 metres), each cell in
  its land's grass colour as the minimap has it, shaded by the hills as if lit from the
  north-west, with the seas, lakes and rivers; the roads between the settlements over it.
- **Nearer in** (4 metres to a pixel or closer), each chunk the player has been in is shown as
  the minimap paints it, every square of it: the ground, water and bridges, the town and the
  settlements' buildings, props, trees and the land's features, at two pixels to the metre.
  They're painted as they come into view, six a frame (the rest next frame), and the last 240
  kept while it's open. Closed, it lets go of what's painted again in a frame or two (`rest`):
  all but the last 48 of them, the fog's layer and its own pixels, 25 to 30 MB it used to keep
  the whole game.
- **The fog** lies over every chunk the player hasn't set foot in: opaque, cloudy (a tiling
  tile of soft noise in the fog's colours, moving with the map as it's dragged), with the chunks'
  square edges. Nothing of the land shows through it; it lifts off a chunk the moment the player
  walks into it.
- **Over it**: the names of the settlements the player has been in (20 metres to a pixel or
  closer), the icons over the buildings they've gone into (6 metres to a pixel or closer), and
  the player, pointing the way they face (inside, at the building they're in).

A redraw waits for the next frame, or 50 ms if the browser has no frame coming (as when nothing
else on the page is changing, with the game paused).

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
- **Spells**: a rising chime casting a heal and a warm chord as it lands; the bolt's crackle
  casting Stun and the other spells (a fireball's whoosh for fire's) and a zap and warble as a
  stun lands.
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
while the page is hidden, and off (suspended) when turned off in Game options; turned off from
the start, the browser's sound isn't started at all (taps don't start it), so it isn't kept
working on silence, until it's turned on.

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
(SVG, 264 pixels across, kept on the screen) opens round them, cut into eight slices like a
compass: N, NE, E, SE, S, SW, W and NW (`DIRECTIONS`). Keep holding and flick: as soon as the
finger is 30 pixels from where it opened, the slice it's in is tried, lit gold if it's used;
letting go before then does nothing.

**Two sides.** S (`FLIP`) turns the wheel over: flicked into, the wheel's other side (wheel two,
and from there back to wheel one) opens again under the finger, to flick from there. Its hub
says which side it is. The other seven slices (`PLACES`) hold what the player's put there.

**What's on them.** The player has two wheels to set, each with two sides (`SETTABLE`):
- **Their own** (held on themselves): the heals and the spells cast on oneself or a friend
  (docs/MAGIC.md), and things from the pack to use (a healing draught, a hot meal, an ale: `item:potion`...), each showing how many
  there are, and greyed out once none are left.
- **An enemy's**: the elements' spells, Stun, and once learnt Hold and the tomes' spells cast at
  enemies, a power strike and an aimed shot (a blow for another kind of weapon than the one in
  hand is greyed out).

A soldier of a people not friendly to the player's has a wheel of its own, with just Fight
(picking a fight with them), and no other side.

A new character's wheels have Vigor at N on their own, and Burn (N), Hurt (NE), Rumble (NW),
Blister (E) and Stun (W) on an enemy's (`WHEELS`); everything else starts empty, until the player puts something there in **Game
options, Action wheels** (app/wheelsetup.js). There, tabs choose whose wheel and which side;
the wheel's drawn as it opens in play, and tapping a slice lists what can go in it
(`assignable`): "Nothing", and what's been learnt and is carried. Tapping S turns it over, as
flicking it does. What's on the wheels is kept with the character (save.js `pellagos.wheels`),
and read back safely (`readWheels`: only what goes on each wheel, in its seven slices). A skill
ranking up with an ability says to put it on a wheel.

Each action (`ACTIONS`, or `item:` and a thing to use: `actionOf`) has an icon (app/icons.js:
SVG, in colours that say what it does: a glowing green cross for Vigor, gold stars round a violet
dazed head for Stun, every spell its own (app/spellicons.js); a red draught, a steaming bowl, a frothing tankard). The icons' gradients
are put in the page once, where every icon finds them (`useDefs`).

While a slice is cooling down (a spell's own cooldown, or a blow's own twelve seconds), it's
greyed over as much of it as the cooldown has left, the grey drawing back as it passes. A flick
at a greyed slice, an empty one or one that can't be used flashes it red and is refused. The
game plays on while it's open; a second finger (a pinch) closes it.

## The screens (main.js)

1. **Loading.** The loader (app/loader.js) downloads everything listed in `app/manifest.js`
   (made by `npm run build:manifest`, which follows the game's imports, and checked by a test),
   sixteen files at a time (in one round trip over HTTP/2 or 3; over HTTP/1.1 the browser keeps to
   six at a time itself, so asking for more costs nothing), reading each as it arrives. The bar
   shows the bytes downloaded out of the
   total (the files' sizes on disk, which is what arrives, whatever compression the server uses),
   and each group of files has its own row and bar: the 3D engine, the game's code, the body and
   its shapes, its skin details, and the props. The data is kept in memory and handed
   to the character kit and the model loader from there; the code is imported from the browser's
   cache. Then the last part of the bar is starting the 3D view and unpacking the body; the skin
   atlas is worked out in a worker meanwhile, and the title doesn't wait for it (making a
   character or playing does: CHARACTERS.md, *The skin atlas worked out elsewhere*). Nothing
   before the loader imports Three.js, so the engine's download is counted too. Debug mode asks the
   GPU's name only once it's shown: asking waits for everything the GPU's been given (over a second
   of the start in software rendering).
   The service worker (`sw.js`) checks every file with the server once for each page load: the
   page's imports straight after the loader (13 levels of the code, a round trip each) come from
   the copies it's just checked, rather than asking again. A reload checks everything afresh, so
   an update shows at once, whole. Any host that says when a file last changed answers "not
   modified" for those that haven't, the game's own server (`npm start`) too. With 100 ms added to
   every reply (a phone's 4G), to the title screen on a repeat visit: 8.7 to 9.1 s before, 6.1 to
   6.2 now over HTTP/2; 10.8 to 11.5 before, 7.7 to 7.8 now over HTTP/1.1.
2. **The title.** Continue with the saved character, or make a new one (which asks before
   replacing a saved one), join a world someone else has opened (its code: docs/WAR.md M11), and
   the debug mode switch.
3. **Making a character** (app/creator.js): the character stands on a plinth, lit from the front
   and edged in blue light from behind, while the panel beside it (below it on an upright phone)
   changes them. The camera frames what each tab changes: the whole body, the face close up, the
   head and shoulders for colours and hair. The body tab starts with their people (human, elf,
   dark elf, cat folk, lizard folk or orc: characters/peoples.js), which makes them one of that
   people, their own parts on and their skin tones to choose from (app/heroes.js
   `heroOfPeople`); they start in one of their people's towns. The weapon step lists the eight weapons (spiked boots
   among them) and a switch to wear spiked boots with any other, showing how their damage mixes.
   It shows the weapon chosen drawn with its flourish, then held on guard and swung every few
   seconds (in spiked boots too, a kick every other time). The hero's `boots` is saved with them.
4. **Playing** (app/game.js): building the world, with a progress bar for each part (the ground,
   each piece of the town, the characters, compiling every shader before the first frame), then
   the game. (The loading screen is drawn before the world starts to be built, so a tap on
   Continue shows at once; if getting the world ready fails, it says so, with Back to the title
   and Load afresh.) The world's planned while the skin atlas may still be being worked out in the
   skins worker, and waited for only once the characters are built; the buildings' atlas is
   painted in workers while the land is laid, and not painted again on the page (the ground's
   undergrowth asks for it first); and everyone built at load (the player, anyone else playing,
   the orc; the tavern's folk are built once it's started: below) is built a step at a time, as
   they are in play, so that each one's skin is painted in the skins worker while the rest of them
   is built (CHARACTERS.md, *Skins painted elsewhere*). In headless Chromium on "high", from opening
   `?play` to playing: the page's own work 11.7 to 13.5 s before, 9.7 to 10.4 s now; building the
   world (`Game.build`) 7.4 s of it before, 4.2 to 4.7 s now. A tap walks; a press and hold on the player or an enemy opens the action wheel (flicking down turns it to its other side); a second tap within 350 ms and 60 pixels of the first (going by when
   the taps happened, so a slow frame between them doesn't matter) turns it into a run, as does
   a Shift-click. A drag turns the camera round the player (and tilts it). A swipe up that
   starts on the player (40 pixels up within 600 ms, mostly up)
   sends them straight ahead the way they face, running (an `ahead` order), with the ring where
   they'll stop; blocked straight away, it's refused with a sound. The heads-up display
   (app/hud.js) shows the player's name and health in the bottom left corner (the zoom buttons
   in the bottom right), with an orange stamina bar under the health bar while stamina isn't
   full, "Out of breath" when a run
   ends for want of it, the minimap, bars over the other characters (the target's lit red), and
   the damage each blow does.
5. **The menu** (the menu button, or Escape) pauses the game (unless others are playing in the
   world too): Resume, Invite others (the world opened to others: a code, and who's come),
   Game options, or back to the title. **Game options** has a switch for the minimap, a switch that turns all the sound
   on or off, and a slider (0 to 100%) for each bus: sound effects, environment and music (a
   sound plays as the first two are moved, to hear how loud). Back (or Escape) returns to the
   menu.

If the browser takes the picture away (as phones do when short of memory, or switching apps), the
game pauses and says so ("The picture was lost…"); when it's given back, what was drawn into (the
light the materials reflect, the shadows) is made again and the shaders compiled again, and the
message goes. A frame whose work throws an error is told once in the console, and the world is
still drawn; a piece of a settlement that fails to build is left out, the rest built without it.

The character is saved in the browser's local storage as `pellagos.save`: `{ version, hero,
seed, created }`, where `hero` is `{ name, shape: { macro, details }, look: { skin, eyes, hair },
weapon }`. Settings (the minimap and sound switches, the three volumes, debug mode and its controls) are in
`pellagos.settings`; what the character's found of the world, in `pellagos.explored`. A save of another
version, or one naming a weapon the game doesn't know, is ignored rather than misread; if the
browser won't store anything (private browsing), the game still plays, it just forgets.

## Debug mode

The switch on the title screen turns on an overlay (app/debug.js) on every screen, until it's
switched off (in the game, under the minimap). It folds away to just the frame rate. It shows:

- the frame rate, the screen's refresh and the most the quality level draws, a graph of the last
  120 frames' times (green under a sixtieth of a second, amber under a thirtieth, red over), and
  how long each frame's update and drawing take on the CPU;
- what was drawn: draw calls, triangles, points; geometries, textures and shader programs in
  memory; the quality level, pixel ratio and drawing buffer size;
- the GPU (where the browser says) and how long it takes to draw a frame (`world/gputimer.js`: the
  browser's timer queries, `EXT_disjoint_timer_query_webgl2`, where it has them, most desktop
  browsers and few phones yet; each read a frame or more later, once the GPU's done, never waited
  for, and only while the overlay's shown), the JavaScript heap (Chrome), the screen, cores and
  memory;
- the battle: its time, how many steps each frame ran, projectiles in flight, and each character's
  place, hit points, stamina and what it's doing (with its speed, running);
- how much was downloaded and how long each group took, and how long each part of the world took
  to build.

Its controls change the quality level, the render scale (drawing fewer pixels), whether the sun
casts shadows, and show the squares characters walk on (blocked ones red) with everyone's path
(out in the world, the 160 squares round the player, shown afresh as they go).

## Performance

A frame draws the town (the blocks of it in view: a draw call or two each), the ground (one draw
call) and two characters (a body, garments and hair each, about 35,000 to 45,000 triangles at
the game's hair detail), and again from the sun for shadows. In the taproom there are nine
characters (the folk casting no shadows): about 220 draw calls and 630,000 triangles; only the
characters on the player's map are drawn or animated. The tavern's folk aren't built before
the game starts (they were about three seconds of loading on a desktop computer): only seen
inside, they're built as any other building's folk are, a step at a time from the start
(`tavernFolk`), with whatever time's left after any building the player's coming near and only
while none is (so that its folk's skins aren't kept waiting behind theirs in the skins worker),
and whatever of them isn't built yet is built at once if the player walks in first. In headless
Chromium on "high", from opening `?play` to playing: 14.0 to 18.2 s before, 10.9 to 14.3 now.
Anyone who comes into view while playing (soldiers,
the folk of a building near, the wild's people-shaped creatures) is built a step at a time
within the frames' budget (CHARACTERS.md, *Built a step at a time*): the longest step 10 to 40
ms on a desktop, where each was one piece of 300 to 800 ms. Their skins are painted meanwhile in a
worker (CHARACTERS.md, *Skins painted elsewhere*), so a town's guards are all out in about 4 s of
frames and a tavern's folk in about 3 (headless Chromium on "high"). Soldiers and creatures are
drawn the nearest the player first (`#nextEnlistee`): one begun further off is put by for one
nearer, and taken up again after, and one waiting on its skin lets the next nearest be built
meanwhile, so an enemy by the player isn't left undrawn while guards across the town are built.
Someone still being built when the player comes onto their map is put where they are when
they're drawn. A beast's body is sculpted and its pieces folded a step at a time too, the first
time each of its kind's three looks is wanted (WILDS.md, *Built a step at a time*): about 70 ms
(up to 310) in one piece before, now steps of half a millisecond (a few longer, up to 18: the first built, its code compiled then), then kept. On phones the quality level draws
fewer pixels and thinner hair and uses smaller textures, and debug mode shows what each costs.
With the world round the town, in the browser tests' views a frame makes 80 to 150 draw calls
and draws 180,000 to 260,000 triangles, in the town or out of it, shadows included (the world's
trees are culled one by one, so only those in view are drawn). Starting as each people, on a
phone's quality, a frame is 70 to 95 draw calls and 160,000 to 200,000 triangles in their town
(the elves' about 390,000, among its great trees), and 85 to 105 draw calls and 220,000 to
350,000 triangles out in their homeland. Looking level towards the horizon shows more of the world
(an orc's town: 136 draw calls and 300,000 triangles); looking up into the sky, less (about 100
and 240,000). The sky's dome is one draw call; the birds one a kind flying; a wyvern or the
dragon in the air about 18,000 triangles in seven draw calls, casting no shadow. A chunk is
drawn a step at a time within each frame's budget (the longest step a few milliseconds on a
desktop): walking across the world, no frame's streaming takes over 8 ms there. The camera sees no further than
150 metres (the fog's all there is by 130).
Everything that can be is built once: the town is merged, shaders are compiled while loading
(and a character, creature, wyvern or dragon that comes later has its compiled before it's first
drawn, hidden till then: `View.prepare`, in the background where the browser can, so a kind not
seen before doesn't stall the frame it appears in; the birds each have their own colour from the
start, so their shader's the one compiled while loading), particles reuse two buffers (uploaded and drawn only as far as the highest one alive, and not at all with none: they were 192 KB a frame, 6,000 points drawn, whatever was alive), blood on the ground is one instanced mesh, and projectiles and
effects add no lights. Battle damage costs a texture lookup or two a pixel on each character,
and a small texture (a megabyte) each, uploaded again only when a blow lands or a wound heals.
Each frame works out the place in the world of only what's shown (`View #updateShown`: the
scene's own update is off), not the floors and folk of the buildings got ready near the player,
hidden till they're gone into: 1,300 of a town's 2,200 nodes, 0.52 ms a frame down to 0.10 in
headless Chromium. The bars over the others' heads are placed only for those who have one, from
where the canvas is on the page, kept till it's resized (`View.toScreen`): reading it after a
bar's been moved made the browser lay the page out again, once for everyone in sight, every frame
(5–6% of a steady frame's JavaScript; now under 1%). Characters are posed only as often as
they're seen, each pose cheaper (see *Characters in the world*): a frame's JavaScript in headless
Chromium at 1280 × 720, the median and the 90th percentile, went from 2.3 and 4.1 ms to 1.3 and
2.1 in the town, 2.6 and 4.7 to 1.9 and 3.0 in the taproom (nearly everyone there's big on the
screen: that's the cheaper poses), and 2.3 and 5.9 to 1.4 and 2.4 walking out of the town.

## Testing

- `test/setpieces.test.js`: settlement layouts (farmsteads, hamlets, villages, towns, cities and
  capitals, 50 of them): the same for a seed, more built the bigger the place, a tavern in every
  hamlet and bigger, and a tavern, church, smithy and guild in every village and bigger, round the
  market, each with an id of its own, taverns named once each, a farmstead's one farmhouse,
  every street joined to the market and every way out, every house turned to face its street
  (at over 40 angles) with its front walked up to from the market, no building on another or on
  a street, each blocking the squares under it and hiding what's behind it (props not), main
  streets leaving the ways asked; the exact sums matching Math's; and castle layouts.
- `test/world.test.js`, `test/combat.test.js`: the world's layout and pathing on many seeds,
  what hides what's behind it (houses, landmarks, trees) and what can be seen over (props), and
  the battle: walking open ground in a straight line (facing one way the whole way, never more
  than a centimetre off the line), keeping clear of walls and turning only at corners; reach in
  every direction, line of sight (seeing and shooting over barrels, not through walls), attack
  timing, projectiles, damage rolls,
  staggering, death and respawn, the orc's patrol, chase and giving up, running (its speed,
  speeding up and slowing down, charging), stamina (used, got back, running out, never below
  none or above its most), spells (heal rolls, stun freezing the orc and calling off its blow,
  the cooldowns, every reason a cast fails), going straight ahead (to the first wall,
  sprinting, then walking with no stamina), and a simulated minute on a generated world.
  `test/overworld.test.js`: the world outside (blocked off its edges, the same chunks however
  they're come to, the town set in just as it was made with everything in it moved, its streets
  carried on as roads, water blocked but seen over, bridges walked over, trees as thick as their
  land has them and of its kinds, clear of roads and water; a way out of the town along the roads
  across many chunks, found quickly; the player walking out into the world; chunks made quickly;
  the other settlements laid out as the world near them is made, the same every time, set in as
  they were laid out, each piece with one chunk, and the plan's roads carried on to their
  streets' ends; each people's castle and places set down clear of roads and water, each square's
  land looked at once).
  `test/chunks.test.js`: the world drawn round the player (a chunk a step at a time, hidden till
  it's whole, no more than one begun a frame; one half drawn thrown away when the player's gone,
  and all near drawn at once when asked; the undergrowth grown over several frames, the same as
  all at once; the splat and the undergrowth's places the same a step at a time; a settlement's
  buildings built a piece at a time, each made ready to merge in a step of its own, merged the
  same as all at once, drawn whole while the player's near and without the timbers' sides from
  further off); and the
  settlements ahead laid out off the page's thread (asked for nearest first and once each, and
  taken as they were laid out; the same laid out in another thread, and one laid out from
  anything else not taken).
  `test/navigation.test.js` (with WORLD.md's): a map of squares' own mesh walked through a
  doorway a square wide, kept a body's width from walls.
- `test/insides.test.js`: every building's door where the art builds it, whichever way it faces,
  and the way up to it cleared; taprooms set out every way, everything reachable from the door;
  upstairs as the tavern's name has it, or none; the folk worked out from the plan (on the floor,
  seated on benches, their rounds reachable, who keeps upstairs and how many courtesans); a
  smithy's forge, bellows, anvil, trough and grindstone all got to from its door, the smith and
  apprentice at them, and the smithy named for its smith; a temple's altar, statue, five shrines
  to the other gods, pews, votive candles and basins, the priest's and acolyte's rounds got to
  from the door, worshippers seated facing the altar, and the priest in white vestments; a
  guild's counter, shelves, quest board, tables and hearth, the receptionist stamping behind the
  counter and filing at the shelves, adventurers of every calling at the board and the tables,
  the receptionist in the guild's uniform with twin tails or a bob, adventurers sheathed and
  those drinking holding tankards; every kind of building drawn by its style, and a floor built
  a step at a time the same as at once; the
  settlements' taverns', smithies', temples' and guilds' doors among the world's links as they're laid
  out, their floors and folk
  made once when wanted, each building somewhere of its own; going in through a door not made yet
  in the battle; each floor built by its style and the doors picked up; folk made up as they're
  wanted, as their part and sex have them, each their own; what's upstairs in talk; and the
  battle letting go of a character.
- `test/interiors.test.js`: the tavern's folk (on benches facing tables, stops on the floor and
  reachable, each with a class and a name, resting while the player can see them and never
  unseen, never the same rest twice running and staying put for it, the wenches serving round
  the tables and back to the bar, the barkeep pouring behind it, the madam at her counter, walked
  up to and talked to across the bar or next to a patron, stopping to talk and carrying on after,
  and no one fighting any of them); reading plans, the tavern's floors (every table, bench, bed and the
  bar reachable), the tavern's door clear and reachable on 40 seeds, routes between maps, going
  in, up, down and out, orders only on the map a character is on, fighting only there, the orc
  following through the door and up the stairs and finding its way back, the player going after
  a target that goes through, respawning on the map started on, arrows fizzling; and the doors
  and stairs to tap: a target at each end, hit by a tap on it on its map only, glowing when
  tapped and while the player makes for it; arriving a couple of steps clear of a door or the
  stairs, facing it; and seeing the player indoors: the walls in the strip in front of them down
  (a whole square at a time, the outer walls as the square inside them), those to the side,
  behind or level with them standing, anything else cut only above head height, and the
  doorways found in the walls.
- `test/characters.test.js` (with CHARACTERS.md's): the tavern's folk's bodies and clothes,
  skirts, gowns and aprons (hanging from the waist, flaring to the hem, skinned to the thighs and
  shins), sitting on a bench (thighs level, shins upright), and raising a tankard in a toast; and
  every item's opaque parts in one mesh, each part its material's colour, metalness and roughness,
  a two-sided part's faces turned over too, its shader's lines put in three.js's, and copied with
  its folds; skin's roughness painted in its picture's alpha (oilier down the T-zone, fur matte,
  scales glossy, the seams too), lit wrapped round (red furthest) and hair in bands along its
  strands, each in place of three.js's lines, and still skin or hair copied.
- `test/beast-building.test.js` (with WILDS.md's): a creature's body sculpted and its pieces
  folded over many small steps, the same as all at once (a wolf; a skeleton, all pieces; a magma
  slime, made molten after); a look shared once made (another of it built at once), and one
  wanted meanwhile taking up the sculpting where the first had got to; a beast dressed in steps
  through its sculpting; any other error let through, and what's wanted made at once after.
- `test/character-building.test.js`: characters built a step at a time the same as all at once
  (soldiers, folk and a hero); the skin, hair, a boot, a garment's picture and an outfit's the
  same step by step; the hair grown once (none hidden by a tankard; under a helmet only below its
  rim); a garment's cut kept for everyone measured alike; a look of eye's picture shared; a step
  waiting on work done elsewhere told to do it now when the steps can't wait, and come back to
  when they can; and skins painted in the worker (run in the test), cat folk's fur and lizard
  folk's scales too, waited for and put on last: the same characters, painted here instead when
  the steps can't wait or the worker fails; and a soldier's things in few meshes (each item one,
  the lashes both sides at once).
- `test/wounds.test.js`: battle damage on the real body: the thresholds, a kind for every
  reaction, a mark every blow and a wound for each threshold crossed, each kind painted its own
  way (cuts bleed, blunt blows bruise, fire chars and never bleeds, arcane light leaves veins),
  landing facing the blow at its kind's height (not on the hands or head), healing a stage at a
  time (their arrows with them), gone on coming back to life, glows fading, eight arrows at most,
  and the body's and garments' materials mixing it in (skin's own lines kept, its roughness under
  the blood's wetness).
- `test/gputimer.test.js`: the GPU's time for a frame read once it's done (never waited for) and
  smoothed, a time the GPU's clock was disturbed for thrown away, no more than four waiting, and
  nothing where the browser has no timer.
- `test/governor.test.js`: fewer pixels only for a device whose frames come late while its own work
  is well within the time; after it's played a while, over a whole window, twice at most; 30 a
  second keeping up on low; a slow start and a hitch now and then forgiven; carrying on from a game
  before, and starting again when reset. E2E: stepped down, the drawing buffer's smaller and debug
  mode says so; a quality chosen, every pixel again.
- `test/pacing.test.js`: how often the world's drawn: every other frame of a 120 Hz screen at 60,
  evenly; a 144 Hz one at 72 and a 90 Hz one at 90; 30 on low; every frame with no rate, or when
  drawing takes longer than the rate allows; following the screen changing its rate.
- `test/camera.test.js`: the camera following from the player's first step, catching up and
  turning behind them (walked away from, it doesn't turn; walked towards, it turns all the way
  round), easing round (three-quarters of a half turn in 0.5 to 1.2 s, never a jump), steady
  through a path's corners, staying where it's turned when they stand; dragged, turning and
  tilting, no lower than the view allows nor higher than 75 degrees, holding while they stand,
  not turning itself while held even as they walk, and swinging back behind them once let go and
  walking; starting 35 degrees down and looking up to 45 degrees over the horizon at most, easing
  back down once they walk if it was looking up; catching up without turning when the player
  comes back to life elsewhere, and leaning towards a foe.
- `test/sky.test.js`: the sky's dome round the camera, drawn behind everything, its horizon the
  haze's colour; birds for every land, a dozen triangles or so each; flocks of the land's birds
  now and then, never too many, at their heights, gone once far off; a wyvern over the lands they
  hunt in, built over several frames before it comes, and none over a meadow; the dragon circling within sight on its lair's side of the
  player, handed over to land and gone from the air, and flying off when its lair's no longer
  near; none of it indoors; a wyvern coming down out of the sky to where its actor is, lower all
  the way, landing facing its way; a dragon soaring where it's put; nothing without wings coming
  down out of the sky.
- `test/actions.test.js`: attacks (five ways of each, every one landing in front at a fighting
  height, never the same way twice in a row, all five used; their timing, where the hands reach
  on different bodies, two-handed grips, alternating punches), rests (five named for every
  class, never the same twice running, easing out when stopped, the hands where each says,
  patrons staying seated), reactions and falls, on the real body; a character posed as often as
  it's seen (every frame big on the screen, less often smaller or out of view, more often moving
  fast or in a blow), following its actor every frame and posed for all the time and way since,
  a foot on the ground each time.
- `test/dialogue.test.js`: names (for each one's sex, none twice, the same for the same world),
  and conversations: one for everyone, every tree hanging together (every reply leads somewhere,
  every node can be got to, every talk can end), every name filled in, strangers and friends
  greeted differently, what's asked remembered, what's learnt carried to others, world effects
  handed to the game, conditions it doesn't know asked of it, lines said differently each time.
- `test/effects.test.js`: five looks each for fireballs, bolts, heals and stuns, each like what it
  is (fireballs orange and red, bolts violet and blue, heals green, stars bright); flying in them
  (straight, spiralling, jittering, as twins, drawn out), bursting in their colours, rings and
  stars; particles uploaded and drawn only as far as the highest one alive, and none with none.
- `test/explored.test.js`: the buildings gone into, once each; a chunk's fog lifted when it's set
  foot in, and only that chunk, to the world's corners and nothing off it; kept and read back
  just as it was.
- `test/app.test.js`, `test/town3d.test.js`, `test/manifest.test.js`, `test/sw.test.js`: saving
  (and what's been said in talks, and what's been found of the world, for the saved character
  only),
  heroes (and forgetting volumes saved on the old scale), the minimap's colours (in the town and
  inside) and its patches of the world (painted the same a step at a time as at once; the next
  painted ahead of the player while they're well inside this one, and shown before its edge would
  show), the action wheels (which of eight slices a flick is in, its shapes, its
  actions and icons, every item's icon, what goes on each wheel, and reading them back), the
  loader's byte counting, the ground's blending, the town's
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
- `test/buildings.test.js`: houses laid out the same for the same piece, with the storeys the
  layout asks for (more in cities than villages), a door at the front and a window on every
  floor of it, shops, openings clear of the corners, each other and the floor above, jetties
  only on timber houses, built within their lots in a few hundred to a few thousand triangles,
  weathered; barns boarded; a wall's openings leaving holes and a gable its outline; every
  landmark of six towns and cities built within its lot, each tavern with its own name board and
  sign, the guild's, each temple's patron's; every emblem painted, one or several; every prop
  built; a textured material's picture painted only when it's wanted, once for it and its copies
  (none for a house merged into the atlas); the atlas's layers (the same every time, with relief) and a house drawn from it as one
  mesh; a solid's faces kept as the 32-bit floats they're drawn with, however many there are;
  upright faces cut where their tone turns (not narrow ones, level ones, or those it doesn't
  turn across), and houses' walls drawn within a few percent of their weathering (they were a
  tenth darker); round things shaded round (a drum's corners straight out from its axis, a
  pyramid left in facets, an edge kept where a hut's wall meets its roof, a dome, a rod and a
  vault shaded through, a spike's normals tipped towards its point); glass, metal and slate's
  shine given with their layer (a tinted material's as the one it's tinted from's), and lit in
  the buildings' shader (each change to three.js's Lambert shader found: a highlight from each
  light, the sky reflected), not the wilds'; each people's insides of its own stuff (the atlas's
  layers they're drawn from), each inside drawn from the atlas, a mesh for its walls and one for
  the rest (a floor in a dozen meshes at most, nothing painted of its own, only its daylight,
  flames, roast and lights apart), a god's colour from the plain layer, and the atlas as the
  insides draw it: the one atlas, cut after its own changes.
- `test/wilds.test.js`: the noise (smooth, seeded, tiling when asked); the ground's patches (a
  tiling texture with dry, lush and bare in it); the land's features (placed across every land,
  many kinds, a few a chunk; the same every time; taking their squares, hiding what's behind the
  tall ones, clear of roads, water, the town and the settlements); every kind of thing drawn for
  every land's look, whole and within its budget of triangles, no two looks alike; a chunk's
  features as one mesh; the undergrowth only on open grass, the same every time, thinner when
  asked and in the towns (but not their fields), built a few things at a time in tiles within
  budget.
- `e2e/building-lab.spec.js`: the building lab's street of houses (twenty, in fewer than thirty
  draw calls) and its town; the taverns, guild, temples and smithy with their boards and signs; a
  village drawn in its chunks; and a meadow with its features and undergrowth, in fewer than 70
  draw calls.
- (The tests wait for `window.pellagos.playing`, which the page sets once the game is under way,
  its world stepped and drawn a frame (`Game.underway`), not just started: before then, a tap
  can land where the camera was, and nothing's been explored yet.)
- `e2e/pellagos.spec.js`: the whole game in Chromium: loading, debug mode, making a character
  through to playing them, carrying on with a saved character, a fight to the death, walking by
  tapping, running by double-clicking and double-tapping with the stamina bar showing and going,
  swiping up from the player to go straight ahead (running),
  a bow fight leaving arrows in bleeding wounds, blood on the ground and a pool under the fallen,
  healed and come back to life without them,
  the music's recordings downloaded and playing after a tap (and carrying on when the browser
  suspends or closes its sound), the camera following from the first step and ending up behind a
  long walk, a drag turning and tilting it (holding while the player stands, and swinging back
  behind them once they walk), dragged up to look into the sky (the camera over the ground, the
  sky drawn, birds flying by, drawn one mesh a kind) and looking down again once they walk, the
  camera clear of a building behind the player in the town, the
  target ring, tapping the tavern's door (lit green) to walk in and come out a couple of steps
  inside it facing the door (and at each door and stairs after, taps round the player walking
  them, not taking them back through), the folk there (seen, without name plates, resting, not to be
  fought), tapping the barkeep to walk up and talk (his name and title, what he says, replies
  by tap and by number key, Escape to stop), up the stairs (the madam), down and out again,
  another tavern got ready as the player comes near (its own taproom, sound, minimap and folk
  inside), let go far off and built at once if walked straight into, a smithy's smith heating,
  hammering and quenching and its apprentice at the bellows and grindstone (each heard), a
  temple's priest in white blessing and lighting the shrines' candles, worshippers praying, and
  the priest telling of the temple's patron, a guild's receptionist stamping notices and
  adventurers reading the board and drinking, their weapons sheathed, and the receptionist
  signing the player up,
  walking by the
  minimap, a building gone into marked on the minimap, the world map held open from it (the game
  paused under it, the fog over every chunk but those walked into, the tavern's icon and the
  town's name on it, zooming out, closed by Escape and by M), walking 300 metres out of the town into the world (the chunks round the player drawn,
  those left behind thrown away, the minimap following), Game options and the volume sliders
  (remembered), the
  action wheel (stunning the orc, a flick refused while cooling down, then a heal), the action
  wheels set in Game options (a draught put on wheel two, drunk by flicking down then NE), and a phone
  screen. Drawing without a GPU is slow, so fights are played on with
  `game.advance(seconds)`, which runs the game without drawing each frame.
