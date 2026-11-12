NAVIGATION: all five items done. Worktree `/home/user/conquest/.claude/worktrees/agent-a7dd13691d7d5c6b2`, branch `worktree-agent-a7dd13691d7d5c6b2`, base `10e4e3c` (your PR 2 branch, fast-forwarded). No push, no GitHub. One proof is short: the repository's browser test would not start on this machine, so the two-page proof is my own script (section 3).

**1. Items**
- **Item 1, DONE, `64bbb7e`**: recast-navigation 0.44.0 vendored, old folder removed. Tiles and ways are bit-identical with 0.43.1, so no `NET_VERSION` bump. New `test/bake.test.js` holds three made-up tiles' SHA-256 and a way over each.
- **Item 2, DONE, `4b62d4a`**: one `RecastBuildContext(false)` per module, `params.destroy()`, and each freed heightfield or mesh forgotten by the binder.
- **Extra, `c517b1b`**: a mesh left a wrapper for every tile added and three for every mesh disposed; fixed. Each tile's data was also kept twice (a JS copy only a test read, about 10 KB a tile); now once.
- **Item 3, DONE, `bf1097e`**: generators removed; core and wasm pinned to exactly `0.44.0`. The vendoring script writes `recast.mjs` in the folder, and `recast.js` imports that once. The script also points `recast.js` at the new folder and deletes other versions. A test checks package.json, lockfile, folder, `recast.js`, README, WORLD.md and two tests all name one version.
- **Items 4 and 5, DONE, `403def4`**:
  - Hook added to `client/js/core/netplay.js` (`Joining`), nothing else there: the property `this.onWay = null`, and in `hear`'s ops loop `if (this.onWay && Array.isArray(op) && op[0] === "v") this.onWay(op[2], op[3]);`.
  - A copy had no baker at all (`#bakeAhead` returned early for `remote`), so even tiles beside its own hero were baked in steps. It now bakes round its own hero and under each way heard (`NavBaker.along`).
  - Floors: `NavBaker.floor` on "open"; tiles are kept (`bakedAhead`) until the floor's mesh is made, then taken without baking.
  - Two races closed: a tile dropped by `dropTiles` while at the worker was added back stale (already true on hosts); and the baker sent no measures to the worker.
- **Extra, `cda6826`**: for the battle engineer's `#aside` note, `walkable` now calls Detour directly. No `battle.js` edit.
- `8c1b27a`: a comment in `app/forecast.js`.

**2. Measurements**

| What | How | Before | After |
|---|---|---|---|
| 0.43.1 against 0.44.0 | both in one process, seeds 1, 2, 77 | n/a | 1,095 tiles (8.6 MB), 2,012 ways, 8,048 answers identical |
| Heap per bake | `bake-leak.mjs`, 400 bakes | 2,584 bytes | level (0.02 MB over 1,800 bakes) |
| Wrapper caches | `bake-cache.mjs`, 20 bakes | 8 classes grew | none |
| Copy's in-step bakes, both heroes walking | host and copy in one process, real time, 80 ms link, 120 s | 12 tiles in 12 steps, 404 ms, worst 87 ms | 0 (77 on the worker) |
| Same, heroes standing | seed 1, 120 s; seed 2, 90 s | 12 in 12 steps, 203 ms; 6 in 4, 120 ms | 0; 0 |
| Floors baked in steps | host walking door to door, 180 s | 11 | 0 |
| `walkable` | 4,000 town points, CPU time | 4.77 µs | 3.10 µs |
| Eight asks, as `#aside` | same | 26.2 µs | 14.3 µs |

The copy's checks passed the same number of times before and after (23 world, 599 motion), with 0 desyncs.

**3. Tests**
- Final unit run: 133 of 133 across bake, navbaker (new), navigation, ahead, forecast, motion, walls, stockades, hostless, netplay, together, manifest.
- Earlier run: 191 of 191, also covering snapshots, runner, scenery, world-server, release, contribution. Part of it predates the `walkable` change (`cda6826`); runner, scenery, snapshots and world-server were not re-run on the final code.
- Packaging: 95 of 95 (mac-app, sw, loader, test-affected, build-site).
- ESLint is clean on every changed file.
- `e2e/together.spec.js:1483` failed twice at the host's 120 s start wait, before any of my code runs (load average 25 to 32). My script `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/nav/two-pages.mjs` follows the same steps with long waits and passed: guest 49 tiles from the worker, 0 baked in steps, 0 desyncs, final checksums equal.
- Expectations changed:
  - `test/ahead.test.js` reads the worker's bytes as they're added, since `.data` is no longer kept.
  - `test/netplay.test.js` gains hook assertions.
  - `test/manifest.test.js` names the four recast files.
  - `e2e/together.spec.js` gains one assertion (guest has at least 9 worker-baked tiles); it has not passed in the spec itself.
- No motion expectation changed.

**4. For you when integrating**
- Run `npm run build:manifest`: the import map and manifest gain `recast.mjs` and lose the 0.43.1 entries. Until then `test/manifest.test.js` fails on my commits.
- Regenerate `package-lock.json` with npm.
- No version bumps.
- Docs updated: WORLD.md, GAME.md, WAR.md, README, contribution.md.
- Expect conflicts in `app/game.js` (import of `RUNNER`, constructor, load, dispose, `#bakeAhead`, `#bakeNear`, `#hear` open and close, rehost), `netplay.js`, `test/netplay.test.js`, `e2e/together.spec.js`, `test/manifest.test.js`.
- The scaling plan names no navigation slice, so none applies.

**5. Left alone**
- `battle.js`: the header still says ways are the battle's only dealing with the meshes, and a forecast's `#clear` asks `walkable` without `madeOnly` (finding 4b). Both are for the battle engineer.
- Tiles under ways whose ground the copy hasn't made still bake in the step, chunks included. That needs host finding 3.
- At join, walkers' current ways aren't heard, so they're covered only within 96 m of the hero until their next way.
- I did not make folk wait for floors (`later`): it would change browser-hosted folk behaviour. A floor asked for before the worker returns still bakes in its step.
- The world server still bakes floors on its own thread between steps.
- The debug view's `polygons` leaves wrappers (debug mode only).
- An empty room mesh holds 265 KB of WebAssembly memory.