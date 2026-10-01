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
- `level`: the height water would stand at, the land's hollows filled to where they'd spill (a
  lake's or a river's surface);
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
  marsh, jungle, mountains, snow or volcanic ground costs more. (One way-finder lays all of a
  world's roads, about 150, in the same lists, each putting back only the cells it touched,
  rather than each road making and filling its own lists of all 65,536; and the queue that
  floods the land and finds the ways, `queue.js`, a binary heap, moves what's put in or taken
  out into its place rather than swapping it along. Laying out a world takes 0.7 s in headless
  Chromium, 0.84 to 0.9 s before; the same worlds, checked seed by seed.)
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
  - the lands, shaded as if lit from the north-west by the ground's own heights (see *The
    ground's height* below), rock too steep to walk grey, with the rivers;
  - each people's lands, tinted and edged in their colour;
  - roads (trade roads widest, tracks dashed);
  - settlements (capitals ringed; guild towns edged heavier), with their names as you zoom in;
  - sites, marked by kind;
  - camps, as triangles coloured and numbered by tier from the chosen start;
  - optionally, patrol ranges and guild districts.
- **Controls:**
  - wheel or pinch to zoom, drag to move about;
  - point at anything to see what it is, and how high the ground is there;
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
  is first made, and kept. The same place is laid out the same every time. A town takes tens of
  milliseconds to lay out, a capital up to two hundred (more on a phone), so the game lays out
  those within five chunks of the player ahead, in a worker (`world/layouts.js`), and gives them
  to the world (`give`), which takes one when it's first wanted if it was laid out from just what
  it would be laid out from here (`specOf`), and otherwise lays it out itself: the same either
  way, so everyone playing together has the same world, and in the same order. Where it has
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
  steps round it) clear of roads and water, facing the nearest road within six cells (each
  square's land looked at once however many tries it's under, and the squares that ruled out
  earlier tries looked for first: a castle that has to move is set down in a few tens of
  milliseconds, where it took up to a second); it takes
  the squares under it (blocked, and not seen through), and trees and the land's features keep
  6 metres clear of it. The same every time.
- **Lakes and the sea**, their shores blended from cell to cell across the cells' middles, a
  little ragged.
- **Rivers** (`terrain/waters.js`): each river cell runs into the cell beside it that more water
  runs through (or a lake or the sea beside it). Its course is a curve through the cells' middles:
  from halfway along the way in, bending round its own cell's middle, to halfway along the way out.
  It carries on from the cell above it that most water comes from; the rest join it from the side.
  - Each curve is drawn as four straight pieces, then wanders up to 7 metres more.
  - Rivers are 3 to 10 metres wide, wider the more water runs in them. They widen half as much
    again as they run out into a lake or the sea.
  - A river is deepest in its middle: 0.75 m, and 0.3 m more for each metre of half-width.
  - Each cell's stretch falls one of three ways:
    - **calm**: under 2 in 100. Its surface slopes steadily down.
    - **rapids**: under 8 in 100.
    - **steps**: steeper, or falling 2.5 m or more over a cell. Pools are held level, each
      under the land all along its stretch (looked at five times along it, where it lies in the
      world), and each spills over a lip into the next where the land under it drops at least
      0.6 m. A cell can drop at its very start, the cell above it ending with a lip down onto it.
      A high drop is a waterfall.
  - How fast a river runs comes from Manning's equation, from its depth and the fall of its
    surface. A pool's fall counts as 2 in 1,000, and the river bed is rougher the steeper it falls.
    - That gives about 0.7 m/s on a calm river, up to 4.5 m/s down rapids.
    - The water speeds up over a lip, and churns below it.
    - It runs fastest in the middle and is still at the banks.
    - It slows to a stop as it runs out into a lake or the sea.
  - **Fords:** about one in five calm cells of a small river (half-width up to 3 m) is a ford.
    Over the middle half of its stretch the river is 1.4 times as wide and 0.35 m deep over
    gravel, so slow and shallow enough to wade.
  - **Wading:** water up to 0.5 m deep, where its depth times its speed is under 0.6 (the
    flood-safety limit for an adult), can be waded: fords, and the shallows of lakes and the
    sea. Its squares are open, and the navigation mesh walks it as a ford. A river is waded only
    where it can be waded across (a ford), not along the shallows at a deep one's banks.
  - **Mountain streams:** every dry cell of the hills and mountains (half the plan's height and
    up) that 20 cells' rain or more runs through starts a stream. It runs on the way its water
    goes (to the cell beside it more runs through) until it meets a river, a lake or the sea: a
    thousand cells of them. Streams run as rivers do, in the same courses, reaches and steps, but
    are 1.2 to 2.8 metres wide and 0.3 m deep and 0.12 m more for each metre of half-width, with
    no fords. Being so narrow, a stream can be stepped across wherever it's shallow enough to
    wade, however fast it runs.
  - Every river's surface is no higher than the land at its cell's middle less 0.4 m, never
    below the sea's, and never higher than anywhere upstream. Each lake stands at one level:
    its lowest cell's, as low as the rivers running into it. A river running out into a lake or
    the sea is at its level from where it reaches it (a pool spilling over a lip at its shore,
    not out in it), and its bed there never rises off the lake's or the sea's floor.
