**The findings file was not written.** The Write tool refused a findings `.md` ("subagents should return findings as text"), so `findings-render.md` does not exist. The full findings are below instead, with the summary (under 400 words) at the end.

Scratch scripts are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/render/` (run from `/home/user/conquest` with `node <script>`). "The snapshot" is your heap snapshot `perf/out/town-phone.heapsnapshot`. `retained.mjs`, `retained2.mjs` and `retained3.mjs` work out from it what each thing alone keeps alive (everything reachable, less what is still reachable without it; about 30 s each). MB are the game's (1,048,576 bytes). Nothing below touches the simulation, so no netplay or snapshot version needs bumping.

# Findings: render (`client/js/world/`, except the characters' files)

## Answers to the six questions

1. **A frame's passes.**
   - Outdoors: the sun's shadow map every frame (1024² on Low, 2048² on Medium and High: `view.js:632-639`, `1064`), then the far scene (`view.js:2239-2270`), then the near scene over it (`2279-2286`).
   - A lamp's cube shadow (256², six faces) every 4th frame on Medium and every 2nd on High; none on Low (`view.js:72-74`, `436-459`).
   - Indoors one pass. No post-processing and no other render targets in a frame.
   - Pixels: min(devicePixelRatio, 1 / 1.5 / 2) by level (`view.js:1108`), times 1, 0.85 or 0.7 from the governor before it drops a level, 0.6 and 0.5 at the bottom (`app/governor.js:28-29`).
   - Your emulated iPhone 15 Pro on Low draws a 393 x 659 buffer, 121 draw calls and 329,000 triangles.
   - A lit pixel evaluates the sun with five hardware-filtered shadow taps (r186's `PCFShadowMap`), two point lamps that are always in the shader (no shadow lookup while their colour is 0), a counted loop of up to 16 fire lights (none by day) and one environment map.
   - The pixel load on Low is small. Triangles, the page's script and memory are what an iPhone pays.
2. **CPU inside three.js** is small and needs no more batching: 792 scene objects, 529 shown, 121 draws, and `updateMatrixWorld` is 1.7% of your profile. The woodland's per-tree culling and sorting costs 0.6 to 1.1 ms a frame in the thickest forest (measured, below).
3. **Memory** is where the work is, and most of it is on the page, not the graphics card (findings 1 to 6). The counters also mislead (finding 5).
4. **Detail at a distance:** signs (finding 8) and trees (finding 13). Buildings, rocks and undergrowth already have it.
5. **Stutter:** what is built out of the camera's view is sent to the card when first looked at (finding 10), and the sky's light is baked again about every 17 s by day (finding 11).
6. **three.js r186** is used well. Two things are unused and worth it: `BatchedMesh.setGeometryIdAt` for tree detail (finding 13), and a shadow map made by the game to drop three's unused colour (finding 9).

## The items you asked about in the snapshot

| Holder | What it is | Why it stays | Finding |
| --- | --- | --- | --- |
| `view.occluders.at` → `atlas` promise, 15 MB | The atlas's painted layers | `game.js build()` holds the promise in a closure context | 1 |
| `game.town`, 34 MB | Trees merged a copy each (14.8 MB), kit houses (7.5), atlas blocks (5.9), kit houses' compressed pictures (about 6) | Never passed to `releaseGeometry`; three keeps compressed mipmaps | 3, 4, 6 |
| `game.chunks.object`, 17 to 19 MB | Undergrowth (9.1) and hedges (1.7) not yet looked at, woodland batches (4.4), features (1.4), ground (0.7), crown shadows (0.6) | Released only on upload, and upload waits for the camera; the rest never released | 4, 10 |
| `game.chunks.woodland`, 8.4 MB | The two batches' own arrays (4.4) and the cache of grown variants (3.1) | Needed to add variants and plant; small | — |
| `game.chunks.overworld`, `game.world.plan`, `game.navBaker` | Simulation data and Recast's 16 MB WebAssembly memory | Needed; not drawing | — |
| `view.scene` child [8] | An inside's prop kit: compressed pictures 6.6 MB | three keeps compressed mipmaps | 6 |
| `view.scene` children [53] to [56] | The crowds' instanced figures (`crowd.js`), 2 to 2.5 MB each | The other reviewer's | — |
| `view.scene` key 45 → `opaque`, 5.8 MB | three's render list | Shortest-path attribution only, not a leak | — |
| `state.modules` (`fetchModelsWith`, `readModelsFrom`), 53 MB | glTF results kept with their parsers, and compressed pictures | Parser never dropped | 2, 6 |
| `game.setIn`, 6.5 MB | The scene set in the land: compressed pictures 2.6, scree 1.8 | As above | 6 |
| `game.interiors`, 4.9 MB | Each inside's `Solid` builders | Closures read `built` | 14 |

Nothing on the page is needed for picking, collision or rebuilding. Picking and the camera use height maps and the ground's own heights; a rebuild builds from the pieces; a lost context reloads the page once anything has been let go (`main.js:295-302`).

## 1. Findings, ranked

### 1. Let go of the atlas's 15 MB: `build()` keeps its promise for good
- **Where:** `client/js/app/game.js:2185` (`const atlas = prepareAtlas()`), `2241` (`() => atlas`), `2270-2271` (`this.occluders = { heights: { at: ... } }`); `client/js/world/art/engine/atlas.js:198-241`, `572-577`.
- **Now:** `prepareAtlas()` resolves with the painted layers (256 x 256 x 4 x 60 = 15.0 MB). `atlas.js:572-577` lets go of its own copy once the card has it. But `build()` holds the promise in a variable an arrow function reads, so it lives in the function's context, and the `at` closure made later in the same function keeps that context for the whole game.
- **Cost:** 15.0 MB of page memory on every device, every game.
- **Change:** have `prepareAtlas()` return a promise of nothing (`promise.then(() => {})`) and keep the data only in `prepared.data`; or in `game.js`, `const atlas = prepareAtlas().then(() => {})`.
- **Gain:** 15.0 MB. **Effort:** S. **Risk:** none seen; `lab/building-lab.js:360` only awaits it.
- **Confidence:** MEASURED (`retained.mjs`: "view.occluders.at's context's `atlas` promise: keeps 15.0 MB").
- **Verify:** a heap snapshot after loading has no 15 MB `Uint8Array` under `view.occluders`.

### 2. Drop each glTF file's parser once it is read
- **Where:** `client/js/world/art/engine/models.js:28-32` (`read`), `39-61`; `node_modules/three/examples/jsm/loaders/GLTFLoader.js:1918` (`this.body = data.slice(...)`), `2729` (`parser: parser`); the one use of a parser, `client/js/beasts/model.js:1058`.
- **Now:** every file read is kept as the loader's whole result. Its `parser` holds the file's binary chunk (a copy of nearly the whole file), a copy of each buffer view (so each KTX2 picture's bytes a second time), the JSON and every cache.
- **Cost:** 5 parsers keep 15.2 MB that nothing else holds, 7.9 MB of it the binary chunks: about twice the files' size. Each further model held adds about the same multiple. The creature files are 2.7 to 12.5 MB each and `scenery/bellhaven-2.bin` is 18.5 MB.
- **Change:** in `read()`, return `{ scene, animations }` without the parser. Give the skins' caller its materials first (`await gltf.parser.getDependencies("material")`), then drop it.
- **Gain:** 15.2 MB in a quiet town; more with each model. **Effort:** S. **Risk:** nothing else reads `parser`, `scenes`, `cameras` or `asset` (grep over `client/js`).
- **Confidence:** MEASURED.
- **Verify:** `retained.mjs` on a new snapshot prints "glTF parsers: none found".

### 3. Plant the start town's trees in the woodland's batch
- **Where:** `client/js/world/town3d.js:191-194`, `275`; `client/js/world/art/kits/trees.js:1510-1592` (`plantTrees`), `1611-1765` (`Woodland`).
- **Now:** the world's trees share one copy of each variant (`BatchedMesh`), but the start town's are still merged a copy a tree, a 24 m tile at a time.
- **Cost:** `town.mjs 2` (seed 2): leaves 8.29 MB + bark 5.96 MB = 14.3 MB and 234,000 triangles. They are held on the page (14.8 MB under the town's "trees" in the snapshot) and again in the card's buffers as each tile is drawn: up to about a third of the 39 MB of buffers reported.
- **Change:** give `buildTown` the chunks' `Woodland` and call `woodland.plant(...)`, which returns the same `{ object, boxes }`. Keep `plantTrees` for the labs, which have no chunks.
- **Gain:** about 14 MB of page memory and up to 14 MB of buffers; each tree culled on its own rather than a tile at a time. **Effort:** M. **Risk:** the two paths must look the same (leaf tints, the cutaway, crown shadows: the materials are already shared).
- **Confidence:** MEASURED.
- **Verify:** `gpu.buffersMB` in the start town; a screenshot before and after.

### 4. Let go of every merged mesh's page copy once the card has it
- **Where:** `client/js/world/town3d.js:733-759` (`joined`; used by the town at `396-413`, the chunks' buildings at `chunks3d.js:778`, the insides at `interiors3d.js:7178`, `7259`, `7274`); `art/kits/wilds.js:3398` (a chunk's features); `ground.js:1821`, `1840`; `art/kits/trees.js:1687` (crown shadows). The tool is `world/release.js:21-30`.
- **Now:** `releaseGeometry` is called in five places (undergrowth, stones, hedges, bushes). The biggest static meshes, the merged buildings, never are. Nothing reads them again (`town3d.js:304-338` and `chunks3d.js:215-228` rebuild from pieces).
- **Cost:**
  - Snapshot: the town's kit houses 7.5 MB and atlas blocks 5.9 MB; the chunks' features 1.4, ground 0.7, crown shadows 0.6, buildings 0.4.
  - Node (`buildings.mjs low 3696.5,4976.5`): the human capital's buildings are 39.9 MB over 25 chunks (871,191 corners at 48 bytes), held twice, page and card. The licensed house kit can't be read in Node, so this is with the game's own houses.
- **Change:** call `releaseGeometry` inside `joined()`, with an option the tests turn off (`test/chunks.test.js:268` reads the arrays), and on the features, ground and crown shadows.
- **Gain:** about 16 MB in the start town, about 40 MB in a capital. **Effort:** S to M. **Risk:** a mesh read after it is drawn would fail; none found in the game.
- **Confidence:** MEASURED sizes, READ safety.
- **Verify:** `retained2.mjs`: the town's and chunks' arrays fall to what has not been drawn yet.

### 5. Make the memory counters tell the truth
- **Where:** `client/js/world/gpumemory.js:110-112`, `205-213`; `client/js/world/release.js:90-98`; `client/js/app/game.js:1915-1922`; `client/js/app/memoryguard.js:27-29`.
- **Now, three errors:**
  - **Compressed pictures on the card are counted four times over.** r186 gives one as `texStorage2D` then `compressedTexSubImage2D` (`WebGLTextures.js:1032-1070`); `texelBytes` does not know compressed formats and falls back to 4 bytes a texel. `gpumem.mjs`: a 1024² ASTC, BC7 or ETC2 RGBA picture with mipmaps is counted 5.33 MB and holds 1.33 MB; ETC2 RGB is 8 times over. The unit test covers only `compressedTexImage2D`, which three no longer calls.
  - **Compressed pictures on the page are counted about three times over.** `heldOnPage` takes width x height x 4 (16 MB for a kit's 2048²) where the page holds compressed mipmaps (5.3 MB). The snapshot's game reported 32.6 MB of "interiors" for two floors whose arrays and pictures come to about 10.
  - **On Safari the world's page memory is not counted at all.** With no heap from the browser, the total has only bodies and interiors: the snapshot holds 329 MB of array data where the same game reported 87.5 MB.
- **Cost:** the crash reports' "220 to 235 MB of GPU textures" and "33 to 54 MB of floors" are overstated wherever bought models and kits are in view, and the world's page memory is missing. The guard's 400 and 460 MB marks are set against a number that is neither.
- **Change:** a table of bytes a block for compressed formats in `texelBytes` (ASTC by block size; BC1 and ETC2 RGB 8 a 4x4 block; BC3, BC7 and ETC2 RGBA 16); count a compressed picture's mipmaps in `heldOnPage`; then set the guard's marks again from the next reports.
- **Effort:** S for the counters. **Risk:** the guard's marks move, so redo them together.
- **Confidence:** MEASURED (the card's), READ (the page's).
- **Verify:** `gpumem.mjs` prints x1.0; a unit test beside `test/gpumemory.test.js:54`.

### 6. Let go of compressed pictures' page copies once the card has them
- **Where:** `client/js/world/art/engine/models.js:28-32`, `94-101`. three.js keeps `CompressedTexture.mipmaps[].data` for good.
- **Cost:** 79 compressed pictures keep 43.7 MB on the page (`retained2.mjs`). By holder (`retained3.mjs`): one creature model and its four skins 22.7 MB, a kit's file 5.3, an inside's props 6.6, the town's kit houses about 6, the scene set in the land 2.6.
- **Change:** as `releaseTexture` does for data pictures: in `read()`, chain each compressed picture's `onUpdate` to null its mipmaps' data after upload.
- **Gain:** up to 43.7 MB there (for those already drawn). **Effort:** M.
- **Risk:** a picture cloned and marked for update after its original was sent would upload nothing. `chunks3d.js:1596-1599` does this for the game's own painted pictures, so grep every `.map.clone()` that can reach a kit's or model's picture first. Hidden floors keep theirs until drawn.
- **Confidence:** MEASURED size, READ mechanism.
- **Verify:** `retained2.mjs`: "class ln: their mipmaps" falls to what is not yet drawn.

### 7. Pack and index the buildings' corners
- **Where:** `client/js/world/town3d.js:661-728` (`partsOf`: `toNonIndexed`, five Float32 attributes), `733-759`.
- **Now:** 48 bytes a corner (position, normal, uv, colour and layer, all floats), not indexed. 55% of the capital's corners are distinct (`buildings.mjs`).
- **Cost:** 39.9 MB of buffers at the capital; 5.9 MB for the start town's blocks.
- **Change:** normal as four signed bytes with the layer in the fourth; colour as four unsigned bytes (the undergrowth already packs this way); then index. That is 12 + 4 + 4 + 8 = 28 bytes, times 0.55, plus a 4-byte index: about 19 bytes a corner.
- **Gain:** about 60% of the buildings' buffers, 39.9 to about 16 MB at a capital (estimated from the measured share). **Effort:** M. **Risk:** colours quantised to 8 bits before lighting (look for banding on plaster); `shadowpasses.js runsOf` already counts indices where a geometry has them.
- **Confidence:** MEASURED sizes, estimated gain.
- **Verify:** `buildings.mjs` again; `gpu.buffersMB` at a capital.

### 8. Paint signs as big as they are seen
- **Where:** `client/js/world/art/kits/signs.js:39-62`, `132-156`; `chunks3d.js:787-797`; `view.js:72-74` (`signs`).
- **Now:** every board, sign and fingerboard of a chunk in reach holds its full picture while the chunk is drawn, whether 160 m off or 5. At the human capital there are 30 pictures: 15.6 MB on Low (half size) and 62.4 MB on Medium, where a board is 2048 x 330 and 3.44 MB (`buildings.mjs`).
- **Arithmetic:** taking a board as 3 m wide (my assumption), on Low held sideways (852 px across about 70 degrees) it is about 1,800 / d pixels wide at d metres: 360 at 5 m, 90 at 20 m, 18 at 100 m.
- **Change:** paint a chunk's signs at a quarter each way while its nearest edge is further than `DETAIL_NEAR` (40 m, where `#detail` already switches its buildings), and at the level's size nearer. The mipmap the card reads at that distance is smaller still, so nothing changes on screen.
- **Gain:** about 80% of the signs' memory round a capital: 15.6 to about 3 MB on Low, 62 to about 10 on Medium (estimated). **Effort:** M. **Risk:** a repaint as a chunk comes near (a canvas and an upload each; spread them a frame apart).
- **Confidence:** MEASURED sizes, READ arithmetic.
- **Verify:** `gpu.texturesMB` walking into a capital; screenshots at 45 m and 35 m.

