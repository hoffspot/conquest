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
  steepest slopes and climbing the steepest of them in mossy old stone steps (`core/trails.js`,
  `art/kits/steps.js`). Each people's castle and high places stand on a rise, on a
  mound; their pools lie in hollows; and the enemies' camps are pitched on level ground, not on
  a mountain's side (`core/terrain/flats.js`).
- **Every other settlement** (`core/settlements.js`: the plan's capitals, cities, towns,
  villages, hamlets and farmsteads), laid out by `layoutTown` from its own seed the first time
  the world within a chunk of it is made, and set into the chunks it's in as the town is, the
  plan's roads carried on to its streets' ends.
- **The sites no people keeps** (`core/setpieces/neutral.js`, built by `art/kits/neutral.js` and
  the castle kit's `RUINED`): the ruins of old halls, caves, shrines, rings of standing stones,
  ruined castles, the dragon's lair and the broken watchtowers no one mans. Old and weathered,
  as the Elden Ring's are; the peoples' own towns, castles and farms are kept up and lived in.
  - **Laid out** from the site's seed, the same everywhere: its parts, what of it stands in the
    way (only that blocks; the rest is open ground) and its heart, open ground in its middle,
    where a lair's master stands (`Sites.heartOf`).
  - **Standing stones:** 7 to 11 whole stones of the land's rock round a flat altar stone, some
    leaning, some fallen. **Shrine:** a stepped plinth with a weathered figure (robed, an obelisk
    or a pair of hands), braziers burning either side, a curved wall behind. **Cave:** cut into a
    hillside where there's one near (`sites.js` `HILLSIDE`: the land rising 6 to 14 m across it),
    facing down the hill: a floor dug level into the hill in front of a face of rock, the hill
    going on over the face's broken brow and the rock under it; in the face, a dolmen doorway
    (two rough stones leaning in, one laid across) round the black of the way in; torches either
    side. Where the land's flat, a pit sunk 3.2 m into the ground instead, lined with old stone
    crumbling at its rim, steps down its front to a dark doorway. **Ruins:** an old hall's walls
    broken off along their tops, a door and a breach, column stumps, some fallen, heaps of fallen
    stone; against its back wall in the middle, a gabled stair-house of its stone, a round-arched
    door in its front onto the dark of the stair going down to its crypt, a skull set over it, ivy
    hanging over it (`RUINS.crypt`). **Ruined castle:** the humans' castle as it's laid out, left to ruin: its walls and
    towers crumbled (below), its keep open to the sky with joists still across it, its gatehouse's
    bridge fallen, its houses heaps of stone and charred timbers; old barrels, crates and a cart
    left by its walls. **Dragon's lair:** a hollow dug into a mountainside, a great dark doorway
    in the face at its back, ridges of dark rock coming down either side, bones. **Broken
    watchtower:** its walls broken off at different heights round its top.
  - **Crumbled, not cut** (`art/kits/decay.js`): built as it stood, then only what's left made.
    A wall's broken top is jagged at the size of a stone: sloping where stones fell one by one,
    stepping a course where a row held, dropping in a V where a breach fell, lowest where slow
    noise along it says most went. A tower's rim crumbles the same way round. What fell lies in
    lumpy heaps against the foot, about a third as high as what fell, blocks tumbled down them;
    a loose stone or two left perched on top.
  - **Old stone** (terrain plan M7b-3a; `painters.js OLD_STONE`, the `coursed` painter, MATERIALS'
    `old`; `atlas.js AGED`): the ruins' walls are built of their people's stone gone old (the
    humans' and the wild's dark green-grey, the elves' pale, the dark elves' black, the lizard
    folk's lime), laid in random courses 20 to 60 cm high, each block one to three times as long
    as its course is high, its own shade, greener or browner, darker towards its foot, its upper
    edge catching the light, flecked with lichen, its corners chipped; the mortar between is near
    black and sunk deep, so the relief shadows it. A copy covers 4.2 m, so the courses don't
    repeat along a wall's height. Where a wall's broken, along its broken top and at a breach's
    ends, it shows the rubble core its faces were filled with (`rubble-old`; `decay.js`
    `crumbledWall`'s and `crumbledRing`'s `core`), and what fell lies in heaps of the same. Where
    it's drawn, the old stone weathers (the atlas's shader, for its layers alone, so the peoples'
    kept-up towns and castles never do): moss on what faces up, in patches about a metre and a
    half across, a little on what faces north, and near to (within 70 m) in the joints between its
    blocks; dark streaks down its faces. No new draws, programs or triangles: a few dozen
    operations a pixel of old stone.
  - **As they were built** (terrain plan M7b-3b; `decay.js` `crumbledWall`'s `openings`,
    `archOf`, `stringCourse`, `buttress`): tall pointed windows through the walls, their jambs,
    sills and heads the wall's whole depth; where the broken top has fallen below a window's
    head it's open above, its jambs standing as high as the wall beside them, so a window the
    wall broke through is a notch. Bands of stone (string courses) run proud of the faces, lit
    along their tops, broken where a window crosses them and gone where the wall's fallen
    below them; stepped buttresses stand out from the faces. An old hall's walls (`HALL`,
    `hallWindows`) have lancets 0.6 m wide every 3 m or so where they still stand above their
    sills, a base course and a course under the sills, and buttresses on their outer faces near
    their ends and between their windows. A ruined keep (`castle.js KEEP_RUIN`, `keepWindows`)
    has two rows of lancets 1.4 m wide, one over another, at 0.3 and 0.62 of its
    height, where its walls still stand, and a course under each row on its outer faces.
  - **Ivy** (terrain plan M7b-3c; `art/kits/ivy.js`): hanging in curtains from the old walls'
    broken tops, 1.5 to 4.5 m across, about one every 5 m along a face (fewer on a hall's inner
    face), round the towers and the watchtower too: draped over the top's edge,
    down the face in a mass of dark leaves standing a little proud of it (proud of the keep's
    courses too), shorter at its sides, its foot ragged where its strands hang on, as far as
    0.3 to 0.85 of the wall below it, never more than 7 m. Never over a window, a slit, a
    doorway or a buttress, nor on a wall less than 1.2 m high. Cards of leaves cut out of their
    picture, drawn as the hedges' sprigs are (the same program), all of a chunk's ivy one draw,
    casting no shadow. The peoples' kept walls have no curtains: only, now and then, a patch
    climbing a cottage's bare wall from its foot (*Houses*, below).
  - **Left behind** (`art/kits/leftovers.js`): grey, weathered and charred beams, snapped off or
    fallen, posts standing where halls stood; barrels whole, tipped over or burst (their staves
    splayed, a hoop in the grass); crates, some broken open; a cart left on one wheel.
  - **Lying with the land:** each part stands where it is and reaches 1.4 m into the ground, so
    nothing floats where the land falls away; on the flattest ground within 48 m of the plan's
    spot (a cave or the lair on the hillside nearest the slope it wants). Levelled only where it
    must be: a ruined castle's courtyard, a cave's dug floor or pit. Moss on what faces up, dark
    at the foot.
  - **Its trail comes to its front** (WORLD.md, *Trails*).

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
  wall; fenced, gone into by its gateway, its bed planted and washing hung out: below). Fewer
  lots are built on towards the edge, and none past it (the edge wanders).
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
  (`core/lore/gods.js`: below), and its grade and build (`churchOf`: a village's parish church,
  a town's church, Romanesque or Gothic by its seed, a city's minster; taking nothing from the
  layout's random, so the layout's the same).
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
| Vigor | anyone | 16 m | 500 ms | 8–12 hit points back | 4000 ms |
| Burn | an enemy | 16 m, in sight | 450 ms | 9–15, may set them burning | 2500 ms |
| Stun | an enemy | 18 m, in sight | 400 ms | can't act for 3000 ms | 3000 ms |

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