- **Roads**, along the plan's roads, smoothed from cell to cell (rounded twice at each corner):
  trade roads 4.4 metres wide, roads 3.6, tracks 2.2. Where the plan's cells rise or fall six
  times a road's grade or more from one of its points to the next, that stretch (from three
  points before to two after) is found its own way over the land (`terrain/ways.js`): over a
  lattice of points 4 m apart, sixteen ways out of each, a step steeper than the road's grade
  costing dearly and one three times steeper not taken at all, nor any into a lake or the sea,
  and turning costing a little, so it climbs across the slope in long straight legs and
  hairpins, rounded at its turns. The roads from the town start from where
  its streets leave it. A road to another settlement stops 2 metres short of its square (on
  dry land: never in a river, so its bridge over it is its own) and
  waits: when the settlement's laid out, it's carried on to the end of the main street nearest
  where it comes in. Roads go round lakes, and cross rivers only on bridges: where a road runs
  over a river (looked for every half metre along it), a straight deck from 1.5 metres onto one
  bank to 1.5 metres onto the other, 0.4 metres wider each side than the road. Every square under
  it can be walked over. Where roads share their way over a river, the widest of their bridges
  (of those as wide, the westernmost). Bridges are found on the roads as planned, never on the
  bit carried on to a settlement's street, so a chunk is the same whichever chunks were made
  first (a test makes the chunks between the town and a neighbour in both orders).
- **Trails** (`core/trails.js`), foot paths 1.4 metres wide up to each cave, ruin, shrine, ring
  of standing stones, ruined castle and lair in the hills and mountains (the plan's height half
  and up) within 700 m of a road: found their own way over the land as steep roads are, at a
  walker's grade (25 %), within 96 m of the straight way, keeping out of the town and the
  settlements. So a trail up a mountainside zigzags up it in hairpins. The sites nearest a road
  are reached first, and each from its road or from a site reached already, whichever's nearer,
  so trails branch from one another rather than running side by side (27 on seed 1). Each is
  found the first time anything's wanted of a chunk its room reaches (`#roadsIn`), or ahead of
  then in the terrain worker (`world/terrains.js`: those within five chunks of the player) and
  handed over: the same way either way, so every player's world agrees. It's walked as a road
  and drawn as one, and levelled into the ground as roads are (below).
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

Water can't be walked into, but can be seen over, except where it can be waded. A chunk takes
about 3 to 5 ms to make in Node,
its features about 1 ms more, and laying out a settlement 5 to 80 ms more (once).

## Next

