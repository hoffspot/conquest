**Note first:** the harness refused to let me write `findings-combat.md` (the Write tool blocks report files from a sub-agent, and I did not work round it). So the full findings are below, in the file's format, ready to paste into `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-combat.md`. All scripts, profiles and patched copies are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/combat/`. Nothing under `/home/user/conquest` was written or changed (the only file there newer than my start is `.git/config`, which is not from me: I ran no git command).

---

# Combat: the battle's step, its determinism, and what else turned up

Area: `client/js/core/battle.js` and the rules round it (weapons, spells, creatures, followers, formation, wary, mounts, navigation as the battle uses it). Node only, no browser.

The machine's load average was 6 to 14 on 4 cores throughout, so wall-clock numbers are noisy. The battle is deterministic, so each benchmark plays the same battle several times and takes **each step's least time over the runs** ("least of N runs"): the machine's noise out, the work left. Raw runs are given where the brief asks. No phone is measured here: where a phone's cost is given it is the desktop number times 5, the project's own rule of thumb (`client/js/core/netplay.js:125-126`: "a step with a fight in it takes some 2 ms on a desktop and 10 on a phone").

The short of it: the step is in decent shape for a fight (about 1.2 ms for 100 soldiers fighting in the real world, on a desktop), thanks to the project's own index and "thinking less often". What is left: (1) a crowd that is **not** fighting costs more than one that is, and grows with the square of its size; (2) about a megabyte of garbage a step; (3) two things that quietly double the cost of every property read (`delete` on an actor, and actors of many shapes); (4) the mesh asked from inside the step, which makes a joined copy bake tiles on its main thread. Three patched copies of the battle, measured against the game as it is, take 41% off the mean step and 60% off its 99th percentile in the host's own field battle.

## The measurements asked for (question 2)

### The benchmark

