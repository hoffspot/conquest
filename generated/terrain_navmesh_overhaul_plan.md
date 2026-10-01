# Terrain, navigation mesh and multiplayer overhaul: the plan

A living plan. It is updated as each milestone lands and as measurements come in; the
[change log](#15-change-log) at the end records every change to it and why.

**Goal.** Replace the flat world of 1 m squares marked passable or not with:

- continuous 3D procedural terrain: flat plains, and mountains that are mostly impassable, with foot
  and cart paths leading through passes and valleys;
- navigation meshes baked in the browser;
- movement in float coordinates;
- multiplayer that shares seeds, inputs, targets and motion instead of geometry.

Rework the structures that benefit: settlements, castles, roads, bridges, water and scattered
features.

**Look.**
- **Scenery and buildings:** a lower-fidelity take on Elden Ring's Lands Between. See
  [§9](#9-environment-art-direction-a-lower-fidelity-elden-ring).
- **Characters and rendering:** Diablo 3 is the benchmark for rendering quality and asset fidelity.
- **Camera:** the close chase camera stays, like Elden Ring's, 3–12 m behind the hero with the
  horizon in view. It does not become Diablo 3's overhead view.

**Performance.**
- Mid-range phones hold 60 fps, low-end phones a steady 30, and desktop runs at high settings.
- Each milestone must perform as well as before or better, with measured reasons.
- A small growth in download size is fine.
- Take advantage of HTTP/2, but don't depend on GitHub hosting.

---

## 0. Decisions

| Question | Decision | Why |
|---|---|---|
| Navigation mesh engine | **recast-navigation-js 0.43.1 (WebAssembly)**. Recast/Detour is zlib-licensed; the wrapper is MIT. | Industry standard. Measured here: about 2.5 ms per 32 m tile and about 0.1 ms per long path, with bit-identical results in V8, JavaScriptCore and Chromium. About 220 KB gzipped. |
| Multiplayer sync | **Replay plus a state stream.** Keep host-authoritative replay of recorded operations. Move orders carry Vector3 targets and the host's computed waypoints. A compact motion stream shares positions, velocities and targets for prediction, smoothing and early desync checks. Checksums and snapshot resync stay. | Builds on the working netplay. Joiners never have to re-path, so navmesh determinism becomes a safety margin rather than a requirement. |
| Characters | **Switch the base body to CharMorph's "Vitruvian"** (CC0). | Picked by the user for realism. A new mesh means garments, masks and UVs are redone ([§10](#10-characters-the-charmorph-vitruvian-base)). |
| Rollout | **Playable milestone PRs.** Each is merged to main with the game playable at every step. | Small reviewable changes; main stays shippable. |
| Scenery and buildings | **A lower-fidelity Elden Ring** (added mid-planning at the user's request). | Generators are chosen for that look ([§9](#9-environment-art-direction-a-lower-fidelity-elden-ring)). |

---

## 1. Where we start (the audit)

**Rules (`client/js/core/`)**
- **Squares.** `grid.js` reads any map through `squaresOf(map)`, which gives
  `{ width, height, blocked(x, y), opaque(x, y), ground(x, y) }` on 1 m squares.
  - `squareKey` and `nearestFree` handle occupancy.
  - The tavern floors and interiors are small arrays of rows. The overworld reads its chunks.
- **Pathfinding.** `pathfinding.js` is a deterministic A* with a binary heap and fixed tie-breaks.
  - It searches a window of chunks around the start and the goal.
  - `lineAhead` walks the squares along a heading.
- **Battle.** `battle.js` (2,839 lines) steps at 20 Hz (`STEP_MS 50`).
  - Actors already hold float `x, y`, but occupy one square (`actor.square`, `actor.to`). The file
    touches them in 55 places.
  - Actors step square to square with `ACCELERATION`, `BRAKING`, `BODY 0.3` and `STRIDE 0.2`.
  - Sight is per square (`SIGHT 12`), through squares that aren't opaque.
  - Paths are re-found every `REPATH_MS 500`.
- **Overworld.** `overworld.js` builds 64 m chunks (`CHUNK 64`) of 64×64 squares.
  - Each chunk keeps its data in `Uint8Array`s: blocked, opaque, ground, water and bridge.
  - It adds trees, roads, bridges, settlements, castles, places and wild features.
  - Chunks are kept in an LRU of 256.
- **World plan.** `worldplan/` covers an 8,192 m world on 32 m cells (256²).
  - Height runs 0–1, with `SEA_LEVEL 0.12`, `MOUNTAIN 0.72` and `PEAK 0.86`.
  - A priority-flood drain gives rivers and lakes; A* over cells gives roads.
  - It also places peoples, settlements, sites and camps.
- **Exact maths.** `exact.js` gives `sin`, `cos`, `atan2`, `pow`, `hypot`, `log` and `exp` from
  `+ - * /` and `sqrt`. A test bans `Math.sin/cos/pow…` and `**` (except `2 ** N`) in core.

**Multiplayer**
- `netplay.js` (NET_VERSION 6) defines the message kinds `hello`, `command`, `again`,
  `welcome`, `ops`, `state`, `paused` and `refused`.
- `host.js` records operations, takes snapshots and computes checksums every 100 steps.
- Joiners replay; a checksum mismatch leads to a snapshot resync.
- The relay (`server/relay.js`) is a small WebSocket room server that passes text frames on.

**Drawing (`client/js/world/`)**
- **Chunks.** `chunks3d.js` draws `REACH.drawn = 2` chunks each way (5×5, about 160 m) within a
  per-frame budget.
- **Ground.** `ground.js` is a flat plane per chunk with a splat shader at 4 texels a metre.
- **Water.** `water.js` is a flat sheet at 0.03 m with an R8 shore field.
- **View.** `view.js` sets `THREE.Fog(55, 130)`, a far plane of 150 m, quality tiers
  (low/medium/high), one sun with PCF shadows and ACES tone mapping.
- **Trees.** BatchedMesh trees; settlements are merged per block.
- **Characters.** Built on MakeHuman's hm08 body (`characters/`). Each is 80–100k triangles in
  22–38 draw calls.

**Docs.** `docs/WORLD.md` still says height is paused and a navigation mesh isn't planned. Each
milestone updates it.

---

## 2. Dependencies

| Dependency | Version / licence | Where | Size | Use |
|---|---|---|---|---|
| `@recast-navigation/core`, `/generators`, `/wasm` | 0.43.1, MIT; Recast/Detour zlib | `client/vendor/recast-navigation-0.43.1/`, vendored like three.js, in the import map | ≈220 KB gzipped (a 131 KB wasm, a 60 KB glue file, 28 KB of wrappers) | Tile generation (`generateTileNavMeshData`); tiled `NavMesh` with `addTile`/`removeTile`; `NavMeshQuery` for `computePath`, `findClosestPoint`, `raycast` and `moveAlongSurface`. |
| Own noise: 2D simplex with analytic derivatives, ridged multifractal, domain warp, slope-damped fBm | Own code (Gustavson's simplex is public domain) | `client/js/core/terrain/noise2.js` | ≈3 KB | Height detail. Uses only `+ - * / floor sqrt`, so it passes the exact-maths test. FastNoiseLite's TypeScript port (MIT; uses only `abs floor imul max min round sqrt trunc`) is the fallback if our own falls short. |
| Runevision erosion filter (optional) | MPL-2.0 | Its own file, with the MPL header | ≈4 KB | Gullies on mountains, only if the cheaper ridged/terrace look isn't enough. It needs `exp/sin/cos`, so it would have to go through `exact.js` and might be slow; measure first. |
| meshoptimizer | Already vendored | — | — | Simplifying far LODs (trees, ruins, landmark proxies) and character LODs. |
| Blender (build time only, not shipped) | GPL; its output is our data | Developer machine or CI job | — | A one-off conversion of the Vitruvian `char.blend` (UVs, vertex groups) to our CC0 binary data. |

**Not used.**
- DetourCrowd for the rules: its state can't be snapshotted.
- TileCache: `removeTile` isn't bound, and obstacles are limited to 64 requests.
- `@recast-navigation/three`: debug helpers only; our own debug drawing is smaller.
- navcat (JavaScript) stays the fallback if the WebAssembly route fails on some device.

**Serving.**
- `server/static.js` gains `".wasm": "application/wasm"`.
- The service worker precaches the `.wasm`.
- Worker copies of the vendored modules have their bare specifiers rewritten to relative paths.
  Workers don't see the page's import map; this was measured in Chromium 141.
- Nothing depends on GitHub Pages: plain static files with correct MIME types.

---

## 3. Terrain: from seed to Vector3

### 3.1 Coordinates

- The rules keep ground coordinates `(x, y)` in metres, with the world from 0 to 8,192 on each
  axis.
- three.js draws `(x, height, y)`: `Vector3(x, heightAt(x, y), y)`.
- Indoors (interior maps) and on bridges, the floor height comes from the map or bridge deck, not
  from the terrain.
- One function gives a unit's Vector3: `groundAt(map, x, y) → z`.

### 3.2 The height function

`heightAt(plan, x, y)` is a pure function in metres. It is built only from `+ - * / floor sqrt`
and `exact.js`, so every browser gives the same result.

It is made of layers:

1. **Macro.** The plan's 256² height grid (after the flood), read with a uniform cubic B-spline (C2,
   no overshoot). A height curve then maps it to metres:

   | Plan height | Metres | Character |
   |---|---|---|
   | sea (< 0.12) | ≤ 0 | coast shelf |
   | plains (0.12–0.45) | 0–25 | gradient 1–3 % |
   | hills (0.45–0.72) | 25–90 | rolling |
   | mountains (0.72–0.86) | 90–220 | ridged massifs |
   | peaks (> 0.86) | up to ~320 | crags |

   These numbers get tuned in M1 against pictures and walkability statistics.
2. **Detail, blended by biome.** Scattered biome blending with r ≈ 56 m, where parameters are
   blended rather than final heights:
   - **plains:** fBm of 1.5–3 m;
   - **hills:** fBm plus ridged noise at 8–20 m;
   - **mountains:** ridged multifractal of 60–120 m with domain warp, slope-damped fBm and
     cliff-band terraces;
   - **badlands:** mesas and strata;
   - **the volcano:** cone and crater from the plan.
3. **Hydrology.** River beds carved with `smin` to the river's surface height, which falls
   monotonically downstream, plus lakes and coast. River valleys are the natural passes.
4. **Constraints.**
   - Settlement and site pads: tiered on slopes, with retaining walls drawn in M5.
   - Roads and paths clamped into a cut-and-fill prism: 45° cuts, 30° fills, at most ±8 m.
5. **Quantise.** Round to 1/1024 m. Heights under 8 km then fit a `Float32Array` exactly, so the
   rules, the mesh and the navigation-mesh input all see the same numbers.

Everything is a point function over integer-metre inputs and plan-derived spatial buckets (roads,
pads and rivers indexed by 32 m cell). Nothing reads neighbouring chunks, so a chunk comes out the
same in any build order, and the heights on a shared edge are bit-equal.

### 3.3 Walkability

| Slope over a 1 m square | Class | Rules | Navigation mesh |
|---|---|---|---|
| < 30° | open | normal speed | walkable |
| 30–38° | steep | speed × 0.6, no running | walkable, costlier area |
| ≥ 38° | cliff | blocked | not walkable (`walkableSlopeAngle 38`) |
| water deeper than 1.2 m | deep | blocked (swimming later) | cut out of the input |
| water 0.3–1.2 m | ford | speed × 0.5 | walkable, costlier area |

- Mountain massifs are cliff-class except inside path corridors.
- Roads are graded to at most 10 % (tracks 20–25 %) with 6 m hairpins, so the ways through the
  mountains are the roads and passes.

### 3.4 Chunk data

A chunk is 64 m (unchanged). It is built in a terrain worker and its buffers are transferred to the
main thread:

```js
TerrainChunk {
  cx, cy,                  // chunk coordinates
  step,                    // 1, 2 or 4 m (level of detail)
  heights: Float32Array,   // (64/step + 3)², with a 1-sample apron for normals
  normals: Int8Array,      // xyz × 127, from the height function's apron
  slope:   Uint8Array,     // 64×64 classes per 1 m square (§3.3), step 1 only
  surface: Uint8Array,     // 64×64 splat layers and weights: grass, soil, rock, road, snow…
  water:   Uint8Array,     // RGBA8 at 1 texel/m: shore distance, flow x/y, depth (M3)
}
```

- The rules (walkability, heights under units) and the renderer share one LRU of step-1 height
  chunks.
- Rules code never reads a render-only level of detail.

### 3.5 Drawing the terrain

- **Near rings.** Built on the CPU from the exact heights in `BufferGeometry`:
  - 1 m spacing to about 64 m (the 3×3 around the player on medium; only the player's own chunk on
    low);
  - 2 m to 128 m;
  - 4 m to 256 m.
  - Pooled geometries of the same size share one index buffer.
  - Edges are snapped so levels meet without cracks.
- **Far rings (M6).**
  - A GPU geometry clipmap at 8–64 m spacing out to the world's edge, displaced from a whole-world
    height texture that a worker fills with the same function, band-limited.
  - CDLOD morphing between levels.
  - Two depth passes: far from 100 m to 10 km, near from 0.3 to 300 m.
- **Material.**
  - Splat layers chosen by slope, height and ridge; biplanar rock only on cliffs.
  - Height-blended layers on medium and up; a detail normal map within 30 m.

### 3.6 Serialisation and the network

- Terrain never travels. The `welcome` carries:

  ```js
  world: { seed, terrain: TERRAIN_VERSION, nav: NAV_VERSION, hash }
  ```

  where `hash` is a 32-bit FNV of `heightAt` at 256 fixed points. A joiner checks it before
  playing and refuses to join on a mismatch, rather than desyncing later.
- Anything that changes the ground in play is an op in the op stream. Each peer re-derives the
  chunk.
- **Debug and test export.** Chunk heights delta-encoded as int16 centimetres: 64² → 8 KB raw,
  about 2–3 KB compressed. Used for golden tests and bug reports, never for play.

---

## 4. Navigation meshes

### 4.1 Tiles

- 32 m tiles, 2×2 per chunk, aligned to the world origin: `tx = floor(x / 32)`.
- Recast configuration:

  | Setting | Value |
  |---|---|
  | `cs` (cell size) | 0.5 |
  | `ch` (cell height) | 0.25 |
  | `walkableSlopeAngle` | 38 |
  | `walkableClimb` | 0.5 m (2 voxels) |
  | `walkableHeight` | 2 m (8 voxels) |
  | `walkableRadius` | 0.5 m (1 voxel; BODY is 0.3 m, rounded up) |
  | `tileSize` | 64 voxels |
  | `borderSize` | walkableRadius + 3 voxels |
  | `maxTiles` | 1,024 loaded (4,096 polygons each) |

- **Inputs** for a tile, with its border (about 2 m):
  - terrain triangles at 1 m, sampled straight from `heightAt`;
  - deep water cut out;
  - every obstacle whose footprint meets the box.

  **Obstacles:**
  - buildings: footprint prisms with steep pyramid caps, so roofs aren't walkable;
  - walls and palisades: thin prisms;
  - tree trunks: 0.4 m prisms;
  - rocks and features: their hull prisms.

  A tile is therefore a pure function of `(seed, tx, ty, edits)`. It doesn't depend on which
  neighbours are loaded.
- **Area costs.** Steep ground, fords and roads get area types if the generator exposes per-triangle
  areas or convex volumes. Checking this is the first job of M2a; the fallback is costs applied
  after the path by our own funnel.
  - *Checked in M2a: yes.* The stock tile generator doesn't take areas, but core's low-level calls
    do (`rasterizeTriangles` takes an area per triangle, and `markConvexPolyArea`, `markBoxArea`
    and `markCylinderArea` exist). So `navigation/bake.js` runs Recast's pipeline itself, with
    our own areas per triangle, and `QueryFilter.setAreaCost` prices them.
- **Interiors.** Each floor's rows become floor quads plus wall prisms, baked as a solo navigation
  mesh when the floor is first made. They are small and fast.

### 4.2 Baking

- A module worker, `client/js/world/navworker.js`, builds tile data (a `Uint8Array`) and transfers
  it. The main thread calls `navMesh.addTile`.
- **Which tiles the rules see** depends only on game state: tiles within 96 m of any simulated
  actor or order target, identical on every peer. It never depends on a client's drawing radius.
- If the rules need a tile that isn't ready, it is built synchronously, taking about 2.5 ms. Its
  content is deterministic either way.
- Tiles are dropped by an LRU when no actor is near.
- **Budgets:**
  - ≤ 5 ms per tile in the worker;
  - ≤ 0.05 ms for `addTile` on the main thread;
  - 4 tiles per chunk are ready before the chunk becomes walkable for the player.

### 4.3 Queries: `core/navigation.js`

```js
nav.path(mapId, from, to, { avoid }) → [[x, y, z], ...]  // Detour A*, then string-pulled
nav.nearest(mapId, point)            → [x, y, z] | null
nav.raycast(mapId, from, to)         → { hit, t, point }  // walkability ray on the mesh
nav.walkable(mapId, x, y)            → boolean
```

- **Never** send `dtPolyRef`s over the wire or keep them in snapshots. They differ with tile
  history (measured).
- NaNs are checked before hashing.
- Paths are float64 on the JavaScript side, rounded to centimetres when recorded.

---

## 5. Continuous movement (the rules)

- **Actors.**
  - Positions `(x, y)` are float64, with a radius by kind (0.3 m for people; bigger for large
    creatures, which today take several squares).
  - Velocity `(vx, vy)`, heading, and waypoints `via[]`.
  - Height comes from `groundAt`.
- **Occupancy** moves from `taken` squares to a spatial hash of circles on a 2 m grid.
- **Steering.** Deterministic, in `exact.js`:
  - seek the next waypoint, and arrive;
  - separate by pairwise pushes in id order;
  - local avoidance by a small velocity-obstacle pass over the nearest 6 neighbours;
  - `nav.raycast` keeps a unit on the mesh; `moveAlongSurface` as needed.
- **Sight.**
  - Distance ≤ `SIGHT`.
  - A 2D segment test against occluders: building footprints, walls and tall features, from a
    per-chunk segment index.
  - A terrain test from eye height (1.6 m) sampled every 2 m along the line. Hills now hide
    things.
- **Reach, melee and projectiles.** Already float distances. Projectiles gain height, so arcs
  follow the ground and hit hillsides.
- **Doors, stairs and links.** Link points become circles; arrival places the unit a step clear.
- **Snapshots** gain `vx, vy, via`. `Host.checksum` hashes positions rounded to millimetres.
- The grid A* (`pathfinding.js`), `lineAhead`, `nearestFree` and square occupancy are removed once
  nothing uses them (end of M2b).

---

## 6. Multiplayer: packets

NET_VERSION goes to 7 with M2b and to 8 with M5. The relay is unchanged: text frames. Motion packets
carry a base64 packed buffer, so the relay stays neutral about binary frames.

**`welcome`.** Adds the `world` block from [§3.6](#36-serialisation-and-the-network).

**`command`** (joiner to host), in integer centimetres:

```js
{ kind: "command", seq, order: { type: "move", to: [x, y] } }
{ kind: "command", seq, order: { type: "engage", target } }
```

- `to` is the ground point the player tapped.
- Direction commands (swipe ahead) send a heading in thousandths of a radian.

**`ops`** (host to all). A recorded order carries the host's path:

```js
{ op: "order", step, id, order: { type: "move", to: [x, y], via: [[x, y], ...] } }  // cm
```

- Replaying peers follow `via` and don't call the navigation mesh. Replay is therefore exact even
  if a peer's navigation mesh differed.
- Automatic re-paths (AI and chasing) are recorded the same way when the host computes them: an op
  `{ op: "via", step, id, via }`.

**`motion`** (host to all), every 4 steps (5 Hz):

```js
{ kind: "motion", step, units: "<base64>" }
```

- Each packed unit is 16 bytes:

  | Field | Type |
  |---|---|
  | index | uint16 |
  | x, y (cm) | int32 each |
  | vx, vy (cm/s) | int16 each |
  | heading | uint8 (256 steps) |
  | flags (moving, running, fighting, via-index) | uint8 |

- It covers the actors within 160 m of any player, capped at 64. That is 1 KB per packet, about
  5 KB/s at worst.
- **Uses:**
  1. *Early desync detection.* A joiner compares with its replica at the same step. Any difference
     over 1 cm sends `again` straight away, instead of waiting up to 100 steps for the checksum.
  2. *Prediction of your own hero.* A joiner's tap moves its hero at once in the view layer (not in
     the rules), along a locally computed path. It then reconciles to the authoritative position
     with a 150 ms blend. The rules never predict, so determinism is untouched.
  3. *Smoothing* of remote units while a joiner is catching up after a pause.

**`state` / resync.** Unchanged, apart from the new actor fields.

**Tick sync.**
- The host's step number rides on every `ops` and `motion` packet.
- A joiner runs its replica up to `hostStep − delay`, where `delay` adapts to jitter (2–6 steps) to
  keep interpolation smooth.
- The debug overlay shows RTT, delay and desyncs.

---

## 7. Water

The plan comes from `water.md`'s research: flow-mapped rivers after Valve, Beer–Lambert depth, and
river surfaces that follow the terrain.

- **World plan.**
  - A river graph with discharge, width, depth, surface height, and speed from Manning's equation.
  - Lakes at their flood-fill level, with outlets.
  - Drops marked as calm, rapids or waterfalls; deltas and marsh water tables.
- **Chunk.**
  - Carve the bed (parabolic, eased banks).
  - An RGBA8 water field at 1 texel/m: shore distance, flow xz, depth and foam.
  - One water mesh with per-vertex surface heights.
  - Waterfall sheets and mist at the marked drops.
  - Fords and deep water fed to walkability and the navigation mesh.
- **Shader** (one material):
  - two-phase flow-mapped normals;
  - depth colour and alpha by Beer–Lambert;
  - Schlick Fresnel with F0 0.02;
  - sky reflection plus sun glint;
  - foam at shores, speed, obstacles and plunge pools.
  - No depth pre-pass, planar reflection or refraction pass.
  - About 3 texture fetches a pixel on low and 5–6 on medium.
- **Underwater look** in the terrain shader (medium and up): absorption, a wobble, caustics.

---

## 8. Structures and roads on real ground

**Settlements.**
- A pad for each settlement at the mean height of its footprint.
- On slopes, tiers with retaining walls and stairs. Streets follow grades of at most 12 %; steeper
  streets become stairs.
- Buildings get plinths or stepped foundations down to the ground: no floating corners and no
  buried doors.

**Castles and keeps.**
- Sites chosen by elevation and prominence: crags, spurs and river bends.
- Curtain walls follow the contour.
- Gatehouses sit at the road's approach, which switchbacks up.

**Roads.**
- Refined from the plan by a fine A* in a corridor: 4 m grid, 16 or 32 directions, grade limits and
  turn costs.
- Smoothed with Chaikin; the profile is clamped to the grade.
- Cut-and-fill prisms carve the ground; hairpins on mountains.
- Mountain passes are the only way over the massifs.

**Bridges.**
- Span the carved valleys, with piers down to the bed and the deck at road height.
- Fords where rivers are shallow.

**The peoples' places.**
- Lizard folk stilt houses stand over real water depths.
- Elves' tree halls sit on raised roots; dark elves' spires on crags.
- Orc camps on mesas and in badlands.
- The cat folk's pride rock is a real outcrop; their watering hole is a real depression.

**Wild features and camps.** Placed by slope and height rules (boulder fields below cliffs, camps on
flats), and pushed into the Elden Ring direction of [§9](#9-environment-art-direction-a-lower-fidelity-elden-ring).

**Cliffs and rock.** Rock meshes where the slope is over 45°: strata bands and overhang stamps.

---

## 9. Environment art direction: a lower-fidelity Elden Ring

Added at the user's request, and chosen from the environment research (`research/eldenring.md` in
the session: Elden Ring's world structure from its asset and map names, FromSoftware's talks,
and open-source generators, licences checked).

**What makes the look, and what we keep.**
- **Silhouettes at distance.** Castles, towers, churches, ruins and a giant tree read as shapes
  against fogged sky 1–4 km away.
- **One world landmark** visible from nearly everywhere (the Erdtree role): a warm glowing rim
  and light-shaft meshes.
- **Value layering by fog.** Near dark, mid lighter, far pale, in four tuned bands. Height fog
  keeps valleys hazy and peaks crisp.
- **A palette per region**, blended as the player walks: sky, fog, sun and grade.
  - farmland and meadow: green and gold;
  - marsh, lake and elfwood: blue fog;
  - volcanic land and the orcs: red;
  - savannah: gold;
  - snow and mountain: white-blue;
  - darkwood: violet.
- **Scale contrast.** Human-scale doors and steps against walls 12–20 m high, towers of
  25–40 m, spires to 60 m. Today castle walls are 6.4 m and towers 12 m.
- **Ruins everywhere**: roofless churches, broken towers, collapsed arcades, rubble, graves.
- **Rock relief**: cliffs with strata, boulders at their feet, a few arches and overhangs,
  meadows between.
- **Guidance**: torches at cave mouths, lit destinations, roads that frame landmarks.
- **Density.** Elden Ring has about 20 named places per km²; Pellagos about 6. We add about one
  small point of interest per 256 m cell.

**What we drop for phones.**
- Normal-mapped PBR everywhere (only on rock, if at all).
- Volumetric fog; SSAO and GI (we bake AO into vertex colour, as the kits already do).
- Grass past 40–60 m, shadows past 24–40 m, and full-detail distant buildings (we use proxies).
- Physics foliage (vertex sway already exists).

**Chosen generators, by element** (triangles and draws per frame on a mid-range phone):

| # | Element | Technique | Code to write or port (licence) | Budget | Plugs into |
|---|---|---|---|---|---|
| 1 | Atmosphere | Height fog in 4 value bands; region look table blended by position; grade in `CustomToneMapping` (no extra pass); light-shaft cards | Own code | +0 passes; 2–4 draws; < 2k triangles | `view.js`, `sky.js`, `environment.js`, new `world/look.js` |
| 2 | Far silhouettes | Every layout emits a few boxes, prisms and cones for its biggest masses. Everything within 4 km merges into one far mesh, plus the world landmark | Own code; three `mergeGeometries` (MIT) | 1–3 draws; 8–25k triangles | `sites.js`, `settlements.js`, `setpieces/*`; the far pass (M6) |
| 3 | Landmark composition | Tiers (large, medium, small); plan-grid viewshed so medium landmarks sit on visible high ground; viewpoints; roads that approach landmarks head-on; ~1 small point of interest per 256 m cell | Own code in `core/worldplan/landmarks.js`, exact maths | Plan-time CPU only | `settle.js`, road refinement, `wilds.js` |
| 4 | Neutral sites (110 exist in the plan but are never built) | Church or chapel ruins, ruined castles, catacomb portals with torches, stone circles, shrines, a lair | Grammar and kit (rows 6–7) | 2–14k triangles each, merged per chunk | `sites.js siteSize()`, `pieces.js` |
| 5 | Rocks and cliffs | Cliff panels on steep bands, strata stacks, boulders at cliff feet, 1–3 arches per region, moss and snow masks | Port SeedRock `cliff.js` / `erosion.js` (MIT); extend `wilds.js rock()` | 20–45k triangles; 1–3 draws | Chunk building, fed by `heightAt` |
| 6 | Ruins | A decay pass over existing kits: roofs removed, broken tops stepped to masonry courses, breaches, rubble, weeds, a tree inside | Own code (ideas from open repos) | Fewer triangles than the intact building | `house.js`, `castle.js`, the peoples' kits via a `decay` option; rubble that blocks, in core |
| 7 | Churches, citadels, bridges | Romanesque and Gothic church grammar; hill citadels 2–3× today's scale on stepped pads; stone arch bridges; broken aqueducts; grand stairs | Port gremlin-church arch, spire and pinnacle maths (MIT); own `core/setpieces/citadel.js` | Church 6–14k; citadel 30–80k near (3–8 draws), proxy far | `landmarks.js`, `castle.js`, bridges |
| 8 | Trees | Canopy palette per region; gnarled great lone trees; cheap far trees without shadows | Extend `trees.js`; far LOD instanced | Far 1–2 draws, 40–90k triangles (off beyond 600 m on low) | `Woodland`, far pass |
| 9 | Grass and flowers | Denser inner ring; ground colour matched to grass tips; wind gusts; drifts per region | Extend `wilds.js UNDERGROWTH` | 60–120k triangles; 4–6 draws (about today's) | `chunks3d.js`, `ground.js` |
| 10 | Weathering | Moss on up- and north-facing surfaces, rain streaks, ivy leaf quads merged into buildings | Extend `weathering()` in `peoples/kit.js` and `house.js` | +5–10 % triangles on ivied walls; no extra draws | Every kit |

**Pushing each people toward the Elden Ring feel without losing identity.**
- **For everyone:**
  - heavier stone bases (0.6–1.2 m plinths that follow the real ground);
  - retaining walls on pads;
  - ruined versions of every building kind;
  - one grand landmark per people, 30–60 m tall, with a far proxy.
- **Humans:** more stone in the marches; Romanesque and Gothic parish churches and abbeys;
  ruined villages; hill citadels; broken aqueducts. Landmark: a cathedral with a 40–60 m spire,
  or a keep with needle towers.
- **Elves:** pale ruined rotundas and colonnades swallowed by roots; crystal clusters; a
  blue-silver palette with valley fog. Landmark: a tall domed starwatch, or a colossal tree.
- **Dark elves:** the most Gothic people, with flying buttresses, pinnacles and broken spires;
  dwellings cut into basalt cliffs; a violet and teal palette. Landmark: the 60 m obsidian spire.
- **Cat folk:** eroded mud ruins with melted wall tops; dry-stone enclosures; a gold palette.
  Landmark: the sun temple's twin towers and disc.
- **Lizard folk:** overgrown stepped pyramids; causeways and broken bridges over marsh; low mist.
  Landmark: a 25–40 m ziggurat rising from the mist.
- **Orcs:** basalt forts on volcanic slopes; columnar basalt; ash fields; a red-orange sky near
  the volcano. Landmark: a basalt citadel with a smoke plume.

**Budget.** Looking at the horizon outdoors on a mid-range phone, all of this totals about
110–230 draws and 430–790k triangles before tiering. Tiering brings it within 250 draws and 500k
triangles:
- **Mid-range:** far trees only to 600 m; a 20 m dense grass ring; buildings simplified from
  30 m.
- **Low-end (120 draws, 250k):** near terrain 3×3 at 2 m; no far trees, only a forest tint; no
  dense grass ring; no shadows past 16 m.

**Rules and determinism.** Anything that changes blocked squares, walkable surfaces or the
navigation mesh is core code with exact maths: site and citadel layouts, rubble ramps, stairs,
bridges, point-of-interest positions and viewshed placement. Purely visual things may use `Math`:
cliff panels on already-blocked slopes, ivy, moss, rubble chips, proxies and light shafts.
BatchedMesh falls back to one draw per instance without `WEBGL_multi_draw` (about 3.5 % of
Android), so anything with many instances is also merged per chunk.

---

## 10. Characters: the CharMorph Vitruvian base

**What the base is.** Checked in the repository `Upliner/CharMorph-Vitruvian`.
- **Licence:** `config.yaml` says `license: CC0`. The CharMorph add-on's code is GPL-3.0, but we
  use only the character's data.
- **Mesh:** 37,436 vertices (`morphs/L1/Default.npy`, float64) and 37,422 quad faces
  (`faces.npy`), so about 75k triangles.
- **Morphs:** 100+ body and face morphs in `morphs/L2`, including gender, age, body types and
  fantasy ears, eyes and teeth.
- **Expressions:** 149 FACS expressions and visemes in `morphs/L3`, including the tongue.
- **Rigs:** Rigify, mannequin and **Mixamo** joints and weights (`joints/Mixamo.npz`,
  `weights/mixamo.npz`). Our `rig.js` already uses 52 Mixamo bones.
- **Textures:** 4K UDIM skin textures in EXR, for light and dark skin, with roughness and height.
- **UVs:** held only in `char.blend`, so they need the one-off Blender conversion.

**The plan** (M7, its own set of PRs):

1. **Conversion script** (`scripts/build-vitruvian.js`, plus a small Blender export step):
   - read the npy/npz data directly;
   - export UVs and vertex groups from `char.blend` once;
   - write compact CC0 binaries: base mesh, sparse morph deltas and Mixamo weights.
   - Mesh levels: a head submesh for expressions; body LODs at about 25k, 8k and 2.5k triangles
     with meshoptimizer.
2. **Body and sliders.** Map our macro sliders onto Vitruvian's morphs: sex, age, weight, muscle,
   height and proportions, and the peoples' ears, eyes and teeth.
3. **Garments.** Re-fit every garment and armour piece; they are fitted to hm08 vertices today.
   - Transfer by closest-point and barycentric mapping from hm08 to Vitruvian, done once at build
     time.
   - Then fix by hand where needed, and re-run `test/clipping.test.js` to keep items clear of
     bodies.
4. **Skin.** Downsample the 4K UDIMs to a 1024 atlas on high and 512 on medium and low. NPC skins
   stay 1024 on high. Blend light and dark as the textures intend, and repaint people-specific
   skins (scales, fur, orc hide) on the new UVs.
5. **Face.** Blinks, gaze and expressions from `morphs/L3` on the head submesh only. Morph cost in
   r186 scales with morphs × vertices.
6. **Animation.** Keep the procedural gait and actions. Add the Quaternius Universal Animation
   Library (CC0) through the existing retargeter for climbing, ledges, swimming, rolls and emotes;
   terrain makes climbing and slopes matter.
7. **Budgets** (triangles and draw calls):

   | | Mid-range phone | Low-end phone |
   |---|---|---|
   | Hero | 20–30k triangles, ≤ 3 draws | 12–18k triangles |
   | Others (LOD1 / LOD2) | 5–8k / 1.5–2.5k triangles | 1.5–2.5k triangles |
   | Skinned triangles on screen | ≤ 250k | ≤ 100k |

   Outfits are merged into one skinned mesh per character; baked normal maps; shadows from the low
   LOD only.

### 10.1 Getting movement and clipping right the first time

The last round of arm and clipping work took several passes. The causes were:

- **Hand-made motion.** Keyframes were written as joint angles by hand, then tuned by eye. Each fix
  to one pose disturbed the blends into and out of it: shoulders past their range, rests holding
  things into the body, the bow's draw changing an earlier key.
- **Problems found late.** Clipping and joint limits were checked by looking at pictures after the
  content was written. The automated clipping test came last, so each round was
  write → look → fix → look again.
- **One body, many shapes.** Poses tuned on one body failed on others: courtesans' busts, orc
  bulk, shields on soldiers.

For M8, the checks come first and the motion comes from real people:

1. **Build the checks before any content.** Before converting a single clip, a *motion check* runs
   every clip × every people's body extremes (thinnest, bulkiest, tallest, shortest) × every item.
   It uses the existing `test/clipping.test.js` machinery on bone capsules and garment layers, and
   measures:
   - joint angles against `rig.js`'s anatomical limits, every frame;
   - how deep any item goes into the body, and any limb into the torso;
   - foot sliding while planted, and feet below the ground;
   - hands off their grips on two-handed items.

   It writes a contact-sheet page (frames in a grid, failures outlined in red) and a JSON report.
   CI fails on any regression. Only failures need anyone's attention, so there are no rounds of
   looking at everything.
2. **Captured motion as the source, not hand-made keys.** Motion capture of people is within
   human joint ranges and weight shifts by nature.
   - **Quaternius Universal Animation Library 1 + 2** (CC0, about 170 clips with fingers) covers
     sword combos, shield, bow, spells, dodges, rolls, hits, deaths, climbing, ledges, swimming,
     sitting and emotes.
   - **100STYLE** (CC BY 4.0) covers walking and running styles per people.
   - **CMU** (free to redistribute) fills gaps.
   - All of it is retargeted once, at build time, onto the Vitruvian Mixamo rig. The bone names
     match one to one, so the retarget is nearly an identity. It is stored as our compact
     joint-angle curves.
   - **Procedural code only layers on top:**
     - foot IK to the terrain, which slopes now need anyway;
     - hand IK to each item's grip;
     - look-at;
     - additive hit reactions;
     - the few actions no library has (pour, toast, serve, beckon, sheathing at our sockets).
       These are built from the nearest captured clip plus IK, not from blank keys.
3. **Fixes solved offline, not by eye.** Where the check finds a problem on some body or item, a
   build step solves a small correction and stores it with the clip: an elbow pole or hand offset
   curve found by the same optimiser that fitted the last round's keys, now run automatically
   against the check's own measure. Nothing is tuned by hand in the game.
4. **Garments by construction.** Each garment layer gets:
   - the body's skin weights transferred from the nearest body point, so it moves exactly as the
     skin under it;
   - a fixed offset per layer: skin < underclothes < armour < cloak;
   - body faces fully under a garment removed, so skin can't poke through.

   The check runs every garment on every body extreme in its worst poses.
5. **Items by construction.** Each item declares its grip frame (where the palm closes), its
   point, and its clearance volume. The hand socket's frame comes from the rig, so a sword held in
   a captured sword clip sits the way the performer's hand did. Two-handed items get the second
   hand by IK to a second grip frame. Sheaths are sockets placed clear of the arm's sweep, which
   the check measures.

**Mixamo.** Its terms allow use in finished games but forbid giving away the raw files, and this
repository and its web page are public. The user has since offered to arrange a licence; §10.2 is
the pipeline for it. Until the user settles where Mixamo-derived data may be kept, the sources
above are the default. Nothing that costs money is done without approval.

### 10.2 Option: a licensed Mixamo library, baked to glTF

The user offered to arrange a Mixamo licence, and asked for a pipeline that turns CharMorph
Vitruvian + Mixamo clips into a good format for the engine. A prototype of it was built and
checked (outside the repository, on synthetic Mixamo-style FBX files; no Mixamo data was
downloaded). **It works end to end.** One real 30 fps "without skin" download must be tried
before relying on it.

**Why it fits.** Vitruvian's Mixamo rig (`weights/mixamo.npz`, `joints/Mixamo.npz`,
`rigs.blend`'s `mixamo_vitruvian`) uses exactly Mixamo's bone names: 52 bones (Mixamo's 65 less
its 13 end joints), 22 without fingers. Our `rig.js` uses the same names. Mixamo retargets every
clip to an uploaded character's proportions and rest pose, so uploading Vitruvian once makes every
clip fit it.

**The pipeline** (build time, re-runnable, deterministic output):

1. **Upload once.** Export Vitruvian in its A-pose bind pose, Mixamo rig, as FBX, and upload it.
   The same `rigs.blend` is used for the upload and the bake.
2. **Download** each clip as FBX binary, *without skin*, 30 fps, "in place" for cycles. This is
   the one manual step, done in the licensee's account one clip at a time as the site offers; no
   scripted bulk downloading. A manifest (`animation/clips.json`) lists each clip: its Mixamo
   name, our id, bank, loop, root motion, and tags (people, weapon, stance).
3. **Convert** with Blender as a Python module (`bpy` from PyPI, no Blender install):
   - strip `mixamorig:` (and `mixamorig1:`, `mixamorig2:`...), work in world matrices so Mixamo's
     centimetres and 0.01 armature scale drop out;
   - retarget onto the canonical rig by *delta* (source rotation × source rest⁻¹ × our rest):
     independent of bone roll and joint axes; files whose bone lengths or rest pose differ are
     refused with the reason (an `absolute` mode recovers a changed rest when axes match);
   - resample to 30 fps, keep quaternions in one hemisphere, take root motion out of cycles
     (stored as `extras.rootMotion` with its speed), close loop seams, one glTF animation per
     clip. FBX2glTF was tried as a Blender-free converter and rejected: unfixed, nothing binds
     (prefixes, an unapplied Z-up wrapper), it cuts 24 fps clips short and silently drops
     channels.
4. **Check** each clip with the motion check of §10.1 on every people's body extremes (joint
   limits, foot sliding, feet under the ground, items and limbs in the body, loop seams).
5. **Fix offline:** feet locked while planted, seams cross-blended, the moment a blow lands and
   each footfall found and stored, playback rate matched to the rules' speeds, left-handed
   mirrors, additive hit reactions. Nothing is tuned by hand.
6. **Bank and compress** with glTF-Transform (MIT): drop scale tracks and translations but the
   hips', key reduction, then meshopt (our decoder is already vendored). Banks by use
   (locomotion, sword, bow, magic, folk life, hits and deaths), loaded when first needed.
7. **In the game:** three.js `AnimationMixer` on the Vitruvian skeleton, crossfades, upper-body
   masks (casting while walking); then our procedural layers: foot IK to the terrain, hand IK
   to grips, look-at, joint limits.

**Measured on the prototype** (three r186, the game's vendored loader):
- Every clip binds with no unbound tracks; error against the source ≤ 0.01 mm at 30 fps, +0.1 mm
  from meshopt.
- **Size for 300 clips averaging 2.5 s, gzipped:** 1.6–2.8 MB with fingers, 0.8–2.0 MB without
  (smooth to mocap-like data); 9–16 MB uncompressed floats. Banks beat one file per clip (27 KB
  vs 48 KB for four clips). The JSON is about two-thirds of a bank, so the host must gzip `.glb`.
- gltfpack is 25–30 % smaller but drops the clips' extras (loop, root motion) and costs about
  1 mm; glTF-Transform is the default.
- Dropping finger tracks saves 1.4–1.9×; grips then come from a hand pose per weapon, which our
  items already declare.

**Decisions for the user** (the licence and the public repository):
- Where the downloaded FBX files live: a private store the build fetches from (recommended),
  not this public repository.
- Whether the baked, compressed banks may be served with the game from its public host (the
  normal use of Mixamo in a web game), and whether they may sit in this repository or are built
  in CI from the private store and deployed only.

**When.** The converter, check and banking can be built with CC0 clips (Quaternius, 100STYLE)
before the licence is settled; Mixamo clips drop in when it is. It belongs to M8, and could start
earlier on today's body, whose rig has the same bone names.

### 10.3 Main source: Mesh2Motion; supplements: ActorCore, Mixamo

**Decided (2026-10-01).** Mesh2Motion's CC0 clips are the main source. Raw files from any
licensed source stay out of this public repository (ignored, or in a private store); what the
game loads is baked glTF.

**Pilot, done in the character lab** (`scripts/build-clips.js`, `client/characters/animations/
mesh2motion.glb`, `bvh.js`'s glTF path). Five clips (idle, walk, run, sword attack, death) play
on today's MakeHuman body, retargeted at load time:
- The file is 206 KB (102 KB gzipped) for 12.4 s of motion with fingers, in floats, before any
  key reduction or meshopt.
- What retargeting needed:
  - Mesh2Motion's rest is a T-pose and ours has the arms down, but the skeletons also differ in
    how they're built (collarbones pointing back, feet pitched, straight fingers). Lining every
    bone up posed those differences: the collarbones shrugged 45° and the limits clamped them.
  - Now only the upper arms and forearms are lined up. The upper arm is also lined up by the
    elbow's hinge, which both rests show as a slight bend. Every other bone turns with its
    parent.
  - In the walk, the limits now take off at most a few degrees from the legs, back and arms. The
    run's forearms still lose up to about 60° in some frames: the source twists the forearm
    while it bends. A limb IK step (keep the wrist where it is, the elbow on its side, and the
    twist in the forearm) fixes that properly; it belongs to the bake (§10.2 step 5).
  - Choosing the continuing child (the neck, not a collarbone) for the chest's direction also
    straightened MakeHuman's own walk, which had been hunched.
- One-shot clips sample to their last frame: three's mixer loops by default, so its last frame
  was the first again.
- Mesh2Motion's walk and run, side by side with ours, have more forward lean and arm drive than
  the procedural gait.
- Gaps, as expected: no two-handed staff or hammer, cleaver, sheathing, or town life beyond a
  few clips.

**ActorCore as a secondary source** (Reallusion; answered for the user, not bought). Checked
through search: the store's own pages are blocked from the build container, so this needs
confirming on the site.
- **What it sells:** about 4,500 motion-capture clips, sold singly (about $1.50 to $12) or in
  packs (up to about $200). There are some free ones, and the store is a web page, so it works
  from a Mac's browser.
- **Download:** FBX or BVH, at 24, 30 or 60 fps, with presets for Blender, Unity, Unreal, Maya,
  3ds Max, Cinema 4D, MotionBuilder and iClone. That is the same input as the Mixamo path in
  §10.2: an FBX, converted with `bpy` and retargeted by a bone-name map like
  `MESH2MOTION_NAMES`.
- **Desktop tools:**
  - AccuRIG (the free auto-rigger, which since version 2 also browses, previews, retargets and
    exports ActorCore motions) is Windows only, by its FAQ.
  - iClone and Character Creator are Windows only.
  - None of them is needed: we retarget ourselves.
- **Licence:** the content EULA (updated 2025-08-01) is royalty-free, non-exclusive and
  worldwide, and allows use in commercial games and interactive services. It forbids
  redistributing the content, or anything derived from it, as content (stock libraries, 3D
  markets) and sharing or sub-licensing it.
  - Raw FBX files therefore can't go in this public repository.
  - Baked banks served inside the game are the normal use. Baked banks committed to a public
    repository, where anyone can download them as files, are a grey area: build them in CI
    from the private store and deploy them without committing them, or get Reallusion's answer
    in writing.
- **The pipeline on a Mac:**
  1. Buy and download in the browser.
  2. Put the FBX files in the private store.
  3. The bake runs in CI or in a session like this one.
  - `bpy` has macOS wheels, so it can run on the Mac too, but it doesn't have to.
- **Before buying:** run one free ActorCore motion through the pipeline end to end.

---

## 11. Test migration

There are 62 test files. `grep` finds grid APIs (`findPath`, `lineAhead`, `squaresOf`,
`nearestFree`, `blocked/opaque` rows, overworld chunks) in 32 of them. Most use small row maps as
fixtures.

**Rewrite: the grid is what they test**

| File | Becomes |
|---|---|
| `pathfinding.test.js` | `navigation.test.js`: path queries between Vector3 points, walls, mazes, unreachable goals, clamping outside the mesh, determinism, order independence, speed budget |
| `overworld.test.js` | Heights, slopes and walkability by chunk; the same chunks in any order; roads within grade; the town on its pad; castles and places clear of roads and water; the way out of town found on the navigation mesh |
| `chunks.test.js` | Terrain meshes built a step at a time the same as all at once; seams bit-equal between levels of detail; no cracks |
| `world.test.js` | The town on its pad, props as obstacles, trees as trunk circles, sight hidden behind houses |

**Update: they only need float positions and obstacle fixtures.**
- The files: `combat`, `soldiers`, `followers`, `wilds`, `insides`, `interiors`, `creatures`,
  `camps`, `afflictions`, `magic`, `endgame`, `envoys`, `growing`, `host`, `netplay`, `together`,
  `realm`, `news`, `tomes`, `trading`, `wonders`, `setpieces`, `app`, `actions`, `characters`,
  `character-building`, `explored`.
- A helper `flatMap(rows)` turns the old row fixtures into flat ground with prism obstacles and a
  solo navigation mesh. Most tests keep their meaning with one line changed.
- Assertions on exact squares become assertions within a distance.

**Discard: they test grid artefacts that no longer exist.**
- `nearestFree`'s ring order.
- Corner-cutting rules for diagonal squares (`never cuts the corner`, `lineAhead` diagonals).
- Square occupancy (`taken`).
- "A whole square at a time" wall removal indoors. The wall cut-away becomes per wall segment, and
  its test is updated.

**New tests**
- Terrain:
  - `heightAt` is pure and exact;
  - chunk build order doesn't matter;
  - seam equality;
  - the slope class table;
  - pads are flat;
  - roads keep their grade;
  - rivers fall monotonically.
- Navigation:
  - tile bytes hashed across two builds;
  - order independence;
  - paths never cross cliffs or deep water;
  - `path` ≤ 0.2 ms at p95 over random 380 m paths.
- Movement: circle separation; no tunnelling through walls; arriving at a target.
- Sight: hidden behind hills and houses.
- Netplay:
  - `motion` encode and decode;
  - replay with `via` ops equals the host;
  - motion mismatch triggers a resync;
  - prediction reconciles within 150 ms.
- **e2e (Playwright)**:
  - walk across chunk and navigation-tile boundaries without hitches;
  - two browsers playing together keep matching positions for 2 minutes of scripted play;
  - frame time on the phone profile.

---

## 12. Milestones

Each milestone is one PR (sometimes a few), merged with the game playable, with before/after
pictures for anything that changes the look.

| # | Milestone | Contents | Done when |
|---|---|---|---|
| **M1a** | Height function | `core/terrain/`: `heightAt`, noise, slope classes; tests; relief shading in the world map page | Deterministic across order and seams; no gameplay change |
| **M1b** | Terrain in play | Chunk meshes with levels of detail; everything placed on the ground (units, trees, buildings on basic pads, props, camps); roads eased onto the ground; water at river and lake levels; slope-blocked squares; camera clears the ground; fog tuned | Playable on real hills and mountains; frame time equal or better on the phone profile; pictures |
| **M2a** | Navigation meshes | Vendored recast; nav worker; tile baking from terrain and obstacles; `core/navigation.js`; debug overlay drawing; tests | Tiles and paths deterministic; bake and query budgets met; no gameplay change |
| **M2b** | Continuous movement | The rules on float positions: circles, steering, raycast sight; orders with Vector3 targets and host `via`; NET_VERSION 7; interiors on solo meshes; the grid APIs retired; test migration | All tests green; e2e green; multiplayer e2e green |
| **M3** | Water | River graph; carved beds; flow-mapped shader; waterfalls; fords | Pictures; water cost within budget |
| **M4** | Structures and roads | Tiers and retaining walls; castles on crags; switchback roads and passes; bridges over valleys; peoples' places on real ground; cliffs and rocks | Pictures; walk every road end to end in a test |
| **M5** | Multiplayer motion | `motion` stream; early desync checks; hero prediction; tick sync; debug RTT; NET_VERSION 8 | Two-browser e2e with no drift; bandwidth measured |
| **M6** | Horizon and atmosphere | Far clipmap rings; height fog in value bands; per-region look table and grade (§9 row 1); far silhouettes and the world landmark (§9 row 2); far trees; `SunLight` cascades on medium and high; terrain material | Pictures; budgets per tier met |
| **M7** | Elden Ring environment pass | In §9's order: the landmark pass in the plan; neutral sites built, with the decay pass; cliffs and rocks; churches, citadels, stone bridges; foliage palette, grass ring, weathering | Pictures after each part; budgets met |
| **M8** | Characters on Vitruvian | §10, as several PRs (conversion, body, garments, skin, face, LODs, clips) | Pictures; clipping tests green; budgets met |

Each milestone follows the same steps:
- update this plan;
- run the lint and unit tests;
- run e2e locally where possible (Chromium at `/opt/pw-browsers/chromium`);
- measure on the phone profile against the last baseline;
- take pictures;
- update docs (`docs/WORLD.md`, `GAME.md`, `CHARACTERS.md`);
- open the PR, get CI green, merge with a merge commit, and check main's CI and Pages.

---

## 13. Budgets and how they're measured

**Where time goes** (mid-range phone)

| Item | Budget |
|---|---|
| Terrain chunk build | ≤ 20 ms per chunk in the worker; ≤ 1 ms per frame on the main thread for upload |
| Near terrain | ≤ 105k triangles on medium, ≤ 55k on low |
| Far rings | ≈ 35k triangles, 6–8 draws |
| Navigation tile | ≤ 5 ms in the worker; `addTile` ≤ 0.05 ms |
| Path query | ≤ 0.2 ms at p95 |
| Rules step | +≤ 0.5 ms with 50 actors, compared with today |
| Frame | ≤ 250 draws and ≤ 500k triangles on medium; ≤ 120 draws and ≤ 250k on low |

**Download.** About +220 KB gzipped for recast, and about +30 KB for terrain code. Vitruvian's
converted data is to be measured in M8 against today's hm08 data.

**Measuring.**
- The debug overlay: frame time, GPU timer, draw calls and triangles.
- A fixed camera path through plains, a town, a mountain pass and a river.
- The phone profile in Playwright.
- Node benchmarks for heights, tiles and paths, kept in `test/` as budget tests with a generous
  margin.

---

## 14. Risks and open questions

| Risk | Plan |
|---|---|
| The navigation-mesh generator may not expose per-triangle area types | Check in M2a. Fallbacks: our own cost pass, or convex volumes through the raw bindings. |
| WebAssembly determinism on ARM phones (only x86 was tested) | Replay follows host waypoints, so the rules don't depend on it. Motion checks and checksums catch any drift. |
| Height evaluation cost on low-end phones | Worker; levels of detail; cache step-1 chunks; measure in M1a before wiring. |
| Terrain changes the world's layout feel; saves keep the seed | Keep the plan's layout (towns, roads, rivers). Heights are added on top, so saved worlds still load. |
| Vitruvian UVs need Blender once | A one-off export, committed as data. If Blender can't be run, parse the `.blend` mesh data in a small script. |
| Garment re-fit on a new topology | An automated transfer, then clipping tests; this is the largest part of M8. |
| Scope | The milestones are independent enough to reorder. M7 and M8 can swap if the user prefers. |

---

## 15. Change log

- **2026-09-30.**
  - First version, after the codebase audit and research on the navigation mesh, water, terrain,
    visual fidelity and characters.
  - The user chose recast WebAssembly, replay plus a state stream, the CharMorph Vitruvian base and
    playable milestone PRs.
  - The user asked that scenery and buildings be a lower-fidelity Elden Ring. §9 was added, and
    environment research is under way to choose its generators.
  - The user asked for an approach that avoids the several passes the last movement and clipping
    work took, and offered Mixamo access. §10.1 was added: automated checks first, captured
    motion as the source, fixes solved offline, garments and items clear by construction. Mixamo
    is held back because of its raw-file terms.
- **2026-09-30.** The environment research came back. §9 was rewritten with the chosen generators,
  budgets, per-people directions and order of work, and M6/M7 now follow it.
- **2026-09-30, M1a built.** `core/terrain/`:
  - **Files:** `simplex.js`, `curve.js`, `waters.js` and `height.js`.
  - **Speed and range:** simplex with its slope takes about 50 ns in V8. A 65×65 chunk of heights
    takes about 6 ms (median). Heights run from −30 to 362 m on seed 1.
  - **Walkability, from 40,000 samples:** mountains are 63 % cliff, 25 % steep and 12 % open.
    Plains are 95–98 % open.
  - **Changes from the plan:**
    - Ridges only ever raise the land. Signed ridges sank the ground round mountain lakes below
      their water.
    - Lakes and the sea are carved by a smooth, ragged *wetness* field (the B-spline of wet cells)
      rather than the old cell-by-cell blend. Shores now follow the land's contours instead of the
      32 m cells.
    - `waterAt` is the single test of where water stands, for M1b's squares.
  - The overworld reads rivers and still water from `waters.js`, unchanged: its tests are the
    same.
- **2026-09-30.** The user offered a Mixamo licence and asked for a Vitruvian + Mixamo → glTF
  pipeline. §10.2 added from a working prototype (bpy retarget, glTF-Transform meshopt banks,
  checked in three r186).
- **2026-09-30, M1b built** (terrain in play; the squares are still walked as before).
  - **Core** (`core/terrain/ground.js`, overworld): pads for the town, settlements, castles,
    places and camps, eased in over 24 m; roads on profiles smoothed 12 m each way, under 0.3 m a
    metre off bridges; cliffs past 38° blocked but for roads, bridges and what's built; bridge
    decks arched at least 1 m over their river; `surfaceAt` for the water's surface.
  - **Change from the plan:** a river's surface is kept at least 0.4 m under the land at its
    cell's middle and never above anything upstream. The plan's filled `level` stood some rivers
    on walls above the land round them; now they cut gorges through rims instead
    (`TERRAIN_VERSION` 2). Then river banks rise from the bed's edge over 1.5 m, where they had
    stepped 0.5 m at once (a staircase of rock along diagonal banks on the 1 m grid), and lakes
    and the sea sink the land in from where water can stand rather than at a fixed wetness, so
    their shores slope rather than drop (`TERRAIN_VERSION` 3). Carved water runs 2 m under the
    banks, so the ground, not the squares, draws its edge.
  - **Drawing:** chunk meshes from the corner heights, ring by ring from the player's chunk
    (high 1/1/2 m, medium and low 1/2/4 m: a 4 m mesh strays 0.3–0.5 m from the ground at the
    95th percentile on pads, roads and banks, so only in the fogged outer ring; 2 m strays
    4–11 cm), with 2 m skirts; rock on slopes past about 33°; water sheets following the
    surface; bridges arched on piers; buildings, trees, rocks, undergrowth, props, camps,
    banners, drops, doors, effects, decals, spells, projectiles, birds and landing beasts all
    on the ground; contact shadows along the slope; the camera kept over the ground and taps
    found by ray-marching it; debug squares laid over it.
  - **Deferred to M2b/M8:** each foot on its own ground on slopes (locomotion foot IK with a
    pelvis drop). It changes the tuned gait, so it goes with the motion check of §10.1. Until
    then a character stands at the ground under its middle, which is within a few centimetres
    of each foot on the open slopes (under 30°) that can be walked.
  - **Measured** (phone profile, town, medium; Chromium's software renderer, which pays for
    each triangle far more than a phone's GPU does): draw calls equal (88); triangles 247k
    against 222k (budget 500k); the ground's own 37k (budget 105k); script time per frame equal;
    render time +18 %, all of it the ground's triangles (the rest of the scene measured no
    dearer), most of it the 1 m chunk under the player, kept so feet meet the drawn ground. On a
    phone GPU 37k triangles at 60 frames a second is about 2 million a second, a small share of
    even a low-end GPU's rate. Far rings coarser still come with M6's clipmaps.
  - **Fixed on the way:** the camera's eased height lagged under the ground climbing (and at
    load, from 0), and the new clamp then swung it overhead; it now never lags more than 0.2 m,
    the clamp starts 2 m back and looks at the player.
  - **Fixed on the way:** a winged beast's landing glide was overwritten by the standing height
    each frame; now it glides down to the ground.
- **2026-10-01.** The user made Mesh2Motion the main animation source, and asked whether
  ActorCore could be a secondary one bought for a Mac. §10.3 was added: the Mesh2Motion pilot in
  the character lab (five clips; the retargeting now lines up only the arms, and the upper arm
  by its elbow hinge, with the measured results) and ActorCore's formats, tools, licence and
  pipeline.
- **2026-10-01, M2a built** (navigation meshes; nothing walks them yet):
  - **Vendored:** `@recast-navigation/core` and `wasm` 0.43.1 (`npm run vendor:recast`). The
    generators package isn't needed. The core is minified to 49 KB, and its import of the wasm
    package points at the copy beside it. 203 KB gzipped in all (core 12, glue 60, wasm 131),
    loaded only when wanted. It loads in Node too, given the wasm bytes (`navigation/recast.js`).
    `server/static.js` serves `.wasm` and `.mjs`.
  - **Tiles** (`navigation/tiles.js`, `bake.js`, `settings.js`): §4.1's settings. Area per triangle:
    ground, road (roads, cobbles, yards, planks), steep (30–38°), ford (≤ 0.5 m of water), or
    none.
    - **Obstacles, a change from §4.1:** the overworld's new `solid` squares (built or standing:
      the town's, settlements' and places' buildings, walls and stalls, the wild's features),
      merged into rectangles and rasterised as 3 m boxes whose faces are area none, so roofs are
      never floors. Trees are their trunks (0.4 m), bridges their decks.
    - Building footprints as real polygons can replace the squares when M4 gives structures
      their own geometry. Until then the mesh agrees with the squares about what's in the way,
      which keeps M2b's migration honest.
  - **Measured:**
    - The same tile bytes whichever chunks were made first, and the same paths whichever order
      tiles were added (tested).
    - Tile input about 3 ms once its chunks exist (the first tiles also make chunks: about 23 ms
      each round the town). Bake 4.4 ms median in the town, 6–8 KB a tile.
    - Paths found: 0.05 ms median, 0.12 ms at p95, within budget. Unreachable targets search
      every kept tile: up to 0.5 ms at p95.
  - **Not done yet:** the tiles the rules see are not yet tied to game state (§4.2); nothing calls
    `path` but the debug view and the tests. That belongs to M2b, along with interiors' solo
    meshes.
  - **Debug mode:** a *Navigation mesh* switch draws the tiles within 80 m of the player, baked in
    `world/navworker.js`, tinted by area.
- **2026-10-01, M2b built** (everyone walks the navigation meshes):
  - **One mesh per map** (`navigatorOf`): the overworld's tiles (M2a), and for each map of
    squares on its own (a building's floors, a town laid out alone, a test's rows) a mesh baked
    from its squares (`navigation/squares.js`, settings `ROOMS`: flat, 32 m tiles, 0.1 m voxels,
    0.3 m radius). Coarser voxels were tried and closed doorways a square wide (0.2 m voxels with
    a 0.4 m radius, and 0.125 m with 0.375 m); 0.1 m keeps them, at about 60 ms for a fully open
    32 m tile, 25 ms for a tavern floor, once. The 16 maps of squares last walked keep their meshes
    (their WebAssembly memory freed past that). Recast loads with the rules: `navigation.js` waits
    for it at the top level, and the loader's manifest lists its files (a "navigation" group).
  - **Movement** (§5): positions are floats; `path` is the corners of the way, to the centimetre.
    Bodies are circles (`BODY` 0.3 m); square occupancy and `to` are gone. Steering, all in the
    rules' exact maths: straight for the next corner; round anyone in the way by turning 30°,
    60°, 90° or 120° (away first), where the body clears every blocked square; on for the next
    corner from near a shared one; waiting, then stopping (in reach, or at a goal someone stands
    on) or finding the way again; and, getting no nearer for 1.5 s, squeezing past others for 2 s.
    That last one is the answer to two folk meeting in a passage a body and a half wide, which
    deadlocked or circled without it. Melee closes to 1.2 m before striking.
  - **Kept, a change from §5:** the squares stay the world's grid for everything but walking:
    placing (`nearestFree`), sight and reach, talk, links, goals. Orders still name squares (the
    way goes to the square's middle, or to the very spot of someone being chased or followed);
    taps as floats can come with M5's motion packets, which carry centimetres anyway. Sight
    against terrain (hills hiding things) is left to M3/M4 with the occluder index.
  - **Multiplayer** (§6): `["v", time, id, way]` recorded just after the op that found it; a
    joined copy takes the host's ways (`Host.replaying`) and finds none of its own (tested: the
    navmesh's `path` isn't called by a copy at all). Nothing else in the rules asks the meshes
    anything, so a copy needs none. NET_VERSION 7.
  - **Saves:** the snapshot's actors carry their corners. A save from before (square paths, a
    `to`) is read, its walkers stood still to find their ways again: no version bump.
  - **Retired:** `pathfinding.js` (grid A* and `lineAhead`) and its test. "Ahead" is a raycast
    along the mesh. The world-generation tests that checked reachability with A* now check it
    on the meshes (`test/helpers.js reachable`): every interior's every square still reachable.
  - **Found in testing, and fixed:**
    - Doors whose square's middle lies in the overworld mesh's margin (0.5 m, and Recast's edge
      simplification up to 0.65 m): the way ended a square short and the walker never went in.
      A walker is now *at* a square once its way ends next to it (`#at`): doors, patrol points,
      the folk's stops. Tested: from the start through every door near it.
    - Two folk meeting in the taproom's passages deadlocked, then circled the same corner: the
      wider turns, the corner slack and squeezing past, above.
    - Making sure of a ring of tiles round every way cost 3.5 s in a world's first second (29
      tiles, mostly making the world's chunks under them for soldiers' rounds 60 m long); main's
      grid A* took 1.3 s for the same. Tiles 4 m round the way first, then a ring, then three
      (across a long way), up to 100 tiles, as a way falls short: 1.4 s, and a 250 m walk across
      a river finds the same crossing A* did (208 s walking, A*'s 206 s). Move orders whose way
      was found only part of the way carry on from where it ended, up to 8 times.
    - Baking ahead: the game has tiles within 96 m of each player baked in the worker, a tile
      sent a frame, once the chunks under it are made, so ways near players don't wait.
    - Detour's search raised to 8,192 nodes and 1,024 polygons a way.
  - **Known limit:** a way depends, in principle, on which tiles round it a mesh has (Detour may
    look past the tiles made sure of). Every save-and-restore test carries on exactly, but that's
    measured, not guaranteed, for a world restored alone. Multiplayer never depends on it.
