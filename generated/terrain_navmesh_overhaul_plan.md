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

**As built in M6a** (the far rings; see the change log):
- **Levels, not a height texture** (`world/far/`): each level is a square of 64 by 64 cells (8 m to
  128 m between corners, 512 m to 8 km across), its heights worked out in a worker
  (`far-worker.js`, the newest ask per level only) from `distantHeights` and set into the mesh's
  vertices, the mesh moved to the level's middle. No vertex texture fetch and no whole-world
  texture: a level is about 4,200 samples (about 10 ms on a desktop), and only the finest moves
  often (every 16 m). Three levels on low (1 km), four on medium (2 km), five on high (4 km).
- **Nesting:** each level's middle on the lattice twice its spacing, so its edges lie on the next
  level's lines; every other corner along its edges is put halfway between its neighbours (as
  CDLOD morphs), so they meet without cracks. Rather than rings with holes, each level is whole
  and lifted 1,000 m inside the next level in (a vertex-shader test against that level's square),
  and all of them within 112 m of the player: lifted, so it and the walls left round it face away
  from the camera and are culled (sunk, they faced it and were all shaded, then drawn over).
- **Two passes:** the far scene (the sky's dome and the far land, its own sun and the same
  environment and haze) drawn with a camera from 40 m to 1.5 times the far land's reach; then the
  near scene over it, depth cleared, with the near camera at 160 m (not 300: past 160 m the near
  world's trees and buildings would cost too much). Its background colour is lifted for that pass:
  three.js clears for a scene's background colour whatever `autoClear` says.
- **The seam:** what stands up near the player fades out (dithered: interleaved gradient noise)
  from 128 to 154 m in front of the camera, in three.js's fog chunk (`world/fog.js`), all but the
  ground (`NO_NEAR_FADE`); the chunks' ground turns from 100 to 150 m to `farGround`, the same
  colour function the far land uses (each tiling texture its average colour: a 5 m grass tile
  seen a kilometre off was a regular pattern), so no seam shows between them.
- **The haze:** three.js's linear fog, when it reaches past 400 m, is exponential instead
  (1 − e^(−3(d − near)/(far − near)): 95 % at its far distance), from 20 m to the far land's
  edge; nearer fogs (indoors, the labs) are as they were. Indoors and out keep the same fog type,
  so going in and out compiles nothing.
- **Not yet:** far rivers (the far land has the lakes and the sea; rivers end where the near
  world's drawn), far trees, silhouettes, height fog in bands, the region look and grade, cascaded
  shadows: M6b and M6c.

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
  | `cs` (cell size) | 0.25 (0.5 until the 2026-10-05 rework below) |
  | `ch` (cell height) | 0.125 (0.25) |
  | `walkableSlopeAngle` | 38 (by the ground triangles' areas) |
  | `walkableClimb` | 0.75 m (6 voxels) |
  | `walkableHeight` | 2 m (16 voxels) |
  | `walkableRadius` | 0.25 m (1 voxel; BODY is 0.3 m; it was 0.5 m, a half-metre voxel) |
  | `tileSize` | 128 voxels |
  | `borderSize` | walkableRadius + 3 voxels (1 m) |
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

NET_VERSION goes to 7 with M2b, to 8 with M3b, to 9 with M4a, to 10 with M4b and to 11 with M4c (the ground changed each time), and to 12 with M5. The relay is unchanged: text frames. Motion packets
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

**As built in M5** (see the change log):
- **Motion** (`core/motion.js`): packed as planned, 16 bytes a character, those within 160 m of
  any player on their map, the nearest 64. The flags byte holds moving, running, fighting and
  dead, and the corners left on the way (0–15) where the plan had a "via index". Velocity is the
  pace (times any slowing affliction) along the facing, by exact sines and cosines. Sent every 4
  of the host's steps, after that sending's ops; base64 by hand (`core/wire.js`, moved there from
  `explored.js`).
- **Compared** where the host packed it: the joiner queues it as an `["m", step, units]` op behind
  what came before, so its copy's at the same step when it's compared (and a different step is
  itself astray). Rounded centimetres more than 1 apart, or a missing index, send `again` at once.
  `Joining` counts `motionChecks`, `checks` and `desyncs`.
- **Tick sync** (`Joining.pace`, `PLAYOUT`): ops carry `step` (the host's `battle.time / 50`). The
  delay is 2 + round(2 × jitter / 50 ms), from 2 to 6, the jitter as RFC 3550 has it (sendings'
  lateness against each other, by the steps between; a sending a second late counts as a second;
  none counted over a pause or a resync). The game's accumulator runs at 0.9–1.1 times, by how
  many steps it's had in hand over the last second against the delay; the catch-up starts 6 steps
  past the delay. Ops still come every 0.1 s, so 2 is the floor.
- **RTT:** a `ping {t}` from the joiner once a second, which the host answers at once with
  `pong {t, step}`; smoothed by eighths. The joiner's clock is injected (`clock`), so core stays
  pure.
- **Prediction** (`app/predict.js`): a move tap (or a swipe straight ahead) is drawn setting off at
  once, straight for the tapped square's middle (at a walk, or speeding up from one as the battle
  has a runner do: `ACCELERATION`, now exported), until the command comes back
  done; then drawn ahead along the copy's way by that lag (600 ms at most) until the hero stops.
  Every switch, and any jump in a frame further than the hero could go, is closed over 150 ms; a
  gap over 3 m is shown at once. The copy is never touched. No local path is found: a joined game
  has no navigation meshes, and the straight line lasts only the lag.
- **Bytes:** `Hosting.sent` and `Joining.received` count text by kind. In Node, seed 2's start
  town sends one joiner about 1.2 KB/s of motion and 0.5 KB/s of ops.
- **Not built:** smoothing others' movement with the stream while catching up after a pause (use
  3): catching up takes at most 40 steps a frame, and others are drawn interpolated between steps.

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

**As built in M3a** (see the change log):
- Rivers are curves through the cells' middles, drawn as four pieces a cell. Each cell's stretch
  is calm, rapids, or steps (pools spilling over lips where the land drops). Speeds come from
  Manning's equation. Fords sit on small calm rivers.
- Wading: water up to 0.5 m deep where depth × speed < 0.6 (the flood-safety limit), for both
  squares and navigation.
- The field is RGBA8 at 1 texel/m: shore, flow east and south, depth. It's worked out on the
  page, a few rows a step.
- The shader: two-phase flow-mapped ripples (a finer pair on medium and up), Beer–Lambert by
  analytic depth, and Schlick Fresnel. The bed is kept by its red light and the rest of its
  colours added as it would look, so there's no extra pass.
- Not yet: waterfall sheets and mist, mountain streams (the plan's rivers start at 150 cells of
  rain, so few run in the mountains), and the bed's own underwater look and wet banks. Those are
  M3b.

**As built in M3b** (see the change log):
- Mountain streams: every dry cell at half the plan's height or more with 20 cells of rain starts
  one, running on the way its water goes until it meets a river, a lake or the sea (about 1,100
  cells). Streams share the rivers' courses, reaches and steps. They're 0.6–1.4 m in half-width
  and 0.3 m + 0.12 m a metre of half-width deep, with no fords, and are stepped across wherever
  they're shallow enough, however fast they run. A river is waded only where it can be waded
  across, not along the shallows at a deep one's banks. Falls (lips of 0.6 m or more) go from
  325 to about 2,190: 338 on rivers, 1,850 on streams.
- Steps sit in the land: each pool is held under the land all along its piece (not just at its
  start), a cell can drop at its very start (over a lip the cell above it ends with), and a river
  running into a lake or the sea comes down to its level at the shore. Pools standing a metre
  or more above the land beside them fall from 13% of step samples to under 1%.
- Waterfalls: a ballistic sheet (7 × 8 points) from each lip of 0.6 m or more, with streaks
  running down it. It's placed through the wandering's inverse (`placeOf`), and a tributary's
  lip is moved back to the bank it falls over. Below lips of 1.5 m or more, eight billboard mist
  puffs (medium and up). The water's own mesh leaves out its sheer steps (`SHEER`).
- The water's surface out of a river's channel is a lake's or the sea's wherever that can
  stand, so still water beside a river higher up is never drawn at the river's height.
- The bed: banks eased cubically; ground wet and darker under the water and up its banks; no
  rock at the water but where it's all but sheer; caustics (a Voronoi-edge texture read twice, the
  minimum kept, wobbled) on medium and up.
- Cost: frame times with a fall in view match M3a's within noise (up to 12 more draw calls where
  falls are in view); chunk making is unchanged (11.4 ms median against 12.2).

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

**As built in M4a** (see the change log):
- **Grading** (`terrain/ground.js graded`): each road's profile (the land every 2 m, on the
  settlements' pads, smoothed 12 m each way) is kept to its kind's `GRADE` (trade 10 %, road
  12 %, track 15 %, path 25 %) by symmetric relaxation: each step too steep is eased from both
  ends at once, so cut and fill balance, with the ends pinned to the land. Banks ease out over
  `ROAD.batter` (2.5) times the cut or fill, 3 to 12 m.
- **Hairpins** (`terrain/ways.js wayOver`): A* over a 4 m lattice, 16 directions, a step over
  the grade costing 12 times its excess, none over 3 times the grade, a little for turning, none
  into still water. Roads use it where a plan cell steps 6 times the grade or more
  (`overworld.js climbing`); Chaikin-rounded twice.
- **Mountain paths** (`core/trails.js`): from the roads to each cave, ruin, shrine, ring of
  standing stones, ruined castle and lair at plan height 0.5 and up, within 700 m of a road;
  chained (each from its road or a site reached already, nearest first); found within 96 m of the
  straight way, keeping out of the town and settlements. Found when a chunk their room reaches
  is first wanted, or ahead in the terrain worker and handed over.
- **Bridges** carry the road on dry land at both ends (a road stopping at a settlement goes on to
  the bank); piers stand on the levelled ground.
- **Not yet:** mountain passes as the only way over the massifs (the plan's roads already go
  round them); castles' switchback approaches and the lizard folk's lagoons at a real depth (M7).

**As built in M4b** (see the change log):
- **Camps on flats** (`terrain/flats.js flatSpot`, `Overworld.campAt`): the flattest point of an
  8 m lattice within 96 m of the camp's cell middle (least range of the land's own height over
  the 5 by 5 points 16 m each way), dry, off the plan's road cells; nearest of those as flat.
  Used for its pad, its clearing, and where its folk are out (host.js).
- **Sites by their lie** (`sites.js LIE`): castles, the spire, the starwatch, pride rock and the
  watchtowers on the highest ground within 64 m (spots 16 m apart scored by how far they stand
  over the land 24 m past their reach, none whose land varies more than 6 m across them); the
  watering hole, serpent pool and moonwell on the lowest. Their pads are raised (2 to 5 m) or
  sunk (0.8 to 1.5 m) by `raise`, eased in as every pad is.
