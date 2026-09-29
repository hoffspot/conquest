# The world plan

The game is growing from one market town into a whole world, 8 kilometres square. It won't be
built all at once: it's laid out first, from a seed, as a **plan** (`client/js/core/worldplan`).
The plan says what every part of the world is: its land, who lives there, and what lies between.
The world is built from it in chunks as the player comes near (*The world in chunks*, below).
Built again, the same seed gives the same chunk.

The plan is pure data: typed arrays and plain objects, with no DOM or Three.js. So it runs in
Node for the tests, and later in a worker. Laying one out takes about a second, so it's laid out
once for a seed (`planWorld`): the few most recently asked for are kept and shared, frozen so
nothing can change one for everyone else (`layOutWorld` lays one out afresh). Going back into a
world, or a test building it again, it's there at once.

See it at <https://hoffspot.github.io/conquest/world-map.html> (or `npm start` and open
<http://localhost:8080/world-map.html>). Try `?seed=12&race=orc` to choose the world and the start.

## Size and grid

| | |
| --- | --- |
| The world | 8,192 metres square (`WORLD_SIZE`), with the sea round it |
| The plan's cells | 32 metres (`CELL`), 256 a side: every layer is one value a cell |
| The chunks it's built in | 64 metres (`CHUNK`), 128 a side, each 64 by 64 squares of 1 metre |

**Layers** (one value per cell):

- `height`, `temperature` and `moisture`: 0 to 1;
- `water`: none, sea, lake or river;
- `biome`: the kind of land;
- `territory`: which people's lands, if any;
- `road`: none, track or road.

**Lists:**

- `places`: the settlements;
- `roads`: each as the cells it runs over, with its bridges;
- `sites`: ruins, caves, shrines and the like;
- `camps`: the enemies' camps.

Each place, site and camp has its own `seed`, for building it later.

## The peoples

Six peoples share the world. Each always lives in its own climate, but where its lands fall is
different in every world.

| People | Climate | Their lands | Their own buildings | Place names |
| --- | --- | --- | --- | --- |
| Humans | Temperate | Farmland, meadows and woods; heath where it's dry | Abbey, windmill, manor | Ashford, Brombury, Thornbridge |
| Elves | Mild and wet | Elfwood: the elves' old bright forest, meadows where it's dry | Moonwell, tree hall, starwatch | Silimere, Galadithas, Eleniawen |
| Dark elves | Cool and damp | Darkwood: gloomy forest; heath where it's dry | Spider shrine, obsidian spire, shadow gate | Velaeryn, Nyxazith, Malithlor |
| Cat folk | Hot and dry | Savannah: grassland with few trees | Sun temple, pride rock, watering hole | Rassari, Kakhan, Sharah |
| Lizard folk | Hot and wet | Jungle, and marsh where it's wettest | Ziggurat, hatchery, serpent pool | Oqsszul, Tlatzrith, Chakix |
| Orcs | Warm and very dry | Badlands; volcanic ash on the hills | War totem, skull pit, fighting pit | Drukugzag, Gorugash, Thrakadush |

Each people's `lands` (in `races.js`) says which biome their territory is, and whether a spot is
drier or wetter than their heartland. Hills in their lands get the people's hill biome. Patches of
woods, meadow or marsh break the lands up.

## The land (`terrain.js`)

1. **Heartlands.** One for each people is put anywhere at least 40 cells from the edge and at
   least 72 cells (2.3 km) from every other.
2. **Climate.** Each heartland takes its people's climate. Four wild places, as far from the
   heartlands as they'll go, take their own: two cold (frozen north), one sodden (marsh) and one
   scorched (waste).

   Every cell blends these, the nearer counting more, with a little unevenness. High ground is
   colder. So every people lives in its own climate, and the land between blends from one to the
   next.
3. **Height:**
   - rolling land everywhere;
   - mountain ridges that rise away from the heartlands, so ranges stand between peoples, not in
     their midst;
   - higher ground where it's cold;
   - the sea round it all, with a ragged coast.

   Heartlands are kept low hills, a little higher in the middle so rain runs off them. A volcano
   rises 30 to 38 cells beyond the orcs' heartland, towards the middle of the world, with ash
   fields round it. A faint ripple over all the land lets rain find its own way down.
