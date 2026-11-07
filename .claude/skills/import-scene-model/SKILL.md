---
name: import-scene-model
description: Import a bought structure or scene pack (a castle, a ruin, a temple, a fort: an Unreal or FBX environment pack with its example scene and its parts) into Pellagos, from looking at the pack to a place of its own in the game. It covers the costs told to the owner, the pipeline's scenery build (cells, the walk bake, a far stand-in), scrambling it into the private repository, its own map with a way in, setting it into the world, and its insides as a dungeon drawn with the pack's own pieces, with views out over the land. Use when the owner shares an environment or structure pack, or asks for a building, ruin or scene they bought to be put in the game, walked, gone into or seen from.
---

# Importing a bought scene: from the pack to a place in the game

How DmitriyDryzhak's White Castle (bought on Fab, November 2026) became Bellhaven, the Order of
the Bell's mother house, and what each step taught. It went in by stages, a pull request or more
each: the pipeline (#626), its builds and a lab (#627), its own map (#628), set into the world
(#631 to #635), and its keep a dungeon of four floors with balconies over the land (#636, #638,
#639, #641).

Read `contribution.md` first, then `docs/LICENSED_MODELS.md`, `utilities/blenderpipeline/README.md`
(*An asset's config*, *Where it can be walked*, *Rocks that touch nothing*, *For a bought asset*),
`docs/WORLD.md` (*Bellhaven, the White Castle*) and `docs/DUNGEONS.md` (*Bellhaven's keep*). Two
skills go with this one:
- `import-licensed-model` covers the download from Drive, what's in an Unreal export, scrambling
  and the private repository. Its rules hold here too.
- `set-scene-into-world` covers laying the scene into the land: no seam, no floating rocks, the
  world's trees round it. Step 6 below hands over to it.

Times are told to the owner in US Eastern. Show them before-and-after pictures (`DPR=2`) at each
step, and keep scratch pictures and scripts out of commits.

## The rules that never bend

- **The bought files and everything built from them stay out of this repository.** They go in
  `utilities/blenderpipeline/private/` (git ignores it): the pack, its configs, its builds and any
  `.blend` made from it. Only scrambled builds leave it, and only into the private
  `hoffspot/conquest-models`. Each `.bin` is named in `.gitignore`.
- **The one thing built from it that goes in here is its walk**: `client/js/core/scenery/<name>.walk.js`.
  It holds plain heights, with no mesh or texture. It's what lets the game, the host, the world
  server and CI walk the place without the art.
- **Never replace a licensed file under a name it already has.** `main`'s builds fetch it by that
  name and hash till the change that uses the rebuild is merged. A rebuild gets a new name:
  `bellhaven.bin`, then `bellhaven-2.bin`; `bellhaven-far.bin`, then `-far-2` and `-far-3`. Once
  it's merged, delete the old file from the private repository and its name from both
  `LICENSE.md`s, and move its `.gitignore` line to the superseded builds
  (`docs/LICENSED_MODELS.md`, *Remaking a licensed model*). Keep nothing no build draws.
- Credit the seller by the name the owner gives (here **DmitriyDryzhak**). Never copy a seller's
  email or anything else from the owner's screenshots.
- Leave out what's Unreal's own or licensed for Unreal only (Epic's templates and mannequins).
- Downloads are untrusted: each goes in its own new folder, with scripts kept elsewhere and Python
  run with `-I`. Nothing that costs money without the owner's say-so.
- Before deleting a pack's folder, check it isn't a symbolic link to the only copy (`test -L`,
  `ls -la`): the White Castle's source was lost so, deleting a link taken for a copy. Keep the
  downloaded zip till the work's merged.
- **Every licensed catalog entry's `label` says whose it is and the permission**, for example
  "DmitriyDryzhak's "White Castle", bought on Fab: used with the permission its Standard License
  gives; client/models/scenery/LICENSE.md". `test/licensed.test.js` checks it.
- **The game works without the licensed models.** Every step has a stand-in drawn from the walk
  or from plain stone, and the browser tests run both ways.

## 0. Look at the pack, and tell the owner what it would take

Get it as `import-licensed-model` says (an Unreal pack is exported by the owner with
*PellagosExport* and zipped). Then measure it before promising anything. Use the scripts here, with
the pipeline's Blender Python (`utilities/blenderpipeline/.venv/bin/python -I`):

- `inspect.py`: the example scene and each building, with triangles, size, materials and biggest
  parts.
- `pieces.py`: every part's size, triangles and materials, to choose a kit from later.
- `render.py`: each in clay from three sides, to see what it is.

Build one real piece on the `phone` profile to learn the bytes per triangle and what the textures
cost.

What the White Castle turned out to be:
- An Unreal 5.8 export, 835 MB zipped.
- Its example scene `SM_Scene` is one mesh of 4.07 M triangles, 352 by 335 m and 235 m tall.
  1.15 M of those triangles are its rock and ground.
- 124 parts: buildings, bridge and gate pieces, details, and three simple inside rooms.
- 52 textures (42 at 4K) in 17 materials. No collision, no levels.
- Its biggest building, built for phones, was 14.9 MB for 230 k triangles. Most of the texture
  bytes were normal maps, and its tiled texture coordinates stopped them being quantised.

Weigh that against the game's budget on a phone: 70 to 105 draw calls and 160 to 350 k triangles a
frame; 165 to 210 MB of graphics memory in the start town. Write the owner a short report (it's
their call):
- what's in the pack;
- what a phone build would cost: download, draw calls, graphics memory;
- how it would be walked;
- where it could go: its own map, set into the land, or both;
- what it could be in the story.

The owner chose: its outside walked as a map of its own, gone into from a landmark in the world,
and its keep a dungeon through its doors.

## 1. The pipeline's scenery build

The castle's config is `private/bellhaven.json`. Copy it for the next scene. What matters:

```json
"textures": { "bake": "never" },
"cells": { "size": 40 },
"walk": { "from": [0, 79.2, -50], "under": 4, "ground": { "materials": ["M_Ground"], "square": 2 } },
"seat": { "materials": ["M_Rock*"], "gap": 1, "drop": 3 },
"profiles": {
    "probe": { "textures": { "maxSize": 64, "format": "png" }, "compress": "none" },
    "phone": {
        "textures": { "maxSize": 1024, "format": "ktx2", "ktx2": { "normalSize": 512 } },
        "tiledTexcoords": true,
        "simplify": { "ratio": 0.12, "error": 0.01, "permissive": true, "materials": { "M_Rock*": 0.05, "M_Ground": 0.2 } },
        "lods": [{ "ratio": 0.04, "error": 0.05, "materials": { "M_Rock*": 0.015, "M_Ground": 0.06 } }],
        "packLods": true
    },
    "far": {
        "textures": { "maxSize": 256, "format": "ktx2", "ktx2": { "normalSize": 128 } },
        "tiledTexcoords": true, "cells": null, "walk": null, "tangents": false,
        "simplify": { "ratio": 0.015, "error": 0.15, "permissive": true, "materials": { "M_Rock*": 0.03, "M_Ground": 0.08 } }
    }
}
```

- **`materials`** take Unreal's textures by the scene's material names, exactly: gloss
  `"invert": true` as roughness, normals `"flipGreen": true`, and metalness where there is one.
  Two materials can share one set of textures (`M_Floor` and `M_Floor_16`).
- **Two builds.** `phone` is the scene's own map: cut into cells, with a lower detail packed in.
  `far` is the stand-in seen from the world: one detail, small textures, no cells. Bellhaven's are
  18.5 MB (500,745 triangles and a lower detail of 166,820, in 98 cells) and 2.3 MB (121,026
  triangles, 19 draw calls, its back dressed). The phone build takes about 7.5 minutes and the far
  one 1.5 minutes, so run them in the background. Use `probe` (64-pixel PNGs, uncompressed) for quick walk bakes.
- **Cells of 40 m.** The game draws only the cells in view, each at its own detail. Simplifying
  locks only where one cell or material meets another. meshopt's LockBorder locked every open edge
  of the carving, and the castle stuck at 947 k triangles and 52.6 MB.
- **`permissive`** lets the lower details collapse across UV and normal seams, with the cells'
  seams still locked. Without it, carved stone (a seam at every corner) stopped at a quarter of its
  triangles.
- **`tiledTexcoords`**: a texture tiled along a wall has coordinates past 0 to 1, and those stay
  floats, twice the size. This brings them into 0 to 1 with `KHR_texture_transform` after
  simplifying.
- **Normals at 512** (128 far): they were most of the texture bytes.
- **`tangents: false`** for the far build: about a seventh smaller, and Three.js works them out.
- **Rock and terrain keep more of themselves than the castle does** (`simplify.materials`; far:
  3% and 8% against 1.5%). Simplified hard, a rock comes apart from the cliff it was set into.
- **`seat`** sets rocks that touch nothing down onto what's under them, or leaves them out. The
  artist's own scene had 367 such pieces.
- A part simplified to nothing (a window's glass) is kept as it is: meshopt can't write an empty
  primitive.
- Read the report (`<name>.report.json`): triangles, draw calls, cells, texture megabytes, the
  walk's levels, and the rocks seated.

## 2. Where it can be walked

The walk bake (`walk`, `lib/walk.js`) works from the full triangles before they're simplified.
- `from` is a point on its main floor, in the scene's metres as built (glTF: y up). Bellhaven's is
  the bridge, `[0, 79.2, -50]`.
- What's reached from there is kept. A chasm's floor and the tops of towers are left out.
- Where one floor is over another (a gallery over an arcade), each gets a level of its own, linked
  where stairs cross.
- `under` and `ground` are for setting the scene into the world (step 6).

Lessons:
- **A step within a square is one floor.** The bridge's deck ends partway into a square, 0.4 m over
  the court, and that square read as a wall across the bridge. Now a square's floor counts all
  that can be stood on within a step of its top. Bellhaven's main walk grew from 21,653 squares to
  30,027, with the bridge joined to the gate and the court.
- **Picture it before trusting it**: `walkpic.mjs` (a pixel a square, its height as shade, your
  points marked). Check that what should join does (the bridge, the gate, the court before the
  keep), and that nothing walkable is out in the air.
- Copy `<name>.walk.js` from `private/out-<name>/phone/` to `client/js/core/scenery/` each time it's
  rebuilt. The game imports it there, and `test/walk.test.js` and `test/scenery.test.js` read it.

## 3. Scrambled, private, in the catalog

As `import-licensed-model` §5 and §6 say, with these differences:
- Its files go in `models/scenery/`.
- Its licence note is `client/models/scenery/LICENSE.md`: one section for each file, giving what
  it is, its triangles and draw calls, its textures and what it replaces. Copy that note into the
  private repository too.
- Scramble it with `--copyright` saying whose it is, the licence, and that it's not free to reuse.
- Catalog entries (`client/models/assets.json`, `tier: "demand"`, `licensed: true`):
  - `scenery-<name>`: the phone build, for its map;
  - `scenery-<name>-far`: the far build, for the world;
  - `dungeon-prop-<name>-<part>`: a kit (step 7), with `pieces` mapping each prop's name to its
    nodes.
- Then `npm run build:manifest`. Name it in `test/scramble.test.js`, `.gitignore`, `NOTICE.md`,
  `README.md`, `docs/LICENSED_MODELS.md` and contribution.md's lists of licensed models.

## 4. A lab to measure it

`client/castle-lab.html` (`lab/castle-lab.js`, `e2e/castle-lab.spec.js`) draws the scene as the
game draws out of doors: the game's renderer, sun, shadows, fog and quality levels. It walks the
game's camera along the walk and shows draw calls, triangles, graphics memory and frame time. You
can switch detail by distance, far blocks, texture sizes and shadow stand-ins. **The owner opens it
on their iPhone for the real numbers**; nothing here measures a phone. Make it take the next scene
by name rather than writing another.

What it found in drawing the cells:
- Draw a cell at no detail until it's chosen. A cell first shown inside a block drawn whole, or
  past the fog, was being drawn at every detail under its block.
- Draw fewer cells singly, and none past the fog.
- Cast its shadows from stand-ins, not from the cells: each far block's far detail, one mesh of
  every material, on the layer only the sun's shadow sees (`world/scenery3d.js`).

## 5. Its own map

- **The scene's entry in `core/scenery.js` `SCENERY`:**
  - `name`, `walk`, `model`, `far`;
  - `column` (where its map's drawn: `SCENERY_ORIGINS`);
  - `arrive` and `facing` (where one comes in);
  - `out` (the box of squares that leads back out to the world);
  - `keep`, if it has insides to go into (step 7).
- **Gone into as a site's inside** (`core/insides.js`, `"scenery"`). Its navigation is baked from
  its floors at their heights (`core/navigation/walk.js`). It's drawn from its cells by
  `world/scenery3d.js`, and its art is readied behind the readying card at its way in
  (`app/readying.js`, `app/doors.js`). Without the art, a block a square at the walk's heights
  stands in.
- **Look at where you'll put its way in before writing about it.** Bellhaven's is the slope of
  earth rising to the bridge's near end, the ground falling away either side; it isn't a court
  with stairs. Describe it as the game draws it.
- Tests: `test/scenery.test.js`, and `e2e/bellhaven.spec.js` both with the licensed models and
  without them (its `.bin`s routed to fail). The e2e test goes in by the way in, waits out the
  readying card, walks over the bridge to the keep's doors on its floor, and leaves. It also
  checks draw calls and triangles at High (the whole frame at the bridge's foot: under 160 calls
  and 500 k triangles).
- Pictures: `mapshots.cjs`, at the points you give, through the way in as play goes.

## 6. Set into the world

→ `set-scene-into-world`. In order:
1. bake what's under it and its terrain (`walk.under`, `walk.ground`);
2. place it in the plan (`worldplan/settle.js`), turned with its plain back to the hills;
3. lay the land to it (`terrain/scenes.js`; raise `TERRAIN_VERSION`);
4. draw its far model with the world's ground material, not faded with the near world
   (`world/landmark3d.js`);
5. dress it: its ground darkened round what stands on it, boulders and scree, and mist in its
   chasm (`world/landmarkdress.js`);
6. dress its plain back faces with its own parts (`backwalls.py`, `dress.py`) and rebuild the far
   model as a new name;
7. give it a wooded hill behind it.

Read that skill's *Rules learnt the hard way* before starting: most of them cost a pull request.

## 7. Its insides a dungeon, drawn with its own pieces

The owner asked for the keep as a dungeon of four floors going up, in the castle's own style.

**Its doors and its dungeon.**
- `SCENERY[...].keep` holds:
  - `theme`, `name`;
  - `squares`: the doorway on the scene's map;
  - `arrive` and `facing`: where one comes back out;
  - `door`: the doors' face, its width and height;
  - `shell` and `top`: step 8.
- `keepSiteOf` makes it a site of its own, the castle site's. The host keeps it, wakes it and
  makes it again as any dungeon. Its floors are drawn at `KEEP_ORIGINS` (`core/insides.js`), and
  the castle's art is kept while anyone's in it.
- Its theme (`core/dungeons/themes.js` `keep`) is never a wild dungeon's. Each floor is its own,
  as a hell's realms are, and the floors go up (`rises`). Raise `DUNGEON_VERSION` and
  `NET_VERSION` when the plans or what's sent change.

**The kit** (`world/keepkit.js`, `dungeon-prop-bellhaven-keep`):
1. **Choose the pieces** with `pieces.py` and `render.py`: ones that read at the game's camera and
   tile along a wall. Bellhaven uses a Gothic column, a pilaster, a cornice, a tracery window, the
   bell, and a plane of wall and one of floor for their textures.
2. **Make them one file**: `kit.py` with a list like `bellhaven-kit.json`. Each part is a node
   named for its role, foot at 0 and centred. A wall piece faces −y with its back at y = 0, so the
   game sets it against a wall just by turning it. A material brought in twice (`M_II_2.001`) is
   made one again.
3. **Build it** (`private/bellhaven-keep.json`): `source` the `.blend`, only the materials its
   pieces use, KTX2 at 1024 with normals at 512, `phone` only. It came to 10,198 triangles in 9
   draw calls, 3.2 MB. Scramble it and give it its catalog entry with `pieces`.
4. **Set it out from the plan alone**, a pure function the same wherever it's drawn:
   - a cornice under the vault along every run of wall by the floor, and pilasters between;
   - tracery windows in the longer runs;
   - the column wherever a pillar stands;
   - the bell over the bell chamber's altar.
5. **The walls and floor drawn with the pack's own textures** (`dungeons3d.js` `setKitPicture`).
   Their mean colours (`means.py`, in `KIT_PICTURES`) colour the stone before they're read.
6. **Tint the stone cooler** (`KIT.tint`, `0xc4cde0`). Under the torches' warm light the pack's
   white stone read as pale wood.
7. **Where the roof's cut away over the camera**, draw only pieces closed all round as solid (the
   column, `"solid"`). Pilasters, cornices and windows are open at the back, and drawn both sides
   they showed their insides in dark streaks.
8. **Fetch it early, and catch it.** The kit is fetched while the castle's court is crossed. A load
   asked for ahead of need and awaited only later must have `.catch(() => null)` on it: without the
   licensed models, or with the network gone, its rejection went uncaught and failed main's tests
   (#639).
9. Without the licensed models, draw the pale stone stand-in (`interiors3d.js` `DUNGEON_LOOKS`).
   Tests: `test/keepkit.test.js`, `test/keep.test.js`, and `test/furnishings.test.js` (the scanned
   props, with the licensed kit the only other).

## 8. Seen out of: open air, balconies and the land past them

- **Measure the structure in its scene first** (`heights.mjs`): how high what stands on its terrain
  rises round it. Bellhaven's keep runs from its doors at 81.4 m to its roof at about 165 m, and
  its spires to 184 to 198 m. The cliff its back is built into rises from 112 to 169 m. So its
  floors go evenly from the doors to 168 m (`keepFloor`; its belfry is over the roof and under the
  spire), and no balcony faces north into the rock.
- **Open air** (`core/dungeons/air.js`, the theme's `air`). Rock more than three squares from a
  floor is open air (`_`), so the walls are three squares thick. Up to two big rooms get a balcony
  where their wall faces the air (`=` its parapet), only on the sides in `facing`. Bellhaven's are
  `["s", "w", "e"]`.
- **The view out** (`view.js`): on such a floor, what's far is drawn first, as out of doors, from
  where the floor stands over the world, with the floor drawn over it. That covers the sky, the far
  land, what's built on it and the castle round it. Where it stands is `keepOutlook`: `pivot` (its
  doors in the world), `at`, `y`, and `turn` (the placed scene's `[cos, sin]`), with each floor's
  plan going north into the keep as built.
- **Leave the structure's own walls out of what's seen from inside it.** The far camera stood
  inside the castle's far model and saw grey walls. `landmarkdress.js` `hollowed()` discards the
  keep's `shell` box over the floor while the far pass draws.
- **The far land has a hole round the player for the near world's ground.** Indoors there's no
  near ground: `far.update(x, z, { hole: 0 })`.
- **No trigonometry in `client/js/core`**: `Math.sin`, `cos`, `atan2` and the like aren't the same
  in every browser (`test/setpieces.test.js`, *the rules*). Carry `[cos, sin]` through and build
  the matrix in the view.
- **Draw calls**: a floor's own stay under 250. Seen out of, with the far land's levels, the far
  model and the horizon, it's under 300 at High (`e2e/bellhaven.spec.js`).
- Pictures: `floorshots.cjs` (`LOOK=1` for the balconies' views). Look from each side.

## A kit of building pieces: the house kit

Meshsmith Foundry's half-timbered building kit came in as a kit the game builds houses of, not a
scene (docs/LICENSED_MODELS.md, *The house kit*). What it took, for the next modular kit:

- **Keep the pack's own pivots** (`scripts/housekit.py`): a modular kit's pieces snap on its grid
  by their pivots (a wall's inner face at its foot), so each sits in a square of its own with its
  pivot in the middle, and the game takes the square's middle away again (kithouses3d.js).
- **Measure every fit from the pieces, never guess**: each frame's height and where its posts
  stop, the gables' rafters' line, the fills' holes and the windows' extents, the roof pieces'
  rows. Then check the rules' houses in Blender by rays (into every wall and gable, down onto the
  roof, up under the eaves) and the gables' tops against their line, and picture them.
- **Roofs from the kit's tiles, not its roof pieces**: thousands of pieces, simplified, tear
  apart. Bake one seamless repeat of each tile flat (the pack's tiles are 2 m strips: a repeat
  must be a whole number of them) and lay planes with it on the measured line.
- **One material, no shadows of its own**: the kit's pieces and roofs in one material (a
  corner's attribute picking the roof's tiles) is one more draw a block; its plaster, a dark
  inside and its soffits in the art's material cast the house's shadow.
- **A dark inside**: a pack made for Unreal leaves its plaster open round its windows, and a
  hollow house shows the ground through them.

## Rules learnt the hard way

- **Merging `main`: never take "ours" for `client/index.html`.** Take main's and regenerate:
  `git checkout origin/main -- client/index.html && npm run build:manifest`. Taking ours once
  dropped #640's markup, and every page failed to start in the browser tests.
- **Bump the version that says what changed**: `TERRAIN_VERSION` for the land, `DUNGEON_VERSION`
  for dungeon plans, `NET_VERSION` for what games tell each other.
- **Check the far model, not the full detail.** It's what the world sees, from 2.6 km in to the way
  in.
- **Measure, then picture.** A height map, a walk picture or a rock count finds in seconds what a
  picture finds in minutes, and it can't be fooled by the light.
- **Browser tests that fail locally with "Not playing" under a heavy load** (load average over 10)
  are the machine, not the change. Run them again when it's quiet before chasing them.
- **A test's draw-call budget is a promise to the phone.** When a change raises it (the view out,
  276 against 250), give it its own measured number with a comment rather than raising the old one.
- **Keep the pull requests stage by stage**, each mergeable, with pictures and the owner's say
  before the next. The owner's choices on the way changed what came next: where it stands
  (inland, the land cut under it) and its back a wooded hill.

## Scripts

In `scripts/`, run from the repository's root:

- `inspect.py -- out.jsonl file.fbx ...`: each FBX's triangles, size, materials and biggest parts
  (Blender's metres, z up).
- `pieces.py -- <Meshes dir> <out.json> [skip prefix ...]`: every part's size, triangles and
  materials.
- `render.py -- <prefix> file.fbx [width] [samples]`: clay pictures from three sides.
- `kit.py -- <Meshes dir> <pieces.json> <out.blend> [picture.png]`: a kit's parts in one `.blend`
  for the pipeline. `bellhaven-kit.json` is Bellhaven's list.
- `housekit.py -- <Meshes dir> <pieces.json> <tiles dir> <out.blend> [--cells 3]`: a modular
  building kit's pieces in one `.blend`, each keeping its pivot, a square each, its windows' glass
  apart and its roof tiles' repeats as planes; which square each is in (`<out>.cells.json`) and
  what each joins into (`<out>.joins.json`, the config's `join`).
- `means.py -- texture ...`: each texture's mean colour in linear light.
- `walkpic.mjs <walk.json | walk.js> <out.png> [scale] [level] [x,z ...]`: the walk as a picture.
- `heights.mjs <scene> <x> <z> [half] [step]`: how high it stands round a point.
- `mapshots.cjs`: pictures in its own map (`SCENE`, `SHOTS`, `OUT`, `DPR`).
- `floorshots.cjs`: pictures of its keep's floors and balcony views (`SCENE`, `FLOORS`, `ROOM`,
  `LOOK`, `OUT`, `DPR`).

The Python scripts run with the pipeline's Blender Python:
`utilities/blenderpipeline/.venv/bin/python -I .claude/skills/import-scene-model/scripts/<script> -- ...`.
Serve the game for the picture scripts with `PORT=8145 node server/index.js`, after
`npm run build:manifest`. Set `CHROMIUM_PATH` if Playwright's own browser won't start. The
set-in scene's own checks (`seated.mjs`, `open.mjs`, `rockmap.mjs`, `shots.cjs` and the rest) are
in `set-scene-into-world`.