The world's first phase is done: the plan, the chunks, the town builder (`core/setpieces/
town.js`: see GAME.md, *Towns*), every settlement laid out by it and set into the chunks as the
player comes near with its roads built to it, each people's own buildings, castles and special
places built their way, and each people's homeland its own ground, trees and things lying about.
Next: **sites to go into**, the ruins, caves, shrines and castles as places of their own.

The ground is being given height, and the squares a navigation mesh, step by step
(`generated/terrain_navmesh_overhaul_plan.md`). The ground's height, the world standing on it, and
the navigation meshes are below; the squares are still squares, walked as before, with the
steepest blocked, and the meshes only shown (debug mode), not yet walked.

## The ground's height (`core/terrain/`)

`heightAt(plan, x, y)` (`height.js`) is how high the ground stands at any point, in metres: the
same wherever and whenever it's asked, and in every browser (nothing but `+ - * /`, floor and
square roots), so the rules, the drawn ground and a navigation mesh can all stand on the same land,
and so can every player's. Heights are whole 1/1024ths of a metre, so a `Float32Array` holds them
exactly. It's built up in layers:

- **The lie of the land.**
  - The plan's cell heights, read between cells with a cubic B-spline: smooth, and never
    overshooting.
  - Then into metres along a rising curve (`curve.js`): the sea at 0; the plains up to 25 m,
    rising 1 to 3 in 100; the hills to about 95 m; the mountains to 220 m; the peaks to 320.
- **Roughness, by kind of land** (`ROUGHNESS`). Each kind's is read between cells the same way,
  so one blends into the next over a hundred metres or so.
  - Gentle swells of about a metre on the plains, more in the hills. These are simplex noise
    (`simplex.js`, with its slope), smoother where the ground's already steep.
  - Up in the mountains, ridges of up to 110 m (ridged multifractal noise, bent by a warp), so
    steep that only the valleys and passes can be walked.
  - Terraced mesas in the badlands.
  - The volcano's crater.
- **Water.**
  - Lakes and the sea sink the land under them where the plan has it wet (read smoothly between
    cells and a little ragged). Their shores fall wherever the land meets their surface, so they
    follow its contours.
  - Each river gets a channel, its surface only ever running down (`waters.js`: the plan's water
    level, `level`, lowered to anything upstream of it). Its bed is a parabola: as deep as the
    river is in the middle, 0.15 m under the surface at its edges. Its banks ease from just above
    the water out to the land, but never rise up out of a lake or the sea the river runs into.
  - `waterAt` says where water stands, and how high.
- **How steep.** `slopeClass` sorts a square by slope: walked freely below 30°, slowly to 38°, not
  at all past that. On seed 1, about nine in ten squares of the plains are open, and fewer than
  one in three in the mountains.

A chunk's heights take about 6 ms to work out (65 by 65 points). `waters.js` also keeps the
rivers and still water the overworld's squares are wet by, as they were. A river's surface is never
higher than the land at its cell's middle less 0.4 m, and never higher than anywhere upstream, so
a river crossing a wide hollow runs along its floor and cuts a gorge through its rim to leave it.

## The ground in play (`core/terrain/ground.js`)

The world is played on the land's height with what's built levelled into it (`Ground`):

- **Pads.** The start town, every settlement's squares, each people's castle and places (settled
  with the chunks round them), and camps (10 m round) stand on flat pads at the land's average
  height under them, eased into the land round them over 24 m.
- **Roads and trails** are graded (`graded`): the land's lie along them (sampled every 2 m, on
  the town's and the settlements' pads where they cross them, and over water at their banks'
  height, 0.6 m above it, for their bridges) smoothed 12 m each way, then kept to their kind's
  grade (`GRADE`: trade roads 10 %, roads 12 %, tracks 15 %, trails 25 %) by easing each
  step that's too steep from both its ends at once, a little at a time, so a road is cut into a
  rise as much as it's built up over the dip below it, rather than filling the whole valley
  ahead, its ends held at the land's own height. Its banks ease out to the land 2.5 times as far
  as it's cut or built there (`ROAD.batter`), at least 3 m and at most 12, so a cutting's or an
  embankment's side is no steeper than 1 in 2.5 on average. On a road, the road it's furthest
  onto is followed; beside roads, the one whose bank it's furthest up; and of two alike, the one
  listed first by its name (`road 0042`, `trail cave-79`), so it's the same whichever chunks are
  made first. Each road is listed in every chunk its banks reach (and each trail found before
  any of them is made), so neighbouring chunks agree on the corners they share. Within 640 m
  of the town no road or trail is steeper than its grade but by a little where it meets
  another; within 900 m a road is cut 5.6 m into the land at most, and built 3.6 m over it.
- **Water keeps its channel and lakes**: nothing levels ground under water.
- Heights are kept a chunk at a time at each metre's corner (65 by 65), read between corners over
  each square's two triangles, split from north-west to south-east, exactly as the ground's drawn,
  so whatever stands on the ground stands on what's seen. They're the same whatever order chunks
  are made in (a road's or pad's height is worked out from the land's own, never from kept
  chunks). The land's own heights for chunks ahead of the player are worked out off the page's
  thread (`world/terrains.js`, `terrain-worker.js`).
- **The overworld** (`overworld.js`) gives each chunk its corner heights and each square's slope
  class: squares steeper than 38° are blocked, but for roads, bridges and what's built. Lakes and
  the sea are wet where the ground's below their water. `heightAt(x, y)` is the ground, or a
  bridge's deck, arched from bank to bank at least a metre over its river (`deckOf`), and
  `surfaceAt(x, y)` the water's surface: a river's (sloping down along it), a lake's or the sea's.

**What stands on it** (the drawing, world/):
- Every chunk's ground mesh (GAME.md, *The ground*), its water sheet following the surface (a
  corner every 2 m), and its bridges' decks arched as the overworld has them, on piers down to the
  riverbed (the ground as it's levelled, not the land's own, so a pier on a graded bank stands
  on it).
- Buildings at their piece's ground (on its pad); trees on the lowest ground round their trunk,
  a little into it, with the litter round their feet laid over the ground; rocks, logs and ruins
  on the lowest of five points under them; grass and flowers each at the ground where it grows
  (and sinking into it far off from there).
- Everyone standing at the ground under where they're drawn: snapped to it as it rises and
  falls, easing only up and down steps (onto a bridge's deck); the fallen sinking into it; a
  wyvern or dragon gliding down to it to land.
- Birds, wyverns and the dragon flying at their height over the ground, rising over what's ahead
  and sinking slowly after, nose up and down as they go.
- What lies on the ground lies along its slope: the ring where the player's walking to, the
  target's ring, heals' rings, blood, scorches and runes, spells' rings; particles falling to the
  ground where they are; spikes each from the ground where it bursts up; dropped bundles, camps'
  tents and fires, and banners at the ground there; doors' targets at their building's floor;
  debug mode's squares laid over it.
- The camera never goes under the ground between it and the player (raised to look down more);
  a tap finds the ground by marching along the line from the camera until it passes under.

## Navigation meshes (`core/navigation.js`, `core/navigation/`)

Where the world can be walked, as polygons rather than squares: Recast and Detour (built to
WebAssembly by recast-navigation-js, vendored in `client/vendor/recast-navigation-0.43.1/` by
`npm run vendor:recast`; about 200 KB gzipped, loaded with the rules). Everyone walks them
(core/battle.js: GAME.md's *Moving*); debug mode draws them (*Navigation mesh*).

- **Tiles.** The world is cut into 32 m tiles from its origin (256 a side). A tile is baked from
  its square and a 2 m border round it (`tiles.js tileInput`), so it depends only on the world
  (its seed and what's built), never on which tiles were made first, or by whom: the same bytes in
  the page, a worker or the tests (tested).
- **What a tile's made from:**
  - the ground's height at every metre, two triangles a square, each walked as open ground, a road
    (roads, streets, yards and planks), steep (over 30°), a ford (water that can be waded: up to
    0.5 m deep and slow enough), or not at all (deeper or faster water, or over 38°: a cliff);
  - the overworld's *solid* squares (what's built or stands there: the town's, the settlements'
    and the places' buildings, walls and stalls, the wild's features; not water, cliffs or
    trees), merged into rectangles, each a box 3 m over the ground under it whose top is no
    floor;
  - trees as their trunks (0.4 m across at size 1);
  - bridges' decks, a quad a metre along each, at the deck's height (`deckOf`).
- **Recast's settings** (`settings.js`, `bake.js`): voxels 0.5 m across and 0.25 m high; a walker
  0.5 m round and 2 m tall who steps up 0.5 m; polygons of up to six sides, each keeping its
  ground's kind (`AREA`), which costs a way through it: roads and decks ¾ of a metre each, steep
  ground 2, fords 3.
- **Baking** (`navworker.js` with `navbaker.js`): the triangles are worked out on the page (only
  it has the world), Recast's part done in a worker, and the tile added when it comes back; a
  tile wanted before then is baked where it's wanted. The game has the tiles within 96 m of each
  player baked so, nearest first, a tile sent off a frame, and only once the world's chunks under
  it have been made (as they're drawn: making them for a tile would take several frames' time).
  At most 1,024 tiles are kept (a kilometre square), the longest unused let go first.
- **Maps of squares** (a building's floors, a town laid out on its own, a test's rows) have
  meshes of their own (`navigatorOf`, `squares.js`): flat, a square that isn't blocked two
  triangles of floor, in voxels a tenth of a metre across, keeping walkers 0.3 m from walls, so
  a doorway a square wide is still walked; 32 m tiles, baked as they're wanted (about 25 ms a
  tavern floor). The 16 last walked keep theirs.
- **Asking** (`Navigation`), in the rules' ground coordinates ([x, y], or [x, y, height]):
  - `path(from, to)`: the way's corners. The tiles between are made sure of first, and 4 m round
    them; if the way falls short, a ring of tiles round them and then three (across a long way,
    one along it), up to 100 tiles (and never more than half a mesh keeps, or it would let go
    of the tiles it's searching): a river's crossing or a pass can be well off the straight
    way, and tiles far from anyone are dear to make (the world under them made first). A way
    to somewhere it still can't get to ends as near as it gets;
  - `nearest(point)`, `walkable(x, y)`;
  - `raycast(from, to)`: how far straight towards a point before the mesh's edge;
  - `polygons(tx, ty)`: a tile's detail triangles, to draw.

  Detour's own polygon references never leave it: they depend on which tiles came in, in what
  order. Ways are the same whatever order the tiles came in (tested).
- **What it costs** (measured in Node on a desktop; tests allow far more for slow machines): a
  tile's triangles about 3 ms once its chunks are made, Recast's part about 4.5 ms (the town's,
  with many buildings; open country less), its data 6–8 KB. A way found takes 0.05 ms at the
  median and 0.12 ms at the 95th centile; asking for one that can't be got to (into a building,
  say) searches every tile kept before giving up, up to 0.5 ms.

## Tests

`test/navigation.test.js` checks the navigation meshes: a tile's triangles and bytes the same
whichever chunks were made first; the town's streets walked as roads, nothing on roofs; ways round
buildings, not through, and straight over a bridge, high on its deck; deep water not walked; the
same ways whatever order tiles came in; baking and finding ways within their budgets; the
longest unused tiles let go of; and a map of squares' own mesh, through a doorway a square wide,
a body's width from walls. `test/overworld.test.js` walks a way out of the town along the roads,
every half metre of it on the mesh; `test/host.test.js` walks the player from the start through
every door near it; the world-generation tests check every interior's squares can be got to over
the meshes (`test/helpers.js reachable`). `e2e/pellagos.spec.js` checks debug mode draws them
round the player, baked in a worker.

`test/overworld.test.js` checks the world in chunks: blocked off its edges; the same chunks
however they're come to; the town set in just as it was made, with everything in it moved; its
streets carried on as roads, water blocked but seen over, bridges walked over; trees as thick as
their land has them, of its kinds, clear of roads and water; a way out of the town along the
roads across many chunks, found quickly; the player walking out into the world; and chunks made
quickly. Of the other settlements: every place but the start town, hamlets and farmsteads too;
laid out as the world near them is made, the same every time; a village's tavern, church, smithy
and guild; set in as they were laid out, their pieces each drawn with one chunk and their trees
grown; and the plan's roads carried on from their streets' ends. Each people's castle and places
are set down clear of roads and water, each square's land looked at once. `test/chunks.test.js`
checks the settlements laid out ahead: asked for nearest first and once each, the same laid out
in another thread, and taken only when laid out from what they'd be laid out from here. Each people's own trees grow
in its homeland, most of the trees there, and nowhere else. `test/wilds.test.js` checks the
land's features (GAME.md, *Testing*), each people's own in its homeland and only there.

`test/ground.test.js` checks the ground in play: reading between corners as it's drawn; pads
level; roads gentle but where they cross rivers; cliffs blocked; bridges over the water.

`test/terrain.test.js` checks the ground's height:
- simplex noise between -1 and 1, with the slope it says;
- the curve rising all the way, with the sea at 0;
- heights the same in any order, in whole 1/1024ths of a metre, with a chunk's edge its
  neighbour's;
- the plains open and the mountains not;
- lakes and rivers carved under their water, rivers running down;
- a chunk's heights made quickly.

It also checks the rivers:
- each a curve whose pieces join on and turn less than 60° from one to the next, into the next
  cell's too, and only ever down;
- calm, rapids and steps all found, the steps' pools level, each spilling over its lip into the
  next;
- running fastest in their middles and slowest by their banks, faster down rapids, downstream;
- fords on small calm rivers, wider, shallow and slow enough to wade;
- banks never raised up out of the lake a river runs into;
- mountain streams: hundreds of cells of them, each on dry land, running on into a stream, a
  river, a lake or the sea, narrow, shallow, with no fords, often in steps over lips a metre high
  and more.

`test/navigation.test.js` wades across a ford, straight over, and keeps out of the river's deep
water beside it, and steps across a mountain stream running too fast to wade.

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
