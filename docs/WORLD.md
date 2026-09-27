# The world plan

The game is growing from one market town into a whole world, 8 kilometres square. It won't be
built all at once: it's laid out first, from a seed, as a **plan** (`client/js/core/worldplan`).
The plan says what every part of the world is: its land, who lives there, and what lies between.
Later, the world will be built in chunks from the plan as the player comes near. Built again, the
same seed gives the same chunk.

The plan is pure data: typed arrays and plain objects, with no DOM or Three.js. So it runs in
Node for the tests, and later in a worker. Laying one out takes about half a second to a second.

See it at <https://hoffspot.github.io/conquest/world-map.html> (or `npm start` and open
<http://localhost:8080/world-map.html>). Try `?seed=12&race=orc` to choose the world and the start.

## Size and grid

| | |
| --- | --- |
| The world | 8,192 metres square (`WORLD_SIZE`), with the sea round it |
| The plan's cells | 32 metres (`CELL`), 256 a side: every layer is one value a cell |
| The chunks it will be built in | 64 metres (`CHUNK`), 128 a side |

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
| Village | 6 to 9 (as many as fit) | 30 | 9 | No |

- Each is built on flat, dry land in their territory, better by a river or lake. They aren't built
  on beaches, mountains, marsh or volcanic ground.
- Two settlements keep at least the average of their "apart" from each other.
- Each is named in its people's tongue, from its starts, middles and ends. A name is never used
  twice in a world, and names with a part said twice ("Ingingwick") or three vowels together are
  passed over.

In all, a world has about 6 capitals, 15 cities, 30 towns and 40 to 50 villages.

**Roads:**

- Each people's settlements are joined by the shortest network, plus a couple more roads where
  going round by the network is much further. Roads to villages are tracks.
- The capitals are joined by **trade roads**.
- Each road is laid over the land the easiest way (A* over the cells). Going up and over woods,
  marsh, jungle, mountains, snow or volcanic ground costs more.
- Crossing a river is a **bridge**, and costs more.
- Following a road already there costs a third, so roads share their way where they meet. Trade
  roads are laid first, then roads, then tracks.

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
- **Branches** (`guilds(plan)`): every capital, city and town has a branch of the adventurers'
  guild, about 50 in a world. Players will be able to travel quickly between branches.
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

## Next

This is step 1 of the world's first phase. The next steps:

- **Chunks from the plan:** building 64-metre chunks from the plan's cells as the player comes
  near, and letting them go as they leave, without loading screens.
- **Places in chunks:** the settlements (the town builder, at each kind's size) and roads built
  in them.
- **Camps and patrols in play:** enemies of each camp's tier, patrols that roam their range, and
  camps that can be destroyed.
- **The lands drawn:** ground, trees and plants for each biome (two forests for the elves and dark
  elves; savannah grasses; jungle; ash and lava; snow).
- **Each people's own building styles.**

Height on the ground (each cell's `height` shaping the land) is paused. Free terrain with a
navigation mesh isn't planned.

## Tests

`test/world-plan.test.js` checks, for three seeds:

- **Laying out:** the same seed gives the same world, another seed another, quickly.
- **Peoples and lands:**
  - each people's lands are big enough and in their climate (on average within 0.15 of it), with
    wild land between (20 to 50%);
  - more than half of each people's lands are their own kinds;
  - every kind of land is in every world, and the volcano is volcanic.
- **Rivers:** more than 90% of rivers reach the sea.
- **Settlements:** each people's are in their lands, on dry land, apart, named once each, with
  guilds in all but villages.
- **Roads:** every settlement is joined to its capital, and every capital to the others, over
  land and bridges.
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