`combat/bench.mjs`: a `Battle` on an open field of 160 x 160 squares (mesh baked first), two teams 28 m apart sent at each other; of every ten soldiers five fight up close (sword, hammer, cleaver, gauntlets, greatsword, mace), three are archers, one casts (its school's first two spells), one heals. Three ways of mustering: `lasting` (4,000 hit points each, so all N still fight at the end: the steady cost of N), `natural` (their own 40 hit points; 10 to 28 left after 40 s), `formation` (each side a line of battle). Steps counted from the first blow (step 128) to 40 s.

Raw, three runs each (`lasting`, ms a step). The worst of each raw run is the machine's noise, not the battle's:

| Actors | mean (3 runs) | p95 (3 runs) | worst (3 runs) |
| --- | --- | --- | --- |
| 25 | 0.200, 0.084, 0.074 | 0.276, 0.154, 0.157 | 12.85, 7.02, 4.25 |
| 50 | 0.261, 0.188, 0.313 | 0.508, 0.393, 0.485 | 8.51, 5.33, 16.27 |
| 100 | 0.561, 0.622, 0.480 | 1.595, 2.020, 1.010 | 9.22, 6.47, 10.74 |
| 200 | 1.766, 1.785, 2.010 | 5.499, 5.531, 5.342 | 12.37, 12.48, 37.83 |

Least of 5 runs, step by step (mean / p95 / worst, ms):

| Actors | lasting | natural | formation |
| --- | --- | --- | --- |
| 25 | 0.048 / 0.121 / 0.36 | 0.049 / 0.119 / 0.27 | 0.043 / 0.133 / 0.26 |
| 50 | 0.144 / 0.299 / 0.63 | 0.110 / 0.323 / 0.63 | 0.107 / 0.293 / 0.71 |
| 100 | 0.373 / 0.795 / 1.76 | 0.283 / 0.943 / 1.70 | 0.343 / 0.863 / 2.37 |
| 200 | 1.395 / 4.762 / 9.24 | 1.239 / 4.839 / 8.53 | 1.383 / 3.594 / 7.25 |

**How it grows.** Doubling the actors multiplies the mean by 3.0, 2.6 and 3.7 (25 to 200: 29 times for 8 times the actors, about N^1.6; N^1.9 from 100 to 200). Calls a step (`combat/counts.mjs`, an instrumented copy, `lasting`):

| Actors | found by the index (`#within`) | `hostile` | lines of sight (`#sees`) | `#provoke` looks |
| --- | --- | --- | --- | --- |
| 25 | 263 | 61 | 33 | 25 |
| 50 | 1,651 | 250 | 115 | 90 |
| 100 | 4,659 | 1,370 | 432 | 370 |
| 200 | 17,490 | 3,556 | 1,527 | 1,426 |

Each goes up 2.6 to 3.9 times for twice the actors: the index (8 m cells) cannot help a melee that is all within sight of itself.

### The same in the real world (the host's field battle)

`combat/field.mjs`: `Host` on `buildWorld({ seed: 2 })`, the debug overlay's field battle as `test/field-battle.test.js` musters it, 60 s. Least of 3 or 4 runs, over five sessions:

| | host's whole step: mean / p95 / p99 / worst (ms) | the battle's part |
| --- | --- | --- |
| 50 a side (101 actors), fighting | 1.27-1.44 / 2.5-3.2 / 4.4-7.1 / 5.6-11.8 | 1.13-1.25 / 1.6-2.3 / 3.5-6.0 / 4.3-8.3 |
| 50 a side, marching (no enemy in sight) | 1.29-1.34 / 2.8-3.1 / 3.3-4.7 / 3.8-5.5 | |
| 100 a side (201), fighting | 2.53-2.54 / 4.3-4.4 / 9.7-9.9 / 12.7-12.8 | 2.35-2.36 / 3.7-3.8 / 8.8-9.0 / 11.3-11.4 |
| 100 a side, marching | 2.81-2.82 / 5.6 / 6.2-6.5 / 6.4-9.0 | |

The battle is 87% of the host's step in a field battle. The real battle costs **3.3 times** the open field's for the same hundred soldiers (1.14 ms against 0.34): finding 3 is part of why. Here the cost grows in line with the actors (a line of battle is spread out, the index works). The first, cold run of each size (tiles baked in the step, code not compiled; loaded machine) had p99 20 to 27 ms and a worst step of 57 to 181 ms, with four to six tiles baked in its steps.

### The profile of 100 actors (`node --cpu-prof`, 100 us samples; `combat/prof100/`, `analyze.mjs`, `callers.mjs`)

Open field, `lasting`, 6 runs of 60 s; share of `Battle.advance`:

| Inclusive | | Self | |
| --- | --- | --- | --- |
| `#think` -> `#patrol` | 38% | `#inFight` | 10.2% |
| `#arm` -> `#inFight` | 36% (29%) | `crosses` (grid.js: line of sight) | 9.2% |
| `#nearSquare` / `#within` | 13.7% | `#hostile` | 8.4% |
| `canSee` (all callers) | 11.6% | `#nearSquare` (the lists it makes) | 7.5% |
| `#nearestSeen` -> `#nearestEnemy` | 11.1% | `#arm` | 6.8% |
| `#move` -> `#travel` | 9.8% | `#patrol` | 5.5% |
| `#hit` -> `#provoke` | 8.9% (7.4%) | `#nearestEnemy` | 5.0% |
| `hostile` (all callers) | 8.7% | `#within` | 4.2% |
| `#alarmed` | 5.7% | `#ringsNear` | 3.1% |
| `#pathTo` (path finding) | 4.3% | | |
| `#fly` | 3.9% | | |

Lines of sight by who asks: `#provoke` 5.9%, `#inFight` 2.7%, `#chosen` 1.3%, `#alarmed` 0.7%, `#reachable` 0.7%. The host's field battle, 50 a side (`proffield/`): `#think` 39%, `#arm` 20.5%, `#move` 13.3%, `hostile` 10.2%, `#pathTo` 9.4% (of it `ensure`/`#cover` 4.5% and `bakeTile` 2.3%, the first run's), `#clear` -> `walkable` 4.6%. At 200 actors (`prof200/`) `#hostile` is the hottest function (12.6% self) and `#provoke` 11.8% inclusive.

## 1. Findings, ranked

### 1. Have those set on no one look for an enemy four times a second, each in its own step, instead of every step

**Where.** `battle.js:2574` (`#arm` asks `#inFight` for every armed actor every step), `:2620-2637` (`#inFight`'s search), `:3226` (`thinking = !actor.formation || ...`: anyone not in a line looks every step), `:3259-3261` (`#patrol`: `#chosen ?? #drawnTo ?? #nearestSeen ?? #alarmed`), `:3389` (`#wild`), `:5479-5504` (`#mend`: a healer's search every step its spell is ready), `:1039` (`rethinkAt: 0` for everyone), `:942` (`lookAt: 0`).

