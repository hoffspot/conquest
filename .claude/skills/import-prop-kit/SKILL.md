---
name: import-prop-kit
description: Make a bought pack's loose furniture and things (a shop's counters and cupboards, a tavern's tables and lanterns, a dungeon's crates, a market's stalls) into a licensed prop kit the game furnishes its insides with, each piece standing in for one of the game's own kinds of furnishing where it suits. Use when the owner shares a props or furniture pack, or asks for a pack's pieces to dress shops, houses, taverns, dungeons or streets.
---

# A prop kit: a pack's pieces in place of the game's own furnishings

How Wind Ways' shop furniture (bought on Fab, November 2026) became the game's first prop kit, in
the humans' shops and the rooms upstairs at their inns, and how the next kit goes in the same way.
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

1. A list of its pieces, `[[name, the pack's mesh, set against a wall], ...]`
   (`private/<kit>/kit.json`), and `kit.py ... --cells 8`: each piece in a square of its own, its
   foot at 0; one against a wall faces −y (the game's +z) with its back at 0. It writes which
   square each is in beside the `.blend` (`<blend>.cells.json`).
2. Its config (`private/<kit>.json`, as `private/wind-ways-shop.json`): `materials` by the pack's
   names (Unreal's normals `flipGreen`), `join` every piece into one mesh, `textures.bake:
   "always"` with `mergeMaterials` (an atlas of 2,048; normals 1,024; KTX2), and `cells: { "size":
   8, "bakeFirst": true }`, so they're cut apart again once baked, every piece the one material.
   `simplify` evenly (`ratio`, `error`, `permissive`): no piece shares an edge with another.
3. Look at it in the pipeline's viewer: every piece there, none black, none see-through.
   Wind Ways' shop: 21 pieces, 24,954 triangles, 1.86 MB, 3 textures, 21 draw calls at most.

## 3. Scrambled, private, in the catalog

- `npm run -s scramble -- <glb> client/models/scenery/<kit>.bin --copyright "..."`; its hash
  (`sha256sum | cut -c1-10`) and size.
- Its catalog entry `dungeon-prop-<kit>` (`tier: "demand"`, `licensed: true`): `pieces` maps
  `<kit>-<piece>` to its node, `["kit@<i>,<j>"]`, from `<blend>.cells.json`.
  world/dungeons3d.js `DUNGEON_PROPS` has each as a prop of its own.
- Its section in `client/models/scenery/LICENSE.md`, copied with the `.bin` into the private
  repository (commit, push). `.gitignore`, `NOTICE.md`, `README.md`'s credits,
  `docs/LICENSED_MODELS.md`'s list, contribution.md's three lists, and `test/scramble.test.js`.
- `npm run build:manifest`.

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
  stands on a square nothing blocks is walked through.
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

## What Wind Ways' shop taught

- **One atlas for the kit, not one for each piece.** The pipeline baked each mesh on its own;
  cutting after baking (`cells.bakeFirst`) gave 21 pieces three textures between them.
- **Faces turned inwards.** Drawn front-only, the counter's panels vanished and it read as a glass
  case. Its kit's `double` draws its pieces from both sides; the scanned props stay front-only.
- **Hanging things need something to hang from.** Lanterns set in the air over a counter read
  as floating; one on a cabinet reads as a lantern.
- **The pack's scale isn't life.** Size each piece to its furnishing (`fit`), never by a factor.
