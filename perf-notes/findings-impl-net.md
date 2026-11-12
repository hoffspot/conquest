All ten items are done and committed on branch `worktree-agent-a232813c3ecf06a79` (worktree `/home/user/conquest/.claude/worktrees/agent-a232813c3ecf06a79`), base 9ab20b2 (#695), 15 commits, nothing pushed. Take them all, in order: the early ones are WIP checkpoints that mix items, so they don't cherry-pick apart. The version bump is the last commit. Only the three generated files are uncommitted.

## 1. Items

1. **Snapshot holds what a copy needs: done** (ac1745c, a39f0f7). `messengersAt`, `rareLooked` and a fourth I found, `courtWarned` (the court's warning rolls the world's dice), are in `snapshot()` and `#load`. `#load` remakes the legends, so `adopt` takes the host's. Guard: `test/snapshot-fields.test.js`.
2. **Motion check as a checksum: done** (f957a0c, 0e1c578). `CHECK_EVERY` is 4, the sum rides in the ops. The motion message is sent only when `Hosting.sendsPlaces` is set (off). `core/motion.js` is kept, because scaling-plan slices 1-3 and 3-19 use it.
3. **No reviver: done** (ac1745c, test in 6a1861d).
4. **Compression: done.** Server sockets: permessage-deflate in `server/relay.js` `Socket` and all three handshakes, with a new server setting `compress`, default on (de4c9df). Browser host, direct link: `CompressionStream` in `app/peer.js` `Channel` (ea8d887, 7efd6ff). A pre-224 game is sent everything plain and still hears the version refusal.
5. **`Joining.held` split: done** (f957a0c). The smoothed count is `inHand`.
6. **Bounds on a guest: done** (f957a0c, f00db48). "Again" is answered at most once per 10 s per peer with one snapshot per step (slice 1-5's limit only; no welcome queue). Commands 30/s with a burst of 60. Nothing over 64 KB. Direct links: 4 MB of pieces, closed at 8 MB waiting. `Hosting` now takes a `clock`; without one nothing is limited (unit tests).
7. **Server tick: done** (62dc0e9), as slice 1-1: `runner.advance({ most })`, a flush after each step, `letGo()` beyond `RUNNER.behind`, and a look timed to when the next step is due (25 ms at most). Health shows the whole tick and pace.
8. **Halve the snapshot: done** (ac1745c, dbe047a, 0bb5c4f). New `core/keptactor.js`; `SNAPSHOT_STEPS[52]`. `battle.js` is untouched: `Host.#battleKept` empties `battle.actors` for the duration of `battle.snapshot()` and keeps the characters itself.
9. **Bugs: done.** `agree` carries `rev`, with new refusal `reoffered` (f957a0c). A joined game tells any host its page is hidden. `step-budget` judges by `process.threadCpuUsage` and takes `--field N` (62dc0e9). `leave` clears `travel` and `courtWarned`; `bakedAround` is pruned.
10. **Stale figures: done** (ff1dd94, 99ca230).

## 2. Measurements

Byte counts are from the review's `wire.mjs` (seed 2, host plus 3 guests); times are CPU or wall as stated.

| | Before | After |
|---|---|---|
| Down per guest: quiet / walking / fight | 3.55 / 5.38 / 13.4 KB/s | 1.20 / 3.02 / 4.45 KB/s |
| Resyncs in the fight, per guest | 1 (246 KB each) | 0 |
| Welcome, start town | 129 KB | 79 KB of text; 13.6 KB from a server socket, 15.2 KB direct |
| World again after the fight | 196 KB, decode 14.4 ms | 117 KB, decode 1.1 ms |
| Bytes per actor | 2.0 KB | 0.8 KB |
| 8-player world (`decode-bench.mjs`) | 604 KB, decode 24–26 ms | 310 KB, decode 2.0 ms |
| `host.snapshot()` / with encode, 137 actors | 6.1 / 9.3 ms | 1.8 / 4.2 ms |
| Server step lateness, median / p90 | 27–32 / 53–59 ms | 1 / 7–12 ms |
| Sendings per second (multi-step) | 16.5–17.3 (one in five) | 20.0 (none) |

- **Seven guests:** the host sends 8.4 / 28.5 / 19.7 KB/s (quiet / walking / fight); the review had 27.9 / 48 / about 56.
- **Compression ratio:** it is a sixth to a fifth, not the review's tenth, because the spare snapshot is less redundant. 195 KB with a battle goes as 33.5 KB (server) or 35.9 KB (direct).
- **Lateness:** measured on a real world server, one player, three 30 s rounds each way at load 12–18. The "before" is the main checkout's server.
- **`messenger-desync.mjs`:** desyncs 1 → 0. **`legends-adopt.mjs`:** clocks now alike after joining and after adopt.
- **`step-budget`:** three runs exit 0, with CPU worst 12–16 ms while 2–4 steps were over 50 ms by the clock. `--field 50` (249 actors): mean 2.5 ms, worst 16 ms.

## 3. Tests

- **Lint:** `npm run lint` clean.
- **Unit, on the tip:** 18 files, 238 pass, 0 fail (contribution, manifest, peer, relay, netplay, snapshots, snapshot-fields, rare, runner, trading, host, together, world-server, broker, admin, storage, motion, bot).
- **Unit, wider:** every file that takes a snapshot plus the servers' (76 files) ran at 0bb5c4f's code: 962 pass, 0 fail.
- **Soak:** `node scripts/soak.js --minutes 3 --browsers none` passed, about 900 checks per copy, none astray. WebKit and Firefox were not run here.
- **Fuzz:** 72,207 malformed messages, none threw.
- **Browser, one worker:**
  - `together.spec.js` 1316, 61, 564 and 668 pass. The last three failed once at load 25 (61 on a wall-clock wait, the other two never reached play in 120 s) and passed alone at load 13. 1316 ran before the `peer.js` change, which it doesn't use.
  - `broker.spec.js` point-to-point and relayed joins pass in Chromium.

Expectations changed:
- `test/netplay.test.js`: the motion test now tests the sum (4 mm off is caught; motion let 1 cm by) and `sendsPlaces`; the stamping test expects `ops, self`.
- `test/together.test.js` and `e2e/together.spec.js`: `checks` instead of `motionChecks`, and motion sent is 0.
- `test/trading.test.js`: every `agree` names its `rev`.
- `test/rare.test.js`: version pin 52 → 53.
- `e2e/broker.spec.js`: now asserts the welcome went compressed.

## 4. For integrating

- **Versions:** `NET_VERSION` 223 → 224, `SNAPSHOT_VERSION` 52 → 53, both in 77bdee6 with `test/fixtures/snapshots/53.json.gz`.
- **Fixture:** made by `npm run snapshot-fixture` on the tip; remade there it is byte-identical. Once the others' rule changes are in:
  ```
  npm run build:manifest
  npm run snapshot-fixture
  node --import ./test/plan-cache.js --test test/snapshots.test.js test/snapshot-fields.test.js test/rare.test.js
  git add test/fixtures/snapshots/53.json.gz
  ```
  No second bump is needed. If someone's change must alter what a snapshot holds, it goes into `SNAPSHOT_STEPS[52]`.
- **The guard test will fail on purpose if:**
  - `battle.js` `add` gains a field: add it to `ACTOR_FIELDS` in `core/keptactor.js` at the same place, and to `ACTOR_DEFAULTS` if every character has it. The combat part's "one shape" change will trip this.
  - `Host` gains a field the rules read: put it in `snapshot()` and `#load`, or in the test's `NOT_KEPT` with a reason.
- **Edits in the heavily-changing files:** `game.js` one line (the pack's trade view gains `rev`); `main.js` two hunks (`remote.held` → `inHand` near 3164; the `if (state.onServer)` removed round `joining.away` near 6292). `session.js` and `sw.js` are untouched.
- **Other files outside my named area:** `app/pack.js`, `together.js`, `peer.js`, `debug.js`, `admin/page.js`, `core/bot.js`, `wire.js`, `server/storage/settings.js`.
- **Conflicts to expect in `host.js`:** the import line, the end of `SNAPSHOT_STEPS`, `snapshot()`, `#load`, `leave`, the trade functions, `REFUSALS`, the `agree` case.
- **Docs changed:** `docs/WAR.md`, `SERVER.md`, `WILDS.md`, `contribution.md` (step-budget row), `generated/world_server_plan.md`.
- **Soak workflow:** `scripts/soak.js` changed by one line, so the Soak workflow runs on the pull request; that is the cross-engine check of the 4-step sum.

## 5. Risky or left alone

- **Plan against assignment.** The assignment's note says catch up at most 1 s; slice 1-1 and the review say 250 ms. I built 250 (`RUNNER.behind`, one constant). Stage 0 baselines taken later will have no motion stream.
- **`AGAIN.every` is 10 s** (slice 1-5; the review suggested 1–2 s). A guest whose link drops twice within 10 s waits for the second world while playing a copy with a gap.
- **`messengersHeard` is not cleared on leave unless it is over half an hour old.** Clearing it would bring a messenger at every reload.
- **The server now lets time go.** In the lateness runs the world dropped 2–4 s around its opening (worst ticks 1–2 s). Before, it played those steps back to back.
- **Safari** was not checked for either compression path. Offers of only `x-webkit-deflate-frame` are declined.
- **Old worlds:** characters lacking a field that `add` now always makes get its default on load.
- **Not done:**
  - Baking interiors on the baking thread (`server/ahead.js` isn't mine).
  - Pace in `server-soak.js`'s judgement (not my file).
  - The old relay's wrong-code limit (owner's question 3).
  - `Hosting.hidden` is recorded but shown nowhere.
- One `git fetch origin main` was run to check the base; nothing else touched the remote.

Scratch scripts and outputs are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/net-impl/` (`scripts/`, `out/`).