**What happens now.** With no enemy near, nothing ends a search early: `#inFight`'s `.some` runs through everyone within 14 m asking `hostile` of each; `#nearestEnemy` never gets a nearest to prune by; `#alarmed` runs through them again. A crowd at peace is the dearest crowd. MEASURED (`combat/idle.mjs`: N soldiers of one people at their posts 2 m apart, no enemy anywhere; least of 5 runs):

| Standing | ms a step now | in a line of battle | with the change |
| --- | --- | --- | --- |
| 25 | 0.120 | 0.066 | 0.027 |
| 50 | 0.375 | 0.195 | 0.073 |
| 100 | 1.223 | 0.645 (p95 1.32) | 0.225 |
| 200 | 3.794 | 1.848 (p95 3.78) | 0.607 |
| 400 | 9.408 | 4.650 (p95 9.52) | 1.507 |

A hundred standing soldiers cost 3.3 times what a hundred fighting ones do (0.37 ms), every step, for as long as they are in the world: on a phone about 6 ms of every 50, all the time, for a war camp or two lines drawn up before a charge. About 3 times for each doubling. Profile (`profidle/`): `#patrol` -> `#nearestSeen` 50%, `#arm` -> `#inFight` 36%, `#alarmed` 6%. Those in a line all look in the same step (their `rethinkAt` starts at 0 together), so their cost is a spike every fifth step: p95 twice the mean.

**The change.** What the project already did for lines of battle (`RETHINK_MS`), for everyone set on no one:
- `#patrol`, `#wild`: with `target === null`, look (`#nearestSeen`, `#alarmed`) only when `time >= rethinkAt`, then `rethinkAt = time + RETHINK_MS`. Keep `#drawnTo` (the players only: a short loop) every step, so an enemy with room on a player still goes for them at once.
- `#arm`: remember it was in no fight when it last asked (`quietUntil`), ask again only after `RETHINK_MS`, unless it has a target, an attack or an engage order by then, or has been struck (`#provoke` clears it).
- Each actor its own step of the five (`rethinkAt`, `quietUntil` start at `(actors.length % 5) * STEP_MS` in `add`): spreads the lines of battle too.
- The same for `#mend` and the folk's `#afraid` (all the folk look in the same step every 400 ms).

`combat/calm.py` is this (without the last bullet) as a patch script; `variants/battle-calm.js` the result.

**Gain, MEASURED.** The table: 5.4 times less at 100, 6.2 at 200. In the host's field battle 50 a side, with finding 2 under it: the battle's part of a fighting step 1.14 -> 0.75 ms, p99 3.5 -> 1.6; the whole step while marching 1.29 -> 0.71 ms.

**Effort.** M (2 to 3 days with tests and docs). **Risk.** Changes the simulation: a guard notices an enemy that is not a player up to 200 ms later and draws up to 200 ms later. `NET_VERSION` and `SNAPSHOT_VERSION` to bump (a new field). Run against ten combat test files through a module-swap hook, 193 of 194 tests pass; the one that changes is `test/wary.test.js:204` (its boar is minded differently when timing shifts). Nothing a player could see. **Confidence.** MEASURED (Node). **Verify.** `node idle.mjs` against `BATTLE=$PWD/variants/battle-calm.js SWAP="$(cat calm.swap)" node --import ./swap.mjs idle.mjs`; then the overlay's field battle on the iPhone while the lines march.

### 2. Search among those near without making lists, and read points by index: the same battle, a sixth cheaper, half the garbage

**Where.** `battle.js:5555-5578` (`#within` makes a list per question), `:5582-5618` (`#ringsNear`: lists of lists, each `Object.assign([], { least })`), `:5178` (`#nearestEnemy`: a default closure, `[this.actors.keys()]`), `:2615-2637` (`#inFight`: a closure and two `.some` callbacks an actor a step), `:7880-7887` (`#provoke`: every hit runs the whole roster, two lines of sight for each of the struck one's own), `:530-544` (`offRound`), `:5871-5885` (`#distanceLeft`: an options object a call), `:7285` (`#ail`: a closure an actor a step), `:2758` (`#think`: another), `weapons.js:1132`, `:1135`, `:1166`, `:1177`, `grid.js:50`, `light.js:133`, `formation.js:212` (points destructured, which goes through the array's iterator).

