---
name: import-prop-kit
description: Make a bought pack's loose furniture and things (a shop's counters and cupboards, a tavern's tables and lanterns, a dungeon's crates, a market's stalls) into a licensed prop kit the game furnishes its insides with, each piece standing in for one of the game's own kinds of furnishing where it suits. Use when the owner shares a props or furniture pack, or asks for a pack's pieces to dress shops, houses, taverns, dungeons or streets.
---

# A prop kit: a pack's pieces in place of the game's own furnishings

How Wind Ways' shop furniture (bought on Fab, November 2026) became the game's first prop kit, in
the humans' shops, then Dragon Motion's Medieval Props Kit the second, in every people's taverns
(toned to each, its lights burning where its candles are), and its third in every people's guild
halls, town halls, keeps, barracks and undercrofts, its fourth in their temples, smithies and
shops, and how the next kit goes in the same way.
Read `contribution.md` first, then `docs/LICENSED_MODELS.md` (*Prop kits*) and
`utilities/blenderpipeline/README.md` (*A kit of pieces*). `import-licensed-model` covers the
download from Drive, an Unreal export and the private repository; its rules hold here too. Times
are told to the owner in US Eastern; show before-and-after pictures (`DPR=2`).

## The rules that never bend

- The bought files and everything made from them stay in `utilities/blenderpipeline/private/`
  (ignored); only the scrambled kit leaves it, and only into `hoffspot/conquest-models`.
- Every licensed catalog entry's `label` names whose it is and the permission.
- The game works without the licensed models: wherever a kit's piece stands, the game's own
  furnishing is drawn till it's read and without it (its stand-in).
- A kit's pieces never change a plan: they stand where the plan already has a furnishing, inside
  its squares, so where folk walk, sit and stand doesn't change, nor the tests of the plans.
- Never replace a licensed file under its name; a rebuild gets a new one, and the old's deleted
  once it's merged (`docs/LICENSED_MODELS.md`, *Remaking a licensed model*).

## 1. Look at the pack, and choose its pieces

- `inspect.py` and `pieces.py` (`.claude/skills/import-scene-model/scripts/`) for each piece's
  size, triangles and materials; `render.py` to see them. Note the pack's scale: Wind Ways' were
  near twice life (a 3 m chair).
- Choose what reads at the game's camera and has a place to go: a counter, cupboards, cabinets
  and chests, tables and chairs, lanterns, baskets and trays of goods, curtains, windows, racks,
  signs. Leave out its walls, floors and roofs: the game's buildings are its own.
