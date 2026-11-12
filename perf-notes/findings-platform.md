## Summary (platform)

**The file was not written.** The Write tool refused `findings-platform.md` ("Subagents should return findings as text, not write report files"), and I did not route around the block. The full findings are below, ready to save as `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-platform.md`. My scripts are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/platform/scripts/`.

Top findings, in rank order:

1. **three.js r187: later, not now.** I diffed r186.1 and r187 sources against the game's patches (50 `onBeforeCompile` hooks, 158 `#include` replacements, 19 exact-text matches). r187 breaks skin loudly (`surfaces.js:33`) and breaks still-water and shiny-atlas reflections silently (`water.js:386`, `atlas.js:651`: the `ENVMAP_TYPE_CUBE_UV` define is gone). Its new environment map is cheaper per pixel (three's PR measured 3.14 to 2.36 ms on an M1), but it floors maps at 256 where the game asks for 128: about 11.5 MiB more GPU memory, about four times the sky re-bake work, and a slightly different look. Make the three spots version-proof now (S); upgrade in its own measured pull request (M).
2. **Node 26 LTS for CI and servers.** Measured, three runs each: 15% less CPU making and stepping a world and 24% less baking tiles than Node 22. Node 22 ends April 2027.
3. **recast-navigation 0.44.0, plus destroying the bake's context and params.** Measured: each tile bake leaks 2.6 KB of JavaScript heap (three objects never destroyed). It matters most for a long-running world server.
4. **Skip WebGPURenderer.** three's manual calls it experimental; it supports neither `onBeforeCompile` nor `ShaderMaterial` (about 1,470 lines of GLSL in 52 files to port); an open issue and a forum measurement show it slower on CPU. No iPhone measurement with skinned characters exists.
5. **Read one `JetsamEvent` report from the phone.** Safari gives a page no memory API and no warning. WebKit engineers cite a soft limit near 1.5 GB, yet the game dies at about 550 MB tracked.
6. **`detectQuality` puts every iPhone on Low by accident:** Safari has no `deviceMemory` and reports 4 cores for any device with fewer than 8.
7. ESLint 10 (25 new errors, measured), Playwright 1.65 (routine), draco 1.5.9 (now, lockfile only). The esbuild pin is already the latest.

Checked and fine: KTX2 transcode targets on iPhone (ETC2 and ASTC), sound decoded at its own rate, background shader compiling, the old `powerPreference` WebKit bug (fixed 2024).

Not in Safari through 27.2: `scheduler.yield`, `scheduler.postTask`, `requestIdleCallback`, any memory API.

Three questions for the owner are at the end of the findings.

---

# Findings: platform (library versions and browser facts)

Reviewed 2026-11-11. Area: three.js and the other dependencies' versions, Node, and what iPhone Safari and the web platform do today. Web research plus some reading and measuring in the repository. Nothing in the repository was changed.

How to read the labels:

- MEASURED: I ran something here; the command or script is named. Scripts are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/platform/scripts/`.
- READ: traced in code (the game's, three.js's or WebKit's), with the arithmetic shown.
- SOURCED: a web page I opened says so; the number in brackets points to the sources list at the end. The pages were read through the fetch tool, which summarises them, so check a figure at its source before quoting it onward.
- UNCONFIRMED: I could not open a page that says so, or the evidence is indirect.
- SUSPECTED: plausible, not confirmed; how to confirm is given.

Versions in short (details in the findings):

| Package | Have | Latest | Verdict |
|---|---|---|---|
| three | 0.186.0 (r186) | 0.187.0, released 2026-10-30 | Later, as its own measured change. Three spots to make version-proof now (finding 1) |
| three 0.186.1 | | 2026-09-24 | Skip: it changes four WebGPU and node files only (MEASURED, diff) |
| WebGPURenderer | not used | | Skip for now (finding 4) |
| Node | 22 (CI), 24.21.0 (Mac app) | 26.13.0, Active LTS | Now for CI and servers (finding 2) |
| @recast-navigation/core, wasm | 0.43.1 | 0.44.0 | Now, with a fix in the bake (finding 3) |
| @recast-navigation/generators | 0.43.1 | 0.44.0 | Not imported by anything; could be dropped (code structure) |
| @playwright/test | 1.63.0 | 1.65.0 | Later, routine (finding 8) |
| eslint, @eslint/js | 9.39.5 | 10.14.0, 10.0.1 | Later (finding 7) |
| globals | 16.5.0 | 17.14.0 | Later, with ESLint; its one breaking change doesn't touch the game (finding 7) |
| draco3dgltf | 1.5.7 | 1.5.9 | Now; lockfile only (finding 9) |
| esbuild | 0.28.2 (pinned) | 0.28.2 | Nothing to do: the pin is the latest (MEASURED, `npm view esbuild version`) |
| meshoptimizer, ktx2-encoder, @gltf-transform | 1.3.0, 0.6.0, 4.5.1 | same | Nothing to do |

## 1. Findings, ranked

### 1. Take three.js r187 later, as its own measured change; make three shader patches version-proof now

**Where:** `package.json:70` (`"three": "0.186.0"`), `client/vendor/three-r186/`, `client/js/characters/surfaces.js:33-44`, `client/js/world/water.js:386`, `client/js/world/art/engine/atlas.js:651`, `client/js/world/environment.js:20,84,126`, `client/js/world/view.js:470,1005-1006`.

**How exposed the game is (MEASURED, grep in `client/js`):**

- `onBeforeCompile`: 64 occurrences in 38 files, 50 of them hook definitions. One replaces `THREE.Material.prototype.onBeforeCompile` (`world/firelight.js:96`), so every built-in material without its own hook is patched too.
- `#include <`: 286 occurrences in 43 files, 31 distinct chunk names. 158 calls of `.replace("#include <...>", ...)` in 35 files, on 22 distinct markers. The commonest are `common` (70), `begin_vertex` (15), `project_vertex` (13) and `map_fragment` (11).
- `ShaderChunk`: 13 occurrences in 6 files. Three rewrite a chunk for every material (`world/fog.js:126-140`: four fog chunks and the tone mapping; `world/shadows.js:73-87`: the shadow lookup). The others splice a line of three's own GLSL (`characters/surfaces.js:38`, `world/kithouses3d.js:602-606`, `world/art/engine/leafcards.js:37`, `world/art/kits/trees.js:1302-1303`).
- 26 `ShaderMaterial` or `RawShaderMaterial` constructions in 20 files.
- 19 string literals must match three's GLSL text exactly.

