**Host part (pull request 3): report.** Worktree `/home/user/conquest/.claude/worktrees/agent-a5aadf58c8953f274`, branch `worktree-agent-a5aadf58c8953f274`, 11 commits on base `10e4e3c` (your PR 2 branch merged first). Tree clean; generated files not committed.

## 1. Items

1. **Finding 1 (scaling plan slice 1-6): DONE.** `e059602` adds read-only `Host.soon()` (players' whereabouts, boxes of ground wanted, dungeons wanted) and `server/ahead.js` makes it after the players' rings. `1fd9e87` has `game.js` `#groundAhead` make it a piece a frame, in copies too.
2. **Finding 2, bugs 3 and 6: DONE for chunks; tiles NOT DONE.** `6d63778` adds `Overworld.keep`/`wanted` and `Ground.keep`; `e059602` has Ahead set them, drop a gone player's queue, and settle. Tiles stay at 1,024: Detour refuses 2,048 tiles at 4,096 polygons a tile (tried).
3. **Finding 3: DONE.** `6d63778` adds `Overworld.chunkWithin` (14 pieces); `e059602` gives the server the terrain worker; `da400a9` makes `chunks3d.js` `#drawing` use it. I did not add "pump only after a step": 2,400 settled pumps averaged 0.22 ms, one over 16 ms.
4. **Finding 4, server: NOT DONE.** What remains is keeping the plan between world starts (about 1.5 s each). It needs `reopen.js` or `world-worker.js` plus a store whose files archives and backups must leave out; none of those are mine.
5. **Finding 5: DONE** (`e059602`, `1fd9e87`). Levels are built on the layouts' worker within 150 m and taken by `Interiors.give` only if seed, theme, tier and generation match.
6. **Finding 8: DONE** (`a612b4e`). **Finding 9: NOT DONE.** The turn's cost is all inside `War.advance` (`war/war.js`, not mine): 8.6 ms on the first turn, 2 to 5 ms after, the host's share 0. Spreading it needs mid-turn state in the snapshot and changes checksums, which the plan's Stage 1 rules out, so I stopped.
7. **Bug 1: DONE** (`3ccce51`), tested over every people.
8. **First raid at ten minutes: DONE** (`1a39c54`). A first raid is always due at `INVASION.first` whatever was kept: a character six minutes in gets it at ten; one past ten, 30 s into a town.
- **Deletes to `= undefined`: DONE** (`fe5eb29`), including the four in `engagement.js`.
- **`might.js` stun: left alone.** Might is a hero against any foe, and ordinary foes are still stunned at full length; changing it moves every hero's might and so tiers.

## 2. Measured (thread CPU, seed 2, load 10 to 30; review scripts, before/after on the same script)

| | Before | After |
|---|---|---|
| Server, city: muster / townsfolk step | 89 / 63 ms, 6 chunks | 8 / 8 ms, 0 |
| Server, orc capital | 200 / 55 ms, 10 chunks | 10 / 19 ms, 0 |
| Game-paced, city muster | 102 ms, 7 chunks | 10 ms, 0 |
| Game-paced, orc capital muster / townsfolk | 183 / 51 ms | 8 / 18 ms |
| 8 players, 300 s: chunks made between steps | 1,233 | 96 |
| ...chunks made inside steps | 74 | 5 |
| ...pump CPU per step | 3.26 ms | 0.44 ms |
| ...thread total | 33.6 s | 14.5 s |
| ...settled | never (45 s cap) | 13 s |
| Dungeon made in its step (12) | mean 57 ms | mean 9 ms |
| Look round, 1,004 buildings (wall) | 1.77 ms | 0.90 ms |

A chunk piece averages about 1 ms; features 4 ms.

## 3. Tests

- **Unit, final code, all pass:** ahead, soon, overworld, chunks (57); runner, world-server, registry, server-soak, clocks, contribution, manifest, telemetry, frames (94); 52 more host-importing files including snapshots, invasions, missions, host, netplay (759). A wider run was stopped by load after about 31 files with no failure. Lint clean.
- **Browser, port 8157, one worker:**
  - My new test passed as committed (1.9 min).
  - The dungeon test (14004) and the walk-out test (4139) both failed to load within 90 s under load. Each passed with timeouts lengthened locally (3.5 and 9.7 min); those edits are reverted.
- **Expectations changed:**
  - `invasions.test.js`: five to ten minutes; the player gives a command midway, or they are marked away as the raid comes due.
  - `ahead.test.js`: a pump makes a piece, not a whole chunk.

## 4. For integration

- `NET_VERSION` covers the first raid and the mission text. Nothing of mine needs `SNAPSHOT_VERSION` or a snapshot field.
- Files outside my list: `world/chunks3d.js`, `terrains.js`, `layouts.js`, `layout-worker.js`, `core/insides.js`, `core/engagement.js`.
- `generated/multiplayer_scaling_plan.md` gets change-log row 5; renumber if others added rows.
- The new browser test is not in `e2e/durations.json`.
- Each running world holds about 37 MB more (277 against 240 MB resident) for the third worker.

## 5. Left alone

- **For the owner:** a player who gives no command for ten minutes is marked away just as the first raid comes due, so an idle player no longer meets it (30 s after they return). Documented and tested.
- Arriving right beside a town (spawn, portal) still makes its ground in the step.
- A stockade going up drops its chunk and the step remakes it (17 ms).
- A building's inside tile is still baked on the world thread (17 ms; finding 7).
- Bugs 2, 4 and 5 are untouched.
- The browser's war save in the turn's frame (`main.js`) is untouched.
