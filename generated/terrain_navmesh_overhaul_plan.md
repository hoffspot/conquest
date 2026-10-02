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
  budget. Left for M7's lighting pass, to be measured there.

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
  `NET_VERSION` up (the clock's in the state).
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
    shaders never compile again as they're handed round;
  - the Light spell's globe (below): one of the pool kept for it while it's lit.
- **Night in play:**
  - sight: everyone sees less far at night (the rules' sight range scaled by how much light's
    about: the sky's, and within reach of a torch, a lit window, a fire or a Light globe, the
    day's), so a hero with a torch or Light sees an ambush before it sees them; guards keep their
    posts lit;
  - the night's own creatures: some of the wild's (the undead, wolves, bats, the wight lord's
    sort) out only after dark, or more of them; some shut in by day;
  - **passing time:** a room at any tavern for a few gold (the barkeep), sleeping to the next dawn
    or dusk; or camping: a fire built where no hostile is within 40 metres (and none comes while
    the camp's made), slept by to dawn or dusk (a stamina and health rest too). In a world shared
    with others, only the host passes the time (everyone's woken with them); a player who isn't
    the host can still rest.
- **The Light spell:** a tome on every adventurers' guild's shelves (about 10 gold); read, Light is
  known: a globe of light rising from the caster's hand and following a little over their
  shoulder for 15 minutes of play, lighting about 12 metres round them (their sight at night as by
  day within it), shared cooldown, no school to grow; cast again to put it out.
- **Budgets:** the sky's stars and moon 2 draws; the lights' glows merged with their chunks (no
  draws of their own); the pool's point lights the cost (each lit fragment pays for each one in
  range): measured on the phone profile, the pool cut on Medium and Low if it's over; nothing in
  the rules costs more than a multiply.
- **Pictures:** the same views at dawn, noon, dusk and midnight, before and after; a town at dusk
  with its windows coming on and its torches lit; a road at night with Light.

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
| **M7** | Elden Ring environment pass | In §9's order: the landmark pass in the plan; neutral sites built, with the decay pass; a look round all the generated ground and high land so it looks natural, with no obvious polygons or out-of-place texturing (M7d, §9 *The land looking natural*); day and night, with the moon and stars, lit windows, torches, the Light spell, night in play and passing time (M7e, §9 *Day and night*); cliffs and rocks; churches, citadels, stone bridges; foliage palette, grass ring, weathering; cascaded shadows, measured, if they fit the budget | Pictures after each part; budgets met |
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