**What r187 does to it (MEASURED).** I downloaded three 0.186.1 and 0.187.0 from npm and compared the shader sources with the game's matches (`scripts/chunk-exposure.mjs <old> <new> <client/js>`, which reads the files and runs nothing from them):

- All 22 `#include` markers the game replaces still exist in r187's templates.
- Of the 19 exact-text matches, one is gone: `surfaces.js:33`, `reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );`. r187 rewrote that line for its new rough-diffuse option (it is now `irradiance * diffuseBRDF * ( 1.0 - F )`). `surfaces.js:40` throws "three.js's lighting has changed", so skin fails loudly.
- Two breaks are silent. `water.js:386` and `atlas.js:651` guard their sky reflection with `defined( ENVMAP_TYPE_CUBE_UV )`. r187 removed that define (it is `ENVMAP_TYPE_PMREM` now), so still water and shiny atlas materials would lose their reflections with no error. No test names the define (`grep ENVMAP_TYPE_CUBE_UV test/` finds nothing).
- The fog, tone mapping and shadow rewrites still match (their chunks are unchanged, or keep the matched line).
- `SkeletonUtils.js`, `meshopt_decoder.module.js`, `WorkerPool.js`, `ktx-parse`, `zstddec` and the Basis transcoder are byte-identical in r187. `GLTFLoader.js`, `KTX2Loader.js`, `BufferGeometryUtils.js` and `OrbitControls.js` changed.

**What r187 changes that matters to a WebGL2 game** (release notes [1], migration guide [2], and the source diff):