**What happens now.** MEASURED with V8's sampling heap profiler counting what is collected (`combat/alloc.mjs`):
- open field, 100 fighting: **266 KB a step**; `#within`'s lists 106 KB (40%), `#chosen` 19, `#arm` 14, the iterator's `next` 13.5, `#ail` 13, `#bumps` 12, `#move` 11;
- the host's field battle, 50 a side: **1,084 KB a step** (22 MB a second); the iterator's `next` 320 KB (`#nearestEnemy`'s rings 118, then `distanceBetween`, `#sees`, `inReach`, `sightAt`, `crosses`, `offRound`, `placeAt`), `#within`'s lists 131, `#ringsNear` 109, `#nearestEnemy` 52, `#travel` 34;
- 100 a side: twice that. Node collects its young generation every 16 steps at 50 a side (51 in 800 steps), every 8 at 100 a side (`gc-field.mjs`), 1.4 to 4.7 ms each on the loaded machine. Who pays: the frame the collection lands in.

**The change.** No rule changes: (1) `#within` fills one `Int32Array` the battle keeps and says how many (an ordinary array emptied with `length = 0` gives its room back in V8: tried, it saved little); the colossal's nested searches keep their own lists. (2) `#nearestEnemy` walks the rings of cells in place. (3) `#inFight` asks `#chasers` first, then those near (both halves of its `||` are pure). (4) `#provoke` looks for witnesses among those within sight of the struck or the striker, through the index (everyone, when either has a footprint). (5) `distanceBetween`, `ringsApart`, `crosses`, `sightAt`, `placeAt`, `offRound` take `(a, b)` and read `a[0]`; `longestReach`, `chooseAttack` loop. (6) `#distanceLeft(actor, reach)`; `#ail` asks about Invisibility only of those with a spell on them. `combat/lean.py` is all of it as a patch script. Still to do in the same spirit: `#aside` asks `navigation.walkable(from)` again for each of its eight tries (`:6080` from `:6117`): once would do (about 2% of the field battle's step, READ).

**Gain, MEASURED.**

| | now | lean |
| --- | --- | --- |
| open field, 100, `lasting`: mean step | 0.381 ms | 0.310 (-19%) |
| open field, 200 | 1.356 ms | 1.140 (-16%) |
| host's field battle 50 a side, the battle's part | 1.143 ms, p99 3.52 | 0.948 (-17%), p99 2.78 |
| garbage a step, open field 100 | 266 KB | 138 KB (-48%) |
| garbage a step, host's field battle | 1,084 KB | 443 KB (-59%) |