**The sky** (world/sky.js), outdoors, at the time of day (Day and night, below): deep blue
overhead paling to the haze at the horizon (the fog's colour, so the world's far edge melts into
it), the sun where the shadows come from (a bright disc in a warm glow, gone once it's set), the
moon on the other side of the sky (its disc lit as much as its phase has, its seas darker, a faint
glow round it), the stars at night (one in some of the cells of a grid over the sky, twinkling;
none where the grid's cells are smaller than a pixel), and clouds drifting slowly across on the
wind, soft-edged, white where the sun's on them and grey-blue underneath, thinning towards the
horizon, lit as the sky is (gold at dusk, grey-blue at night). It's one
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
size, so going in or out changes only which is read, never a shader. Out of doors in the world,
the sky's is drawn again as the day turns (Day and night, below). They replace a
photographer's studio room (6 MB, twice as long to make) and a hemisphere light, under which a
white wall in the shade got twice as much light as the sun gave it in the open, so nothing had a
sunny side and a shaded one, and steel mirrored grey walls. Now, outdoors, a wall in the sun gets
about three times the light of one in the shade, which is sky-blue (the sun a little stronger,
3.5, to make up the sunny side's share); steel mirrors the sky and the ground; indoors the light
is warm, and dim (a little over half as strong): a room's own flames and the daylight through its
windows light it (Inside the taverns, below). The character maker keeps a studio's light of its own (made when it opens, let go when
it closes), so colours are chosen as they are.

**Glows** (lamps, faerie fire, lava: world/art/engine/atlas.js glowMaterial) are shown in their
own colours, untouched by the tone mapping, as the flames indoors are, not dulled and paled to a
lit surface's.

**Steady shadows** (world/shadows.js). The sun's shadow map moves in whole texels across the
sun's own view as it follows the player, so its texels stay put on the ground and shadows' edges
stand still as the player walks. (Whole texels along the world's own axes, as it once moved,
aren't whole texels to a sun looking down at a slant: edges crawled.) As the day goes, the way
the shadows are cast from follows the sun (or the moon) round only in small steps
(`stepShadows`: a ninth of a degree, about every second and a half by day), so the map's texels
stay put between them; a map turned a little every frame drew every shadow's edge a little
differently each frame, and all of them shimmered as if in the wind. Shadows fade out over the
outer fifth of the map rather than stopping along a straight line, which shows when the camera's
drawn back or looks towards the horizon. Their soft edge (about 5 cm on medium and high) is
about the sun's own: the half-degree sun blurs a 2 m figure's shadow by 2 cm, a house's eaves' by
7 cm.

**Shadow maps drawn with only what they need** (world/shadowpasses.js; the terrain plan's M7k).
three.js asks each mesh whether it's in a shadow camera's view, with that light's own frustum;
the view answers for the sun and the lamps (`watchShadows`):
- **A chunk's buildings** are merged into one mesh (town3d.js `joined`), which keeps where each
  building's corners are in it (`runsOf`: a run for each building, things in no building in runs
  no more than 16 m across). A lamp's shadows (six views from its flame, out to its reach) and
  the sun's draw only the runs in their view, as a few draws of the mesh's parts (runs within
  1,500 corners of each other drawn as one), or none. A lamp in an elven town drew a million
  triangles each time its shadows were drawn again; it draws what's within its reach.
- **Something small** (a character, a creature, what they carry: 6 m round or less) is drawn
  into the sun's shadows only if its shadow may fall where the camera looks this frame
  (`setShadowView`): round it and as far down the sun's light as its shadow can fall (up to
  40 m, longer the lower the sun). A creature out of view behind the camera cost 40,000 to
  80,000 triangles in the sun's shadows. The lamps' shadows, drawn only every few frames, keep
  everyone in reach, so the shadows don't lag when the camera turns.
- **What's seen is the same:** what's left out lies outside a shadow map's view, or casts where
  the camera doesn't look.

**The far land and the haze** (world/far/, world/fog.js; the terrain plan's M6a). Outdoors the
world's drawn twice over each frame:
- **What's far first,** with a camera of its own (from 40 m out to half as far again as the far
  land reaches): the sky's dome, and the far land, ground out to the horizon round the player.
- **Then everything near,** its depths forgotten, over it, with the camera that sees 160 m.
- **The far land** is levels of ground, each a square of 64 by 64 cells round the player, the
  finest 8 m between its corners and 512 m across, each level out twice as coarse and twice as
  wide (a geometry clipmap: Losasso and Hoppe), three of them on low (out to 1 km), four on
  medium (2 km), five on high (4 km); one draw call each, 8,192 triangles. Each cell is split
  along whichever of its diagonals is the more level (far/levels.js `splitAlong`, worked out
  with its heights), so a ridge or a valley runs along the triangles' edges; split the same way
  everywhere, any running the other way was drawn as a row of teeth from high up.
  - **Its ground** is the land's as seen from afar (core/terrain/height.js `distantHeights`):
    lakes and the sea carved in and lying flat at their level; no rivers. Each level's edges are
    eased into the next one's (every other corner halfway between its neighbours), so they meet
    without a crack.
  - **Its still water** (the terrain plan's M7d-2). Each corner has how deep the water is over the
    land, and on land how far below it the nearest water's surface is (less than 0, both up to
    4 m). Between corners that's 0 just where the shore is, so the shore is drawn there, sharp
    across a pixel: it follows the land in curves, not the corners in 8 m steps. The water looks
    as the water nearer does (water.js `STILL_WATER`): its own colour over its bed, the bed seen
    through it where it's shallow (red taken out first, so the shallows are green); the sky from
    the same blurred map, as much as the water nearer reflects at that roughness and that
    glancing a look; and the sun's glint. So a lake or the sea far off reflects the sky and the
    clouds and pales to the horizon, and meets the water nearer without a band.
  - **Worked out off the page's thread** (far/far-worker.js), a level at a time, about 10 ms each
    on a desktop; as the player walks, the finest moves every 16 m, the coarsest every 256 m.
  - **Hidden where nearer ground's drawn:** each level is lifted out of sight inside the next one
    in, and all of them within 112 m of the player, where the chunks' ground is. Lifted, not
    sunk: what's lifted, and the walls left round it, face away from the camera, so the GPU
    drops them before drawing a pixel (sunk, they faced it and covered the lower half of the
    picture, all drawn over again by the near ground: a sixth of a slow frame).
- **Its colour is the ground's as seen from afar** (ground.js `farGround`): the lands', the
  homelands' and the grass's patches, rock where it's steep, each texture its average colour
  (one tiling every few metres is a pattern, not a texture, from a kilometre off). The far land
  works it out at each corner (in the vertex shader: some 13,000 to 21,000 corners, not the half
  of the picture's pixels it covers, a dozen texture reads each) and blends between them; the
  chunks' ground turns to the same, a pixel at a time, from 100 to 150 m in front of the
  camera, so where the far land takes over no seam shows.
- **The haze** thickens the further off, exponentially, from 20 m (none nearer) to all but gone
  (95 %) at the far land's edge, as air does: so the near world is clearer than it was (15 % at
  130 m, where the old fog was all there was), and hills, the volcano and the plains show
  kilometres off, paling into the sky's own colour at the horizon. Fogs nearer than 400 m
  (indoors; the labs, which don't see far: View's `far`) are linear as before.
- **What stands up near the player** (buildings, trees, rocks, folk) fades out a few pixels at a
  time from 128 to 154 m in front of the camera, before the near camera stops and would cut it
  through. The ground doesn't: it goes on into the far land. Nor does the water: it goes on to
  where the near camera stops, its ripples gone by 128 m, and the far land's water and the far
  rivers, which look as it does there, take over. (It used to fade out too. Where it had gone,
  the bed under it showed, or nothing at all: looking down on a lake from high up, the bed was
  past where the near camera stops before the far land began, so the sky's colour showed
  through in dots.)
- **Costs** (medium, the browser tests' software renderer): 4 to 8 more draw calls and about
  50,000 more triangles a frame outdoors (the far land's 32,000, and more of the near world
  showing through the thinner haze); indoors, none.

**The look of the lands** (world/look.js, world/fog.js; the terrain plan's M6b). Each land has
a look of its own (`LOOKS`), which the world takes on round the player:
- **What a look is:**
  - the sky overhead and at the horizon (the haze's colour too, so the far land melts into it);
  - the sun's colour and strength;
  - the mist in the low ground: how thick it is at its floor, how high its floor lies over the
    ground round about (the average within 80 m), and how quickly it thins going up;
  - a grade over the picture: a tint, and colour turned up or down.
- **Some of them:**
  - the meadow is the day as it was;
  - farmland and the savannah are warmer and golden (the savannah's horizon dusty gold);
  - marshes lie under a thick, low mist, paler and greyer;
  - the elves' woods are cool and bright, a blue mist among the trees;
  - the darkwood's sky is violet, its sun weaker, its colours drained;
  - the badlands and the volcano's ash are red, the ash's sky grey-brown;
  - snow and the mountains are clear, white-blue, a little drained.
- **Blended and eased.** The look is the lands' within 80 m of the player, the nearer the more
  (so it changes smoothly as they walk), and it eases towards that over 1.5 s. Indoors there is no
  mist and no grade; out again, the land's look comes back.
- **The mist** is worked out exactly for each pixel: how much mist the line of sight passes
  through, from the eye's height to the point's (the integral of an exponential), so a valley seen
  along is hazy, the same valley seen from the heights is hazy only below, and the heights are
  clear. It's only under the far haze (outdoors, in the game), and costs a few sums a pixel.
- **The grade** follows the ACES tone mapping (three.js's custom tone mapping: ACES, then the
  tint and the colour). It's applied before the haze, so the far land and the sky, which are the
  look's own colours, aren't tinted twice. With no grade (the meadow, indoors, the labs) the
  picture is as before.
- **Shared values.** The mist's and the grade's values are put into every three.js material's
  uniforms once, before anything's drawn, as the same objects, so setting them sets them
  everywhere. Going in and out still makes no new shader programs.
- **Through the day** (below), the look's sky, sun and grade are the day's: the look's by day,
  dawn's and dusk's colours either side of the sun's rising and setting, the night's after. The
  light from all round is drawn from the look's sky at the time of day.

**Day and night** (core/daytime.js, world/daytime.js; the terrain plan's M7e):
- **The clock.** A day is 60 minutes of play, kept by the war's own clock (a turn a minute, and
  the time into the next), so it needs nothing kept of its own: whoever holds the world keeps it,
  it's saved with the war, sent to whoever joins in the war's state and checked with it, so every
  player has the same hour; it stops when the world's paused, as the war does. From midnight: the
  night to minute 7, the dawn to 11 (the sun rising at 9), the day to 47, the dusk to 53 (the sun
  setting at 50), the night again; a new world starts at mid-morning (minute 18). The moon turns
  through its phases over eight days, a quarter full and waxing in a new world. `daylight(time)`
  (1 by day, 0 by night, even through the dawn and the dusk) is what the rules will go by.
- **The sun's way:** rising in the east, over the south (56 degrees up at noon), setting in the
  west, evenly; under the north through the night, quicker, but as slowly as by day near the
  horizon, so the dusk and the dawn come on as slowly as the sun sets and rises.
- **The sky's colours:** the land's look by day; either side of the sun's rising and setting,
  dawn's pinks or dusk's golds at the horizon (over about four minutes); a deep blue at night, a
  little lighter under a full moon; the stars fading in and out with the night.
- **The light:** the sun's, warm and low at either end of the day, coming on over a few minutes as
  it rises; at night the moon's, cold and blue-white (full, a strength of 1 against the
  sun's 3.5; new, 0.3, from the stars), its shadows paler than the sun's. The two are handed
  over at the horizon, where neither gives any light. The light from all round falls with the sky
  (its colours, and the ground under it lit as the day is), drawn again into its map (128 pixels a
  face: 36 small draws) once the sun's moved (by 0.03 radians: about every 25 seconds by day) or
  the sky's changed enough since it was last, at most every two seconds (at once after a big
  change); every lit material takes it, the far land too, with no new shaders. At night the picture's exposure is half as much again (the eye used to the
  dark), so a full moon's night is blue and readable, a new moon's dark.
- **What's lit by the sky alone** (the chimneys' and the volcano's smoke, the falls' mist, the
  sunlit motes (pollen, dust, snow), the clouds, the far trees) is as dark as the sky's light,
  from one shared value; fireflies, wisps and embers glow on.
- **Indoors** the daylight at the windows (the sun through them, the beams of light) falls with
  the day, none at night, and the glass shows the night's sky as it goes (dark blue, faintly
  moonlit: interiors3d.js `NIGHT_PANE`); the exposure is the day's.
- **Lit windows** (the buildings' atlas, below: `WINDOW_LIGHT`, `daytime.js` `windowsAt`): from
  three minutes before the dusk to the night's start, the town's windows come on one after
  another; all night they're lit (some going out after midnight), and through the dawn they go
  out.
  - **Their light on the ground** (terrain plan M7j-3; `world/windowpools.js`): in front of each
    lit window a pool of warm light lies on the ground, widest and brightest at the wall's foot,
    fading out as it spreads (1.6 m out from a window at the foot of the wall, 3.4 m from one 4 m
    up, fainter the higher it is; none from one over 7 m up), coming on, going out late and
    flickering with its own window (`atlas.js windowOn`: the windows' glow and the pools share
    it). The windows are the upright panes the atlas finds as a building's merged (`toAtlas`'s
    `panes`: each pane's middle, the way it faces out from its building's middle, and its seed;
    not a lantern's glass or a bottle's, `PANES`). A chunk's pools (and the start town's) are
    one mesh lying on the ground and added onto it, a few corners a window; by day not drawn at
    all, and fading out from 35 to 80 m off. Its shader's made at load (the chunks' primer). The
    peoples whose windows are dark (the cat folk's, the orcs', the lizard folk's) or glow on
    their own (the dark elves') have none.
- **Fire** (world/fire.js, lights.js, firelight.js, kits/torches.js): every fire in the game is
  drawn and lit the same way, from a candle to a fire spell. You asked for wavy, realistic fire
  ("Real fire is kind of wavy"), each fire its own light ("Shouldn't the torches and the spells
  be their own independent light sources?"), and the candles, chandeliers and spells to share it.
  - **Where:** torches in iron brackets either side of a keep's door (a capital's too) and of a
    gatehouse's way through, inside and out; the lanterns by taverns' and town halls' doors, and
    lamps on iron posts round the market of a town or bigger (`kits/props.js` lamppost: either side
    of each main street where it comes in, and in the market's corners; about two in a town, six
    in a capital); a brazier by each pair of guards at a town's roads out, across the road from
    their banner (`core/war/muster.js` `braziersOf`, drawn with the banners: `banners3d.js`);
    braziers at the neutral sites' shrines and torches on posts at their camps; every people's
    smithy's forge (and the orcs' braziers and their forge's burning chimney top, the cat folk's
    kiln); the war camps' fires; indoors, every hearth, forge, candle and wheel of candles. A kit
    marks each (a built piece's `userData.lights`: [x, y, z, kind], and for a torch on a wall the
    way out from it), and `lightsOf` finds them in the world.
  - **The flame** (`FIRES`: candle, lantern, torch, brazier, camp fire, hearth, forge, spell):
    several tongues a fire (a torch's 3, a camp fire's 8), each a strip of six segments (twelve
    for one taller than a man) turned to face the camera. Each rises from the fire's foot,
    twisting round its middle as it goes and drawing in towards it, leaning downwind more the
    higher it is, licking (a wave running up it) and growing and falling back on its own. In the
    fragment shader noise rises through each tongue, warping it from side to side and eating it
    away more the higher up, so its tip breaks off; it's hottest low in its middle and coloured as
    a glowing body is (red, orange, a white-yellow heart), drawn premultiplied so its heart adds
    light and its sooty edges hide a little of what's behind. Three reads of a small tiling noise
    texture made in the game (128 pixels). Fewer tongues from 8 m off, none past 140 m (its glow
    is left).
  - **How it burns** (`fireSignal`): a fire puffs as buoyant flames do, about 1.6 / √(its width)
    times a second (a torch 5.6, a camp fire 1.8): each puff grows slowly and collapses quickly,
    its own size, the rate wandering a little; and a slow gust, mostly calm, sets how hard it
    puffs and how far it leans in the breeze (`FIRE_WIND`: the flags' breeze, a gust sweeping
    along a row of torches). The same sums run in JavaScript and on the GPU, whole numbers only
    hashed, so 32-bit floats give the same within a fortieth of a puff.
  - **Embers and smoke:** embers rise from torches, braziers and camp fires as their plume
    carries them, cooling from yellow to red, a few pixels at most, none past 30 m; a thin wisp of
    smoke over a torch, a fuller column over a camp fire, their undersides lit by the fire at
    night (smoke.js `SMOKES`).
  - **Its light rises and falls with it** (`lightNow`): far steadier than the flame (each puff at
    most 5% either way, the gusts about 11%), a little higher as it stands taller, leaning with it,
    about 2,000 K (a candle's warmer). A torch on a wall lights it from a quarter of a metre out.
  - **Each its own light** (view.js `lightNear`): the two that matter most where the player is
    (a spell's first, then the nearest) are the view's two real lamps, lighting the folk and
    everything else and casting shadows; up to 16 more near the player each light the world's
    buildings, ground, trees and folk on their own (`FIRE_LIGHT`, a point light's sums added to
    every lit material's shader once, `fireLit`; read as a list, so no shader's made again
    however many there are), nothing lit behind the wall a torch is on. Torch 4.5 candela,
    reaching 11 m; lantern 3, 9 m; brazier 6, 12 m; camp fire 8, 14 m. Torches and lanterns are
    lit at night; braziers, forges and camp fires day and night.
  - **Against the dark** (view.js `NIGHT_FIRE`): the eye opens up at night, so firelight that's
    lost in the day stands out after dark. Out of doors every fire's light is three times as
    strong at night as by day and reaches a third further (a torch 15 m, a camp fire 19 m),
    coming on as the windows do through the dusk, so a lamp's pool of light shows on the street
    under a full moon and a camp fire lights its tent. A spell's flash is as bright as it's made
    whatever the hour; the Light spell's globe is lit as a fire is (13.5 m at night).
  - **Lamp shadows** (QUALITY `lampShadows`): on High and Medium the first lamp (a spell's, or
    the nearest fire) casts shadows, on Low none (a 256-pixel cube map; each shadowed lamp is 5
    taps of its map in every lit pixel, so only one, as the research found phones can afford).
    It's drawn again when the lamp lights another fire, and then every few frames drawn (every 2
    on High, every 4 on Medium: frames, not the game's steps, so a frame that took several steps
    costs no more), so the shadows of the folk and the stones round a camp fire dance with the
    flame without being drawn every frame. Which lamps cast shadows follows the quality the player chose, not the level the
    game drops to while keeping up, so no shader's made again while it's struggling.
  - **The fire lab** (fire-lab.html): a torch either side of a door, a brazier, a camp fire,
    candles on a table and the seven fire spells cast again and again, at midnight, dusk or noon,
    in the breeze or still.
- **Seeing at night** (core/light.js; battle.js canSee; the terrain plan's M7e-3): out in the
  world everyone sees less far in the dark, the battle's sight (12 m) times the sky's light: all
  of it by day, a moonless night's 0.35 (about 4 m) to a full moon's 0.55 (about 7 m), falling
  through the dusk. Where it's lit they see as by day: in a settlement and 10 m past its edge
  (its windows, lamps and braziers), 14 m round a war camp's fire, 6 m past a fire on the ground,
  9 m round a carried torch. It goes by where the one seen stands, so a torch-bearer is seen from
  the dark before they see who's there. The host works it out each step (`Host#light`) from what
  every copy of the world has (the clock, the plan, the camps, the fires, who has a torch), only
  near the players, so every copy sees alike. Indoors, and talking, as ever.
- **The Light spell** (docs/MAGIC.md; world/globes.js): its tome at every adventurers' guild for
  10 gold; cast, a globe over the caster's shoulder lights the dark 12 m round them as by day for
  fifteen minutes (cast again to put it out).
- **Torches carried** (world/carried.js; Character `holdTorch`; items `handTorch`): when the
  windows come on (half through the dusk) until they go off (half through the dawn), every
  soldier with a hand free (sword, cleaver or wand) carries a torch in their shield's hand, the
  shield hidden; bowmen and two-handed fighters none. Its flame burns at its head as they go
  (fire.js, a torch's), and it's a light of its own among the world's fires.
- **Passing the time** (core/host.js `REST`, `#camp`, `#sleep`; daytime.js `untilWaking`; the
  terrain plan's M7e-3): a room taken at an inn (the innkeeper's, 8 gold, or the madam's, 10) is
  slept in; or out in the world, **Make camp** (an action for a wheel, at the top of the player's
  own wheel's other side to start with, or a quick action) pitches their people's tent behind
  them and builds a fire a step in front, and they sleep by it. Not in a settlement ("find an
  inn"), indoors, in a fight, or with anything hostile within 40 m. Either way they wake mended,
  their stamina full, at the next sunrise or sunset at least five minutes off (the screen coming
  up from black, told how long they slept), the war's turns meanwhile all played as they would
  have been. The camp's fire burns on three minutes after, lighting the dark round it as a war
  camp's does (seen as by day within 14 m). In a world shared with others only the host passes
  the time, everyone woken with them; anyone else who sleeps just rests.
- **Not by time:** the pack's paperdoll is lit as on a fair day whatever the hour. With no world
  (the labs) the sun stands where it always did.

**Up high, rock and snow** (ground.js `ALPINE`). Grass gives way to rock with height:
- **Rock:** from 130 m to 220 m, rock reaches onto gentler slopes (at the top, slopes 0.12 gentler
  than lower down).
- **Snow:** from 205 m to 245 m up, snow lies on anything that isn't too steep, so cliffs stay
  rock and the peaks are capped white.
- **Wandering lines:** both lines wander up and down by as much as 30 m with the ground's patches.
- **No snow on ash:** the volcano's dark lands never get snow.
- **Near and far:** the far land shows the same rock and snow, so snowy peaks stand out kilometres
  off.
- **Where it shows on seed 1:** mountains (their median 161 m, the highest 296 m), the snow lands
  (median 247 m), and the mountain lakes' rims.

**On the horizon** (world/far/volcano.js, shapes.js, gather.js, silhouettes.js; the terrain
plan's M6c). What stands up from the land is seen from as far as the far land reaches:
- **The world's landmark, the volcano:**
  - a lake of lava in its crater, glowing (brighter than white, so the tone mapping keeps it
    bright), flickering slowly;
  - its walls lit from below, the light fading two thirds of the way up;
  - a glow over the crater, facing the camera, fading rather than greying through the haze;
  - a column of smoke: 28 puffs rising 650 m over 110 s, leaning east-south-east on the wind,
    billowing (a small noise texture drifting through each), lit orange at its foot by the
    fire and grey above, in the sun.
  - One draw for the fire and one for the smoke; under 1,000 triangles. Only for the eye: the
    lava does nothing in the rules.
- **What's built, as it's seen from afar** (silhouettes): each settlement laid out as it is when
  the player comes to it (the same layout), its houses as boxes with their people's roofs, its
  towers as columns and cones, its walls and gates as long boxes:
  - humans gabled, the elves pointed, the dark elves spired, the cat folk flat, the lizard folk
    steep and thatched on stilts, the orcs low longhouses (round huts as columns and cones);
  - each people's colours (pale stone and green for the elves, black and violet for the dark
    elves, mud brick for the cat folk, timber and thatch for the lizard folk, dark timber and
    basalt for the orcs);
  - churches with their towers and spires as high as they're built (a minster's two), keeps and
    halls three storeys high.
  - How far each kind's seen: capitals and cities as far as the far land reaches, towns 2 km,
    villages 1.2 km, hamlets 700 m, farmsteads 600 m; past 900 m only the bigger buildings (two
    storeys or more, or wider than 8 m), towers and walls.
- **The peoples' great places:** each people's castle (the humans' curtain walls and keep; the
  dark elves' black tower and its spire; the elves' towers and great tree; the lizard folk's
  stepped temple-fortress; the cat folk's mud-brick towers; the orcs' broch), the obsidian spire,
  the starwatch, the ziggurat, the sun temple, the war totem, the tree hall, the abbey, the
  windmill, the manor, pride rock and the watchtowers. And the sites no people keeps as they're
  laid out near to: the ruins' walls, the lair's ridges, the broken watchtowers,
  the ruined castles' pieces at their broken heights (shrines and stones are too low to be seen
  far off, and a cave's face is cut into its hill). Where a place has been set down (its chunk made), there; until then, in the middle
  of its cell.
- **Turning into the real thing.** The silhouettes are drawn twice (with the far land, and with
  the near world), and from 128 to 154 m in front of the camera they fade in, a few pixels at a
  time, in just the pixels the near world's buildings leave as they fade out (fog.js
  `FAR_FADE_IN`), so the one turns into the other.
- **Worked out off the page's thread** (silhouette-worker.js), again every 160 m the player walks
  or when a place is set down; laying settlements out takes the longest (a capital a fifth of a
  second), so what's ready is sent every half second, nearest first, and the layouts are kept.
- **Costs** (start town, seed 1): about 10,500 triangles on low, 17,000 on medium and 30,000 on
  high, in one draw for each copy.
- **The trees from afar** (world/far/trees.js; the terrain plan's M6d): past where the chunks'
  own trees are drawn, out to 700 m on medium and 1.2 km on high (none on low), every tree the
  land would grow there as one card turned to face the camera:
  - **Where:** the overworld's own way of planting them, replayed (the same random numbers, chunk
    by chunk), so each card stands where its tree will when the player comes near. None where the
    land across the four metres round it is too steep to climb (38°: the terrain plan's M7d-3), as
    the chunk keeps its trees' squares clear of its cliffs; before, cards stood all over cliffs and
    rock faces, as if floating in front of them, where no tree would be when the player came near.
    Only what else the chunk would keep a tree off (its roads, its rivers' banks, what's built)
    isn't known from afar; the places still to be built, the start town and the lakes and the sea
    are.
  - **What:** its kind's height and crown (round for oaks and beeches, oval for birches, poplars
    and silverbarks, conical for spruces and nightspires, a ball on a bare trunk for pines, flat
    for acacias), its edge ragged, lit from above and from the sun's side, in its kind's colour.
  - **Handing over:** they fade in from 128 to 154 m in just the pixels the near trees fade out of
    (`FAR_FADE_IN`).
  - **Costs:** two triangles a tree, all in one draw: about 6,000 trees round the start town on
    medium, 15,000 in the woods. One plain mesh of cards, four corners a tree, made in the worker,
    not one card drawn instanced: the browser tests' software renderer draws instances almost one
    at a time (12,000 trees cost a quarter of a frame instanced, next to nothing as one mesh).
- **The rivers from afar** (world/far/rivers.js): the far land's corners are too far apart for a
  river's channel, so each river's course (core/terrain/waters.js) is drawn on the far land as a
  ribbon of water on its surface, as wide as the river (4 m at least, so it isn't lost a long way
  off), as a lake far off looks (`STILL_WATER`: a metre and a half deep over a river's bed, the
  sky and the sun in it). Drawn with the far land only: the water nearer goes on to where it
  starts. About 5,000 triangles to 2 km.
- **Both** are drawn a little towards the eye, the more the further off, so the far land's coarse
  ground doesn't hide them; and worked out with what's built, in the same worker.

**Left as they are.** The tone mapping stays ACES (graded, above): AgX (tried, pictures with the
change) greyed the lamplit taproom and dulled the painted colours, and Khronos Neutral turned the
taproom orange.

**Following the player** (app/camera.js). From the player's first step, the camera keeps up
with them and turns round to look from behind them, the way they're going, at the same height
and zoom. It turns on a spring, gathering speed and slowing smoothly, never faster than 4.2
radians a second: a half turn (the player turning back towards it) is three-quarters done in
0.8 s and done in about 1.2 s. The way they're going is averaged over a third of a second, so a
path's corners don't swing it about. Stood still, it stays where it's turned. Put somewhere else
(coming back to life), it catches them up without turning. It leans towards whoever the player
is fighting, so both stay in view. The minimap stays north up; the wedge showing which way the
camera looks turns on it.

**Turning it by hand.** A drag (a finger, or the mouse held down) turns the camera round the
player: across the screen's width, half round, the view turning the way the drag goes (dragged
right, it looks further right); up or down its height, it tilts 60 degrees (dragged up, it looks
further up, lower down). It tilts between 75 degrees (almost straight down) and, outdoors, 45
degrees *above* the horizon: looking up into the sky, the camera comes down behind the player to
just over the ground (0.45 metres) and then tilts up from there, the player sinking down the
picture and, at the last, out of it. Indoors it tilts up to 40 degrees above the horizon, to look
up at the ceiling: anywhere over the ceiling the camera's free to be (looking down into the room,
the ceiling's not drawn), but under it, it's kept inside the walls (0.35 metres in from them, and
no nearer the player than a metre: view.js `roomReach`), coming in closer than a wall behind
rather than going out through it, quickly in and slowly back out, as at a building outside.
While held, it doesn't turn itself; let go, it stays where it was
turned while the player stands, and once they walk again, it swings back round behind them,
facing the way they go (keeping its tilt, unless it was looking up past 15 degrees down: then it
eases back down to 35 to see where they're going).
A drag that starts on the player and sets off mostly upwards is a swipe (straight ahead the way
the camera looks), not a turn; two fingers are a pinch (zoom). Tilting costs nothing: the town is a few merged meshes,
drawn whole whichever way the camera looks (about 90 draw calls and 170,000 triangles either way).

**Quality levels** trade looks for speed. Game options' **Visual quality** slider chooses one, Low
to High (suggested for the device until it's moved: older phones low, phones medium, computers
high); debug mode can change it too. The game aims at 60 frames a second at every level:

| Level | Pixels | Shadow map | Antialiasing | Hair | Skin textures | Undergrowth | Tall grass | Motes | Chimney smoke | Far land | Far trees | Fields afar | Cliffs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Low (older phones) | 1× | 1024 | no | a fifth of the strands | 512 | half | none (its look on the ground) | none | half its puffs | 1 km | none | no | none (painted on the ground) |
| Medium (phones) | up to 1.5× | 2048 | yes | 30% | 512 | three-quarters | to 12 m, thinner to 28 m | 300 | three-quarters | 2 km | to 700 m | yes | yes |
| High (computers) | up to 2× | 2048 | yes | 45% | 1024 | all of it | to 18 m, thinner to 40 m | 600 | all of it | 4 km | to 1.2 km | yes | yes |

**How often it's drawn** (`app/pacing.js`). The browser asks for a frame each time the screen
refreshes: 60 times a second on most screens, 90, 120 or 144 on many phones and monitors. Drawn
every time, a phone with a 120 Hz screen did twice the work of 60 for a picture no one can tell
from it, grew hot, and slowed itself down to cool. Every quality level draws no oftener than
60 a second (`frameRate`, the game's target): a frame's drawn when the browser asks within 0.6 of
the screen's refresh of when one's due, so the frames keep to the screen's beat. At 60: every
other frame at 120 Hz, every other at 144 (72 a second), every frame at 90 (which has no even 60;
never fewer frames than the rate asks for, rather than uneven ones). A frame that takes longer to draw
than the rate allows is followed by the next at once. The screen's refresh is the shortest time
between the browser's askings over the last 30 (so it follows a screen changing its rate). The
battle keeps its own time, whatever the frame rate (a step each twentieth of a second).

**Keeping up** (Game options: **Adaptive**, on to start with; `app/governor.js`). The game aims at
60 frames a second, and mustn't stay below 30. With Adaptive on, after 5 seconds of play (things
being got ready make it slower at first), judged over 3 seconds (the median frame: a hitch now and
then doesn't count): below 30 a second, it draws less, a step at a time, settling 4 seconds at each
before it's judged again. Fewer pixels first (85%, then 70% across and down: only the drawing
buffer's size changes), then the quality level below at every pixel (the far land and the
undergrowth drawn again, less of them), and so on to the lowest level at 60% and 50%. Once it's
been near 60 (54 or more) for 15 seconds it tries the step above again, up to the quality chosen
and no further; a step that let it fall below 30 is tried again only after a minute, then two,
four..., so a device at the edge doesn't see-saw. A game stopped a while (a gap of over a second,
the page in the background) is judged afresh. Choosing a quality starts again from it, at every
pixel. Game options says what it's drawing while it keeps up ("Keeping up: drawing medium, 85% of
the pixels"), and debug mode shows it on the quality line. Not under automation
(`navigator.webdriver`): a test's frames, drawn in software, are always slow, and what it measures
mustn't change.

**Clear of buildings.** In the town, a building can stand between the camera and the player,
from whichever side it looks. The view marches out along its line from where it looks over the
height of what's built on each square (`buildings`: houses, landmarks, walls, towers,
gatehouses and keeps, not props or trees) and, finding one in the way, comes in closer than it
(staying 0.6 metres clear of it), or rises over it (up to 85 degrees), whichever leaves the
camera furthest from the player, a degree higher counting as 0.15 metres nearer, and never nearer
than 2.6 metres: a building a little way behind brings it in, one right behind lifts it over.
It comes in (and rises) quickly, and goes back out slowly once the way is clear.

**The cutaway.** Whatever still hides the player (a tree, or a building too close to come in
front of), the view finds by marching along the line from the player to the camera (as far as
the camera, not past it: what's behind the camera hides nothing) over the town's height map (what's
built and the trees; not the props, a well, a cart or a stall, which are low enough to see the
player round, as out in the world), and the town's materials cut a round,
dithered hole through whatever is nearer the camera than the player (a few lines added to their
shaders; the shadows they cast stay whole).

### The ground (world/ground.js)

A mesh under each chunk of the world, rising and falling with the ground (WORLD.md, *The ground
in play*): its corners a metre apart in the chunk the player's in, and further apart further off
(`QUALITY.ground`, view.js: on high, a metre in the ring of chunks round it too and two metres
beyond; on medium and low, two metres in that ring and four beyond, turning to the far land's
look: the view, *The far land and the haze*), redrawn
finer or coarser as the player moves, lit by its slope worked out from the corners round each (across
into the chunks beside it). A metre apart, each square's split from its north-west corner to its
south-east, as the rules read heights between corners, so it's drawn just where everything stands
on it; further apart, each along its more level diagonal, as the far land is, so ridges seen from
further off don't run in steps. A skirt hangs two metres down round each chunk's edge, so where
chunks drawn at different spacings meet no gap shows between them. Where the ground's steeper
than about 33°, rock shows through the grass, all rock by about 45°: a rock texture seven metres
across laid from the side and from above, as the slope faces, at two sizes turned against each
other so it doesn't repeat; and within 8 m of the camera, fading out by 28 m, the light and shade
of a copy four times finer (1.7 m across, turned again) laid over them (`ROCK_DETAIL`), so rock
close by isn't a blur: two more texture reads, on rock alone and only that near. The rock's
picture (painters.js `rock`) is broad faces of broken stone, each a shade of its own, their edges
wavering, with bedding layers running across them, broad blotches and a fine grain; long cracks
along only some of the faces' edges, each its own depth and broken off here and there, finer ones
fainter; and pale flecks of crystal and lichen. (It was blotches and grain with dark cracks
wandering all over it, in loops, from close by like worms.) (A town on its own, in the labs, has one flat mesh under it all,
carrying on 110 metres past its edges into the fog.) A small "splat" texture, four texels to a metre made
from the chunk's squares (and three more round it, so the edges blend across chunks as if there
were none), says how much road, cobbles, soil and courtyard earth is at each point, with soft,
ragged edges, the same wherever the world's cut; the grass beside a road is worn to the road's dirt,
about a third of it right beside it (the eight squares round it) and half that a square further
off, as raggedly as the edges' noise has it (terrain plan M7b: `WORN`), so a road frays into the
grass rather than stopping at a line (mipmapped, so a far road's ragged edge, many
texels to a pixel, doesn't crawl as the camera moves); the shader blends tiling textures by it over
grass, each at its real size (cobbles about 16 cm across). The grass's own picture (a copy every
5 m) is read without its repeats showing (`UNREPEATED`, after Inigo Quilez's "texture repetition":
two copies, each shifted and every other one turned on its side as a broad noise has it, blended,
their mip level from where they're read so there's no seam where the shift changes: one more
texture read a pixel); before, its darker blob and band showed past the tall grass as a
checkerboard of 5 m squares and stripes along the world's lines (the user's photo by an aqueduct).
That noise (the patches', 61 m a copy, turned off the world's lines) also shades everything a
little lighter or darker, and wanders the lands' edges. The grass takes its land's colour
(`LAND_COLOURS`: a little yellower in farmland, darker in the woods, dark in the darkwood, pale
gold on the savannah, rust in the badlands, ash grey on volcanic land, grey on mountains, white
with snow, sand on beaches), from one texture of the whole world a texel to the plan's cell,
blended between cells, with the edges wandering 26 metres or so so the cells don't show. Every
chunk's ground shares one shader; chunks of grass alone share a material too.

**Few enough textures for a phone.** A phone's GPU lets one shader read only so many textures (an
iPhone's 16; this machine's browser allows 32), and a shader that reads more doesn't compile
there, so nothing it draws is seen. The ground reads its tiling textures (the grass, the kinds of
ground over it and the rock: `TILE`) from one texture array, and the land's maps from two
(`landLayers`: its colour and its grass afar, in sRGB; its two homeland maps and its farmland),
14 textures in all with its water, shadow and the sky's light (it read 22, and wasn't drawn on an
iPhone). A browser test walks out of the start town and fails if any shader drawn on the way
reads more than 16.