4. **Rivers and lakes.** The land is flooded up from the sea (priority flood):
   - Hollows fill. A hollow at least a little deep, of 5 to 260 cells and not on a heartland,
     is a lake.
   - Bigger hollows are basins, with a river running through. Each cell of a hollow is filled a
     random little higher than the one before, so water finds a wandering way across it, not a
     straight line.
   - Each cell drains down the steepest way over the flooded land.
   - Rain is added up running down, more where it's wetter. Where enough runs, about 150 cells'
     worth, it's a river.
   - Every river reaches the sea, through lakes and other rivers.
5. **Territories.** Each people's lands spread from their heartland over land (not across the
   sea or a lake):
   - A step on the flat costs 1, more going up into the hills, and 3 to cross a river.
   - A people's lands reach as far as 54. Lands on the flat are about 1.5 km across from the
     middle; less against mountains.
   - Where two peoples' reaches come within 12 of each other, neither holds it. The **marches**
     between them are wild, and so are the far corners.
   - About 35 to 45% of the land is wild.
6. **Lands (biomes):**
   - water, and beaches by the sea;
   - snow on the peaks and cold heights; mountains on high ground (volcanic in the orcs' lands);
   - in a people's territory, their lands;
   - in the wild, the climate's: snow and tundra in the cold, boreal woods, savannah, jungle,
     badlands or volcanic ground in the heat, marsh where it's sodden, heath where it's dry, and
     woods and meadows between.

| Land | Where |
| --- | --- |
| Sea, lake, beach | Round the world; in hollows; by the sea |
| Farmland, meadow, woods, heath | The humans' lands; temperate wild land |
| Marsh | Sodden places; among the lizard folk's jungle |
| Elfwood, darkwood | The elves' and the dark elves' forests |
| Savannah | The cat folk's lands; warm wild land |
| Jungle | The lizard folk's lands; hot, wet wild land |
| Badlands, volcanic | The orcs' lands; the volcano and its ash fields; hot, dry wild land |
| Tundra, snow | The cold wild places; peaks |
| Mountain | High ground |

## Who lives where (`settle.js`)

**Settlements.** Each people has:

| Kind | How many | Spread (m) | Apart (cells) | Adventurers' guild |
| --- | --- | --- | --- | --- |
| Capital | 1, on the best land near their heartland | 200 | 30 | Yes |
| City | 2 or 3 | 125 | 24 | Yes |
| Town | 4 to 6 | 60 | 16 | Yes |
| Village | 6 to 9 (as many as fit) | 30 | 9 | Yes |
| Hamlet | 5 to 8 (as many as fit) | 18 | 6 | No |
| Farmstead | 6 to 10 (as many as fit) | 12 | 3 | No |

- Each is built on flat, dry land in their territory, better by a river or lake. They aren't built
  on beaches, mountains, marsh or volcanic ground.
- Two settlements keep at least the average of their "apart" from each other.
- Each is named in its people's tongue, from its starts, middles and ends. A name is never used
  twice in a world, and names with a part said twice ("Ingingwick") or three vowels together are
  passed over.

- **Hamlets and farmsteads** are settled last, with their own random numbers, so the rest of the
  world is just as it was before them. A hamlet goes anywhere dry in its people's lands, clear of
  everything else. A farmstead goes on farmland, a meadow, the savannah or heath within 12 cells
  of a town, city or village if it can, and elsewhere near one if not. Both keep 320 m clear of
  camps, like every settlement, and 5 cells from sites.

In all, a world has about 6 capitals, 15 cities, 30 towns, 40 to 50 villages, 30 to 40 hamlets
and 40 to 55 farmsteads.

**Roads:**

- Each people's settlements are joined by the shortest network, plus a couple more roads where
  going round by the network is much further. Roads to villages are tracks.
- The capitals are joined by **trade roads**.
- Each road is laid over the land the easiest way (A* over the cells). Going up and over woods,
  marsh, jungle, mountains, snow or volcanic ground costs more.
- Crossing a river is a **bridge**, and costs more.
- Following a road already there costs a third, so roads share their way where they meet. Trade
  roads are laid first, then roads, then tracks.
- Each hamlet has a track to the nearest bigger place of its people. Farmsteads have no road:
  they're reached over the fields.

**Sites** between the settlements, 5 cells clear of them and 8 from each other:

| Site | How many | Where |
| --- | --- | --- |
| Castle | 1 for each people | In their lands, by a road |
| Each people's own buildings | 1 of each of 3, for each people | In their lands |
| Ruins | 36 | Anywhere |
| Caves | 28 | Hills and rough land |
| Shrines | 26 | Anywhere |
| Standing stones | 14 | Heath, meadow, tundra, marsh, farmland |
| Watchtowers | 18 | By roads |
| Ruined castles | 5 | Only in the wild |
| A dragon's lair | 1 | Volcanic ground, mountains or snow, in the wild |

Ruins, castles and people's buildings have names.

**Enemy camps.** There are 72 camps, of eight factions:

| Faction | Likes | And near |
| --- | --- | --- |
| Bandits | Farmland, meadow, woods, heath | Roads |
| Wolf pack | Woods, tundra, heath, elfwood | |
| Goblins | Heath, mountains, badlands, woods | Caves |
| Giant spiders | Darkwood, jungle | |
| Restless dead | Marsh, heath, tundra | Ruins |
| Trolls | Mountains, snow, tundra | |
| Raiders | Badlands, savannah, volcanic | |
| Cultists | Marsh, jungle, darkwood, volcanic | Ruins |

- Camps are 320 m clear of any settlement's edge, and 14 cells from each other. Each is of a
  faction that likes the land there, more often one that likes what's near.
- Three camps are pitched round where a player of each people starts, 0.9 to 2 km away and
  inside their lands or out: the first a player meets.
- The rest are out in the wild and at the edges of the peoples' lands.
- Each camp sends out 1 to 3 **patrols**, which roam no further than 180 to 320 m from it
  (`roam`). So meeting enemies means their camp is somewhere near. Destroying a camp will make
  its area safer (in play: a later step).

**How dangerous a camp is** (`campTier(camp, start)`, tiers 1 to 8) is decided in play, from how
far the camp is from where the player started:

- tier 1 within 2 km of the start;
- one tier more for every 850 m further;
- tier 8 from about 7 km.

A player of any people finds at least three tier-1 camps near their start, and camps of tier 5 to 8
at the far side of the world.

## Starting, and the adventurers' guild (`plan.js`)

- **Where a player starts** (`startFor(plan, people)`): a player picks their people and starts in
  their lands, in the town nearest their capital. It has a guild branch.
- **Branches** (`guilds(plan)`): every capital, city, town and village has a branch of the
  adventurers' guild, about 95 in a world. Players will be able to travel quickly between branches.
- **Districts** (`guildFor(plan, x, z)`): each branch's district is the land nearer to it than to
  any other branch.
- **Points of interest** (`openGround(plan, branch, seed, count)`): a branch will make these up
  out in the open ground of its district, between the settlements. They're clear of
  settlements, roads, water, sites and camps, and the same from the same seed. This is where
  the guild sends adventurers, so the land between the settlements isn't empty.

**Other lookups:**

- `landAt(plan, x, z)`: the land, people, water, road and height at a point;
- `cellAt(x, z)`: the cell a point is in;
- `campTiers(plan, start)`: every camp's tier.

## The world map (`world-map.html`, `js/lab/world-map.js`)

- **Draws** the plan for a seed:
  - the lands, shaded as if lit from the north-west, with the rivers;
  - each people's lands, tinted and edged in their colour;
  - roads (trade roads widest, tracks dashed);
  - settlements (capitals ringed; guild towns edged heavier), with their names as you zoom in;
  - sites, marked by kind;
  - camps, as triangles coloured and numbered by tier from the chosen start;
  - optionally, patrol ranges and guild districts.
- **Controls:**
  - wheel or pinch to zoom, drag to move about;
  - point at anything to see what it is;
  - choose the seed, or another at random;
  - choose which people to start as.
- **Its address** remembers the seed and the people.

## The world in chunks (`core/overworld.js`)

`buildWorld({ seed, race })` lays out the plan, makes the town (`core/world.js`) and sets it in
where a player of that people starts (`startFor`), and makes the world outside, `Overworld`: a
map like any other (`core/grid.js`: blocked, opaque and ground for any square), all 8 km of it on
1-metre squares, made a chunk at a time as it's needed and kept (the last 256 used: about 5 megabytes), the same
every time it's made again. The game draws it round the player as they go (`world/chunks3d.js`:
see GAME.md). Each square of a chunk comes from the plan's cell under it:

- **The town**, where it's set in: its own squares, just as it was made.
- **The other settlements** (`core/settlements.js`): each capital, city, town, village, hamlet
  and farmstead is laid out by the town builder (`layoutTown`, from its own seed and kind, its
  main streets heading the ways its roads leave it) when the world within a chunk of its square
  is first made, and kept. The same place is laid out the same every time. Where it has
  something (its streets, its market or green, its buildings, yards and trees, and everything
  inside its edge), the world takes its squares; its fields are the land's own. Its buildings,
  props and trees are drawn with the chunk their middles are in (`piecesIn`).
  Each people's settlements are laid out and built their own way (`layoutTown({ people })`:
  GAME.md, *Towns*), the start town too: a cat folk's start is a cat folk's town. A lizard
  folk's lagoon is the world's water, its plank walks drawn as bridges.
- **Each people's castle, special places and watchtowers** (`core/sites.js`, `Sites`): the
  plan's castle for each people, their three buildings of their own (the cat folk's sun temple,
  pride rock and watering hole; the orcs' war totem, skull pit and fighting pit; the lizard
  folk's ziggurat, hatchery and serpent pool; the elves' moonwell, tree hall and starwatch; the
  dark elves' spider shrine, obsidian spire and shadow gate; the humans' abbey, windmill and
  manor) and the watchtowers, built at their size (`siteSize`: a human castle 18 by 16 plots,
  laid out by castle.js; a tower 2 by 2). Each is set down the first time a chunk near it is made
  (`settle`), at its cell's middle or as near as it can be (up to 48 metres off, in 4-metre
  steps round it) clear of roads and water, facing the nearest road within six cells; it takes
  the squares under it (blocked, and not seen through), and trees and the land's features keep
  6 metres clear of it. The same every time.
