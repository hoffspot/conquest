# Bodies: findings (characters and creatures as they are built and drawn)

**The findings file was not written.** The harness refused the write of `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-bodies.md` ("Subagents should return findings as text, not write report files"), and I did not work round it. The full findings are below, in the brief's format, ready to save to that path.

Nothing in the repository was changed and no browser was run. Every number is from Node scripts or from the lead's heap snapshot (`perf/out/town-phone.heapsum-1mb.txt`: emulated iPhone 15 Pro, Low, start town, 18 avatars). Timings are CPU time (`process.cpuUsage`) on a machine with a load average near 15, so ratios matter more than values.

Scripts are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/bodies/` (run with `node <name>` from that folder; `harness.mjs` holds the unit tests' DOM stand-ins):

| Script | What it measures |
| --- | --- |
| `measure-body.mjs [512\|1024] [--detail]` | 25 bodies built as the game builds them: every texture, buffer, mesh, bone, triangle |
| `count-garments.mjs` | How many garments have a picture of their own |
| `texel-density.mjs` | Texels a metre of the body's picture, by area |
| `measure-crowd.mjs`, `crowd-verts.mjs` | A crowd figure's memory; how many of its corners its triangles use |
| `inspect-models.mjs` | Every `client/models/beasts/*.bin`, read in memory only |
| `load-model.mjs <kind> [n]` (`--expose-gc`) | A bought model read without its pictures, copies made by `modelBody` |
| `model-retained.mjs <file>` (`--expose-gc`) | What a read model keeps on the page with and without its glTF parser |
| `held-compressed.mjs` | What `heldOnPage` counts for a compressed picture |
| `interleave.mjs` | Two bodies in one outfit built turn and turn about |
| `orphan-index.mjs` | Index buffers replaced after a body is first drawn |
| `frame-cost.mjs`, `skirt-cost.mjs`, `measure-cost.mjs` | Posing, skeletons, a skirt's skeleton, `measureBody` |
| `prof-build.mjs`, `top-prof.mjs`, `incl-prof.mjs` | CPU profiles of building bodies and crowd figures |

## The facts asked for

### Q1. What one body drawn in full holds (MEASURED, `measure-body.mjs`)

`QUALITY` (`client/js/world/view.js:72-74`): Low and Medium `skin: 512`, High `skin: 1024`; `hair` 0.2 / 0.3 / 0.45; `bodies` 32 / 32 / 24; `models` 40. Everyone but a player is built with `merge: true, far: true, release: true` and hair at most 0.2 (`client/js/app/game.js:2642`, `2725`, `531`).

| What | Format and size | On the card | On the page | Whose |
| --- | --- | --- | --- | --- |
| Skin: colour, roughness in alpha (`character.js:1494`, `170-182`) | RGBA8 sRGB, 512² (1024² on High), mipmapped | 1.33 MB (5.33) | 1 MB (4) until sent, then let go (`character.js:1498-1505`) | its own |
| Skin bumps (`character.js:1495`) | R8, same size, mipmapped | 0.33 MB (1.33) | 0.25 MB (1) until sent | its own |
| Outfit, colour (`character.js:1384`; `garments.js:1801`) | RGBA8 sRGB 512², mipmapped, alpha always 255 (`garments.js:1885`) | 1.33 MB | 1 MB, kept | everyone in the same garments (`kit.composites`) |
| Outfit, height / roughness / metalness (`character.js:1382`; `garments.js:1802`) | RGBA8 512², mipmapped, alpha always 255 | 1.33 MB | 1 MB, kept | the same |
| Each garment's own picture and bumps (`character.js:1331-1339`) | RGBA8 512² + R8 512², mipmapped | 1.67 MB, only if someone draws with it (a player) | 1.25 MB, kept for good (`kit.garmentMaterials`) | the kit's |
| Wounds (`world/wounds.js:549-561`) | RGBA8 512², mipmapped; none till the first blow | 1.33 MB | 1 MB | its own, till healed |
| Eyes (`character.js:1519-1530`) | canvas 256² | 0.33 MB | 0.25 MB | each look of eye (7 among 25 bodies) |
| Lashes, hair strands | 512×64, 128×256 | 0.17 MB each | 0.13 MB each | everyone |
| Expressions' moves (`expressions.js:159`) | RGBA32F | 1.8 MB | 1.8 MB | everyone |
| Bones | 52 (a skirt adds a skeleton of 56) | 16×16 RGBA32F, 4 KB | | its own |
| Body mesh, 18,427 corners | position and normal f32×3; uv f32×2; skinIndex and skinWeight u8×4; faceSlot i16; index u16 with every level | 0.83 to 0.91 MB | 0.58 MB its own | position, normal, index its own; the other four identical for everyone yet sent per body (F8) |
| Garments' mesh (all in one) | 10,800 to 30,300 corners × 40 B, index u16 | 0.55 to 1.42 MB | the same | its own |
| Hair, far hair, what it carries | | 0 to 0.37 MB; 0.02 to 0.4 MB | the same | its own |

Totals on Low or Medium:

- **A townsman or woman in an outfit nobody else wears:** 4.33 MB of pictures on the card (1.67 skin + 2.67 outfit), 2 MB of the outfit on the page, and 1.7 to 2.4 MB of meshes on the page and again on the card. That is 10 to 11 MB, the "about ten megabytes" of `view.js:61`.
- **A guard in a uniform three others wear:** 1.67 MB of its own pictures; the uniform's 2.67 MB once.
- **Outfits per body:** 24 townsfolk and guards hold 16 outfits; the lead's snapshot has 14 for 18 avatars.
- **A player** (garments drawn one by one): 15.0 MB of pictures on the card, 11.25 MB on the page.
- **On High** a body's own skin is 6.67 MB on the card; the outfit is still 512².

Already as small as it can be: both kinds of bumps are one channel; the skin's alpha is used; wounds use all four channels; eye, lash and hair pictures are shared. Mipmaps are needed everywhere.

### Q2. Draw calls, triangles, skinned meshes, bones (MEASURED)

| | Meshes (skinned) | Draws in full | Bones | Triangles full / middle / far |
| --- | --- | --- | --- | --- |
| Guard, sword and shield | 8 (4) | 10 | 52 | 51,900-54,500 / 18,200-20,900 / 12,300-13,200 |
| Guard, bow | 7 (4) | 9 | 52 | 50,700 / 17,600 / 11,200 |
| Townsman | 2-6 (2-5) | 5-8 | 52 | 39,800-53,200 / 8,900-23,300 / 3,700-10,200 |
| Townswoman, skirt and apron | 5-8 (4-6) | 7-10 | 52 + 56 | 43,600-47,000 / 12,500-16,300 / 4,800-10,000 |
| Player (heroine) | 13 (11) | 15 | 52 | 45,100 / 13,900 / 7,700 |

A merged body's garments already are one skinned mesh with one picture; a player's are not (F9). What is carried stays a mesh a piece (docs/CHARACTERS.md lists merging it as a next step: planned, not done).

Bought models: flayling 13,562 triangles and 58 bones; werewolf 28,065 and 67; Dreadthorn 48,658 and 180; Stone Golem 75,406 and 81; Kaiju 88,550 and 99; an Order foot knight 149 bones on 8 or 9 skeletons drawn; an Order rider 443 bones on 16 skeletons drawn (F7).

### Q3. CPU a frame (MEASURED in Node under load)

- **Posing** (`Avatar.update`): townswoman walking 57 to 100 µs; guard walking about 200 µs, on guard 680 to 950 µs. docs/CHARACTERS.md has 108 and 222 µs on a quiet desktop; the ratio agrees. Posed every 1 to 4 frames by size, 8 out of view (`avatar.js:38-49`).
- **Matrices and bones:** world matrices 8 to 10 µs; the body's `skeleton.update` 3 µs; a skirt's own skeleton 30 to 35 µs every frame, however seldom its wearer is posed (F12).
- **What scales with bodies in view:** poses, one bone texture a skeleton, 5 to 10 draws each, and for bought models one skeleton and bone texture a material (F7).
- No morph targets are used. The town's banners (`world/cloth.js`) move in the vertex shader.

### Q4. Building (MEASURED, `prof-build.mjs`: 24 bodies, 16 outfits, 34 garments painted)

13.8 s of CPU, 575 ms a body cold (skin left out, as the game paints it in a worker):

- fitting garments to the body 27% (156 ms a body);
- painting each garment's picture the first time 24% (97 ms a garment);
- growing the hair twice 17% (97 ms a body);
- the outfit's picture 6% (49 ms an outfit);
- `measureBody` 4% (21 ms a body, used only by skirts: F10);
- the garbage collector 14% of the whole run.

Painting a skin at 512² took 120 to 260 ms and the skin atlas 1.3 s (both in the worker in the game).

### Q5. Crowd figures (MEASURED)

| Kind | Corners held | Triangles merged / near / far | Card | Page | CPU to make |
| --- | --- | --- | --- | --- | --- |
| Human soldier, sword | 28,973 | 14,250 / 6,411 / 2,564 | 3.96 MB | 3.75 MB | 6.6 s (first: garments painted) |
| Elf soldier, bow | 23,824 | 12,117 / 5,447 / 2,181 | 3.39 MB | 3.18 MB | 3.1 s |
| Townswoman | 4,287 | 4,828 / 2,170 / 867 | 1.44 MB | 1.23 MB | 1.4 s |

Of a soldier's 3.96 MB: corners 2.54 MB (92 B each, all Float32: `crowd.js:579-587`), picture 0.83 MB, moves 0.45 MB, indices 0.13 MB.

When bodies swap: a soldier goes to its crowd past 45 m from the camera (`DETAIL`, `game.js:726`), or in a battle of more than 24 all but the nearest 4 / 6 / 10 (`game.js:650`, `4716`). The wild's people-shaped creatures and the townsfolk go past the bodies' budget or past 45 m (`game.js:5049`, `5233`). A figure is let go 60 s after nobody is of its kind (`crowd.js:99`).

### Q6. Bought models (MEASURED)

74 files, 147.7 MB. Inside they are already good: meshopt, quantized attributes, KTX2 pictures (ETC1S colour, UASTC normals), mostly 1024², the Kaiju's 2048². Unscrambling took 0.1 to 8 ms of CPU a file.

| Model | File | Pictures | Pictures on an iPhone's card | Page as read, without pictures | Of that, the parser |
| --- | --- | --- | --- | --- | --- |
| flayling | 1.3 MB | 4 × 1024² | 3.3 MB | 4.5 MB | 2.8 MB |
| werewolf | 3.2 MB | 7 × 1024² | 6.0 MB | 6.5 MB | 4.3 MB |
| Dreadthorn | 4.8 MB | 3 × 1024² | 2.7 MB | 18.1 MB | 10.1 MB |
| Stone Golem | 4.2 MB | 7 × 1024², 3 × 512² | 5.7 MB | 13.1 MB | 8.1 MB |
| Kaiju | 3.7 MB | 3 × 2048², 1 × 1024² | 9.3 MB | 10.7 MB | 5.7 MB |
| Order (foot) | 7.5 MB | 15 × 1024², 6 × 512² | 12 MB | 23.9 MB | 13.7 MB |
| Order (mounted) | 11.9 MB | 28 × 1024², 12 × 512² | 22.7 MB | 34.7 MB | 19.2 MB |

Every copy shares shapes, pictures and clips. Its own are its nodes, a skeleton for every skinned mesh, its materials and a mixer with an action for every clip (`model.js:2261-2268`). A copy on the page: werewolf 0.7 MB, Order foot knight 2.0 to 2.5 MB, Order rider 5.25 MB; 22, 37 to 48 and 80 ms of CPU to make. The keep and forget policy (near a lair, at a door, 3 minutes, 30 seconds: `model.js:1381-1388`) is sound.

---

## 1. Findings, ranked

### F1. Hold a body's pictures at the size it is seen: 256² until it is about 120 pixels tall

- **Where:** `client/js/characters/character.js:1483-1506` (skin), `1352-1403` (outfit); sizes fixed at `1326`, `1359`; `client/js/world/wounds.js:28`, `549-561`; `client/js/app/game.js:4496-4521` (`#posing` already knows each body's height on screen).
- **Now:** every body holds its skin at 512² (1024² on High) and its outfit at 512² however small it is. That is 4.33 MB on the card for a body in its own outfit on Low, 9.33 MB on High. In the snapshot, bodies' pictures are 60 to 75 MB of the 133 MB of textures; in the crash reports (30 bodies and more) about half of 220 to 235 MB.
- **Why it is invisible:** MEASURED (`texel-density.mjs`): the sparsest 5% of the skin gets 227 texels a metre at 512², the legs 255, the median 269, the head 641. A body 120 pixels tall has 71 pixels a metre, so even the sparsest skin is 3.2 texels a pixel: mip level 1.7 (1.2 with the laxest estimate a card may use). Level 0 is never sampled, and a 256² picture is exactly level 1. Anisotropic filtering cannot go finer than the footprint's short side.
- **On the target phone:** an iPhone 15 on Low held sideways draws a 1.75 m body 1058/d pixels tall. The player is about 100 pixels at the starting zoom; only someone within 8.8 m of the camera passes 120. Held upright it is 1345/d: within 11 m.
- **Change:** paint as now, but give the page a 2×2 mean (colour in linear light) while the body is under about 100 pixels. Past about 120, ask the worker for the full picture and swap it in place; drop back after a while under 100. Do the same for the outfit's two pictures (by its tallest wearer) and a wounded body's damage picture. On High: 256² under 120, 512² under 240, 1024² above.
- **Gain (estimated from measured sizes):** 4.33 → 1.08 MB a body. 18 avatars: 45 to 50 MB of the 133. 30 bodies with 21 outfits: about 80 MB.
- **Effort:** M. **Risk:** a body that comes near faster than its full picture arrives is a little soft for a few frames. No simulation change.
- **Confidence:** READ for the sampling argument, MEASURED for sizes and density.
- **Verify:** `gpu.texturesMB` in a town of 30; a screenshot diff of the uniform lab's figures at 100, 119 and 121 pixels tall.

### F2. Let go of the kit's page copies: garments' pictures, outfits' pictures, the painting scratch

- **Where:** `character.js:1306-1345` (`kit.garmentMaterials`, never evicted), `1352-1403`, `170-182`, `44`, `90-106`, `1407-1414`; `garments.js:1944-1969`; `world/release.js:5-10`; `world/crowd.js:340-353`.
- **Now (MEASURED, snapshot, `game.kit` = 101.5 MB):**
  - **`kit.garmentMaterials` 32.6 MB:** 26 garments × 1.25 MB. Kept so the next outfit can be put together from them (`character.js:1367-1380`) and so a player can draw with them. Nothing evicts one; 103 garments have their own picture, so it can reach 129 MB. `bodiesMB` counts only those a player draws with: about 21 MB here is counted by nothing.
  - **`kit.composites` 28.1 MB:** 14 outfits × 2 MB. The height/roughness/metalness half is read by nothing once sent. The colour half is read only when a crowd figure is made from that outfit (`crowd.js:455-458`), into a 256² place on Low and Medium. Counted in `bodiesMB` while worn; up to 8 idle ones (16 MB page, 21 MB card) are counted by nothing.
  - **`kit.texelMap` 11.4 MB:** `points` 4 MB is a cache for painting garments; `weights`, `triangles`, `slopes`, `corners` 3.75 MB are read only while painting; `positions` 3 MB is also the wounds'.
  - **`kit.referenceMeasures` 10 MB:** 3.3 MB of vertices as objects, 6.7 MB of garments' cuts kept for the next body (`garments.js:450`). Every dressed body needs the cuts; leave them.
  - **`kit.atlas` 8 MB, `kit.human` 7.4 MB, `kit.lods` 2.4 MB, `kit.woundMap` 1.6 MB:** see F11.
- **Change, easiest first:**
  1. `releaseTexture` on an outfit's second picture (`character.js:1382`).
  2. Idle outfits and eyes let go when the memory guard goes up (`game.js:5545`); keep 2 idle on touch devices.
  3. Garments' pictures nobody draws with let go 30 seconds after they were last used, and at once when the guard goes up. `#readying` already paints one that is not there.
  4. The outfit's colour let go once sent, keeping a 256² copy for `figureOf`.
  5. `texelPoints` dropped when the guard goes up.
- **Gain:** in the snapshot 14 + 10.5 + 21 + 4 = about 50 MB of the page's 427 MB, plus up to 37 MB of idle outfits, and growth to 129 MB is stopped.
- **Effort:** S for 1, 2, 5; M for 3, 4. **Risk:** fix bug B1 first, or a picture let go may still be worn.
- **Confidence:** MEASURED. **Verify:** the same snapshot with `game.kit` under 60 MB; `test/crowd.test.js`, `test/character-building.test.js`.

### F3. Crowd figures: keep only the corners their triangles use, as bytes, and let the page's copy go

- **Where:** `client/js/world/crowd.js:577-588`, `1219-1264`, `1233`, `1060-1069`.
- **Now (MEASURED, `crowd-verts.mjs`):** a human sword soldier's figure holds 28,973 corners, 2.54 MB on each side. Its near and far triangles together use 9,080 of them, 31%. (Orc with a cleaver: 25,510 held, 7,549 used.) Half the corners are exact duplicates: what it carries is unindexed and merged twice, in hand and put away.
- **Change:** in `templateFrom`, once both lists exist, keep only the corners they use and store attributes as what they are (normals i8, uv u16, colour, bones, weights, set, part, surface as bytes): 36 B a corner. Then release the page's copies of the geometry and the moves.
- **Gain:** a soldier kind 3.96 → 1.7 MB on the card and 3.75 → about 0.7 MB on the page. 18 kinds: about 95 MB; the 28 kinds of the invasion in `game.js:665-667`: about 150 MB.
- **Effort:** S to M. **Risk:** 8-bit weights move a corner under a millimetre (`test/crowd.test.js` allows two).
- **Confidence:** MEASURED. **Verify:** `crowd-verts.mjs`; `gpu.buffersMB` in a field battle.

### F4. Bought models: let go of the file and its parser once read, and of the pictures' page copies once sent

- **Where:** `client/js/world/art/engine/models.js:28-32`; `client/js/beasts/model.js:1023-1031`, `1039-1072`; three.js `GLTFLoader.js:1913-1918`, `2723-2730`.
- **Now:** the loader's result keeps `parser`, which holds a copy of the file's bytes and its JSON as text and as objects. The game uses a parser only for a skin file, at once (`model.js:1058`). Dropping it frees 2.8 MB (flayling) to 19.2 MB (Order mounted): the last column of the Q6 table. Separately (READ), each KTX2 picture's mipmaps stay on the page after sending: 2.7 MB (Dreadthorn) to 22.7 MB (Order mounted) on an iPhone. The snapshot shows the same for a scenery material (`map.mipmaps` 5.3 MB).
- **Change:** set `gltf.parser = null` in `read()` once skins' materials are taken; add a release for compressed pictures beside `releaseTexture`.
- **Gain:** a hell dungeon's six kinds about 27 + 15 MB of page; Bellhaven about 41 + 35 MB; the Dreadthorn alone 12.8 MB. `read()` serves every glTF, so scenery and kits gain too.
- **Effort:** S. **Risk:** the model viewer uses `parser` (`lab/model-viewer.js:2000`); keep it there.
- **Confidence:** MEASURED for the parser, READ for the pictures. **Verify:** a heap snapshot with a Dreadthorn read; `e2e/models.spec.js`.

### F5. Keep made crowd figures between sessions

- **Where:** `crowd.js:1171-1264`; `game.js:4924-4932` (a soldier kind is `people:sex:weapon` from seed 1, the same every time), `663-668`.
- **Now:** each kind is built from nothing every session: a whole character (66%), its moves recorded (25%), then merged. That is 1.4 to 6.6 s of CPU a kind here, spent at 10 ms a frame while soldiers wait unseen.
- **Change:** store the finished figure in the Cache API under the app's version, the kind and the picture size (about 1 MB a kind, the 40 most recent kept); look there first.
- **Gain (estimated):** a kind met before appears in tens of ms instead of seconds of steps.
- **Effort:** M. **Risk:** storage refused or cleared falls back to making it.
- **Confidence:** MEASURED cost, estimated gain.

### F6. Fix the three places the memory guard's count is wrong

- **Compressed pictures counted six times over** (`world/release.js:90-99`): a 1024² ETC2 picture counts 4.00 MB and holds 0.67 MB (`held-compressed.mjs`). One Order knight in view adds about 60 MB to `bodiesMB` that is not there, so the guard cuts bodies and sound early.
- **The kit and model copies counted by nothing** (`game.js:1920` walks avatars only): 21 MB of garments, idle outfits, 40 MB of fixed data, each knight's 2 to 5 MB, the parsers, both workers.
- **Buffers freed by garbage collection never leave the count** (`world/gpumemory.js:194`): `#updateIndex` and `#lowerGarment` replace a geometry's index (`character.js:1764`, `1907`), and three.js deletes a buffer only on its geometry's dispose. Upper bound measured: 3.5 MB for 24 bodies (`orphan-index.mjs`). Over a long session `gpu.buffersMB` only grows.
- **Change:** count mipmaps' bytes; add a `kitMB` line to `memoryNow`; use a `FinalizationRegistry` in `GpuMemory`; size a body's index once for all levels.
- **Effort:** S. **Risk:** the guard's marks were set against the present count and would need moving if the kit is added to its sum.
- **Confidence:** MEASURED (first, third), READ (second).

### F7. Bought models of many parts: one skeleton a copy, clips bound when first played, the sphere worked out once

- **Where:** `client/js/beasts/model.js:2063`, `2191-2226`, `2261-2268`, `2279-2291`; `SkeletonUtils.js:414`.
- **Now (MEASURED, `load-model.mjs`):**

  | Copy | Skeletons drawn × bones | Bone textures sent a frame | `skeleton.update` a frame | Page a copy | CPU to make |
  | --- | --- | --- | --- | --- | --- |
  | Order foot knight | 8-9 × 149 | 98-110 KB | 52-80 µs | 2.0-2.5 MB | 37-48 ms |
  | Order rider | 16 × 443 | 484 KB | 290-450 µs | 5.25 MB | 80 ms |
  | werewolf | 4 × 67 | 25 KB | 11-43 µs | 0.7 MB | 22 ms |

  A knight's mixer with all 34 clips is 1.16 MB; with 8 clips 0.38 MB. Each copy is made in one step, so a rider is a stall on a phone. `QUALITY.models` lets 40 be held: 40 knights are 80 to 100 MB that nothing counts.
- **Change:** bind a copy's meshes to one skeleton where `joinedShape`'s test (`model.js:1869-1904`) passes; make a clip's action when first weighted; keep the sphere with the model; leave unworn parts out of the clone.
- **Gain (estimated):** a rider 16 → 1 skeleton updates and 484 → 30 KB sent a frame; about 0.8 MB less a knight; a third off the time to make one.
- **Effort:** M. **Risk:** only matters where the Order is met.
- **Confidence:** MEASURED in Node; the phone's frame cost is SUSPECTED until a patrol is profiled.

### F8. Send once what is the same for every body

- **Where:** `character.js:1698-1716`, `133-164`.
- **Now (MEASURED):** each body sends its own uv, skinIndex, skinWeight and faceSlot, 0.33 MB, identical for all. A uniform's garments' uv, bones, weights and index (0.76 MB of a guard's 1.42 MB) are identical for everyone in it.
- **Change:** one shared `BufferAttribute` each, taken off a geometry before it is disposed.
- **Gain:** 0.33 MB a body on the card (10.6 MB at 32 bodies); 0.76 MB each side for each further guard in a uniform.
- **Effort:** S for the body, M for outfits. **Confidence:** MEASURED.

### F9. A player's garments drawn all at once, once worn a few seconds

- **Where:** `game.js:2673`; `character.js:632-680`.
- **Now (MEASURED):** a player is 11 skinned meshes and 15 draws, with 13.3 MB of garment pictures on the card and 10 MB on the page, against 2.67 MB as an outfit.
- **Change:** draw one by one only while changing gear; then put the outfit together in steps and swap.
- **Gain:** about 10.7 MB on the card and 9 draws a player.
- **Effort:** M. **Risk:** outfits mix garments across their edges (`garments.js:1788-1793`); compare a close view first.

### F10. Do not measure a body unless it wears a skirt

- **Where:** `character.js:596`; its only use is `703`.
- **Now (MEASURED):** 13.5 to 33.6 ms of CPU and about 5 MB of short-lived objects for every body built. No soldier uses it.
- **Change:** work it out when the first drape is built. **Effort:** S. **Risk:** none.

### F11. The kit's fixed data: about 41 MB on the page, of which about 12 can go

- **Where:** `characters/skins.js:71-92`, `kit.js:44-48`, `expressions.js:159`, `garments.js:109-121`.
- **Now (MEASURED):** the page keeps a second copy of the skin atlas (8 MB at 512², 29 MB at 1024²), read only when a skin must be painted without waiting. The expressions' texture keeps 1.8 MB on the page after sending. The reference vertices are 3.3 MB of objects.
- **Change:** drop the page's atlas when the guard first goes up; release the expressions' texture and make it half floats; hold the vertices as typed arrays.
- **Effort:** S each. **Risk:** a follower hired under memory pressure appears a few tenths of a second later.

### F12. A skirt's swing worked out only when its wearer has been posed

- **Where:** `characters/drapes.js:713-785`.
- **Now (MEASURED):** 30 to 35 µs a frame for each skirt against 3 µs for a body's skeleton, whether or not the legs moved.
- **Change:** skip the swing unless the rig has been posed since. **Gain:** about 0.3 ms a frame with 15 skirts here. **Effort:** S.

### F13. Garments' pictures painted in the skins' worker

- **Where:** `character.js:1306-1403`; `garments.js:1979`, `1796`; `skin-worker.js`.
- **Now (MEASURED):** 97 ms a new garment and 49 ms a new outfit on the page's thread, 30% of dressing a town for the first time.
- **Change:** the worker keeps the texel map and the garments' pictures and returns the outfit's two pictures. **Effort:** M to L. Do F2 first.

## 2. Checked and already good

- Garments merged into one mesh and picture, shared by outfit; lower detail made once and kept.
- Skins painted in a worker and let go once sent; an unhurt body shares a 1×1 damage picture.
- Single-channel bumps; shared eye, lash and hair pictures.
- Posing rationed by size and view. I found nothing further worth taking out of the pose.
- Bodies built in steps, nearest first, hidden until compiled and sent.
- Shadows cast from the far body alone.
- Beasts built in code: one shared body a look, held, lingered, counted.
- The bought models' files and their keep and forget policy.
- `world/cloth.js` and `world/flesh.js`: nothing a frame.
- Considered and not recommended: compressing bodies' pictures on the device; repacking the outfit's channels; a shared array of garment pictures in place of outfits; 8-bit normals on bodies.

## 3. Bugs

- **B1. An outfit's picture can be made twice and its wearers miscounted** (MEASURED, `interleave.mjs`). `character.js:1358` tests the cache and `1396` sets it many steps later. Two bodies in one outfit built turn and turn about both make it; the kit ends with one entry counting one wearer while two wear different pictures. Letting the first go drops the count to 0 though the second still wears the kit's, and the first's is never disposed. `#readying` has the same gap. Sure.
- **B2. `heldOnPage` over-counts compressed pictures** (F6). Sure.
- **B3. Replaced index buffers are collected, never deleted** (F6). Sure of the mechanism; the size in a browser depends on timing.
- **B4. `Batch.#fit` and `Batch.dispose` take the wrong attributes off before disposing** (`crowd.js:1083-1088`, `1147-1156`): the figure's shared buffers are deleted and sent again (2.5 MB) each time a crowd doubles. READ; fairly sure.
- **B5. `releaseTexture` clears `image.data` only**, so it does nothing for a compressed picture: relevant to F4.

## 4. Code structure

- The kit's caches grow by five different rules or none. One "kept" helper with a size, a user count and a `flush()` for the memory guard would replace `take`/`letGo` and make F2 short.
- `memoryNow` should report the kit and model copies as their own lines.
- A `BufferAttribute` shared between geometries is deleted by three.js on either's dispose. A helper for "dispose my own only" would stop B4 recurring.
- Any cache filled across a `yield` in `Character.building` needs B1's "being made" guard.

## 5. Gameplay and design

- On an iPhone held sideways at the starting zoom the player's hero is about 100 pixels tall, below even the far level's 140. The detail held for bodies is seen only zoomed in, indoors or in the pack. That is the room F1 uses.
- `QUALITY.models: 40` assumes a copy is cheap. It is for a flayling, not for an Order knight or rider.

## 6. Questions for the owner

1. F1: is a full picture arriving up to about a second after a body passes 120 pixels acceptable?
2. F9: may the player's outfit be one picture when they are not changing gear?
3. F11: under memory pressure, may a follower hired on the spot appear a few tenths of a second later?
4. F5: is about 40 MB of made crowd figures in the browser's storage acceptable?
5. F7: how often are Order knights and riders met on phones?

---

## Summary

The findings file could not be written (the harness blocks subagents from writing report files); the full text above is meant for `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-bodies.md`.

Top findings, in rank order:

1. **F1, pictures at the size seen.** A body under about 120 pixels tall never samples its 512² pictures (measured texel density: at least 3.2 texels a pixel). Holding 256² until then cuts a body from 4.33 to 1.08 MB on the card: about 50 MB in the snapshot's town, about 80 MB at 30 bodies. On an iPhone held sideways even the player is about 100 pixels tall.
2. **F2, the kit's page copies.** `game.kit` is 101.5 MB. Garments' pictures (32.6 MB, never evicted, up to 129 MB, mostly uncounted) and outfits' pictures (28.1 MB) can go once used: about 50 MB with no visible change.
3. **F3, crowd figures.** A soldier's figure holds 28,973 corners and its triangles use 31% of them, all as Float32. Compacting and packing saves about 5 MB a kind: about 95 MB for 18 kinds.
4. **F4, bought models.** Each read model keeps its file and glTF parser (2.8 to 19.2 MB) and its pictures' page copies (2.7 to 22.7 MB on an iPhone). One line frees the first.
5. **F5, crowd figures cached between sessions.** They cost 1.4 to 6.6 s of CPU a kind and are deterministic.
6. **F6, the memory guard's count.** Compressed pictures are counted six times over; the kit and model copies not at all; buffers freed by garbage collection never leave it.
7. **F7, Order knights and riders.** 9 and 16 skeletons a copy, 110 and 484 KB of bone textures a frame, 2 to 5 MB of page each.

Smaller: shared attributes (F8), the player's outfit merged (F9), `measureBody` skipped (F10), fixed kit data (F11), skirts (F12), garment painting in the worker (F13).

One bug needs fixing before F2: an outfit's picture can be made twice with its wearers miscounted (B1, reproduced by `interleave.mjs`).

Already good, no work needed: merged garments, skins in a worker, posing by size, stepped building, the models' files and their keep policy.