### 9. Give the sun's shadow map a one-byte colour instead of three's four
- **Where:** `client/js/world/view.js:1064-1066`, `763-764`; `node_modules/three/src/renderers/webgl/WebGLShadowMap.js:251-265`; `WebGLLights.js:267`.
- **Now:** three makes the map as a render target with an RGBA8 colour picture and a depth picture. The shaders read only the depth one; the colour is written every frame and never read.
- **Cost:** 1024² x 4 = 4 MB on Low; 2048² x 4 = 16 MB on Medium and High.
- **Change:** make `sun.shadow.map` in the view before three does (it only makes one when it is null): a `WebGLRenderTarget` with `format: RedFormat`, its depth texture set up as three's is (`DepthFormat`, `UnsignedIntType`, `LessEqualCompare`, linear filters), then `shadow.camera.updateProjectionMatrix()`. The same for the lamp's cube on Medium and High.
- **Gain:** 3 MB on Low, 12 MB on Medium and High, and a quarter of the colour bytes written each frame. **Effort:** S. **Risk:** tied to how r186 sets its map up; check on each three.js update.
- **Confidence:** READ.
- **Verify:** `gpu.texturesMB` 3 lower on Low; shadows unchanged in a screenshot.

### 10. Send what is built round the player to the card as it is built, not when first looked at
- **Where:** `client/js/world/view.js:787-818` (`upload`: pictures only, and only in the camera's view); `chunks3d.js:583-590`, `1156-1160`.
- **Now:** three sends a mesh's buffers and pictures in the first frame it is inside the camera's view. In the snapshot, after 15 s standing in the town, 9.1 MB of undergrowth, 1.7 MB of hedges and 11 ground pictures (2.9 MB) are still unsent, all within reach, behind or beside the camera.
- **Cost:** the first turn of the camera sends up to about 14 MB in a frame or two. The pending amounts are measured; the hitch is SUSPECTED.
- **Change:** draw each new chunk mesh once regardless of the view (`frustumCulled = false` until its first `onAfterRender`) and `renderer.initTexture` its pictures as it is shown. They are made a step at a time already, so the sending is spread the same way.
- **Gain:** no hitch on the first turn. No change in memory in the end. **Effort:** S to M. **Risk:** a few thousand triangles drawn off screen once.
- **Verify:** on the phone, stand 10 s after arriving, turn right round, and look for frames over 50 ms in the debug log, before and after.

### 11. Measure what baking the sky's light again costs in r186
- **Where:** `client/js/world/view.js:470`, `991-1011`; `client/js/world/environment.js:122-129`; `node_modules/three/src/extras/PMREMGenerator.js:37`, `107-112`, `497-499`.
- **Now:** the sun goes round in 60 minutes (`core/daytime.js:22-23`), which is 0.03 radians every 17 s. So there is a bake that often by day, and up to every 2 s through dawn and dusk (10 minutes of every 60). Each frees the last map and makes a new one. r186 filters it with 256 samples a texel over nine passes: about 41,500 texels x 256 = 10.6 million reads, in the frame that asks.
- **Cost:** SUSPECTED a spike of several ms on a phone each time. I did not measure it.
- **Change:** time it first (`view.gpuTimer` round `#rebake`). If it shows, draw the sky into a small cube target and call `fromCubemap(cube, target)` with a kept target, and do not bake in a frame that is already late.
- **Effort:** S to measure, M to change. **Confidence:** SUSPECTED.

### 12. Recent iPhones are very likely given Low: 1x pixels on a 3x screen
- **Where:** `client/js/world/view.js:78-88`; `docs/GAME.md:2318-2319`.
- **Now:** a touch device with 4 cores or fewer is "low". As I recall WebKit's source, Safari reports 4 for any device with fewer than 8 cores, and every iPhone has 6; I could not check that here. The docs call Low "older phones" and Medium "phones".
- **Cost:** the target device draws 393 x 659 of its 1179 x 2556 pixels, with no antialiasing.
- **Change:** confirm on the phone (the debug overlay shows cores: `app/debug.js:273`). If so, tell a recent iPhone by its screen (devicePixelRatio 3 and 852 px or more on its long side) and give it Low's memory settings with more pixels. 2x without antialiasing is about 6 MB more of drawing buffer, and Adaptive steps back if it cannot hold 60.
- **Effort:** S. **Risk:** heat; that is the governor's job. **Confidence:** SUSPECTED.

### 13. Draw far trees with fewer triangles, by their size on screen
- **Where:** `client/js/world/art/kits/trees.js:1611-1765`; `node_modules/three/src/objects/BatchedMesh.js:1201` (`setGeometryIdAt`).
- **Now:** every tree out to the 128 to 154 m fade is drawn whole. A variant's wood is 470 to 1,544 triangles (mean 1,078) and its leaves 92 to 1,240 (mean 670) (`batched.mjs 2400`). In a forest as thick as the thickest sampled (48 trees a chunk), looking level: about 196 trees and 350,000 triangles in view, 247,000 of them further than 80 m and 143,000 further than 120 m.
- **Arithmetic:** on Low a metre at 80 m is 7.6 pixels, so an 8 m tree's 1,750 triangles cover about 2,300 pixels: 1.3 pixels a triangle, 0.4 at 140 m.
- **Change:** a second, lighter shape for each variant in the same batches; swap a tree's with `setGeometryIdAt` where its triangles fall under a pixel on that device (no re-upload).
- **Gain:** up to half the triangles of a forest view (estimated); nothing in open land. **Effort:** M to L. **Risk:** a visible pop if the lighter shape's outline differs, so only swap where triangles are under a pixel.
- **Confidence:** MEASURED counts, estimated gain.

### 14. Do not keep an inside's builders after it is built
- **Where:** `client/js/world/interiors3d.js:7220-7221`, `7409`, `7417-7443`.
- **Now:** the returned `update` and `drive` read `built.moving`, so the whole `built` stays, with its two `Solid` builders and every corner they laid before the merge.
- **Cost:** 4 builders keep 4.2 MB for two floors; a few MB for every floor held, uncounted.
- **Change:** take `const moving = built.moving` for the closures and null `built.solid` and `built.standIns` once merged.
- **Effort:** S. **Risk:** none seen. **Confidence:** MEASURED.

## 2. Checked and already good
- **Draw calls and batching:** blocks and chunks merged, trees batched, grass, birds, blood, tracks and contact shadows instanced. 121 draws in the start town.
- **The woodland's culling and sorting each frame:** at 2,400 trees (the thickest forest, 7 x 7 chunks), wood, leaves and the sun's shadows together take 0.6 to 1.1 ms across runs on a loaded machine (`batched2.mjs`); sorting is about 0.1 ms of it. Seed 1's start has 289 trees in its 25 chunks.
- **Shadow passes** draw only what can be seen (`shadowpasses.js`); lamps' are rationed.
- **Matrix updates:** the scene's own update is off and hidden floors are skipped (`view.js:2306-2312`).
- **Garbage a frame in `world/`:** I scanned every `update` method for allocations and found only small `filter()` calls on short lists (`effects.js:306`, `1182-1268`; `spellfx.js:2659-2738`). Vectors are kept at module scope.
- **Shader compiles and first uploads at load** (`primer`, `View.prepare`, `upload`, `settled`).
- **The far land:** three to five draws, coloured at its corners, worked out in a worker.
- **Tall grass:** on the card, no alpha, none on Low.
- **Undergrowth, hedges, bushes, stones, ground pictures and the atlas** are let go on upload.
- **Bought models' and dungeons' pictures are KTX2** (the 18 in `client/textures/dungeons` are 512², ETC1S colour and UASTC normal). The game's own painted pictures are raw RGBA with mipmaps; they are painted at run time, so compressing them is not practical.
- **Tree counts:** at most 48 a chunk in the cells sampled (`trees.mjs`).

## 3. Bugs (not performance)
- **Antialiasing is fixed when the view is made** (`view.js:548`). Changing Visual quality from Low to Medium gives no antialiasing until the page reloads, and Adaptive dropping from High to Low keeps it. The table at `docs/GAME.md:2316-2320` says otherwise. Sure (READ).
- **`GpuMemory` and `heldOnPage` miscount compressed pictures** (finding 5). Sure.
- **The atlas's release is defeated** (finding 1) and **an inside keeps its builders** (finding 14): both leaks by closure. Sure.
- **`View.portrait` walks the whole scene twice for its lights** each time (`view.js:2002`, `2085`), hidden floors included. Small; a kept list of lights would do.

## 4. Code structure
- **Letting go is opt-in at each call site** (five of them), so the biggest meshes missed it. Put it where static meshes are made (`joined`, and one small maker for the rest).
- **Two ways to plant trees** (`plantTrees` merged, `Woodland` batched). The start town is the one place the older, heavier way is left.
- **Three memory counts with different gaps** (`gpumemory.js`, `release.js heldOnPage`, `game.js memoryNow`). One list of what is held, by owner, would have shown findings 1 to 6.
- **Long-lived closures made inside long build functions** (`game.js build`, `buildingInterior`) keep everything those functions' other closures read. Return objects built from locals taken for the purpose.

## 5. Gameplay and design
- **Low on a recent iPhone** (finding 12) is the plainest thing about how the game looks on the owner's target device, and pixels are not what that device is short of.
- **Sun shadows reach 24 m** (`view.js:464`). r186 ships a two-cascade `SunLight` add-on (`examples/jsm/lights/SunLight.js`) that would reach further, but it fits its maps to the view each frame, which would undo the steady, texel-snapped shadows the game has. Not recommended as it is.

## 6. Questions for the owner
- On your iPhone, what does the debug overlay show for cores and for the quality "(suggested)"? Is a recent iPhone meant to be Medium, as the docs say?
- Is reloading the page after a lost drawing still the rule? Findings 4 and 6 lean on it.
- Do the crash reports carry `gpu.buffersMB` and the models held? With finding 5's corrections they would say how much of the 220 to 235 MB was compressed pictures counted four times.

---

# Summary

The world's drawing is in good shape for frame time: 121 draws and 329,000 triangles on Low, no post passes, shadows drawn with only what they need. Memory is where the wins are, and most of it is on the page rather than the graphics card. Sizes below are from your heap snapshot unless marked otherwise.

1. **Atlas promise kept by `game.js build()`:** 15.0 MB for the whole game. One-line fix.
2. **glTF parsers never dropped** (`models.js read()`): 15.2 MB for 5 files, about twice each file's size; grows with every model held.
3. **Start town's trees merged a copy each**, not in the woodland's batch: 14.3 MB on the page (Node, seed 2) and again in buffers.
4. **Merged buildings, features, ground and crown shadows never released after upload:** about 16 MB in the start town, about 40 MB at a capital (Node).
5. **The counters mislead.** `GpuMemory` counts compressed pictures four times over (`gpumem.mjs`: 5.33 MB counted for 1.33 held). `heldOnPage` counts them about three times over. On Safari the world's page memory is not counted at all. The crash figures and the guard's 400 and 460 marks rest on this.
6. **Compressed pictures' page copies kept after upload:** 43.7 MB; needs a check for later clones.
7. **Buildings' corners are 48 bytes, unindexed, 55% distinct:** about 60% of their buffers could go (estimated).
8. **Signs hold full pictures at any distance:** 15.6 MB on Low and 62.4 MB on Medium at a capital (Node); about 80% could go (estimated).
9. **Sun shadow map's unused RGBA colour:** 3 MB on Low, 12 MB on Medium and High.
10. **Uploads wait for the camera:** about 14 MB still unsent after 15 s standing still; a likely hitch on the first turn (suspected).
11. **Sky light baked again every 17 s by day** with r186's 256-sample filter; a suspected spike I did not measure.
12. **Recent iPhones very likely get Low** by the cores test, so 393 x 659 on a 3x screen. This rests on my recollection of WebKit; confirm on the device.
13. **Far trees drawn whole:** in the thickest forest about 70% of 350,000 tree triangles are beyond 80 m (Node).
14. **Insides keep their `Solid` builders:** 4.2 MB for two floors.

One bug besides: antialiasing is fixed when the view is made, so changing quality in options does not change it.

Findings 1 to 4 and 14 are about 65 MB in the quiet town, and finding 6 up to about 44 MB more.

Everything is in this message; `findings-render.md` was not written. Scripts are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/render/`.