**Effort.** S (the patch exists; a day to bring in by hand). **Risk.** None to the simulation, by construction and by test: `combat/verify.mjs` hashes every event, every way found, every actor's end state and `Battle.snapshot()` over nine battles (open field 60 to 200, by night, in lines, with the index off; the host's field battle 30 and 50 a side with `Host.checksum()`; a populated start town walked out of for 90 s): identical (`verify-base.txt`, `verify-lean.txt`). Ten combat test files, 194 tests, pass with it swapped in. No version number moves. **Confidence.** MEASURED (V8); whether JavaScriptCore makes the destructuring garbage is SUSPECTED (Safari's timeline, Allocations, during the field battle would say). **Verify.** `node verify.mjs > a; SWAP="$(cat lean.swap)" node --import ./swap.mjs verify.mjs > b; diff a b`.

### 3. Never `delete` a property of an actor, and make every actor with every property it may come to have

**Where.** `host.js:7898-7899` (`#clashOver`: `delete actor.sight; delete actor.keep` on every surviving soldier of an army once its clash is over), `battle.js:1586` (`reshape`: `delete actor.wards`, Polymorph), `battle.js:892`, `:1046-1049` (`add` puts `wards`, `tactic`, `keep`, `lone`, `sight` on only some), `engagement.js:725`, `:727` (`sight`, `keep` added at the charge), what the host and battle add later (`rank`, `oil`, `endurance`, `enmityWeight`, `haste`, `leech`, `bleed`, `mastered`, `darkSight`, `recovery`, `mood`, `lingering`, `warnedAt`, `backing`, `backOffAt`), `battle.js:1734-1747` (`restore` puts `chance`, `restVariety` last: another shape).

**What happens now.** Two things, both MEASURED in Node:
- *`delete`.* An actor a property has been deleted from loses V8's fast properties for good (`fastprops.mjs`: 0 of 20 fast after the two deletes, 20 of 20 before); every read on it is then a hash lookup. The same battle of 100 with that done to each (`DELETED=1 node bench.mjs --mode formation`): **0.353 -> 0.675 ms a step, p99 1.42 -> 2.98**: twice. In the game: every survivor of an army that has fought another near a player, from then on; any creature polymorphed.
- *Many shapes.* In the host's field battle the 104 actors have 8 shapes among them 30 s in, 8 again when a snapshot is restored, 9 five seconds on (`shapes.mjs`, `%HaveSameMap`): inline caches for `actor.x`, `actor.dead`... give up past four. Synthetic (`SHAPES=n`, 100 actors, meaningless properties added in different orders): 1 shape 0.343 ms, 2 0.365, 4 0.635, 8 0.754, 16 0.873. In the real battle 60 of 104 share one shape, so it costs less than that there.

**The change.** In `add`, write every optional property into the literal, always, in one order, `null` when there is none; the host and `engagement.js` assign to those, never add; `actor.sight = null` in place of `delete` (readers use `??` or truthiness); `restore` builds each actor from the same template. A test can hold it: `Object.keys` of every actor after a field battle, one list.

**Gain.** The `delete` half: MEASURED, 2 times on the steps of the actors it has happened to. The shapes half: MEASURED in the host's field battle on top of finding 2 (`oneshape.py`: the 18 properties seen there made at birth): 0.948 -> 0.817 ms (-14%), p99 2.78 -> 2.36; same battles blow for blow (`verify-one.txt`). With findings 1 and 2 as well (`variants/battle-all.js`):

| Host's field battle, the battle's part | now | all three |
| --- | --- | --- |
| 50 a side: mean / p95 / p99 / worst | 1.125 / 1.65 / 3.68 / 4.28 ms | 0.662 / 1.15 / 1.46 / 1.87 |
| 100 a side | 2.349 / 3.81 / 8.80 / 11.36 ms | 1.370 / 2.70 / 3.55 / 4.68 |
| whole step marching, 100 a side | 2.81 ms | 1.44 |

**Effort.** S for the deletes (three lines); S to M for one shape. **Risk.** The snapshot gains `null` keys, so its bytes change (`SNAPSHOT_VERSION` if anything compares them; the fixture). Nothing in the rules. **Confidence.** MEASURED in V8; SUSPECTED in Safari (JavaScriptCore also makes a dictionary of an object deleted from and caches by structure; to confirm, the field battle there with and without the deletes after a clash). **Verify.** `node --allow-natives-syntax shapes.mjs field`; `DELETED=1` / `SHAPES=8 node bench.mjs --mode formation`.

### 4. A joined copy bakes navigation tiles on its main thread whenever anyone steps round anyone: have it bake them ahead from the ways the host sends

**Where.** `battle.js:6072-6084` (`#clear`: `navigation.walkable(from.x, from.y)` and `walkable(x, y)`), from `#aside` (`:6117`), `#travel` (`:5939`), `#toss` (`:7237`), `#leapFor` (`:4666`), `mount`/`dismount` (`:1380`, `:1417`); `navigation.js:566` -> `:527` -> `:368` -> `:262` (`ensure`: bakes here and now).

**What happens now.** battle.js's header and docs/GAME.md:1073-1075 say the ways are the battle's one dealing with the meshes, recorded by the host and replayed, "so a copy of a world someone else hosts needs nothing of the meshes at all". `#clear` is a second dealing, inside the step, not recorded. MEASURED (`clear-bakes.mjs`): a battle given its ways and never finding one bakes a tile the moment two walkers step round each other (0 tiles before, 1 after, 0 ways found). One overworld tile baked here and now: median 7 to 20 ms on this desktop, up to 456 ms where the world under it has to be made first (`bake-cost.mjs`). A copy's own baker only bakes round its own player, so for any other fight in the world it pays that in the step: on a phone 35 to 100 ms a tile and more. The forecast of a joined player's hero (`Battle.fork`, `bakedOnly`), which promises never to bake, does too: `#clear` does not go through `madeOnly`. It is also the one place where what the mesh holds decides what happens: every copy must bake the same bytes or the copies part (the checks would catch it and ask for the world again).

**The change.** No rule changes. (a) A copy taking a way from `replay` (`#route`, `:5667`) asks its baker for the tiles under it (`navigation.later`): the host's sendings arrive some steps before they are played (`PACE.behind`), so the tile is usually in. (b) In a forecast, ask `walkable` through `navigation.madeOnly`. (c) Say in the header and GAME.md what `#clear` asks.

**Gain.** ESTIMATED: the bakes off a joined phone's steps; how often they happen in play I could not measure without the browser. **Effort.** S to M (the wiring is in `app/game.js`). **Risk.** None to the simulation. **Confidence.** Mechanism MEASURED in Node; frames lost on a joined phone SUSPECTED. To confirm: on a joined copy, log `navigatorOf(map).baked` and the debug log's "baking N navigation tiles" while a fight goes on away from its own player.

### 5. Spread the ways found over the steps

**Where.** `battle.js:4490-4499` (`#pursue`: a new way when `time - lastPathAt >= REPATH_MS`), `:492`, `:5372-5386` (`#keepRank`: a new post, so a new way, when a soldier's place crosses into another square).

**What happens now.** Everyone who starts after someone in the same step finds their way again in the same step, every tenth step. MEASURED (`counts.mjs`, open field, `lasting`): at 100 actors 0.76 ways a step on average but 88, 62, 62, 60 in steps 116, 146, 156, 126; at 200, 186 then 124, 106, 98. At 100 actors the worst step of each `lasting` run was one of these (136, 146 or 156). A line on the march is milder: 19 ways in one step every 18 steps at 50 a side, 46 at 100 a side, those steps up to twice the mean. A way costs 10 to 40 us on open ground, 13 to 160 us in a town with every tile in (`paths.mjs`, the real mesh), and about 2 ms when it cannot get where it is sent (the search runs out its nodes). So a burst of 88 is 1 to 7 ms on a desktop.

**The change.** Give each actor a phase (its place in `actors` when added, modulo ten steps) and take it off `lastPathAt` the first time it sets out after someone. With finding 1's phases this is one more line.

**Gain.** ESTIMATED: a melee's worst steps down to near the mean. **Effort.** S, under finding 1's `NET_VERSION`. **Risk.** Changes the simulation; nothing visible. **Confidence.** MEASURED that the bursts are there and are the worst steps; the gain not measured. **Verify.** `field.mjs` prints the most ways found in a step.

### 6. Look only among those near where the code still runs through everyone

**Where.** `battle.js:5137` (`#hold`: a fort's `#nearestEnemy` with no bound, every step), `:3186` (`#obey`: a player standing still, the same), `:2992` (`#beckon`: `this.actors.find(... canSee ...)` per courtesan per step), `:7783` (`#slip`: per seasoned rogue per step), `:4866` (`#shieldOf`: counts over the roster on every blow on one with a `fight`), `:6510-6516` (`#ground`: `hostile` asked before dead, map and distance), `:7851`, `:7711`, `:6649`, `:6967`, `:7177`, `:4957`, `:3576`, `:3704`, `:7330`.

**What happens now.** Each is one pass over the roster for one actor or event: at a hundred actors a few hundred `hostile` calls a step for a fort or two and the standing players (READ), small beside finding 1. It is what stops the step scaling on a world server: 8 standing players and 10 forts over 1,000 actors is 18,000 `hostile` calls a step.

**The change.** `#hold`, `#obey`: pass `longestReach(arms) + 2` as `within` (those with a footprint asked apart). `#beckon`: `this.#players`. `#ground`: dead, map, distance first. **Gain.** ESTIMATED, small on a phone, linear on the server. **Effort.** S. **Risk.** None if the bounds are right (add a fort and a standing player to `test/field-battle.test.js`'s with-and-without-index battle). **Confidence.** READ.

### 7. A snapshot of the battle is 2.4 KB an actor, most of it defaults (for whoever has multiplayer)

**Where.** `battle.js:1671-1695`. **Now.** MEASURED (`snap.mjs`, `snap2.mjs`): 100 actors mid-fight are 243 KB as JSON, 3.1 ms to snapshot, 3.2 ms to restore (200: 522 KB, 6.8 ms each). `foes` 45 KB (19%), `arms` 18 KB (each actor carries a copy of its weapon's attack list, which `armsIn` makes again from three fields), `attack` 16 KB; the rest a hundred-odd fields an actor, mostly `null`, `0`, `false`. netplay.js:126 speaks of "some 120 KB" for the world again. **Change.** Leave `arms` out (made on restore); keep only what differs from a new actor's defaults. **Gain.** ESTIMATED 3 to 4 times smaller. **Effort.** M. **Risk.** `SNAPSHOT_VERSION`; host.js's migrations (one patches `arms`, `host.js:895`).

## 2. Checked and already good

- **The index** (`#indexed`, made once a step): exact; its slack covers a step's walk and a square's rounding, and every place an actor is moved bumps it.
- **Path finding is bounded and cheap**: one way an actor each 500 ms after a moving target, 2 s blocked, 8 legs a move order; 8,192 nodes, 1,024 polygons; tiles for anyone not beside a player wait for the worker (`WAIT_BEYOND`). 10 to 160 us a way. Of 6,000 free squares within 210 m of two start towns (seeds 2 and 5) the way reached all but one (2.4 m short): `unreachable.mjs`.
- **`hostile`**: the host's `relations` asked only of two different teams after the cheap checks; `allied` returns at once with no party.
- **Night** costs nothing extra (100 and 200 fighting with a torch's circle round each torch-bearer: 0.405 and 1.44 ms against 0.412 and 1.37).
- **A forecast's `fork`** of one actor: 0.04 ms.
- **Determinism (question 3).** In `client/js/core/` no `Math.random`, `Date` or `performance.now` decides anything (the three `performance.now` time things for the debug log); no `Math.sin`, `cos`, `atan2`, `hypot`, `pow`, `exp`, `log` outside `exact.js` (grep: only comments); no `**`, `localeCompare`, `toFixed` in the rules. Every sort in my files has a consistent comparator and sort is stable, so ties fall in the roster's order. Tables kept by id (`foes`, `enmity`, `struckBy`, `formations`) are walked in written order, which a snapshot keeps. The ways found are the host's, replayed. The one soft spot is finding 4. `core/variety.js` defaults to `Math.random`; the battle always passes its own (`battle.js:951`, `:1746`): a trap for a later caller, not a fault now.
- **Separation** (`#bumps`) and **line of sight** (`crosses`): local, distance first.

## 3. Bugs

1. **A shot never gives up.** `battle.js:7041-7071` (`#fly`): a projectile follows its target until it lands, the target dies or changes map; no range, no life. MEASURED (`bug-projectile.mjs`): a fireball (9 m/s) let go at a rider who gallops off (13.4 m/s) follows for 38 s and 344 m and lands when they stop. Sure. Fix: fizzle once it has flown about one and a half times its attack's reach.
2. **docs/GAME.md disagrees with spells.js about Stun**: :1148 says "within 9 metres"; the table at :1257 says 18 m (right) and a 3,000 ms cooldown (`spells.js:164` has 5,000). spells.js's comment over the wards says "five minutes" where `WARDING` is an hour. Sure.
3. **A follower whose leader is down, or on another floor, does nothing, not even strike back** (`battle.js:4343-4347`). READ; whether meant is the owner's to say.
4. **A hazard's hits are credited to a caster who has fallen** (`battle.js:6502`, `:6514`), where a bomb's and falling rocks pass `null` (`:4922`, `:7153`). READ, small.
5. **A line's ranks are not closed** when one falls and another joins in the same second (`battle.js:5316` compares only the count). READ, rare.

## 4. Code structure

- `battle.js` is 8,031 lines in one class of some 230 private methods: consistent and commented, and the private fields are why it cannot be split casually. Seams if ever: the index and searches, walking, the colossal, wary beasts, a boss's fight, spells landing. Not urgent.
- Nothing outside can count what its private methods do. A `Battle.stats` for the debug overlay and `scripts/` (ways found, searches, lines of sight, time by phase) would make the next pass quick. `scripts/step-budget.js` has no fight in it: a `--field 50` with the host's own field battle would put these numbers in CI's reach.
- "Everyone within r of a point who is an enemy" is written out as `this.actors.filter(...)` eleven times (finding 6): one helper over the index.
- `[x, y]` arrays are made and taken apart between helpers (`#apart`, `#room`, `#clear`, `#bumps`, `#travel`): passing `x, y` is the same code and no garbage.

## 5. Gameplay and design

1. **Hold alone keeps any one foe but the Behemoth stunned for good, bosses too.** `spells.js:165`: stuns 6,000 ms, ready again in 6,000; the Hexes rank that brings it makes stuns 15% longer (`progress.js:57`), the last twice as long. Bosses resist taunts, Fear, Pacify, Polymorph; nothing resists a stun but the colossal (`battle.js:6993-7015`). MEASURED (`bug-hold.mjs`): a tier-10 frost troll made as a dungeon's boss, Hold recast as it comes ready at Hexes rank 2: stunned 99.5% of two minutes, began no blow, moved 1.2 m. Without the bonus, Hold and Stun in turn do the same. If not meant: a stun on a boss half as long, and each within 20 s of the last half again (as Fear wears thin).
2. **Shots in flight turn corners**: nothing stops a projectile once let go (documented as homing); with bug 1 a fireball can cross a town.
3. **The cap on who goes for a player** (`AGGRO`: 6 and 4) holds back only those not struck: an archer who has put an arrow into each of twenty has twenty on them. As written; noted because the cap reads as a promise.

## 6. Questions for the owner

1. Is up to a fifth of a second before a guard or beast notices an enemy who is not a player acceptable (finding 1)? Players would still be noticed in the step they come into sight.
2. Is holding a boss with Hold for the whole fight intended?
3. Should a follower defend itself while its leader is down?

## Appendix: running it again (from `.../scratchpad/perf/combat/`)

| What | Command |
| --- | --- |
| Open-field benchmark | `node bench.mjs --n 25,50,100,200 --runs 5 --seconds 40 [--mode lasting\|natural\|formation] [--quiet]` |
| The host's field battle | `node field.mjs --sizes 50,100 --runs 4 --seconds 60` |
| A crowd at peace | `node idle.mjs` (`FORMED=1` for a line) |
| Calls a step | `BATTLE=$PWD/variants/battle-count.js node counts.mjs` |
| Garbage by function | `node alloc.mjs --n 100`; `FIELD=50 node alloc.mjs --steps 600` |
| CPU profile | `node --cpu-prof --cpu-prof-dir=prof --cpu-prof-interval 100 bench.mjs --n 100 --runs 6 --seconds 60 --quiet; node analyze.mjs prof/*.cpuprofile 45 advance` |
| A variant swapped in | `SWAP="$(cat lean.swap)" node --import ./swap.mjs <script>` (`calm.swap`, `one.swap`, `all.swap`; add `BATTLE=$PWD/variants/battle-lean.js` for `field.mjs`, `idle.mjs`) |
| The same battle or not | `node verify.mjs` against the same with `SWAP=...` |
| The repository's tests with a variant | from the repository: `SWAP="$(cat .../lean.swap)" node --import .../swap.mjs --test test/combat.test.js ...` |
| Build the variants again | `python3 lean.py; python3 oneshape.py; python3 calm.py; python3 all.py` |

The variants are copies in the scratch folder with imports pointed back at the repository, swapped in by a loader hook; the repository is untouched.

---

## Summary (top findings in rank order)

The findings file could not be written (the harness blocks report files from a sub-agent); its full text is above. Scripts and patched copies: `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/combat/`.

Baseline: a battle step is cheap when fighting. Open field, least of 5 runs: 0.05 / 0.14 / 0.37 / 1.40 ms mean at 25 / 50 / 100 / 200 actors (about N^1.6). The host's real field battle: 1.1 to 1.25 ms for 101 actors, 2.35 ms for 201, the battle being 87% of the host's step.

1. **Idle crowds cost more than fights** (measured): 100 soldiers standing with no enemy cost 1.22 ms a step, 3.3 times a fight, and about 3 times more per doubling. Throttling idle searches to every 250 ms, staggered, gives 0.23 ms. It changes the simulation (NET_VERSION bump); 193 of 194 tests in ten combat files still pass.
2. **Results-identical leaner searches** (measured, patch exists): 16 to 19% less step time and 48 to 59% less garbage (1,084 to 443 KB a step in the field battle). Hash-identical over nine battles; 194 tests pass.
3. **`delete` on actors and many actor shapes** (measured in V8): `host.js:7898-7899` and `battle.js:1586` put actors in dictionary mode, doubling step cost for them; one shape for all saves another 14%.
   All three together: field battle mean 1.13 to 0.66 ms, p99 3.7 to 1.5 ms (50 a side); 2.35 to 1.37 and 8.8 to 3.6 (100 a side).
4. **`#clear` asks the navigation mesh inside the step**: a joined copy bakes tiles synchronously (7 to 20 ms each on desktop, up to 456 ms), contrary to docs/GAME.md:1073. Mechanism measured in Node; the cost on a joined phone needs confirming in the browser.
5. **Synchronised re-pathing**: up to 88 ways in one step at 100 actors, the worst steps of a melee.
6. Whole-roster loops left outside the index (forts, standing players): small now, linear on a world server.
7. Snapshot is 2.4 KB an actor (243 KB at 100).

Determinism: clean. No `Math.random`, `Date` or inexact maths in the rules; sorts and table order are deterministic; finding 4 is the one soft spot.

Bugs: projectiles never expire (a fireball followed a rider 344 m for 38 s, measured); docs disagree with spells.js on Stun; followers do nothing while their leader is down.

Design: Hold alone keeps a dungeon boss stunned 99.5% of the time (measured).

Questions for the owner: is a 200 ms notice delay for non-player enemies acceptable; is boss stun-lock intended; should followers defend themselves when their leader is down.
