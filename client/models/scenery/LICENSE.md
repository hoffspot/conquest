# The scenery's models

## bellhaven-2.bin and bellhaven-far-3.bin

**White Castle**, by **DmitriyDryzhak** (its Unreal Engine files: the example scene of the castle
on its crag, its parts and its textures, exported from Unreal Engine by this repository's owner),
bought on **Fab** by this repository's owner under **Fab's Standard License**: Bellhaven, the Order
of the Bell's mother house, a place of its own in the game.

It is not CC0 and not free to reuse. That licence lets it be used in a game its buyer makes and
distributed as part of it, never on its own, so it's in the game only in this converted form,
served scrambled as part of the game: the bought files put through `utilities/blenderpipeline`
(`private/bellhaven.json`, which stays out of the repository with the bought files).

- `bellhaven-2.bin`, its `phone` build, for the castle's own map: the artist's whole scene (the
  crag, the chasm, the bridge and the castle), cut into 98 cells of 40 m, 500,745 triangles with a
  lower detail of 166,820 packed in, its 16 materials' textures as KTX2 (1,024 pixels; normals 512).
- `bellhaven-far-3.bin`, its `far` build, the castle seen from the world round it: the same scene,
  its plain back walls dressed with its own parts (its buttresses, lancets, pilasters and
  cornices, set onto them; `private/bellhaven-far.json`), in one detail of 121,026 triangles, 19
  draw calls, its textures at 256 pixels.
- In both, its rocks that touched nothing are set down on what's under them or left out (the
  pipeline's `seat`).

Each is scrambled as the game serves it, with whose it is in its glTF asset's `copyright`. They
aren't in this repository, but in the private one the game's builds fetch them from
(`docs/LICENSED_MODELS.md`).

`client/js/core/scenery/bellhaven.walk.js`, in this repository, is where the castle can be walked,
baked from it (`utilities/blenderpipeline`, README *Where it can be walked*): the height of each
square a body can stand on, no mesh or texture.

Don't copy them out of this game or use them in anything else.

## bellhaven-keep.bin

The same **White Castle**, by **DmitriyDryzhak**, bought on **Fab** by this repository's owner under
**Fab's Standard License**, and its pieces drawing the insides of Bellhaven's keep (a dungeon of
four floors going up behind the keep's doors): a kit of its parts taken from the bought files and
put through `utilities/blenderpipeline` (`private/bellhaven-keep.json`, which stays out of the
repository with them), each part a node of its own, its `phone` build: its Gothic column, a
pilaster, a cornice, a tracery window, its bell, and a plane of its wall and one of its floor (their
textures the keep's walls and floor are drawn with), 10,198 triangles in 9 draw calls, its 6
materials' textures as KTX2 (1,024 pixels; normals 512).

It is not CC0 and not free to reuse, as the castle's other builds aren't: scrambled as the game
serves it, with whose it is in its glTF asset's `copyright`, and kept in the private repository
the game's builds fetch it from, not in this one.

Don't copy it out of this game or use it in anything else.

## timber-forts-2.bin

**Wind Ways' medieval village pack** (its timber fort pieces: a watchtower, a fighting walkway on
its posts, a palisade, a gate run and a stair; its Unreal Engine files exported by this
repository's owner), by **Wind Ways**, bought on **Fab** by this repository's owner under **Fab's
Standard License**: the human peoples' fortifications (`client/js/world/forts3d.js`), a guard
tower and a forward garrison.

Its pieces were set together in Blender (`private/wind-ways/forts.py`) and put through
`utilities/blenderpipeline` (`private/timber-forts.json`), both of which stay out of the repository
with the bought files: two nodes, its `phone` build:

- `tower`: the watchtower on its own, its ladder at its back, 2.89 by 2.98 m and 13.5 m tall;
- `garrison`: a palisade two of its wall runs long a side, 19.38 m square (inside the twenty
  metres the battle holds for the humans' garrison), its gate run in the middle of its front, the
  walkway four metres up behind it all round, a watchtower inside each corner and a stair up to
  the walkway.

Every foot is sunk a metre below where it stood, so it stands on a slope with no gap under it.
32,013 triangles between them (the tower 2,582, the garrison 29,431), each one draw call, their
pieces' materials baked onto an atlas of 1,024 pixels each (KTX2; normals 512); a lower detail of
10,419 triangles packed in.

It is not CC0 and not free to reuse. That licence lets it be used in a game its buyer makes and
distributed as part of it, never on its own, so it's in the game only in this converted form,
scrambled as the game serves it, with whose it is in its glTF asset's `copyright`, and kept in the
private repository the game's builds fetch it from, not in this one (`docs/LICENSED_MODELS.md`).

Don't copy it out of this game or use it in anything else.

## wind-ways-shop.bin

**Wind Ways' medieval shop pack** (the loose pieces of its shop: counters, cupboards, cabinets and
chests, a table and a chair, a lantern, a basket and trays of goods, a curtain, a window, a rack, a
sign bracket and a sign post, a newel and a door; its Unreal Engine files exported by this
repository's owner), by **Wind Ways**, bought on **Fab** by this repository's owner under **Fab's
Standard License**: the first of the game's prop kits (`client/js/world/propkits.js`), furnishing
the humans' shops (and, till the tavern kit below, the rooms upstairs at their inns).

Its 21 pieces were set a square each in Blender (`.claude/skills/import-scene-model/scripts/kit.py
--cells 8`, its list `private/wind-ways-shop/kit.json`) and put through `utilities/blenderpipeline`
(`private/wind-ways-shop.json`), both of which stay out of the repository with the bought files:
joined, their materials baked onto one atlas (2,048 pixels; normals 1,024; KTX2) and cut apart
again (`cells.bakeFirst`), each piece a node of its own (`kit@<i>,<j>`), its `phone` build:
24,954 triangles in all, one material for every piece.

It is not CC0 and not free to reuse. That licence lets it be used in a game its buyer makes and
distributed as part of it, never on its own, so it's in the game only in this converted form,
scrambled as the game serves it, with whose it is in its glTF asset's `copyright`, and kept in the
private repository the game's builds fetch it from, not in this one (`docs/LICENSED_MODELS.md`).

Don't copy it out of this game or use it in anything else.

## medieval-hall.bin

**Dragon Motion's "Medieval Props Kit"** (31 of its pieces: a throne, a long table bare and clothed,
a bench, a carved cabinet, an iron-bound strongbox and a chest, a chandelier (its chain cut at its
hub), a wall torch, a candlestick, two mugs, a plate, a jug and a goblet, a scroll, three maps, a
picture and a tapestry, two shields, a sword, antlers, a skull, a carpet and a runner, firewood, a
barrel and a cask on its blocks; its Unreal Engine files exported by this repository's owner), by
**Dragon Motion**, bought on **Fab** by this repository's owner under **Fab's Standard License**:
the game's third prop kit (`client/js/world/propkits.js` `medieval-hall`), furnishing every
people's guild halls, town halls, keeps, barracks and undercrofts, toned to each people's own.

Its pieces were set a square each in Blender (`.claude/skills/import-scene-model/scripts/kit.py
--cells 8`, its list `private/medieval-hall/pieces.json`; the chandelier's chain cut at its hub,
its lights' candles' tips measured, the torch's flame by hand, the chests' lids set on them) and
put through `utilities/blenderpipeline` (`private/medieval-hall.json`), both of which stay out of
the repository with the bought files: joined, their materials baked onto one atlas (2,048 pixels;
normals 1,024; KTX2) and cut apart again (`cells.bakeFirst`), each piece a node of its own
(`kit@<i>,<j>`), its `phone` build: 15,584 triangles in all, one material for every piece, 1.5 MB.

It is not CC0 and not free to reuse. That licence lets it be used in a game its buyer makes and
distributed as part of it, never on its own, so it's in the game only in this converted form,
scrambled as the game serves it, with whose it is in its glTF asset's `copyright`, and kept in the
private repository the game's builds fetch it from, not in this one (`docs/LICENSED_MODELS.md`).

Don't copy it out of this game or use it in anything else.

## medieval-tavern-2.bin

**Dragon Motion's "Medieval Props Kit"** (29 of its pieces: a trestle table and a small table, a
long bench and a settle, a cask on its blocks, a canopied bed and a plain one, two chests, a
carved cabinet, a chandelier (its chain cut at its hub), a wall sconce, a candlestick and a
candelabrum, two mugs, a plate, a jug, a bottle and a cup, three pictures, antlers, a bull's skull,
a shield, a carpet and a runner, and a stack of firewood; its Unreal Engine files exported by this
repository's owner), by **Dragon Motion**, bought on **Fab** by this repository's owner under
**Fab's Standard License**: the game's second prop kit (`client/js/world/propkits.js`
`medieval-tavern`), furnishing every people's taprooms and the rooms upstairs, toned to each
people's own.

Its pieces were set a square each in Blender (`.claude/skills/import-scene-model/scripts/kit.py
--cells 8`, its list `private/medieval-tavern/pieces.json`; the chandelier's chain cut at its hub,
its lights' candles' tips measured, the chests' lids set on them, faces mapped to a point of their
textures spread over a few texels) and put through `utilities/blenderpipeline` (`private/medieval-tavern.json`), both of
which stay out of the repository with the bought files: joined, their materials baked onto one
atlas (2,048 pixels; normals 1,024; KTX2) and cut apart again (`cells.bakeFirst`), each piece a
node of its own (`kit@<i>,<j>`), its `phone` build: 16,039 triangles in all, one material for
every piece, 1.4 MB.

It replaces `medieval-tavern.bin`, its first build, never in a game that's been released: the pack
makes a chest's lid at its hinge on the floor, and its chests' lids lay before them; its wide
picture and its shield faced the wall; and its small chest's lid stood open, under the candlestick
set on it (now the pack's iron-bound chest, its lid shut).

It is not CC0 and not free to reuse. That licence lets it be used in a game its buyer makes and
distributed as part of it, never on its own, so it's in the game only in this converted form,
scrambled as the game serves it, with whose it is in its glTF asset's `copyright`, and kept in the
private repository the game's builds fetch it from, not in this one (`docs/LICENSED_MODELS.md`).

Don't copy it out of this game or use it in anything else.

## medieval-town.bin

**Dragon Motion's "Medieval Props Kit"** (20 of its pieces: a standing candelabrum, a candelabrum
for an altar, a candlestick and a candle in its dish, a chandelier (its chain cut at its hub), a
wall torch, a chained book, a runner and a rug, a high-backed settle, a carved cabinet, a chest
and an iron-bound strongbox, a lectern, a table and a trestle table, a cask on its blocks, a block
of wood, a sack and a shield; its Unreal Engine files exported by this repository's owner), by **Dragon Motion**,
bought on **Fab** by this repository's owner under **Fab's Standard License**: the game's fourth
prop kit (`client/js/world/propkits.js` `medieval-town`), furnishing every people's temples,
smithies and shops (the humans' shops' counters and chests are still Wind Ways'), toned to each
people's own.

Its pieces were set a square each in Blender (`.claude/skills/import-scene-model/scripts/kit.py
--cells 8`, its list `private/medieval-town/pieces.json`; the chandelier's chain cut at its hub,
its lights' candles' tips measured, the torch's flame and the small candle's by hand, the chests'
lids set on them) and put through `utilities/blenderpipeline` (`private/medieval-town.json`), both
of which stay out of the repository with the bought files: joined, their materials baked onto one
atlas (2,048 pixels; normals 1,024; KTX2) and cut apart again (`cells.bakeFirst`), each piece a
node of its own (`kit@<i>,<j>`), its `phone` build: 13,099 triangles in all, one material for
every piece, 1.4 MB.

It is not CC0 and not free to reuse. That licence lets it be used in a game its buyer makes and
distributed as part of it, never on its own, so it's in the game only in this converted form,
scrambled as the game serves it, with whose it is in its glTF asset's `copyright`, and kept in the
private repository the game's builds fetch it from, not in this one (`docs/LICENSED_MODELS.md`).

Don't copy it out of this game or use it in anything else.

## meshsmith-houses-2.bin

**Meshsmith Foundry's half-timbered building kit** (its modular pieces: wall frames, braces and
the plaster and brick between them, windows and doors, corner posts outer and inner, footings, the
gables' rows, dormers' knees, finials, beams and wood floors, and its roof pieces; its Unreal
Engine files exported by this repository's owner), by **Meshsmith Foundry**, bought on **Fab** by
this repository's owner under **Fab's Standard License**: the humans' town houses in their towns,
cities and capitals, with their dormers and wings (`client/js/world/art/kits/kithouse.js` lays each
out of its pieces, `client/js/world/kithouses3d.js` draws it), their shops in every settlement of
theirs, each in a look of its own (`client/js/world/art/kits/kitshop.js`), and the wood floors of
the humans' insides.

Its 168 pieces were set a square each (3 m) in Blender, each keeping the pack's own pivot, and its
red and slate roofs' tiles baked flat into a seamless repeat of each
(`.claude/skills/import-scene-model/scripts/housekit.py`, its list and the tiles' pictures kept
out of the repository with the bought files), then put through `utilities/blenderpipeline`
(`private/meshsmith-houses-2.json`): joined, their materials baked onto one atlas (1,024 pixels;
normals 512; KTX2) and cut apart again, each piece's frame (`walls`), plaster (`fills`) and glass
(`glass`) a node of its square, and a lower detail packed in. Its `phone` build is 1,912,276 bytes
scrambled; the kit's lower detail is 5,172 triangles in all, a town house of it about 3,000 to
12,000. It replaces `meshsmith-houses.bin`, the same kit with six pieces fewer (a dormer's knee
frame, its half fills with windows, and the beam of an inner corner).

It is not CC0 and not free to reuse. That licence lets it be used in a game its buyer makes and
distributed as part of it, never on its own, so it's in the game only in this converted form,
scrambled as the game serves it, with whose it is in its glTF asset's `copyright`, and kept in the
private repository the game's builds fetch it from, not in this one (`docs/LICENSED_MODELS.md`).

Don't copy it out of this game or use it in anything else.