**Fields** (`core/fields.js`, the user: "Plowed ground is organized into fields"): farmland is
laid out as it's farmed, not ploughed in patches. The land's cut into blocks about 72 metres
across (`FIELDS`), their edges wandering by as much as 18 metres so no two are the same size,
each farmed if the land at its middle is farmland. A verge of grass 2 metres wide runs inside
each block's edges (4 metres of it between two blocks: where hedgerow trees grow, the land's
own things lie and the plough turned). About one block in five is left as pasture, grass all
over; the rest are in parallel strips, all of a block's one way (east to west or north to
south), 8 to 20 metres wide as its block has them, a metre's baulk of grass between each and the
next, and grass where a block runs out with no room for another. Each strip's its own crop
(`CROP`): ploughed (a third of them), wheat, barley, greens, or fallow (grass). Ploughed and sown
strips are soil, their furrows running along them (the soil's texture turned for a block's strips
running north to south); the ground under a sown strip is its crop's colour (`CROP_COLOURS`),
its furrows showing through, so the strips show far off and on low quality, and the crop stands
in it as tall grass (*Tall grass*, below). Each chunk keeps its squares' strips (`chunk.crops`: a
byte each, its crop and which way its strip runs), from the world's seed and the squares' whole
metres by integer hashing alone, the same in every browser; the ground reads them from a small
texture a texel a square (`fieldsOf`), its chunks with fields only. Trees aren't planted in the
strips (on the verges, as hedgerow trees), and of the land's own things only haystacks and
scarecrows stand in them. A hedgerow runs along each farmed block's edges (its first row and
column: `hedgeAt`; kits/hedges.js), one continuous wall of small hawthorn leaves: here trimmed
flat-topped and straight-sided, there rounded, there grown out tall and shaggy, from a metre and
a third to nearly two and a half tall and a metre to a metre and two thirds thick, all of it
changing slowly along its length (`HEDGES`); darker towards its foot and in the hollows between
its lumps, lighter and yellower along its top, flecked with blossom. Half the blocks' edges have
a gateway four metres wide in them, and a hedge breaks where a road, water or a settlement's
ground meets it. Its body is a profile swept along each run of it a ring every half metre (a
metre on low), its face pushed in and out by smooth noise from where it is in the world, so a
run carries on into the next chunk without a seam; rounded off over a few rings where it ends;
drawn with a tiling picture of leaves, lit as one soft mass, casting shadows. Sprigs of leaves,
cut out of their picture as the trees' leaves are, stand out of its top and sides, sixteen a
metre (half on low), so its outline is leaves, not a line. Nothing else grows in it (no
undergrowth, no tall grass); the drawing's alone, in no one's way.