- **Not yet:** castles on real crags (the plan sets castles on lowland cells near roads, where
  the best rise within 64 m is 2 m or so; the mound makes the rest); cliffs and rock meshes
  (with §9's rocks in M7).

**As built in M4c** (see the change log):
- **Settlements lying with the land** (`terrain/ground.js`): the town's and every settlement's
  pad (`tilt`) is the least-squares plane over the land on the 5 by 5 grid its level is from, no
  steeper than `PAD_TILT` (8 %); the lizard folk's stay level for their lagoons. Its ease ring
  eases from the plane's height at the nearest point of the pad.
- **Pads and roads:** on a pad, its own height; off them, the roads over the land as the pads
  have eased it (a road's surface is its graded profile, which already has the settlements'
  pads in it, so it isn't eased a second time).
- **Foundations** (`world/town3d.js grounded`): what's built where the ground rises or falls
  0.3 m or more across it stands at its highest corner on a foundation of its people's stone
  (the cat folk's mud brick) down 0.3 m past its lowest, under all of it but its eaves; built
  into the piece before it's placed, so merged into the atlas with it.
- **Not tiers:** half the settlements tilt 1.5 % or less and only nine are held to 8 %, so
  terraces and retaining walls with stairs aren't needed at these grades (and a step over the
  navigation mesh's 0.5 m climb would want its own stairs).

**The peoples' places.**
- Lizard folk stilt houses stand over real water depths.
- Elves' tree halls sit on raised roots; dark elves' spires on crags.
- Orc camps on mesas and in badlands.
- The cat folk's pride rock is a real outcrop; their watering hole is a real depression.

**Wild features and camps.** Placed by slope and height rules (boulder fields below cliffs, camps on
flats), and pushed into the Elden Ring direction of [§9](#9-environment-art-direction-a-lower-fidelity-elden-ring).

**Cliffs and rock.** Rock meshes where the slope is over 45°: strata bands and overhang stamps.

---


### Places worth finding (M7.5)

The user, wandering between two human towns: "I ran across a castle that I couldn't enter. It
didn't show up on the minimap and looked like it was just there as a point of interest... rework
these points of interest to make them actually interesting." It comes after M7 and before M8's
characters. What the user decided (2026-10-03):

- **On the minimap**, all of them: the peoples' castles, manors, abbeys and the rest of their own
  places out in their lands (sites.js), watchtowers and camps, and the sites no people keeps
  (ruins, ruined castles, caves, shrines, circles of standing stones, the dragon's lair).
- **Entered and explored** if they're of any size: castles and forts (through the gate, a
  courtyard, the keep's halls and rooms), manors and abbeys, watchtowers (a few floors to climb),
  caves (passages and chambers) and the dragon's lair (its hoard).
- **Who holds them: mixed by the war**, a world at a time: places outside the towns start held
  by friendlies or by bandits; ruins by the dead.
  - **Friendlies:** a people's castle has a weapons-and-armour shop, a potions-and-arcane shop
    and a blacksmith; the other places a smaller shop fitting the place (an abbey's arcane goods,
    a watchtower's weapons and armour, and so on).
  - **Bandits:** a rogue band, as many and as strong as the place is big and its land dangerous
    (as the wilds go: you can stumble on one too strong for you yet), and a leader stronger than
    the rest guarding a chest of better loot in the heart of it.
  - **The dead:** ghosts, wraiths and the restless dead of whoever lived in the ruins long ago, a
    greater one guarding an old relic and a chest.
  - **Missions:** each place held by bandits or the dead is a mission at the adventurers' guilds
    (`core/spoils.js` contracts): clear the occupiers and kill their leader.
- **After it's cleared:** empty a few days of the world's clock, then a new band moves in (or
  the dead rise again), with a fresh chest: you can come back for more.

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
- **Ruins where no one lives**: roofless churches, broken towers, collapsed arcades, rubble,
  graves. Unlike the Lands Between, Pellagos is lived in: the peoples' cities and the lands
  round them are kept up and lively (see "Where the ruins are" below).
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

**As built in M6b** (row 1, the atmosphere; see the change log):
- **The region look** (`world/look.js` `LOOKS`): for each of the plan's 17 lands, the sky
  overhead and at the horizon (the haze's colour), the sun's colour and strength, the mist and
  the grade. Blended over the lands within 80 m of the player (a tent each way over the plan's
  cells, so it's continuous as they walk) and eased over 1.5 s; set into the view each frame
  outdoors (`View.setLook`), without allocating.
- **Height fog, not bands:** rather than four fixed value bands, two layers that together give
  them: the exponential distance haze of M6a (near dark, far pale), and an exponential height
  mist (`fog.js` `MIST`: thickness at its floor, the floor a few metres over the mean ground
  within 80 m (so valleys fill wherever the land lies), scale height) whose amount along each line
  of sight is the analytic integral from the eye's height to the point's (Quílez's height fog),
  so valleys are hazy and peaks crisp. One extra varying (the point's height above the eye) and a
  few sums a pixel; no extra pass.
- **The grade** in `CustomToneMapping`: ACES, then a tint and saturation (`fog.js` `GRADE`). No
  extra pass. three.js mixes the fog after tone mapping, so the far land and the sky (the look's
  own colours) aren't graded twice, and the horizon still meets the sky without a seam.
- **Shared uniforms:** the mist's and the grade's values are plain objects put into every
  `ShaderLib` entry (and `UniformsLib.fog`) before anything compiles; three.js's uniform cloning
  keeps a plain object's value by reference, so one write reaches every material. Indoors both
  are zeroed; the e2e's "going in and out compiles nothing" still holds.
- **The terrain material** (`ground.js` `ALPINE`): rock creeping onto gentler slopes from 130 to
  220 m, snow on what isn't steep from 205 to 245 m (both lines wandering 30 m with the patches),
  never on ash; the far land's `farGround` has the same, so snowy peaks read kilometres off.
- **Cascaded shadows: not built.** With the sun about 50° up, the near shadow map (±24 m) covers
  what the camera looks at, and far relief reads from the far land's slope shading and snow.
  Each cascade draws every shadow caster in it again, on phones already near their draw-call
  budget. Left for M7's lighting pass, to be measured there. **Measured in M7k (2026-10-03): it
  doesn't fit.** A second cascade out to 60 m would draw 28 to 51 more draws and 76,000 to 443,000
  more triangles a frame on Medium (22 spots on the phone's profile), with frames at 9 of the 22
  spots already over 500,000 triangles; see the change log.

**As built in M6c** (row 2 and the landmark; see the change log):
- **The landmark is the volcano.** It needed a crater: the old one (60 m subtracted at the
  middle) was shallower than the cone's own slope, so seed 1's volcano was a peak. Now
  (`height.js` `CRATER`, `craterOf`) the crater is cut 45 m down from the cone's average height
  round a 60 m radius, flat across its middle, meeting the cone exactly at its edge.
  `TERRAIN_VERSION` 9, `NET_VERSION` 13.
- **Its fire and smoke** (`world/far/volcano.js`): a lava lake and lit walls in one mesh, a glow
  and 28 smoke puffs as camera-facing quads moved in the vertex shader (no per-frame uploads)
  in another; drawn twice (far scene, and near scene for what's nearer than 158 m), sharing
  geometry; under 1,000 triangles.
- **Silhouettes** (`shapes.js`, `gather.js`, `silhouettes.js`, `silhouette-worker.js`): not proxy
  boxes per layout from the layout code, as first planned, but the real layouts
  (`layoutTown`, the same as the near world builds), each piece a box with its people's roof, a
  column and cone, or a long box; the peoples' great places as their few masses. One merged mesh,
  worked out in a worker nearest first (layouts kept), sent every half second while it works.
  How far each kind's seen and when only the big buildings are: `SILHOUETTES`.
- **The hand-over:** drawn in both scenes with the same material; `FAR_FADE_IN` in the fog chunk
  discards exactly the pixels the near world's fade keeps, so the real building and its
  silhouette cross-fade from 128 to 154 m.
- **Not in M6c (moved to M6d):** far trees and far rivers.

**As built in M6d** (row 8's far trees, and the rivers; see the change log):
- **Far trees** (`world/far/trees.js`): where the overworld would plant them (its `#plant` replayed:
  the same per-chunk random numbers, the same kinds and homeland trees), from 100 m out to 700 m
  on medium and 1.2 km on high, none on low (`QUALITY.farTrees`). Each a camera-facing card, its
  crown's outline drawn in the fragment shader by its kind's form; one draw of one plain mesh
  (not instanced: the software renderer draws instances almost one at a time); two triangles a
  tree. A test checks every tree the overworld plants in sample chunks is among them.
- **Far rivers** (`world/far/rivers.js`): each river's course pieces as ribbons on its surface,
  widened to 4 m at least; one draw. Streams left out.
- **Handing over:** both use `FAR_FADE_IN`, as the silhouettes do; drawn a little towards the eye.

**Where the ruins are** (the user's direction, 2026-10-01). The ruin and decay of the Elden Ring
look belong to the sites no people keeps and the points of interest in the wild: the ruins of old
halls, ruined castles, caves and catacombs, shrines, standing stones, the dragon's lair, broken
watchtowers. The six peoples' cities, castles, villages and farmsteads, and the land round them,
are lived in by thriving peoples: kept in good repair, and lively. A city may have a dilapidated,
dangerous part (a run-down quarter, later), but the world isn't a ruin.

**How the peoples' villages look** (the user's direction, 2026-10-02, from five reference pictures
of "good looking medieval villages": "I'd aim for the stylized ones", then, to be clear: "I meant
slightly stylized leaning towards realistic"). Mostly realistic, a little stylised:
- **Realistic:** real materials at their real sizes and proportions (stone, timber, plaster,
  thatch, shingle and tile), lit, shadowed and weathered as the rest of the world is.
- **A little stylised:** some of the chosen pictures' warmth: colour a touch richer than life,
  features a touch emphasised (deep thatch eaves, sturdy chimneys, a lean or a sag here and
  there), shapes clean enough to read from a distance.
- **Not** cartoonish or toy-like: no oversized proportions, candy colours or rubbery forms.
What the chosen pictures share, for M7c:
- **Houses:** a stone ground storey (rubble or squared, grey-blue) with timber framing and pale or
  tinted plaster above; jettied upper storeys, balconies and galleries, dormers; a round stone
  tower here and there with a conical shingled cap and a weathervane.
- **Roofs:** thick thatch with deep rounded eaves and ragged edges; steep shingle or tile roofs in
  brown, red-brown and orange, slightly irregular, mossy; chimneys with smoke.
- **Green among the houses:** trees between and over them, ivy up walls, gardens and flower beds
  (pink and white), clipped hedges and topiary, kerbed planters round trees.
- **Life and clutter:** barrels, crates and sacks; carts; wattle and post-and-rail fences;
  wooden scaffolds and watchtowers; market stalls and awnings; a fountain or a well in the
  square; folk about.
- **Ground:** worn dirt paths running into cobbled squares, grass at their edges.
- **Round a village:** a timber palisade, golden wheat fields and gardens outside it, woods
  behind.
The ruins and the wild keep the Elden Ring's darker, weathered look (M7b); the villages are where
the warm, lived-in look is.

**The land looking natural** (the user's direction, 2026-10-02: "a look around at all the
environment generation to ensure the ground and elevated terrain generation looks natural and
doesn't contain any obvious polygons or texturing that wouldn't look good in the intended
environment"). Part of M7, as M7d, before the cliffs and rocks build on the land:
- **Looked at, not assumed:** a tour of cameras over several seeds and every land (meadow and
  farmland plains, hills, mountains and their passes, valleys, cliffs, coasts and lakeshores,
  rivers and falls, marsh, savannah and badlands, the volcano's ash, tundra and snow), at a
  walker's eye height, the follow camera's and from high up, at each Visual quality level and
  at golden hour and noon; each picture looked over for what gives the land away as made.
- **Polygons:** facets and straight creases on slopes and ridges (too few vertices for the
  relief, or normals from the mesh rather than the height function); cracks, steps or popping
  where levels of detail and the near and far land meet; spiky or knife-edged peaks; terracing
  from rounding; pads, road cuttings and fills and retaining banks reading as flat planes and
  ramps; anything lined up with the chunk or square grid.
- **Texturing:** stretching down steep faces (cliffs wanting triplanar or slope-aligned
  mapping); a picture's tiling seen from afar; hard, straight or blotchy edges between grass,
  dirt, rock, sand and snow; the snow line and rock-by-height bands too even; colour banding;
  ground that's too bright, too saturated or too uniform beside the Elden Ring's palette; seams
  at chunk edges.
- **Where things meet the land:** rocks, trees and buildings floating or sunk; water's edges,
  banks and beds; paths and roads into the ground round them.
- **Fixed where found,** each with a before/after picture from the same camera, within the
  budgets (a fix that costs, such as triplanar rock, tiered by Visual quality); the tour's
  cameras kept so later work can be checked against them.

**Day and night** (the user, 2026-10-02: "Do we need to plan for a day/night cycle, night sky
features like moon and stars, and things like torches and a spell like "light" that creates a light
globe following the player for 15 minutes or something"; then, chosen: a day of 60 minutes, nights
dark enough to matter, Light from a tome at the guild, and time passed by renting a room at a
tavern or by camping where no enemy's near). The world's sun has stood still at the same height
since M6b, so "lit windows at dusk" above has no dusk to be lit in: they're part of this. M7e,
after M7d (the land looked at by day first) and before the cliffs and rocks:
- **The clock** (core, exact maths): one clock for the world, kept by whoever holds the world (the
  host) and sent to everyone who joins and with every state they're sent, so every player sees the
  same hour; a day 60 minutes of play (dawn about 4, day about 36, dusk about 6, night about 14),
  starting a new world at mid-morning. Paused with the world. Kept in the save with the world.
  (Built in M7e-1 on the war's own clock, which already does all of that: no new state, and no
  `NET_VERSION` change.)
- **The sky:** the sun rising in the east, high at noon, setting in the west; the moon on the
  other side of the sky, with a phase that turns over eight days of play; stars (a few hundred
  points in one draw, twinkling a little, fading out at dawn); the sky's colours, the haze and the
  height mist taking each land's look (M6b's `LOOKS`) through dawn's pinks, the day, dusk's golds
  and reds and night's deep blue; the sun's light warm and low at dusk and dawn, the moon's cold
  and faint at night, the hemisphere's ambient falling with them; the shadows from the sun by day
  and the moon by night, fading through the turn between them.
- **Lights** (cheap first, a few real ones):
  - lit windows: an emissive term in the building atlas (`SHINES` 5, "lit from within": glass and
    shop openings), warm and flickering a little window by window, coming on through dusk in some
    windows first, a few going out late at night; inside the taverns, temples and guilds all night;
  - torches in brackets by doors and gates, braziers at the guards' posts, lanterns on poles in
    the bigger towns' squares, the guards on night watch carrying torches, camps' fires: each an
    emissive flame (flickering in the vertex shader) and a soft additive glow round it, merged with
    its chunk; their light on the ground round them from a small pool of real point lights (4 on
    High, 2 on Medium, none on Low) given to the nearest to the camera, always in the scene so the
    shaders never compile again as they're handed round (as built, M7e-2b: the view's two lamps,
    which the insides' flames already had, on every quality, given to the two nearest the player);
  - the Light spell's globe (below): one of the pool kept for it while it's lit.
- **Night in play:**
  - sight: everyone sees less far at night (the rules' sight range scaled by how much light's
    about: the sky's, and within reach of a torch, a lit window, a fire or a Light globe, the
    day's), so a hero with a torch or Light sees an ambush before it sees them; guards keep their
    posts lit (as built, M7e-3a: `core/light.js`, the host working out what's lit each step, a
    settlement's streets lit as far as 10 m past its edge; the guards with a hand free carrying
    torches at night in place of their shields);
  - the night's own creatures: some of the wild's (the undead, wolves, bats, the wight lord's
    sort) out only after dark, or more of them; some shut in by day (as built, M7e-3b: the
    night's own out only after dark and gone to ground at daybreak, the night's hunters met
    twice as often after dark, two more about each player at night, and those that see in the
    dark seeing as by day);
  - **passing time:** a room at any tavern for a few gold (the barkeep), sleeping to the next dawn
    or dusk; or camping: a fire built where no hostile is within 40 metres (and none comes while
    the camp's made), slept by to dawn or dusk (a stamina and health rest too). In a world shared
    with others, only the host passes the time (everyone's woken with them); a player who isn't
    the host can still rest. (As built, M7e-3c: the innkeeper's or madam's room, or Make camp on
    the player's wheel; woken at the next sunrise or sunset at least five minutes off; the camp's
    tent and fire drawn, its fire lighting the dark three minutes after.)
- **The Light spell:** a tome on every adventurers' guild's shelves (about 10 gold); read, Light is
  known: a globe of light rising from the caster's hand and following a little over their
  shoulder for 15 minutes of play, lighting about 12 metres round them (their sight at night as by
  day within it), shared cooldown, no school to grow; cast again to put it out. (As built,
  M7e-4.)
- **Budgets:** the sky's stars and moon 2 draws; the lights' glows merged with their chunks (no
  draws of their own); the pool's point lights the cost (each lit fragment pays for each one in
  range): measured on the phone profile, the pool cut on Medium and Low if it's over; nothing in
  the rules costs more than a multiply.
- **Pictures:** the same views at dawn, noon, dusk and midnight, before and after; a town at dusk
  with its windows coming on and its torches lit; a road at night with Light.

**The light looked over** (the user, 2026-10-03: "a similar quality pass done to check the land
for consistent shadows and lighting effects based on the location and strength of local light
sources and light sources such as the sun and moon"). M7f, once M7e's done, as M7d was for the
land's shapes: a tour of the land at the times of day (the start town, a village, a castle, the
neutral sites, the woods, the mountains, the coast; dawn, noon, dusk, a full moon's night and a new
moon's), looking for light and shadow that don't agree with where their lights are and how strong:
shadows falling the wrong way or missing (things that cast none, or cast the sun's at night),
what's lit by the sky alone left bright in the dark, glows with no light round them, light from a
torch or window reaching too far or not at all, the far land and the near disagreeing at the
hand-over, interiors' window light at night. Each fixed with a before/after picture from the same
camera, within the budgets.

**Pins on the world map** (the user, 2026-10-03). M7g, after M7f:
- **A pin:** a long press on the world map anywhere the fog of war's lifted drops a pin there (one
  pin: a new one moves it). It's shown on the world map, and in the world as a round column of blue
  light rising very high into the sky, seen from far off (drawn with the far land too, through the
  haze; additive, no shadows, cheap: one draw near and one far).
- **The way there:** a thin, half-transparent, glowing blue line along the ground from the player
  to the column's foot, along the way the player would walk (the navigation meshes': the best way,
  found again as the player moves, a few times a second at most and only when they've moved), if
  there is one; no line if none can be found. The same way drawn on the world map.
- **Taking it away:** on the world map, a way to remove the pin (a button by it, or a long press on
  it); the column and both lines go with it.
- **A double tap on the world map** (the user, 2026-10-03: "The double tap should work the same as
  setting a destination for the player and the player initiating a run to that destination. If a
  path to the double tap cannot be calculated, some sort of feedback like "A path cannot be
  found" should be displayed and no action taken."): the place is the player's destination, run
  to as a double tap there in the world would have them do (the map closes and they set off); if
  no way there can be found, the map says "A path cannot be found" and nothing's done.
- **Saved** with the player's own things (not the world's: each player's pin is their own, not
  shared with the others in the world).

**As built in M7a** (row 4, the neutral sites, and row 6's decay pass for them; see the change
log):
- **Laid out in core** (`core/setpieces/neutral.js` `layoutNeutral`, exact maths): each kind's
  parts, the rectangles of it that stand in the way (only those block: the rest of a site is open
  ground), and its heart (open ground in its middle, where a lair's master stands: `Sites.heartOf`,
  used by `host.js`). Sizes (`NEUTRAL`): standing stones 24 m, a shrine 12 m, a cave 20 by 16, a
  hall's ruins 24 by 20, a ruined castle as big as the humans' own (72 by 64), the dragon's lair
  40 by 36, a broken watchtower 12 m.
  - **Standing stones:** a ring of 7 to 11 whole stones round a flat altar stone, some leaning,
    some fallen.
  - **Shrine:** a stepped plinth, a robed figure, an obelisk or a pair of hands, braziers, a
    curved wall behind.
  - **Cave** (the user: "caves should go down into the ground or into the side of much larger
    hills or mountains"): on a hillside where the land rises 6 to 14 m across it (`HILLSIDE`),
    facing down it, a face of rock with a dolmen doorway (two rough stones leaning in, one across)
    round the black of the way in, a floor dug level in front of it; else a pit sunk 3.2 m into
    the ground, stone-lined, crumbling at its rim, steps down to a doorway (9 of 28 on seed 1).
  - **Ruins:** an old hall's walls broken off along their tops, a door and a breach, column
    stumps (some fallen), heaps of fallen stone.
  - **Ruined castle:** the humans' castle layout (`castle.js`), left to ruin: its houses heaps of
    stone and charred timbers, stores (barrels, crates) and a broken cart by its walls, its
    gate's way through clear.
  - **Dragon's lair:** a hollow dug into a mountainside (the land rising 8 to 26 m across it), a
    great dark doorway in the face at its back, ridges of dark rock coming down either side,
    bones.
  - **Broken watchtower** (one no people keeps): its walls broken off round its top.
- **Lying with the land:** each part a piece of its own, stood where it is and reaching 1.4 m into
  the ground (`art/kits/neutral.js`). They rest (`sites.js` `restingOf`, plan heights only, so
  `trails.js` finds the same) on the flattest ground within 48 m of their plan spot, or a cave or
  the lair on the hillside whose slope is nearest the one it wants (0.55 and 0.4), and mind the
  roads and water but not the foot paths. Levelled only where they must be: a ruined castle's
  courtyard; a cave's or the lair's floor, a disc dug into the hill touching the face's line,
  `cutOf` metres across (as deep at the face as the face is high, level with the hill at its
  front edge), its banks eased over 2.5 m; a pit, sunk 3.2 m, eased over 2.2 m. Each pad says how
  far it's eased (`ease`). The rock of a face cut into a hill is shaped to the hill's heights
  behind it (`part.lie`, taken in core to the centimetre) and goes back under the hill: none
  stands out above it.
- **Reached by their trails at their fronts:** a site a trail goes up to is turned to face the way
  it comes, and the trail ends 2 m before its front (its way in); trails branching from it start
  there. A site cut into a hillside faces down it, its trail ending past its dug floor's banks.
  Trails go round every site's footprint (`avoid`), cross rivers only at fords, and keep out of a
  lake's shallows.
- **The decay pass** (`art/kits/castle.js` `RUINED`, `art/kits/decay.js`; the user: the first
  version "looks really blocky; ruins would seem more crumbled"): the castle's walls, towers,
  gatehouse and keep built as they stood, then only what's left of them made. Broken tops jagged
  at a stone's size (sloping where stones fell one by one, a course's step where a row held, a V
  where a breach fell, lowest where slow noise along the wall says most went); towers' rims the
  same round; the battlements and roofs gone; lumpy heaps of fallen stone at their feet about a
  third as high as what fell, blocks tumbled down them, a stone or two perched on top. Moss on
  what faces up, dark at the foot (`weathered`).
- **What's left of the timber and the stores** (`art/kits/leftovers.js`; the user: "wood beams
  here and there ... broken, weathered wood beams where full roofs used to be or fallen ones, some
  old storage barrels, broken and weathered or otherwise"): joists still across the keep and
  towers, some snapped, a beam fallen; charred posts and fallen beams where the houses stood;
  barrels whole, tipped or burst; crates, some broken open; a cart left on one wheel. Grey,
  weathered or charred.
- **From afar** (`far/shapes.js`): the ruins' walls, the lair's ridges as cones, the broken tower,
  a ruined castle's pieces at their broken heights, laid out as near to; shrines, stones and the
  caves (cut into their hills) not.
- **Ways that meet** (`terrain/ground.js`): where ways' cores or banks overlap (a trail leaving a
  road, two trails, a hairpin's legs), the ground eases between their heights by how near each
  one's middle is, rather than taking the nearest's alone: no more steps (on seed 1, trail
  junctions of 6.3 and 3.7 in 1 before). On seed 1 the worst 2 m of any trail climbs 1.19 in 1
  (where two trails meet below the lair), against 6.34 on main.
- **Not yet:** trails too short for their climb are cut to their grade and may end in a deep
  cutting below their site (seed 1: cave-79's 33 m, ruins-32's 43 m; cave-79's was 28 m on main).
  To be routed longer. (Done 2026-10-02: routed so they never need cutting, and in stone steps
  up mountainsides; see the log.)
- **Budgets** (seed 1, near): a hall's ruins 2.6–3.4k triangles, a ruined castle 12–14k, a cave
  on a hillside about 300 and a cave's pit about 500, a shrine 400–550, standing stones 220–360,
  the lair about 1.8k, the broken watchtower about 430; merged into their chunk's meshes, no
  draws of their own. Far: up to 360 triangles (a ruined castle).

**Pushing each people toward the Elden Ring feel without losing identity.**
- **For everyone:**
  - heavier stone bases (0.6–1.2 m plinths that follow the real ground);
  - retaining walls on pads;
  - signs of life rather than decay: chimney smoke, market awnings, banners, lit windows at
    dusk (with the day and night, M7e, below), gardens, washing lines;
  - ruined versions of the building kinds only for the places no one keeps (and, later, a
    run-down quarter in some great cities);
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
| **M3a** | Rivers and the water shader | River courses as curves; calm, rapids and step-pool reaches; Manning speeds; fords and wading; the water field (shore, flow, depth); flow-mapped, Beer–Lambert, Fresnel shader | Pictures; water cost within budget |
| **M3b** | Falls and the bed | Waterfall sheets and mist at lips; mountain streams; underwater ground (absorption, caustics); wet banks | Pictures; water cost within budget |
| **M4a** | Roads and paths | Roads graded with balanced cut and fill on padded ground; hairpins where a road meets a step too steep to grade; mountain foot paths with switchbacks up to the caves, ruins and shrines in the hills (found ahead in the terrain worker); bridges that carry the whole road; piers on the ground | Pictures; walk every road and path end to end in a test |
| **M4b** | Places on the ground | Camps on flats; castles and high places on rises, on mounds; pools in hollows | Pictures; every camp's pad near its land in a test |
| **M4c** | Settlements on slopes | Settlements lying with the land (tilted pads); foundations under what's built on a slope; roads over pads' eased land | Pictures; pads on their planes in a test |
| **M5** | Multiplayer motion | `motion` stream; early desync checks; hero prediction; tick sync; debug RTT; NET_VERSION 12 | Two-browser e2e with no drift; bandwidth measured |
| **M6a** | The far land | Far clipmap levels in a worker; two passes; exponential haze to the horizon; near objects faded before the near camera's end; the near ground turning to the far land's look | Pictures; budgets per tier met |
| **M6b** | Atmosphere | Height fog (an exponential height mist under the distance haze); per-region look table and grade (§9 row 1); terrain material (rock and snow by height); cascades deferred to M7 | Pictures; budgets per tier met |
| **M6c** | Things on the horizon | Far silhouettes and the world landmark (§9 row 2): the volcano's crater, fire and smoke | Pictures; budgets per tier met |
| **M6d** | Far trees and rivers | Far trees (impostors fading in where the near trees fade out); far rivers on the far land | Pictures; budgets per tier met |
| **M7** | Elden Ring environment pass | In §9's order: the landmark pass in the plan; neutral sites built, with the decay pass; a look round all the generated ground and high land so it looks natural, with no obvious polygons or out-of-place texturing (M7d, §9 *The land looking natural*); day and night, with the moon and stars, lit windows, torches, the Light spell, night in play and passing time (M7e, §9 *Day and night*); the light looked over, consistent with its sources (M7f, §9 *The light looked over*); pins on the world map, with a column of light and the way there (M7g, §9 *Pins on the world map*); cliffs and rocks; churches, citadels, stone bridges; foliage palette, grass ring, weathering; cascaded shadows, measured, if they fit the budget | Pictures after each part; budgets met |
| **M7.5** | Places worth finding | §8 *Places worth finding*: every castle, fort, manor, abbey, watchtower, camp, cave, lair, ruin, shrine and circle of stones on the minimap; those of any size entered and explored; held by friendlies (their shops) or by bandits or the dead (a guild mission, a leader, a chest), retaken a few days after they're cleared | Pictures; walk into each kind in a test; a cleared place retaken in a test |
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
      (across a long way), up to 100 tiles and half what a mesh keeps (a room's mesh keeps 64:
      past that it let go of tiles it was searching and baked them again, without end), as a
      way falls short: 1.4 s, and a 250 m walk across
      a river finds the same crossing A* did (208 s walking, A*'s 206 s). Move orders whose way
      was found only part of the way carry on from where it ended, up to 8 times.
    - Baking ahead: the game has tiles within 96 m of each player baked in the worker, a tile
      sent a frame, once the chunks under it are made, so ways near players don't wait.
    - Detour's search raised to 8,192 nodes and 1,024 polygons a way.
  - **Known limit:** a way depends, in principle, on which tiles round it a mesh has (Detour may
    look past the tiles made sure of). Every save-and-restore test carries on exactly, but that's
    measured, not guaranteed, for a world restored alone. Multiplayer never depends on it.
- **2026-10-01, M3a built** (rivers and the water shader):
  - **Rivers** (`terrain/waters.js`):
    - **Courses.** Each river cell's course is a quadratic curve from halfway along the way in,
      round its middle, to halfway along the way out, drawn as four pieces. A river carries on
      from the cell above it that most water comes from; the others join it at the middle of
      its curve.
    - **Reaches.** Calm under 2% fall, rapids under 8%, steps above that or with 2.5 m or more of
      drop over a cell. Steps are level pools that drop at least 0.6 m where the land under the
      river drops (lips, with plunges below).
    - **Speed** comes from Manning's equation, with n = 0.035 + 0.25 × slope (boulders on steep
      beds) and 0.045 over a ford's gravel. Calm rivers run at about 0.7 m/s, rapids up to
      4.5 m/s. Water speeds up over lips, churns below them, is still at the banks, and slows to
      nothing into a lake or the sea.
    - **Fords:** one in five calm cells of rivers up to 3 m half-width, over the middle half of
      the cell: 1.4 times as wide, 0.35 m deep.
    - **Wading** (`wadeable`): up to 0.5 m deep with depth × speed < 0.6. Wadeable squares are
      open, and their tiles' triangles are fords.
  - **Found in testing, and fixed** (all older than M3):
    - **River beds were carved inside out.** `across` was the distance from the middle line, not
      from the bank, so beds were deepest at their banks with a ridge down the middle. They're
      now a parabola, deepest in the middle.
    - **Rivers could run up.** Surfaces were lowered in order of height, so a cell lowered after
      the one below it could end up under it. They're now lowered upstream first, in order of
      how much water runs through each.
    - **Lakes stood at two levels.** A river lowered only the lake cell it ran into, leaving a
      0.9 m step in the water. Each lake now stands at one level, its lowest cell's. Rivers
      never lower the sea, and never fall below it.
    - **Banks rose out of lakes.** A river's banks were raised into ridges and land strips inside
      the lake it ran into. Banks now only lower the ground where still water stands.
  - **Drawing** (`world/water.js`, `chunks3d.js`):
    - **The field:** the R8 shore field became RGBA8 with shore, flow east, flow south and depth.
      It's worked out six rows a step (about 3.5 ms a water chunk on a desktop, 23 ms at most).
    - **The shader:** two-phase flow-mapped ripples (cycle 1.6 s, phase set off by place), with a
      finer pair on medium and up (`QUALITY.water`). Foam along the shore and above about
      2.2 m/s. Absorption per metre (0.85, 0.4, 0.5) over the view's way through the water.
      Schlick Fresnel. Premultiplied output: the bed behind is kept by how much red comes
      through, and its green and blue are added from the light on the water.
    - **Shadows on water** first looked lighter than the water round them: with one alpha, the
      bed came through untinted and grey. The per-colour bed fixed it.
    - **Cost:** frame times with a river filling the view are the same as main's at every
      quality (2 to 4 ms in software rendering, within noise), with the same draw calls.
  - **Tests:** river courses join on, turn gently and run down; all three reaches; level pools
    and lips; speeds; fords wadeable; no banks raised out of lakes; the field's bytes; wading a
    ford with the navigation mesh, but not the deep water beside it. The navigation test's
    hard-coded deep point moved with the river.
- **2026-10-01, M3b built** (falls and the bed):
  - **Mountain streams** (`terrain/waters.js` `running`, `STREAMS`): each dry cell at half the
    plan's height or more with 20 cells of rain starts one, followed downhill (to the
    neighbour more rain runs through) to a river, lake or sea: about 1,100 cells. They share the
    rivers' courses, reaches and steps, and are 0.6–1.4 m in half-width and about 0.4 m deep,
    with no fords. Falls (lips of 0.6 m or more) go from 325 to about 2,190, most of them on
    streams in the mountains; 1,050 of them 1.5 m or more.
  - **Wading** (`overworld.js` `wades`): a stream is stepped across wherever it's shallow
    enough, however fast it runs. A river is waded only where its middle can be waded too (a
    ford). Without that, the gentler cubic banks made the shallows along every deep river's
    edges open (thousands of squares round the town).
  - **Falls** (`world/falls.js`): a ballistic sheet from each lip of 0.6 m or more, and billboard
    mist below lips of 1.5 m or more (medium and up). Lips are placed through the inverse of the
    wandering (`placeOf`, by fixed-point iteration). A tributary's course ends in the middle of
    the river it joins, so its lip is moved back, by halving, to where its own water ends at
    that river's bank. The water mesh leaves out triangles that step 0.6 m or more
    (`water.js SHEER`), so no teal wall shows beside a sheet.
  - **Found in testing, and fixed:**
    - **Pools stood out over the land.** A step pool was held under the land at its piece's start
      only, so on a steep slope it ran on as a raised channel up to 6 m above the land beside it,
      water floating over grass. Pools are now held under the lowest land along their piece
      (sampled five times, where it lies in the world), and a cell can drop at its very start:
      its first level (`#first`) is worked out from its shape alone (`#shape`, made once), and
      the cell above ends with a lip down onto it. 543 such drops; perched samples fall from
      1,141 to 47 on streams.
    - **Falls out at sea.** A course running into a lake or the sea goes on to its cell's middle,
      so its last lip could stand out in the water. Its corners in still water (`setLandOf`'s
      new `still`, from the land with lakes and the sea carved but no river) come down to its
      level, and a pool's lip is at the last corner before it: 49 lips out in still water fall to
      2, both at the shore.
    - **Lakes and the sea drawn at a river's height.** `surfaceAt` took the nearest river's surface
      within 24 m before any still water's (the light-blue patch seen in M3a). Out of a river's
      channel it's now the still water's wherever that can stand (`stillLevelAt`).
    - **Ridges under still water.** A river's bed was carved at its own depth even out in a lake
      or the sea, leaving a raised, pale ridge across its floor. In still water a bed only lowers
      the ground, as its banks already did.
  - **The bed** (`world/ground.js`, reading the water's field): banks eased cubically (no grey
    sawtooth of rock at banks); wet ground darker under the water and 1.2 m up its banks; no
    rock at the water but where it's all but sheer (the rock behind a fall); caustics on medium
    and up.
  - **Cost:** frame times with a fall in view are within noise of M3a's at every quality (2.9 to
    5.1 ms against 3.2 to 5.5 in software rendering), with up to 12 more draw calls there; chunk
    making is unchanged (11.4 ms median against 12.2).
  - **Versions:** `TERRAIN_VERSION` 5, `NET_VERSION` 8 (where anyone can walk has changed).
  - **Tests:** streams (counts, on dry land, running on, narrow, shallow, no fords, steps and
    lips); stepping across a fast stream with the navigation mesh. The height test allows
    streams' narrower half-widths; the steps test allows a lip at the end of any reach, where
    the next cell starts with a drop, and checks it lands on that start and plunges as far.
- **2026-10-01, M4a built** (roads and paths; the M4 row split into M4a and M4b):
  - **Grading** (`terrain/ground.js graded`): profiles sampled on the settlements' pads, smoothed,
    then relaxed symmetrically to `GRADE` with their ends pinned. An envelope-midpoint grade was
    tried first and filled whole valleys ahead of a rise; relaxation cuts as much as it fills.
    Seed 2's worst cut or fill along a road falls from 15.1 m to 4.1 m; within 900 m of seed 1's
    town a road is cut 5.6 m into the land at most and built 3.6 m over it.
  - **Banks** ease out `ROAD.batter` (2.5) times the cut or fill, 3 to 12 m: a 3.6 m embankment
    on fixed 3 m shoulders had a 50° grey side. Where roads overlap, on a road the one it's
    furthest onto wins, beside them the one whose bank it's furthest up, ties by line id.
  - **Seams fixed:** roads were listed only in chunks within half + 1 m of them while their
    shoulders reached half + 3 m, so 11 corners shared by neighbouring chunks disagreed (up to
    0.13 m). Roads are now listed as far as their banks reach, and trails are found for every
    chunk their banks reach (`MARGIN`); a test walks the corners shared over the trails near
    the town.
  - **Hairpins** (`terrain/ways.js`, `overworld.js climbing`): none needed on seeds 1 and 3; three
    tracks on seed 2. Each stretch is found from its northern end whichever way the road runs,
    after two tracks sharing one (one up, one down) were found braiding side by side.
  - **Trails** (`core/trails.js`): 27 on seed 1, each found in 5 to 150 ms. Two trails running
    side by side to neighbouring caves led to chaining (each from its road or a site reached
    already). A trail's corners differed by 1.95 m depending on chunk order where it met a road
    end to end, fixed by line ids and pinned profile ends. Trails average up to 1.3 times their
    grade, and 45 % for a step or two where a hairpin's legs meet.
  - **In the browser:** walking from the town to the trails south-west of it, all three trails
    wanted were found in the terrain worker and handed over, none on the page.
  - **Bridges:** a road stopping at a settlement's edge inside a river left its bridge to the
    joined street, which has none (a blocked square at 3004, 4476); planned roads now stop on dry
    land. Piers stand on the levelled ground.
  - **Cost:** `buildWorld` 134 ms against 145 (the nearest road to each site compared by squared
    distance within bounds: 100 ms otherwise); chunk making with trails found ahead, 12.0 ms
    median against 11.2 to 12.2 on main.
  - **Versions:** `TERRAIN_VERSION` 6, `NET_VERSION` 9.
  - **Tests:** `graded`; a trail in hairpins within its room, out of still water; the same way
    found again; a trail laid the same whichever chunks come first and walked end to end; two
    roads sharing a climb; every road and trail within 640 m of the town walked at its grade;
    neighbouring chunks' shared corners.
  - **Left for M4b:** about 70 squares within 14 m of the roads near the town are cliffs where the
    land had none, as on main (pads' edges, not the roads' banks).
- **2026-10-01, M4b built** (places on the ground; the M4b row split into M4b and M4c):
  - **Camps:** on seed 1 the worst camp pad stood 35.3 m out of the land at its edge (five over
    20 m, seven over 12 m), where a camp's cell middle fell on a mountain's side. Pitched on the
    flattest ground within 96 m (48 m left one at 12.3 m), the worst is 5.3 m and the median
    0.8 m. A camp's spot is found once, when the world near it is first made (about 5 ms).
  - **Sites:** within 48 m of their cells the best rise was 0 to 2.7 m; looking 128 m round gained
    only 1 to 3.5 m and moved castles 100 m from their roads at about 30 ms a site, so the search
    stays at 64 m and the mound does the rest. Setting down every site that cares how it lies
    takes 323 ms in all on seed 1, against 384 before (high spots are clear sooner).
  - **Pictures:** the camp gouged into a rock slope gone; a camp's folk on a flat ledge where
    its pad's edge had stood as a spike; the orcs' castle on its mound above the road; the
    dark elves' spire on its rise.
  - **Versions:** `TERRAIN_VERSION` 7, `NET_VERSION` 10.
  - **Tests** (`test/flats.test.js`): every camp's pad within 6 m of its land, the same spot
    whenever asked; the flattest spot found on a slope, and a flat one kept; each high site's
    ground raised (and each low one's sunk) as far as it asks, and what's built on it.
  - **Left for M4c:** the 77 squares within 14 m of the roads near the town that are cliffs where
    the land had none are unchanged: 52 are at settlements' pads' edges (41 at one village, 8 at
    the town, 3 at a farmstead), which tiers and retaining walls are for.
- **2026-10-01, M4c built** (settlements on slopes; the plan's tiers and retaining walls dropped
  for tilted pads, as seed 1's settlements tilt gently):
  - **Tilted pads:** pads 6 m or more from their land at their edge fall from 11 to 1, and 4 m
    or more from 29 to 7; the median tilt is 1.5 %, and nine settlements are held to 8 %.
  - **Cliffs beside the roads near the town** where the land had none: 77 to 37 (one village's
    41 to 8, the town's 8 to 1). Most of the rest (25) are bridge approaches, a road's raised
    bank meeting the river channel, which is never levelled: read as abutments.
  - **Found in testing, and fixed:** pads were eased in after the roads, so a road's surface was
    eased twice where it passed a settlement (its profile has the pads in already): a track came
    out at 17.6 % against its 15 %. Roads now go over the pads' eased land, and a pad's own
    ground is the pad's.
  - **Pictures:** an elves' and a cat folk's village on 8 % slopes, the rock cliffs that edged
    their flat pads gone, their buildings on foundations of their own (pale stone, mud brick).
  - **Versions:** `TERRAIN_VERSION` 8, `NET_VERSION` 11.
  - **Tests:** the town and the settlements near it lie on their planes, no steeper than 8 %
    (where it was "the town is level").
- **2026-10-01, M5 built** (multiplayer motion):
  - **Early desync checks:** a copy two centimetres off the host is found at the next motion
    packet (within 4 steps) and set right, where the checksum takes up to 100; half a centimetre
    (within rounding) never sets one off. 60 rounds of both players walking and running in seed
    2's town: 60 motion checks, none astray.
  - **Tick sync:** simulated over two minutes of sendings 60 ms late plus up to 150 ms more, the
    copy stopped for want of a step in 0.11 % of frames playing them as they came, and 0 % with
    steps kept in hand (0.00 % against 1.29 % with no lateness at all, where frames fell just
    before each sending); up to 300 ms more, 2.08 % against 0.01 %. It costs 50–100 ms more
    behind the host.
  - **Prediction:** a joined player's hero sets off the frame they tap, never moves more than a
    frame's walk and a hair between frames, and arrives with the copy; when the host sends them
    nowhere, the gap closes within 150 ms.
  - **Bandwidth** (two-browser e2e): measured and annotated, held under 10 KB/s to one joiner.
  - **Versions:** `NET_VERSION` 12 (`TERRAIN_VERSION` unchanged).
  - **Found by the two-browser e2e:** a joined copy capped each frame's time at a tenth of a
    second, as playing alone does, so at 2 frames a second it fell 0.4 s further behind the host
    every second and its commands were answered seconds late. A joined copy now plays the real
    time since its last frame (up to a second: `JOINED_FRAME` in app/game.js).
  - **Tests:** `test/motion.test.js` (packing, the nearest first, the cap and reach, comparing,
    base64 both ways); in `test/netplay.test.js` the long play with motion checks, the 2 cm and
    0.4 cm nudges, steps and RTT on every sending, the delay by jitter and over a pause, and the
    pacing simulation; `test/predict.test.js`; RTT and motion over the real relay in
    `test/together.test.js`; and a two-browser e2e of a minute's walking about with no drift, the
    copy ending just as the host's (time, checksum, everyone's place to the millimetre).
- **2026-10-01, M6a built** (the far land; M6 split into M6a, M6b and M6c):
  - **Seen:** from the start town the volcano 800 m off now stands over the fields, and the
    plains reach to a hazy horizon, where before the fog was all there was by 130 m (pictures
    from the same cameras, before and after).
  - **Costs** (medium, software renderer, same views): 68 → 76, 57 → 61 and 67 → 71 draw
    calls; 203k → 257k, 197k → 233k and 135k → 162k triangles (the far land's 32,768, and more
    of the near world through the thinner haze). Within the 250 draws and 500k triangles of §13.
  - **Found while drawing:** the near scene's background colour cleared the far pass (three.js
    clears for a background colour even with `autoClear` off); the far land's tiling textures
    made a regular pattern a kilometre off; the near ground ended in a seam where the far land
    began. Each fixed (above).
  - **Tests:** `test/far.test.js`: the levels' lattices nest; the land as seen from afar (still
    water at its level and marked, the edges eased, the sea past the world's edge); a level's
    cost; the triangle budget per tier, the levels moved as the player walks and sunk inside each
    other; the haze's shape. The e2e sky check now looks for the dome in the far scene.
- **2026-10-01, M6b built** (the look of the lands):
  - **Seen:** the darkwood under a violet sky, the savannah's horizon dusty gold, the marshes
    hazier and greyer, the volcano's land red-brown; snow on the peaks over 205 m, rock up the
    mountains' gentler slopes (pictures from the same cameras, before and after).
  - **Found while drawing:** the view's `look` field (the land's look) hid its `look()` method
    (the camera's): the game wouldn't start. Renamed `landLook`. The mist's floor at a fixed
    height missed the marshes, which lie anywhere from 8 to 75 m up on seed 1: it's now a few
    metres over the ground round about.
  - **Tests:** `test/look.test.js`: a look for every land; a land's own deep inside it, never a
    jump walking across lands; easing; the mist as the line of sight's integral, thicker along a
    valley than from the heights; the mist and the grade in every material's uniforms, shared.
- **2026-10-01, M6c built** (the volcano and what's built, seen from afar; far trees and rivers
  moved to M6d):
  - **Seen:** from the start town the volcano 815 m off with its smoke column lit orange at its
    foot; from above, its lava lake glowing in the crater; a capital, a castle, the obsidian
    spire and a dark elves' town as silhouettes 400 to 500 m off, in their people's colours.
  - **Costs** (medium, the browser tests' software renderer, the same views before and after
    M6a to M6c together): 7 to 13 more draw calls and 40,000 to 90,000 more triangles a frame
    outdoors. Two forest views were over the 500,000-triangle budget before M6 already (the
    darkwood 484k and the elves' woods 506k; 574k and 569k after).
  - **Found while drawing:** the far land's coarse ground hid the lava lake from afar; the fire's
    now drawn a little towards the eye, the more the further off.
  - **Versions:** `TERRAIN_VERSION` 9, `NET_VERSION` 13 (the crater).
  - **Tests:** `test/landmark.test.js` (the crater a bowl, flat in the middle, no step at its
    edge, over the land round it; the fire on the floor and the walls, the smoke's puffs, cheap,
    the two copies); `test/silhouettes.test.js` (every face facing out, each people's shapes, every
    settlement in reach laid out, within budget per quality, a site moved to where it's set down,
    one mesh re-asked only as the player goes, the fade-in in the fog chunk).
- **2026-10-01, M6 made cheaper** (found by the browser tests: four long tests ran out of time
  and the two-browser test fell short of its checks, every frame much slower in the software
  renderer than M5's):
  - **Measured** (the start town, the software renderer, a frame's median): low at half the
    pixels 259 ms in M5, 466 ms with M6a to M6c; medium 404 ms and 773 ms. Leaving things out
    one at a time, the far land was nearly all of it: hidden, low fell to 269 ms; the horizon's
    things, the sky's dome and the mist each cost a few per cent.
  - **The far land's colour per corner:** it worked out the ground as seen from afar for every
    pixel it covered (a dozen texture reads, over half the picture); now in the vertex shader, at
    its corners (8 to 32 m apart), blended between: the same colours, the grass's patches a
    little softer a few hundred metres off.
  - **Lifted, not sunk:** each level sunk 1,000 m inside the next level in (and round the player)
    left walls facing the camera that covered the lower half of the picture, all shaded and then
    drawn over by the near ground. Lifted, they and the ground lifted face away and are culled.
  - **After:** low 306 ms, medium about 490 ms; on the browser tests' own settings (high, every
    pixel, shadows) 1,252 ms against M5's 1,171.
- **2026-10-01, M6d built** (far trees and rivers):
  - **Trees:** every tree the land grows past the chunks' own, as a card where the overworld will
    plant it: about 6,000 round the start town on medium (12,000 triangles), 15,000 in the woods;
    worked out in the worker in a fifth to half a second.
  - **Rivers:** about 2,500 triangles to 1 km and 5,300 to 2 km.
  - **Frame time** (the start town, the software renderer, a frame's median): first built as one
    card drawn instanced, the trees took medium from 510 to 647 ms and the browser tests' own
    settings (high) from 1,263 to 1,791 ms; leaving them out, or drawing the same cards as one
    plain mesh, took it back. As one mesh: medium 491 ms, high 1,311 ms (none on low).
  - **Tests:** `test/nature.test.js` (every planted tree among the far ones, each as tall as its
    kind; none in the start town or nearer than 100 m; a river's ribbon along its course on its
    surface; the counts and time per quality; one mesh each, fading in).
- **2026-10-01, M7a built** (the sites no people keeps, and the decay pass for them):
  - **Direction from the user:** ruins only where no one lives; the peoples' cities and their
    lands kept up and lively, with perhaps a run-down quarter in some great cities later. §9
    updated.
  - **Built:** 111 sites on seed 1 (36 ruins, 28 caves, 26 shrines, 14 rings of standing stones, 5
    ruined castles, the dragon's lair, a broken watchtower), each set down where it rests, every
    part built, the hearts open. The lair's dragon and the castles' wight lords stand at their
    hearts.
  - **Ground:** neutral sites lie with the land but for the ruined castles' courtyards and the
    caves' and lair's dug floors and pits (each pad its own ease); ways that meet eased together
    (no steps).
  - **The user's looks, round two:** ruins crumbled rather than blocky (`decay.js`); caves into
    hillsides or down into the ground, not a crag on the ground; old timber, barrels, crates and a
    cart left in the ruined castles (`leftovers.js`).
  - **Trails:** to the sites' fronts (a hillside site's past its dug floor), round the sites, over
    rivers at fords, out of lakes' shallows; on seed 1 one (to a shrine across a lake) is no
    longer found. Found pre-existing: two end in deep cuttings (above, *Not yet*).
  - **Versions:** `TERRAIN_VERSION` 10, `NET_VERSION` 14.
  - **Next (M7b), from the user's reference shots:** "the interesting ground and environment ...
    that kind of variability" matters most: dense tall grass in clumps of varied height and
    colour (golden, green), bushes and undergrowth, flat rock slabs and dark boulders breaking the
    surface, bare dirt and worn paths, flower carpets, puddles, scaled by Visual quality (as the
    Elden Ring's own grass setting goes from dirt patches at Medium to waist-high grass at
    Maximum); then mossy, greener, uneven stone with string courses, pointed arched openings and
    ivy; warm low sun, haze, motes. Researched first (free textures and models, ground cover,
    procedural Gothic ruins).
  - **Tests:** `test/neutral.test.js` (layouts the same each time, within their plots, hearts open;
    the ruined castle's pieces and open gate; every site set down, blocking only what stands, its
    heart open, lying with the land; trail sites facing their trails, the trail ending before the
    front on open ground; the caves and the lair cut into hillsides facing down them, their floors
    dug, or sunk as pits; a face's rock no higher than a metre over the hill behind it; every part
    built within budget; the ruined pieces lower than they stood, each its own way, the same
    again; broken tops within their heights, heaps only where much fell; the leftovers each their
    own, the same again, few triangles; far shapes where the layout puts them);
    `test/trails.test.js` (the trail's grade over the way walked, at most 0.5 since its way
    changed near the top; the ground between a hairpin's legs eased, never a step; the way the
    worker finds, round the sites); `test/setpieces.test.js` (exact maths in `neutral.js`).
- **2026-10-01, M7b-1 built** (tall grass: steps 1 and 4 of the research report behind M7b,
  "Elden Ring ground and ruins", shared in the session):
  - **Why:** the user's reference shots (a golden grassland, Elden Ring's own grass settings) and
    "more important is the interesting ground and environment ... that kind of variability". The
    undergrowth was about a blade a square metre, 0.25–0.6 m tall; a field wants about thirty, up
    to 1.5 m.
  - **Built:** a grass map for each chunk near the player (`world/grassmap.js`: thickness,
    height, dryness, colour, from the land, the ground's kind, its patches and slow noise, the
    same every time); tall grass drawn on the GPU round the player in two bands
    (`world/grass.js`: a clump of blades per cell of a lattice that wraps as the player goes,
    each built in the vertex shader from a hash of its cell, standing on the ground's heights);
    the ground darker and the grass's colour under it (`ground.js GRASS_UNDER`); each quality's
    reach (`QUALITY.grass`: none on low, 12 and 28 m on medium, 18 and 40 m on high).
  - **Cost:** two draws; about 100,000 triangles on medium and 210,000 on high (the meadow by the
    river on seed 1), within the report's per-tier budgets; each blade's corners shared (a near
    blade's five corners make its three triangles), so the vertex shader runs a third less. Its GPU time on a phone is to be
    measured (the report's first open question).
  - **Next (M7b-2):** the report's steps 2 and 3, and 7 and 8: ranked patterns and ordered layers
    (trees, boulders, bushes, grass, flowers), boulder clusters, flat slabs, worn dirt along
    paths and round camps, bushes at patch edges, flower carpets, motes and fireflies; the ground
    carrying the grass's look past where it's drawn, and on low.
  - **Tests:** `test/grass.test.js` (each chunk's map the same every time, standing on its
    ground; grass only on open grass; thick and thin, tall and short, green and golden; none on
    low, two bands on medium and high; the nine chunks round the player mapped as they're drawn,
    none that aren't).
- **2026-10-01, M7b-1b built** (farmland in fields):
  - **Why:** the user, on M7b-1's pictures: "Farmland shouldn't be just patches of plowed ground.
    Plowed ground is organized into fields". Farmland was soil wherever slow noise was high: blobs
    of furrows, all running east to west, grass round them.
  - **Built:** `core/fields.js`: the land cut into blocks of about 72 m, their edges wandering by
    up to 18 m; a grass verge 2 m wide inside each block's edges; one block in five pasture; the
    rest in parallel strips 8–20 m wide (all of a block's one way, east to west or north to south),
    a metre's baulk between them, each its own crop (ploughed, wheat, barley, greens, fallow).
    Integer hashing of whole metres and the seed alone, so the same in every browser (the core's
    exact-arithmetic test covers it). A block's farmed if the land at its middle is farmland, so
    the fields' outline follows the blocks', not the plan's 32 m cells. The overworld keeps each
    chunk's squares' strips (`chunk.crops`); ploughed and sown strips are soil, verges, baulks
    and fallow grass. Trees keep to the verges (hedgerow trees), and only haystacks and
    scarecrows stand in the strips.
  - **Drawn:** the soil's furrows run along each strip (its texture turned for strips running
    north to south), and a sown strip's ground is its crop's colour, its furrows showing through
    (`ground.js CROP_COLOURS`, read from a texture a texel a square, `fieldsOf`, for the chunks
    with fields only), so the strips show far off and on low; wheat, barley and greens stand in
    their strips as the tall grass, thick, upright and all of a height (`grassmap.js
    CROP_STANDS`; the grass map's alpha now says a square's sown).
  - **Versions:** `NET_VERSION` 15 (trees and the land's things stand elsewhere in farmland;
    `TERRAIN_VERSION` unchanged: the ground's heights are the same).
  - **Not yet:** the strips go where the ground's drawn as seen from afar (past 100–150 m, and
    the far land): there farmland is still its land's colour alone. Hedgerows along the verges
    with M7b-2's bushes.
  - **Tests:** `test/fields.test.js` (blocks, their edges wandering, every metre in one; each
    block's strips one way, each its crop all along it, its width, baulks and verges; a mix of
    crops, ploughed the most, a fifth of blocks pasture; laid into the chunks as soil and grass;
    no trees in the strips, only haystacks and scarecrows; the crops standing in the grass map;
    the ground told each square's crop and its strip's way).
- **2026-10-01, M7b-2a built** (the ground ordered round what's there: the research report's
  steps 2, 7 and 8, in part):
  - **Why:** the report's finding that what reads as nature is correlation, not noise: grass
    thickest at a rock's foot, worn along a path and lush at its verge, flowers carpeting the
    sunny side of a hill; and the user's reference shots (the dusk flower meadow with its motes).
  - **Built:**
    - the grass map ordered round what's there (`grassmap.js`): a ring of thicker, taller grass
      round what stands (`GRASS_RINGS`), trodden short and yellowed beside the ways and thick at
      their verges (`GRASS_PATHS`), drier on the sunny side of a hill and greener on the shaded
      (`GRASS_SUN`, from `sun.js`'s `facingSun`), the distances worked out over the chunk and
      6 m round it (an eight-way chamfer), so a chunk's grass waits for the eight round it;
    - flower carpets in the undergrowth (`kits/wilds.js CARPETS`): slow noise, most on sunny
      slopes, most of one kind;
    - motes (`world/motes.js`): one draw of soft glowing dots in a box round the player, each
      land's kind (pollen, dust, fireflies, wisps, embers, snow), 300 on medium and 600 on high,
      none on low (`QUALITY.motes`).
  - **Cost:** the grass map about 10% slower to work out (still spread over frames); one draw for
    the motes.
  - **Next (M7b-2b):** boulder clusters with a regional strike and flat slabs (in the core:
    they block), bushes at patch edges and along the verges (hedgerows), worn dirt in the
    ground's own shader, the ground carrying the grass's look past where it's drawn.
  - **Tests:** `test/grass.test.js` (gathered round what stands, trodden beside the ways and
    thick at their verges; drier on a sunny slope than a shaded one, two made-up tilted
    meadows; the nine chunks mapped once they and the chunks round them are drawn),
    `test/wilds.test.js` (flowers on the sunny side half as many again, most of one kind),
    `test/motes.test.js` (each land's kind; none on low; the same places at any quality; fading
    from kind to kind; never drifting out of their box; none indoors).
- **2026-10-02, M7b-2b built** (rocks, hedgerows and worn edges: the research report's steps 2
  and 7, in part):
  - **Why:** the report's ranked patterns: one dominant boulder with smaller stones round it, all
    lying the way the rock runs; hedgerows along the fields' edges (the user's fields, M7b-1b,
    had only hedgerow trees); a road fraying into the grass rather than stopping at a line. The
    hedges were first a shrub on each of their squares; the user: "Those hedgerows are way too
    much like polygons", with photographs of real ones ("You can make them different shapes and
    sizes but they are definitely foliage"), so they're now walls of leaves.
  - **Built:**
    - boulder clusters in the core (`core/wilds.js CLUSTER`, `strikeAt`, `clusterOf`): each
      boulder turned to the strike (slow noise 400 m across, give or take 0.25 rad), one to five
      smaller stones strung out along it either side (more where it's rockier), a quarter to a
      half its size, from the boulder's own random numbers so the chunk's other features stay
      put; each stone placed as the features are (in the chunk, clear, a square apart), none
      opaque. Drawn longer than broad along the strike and sunk a fifth of their height
      (`kits/wilds.js` `LONG`, `SUNK`; a new low-detail `stone` look);
    - hedgerows (`core/fields.js hedgeLine`, `Overworld.hedgeAt`, `kits/hedges.js`): along each
      farmed block's first row and column, broken at gateways (half the edges, 4 m) and where a
      road, water or a settlement meets them; a continuous body (a profile between rounded and
      trimmed, as much as it's trimmed there, swept along each run a ring every half metre,
      1.3–2.4 m tall and 1–1.65 m thick, all changing slowly along it, its face lumped by world
      noise so runs meet across chunks without a seam, rounded off where they end), drawn with
      a tiling picture of hawthorn leaves and blossom, darker at the foot and in its hollows, lit
      as a soft mass, casting shadows; sixteen sprigs a metre (cut-out cards of leaves) out of
      its top and sides; half the sprigs and half the rings on low; no undergrowth or tall grass
      in it; built a few dozen rings a step with the chunk; the drawing's alone;
    - worn edges (`ground.js WORN`): the grass in the eight squares round a road gets some of
      the road's dirt in the splat (about a third), half that a square further off, as ragged
      as the edges' noise; the splat now reads three squares round its area (one for the blend,
      two for the wear), so chunks still meet without a seam.
  - **Cost:** about one stone a chunk (13 at most), 20 triangles each; hedgerows 80–130 m in a
    chunk of fields, about 4,000–7,000 triangles of body and 2,500–4,000 of sprigs (half on
    low), two draws a chunk, built in steps of about 2–3 ms; the worn edges nothing at draw
    time.
  - **Versions:** `NET_VERSION` 16 (the boulders' places and turns, and the stones, are the
    core's: where anyone can walk has changed). `TERRAIN_VERSION` unchanged.
  - **Not yet:** flat slabs; bushes at grass patch and wood edges; the ground carrying the
    grass's look past where it's drawn and on low; the fields seen from afar.
  - **Tests:** `test/wilds.test.js` (each boulder lies along the strike; each stone by its
    boulder, along it, not far across, a quarter to a half its size; more stones than clusters;
    the strike changing slowly), `test/fields.test.js` (hedges only on the farmed blocks' edges,
    on grass, open only where they carry on into the next chunk, nothing else growing in them;
    drawn standing on the ground, no taller than they grow, the same every time, sixteen sprigs
    a metre, half and coarser on low),
    `test/town3d.test.js` (the grass beside a road worn, raggedly, less a square further off; none three squares off or
    beside cobbles).
- **2026-10-02, M7b-2c built** (the grass's look and the fields carried to the horizon: the
  last of M7b-1's "Next" and M7b-1b's "Not yet"):
  - **Why:** past where the tall grass is drawn (28 m on medium, 40 m on high), and everywhere on
    low where none is, the ground was a bright lawn, so a golden meadow ended in a line and low
    looked like a park. The fields (M7b-1b) stopped where the chunks' ground gave way to the
    ground as it's seen from afar (100–150 m), so the farmland past them was one flat colour.
  - **Built:**
    - the grass look afar (`ground.js GRASS_AFAR`, `grassAfar`; `grassmap.js grassLooks`;
      `landColours`' `grass`, a texel a cell): each land's grass tips' colour, dried as the land
      is, and how thick it grows, laid over the ground as dark as the drawn grass is in the mass
      (`bright` 0.3 of its tips), in clumps, golden in dry patches, none where it's bare or up in
      the rock, lighter and darker as the grass's picture is (to the power `detail`, 1.6) so it
      isn't flat; faded in over the tall grass's last 30% as the blades fade out, everywhere on
      low, and in the far land's colour too;
    - the fields afar (`ground.js FIELDS_GLSL`, `farFields`, `FIELDS_AFAR`; `landColours`'
      `farm` and `seed`): `fieldAt` written in GLSL (`uint` maths: the same hash, block edges,
      verge, pasture, strips, baulks, narrowest strip and crops' odds, from `core/fields.js`'s
      own exported numbers), drawn in the chunks' far band and in the far land: each strip its
      crop's colour on soil, the baulks left out past 250 m, the verges and hedges a dark band
      past 300 m; on medium and high (`QUALITY.fields`, `FAR_FIELDS`).
  - **Cost:** no triangles or draws. The grass look afar is one texture read and a few dozen
    operations a pixel of grass; the fields afar about eight integer hashes and one texel fetch
    a pixel, only in the far band and the far land (none on low).
  - **Pictures:** before/after sheet sent in the session (low from the follow camera and at eye
    height, medium past the tall grass, the farmland from 45 m up).
  - **Versions:** none (the drawing's alone).
  - **Not yet:** flat slabs; bushes at grass patches' and woods' edges (made the hedges' way).
  - **Tests:** `test/grass.test.js` (each land's look afar: its density, the savannah nearer
    straw than the meadow; a texel a cell, with which are farmland; the shader's numbers the
    core's; fields afar on medium and high only), `e2e/building-lab.spec.js` (the GPU's fields
    drawn a pixel a metre over 16,384 metres of farmland and round it, every one the same as
    `fieldAt`'s; changing one constant in the shader makes thousands differ).
- **2026-10-02, M7b-3a built** (old stone: the research report's "Random courses and dark mortar
  fix most of the castle" and "Moss, streaks and ivy cost arithmetic, not draws", the stone and
  its weathering; the openings, string courses, buttresses and ivy are M7b-3b and M7b-3c):
  - **Why:** the user's reference shot of a ruined castle: dark, mossy, green-grey stone in
    uneven courses with deep mortar. The ruins were the peoples' clean grey ashlar (one 2.8 m
    tile of eight equal 35 cm courses, mid-grey mortar), only toned by face.
  - **Built:**
    - a `coursed` painter (`painters.js OLD_STONE`): random courses 20, 28, 35, 45 or 60 cm
      high filling a 4.2 m copy, blocks one to three times as long as their course is high, each
      its own shade and a greener or browner hue, darker towards its foot, its upper edge lit,
      lichen flecks, chipped corners; near-black mortar, wandering a little, sunk (height near
      0) so the relief shadows it;
    - old stones (`MATERIALS`' `old`): `stone-old` (the humans' and the wild's: dark green-grey),
      `stone-moon-old`, `stone-black-old`, `stone-lime-old`, and `rubble-old` (the rubble
      painter in the same dark green-grey) for the core broken walls show;
    - the ruins built of them (`kits/neutral.js STONE`, `castle.js` RUINED's `ruin`), the broken
      tops and breaches' ends of crumbled walls and rings showing the rubble core (`decay.js`
      `core`), the humans' and the wild's fallen heaps of it (`rubbleOf`); the peoples' castles
      and towns keep their own stone;
    - weathering in the atlas's shader for the old layers alone (`atlas.js AGED`; the old
      layers last of the atlas's but the plain colours, so one range test): where the pixel is
      in the world and which way it faces from the view's matrix and the normal before relief;
      moss towards #3f4a2a on what faces up, in patches about 1.6 m across, a little on what
      faces north, and within 70 m in the mortar; dark streaks down the faces; the rising damp
      at the foot stays the kits' own tone. No new program (the same atlas shader), draw,
      triangle or vertex data.
  - **Cost:** five more 256-pixel atlas layers (1.3 MB, 1.7 MB with their mipmaps); a branch on
    the layer for every atlas pixel, and about forty operations a pixel of old stone.
  - **Pictures:** before/after sheet sent in the session (a ruined castle from afar and close
    by, a broken watchtower close by).
  - **Versions:** none (the drawing's alone).
  - **Tests:** `test/neutral.test.js` (the old stone's courses of several heights within
    OLD_STONE's, its mortar dark, darker and greener than kept stone; the old layers last but
    plain, the shader's weathering for them alone, after the normal's known; the ruined pieces
    of old stone with their rubble core, the kept castle's of its own).
- **2026-10-02, M7b-3b built** (the old walls as they were built: the research report's "five
  features carry a keep at a hundred metres", its deep pointed openings, string courses and
  buttresses; the ivy is M7b-3c):
  - **Why:** the user's reference shot of a ruined castle: tall pointed windows through thick
    walls, bands of stone across the faces, stepped buttresses. The ruined keep had flat dark
    boxes stuck on one wall for windows; the old halls' walls were plain slabs.
  - **Built:**
    - openings through a crumbled wall (`decay.js crumbledWall`'s `openings`, `archOf`): from
      the sill straight up to the springing, then a round or pointed head (`k`, its radius in
      spans: 0.5 round, more pointed), each with its jambs, sill and soffit the wall's whole
      depth, the faces broken round them. Where the broken top has fallen below a head, the
      opening's open above: its jambs stand only as high as the top beside them, what's left of
      its head and the wall over it end in a wedge where the top crosses it, and no top's drawn
      across the gap, so a window the wall broke through reads as a notch with its jambs;
    - string courses (`stringCourse`): a band of stone proud of the face, lit along its top
      and shadowed under, only where the wall still stands a band above it, broken where an
      opening crosses it;
    - stepped buttresses (`buttress`): up to three stages, each less deep, each set-off a slope
      shedding the rain to the next, the last's top broken off rough (the rubble core);
    - the old halls (`kits/neutral.js HALL`, `hallWindows`): lancets 0.6 m wide with heads
      springing at 2.5 m, every 2.6 to 3.6 m along a wall from its own random numbers (so what
      fell stays as it was), where the wall still stands 0.7 m above their sills; a base course
      and a course under the sills on both faces; buttresses on the outer face near its ends
      and between its windows;
    - the ruined keep (`castle.js KEEP_RUIN`, `keepWindows`): two rows of lancets 1.4 m wide,
      one over another every 3.6 m along each wall, at 0.3 and 0.62 of its height, where the
      wall still stands 1.2 m above their sills (about two a wall; the rule that wanted the
      wall whole over the head gave a quarter of one); string courses under each row of sills
      on its outer faces. Its flat dark window boxes are gone.
  - **Cost:** about 700 more triangles in a hall's ruins (median 3,100 to 3,800; most 4,395,
    under its 4,500 budget) and about 900 in a ruined castle (median 13,700 to 14,600; most
    14,828, under its 15,000); no new draws, programs or materials (all in the atlas's stone).
    Measured in the game rendering each view twice, the draws were the same before and after.
  - **Pictures:** before/after sheet sent in the session (the keep zoomed, the castle at eye
    height and from behind, a hall's ruins close by).
  - **Versions:** none (the drawing's alone).
  - **Tests:** `test/neutral.test.js` (round and pointed heads rising to their middles; an
    opening right through a wall with its jambs, sill and head the wall's depth, by rays; one
    open above where the top fell below its head, its jambs only as high as the top; a string
    course only where the wall stands above it and not across openings; a buttress standing
    out in stages each less deep, no higher than asked; the halls' windows where their walls stand above their sills, the keep's in
    rows one over another, only the lower row in a wall half fallen; the keep's flat window
    boxes gone).
- **2026-10-02, M7b-3c built** (ivy on the old walls: the research report's "Moss, streaks and ivy
  cost arithmetic, not draws", its ivy curtains):
  - **Why:** the user's reference shot of a ruined castle: dark ivy hanging in curtains from the
    broken tops of its walls and towers. The ruins had none.
  - **Built** (`art/kits/ivy.js`):
    - a curtain (`ivyCurtain`) on a face given as where along it and how far proud (`wallFace`
      for a crumbled wall, `ringFace` for a tower's round face): draped 0.35 m over the top's
      edge, then down the face standing 0.16 m proud (proud of the keep's courses on its outer
      faces), a strand every 0.45 m, each hanging 0.35 to 0.85 of the wall below it (at most
      7 m) as a slow sway along the curtain and its own say, shorter at its sides; its corners
      coloured darkest under the top, lighter to the new growth at its foot, each curtain its
      own tint;
    - its picture: a dense mat of broad five-lobed leaves over a dark inside, its lower edge
      ragged in slow waves, strands below it thinning out to their tips, now and then an old
      bronze leaf; tiling across, a copy every 1.6 m;
    - curtains along a face (`ivyAlong`): 1.5 to 4.5 m across, about one every 5 m, 7 in 10 of
      them, none within 0.3 m of an opening, slit, doorway or buttress, none where the wall's
      less than 1.2 m high;
    - hung on the old halls (both faces, fewer inside; from their own random numbers, as their
      windows are), the ruined castle's walls, square and round towers, gatehouse, keep (inside
      and out) and its corner turrets, and the broken watchtower; each piece's ivy from numbers
      of its own (`ruin`'s `ivy`), so nothing already built moves;
    - drawn as cards of leaves (`engine/leafcards.js leafCards`: the hedges' sprigs now made the
      same way, so it's the same program), merged into one mesh a chunk (`town3d.js joined`),
      casting no shadow (the material's `userData.shadow`, which `joined` now respects).
  - **Cost:** about 170 more triangles in a hall's ruins (median 3,811 to 3,981; most 4,504)
    and 2,400 in a ruined castle (median 14,616 to 17,046; most 17,700); the budgets raised to
    5,000 and 18,000 for it. One more draw a chunk with ruins in it (measured: +1 by the castle,
    +3 looking over three chunks of ruins), no shadow draws, no new program; one 256-pixel
    picture.
  - **Pictures:** before/after sheet sent in the session (the castle at eye height and from
    behind, the keep from above its walls, a broken watchtower).
  - **Versions:** none (the drawing's alone).
  - **Tests:** `test/neutral.test.js` (a curtain from over the top's edge down the face, proud of
    it, longer in its middle, a strand every IVY.strand, the same every time; curtains along a
    wall clear of what's to be kept clear, none on a low wall; round a tower outside its face;
    one program with the hedges' sprigs, casting no shadow, a castle's ivy one mesh merged;
    none on a kept castle).
- **2026-10-02, trails in stone steps built** (the deep cuttings below sites on mountainsides,
  noted under M7a):
  - **Why:** kept to a path's grade (25 %) on ways too short for their climb, four of seed 1's
    trails were cut 28 to 50 m into the mountains below their sites (gorges); and walked on the
    navigation mesh 40 m at a time, 51 of their 403 stretches couldn't be.
  - **What was found:**
    - Recast's ledge filter takes ground rising more than the climb (0.5 m) from one voxel to the
      next but one for a ledge, so nothing steeper than about 27° was walkable at all: the 30° to
      38° "steep" ground the plan (M2a) meant to be walked, slowly, never was, nor anything cut
      steep along a trail;
    - the way-finder kept the point after each turn instead of the turn itself, so a hairpin's
      leg was cut short across its turn, straight up the slope;
    - it also wove up a slope in knight's moves, each step within its grade but the corners,
      rounded off, straight up it.
  - **Built:**
    - stone steps (`ground.js STAIRS`, `stairsOf`, `stepsOf`): where a trail's land rises more than
      35 % within 10 m either way, its profile may climb at 45 % (`GRADE.steps`, 24°); the runs
      steeper than a path's grade are its steps (`profileOf(line).steps`);
    - finding a trail's way (`ways.js wayOver`): steps allowed where the land beside rises more
      than 0.5 a metre, each metre of them counting for two; no step steeper than `hard`; a
      turn's climb reckoned from the point before it; the points it turns at kept. A trail's way
      (`trails.js routeTrail`) is first looked for climbing no faster than its steps, within
      160 m of the straight way (96 before), and only if there's none, as before;
    - the walker's climb 0.75 m (`navigation/settings.js AGENT`): walkable to about 37°, just short
      of the 38° cliffs, as the plan has it; on seed 1, 15 % of the mountains' ground (36 % with
      the gentler) can now be walked, 64 % still can't;
    - the steps drawn (`art/kits/steps.js`): a stone every 18 cm of climb across the path, of old
      stone the colour of the land's rock, weathered by the atlas (moss on the treads), one mesh a
      chunk; `Overworld.pathsNear`.
  - **Measured on seed 1:** no trail cut more than 9 m (a cave's dug floor); 3 of 403 stretches
    not walkable (where a trail leaves its road, and two tight hairpins: a follow-up); about a
    tenth of the trails' 14 km in steps; steps in 49 of the 247 chunks the trails cross, at most
    2,472 triangles in one (557 on average), one draw a chunk with them.
  - **Pictures:** before/after sheet sent in the session (the gorge below ruins-32 and the
    mountainside whole; cave-84's slot up a cliff and its new stair; the steps from beside and
    above).
  - **Versions:** TERRAIN_VERSION 11 and NET_VERSION 17 (the trails' and steep roads' ways, the
    ground, and the navigation meshes, change).
  - **Tests:** `test/trails.test.js` (steps only where the land's too steep, cut far less; a way
    never climbing faster than it's let between its turns, and none without steps; no trail cut
    more than 10 m; the stones over the path at their backs, set into the ground, one mesh of old
    stone); `test/navigation.test.js` (a ramp of 24° walked as ground, 35° as steep, 41° not at
    all; three trails that couldn't be walked before walked end to end); `test/ground.test.js`
    (trails no steeper than their steps' grade, near the town).
- **2026-10-02, M7c-1 built** (chimney smoke: the first of §9's "signs of life rather than
  decay" for the peoples' settlements, and of the chosen village pictures' "chimneys with
  smoke"):
  - **Why:** the peoples' towns and villages are lived in, but nothing in them moved but their
    folk; from afar they looked empty.
  - **Built** (`world/smoke.js`):
    - the kits record where smoke rises as they build: each chimney's top (`roofs.js chimney`),
      an orc longhouse's smoke hood, an orc grog hall's crown and a smithy's forge
      (`solid.smoke`, kept in the built object's `userData.smoke`; `chimneysOf` finds them in
      the world);
    - seven hearths in ten lit (the same ones every time); a forge and a grog hall always, their
      smoke rising higher and a little wider (strength 1.4);
    - a column of nine puffs, each rising 8 m over 10 s, from 0.3 m to 1.7 m across, leaning on
      the breeze the higher it goes and wandering from its line, coming in at the chimney and
      thinning away at its top, billowing with drifting noise (the volcano's smoke picture),
      lit from above;
    - each puff a square facing the eye, its rise worked out in the vertex shader from the
      trees' breeze's time (nothing sent each frame); one mesh a chunk (`chunks3d.js`) and one
      for the start town (`town3d.js`), one material for all of it, primed while loading;
    - Visual quality's share of each column (`QUALITY.smoke`: low a half, medium three-quarters,
      high all), dropped evenly so a column thins rather than breaking up.
  - **Cost** (measured in the game, each view drawn with the smoke and without): one draw and
    198 triangles over the start town (11 columns, 99 puffs); no shadow draws; one more
    program, primed at load; no new picture.
  - **Pictures:** before/after sheet sent in the session (the start town from above, its square,
    and close by a forge).
  - **Versions:** none (the drawing's alone).
  - **Tests:** `test/buildings.test.js` (a house's chimney top where its chimney is, turned and
    moved with it, none without a chimney, a smithy's forge stronger; seven in ten lit, a forge
    always, one mesh of one material, the same every time, timed by the trees' breeze, its share
    the quality's, puffs dropped evenly); `e2e/building-lab.spec.js` (a village draws its
    smoke).
- **2026-10-02, M7c-2 built** (banners and flags in the wind: §9's "signs of life", banners):
  - **Why:** the peoples' banners were flat boxes and faces, still as the walls they hung on;
    the war's banners at the towns' ways out hung stiff, a wave baked into them; nothing flew
    from the towers.
  - **Built** (`world/cloth.js`):
    - the kits record each cloth as they build (`solid.cloth`, kept in the built object's
      `userData.cloth`; `clothOf` finds them in the world): where its top is, which way its front
      faces, how wide and long it is, its kind (hanging from a bar, hung on a wall, or a flag
      flying) and its look;
    - one picture of every cloth (`clothPicture`): each people's (their colour darkened for its
      field, or the crown's red and the cat folk's indigo, whose own are lost on their mud walls;
      a trim, their emblem, a swallowtail; painted as the war's banners' were, `paintCloth`, now
      here), a plain
      swallowtail, a plain square, a ragged war banner with a black hand, and a pennant, the
      plain ones white to be tinted;
    - one mesh a chunk and one for the start town (`clothMesh`), one material (Lambert, both
      sides, cut out of its picture), primed at load: each cloth a grid of corners (6 by 8, a
      pennant's 8 by 3) all where its top is, where each hangs and which way it faces worked out
      in the vertex shader from the trees' breeze's time: a hanging cloth swinging more towards its
      foot, rippling and in standing folds, its foot carried downwind; one on a wall standing out
      from it, never into it (hung out from a leaning wall's top as far as it leans); a pennant flying out on the breeze (the way the chimneys' smoke leans), waves
      running out along it; its normal from the wave's slope, so its folds catch the light;
    - the war's banners at the towns' ways out drawn the same way, a town's in one mesh
      (`banners3d.js`);
    - what hangs and flies (`flagpole` for flags): the crown's banners on a human keep, castle
      gatehouse and keep (were red boxes), pennants on a human castle's roofed towers and keep and
      a human keep's front turrets; the leaf's banners either side of an elven keep's door; the
      spider's on a dark elven keep's front; the sun's on a cat folk's keep (were two faces); the
      orcs' ragged war banners (were faces); flags on a lizard folk palace's roof.
  - **Cost** (measured in the building lab, each view drawn with the cloth and without): one
    draw a chunk with any cloth (and one for the start town's), no shadow draws; 288 triangles
    on a human keep (two banners, two pennants), 576 on a human castle, 384 on an orcs' keep,
    192 on a cat folk's; one more program, primed at load; one picture 1280 by 224.
  - **Pictures:** before/after sheet and a moving picture sent in the session (a human keep close
    and whole, a human castle, elven, dark elven, lizard folk, cat folk and orc keeps, the start
    town's war banner).
  - **Versions:** none (the drawing's alone).
  - **Tests:** `test/buildings.test.js` (a keep's banners hung on its front and flags flying from
    its turrets, turned and moved with it; the castle's towers', keep's and gatehouse's; an orcs'
    war banner ragged and red, facing the way it's set; one mesh of one material, each cloth's
    corners where its top is with its own cell of the picture, the breeze the smoke's, the
    shader's hooks in Lambert's; a town's war banners in its holders' cloth, in one mesh, taken
    down); `e2e/building-lab.spec.js` (the landmarks' cloth drawn).
- **2026-10-02, fixed: the ground not drawn on an iPhone** (the user, from the published game: "the
  published version ground doesn't render"):
  - **Why:** an iPhone lets one shader read 16 textures; the ground's read 22 (20 without water),
    so its shader didn't compile there and none of the ground was drawn. Chunks with water in
    them were already at 17 before M7b; M7b-1's tall grass (two maps), M7b-1b's fields and
    M7b-2c's grass afar and farmland took the rest over. This machine's browser allows 32, so
    no test saw it.
  - **Fixed** (`world/ground.js`): the grass, the four kinds of ground over it and the rock read
    from one texture array (`TILE`; each picture as it was, upside down as a canvas is sent);
    the land's maps from two (`landLayers`: its colour and grass afar, sRGB; its two homeland
    maps and farmland), made once a land and let go with it. The fields' shader reads the
    farmland through two hooks (`farmSize`, `farmAt`) that the shader including it defines.
    14 textures now (12 without water). The same filtering, mipmaps and colour spaces, so the
    ground looks the same.
  - **Checked:** varyings (10 of 31) and uniforms (86 vectors) are well inside an iPhone's too.
  - **Pictures:** before/after sheet sent in the session (the start town's square, fields, the
    cat folk's tall grass, a mountainside, a lake): the ground the same pixel for pixel, only
    what moves (grass, motes) and the random hero differing.
  - **Versions:** none (the drawing's alone).
  - **Tests:** `test/land.test.js` (a land's maps as two texture arrays, in order, in their colour
    spaces, made once); `e2e/pellagos.spec.js` (walking out of the start town, no shader drawn
    reads more than 16 textures); `e2e/building-lab.spec.js` (the fields on the GPU read from the
    land's marks as the ground reads them).
- **2026-10-02, M7c-3 built** (gardens, fences and washing lines: §9's "signs of life", gardens
  and washing lines; the chosen village pictures' "wattle and post-and-rail fences" and gardens;
  then reworked from the user's "Fences should block movement and ensure the gardens have a
  variety of plants that actually look like plants"):
  - **Why:** the yards behind the peoples' houses were open grass, a patch of soil where a bed
    was; nothing told one people's yards from another's, and nothing hung out to dry. The first
    fences were drawn only, walked through as the hedgerows are, and the first beds' crops were
    a few boxes and blobs in rows: neither read as what they were.
  - **Laid out** (`core/setpieces/town.js` `yards`, worked out once the town is laid out, from
    no draws of its own, so every town is laid out as before: 108 layouts of every people and
    size checked the same, piece for piece and square for square, but for the fences' squares,
    and laid out in the same time): each yard's rectangle; the runs of its sides and back to
    fence, a step of half a metre at a time where nothing stands (a tree, a pile of barrels, a
    building), and where two yards meet only the one laid first; its bed, cut back from its
    back or its front clear of anything stood in it (none under 0.9 m deep); and whether a
    washing line could be strung across its back (`YARD_LINE`). None over the lizard folk's
    water. About one yard in eight left open (`YARD_FENCE.open`); the rest with a gateway
    1.6 m across along the longest run of the back's fence if that's 2.6 m or more, or else of
    a side's (`YARD_FENCE`).
  - **In the way:** a fence's squares (the yard's own squares at its edge within a metre of a
    fenced run) are `blocked`, but not `opaque` (seen over), so the navigation meshes go round
    them; its gateway's left clear a metre either side of its middle.
    Walked from the street to the bottom of a yard and back across seeds 1 to 4, every way in
    is a gateway or a gap the fence leaves round a tree or a pile of barrels (fewer than one
    point in twenty of a fence's line ever stood on, the paths passing within a step of their
    gateways' middles).
  - **Kept to the town** (`core/settlements.js`): the layout knows nothing of the world's
    water, bridges and roads, so `Settlements` (given the world's `landAt`) drops a yard that
    reaches past the settlement's edge into a river or a lake, under a bridge or over a road,
    and unblocks its fence's squares (`settlement.yards`; the start town's, set into the world
    with its own land under it, all kept). `NET_VERSION` 18 (what's blocked changed).
  - **Built** (`art/kits/yards.js`):
    - each people's fences (`FENCES`): the humans' wattle hurdles between round stakes or posts
      and rails, the elves' clipped hedges, the dark elves' black stone kerbs with iron bars,
      the cat folk's mud walls, the lizard folk's reed screens, the orcs' sharpened stakes, each
      its own height; and its gateway: stout gateposts with the gate swung open into the yard
      (a barred gate braced across or a hurdle, a panel of reeds framed in cane, lashed stakes),
      an iron gate between black stone piers (the dark elves'), two mud pillars (the cat
      folk's), the elves' hedge just parted;
    - its bed raised in its people's edging (boards, pale or black stone, mud, cane; the orcs'
      heaped), its soil dark;
    - a washing line across the back of nearly half the yards with room for one, as many as
      seven pieces of washing in the people's colours hanging from it, swinging in the breeze
      (`world/cloth.js`'s kind `wash`, a grid of 4 by 4); the orcs' a rack of hides;
    - standing on the ground as it lies under the yard (`lieOf`: its corners' heights), posts
      set 30 cm into it; built as a piece of the chunk (`Settlements.yardsIn`) or the start town,
      merged with the buildings into the atlas's material; a new tint, `wattle`, of the matting,
      stretched along each hurdle and squashed up it so it reads as rods woven along it.
  - **Planted** (`kits/yards.js` `plantsOf`, `kits/wilds.js`): each bed in rows along it, a crop
    to a row from its people's list (`YARD_LOOKS`: the humans' cabbages, leeks, beans, carrots,
    lettuces, onions, herbs, hollyhocks and marigolds; the elves' lavender, hollyhocks, lilies,
    herbs, chives, beans and lettuces; the dark elves' leeks, kale, lilies, herbs, chives and
    onions; the cat folk's squashes, peppers, onions, sunflowers, marigolds and herbs; the
    lizard folk's taro, squashes, peppers, herbs and leeks; the orcs' cabbages, turnips, kale and
    onions), spaced as each would be (`PLANTING`), a row in four bare, each plant on the soil
    where it lies. Eighteen kinds of plant (`GARDEN_KINDS`), each built from leaves, stalks,
    balls and blossoms as the undergrowth's things are, eight looks of each from a seed (a
    cabbage's leaves cupped round its heart, a leek's blades fanned from its white shaft,
    carrot and turnip tops, beans up a wigwam of canes with flowers and pods, a squash's great
    leaves and gourds, sunflowers and hollyhocks taller than a man, peppers red and green,
    taro's elephant ears, lilies' trumpets, lavender's spikes, marigold and chive heads), green
    where they should be, every leaf's tip stirring in the breeze. Grown with the chunk's
    undergrowth (`Overworld.yardsIn`; sowing), so only near the player, sinking away from 40 m
    to 56 m as the rest of it does; every bed planted at every quality level (only the wild
    undergrowth thins).
  - **Cost** (the kit's own count; each view drawn before and after from the same camera, the
    undergrowth grown round where it looks both times):
    - no draws of their own, merged with the buildings and the undergrowth; a chunk's cloth mesh
      where it had none (its washing): one more draw;
    - a yard's fences and gateway close by: humans 231 to 399 triangles, elves 64 to 106, dark
      elves 472 to 624, cat folk 96 to 154, lizard folk 294 to 399, orcs 640 to 880 (their
      stakes); from further than `DETAIL_NEAR` (40 m), stakes, iron bars, gates and rope left
      undrawn (`Solid.near`): 36 to 400;
    - a plant 50 to 400 triangles (chives 50, an onion 80, a cabbage 200, beans on their canes
      390); a bed's 10 to 220 plants 1,800 to 27,000; within 56 m of anywhere in a town, at most
      80,000 (a human city's, seeds 1 to 3), 15,000 to 57,000 in the other peoples';
    - close views in the building lab (with the shadows; the undergrowth grown both times): a
      human city's yards +27,700 triangles on 259,000 and +21,600 on 321,000 (one more draw), and
      from above +27,700 on 248,000; a dark elves' gateway +1,100 on 278,000; a cat folk city's
      walled garden +8,200 on 255,000; an orc city's staked yards +64,100 on 304,000 (two more
      draws), the most, its beds the thickest planted: every view under 370,000, inside the
      500,000 budget;
    - each piece of washing 32 triangles (a grid of 4 by 4), no shadow; no new picture (a tint
      and two plain colours).
  - **Pictures:** before/after sheet sent in the session (a human city's yards close by and from
    above, a dark elves' gateway, a cat folk's walled garden, an orcs' staked yard); and each
    plant's eight looks, close by.
  - **Versions:** `NET_VERSION` 18.
  - **Tests:** `test/setpieces.test.js` (a yard behind each house, as wide as it and facing the
    same way; fenced where nothing stands, never twice where two meet; its bed and washing
    line clear; never over water; its fences' squares blocked but seen over, along its fenced
    sides and nowhere else, but for its gateway; a few left open); `test/overworld.test.js`
    (a settlement's yards reaching over the world's water, a bridge or a road dropped and their
    squares unblocked; walking round the start town's yards' fences, in at their gateways);
    `test/buildings.test.js` (each people's fences of their own stuff, on the ground as it lies;
    a gate open in each gateway in their way; beds in their edging with their crops planted in
    rows on the soil; each plant green where it should be, tall where it should be, swaying,
    no two looks alike; washing on lines only where there's room, off the ground, in their
    colours; the same every time, nothing drawn round a yard left open); `test/chunks.test.js`
    (a chunk's yards built on the ground as it lies, merged as all at once; their beds' plants
    sown with the undergrowth, where `plantsOf` says); `test/wilds.test.js` (the plants within
    the undergrowth's budgets); `e2e/building-lab.spec.js` (a village's yards).
- **2026-10-02, plan:** the user asked for "a look around at all the environment generation to
  ensure the ground and elevated terrain generation looks natural and doesn't contain any obvious
  polygons or texturing that wouldn't look good in the intended environment". Added to M7 as M7d
  (§9 *The land looking natural*, and §12's M7 row), after M7c and before the cliffs and rocks.
- **2026-10-02, swiping up follows the camera** (the user: "command a player to continuously run
  in the direction the camera is facing until they hit an obstacle. The player character should
  turn to the direction the camera is facing and initiate a forward run until exhausted, and
  then walk, until an obstacle is reached"):
  - **Changed:** a swipe up from the player sends `ahead` with the way the camera looks over the
    ground (`Game.forward`: the camera's direction, flattened; looking straight down, the way
    they face), not the way they face; the battle's `ahead` order turns them that way as well as
    setting them off (`actor.facing`), even when the way's blocked at once. Running while their
    stamina lasts and then walking, as before.
  - **Versions:** none (the order's the same shape; the host turns the hero and the turn reaches
    everyone with the rest of the hero's state).
  - **Tests:** `test/combat.test.js` (sent ahead, turned that way first, blocked or not);
    `e2e/pellagos.spec.js` (the camera turned to look the clearest way with the player facing
    off to the side: a swipe turns them the camera's way and sends them running along it).
- **2026-10-02, plan:** the user asked whether to plan "for a day/night cycle, night sky features
  like moon and stars, and things like torches and a spell like "light" that creates a light globe
  following the player for 15 minutes or something", and chose a day of 60 minutes, nights dark
  enough to matter (sight shorter, creatures of the night), Light from a tome at the guilds, and
  passing time by renting a room at a tavern or camping where no enemy's near. Added to M7 as M7e
  (§9 *Day and night*, and §12's M7 row), after M7d; M7c's lit windows moved into it, as they need
  a dusk.
- **2026-10-02, M7c-4 built** (market and shop awnings in the wind: §9's "signs of life", market
  awnings; the chosen village pictures' striped stalls):
  - **Why:** a stall's awning was boards painted in stripes, stiff as its counter, and every
    shop's was its upper shutter propped up (in red cloth on a better-off house): nothing in a
    market moved.
  - **Built** (`world/cloth.js` `awning`, with the banners' cloth): an awning is a cloth of its
    own kind, pinned along its back edge and reaching out and down to its front (`fall`), its
    middle lifting and settling on the breeze (7 cm at most, gusting) and its canvas shivering;
    along its front a valance, a short banner swinging a third as much. Four looks (`AWNINGS`:
    red, blue, green and gold stripes, eight from back to front, sun-faded towards the back, a
    seam, a scalloped foot), each a cell of the cloths' picture, the awning drawn from its upper
    four fifths and its valance from its foot (`rows`).
  - **Where:** over every market stall (kits/props.js: 2.45 m up at its back, 40 cm of fall, a
    24 cm valance), and over a better-off shop's counter (kits/house.js: `plan.wealth` over
    0.4, two shops in three; 95 cm out, 35 cm of fall, on a rail and two iron rods). A poorer
    shop keeps its shutter of boards.
  - **Shadows:** cloth now casts its shadow where it is as it moves (`clothDepthMaterial`: the
    shadow map drawn with the same placing in the vertex shader), so an awning shades its
    counter; the banners', flags' and washing's shadows move with them too (before, none).
  - **Cost:** no draws of their own (in each chunk's one cloth mesh); 96 triangles an awning
    and its valance; a stall's painted boards gone (24 triangles); the cloths' picture four cells
    wider (1,792 by 224, about 0.6 MB more with mipmaps); one more draw into the shadow map for
    each cloth mesh. In the start town's market, each view drawn before and after from the same
    camera: one or two more draws and 1,450 to 1,590 more triangles (two stalls, two shops).
  - **Pictures:** before/after sheet sent in the session (two stalls, two better-off shops).
  - **Versions:** none (the drawing's alone).
  - **Tests:** `test/buildings.test.js` (an awning stretched out and down from its back edge,
    its valance along its front, in its look's rows; one over every stall, none painted on
    boards; over the better-off shops' counters and not the poorer's; the cloth mesh casting its
    shadow through its own depth material).
- **2026-10-02, the insides looked up at and lit by what lights them** (the user: "In the tavern
  one the first and second floor, you cannot look up. Relax that restriction and put some
  chandeliers up there or rafters/boards like you would see in normal building construction.
  Also on the building interiors, the light source is ambient. It should be coming from the
  windows, fire, candles, lamps, and whatever other light sources would be used inside of
  medieval buildings"):
  - **Looking up** (`world/view.js`): indoors the camera tilts to 40 degrees above the horizon,
    as outdoors; under the ceiling it's kept inside the room (0.35 m in from the walls, a metre
    from the player at least), over it free (`roomReach`).
  - **Ceilings** (`world/interiors3d.js` `CEILINGS`, `ceiling`): over every floor of every
    inside, 3 m up, each people's own way (the humans' plaster between joists on great beams,
    the orcs' planks on logs, and so on), open over the taproom's stairs; the wheels of candles
    hang from them on chains. A ceiling lower than the camera isn't drawn (cut level with the
    camera); while the camera's over all of it, it isn't drawn into the view at all
    (`seenFrom`), only into the sun's shadows. Boxes can have undersides (`Solid.box`'s `under`).
  - **Daylight:** windows are openings in the walls with leaded glass; the sun comes in at them
    from the side with the most (`daylightOf`), the walls and ceiling shadowing the rest, with a
    beam of dusty light through each (`shaftsOf`).
  - **Flames** (`world/roomlight.js`): every candle, wheel of candles, sconce, lantern and fire
    lights the room, flickering; the two lighting the player most are the view's two lamps, the
    rest (up to 16 in all) light only the insides' own materials, in their shaders, as many as
    the room has (`ROOM_LIGHT.count`); their light comes back off the walls (`fillOf`); each has
    a glow. The even light from all round is turned down.
  - **Cost:** the taproom going in 67 to 72 draws and 268,000 to 277,000 triangles; upstairs 38 to
    43 draws and 115,000 to 142,000 triangles. A frame in the town hall's chamber drawn in
    software (the browser tests' drawing): 0.56 s before, 1.15 s with the ceiling worked out and
    thrown away and every pixel looping over all 16 lights, 0.61 s now.
  - **Pictures:** before/after sheet and every people's ceilings looked up at, sent in the
    session.
  - **Versions:** none (the drawing's alone).
  - **Tests:** `test/rooms.test.js` (new: ceilings, undersides, stairwell, chandeliers, the
    ceiling cut and not drawn from over it, the sightline cut, daylight and beams, the lights,
    glows, flicker, lamps, the list for the shaders, the light off the walls, the camera looking
    up); `test/buildings.test.js` (an inside's three atlas meshes); `e2e/pellagos.spec.js` (the
    tavern: the sun in at the windows, the lamps the room's flames, the camera dragged up under
    the ceiling).
- **2026-10-02, M7d-1 built** (the land looking natural, §9: the first fixes from the tour):
  - **The tour:** 19 spots on seed 1, one deep in each kind of land and a river, a lakeshore, a
    coast, a mountain pass, the highest peak and the steepest slope, each from a walker's eye,
    the follow camera's height and 70 m up, on medium. Its cameras are kept (the session's
    tour script and spots) for the later parts of M7d to be checked against.
  - **Found, the rock:** the rock's picture (cliffs, mountains, the volcano's slopes, boulders,
    standing stones) had dark cracks wandering all over it in loops, worms from close by and a
    pattern from afar; and from close by it was a blur, its texels each a hand across.
    - **Fixed** (`art/engine/painters.js` `rock`): broad faces of broken stone, each a shade of
      its own, their edges wavering; bedding layers across them; long cracks along only some of
      the faces' edges, each its own depth and broken off along its length, finer ones fainter;
      pale flecks off the cracks. The four rocks (grey, red, dark, pale) all painted so.
    - **Fixed** (`world/ground.js` `ROCK_DETAIL`): within 8 m of the camera, fading out by
      28 m, the light and shade of a copy four times finer (1.7 m across, turned) laid over the
      rock. Two more texture reads, on rock alone and only that near.
  - **Found, the ridges:** from high up, a ridge running north-east to south-west was a row of
    teeth: every square of the far land and of the chunks drawn coarser split the same way, so
    a ridge running across the split stepped from square to square.
    - **Fixed** (`world/far/levels.js` `splitAlong`): each square split along whichever of its
      diagonals is the more level, worked out with the heights (in the far land's worker, and
      for each chunk drawn more than a metre apart). Chunks drawn a metre apart keep the split
      the rules read heights by, so the ground's drawn just where everything stands on it.
  - **Cost:** no more triangles or draws (each view of the six rocky spots drawn before and
    after from the same camera: the same calls and triangles but for creatures passing). Each
    far level and each coarser chunk has triangles of its own rather than shared: 49 KB a far
    level (196 KB on medium, against 49 KB shared before) and 8 to 28 KB a coarser chunk. Two
    texture reads more for rock within 28 m.
  - **Pictures:** before/after sheets sent in the session (the peak, the steepest slope, a
    mountainside, the volcano, the snow and the coast; eye, follow and high up each).
  - **Versions:** none (the drawing's alone).
  - **Tests:** `test/far.test.js` (a square split along its ridge either way, every triangle
    facing up; every square of a far level split along its more level diagonal);
    `test/land.test.js` (a chunk a metre apart split as the rules read it, the same triangles
    for all; four metres apart, along its ridge and its more level diagonals, its own, its
    skirt after); `test/buildings.test.js` (the rock's picture tiles without a seam, with only
    a few deep cracks: the old picture fails it).
  - **Next in M7d:** the other lands looked over in the tour's pictures (the plains and fields,
    water's edges, marsh, sand and snow), and whatever gives them away fixed the same way.
- **2026-10-03, M7d-2 built** (the land looking natural, §9: water's edges):
  - **Found, from the tour's lakeshore, coast and river:**
    - The far land's lakes and sea had shores in 8 m steps: each corner wet or dry, the shore cut
      between them square by square.
    - The far land's still water was a flat colour. Seen across a lake or the sea, it was a dark
      band where the water nearer, reflecting the sky, ended.
    - Where the water nearer faded out (128 to 154 m), a dotted band: under it, the bed coloured
      as the land seen from afar (snow by the lakeshore). Looking down on a lake from high up,
      the bed there was past where the near camera stops before the far land began, so the sky's
      colour showed through in dots.
    - The far rivers were a flat grey-blue ribbon, the river's own colour lost where it met it.
  - **Fixed** (`core/terrain/height.js` `distantHeights`, `world/far/levels.js`, far-worker.js,
    far.js): each far corner has how deep the water is over the land, and on land how far below
    it the nearest water's surface is (up to 4 m either way, eased along a level's edges as the
    heights are). Between corners that's 0 just where the shore is: the shore is drawn there,
    sharp across a pixel (`ground.js`).
  - **Fixed** (`world/water.js` `STILL_WATER`, used by `ground.js` for the far land and by
    `far/silhouettes.js` for the far rivers): water from afar looks as the water nearer does. It
    has its own colour over its bed, the bed seen through it where shallow (the same absorption,
    red first). It reflects the sky from the same blurred map, as much as three.js's standard
    material reflects off the water nearer at that roughness and that glancing a look (Karis's
    fit to its light), and the sun's glint at the same sharpness (Blinn-Phong, its highlight as
    high).
  - **Fixed** (`world/water.js`, `fog.js`): the water nearer isn't faded out with what's near.
    It goes on to where the near camera stops, its ripples gone by 128 m, and the far land's
    water and the far rivers take over there. The far rivers are drawn with the far land only
    (not twice, fading in).
  - **Cost:** one draw call fewer (the far rivers' near copy) and the same triangles; on the
    far land's water, an exponential, two texture reads (the sky's map) and a glint, only where
    it's water; the far rivers lit (a Lambert material, not a flat colour); the water nearer
    drawn whole from 128 to 160 m, not dotted out.
  - **Pictures:** before/after sheets sent in the session (the coast, a lakeshore and a river;
    eye, follow and high up each).
  - **Versions:** none (the drawing's alone).
  - **Tests:** `test/far.test.js` (each corner's depth: over 0 just where it's water, at most
    4 m either way, a shore between a wet corner and a dry one, eased along the edges; the far
    land's shader has the still water and reflects it once lit; the water nearer isn't faded,
    its ripples gone by 128 m); `test/nature.test.js` (the far rivers lit, as still water from
    afar, drawn with the far land only).
  - **Next in M7d:** the marsh (its streams falling in steps across flat ground), sand and snow;
    trees seen floating from high over the coast; the far land's gaps after a long jump (each
    level drawn once worked out: keep the old until the new is in).
- **2026-10-03, M7d-3 built** (the land looking natural, §9: trees on cliffs):
  - **Found, from the tour's coast and mountainside:** the trees seen from afar stood all over
    cliffs and rock faces, cards seeming to float in front of the grey rock. The chunks never
    plant a tree there (a tree's squares are kept clear of what's blocked, and ground too steep to
    climb is), but the far trees, replaying the planting without the chunk, didn't know.
  - **Fixed** (`world/far/trees.js` `gatherTrees`): no tree where the land across the four
    metres round it is too steep to climb (`SLOPE.cliff`, 38°). That slope is never steeper than
    the steepest of the squares the chunk keeps clear round a tree, so every tree a chunk plants
    is still among the far ones (the test that checks it passes, and 536 trees on 60 hilly chunks
    were checked the same way: none lost).
  - **Also looked at:** the marsh's stream falling in steps. It runs down a slope of 1 in 6 (31 m
    over 190 m) at the marsh's edge, so pools and falls are right there; its steps are even (8 m
    apart, 1.2 m high), left for the rivers' own pass. Sand, snow, the savannah, the badlands, the
    tundra, the jungle, the meadow and the farmland looked over again from the tour's cameras:
    nothing more to fix.
  - **Cost:** four more height reads a tree worked out, in the worker (a fifth more time: 0.38 s
    for 2 km round the coast); a fifth fewer trees drawn at the coast (16,361 to 12,959).
  - **Pictures:** before/after sheets sent in the session (the coast and a mountainside; eye,
    follow and high up each).
  - **Versions:** none (the rules' trees are as they were; only the far cards are fewer).
  - **Tests:** `test/nature.test.js` (round the coast's cliffs, no far tree where the land's too
    steep to climb, and there are cliffs there to keep off: fails on the old trees).
  - **The far land after a long jump** (the gaps the first tour's pictures showed): only while
    the worker works out the levels round the new spot, about 10 ms each, so for a few frames
    after a teleport; the tour, taking its pictures a moment after each jump, shows none. Left
    as it is.
  - **Next:** M7e, day and night.
- **2026-10-03, M7e-1 built** (day and night, §9: the clock and the sky through the day):
  - **The clock** (`core/daytime.js`, exact maths): the time of day from the war's own clock (its
    turns, a minute each, and the time into the next), so it's the host's, saved with the war,
    sent in the war's state and checked with it, and stopped when the world's paused, with nothing
    new kept and no version changed. A day of 60 minutes: night to 7, dawn to 11 (sunrise at 9),
    day to 47, dusk to 53 (sunset at 50); a new world at minute 18, mid-morning; the moon's phases
    over eight days, a quarter full and waxing at the start. `daylight(time)` for the rules later
    (night sight, M7e-3).
  - **The sky through the day** (`world/daytime.js` `skyAt`, `sky.js`): the sun from the east,
    over the south (56 degrees at noon), to the west, eased through the night so that it's as slow
    near the horizon as by day; the moon opposite it, its disc lit by its phase, its seas, a glow;
    the stars (a grid over the sky, one star in a tenth of its cells, twinkling, none where the
    cells are under a pixel); the land's look's colours by day, dawn's pinks and dusk's golds
    either side of the sun's rising and setting, the night's deep blue; the clouds lit as the sky
    is.
  - **The light** (`view.js`): the sun's light warm and low at either end of the day; the moon's
    by night (cold, 1 against the sun's 3.5 full, 0.3 new), shadows from whichever is up, paler by
    night (`shadow.intensity` 0.55); the two handed over at the horizon where neither lights
    anything. The light from all round drawn again from the day's sky (`environment.js` `SkyLight`:
    one PMREM generator and scene kept, 36 draws a bake) when the sun's moved 0.03 radians or the
    sky's changed as much, at most every 2 s, at once after a big change. A night exposure of 1.5
    times the day's (the eye used to the dark: a full moon's night readable, a new moon's dark).
  - **The first night was black** (the first tour's pictures): the moonlight at 0.42, the night
    sky's light from all round nearly none. Raised (the moonlight, the night sky's colours a little
    lighter, the night's exposure) until a full moon's night reads as Elden Ring's blue nights do.
    **The dawn came on in a minute:** the sun went round under the north twice as fast as over the
    south, so its height changed fastest just before it rose; eased to the day's pace at either end.
  - **What's lit by the sky alone** (smoke, the falls' mist, the volcano's smoke, the far trees,
    pollen, dust and snow motes) times one shared colour (`SKY_GLOW`), dark at night; fireflies,
    wisps and embers glowing still.
  - **Indoors:** the daylight at the windows and its beams (`INTERIOR_GLOW.daylight`) as the time
    of day has it, none at night; the day's exposure. The pack's paperdoll lit as on a fair day.
  - **Pictures:** before/after sheets sent in the session (the start town and a meadow: the old
    fixed sun, then before sunrise, just risen, noon, sunset, dusk, a full moon's midnight and a
    new moon's; the follow camera and looking at the sun or the moon).
  - **Cost:** no more draws a frame; the sky's shader a little more (the stars at night, the moon's
    disc where it is); a bake of the light from all round (36 small draws) about every 25 s by day
    and every 2 s through the dawn and the dusk; a few more sums in the smoke's, the motes', the
    mist's and the far trees' shaders.
  - **Versions:** none (the clock is the war's).
  - **Tests:** `test/daytime.test.js` (the day's parts in order, the clock the war's, round the
    clock; daylight; the moon's phases; the sun's way; the day's light by the sun and the night's
    by the moon; dawn's and dusk's colours; nothing jumping from one ten seconds to the next; the
    sky shader's stars and moon; what the sky alone lights dark at night). `e2e/pellagos.spec.js`
    (out of doors the light from all round is the day's sky's, in the near world and the far).
  - **Next:** M7e-2, lights: lit windows, torches, braziers and lanterns, a small pool of real
    lights.
- **2026-10-03, plan:** the user asked, once day and night are done, for a pass over the land's
  light like M7d's over its shapes (shadows and light consistent with where their sources are and
  how strong: local lights, the sun and the moon), then pins on the world map (a long press where
  the fog's lifted; a tall column of blue light in the world; a glowing blue line along the way
  there, in the world and on the map, kept the best way as the player moves, none if there's no
  way; a way to remove it; a double tap on the map where there's no way closes it and runs there).
  Added as M7f and M7g (§9, and §12's M7 row), before the rest of M7.
- **2026-10-03, plan:** the user made the world map's double tap plain: it runs the player to the
  place as a double tap in the world does; where no way there can be found, the map says "A path
  cannot be found" and nothing's done. M7g's bullet says so.
- **2026-10-03, M7e-2a built** (day and night, §9: lit windows):
  - **The windows** (`world/art/engine/atlas.js` `WINDOWS`, `WINDOW_LIGHT`): the buildings'
    glass (plain, leaded, green, violet, and the lanterns'; not water or obsidian, which shine as
    glass does) glows warm from within at night, on its glass and not its leading, flickering a
    little. Each window's seed (1 to 15) is worked out as its building's merged (its glass told
    apart as the triangles that touch, the seed hashed from where its middle is) and rides on its
    layer (`WINDOW_STEP`, 2,048 times it), so it's still one material and one draw.
  - **Through the evening** (`world/daytime.js` `windowsAt`): from three minutes before the dusk
    to the night's start they come on one after another by their seeds; after midnight about a
    third go out one after another; through the dawn the rest go out, the last to come on going
    out first.
  - **All night:** a tavern's, a church's, a guild's and a keep's windows (`LIT_ALL_NIGHT`, from
    the piece a building's merged from: `town3d.js` `partsOf`), and the lanterns' glass.
  - **Indoors** the windows aren't lit (the insides' material leaves it out): they show the night.
  - **Pictures:** before/after sheets sent in the session (the start town at the dusk's end, at
    midnight and late in the night; the follow camera and from above).
  - **Cost:** nothing more drawn; in the buildings' shader, a varying and, on windows' glass only,
    a few sums; as a building's merged, its windows told apart (a few hundred corners a building).
  - **Versions:** none.
  - **Tests:** `test/buildings.test.js` (each window lit as one and the windows' seeds spread over
    them all, the same each time; nothing but windows' glass; a tavern's and a keep's all night, a
    house's each its own; the buildings' shader lights them and the insides' doesn't);
    `test/daytime.test.js` (`windowsAt` through the day and night).
  - **Next:** M7e-2b, torches, braziers, lanterns and camp fires, and a small pool of real lights.
- **2026-10-03, M7e-2b built** (day and night, §9: torches, lanterns and camp fires):
  - **Where:** torches in iron brackets (`kits/torches.js`) either side of a keep's door, a
    capital's keep's too, and of a gatehouse's way through, inside and out; the lanterns already
    by taverns' and town halls' doors, marked lit; the war camps' fires. A kit pushes each onto its
    solid's `lights` ([x, y, z, kind]), kept on the built piece's `userData.lights`; `lightsOf`
    finds them in the world (`chunks3d.js` keeps a chunk's, `lightsNear`; `town3d.js` the town's;
    `camps3d.js` the camps' fires).
  - **Drawn** (`world/lights.js`): each torch's flame and every light's glow, a mesh of each for a
    chunk's (or the town's) lights, lit as the windows are (`WINDOW_LIGHT`), fading out far off.
  - **The flicker** (the user: "Have the torches flicker with realistic fire and have that
    flickering correspond to the light they emit in a realistic way"): one `fireFlicker` (value
    noise at 1.9, 5.3 and 11.7 a second, weighted 0.45, 0.35 and 0.2; each light's seed from where
    it is) drives the flame's height, width, colour and brightness, the glow's size and colour, and
    the light's strength, colour and height, the same sums in JavaScript and GLSL. Its hash is
    taken round 289, since 32-bit floats hashing the whole numbers of a long-running clock drifted
    from JavaScript's by as much as 0.59 (uncorrelated); now within 0.005 over 1,000 seconds. A
    torch's light wanders by about 14% either side of its strength (depth 0.9), a camp fire's 12%,
    a lantern's behind glass 4%.
  - **Their light** (`view.js` `lightNear`): the two nearest the player within their reach, as
    the view's two lamps (the insides' flames' already: so on every quality, with no new shader
    variants), fading out towards their reach's edge; the rest glow. Torch 4 cd, 11 m; lantern 3,
    9 m; camp fire 8, 14 m.
  - **Wells** (the user: "The back side of the wells in the center of towns lose their rendering
    when you get close to them"): two causes, both fixed. The town's height map for the cut-away
    counted the props (a well's roof over its whole square, above the line to the camera at its
    near edge); now it's what's built and the trees, as out in the world. And the line was walked
    40 m whatever the camera's distance, so a tall building behind the camera counted as in the
    way; now it stops at the camera. Then the user pointed at the round stone ring itself, "like
    the round part of the well is chopped in half": it was three open cylinders, each one-sided
    and facing out, so from above the far side's inside (facing the camera only from within) was
    never drawn and the cobbles showed through. It's turned whole now (`kits/props.js`, two
    lathes: the outside, the lip under the rim, the rim, its top and the inside down to the water,
    each facing the way it's seen from), so every well in every town and castle is whole.
  - **Pictures:** before/after sheets sent in the session (the well with the player behind it,
    from three ways round;
    the keep at midnight; four frames of a torch's flicker, the light's strength with each).
  - **Cost:** two draws a chunk (or town) with lights, a few dozen vertices each; the two lamps
    were already in every lit shader. Each frame, the chunks' lights round the player looked
    through for the nearest two.
  - **Versions:** none.
  - **Tests:** `test/lights.test.js` (lights found where they are in the world; one mesh of
    flames and one of glows, lit as the windows; the flicker as deep as its kind's, smooth, each
    light its own, none by day; the GPU's 32-bit sums the same as JavaScript's over 1,000 s; the
    two nearest lighting the lamps, out by day, none indoors, fading at their reach's edge; the
    lamp's strength, colour and height rising and falling with its flame). `test/buildings.test.js`
    (torches by a keep's door and a gatehouse's way through, a capital's keep's; lanterns by a
    tavern's and a hall's doors; a well's ring whole, its far side's inside seen from all eight
    ways round, and its top). `test/town3d.test.js` (what hides the player is what's between
    them and the camera, nothing behind it). `e2e/pellagos.spec.js` (behind the town's well the
    player isn't cut out; at midnight the tavern's lantern lit and drawn, by day not).
  - **Next:** M7e-2c, braziers at the guards' posts, lanterns on poles in the bigger towns'
    squares, and guards on night watch carrying torches; then M7e-3, night in play.
- **2026-10-03, fix: shadows shimmering** (the user: "in the current pages build, all the
  shadows appear shimmering like they are affected by wind"). Since M7e-1 the sun goes round as
  the day does, a little every frame, and the sun's shadow map turned with it: every frame each
  shadow's edge was drawn a little differently (its texels across the ground no longer the same
  texels), so every edge shimmered. Measured standing still at the start town by day, nothing
  else moving, 2 s at 60 frames a second: before, all 120 frames changed, about 3,100 pixels each,
  all of them along shadows' edges. Now the way the shadows are cast from follows the sun only
  in steps of 0.002 radians (`shadows.js` `stepShadows`: about every 1.5 s by day, 0.7 s by the
  faster moon; a jump, the moon taking over or going in or out, at once): 1 frame of the 120
  changed, the step. A house's shadow's tip moves about 4 cm a step, under two texels on medium
  and high. Test: `test/light.test.js` (through the day's middle half hour a frame at a time:
  more than 100 steps, more than 98% of frames still, never more than a step behind the sun, a
  jump taken at once).
- **2026-10-03, M7e-2c built: fire** (the user: "Real fire is kind of wavy... improve the realism
  of the fire emanating from fire sources and the corresponding light and shadows"; "Candles,
  chandeliers, and fire spells are also fire sources"; "The fire spells themselves should range
  from small amounts of fire at the lowest tier to big and impressively huge"; "Shouldn't the
  torches and the spells be their own independent light sources?"; "Employ as many fire effects
  as feasible on a phone based on the research results to each fire source in the game"). From
  the research report (reports/Realistic fire and firelight on phones.md, kept out of the repo):
  - **world/fire.js:** tongues on a twisting spine (strips turned to the camera, 6 segments, 12
    for a fire taller than a man), noise warping and eating them away up their height, heat to a
    glowing body's colour, premultiplied; the puffing signal (`fireSignal`: about 1.6 / √width a
    second, slow growth and quick collapse, gusts); the breeze's lean (`fireTilt`); embers
    (points, a plume's rise). The same signal in JavaScript and GLSL, whole numbers only hashed
    (a fractional seed in the puff's size hash had the GPU's 32 bits disagree outright: found by
    the test). `fireFlames`: a spell's own copy, its size its own (`fireSize`).
  - **Every fire source:** torches, lanterns, braziers (neutral shrines and camps, orc braziers),
    every people's forges and the orcs' chimney top, the cat folk's kiln; war camps' fires
    (camps3d.js); indoors every hearth, forge, candle and wheel of candles (interiors3d.js, cut
    away as the rooms are); the fire spells (spellfx.js `blaze`).
  - **Each its own light** (firelight.js `FIRE_LIGHT`, 16 at once, `fireLit` in every lit
    material's shader through `Material.prototype.onBeforeCompile` and the materials with their
    own hooks; view.js `lightNear`: the two that matter most the real lamps, a spell's first; the
    torch's wall's other side unlit). Indoors the room's fire and candle lights follow their
    flames (roomlight.js `strengthOf` with the fire's seed and rate).
  - **Lamp shadows:** the first lamp on High and Medium, none on Low; drawn again when the
    lamp changes fire and every 2 (High) or 4 (Medium) frames drawn; set by the chosen quality,
    so the governor's drops never remake shaders. (Both lamps on High at first made every lit
    pixel indoors take 10 shadow taps, 13% more drawing in CI's software renderer, pushing the
    tavern's long browser test past its time: one, as the research said.)
  - **Spells:** seven tiers from a lick of flame to a 24 m whirling column; each fire, flash and
    fireball in flight its own light (`lightsNow`). **Bug found:** the spells' flashes borrowed the
    view's lamps, which the torches' lighting (after it each frame, since M7e-2b) took back, so out
    of doors flashes lit nothing; now they're lights of their own in the same list.
  - **The fire lab** (fire-lab.html) for comparing them.
  - **Pictures:** sent in the session: the fire lab (torches, brazier, camp fire with its stones'
    shadows, candles; the seven spells, each a moment after it lands); the keep's torch at night,
    before and after.
  - **Cost:** a torch's flame 42 vertices, a camp fire's 112; one mesh of flames and one of
    embers per chunk (or town), a smoke mesh per kind; the list of 16 lights in every lit shader
    (a loop over `count` of them, none by day); a lamp's shadow 6 faces of the near scene when
    drawn again; a spell's fire one draw a fire while it burns.
  - **Tests:** test/lights.test.js rewritten (puffing at its rate, slow up and quick down; the GPU's
    sums within a fortieth of a puff over 1,000 s; flame against light steadiness; one mesh, a
    strip a tongue, a material for all; lights found and turned with their piece; drawn with
    embers, smoke and glows; lights rising and falling with their flames, leaning, off by day for
    torches; the lamps and the list, a spell first, at most 16, none by day or indoors; `fireLit`
    in each kind of material, once, nothing behind the wall). test/spellfx.test.js (the fire
    spells grander and brighter tier by tier, Burn a lick, Hellfire a column over 20 m, their
    lights out once they're done; flashes and fireballs lights of their own, none of three.js's).
    test/rooms.test.js (hearths, forges and candles as fire.js's, cut away, their lights as their
    flames by the drawing's clock).
  - **Next:** M7e-2d, braziers at the guards' posts, lanterns on poles in the bigger towns'
    squares, guards on night watch carrying torches; then M7e-3, night in play.
- **2026-10-03, the fire spells by day, each marked a spell** (the user: "Make sure the fire
  spells look good in the day too. They should be pretty epic at tier 6 and totally epic at tier
  7"; "make sure all the tiers look good and are identifiable as spells. The spell circle you had
  on the ground was a good motif. Maybe one that is increased by tier"; "Tier 3 and Tier 5 look
  similar. There should be a clear progression of power. Fix tier 5"):
  - **A circle for every tier** (spellfx.js `sigil`, `sigilTexture`): drawn once a tier, turning
    round the caster's feet as it's cast and where it lands, wider and richer tier by tier; each
    line glowing over a darker one burnt into the ground, shown over what's behind it rather than
    adding light, so it shows on bright ground by day.
  - **By day:** a spell's flames a body of fire (fire.js `fireBody`, a uniform of the same shader:
    nothing compiled again), hiding more of what's behind them the brighter the day, their
    hearts kept orange; fireballs in flight their colour over the sky, trailing smoke.
  - **Flamefill** (5) a firestorm (three rings of fire rolling out across its circle, a cone of
    fire 5 m high, fire round its rim), between Immolate's column and Inferno's whirl (it was
    thirteen small fires, too like Burstflame's ring of nine).
  - **Inferno** (6): its circle spreading as it's cast, the sky darkening a little; a 16 m fire
    whirl with a swirl at its foot, three rings of runes rising up it, fire running round the
    rim, black smoke billowing over it.
  - **Hellfire** (7): the sky darkening almost to black and reddening (view.js `setOmen`, from
    spellfx.js `omen`/`darkness`), a 13 m circle on the ground and another turning 16 m up in
    the sky, meteors falling out of it, glowing fissures, a 26 m column, five rings of runes, fire
    round the great circle's rim, a crown of black smoke.
  - **Pictures:** all seven by day before and after (cast, landing, burning), by night before
    and after, Inferno and Hellfire again, Hellfire from low down (its circle in the sky).
  - **Tests:** test/spellfx.test.js (each fire spell's own tier's circle round the caster's feet
    and where it lands, wider tier by tier, under a metre to a dozen; every flame a body of fire;
    the sky darkened a little for Inferno, almost black for Hellfire, as it was for the rest,
    clear again after); test/lights.test.js (the spells' flames' body their own, the world's
    fires' none).
- **2026-10-03, M7.5 planned: places worth finding** (§8 *Places worth finding*), from the user's
  answers: mixed by the war; retaken a few days after they're cleared; as strong as the place's
  size and its land's danger; castles and forts, watchtowers and camps, caves and the lair, ruins
  and holy places; friendlies' shops; guild missions for bandits' and the dead's.
- **2026-10-03, M7e-2d built: lamps and braziers.**
  - **Lamps on posts** round the market of a town or bigger (`kits/props.js` lamppost: an iron post
    on a stone foot, an arm, a lantern hanging from it, lit at night as lanterns are): either side
    of each main street where it comes into the market, and in its corners
    (`core/setpieces/town.js`, placed without a draw of the town's random numbers, so the rest of
    every town is laid out as before). About 2 in a town, 4 in a city, 6 in a capital; none in a
    village or smaller.
  - **Braziers by the guards:** one by each pair at a town's roads out, across the road from their
    banner, a step out past them (`core/war/muster.js` `braziersOf`, in the host's muster event
    and its record; drawn with the banners, `banners3d.js`: an iron bowl on three legs, its coals
    and its fire, burning day and night, each its own light).
  - **Guards carrying torches** waits for M7e-3 (night in play): most guards hold a shield in
    their other hand, and the bowmen and two-handed fighters both hands, so a torch at night
    means changing what they carry at dusk and dawn (the character built again), which belongs
    with night's sight and the rest of night in play.
  - **Pictures:** the start town's market lamp by the town hall and a guard post's brazier at
    night, sent in the session.
  - **Tests:** test/muster.test.js (a brazier by each pair of guards, by the other guard, across
    the road from the banner); test/buildings.test.js (braziers drawn and lit with the banners,
    their lights on their coals, gone with them; lamps round the markets of towns and bigger,
    none in villages, the lantern 2.3 m up).
  - **Next:** M7e-3, night in play (sight, night creatures, guards' torches, passing time at inns
    or camping).
- **2026-10-03, M7e-3a built: seeing at night, and the guards' torches** (§9 *Night in play*).
  - **Seeing at night** (`core/light.js`, exact maths): out in the world everyone sees less far
    when it's dark, the battle's sight (12 m) times the sky's light: by day all of it, by night
    a moonless night's 0.35 (about 4 m) to a full moon's 0.55 (about 7 m), falling through the
    dusk with the daylight. Where it's lit, as by day: round a settlement as far as 10 m past its
    edge (its windows, lamps and guards' braziers), round a war camp's fire 14 m, a fire on the
    ground (a spell's) 6 m past its edge, a carried torch 9 m. Seeing goes by the light where the
    one seen is, so a torch-bearer is seen from out of the dark before they see who's there.
    Indoors, as ever; talking (next to someone, or across a counter) as ever.
  - **Worked out by the host each step** (`Host#light`, before the battle's step) from what every
    copy has: the war's clock, the world's plan, the camps, the fires on the ground and who's
    carrying a torch, only those within 80 m of a player (and nothing by day). A joined copy steps
    its own host, so it works out the same light: nothing new is sent, kept or saved.
    `NET_VERSION` 20 (a game from before would see otherwise at night, and drift).
  - **The guards' torches** (`carriesTorch`; `world/carried.js`; Character `holdTorch`; items
    `handTorch`): from half through the dusk to half through the dawn (when the windows come on),
    every soldier with a hand free (a sword, a cleaver or a wand: their shield's hand) carries a
    torch in it instead, its shield hidden, not built again; the bowmen and two-handed fighters
    carry none. Its flame (a torch's, `fireFlames`) burns at its head wherever they go, and it's
    a light of its own among the world's fires (`lightNear`), so a patrol's light moves along the
    walls as they go round.
  - **Pictures:** guards with their torches lit at a town's road out at midnight, sent in the
    session.
  - **Tests:** test/nightsight.test.js (the sky's light by day, night and the moon, falling
    through the dusk; who carries a torch; what's lit near the players; sight in the battle by
    night, lit and unlit, indoors and talking; the host's light at midnight in its town, every
    torch near the player lighting round it); test/netplay.test.js (a joined copy works out the
    same light at night and stays the same); e2e (the guards with lit torches at midnight, none
    by day).
  - **Next:** M7e-3b, the night's own creatures; then M7e-3c, passing time at inns or camping.
- **2026-10-03, M7e-3b built: the night's creatures** (§9 *Night in play*; docs/WILDS.md *By
  night*).
  - **The night's own** (`CREATURES` `night: "only"`): the bat swarms, the skeletons out in the
    open, the will-o'-wisps, the black shuck and the shadow stalkers are put out only after dark
    (from half through the dusk to half through the dawn, as the torches are lit). At daybreak
    those 30 m or more from every player (out of sight) and not fighting go to ground; none are
    put out by day. The undead camps' and the ruined castles' skeletons are always there.
  - **The night's hunters** (`night: "more"`): wolves, dire wolves, pumas, hyenas, sand scorpions
    and cultists met twice as often after dark, the night's own three times (`NIGHT_WEIGHT`, in
    `candidatesAt`).
  - **More of them:** two more about each player out in the world after dark (`WILDS.night`: ten
    in all).
  - **Seeing in the dark** (`darkSight`, kept on the creature in the battle): the night's own, the
    wolves, the big cats, the hyenas, the cave spiders and the wight lord see as far as by day
    out of the light, so in the dark they see a hero first; a torch or a lit road evens it.
  - **Versions:** `NET_VERSION` 21 (what's put out when, and who sees how far).
  - **Tests:** test/nightsight.test.js (the night's own only after dark and the hunters more often,
    every night creature's habits making sense; those that see in the dark seeing as by day; more
    about a player out in the wilds at midnight, the night's own among them, gone at daybreak).
  - **Next:** M7e-3c, passing time at inns or camping.
- **2026-10-03, M7e-3c built: passing the time** (§9 *Night in play*; docs/GAME.md *Passing the
  time*).
  - **Sleeping** (`Host#sleep`, `daytime.js` `untilWaking`): a room taken at an inn (the
    innkeeper's or the madam's `rent: "room"`), or a camp made, is slept in to the next sunrise or
    sunset at least five minutes of play off (`REST.least`): a night's sleep to the morning, a
    day's to the evening. Hurts are mended and stamina filled; the war's turns meanwhile are all
    played as they would have been (`Host#warOn`, the war's part of `advance`, now its own), so
    raids, sorties and news all come on as ever.
  - **Camping** (`camp` command; `REST`): out in the world, not in a settlement ("find an inn"),
    indoors, in a fight, or with anything hostile within 40 m. Their people's tent behind them,
    a fire a step in front (`Host#campfires`, drawn by `camps3d.js` as a war camp is, kept in the
    world's snapshot), burning three minutes after they wake and lighting the dark round it for
    sight as a war camp's fire does (14 m).
  - **Make camp** (wheel.js `ACTIONS.camp`, its icon a tent by a fire under a crescent moon): on
    the player's own wheel's other side to start with; it can go on either side or the quick bar.
  - **Playing together:** only the host's sleep passes the time (everyone's woken with them, told
    who slept and how long); a guest who sleeps just rests. Every copy plays the host's sleep
    alike, the war's turns and all. `NET_VERSION` 22.
  - **Woken:** the screen comes up from black over a couple of seconds, and they're told how long
    they slept.
  - **Pictures:** a camp at sunset as the player wakes, and by night, its fire lighting the grass,
    sent in the session.
  - **Tests:** test/rest.test.js (to the next sunrise or sunset; the host's room at an inn to the
    morning, mended, the war's turns played; a camp out in the wilds to the evening, its fire
    lighting the dark, burnt out after, kept with the world; no camp in a settlement, indoors, in a
    fight or with a hostile near; a guest only rests; every copy alike); test/app.test.js (Make
    camp on the wheels); e2e (made camp out in the world from the wheel: woken at sunset by the
    tent and fire, told).
  - **Next:** M7e-4, the Light spell's tome.
- **2026-10-03, M7e-4 built: the Light spell** (§9 *The Light spell*; docs/MAGIC.md).
  - **The spell** (spells.js `light`): a common tome's, on oneself, 500 ms to cast, 3 s to cool;
    it lasts fifteen minutes (a lasting spell, battle.js `buff`), and cast again while it shines
    it's put out (`unbuff`). Its tome is sold at every adventurers' guild for 10 gold
    (`GUILD_TOMES`; its own `price`), and found as other common tomes are.
  - **In the rules** (core/light.js `LIGHT_REACH.globe`, the host's light): at night everyone sees
    as by day within 12 m of whoever has a globe over them, out in the world; so the caster sees
    what's near them in the dark, and is seen.
  - **The globe** (world/globes.js): a small bright ball with a soft glow rising from the hand and
    drifting after the caster a little over their right shoulder, bobbing; its light cool white,
    steady, 13 m, a light of its own among the world's (lights.js). A puff of white motes and a
    flash as it's cast (spellfx.js); its icon a bright globe with rays in the dark.
  - **Versions:** `NET_VERSION` 23 (a new spell, and the guild's wares).
  - **Pictures:** midnight in the wilds before and after Light is cast, sent in the session.
  - **Tests:** test/nightsight.test.js (learnt from its tome, sold at the guild for 10 gold;
    cast, its globe lights the dark round the caster for fifteen minutes; cast again, put out);
    test/magic.test.js (Light's tome among the guild's); test/tomes.test.js (a tome as dear as
    it's rare, or its own price); test/spellfx.test.js and test/app.test.js (its look and icon,
    as every spell's).
  - **M7e done:** the day and night, the lit windows, the fires and their light, the lamps and
    braziers, the guards' torches, sight at night, the night's creatures, passing the time and
    the Light spell. **Next:** M7f, the light looked over.
- **2026-10-03, M7f built: the light looked over** (§9 *The light looked over*; docs/GAME.md
  *Against the dark*).
  - **The tour:** the start town, a village, a castle, the standing stones, a shrine, the ruined
    castle, the woods, the mountains and the coast, each at sunrise, noon, dusk, a full moon's
    night and a new moon's, from the follow camera; and the tavern's two floors at noon and
    midnight.
  - **Found and fixed: firelight lost in the dark.** Measured where a town's lamps and a
    shrine's braziers stand (the ground's brightness a metre from the flame, with the lamp and
    without): under a full moon the town's lamps added almost nothing to the moonlit street, the
    braziers a faint smudge. Out of doors every fire's light is now three times as strong at
    night and reaches a third further (view.js `NIGHT_FIRE`, by the windows' light, so it comes
    on through the dusk), its fading towards its reach's edge going with it; a spell's flash is
    as bright as it's made whatever the hour. The Light spell's globe retuned to match (1.9,
    10 m by day; 5.7, 13.5 m by night). No more cost: the same lights, multiplied.
  - **Found and fixed: daylight in the windows at midnight.** Inside, the leaded glass showed
    the day's pale sky (and the sun's on the sunny side) all night. It goes over to the night's
    sky as the daylight goes (interiors3d.js `NIGHT_PANE`, from the same `INTERIOR_GLOW.daylight`
    as the beams).
  - **Looked at and right:** the sun's and moon's shadows (a full moon at midnight stands where
    the noon sun does, and casts as it does), none cast by the sky's light alone; the far land
    and the near agreeing at the hand-over at every hour; the ruins dark at night but for the
    moon; the coast's water taking the sky's colour.
  - **Seen, left for later:** lit windows light no ground in front of them (each would be a
    light: a cheap glow on the ground under each would do, in M7j's weathering pass or after);
    the village tower's round window glows as a flat disc; the shrine's statue dithers as it
    fades out of the way of the camera (the fade, not the light).
  - **Pictures:** a town's street, a shrine and a guard post at dusk, under a full moon and a new
    moon, before and after; a camp fire at night and Light at midnight, before and after; the
    tavern's two floors at midnight, before and after; sent in the session.
  - **Tests:** test/lights.test.js (a fire's light fading towards its reach's edge, by night's
    reach; stronger and further by night than at dusk, a spell's flash the same whatever the
    hour); test/buildings.test.js (the insides' windows: the day's sky in them, the night's as the
    daylight goes).
  - **Next:** M7g, pins on the world map.
- **2026-10-03, M7g built: pins on the world map** (§9 *Pins on the world map*; docs/GAME.md
  *The world map*; README).
  - **The pin:** held on the world map somewhere the player's been, a pin's dropped there (one:
    a new one moves it); held on it, or its button, it's taken away. Kept with the character
    (save.js `loadPin`/`savePin`), not with the world, so each player's is their own; joined to
    another's world, it's kept only while there.
  - **In the world** (world/pin3d.js `PinMarks`): a round column of blue light 900 m high, a strip
    turned to the camera in its shader, never thinner than about ten pixels, drawn in both passes,
    each its own part (the near pass within the near camera's 160 m, the far pass the rest, brought
    in to the far camera's reach and shrunk as much where it's further), so it's seen from
    anywhere, through the haze a little fainter, day and night; a glow round its foot; and a thin
    glowing line along the ground from the player's feet the way they'd walk, 180 m of it, its
    buffers made once. Four draws, additive, no shadows, no textures.
  - **The way there** (core/journey.js): found over the plan's cells, not the navigation meshes
    (kilometres of their tiles would stall the game): the sea, lakes and rivers crossed only at
    fords, streams and roads' bridges, nothing steeper than 37°, the roads cheaper (`crossingsOf`,
    worked out once a world in about 0.1 s; `wayAcross`, A* in 3 to 40 ms across the world,
    pulled straight where it can see). Near the player, its first 64 m over the navigation mesh's
    tiles there already (`Navigation.wayIn`: none baked for it), so the line goes round what's in
    the way. Found again as the player moves (every 0.3 s at most, once they've moved), and across
    the world again once they're 40 m off it. Drawn on the map too.
  - **Tapped twice** (app/journey.js `Journey`): the map closes and the player runs there a leg at
    a time (72 m legs over the navigation mesh, the next sent as they near the end of one, walking
    on when out of breath); found again if they stop getting nearer, given up on with a word after
    two tries; anything else they do ends it. No way there: "A path cannot be found", nothing
    done; indoors: "Step outside to set off".
  - **Pictures:** the line on the ground from the follow camera; the column from 300 m and from
    2 km, at noon and at midnight; the world map with the pin and the way; running there; sent in
    the session.
  - **Tests:** test/journey.test.js (each cell's ground; a way to every capital, never through the
    sea, a lake or a river but where it's crossed, the same every time; none out to sea; nothing too
    steep; measuring along a way; a journey's legs, not sent again every frame, found again when
    stuck and given up on, over indoors; the column in both passes, the line along the ground in
    buffers made once); test/app.test.js (the pin kept with the character, not another's);
    e2e (dropped where it's held, the column and the line in the world, taken away held on it; out
    at sea "A path cannot be found"; tapped twice, the player runs there and arrives).
  - **Next:** the M7 summary report; then M7h, cliffs and rocks.
- **2026-10-03, M7h built: cliffs of rock** (§9 *Rock relief*, table row 5; docs/GAME.md
  *Cliffs*).
  - **Before:** where the ground was too steep to climb it was the same smooth slope as anywhere,
    rock painted on it; from below, a grey sheet.
  - **A skin of rock** (world/art/kits/cliffs.js `cliffsInto`): the ground's shape on a 2 m
    lattice, each point moved off it a little its own way, pushed out along the ground's normal
    by how steep it is (out from 36°, all out by 41°; under 36° sunk half a metre under the
    ground, so it has no edge): 0.35 m at the least, more in the rock's bedding (a ledge at the
    foot of each 5.5 m layer, a smooth swell, the layers tilted and wandering), broken into
    buttresses and crags (13 m and 6.5 m; nothing finer, or the lattice draws spikes). A side
    climbing more than 2.5 m is split, the cell fanned from its middle. Coloured a point at a time:
    each layer its shade, darker under the ledge above, moss and snow on what faces up; at its brow
    and foot, where it's hardly a cliff, the ground's colour beside it (at a coast's bluff its
    edge showed as a pale sawtooth against the grass). Scree at the feet. Smooth normals: lit
    flat, a face at a time, it read as spikes.
  - **Its picture** (engine/atlas.js `cliffMaterial`, ROCK): laid on from three sides by where
    each pixel is in the world, not texture coordinates. Tried first: each face's own plane (a
    patchwork of seams), then each point's way along the slope (stripes, as a point's way turns
    with its normal across a whole world's distance). Laid on from three sides, the rock's own
    picture showed its copies in rows (a wallpaper of the same cracked plates every 7 m), so each
    patch of rock reads it from a place of its own, two blended where patches meet (Inigo Quilez,
    "texture repetition", technique 3), read with `textureGrad` so a side the rock barely faces
    isn't read at all: four reads a pixel, six at a corner, and broad lighter and darker patches.
  - **Seams:** worked out from the world, not the chunk (the ground's heights from the chunks
    round it, fetched first one a step; its rises over 4 m kept three nodes past the chunk, since
    the lattice a point outside it moves up to most of a step: with two, the edge's normals were
    a little different either side, which the tests found).
  - **Cost** (Chromium's software renderer, seed 1, medium, the follow camera): up to about 4,700
    triangles a chunk all cliff; 24,000 to 77,000 round the player in the mountains (17 to 28
    meshes, one draw each and their shadows'); +6 to +17 draw calls and +15,000 to +46,000
    triangles a frame there, which draw 56 to 99 calls in all (fewer than a town). Over row 5's
    20 to 45k, but where nothing else much is drawn; none on low quality (`QUALITY.cliffs`;
    `Chunks.setCliffs`). Made a few rows a step: at most 4.5 ms, 17 to 28 ms a chunk all cliff.
    Only 5 % of its triangles are wholly under the ground (not worth leaving out).
  - **Pictures:** mountain, peak, steepest, snow, coast and badlands, from a walker's eye, the
    follow camera and 70 m up, before and after; sent in the session.
  - **Tests:** test/cliffs.test.js (standing out only where too steep; made a few rows a step,
    within a chunk's share, none on flat land; the same points, normals and colours either side
    of a chunk's edge; never on a road, a bridge, water or what's built; drawn with the picture
    from three sides, lit by the fires); test/chunks.test.js (drawn, hidden and shown with the
    quality; none made on low); e2e (in the mountains, the cliffs' meshes drawn and their shader
    compiled, reading no more than 16 textures).
  - **Not yet:** the arches (row 5: one to three a region) and overhangs beyond the ledges.
  - **Next:** M7h-2, a few natural arches of rock; then M7i, churches, citadels and stone bridges.
- **2026-10-03, M7h-2 built: arches of rock** (§9 *Rock relief*, table row 5's "1–3 arches per
  region"; docs/WORLD.md and GAME.md *Arches of rock*).
  - **Where** (core/arches.js `archesOf`): a region is the plan's cells of one rocky land joined
    side to side; none in one under 600 cells, one more each 2,400 past that, three at most; on
    gentle ground well inside its land, clear of roads, water, the settlements and the places,
    640 m from any other, inside one chunk. Seed 1: 11 in five lands (snow, savannah, badlands,
    mountain, heath); seeds 2, 3, 7: 8, 10 and 13. Worked out once a world in 20 to 70 ms.
  - **In the rules:** a chunk's feature (`kind: "arch"`): its legs' squares blocked and hiding
    what's behind them, open under its span, a clearing round it (no tree nor other feature);
    not there at all if a leg would be on a road, water, a bridge or what's built.
    `NET_VERSION` 24 (the world's squares changed).
  - **Drawn** (world/art/kits/arches.js): a band of rock swept along a curve, squared sections,
    thick at its feet, broken by knobs and the cliffs' bedding's ledges, coloured and laid with
    the rock's picture as the cliffs are; about 1,000 triangles, one draw a chunk that has one, at
    every quality. First drawn round (a bent tube, thin and smooth): it read as a pipe, not rock;
    then made a slab, thicker, lopsided and ledged. From afar (out to 2 km) three boxes in the far
    shapes; on the minimap its legs and span.
  - **Pictures:** five of seed 1's arches from 34 m off, before (main) and after; sent in the
    session.
  - **Tests:** test/arches.test.js (one to three a region, far apart, the same every time; on
    gentle ground well inside its land, clear of roads, water, the settlements and the places,
    inside one chunk; its legs' squares blocked and hiding, open under its span, nothing grown in
    its room; drawn from foot to foot, its feet in the ground, facing out, as high as it rises;
    the cliffs' material, under 2,000 triangles); test/chunks.test.js (drawn at every quality,
    not among the land's features); test/silhouettes.test.js (seen from afar, its legs and band,
    out to its reach); e2e (drawn where it stands, its legs blocked, open under its span).
  - **Not yet:** overhangs beyond the cliffs' ledges.
  - **Next:** M7i, churches, citadels and stone bridges.
- **2026-10-03, M7i-1 built: churches to a grammar** (§9 row 7, "Romanesque and Gothic church
  grammar"; docs/GAME.md *The church*). M7i ships as four playable PRs: churches, stone arch
  bridges, broken aqueducts, hill citadels.
  - **Grades** (core/setpieces/pieces.js `churchOf`, given every church a settlement lays out and
    taking nothing from its random): a village's parish church, Romanesque; a town's church,
    Romanesque or Gothic as its seed falls (even: Gothic); a city's or a capital's minster,
    Gothic; an abbey's church a minster. Seed 1's human places: 7 parish churches, 6 town
    churches (4 Gothic), 3 minsters (the other peoples' temples keep their own kits' looks).
  - **Built** (world/art/kits/church.js `churchBody`, on the same 12 by 16 m lot, the door
    where the temple inside is entered): the parish church's thick walls, small round-headed
    windows, pilaster strips, corbel table, round apse and squat tower under a stone pyramid; the
    town church's nave over aisles with a clerestory, buttressed, Romanesque or Gothic (pointed
    arches, pinnacled buttresses, a many-sided apse, an eight-faced spire between four
    pinnacles); the minster's twin-towered west front with spires, a rose window with tracery,
    a gabled portal, flying buttresses from pinnacled piers, a many-sided apse and a spire on
    the ridge. A portal of warm stone round the door, a socle under the walls. 1,300 to 2,400
    triangles (the old church about the same as the parish church); no more draws (the
    building atlas); the windows leaded, lit all night as before.
  - **From afar** (world/far/shapes.js `FAR_CHURCHES`): each grade's tower as high as it's
    built, a pyramid or a spire on it; a minster's two towers.
  - **Pictures:** the building lab's four churches front and back; five of seed 1's churches
    in play (a capital's and a city's minster, a town's Gothic and Romanesque church, a
    village's parish church), before (main) and after; sent in the session.
  - **Tests:** test/church.test.js (grades by place, given every church laid out; each built on
    its lot, grander grade by grade, its tower and spire as high as its measures, in a few
    thousand triangles; its door where the temple's entered, its patron's sign, the sun, leaded
    windows; seen from afar as tall, a minster's two towers); the building lab e2e (a church of
    each grade and build).
  - **Next:** M7i-2, stone arch bridges.
- **2026-10-03, pins looked over** (the user: "You should not be able to drop a pin in an area of
  the map still covered by fog of war. The pathway line on the ground should not go through things
  that a player cannot go through. It should be like a path finding like that follows a path that
  is walkable."; docs/GAME.md *The pin*).
  - **Under the fog:** the map already refused a held pin there; the game now does too (`setPin`
  returns the pin as it was), so neither a script nor anything else drops one there.
  - **The line on the ground:** only ever the navigation mesh's way, round what stands in it. It
  was the mesh's way for its first 64 m, then the world plan's 32 m cells' (straight through
  houses, trees and the windmill). Now it's the mesh's to the point on it nearest the way across
  the world 160 m along (or 120, 88, 64, 40, 20: the furthest that can be got to over the tiles
  there), nothing past that, and nothing at all until there's some (found again every 1.5 s while
  it's short, as the tiles come in). A pin 110 m off across the start town: the line runs all the
  way to it along the streets. `nearestIn`: the mesh's nearest point without baking a tile (as
  `wayIn`).
  - **Pictures:** three pins across the start town from above, before and after; sent in the
    session.
  - **Tests:** the pin e2e: held under the fog, told so and nothing dropped (nor set so); the line
    along the ground, once its tiles are in, every point of it on the mesh.
- **2026-10-03, the arches of rock rebuilt** (the user: "The stone arches look kind of weird and
  blobby. ... Try to come up with a procedural way to achieve a look closer to real stone arches
  with the idiosyncrasies, rubble, and where appropriate, vegetation.", with photos of a jagged
  mountain arch, Arch Rock on Mackinac with its trees, a red sandstone arch over its talus, and
  Delicate Arch; docs/WORLD.md and GAME.md *Arches of rock*).
  - **What was wrong:** a band swept along a curve, the same section all the way: a bent tube of
    even thickness, its knobs blobs on it, no rubble to speak of (chips under its legs, buried),
    nothing growing on it.
  - **Now a fin of rock with a hole worn through it** (world/art/kits/arches.js `rockField`,
    meshed by surface nets on a 0.6 m lattice): the crest from the ground beyond each foot, up and
    over, steep or rounded each end; the hole worn to the opening between its legs' squares,
    springing low or high, a cap of rock over it, level or bowed; tapering up its legs and flaring
    at their feet, wandering and leaning; beds standing out as ledges or worn back, harder ones
    capping it, joints cutting it into blocks, knobs and pocks; two in five with a small window
    beyond a leg. Shaded darker in its hollows (how open each point is). Rubble: five to eleven
    blocks against its legs and 10 to 44 chips of scree, sat on the ground. Its land's undergrowth
    on its ledges and top and round its feet, plenty in green lands, less in dry ones, none in the
    snow. 4,000 to 6,000 triangles (was about 1,000), 35 to 100 ms in Node, made in about nine
    pieces as its chunk is drawn, so no frame stalls.
  - **In the rules:** each foot runs on outwards along the fin a way of its own (core/arches.js
    `reach`, 1.5 to 6 m: `legsOf`), its legs' squares those within 2.4 m of that line (were round
    footprints at its feet), its clearing out past its furthest reach (`roomOf`). The rock's kept
    inside those squares below a person's head. `NET_VERSION` 26 (the world's squares changed; 25 the spells' doubled reach).
    Placing's otherwise as it was: seed 1 still 11 in five lands, a few moved where a reach would
    leave its chunk.
  - **From afar:** each leg's box as long as its squares; a far leg's height worked out from its
    own ground (it had been scaled with the height above the sea, so on high land a leg stood
    lower than its ground: a snow arch's 2 m under it), now tested for every arch. On the minimap
    its legs as thick strokes along the fin.
  - **Pictures:** five of seed 1's arches (heath, savannah, badlands, mountain, snow), each from
    the front and the side, before (main) and after; and a close look at two; sent in the session.
  - **Tests:** test/arches.test.js (each foot reaching its own way; its squares out to the end of
    each leg; the rock within its legs' squares below head height, whole over its opening with a
    cap above it, its normals facing out; under 9,000 triangles with its rubble; drawn in a group
    with its rock casting shadows; what grows by land: none in the snow, more in a green land than
    a dry, some up on the rock); test/chunks.test.js (the arch's rock drawn at every quality, its
    plants only with undergrowth); test/silhouettes.test.js (each far leg along its squares, up
    from its own ground most of the way to the band, for every arch).
- **2026-10-03, M7i-2 built: stone arch bridges** (§9 row 7, "stone arch bridges"; the user, with
  photos of Tower Bridge, a rubble bridge with a dressed ring round its arch, a three-arch rubble
  bridge, a packhorse bridge of rubble with stones set on edge on its parapets, and a five-arch
  bridge of coursed stone: "Here are some pictures of different sized stone bridges to consider.
  Go for as much realism as the phone budget allows"; docs/WORLD.md *Roads*, GAME.md *Stone
  bridges*).
  - **Which** (core/overworld.js `BRIDGE.stone`): every road's and trade road's crossing, half the
    tracks' (by where they cross); each reaching 8 m onto each bank, its deck level over the river
    (4 m over the water on a track's, 2.8 on a road's, 2.6 on a trade road's) and up a ramp from
    each end; knowing its road (`kind`); a trade road's within 600 m of a capital or a city with
    a gate tower (`tower`). Seed 1 round the start: 10 stone, 6 timber; the trade road's by
    Redemoor has its tower. Its squares are cobbles (walked on as drawn; a timber one's planks,
    stood on 16 cm up), the ground under it drawn as under a timber one's. `NET_VERSION` 27.
  - **Built** (world/art/kits/bridges.js), as grand as its road: a packhorse bridge of rubble humped
    over one high arch, coped with stones set on edge; a road's of rubble with dressed rings round
    one to three arches and rounded cutwaters, coped with slabs; a trade road's of coursed stone over
    a row of lower arches, pointed cutwaters carried up to a string course, and, by a capital, a
    gate tower over its middle pier (corbelled out at the road's level, the road through it under a
    round arch, a slate roof and four turrets with spires). Arches springing 0.3 m over the water,
    segments of circles (or half circles), each ringed with its own stones long and short in turn,
    a deeper keystone; old stone (three new atlas pictures, weathered by the shader), damp at the
    waterline and dark under the arches (vertex tone); its land's plants at its ends (in the chunk's
    undergrowth: no more draws). 2,700 to 4,000 triangles, in four steps of 2 to 3 ms.
  - **On the way:** the first gate tower stood 10 m high with tall spires and reached down into the
    water on corbels (the trade roads' decks are only 2.6 m over it): made 7.5 m, set on the deck,
    its spires smaller. Rounded cutwaters of rubble showed chevrons where the picture stretched
    round them: made of dressed stone. A packhorse bridge's two small arches didn't read as one:
    its deck raised to 4 m, so one arch spans the stream.
  - **Pictures:** four of seed 1's bridges from afar and four from the water, close, before (main's
    timber) and after; sent in the session.
  - **Tests:** test/bridges.test.js (which roads' are stone, their kinds, ramps and towers; decks
    level over the river as high as their kind has them, from the ground at their ends, never
    steeper than 0.5; cobbles and planks; arches springing over the water, as wide as their grade
    allows, from bank to bank between piers, the packhorse bridge in one arch; each a few thousand
    triangles of its grade's stone in steps, a tower's slate and windows; cobbles at the deck's
    height; what grows at their ends); test/navigation.test.js (straight over the road's stone
    bridge, up on its deck); test/overworld.test.js (a bridge's squares planks or cobbles); e2e (by
    the start town, the road's stone bridge drawn and walked over on its cobbles, as high as its
    deck on the way).
  - **Next:** M7i-3, broken aqueducts; then M7i-4, hill citadels.
- **2026-10-03, M7i-3 built: broken aqueducts** (§9 row 7; §9's humans: "ruined villages; hill
  citadels; broken aqueducts"; docs/WORLD.md *Broken aqueducts*, GAME.md *Broken aqueducts*).
  - **Where** (core/aqueducts.js `aqueductsOf`): one to three in each stretch of the humans' land
    (one for 1,000 cells, one more for each 3,000 past that), each a straight row of 9 to 15 piers
    7.5 to 10 m apart across the deepest dip of six headings from a cell, every pier on the humans'
    land, off roads and water, 80 m from the settlements, places and sites; 900 m apart, 80 m
    from the arches of rock; its channel 8 to 14 m over the highest ground under it. Seed 1 has 2;
    seeds 2, 3 and 7 have 1, 3 and 3 (30 to 100 ms a world).
  - **Broken** (`fatesOf`): a stretch of 40 to 65% of its piers kept whole, never its ends, its
    arches standing (bar one, three times in ten); beyond it piers fallen (likelier at its ends),
    broken to stumps, or whole, an arch between two whole ones there one time in two; a pier
    across a chunk's edge fallen. A standing pier takes its squares (blocked, opaque); under its
    arches and over a fallen one's rubble is open. Each pier a chunk feature (`kind: "aqueduct"`,
    `standing`). `NET_VERSION` 28.
  - **Built** (world/art/kits/aqueducts.js): piers of old pale stone with imposts; half-circle
    arches ringed with voussoirs, a keystone at each crown; the channel over them (floor, two
    walls, cover slabs flush with their tops, some gone); where its piers stand over 14 m, a lower
    row of arches, a string course and the lower row's deck; broken tops jagged with ivy hanging
    from them; stubs of fallen arches; rubble where arches and piers fell. About 3,000 triangles
    an aqueduct, a pier a step as its chunk's drawn, merged with the atlas (a draw or two a chunk,
    one more for ivy). From afar a box a standing pier and an arch (far/shapes.js); on the minimap,
    piers as blocks, the channel as a line, rubble as smudges.
  - **On the way:** fates drawn pier by pier left some with no arch standing at all (seed 2's):
    made a kept stretch, decay beyond it. The first fates came from `hashOf` with consecutive
    inputs, which are correlated (every span fell): drawn from `createRandom` instead. The human
    lowlands are flat, so piers were low: the channel set 8 to 14 m over the highest ground. The
    channel's cover slabs stood up like battlements: laid flush. The lower row's deck, dressed
    stone greened on top, read as water from above: the piers' stone, the string course two bands.
    A fallen pier left nothing: now a feature of its own (no squares) with its heap of rubble.
  - **The ground's repeats** (the user, with a photo by an aqueduct: "In this picture the ground
    textures look really repetitive"): the grass's picture (a copy every 5 m) has a darker blob
    and band, and past the tall grass, where the ground takes the grass's look with its light and
    shade made stronger, they showed as a checkerboard of 5 m squares and stripes along the world's
    lines. Now read without its repeats showing (world/ground.js `UNREPEATED`, after Inigo Quilez's
    "texture repetition", technique 3): two copies, each shifted and every other turned on its
    side as a broad noise has it, blended, `textureGrad` from where they're read so there's no
    seam: one more texture read a ground pixel. The broad noise (the patches', 61 m a copy, turned
    off the world's lines) also shades the ground (it was the grass's picture again, 37 m a copy,
    hardly varying) and wanders the lands' edges (they hardly wandered). Pictures before and after
    on medium and low, sent in the session.
  - **Main's CI after M7i-2:** the e2e test that taps and double-clicks the ground timed out at
    120 s on main twice (it passed on M7i-2's own run). Not hung: pinned to two cores it takes
    two minutes (a minute loading, a minute of clicks while the game plays on, every frame drawn
    in software), the stone bridges drawn round the start adding a little; given 180 s, as the
    other tests that long are.
  - **Pictures:** seed 1's two aqueducts from beside, close and along, sent in the session.
  - **Tests:** test/aqueducts.test.js (placement, determinism, on the humans' land clear of roads,
    water, places and arches; a kept stretch, broken and fallen piers, arches only between whole
    piers; standing piers' squares blocked and opaque, open between piers and over rubble; drawn
    up to the channel's walls in a few thousand triangles, two rows where tall, stubs and rubble,
    ivy; from afar); test/far.test.js (the grass read without its repeats); test/wilds.test.js
    (the land's own features checked without the aqueducts' piers, as without the arches); e2e
    (seed 1's aqueduct drawn, its pier in the way, walked under through one of its arches).
  - **Next:** M7i-4, hill citadels.
- **2026-10-03, M7i-4 built: hill citadels** (§9 row 7: "hill citadels 2–3× today's scale on
  stepped pads"; docs/WORLD.md *Hill citadels*, GAME.md *Hill citadels*).
  - **The research** (the user: "You can also do more extensive research and find new castle
    parts and textures if the existing kit is inadequate to create large, interesting, castles and
    citadels"): Edinburgh (Stormveil's model), Krak des Chevaliers, Beaumaris and Harlech, Spiš,
    Stirling, Saumur, Segovia, Mont-Saint-Michel, Hohenzollern, spur castles and Japanese
    yamajiro; the real measures of merlons, crenels, machicolations, bartizans, gatehouses,
    barbicans, retaining walls' batter, stairs and switchbacks, keeps, needle towers, great halls
    and chapels. What makes a citadel read from afar: a tiered mass rising to one spike
    (retaining walls, curtains, the keep, its needles), the inner walls higher than the outer,
    sheer battered retaining walls, machicolations' shadow lines, steep slate cones. The free kits
    (Kenney's Castle Kit 2.0, Quaternius's Medieval Village MegaKit, both CC0) were looked at and
    not taken: toy proportions and flat colours, more triangles a metre of wall than boxes and
    merlons, another material and more draws; the citadel's parts are built in code with the
    atlas instead. Of the textures (Poly Haven's `castle_wall_slates`, `castle_wall_varriation`,
    `mossy_stone_wall`, CC0) none is needed yet: the atlas's coursed stone serves; a second,
    sharper array texture for the gate passage and the keep's foot is left for M7j's weathering
    if pictures show it's wanted.
  - **Laid out** (core/setpieces/citadel.js `layoutCitadel`, exact maths): three wards up a hill
    (outer 12 or 14 sided, 76 to 82 m to its walls' faces, 8 m walls; middle 8 sided, 53 to 57 m,
    10 m, 8 to 11 m higher; inner square, 24 to 27 m, 12 m, 8 to 11 m higher again), towers at
    every corner standing out a third of their radius (outer 4 m round under battlements, middle
    5 m and inner 6 m under crowns and slate cones), its gates a quarter of the way round each
    from the last, a stair up to each inner gate (and round the outer ward a moat: below); the inner
    close with the keep in its back corner (16 to 19 m, 34 to 40 m high, needles 13 m over it
    under 16 m spires: the top 90 m or so over the land), the great hall and the chapel round it;
    lean-to ranges in the lower wards clear of the next ward's walls and towers.
  - **Set down** (core/sites.js `#citadelAt`): on its own footprint (`outlineOf`) up to 192 m off
    its spot, high and where its land's level enough (14 m across); its hill raised 7 m and eased
    out over 40 m, a regular polygon pad a ward (ground.js: polygon pads, `sides`, `apothem`,
    `turn`, a `level` given), each inner ward's eased up inside its wall's face under its
    retaining wall; its squares (inside its outer wall, under its outer towers and the outer
    gate's, its bridge and gate tower) blocked, not seen through, paved; each part a piece drawn by the chunk
    it stands in. `NET_VERSION` 29.
  - **Built** (world/art/kits/citadel.js): retaining walls battered 1 in 6 all the way down with
    the curtain on them; merlons 1.4 by 1.8 m at a 2.1 m pitch on a 1.1 m parapet; crowns of
    machicolations (two courses of corbels under a parapet standing out 0.7 m, dark beneath) on the
    inner wards' walls and towers, the gatehouses and the keep; the outer gate between twin round
    towers with a deep passage; gatehouses over the inner gates; switchback stairs;
    the great hall, the chapel with its apse and flèche, the keep with its two needle towers and
    two bartizans and its door in a forebuilding; lean-to ranges. About 35,000 triangles near, a
    part a step as its chunk's drawn; about 1,500 from afar (far/shapes.js `citadelShapes`, a dark
    band where each crown stands out).
  - **The moat, the drawbridge and the gate tower** (the user, with the first pictures: "There
    shouldn't be hedgerows and fields going right up against the Citadel, add a moat and
    drawbridge with a gate tower on the near side of the drawbridge from the castle"): the
    barbican gave way to a moat round the outer ward (15 m to its far bank's foot, its bed 4 m
    under the outer ward, its water 1.4 m down), dug into the hill's top, a glacis of 12 m beyond
    it at the outer ward's level before the hill falls away; the outer wall and its towers rise
    out of it on battered feet, its far bank faced with stone. Over it at the front the drawbridge
    let down from the outer gate on its chains, a pier, two stone spans, and on the far bank the
    gate tower over the bridge's end (crowned, turrets at its outer corners, a slate roof). The
    moat is the world's own water (its squares still water at its own level: sites.js `moatAt`,
    `moatLevelAt`, the overworld's `surfaceAt`), so it's drawn with the rivers' and lakes' shader,
    shores and depth, and on the minimap. Round the citadel, out to its glacis's corners, the hill's
    fall and 20 m more (about 170 m), no fields, hedges or trees (`clearedAt`; the far fields'
    shader too, `FIELDS_CLEAR`). The citadel's now set down as the world's made
    (`settleCitadels`, 100 to 200 ms), as its moat and cleared ground are wanted from afar. Seeds
    1, 2, 3, 7, 11 and 23 all find room. Pictures sent in the session.
  - **The moat round** (the user, with the moat's pictures: "The moat shouldn't have angled edges
    and there look like water is visible under the border"): the moat was the outer ward's
    polygon grown out, its far bank eased up over 2.5 m with the coping part way up it, so the
    water reached past the coping and showed under its edge (the coping had no back). Now round:
    its far side a circle 10 m out past the outer towers' faces, a curved wall of stone 2.4 m
    thick (16 stretches of a lathe, battered, a dark band at the water, a coping with a back going
    down into the glacis), the bed dug out to its face and eased up to the glacis steeply inside
    the wall (the ground's 1 m lattice spreads it a metre and a half, still inside the wall and
    under the water at its face: the ground there 0.66 m or more under the water on seeds 1 to 3);
    the moat's squares on in under the wall (never waded, though the glacis stands over the water
    there), and 2 m behind it built ground (blocked, solid, seen over), so the cliffs' rock isn't
    drawn on the steep ground under it (it had poked through the coping). The gate tower stands
    0.6 m out into the water, the counterscarp's gap hidden in it; from afar the water a ring of
    24 stretches. About 1,500 triangles more near (37,000), 120 more far (1,750). Before and after
    pictures sent in the session.
  - **On the way:** a first build (v1: wards 56 to 64, 38 to 44 and 17 to 20 m, towers on the
    walls' corners, a keep in the middle with four needle towers, straight stairs) was looked at in
    pictures and redone with the research's measures: the keep moved to the close's back corner
    for the hall and chapel; towers stand out from the walls; stairs double back so they fit
    between a gate and its ward's towers. The outer ward with 10 sides had towers 52 m apart: 12
    or 14. A square footprint near a road found room for one castle in four: its own outline, and
    192 m to look in. The open-topped towers' crowns showed a black disc (a capped shadow ring's
    top): the shadow's now a ring facing down only. v1's merlons round a round top were turned the
    wrong way between the four quarters (laid with the angle's sign flipped): turned with the
    ring.
  - **Pictures:** seed 1's citadel before (main: the old castle 180 m off, small) and after, from
    260 m, over the outer gate, over the inner close, from 230 m south; the middle gate up its
    stair, the middle ward's gatehouse, over the inner gate; then with its moat: through the gate
    tower, the drawbridge from beside, the moat along its walls, over the moat to the gate tower,
    from afar over the cleared ground; sent in the session.
  - **Tests:** test/citadel.test.js (laid out: wards, sides, sizes, rises, towers clear and
    spaced, gates a quarter round, the keep at the back, hall and chapel clear of it and in the
    close, stairs clear of their towers; parts; set down clear of roads and water on seeds 1, 2, 3
    and 7; terraces levelled, the moat dug and the hill eased out, the glacis up to the far side's
    coping all round; the moat round, its far side's stretches on one circle, 10 m at the least past
    the outer towers; the moat's squares water on in under the far side's wall and built ground
    behind it; its squares (walls, towers, bridge, gate tower) blocked,
    opaque and paved, its moat water too deep to wade at its own level, open outside, no fields
    or hedges on the ground it keeps clear; pieces by chunk; built in its budget with the keep's
    spires highest; from afar under 2,000 triangles); test/flats.test.js (the castle's middle on
    its inner ward's terrace, each ward higher, the moat's bed below the glacis); e2e (seed 1's
    citadel drawn, the keep's spires over it, its terraces' heights, its gate, gate tower and moat
    in the way, the ground before it open).
  - **End-to-end tests, steadier** (main's e2e shard 3 had gone red on time): in software the
    GPU process, shared by every page in a browser, does a page's drawing in its own time, so a
    test that asks for frames faster than they're drawn left a minute's backlog for the next. Each
    test now has a browser of its own (`e2e/fixtures.js`); every test draws at half the screen's
    pixels each way (a frame a fifth quicker or more), but for the two that check the pixels
    themselves; the poison test steps the game itself rather than waiting on live frames. Seed
    4242's citadel found no room within 192 m and the far silhouettes then met a null spot: the
    citadel now looks again out to 320 m, and silhouettes skip a site with no spot. The whole
    suite one test at a time here: 68 of 70 passed in 47 minutes, and the two others, since fixed,
    pass.
  - **Next:** the M7 summary report; then M7j, foliage palette, grass ring, weathering.
- **2026-10-03, the M7 summary report** published (a page of each part's before and after
  pictures, the extras along the way, what's left and the budgets; sent in the session). It says
  plainly that none of M7's costs was measured on a phone: the cascaded-shadow step starts with
  that measurement.
- **2026-10-03, M7j-1 built: the trees' leaves coloured by their land, and great lone oaks** (§9
  row 8: "canopy palette per region; gnarled great lone trees"; docs/WORLD.md *Trees*, *Great lone
  trees*).
  - **The canopy palette** (world/canopy.js `CANOPY`, `canopyTint`): each land two or three
    colours, multipliers on the light the leaves' own pictures give (so each kind keeps its green
    under it), weighted: the farmland's and meadows' own greens with warmer ones and here and there
    a golden tree; the woods' deeper greens; the heath's bronze; the marsh's and the elfwood's
    bluer greens (the elfwood's silver-gold too); the darkwood's violet-dark; the savannah's dry
    olive; the jungle's saturated green; the badlands' dust; the volcanic land's ash and rust; the
    tundra's cold greens and golden birches; the snow's and mountains' cool greens. Picked by a
    hash of the trunk's spot, each tree a little (up to 8%) lighter or darker than its
    neighbours; a golden or bronze colour only on broadleaved trees (never a pine or a spruce);
    the peoples' own trees (`HOME_TREES`) keep their own colours, lighter or darker only. The
    near trees take it in the woodland's batch (`BatchedMesh.setColorAt`, its colours made with
    the batch so the leaves' shader's made at load with them), the start town's in their leaves'
    vertex colours (`plantTrees`' `tint`, `buildTown`'s `landAt`), the far trees in their cards'
    colour (far/trees.js), all from the same function, so one turns into the other unseen.
  - **Great lone oaks** (core/lonetrees.js `loneTreesOf`, kits/trees.js `greatoak`): one tried in
    every 128 m square, in its own spot two metres or more inside its chunk; kept in open land (a
    meadow 0.55, farmland and heath 0.45, tundra 0.2) with no water, on ground rising no more than
    1.6 m across its crown, 24 m from a settlement's edge and 64 from a place, and off the fields'
    sown strips (`fieldAt`, as the overworld sows them): 251 on seed 1 (198, 247 and 240 on seeds
    2, 3 and 7), worked out once as the world's made (80 to 170 ms). Each a great oak, three ways
    grown: 13 to 16 m high, a short trunk more than twice as thick for its height as an oak's,
    breaking low into eight to ten great crooked limbs reaching up and out, the crown wider than it's high, an
    old oak's grey lichened bark, deep roots. Its trunk fills the sixteen squares round its point
    (blocked, opaque) and the navigation meshes carve it 2.4 m across (`LONE_TRUNK`). The land's
    other trees keep 16 m off every one (planted or not), near and from afar, so each stands alone.
    From afar its own card (`FAR_TREES.greatoak`: 13.5 m, a round crown 1.3 times as wide as an
    oak's share). `NET_VERSION` 30.
  - **Looked at first** (a tree preview, each grown three ways beside an ordinary oak): the first
    great oak's crown sagged to the ground round a hidden trunk, a big bush; its trunk was made
    taller before it breaks, its limbs reaching up as well as out, its leaves only on their outer
    parts; then its crown widened.
  - **Cost:** a great oak's 2,400 to 2,600 triangles (wood and leaves), its shell's 180 into the
    shadows; in the woodland's batch with every other tree, so no draw of its own. The leaves'
    colours: one small float texture (4 numbers a tree) read once a vertex. The far trees' colours
    cost nothing more.
  - **Tests:** test/lonetrees.test.js (lone oaks: how many, the same every time, in open land on
    gentle ground off water, places and sown strips, one a square, inside their chunk; planted
    with their sixteen squares blocked, no other tree within 16 m near or far, their own card from
    afar; the palette: every land's, its commonest near its leaves' own green, picked by the
    spot, golden only on broadleaved trees, the peoples' own kept, the far trees' colours the near
    ones'); test/trees.test.js (the great oak among the kinds, after the peoples' own; its roots
    deeper); test/overworld.test.js (a lone oak allowed among a land's own kinds).
  - **Measured** (Medium, the pictures' spots on seed 1, before and after): draw calls and
    triangles the same within what differs run to run as the land streams in (meadow 88 and 87
    calls, 530 thousand triangles both; woods 103 and 103; the most apart, jungle's 164 and 173,
    no lone oak within 450 m of it); no new shader made as the player walks out of the town or
    into the taproom (the e2e).
  - **Next:** M7j-2, a denser grass ring round the player and gusts of wind through the grass.
- **2026-10-03, M7j-1 merged** (#162), CI green on all nine checks.
- **2026-10-03, M7j-2 built: a thicker grass ring round the player, and the wind's gusts** (§9 row
  9: "denser inner ring; wind gusts; drifts per region"; docs/GAME.md *Tall grass*).
  - **The inner ring** (grass.js `GRASS_BANDS.inner`, view.js `QUALITY.grass.inner`): a third band
    of clumps, 0.35 m apart (the near band's 0.5), eight blades each, its hashes salted so its
    clumps aren't the near band's, out to 6 m on medium and 9 m on high (none on low), thinning
    to the near band's alone over its outer half. The grass where the camera looks closest is
    about two and a half times as thick.
  - **One wind** (world/wind.js): `WIND_WAY`, the way the smoke already leant, now the flags'
    breeze (cloth.js `BREEZE`), the fires' (`FIRE_WIND`) and the grass's (it leant a slightly
    different way before). `windGust(x, z, time)`: two octaves of smooth noise, stretched across
    the wind (9 m along, 16 m across) and carried downwind at 5 m a second, changing shape as it
    goes; at any moment about a fifth of the land in a gust of half strength or more. The same in
    GLSL (`WIND_GLSL`), the hash in whole numbers (checked against the GPU in Chromium: the same
    to 1/255, where a float hash differed on a quarter of the cells).
  - **What takes it:** the tall grass and the crops (`GRASS_GUSTS`: half their height further
    downwind at the tip, pressed a quarter lower, tips up to 60% paler), so a wave runs through
    them; the ground past the blades and the fields' standing crops (ground.js `GROUND_GUSTS`, up
    to 30% paler, worked out at the ground's corners and passed on), so the waves run on across
    the fields out of the grass's reach; the undergrowth (atlas.js `WILDS.gust`: tossing 1.2
    times harder and leaning as much again); the trees' leaves (kits/trees.js `TREE_GUSTS`:
    stirring 1.5 times harder, leaning downwind up to 2.5 times their sway, in the world's frame
    whichever way the tree's turned).
  - **Drifts per region:** already there (kits/wilds.js: each land's own flowers, in drifts of
    one kind from smooth fields across the world), so nothing added.
  - **Cost** (the pictures' spots on seed 1, medium): the inner band about 31,000 triangles and
    one draw (farmland eye 615,500 to 647,900); the gusts a smooth noise at each blade's corner,
    each leaf's, each undergrowth corner and each ground corner, and a multiply a ground pixel.
  - **Tests:** test/wind.test.js (one way for smoke, flags and fires; gusts on a fifth of the land
    or so however long the game's run; carried downwind at their speed, longer across the wind
    than along it; the grass, leaves and undergrowth shaders made with them); test/grass.test.js
    (three bands on medium and high, the inner closer-set and salted, none where the quality has
    no inner). e2e: walking out of town, the mountains, the bridge, the tavern (no new shader made),
    keeping up, the building lab.
  - **Next:** M7j-3, weathering on the peoples' buildings and a glow under lit windows.
- **2026-10-03, M7j-2 opened as #163** (CI green; left for review: merging it myself was flagged
  by the permission system, so from here the merges are the user's).
- **2026-10-03, M7j-3 built: the peoples' buildings weathered as kept, ivy on some cottages, and
  lit windows' light on the ground** (§9 row 10: "extend `weathering()` in `peoples/kit.js` and
  `house.js` … ivy leaf quads"; the lit windows' entry above: "a cheap glow on the ground under
  each would do"; docs/GAME.md *Houses*, *Lit windows*).
  - **Weathering** (peoples/kit.js `WEATHERING`, `wallWeather`, shared by `weathering()` and
    house.js's): damp rising up a wall's foot, darker and a little brown-green (from 0.15 m, gone
    by 0.95 m), and on a wall facing north as the building stands (`weathering`'s `facing`: each
    people's house passes its piece's) a little green in patches low down (to 0.4 m, gone by
    1.8 m). Damp only rises from the ground: walls up on platforms and stilts (the elves', the
    lizard folk's) start above it. None on the war camps' tents (`damp: false`). The heights are
    tone bands, so walls are cut there and drawn as worked out. A wall's foot about a tenth
    darker than before, over the grime it had: tidy, not ruined.
  - **Ivy climbing** (kits/ivy.js `ivyClimb`, `CLIMBING`; house.js `climbingIvy`): on about three
    of ten human houses (not the back buildings), a patch 1.1 to 2.4 m across climbing a bare
    stretch of a side or back wall from its foot, up to 0.55 to 0.9 of the ground floor's
    height, rounded over its top; never on the front, within 0.3 m of an opening, or across the
    middle of a gable end with a chimney. Its own random numbers, so every house is otherwise as
    it was. The castle's walls still have none (test/neutral.test.js).
  - **The windows' light on the ground** (world/windowpools.js `poolsMesh`, `WINDOW_POOLS`;
    atlas.js `windowSeeds`' `panes`, `PANES`, `WINDOW_ON_GLSL`): as a building's merged, its
    windows' upright panes are found (each pane's middle, which way it lies from its corners'
    spread on the ground, facing out from the building's middle; not a lantern's box or a
    bottle), and each throws a pool of warm light on the ground in front of it (1.6 m out at the
    wall's foot to 3.4 m from 4 m up, fainter the higher; none over 7 m), lit, going out and
    flickering with its own window through the same GLSL function as the glow. One mesh a
    chunk (and the start town), additive, lying 4 cm over the ground; hidden by day (no draw),
    fading out from 35 to 80 m; its shader made at load in the chunks' primer.
  - **Cost:** houses 2 to 16% more triangles for the bands and ivy (40 houses each: humans 2,245
    to 2,447, elves 2,917 to 2,963, cat folk 860 to 995), no more draws by day; at night one
    draw a settlement chunk for its pools, about 24 triangles a lit window.
  - **Tests:** test/weathering.test.js (damp at the foot and none above; green only on walls
    facing north as built and turned, in patches, none high up; none on tents, their walls not
    cut; climbing ivy on about three houses in ten, low on a side or the back, never the front,
    the same every time; a house's panes upright and facing out, each with its glass's seed; a
    lantern's box none; the pools on the ground in front of their windows, none from too high,
    further and fainter from higher, lit by WINDOW_LIGHT through windowOn, hidden by day,
    facing up). e2e: the building lab (7), walking out of town, the mountains, the bridge, the
    citadel, the tavern (no new shader made), keeping up, the hired adventurer, the minimap's
    buildings.
  - **Next:** M7k, the whole frame measured on the phone's profile, and cascaded shadows only if
    they fit.
- **2026-10-03, M7k: the whole frame measured on the phone's profile; no second shadow cascade;
  the shadow maps drawn with only what they need** (§13 budgets; docs/GAME.md *Shadow maps drawn
  with only what they need*).
  - **How:** 22 spots on seed 1 (the ten lands and a village and a town of each people), the
    game's own follow camera, Medium, 874 by 402 points at three times (1311 by 603 drawn, as
    Medium's 1.5 has it), settled 6 frames, then the middle of 8 frames and the worst; every
    draw counted by its pass (the near world, the far land, the sun's shadow map, the lamps' cube
    maps), a batch's trees as it draws them; then the sun's map widened to 60 m and 100 m, as a
    second cascade would draw.
  - **Found, before:** a frame 86 to 140 draws (budget 250) and 385,000 to 708,000 triangles
    (budget 500,000), over at 13 spots. The sun's map 22 to 61 draws and 66,000 to 281,000
    triangles of it. A lamp's shadows, drawn again every 4th frame on Medium, up to 103 draws and
    1,048,000 triangles (an elven town: its chunk's buildings, one merged mesh, drawn whole into
    each of the cube's six maps), a frame then 222 draws and 1,757,000 triangles. A creature out
    of view behind the camera drew 40,000 to 80,000 triangles into the sun's map.
  - **A second cascade doesn't fit:** a map out to 60 m drew 36 to 91 draws and 77,000 to
    555,000 triangles (100 m: 43 to 101 draws, 84,000 to 742,000); even drawn with only what it
    needs (below), 28 to 51 draws and 76,000 to 443,000 (100 m: 33 to 60, 83,000 to 629,000), on
    top of frames already over budget, and one more texture in every lit shader (the ground reads
    14 of an iPhone's 16). Not built; far relief stays with the far land's slope shading.
  - **Built instead: shadow maps drawn with only what they need** (world/shadowpasses.js): a
    merged mesh keeps where each building is in it (town3d.js `joined`, `runsOf`), and a lamp's
    maps and the sun's draw only the buildings in their view; something small is drawn into the
    sun's map only if its shadow may fall where the camera looks. Both answered where three.js
    asks a mesh whether it's in a shadow camera's view (`Mesh.intersectsFrustum`, with that
    light's frustum: `watchShadows`), so nothing seen changes.
  - **After:** a lamp's shadows drawn again 21,000 to 207,000 triangles (elven town 1,048,000 to
    207,000; cat folk's town 360,000 to 92,000; orcs' town 359,000 to 76,000), the worst frame
    of the elven town 1,757,000 to 873,000 triangles; the sun's map 52,000 to 186,000 (marsh
    281,000 to 84,000, woods 204,000 to 129,000, tundra 151,000 to 79,000). A frame 83 to 141
    draws, 368,000 to 665,000 triangles: still over 500,000 at 9 of the 22 spots (meadow 618,000,
    elfwood 582,000, darkwood 598,000, jungle 616,000, an elven village 591,000 and town 665,000,
    a dark elves' village 559,000, the lizard folk's village 508,000 and town 528,000), most of
    it the near world's tall grass (129,000 on Medium) and undergrowth (up to 171,000 in the
    meadow) and the trees' trunks in the sun's map (the darkwood's 86,000). Draws are well within
    their budget everywhere.
  - **Not done:** Medium's grass and undergrowth trimmed to the 500,000 (it would thin the look
    the user chose), and the trees' trunks left out of the sun's map when their shadows can't be
    seen (a batch culls its trees itself). A phone's own frame time (the debug overlay's GPU
    timer) is what would say whether Medium's 500,000 is the right line.
  - **Pictures:** before/after at the marsh, the woods and the darkwood by day and the elven,
    orcs' and cat folk's towns at night, the shadows the same (sent in the session).
  - **Tests:** test/shadowpasses.test.js (a run for each building, things in none together while
    close, every corner in one; a chunk's merged buildings keep theirs; a lamp by one building
    draws only its runs, as parts, and the mesh is as it was after; the camera's view and a lamp
    by neither; something small into the sun's map only if its shadow may fall in view, out of
    view to the side with its shadow falling in, never something big; a mesh of several
    materials left as it is).
  - **Next:** M7.5, places worth finding.
- **2026-10-03, M7.5 broken into its steps** (§8 *Places worth finding*):
  - **M7.5a-1:** every place on the maps, and who holds it (the war's record of what's been
    cleared, retaken after a while).
  - **M7.5a-2:** outlaws and the dead at their places (as many and as strong as the place is big
    and its land dangerous), a leader stronger than the rest guarding a chest; clearing it.
  - **M7.5a-3:** a guild mission for each place held by outlaws or the dead.
  - **M7.5b:** the places of any size entered and explored (castles' courtyards and keeps, manors,
    abbeys, watchtowers' floors, caves, the dragon's lair), their occupiers inside.
  - **M7.5c:** the friendlies' shops; ghosts and wraiths at the ruins, a greater one with its relic.
- **2026-10-03, M7.5a-1 built: every place worth finding on the maps, and who holds it** (§8;
  docs/GAME.md *Places worth finding*, *Who holds them*). The user, on the castle between two
  human towns: "It didn't show up on the minimap."
  - **Places** (core/places.js `placesOf`, `PLACE_KINDS`): every site in the plan (each people's
    castle and own places, the watchtowers, ruins, caves, shrines, stones, ruined castles and the
    dragon's lair) and every wild camp, each with its size (small, medium, large: for how many
    hold it, next), its icon and who may hold it.
  - **Who holds each** (`heldAtStart`, `holderOf`): a people's castle theirs; their other places
    theirs or outlaws' (about a third, `PLACE_TIMES.taken`, by the world's seed and the place's
    id); a wild watchtower and a cave outlaws'; the ruins and ruined castles the dead's; the lair
    the dragon's; shrines and stones no one's. Cleared (war.js `clearPlace`: `places`, kept with
    the war, an old war's none), it's empty 120 turns (two days of the clock), then held again.
  - **On the maps** (app/mapicons.js: 16 new icons, `PLACE_RIMS`; game.js `placeIcons`): on the
    minimap every place in its view, where it stands once set down (sites.js `placedAt`; a camp
    where it's pitched, overworld.js `campPlacedAt`), rimmed in who holds it; on the world map
    those within a chunk of where the player's been.
  - **Versions:** `NET_VERSION` 31 (the war's snapshot carries what's been cleared).
  - **Seen, not fixed:** a wild camp on seed 1 is pitched inside the human citadel's cleared
    ground (camps keep off roads, not off the sites: overworld.js `campAt`); for M7.5a-2, where
    camps and places are put out together.
  - **Pictures:** the minimap at a ruin, the citadel, a cave, a watchtower, a shrine and the
    stones, before and after, and the world map (sent in the session).
  - **Tests:** test/places.test.js (every site and camp a place with an icon that's drawn and who
    may hold it; held at the start as the war has it, about a third of a people's places taken,
    the same every time; cleared empty a while then held again, a people's own never; cleared as
    the war keeps it, carried on from its snapshot, an old snapshot's none). e2e: the places near
    on the minimap and on the world map once the player's been by, rimmed in who holds them, a
    cleared one grey till it's held again; a building gone into still marked as it was.
  - **Next:** M7.5a-2, outlaws and the dead at their places, a leader and a chest.
- **2026-10-04, M7.5a-2 built: outlaws and the dead at their places, a leader by a locked chest,
  cleared for what's in it** (§8; docs/GAME.md *Held, in play*).
  - **The band** (core/host.js `#places`, places.js `PLACE_BANDS`): near a player (90 m), a place
    held by outlaws or the dead puts out its band round its heart: 3/5/7 by its size, one more for
    every 3 tiers of the land's danger, at the land's tier, territorial, each going for anyone
    within 10 m (`guard`, a new option for the wild's creatures: a territorial creature with no
    guard only fought back); let go once every player's 180 m off. Not counted among the wild's
    creatures about a player, nor sent off at daybreak.
  - **The leader:** 2 tiers above the band, in the middle: the bandit chief (creatures.js
    `banditChief`, new: looks, spoils, the bestiary lab) or the wight lord.
  - **The chest** (ground `chest-<place>`, `locked`, never lying out too long: `until` null, so a
    saved game keeps it): on the free ground nearest the leader (not inside a tower's wall);
    tapped while held, refused ("locked"). Drawn (world/drops3d.js) as an iron-bound wooden chest
    (body, rounded lid on a board, two iron bands, rim, lock plate; open: the lid thrown back, a
    dark inside, gold heaped in it).
  - **Cleared:** once every one of the band has fallen, checked after all that fell in the same
    step (so "cleared" is told last): the war clears the place (`clearPlace`; the dragon's lair and
    the ruined castles too when their master falls, their master not back till it's held again),
    the locked chest goes, and each player within 39 m has their own share of a chest's loot
    (progress.js `LOOT.chest`, gold a third more for each tier above the first) in it, open; the
    HUD says so (game.js `#cleared`: "The dead of Peningmoor are laid to rest, for now.").
  - **Kept:** the host's held places with its snapshot (`held`), restored; `NET_VERSION` 32.
  - **Cost** (the phone's profile, Medium, steady frame; before → after, draws / triangles): at a
    ruin 99 / 465k → 115 / 655k; at a cave held by six bandits 152 / 702k → 238 / 1.14M; at a wild
    tower 97 / 464k → 129 / 625k. A band of people, close by, costs what a camp's does: each about
    36k triangles drawn, and again into the sun's shadows (garments and bodies at full detail till
    they're under 140 pixels tall). Over the triangle budget near a band of outlaws; for M8 (the
    Vitruvian characters), with the characters' shadows from their lower-detail bodies.
  - **Pictures** (sent in the session): a held ruin, cave and wild tower before and after; the
    chest close up at the ruin and the cave, held and then cleared.
  - **Tests:** test/places.test.js (the band near a player, as many and as strong as the place
    and its land, the leader stronger, all guarding, coming at the player; the chest on open ground
    in its middle, locked; let go once far, the chest with them; put to the sword: cleared, told
    last, the war keeps it, the share the player's own, none back while it's empty, held again
    after; carried on exactly from a snapshot). e2e: a ruin's band and its chest drawn, tapped
    locked, put to the sword, cleared on the map and the chest open, the HUD saying so.
  - **Seen, not fixed:** the wild camp pitched inside the citadel's cleared ground (seed 1), as
    before.
  - **Next:** a free animated chest model in place of the drawn one (the user's ask), then
    M7.5a-3, a guild mission for each place held.
- **2026-10-04, M7.5a-3 built: the guilds' contracts to put a place's holders to the sword** (§8;
  docs/WAR.md the guild's board, docs/GAME.md *Held, in play*).
  - **On the board** (core/standing.js `offerContract`, kind "clear", `REQUESTS.clear`,
    `CLEAR_REACH`): a place within 3 km of the guild's town held by outlaws or the dead (not
    cleared, not one the player carries already), as often as the camp outside: "Outlaws hold
    Peninggate, 0.8 km south-west of Redemoor, and rob all who pass. Put them to the sword, their
    chief with them." / "The dead walk at Zolazul, 2.4 km west of Norleywick, … Lay them to rest,
    the wight lord that leads them with them." (which way by the compass, `compass`).
  - **Pays** 30 gold, 25 more for a middling place and 60 for a great one, 9 for each tier of its
    land's danger (as from the town), and half the time a tome from the guild's library.
  - **Done** (host.js `#clearedBy`) when the place is cleared with the player within 39 m of its
    heart: its band and leader put to the sword, or a ruined castle's master felled; then back to
    the guild for the pay, as any contract. Cleared without them (`#check`): it comes to nothing.
  - **Marked** on the world map where the place lies (standing.js `whereTo`, its `at`); the journal
    says what's to do (`progressOf`).
  - **Tests:** test/places.test.js (the contract: a place near held, which way it lies, paid by its
    size and danger, not offered again once carried or cleared; done once put to the sword with the
    player there, a cave's band and a ruined castle's master; nothing if cleared without them);
    test/news.test.js (the board's kinds, with the place near when there is one). e2e: the guild,
    the town hall's work and the journal, hiring an adventurer, an envoy (all passed).
  - **Next:** the chest model the user asked for, then M7.5b (the places entered and explored).
- **2026-10-04, the places' chest a model, opening as it should** (the user: "Go try to find a
  model of a good chest with animations. There is probably a free one out there.").
  - **Looked for** (a researcher, free only, nothing bought): CC0 and MIT first, glTF, a phone's
    budget. Most asset sites are blocked from here (Quaternius, Poly Pizza, itch.io, Kenney,
    OpenGameArt, Sketchfab, Poly Haven); GitHub isn't. Found: the JMI 3D Toolkit's treasure chest
    (vidarr101, MIT; planks and iron straps, a hasp, ring handles; 952 triangles, 512²/256² maps,
    174 KiB; a separate lid and its own "Open" clip, 0.75 s), KayKit's Dungeon Remastered chest
    (CC0, but toy-like and with no clip), a PS1-style one (CC-BY); seen, not fetched: Theo Kain's
    "Medieval Treasure Chest - animated" (CC-BY, 1.8k triangles, realistic and grimy: a fair
    alternative if fetched by hand) and Quaternius' Fantasy Props MegaKit (CC0, chests).
  - **Used:** the JMI chest (client/models/jmi: chest.glb unchanged, its LICENSE, where it's
    from; README credits), downloaded with the game (the manifest's "models" group, "Things in the
    world", read through the loader as the other data: models.js `loadGltf`). world/drops3d.js
    draws a place's chest as a copy of it (1.3 times: 0.85 m across), shut while held; the share
    in it once cleared plays its "Open" once and stays open, on a heap of gold (lumpy, as coins).
    The chest made in code stays, till the model's read or if it can't be.
  - **Cost:** 5 draws a chest (wood, inside, iron; the lid's wood and iron), about 950 triangles;
    a chest at a place at a time.
  - **Pictures** (sent in the session): the ruin's chest held and cleared, and the cave's
    cleared, the chest made in code against the model.
  - **Tests:** test/manifest.test.js (the models group, the chest in it); e2e: the loading screen's
    seven groups, the held place's chest locked then open.
- **2026-10-04, fixed: wild camps pitched on a place's ground** (seen in M7.5a-1: seed 1's camp-3
  inside the human citadel's cleared ground; and camp-60 on top of the standing stones 96 m from its
  cell, the flattest ground near). overworld.js `campAt`: a camp keeps off the settlements', the
  sites', the arches' and the piers' ground (`clearings`) with its own room besides, and looks
  three times as far (`CAMP_FARTHER`) if all within its reach is theirs. Seeds 1 to 3: none on a
  place's ground now (2 before). test/flats.test.js: every camp clear of them, at most two further
  than the flats' reach.
- **2026-10-04, the chest's gold a heap of coins** (the user: "The gold can look better. See if
  you can do some research on how to create a realistic pile of gold and use that"; before, one
  lumpy half-round, a smooth yellow blob).
  - **Researched** (a researcher, with a working prototype; scratchpad notes): what makes a pile
    read as coins at 2 to 8 m (round silhouettes and rims, many flat faces each catching the light
    its own way, dark gaps, a broken outline, coins tilted and on edge, a few spilt), how games
    build them (a heap with a coin texture under loose coins on top), gold's values (linear
    (1, 0.77, 0.34); deeper, (1, 0.72, 0.30); metal through and through, rough 0.25 to 0.45), and
    why gold under a blue sky goes olive (what a metal reflects it tints with its own colour; the
    game's outdoor environment is the sky), glints that twinkle rather than flicker, what a phone
    can afford (no bloom: no post-processing here, 1.5 to 3 ms a frame for one prop).
  - **Built** (world/gold3d.js, drawn by drops3d.js in the open chest, and in the chest made in
    code): the coins let fall one at a time onto a height map of the chest's inside (3 mm cells),
    each resting on the highest of what's under it, tilted as that lies (no steeper than 37°), a
    few on edge leant against the rest, what each covers raised by its thickness: about 400 coins
    3 cm across, over a domed heap that rises 2 cm over the rim in the middle; five spilt on the
    rim, seven on the ground. Each coin redder, paler or more worn than the next (a few silver and
    copper), darker where buried or by the chest's sides; a rim, a ring of beads and a cross on each
    face (64² textures made in code); under them a heap of coins only painted (a 128² tile, dark in
    the gaps). Seven cut gems (32 triangles each, lit from within a little, no light through them),
    a goblet, and 48 glints (four-pointed stars where the sun's mirrored in a coin's facet, as bright
    as the sun is, gone by 14 m). Lit as gold (`goldLit`): the sky it reflects less blue and warmer,
    the light falling on the heap coming back off the coins round about (gold twice over), and no
    smoother than its bumps can be seen, nor further off (Toksvig; at least 0.32 by 10 m), so it
    doesn't shimmer.
  - **Cost:** shared by every chest (made once, about 30 ms at load); near (to 5 m) the coins with
    ten sides, 15,000 triangles; to 14 m six sides, 9,000; further, the heap alone (1,000). Five
    draws a chest (heap, coins, gems, goblet, glints), none in the shadows. Measured at the ruin's
    open chest: +3 draws and 11,000 triangles at the follow camera's distance, +17,000 close up.
  - **Pictures** (sent in the session): the ruin's and the cave's chest, close and from the
    follow camera, before and after; round the chest; at night.
  - **Tests:** test/gold.test.js (the coins cover the chest's inside, resting on the heap or each
    other, heaped over the rim in the middle; most nearly flat, a few on edge, a few spilt; the same
    for the same seed; a draw each near, fewer sides further off, the heap alone far off, nothing in
    the shadows; the budget; the shader lit as gold); e2e: the held place's chest open on its coins.
  - **Next:** M7.5b (the places entered and explored: caves, the lair and broken watchtowers first).
- **2026-10-04, M7.5b-1 built: a cave, the dragon's lair and the broken watchtowers gone into**
  (§8 *Places worth finding*: "enterable castles and forts with interiors"; docs/GAME.md *Held,
  in play*). M7.5b is in steps, each playable: **b-1** (this) the caves, the lair and the wild
  watchtowers; **b-2** the manors, abbeys and the other peoples' halls and temples held by
  outlaws; **b-3** the castles' courtyards and keeps; **b-4** crypts under the ruins and the
  ruined castles' keeps.
  - **The way in** (core/sites.js `entranceAt`, from the layouts' `entry`: core/setpieces/neutral.js):
    a door as a building's, the squares up to it kept clear of the site's solid parts; added to the
    world's links as the site's set down (`Sites` `onSet`, overworld.js, insides.js `addSite`).
  - **The floors** (core/insides.js `caveRooms`, `lairRooms`, `towerRooms`; plans with new marks:
    "#" rock, "l" the chief's place, "g" a guard's, "h" the chest's, "u" a bedroll, "x" a fire, "j"
    bones), made as the band's put out (and again for a snapshot's `made`: host.js `#building`
    sets the site down for a `site:` key).
  - **Drawn** (world/interiors3d.js `cave`, `lair`, `tower`, `towerTop`): crags of rock from the
    plan's rock by open ground (blocks turned this way and that, leaning in, cut away in front of
    the player as walls are), a rock roof (hidden from above), daylight in the mouth and a light
    in from it, a camp fire ringed with stones, bedrolls, torches on the walls; the lair's bones,
    ember cracks and heaps of gold; the tower's stairs, rubble, broken parapet, its top open to the
    sky (view.js `setIndoors`: `open` keeps the sky) over the ground far below.
  - **Who's within** (host.js `#places`, `#inside`, `#pack`/`#rouse` on a map): the chief and the
    locked chest at the plan's "l" and "h", as many of the band as it has "g" for (half at most)
    within, the rest outside. A player within counts as at the place (`#atPlace`): the band's held,
    the chest's shares are theirs where it stood, the guild's contract's done.
  - **The dragon's hoard** (host.js `#lairs`, `#opened`; progress.js `LOOT.hoard`): a chest at the
    back of its lair, locked while it lives; opened when it falls.
  - **NET_VERSION 33** (bands and chests on the insides' maps).
  - **Cost:** the cave's floor 2,900 triangles, 8 draws (its crags, rock roof, floor, fire, things);
    the tower's two floors and the lair as little. What costs within is who's there: each person
    about 40,000 triangles, as anywhere (M8's).
  - **Pictures** (sent in the session): the cave's band outside before; in by the cave's mouth,
    the cave from above, the dragon's lair, a broken watchtower below and its top.
  - **Tests:** test/places.test.js (the band's chief, guards and chest within a cave or a wild
    tower; in by the cave's mouth, the band held, put to the sword within, the share where the
    chest stood; the dragon's hoard locked, opened when it falls; carried on from a snapshot);
    test/insides.test.js (the way in among the links, all within got to from it, the marks, a
    tower's stairs, each floor drawn, the top open). e2e: in by a cave's mouth (its band within,
    its chief by the chest, lit) and out again.
  - **Next:** M7.5b-2, the manors, abbeys and halls held by outlaws.
- **2026-10-04, M7.5b-2a built: the humans' abbeys and manors gone into** (docs/GAME.md *Gone
  into*).
  - **The way in** (core/sites.js): an abbey's or manor's landmark (its church, its keep) has its
    door as a town's has (insides.js `entranceOf`), the squares before it kept clear; added to the
    interiors as the site's set down (overworld.js `#enterSite`: insides.js `add`, the key `site:`
    and its id, named "Galingdale Abbey", "Brombridge Manor").
  - **Its people's:** its folk as a town's temple's or keep's; the manor's ruler its lord or lady
    (host.js `#enthrone`), speaking for the realm of the town nearest it (game.js `#townOf`).
  - **Held by outlaws:** its folk aren't in it (host.js `#notTheirs`, by places.js `holderOf`);
    the band's chief, chest and guards where insides.js `heldWithin` puts them (for plans with no
    "l", "h", "g": the chief before the altar or the thrones, the chest beside it, guards up the
    aisle from the door), half the band within, the rest outside.
  - **NET_VERSION 34** (new buildings out in the land).
  - **Pictures** (sent in the session): an abbey held by outlaws, fought in its nave, and from
    above (the chief by the altar, the chest beside it); a manor its people's, its folk in the
    great hall.
  - **Tests:** test/insides.test.js (the abbey's and manor's way in, clear; where outlaws holding
    them stand, each got to from the door); test/places.test.js (an abbey held by outlaws: its
    chief by the altar, the chest beside it, guards within, no priest; a manor its people's has its
    folk).
  - **Next:** M7.5b-2b, the other peoples' halls and temples held by outlaws.
- **2026-10-04, M7.5b-2b built: the peoples' watchtowers and the elves' tree hall gone into**
  (docs/GAME.md *Gone into*).
  - **Which:** surveyed every people's own place for a way in. Each people's watchtower is the
    commonest (about 22 a world, half held by outlaws) and where the friendlies' weapons and armour
    are to be sold (M7.5c); the elves' tree hall has its door already. The orcs' watchtower (an
    open deck on poles), the pits, the hatchery, the spider shrine, the spire and the shadow gate
    are open or solid: their bands stay outside. The sun temple's door is behind its altar and
    obelisk, the ziggurat's at its top: left for later, with art to change.
  - **The doors** (core/insides.js `STRUCTURE_DOORS`, `structureDoor`; `entranceOf` taking a door's
    numbers; core/sites.js: the door on the watchtower's piece, `door`): drawn in each kit's tower
    (kits/castle.js `tower`; peoples cat-places.js `bastion`, darkelf.js `tower`, elf.js `tower`,
    lizard-places.js `lookout`), only for a watchtower, so the towers on town walls are as they
    were.
  - **Fixed on the way:** the humans' watchtower (a castle's round tower, 10 m across) stood on two
    plots, drawn 2 m off its ground towards the front and over its edge: walked into. It stands on
    three now, in their middle.
  - **Within** (insides.js `watchtowerRooms`, `watchFolkOf`; world/interiors3d.js `tower`,
    `towerTop` with `look` "kept", `armoury` from the keep's racks): the guardroom and the top as
    above; a lookout and a sentry; held by outlaws, the plans' "l", "h", "g" as a broken tower's.
  - **The band outside** a place gone into stands before its way in, not round its heart (host.js
    `#places`): round the tree hall's heart, deep in its ground, the only open squares near were
    the way up to its door, and the band crowded it so it couldn't be walked.
  - **NET_VERSION 35.**
  - **Named** for the place (insides.js `addSite`: "Caeliavyn Tree Hall"; a watchtower with no
    name of its own "the watchtower"), of its people (their materials within).
  - **Pictures** (sent in the session): each people's watchtower's door from in front, the tree
    hall's; a cat folk's watchtower inside, both floors, its sentries; a humans' held by outlaws.
  - **Tests:** test/insides.test.js (every people's watchtower and the tree hall: the way in
    clear, all within got to, folk where they stand); test/places.test.js (a people's watchtower
    held by outlaws: the band's chief and chest at its top, guards below; one its people's, its
    lookout and sentry; the tree hall held by outlaws walked up and gone into, the band not in
    the way).
- **2026-10-04, M7.5b-3a built: the elves', orcs' and cat folk's castles walked into; the cat
  folk's keep gone into** (docs/GAME.md *Gone into*).
  - **Laid out** (core/setpieces/castles.js `castleLayout`, `solidAt`, `inCourt`): each castle as
    its kit builds it (world/art/peoples elf.js, orc-places.js, cat-places.js `castle`), on its lot
    facing south: what's solid (rects, discs, walls as thick segments, the orcs' bank as a ring
    with its gap), its courtyard (within the walls and the gateway), its ground and its gate. Pure
    data, exact maths; only the castles' heights are left to chance in the art, and nothing here
    depends on them.
  - **Set down** (core/sites.js `#setDown`, `unturned`): a castle's squares blocked only where
    something's solid there (a square's middle within 0.4 m of it); its courtyard's squares kept
    (`courts`, `courtAt`), given its ground in the chunks (core/overworld.js: flagstones, the
    orcs' trodden earth; no crops, so no tall grass). The cat folk's keep's door (`entry`) is cleared
    as a neutral site's (`entranceAt`), the way to it flagged too.
  - **Art:** the elves' gate walls run from the end towers to the gate's pillars (they stopped
    short and left gaps); the cat folk's gate tower has a way through it, its doors open either
    side (it was solid, a door drawn on it); the orcs' longhouse is shorter, so the yard isn't cut
    in two.
  - **The keep's realm** (core/insides.js `townOf`, used by host.js `postOf` and game.js
    `#townOf`): a building out in the land speaks for the realm of the town of its people's
    nearest it (any people's, if they've none); a castle's keep had none, its ruler no post.
  - **NET_VERSION 36.**
  - **Pictures** (sent in the session): each castle from above before (main) and after, the player
    in each courtyard, the cat folk's keep's door and its great hall.
  - **Tests:** test/castles.test.js (the layouts the same for the same lot, none for the others;
    each courtyard walked into through its gate and none of it with the gate shut; set down in
    seed 2's world, at least 98% of each courtyard reached from outside the gate, its ground the
    courtyard's; the dark elves' and lizard folk's still blocked; the cat folk's keep gone into
    from outside the gate, its ruler titled, their realm the nearest cat town's).
  - **Next:** M7.5b-3b: the orcs' motte (steps up it and the broch's door), the elves' hall
    within their castle, the dark elves' gate and terraces; then the lizard folk's temple-fortress
    and the humans' citadels' wards and keeps.
- **2026-10-04, M7.5b-3b built: the elves' and orcs' keeps gone into; every castle's gate 4 m
  wide** (docs/GAME.md *Gone into*).
  - **Which keep:** the elves' castle has no hall, only the great tree in its court: their keep is
    the tower at the back of their ring, due north, facing the tree and the gate, an ogee door
    in its foot as their watchtowers' have, a lamp either side (world/art/peoples/elf.js
    `castle`). The orcs' is their longhouse, the clan's hall (the broch on the motte is left as
    it is: its keep would want steps up the motte and a second building gone into): its door's
    already drawn, under a porch in the middle of the middle side of its south wall, a step up
    onto its plinth.
  - **Laid out** (core/setpieces/castles.js `entry`): the elves' door in the south face of the
    back tower's twelve; the orcs' worked out as the kit's lens plan has it (its sides 2.2 m
    long, the door in the middle of the middle one: with an even count of sides, a little east
    of the house's middle), its porch's two posts solid. Doors may stand above the ground: an
    entry's `floor` is its sill's height (the orcs' on their 0.7 m plinth), carried to the door
    drawn green when tapped (core/sites.js `entranceAt`, which had it at 0).
  - **The gates widened:** the orcs' castle in seed 2 is set down at a slant, and the player
    couldn't get through its gate: the bastions stood 3.2 m apart, and on the slant the squares
    blocked either side stand up to 0.7 m into the gap, the navigation mesh keeping walkers
    0.5 m off them. The bastions stand 4 m apart now, and the cat folk's gate tower is 7 m wide,
    its way through 4 m (it was 2.2 m), its doors swung back against it, the curtain walls
    ending within it (cat-places.js, orc-places.js `castle`).
  - **Walls where they're drawn:** the kits' `band` builds a wall to one side of its line, not
    astride it, and the layouts had them astride. The elves' curtain walls ran 1.6 m inward of
    the lines between their towers, so their inner faces buried the back tower's south face and
    its door: they're drawn astride their lines now (elf.js `castle`, its gate walls too), as the
    layout has them, every tower standing proud of them. The cat folk's are laid out where
    they're drawn, 2.4 m within their lines. The elves' courtyard is the polygon of their towers
    (a new `polygon` shape), out to the walls all round, not a round that only reached the
    middle of each.
  - **The way to a keep's door** is the courtyard's ground however far it reaches into its walls
    (core/sites.js: the elves' cleared into the back tower).
  - **Pictures** (sent in the session): the castles from above, the gates; the elves' and orcs'
    keep doors and great halls.
  - **Tests:** test/castles.test.js: each gate 3 m clear through (squares' middles); each
    people's keep gone into from outside its gate in seed 2's world (the orcs' at a slant), its
    way in the courtyard's ground, its ruler titled, their realm the nearest town of theirs.
  - **Next:** the dark elves' castle (its gate and terraces), the lizard folk's temple-fortress,
    the humans' citadels' wards and keeps.
- **2026-10-04, M7.5b-3c built: the dark elves' castle walked into, the Black Tower gone into**
  (docs/GAME.md *Gone into*).
  - **The gate:** their wall was a closed ring through its eight towers, no way in (the two
    spiders before it guarded nothing). It's an open run now, round from one side of the gate to
    the other, 7.6 m between them, a slender tower at each end of it (their spires 11 m up, a web
    hung between them), the spiders moved out to flank the way to it; no thorn merlons over the
    gap (world/art/peoples/darkelf.js `castle`).
  - **The keep:** the Black Tower stands on a terrace 3.6 m high, its door at the terrace's top.
    Stairs run up the terrace's south face to it (20 risers of 0.18 m, 2.4 m wide), a violet
    lamp on an iron post either side of their foot. The overworld's walking mesh is made from the
    land and the squares blocked, the terrace not part of the land, so the keep's gone into from
    the stairs' foot: an entry's `reach` is how far out from its door its way in begins (core/
    sites.js `entranceAt`; its door still drawn green where it is, up on the terrace).
  - **Laid out** (core/setpieces/castles.js `darkElf`): the wall's runs as thick as they're built
    within the lines between the towers, the towers, the gate towers, the spiders, the terrace
    (an octagon: `polygon`), the stairs; the courtyard the polygon of the towers and the gateway;
    its ground dark cobbles (GROUND.cobbles).
  - **Tests:** test/castles.test.js now also in seed 1, where every castle's set down (in seed 2
    the dark elves' has no room where it's planned), at many turns (the cat folk's at -2.68, no
    eighth of a turn): each courtyard reached from outside its gate, each keep gone into, the
    dark elves' from the foot of its stairs.
  - **Pictures** (sent in the session): the dark elves' castle from above before (main) and
    after, its courtyard, the stairs up to the Black Tower, its great hall.
  - **Next:** the lizard folk's temple-fortress; the humans' citadels' wards and keeps.
- **2026-10-04, M7.5b-3d built: the lizard folk's palace gone into** (docs/GAME.md *Gone into*).
  - **Which way:** their temple-fortress is a square platform 4 m high in its moat, the summit
    pyramid, the palace and a great tree on it, a causeway (1.2 m high) up to its stairs from
    the south: all of its courtyard's up on the platform. Making it walkable would mean raising
    the land under it (the height function, its meshes, the far land and the walking mesh all
    taking a square pad 4 m over the castle's mound): too much for what it gives. So, as the
    dark elves' Black Tower's, the palace (their keep) is gone into from the causeway's end, the
    rest solid as it was.
  - **An entry's `foot`** ([u, v] on the lot: where its way in begins, if not at its door; core/
    sites.js `entranceAt`) takes over from 3c's `reach`, which only went straight out from the
    door: the palace's door is east of the causeway.
  - **Art:** the middle of the palace's three openings is its door now, wider, with a door in it
    (world/art/peoples/lizard-places.js `castle`).
  - **Tests:** test/castles.test.js: the lizard folk's laid out, solid all through but its way
    in; its palace gone into in seed 1 from outside the causeway's end.
  - **Pictures** (sent in the session): the temple-fortress from above, before and after, the
    player at the causeway's end; the palace's great hall.
  - **Next:** the humans' citadels' wards and keeps; then M7.5b-4 (crypts under the ruins).
- **2026-10-04, M7.5b-3e built: the humans' hill citadels walked into** (docs/WORLD.md *Hill
  citadels*, docs/GAME.md *Gone into*).
  - **Which way:** decks, not the land. The citadel's terraces are already the land's (its pads);
    what wasn't walked was what's built on and over them: the bridge over the moat, the gate
    tower's and the gates' passages, the stairs up the terraces' faces. Each is a deck as a river
    bridge is (`citadelWays` `decks`: two ends on the lot, a half width, the height at each end),
    so the overworld's `heightAt` and the walking mesh take them as they take bridges, without
    changing the land's heights. A flight's deck rises from its foot to its head, its steps the
    look's (`CITADEL.stair` 3.5 m lanes, 0.18 m risers, 0.36 m treads, 2.6 m landings).
  - **What's solid** (`citadelWays` `solid`, the shapes of setpieces/castles.js): walls split at
    their gates, gatehouses, battered feet, towers, ranges, hall, chapel, the keep on its plinth,
    its forebuilding and needles, the gate tower's sides. Their squares blocked, not seen through;
    the wards' open ground paved and open.
  - **The keep's door** (`citadelWays` `door`): in the forebuilding, 2.6 m wide and 3.2 high on
    a 0.6 m sill: the keep gone into (its great hall, its lord or lady, the realm of the nearest
    human town).
  - **The walking mesh:** squares under a deck more than a metre over the ground (a stair's
    masonry) aren't walked (navigation/tiles.js), so no way's found under a flight.
  - **Tests:** test/citadel.test.js: the decks join (each flight's head the next landing's height,
    the passage at its ward's level) in seeds 1, 7 and 23; what's solid blocked and not seen
    through, a third or more of the wards' ground open; walked in seed 1 from outside the gate
    tower into the keep, standing on every ward's level on the way. e2e: the gate's and the
    bridge's ways open at the outer ward's level, the gate tower blocked either side of its way.
  - **Pictures** (sent in the session): the bridge before and after (the player in the gate
    tower's passage), a stair, the keep's door, its great hall; from above the same before and
    after.
  - **Next:** M7.5b-4 (crypts under the ruins); then M7.5c.
- **2026-10-04, M7.5b-4a built: the crypt under the ruins** (docs/GAME.md *Gone into*).
  - **The way down** (core/setpieces/neutral.js `ruins`, `RUINS.crypt`): a stair-house 3.4 by
    3.2 m against the old hall's back wall in its middle, between its columns, solid; its door
    (1.4 by 2.2 m) faces the hall's own, the site's entry (`inside: "crypt"`). The heaps of fallen
    stone against the back wall are moved off it (from the same random numbers, so the rest of
    every hall is laid out as it was). Drawn (world/art/kits/neutral.js `crypt`): gabled, of the
    hall's stone, a round-arched door onto the dark of the stair, a skull over it, ivy.
  - **The crypt** (core/insides.js `CRYPT`, `cryptRooms`; new plan marks `t` a tomb and `k` a
    stand of candles, interiors.js): 16 by 18 m, the stair at its south end, a vaulted aisle
    between two rows of pillars, three tombs a side, bones, the apse at the back with the dead's
    master by their chest ("l", "h"), four posts for guards ("g"). Drawn (world/interiors3d.js
    `crypt`): old dressed stone walls with two tiers of niches (a skull in some), the vault and
    its ribs (hidden from above as ceilings are), pillars, lidded tombs (a cross on each, one now
    and then pushed askew on the dark within), candles in iron stands lighting the apse, the stair
    rising to daylight. Its sound hushed (`sound.js` `crypt`).
  - **Held:** the dead hold it as they held the hall (host.js `#places` with `#inside`): the wight
    lord by the chest within, half the skeletons guarding the way, the rest in the hall above.
  - **Fix found on the way:** a place cleared from within (a cave, the crypt, an abbey's temple)
    wasn't said: the player had to be outside (app/game.js `#cleared` now counts the place's floors).
  - **Tests:** test/neutral.test.js (the stair-house in the way against the back wall, its door's
    way into the hall clear, no heap of stone on it, for 24 seeds); test/insides.test.js (the
    crypt's floor got to from its stair, its marks, drawn); test/places.test.js (the ruins gone
    into, the dead within, put to the sword there, the share where the chest stood); e2e: the
    ruins' chest down in the crypt, locked, then opened once the dead fall, the player told.
  - **Pictures** (sent in the session): the ruins before and after (the stair-house), the crypt
    from the follow camera and from above.
  - **Next:** M7.5b-4b (the ruined castles' keeps, their wight lords within); then M7.5c.
- **2026-10-04, M7.5b-4b built: the ruined castles' keeps gone into** (docs/GAME.md *Gone into*).
  - **The way in** (core/setpieces/neutral.js `ruined castle`, `RUINED_KEEP`): the breach the
    ruined keep's art has always had in the middle of its front, where its door was (kits/castle.js
    `ruinedKeep`), 3.2 m wide over a 0.8 m step; the site's entry (`inside: "ruin"`). The stores and
    cart its last keepers left are kept off the way to it. Its look outside unchanged.
  - **The great hall** (core/insides.js `RUIN`, `ruinRooms`; a new plan mark `m`, a heap of
    rubble, interiors.js): 20 by 16 m, open to the sky (world/interiors3d.js `ruin`, `open`): its
    walls broken off high and low, daylight through tall windows, grass in tufts between its
    flagstones, two rows of pillars (some broken short), heaps of fallen stone each with a charred
    joist, bones, the dais and its two stone thrones (one toppled), braziers burning either side,
    the land outside seen over the walls. Its sound open (`sound.js` `ruin`).
  - **Held** (core/creatures.js `LAIRS` `within`; host.js `#lairs`): the wight lord keeps within by
    its hoard (the plan's "l" and "h"), half its skeletons at the plan's "g", the rest in the
    courtyard; slain, the hoard opened, a share for each player there, as the dragon's is.
  - **Tests:** test/neutral.test.js (each ruined castle's keep gone into by its breach, the way to
    it clear, 24 seeds); test/insides.test.js (its hall got to, marked, drawn open to the sky);
    test/places.test.js (the wight lord within by its hoard, half its skeletons with it);
    test/creatures.test.js (the master within its keep, slain there).
  - **Pictures** (sent in the session): the keep's front from above before and after (the same:
    only going in is new), the great hall from the follow camera and from above.
  - **Next:** M7.5c (the castles' shops and blacksmiths, the abbey's arcane shop, the watchtowers'
    arms, the restless dead).
- **2026-10-04, M7.5c broken into its steps** (§8 *Friendlies*, *The dead*):
  - **M7.5c-1:** a people's castle's shops: its keep's undercroft, its smith, quartermaster and
    arcanist.
  - **M7.5c-2:** the smaller shops fitting the other places: an abbey's arcane goods, a
    watchtower's weapons and armour.
  - **M7.5c-3:** the restless dead at the ruins: ghosts and wraiths, a greater one with an old
    relic and a chest.
- **2026-10-04, M7.5c-1 built: the castles' undercrofts, their smiths, quartermasters and
  arcanists** (docs/GAME.md *The undercroft*; WAR.md *Shops*).
  - **Where:** a people's castle's keep (the five peoples' and the humans' citadel; not a town's
    keep, a manor's or the elves' tree hall's, which go in as keeps too: insides.js `addSite`
    keeps the site's kind, `siteKind`) has two floors: its great hall as before but for the
    stairs down in its north-west corner where the racks were (the steward's desk moved east of
    the thrones), and the undercroft below.
  - **The undercroft** (insides.js `UNDERCROFT`, a new plan mark `n` for an armour stand,
    interiors.js): 24 by 16 metres, every open square got to from the stairs' foot. Drawn
    (world/interiors3d.js `undercroft`): a groin vault, bay by bay between four pillars and the
    walls (`groinVault`: the higher of two crossing barrel vaults at each point, so its edges
    arch and its groins run corner to corner), springing at 2.5 m, its crown 3.2 m, open over
    the stairs with a dark shaft up; the smithy's works as they were, drawn by one function now
    (`forgeworks`, the smithy's too); the quartermaster's racks and two suits of armour on stands
    (`armourStand`); the arcanist's shelves of glass jars and phials, some glowing (`phialShelves`)
    and worktable with its alembic (`worktable`); the garrison's table, barrels and strongboxes.
    The great hall's floor open round a stairwell, the stairs going down into it, a parapet
    round it (`stairwell`).
  - **Its folk** (insides.js `undercroftFolkOf`): the smith and apprentice as a smithy's (their
    plan's forge, anvil, trough, bellows and grindstone; the smith talks as `castleSmith`); a
    quartermaster (roles.js, actions.js, folk.js: an old soldier in a gambeson) behind the
    counter and at the racks; an arcanist (in a robe, now and then a wizard's hat) behind theirs,
    at the shelves and at the worktable. Their talks in dialogue.js.
  - **Their shops** (progress.js `SHOPS`, host.js `SHOPKEEPERS`): the quartermaster's armoury
    (arms, shields, armour and the people's uniform, up to legendary: the only legendary make
    for sale anywhere), the arcanist's arcane goods (wands, grimoires, staves, hats, jewellery,
    draughts and cures, up to masterwork; no tomes), the smith's as a town's.
  - **Stairs either way** (insides.js `make`): a building's stairs' foot is on whichever floor
    has it (a tavern's taproom, a keep's undercroft), their top on the other.
  - **Versions:** `NET_VERSION` 37 (a castle's keep has a floor more).
  - **Tests:** test/insides.test.js (every castle's keep, the six peoples', down its stairs to
    its undercroft, every open square of it got to, its folk where they can stand, and drawn; a
    manor's and the tree hall's one floor); test/castles.test.js (into the elves' castle and down
    its stairs: a legendary sword bought from the quartermaster, a masterwork wand from the
    arcanist, each only when near them; legendary sold nowhere else, no tomes from the
    arcanist). e2e: down to the elves' castle's undercroft, the quartermaster talked to and his
    racks open, a legendary make among them.
  - **Pictures** (sent in the session): the elves' great hall before and after (its stairwell
    where its racks were), the undercroft from above and within (the forge, the armoury, the
    arcanist's shelves, the vault), the orcs' undercroft in their dark basalt.
  - **Next:** M7.5c-2 (an abbey's arcane goods and a watchtower's arms).
- **2026-10-04, M7.5c-2 built: an abbey's herbalist and a watchtower's quartermaster** (docs/GAME.md
  *The smaller places' shops*; WAR.md *Shops*).
  - **The abbey** (insides.js `ABBEY`: a town temple's plan with a counter and shelves in its
    nave's north-west corner, for an abbey only, `place` "site"; `templeFolkOf`): a herbalist
    (roles.js, actions.js, folk.js: a habit and a belt) behind the counter and at the shelves;
    drawn with a desk and the arcanist's shelves of jars turned to face the other way
    (interiors3d.js `phialShelves` `north`). Sells the abbey's goods (progress.js `SHOPS.abbey`:
    draughts, cures, amulets, rings, grimoires, up to masterwork). Held by outlaws, none of its
    folk are there, as before.
  - **The watchtower** (insides.js `watchFolkOf`): a quartermaster before the guardroom's racks,
    selling the watch's own stock (`SHOPS.watch`: plain arms and armour and the people's uniform,
    up to fine), not a castle's: one of the folk can keep a shop of their own (their `shop`),
    over their part's (host.js `#shopkeeper`, app/game.js `#openTalk`). Their talk sends anyone
    after better to a castle.
  - **Versions:** `NET_VERSION` 38.
  - **Tests:** test/places.test.js (seed 4's abbey, its people's: an amulet bought from its
    herbalist, a sword not sold; seed 2's elven watchtower: fine mail bought from its
    quartermaster, a legendary sword not sold); test/insides.test.js (a watchtower's three folk,
    its quartermaster keeping the watch's shop).
  - **Pictures** (sent in the session): the abbey's nave before and after from above, its
    herbalist at the counter; an elven watchtower's guardroom before and after, its
    quartermaster before the racks.
  - **Next:** M7.5c-3 (the restless dead at the ruins: ghosts and wraiths, a greater one guarding
    an old relic and a chest).
- **2026-10-04, M7.5c-3 built: the restless dead at the ruins** (docs/GAME.md *Held, in play*;
  WILDS.md).
  - **Who:** two new creatures (creatures.js, found nowhere but with the dead): a **restless
    ghost** (26 hit points, tiers 3 to 9: a grave-cold touch that slows, and a wail that flies
    and staggers) and a **wraith** (46, tiers 5 to 10: claws and a draining, both withering).
    Their weapons (weapons.js `NATURAL`), parts (spoils.js: a spectral veil and ectoplasm; a
    wraith's shroud and a soul shard), the wail's and draining's flight and bursts (effects.js,
    sound.js, app/game.js), and their place in the creature lab (*The restless dead*).
  - **The bands:** the dead at a ruins are their bones, their ghosts and a wraith by turns
    (places.js `PLACE_BANDS.dead.folk`, `bandFolk`), led by the wight lord, the greater one
    guarding their relic; a ruined castle's dead three skeletons, two ghosts and a wraith (`LAIRS`),
    each kind's half within its keep at posts of their own (host.js `#lairs`: no two on one post).
  - **The relic:** each share of the dead's chest, and of a ruined castle's hoard, holds one of
    their old relics (progress.js `RELICS`, `rollRelic`, `rollLoot`'s `relic`): a legendary amulet
    or ring named for whoever lived there long ago, told by name when the chest opens (the
    `spoils` event's `relic`).
  - **Drawn** (beasts/spectre.js, a new body): legless, a hooded shroud sculpted in one piece down
    to its tatters, sleeves sculpted held out so each goes with its arm; a ghost half see-through
    and aglow, its skull in its hood, casting no shadow; a wraith black, two cold lights in its
    cowl, bony claws. Each floats and glides; three ways of attacking and three of resting each;
    a ghost fades away dying, a wraith collapses into its robe. Four or three things to draw,
    14,000 to 17,000 triangles (a skeleton's 20,000).
  - **Versions:** `NET_VERSION` 39.
  - **Tests:** test/places.test.js (the dead's band by turns, all three kinds; the chest's share
    with a relic named as `RELICS` has it, and told of it; a relic's make, name and bonuses, and
    none in a chest the dead didn't guard; the ruined keep's dead within by kind); test/
    creatures.test.js (the ruined castle's guards, each kind as many as `LAIRS` has, none on
    another's post); beast-culling (both bodies held in their spheres through every move). e2e:
    the ruins' band all three kinds; the relic told of by name when the chest opens.
  - **Pictures** (sent in the session): the creature lab (a ghost's and a wraith's moves), a
    ruins' ghost and wraith in play at dusk and at night, a ghost among the crypt's coffins.
  - **Next:** the sun temple's and the ziggurat's doors; then M8.
- **2026-10-04, M7.5d built: the sun temple and the ziggurat gone into** (docs/GAME.md *Gone into*).
  - **Why these two:** the last of the peoples' own places with a building to go into but no way
    in (M7.5b-2b): the sun temple's door up on its platform behind the obelisk and altar, the
    ziggurat's only at its top. Each is a temple, so each is an abbey's temple within, under its
    people's god, with the abbey's herbalist (M7.5c-2) to buy from when it's its people's.
  - **The sun temple** (core/insides.js `STRUCTURE_DOORS`, a door with a `foot`; core/sites.js
    `raisedEntry`): its existing door in the middle tower's foot, 19.9 m in from its lot's front
    and 2.5 m up, gone into from the foot of its broad stair, 0.8 m in, as a castle's raised keep
    door is (`entranceAt`): only the stair's foot is kept clear, the platform staying solid, and
    the door's glow lifted to its floor. No art changed.
  - **The ziggurat** (art/peoples/lizard-places.js `ziggurat`): a new portal at its foot east of
    the great stair, a lime-stone plinth, red plaster walls 3.1 m high round a dark-plank door
    2.6 m high, a band of glyphs above it and a cornice; 1.6 m in from the lot's front, 0.3 m up.
    Drawn on every ziggurat, the ones in their towns too.
  - **Within** (`SITE_PATRONS`, the interior's `patron`): the sun temple Aurelia's, the ziggurat
    Ithriel's; the abbey's plan for a place worth finding (`ABBEY`, its herbalist's counter);
    its folk a priest, an acolyte, worshippers and the herbalist; held by outlaws as an abbey is
    (`heldWithin`). The herbalist's talk no longer names the abbey (dialogue.js `herbalist`), so
    it's theirs too; each nave in its people's own materials (interiors3d.js `PALETTES`).
  - **Versions:** `NET_VERSION` 40.
  - **Tests:** test/insides.test.js (both gone into as temples under their god, named for the
    place; the way in clear, the door at its floor, the sun temple's 17 to 21 m in from its
    front, the ziggurat's at its foot; a priest and a herbalist, everyone got to from the door);
    test/places.test.js (seed 2's sun temple held by outlaws: the chief by the altar, half the
    band within, the rest outside; its ziggurat its people's: gone into, the priest's and the
    herbalist's talk, a masterwork amulet bought from the herbalist).
  - **Pictures** (sent in the session): each from in front and from the side, before and after
    (the sun temple's door hidden by its obelisk from straight on, plain from the side); the sun
    temple's nave held by outlaws, the ziggurat's its people's.
  - **Next:** M8, Vitruvian characters.

- **2026-10-04, M8a built: the motion check** (§10.1, "the checks come first"; docs/CHARACTERS.md
  *The motion check*; contribution.md *The motion check*).
  - **What:** `client/js/characters/motioncheck.js` (DOM-free) plays 245 motions on 30 bodies
    (each people's at the five ends of their builds), with what each holds and wears, and
    measures joints past their ranges, things and limbs in the body, feet sliding and in the
    ground, and second hands off their hafts. `scripts/motion-check.js` (`npm run
    check:motion`) runs them across the machine's threads in about 5 minutes (4 threads) and
    writes a report; the same run twice comes out the same to the last digit.
  - **Not as §10.1 first had it:** the body's own skin, skinned as drawn, is measured, not bone
    capsules (closer to what's seen, and what the clipping test already did). The clipping test
    now dresses and measures through the check's code.
  - **Limits, set from the contact sheet:** joints 3°, things 1.2 cm (the clipping test's),
    limbs 3 cm, sliding 1 cm, feet in the ground 0.5 cm, hands off hafts 3.5 cm. At 2° and 2 cm,
    first tried, invisible things were counted (a short body's knee 2° past straight; forearms
    resting on the chest).
  - **The baseline** (`test/motion-baseline.json`): 4,782 of 7,242 pairs fail something (limbs
    2,682, sliding 2,440, joints 1,101, ground 559, things 325, hafts 262). All are real when
    drawn: forearms through bulky bellies, heels skating as the weight shifts, shoulders far past
    their range reaching for a weapon on the back, seated feet through the floor on the tallest
    bodies, feet through the ground in falls. These are M8's work list; CI's `motion` job fails
    on anything worse.
  - **The contact sheet** (`client/motion-sheet.html`): each failure drawn at its worst moment,
    the spot ringed, worst first, filtered by measure, group, people or what's new; close up.
  - **Along the way:** `Actions.haft` records where a two-handed weapon's second hand is meant to
    be and where it got to (for the grip measure); the folk's acts' timings moved to
    core/roles.js `ACT_TIMES`, shared by the game and the check.
  - **Pipeline:** the `motion` CI job (10 jobs a run), `npm run check:motion`, contribution.md's
    section on it, and its table of the repository's settings, which every CI job must be among
    the required checks of (`test/contribution.test.js`).
  - **Tests:** test/motioncheck.test.js (everything played; each kind of fault caught when put
    there on purpose, none on a clean guard; the same every time; worse and better than the
    baseline told apart; the baseline's pairs real); test/contribution.test.js (the settings
    table's required checks).
  - **Next:** M8b, the clips: Mesh2Motion's (the main source, §10.3) baked onto today's rig
    (§10.2's steps 3 to 6), each checked with the motion check before it's used.

- **2026-10-04, M8b built: arms that fit every body** (docs/CHARACTERS.md *Equipment*, *Fighting*,
  *The motion check*). The user found the arms in the contact sheet at crazy angles and through
  the body, and asked for research into how the weapons are really held and drawn (the report
  "Real weapon technique for poses": stances, guards, blows, grips, carrying and drawing for all
  nine weapons, from period manuals, sports references and 44 public-domain pictures; the
  manuals' own plates were blocked from here).
  - **Forearms and hands out of the torso** (`Actions.place`, `keepClear`): after the last reach
    each frame, each forearm and hand measured against the torso's skin, moved out by as much and
    the arm reached again, up to three times; a move that strains the arm more than 6° further
    past its range, or sinks what either hand holds deeper, halved, then taken back. The skin's
    measured as the arms are each time (it was placed once a frame). Not two-handed weapons:
    moving the weapon whole took the second hand off the haft for no less in the body.
  - **Hung blades swing clear of the legs** (`Character.hang`): the sword and the cleaver at the
    hip swing back, forward and out about their grips, as little as clears the thigh and shin,
    falling back slowly; seated, pushed back to the side of the hip. A carrying arm is held out
    from what hangs at its hip (`Character.hung`).
  - **Weapons where real ones go** (`SHEATHS`, from the research): the hilt forward of the left
    hip, where the cross-draw meets it; the cleaver at the hip as a messer was worn, not on the
    back; the staff's and hammer's grips up behind the right shoulder by the ear, their lower ends
    angled back off the hip; the bow a little off the back.
  - **Draws** (`DRAWS`): the cross-draw in front of the belly, the elbow forward and out, the body
    turned 32° into it and the other hand at the scabbard's throat; reaching over the shoulder
    for the staff, hammer and bow with the elbow leading up and forward (the shoulders had gone
    up to 86° past their ranges); the bow turned over at the side, out from the head.
  - **Numbers** (the motion check, 30 bodies): limbs in the torso 2,682 → 745 pairs (9,050 →
    2,018 cm past the limit in all); joints 1,101 → 964 (9,966° → 5,178°); things in the body
    325 → 247 (651 → 526 cm). Thirty pairs a little worse, most the hammer going onto the back.
  - **Pictures** (sent in the session): eight of the worst moments before, and the same moments
    after: the cross-draw and put-away, a patron's long drink, a clerk's thumb in the belt, the
    staff and hammer reached for over the shoulder, a guard running with gauntlets, a side kick.
  - **Along the way:** the contact sheet keeps its own choice when the address asks for one it
    doesn't offer (it showed nothing for `count=4`); the motion check dresses its characters'
    hung blades through `hanging()`, shared with `Character`, and binds `hang`.
  - **Next (the user, 2026-10-04: "start with as many pre-vetted animations as possible"):**
    CharMorph's Vitruvian has no animations (a body: mesh, morphs, rigs; the add-on has only
    still poses, for its older characters), but its Mixamo rig matches ours bone for bone. So
    M8c bakes Mesh2Motion's CC0 clips (about 180 human ones: walks and runs, idles, sword and
    shield, bow, spells, fists and a kick, hits, dodges, deaths, town life) onto today's rig, each
    checked with the motion check, adjusted from the research (the lead foot, grips) and kept
    only where it's better. Hand-made motion stays for what no clip covers (two-handed staff and
    hammer blows, drawing and putting away, pouring and toasting), seeded from the nearest clip.

- **2026-10-04, M8c built: animators' clips in the game** (docs/CHARACTERS.md *Clips in the
  game*). §10.2's steps 3 to 6 for Mesh2Motion's clips, on today's body:
  - **The bake** (`scripts/bake-clips.js`, run by `npm run build:clips`): each clip retargeted
    onto the average body in Node and turned into the key poses every other action is made of
    (`client/js/characters/clip-keys.js`), not played whole: the arms are then reached within
    their ranges, what's held kept out of the body, and the motion check measures them as it
    does the keyed ways. A key holds the spine's, neck's, head's and collarbones' angles
    (`rig.js` `jointAngles`, new: `jointRotation` backwards), each hand's place, turn and elbow,
    and the pelvis; the blow is key 1 (given, or the fastest moment); keys are kept only where the
    curve needs them (within 3°, 2.5 cm).
  - **What didn't carry over: the clips' legs.** They stand in stances of their own and ours
    stand where the walker plants them: with the clips' legs the feet sank up to 17 cm into the
    ground and slid up to 1.9 m, the ankles 20° past their range. So the feet stay planted (a
    kick's leg is the clip's, let go of the ground while its foot is off it), the pelvis turns
    at most 12° and stays level with the rest taken up the spine, and it moves a few centimetres.
  - **Tried on all 30 bodies, and kept where they measure as well as the keyed ways and look
    right:** a jab (the rear fist kept at the chin: the clip flings it out), a cross, a push kick
    from motion capture (the fists kept up: the clip drops them) and a spell thrust out from the
    wand. Left out: the sword's four attacks and an axe chop (lunges of 0.8 m, the sword arm up to
    111° behind the body, up to 68° past any shoulder; the one that measured well swings the
    arm out to the side first, a flourish), a golf drive for the staff and hammer (the
    arms 73 to 78° past their range), the bow (clean, but drawn to the shoulder, not to an anchor
    under the jaw), a fighting stance's left and right jabs. Quaternius's clips are made for
    games: fists, a kick and a spell came over well, blades and two-handed weapons didn't, so
    their keyed ways (from the research) stay.
  - **Actions** have at least five ways now (`clipped`: a clip's way, easing out from 1.6, its
    pelvis scaled to the body's height, a hand kept as `hands` says).
  - **The contact sheet's filmstrips** (`/motion-sheet.html?film=<motions>&body=<body>`): each
    motion a row of frames on a body, following the pelvis; the pictures for this were made with
    it.
  - **Next:** M8d, the clips for what fits them best: town life (the folk's rests from the idle,
    talking, leaning, sitting, drinking and working clips), the fighting idles for the guards,
    hits and dodges; then the deaths and falls, whole-body, with their legs (a stance system
    so the feet can step where a clip steps).

- **2026-10-04, M8d-1 built: town life from the clips, and feet that stay planted**
  (docs/CHARACTERS.md *Movement*, *Resting*, *Clips in the game*). The user had asked what of the
  new character body is live: none yet (the Vitruvian body is still to come, M8's remaining part);
  what's changed so far is motion.
  - **Feet that stay where they're planted** (`locomotion.js`), found baking the idles: every
    standing foot slid as the body shifted its weight.
    - The walker shuffled standing feet back under the pelvis wherever an action moved it, at
      0.8 m/s; now only as the body turns, towards where the walk would have them (`stance`).
    - Standing, the legs are at 99.6% of their length, past the 98.5% a planted foot was let
      reach, so any lean slid the foot; now the knees give (the pelvis lowered as far as keeps
      the feet), and a leg may be as straight as the walk has it.
    - Crouched lower than the ankle bends (20° of dorsiflexion), the heel rises about the ball
      of the foot (the overhead blows had ankles 17° past their range keeping the feet flat).
    - The motion check, all 30 bodies: planted feet sliding 2,566 pairs → 470 (18,885 → 2,809 cm
      past the limit in all); joints past their range 977 → 596 (5,184° → 2,719°); every
      punch's slide (7 to 8 cm on every body), the wand's and the rests' gone. A little worse:
      setting off walking (21 bodies, up to 0.9 cm more of what slid already) and the kicks' (20
      pairs, about half a centimetre); the seated chats' feet as far through the floor as every
      seated rest's on the tallest bodies (the seat's height isn't fitted yet).
  - **The bake:** the pelvis measured from the clip's own planted feet (the motion capture stands
    5 to 10 cm off its origin, and was pinned at the limits), following only feet on the ground;
    seated clips (`seated`) only as they move from where they sit; on a bench, never lower.
  - **Rests from the clips** (`CLIP_RESTS`, after each role's own five; `NET_VERSION` 41):
    talking (eleven roles), talking seated (councillors, petitioners, patrons with the tankard
    up, rulers), scratching the head (apprentice, clerk), listening with a hand on the hip
    (reeve, steward), a cheer and waving someone over (adventurers). Left out: the clip's folded
    arms (the keyed ones are clean), a rail lean, a salute, drinking, sitting still, and those
    whose legs are the motion. Six clips added, ten in all (181 keys, 59 KB).
  - **Along the way:** the lab offers every way an attack or rest has; the clipping test caught a
    cheer's hanging arm in a sword's hilt (mirrored) and a hand through a wizard's hat (not for
    those who wear one).
  - **Next:** M8d-2, the guards' fighting idles (the clips' sway layered over the keyed guards) and
    hits and dodges (a slip for the Dodge spell); then deaths and falls with their legs; then
    the Vitruvian body (§10).

- **2026-10-04, M8d-2 built: the guards sway** (docs/CHARACTERS.md *Fighting*, *Clips in the
  game*). On guard, a body stood still as a statue; now it sways as an animator's fighting idle
  does, layered over the keyed guards (`GUARD_SWAYS`):
  - **Three loops baked** (`loop` in `bake-clips.js`: timed evenly, kept four times closer to the
    clip): `Idle_Sword` for the sword, cleaver, staff and hammer; `Spell_Simple_Idle` for the
    wand, bow and grimoire; `Fighting Idle` for fists and kicks. 13 clips in all (210 keys, 69 KB).
  - **Added from each loop's mean:** the pelvis and the spine's, neck's and head's angles on top
    of the walk's, each hand's place on top of the guard's. Standing only: eased out as the walk
    sets off (the walker tells its overlay how far into its stride it is), and over a tenth of a
    second as a blow, a flinch or a fall starts (under a kick the pelvis rocking slid the standing
    foot on 150 pairs). Each fighter at its own place in the loop, a little quicker or slower.
  - **Kept as far as keeps the forearms out of the torso on every body** (the motion check): the
    fists sway from the pelvis only (their bob brought a forearm into the chest on 5 to 8 bodies,
    the spine's lean on 3); two hands on a haft and the grimoire's book hand go with the body
    only; the bow's hands half as far. Left out: `Idle_Shield` (hardly moves), `Golf_idle`, `Pistol_Idle`.
  - The motion check's guard "still" is 2 s now, a sway's loop.
  - **Next:** M8d-3, hits from the clips (`Hit_Chest`, `Hit_Head`) and a slip for the Dodge spell;
    then deaths and falls with their legs; then the Vitruvian body (§10).

- **2026-10-04, M8d-3 built: hits and dodges from the clips** (docs/CHARACTERS.md *Fighting*,
  *Clips in the game*).
  - **Hits:** Mesh2Motion's `Hit_Chest` (for the staff's, bow's and kick's flinches) and
    `Hit_Head` (the punch's) as each one's other way, done in turn with the keyed one, never the
    same twice running (`REACTIONS[name].clips`, `react(name, { way })`). Added from the clip's
    first pose, through in the reaction's time, mirrored from the right and leaning the other way
    from behind; the hands as they were. They measure as clean as the keyed ones or cleaner (the
    punch's worst forearm in the torso 11.6 → 5.0 cm, and no joint past its range where the keyed
    strike's 17.8° and punch's 9.9°).
  - **Slipping a blow** (`dodge`, `DODGES`): when the Dodge spell turns a blow aside (the
    battle's `dodged`, which only showed "Dodged" over the head), the body ducks under it as
    `Dodge_left` does (mirrored, away from a blow from the left) or sways back and round as
    `Dodge_back` does; from ahead, either way or back in turn. The feet planted, the lean at 65%
    (all of it took the spine 8° and the neck 13° past their ranges over a guard's), the hands on
    guard kept before the face as the head ducks (the cat folk's gauntlets were in the head) and
    turning with the chest (the lizard folk's forearm was 11 cm into the belly turning back).
    The guard's sway eases out for it as for a blow.
  - **The motion check:** every flinch every way and each dodge (277 motions); every existing
    motion as it was; the baseline gains the new ones' 52 pairs (2,377). The clipping test does
    every flinch way and each dodge on every body; the lab has a Dodge button.
  - **Next:** deaths and falls with their legs (`Death_A`..`D`, `Hit_Knockback`: a stance system
    so the feet can step where a clip steps); then the Vitruvian body (§10).
- **2026-10-05, the navigation mesh made from what's drawn** (docs/WORLD.md *Navigation meshes*).
  A player's pictures of a lizard town: the plank walks' mesh a strip down their middles, broken on
  side walks; and a market's lamps, stalls and well each in a hole too big, holes meeting.
  - **The audit:** the lagoon's water was solid, a 3 m box on every square no walk's middle was
    over, eating into the planks a square at a time (3.2 m lanes 1.55 m of mesh, 45 gaps along the
    streets over the water, three breaks: 238 m, 99 m and 28 m round); a prop took every square of
    the middle half of its plots, each a box (a lamp post 2 m square, a hole 3 to 4 m across);
    boxes on the voxels' lines took a voxel more on two sides; and half-metre voxels kept walkers
    half a metre from every edge, and lost as much again to the voxel at each.
  - **Built:** `solid` is where something built stands (a layout's `standing`); the lagoon's water
    walked by no one, `heightAt` the deck's out to its edges over any of its squares; props (by
    outlines measured from the art: `npm run build:footprints`), yard fences and the start town's
    trees as drawn, their ground marked unwalkable before the radius is taken off, a yard closed
    along the back of its house; boxes a centimetre in; voxels 0.25 m, the walker kept 0.25 m off
    (Recast about 8 ms a tile in a town, from 3); `heightAt` a bridge's deck on the squares next
    to those under it too (a stone bridge's ramps over the banks); the debug view's band where a
    body reaches. `NET_VERSION` 50.
  - **After:** no gaps along the streets over the lagoons; 3.2 m lanes 2.65 m of mesh, alleys 2.4;
    lamp posts' holes about a metre across; a way between every two market props near each other.
  - **Next:** the Vitruvian body (§10).
- **2026-10-05, the Vitruvian body, first part: its data, in the character lab** (§10;
  docs/CHARACTERS.md *The Vitruvian body*). `npm run build:vitruvian` makes CharMorph's
  Vitruvian (CC0) into the same kind of data as MakeHuman's body (`client/characters/vitruvian.*`);
  the lab shows it at `character-lab.html?body=vitruvian`. The game still uses MakeHuman's.
  - **No Blender:** `char.blend`'s texture coordinates and materials are read by a small reader
    of Blender's own file layout (`scripts/lib/blend.js`), and the morphs, weights and joints from
    NumPy's files (`scripts/lib/npy.js`). (The risk in §14 is met that way.)
  - **Mesh:** the skin brought down to 28,000 triangles (from 52,544) with meshoptimizer, keeping
    its texture coordinates, its four UDIM tiles side by side in one square; its own eyes,
    MakeHuman's eyelashes on them; its Mixamo weights, the same 52 bones in the same order. 1.9 MB
    gzipped (MakeHuman's 1.4 MB).
  - **Size:** scaled to MakeHuman's default body's height (it was 5% taller: the hero 1.90 m to
    1.81 m, as on MakeHuman's).
  - **Shapes:** every slider's carried over, rather than mapped onto Vitruvian's own morphs (step
    2 of the plan), so every people's look and soldier works on it at once: MakeHuman's default
    body laid over Vitruvian's bone by bone, each Vitruvian vertex taking the change at the nearest
    point facing its way (half within 5 mm, 99% within 3.2 cm), turned as the bones there are but
    not stretched, and the base set so the sliders as they start give Vitruvian's own body.
  - **The neck** (the user: the top of the shirt wasn't right): MakeHuman's neck bone starts half
    way up the neck, Vitruvian's at its foot, so a shirt cut 3 cm under the neck joint fell to the
    collarbones. The manifest's `landmarks.neck` (0.425 of the way up Vitruvian's neck bone) is
    where garments measure the neck from; MakeHuman's body is laid over Vitruvian's with its neck
    bone starting there too. Stretching the changes as the bones are had shortened the hero's neck
    2 cm; turned only, its neck runs from shoulders to chin at MakeHuman's heights.
  - **Masks:** MakeHuman's (lips, nails, eyelids...) carried into Vitruvian's texture layout texel
    by texel.
  - **Tests:** `test/vitruvian.test.js`: bones, weights, parts, shapes and masks; as tall as
    MakeHuman's body in four presets; the neck measured where MakeHuman's is, and a shirt up it as
    high, front and back.
  - **Next:** the game on Vitruvian (its lower-detail body, the motion check's baseline, the
    clips' bake), its own skin textures, the lips and mouth (the lip mask sits a little low), the
    face's measures, blinks and expressions.
- **2026-10-05, the Vitruvian face** (§10; docs/CHARACTERS.md *The Vitruvian body*). Close-ups of
  Vitruvian's faces: the lip colour painted on the chin under the lips, the lips pale, blotches
  under the eyes; and the face sliders barely reaching its mouth and chin.
  - **The cause:** face coordinates (`face.js`, where the skin's features, hair, helmets, cat
    folk's ears and tusks are placed) are scaled by the eyes' spacing, and Vitruvian's eyes are
    further apart for its head's size (6.4 cm to MakeHuman's 5.8), so its skull was 8% small in
    them. And its face took MakeHuman's face's changes, and the lip mask, from MakeHuman's body
    laid over it by its bones, which doesn't line faces up: the underbite moved its lower lip
    0 mm to MakeHuman's 7.5, the chin slider its chin 4 mm to 10.3.
  - **The face map:** the build measures both heads alike (`faceLandmarks`: the lips by each
    one's own lip mask, the nose's tip, the chin, the crown, the back of the skull, the ears) and
    the manifest's `landmarks.face` brings Vitruvian's head onto MakeHuman's face coordinates:
    its size (0.925 of its eyes' spacing), then its heights and depths between those landmarks.
    Once sized, its lips, nose, chin, crown and skull were already within 2 mm of MakeHuman's.
  - **The face matched by it:** each vertex of the head takes the change at the point where it is
    on MakeHuman's face by the map, as much as it's the Head bone's (the rest from the body laid
    over it, so the neck has no seam); turned as the head is, not scaled (a change there is the
    head's moving with the body too: scaled by the faces' sizes, the orc's crown rose 6 mm too
    far). The underbite now moves its lower lip 7.1 mm (MakeHuman's 7.5), the chin its chin 10.6
    (10.3), the lips 3.9 (4.4), the head's squareness its jaw 23.9 (23.3). The masks on the head
    (eyelids, ears) are carried by the map too.
  - **Its lips:** painted from its own lip mask (`ColLipMask` in `char.blend`), over all its
    triangles.
  - **Tests:** its face's landmarks where MakeHuman's are in four presets; five face sliders
    moving its face as MakeHuman's (within 30%); the orc's tusks at its lower lip, as on
    MakeHuman's; points into face coordinates and back.
  - **Next:** the game on Vitruvian (its lower-detail body, the motion check's baseline, the
    clips' bake), its own skin textures, the inside of the mouth, blinks and expressions.
- **2026-10-05, knees and heels, before the game moves onto Vitruvian** (§10; docs/CHARACTERS.md
  *Foot locking*, *Heel off*, *The Vitruvian body*). The motion check run on Vitruvian
  (`npm run check:motion -- --data vitruvian`) had 4,937 joints past their range to MakeHuman's
  718: what to fix before the game switches.
  - **Knees:** the leg's IK put the knee in the plane of the hip, the foot and the pole, so a knee
    resting turned in (women's: MakeHuman's 1.6°, Vitruvian's 5°) was pushed straight as it
    bent, a sideways swing a knee hasn't got (on Vitruvian 4.6° past its range in every
    bent-kneed motion: 3,640 failures). Now it bends only about its hinge, the leg keeping the
    shape it rests with, the thigh turning the whole leg onto the foot, its forward where the
    thigh's turned forward points; a planted foot's twist past the ankle's range the knee takes,
    up to its 10° (without it, the dead falls' ankles went 6–8° further past their range).
  - **Heels:** walking, late in stance, the heel lifts when the ankle would bend past 19°, as it
    did standing (Vitruvian's straight shin read 24.5°; MakeHuman's, leaning 3.5° at rest, had
    read that much less).
  - **Falls:** a foot let go of as the body sinks onto it is lifted out of the ground (it was left
    up to 1.7 cm in it for that frame).
  - **The numbers** (failing pairs): MakeHuman's joints 718 → 580, its other measures as they
    were (262 pairs better; 9 a little worse: a staff, hammer or bow 0.5–0.8 cm further into a
    thigh in one blow each, a tankard in the hips in one rest, the orc's second hand 2 cm further
    off its haft); the baseline kept. Vitruvian's joints 4,937 → 734; still to do there: seated
    rests (its hip joints higher, its legs longer: a foot in the ground) and forearms near the
    chest (narrower shoulders, a shorter upper arm), most with two-handed weapons.
  - **One setting for the game's body:** `body.js` `GAME_BODY` (MakeHuman's for now), read by the
    kit, the lab, the download list, the motion check and its baseline, the clips' bake and the
    character tests (`scripts/lib/human-data.js` in Node). The contact sheet's filmstrip takes
    `&data=` and `&view=front|side`.
  - **Next:** Vitruvian's seated rests and forearms, then the game switched to it.
- **2026-10-05, Vitruvian's own shapes, and seated feet on the floor** (§10; docs/CHARACTERS.md
  *The Vitruvian body*, *Sitting*). The user: why is the chest not rendered correctly on
  Vitruvian? Then: can we go with Vitruvian's defaults, and recalculate what depends on the body?
  - **The cause:** the sliders' shapes were MakeHuman's, carried over from its body laid over
    Vitruvian's by the bones, which only lies near it (half the skin within 4.7 mm, a tenth
    further than 16 mm): MakeHuman's nipples were 4.5 cm from Vitruvian's, so a woman's breasts
    grew off them, lumpy and creased; men's chests were creased; a thumb's change went onto the
    thumb beside it; and the carried areola mask came out all but empty.
  - **Fitted:** MakeHuman's body is now fitted onto Vitruvian's skin before anything is carried
    over (`fitOnto`): its nipples moved onto Vitruvian's, then drawn onto the nearest of its skin
    round by round, stiffly first. Half the skin within 0.7 mm, 90% within 2.8 mm.
  - **Vitruvian's own shapes for the body's flesh** (step 2 of the plan): sex, muscle, weight and
    bust are its own morphs (`OWN_SHAPES`: `Gender_Female`/`Male`, `BodyType_Muscular` with a
    man's traps and arms, `EndoMorph`, `Fat`, `Emaciated`, `Chest_Breast_Size`,
    `FemaleFlatChested`), made for its mesh. Fitted with Vitruvian's morphs vertex by vertex,
    MakeHuman's flesh was at most half explained, so the amounts are set by eye. The bones still
    move as MakeHuman's shapes move them (Vitruvian's skin going with them), so heights, limbs'
    lengths and every motion are as they were; every preset, people's look and soldier works.
  - **The head keeps MakeHuman's shapes** (by the face map): hair, helmets, beards, tusks and cat
    folk's ears are fitted to them. With Vitruvian's own sex shapes on the head, the hero's crown
    rose 9 mm and the orc's mouth moved in face coordinates. Moving the faces over too would mean
    refitting all of those.
  - **Its areolae** painted from its own nipples and areola shape (12 mm), and kept whole through
    the mesh's simplification (they'd been left a few flat facets). The eyelashes move as the
    eyelids under them do.
  - **Seated feet:** sitting, a foot the pose puts into the floor is brought onto it, the shin
    swung forward about the knee (`SEATED`). Lifting it straight up raised the knees into the
    table and the tankard.
  - **The numbers** (failing pairs): Vitruvian's, before → after: joints 734 → 715, held things in
    the body 757 → 660, forearms in the torso 1,396 → 1,332, feet in the ground 97 → 128 (34
    newly, 0.6–0.9 cm, falls and walks), sliding 742 → 753, grips 156 → 152. MakeHuman's, with
    seated feet on the floor: feet in the ground 666 → 126 (540 pairs better, none worse), the
    rest as they were; its baseline brought down.
  - **Next:** the rest of what depends on the body, on Vitruvian (the clips' bake, poses where its
    check is worse, garments, its baseline), then the game switched to it.
- **2026-10-05, Vitruvian's limbs measured as MakeHuman's, and its hands placed from MakeHuman's
  shoulders** (§10; docs/CHARACTERS.md *The Vitruvian body*, *Joints*). Recalculating what
  depends on the body, on Vitruvian: what made its motions fail more than MakeHuman's.
  - **The elbow's hinge** was found from how the forearm bends at rest. MakeHuman's rests bent
    39°; Vitruvian's all but straight (11°), and its hinge came out 37° to 49° off, so every
    forearm's turn and grip was twisted about 45°. Now it lies across the arm, level from front
    to back, as MakeHuman's does (within 0.6° of where it was on MakeHuman's).
  - **Its rest** (`landmarks.rest`, `restOf`): its knees rest 9° straighter than MakeHuman's, its
    thumbs 44° to 66° and fingers about 20° otherwise. Measured from its own rest, its knees
    locked straight in every stride (its running feet slid) and its fingers gripped elsewhere.
    The rig now measures its limbs as though its default body rested them as MakeHuman's does,
    each shape's own difference kept; MakeHuman's own rig is as it was. A knee's hinge now takes
    the shin in its own frame (the two needn't be one).
  - **Its hands' joints** are carried from MakeHuman's, from the wrist, turned and sized to its
    hand: found from the skin, a bigger body's fingers had shrunk.
  - **Its hands' places** start from where MakeHuman's shoulders are on its body
    (`landmarks.shoulder`, by its chest's front and face fitted: 1.2 cm out, 2.6 cm lower, 2.2 cm
    forward of its own). Every pose's places are given from MakeHuman's shoulders, and its own sit
    further back and higher: a book held before the belly went into it, a tankard raised to the
    lips into the face. (Placing them further forward still passed more of the check, but only by
    holding the hands further from the body.)
  - **The numbers** (failing pairs), Vitruvian's, before → after: joints 715 → 571, held things
    in the body 660 → 489, forearms in the torso 1,332 → 1,268, sliding 753 → 563, feet in the
    ground 128 → 100, second hands off their hafts 152 → 163. MakeHuman's as it was (2 pairs a
    few millimetres worse, sheathing the hammer; 2 better); its baseline kept.
  - **Next:** Vitruvian's forearms before its torso (its upper arm 18.6 cm to MakeHuman's 23.4,
    its forearm 23.6 to 21.3, and thicker), its held things, the two-handed hafts, then its
    baseline and the game switched to it.
- **2026-10-06, a real fist** (§10; docs/CHARACTERS.md *Joints*, *Key poses*). The user, with
  photos of a real fist: the fist in the gauntlet guards "looked bad before and after. Fingers are
  packed tightly and curl on a fist", the thumb across the index and middle fingers' middle bones.
  - **Each finger bends in its own plane** (`rig.js`: `JOINTS.HandIndex` to `HandPinky`, the
    finger's flexion turned about the palm's normal). The fingers rest fanned (the index 9° to the
    thumb's side, the little finger 26° to the other) and bent about one axis across the hand, so
    they stayed fanned as they curled: a fist's knuckles 2.9 cm apart had its middle bones 3.9 cm
    apart, and spreading them at the knuckles only turned the folded tips the other way (the little
    finger hooked out). Now they come down in front of their own knuckles, packed (skin gaps 0 to
    0.1 cm, the little finger's 0.2 to 0.5).
  - **The fist** (`FIST_HAND` in `equipment.js`): one shape for a fist in a key pose (the kick
    guard, punches' guard hands) and the spiked gauntlets' hold, which had their own. Its curl went
    the tips through the palm and out of the back of the hand (these bodies' fingers are short
    for their palms, and the rest pose already curls them 20°); now every finger curls 65°, 75°,
    65° and its tip rests on the palm (0.1 to 1.3 cm in, on the biggest and smallest bodies of
    both), and the thumb's tip lies on the middle finger's middle bone (searched, on both bodies).
    A pointing hand's other fingers and thumb are the fist's.
  - **The numbers** (failing pairs). MakeHuman: forearms in the torso 822 → 813, held things
    309 → 308, the rest as they were; 91 pairs better, 59 worse, the worse mostly gauntlet blows
    about 1 cm deeper. Those come from the arms' clearing: the other fist's splayed fingers no
    longer catch the knuckle spikes, so the clearing takes another path from frame to frame
    (switched off, both put the arm in the same place). The mean forearm depth over every pair is
    as it was (-0.18 cm); the baseline is kept. Vitruvian: forearms 1,268 → 1,278, held things
    489 → 492.
  - **Next:** the gauntlet blows' forearms before the torso (the worst of what fails: 157 pairs on
    MakeHuman), then as before: Vitruvian's forearms, its held things, the two-handed hafts, its
    baseline, and the game switched to it.
- **2026-10-06, a boxer's guard and punches** (§10; docs/CHARACTERS.md *Key poses*, *Technique*,
  *Hits and dodges*). The user sent boxing references (silhouettes of a guard, jab, cross, hook,
  uppercut and crouch; a *Basic boxing stance* chart, "Hands up. Chin down. Elbows in. Knees
  bent."; and a boxer throwing two jabs and a cross, frame by frame) to fix the gauntlet blows'
  forearms through the chest.
  - **The guard** (`actions.js` `fist`, `GUARDS.punch`): the rear fist before the chin, the lead a
    little higher and further out, the elbows in and down before the ribs, the forearms nearly
    upright, both fists turning with the chest; the chin down, and the knees bent (the pelvis
    3 cm lower) standing, straightening into a stride (bent through a walk, the shorter women's
    ankles went up to 12° past their range). The rear fist is a little out from the chin: searched
    on all 30 bodies, nearer it a full chest is in the forearm's way. The kick guard's fists are
    further out too, off a full belly as the body twists.
  - **The punches leave straight from the guard**, as the boxer's do, not drawn back or wound up
    first, the body turning into each and the other fist kept at the chin.
  - **An arm kept clear as a blow fades out** (`Actions.place`): the arms' clearing moved only the
    last layer reached, and a blow fading into the guard moves the arm only as far as it's blended
    (at a punch's last frame, 8%), leaving the guard's forearm 6 cm into the bulkiest woman's
    chest after every punch. The arm under a layer blended less than half over it is kept clear
    too (not under one blended more: that turned the elbow the last reaches from, and a grimoire
    blow 98% in had a forearm 5 cm in the hip).
  - **Pelvis offsets add up** over the guard's, so an action's resting key has none of its own
    (`rest`); the guard's 3 cm was otherwise counted twice under every punch. Slipping a blow,
    the fists go 0.15 arm lengths forward (a quarter took the lead arm 21° past the shoulder's
    range).
  - **The side kick's fist**, swung down and back, goes beside the hip rather than behind it:
    from the guard's elbow, forward, it bent the thumb into a lizard's tail (7 cm, Vitruvian).
    (An elbow of its own, back, took the arm 35° past its range turning back to the guard.)
  - **The numbers** (failing pairs, MakeHuman): forearms in the torso 813 → 577 (gauntlet blows
    142 → 0, their guard 10 → 0, kicks 45 → 2, grimoire blows 48 → 36, the flinches, dodges and
    casts a few each), joints 580 as they were, held or worn things 308 → 311 (a cat's ear on the
    thumb, 1.3 to 1.6 cm, slipping a blow); 243 pairs better, 6 worse (at worst 4.3 cm, a
    grimoire blow 0.6 cm deeper). The mean forearm depth over every pair went from -0.18 to
    -0.52 cm. The baseline is updated (1,779 → 1,590 failing pairs). Vitruvian: forearms
    1,278 → 950, held things 492 → 493, the rest as they were; 389 better, 47 worse, the mean
    forearm depth 0.53 → 0.27 cm.
  - **Next:** Vitruvian's arm proportions, its held things, the two-handed hafts, its baseline,
    and the game switched to it.
- **2026-10-06, the arms on Vitruvian's proportions** (§10; docs/CHARACTERS.md *The Vitruvian body*).
  The user asked to keep Vitruvian's own joints and refit what depends on the body to them. Its
  elbow joint is higher up the arm than MakeHuman's (on the default body the upper arm is
  20.4 cm and the forearm 25.5; MakeHuman's are 24.2 and 23.9), so the same hand place puts the
  forearm more steeply across the body, into the belly and hips wherever something is held low
  before it. Those poses now hold it further out, on both bodies:
  - **The grimoire's book** (`actions.js` `book`): before the belly rather than low by the hip,
    and turning with the chest as the blows turn it.
  - **The staff and war hammer on guard** (`GUARDS.staff`, `GUARDS.hammer`): both hands further
    forward, the right hand nearer the middle. A second hand on a haft isn't moved out of the
    torso, and its forearm lay in the belly. The hammer's left hand was searched for a place
    whose elbow, carried into the blows, keeps the side swing's left shoulder in range (the
    unit test's 5°).
  - **The numbers** (failing pairs): MakeHuman's forearms in the torso 577 → 304 (the grimoire's
    guard and blows 42 → 0, the casts 50 → 0, the staff's guard 51 → 0 and blows 116 → 70, the
    hammer's draw 17 → 4, the flinches and dodges on guard down by half or to none), held or worn
    things 311 → 298, second hands off their hafts 258 → 237, joints 580 → 582; 500 pairs
    better, 144 worse (mostly a staff blow's second hand 1 to 6 cm further off the haft as the
    blow leaves the new guard; at worst, the bulkiest dark elf woman's hammer smash, its left
    hand 18 cm off the haft at the bottom of the blow, as the on-haft hand's elbow comes from
    the guard's). The mean forearm depth over every pair went from -0.52 to -0.88 cm. The
    baseline is updated (1,590 → 1,377 failing pairs). Vitruvian: forearms 950 → 489 (the
    grimoire's 208 → 6, the staff's guard 81 → 9, the hammer's guard 38 → 8, the casts 54 → 4),
    held things 493 → 457 (the staff in the thighs casting a stun 25 → 15, the hammer's guard
    20 → 3), second hands 163 → 141, joints 571 → 569; 782 better, 84 worse (at worst the
    hammer's side swing, the left shoulder up to 2.7° further past its range on four bodies);
    the mean forearm depth 0.27 → -0.16 cm.
  - **The motion check's own test** (`test/motioncheck.test.js`) hangs the left forearm inside the
    chest for its forearm fault, not the whole arm 60% of the way in: on the new hammer guard the
    arm hung that way reached out of the body, and the fault went unfound.
  - **Next:** the rests whose hand comes back across the chest, the bow, the wand put away and the
    staff cast on Vitruvian, the hammer's blows from the new guard, Vitruvian's baseline, and the
    game switched to it.
- **2026-10-06, an empty hand placed by its own grip; the rests and casts on Vitruvian** (§10;
  docs/CHARACTERS.md *Key poses*, *Spells*).
  - **A sheathed weapon no longer steers the empty hand** (`Actions` reach): a hand's place was
    worked out as holding the weapon it would draw, whenever one was put away for it, so a
    sentry folding the arms (a sword at the hip) had the right hand placed as if gripping the
    sword upright: the hand out past the left shoulder, the forearm 8 cm into the belly on every
    sentry. Now only while drawing or putting it away.
  - **Tucking back the hair** (the serving wench's and the receptionist's rest): the hand let down
    in front of the hip, not back across the chest (12 cm into the bulkiest man's, Vitruvian).
  - **The sign of the Hearth** (the priest's, acolyte's and worshipper's): the fingertips to the
    heart a little further out, off a full chest.
  - **The crouching bow shot**: the bow held further out to the left as the body drops, its lower
    limb clear of the right thigh coming up.
  - **A staff or war hammer held upright while casting**: a hand's breadth out to the side and
    forward of the hip; nearer it, the staff's foot swung through the lizard women's thighs as
    the other hand came back to the haft.
  - **The numbers** (failing pairs, against PR #203): MakeHuman forearms in the torso 304 → 274
    (the sentry's folded arms 28 → 0), joints 582 → 558 (the hair tuck's shoulder 41 → 17), held
    things 298 → 296; 56 pairs better, none worse. The baseline is updated (1,377 → 1,323).
    Vitruvian: forearms 489 → 427 (the sentry's 30 → 2, the hair tuck's 22 → 0, the sign of the
    Hearth's 12 → 0), held things 457 → 429 (the staff casting a stun 15 → 0, the crouching shot's
    bow 15 → 2), joints 569 → 543; 119 better, 1 worse (the crouching shot's bow 1.5 cm into a
    tall dark elf's thigh).
  - **Next:** the hammer's and staff's blows (forearms 10 to 14 cm in, on every body), the wand
    put away, Vitruvian's baseline, and the game switched to it.
- **2026-10-06, the war hammer's and staff's blows, and four put-aways, refitted** (§10;
  docs/CHARACTERS.md *Attacks*, *Drawing weapons and putting them away*, *Put away*).
  - **Two-handed blows keep the haft out in front** (`ATTACKS.hammer`, `ATTACKS.staff`): a
    second hand on a haft isn't moved out of the torso, so the keys hold both hands far enough
    out on every body. The smash and the leaping slam lift the haft out in front of the chest on
    the way up and swing it down in a wide arc (a key each side of the top), and end with the
    hands low and out before the hips; the upswing comes up out in front; the side swing and the
    diagonal chop wind up further out. The staff's overhead strike lifts it out in front first;
    its thrust, rising strike and spin wind up out in front, not tight to the body; a sweep still
    finishes with the rear hand low by the hip (higher, it came off the haft on the way back to
    guard). Further out still at the blow, the shoulders went past their range; the hammer's
    side swing still takes the left forearm into the belly at the strike, on every body.
  - **The war hammer put away** (`DRAWS.hammer.sheathe`) is raised upright out in front in one
    hand before it's hoisted overhead and over the shoulder: swung straight back off the guard,
    its head went through the face and shoulders. **Drawn**, its head comes into the open left
    palm out before the chest (lower, the haft's foot went into the hips).
  - **The wand** (`SHEATHS.wand`) is tucked in the belt 1 cm further out, its tip canted out a
    little: on Vitruvian's thighs it went in as the legs came out of the guard (2 cm out, the
    right arm swinging past a walking dark elf woman met it). **The grimoire put away** is
    brought down out to the side of the hip, not straight down into it.
  - **The numbers** (failing pairs, against PR #204): MakeHuman forearms in the torso 274 → 147
    (the hammer's blows 135 → 42, the staff's 70 → 41), held things 296 → 197 (the hammer put
    away 30 → 0, the grimoire 30 → 5, the hammer drawn 10 → 0, the wand 9 → 1, the staff's blows
    28 → 3), second hands 237 → 152 (the hammer's 89 → 19), joints 558 → 525; 507 better, 47
    worse (most a staff blow's second hand a few centimetres further off the haft as it returns
    to guard, at worst 12 cm on the spin; the diagonal chop's left shoulder 0.8° further past).
    The baseline is updated (1,323 → 1,210). Vitruvian: forearms 427 → 329 (the hammer's blows
    143 → 70, the staff's 104 → 83), held things 429 → 310 (the hammer put away 27 → 0, the wand
    17 → 1, the grimoire 19 → 2, the hammer drawn 11 → 0, the hammer's blows 27 → 6, the
    staff's 31 → 4), second hands 141 → 88, joints 543 → 499; 523 better, 22 worse.
  - **Next:** the hammer's side swing, the spiked boots on Vitruvian, Vitruvian's baseline, and
    the game switched to it.
- **2026-10-06, the spiked boots' shin plates fitted to each shin** (§10; docs/CHARACTERS.md
  *Spiked boots*).
  - **The shin plate** (`equipment.js` socket `leftShin`/`rightShin`, `items.js` `shinPlate`) was
    placed by the shin's foremost point at one height, upright, with one curve for every body. A
    full shin is flatter in front than that curve: on Vitruvian's men, its edges went up to 1.7 cm
    into the shin, standing on guard. Now it lies along the shin (ankle to knee, the shins leaning
    out as the legs stand apart), and its curve is fitted to the shin's skin it spans: from its
    own to three times as flat, as wide as ever, the one that sits nearest the skin while clearing
    it. Centred across the shin rather than on its foremost point, a running orc's plate met the
    other calf as the legs passed; on the foremost point, as before, it doesn't.
  - **The numbers** (failing pairs, against PR #205): Vitruvian, held things 310 → 212 (the boots'
    motions 102 → 4); MakeHuman, held things 197 → 187 (the boots' 47 → 37); none worse on either.
    What's left is the toe spike and heel spur in the foot (MakeHuman, 1.3 cm on three bodies) and
    a running orc's toe spike and plate meeting the other leg. The baseline is updated.
  - **Next:** the hammer's side swing, Vitruvian's baseline, and the game switched to it.
- **2026-10-06, the war hammer's side swing** (§10; docs/CHARACTERS.md *Attacks*).
  - **The left arm** (`ATTACKS.hammer`, "side swing"): the second hand on the haft, its elbow left
    to come as it would, lay across the belly from the wind-up behind the right hip to the
    follow-through, up to 13 cm in, on every body. Its elbow is now set, down through the wind-up
    and the strike and out and back after it (a key just after the blow); the hands are wound up
    further forward, the left hand is further forward at the blow, and the right hand follows
    through less far across (further across and forward, the right shoulder went past its range).
    With the left hand further out to the left after the blow, the forearm cleared the belly
    throughout, but its wrist couldn't turn with the haft that far (the arms test's 35° strain
    limit), so it goes only as far as it can.
  - **The numbers** (failing pairs, against PR #206): MakeHuman, forearms in the torso 147 → 124
    (the hammer's blows 42 → 19; the side swing's 30, 11 cm in, → 7, 5 cm), second hands 152 →
    148; 34 better, none worse. Vitruvian, forearms 329 → 324 (the side swing's 30, 13 cm in, →
    25, 6 cm), joints 499 → 490 (the hammer's 17 → 8); 40 better, 2 worse (two orc men's left
    shoulder 2° further past its range at the wind-up). The baseline is updated.
  - **Next:** Vitruvian's baseline, and the game switched to it.
- **2026-10-06, Vitruvian's wrists and the tests' rigs** (§10; docs/CHARACTERS.md *Vitruvian*).
  - **The tests' rigs** (`test/actions.test.js`, `characters.test.js`, `wounds.test.js`) were
    made without the manifest's `landmarks.rest`, which the game passes: on Vitruvian, the fists
    and grips closed with the thumb along the fingers and a sprinting foot slid 5.6 cm, in the
    tests only. They're made as the game makes them now.
  - **Five keys bent Vitruvian's wrist 37° to 50° past its range** (the arms test's strain; its
    forearm is longer than MakeHuman's and its upper arm shorter, so a hand drawn in close lies
    steeper): the stun's palm thrust, the grimoire's palm push, the hair tuck (the fingers now
    up past the ear, and the hand out to the side on its way down), the wand's flick and the bow
    slung back. Each is turned or tipped back less. The toast is raised a little higher, so the
    tankard is over 15 cm above Vitruvian's shoulder at its top, as the rests' test wants.
  - **The numbers** (failing pairs, against PR #207): MakeHuman unchanged (none better or worse;
    the baseline is unchanged). Vitruvian, 4 better and none worse: forearms 324 → 322 (the
    stun's 4 → 2), held things 211 → 209 (the toast's tankard in the head 4 → 2).
  - **Next:** garments, hair and skirts fitted to Vitruvian, sitting on its longer thighs, its
    baseline, and the game switched to it.
- **2026-10-06, garments, hair and skirts on Vitruvian** (§10; docs/CHARACTERS.md *Vitruvian*,
  *Lingerie*, *Drapes*, hair, toe boxes).
  - **Designs where they're drawn.** Lingerie's and surcoats' designs are drawn on MakeHuman's
    base body, and Vitruvian's base is laid out otherwise (its chest 12 cm lower, its crotch
    4 cm), so a bra lay on its collarbones and the surcoat's crown sat high. The Vitruvian build
    now gives each vertex its place on MakeHuman's base body too (`designPositions`: the point of
    MakeHuman's skin, fitted onto it, that it lies on; on the head by the face map), and
    `texelMap` and `designSolid` draw designs there. The bra's and briefs' linings are a little
    larger, so the nipples and the groin are under lining on both bodies (the lingerie test).
    `vitruvian.bin` is rebuilt (1.87 → 2.03 MB).
  - **Toe caps.** Their columns set off along the boot's slope from each cut point's own
    neighbours, which on Vitruvian's foot lay to its side, so the cap came out 2 cm wider than the
    toes with a crease at the cut. The slope is now taken from the boot 1 to 3 cm behind each
    point, the same way round the foot. (The footwear test's allowance is now twice the boot's
    thickness and a centimetre: plate boots are thicker.)
  - **Hair.** Bangs end at the brows (Vitruvian's forehead runs lower under its hairline), and a
    parting has denser roots (an eighth of the strands, at least 30).
  - **Skirts.** A drape is built round the legs as they're set apart in the body as built, and
    its sides go with them, so standing they came in as far as the legs did: on Vitruvian
    (ankles 8.5 cm out from the hips, MakeHuman's 6.8), with narrower hips, a walking priestess's
    and priest's feet came 2.6 and 4.3 cm out through the alb's sides. A drape's sides are now
    built out as far as the legs are apart at their height (`drapes.js`), on both bodies: walking,
    Vitruvian's alb lets the feet out 0.4 and 1.1 cm, and MakeHuman's priest's none (was 2.2).
    The test's limit for the priest is now 1.5 cm (was 3).
  - **Next:** sitting on Vitruvian's longer thighs (with the seated tankards cleared), its
    baseline, and the game switched to it.
- **2026-10-06, sitting on Vitruvian's longer thighs** (§10; docs/CHARACTERS.md *Sitting*).
  - **The knee raised first** (`locomotion.js` `#onFloor`, `SEAT_RISE`): a seated foot the pose
    puts into the floor was brought onto it only by swinging the shin forward, the thigh level on
    the bench. Vitruvian's legs are longer (its knee 4 cm higher, the hip joint at 57.6% of the
    height against MakeHuman's 53.6%), so a drinker's shins leaned 27° out in front (MakeHuman's
    14°). Now the knee rises first, the thigh tipping up off the seat, by up to 4 cm (at 1.7 m
    tall), and the shin swings forward for the rest: 11° and 1°. The tallest bodies still lean
    theirs (Vitruvian's tallest man 49° → 42°); lifted all the way, the knees would meet the
    table.
  - **The tankard** a patron holds before the chest is held about 6 cm higher and 3 cm further
    out (`tankard`, a tenth and a twentieth of an arm's length), and banged down on the table
    further out, clear of a thigh tipped up (held where it was, a 5 cm raise put the thighs into
    it on 24 more pairs on Vitruvian).
  - **Next:** Vitruvian's baseline, and the game switched to it.
- **2026-10-06, the last clipping on Vitruvian, and the switch held back** (§10;
  docs/CHARACTERS.md *Items*, *Arms and hands*, *Reactions*, *Drawing weapons and putting them
  away*, *Resting*, *Clips in the game*). With the game set to Vitruvian, the clipping test failed five ways; each is fixed,
  on both bodies:
  - **Running in spiked gauntlets**, a cat woman's left fist came 1.9 cm into Vitruvian's fuller
    thigh: an arm swinging free is held 16° out with spiked knuckles on its hand
    (`KNUCKLE_CLEARING`), 10° as before for what hangs at the hip.
  - **The crush flinch** bowed the head 12° onto a shield hand held up before the face (an orc's
    helm 1.6 cm into it): the head now tips back 3° as the chest folds, kept off the hand.
  - **The hook's follow-through** came down across the lead fist's forearm (1.7 cm): carried
    round up and out instead.
  - **Putting the cleaver away**, its blade went 2.2 cm into the left thigh: the point is taken
    down further out.
  - **The adventurer's stretch**: a mage's thumb went 2.6 cm into her hat's brim going up: the
    hands go up a hand's breadth further apart.
  - The motion check: MakeHuman 4 failing pairs better, none worse (the baseline brought down,
    1,183 → 1,180); Vitruvian 12 better, none worse.
  - **The clips' bake stays on MakeHuman's body** (`bake-clips.js` `BAKE_BODY`). Baked on
    Vitruvian, the jab's fists came out open and its palms turned up: Vitruvian's rest hand is
    turned 46° about the forearm from the clips' (MakeHuman's 6°), and the retarget lines up only
    the arms (`bvh.js`), so the clips' finger curl went about the wrong axis. The keys baked are
    body-relative and play on either body; the lab plays the clips live, so its clips on
    Vitruvian show it until the retarget lines up the hands too.
  - **The switch held back.** With all of the above, Vitruvian's motion check has 1,298 failing
    pairs to MakeHuman's 1,180: fewer joints past their range (490 to 525), feet in the ground
    (100 to 126) and second hands off their hafts (88 to 148), but more forearms in the torso (322
    to 124: the war hammer's and staff's blows 65 and 83 to 19 and 41, the hammer's draw and
    put-away, kicks), planted feet sliding in every guard (14 bodies to 4) and things held in the
    body (196 to 183). Switched now, those blows would look worse in play.
  - **Next:** the guards' sliding feet and the two-handed blows' forearms on Vitruvian, the
    clips' hands lined up in the retarget, then the switch with Vitruvian's baseline.
- **2026-10-06, running feet planted where they land.**
  - Running, a foot can come down with its leg straight. On long-legged bodies the stride puts
    it down a little above the ground, and the leg straightens all the way to reach it (on
    Vitruvian, the orcs most, and a few of MakeHuman's).
  - The leg was then held to 98.5% of its length the moment after. That drew the foot in, and it
    slid along under the body: up to 5.6 cm in a frame, on 14 of Vitruvian's 30 bodies, in the
    run and every guard's run.
  - Now a running foot is planted where it comes down, and its leg may stay as straight as it
    came down while the foot's down, as the body comes over it (`locomotion.js`, `stretch`).
    Standing still, planting is unchanged: planting where it came down deepened the kicks'
    slides.
  - Two other ways were tried and dropped:
    - Sinking the pelvis onto each overreached landing, as the knees give standing: the unit
      tests caught the hips jolting 25 cm in a frame breaking into a run, bobbing 11.5 cm
      sprinting and a knee flicking sideways.
    - Running lower all the time, eased on a spring: the orcs' ankles went up to 4° past their
      range pushing off, on both bodies.
  - The motion check:
    - MakeHuman: 32 failing pairs better, none worse. Every running slide is gone (5 bodies, 1.1
      to 1.8 cm). The baseline is brought down, 1,180 → 1,150.
    - Vitruvian: 142 better, 10 worse. Planted feet sliding 563 → 433, now fewer than
      MakeHuman's 498. The worse ones: a thin orc woman's push-off ankle in the guards' runs,
      3.06° against the 3° limit, and a spiked boot 2 mm deeper into the other shin. Failing pairs
      1,298 → 1,186, to MakeHuman's 1,150.
  - **Next:** the forearms in the two-handed blows on Vitruvian (322 to MakeHuman's 124), then the
    switch.
- **2026-10-06, the two-handed blows' forearms on Vitruvian.**
  - Vitruvian's shoulders are 2 cm narrower and its upper arms shorter, so the forearms came
    nearer the chest. Its forearms in the torso were 322 failing pairs to MakeHuman's 124, most in
    the war hammer's and staff's two-handed blows, which aren't moved out of the torso.
  - Refitted on both bodies (`actions.js`):
    - the hammer's side swing and diagonal chop turn the body into the blow less;
    - the chop and the staff's blows keep the hands out in front, with keys on the way;
    - the staff's thrust is drawn back before the right hip, not across the belly;
    - the hammer is drawn with the left hand coming round out in front, and put away with the left
      hand letting go first;
    - the shadow boxing keeps the rear fist a little out from the chin;
    - the hammer's guard holds both hands a little further out (the bulkiest man's forearm was
      8.4 cm into his belly on guard).
  - Tried and dropped: the hammer guard's left hand less far across. It cleared the guard on every
    body, but the blows that start and end there came out worse (Vitruvian 35 forearms to 47).
  - The motion check:
    - MakeHuman: 161 failing pairs better, none worse (forearms in the torso 124 → 71, second hands
      off their hafts 148 → 104, joints 525 → 495). The baseline is brought down, 1,150 → 1,096.
    - Vitruvian: 208 better, 7 worse (forearms 322 → 190, second hands 88 → 65). The worse: the
      leaping slam's left forearm on two lizard women and a bulky woman, the slam's second hand on
      two bodies, the overhead smash on the bulkiest orc man, and the hammer's draw on the
      bulkiest man (5.3 → 5.7 cm). Failing pairs 1,186 → 1,066, to MakeHuman's 1,096.
  - **Next:** the switch to Vitruvian's body (`GAME_BODY`), with its own baseline. Its failing pairs
    are now fewer than MakeHuman's. Then the clips' hands lined up in the retarget, and the grip
    round a pole or handle from the user's photos.
- **2026-10-06, pole and handle grips from the user's photos** (§10; docs/CHARACTERS.md *Grips*).
  - The user's photos of a hand round a pole: the pole diagonal across the palm from the base of
    the index finger to the heel of the hand, the fingers wrapped round it in a staircase, the
    thumb over the index and middle fingers. Every hilt and haft in a hand was held at the finger
    bases, past the knuckles, the fingers curled to a fixed shape beside it.
  - `grip.js` (new): the haft is laid on the palm's skin down the item's diagonal; each finger's
    three joints and the thumb are fitted to it on each body, none sunk in it. The sword's and
    cleaver's hand is slid down the hilt between the pommel and the guard (`ITEMS.hilt`): on their
    steep diagonal the index finger lay over the guard. The staff's and hammer's second hand, and a
    guard's torch, are held the same way. About 1.25 ms a hand, once, when it's put in the hand.
  - The arm is placed by the hand's own grip point (the keys were made for it), half way to the
    haft when held in both hands; nearing a sheath hung at the hip, by where the hand holds the
    weapon (a sword lay off the scabbard's line and went 2.7 cm into the hips), and half way for
    the back. The trial reach that finds how the hand turns at the sheath used the full point
    while the arm was placed by the half-way one: the staff's and hammer's draws strained the
    shoulder 7–9° past its range.
  - Tried and dropped: placing the hand by the item's grip point along the haft (the blade's path
    as before: joints 111 → 123, the cleaver no better); a gentler diagonal for the second hand
    (0.12 rad: it cleared the hammer's overhead smash, but second hands off their hafts went 53 →
    72 on MakeHuman, 32 → 57 on Vitruvian); keys added to the cleaver's overhead hack (the
    failures moved between bodies).
  - The motion check:
    - MakeHuman: 150 failing pairs better, 61 worse; failing pairs 1,096 → 1,037. Second hands
      off their hafts 104 → 53 (the staff's blows 96 → 25), forearms in the torso 71 → 55; joints
      495 → 502, things in the body 183 → 194. The worse: the hammer's overhead smash and leaping
      slam's left hand (8 → 28), the cleaver's overhead hack and the sword's backhand into small
      women's heads and chests (0 → 16), and right shoulders 3–4.3° in the sword's and cleaver's
      put-aways. The baseline is kept with them.
    - Vitruvian: 147 better, 117 worse; failing pairs 1,066 → 1,070. Second hands 65 → 32 (the
      hammer's 23 → 2), forearms 190 → 177 (the staff's blows 34 → 15); things in the body 191 →
      225 (the weapon a little further from the hand: the hammer's blows, the stun cast's shield
      against the thumb wrapped round the hilt, the sword's draw), joints 492 → 498.
  - **Next:** the switch to Vitruvian's body (`GAME_BODY`), with its own baseline; then the
    clips' hands in the retarget; the cleaver's overhead hack and the hammer smash's left hand
    refitted to the new grip.

- **2026-10-06, the game on Vitruvian's body** (§10; docs/CHARACTERS.md *The Vitruvian body*,
  *The motion check*).
  - `body.js` `GAME_BODY = "vitruvian"`: the kit, the loading screen's download list, the
    character lab (unless `?body=human`), the motion check and the character tests take
    Vitruvian's body. The clips stay baked on MakeHuman's (`BAKE_BODY`); their keys play on both.
  - The download before the game starts: 9.79 → 10.22 MB (the body 1.65 → 2.19 MB, the skin
    details' masks 0.14 → 0.04 MB), within the 12 MB budget.
  - The motion check's baseline is Vitruvian's, kept with `--update`: 1,070 failing pairs (joints
    498, feet sliding 429, things in the body 225, forearms in the torso 177, feet in the ground
    100, second hands off their hafts 32), where MakeHuman's had 1,037.
  - Pictures, before and after: each people's captain, soldier, reeve and ruler in the uniform
    lab; the same three heroes (seeded) in the start town and close up.
  - **Next:** the clips' hands lined up on Vitruvian's in the retarget; the cleaver's overhead
    hack and the hammer smash's left hand refitted to the new grip; Vitruvian's hands on the
    bulkiest orcs (thin, twisted fingers).

- **2026-10-06, the clips' hands on Vitruvian** (§10; docs/CHARACTERS.md *Motion capture*).
  - In the character lab, Mesh2Motion's clips played on Vitruvian's body with their palms 45°
    from the clip's and their fingers straight where the clip's curl (a sword's grip open round
    the hilt). Measured against the clip's own skeleton, frame by frame: palms 44° off in the idle,
    the middle finger's curl 86° short.
  - The cause wasn't the hand: the retarget turned each upper arm about itself so the elbow bends
    about the same axis as the clip's, and took our elbow's axis from how our rest pose bends it.
    Vitruvian's forearm rests only 11° bent, and the hinge found from it was 47° off (MakeHuman's,
    43° bent, 3°), rolling the whole arm; the joints' ranges then straightened the fingers' curl.
    The hinge is now the rig's own (`Rig` frames, as the rig itself has bent the elbow since PR
    #198), for elbows and knees. Lining up the hands, or rolling the forearms to turn the palms,
    added nothing and was dropped.
  - Now Vitruvian's hands follow the clips as MakeHuman's do: palms 7° off in the idle (MakeHuman
    6°), the fingers' curl within 3° of the clip's. `test/characters.test.js` checks it on both
    bodies.
  - The game's moves are baked keys (each hand's place, palm and finger shape), baked on
    MakeHuman's body, whose hinge was already right: they're left as they are. A rebake moves
    every clip a little (MakeHuman's hinge 3° nearer), so it waits for a motion check of its own.
- **2026-10-06, Vitruvian's hands on the bulkiest orcs** (§10; docs/CHARACTERS.md *The Vitruvian
  body*).
  - The bulkiest orcs' hands were stringy on Vitruvian's body: thin, flat, twisted fingers.
  - Most of Vitruvian's sliders are MakeHuman's shapes carried over, each point's change turned as
    the nearest part of MakeHuman's body lies on Vitruvian's. A longer arm moves the whole hand as
    one, but each finger lies its own way on the two bodies, so the carried change sent each
    finger's skin its own way: up to 6 cm off its bones (MakeHuman's none), a median 36 mm on the
    bulkiest orcs where their bones' moves make 8.
  - In the shapes carried over, the hands' skin now moves with its bones (as the hands' joints
    already did, since PR #198), and only MakeHuman's flesh change is carried (its change less
    what its bones' moves make of it), as Vitruvian's own shapes are. A longer arm's fingers now
    move exactly with their bones; the orc's fingers are 8 to 11 mm round, not 36 to 38.
    `test/vitruvian.test.js` checks it for longer and shorter arms and the orcs' sliders.
  - That had an orc's shield 4.5 cm "into" her thumb as she slipped a blow (`test/clipping.test.js`),
    the thumb 4.5 cm behind it: the skin nearest the shield was one of 30 or so vertices round
    Vitruvian's nails and fingertips that face against their neighbours (folded under; MakeHuman's
    body has none). The motion check (and so the clipping test) no longer measures against skin
    folded under.
  - The motion check on Vitruvian: 1,070 failing pairs to 1,061, things held in the body 225 to
    215, forearms in the torso 177 to 175, kept as the baseline. Of the pairs that changed, 30
    are better (a sword drawn, swung and sheathed by the orcs and the thinnest elves, 3 to 4 cm in
    the body before, now 0 to 1.6; an orc's gauntlet punch's forearm 4.3 to 1.8 cm in the torso)
    and 15 worse, held things placed by the palm's skin now where it is: the bow's lower limb up to
    6.4 cm in the thigh on the bulkiest and tallest elves and dark elves (attack 3), a cleaver
    1.7 cm in dark elf women's heads (attack 0), the grimoire's left forearm 3.4 to 4.3 cm in the
    torso (attacks 1 and 2), the arcanist's hat in the hand (rest 4). Those are to refit.
- **2026-10-06, the shirt through the jerkin at Vitruvian's shoulders** (§10; docs/CHARACTERS.md
  *Equipment*).
  - In the character lab, the hero on Vitruvian's body showed the shirt in ragged patches over
    the tops of the shoulders, through the jerkin.
  - A top's neckline was cut level, 3 to 5 cm under the neck's mark. Vitruvian's shoulders rise
    to the neck, their tops 1 to 4 cm under the mark and counted the torso's (MakeHuman's are the
    arm's, under the sleeve), so the jerkin stopped short of them: only the shirt, cut higher,
    covered them.
  - The neckline now rises steeply over the shoulders past the neck's sides (`neckRadius`,
    measured from the neck's skin: 6 to 9 cm), still dipping at the front. The jerkin covers the
    shoulders' tops on both bodies, and `test/characters.test.js` checks every triangle there.
  - The strap across the chest (the baldric, for what's slung on the back) had ragged edges on
    both bodies: at its own thickness (1 cm) it was under the jerkin (1.2 cm), and 2 cm under a
    breastplate, so only its middle showed. Straps now lie over what's worn under them, pushed
    out by their thickness past the furthest of the lower garments at each point
    (`underneath`): 6 to 15 mm over a jerkin or a breastplate, on both bodies (tested). Posed,
    where it crosses the shoulder, a jerkin can still show through its edge on MakeHuman's body.
- **2026-10-06, the motions the hands' skin made worse, refitted** (§10; docs/CHARACTERS.md
  *Attacks*, *The motion check*, the rests).
  - The bow's crouching shot: the bow comes up before the body as the knees bend (its lower limb
    was up to 6.4 cm in the thigh on the bulkiest and tallest elves and dark elves).
  - The grimoire's overhand hurl and side-arm throw: the book is held further out as the caster
    leans in, and while they unwind (the book arm's forearm was 3.4 to 4.3 cm in the belly).
  - The cleaver's overhead hack: lifted over the right shoulder, out clear of the head, the elbow
    up and out (it was 1.7 cm in dark elf women's heads, and the shortest orc's shoulder 9.1° past
    its range).
  - Looking about with a hand shading the eyes: lower and further forward, under a hat's brim,
    held at the brow a moment, then lowered forward (dropped at once, the curve through the keys
    lifted it into the brim first: up to 2.5 cm on orcs in wizard's hats). The sentry's helmed
    version moves only the shading hand under the helm.
  - Thumbs round a scabbard and a helm: the sword sheathed from a little further forward, the
    shield hand let fall wide of the hilt after slinging the shield, a sentry's hand brought over
    the hilt a little wide of it, and a hammer blow doubling the body over 24° (28° before), its
    helm clear of the shield hand.
  - The motion check on Vitruvian: 1,061 failing pairs to 1,038 (MakeHuman's 1,037), things held
    in the body 215 to 195, forearms in the torso 175 to 167, joints past their range 498 to 497;
    29 readings cleared, none worse. Left: a dead body's little finger 2.8 cm in its scabbard
    (the forward death's clip, 2.2 before #219), and a smith's rest 0.2 mm past its limit on one
    elf (it fails on six other bodies).
- **2026-10-06, the war hammer's smash and slam on the new grip** (§10; docs/CHARACTERS.md
  *Attacks*, *The motion check*).
  - The overhead smash: the hands kept out before the hips as it lands and follows through. Drawn
    in, the left hand came off the haft on the biggest orc men (4.2 to 4.5 cm); the shortest
    women's right shoulders were 3 to 7.4° past their range lifting it, and the bulkiest man's
    hammer was in his thigh.
  - The leaping slam: the hands out before the knees as it lands and on the way back (the left
    forearm was 3 to 7 cm in the belly on 17 bodies as the body folded over it; now on 2).
  - The motion check on Vitruvian: 1,038 failing pairs to 1,036 (most hammer pairs still slide a
    planted foot), forearms in the torso 167 to 155, joints past their range 497 to 493, second
    hands off their hafts 32 to 30; 21 readings better, none worse. On MakeHuman's body (checked,
    not drawn in play) the smash's left hand is still off the haft as it follows through, as it
    was, and the slam's left forearm now meets the chest on 14 bodies (3 before).
- **2026-10-06, Vitruvian's face: blinking and expressions; lashes as strands** (§10;
  docs/CHARACTERS.md *The Vitruvian body*, *The body*).
  - Eight of Vitruvian's own FACS shapes that keep the lips together (blink, squint, a
    closed-lipped smile, angry, sad, frown, brows raised, brows knit), played on the GPU from one
    texture for the kit (moves and the normals' turns at 2,300 vertices, 576 KB) by each
    character's own weights: 15 KB more of the download, one more texture read in the skin's and
    lashes' shaders.
  - Characters blink every few seconds and show what they're doing: angry attacking, pained hurt,
    a little smile with the brows lifting talked to, the eyes half shut dead; the serving wenches,
    the madam and the courtesans smile at rest.
  - The lashes are seated on the lids' edges (they stood 4 to 10 mm out in front of them), swing
    with the lids' edges (moved as the lid's skin nearest them, a closing lid crumpled them), and
    are drawn as tapering strands rather than a grey see-through sheet, the lower lid's shorter.
  - The character lab's *Face* tab shows each face or one expression held.