- Find where each would go before building (an Explore agent's survey is worth it): the plans'
  furnishings (`core/interiors.js` `PLAN_KEY`, `core/insides.js` plans) and who draws them
  (`world/interiors3d.js` builders). Each piece gets a **role**: the kind of furnishing it stands
  for (`counter`, `chest`, `cabinet`, `side-table`, `lantern`...).

## 2. One file, a node a piece, one atlas

1. A list of its pieces, `[[name, the pack's mesh, set against a wall, how], ...]`
   (`private/<kit>/pieces.json`), and `kit.py ... --cells 8`: each piece in a square of its own,
   its foot at 0; one against a wall faces −y (the game's +z) with its back at 0. It writes which
   square each is in beside the `.blend` (`<blend>.cells.json`). A piece of several of the pack's
   meshes (a chest's body and lid) names them all; `how` can `turn` it (degrees: a table's length
   along x), `trim` it to a band of heights (a chandelier's chain cut at its hub) and find its
   `candles` (`<blend>.candles.json`: their tips, for the game's flames).
   Fetch only the textures its pieces use, shrunk as they come to suit each piece's size (a bed's
   1,024, a mug's 256): the atlas gives each its share at its own texture's size.
2. Its config (`private/<kit>.json`, as `private/wind-ways-shop.json`): `materials` by the pack's
   names (Unreal's normals `flipGreen`), `join` every piece into one mesh, `textures.bake:
   "always"` with `mergeMaterials` (an atlas of 2,048; normals 1,024; KTX2), and `cells: { "size":
   8, "bakeFirst": true }`, so they're cut apart again once baked, every piece the one material.
   `simplify` evenly (`ratio`, `error`, `permissive`): no piece shares an edge with another.
3. Look at it in the pipeline's viewer: every piece there, none black, none see-through. Read
   the build's warnings: faces mapped to a point of their textures (a palette's way) bake black;
   kit.py spreads them over a few texels.
   Wind Ways' shop: 21 pieces, 24,954 triangles, 1.86 MB, 3 textures, 21 draw calls at most.
   The tavern kit: 29 pieces, 16,039 triangles, 1.4 MB, 3 textures.

## 3. Scrambled, private, in the catalog

- `npm run -s scramble -- <glb> client/models/scenery/<kit>.bin --copyright "..."`; its hash
  (`sha256sum | cut -c1-10`) and size.
- Its catalog entry `dungeon-prop-<kit>` (`tier: "demand"`, `licensed: true`): `pieces` maps
  `<kit>-<piece>` to its node, `["kit@<i>,<j>"]`, from `<blend>.cells.json`.
  world/dungeons3d.js `DUNGEON_PROPS` has each as a prop of its own.
- Its section in `client/models/scenery/LICENSE.md`, copied with the `.bin` into the private
  repository (commit, push). `.gitignore`, `NOTICE.md`, `README.md`'s credits,
  `docs/LICENSED_MODELS.md`'s list, contribution.md's three lists, and `test/scramble.test.js`.
- `npm run build:manifest`, every time the `.bin` changes: the game reads its pieces' nodes from
  the generated catalog (`client/js/app/assets.js`), and a stale one names another build's nodes.

## 4. The kit's entry and where it's set out

- `client/js/world/propkits.js` `PROP_KITS`: its `asset`, whose it is (`by`), its `peoples` and
  `places` (the insides' builders' styles: `shop`, `upstairs`...), `double` if the pack was made
  for two-sided materials (some faces turned inwards: drawn front-only they leave holes, and a
  counter looked like glass), and each piece's `role` and `size` (across, up, deep: life size).
- In the inside's builder (`world/interiors3d.js`), for each furnishing a kit can stand in for:
  `kitted(role, seed)` gives the piece or none; draw the game's own art into `artOf(solid, piece)`
  (the stand-ins, merged apart and put away once the kit's read: `kitShown`), and push the
  piece's placement (`kitCounter`, `kitStanding`, or one of your own) to the inside's `props`,
  fitted to the furnishing's squares (`fit`), turned away from its wall, `double` as the kit is.
  Keep what stood on the game's own (a ledger, a candle) at the height it had: fit the piece's
  top to it (the counter at `SHOP_TOPS.counter`, the chests at 0.52 m upstairs).
- Small things go `on` another placement (a basket on a chest), never on an open square: what
  stands on a square nothing blocks is walked through. The placement it's on goes first in
  `props`: furnish stands a thing on another only once that's set.
- A kit for every people: its `peoples` all six; its pieces are toned to each (`TONES`).
- Lights: `candleOn`, `kitLit` and `chandelier` (interiors3d.js) light a flame at each of a
  piece's candles (`flamesOf`) and draw the game's own candles there meanwhile.
- Things on walls: `onWall` (its back on the wall's face), `dressWalls` with a builder's spots,
  clear of its windows, door, stairs and hearth.
- Pure: placements from the plan alone, the same for every player.

## 5. Tests and pictures

- `test/propkits.test.js`: the catalog entry and its pieces, the choosing, each place set out (a
  piece for each furnishing, inside its squares, the stand-ins apart), none for another people,
  and the licensed file's nodes and its one material (skipped without the licensed models).
- `test/furnishings.test.js` allows a registered kit's licensed props.
- Pictures from the building lab's insides (`show=insides`): its frames are each inside's label;
  the orbit's `pitch` is in degrees. Take the kit's and the game's own (`page.route` the `.bin`
  away) from the same place.
- Then `LICENSED_MODELS=required npm run check`, the browser tests the insides touch
  (`e2e/building-lab.spec.js` and the game's), and the pipeline's checks if it changed.

## What the temples', smithies' and shops' kit taught

- **Two kits in one place.** The humans' shops have Wind Ways' counters and chests and the town
  kit's torches, lecterns and rugs: `kitPiece` takes the first kit (in `PROP_KITS`' order) with a
  piece of the role asked for, so the kit that came second fills only what the first hasn't. Where
  no kit has a role (a `cabinet` for any but the humans), ask for one that's near it instead
  (`kitted("cabinet") ?? kitted("chest", k)`).
- **One builder, two places.** The smithy's forge is the undercroft's too (`forgeworks`): it asks
  the inside's own kit, so the halls kit, with no anvil block, sack or workbench, leaves the
  undercroft's as it was, and its tests' counts with it.
- **A light that stands alone needs a stand-in of its own.** A standing candelabrum where nothing
  of the game's stood (by a temple's statue) draws an iron pole under its candles till it's read;
  its candles alone would float.
- **Trim the kit to what's set out.** The first build took 33 pieces (22,932 triangles, 1.7 MB);
  the 13 nothing asked for came out, two of them (a bucket, a rack) with faces the pipeline
  warned would bake black. Every piece is under 4 m (a test says so): the long runner gave way to
  the halls' one.
- **Measure which way a piece faces, not only look.** The settle's back and seat both read as
  "a panel" on the contact sheet; measured in Blender (its seat's points against its back's), it
  was made seat-to-the-back, and the pews faced away from the altar (`turn: 270`). Two chests'
  lids sat above their boxes, made a little open; the halls kit's chests, checked shut, took their
  place.

## What the halls kit taught

- **One pack, a kit for each kind of place.** The halls kit (`medieval-hall`, 31 pieces, 15,584
  triangles, 1.5 MB) shares the tavern kit's pack and its pipeline, but not its file: each kit
  holds only what its places draw, and `kitsFor({ people, place })` chooses by the inside's style.
- **Measure a light by hand where kit.py can't.** A wall torch has no candle for `candles` to find;
  its flame sits in its cage (`[0, 0.72, 0.05]`, measured in the pipeline viewer). `torchOn` hangs
  the torch so its flame is where the game's was (2.05 m) and moves the game's flame and light
  onto it.
- **Hang trophies on what can hold them.** Antlers and a skull on a chimney breast read; on a run
  of bare wall they floated. `onBreast` puts them on the hearth's wall, inside its width.
- **Keep wall dressing under the friezes.** Other peoples' halls run their accents from 2.4 m up;
  a map hung with its top at 2.49 m cut through one. Every wall spot's top stays at 2.35 m or
  under, and the test checks it.
- **Share the placing.** Tables end to end with benches along them (`kitTables`, `kitBenches`), a
  desk (`kitDesk`), a chest (`kitBox`) and a barrel (`barrelAt`) are set out alike in every hall,
  and the tavern's helpers (`kitWare`, `candleOn`, `dressWalls`) carry over unchanged.

## What the tavern kit taught

- **A quantized model's points wrap.** The pipeline stores points as 16-bit whole numbers, its
  node's scale making them metres; put the node's scale and place into them and anything past a
  metre from the file's middle folds back. A chandelier hung upside down; Wind Ways' counter, read
  as "a glass case", had been folded too. `dungeons3d.js` `partsOf` makes them plain numbers
  first (`unpacked`), and `test/propkits.test.js` keeps it so.
- **Measure what the game must line up with.** The candles' tips, measured in Blender, put the
  flames on the candles; the chandelier's chain cut at its hub hangs it from any ceiling.
- **Test what the eye would miss.** A candlestick set `on` its chest before the chest was in
  `props` was never drawn; the test of the flames found it.
- **Look at every piece from its front before it ships.** A contact sheet of the built kit, each
  node from where the game's camera sees it (the pipeline viewer, a picture a node), caught what
  the lab's overview hid: the pack makes a chest's lid at its hinge on the floor, so the lids lay
  before their chests (`seat` sets them on); a shield's straps and a picture's back read as
  "detail" to kit.py, so they faced the wall (`turn: 180`); a throne and a wall torch stood
  side-on (`turn: 90`); and one chest's lid was made standing open (another chest, its lid shut,
  where a candlestick stands on it). The tavern kit went in as `medieval-tavern-2.bin` for it.

## What Wind Ways' shop taught

- **One atlas for the kit, not one for each piece.** The pipeline baked each mesh on its own;
  cutting after baking (`cells.bakeFirst`) gave 21 pieces three textures between them.
- **Faces turned inwards.** Drawn front-only, the counter's panels vanished and it read as a glass
  case. Its kit's `double` draws its pieces from both sides; the scanned props stay front-only.
  (Much of that glass was the wrapped points above, found with the tavern kit.)
- **Hanging things need something to hang from.** Lanterns set in the air over a counter read
  as floating; one on a cabinet reads as a lantern.
- **The pack's scale isn't life.** Size each piece to its furnishing (`fit`), never by a factor.