**The fields seen from afar** (terrain plan M7b-2c; `ground.js FIELDS_GLSL`, `FIELDS_AFAR`): past
where the chunks' ground turns to the ground as it's seen from afar (100 to 150 metres), and in
the far land to the horizon, the fields go on: the ground's shader works out each point's field
and strip itself, in the same 32-bit integer hashing as `fieldAt` and from the same numbers, so
it agrees with the rules metre for metre (a test draws the GPU's fields over farmland and checks
every metre against the core's). It needs only the world's seed and which of the plan's cells are
farmland (`landColours`' `farm`, a texel a cell). Each strip is its crop's colour on its soil
(fallow and pasture its grass); past 250 metres the baulks between strips are left out (a metre
of grass there is less than a pixel), and past 300 metres the verges and hedges along the blocks'
edges are a dark band, where the hedges themselves are no longer drawn. On medium and high
(`QUALITY.fields`); on low the far land stays the farmland's colour.

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
- **Stone bridges** (kits/bridges.js; where they are, WORLD.md *Roads*; the terrain plan's
  M7i-2, from the user's photos of a packhorse bridge, a rubble bridge with a ring of dressed
  stones round its arch, a row of arches of coursed stone and Tower Bridge): as grand as their
  road (`GRADE_OF`, `STONE_BRIDGE.grades`).
  - **A track's packhorse bridge:** narrow, humped over one high arch (or two), of warm grey
    rubble, its arch ringed with long thin stones, its low parapets topped with stones set on
    edge, a tall one and a short one in turn; a few tufts growing out of them.
  - **A road's:** one to three arches of rubble, each ringed with dressed stones, rounded
    cutwaters of dressed stone on its piers, its parapets coped with slabs, a pillar at each end
    of them.
  - **A trade road's:** a row of lower arches of light grey coursed stone, pointed cutwaters
    carried up to a string course at the road's level, coped with slabs; near a capital or a
    city, a gate tower over its middle pier (or on the bank, over one arch): corbelled out a
    little past its faces at the road's level, the road through it under a round arch ringed
    with dressed stone, small pointed windows up it, a slate roof and a turret at each corner
    under its own spire.
  - **Its arches** (`archesOf`) spring 0.3 m over the water, from 0.6 m onto each bank and from
    piers 1.4 m wide, their crowns under the deck; each a segment of a circle as wide as its
    grade's arches span for how high they rise (three times on a packhorse bridge, 2.6 on a trade
    road's), or a half circle springing higher if it's narrower. Round each, on each face, its
    own stones (voussoirs): long and short in turn, each its own shade, standing a few centimetres
    proud, a deeper keystone at its crown; under it, its vault.
  - **Its stone** is old (atlas.js AGED: moss in its joints and on what faces up, streaks down
    its faces), three new pictures in the atlas (`rubble-bridge-old`, `stone-bridge-old`,
    `dressed-old`); dark and green-brown along the waterline (fully up to 0.3 m over it, fading
    by 0.9 m), darker under its arches, greener on what faces up. The ground under a stone bridge
    is drawn as it is under a timber one (its cobbles are the deck's).
  - **What grows** at its ends (`bridgeGrowth`): its land's plants (no pebbles, bones or sticks)
    along the foot of its walls on each bank, thicker by the water; none in the snow; grown with
    the land's undergrowth (no more draws), as thick as that's drawn.
  - **Cost:** 2,700 to 4,000 triangles a bridge, built in four steps as its chunk is drawn (2 to
    3 ms each once the game's warmed up), merged with the buildings' atlas into a draw or two a
    chunk, casting shadows.
- **Stone steps** (kits/steps.js), up the trails' steepest stretches (WORLD.md, *Trails*): a
  stone across the path for every 18 cm of its climb, its tread 0.3 to 0.9 m deep (the gentler
  the climb, the longer), reaching 15 cm past the path's edges; one stone or, as often as not on
  a wide one, two side by side. Each tread stands just over the path at its back, so none of the
  ground shows through it; past the path's edges a stone goes into the bank, or stands out over
  the ground falling away, set 20 cm into it. The ground under them still rises smoothly (it's
  what's walked, and what the navigation mesh is made from), so a walker's feet are at most a
  step's height into a tread. Of old stone the colour of the land's rock (`STEP_STONE`: the
  ruins' coursed stone, its moon, black and lime stones on pale, dark and red rock), so the
  atlas weathers them as it does the ruins: moss on the treads, streaks down the risers. A
  chunk's steps are one mesh, drawn with the atlas (one draw, and one more for shadows): on seed
  1, 49 of the 247 chunks the trails cross have some, at most 206 stones (2,472 triangles), 557
  triangles on average.
- **Cliffs** (kits/cliffs.js; the terrain plan's M7h), where the ground's too steep to climb:
  before, a smooth slope with rock painted on it; now a skin of rock standing out of it.
  - **Its shape:** the ground's own, on a lattice 2 m apart, each point moved a little off it
    its own way (so no grid shows) and pushed out along the ground's normal by how steep it is:
    from 36° it begins to stand out, by 41° it's all out; gentler than that it sinks half a metre
    under the ground, so it has no edge. Out by 0.35 m at the least, more in the rock's bedding
    (a ledge jutting at the foot of each layer every 5.5 m of height, the layers tilted and
    wandering across the land), and broken into buttresses 13 m across and crags 6.5 m (nothing
    finer than the lattice draws, or it's spikes). A cell whose side climbs more than 2.5 m has
    that side split (up to six pieces) and its triangles fanned from its middle, so a sheer
    face isn't one long sliver; each side's split the same in the cells either side of it.
  - **Its colour,** each point's own (so they blend, no face standing out): its layer's own
    shade, darker up under the ledge above, moss on what faces up in a green land, snow on it
    high up or in the cold; where it's hardly a cliff, at its brow and its foot, the ground's
    colour beside it (its land's grass and a third painted rock), so where it comes out of the
    ground no line of rock shows. Scree lies at the cliffs' feet: chips of the same rock where the
    ground eases off below a cliff.
  - **Its picture,** the land's rock (pale, red or dark where the land's is), three times the
    size it is on a boulder, laid on from three sides by where each pixel is in the world, each
    side's as much as the rock faces that way (`cliffMaterial`): a skin bent every way can't have
    a picture laid flat on it without seams or smears. Each patch of rock (about 9 m) reads it
    from a place of its own, two blended where patches meet (Inigo Quilez's "texture
    repetition"), and the rock's lighter and darker in broad patches, so its copies don't line up
    in rows. Most pixels read the picture four times, six at a corner.
  - **The same either side of a chunk's edge** (worked out from the world, not the chunk: the
    ground's heights read from the chunks round it, fetched first, one a step). Never on a road,
    a bridge, water or what's built. Only what's drawn: it stands on ground no one walks (or sinks
    under where they could), so the rules don't know of it.
  - **Cost:** a chunk's cliffs are a mesh of their own (one draw, and its shadows), made a few
    rows at a time (at most 4 or 5 ms a step, 20 to 30 ms a chunk all cliff), up to about 4,700
    triangles; 24,000 to 77,000 in the mountains round the player on seed 1. None on low quality
    (the rock's still painted on the ground there): lowered to low while playing, those drawn are
    hidden, and shown again when it's raised; a chunk drawn on low has none till it's drawn again.
- **Arches of rock** (kits/arches.js; placed by core/arches.js, WORLD.md *Arches of rock*): a
  fin of rock with a hole worn through it, as real ones are (Delicate Arch, Arch Rock on Mackinac,
  the red sandstone arches): its legs blocky and layered, its top level or bowed, a little
  lopsided, what's fallen from it lying about its feet and, as its land has it, what grows on it.
  - **Its shape:** a field of distance to the rock (`rockField`, worked out in its own frame:
    along the fin, up, and across it), meshed by surface nets on a 0.6 m lattice (`rockOf`). Its
    crest runs from the ground beyond each foot (as far as that foot `reach`es) up and over, steep
    or rounded at each end; the hole through it worn to the opening between its legs' squares,
    springing from a quarter to over half of its height, its crown as high as it `rise`s; over
    it a cap of rock 1.8 to 3.4 m deep (at least a sixth of its span), level, or bowed down at its
    middle (most of them a little, some a lot). 1.6 to 2.4 m through, tapering up its legs and
    flaring at their feet, wandering and leaning a little. On it: beds 0.9 to 1.6 m deep, some
    standing out as ledges, some worn back, the harder ones capping it; joints cutting it into
    blocks; knobs (4.5 m and smaller) and pocks. Some (two in five, where a foot reaches far
    enough) have a small window of their own worn through beyond one leg. Below a person's head
    it's kept inside its legs' squares (what's walked round is what's blocked), and whole over
    its opening. 4,000 to 6,000 triangles, worked out in 35 to 100 ms in Node, made a little each
    frame as its chunk is drawn (about nine pieces), so it never stalls a frame.
  - **Its colour and picture** are the cliffs': each point's bed a shade of its own, moss and
    snow on what faces up, the land's rock (red in the savannah and badlands, pale on the heath)
    laid on from three sides (`cliffMaterial`); darker in its hollows and under its overhangs
    (how open each point is to the sky, along its normal).
  - **What's fallen from it** (`fallen`): five to eleven big blocks against its legs, round the
    edges of their squares, and 10 to 44 chips of scree about it, thicker by its legs, some under
    its span; each sat on the ground, a little of it sunk.
  - **What grows on it** (`growthOf`): its land's undergrowth (tufts, heather, bracken, ferns,
    cotton grass, dry grass, thistles and cacti, as the land has them; no pebbles or bones): on its
    ledges and top, and round its feet; plenty in a green land (heath, mountain, tundra, beach),
    less in a dry one (savannah, badlands), a little on the volcanic land, none in the snow. Drawn
    with the land's undergrowth (one more draw), at the qualities that's drawn at.
  - **Drawn at every quality** (its legs are in the way whether it's drawn or not), a mesh of its
    own in its chunk (one draw and its shadows'), casting shadows; from afar, out to 2 km, its
    legs (each as long as its squares) and the rock over them as three boxes in its rock's colour
    with the other far shapes (far/shapes.js `archShapes`); on the minimap, its legs as thick
    strokes along the fin, as wide as their squares.
- **Broken aqueducts** (kits/aqueducts.js; placed by core/aqueducts.js, WORLD.md *Broken
  aqueducts*): a row of piers of old pale stone across a dip in the human lands, round arches
  between them ringed with their own stones, and over them the channel that carried the water.
  - **A pier** stands from 0.6 m into the ground to the channel's floor (or, broken, to a jagged
    stump of blocks, ivy hanging from it on one side or both, six times in ten), a band of dressed
    stone round it where its arches spring (its impost).
  - **Its arches** (`archesOf`): half circles from pier to pier, their crowns 0.9 m under the
    channel's floor, each ringed on each face with its own stones, long and short in turn, each
    its own shade, a few centimetres proud, a deeper keystone; under each, its vault. Where its
    piers stand more than 14 m tall, a lower row of arches under the upper, a string course of
    dressed stone along its faces halfway up, and the lower row's top a deck of the piers' stone
    between them.
  - **The channel** over them: its floor, two walls 0.9 m high and 0.45 m thick, the water's
    way 0.8 m wide between them, and over it what's left of its cover slabs (a slab a metre or so
    long, each there about half the time), flush with the walls' tops.
  - **Where it's broken:** an arch fallen from between its piers leaves a stub springing from each
    whole pier beside it, its stones broken off and the wall over them broken lower; under it,
    its stone in a heap of blocks of every size, some half sunk; a fallen pier leaves a bigger
    heap where it stood, a broken one a smaller one at its foot.
  - **Its stone** is old (`stone-lime-old` and the bridges' `dressed-old`, weathered by the atlas
    as the ruins' is), darker towards its foot and under its arches, greener on what faces up.
  - **Cost:** about 3,000 triangles an aqueduct, each chunk drawing its own piers and the arches
    from each to the next (a pier at a time, each a step as the chunk's drawn: 1 to 8 ms), merged
    with the buildings' atlas into a draw or two a chunk and one more for its ivy, casting
    shadows. Drawn at every quality (its piers are in the way whether it's drawn or not); from
    afar, out to 2 km, a box for each pier standing and for each arch (far/shapes.js
    `aqueductShapes`); on the minimap, each standing pier a block, the channel a line on to the
    next where the arch to it stands, a fallen pier's rubble a smudge.
- **Hill citadels** (kits/citadel.js; laid out by core/setpieces/citadel.js, WORLD.md *Hill
  citadels*): the humans' castle, three walled wards one above another up its hill, each part
  built on its own and drawn by the chunk it stands in.
  - **Its walls** from tower to tower: where a wall holds up its ward's terrace, the retaining
    wall's face battered all the way down (1 in 6) and the curtain on it, one face of 18 to 24 m
    of masonry from below; the outer ward's battered at its foot. A string course where the
    terrace is and another under the wall-walk; battlements on the outer edge (merlons 1.4 m wide
    and 1.8 m high, 2.1 m apart, on a parapet 1.1 m high, a man's height and chest high: they were
    1 m cubes), a low parapet on the inner; arrow slits along the face (drawn near only).
  - **A crown of machicolations** on the inner wards' walls and towers, the gatehouses and the
    keep: stone corbels at the merlons' pitch in two courses, standing out 0.35 and 0.7 m, under a
    parapet standing out over them, its underside dark: the strong shadow line under every top.
  - **Its towers**, round and battered at the foot (down the terrace's face, a talus, where they
    stand at its edge); the outer ward's topped with battlements, the inner wards' with a crown
    and a steep cone of slate 2.6 and 3 times as tall as it's wide round (Saumur's), the inner
    ward's flying pennants.
  - **The outer gate** between twin round towers 4.5 m round, crowned, its house deep between
    them, its passage under a round arch ringed with darker voussoirs, its portcullis half raised,
    torches either side. **The moat** round the outer ward, round, the world's own still water
    (its shader, its shores, its depth): the outer wall and its towers rise out of it on their
    battered feet; its far side a curved wall of stone leaning back as it rises, darker where the
    water laps it, a coping of dressed stone along the glacis's edge, its back going down into the
    glacis (nothing to see under it), a short mown verge behind it. **The bridge** over it: from
    the gate the drawbridge let down, its leaf of heavy planks bound with iron, its chains up to
    the gatehouse over the gate; then a pier, and two stone spans on a pier between them to the
    gate tower, parapets along them, cobbles on its deck. **The gate tower** over its far end,
    standing out into the water from the far side and back over the glacis: square, battered at its foot, its
    passage under round arches with a portcullis, a crown of machicolations over its outer face,
    battlements round its other sides, a turret corbelled out at each outer corner under a cone, a
    steep slate roof, arrow slits, torches either side of its gate. **The inner gates** under
    gatehouses rising 4 m over their walls, 10 m wide and reaching 3 m into their wards, crowned;
    **a stair** up to each against its terrace's face, doubling back on itself: its first flight
    along the outer lane from beside the gate away from it, a landing, its second back up the
    lane against the wall to a landing before the gate (steps 0.18 m high and 0.36 m deep, 3.5 m
    wide, each built down into the ground), parapets along its open sides.
  - **The inner close**: the great hall (tall walls, buttresses down its front with tall pointed
    windows between, a 55° slate roof between coped gables, a louvre on its ridge, its door under
    a porch); the chapel (its nave under a 55° roof, buttresses and lancets, its apse round under a
    half cone, a flèche on its ridge with a cross, its west door under a round window); and the
    keep: a battered plinth, string courses at each floor, two tall windows a face a floor, a
    crown of machicolations round its top and a steep slate roof behind; on two opposite corners a
    needle tower 2.5 m round rising 13 m over it under a spire 6.5 times as tall as it's round, a
    flag at each point; on the other two a bartizan corbelled out under a little cone; its door in
    a forebuilding up a few steps, torches either side. **Lean-to ranges** along the lower wards'
    walls: stone under a slate roof sloping down from the wall, windows, a door, chimneys.
  - **Cost:** about 37,000 triangles a citadel near (walls 17,000, towers 11,500, the keep
    2,400, the moat's far side 1,500, the gate tower and bridge 1,000), each chunk building its own parts a piece at a time as
    it's drawn (2 to 16 ms a part), merged with the buildings' atlas, casting shadows; its moat
    in its chunks' water. Its stone the atlas's (`stone`, `stone-dark`, `stone-warm`), its roofs
    `slate`. From afar (far/shapes.js `citadelShapes`, about 1,750 triangles): its walls boxes, its
    towers columns under their cones, a dark band where each crown's parapet stands out, its moat's
    water a ring of 24 flat stretches, the bridge and the gate tower, the hall and chapel under their roofs,
    the keep under its roof, its needles and bartizans.
  - **The ground round it** kept clear (WORLD.md *Hill citadels*): grass, no fields or hedges, no
    trees, near or seen from afar (the far fields' shader leaves them out inside `FIELDS_CLEAR`).
  - **Walked** (WORLD.md *Hill citadels*): over the bridge and through the gate tower and the
    gate on their decks, the player standing at their height; up each stair flight by flight,
    step by step (`CITADEL.stair` the rules' match for the look's `CITADEL_LOOK.stair`); its wards'
    open ground paved; the keep gone into by its forebuilding's door (`citadelWays` `door`).
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
- **Chimney smoke** (terrain plan M7c; `world/smoke.js`), in the settlements and the start town:
  from the houses' chimneys and the orcs' longhouses' smoke hoods, seven hearths in ten (the same
  ones every time), and always from a smithy's forge and an orc grog hall's crown, which smoke
  higher and a little wider (`SMOKE`). A column of nine puffs, each rising 8 m over ten
  seconds, spreading from 0.3 m to 1.7 m across as it goes, leaning on the breeze the higher it
  rises and wandering a little from its line; coming in as it leaves the chimney and thinning
  away at its top, billowing (noise drifting through each puff), lit from above and greyer as it
  thins. Each puff's a square turned to face the eye, where it is in its rise worked out on the
  graphics card from the trees' breeze's time, so nothing's sent each frame. The kits record
  each chimney's top as they build it (`solid.smoke`, kept in the built object's
  `userData.smoke`); a chunk's smoke, and the start town's, are one mesh each, with one
  material for all of it. Low quality draws half of each column's puffs and medium
  three-quarters, dropped evenly so a column thins rather than breaking up (`QUALITY.smoke`).
  In the start town: 11 columns, 99 puffs, one draw, about 200 triangles, casting no shadow.
- **Banners and flags** (terrain plan M7c; `world/cloth.js`), moving in the breeze:
  - **What hangs where:** the crown's long banners on a human keep's front either side of its
    door and on a castle's gatehouse and keep; the leaf's either side of an elven keep's door, the
    spider's on a dark elven keep's front, the sun's on a cat folk's keep; the orcs' ragged
    war-red and black war banners (a black hand on them) on their poles; the peoples' banners at
    their towns' ways out (WAR.md); and pennants, in the people's colour, flying from a human
    castle's towers and keep, a human keep's front turrets and a lizard folk palace's roof.
  - **How they move:** a banner hanging from a bar swings to and fro, more towards its foot (as
    much as 12 cm), ripples (4.5 cm), hangs in standing folds (one and a half across it), and
    its foot is carried a little downwind; one hung on a wall only stands out from it, a little,
    never into it (on a wall that leans in, the cat folk's, hung out from its top as far as the
    wall leans over its length). A pennant flies out from its pole on
    the breeze (the way the chimneys' smoke leans), waves running out along it, flapping more
    towards its fly, drooping a little at its end.
  - **How they're drawn:** each people's cloth (its colour darkened for its field, or the crown's
    red and the cat folk's indigo, whose own are lost on their walls; a trim of their colour,
    their emblem, a swallowtail foot), a plain swallowtail, a plain square, a ragged war banner
    and a pennant (white, tinted by the colour they're given) are painted side by side in one
    picture (`clothPicture`). The
    kits record each cloth as they build (`solid.cloth`, kept in the built object's
    `userData.cloth`: where its top is, which way it faces, how wide and long it is, its kind and
    look); a chunk's, and the start town's, are one mesh each (`clothMesh`), with one material:
    each cloth a grid of 6 by 8 squares (a pennant's 8 by 3), every corner of it where its top is,
    where it hangs and which way it faces worked out in the vertex shader from the trees'
    breeze's time, lit as the buildings are, both sides of it. Cut out of its picture (alpha to
    coverage). Its shadow falls where it is as it moves: its corners all lie at its top until
    the vertex shader puts them in place, so it's drawn into the shadow map by a depth material
    of its own running the same placing (`clothDepthMaterial`), cut out where the picture is. One
    draw a chunk with any (and one for the start town's), and one more into the shadow map: 288
    triangles on a human keep (two banners, two pennants), 576 on a human castle, 384 on an orcs'
    keep, 192 on a cat folk's (measured, drawn with them and without).
- **Awnings** (terrain plan M7c; `world/cloth.js` `awning`), over every market stall and a
  better-off shop's counter, of canvas in the wind:
  - **What hangs where:** a stall's awning (kits/props.js) runs from a rail 2.45 m up at its back
    out past its front, falling 40 cm as it goes, a valance 24 cm deep sewn along its front; a
    shop's (kits/house.js), on a house whose household is better off (`plan.wealth` over 0.4,
    two shops in three), reaches 95 cm out from a rail over its counter, falling 35 cm, held
    up by two iron rods, its valance 20 cm. A poorer shop keeps its upper shutter of boards
    propped up as an awning, as before.
  - **How they move:** pinned at its corners, an awning's middle lifts and settles on the
    breeze (as much as 7 cm, gusting), the canvas shivering a little; its valance swings and
    ripples as a banner does, a third as much.
  - **How they're drawn:** four looks (`AWNINGS`), red, blue, green or gold stripes on a pale
    ground (the gold on brown), each picked by the stall or shop, are painted beside the
    banners in the cloths' picture: eight stripes from back to front, paler towards the back
    where the sun's faded them, a seam where the valance is sewn on, the weave a little uneven,
    and the valance's foot cut in scallops, one to a stripe. An awning is drawn from the upper
    four fifths of its look's cell and its valance from the foot (`rows`), each a cloth of its
    own (kinds `awning`, 8 by 4 squares, and `valance`, 8 by 2) in the chunk's one cloth mesh, so
    they're no draws of their own. 96 triangles each, its shadow shading the counter under it;
    the stall's boards painted as stripes before are gone (24 triangles fewer), a shop's
    shutter swapped for a rail and two rods (about the same). The cloths' picture is four cells
    wider (1,792 by 224 pixels, about 0.6 MB more with its mipmaps).
- **Gardens, fences and washing lines** (terrain plan M7c; `art/kits/yards.js`), in the yards
  behind the peoples' houses (laid out with their towns: `layoutTown`'s `yards`, worked out once
  the town's laid out, from no draws of its own, so every town's laid out as it was):
  - **Fences** along a yard's sides and back where nothing stands (a tree, a pile of barrels, a
    building), and where two yards meet, only one: the humans' wattle hurdles between round
    stakes or posts and rails, the elves' clipped hedges, the dark elves' black stone kerbs with
    iron bars, the cat folk's mud walls, the lizard folk's reed screens, the orcs' sharpened
    stakes, each its own height. They're in everyone's way, as a wall is (the squares along them
    `blocked`, half a metre at a time, so the navigation meshes go round them), though not in
    anyone's sight. A yard is gone into by its **gateway** (`YARD_FENCE`): 1.6 m across,
    somewhere along the longest run of its back's fence if that's 2.6 m or more, or else of a
    side's, its gate swung open into the yard between stout gateposts (the humans' a barred gate
    braced across or a hurdle, the lizard folk's a panel of reeds framed in cane, the orcs'
    lashed stakes), the dark elves' an iron gate between black stone piers, the cat folk's an
    opening between two mud pillars, the elves' hedge just parted. About one yard in eight is
    left open (no fence at all), and where something stands in a fence's line (a tree, barrels)
    there's a way in round it too.
  - **Beds** (a third of the yards): the layout's soil, cut back clear of anything stood in it,
    raised in its people's edging (boards, pale or black stone, mud, cane; the orcs' heaped),
    planted in rows along it of what its people grow (`plantsOf`, each row one crop, spaced as
    it would be: `PLANTING`; a row in four bare): the humans' cabbages, leeks, runner beans up
    their canes, carrots, lettuces, onions, herbs, hollyhocks and marigolds; the elves' lavender,
    hollyhocks, lilies, herbs, chives, beans and lettuces; the dark elves' leeks, kale, lilies,
    herbs, chives and onions; the cat folk's squashes, peppers, onions, sunflowers, marigolds and
    herbs; the lizard folk's taro, squashes, peppers, herbs and leeks; the orcs' cabbages,
    turnips, kale and onions. Each is a plant, drawn as the undergrowth is (below; land
    "garden", eight looks of each from a seed): a cabbage's leaves cupped round its heart, a
    leek's fan of blades on its white shaft, carrot and turnip tops (the turnip's purple
    shoulders showing), beans climbing a wigwam of canes with their flowers and pods, a squash's
    great leaves and a gourd or two, sunflowers and hollyhocks taller than a man, peppers red and
    green, taro's elephant ears, lilies' trumpets, lavender's spikes, marigold and chive heads;
    each leaf stirring in the breeze.
  - **Washing lines:** across the back of nearly half the yards with room for one (none where a
    tree stands in the way), on two posts, sagging, as many as seven pieces of washing pegged out
    along it in their people's colours (linen, unbleached, faded blue and red; the dark elves'
    violets, the cat folk's saffron and indigo), hanging and swinging in the breeze as the
    banners do (`world/cloth.js`, a grid of 4 by 4 squares each); the orcs' a rack of hides.
  - **Kept to the town:** a yard reaching past its settlement's edge into a river or a lake,
    under a bridge or over a road isn't there at all (`Settlements` drops it as it lays the
    settlement out in the world, its fence's squares unblocked: `settlement.yards`), so no fence
    stands in water or across a road.
  - **How they're drawn:** built by the kit as each yard's piece of the chunk (the start town's
    with the rest of it), on the ground as it lies under the yard (`lieOf`: its corners'
    heights), merged with the buildings into the atlas's material; their washing in the chunk's
    cloth; the plants grown with the chunk's undergrowth (`Overworld.yardsIn`, sowing), so only
    near the player, sinking away from 40 m, and every bed planted whatever the quality level
    (only the wild undergrowth thins). An orc's stakes, a dark elf's iron bars and gate and a
    washing line's rope are only worth drawing near (`Solid.near`), left undrawn past
    `DETAIL_NEAR`: a yard's fences and gateway are 64 to 880 triangles close by (by people; the
    orcs' stakes the most), 36 to 400 from further off; a plant 50 to 400 triangles (an onion
    80, a cabbage 200, beans on their canes 390), a bed's 10 to 220 plants 1,800 to 27,000
    triangles, and at most about 80,000 within 56 m of anywhere in the most planted human city
    (seeds 1 to 3). No draws of their own (but a chunk's cloth, where it had none: its
    washing); each piece of washing 32 triangles, casting no shadow; a new tint and two plain
    colours, no new picture. Built in a few milliseconds a yard, a piece of the chunk's
    buildings at a time.
- **Each people's castle, special places and watchtowers** (core/sites.js: WORLD.md), each
  whose middle is in the chunk, built by its people's kit as a settlement's pieces are (the
  humans' castle a hill citadel, each part drawn by the chunk it stands in: *Hill citadels*; their
  abbey, windmill and manor as their landmarks).
- **The land's own features** (core/wilds.js places them: see WORLD.md, *The world in chunks*;
  kits/wilds.js draws them), one mesh a chunk with the atlas, casting shadows:
  - boulders (granite, pale limestone, red sandstone, black basalt; mossy in the woods and
    marsh, snow on their tops in the snow and the mountains, flecked with lichen), each longer
    than it's broad, lying along the way the rock runs there, sunk a fifth of its height into
    the ground as the earth's built up round it over the years, among a few smaller stones
    strung out along the same way (terrain plan M7b: core/wilds.js `CLUSTER`), rocky
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
    bluebells in the woods, cotton grass in the marsh and tundra; and carpets of them on the side
    of a hill that faces the sun (`CARPETS`, terrain plan M7b: where slow noise 70 metres across
    says, a little on the flat and none on the shaded side; as many again and more, most of one
    kind, the kind changing every 160 metres or so, the grass among them fewer);
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
- **Tall grass** (terrain plan M7b; `world/grassmap.js`, `world/grass.js`), thick over the open
  land round the player, knee to waist high: a field, as the Elden Ring's are, not tufts on a
  lawn.
  - **Where, how tall, how dry** (`grassMap`, a texel a square metre of each chunk, the same
    every time): only on open grass (no road, ploughed strip or yard, nothing standing, no water
    or bridge); as thick and tall as its land grows it (`GRASS_LANDS`: a meadow's thick and knee to
    waist high, a savannah's tall and golden, the woods' thin, none on snow), its lands blended
    across their cells' edges; in clumps and in tall and short stretches (slow noise); golden
    where the ground's own dry patches are, greener where they're lush, none where it's worn
    bare; thinner on steep ground and up towards the rock, and short and thin in a settlement.
    Its tips' colour is the land's grass's, turned to straw as it's dry. Ordered round what's
    there (the research report's "ordered layers"): thicker and taller in a ring two metres
    round what stands (a rock, a tree, a wall's foot: `GRASS_RINGS`), where the scythe and the
    sheep don't reach; trodden short, thin and yellowed within a metre or two of a road or a
    path, then thicker and taller at its verge, two to five metres off (`GRASS_PATHS`); drier
    and thinner on the side of a hill that faces the sun, greener on the shaded side
    (`GRASS_SUN`, `sun.js`). (These read the chunks round it as well, so a chunk's grass is
    worked out once the eight round it are drawn too, the same every time.) In the
    fields' strips (*Fields*, below), their crops (`CROP_STANDS`): wheat waist high and golden,
    barley a little shorter and paler, greens low and leafy, sown thick, all of a height and
    upright (the map's alpha says it's sown; none on ploughed strips).
  - **Drawn on the GPU**, three draws: each band one clump of blades (eight, each bent in two,
    inner; ten, near; eight single wider blades, far) drawn once for each cell of a lattice round
    the player. A
    clump's cell is its own spot on the land, the lattice wrapping round as the player goes, so
    nothing moves but at the bands' edges; where in its cell it grows, which way its blades lean,
    how tall each is and how green, from a hash of its cell. The blades stand on the ground as
    it's drawn (its heights round the player in a texture, read in the vertex shader), lean out
    from their clump's middle and with the breeze, darker at their feet. The far band takes over
    from the near over the near band's last fifth and sinks into the ground at its own edge. The
    inner band (terrain plan M7j-2; medium and high only, 6 and 9 metres round the player) grows
    its clumps among the near band's, closer together (0.35 m apart to the near's 0.5), so the
    grass round the player, where the camera looks closest, is about two and a half times as
    thick, thinning out to the near band's alone over its outer half. Each band's lattice is
    centred a little ahead of the player the way the camera looks. No alpha: opaque blades, so
    Apple's GPUs draw nothing behind them.
  - **In the wind** (terrain plan M7j-2; `world/wind.js`, `GRASS_GUSTS`): the blades lean the way
    the wind blows (`WIND_WAY`, the way the smoke leans and the flags fly), and where a gust is
    passing (`windGust`: patches of stronger wind about 9 m long downwind and 16 m across,
    travelling downwind at 5 m a second and changing shape as they go; at any moment about a
    fifth of the land in one) they lean half their height further, are pressed a quarter lower
    and stir harder, their tips up to 60% paler as they bend: a wave running through the grass
    and through the standing crops. Past the blades, the ground's grass look and the fields'
    crops are paler the same way (`ground.js GROUND_GUSTS`, worked out at the ground's corners),
    so the waves run on across the meadows and fields out of the grass's reach. The undergrowth
    tosses harder in a gust and leans with it (`atlas.js WILDS.gust`), and the trees' leaves stir
    harder and lean downwind (`kits/trees.js TREE_GUSTS`). Every gust's worked out in the vertex
    shaders from where it is and the breeze's time, so nothing's sent each frame; the hash it's
    made from is in whole numbers, so the GPU's gusts are just the ones `windGust` gives.
  - **The ground under it** is darker and the grass's own colour as thick as it grows, so the
    gaps between the blades read as more grass (`ground.js GRASS_UNDER`).
  - **Past where it's drawn, and on low** (terrain plan M7b-2c; `ground.js GRASS_AFAR`), where no
    blades are, the ground takes the tall grass's look so the land doesn't turn to lawn: each
    land's grass (`grassLooks`, a texel a cell of the plan: its tips' colour, dried as the land
    is, and how thick it grows) as dark as the grass drawn is in the mass (its blades' bases and
    the shadows among them), in clumps, golden in the dry patches, none where it's worn bare or
    up in the rock, and lighter and darker as the grass's picture is, more so, so it isn't a flat
    colour. It fades in over the far band's last stretch as the blades fade out, and the far land
    carries it to the horizon. One more texture read a pixel.
  - **Its map** is worked out for the nine chunks round the player as they and the chunks round
    them are drawn, a few rows at a time in 2 ms a frame (a chunk's about 10–20 ms in all), into
    a texture four chunks a side that wraps as the player goes.
  - **Cost** (the meadow by the river on seed 1, the software renderer, relative only): about
    100,000 triangles more on medium (330,000 to 430,000) and 210,000 on high, two draws; none on
    low. The inner band about 31,000 triangles more on medium and 67,000 on high, one draw; the
    gusts a little more work for each blade's corners and the ground's, and a multiply a pixel.

- **Motes** (terrain plan M7b; `world/motes.js`) drift in the air round the player, each land's
  own (`MOTES_OF`): pollen over the meadows, fields and heath, dust over the dry lands, the woods
  and the mountains, fireflies over the marsh and in the jungle, pale wisps in the elves' woods
  and the darkwood, embers rising over the volcano's ash, snow falling on the snowfields. One
  draw of a few hundred soft glowing dots (300 on medium, 600 on high, none on low), each where a
  hash of its own puts it in a box 28 metres across round the player, drifting on its land's
  breeze and wandering about it, wrapping round the box as the player goes and fading towards
  its edges; fireflies and embers flicker. Crossing into another land, one kind fades out and the
  next in; none indoors.

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
the way they face. Indoors, the view (`setIndoors`) has a dark background and closer fog, the
light from all round dimmed, the sun shining in at the room's windows on its sunny side (none for
a room without windows), and the room's flames flickering, each lighting it
(world/roomlight.js): the two lighting the player most are the view's two point lights, lighting
the folk and everything else too, and the rest light the room's walls, floor, ceiling and
furniture from a list in their shaders. The two point lights are always in the scene, out (at no
intensity) outdoors, so that going in and out never makes Three.js recompile every lit material's
shaders.

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
walls of plaster on a stone footing between timber posts under a beam, with leaded windows and
curtained doorways; flagstones in the taproom and planks upstairs; and a beamed ceiling over
every floor (below). In the taproom, the
tables with candles, tankards and plates, and benches; the bar, with tankards along its top, and
behind it two tiers of casks on a stillage, each with a brass tap, and shelves of tankards; the
hearth, a stone chimney breast with a mantel, logs and embers, three flames and a boar on a spit
turning slowly over them; two wheels of candles over the tables and a lantern over the bar;
and the stairs, two metres wide, twelve steps and a
handrail rising 3 metres along the north wall. Upstairs, rugs, the counter with a velvet runner, a ledger, a
bell, a candle and a vase of flowers, a chaise longue and side table, the stairwell with its
rail, and four bedrooms with canopied beds (their drapes red or purple), washstands and chests,
lit by red-shaded sconces; at an inn, whitewashed walls, beds hung in green, blue and ochre wool
and linen, and plain glass in the sconces. Each floor is built by its style (`map.style`), each
taproom with its own walls (`map.finish`). Everything that doesn't move is drawn from the atlas, as
the buildings outside are (atlas.js `atlasVariant`: their textures lit as relief, what shines
shining, cut away in front of the player as below): a mesh for the walls, one for the ceiling and
one for the rest, only the glass in the windows, the candle flames, the roast and the lights
apart, and the flames' glows and the beams of daylight each one more. That's 6 to 15 meshes a
floor, where each material was a mesh of its own (23 to 43), and nothing painted for
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

**Ceilings.** Every floor has its ceiling, 3 metres up (`STOREY`), each people's own way
(`CEILINGS`): the humans' of limewashed plaster between joists half a metre apart, carried on great
beams across the room every 3 metres or so; the orcs' dark planks on round logs; the cat folk's
reed mats over palm-trunk vigas; the lizard folk's reeds on bamboo poles over beams; the elves' a
pale ceiling with slender ribs; the dark elves' black stone on heavy charred beams. Over the
taproom's stairs it's open, trimmed with timbers, a dark well going up out of sight. The wheels
of candles hang from it on three chains to a ring and a chain up to a hook, and a smithy's lantern
hangs on its chain. What of the ceiling is lower than the camera isn't drawn (`cutsAway`'s
`ceiling`): from under it, it's all there; from over it (the camera looking down into the room, as
it starts), none of it, so the room's seen as before; and with the camera at its height, it's cut
level with the camera, edge on, so it never pops in or out. While the camera's over all of it,
it isn't drawn into the view at all (the interior's `seenFrom`: its geometry's to draw none but
for the sun's shadows), rather than every pixel of it worked out and then thrown away, which cost
software drawing nearly twice as long a frame; it still casts its shadow, so the sun comes in
only at the windows. Boxes have no undersides unless
they're to be seen from below (Solid `box`'s `under`): the ceiling's boards, joists and beams, the
beams along the walls' tops, and the heads of windows and doors do.

**Windows and daylight.** Windows are openings in the walls (`walledIn`: the wall built under
their sills and over their heads, the posts either side standing clear of them), 1.2 metres wide,
from 0.95 to 2.3 metres up, framed in timber through the wall's thickness, with a sill, a mullion
and leaded glass: diamonds of glass in lead, each a little different, the sky's pale light in it,
the sun's warmer on the sunny side, and by night the night's dark sky (`NIGHT_PANE`). The glass
casts no shadow. The sun shines in through the
windows on the side with the most of them (the south's, east's, west's, north's first, if as
many: `daylightOf`), 35 degrees up and 18 round to one side, the walls' and ceiling's shadows
leaving only the windows' patches of it on the floor and the walls opposite, split by their
mullions; and through each sunny window a beam of it shows in the dusty air (`shaftsOf`: the
window swept along the sunlight to the floor), brightest at the window, fading to the floor and at
its edges, motes drifting through it.

**Flames.** Every flame lights the room (`lighting.flames`, as each is built: `lit`): each candle
(on the tables, the bar, the counter, beside the beds, before the shrines), each wheel of candles
(as bright as its candles), each sconce and lantern, and each hearth's or forge's fire, its own
colour, flickering its own way (roomlight.js `strengthOf`; a forge's flaring as the bellows are
pumped). A room with more than 16 has its nearest candles of a kind taken together, as bright
(`gather`). The two lighting the player most, as a point light would, are the view's two lamps
(`pickLamps`: one already lit kept unless another lights them half as much again), lighting the
folk; the rest light the room's own materials, the same sums three.js does for a point light
(`roomLit`, after its lights in their shaders: the two lamps' left out, so nothing's lit twice;
the rest listed one after another, `ROOM_LIGHT.count` of them, so each pixel works out only the
room's own, not all 16).
And their light comes back off the walls, floor and ceiling (`fillOf`: their colours times their
strengths, over the floor, `BOUNCE` times that), so a room's never black past their reach and the
more flames, the brighter. Each flame has a soft glow round it, its colour, a little unsteady, no
bigger on the screen than a phone draws a point, and none where its flame's cut away (one drawing
a floor). The lamps each people lights (`LAMPLIGHT`) colour its wheels and candles.

The hearths' and forges' fires and every candle's flame (on the tables and in the wheels) are
world/fire.js's, as out of doors, cut away as the rest of the room is; each fire's and candle's
light rises and falls as its flame is drawn (`strengthOf` with its seed and rate: the same signal
by the drawing's clock), and embers rise from the hearth. What stands in front of the player is taken down, so they're
always in view whichever way the camera looks: a strip 5 metres wide
from them to the camera (`INTERIOR_CUT`: the player's position, the direction to the camera and
the floor's bounds, set each frame by `cutFor`). In it, the walls (and what's on them: posts,
beams, lintels, doorway curtains, windows, sconces, the chimney breast and the door) come down to
their stone footing (built apart, and never cut), a whole square's length at a time, as each
square's middle is in the strip or not (the walls round the edge counting as the square inside
them), so a wall is never sliced along its length; and anything else above head height (1.7
metres: bed canopies, the shelves over the barrels) that's no more than half a metre over the line
from the camera to the player's head, so looking up from low down, a wheel of candles overhead
stays. Every other wall stands full height, so the
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
  counter of boards, its goods set out: a striped awning over it if the household's better off
  (moving in the breeze: *Awnings*), or else the upper shutter propped up as one.

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
  the chimney stack (up a gable end outside, or through the roof) and dormers. A stack outside
  never goes up the front gable, across the door and the name board or sign over it: a house
  with its gable to the street has it up the back one.

  Its weathering is painted on its corners: dirt splashed up the foot of the walls, damp rising
  up them (darker and a little brown-green to 0.15 m, gone by 0.95 m) and, on a wall facing north
  as the house stands, a little green in patches low down (to 0.4 m, gone by 1.8 m: terrain plan
  M7j-3, `peoples/kit.js` `wallWeather`, the same on every people's houses: `weathering`'s
  `facing`; none on a tent), shade under the eaves and jetties and in the reveals, streaks, moss
  on the roof where it faces north, and each house's limewash a little its own colour. Kept,
  not let go: the ruins' moss and ivy curtains are theirs alone. About three cottages in ten have
  a patch of ivy climbing a bare stretch of a side or back wall from its foot (`ivy.js`
  `ivyClimb`, `CLIMBING`: 1.1 to 2.4 m across, up to 0.55 to 0.9 of the ground floor's height,
  lower to its sides; never on the front, nor within 0.3 m of an opening, nor across the middle
  of a gable end where a chimney may stand), from its own random numbers so the rest of the house
  is as it was: about 16 triangles a patch, drawn with the chunk's ivy. A colour worked out at
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
- **Special buildings** (kits/landmarks.js), each from its piece of the layout. Every people's
  name boards and hanging signs are clear to see from the street (`test/signs.test.js` looks at
  each of them from in front, from below, from 30° either side and, a sign hanging out from a
  wall, from 30° and 55° along the street): nothing of the building stands before them, its
  lamps, braziers and beam ends beside or below them, a hanging sign's stay tied up to the wall
  above its bracket (or propping it from below, short of the sign), never across it, and each
  picture a little in front of its frame's face, never in it:
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
    and a door of dressed stone up two steps between two long banners of the crown (stirring in
    the breeze: *Banners and flags*), the crown's sign by it, and the crown's flags flying from
    its two front turrets.
  - **The church**: built to a grammar of Romanesque and Gothic (`world/art/kits/church.js`), as
    grand as its place (`core/setpieces/pieces.js` `churchOf`, from the settlement's size):
    - a village's **parish church**, Romanesque: thick walls with small round-headed windows,
      pilaster strips and a corbel table under the eaves, a buttress at each corner, a round
      apse, and a squat tower over the door under a low stone pyramid;
    - a town's **church**: a nave over lower aisles lit by a clerestory, buttressed between the
      aisles' windows, an apse; Romanesque (round arches, a low pyramid on its tower) or Gothic
      (pointed arches, stepped buttresses with pinnacles, a many-sided apse, a spire of eight
      faces between four pinnacles), as its seed falls;
    - a city's or a capital's **minster** (and an abbey's church), Gothic: a west front between
      two towers and their spires, a rose window with stone tracery over a gabled portal, a tall
      clerestory held up by flying buttresses from pinnacled piers over the aisles, a many-sided
      apse, and a slender spire on its ridge.

    All of them on the same 12 by 16 m lot with the door where the temple inside is entered (up
    two steps in a portal of warm stone, round-arched or pointed under a steep gable), on a socle
    of dark stone; the Six's gilded sun of six rays on the spire (a minster's on the spire over
    its ridge), and the patron's sign by the door (the patron's emblem: Aurelia's sun, Brannoc's
    stag, Ithriel's star, Morvaine's lantern, Seliane's rose, Dunmar's anvil). The building lab
    shows one of each. From afar a church stands as tall as it's built, a minster with its two
    towers (`world/far/shapes.js` `FAR_CHURCHES`).
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
  with striped canvas awnings (in the breeze: *Awnings*) over counters of goods. (KayKit's models were the town's props before;
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
Windows are lit at night (`WINDOWS`: their glass, plain, leaded, green or violet, and the
lanterns'; not water or obsidian): a warm glow from within, flickering a little as a hearth's or a
candle's light would, on the glass and not its leading (Day and night, above). Each window has a
seed of its own (1 to 15), worked out as its building's merged (its glass told apart as the
triangles that touch, the seed from where its middle is), riding on its layer too (2,048 times
it): through the dusk the windows come on one after another by their seeds, by the night's start
all of them; after midnight about a third go out, one after another; through the dawn the rest
go out, the last to come on going out first. A tavern's, a church's, a guild's and a keep's windows, and the lanterns,
are lit all night. The insides' windows aren't lit (they show the night outside).
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

The map the player is on from above, north up, in the top left corner of the screen, level with
the spellbook, journal, pack and menu buttons in the top right, any room along the top left
between them (a canvas, a third of the screen's width on phones, up to 188 pixels; on a screen
400 pixels wide or less, the gaps between the buttons 8 pixels, not 12): out in the world,
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
draws it scaled to fit, then which way the camera looks (a wedge from the player the way it looks
over the ground, or the way they face when it looks straight down: always the same size, 30% of
the minimap across and 63 degrees wide, however the camera's tilted or zoomed, fading out over
its far two-thirds: `LOOK`), where the player is going, the enemies (red dots, the target ringed), an icon over each building the
player has gone into and each place worth finding round them (below), and the player (an arrowhead pointing the way they face). A tap on it walks
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

**Places worth finding** (`core/places.js`; the terrain plan's M7.5) have icons too, wherever
they are: every site the world plan puts out between the settlements and every wild camp.
- **Their icons:** a castle (a tower under a flag), a manor, an abbey or temple (a church with its
  tower, also a ziggurat, the sun temple and the spider shrine), a windmill, a watchtower (also the
  starwatch and the obsidian spire), a people's great hall (the tree hall, the hatchery, the
  shadow gate, the fighting pit), a holy spring (the moonwell, the watering hole, the serpent
  pool), a great rock (pride rock), a totem (the war totem, the skull pit), ruins, a ruined
  castle, a cave's mouth, the dragon's claw marks, a shrine's flame, standing stones and a camp's
  tent.
- **Their rim** is the colour of who holds the place now (`PLACE_RIMS`): its people's gold,
  outlaws' red, the restless dead's pale green, a great beast's orange, grey once it's been
  cleared; a shrine, the stones and a camp keep their own.
- **Where they're shown:** on the minimap, those in its view, where each stands once it's been set
  down (a site's heart, sites.js `placedAt`; a camp where it's pitched, overworld.js
  `campPlacedAt`) and at its plan's spot till then. On the world map, only those within a chunk
  of where the player's been.

**Who holds them** is mixed by the war, a world at a time (`heldAtStart`):
- Each people's castle is theirs.
- Their other places (manors, abbeys, halls, temples, watchtowers and the like) are theirs, or
  outlaws' in about a third of them (`PLACE_TIMES.taken`, by the world's seed and the place's).
  Holy springs, pride rock and the war totem are theirs alone.
- A watchtower out in the wild, and a cave, are outlaws'. The ruins and the ruined castles are the
  restless dead's, the dragon's lair the dragon's, and the shrines and standing stones no one's.
- **Cleared and retaken:** once a place's occupiers are put to the sword (`War.clearPlace`, kept
  with the war: `places`, by the place's id, the turn it was cleared and how often), it stands
  empty for 120 of the war's turns (two days of the world's clock: `PLACE_TIMES.retake`), then
  it's held as it was at the start again (`holderOf`). A people's own hold isn't cleared.

**Held, in play** (`core/host.js` `#places`, `PLACE_BANDS`): once a player comes within 90 metres
of a place held by outlaws or the dead (not the ruined castles or the lair, which keep their own
masters: `LAIRS`), its band is put out round its heart, and let go again once every player's 180
metres off (back as many as ever the next time, unless it's been cleared).
- **As many and as strong as the place is big and its land dangerous:** 3, 5 or 7 of them by its
  size, one more for every 3 tiers of the land's danger (creatures.js `tierAt`), round the middle
  4, 6 or 9 metres off; outlaws (`bandit`), or the dead (M7.5c-3: their bones, their ghosts and
  a wraith, by turns: `bandFolk`, `skeleton`, `ghost`, `skeleton`, `wraith`, `ghost`), at the
  land's tier.
- **Their leader**, 2 tiers above them, stands in the middle: a bandit chief (`banditChief`, new:
  a big warrior with a sword, and better spoils) or a wight lord, the greater one of the dead,
  guarding their old relic.
- **They guard it:** each goes for anyone who comes within 10 metres of them (`guard`), and none
  wanders off; they don't count among the wild's creatures about a player.
- **The chest** stands by the leader on open ground (drops3d.js: the JMI 3D Toolkit's iron-bound
  wooden chest, client/models/jmi, MIT; a chest made in code till it's read, or if it can't be),
  locked while they hold the place (tapped: "It's locked fast, and its guardians still hold the
  place."). Once the last of them falls (the leader with them), the place is cleared (the war
  keeps it, and its rim on the maps goes grey), "The dead of … are laid to rest, for now" or
  "… is cleared of its outlaws, for now", and the chest is thrown open (the model's own opening,
  three quarters of a second) on a heap of gold coins (world/gold3d.js: some four hundred let fall
  one by one onto the heap, each coming to rest tilted as what's under it lies, so they lie over one
  another as coins heaped up do, a few on edge, a few spilt on the rim and the ground by it; gems
  and a goblet in it; the sun glinting off a coin here and there as you look) with a share for each
  player within about 40 metres (`rollLoot("chest")`: 25 to 60 gold, a third more for each tier of
  the land's danger above the first, `CHEST_GOLD`; a potion, a piece or two of gear in the livery
  of the place's people, a human's at the ruins and caves, now and then a fine sword or bow),
  theirs alone to take, for five minutes. The dead's chest (and a ruined castle's hoard) holds one
  of their old relics in each share too (progress.js `RELICS`, `rollRelic`: a legendary amulet or
  ring, its three bonuses rolled as any's are, named for whoever lived there long ago, "Signet of
  the Last King", "Reliquary of the Hollow Saint"), and the player's told of it by name ("The
  chest's open, and in your share an old relic of theirs: the Torc of the Drowned Queen. Tap it to
  take it.").
- **The guilds want them cleared:** an adventurers' guild offers a contract on a place within
  3 km of its town held by outlaws or the dead ("Put them to the sword", docs/WAR.md), done once
  it's cleared with the player there.
- **Gone into** (M7.5b-1: a cave, the dragon's lair, a broken watchtower out in the wild; M7.5b-4,
  the crypt under the ruins and a ruined castle's keep): its way in is a door as a building's
  (`sites.js` `entranceAt`: the mouth, the tower's door, the ruins' stair-house's, the breach in
  the ruined keep's front where its door was, kept clear of what stands in the way), its floors
  made the first time they're wanted (`insides.js` `addSite`, the key `site:` and the site's id;
  `caveRooms`, `lairRooms`, `cryptRooms`, `ruinRooms`, `towerRooms`), drawn as the buildings'
  insides are (`interiors3d.js`):
  - **A cave:** a passage in from its mouth (daylight in it) to a chamber, rock all round,
    earth underfoot; the outlaws' bedrolls and their fire, sacks and a crate, torches on the walls.
  - **The dragon's lair:** a great cavern of dark rock, the floor scorched, bones about it, embers
    glowing in its cracks, heaps of gold at the back.
  - **The crypt under the ruins** ("The crypt under Peningmoor Ruins"): down the stair, daylight
    at its head, into a vaulted aisle between two rows of pillars, ribs across the vault from
    pillar to pillar; its walls old dressed stone, two tiers of burial niches let into them, a
    skull or bones in some; stone tombs either side, lidded, a cross cut in each lid, one here and
    there pushed askew on the dark within; bones about the floor; at the back, in its apse, the
    dead's master by their chest, candles burning in iron stands either side (`t` a tomb, `k` the
    candles, `I` a pillar: interiors.js).
  - **A ruined castle's keep** ("The great hall of Jazeh"): open to the sky (`open`), its walls
    broken off along their tops, high and low, the daylight through tall windows where they still
    stand high enough; its flagstones, grass come up between them; two rows of pillars, some
    broken off short; heaps of what fell from its floors and roof (`m`, interiors.js), a charred
    joist across each; bones; at the back the dais and its two thrones of stone, one toppled,
    braziers burning either side, the wight lord before them by its hoard; the land outside seen
    over the walls.
  - **A broken watchtower:** below, flagstones, old stone walls, the stairs up, rubble, a torch by
    the door; above, boards, a broken parapet, open to the sky (`open`: the view keeps the sky),
    its walls falling away to the ground far below.
  - **Who's within** (`host.js` `#inside`): the band's chief and their locked chest at the back of
    the cave or the crypt or the top of the tower (the plan's "l" and "h"), as many of the band as it has room
    for guarding the way in (its "g", half the band at most), the rest outside; the band's held
    while a player's within. Put to the sword, the chest's shares lie where it stood, inside, for
    the players there (in or near it), and the guild's contract is done for them; a player within
    is told the place is cleared ("The dead of Peningmoor Ruins are laid to rest, for now.") as one
    outside near it is.
  - **A ruined castle's wight lord** keeps within its keep's great hall by its hoard (`LAIRS`
    `within`), half of each kind of its dead with it (three skeletons, two ghosts and a wraith,
    each at a post of its own), the rest in the courtyard; slain, the hoard's opened as the
    dragon's is, an old relic in each share.
  - **The dragon's hoard** lies at the back of its lair, a chest locked while the dragon lives
    (`#lairs`); once it falls, it's opened, a share for each player there (`LOOT.hoard`: 180 to 320
    gold, potions, a ring and maybe an amulet, now and then a masterwork sword or bow).
  - Its sound's its own (`sound.js` PLACES: a cave's, the lair's and the crypt's hushed, the
    tower's and the ruined keep's open).
  - **The humans' abbeys and manors** (M7.5b-2): gone into by the door of the temple or the keep
    each is built round (`sites.js`: their landmark's `entranceOf`, the way kept clear), the same
    temple and great hall as a town's (`insides.js` `add`, keyed `site:` and its id; named for the
    place: "Galingdale Abbey", "Brombridge Manor"). Its people's, its folk are in it: a priest,
    an acolyte and worshippers; the manor's lord or lady on the throne ("Lord of Brombridge
    Manor", speaking for the realm of the town nearest it), their steward, councillors and
    sentries. Held by outlaws, none of them (`host.js` `#notTheirs`): the band's chief before the
    altar or the thrones, the chest beside it, guards up the aisle from the door (`insides.js`
    `heldWithin`, for plans without the marks), the rest outside; put to the sword, it's empty a
    while, then held again.
  - **The peoples' watchtowers and the elves' tree hall** (M7.5b-2b; `insides.js`
    `STRUCTURE_DOORS`): each people's watchtower has a door in its foot (the humans' round tower,
    now on its own three plots, with a stone frame, a step and a torch; the cat folk's under a
    timber lintel; the elves' an ogee, the tower turned a side to the front; the dark elves' a
    lancet; the lizard folk's a red portal at the foot of their stepped lookout; the orcs' an open
    deck on poles, none). Within, kept, not broken (`watchtowerRooms`, the art's `look` "kept"):
    below, a guardroom, its walls whole and its door shut, the racks of their arms by the stairs,
    a table and benches, barrels, a torch either side of the door; above, the parapet whole and a
    brazier burning. Its people's: a lookout going round the top, a sentry below by the door
    (speaking for the realm of the nearest town of their people's). The elves' tree hall is gone
    into by its door into a great hall as a keep's, in their marble and green, its lord or lady
    on the throne ("Lady of Caeliavyn Tree Hall"). Held by outlaws, as an abbey or a manor is.
    The other peoples' own places stay open to the sky (the pits, the hatchery, the spider shrine,
    the spire, the shadow gate) or have no way in at their foot (the sun temple's behind its
    altar, the ziggurat's at its top), their bands outside.
  - **The peoples' castles walked into** (M7.5b-3; `setpieces/castles.js`): the elves', the
    orcs', the cat folk's and the dark elves' castles are no longer solid all through. What of each is solid is
    laid out as its kit builds it (the elves' seven towers and the walls between them, the
    pillars of their gate and the great tree; the orcs' bank and palisade, the bastions either
    side of its gap, the motte, the longhouse and the hut; the cat folk's curtain walls, corner
    towers, gate tower, planted beds, fountain and tower house; the dark elves' black wall and
    eight towers, the two slender towers either side of their gate with a web hung between them,
    the spiders before it, the terrace in the middle), and its courtyard within is open
    ground walked into through its gate (4 m wide at the least, so it's walked through at any
    turn the castle's set down at): flagstones (the orcs' trodden earth) through the gateway and
    all within, nothing grown in it (`sites.js` `courtAt`; the dark elves' dark cobbles). Each
    has its keep, gone into from the courtyard: the elves' the tall tower at the back of their
    ring, an ogee door in its foot between two lamps, facing the great tree and the gate; the
    orcs' their longhouse, the clan's hall, by the door under the porch in the middle of its
    south side, a step up onto its plinth; the cat folk's their tower house, by the door in the
    middle of its front; the dark elves' the Black Tower on its terrace, up stairs on the
    terrace's south face, between two violet lamps (gone into from the stairs' foot: the walking
    mesh is the land's, the terrace not on it); the lizard folk's their palace up on the
    platform of their temple-fortress, by the middle of the three doors in its south face (gone
    into from the end of the causeway: the platform, its courtyard and its moat aren't walked).
    Within, the keep's great hall: its lord or lady on the throne ("Lord of
    Sassmau Castle"), their steward, councillors and sentries, speaking for the realm of the town
    of their people's nearest it (`insides.js` `townOf`). The humans' castles, hill citadels
    (WORLD.md *Hill citadels*), walked into over their bridge, through their gate tower and up
    the stairs from ward to ward, their keep gone into by the door of its forebuilding.
  - **The undercroft** (the terrain plan's M7.5c-1; `insides.js` `CASTLE_KEEP`, `UNDERCROFT`,
    `undercroftFolkOf`; world/interiors3d.js `undercroft`): a people's castle's keep (not a
    town's, a manor's or the elves' tree hall's: `siteKind`) has its armoury below its great
    hall. The stairs go down from the hall's north-west corner, where its racks were, a stone
    parapet round the stairwell. Below, 24 by 16 metres under a groin vault on four pillars
    (pilasters where its bays meet the walls; not drawn while the camera's over it, as a
    ceiling): the castle's forge in the north-east as a smithy's (the forge under its hood,
    bellows, anvil, quenching trough, grindstone, coals and workbench: `forgeworks`), its smith
    and apprentice at work there; the quartermaster behind their counter before the castle's
    racks of arms, a suit of armour on a stand either side; the garrison's long table and its
    benches between the pillars; the arcanist behind theirs in the south-west, their shelves of
    jars and phials of coloured glass against the south wall, their worktable beside it (an
    alembic over its lamp, books, a crystal ball, a mortar and pestle, candles); barrels along
    the west wall and strongboxes in the corner; lit by the forge, four torches on the walls and
    the arcanist's candles. What each sells is in WAR.md (*Shops*); the smith talks of the
    garrison's mail and the lord's horses (`castleSmith`), the quartermaster of where the steel
    comes from, the arcanist of what they're brewing and why they don't sell tomes. Heard
    further off than the hall (`sound.js` `undercroft`). The stairs between the floors have
    their foot below and their top above whichever floor the door opens into (insides.js
    `make`). `NET_VERSION` 37.
  - **The smaller places' shops** (M7.5c-2): an abbey that's its people's has its herbalist, a
    brother or sister of its order in a plain habit, behind a counter in the north-west corner of
    its nave, their shelves of jars, phials and books on the wall behind (`insides.js` `ABBEY`;
    the town's temples as they were), turning to their shelves now and then; talking of their
    garden (`herbalist`). A people's watchtower that's theirs has its quartermaster by the racks
    in its guardroom (`watchFolkOf`), who sends anyone after better to a castle
    (`watchQuartermaster`). What each sells is in WAR.md (*Shops*).

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
- **The pin** (the terrain plan's M7g): held still somewhere (550 ms, moving less than 8 pixels),
  a pin's dropped there if the player's been there (one pin: a new one moves it; under the fog
  the map says "You haven't been there: drop a pin somewhere you've been", and the game itself
  won't take one there, `setPin`), shown with the
  way to it from where they are, a glowing blue line; held on the pin, or its button (a pin with
  a cross, by the zoom buttons), it's taken away. It's kept with the character (save.js
  `loadPin`), not the world: each player's is their own. Out in the world (world/pin3d.js
  `PinMarks`) it's a round column of blue light rising 900 m from where it stands (a strip turned
  to the camera, never thinner than about ten pixels, light rising slowly up it; additive, no
  shadows), drawn in the near pass where it's within the near camera's reach and in the far pass
  above that and out past the far land (brought in to the far camera's reach and shrunk as much,
  a little fainter through the haze), so it's seen from anywhere, day or night; a glow on the
  ground round its foot; and a thin, half-transparent, glowing blue line along the ground from the
  player's feet the way they'd walk (a strip 0.3 m wide just over the grass's roots, light running
  along it towards the pin), only along a way that can be walked (below), for up to 180 m (past
  that the column shows the way). Four draws.
- **The way there** (core/journey.js `wayAcross`): found over the world plan's cells (32 m), not
  the navigation meshes (whose tiles are baked only round the players: kilometres of them would
  stall the game). Each cell's ground is worked out once a world, in about a tenth of a second
  (`crossingsOf`: while loading, with a pin kept): the sea and lakes not crossed, nor a river but
  at a ford or on a road's bridge (a mountain stream's waded anywhere), nor a step from one cell's
  middle to the next climbing more than 37°; a metre along a road counts for 0.6, through a
  stream 1.6, across a ford 2.5, and a climb for more (A*, eight ways from each cell, the same
  every time). The way's then pulled straight wherever one cell can see another across ground of
  its own kind. Across the world it takes 3 to 40 ms; it's good enough for the map, but at 32 m
  a cell it goes straight through buildings, trees and walls. So the line on the ground is only
  ever the navigation mesh's way (over the tiles there already, none baked for it: `wayIn`,
  `nearestIn`), round whatever stands in the way: from the player to the point on the mesh
  (within 6 m) nearest the way across the world 160 m along it, or failing that 120, 88, 64, 40
  or 20 m along (to the pin itself, nearer than that); none at all until some can be found. On
  the map, that near part, then the rest of the way across the world. It's found again as the
  player moves (at most every 0.3 s, once they've moved a metre), every 1.5 s while it falls
  short (as the tiles round the player come in), and across the world again once they're 40 m
  off it.
- **Tapped twice** (two taps within 350 ms and 18 pixels; not while picking somewhere for
  Wizard's Walk): the place is the player's destination, run to as a double tap in the world would
  (app/journey.js `Journey`): the map closes and they run (walking on once out of breath) a leg at
  a time, each an order to a point on the way 72 m ahead, over the navigation mesh, the next sent
  as they near its end. If they stop getting nearer for 5 s or stray 48 m off it, the way's found
  again from where they are, twice at most; then they stop and are told the way's blocked. Anything
  else the player does ends it. If there's no way there at all, the map says "A path cannot be
  found" and nothing's done; from indoors, "Step outside to set off".

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
reach about −31 to −37 dBFS at their loudest, footsteps about −52, and the music averages about
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
  boards (upstairs in the tavern), soft, under the blows and the world round them (`FOOTSTEPS`:
  a walk's about a ninth of a slash, a run's under a fifth), a little louder running; everyone's
  alike, the player's, the other players', the folk's and the creatures'.
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
Blister (E) and Stun (W) on an enemy's (`WHEELS`: the elements' greyed until their tomes are
read, docs/MAGIC.md, and a flick at one says where the tome's sold); everything else starts
empty, until the player puts something there in **Game
options, Action wheels** (app/wheelsetup.js). There, tabs choose whose wheel and which side;
the wheel's drawn as it opens in play, and tapping a slice lists what can go in it
(`assignable`): "Nothing", and what's been learnt and is carried. Tapping S turns it over, as
flicking it does. What's on the wheels is kept with the character (save.js `pellagos.wheels`),
and read back safely (`readWheels`: only what goes on each wheel, in its seven slices). A skill
ranking up with an ability says to put it on a wheel.

### The quick actions (app/quickbar.js)

In a fight, four slots rise from the bottom of the screen side by side (`QuickBar`), sliding up
in 0.28 s, and the player's name and the zoom buttons go up with them, 10 pixels above (the
HUD's `quick-up`). A fight is an enemy the player's set to fight (the one ringed), or anyone
hostile on their map set to fight them or striking at them (`#underAttack`); the slots stay up
3 s after the last of it (`QUICK_LINGER`), so they don't come and go between blows, and go down
at once if the player falls.

**What's in them.** Each holds anything a wheel's slice can (a spell, a blow, a thing to use;
not Fight): Vigor, Stun, Burn and a healing draught to start with (`QUICK`), shown with its icon
and name, a count for a thing to use, and a line along its foot saying who it's used on (red,
the foe; green, the player). They're kept with the wheels (`pellagos.wheels`'s `quick`, read
back safely by `readWheels`: four, each something that can be one, or empty).

**Tapped** (or 1 to 4 on a keyboard), a slot's used at once, with no wheel to open:
- an attack, a hex or a blow (`offensive`: what goes only on an enemy's wheel) on the enemy the
  player's set to fight;
- anything else (healing, a ward, a draught, a spell that finds its own mark) on the player.

It's greyed while it can't be used as things are (`#quickRefusal`): not learnt (an element's
spell before its tome's read), none left to use, a blow for another kind of weapon or a spell
needing a wand or grimoire in hand, or an attack with no enemy set on (anyone can be after the
player without one being set on: the slots are up, and their attacks greyed). While it cools
down it's greyed over the share of its cooldown left, swept round from the top and back as it
passes, as a wheel's slice is (one spell's cooldown is all the spells', `#cooldowns`). Tapped
while it can't be used, it flashes red and says why ("Tap a foe first: that's used on them",
"You've none left", "Not ready yet"); an empty slot tapped opens its choices.

**Changed** by holding a slot (0.5 s, `QUICK_HOLD_MS`; sliding off it does neither): the game
pauses (when no one else is playing in the world) at **Game options, Quick actions**
(app/quicksetup.js) with that slot chosen, and Back to the game carries on. Quick actions in Game
options shows the four slots as they rise; tap one, then what goes in it: "Nothing", or anything
learnt and carried that can go on either wheel (`assignable("quick")`), each saying who it's
used on ("On your foe", "On yourself").

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
   and each group of files has its own row and bar: the 3D engine, the ways over the world
   (Recast), the game's code, the body and its shapes, its skin details, the lettering, and the
   things in the world (the treasure chest's model). The data is kept in memory and handed
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
   the game. Its count ("120 of 202") is of steps known before it starts: each chunk round the
   player (counted as it's drawn, however many goes it takes), each piece of the town and its
   trees, each floor of the tavern, everyone dressed before the first frame (the orc, soldiers,
   creatures, anyone else playing) and five more; it never passes its total, and ends on it. (The loading screen is drawn before the world starts to be built, so a tap on
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
   turns them the way the camera looks (over the ground) and sends them straight ahead that way,
   running while their stamina lasts and then walking (an `ahead` order, which turns them as
   well as setting them off), with the ring where they'll stop; blocked straight away, it's
   refused with a sound (still turned that way). That same `ahead` order is what held input comes
   out as (app/steering.js): W, A, S, D or the arrow keys, and a thumb stick in the bottom left
   corner. Forward is read off the camera, as the swipe up reads it, so turning the camera turns
   what forward means while a key is still down; two keys together give the way between them, and
   a stick's angle goes through whole, so diagonals need nothing of their own (which is why a
   stick suits this where four buttons wouldn't). The order is given again as that way turns (past
   about 7 degrees), when the walk or run changes, and every half second besides; a `stop` order
   goes when the last of the input is let go. So no held key crosses the wire, only the way it
   adds up to, and the host still decides where they get to. Shift held along with a way runs, as
   a Shift-click does, and so does the stick pushed past seven tenths of its reach. The stick
   keeps to its corner rather than springing up under the thumb, and only its own circle takes
   touches, so the rest of the view taps and drags as before; Thumb stick in Game options takes it
   away (the keys steer without it), and a pause lets go of whatever was held. The heads-up display
   (app/hud.js) shows the player's name and health in the bottom right corner (the thumb stick in
   the bottom left; the zoom buttons, which Game options leaves off, take that right corner and
   send the card up above them; all of them go up over the quick actions in a fight, above), with an orange
   stamina bar under the health bar while stamina isn't full, "Out of breath" when a run
   ends for want of it, the minimap (in the top left corner; the spellbook, journal, pack and
   menu buttons in the top right), bars over the other characters (the target's lit red, and
   over the rest), and the damage each blow does. A bar's smaller the farther its character is
   from the camera than the player is, a little more gently than the character itself looks
   smaller (twice as far, three fifths the size; four times, a little over a third; never under
   30%: `PLATE_SIZE`), so several the same way show which is nearer; the nearer bars are drawn
   over the farther, and all of them under the buttons.
5. **The menu** (the menu button, or Escape) pauses the game (unless others are playing in the
   world too): Resume, Invite others (the world opened to others: a code, and who's come),
   Game options, or back to the title. **Game options** has the Visual quality slider (Low,
   Medium, High) and the Adaptive switch (Keeping up, above), a switch for the minimap, a switch that turns all the sound
   on or off, and a slider (0 to 100%) for each bus: sound effects, environment and music (a
   sound plays as the first two are moved, to hear how loud); and the Action wheels and Quick
   actions pages. Back (or Escape) returns to the menu.

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
desktop): walking across the world, no frame's streaming takes over 8 ms there. The near camera
sees 160 metres; past that, the far land out to 1, 2 or 4 km (low, medium, high), in four to
eight more draw calls and about 50,000 more triangles (the view, *The far land and the haze*).
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
- `test/rooms.test.js`: the rooms' ceilings (over every floor of every kind, every people's, the
  whole room, at the storey's height; seen from below, their undersides facing down; open over
  the stairs, a dark well over them; the wheels of candles under them), drawn only where they're
  higher than the camera (and not at all while it's over them, but for their shadows), and only what's in the way of seeing the player cut away (looking up
  from low down, not what's overhead); the daylight from the side with the most windows, 35
  degrees up, reaching the floor of every kind of room through its windows, the glass casting no
  shadow, and its beams from the sunny windows down to the floor; every room lit by its flames
  (its fires first, no more than 16, the nearest candles taken together if too many), each with
  a glow; flames flickering and a forge's flaring; the two lighting the player most the view's
  lamps, one kept unless another's half as bright again, the rest listed for the room's shaders;
  the light coming back off the room; and
  the camera looking up indoors, kept inside the walls under the ceiling and anywhere over it.
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
- `test/governor.test.js`: the steps down from the quality chosen (fewer pixels, then the level
  below, to the lowest at half the pixels); a game at 60, or between 30 and 60, left as it is;
  below 30, a step at a time, not before it's played a while, settled at each; back near 60 a
  while, up again to the quality chosen and no further; a step that let it fall tried again only
  later, longer each time; a hitch now and then and a game stopped a while forgiven; carrying on
  from a game before, and back to the quality chosen when it's chosen again. E2E: told it can't
  keep up, fewer pixels then the level below, and debug mode and Game options say so; Visual
  quality chosen in Game options, drawn at it, every pixel, remembered; Adaptive off, remembered.
- `test/pacing.test.js`: how often the world's drawn: every other frame of a 120 Hz screen at 60,
  evenly; a 144 Hz one at 72 and a 90 Hz one at 90; 30 when asked; every frame with no rate, or when
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
- `test/neutral.test.js`: the sites no people keeps laid out the same for the same seed, within
  their plots, their hearts open; a ruined castle's pieces left to ruin and its gate's way open;
  every one on seed 1 set down, blocking only what stands, its heart open, lying with the land
  but for the ruined castles; those with trails facing them, each trail ending before its front
  on open ground; every part built within its budget; the castle's ruined pieces lower than they
  stood, each its own way where it stands, the same again; and seen from afar where they stand,
  shrines and stones not at all.
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
  steering by W, A, S, D (two of them diagonally, Shift running, letting go stopping) and by the
  thumb stick (walking pushed partway, running at its rim, stopping let go, gone and the keys
  still steering once Game options turns it off),
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
  wheels set in Game options (a draught put on wheel two, drunk by flicking down then NE), the
  quick actions on a phone's screen (the minimap in the top left corner, level with the buttons
  in the top right; up in a fight with the name and zoom buttons over them; Stun tapped on the orc and Vigor
  on the player, each swept over while cooling and refused; attacks greyed with no foe set on;
  put away 3 s after the fight; held, Quick actions opened at that slot, Rumble put in it), and a
  phone screen. Drawing without a GPU is slow, so fights are played on with
  `game.advance(seconds)`, which runs the game without drawing each frame.