- The environment map (PMREM) is a cube map with one mip per roughness, read with one `textureLod`, in place of r186's atlas and its `textureCubeUV` code (PR [4]). The game lights every lit pixel from `scene.environment`. The PR measured a 1080p sphere grid on an Apple M1 at 3.14 ms before and 2.36 ms after in WebGL (SOURCED [4]). That is a synthetic scene; the game's gain on an iPhone is not measured.
- The same change makes materials "look slightly different" (migration guide [2]). The PR's review notes rougher surfaces darker underneath and slightly more aliasing in reflections (SOURCED [4]).
- `PMREMGenerator` now floors the map size at 256 (`MIN_SIZE = 256`, r187 `src/extras/PMREMGenerator.js:22,246`). The game asks for 128 (`environment.js:20`). READ: in r186 each map is a 384 x 512 half-float atlas, 1.5 MiB; the game holds three (outdoors, indoors, the sky's latest) and the sky's generator keeps a second target, about 6 MiB in all. In r187 each is a 256 cube with six mips, 6 x 87,360 px x 8 B = 4.0 MiB, and the sky's generator keeps a source cube with depth (about 5.5 MiB): about 17.5 MiB in all. That is about 11.5 MiB more GPU memory on the phone.
- The sky's light is baked again as the day turns, at most every 2 s (`view.js:470`). SUSPECTED: a re-bake does about four times the filtering work in r187 (about 44 million sample iterations at 256 against about 11 million at 128, from the loops in the two `PMREMGenerator.js` files), which could show as a hitch on an iPhone. Confirm by timing `SkyLight.bake` with a `gl.finish()` after it on the phone, under both versions.
- Punctual lights now clamp roughness to at least 0.045 (`lights_physical_pars_fragment`). The gems are 0.04 (`world/gold3d.js:436`), so their highlights change very slightly.
- `GLTFLoader` hands an embedded KTX2 image straight to `KTX2Loader.parse()`, without making a Blob, an object URL and a fetch of it (PR [3]). The game's 149 plain `.glb` files embed 301 KTX2 images, 5.5 MB (MEASURED, `scripts/count-ktx2.mjs`; the 112 `.bin` files under `client/models` are not counted). The PR measured the Blob round trip at 18.6 ms of main-thread time per MB plus 0.64 ms per image in Chromium (SOURCED [3]). Estimate for those files: about 0.1 to 0.3 s of main-thread time, spread over the models as they stream in. Safari was not measured by the PR.
- Switching one material between the screen and a render target (the likenesses, `view.js:1996-2009`) now reuses a per-material program variant in place of recomputing the program key each time (`getProgramVariant`, PR #34739 in [1]).
- Nothing in r187 changes `AnimationMixer`, `PropertyBinding`, `SkeletonUtils` or the meshopt decoder (MEASURED, file compare).
- r180 to r186 are already in the game. Of their migration notes, the ones a WebGL game meets are r181's brighter rough PBR and improved PMREM, r182's `PCFSoftShadowMap` deprecation (the game uses `PCFShadowMap`, `view.js:556`), r183's `Clock` deprecation (only `lab/model-viewer.js:2203` uses it) and r185's `updateWorldMatrix()` honouring `matrixWorldNeedsUpdate` [2].

**What it costs whom now:** nothing. r186 works. The cost of waiting is the possible per-pixel gain above.

**The change proposed:**

1. Now, on r186, with no visible change: make the three spots accept both versions. In `water.js:386` and `atlas.js:651` test `defined( ENVMAP_TYPE_CUBE_UV ) || defined( ENVMAP_TYPE_PMREM )`. In `surfaces.js` match the r187 line as well as the r186 one. Add a unit test that fails if neither define is in three's `lights_fragment_maps` chunk, so the silent break becomes a loud one.
2. Later, in a pull request of its own: `npm install three@0.187.x`, `npm run vendor:three`, the import map and `SHELL` as `scripts/vendor-three.js` says. Then measure on the iPhone: frame time in a town and in the taproom, the tracked GPU memory, and one sky re-bake. Look at skin, water, armour and gems side by side with r186.

**Why not now:** r187 is 12 days old. Four of the last seven releases were followed by a patch release 2 to 16 days later (0.181.1, 0.183.1, 0.185.1, 0.186.1; MEASURED, `npm view three time`). It also changes how lit surfaces look, which the owner asked to keep imperceptible, so it needs a look on the device, not only green tests.

**Gain expected:** step 1, none in speed; it removes a silent failure from the upgrade. Step 2, estimated: cheaper environment lighting on every lit pixel and a little less loading work, against about 11.5 MiB more GPU memory. Whether the net is positive on an iPhone is the thing to measure.

**Effort:** step 1 S. Step 2 M.

**Risk:** step 1 changes no shader that r186 compiles. Step 2 changes the look of every lit surface slightly and could add a hitch every 2 s while the sky changes. Neither touches the simulation.

**Confidence:** MEASURED for the breaks and the exposure counts; READ for the memory; SUSPECTED for the re-bake cost; SOURCED for the gain.

**How to verify:** `npm run check` after step 1. After step 2, the water and a shiny roof still mirror the sky, the skin test passes, and the phone's numbers are no worse.

### 2. Run CI and the servers on Node 26 LTS

**Where:** `.github/workflows/ci.yml:41,78,129`, `pages.yml:28`, `soak.yml:41` (Node 22); `mac.yml:66` (Node 24); `scripts/build-mac-app.js:30` (the Mac app's Node, 24.21.0); `contribution.md:40`.

**What happens now:** CI runs Node 22, which is in maintenance and ends on 2027-04-30. Node 24 moved to maintenance on 2026-10-20 (ends 2028-04-30). Node 26 "Lithium" became Active LTS on 2026-10-28 and runs to 2029-04-30. Latest of each: 22.23.4 (V8 12.4), 24.22.2 (V8 13.6), 26.13.0 (V8 14.6) (SOURCED [9][10][11]). From Node 27 the schedule changes to one line a year [9].

**MEASURED:** CPU time (user plus system) of three pieces of the game's own code, three runs each, interleaved, on this shared machine (`scripts/node-compare.mjs`; official binaries from nodejs.org, checksums verified). Wall-clock times were too noisy to use.

| Work | Node 22.23.4 | Node 24.22.2 | Node 26.13.0 |
|---|---|---|---|
| Make world seed 1 and nine tiles' input (ms) | 6701, 6842, 6990 | 6051, 6096, 5973 | 6101, 5655, 5746 |
| Step a four-player world 400 steps, as `step-budget` does (ms) | 8700, 8229, 8777 | 7867, 7738, 7967 | 7430, 7606, 6864 |
| Bake 18 navigation tiles in Recast's WebAssembly (ms) | 499, 433, 421 | 324, 357, 388 | 351, 314, 359 |

Means against Node 22: Node 24 is 12%, 8% and 21% lower; Node 26 is 15%, 15% and 24% lower. The ranges of Node 22 and Node 26 do not overlap in any row.

**What it costs whom:** the unit tests' job is about 19.5 minutes of mostly this kind of code (`ci.yml:29`). A world server's step and the Mac app's server pay the same tax.

**The change proposed:** set `node-version: 26` in the four workflows, move `NODE` in `build-mac-app.js` to 26.x with its SHA-256, keep `engines` at `>=22`, and update `contribution.md` in the same pull request (the repository's standing rule).

**Gain expected (estimate from the measurement):** about 10 to 15% off the unit tests' CPU time, so roughly 2 to 3 of their 19.5 minutes, and the same share off a server's step. The Mac app gains about 3 to 7% over its Node 24. The run only ends sooner if `E2E_AHEAD` (`ci.yml:26`) is then moved to give the unit tests' job a larger share of the browser tests.

**Effort:** S.

**Risk:** low. Six unit test files passed 57 of 57 on both Node 22 and Node 26 here (`router`, `nearby`, `funnel`, `heroes-file`, `contribution`, `manifest`); I did not run the whole suite on Node 26. Piped output differs (Node 26 prints the spec reporter, Node 22 printed TAP), and nothing in `scripts/` or `.github/` parses it. The game uses none of the APIs Node 24 and 26 removed (grep for `writeHeader`, `_stream_*`, `url.parse`, `dirent.path`: no hits) [12][13]. The simulation is not changed, but it runs on a newer V8, so let the soak confirm the copies still agree across engines.

**Confidence:** MEASURED (CPU time on the sim); the CI minutes are an estimate.

**How to verify:** compare the "npm test" step's duration over three runs before and after, and `npm run step-budget` on the server's machine.

### 3. Take recast-navigation 0.44.0 and free what each tile bake leaves behind

**Where:** `client/js/core/navigation/bake.js:57,147,160,179`; `client/vendor/recast-navigation-0.43.1/`; `client/js/core/navigation/recast.js:12-18`.

**What happens now (MEASURED):** every `bakeTile` leaves three objects that are never destroyed: the build context's JavaScript half (`bake.js:57` makes a `RecastBuildContext`; `bake.js:179` destroys only its `raw`), the `NavMeshCreateParams` (`bake.js:147`), and the result object inside `createNavMeshData` (`bake.js:160`). Emscripten's binder keeps a wrapper for each for good. `scripts/bake-cache.mjs` counted them: after 20 more bakes the caches of `RecastBuildContextJsImpl`, `dtNavMeshCreateParams` and `CreateNavMeshDataResult` each grew by exactly 20. `scripts/bake-leak.mjs` (400 bakes of the start town's tile, `--expose-gc`) showed the JavaScript heap growing 2,584 bytes a bake, steadily, after collection. The WebAssembly heap stayed at 16 MB.

**What it costs whom:** 2.6 KB a bake, never given back, wherever tiles are baked: the navigation worker and the page on a phone, and the world server's threads. A thousand bakes is 2.6 MB. A phone session is a few megabytes. A world server that runs for weeks is the one that pays: 100,000 bakes is about 260 MB. I did not count bakes per hour of play.

**The change proposed:**

1. Vendor 0.44.0 (`npm run vendor:recast`). Its core destroys the result inside `createNavMeshData` and adds `RecastBuildContext.destroy()` and `NavMeshCreateParams.destroy()` (MEASURED, diff of `core/dist/index.mjs`; the release notes name the generators' leaks [15]).
2. In `bake.js`, make one `RecastBuildContext(false)` per module and reuse it, or call `context.destroy()`; call `params.destroy()` in the `finally`. Passing `false` also turns off the timers and logs the context keeps by default, which the bake never reads.

**Gain expected:** the 2.6 KB a bake goes to about zero (estimate; the stale wrappers of freed heightfields remain, bounded by address reuse).

**Effort:** S.

**Risk:** the WebAssembly binary changes (340,097 bytes against 338,824). Tiles must stay byte-identical on every machine, so run `test/navigation.test.js` and compare a tile's bytes before and after; I did not run 0.44.0. If they differ, hosts and joiners on different releases would disagree, and the netplay version would need bumping. Nothing a player sees.

**Confidence:** MEASURED.

**How to verify:** `node --expose-gc scripts/bake-leak.mjs /home/user/conquest 400` again: flat.

### 4. Do not move to WebGPURenderer now

**Where:** `client/js/world/view.js:548` (the renderer), and every file in finding 1.

**The facts:**

- Safari has shipped WebGPU on iPhone since Safari 26.0 (iOS 26, September 2025) [20][34]. iOS 27 and Safari 27.2 are current [17][19].
- three's manual calls `WebGPURenderer` "still in an experimental state", says performance may be better with `WebGLRenderer` depending on the scene, and says `WebGLRenderer` "is still maintained and the recommended choice for pure WebGL 2 applications" (SOURCED [6]). It falls back to a WebGL 2 backend where WebGPU is missing [6][7].
- "Custom materials based on `ShaderMaterial`, `RawShaderMaterial` and modifications of built-in materials via `onBeforeCompile()` are not supported in `WebGPURenderer`" and must be ported to node materials and TSL (SOURCED [6]).
- The measured evidence goes the other way. Issue #30560, open since February 2025 and still open in September 2026: a uniform buffer per object makes many-object scenes slower; 20,000 cubes ran at about 60 FPS in WebGL and 15 in WebGPU on an M1 Pro; a September 2026 comment on r186 measured 2.88 ms against 2.20 ms of CPU for the WebGL 2 fallback against `WebGLRenderer` (SOURCED [5]). A May 2026 forum measurement on r183 with 4,000 meshes: 4.5 ms a frame in `WebGLRenderer`, 9.7 ms in WebGPU, 10.3 ms in the fallback, and a first frame 5 to 10 times slower (SOURCED [8]).
- I found no measurement of a few hundred draw calls with skinned characters on iPhone Safari, in either direction (UNCONFIRMED).
- Safari's WebGPU still has memory bugs in its GPU process: a leak fixed in December 2025 has a follow-up from October 2026 measured on iOS 27.2 (SOURCED [30]); an iOS 26 crash with instancing was fixed in December 2025 (SOURCED [31]). Memory is the game's tightest limit on the phone.

**What moving would cost (MEASURED count):** the 50 `onBeforeCompile` hooks, 26 shader materials and 3 global chunk rewrites are about 1,470 lines of GLSL in 52 files, all to be rewritten in TSL and compared by eye against today's look.

**The change proposed:** none now. Look again when issue #30560 closes or three publishes an iPhone measurement, and then try one scene before porting anything.

**Gain expected:** none shown. **Effort avoided:** L. **Risk of skipping:** `WebGLRenderer` gets no large new features [6]; it is maintained.

**Confidence:** SOURCED, with the gap named above.

### 5. Read the phone's jetsam report once, to learn which process dies and at what real size

**Where:** `client/js/app/memoryguard.js:27-29` (the guard's marks, 400 and 460 MB of what the game tracks); the crash reports at 541 to 575 MB tracked (`memoryguard.js:11-13`).

**What happens now:** the guard works from the game's own count, because Safari gives a page nothing else. The platform facts:

- A page cannot observe its memory in Safari. `performance.memory`, `performance.measureUserAgentSpecificMemory()` and `navigator.deviceMemory` are all unsupported through Safari 27.2 (SOURCED [38][39][40]). I found no memory-pressure event for pages. A WebKit bug asking for a signal before the kill and a way to ask the WebGL budget is open with no fix (SOURCED [23]); crash reports through the Reporting API are not implemented (SOURCED [29]).
- A WebKit engineer's statement of the limit: WebContent processes on iPhone "are subject to a 'soft' limit of around 1.5GB", lower on models with less RAM, and a process over it is killed only when the system wants the memory; "design your web content to not exceed the 1.5GB limit" (SOURCED [21], August 2024). The same thread has a reporter seeing about 3 GB on iPhone 15 Pro after a reset. On an iPhone 15 Pro Max a kill was explained as "a highwater jetsam which can occur when the WebContent process crosses a soft limit and the system needs memory" (SOURCED [22]). A jetsam was confirmed again on an iPhone 17 Pro in April 2026, with no figure [25].
- WebKit's memory pressure handler has iOS thresholds at 50% and 65% of min(3 GB, RAM), on a 30 s poll, at which it drops caches and compiled code (SOURCED [26]). Whether that poll runs on iOS I did not confirm.
- The GPU process is separate and can be killed on its own (SOURCED [27][30]). Whether its memory for a tab's WebGL textures counts toward the tab's limit I could not confirm (UNCONFIRMED).

The game dies at about 550 MB tracked, far under 1.5 GB. So either a lot is untracked (the JavaScript heap and compiled code of 478 modules and three.js, WebKit's own, canvases), or the phone was short of memory, or the GPU process's share counts. Each points to a different thing to cut.

**The change proposed:** after the next crash, open Settings, Privacy & Security, Analytics & Improvements, Analytics Data on the phone, and find the newest `JetsamEvent` file (that path is from memory; Apple's page [33] points elsewhere for it). Read `pageSize`, then the entry with a `reason`: its `name` (`com.apple.WebKit.WebContent` or `com.apple.WebKit.GPU`), `rpages` and `lifetimeMax`. Memory is `rpages x pageSize`; Apple's example is 92,802 x 16,384 = 1.52 GB. Reasons include `per-process-limit` ("crossed the resident memory limit") and `vm-pageshortage` (the system needed memory) (SOURCED [33]). Record the ratio of that figure to the game's tracked total in `memoryguard.js`, and set the marks from it.

**Gain expected:** no speed. It says whether to cut GPU memory or page memory, and how far the guard's marks are from the real limit.

**Effort:** S (an hour with the phone). **Risk:** none. **Confidence:** SOURCED for the facts; SUSPECTED for the diagnosis.

**How to verify:** two reports from different places in the game give a similar ratio.

### 6. Every iPhone is given Low, by an accident of what Safari reports

**Where:** `client/js/world/view.js:77-88` (`detectQuality`).

**What happens now (READ):** on a touch device the level is Low if `navigator.deviceMemory <= 4` or `navigator.hardwareConcurrency <= 4`, else Medium. Safari has no `deviceMemory` (SOURCED [40]), so it reads as 8. WebKit reports `hardwareConcurrency` as 4 for any device with fewer than 8 cores, and 8 otherwise (SOURCED [28], `NavigatorBase.cpp`). iPhone 15 to 17 chips have 6 cores (from Apple's specifications as I remember them, not re-checked online), so every iPhone reports 4 and gets Low: `pixelRatio: 1`, no antialiasing, 1024 shadows (`view.js:72`). An iPad with an 8-core chip gets Medium. The comment says "low for small or older phones, medium for phones".

**What it costs whom:** today it protects the phone's memory, which is the right outcome. But it is not a decision anyone made: an iPhone 17 Pro and an iPhone 11 cannot be told apart, and the level would jump to Medium (2.25 times the pixels, 2048 shadows) on the day Apple ships an 8-core phone or WebKit changes the clamp.

**The change proposed:** make the rule say what it means. Detect iOS explicitly and return the level chosen for it, with a comment giving the reason (memory), so the choice survives a change in what Safari reports. Whether recent iPhones should try Medium is the owner's call (see Questions).

**Gain expected:** none now; removes a latent jump in memory use on the weakest device.

**Effort:** S. **Risk:** none if the level stays Low. **Confidence:** READ, with WebKit's source.

**How to verify:** a unit test of `detectQuality` with Safari's values (no `deviceMemory`, 4 cores, coarse pointer).

### 7. ESLint 10, @eslint/js 10 and globals 17: later, together

**Where:** `package.json:49,62,63`; `eslint.config.js`.

**What changed:** ESLint 10 needs Node 20.19, 22.13 or 24 and later, drops `.eslintrc` (the repository already uses flat config), and adds three rules to `recommended`: `no-unassigned-vars`, `no-useless-assignment` and `preserve-caught-error` (SOURCED [16]). globals 17's one breaking change splits `audioWorklet` out of `browser` (SOURCED [14]); no file of the game runs in a worklet (grep for `registerProcessor`: no hits).

**MEASURED:** the installed ESLint 9.39.5 already has the three rules. Run with them on (`npx eslint . --rule 'no-unassigned-vars: error' --rule 'no-useless-assignment: error' --rule 'preserve-caught-error: error'`) it reports 25 new errors in 964 files: 19 `no-useless-assignment` (for example `client/js/app/rejoin.js:83`) and 6 `preserve-caught-error` (for example `server/manage.js:1097`, `server/update/releases.js:43`). That lint run took 69 s here, once, on a loaded machine.

**The change proposed:** bump the three packages in one pull request and fix or silence the 25.

**Gain expected:** no speed. The 19 dead assignments are worth a look as code. **Effort:** S. **Risk:** CI's lint fails until the 25 are dealt with. **Confidence:** MEASURED. **How to verify:** `npm run lint`.

### 8. Playwright 1.65: later, as routine

**Where:** `package.json:54` (`^1.56.1`; the lockfile holds 1.63.0); `playwright.config.js:17-31` (Chromium only, one worker in CI).

**What changed:** 1.64 (October 2026) and 1.65 (November 2026) bring Chromium 156 then 158 and WebKit 27.2. Behaviour changes to watch: actions wait for elements to be not inert; elements in hidden iframes count as hidden; text the browser doesn't render is left out of accessible names (affects `getByRole`); a sharded run with no tests fails. 1.65 stops testing on Node 20 and its Docker image ships Node 26 (SOURCED [14a]). The notes claim no speed gain.

**The change proposed:** take it with the Node 26 move or the next routine bump, and run the whole browser suite once. **Gain expected:** none in time. **Effort:** S. **Risk:** a few tests may need adjusting for the inert and accessible-name changes. **Confidence:** SOURCED.

### 9. draco3dgltf 1.5.9: now

**Where:** `package.json:60`; used only by `scripts/build-props.js:31,481`, which decodes downloaded third-party models at build time.

**What changed:** 1.5.8 lists security fixes and bug fixes; 1.5.9 fixes missing `HEAP*` exports and `wasmBinary` support in the JavaScript and WebAssembly builds (SOURCED [15a]).

**The change proposed:** `npm update draco3dgltf`; the range `^1.5.7` already allows it, so only `package-lock.json` changes. **Gain expected:** none in speed; security fixes in a decoder fed downloaded files. **Effort:** S. **Risk:** low; run `npm run build:props -- skull` once. **Confidence:** SOURCED.

## 2. Checked and already good

- **The shader patches guard themselves.** `fog.js:130`, `shadows.js:76-82` and `surfaces.js:40` check three's text before changing it and fail safe or loud. About 20 unit test files exercise the patched materials (`test/far.test.js:290`, `test/light.test.js`, `test/buildings.test.js` and others). Only the two `ENVMAP_TYPE_CUBE_UV` blocks have no guard (finding 1).
- **Texture compression on iPhone is right as it is.** Safari's WebGL2 exposes ASTC on 99.98% of iOS reports and ETC2 on 99.98% (SOURCED [41][42]). three's `KTX2Loader` (r186, `FORMAT_OPTIONS`) sends ETC1S to ETC2 (4 bits a pixel without alpha, 8 with) and UASTC to ASTC 4x4 (8 bits a pixel) on such a device (READ). The pipeline encodes colour and data maps as ETC1S and normal maps as UASTC (`utilities/blenderpipeline/lib/config.js:104`), so nothing is transcoded to uncompressed RGBA on a phone.
- **Maximum texture size:** every iOS report is at least 8192 and 99% are at least 16384 (SOURCED [43]). A canvas is capped at 8192 x 8192 in area on iOS (SOURCED [27a], `CanvasBase.cpp`).
- **Decoded sound.** An `AudioBuffer` is 32-bit float, one buffer per channel (SOURCED [36]), and `decodeAudioData` resamples to the context's rate (SOURCED [37]). The game already decodes each recording in an `OfflineAudioContext` of the recording's own rate (`audio/sound.js:2174-2190`), so it does not pay for the device's higher rate. Memory is frames x channels x 4 bytes.
- **Shader compiling in the background.** `KHR_parallel_shader_compile` is on 98.5% of iOS reports (SOURCED [44]); the game uses `compileAsync` (`view.js:776`, `game.js:2570`).
- **`powerPreference: "high-performance"`** (`view.js:548`) once cut an iPhone 12 from 120 to 20 fps with antialiasing and skinned meshes; WebKit fixed it in August 2024 (SOURCED [32]). iPhone 15 and newer on current iOS are past it. No action.
- **ImageBitmap memory.** iOS 18.4 to 26.1 failed to count ImageBitmaps' memory and pages reloaded; fixed in iOS 26.2, and the advice is to `close()` them (SOURCED [24]). The game closes its skin bitmaps (`characters/skin.js:97`) and drops CPU copies after upload (`world/release.js:40`).
- **The old total-canvas-memory cap (224 to 384 MB)** is not in WebKit's current `CanvasBase.cpp` (SOURCED [27a]). The 2023 commit that removed it I could not open (UNCONFIRMED).
- **Web platform features already used:** `CompressionStream` and `DecompressionStream` (Safari 16.4 [45]; `app/servers.js:66`, `characters/body.js:67`), `OffscreenCanvas` 2D (`characters/skin.js:88`), `navigator.storage.persist` (`app/device.js:86`).
- **Node APIs:** none removed in Node 24 or 26 is used.

## 3. Bugs

- `client/js/world/view.js:77-88`: the comment and the behaviour of `detectQuality` disagree on Safari (finding 6). Sure of the mechanism; whether it is unwanted is the owner's call.
- `client/js/core/navigation/bake.js:147,179`: three objects are left undestroyed per bake (finding 3). Sure (measured).

## 4. Code structure

- `@recast-navigation/generators` is in `package.json:56` but nothing imports it (grep outside `node_modules`: only the plan in `generated/` names it). It can be removed.
- The vendoring scripts make an upgrade a three-step manual job (vendor, import map and `SHELL`, delete the old folder), and `core/navigation/recast.js:12-18` spells the versioned path three times. A test that the vendored folder's version equals `package.json`'s would catch a half-done bump. Minor.
- The browser tests run Chromium only (`playwright.config.js:21`); the weakest device's engine is only in the soak. Playwright's WebKit would not reproduce an iPhone's memory limit anyway, so this is an observation, not a recommendation.

## 5. Gameplay and design

- Recent iPhones play at `pixelRatio: 1` on a 3x screen because of finding 6. That is a visible softness the owner may or may not have chosen.

## 6. Questions for the owner

1. Should recent iPhones stay on Low by default (finding 6), or try Medium once memory allows?
2. r187 changes how lit surfaces look, slightly (finding 1). Is a small change in reflections and in the shading of rough surfaces acceptable if frame time improves, or must the look match r186 exactly?
3. Can you send one `JetsamEvent` file from the iPhone after a crash (finding 5)?

## Reference: web platform features in Safari, late 2026

Shipped, with why it could matter:

| Feature | Safari | Why it matters here |
|---|---|---|
| Service Worker static routing API | 27.0 [17] | Lets hashed files be answered from Cache Storage without waking `client/sw.js`, whose fetch handler takes every same-origin GET (`sw.js:145-161`). For the loading review to weigh. |
| ES module loader rewritten | 27.0 [17] | Fixes execution-order and top-level-await bugs; the game loads 478 modules unbundled. No speed claim. |
| WebAssembly JSPI | 27.0 [17] | Synchronous-style WebAssembly can wait on a promise. No use seen for it here. |
| `srgb-linear` and `display-p3-linear` in canvas and WebGL | 27.0 [17] | None needed. |
| WebTransport | 26.4 [47] | Unreliable datagrams to a server without WebRTC; the game uses WebSocket and WebRTC data channels (`app/peer.js`, `app/together.js`). Needs an HTTP/3 server. Not worth it now. |
| zstd content-encoding | iOS 26.3 [46] | Marginal against Brotli. No action. |
| Event Timing and Largest Contentful Paint | 26.2 [35] | Field numbers for input delay and load on Safari, which it lacked. |
| WebCodecs `AudioDecoder` | 26.0 [20][48] | Decode a long recording in pieces off the main thread, in place of holding it whole as an `AudioBuffer`. An option for the sound review. |
| WebGPU | 26.0 [20][34] | Finding 4. |
| WebAssembly in-place interpreter | 26.0 [20] | Large modules start faster with less memory (Recast, the Basis transcoder). Free. |
| `<link rel="modulepreload">` | 17.0 [18] | `client/index.html` has none; the loader fetches by hash itself. For the loading review to weigh. |
| OffscreenCanvas with WebGL in a worker | 17.0 [18][49] | Would move drawing off the main thread. A rewrite of the view; not recommended. |
| Import maps | 16.4 [50] | In use. |

Not shipped in Safari through 27.2:

- `scheduler.postTask` and `scheduler.yield` (SOURCED [51][52]); `requestIdleCallback` is still disabled by default (SOURCED [53]). Keep yielding with `MessageChannel` or `setTimeout`.
- `performance.memory`, `measureUserAgentSpecificMemory`, `navigator.deviceMemory` (finding 5).
- Crash reports through the Reporting API (SOURCED [29]).
- Multiple import maps and import map `integrity`: I did not confirm their status (UNCONFIRMED).

## Sources

All opened on 2026-11-11. npm facts came from `npm view` and `npm pack`.

1. three.js r187 release notes: https://github.com/mrdoob/three.js/releases/tag/r187
2. three.js migration guide: https://github.com/mrdoob/three.js/wiki/Migration-Guide
3. three.js PR 35193, GLTFLoader parses embedded KTX2 without a Blob: https://github.com/mrdoob/three.js/pull/35193
4. three.js PR 34585, PMREM as cube render targets: https://github.com/mrdoob/three.js/pull/34585
5. three.js issue 30560, WebGPURenderer uniform buffers: https://github.com/mrdoob/three.js/issues/30560
6. three.js manual, WebGPURenderer: https://threejs.org/manual/pages/webgpurenderer.html
7. three.js docs, WebGPURenderer: https://threejs.org/docs/pages/WebGPURenderer.html
8. three.js forum, r183 measurement: https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904
9. Node.js release schedule: https://github.com/nodejs/Release/blob/main/README.md
10. Node.js releases: https://nodejs.org/en/about/previous-releases
11. Node.js versions index: https://nodejs.org/dist/index.json
12. Node.js 26.0.0: https://nodejs.org/en/blog/release/v26.0.0
13. Node.js 24.0.0: https://nodejs.org/en/blog/release/v24.0.0
14. globals 17.0.0: https://github.com/sindresorhus/globals/releases/tag/v17.0.0 and https://github.com/sindresorhus/globals/releases
14a. Playwright releases: https://github.com/microsoft/playwright/releases
15. recast-navigation-js releases: https://github.com/isaac-mason/recast-navigation-js/releases
15a. Draco releases: https://github.com/google/draco/releases
16. ESLint 10 migration: https://eslint.org/docs/latest/use/migrate-to-10.0.0
17. WebKit features for Safari 27.0: https://webkit.org/blog/18325/webkit-features-for-safari-27-0/
18. WebKit features in Safari 17.0: https://webkit.org/blog/14445/webkit-features-in-safari-17-0/
19. WebKit features for Safari 27.2: https://webkit.org/blog/18515/webkit-features-for-safari-27-2/ (27.1: https://webkit.org/blog/18486/webkit-features-for-safari-27-1/)
20. WebKit features in Safari 26.0: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
21. WebKit bug 277848, the 1.5 GB soft limit: https://bugs.webkit.org/show_bug.cgi?id=277848
22. WebKit bug 279637, highwater jetsam on iPhone 15 Pro Max: https://bugs.webkit.org/show_bug.cgi?id=279637
23. WebKit bug 300782, reload loop, no signal before the kill: https://bugs.webkit.org/show_bug.cgi?id=300782
24. WebKit bug 295618, ImageBitmap memory cost: https://bugs.webkit.org/show_bug.cgi?id=295618
25. WebKit bug 312727, jetsam confirmed on iPhone 17 Pro: https://bugs.webkit.org/show_bug.cgi?id=312727
26. WebKit `MemoryPressureHandler.cpp`: https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WTF/wtf/MemoryPressureHandler.cpp
27. WebKit bug 232357, GPU process jetsam with large textures: https://bugs.webkit.org/show_bug.cgi?id=232357 (also bug 253172: https://bugs.webkit.org/show_bug.cgi?id=253172, and bug 229606: https://bugs.webkit.org/show_bug.cgi?id=229606)
27a. WebKit `CanvasBase.cpp`: https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/html/CanvasBase.cpp
28. WebKit `NavigatorBase.cpp`: https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/page/NavigatorBase.cpp
29. WebKit bug 269925, crash reports through the Reporting API: https://bugs.webkit.org/show_bug.cgi?id=269925
30. WebKit bug 303203, WebGPU GPU-process leak: https://bugs.webkit.org/show_bug.cgi?id=303203
31. WebKit bug 302711, WebGPU crash on iOS 26: https://bugs.webkit.org/show_bug.cgi?id=302711
32. WebKit bug 276959, powerPreference: https://bugs.webkit.org/show_bug.cgi?id=276959
33. Apple, jetsam event reports: https://developer.apple.com/tutorials/data/documentation/xcode/identifying-high-memory-use-with-jetsam-event-reports.json
34. caniuse, WebGPU: https://caniuse.com/webgpu
35. WebKit features for Safari 26.2: https://webkit.org/blog/17640/webkit-features-for-safari-26-2/
36. MDN, AudioBuffer: https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer
37. Web Audio API specification: https://webaudio.github.io/web-audio-api/
38. caniuse, performance.memory: https://caniuse.com/mdn-api_performance_memory
39. caniuse, measureUserAgentSpecificMemory: https://caniuse.com/mdn-api_performance_measureuseragentspecificmemory
40. caniuse, navigator.deviceMemory: https://caniuse.com/mdn-api_navigator_devicememory
41. Web3D Survey, ASTC: https://web3dsurvey.com/webgl2/extensions/WEBGL_compressed_texture_astc
42. Web3D Survey, ETC: https://web3dsurvey.com/webgl2/extensions/WEBGL_compressed_texture_etc
43. Web3D Survey, MAX_TEXTURE_SIZE: https://web3dsurvey.com/webgl2/parameters/MAX_TEXTURE_SIZE
44. Web3D Survey, KHR_parallel_shader_compile: https://web3dsurvey.com/webgl2/extensions/KHR_parallel_shader_compile
45. caniuse, CompressionStream: https://caniuse.com/mdn-api_compressionstream
46. caniuse, zstd: https://caniuse.com/zstd
47. caniuse, WebTransport: https://caniuse.com/webtransport
48. caniuse, AudioDecoder: https://caniuse.com/mdn-api_audiodecoder
49. caniuse, OffscreenCanvas: https://caniuse.com/offscreencanvas
50. caniuse, import maps: https://caniuse.com/import-maps
51. caniuse, scheduler.yield: https://caniuse.com/mdn-api_scheduler_yield
52. caniuse, scheduler.postTask: https://caniuse.com/mdn-api_scheduler_posttask
53. caniuse, requestIdleCallback: https://caniuse.com/requestidlecallback

Opened but not relied on: https://www.catchmetrics.io/blog/deep-dive-ram-internals-webkit (its per-device limits table has no source) and https://developer.apple.com/forums/thread/741624 (no figures, no replies).

Could not open: the 2023 WebKit commit removing the canvas memory cap (https://lists.webkit.org/pipermail/webkit-changes/2023-June/288365.html, 403) and WebKit's `AvailableMemory.cpp` (404).

Left in the scratch folder: `platform/scripts/` (five scripts), `platform/npm/` (three 0.186.1 and 0.187.0, recast 0.44.0, unpacked, read only), `platform/node-dl/` (Node 24.22.2 and 26.13.0 binaries), about 490 MB in all; delete `npm/` and `node-dl/` when done.