- **Lakes and the sea**, their shores blended from cell to cell across the cells' middles, a
  little ragged.
- **Rivers**: a line from each river cell to the cell it runs into (a lake or the sea beside it,
  or the river cell beside it that more water runs through), wandering up to 7 metres from
  straight, 3 to 10 metres wide, wider the more water runs in it.
- **Roads**, along the plan's roads, smoothed from cell to cell (rounded twice at each corner):
  trade roads 4.4 metres wide, roads 3.6, tracks 2.2. The roads from the town start from where
  its streets leave it. A road to another settlement stops 2 metres short of its square and
  waits: when the settlement's laid out, it's carried on to the end of the main street nearest
  where it comes in. Roads go round lakes, and cross rivers only on bridges: where a road runs
  over a river (looked for every half metre along it), a straight deck from 1.5 metres onto one
  bank to 1.5 metres onto the other, 0.4 metres wider each side than the road. Every square under
  it can be walked over. Where roads share their way over a river, the widest of their bridges
  (of those as wide, the westernmost). Bridges are found on the roads as planned, never on the
  bit carried on to a settlement's street, so a chunk is the same whichever chunks were made
  first (a test makes the chunks between the town and a neighbour in both orders).
- **The ground**: grass (drawn in each land's colours, and in each people's homeland, the
  plan's territory as first claimed, its own ground: GAME.md, *The ground*), soil in fields in
  farmland, road, planks on bridges.
- **Trees**, tried every 4 metres (a random way in): as many as the land has (`FLORA`, trees to
  100 square metres: a wood 0.9, the darkwood 1.1, jungle 1.2, a meadow 0.25, farmland 0.12, the
  badlands 0.04; beaches and water none), of its kinds (oak, beech, birch and apple in meadows;
  spruce and pine in the darkwood); in a people's homeland seven in ten are their own tree
  (`HOME_TREES`: the cat folk's acacias, the orcs' ironbarks, the lizard folk's willows, the
  elves' silverbarks, the dark elves' nightspires). Each keeps 2 squares from roads and water, 3 metres from the
  town, and 12 metres from the settlements, sites and camps still to be built; its trunk blocks
  the four squares round its point, and can't be seen through. A chunk's trees come from its
  own seed, the same random numbers used for every try, planted or not, so they're the same
  whatever's made round them.
- **The land's own features** (`core/wilds.js`), tried every 8 metres (a random way in) from
  the chunk's own random numbers, after its trees: boulders, rocky outcrops, fallen trees,
  stumps, dead trees still standing, bushes, cairns, standing stones, termite mounds, haystacks
  and scarecrows (in the fields too), log piles, ruined walls and a great beast's ribs. Each land
  has about so many a chunk (`LANDS`: none in water, 2 on beaches, 4 in meadows, 7 in the woods,
  9 in the mountains) of its own kinds, as likely as it says; they gather as they would, the
  rocky kinds where smooth noise across the world says it's rocky (and bigger there) and fallen
  wood where it's been let go. Each takes the squares under it (a boulder's disc, a fallen tree's
  line), and hides what's behind it if it's taller than anyone's eyes (1.65 m), so paths go round
  them and they can be hidden behind; it keeps two squares from roads, bridges and water, clear of
  the trees, the town, the settlements' streets and buildings and the places still to come, a
  square from the next feature, and three squares inside its chunk (so it never meets the next
  chunk's trees). In a people's homeland their own things are among them (`HOMELANDS`: the
  cat folk's termite spires and kopjes, the orcs' skulls on poles, stakes and the wrack of old
  fights, the lizard folk's mangroves and stelae, the elves' moonstones and leaf lamps, the dark
  elves' webbed stumps, cocoons and black crystal), a chunk having as many as its land's or
  three quarters of both together, whichever's more. A world has about three a chunk on
  average. The grass, flowers, pebbles and sticks between them are the drawing's alone
  (GAME.md, *The world outside*).

Water can't be walked into, but can be seen over. A chunk takes about 3 to 5 ms to make in Node,
its features about 1 ms more, and laying out a settlement 5 to 80 ms more (once).

## Next

The world's first phase is done: the plan, the chunks, the town builder (`core/setpieces/
town.js`: see GAME.md, *Towns*), every settlement laid out by it and set into the chunks as the
player comes near with its roads built to it, each people's own buildings, castles and special
places built their way, and each people's homeland its own ground, trees and things lying about.
Next: **sites to go into**, the ruins, caves, shrines and castles as places of their own.

Height on the ground (each cell's `height` shaping the land) is paused. Free terrain with a
navigation mesh isn't planned.

## Tests

`test/overworld.test.js` checks the world in chunks: blocked off its edges; the same chunks
however they're come to; the town set in just as it was made, with everything in it moved; its
streets carried on as roads, water blocked but seen over, bridges walked over; trees as thick as
their land has them, of its kinds, clear of roads and water; a way out of the town along the
roads across many chunks, found quickly; the player walking out into the world; and chunks made
quickly. Of the other settlements: every place but the start town, hamlets and farmsteads too;
laid out as the world near them is made, the same every time; a village's tavern, church, smithy
and guild; set in as they were laid out, their pieces each drawn with one chunk and their trees
grown; and the plan's roads carried on from their streets' ends. Each people's own trees grow
in its homeland, most of the trees there, and nowhere else. `test/wilds.test.js` checks the
land's features (GAME.md, *Testing*), each people's own in its homeland and only there.

`test/world-plan.test.js` checks, for three seeds:

- **Laying out:** the same seed gives the same world, another seed another, quickly.
- **Peoples and lands:**
  - each people's lands are big enough and in their climate (on average within 0.15 of it), with
    wild land between (20 to 50%);
  - more than half of each people's lands are their own kinds;
  - every kind of land is in every world, and the volcano is volcanic.
- **Rivers:** more than 90% of rivers reach the sea.
- **Settlements:** each people's are in their lands, on dry land, apart, named once each, with
  guilds in all but hamlets and farmsteads; farmsteads near a bigger place.
- **Roads:** every settlement but a farmstead is joined to its capital, and every capital to the
  others, over land and bridges.
- **Sites and camps:**
  - sites are where they should be, clear of settlements, and caves are mostly in hills;
  - camps are away from settlements and each other, of factions suited to the land, with patrols
    in range;
  - camps are never weaker further from the start: every start has tier-1 camps near it and
    tier 5 or more far off.
- **Starts and guilds:** each people's start is their town nearest their capital, and a guild's
  open ground lies in its district, clear of what's there.

`e2e/world-map.spec.js` opens the world map in a browser:

- it draws a seed's world and shows where each people starts;
- pointing at the start describes it;
- choosing another people moves the start;
- another seed lays out another world;
- zooming works.

`e2e/town-map.spec.js` opens the town map in a browser: it draws a town for a seed (with its
tavern and houses), a city bigger with more houses, and another seed another town.
