**The findings file was not written.** The harness refused the Write ("Subagents should return findings as text, not write report files"), and I did not work round it. The full findings are below in the layout the brief asks for; save them as `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-host.md` if you want the file. The summary of at most 400 words is at the end.

# Findings: host (the world's rules outside the fighting, and the making of the world)

## How this was measured

- Node 22.23.4 on a 4-core Intel Xeon at 2.1 GHz, shared with the other reviewers (load average 9 to 22 throughout). Wall-clock times were inflated two to three times and jumped about, so:
  - costs are given as **this thread's CPU time** (`process.threadCpuUsage()`; its clock ticks every 4 ms, so means are sound and medians of short things are coarse), or
  - as **the least each step took over 3 or 4 runs of the same world** (the simulation is deterministic, so the least is the step's own cost).
- A recent iPhone runs single-threaded JavaScript roughly twice as fast as this machine. That is an estimate, not a measurement: every phone figure below is SUSPECTED and needs your in-browser profile.
- Nothing in the repository was changed. One experiment needed a constant changed (`KEEP`); a Node loader hook rewrote the module as it loaded.
- Scratch scripts are all in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/host/`: `steps.mjs` (the step budget with counters), `minsteps.mjs` (least over runs), `approach.mjs` and `approach-server.mjs` (walking up to a town), `chunks.mjs`, `chunkprof.mjs`, `insides.mjs`, `tiles.mjs`, `laid.mjs`, `looks.mjs`, `snap.mjs`, `restore.mjs`, `build.mjs`, `parse.mjs`, `solo.mjs`, `gc.mjs`, `alloc.mjs`, `soak3.mjs`, `keep.mjs` with `keep-hooks.mjs`, `prof.mjs` (reads a `.cpuprofile`). CPU profiles are in `prof/`, `prof2/`, `prof3/`, `prof4/` there.

### The numbers asked for (question 5)

| Run | Result |
|---|---|
| `npm run step-budget` (once) | 1,200 steps, mean 1.24 ms, p99 9.3 ms, worst 32.8 ms; 175 chunks made ahead; ready in 7.4 s; heap 59 MB; no step over 50 ms |
| `npm run step-budget -- --json` (three times, and once under the profiler) | mean 2.00, 1.25, 1.66, 1.45 ms; p99 17.3, 10.1, 14.3, 13.0 ms; worst 148, 64, 80, 65 ms. Each run reported one step over 50 ms, at 26.8 s, 2.95 s, 37.65 s and 4.55 s of the world's time: a different step each time, so the machine and not the step |
| The same world, least of 4 runs per step | mean 0.84 ms, p50 0.59, p90 1.68, p99 5.5, worst 13.8 ms |
| The same without making ahead (`--no-ahead`, least of 3) | mean 3.07 ms, p99 25 ms, worst 733 ms (the opening step), then 136 and 115 ms |
| CPU per step (thread time, 3 runs) | 0.83, 0.87, 0.93 ms; the battle is 71 to 77% of it, the host's own work 0.2 to 0.5 ms |
| Before the clock starts (4 players) | the opening step 0.93 to 1.24 s of CPU; what's round the players made ahead 4.3 to 4.7 s of CPU on the simulation's thread |
| The soak, Node only, 3 minutes (`soak3.mjs` calls `scripts/soak.js`'s own `soak()`; its report was not written into the repository) | 3,600 steps, mean 0.95 ms, p99 4.3 ms, worst 47.6 ms (wall clock); 37 checksums and about 905 motion checks per joiner, all matching; no resync; no failure |

**The profile** (`node --cpu-prof scripts/step-budget.js --json`, main thread, 19.2 s in all):

| Share | Where |
|---|---|
| 44% (8.5 s) | `Ahead.pump` making the world ahead **on the simulation's thread**: `Overworld.chunk` 6.3 s (175 chunks), the navigation tiles' triangles 1.4 s (`Navigation.input`), buildings' insides baked 0.5 s |
| 18% (3.5 s) | `buildWorld` (`planWorld` 2.0 s of it) |
| 12% (2.3 s) | the garbage collector |
| 10% (1.9 s) | the opening step: `#muster` to `#stations` to `nearestFree` to `Overworld.chunk` is 1.5 s of it |
| 9% (1.7 s) | the 1,200 steps: `Battle.advance` 76%; of the rest `#wilds` 6.3%, `#muster` 3.2%, `#spotting` 2.2%, `#lookAround` 2.0%, `#ringStep` 1.7%, `#townsfolk` 1.7% |

Hottest functions over the whole run by self time: the garbage collector 11.7%, `Overworld.#make` 5.0%, `landHeight` 3.9%, `stillOf` 3.6%, `Ground.#onRoads` 2.9%, `tileInput` 2.3%, `Waters.#nearest` 2.2%. In the steps alone: `Battle.#ringsNear` 8.4%, `#travel` 4.3%, `#within` 4.2%, `#routine` 4.0% (the combat reviewer's).

---

## 1. Findings, ranked

### 1. Make the ground a town, an army or a camp will stand on before the step that brings them out

- **Where:** `client/js/core/host.js:6029` (`#raise` when a player is within `MUSTER.near`, 120 m, of a town's edge); `:6216`-`6243` (`#stations`: `nearestFree(..., { within: 24 })` round every patrol's round); `:5822`-`5825` and `:5885`-`5889` (`#outward`: `errandsOf` asks for a free square at every errand); `:6088` (`#meetArmy`, 300 m); `:6069` (`#pitch`, 150 m); `:6162` (`#raiseFort`, 200 m). Each reads the world's squares through `overworld.js:447`-`455` (`chunkAt`), which makes a chunk there and then (`overworld.js:601`-`626`). What is made ahead does not reach that far: the browser draws the 25 chunks within two of the player (`docs/GAME.md:2543`), the server makes those within three (`server/ahead.js:27`, 224 m), and a city's far side is over 300 m off when its garrison musters.
- **What happens now.** MEASURED. A solo world as the browser hosts it, with everything the browser makes off the step made between steps and not counted (`approach.mjs`, least of 3 runs per step):

  | Walking up to | The slow step | Chunks made inside it | The run's p99 |
  |---|---|---|---|
  | human-city-1 | 135 ms, as its garrison musters | 7 | 1.6 ms |
  | human-capital-1 | 190 ms, as its townsfolk come out | 5 | 1.3 ms |
  | elf-city-1 | 123 ms, muster | 4 | 1.4 ms |
  | orc-capital-1 | 197 ms, muster; 60 ms, townsfolk; 28 ms, an army met | 8, 4, 1 | 1.3 ms |

  On a world server with `server/ahead.js` given all the time it wants before every step (`approach-server.mjs`, least of 3): 88 ms as the garrison musters (5 chunks) and 75 ms as the townsfolk come out. The profile of that step is `errandsOf` to `nearestFree` to `chunkAt` to `Overworld.#make` (`prof4/`).
- **What it costs whom.** A phone: one frozen moment, by estimate 60 to 100 ms (4 to 6 frames), the first time a player nears each town, city, capital, army or camp (SUSPECTED on the phone). A world server: a step of 75 to 110 ms against a 50 ms budget, holding up every player in the world, whenever any one of them comes up to a town. The S9 soak could not see it: its players stayed in their towns.
- **The change.** Have the host say what ground it will soon want, and have what already makes the world ahead make it:
  1. In `Host`, a read-only `soon()` giving boxes of squares: for each town, works, camp, fort, army and settlement not yet out whose distance test would pass with about 80 m added, the box its stations, errands or line fall in (a settlement's `squareOf(place)` grown by 24; a force's `at` grown by its line's width).
  2. `WorldRunner.bakeAhead` (`runner.js:167`) passes them on.
  3. `server/ahead.js` `around` (`:82`) queues their chunks after the players' rings. The browser's game makes one a frame from the same budget as `chunks3d`'s `BUILD_BUDGET`.
  If they are not made in time, the step makes them as now, so nothing depends on it.
- **Gain expected.** Those 60 to 200 ms steps fall to the run's ordinary few milliseconds (estimate: those steps are almost all chunk making).
- **Effort:** M.
- **Risk.** None to the simulation: a chunk is the same whenever it is made (`test/overworld.test.js`, and the server already relies on it), so no version number moves. More chunks are kept at once: do finding 2 first on a server.
- **Confidence:** MEASURED in Node; the phone's figure SUSPECTED.
- **To verify.** `approach.mjs` and `approach-server.mjs` show no step over 20 ms and "chunks made inside steps 0". In the browser, the debug log's slow steps no longer line up with `muster` and `townsfolk` events.

### 2. On a world server, keep as many chunks as its players need

- **Where:** `client/js/core/overworld.js:205` (`KEEP = 256`) and `:617`; `client/js/core/terrain/ground.js:61` (`KEEP = 256`), `:152`, `:175`; `server/ahead.js:27` (`chunks: 3`, so 49 chunks a player); `client/js/core/navigation.js:35` (`KEEP_TILES = 1024`).
- **What happens now.** MEASURED. Six players apart want 294 chunks and the world keeps 256: it lets one go to make another, over and over. Eight players in eight towns, each walking about within 40 m of home, 300 s of the world's time, the same moves (`steps.mjs --players 8` with `keep.mjs`):

  | | KEEP 256 (as shipped) | KEEP 1024 |
  |---|---|---|
  | Chunks made between steps while playing | 1,233 (4 a second) | 28 |
  | Chunks made inside steps | 74 | 5 |
  | CPU between steps, per step | 3.26 ms | 0.25 ms |
  | Pumps over 8 ms / over 25 ms (of 6,000) | 1,254 / 225 | 91 / 33 |
  | The thread's CPU in all | 33.6 s (11.2% of a core) | 13.4 s (4.5%) |
  | Chunks kept | 256 | 427 |

  Over 900 s with fights the count reached 3,009 and never levelled off. The navigation's tiles sit at their own limit too (1,024 kept, 1,304 added in 300 s): eight players want about 121 each.
- **What it costs whom.** A world server with six or more players apart: 60% of its world thread's CPU, and one tick in five held up by more than 8 ms. The S9 soak's "18% of a core" (`generated/world_server_plan.md:1466`) includes this.
- **The change.** Make both limits something the server sets, as it already does for rooms' meshes (`keepRooms`, `server/ahead.js:54` and `:165`): `Overworld` and `Ground` keep `max(256, 64 × players)` chunks and the navigation `max(1024, 160 × players)` tiles, set from `Ahead` as players come and go. The browser keeps 256.
- **Gain expected.** MEASURED: the world thread's CPU from 33.6 s to 13.4 s per 300 s at eight players.
- **Effort:** S.
- **Risk.** Memory: about 70 KB a chunk (eight 4 KB layers, its heights twice, its slopes), so 427 chunks are 30 MB where 256 are 18 MB. No change to the simulation.
- **Confidence:** MEASURED.
- **To verify.** The server's report already carries `made.chunks` (`server/world-worker.js:355`): with players standing about it should stop rising.

### 3. Make a chunk a step at a time, and give the server the terrain worker

- **Where:** `client/js/core/overworld.js:1148`-`1433` (`#make`, one piece); `server/ahead.js:110`-`124` (`pump`: 8 ms allowed, "at least one"); `server/world-worker.js:359`-`372` (a pump every 25 ms tick, two a step); `client/js/world/chunks3d.js:977` (the drawing's first step is `this.overworld.chunk(cx, cy)`, whole); `client/js/world/terrains.js` (heights worked out in a worker, used by the browser only: nothing under `server/` uses it).
- **What happens now.** MEASURED (`chunks.mjs`, thread CPU, 3 runs of 400 chunks):

  | | Mean | 9 in 10 under | Worst |
  |---|---|---|---|
  | A chunk, its heights worked out on the same thread (the server) | 20 to 28 ms | 34 to 42 ms | 51 to 157 ms |
  | A chunk, its heights given by the worker (the browser) | 12 to 15 ms | 17 to 21 ms | 35 to 193 ms |
  | The heights alone | 3.2 to 5.0 ms | 5.5 to 9.3 ms | 8 to 12 ms |

  With heights given, the rest is spread thin (`chunkprof.mjs`, 294 chunks): `landAt` for each of 4,096 squares 31%; the roads levelled into the ground 30% (`Ground.#onRoads` 17%); the trees 10%; settlements laid out 8%; the features 8%; the trails' ways 7%; the sites set down 5%.
- **What it costs whom.** A server: every chunk is two to three times `pump`'s 8 ms, twice a step, so a player arriving (49 chunks, about 1.2 s of CPU) or travelling keeps the thread busy in 20 to 150 ms pieces between everyone's steps. A browser: one piece of 12 to 15 ms here (by estimate 6 to 8 ms on a recent iPhone, SUSPECTED) for each new chunk, against the 6 ms budget the rest of the chunk's drawing keeps to. `generated/terrain_navmesh_overhaul_plan.md:1385` budgeted "≤ 1 ms per frame on the main thread": the heights moved to the worker and the rest did not (planned, partly done).
- **The change.**
  1. (S) In `server/ahead.js`, make a `Terrains` beside the `NavBaker` and `Layouts`, and ask it for the queued chunks' heights and the trails near: the same worker code, on Node's threads (`server/workers.js`).
  2. (S) Pump chunks only in the tick just after a step ran, so a 25 ms chunk never lands just before the next step is due.
  3. (M) Turn `#make` into a generator (its squares a band of rows at a time, then the ground, the trees, the features), with `chunk()` running it to the end as now and a `chunkWithin(ms)` for `Ahead.pump` and `chunks3d`. The codebase already works this way (`core/steps.js`, `chunks3d`'s `*#drawing`).
- **Gain expected.** (1) about a fifth of each chunk's cost off the world's thread (measured: 3 to 5 ms of 20 to 28, and the trails' 7%). (3) no piece longer than the budget given (estimate).
- **Effort:** S, S and M.
- **Risk.** None to the simulation (the chunk is the same bytes). A chunk half made when something asks for it must be finished at once; the tests that make chunks in different orders cover it.
- **Confidence:** MEASURED for the costs; READ for the fix.
- **To verify.** `chunks.mjs`; `steps.mjs` reports the pumps over 8 and over 25 ms.

### 4. Plan the world off the page's thread, and keep the plan

- **Where:** `client/js/app/session.js:61` and `:73` (`buildWorld` on the page's thread, for a new game and for a joined one); `client/js/core/overworld.js:2477` (`buildWorld({ seed, race, plan = planWorld(seed) })`: it already takes a plan); `client/js/core/worldplan/plan.js:58`.
- **What happens now.** MEASURED (`build.mjs`, thread CPU, 3 runs, seeds 2 and 7): `planWorld` 1.45 to 1.55 s, the rest of `buildWorld` 0.83 to 0.94 s. It runs every time the game is opened, for every player who joins, and each time a world server's world is entered (`generated/world_server_plan.md:1525` budgets "build 2.9 s"). The plan is 1.5 MB of typed arrays and 107 KB of the rest, the same for a seed every time.
- **What it costs whom.** Loading: 2.3 to 2.5 s here with the page frozen behind "Building the world" (by estimate 1.2 to 2.5 s on a recent iPhone, SUSPECTED), on every load.
- **The change.**
  1. Run `planWorld(seed)` in a worker as soon as the seed is known, its typed arrays transferred, and hand it to `buildWorld`. It then overlaps the character kit's loading.
  2. Keep the plan by seed and the code's version (`app/version.js`) in IndexedDB or the Cache API, and on the server beside the world's save, so only the first load after an update works it out.
- **Gain expected.** 1.5 s of every load after the first here (60% of the build, measured), and a loading bar that keeps moving.
- **Effort:** S for the worker, M with the cache.
- **Risk.** A stale plan after a code change gives a different world: the key must change with every deploy. No change to the simulation.
- **Confidence:** MEASURED in Node. This may be the loading reviewer's item seen from the other side: please merge them.
- **To verify.** The "Building the world" phase in the loading telemetry.

### 5. Make a dungeon before the player is at its door, off the step

- **Where:** `client/js/core/host.js:14128`-`14131` (`interiors.make(key)` inside the look round once a player is within `DELVES.near`, 45 m: `client/js/core/dungeons/play.js:18`); `client/js/core/insides.js:1732`-`1742` and `:1839` (`#makeDungeon`: every level at once; it already reports itself to the debug log when slow).
- **What happens now.** MEASURED (`insides.mjs`, 12 dungeons, thread CPU, 2 runs): 41 to 83 ms each for 2 to 4 levels (9,300 to 15,800 squares); the first in a session 198 to 257 ms, its code not yet compiled. Each level's navigation is then baked as its foes first find their ways (a level is about nine 32 m tiles).
- **What it costs whom.** A phone: a freeze of by estimate 20 to 120 ms, 45 m from the entrance, in plain view (SUSPECTED). A server: a step over budget for everyone.
- **The change.** As settlements are (`world/layouts.js`, `settlements.js:117`-`127`): work the dungeon's levels out in the layout worker from what makes them (site, seed, theme, tier, how many times remade) when a player is within about 150 m, and take the result in `make` if what it was made from still matches; else make it there as now.
- **Gain expected.** The 41 to 257 ms step gone (estimate).
- **Effort:** M.
- **Risk.** The tier is fixed by who is near when it is made (`#findersTier`, `host.js:14248`): the worker's answer must be thrown away if the tier differs, or copies of the world would disagree. No version number moves if that check is kept.
- **Confidence:** MEASURED for the cost; READ for the fix.
- **To verify.** `Steps.slow` no longer names "making the dungeon"; `insides.mjs`.

### 6. Halve the snapshot: leave out what an actor has at its default

- **Where:** `client/js/core/battle.js:1678`-`1682` (every actor cloned whole); `client/js/core/host.js:3095`-`3176`; `client/js/core/wire.js:21`-`38` (`encode` and `decode` each call a function for every value); `server/keeper.js:37` and `server/storage/worlds.js:286`-`287` (taken and encoded on the world's thread every turn of the war, a minute); `client/js/core/netplay.js:900` (the same text is a joining player's welcome).
- **What happens now.** MEASURED (`snap.mjs`, `steps.mjs`):

  | | 4 players, 155 actors | 8 players, 624 actors, fights |
  |---|---|---|
  | Text | 392 KB (31 KB gzipped) | 1,503 KB (110 KB gzipped) |
  | The battle's share | 310 KB | 1,295 KB |
  | `snapshot()` | 5.6 to 9.9 ms | 45 ms (loaded machine) |
  | `encode` | 3.1 to 4.2 ms | 20 ms |
  | `decode` | 15 to 23 ms (plain `JSON.parse`: 1.8 ms) | not timed |

  An actor has 118 fields and takes about 2 KB. Half the actors' bytes are fields that are `null`, `false`, `0`, `[]` or `{}`. There are 665 `{"$":"-Infinity"}` marks, about four an actor (`sawPlayerAt`, `foughtAt`, `lastSeen`), which is why `decode` cannot skip its reviver.
- **What it costs whom.** A world server: 65 ms on the world's thread once a minute at 624 actors, against a budget of 100 (`generated/world_server_plan.md:1528`), growing with the world. A joining player and a copy set right: 0.4 to 1.5 MB to carry. Carrying on from the small one on a fresh world (`restore.mjs`, 3 runs): `decode` 19 to 32 ms, `Host.restore` 113 to 125 ms, and its first step after 380 to 414 ms of CPU.
- **The change.**
  1. One table of an actor's defaults in `battle.js`; `snapshot()` leaves out each field equal to its default and `restore` fills them in.
  2. In `wire.js`, `decode` runs plain `JSON.parse` when the text has no `{"$":` in it, and otherwise parses plainly and walks the result once by hand.
- **Gain expected.** About half the text and half the cloning (estimate from the 50% measured); `decode` from 15 to 23 ms towards 2 to 4 ms.
- **Effort:** M.
- **Risk.** The save's format changes: `SNAPSHOT_VERSION` with a step in `SNAPSHOT_STEPS`, and `NET_VERSION` for the welcome. A default missing from the table would restore wrong; the round-trip and checksum tests catch it. `battle.js` is the combat reviewer's: yours to place.
- **Confidence:** MEASURED.
- **To verify.** `snap.mjs`; a world's checksum the same after save and restore.

### 7. Bake a building's floor in the worker as it opens (the browser)

- **Where:** `client/js/core/navigation.js:262`-`279` (`ensure`: baked where it's wanted); `client/js/core/navigation/settings.js:41` (`ROOMS`: a tenth of a metre a voxel, a 32 m tile); `client/js/app/game.js:3520`-`3531` (the game's `NavBaker` is the overworld's only); `server/ahead.js:135`-`153` (the server already bakes them between steps).
- **What happens now.** MEASURED (`tiles.mjs`, thread CPU): a tavern's or a keep's floor 5.5 to 10.9 ms, on the page's thread, in the step in which its folk first find a way. A town opens five to nine buildings as a player walks through it (29 open for 4 players). Out in the world a tile is 1.0 to 2.5 ms of triangles on the asking thread and 6.2 to 6.9 ms of Recast in the worker.
- **What it costs whom.** A phone: by estimate 3 to 6 ms inside a step for each building that opens, and several in a row on a dungeon's level (SUSPECTED).
- **The change.** When a building opens (`host.js:18594`, the "open" event), send its floors' squares to `navworker.js` and add the tiles as they come back; `ensure` stays as the fallback.
- **Gain expected.** 5 to 11 ms a floor (here) off the page's thread.
- **Effort:** S to M. **Risk:** none to the simulation (the same bytes either way).
- **Confidence:** MEASURED for the cost; READ that the browser has no such path.
- **To verify.** `navigation.baked` for a room stays at 0 after its building opens.

### 8. Small things in the look round, worth an afternoon together

- **Where and what** (the look round runs every 500 ms, `host.js:2858`-`2870`):
  - `host.js:6176`: `#placeOf` is `plan.places.find` over 183 places, called for each of the war's towns every look. It is 27% of `#muster`'s time (78 of 290 ms in `prof3/`) and 2.2% of a quiet step. A `Map` by id, made once.
  - `host.js:10938`: `#siteOf` the same, over 257 sites, 18 callers.
  - `host.js:18549`: every building known is copied and sorted by key each look. A look goes from 0.74 to 0.87 ms at 15 buildings to 1.37 to 1.77 ms at 1,004 (`looks.mjs`, 3 runs). Keep the sorted list and re-sort when `interiors.version` changes.
  - `host.js:11095` (`placesOf(plan)` built afresh each look), `:14096` (`[...plan.sites, ...keeps]` each look), `:2996` (all 325 places worth finding filtered for each player each look).
- **What it costs whom.** MEASURED (`alloc.mjs`): a quiet solo world allocates about 235 KB a step (4.6 MB a second). 77% is the battle's (`#ringsNear` alone 16%: the combat reviewer's); about 54 KB a step is the host's, `#wilds` half of it. In Node the collector took 25% of the stepping's CPU in a solo world (`gc.mjs`: 170 scavenges in 300 s, 1,056 of 4,209 ms).
- **Gain expected.** 3 to 5% of a step's CPU and about a fifth of its garbage (estimate).
- **Effort:** S. **Risk:** none if the results are the same. **Confidence:** MEASURED.
- **To verify.** `alloc.mjs`, `looks.mjs`.

### 9. The war's turn is one 10 to 13 ms step a minute

- **Where:** `client/js/core/host.js:2881`-`2926` (`#warOn`); `client/js/main.js:1228`-`1229` (the browser saves the war to `localStorage` in the same frame).
- **What happens now.** MEASURED: the step at 59.95 s took 11, 12 and 13 ms as the least of 3 or 4 runs in three different worlds, where the run's p99 is 1.3 to 5.5 ms.
- **What it costs whom.** A phone: by estimate one dropped frame a minute. Small.
- **The change.** None recommended on its own: spreading a turn over several steps changes the simulation (both version numbers). Moving the browser's save out of that frame is free, if your profile shows the frame.
- **Effort:** S for the save. **Confidence:** MEASURED in Node.

---

## 2. Checked and already good

- **The host's own step.** A solo world costs 0.18 to 0.64 ms of CPU a step with 40 to 73 in it; four players 0.84 ms (least of 4), p99 5.5 ms, worst 13.8 ms with the world made ahead. The host's share is a quarter; the look round is about 2.4 ms every tenth step.
- **Events.** 0.22 a step in a quiet world (18 bytes encoded); 2.5 a step with eight players fighting (346 bytes); 122 at the most in one step. Each is one small object (`host.js:18698`).
- **Caches with a limit.** `Overworld.chunks` 256, `Ground`'s heights 256 twice, the overworld's navigation tiles 1,024, a room's 64, rooms' meshes 16 in the browser and 64 or more on a server, the war's log 300 (`war.js:209`), `host.done` 50, `StepTimes` 1,200, `NavBaker.wanted` 256. `cleared`, `fallen`, what lies on the ground and the campfires go by time. `Explored` is 2 KB of bits and sets no bigger than the world.
- **Rooms' meshes don't thrash for one player.** At the start town and at a capital, 4 to 6 floors are open against 16 kept; no mesh was made twice in 240 s (`solo.mjs`).
- **What grows without a limit is bounded by the world, and small.** MEASURED (`laid.mjs`, heap after a forced collection): all 182 settlements laid out is 33 MB more (a capital 0.93 MB, a city 0.45, a town 0.25); all 257 sites set down 8.5 MB; all 945 buildings' insides made 49 MB (52 KB each). A player who went everywhere would hold about 90 MB never let go; one who visits twenty places, a few megabytes. Not a cause of the phone's crashes.
- **The look round as the world is explored** is under a millisecond more with every building known.
- **Saves in the browser**, at the call sites read, are written as things happen (a purchase, a trade, a gift, a mission won, a chunk found, the war's turn), not every step.
- **Settlements' layouts** cost 199 ms of CPU for a capital (403 at the worst), 77 for a city, 45 for a town, and are in a worker in the browser and on the server.
- **Making ahead on the server works**: without it the same steps are 733, 136 and 115 ms.
- **`host.js` parses in 12 to 13 ms** here (857 KB, lazily); importing it with all it needs is about 190 ms of CPU.

---

## 3. Bugs (not performance)

1. **"A elven convoy", "A orcish convoy".** `client/js/core/missions.js:377` does `target.name.replace(/^the /, "A ")`, and the name is "the elven convoy of iron" or "the orcish convoy of ..." (`missions.js:202`, `war/peoples.js:23`). Sure.
2. **The world's clock has no limit on catching up.** `client/js/core/runner.js:115`-`137` plays every step it's behind in one call, and `server/world-worker.js:363` gives it all the time gone by. `generated/world_server_plan.md:232`-`233` says it "catches up by at most 1 s a tick, then lets the rest go and logs it": planned, not built. If steps ever average over 50 ms the thread falls behind for good, and after any stall it plays the whole backlog before anything is sent (`hosting.flush` runs once per call, `runner.js:131`). The browser is safe (`app/game.js:3630` gives a frame at most 0.1 s). Sure of the code; the failure was not provoked.
3. **`Ahead.settled` can never come true once the players want more chunks than are kept** (`server/ahead.js:188`): tiles wait for chunks that were let go, and nothing asks for them again until someone moves 16 m. Only scripts ask it (`scripts/soak.js:339`, `scripts/step-budget.js:74`). Seen: eight players never settled in 120 s. Gone with finding 2.
4. **`npm run step-budget` judges by the wall clock** (`scripts/step-budget.js:95`-`105`): here four runs of five exited 1 for a step "over 50 ms", a different step each time, where the steps' own worst is 13.8 ms. It isn't run in CI. `process.threadCpuUsage()` (the world's thread already reports it, `server/world-worker.js:352`) would make its answer hold on a busy machine.
5. **A player's leaving leaves a little behind.** `host.js:1929` (`leave`) doesn't delete their entry in `this.travel` (`:11303`), which is in every snapshot (`:3149`), nor `messengersHeard` or `courtWarned`; `runner.js:106` (`bakedAround`) keeps one per player for good. About 200 bytes a visitor. Sure (read).
6. **What `server/ahead.js` queued round a player stays queued when they go** (`:100`): someone who steps through a guild's portal leaves up to 49 chunks to be made where nobody is, about a second of CPU. Sure (read); small.

---

## 4. Code structure

`host.js` is one class of 559 methods in 18,701 lines (857 KB; 227 KB gzipped; about a sixth of its lines are comments), laid out in 34 marked sections by subject. The biggest:

| Lines | Subject |
|---|---|
| 5,777 to 10,100 | the war near a player: townsfolk, muster, invasions, armies, wagons, skirmishers, convoys, forts, barracks, works |
| 10,107 to 14,060 | the wild: packs, camps, lairs, rare encounters, threads, treasure |
| 14,061 to 14,646 | the dungeons |
| 14,647 to 15,934 | followers and parties |
| 17,128 to 18,490 | standing and the war's missions |
| 728 to 940 and 3,095 to 3,466 | the snapshot and its steps forward |

**What its size costs, measured:**

- **Parsing:** 12 to 13 ms. Not worth acting on.
- **Download:** 227 KB gzipped of the core's 4.5 MB of source, comments and all, as there's no build step. That belongs to the delivery plan, not to splitting the file.
- **Tests:** 100 of 292 test files import it; each pays about 0.19 s of CPU to import it and what it needs. About 19 s of CPU across the suite.
- **Merge conflicts:** in the last 498 commits, 47 of 309 changes touched `host.js`, but of 30 merges that recorded a conflict it was in one. The generated files (`assets.js`, the import map, `manifest.js`) are in all 30, and `CLAUDE.md` already says to regenerate those.
- **What it does cost** is a reader's time, a person's or an agent's: no tool shows it whole.

**Why it hasn't split:** nearly every method is `#private`, and private methods can only be called from inside the class body. `#event` is called 333 times, `#spots` 38, `#pack` 26, `#enlist` 22. The state they share is already public fields.

**A split that pays for itself without a rewrite:**

1. Move what needs nothing private first: the 80-odd exported constants (lines 84 to 1,196) into `core/host/rules.js`, and `SNAPSHOT_STEPS` with `forward` into `core/host/snapshot-steps.js`. `host.js` re-exports them, so no importer changes. About 1,300 lines, no risk.
2. Then one subject at a time, starting with one nearly on its own (the dungeons, 590 lines; the hell rifts, 1,100): its methods become functions taking the host, and the dozen private helpers they call become ordinary methods with a leading underscore. The snapshot and checksum tests say at once whether anything changed.
3. Stop when the file reads. The war near a player and the wild are each a week.

It buys no frame time. It is worth doing only as far as it makes the next change cheaper.

**Also:** `server/ahead.js` and the browser's game each decide what to make ahead in their own way (finding 1). Putting "what the simulation will want soon" in the host, where the distances are, leaves both only the making.

---

## 5. Gameplay and design

- **The first raid comes five minutes in, 120 strong** (`invasions.js:63`, `first: 300000`; `:70`, `size: 120`). Seen: a new solo world goes from 40 in it to 160 at five minutes, its steps from 0.34 to 0.70 ms. The rules carry it easily. It is the heaviest thing a new player's phone has to draw, a few minutes after the game opens, with each body drawn in full about 12 MB of textures on Low. If your phone traces show trouble then, a smaller first raid is a rule every copy can share.
- **Coming up to a town is when the game stutters** (finding 1): the moment a town comes alive is the moment the player is looking straight at it.
- **A dungeon is made 45 m from its door** (finding 5), so the freeze comes with the entrance in view.
- **Someone standing still in their town is still sent a raid**: `#invasions` counts time for any player who isn't away, out or resting (`host.js:6480`), and "away" starts after ten minutes without a command (`host.js:484`). Someone reading a shop's wares for five minutes meets the raid. This may be intended.

---

## 6. Questions for the owner

1. How many players should one world server's world carry, and how far apart? Findings 2 and 3 matter from about six players in different towns; with four friends together they don't.
2. Is the first raid at five minutes, 120 strong, meant for phones too?
3. Is a change of the save's format (finding 6: `SNAPSHOT_VERSION`, `NET_VERSION`) welcome now, or better kept for the next change that needs one anyway?

---

# Summary (the top findings, in rank order)

The host's own step is in good shape: 0.2 to 0.6 ms of CPU a step for a solo world, 0.84 ms for four players, with the battle taking three quarters of it. The cost is in making the world, and most of it still runs on the simulation's thread.

1. **Chunks made inside a step when a town comes alive.** Walking up to a city, the step that musters its garrison or brings out its townsfolk takes 123 to 197 ms here (least of 3 runs; 4 to 8 chunks made in it), against a p99 of 1.5 ms. A world server making ahead still takes 75 to 88 ms. Have the host say what ground it will soon want and make it between steps. No simulation change. Effort M.
2. **A world server lets chunks go that its players still need.** Each player wants 49 and the world keeps 256. With eight players apart it remade 1,233 chunks in 300 s; raising the limit cut the world thread's CPU from 33.6 s to 13.4 s. Effort S.
3. **A chunk is one piece of 20 to 28 ms** (12 to 15 with its heights from the worker), on a server pumped twice a step with an 8 ms allowance. Give the server the terrain worker, and make a chunk a step at a time. Effort S and M.
4. **`buildWorld` is 2.3 to 2.5 s on the page's thread at every load**, 1.5 s of it the plan, which is the same for a seed every time. Plan it in a worker and keep it. Probably overlaps the loading reviewer.
5. **A dungeon is made in one step, 41 to 83 ms** (first in a session about 200 to 260), 45 m from its door.
6. **A snapshot is 392 KB at 155 actors and 1.5 MB at 624**; half an actor's bytes are default values, and `decode` is 8 to 12 times slower than a plain parse. Needs both version numbers.
7. Smaller: rooms' navigation baked on the page's thread (5.5 to 10.9 ms a floor); linear lookups and per-look garbage; the war's turn is a 10 to 13 ms step once a minute.

Bugs: "A elven convoy" (`missions.js:377`); the server's clock has no catch-up cap though the plan specifies one; `step-budget` fails spuriously on a busy machine.

`host.js`'s size costs little at run time (12 ms to parse; in one of 30 recorded merge conflicts); splitting it is for readers, not frames.

All phone figures are estimates from Node; your browser profile should confirm findings 1, 3, 5 and 7.

Findings file: not written (the harness refused); intended path `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-host.md`. Scripts and profiles: `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/host/`.