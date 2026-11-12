# Tests and pipeline: findings (area "tests")

**The findings file was not written.** The harness refused the write of `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-tests.md` (sub-agents may not write report files), so the full findings are this message; save it to that path if the merge needs a file. Scripts and raw data are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/tests/`. The repository is untouched (`git status` clean). No browser was run.

## How the numbers were got

- **CI**: GitHub's job and step times for the last 60 completed CI runs (2026-11-09 03:55 to 11-11 07:26 UTC; `runs.tsv`, `jobs/`, `ci-stats.mjs`, `ci-shards.mjs`, `ci-conc.mjs`, `ci-ideal.mjs`), the last 100 for failure counts (`runs100.tsv`), Pages' and Mac's runs of the same window (`jobs2/`), and the log of every failed job (`logs/`).
- **Browser tests**: `e2e/durations.json` joined to a parse of every spec (`e2e-parse.mjs`, `e2e-tests.json`), and that file's git history.
- **Unit tests**: a second full run (3,427 tests, all passed) with a preload that times the world-building calls in CPU milliseconds by rewriting three modules in memory as they load (`hook/`, results `hook/all.jsonl`, `hook/all.tap`), and a pass over the 28 heaviest files that also counts host steps (`hook2/`). CPU time is quoted because the machine was at load 8 to 22; the lead's `unit-times.tsv` is wall time and was used for rank only.

## Question 1 in short: where a push's 50 minutes go

MEASURED, 43 green runs of the last 60:

| | median | range |
| --- | --- | --- |
| A run, start to end | 52.5 min | 41 to 70 |
| Its slowest job | 52.0 min | 41 to 57.5 |
| Its fastest job | 28.3 min | 23 to 34 |
| All ten jobs added up | 414 runner-min | 321 to 459 |
| A job's setup (checkout, Node, models, `npm ci`) | 20 s | 15 to 42 s |
| Chromium downloaded, share chosen, Playwright started (one log) | 15 s | |
| Lint | 21 s | 15 to 24 s |
| Unit tests | 21.8 min | 13.4 to 23.4 |
| Motion check | 12.8 min | 7.5 to 14.4 |
| Browser tests in an `e2e` job | 41.0 min | 22.9 to 57.1 |

- **Setup is about 1%.** npm's cache is restored (20 MB in 1 s; `npm ci` 2.6 s). The models (5 to 10 s) and Chromium (6.7 s) are fetched fresh; caching them would save seconds.
- **The work is the browser tests**: 379 of the 412 minutes a run is planned as.
- **A run ends when its slowest runner does.** The split is even (each share's mean is 39 to 44 min over 43 runs). The runners are not: they come at three speeds (unit tests 13.5, 17 or 22 min; motion check 8, 10.6 or 13.5), 1.7 times apart, and 47% are the slow kind. The slowest job ends a median 23 minutes after the fastest.
- **The 20-job limit is real and binds.** GitHub's docs give a Free account 20 concurrent standard jobs (Pro 40, Team 60). The most Linux jobs ever running at once was exactly 20; the account sat at 20 for 5.5 of 51.5 hours; 91 of 678 jobs waited over a minute (up to 27); 10 of 43 green runs had a job wait 4 to 20 minutes.

| Lever | Wall time of a push | Runner time | Finding |
| --- | --- | --- | --- |
| No CI on `main` for a tree a pull request passed | removes most queueing; frees the limit | minus 33% of runs | 1 |
| Tests start looking down, drawn cheaply | minus 7 to 10 min at ten jobs, more with low quality or no drawing | minus 18 to 25% a run or more | 2 |
| 18 browser jobs, once `main`'s runs are gone | 52 to about 27 min | the same | 3 |
| Shares that follow the runners' speeds | minus 12 min at ten jobs | the same | 3 |
| Two Playwright workers a runner | unknown and risky today | | Checked |
| One loaded game reused by a file's tests | at most minus 14% of the work | | Checked |
| Skipping for docs-only changes | nothing: 0 of 60 merges | | Checked |
| Unit tests on two runners | nothing while browser tests are the long pole | | Checked |
| Import-graph choice of unit tests | nothing on CI; minutes locally | | 9 |

## 1. Findings

### 1. No CI run on `main`, and Pages deploys without running the unit tests again

- **Where**: `.github/workflows/ci.yml:7-11` (`push: branches: [main]`); `.github/workflows/pages.yml:38-39` (`npm run lint`, `npm test`).
- **Now**: a pull request merges only when green on a head up to date with `main`. The merge then runs CI again on `main`, and Pages runs every unit test a third time before deploying.
  - MEASURED: for 60 of the last 60 merges, the merge commit's tree is identical to the branch head's that CI had passed (`<merge>^{tree}` against `<merge>^2^{tree}`).
  - MEASURED: 33 of the last 100 CI runs were these `push` runs, about 414 runner-minutes each.
  - MEASURED: 8 of those 33 failed on a tree that had just passed. The 7 with logs are all flaky browser tests; none found a fault.
  - MEASURED: they hold 10 of the 20 job slots for 52 minutes after each merge, when the next pull request starts its own run.
  - MEASURED: Pages' build is a median 18.2 min (up to 23.6), of which `npm test` is 17.4; its deploy job has waited up to 14 minutes for a runner. A merge goes live about 19 minutes later, not about 2.
- **Change**: remove the `push` trigger from `ci.yml` (required checks gate pull requests only, so no ruleset change); remove lint and `npm test` from `pages.yml`; update contribution.md. If the owner wants a net under a ruleset mistake, keep the trigger and have each job skip itself when `HEAD^{tree}` equals `HEAD^2^{tree}` and that commit's checks all passed.
- **Gain**: MEASURED: a third fewer runs, most queueing gone, the site live about 17 minutes sooner, no red `main` from a flake.
- **Effort**: S.
- **Risk**: relies on "require branches to be up to date" and "require status checks" staying on. Nothing a player sees; no simulation change.
- **Confidence**: MEASURED.
- **Verify**: after a merge, no CI run on `main`; Pages deploys in about 2 minutes.

### 2. Draw the browser tests cheaply unless a test is about what's drawn

- **Where**: `client/js/world/view.js:78-88` (no touch screen means "high"), `view.js:74` (High: 2048 shadow map, antialiasing, grass, far land to 4 km), `client/js/app/camera.js:33` (`PITCH.start: 12`), `e2e/pellagos.spec.js:94-114` (`playing`), `:195-204` (`overlook`: 35 degrees down), `e2e/together.spec.js:36-55` (`cheaply`, `undrawn`).
- **Now**: 183 of 337 browser tests load the game (286 of 379 minutes). 158 open `/?play&seed=N` at High, with shadows, in software, from the start view. Only the two-game specs and about five `pellagos` tests ask for low quality; one test stops the drawing.
  - MEASURED (git history): when the start view changed to look out across the land, the same 327 tests went from 284 to 352 minutes (`889b34c:e2e/durations.json` against `53cce46`). Game specs rose (`pellagos` 1.25 times, `together` 1.32, `worlds` 1.41, `controller` 1.84) while lab pages fell in the same re-timing (`model-viewer` 0.81), so the true rise is nearer 95 minutes. Commit 53cce46 says frames were "about half" as fast and 22 tests ran out of time.
  - MEASURED (the repository's own): a two-game test went from 290 s to 100 s undrawn (`together.spec.js:47-55`). The other 13 tests there, and `broker` and `worlds`, still draw: 64 minutes.
  - READ: at the tests' 500 by 300 pixels, High's shadow map has 28 times the pixels of the picture, drawn in software every frame.
- **Change**: (1) one shared `playing()` that puts the camera as `overlook` does unless the test is about the start view (8 tests already do by hand); (2) the same helper turns shadows off, then sets low quality, tests about crowds, grass, far land or shadows naming theirs; (3) `undrawn` for every two-game test that looks at menus, chat, trade and parties; (4) keep a few tests at High from the start view on purpose.
- **Gain**: step 1, 70 to 95 minutes a run (MEASURED: it undoes that change for tests). Steps 2 and 3: SUSPECTED larger. For the lead's browser session: time `/?play&seed=1` to `window.pellagos.playing`, and a frame, under `--enable-unsafe-swiftshader` at 1000 by 600, scale 0.5, for today's defaults, `overlook`, shadows off, low quality, and `renderer.render` stubbed.
- **Effort**: M (step 1 alone S).
- **Risk**: tests that depended on High or the start view must say so. Nothing a player sees.
- **Confidence**: MEASURED for step 1; READ and SUSPECTED for the rest.
- **Verify**: `e2e/durations.json`'s total falls from 379 to under 310 minutes after step 1.

### 3. More browser jobs than eight, behind one required check

- **Where**: `ci.yml:25` (`E2E_SHARES: 10`), `:122` (matrix of 8), contribution.md's settings table, `test/contribution.test.js:35-43`.
- **Now**: ten jobs of 41 planned minutes, the slowest 52. Two runs fill the limit of 20, and every job is required by name, so changing the count needs the owner.
- **Change**, after finding 1: add a job `ci` that `needs` all the others, runs `if: always()`, and fails unless each result is `success`; the owner makes it the only required check, once. Then raise the matrix to 18. Optional: 38 shares of about 10 minutes, so the limit of 20 hands the next share to whichever runner frees first.
- **Gain**: MEASURED model (`ci-ideal.mjs`, drawing from the 430 observed runner speeds): 20 jobs end at a median 26.5 min (90th percentile 27.7) against 52.0. Shares following runner speed are worth 12 minutes at ten jobs, about 5 at twenty.
- **Effort**: S; M for the small shares.
- **Risk**: two pull requests' runs at once wait on each other, so the second ends no sooner than today. More jobs make "never given a runner" likelier.
- **Confidence**: MEASURED model; the limit is documented and observed.
- **Verify**: 20 jobs ending within a few minutes of 27.

### 4. Longer default waits, and keep what a failed test saw

- **Where**: `playwright.config.js` (no `expect.timeout`, so 5 s; no `screenshot`, `trace`, `retries`); `.github/actions/e2e-share/action.yml:46-53` (only the JSON report kept); `e2e/missions.spec.js:65-86`; `client/js/app/game.js:18527-18565`.
- **Now**, MEASURED over the last 100 runs:
  - All 33 failed jobs failed in a browser-tests step. Lint, unit tests and the motion check failed 0 times.
  - 8 of 33 runs on `main` (24%) failed on a tree that had just passed.
  - At least 15 failures were flaky: 4 ran out of their own time on a slow runner (the pack and trading twice, the thumb stick, the enemies list); 2 were a default 5 s `expect.poll` (the mouse pointer); 2 waited in real time on a live game; 3 were the random hero (finding 5); 4 were races. Four more in one pull request's run were the same kinds.
  - Counted: 35 `waitForTimeout`; 49 of 115 `expect.poll` and about 1,475 of 1,700 locator assertions on the default 5 s; 51 of 230 `waitForFunction` on the default 30 s; 7 `realTime: true`; no `Math.random` in test code.
  - A failed test leaves no picture or state.
- **Riskiest**:
  - `e2e/pellagos.spec.js:2472-2477`: `expect.poll` at 5 s after a mouse move, game live. Failed twice.
  - `e2e/together.spec.js:1445-1446`: up to 180 s of real time for three soldiers to fall. Failed twice.
  - `e2e/together.spec.js:1382-1391`: sleeps 3 s, then expects `pending: 0` with two games in software.
  - `e2e/pellagos.spec.js:16777-16780`, `17117-17119`: a 700 ms hold, then `toBeVisible` at 5 s.
  - `e2e/pellagos.spec.js:4762-4766`: a stop command, a 500 ms sleep, then working out where to click.
  - `e2e/missions.spec.js:77, 131` and `pellagos.spec.js:4926, 7249, 9277, 9344, 9639, 10569, 12202`: taps at `avatar.point(0.6)`. SUSPECTED cause of `missions.spec.js:210`: `#whoIsAt` measures a tap against each character at 0.2, 0.5 and 0.8 of their height and counts the player 6 pixels further off (`game.js:18550-18555`). A tap at 0.6 is about 9 pixels from the messenger's nearest point, so with the player in line the player can win it; `tap` then walks to the ground (`game.js:17405-17470`) and no talk opens. The test puts the player 2 squares away without setting the camera, with a random hero. Confirm by logging `#whoIsAt` for such a tap over a few hero heights. A tap at `point(0.5)` can't lose.
- **Change**: `expect: { timeout: 20000 }`; `screenshot: "only-on-failure"` and a teardown that attaches the game's messages, debug log and positions on failure, with `test-results/` uploaded when the step fails; the nine taps to `point(0.5)` after `overlook`; poll for `pending === 0` at `together.spec.js:1382`.
- **Gain**: ESTIMATED: with findings 2 and 5, most of the 15; each is a 40 to 52 minute re-run.
- **Effort**: S.
- **Risk**: a truly failing assertion takes 20 s to say so.
- **Confidence**: MEASURED counts; SUSPECTED for the messenger.
- **Verify**: failed runs on unchanged trees over the next 100, against 24%.

### 5. A seeded hero for `?play`, and a known first step

- **Where**: `client/js/main.js:6611-6618`, `client/js/app/heroes.js:82` (`random = Math.random`).
- **Now**: each of the 158 `?play` tests gets a different hero every run. MEASURED: `riding.spec.js` failed three times in two days on lines true only for some bodies (hips 1.2 and 1.25 against under 1.2; stirrups 0.04 against under 0.02). Commit 0cf7603: "the fixed line failed now and then, as the game's hero was rolled tall". READ: from "playing" to a test's first `game.stop()` the world steps in real time, so its state depends on the runner; 47 game tests never stop it.
- **Change**: make the hero from the seed (`createRandom(seed)`), with `&hero=K` for another body; a `&held` (or the shared helper) stops at the first step.
- **Gain**: removes a cause of 3 of the 15 flaky failures. ESTIMATED.
- **Effort**: S.
- **Risk**: one body hides what another would show; the motion check covers each people's extreme builds. `?play` isn't a player's way in.
- **Confidence**: MEASURED and READ.
- **Verify**: the same hero on two loads; the riding test green 20 times running.

### 6. Keep the world's plan between unit test processes

- **Where**: `client/js/core/worldplan/plan.js:26-27, 58-70` (a cache of 4 plans, per process), `client/js/core/overworld.js:2477`.
- **Now**: MEASURED: the unit suite is 60.2 CPU-minutes in 292 processes. `layOutWorld` runs 183 times in 134 of them: 545 s, 15.0% of the suite. Seed 2 is laid out 96 times, seed 1 48, seed 3 26. A first lay-out costs 2.4 to 3.3 s CPU; the plan is 1.7 MB and `v8.serialize` writes or reads it in 2 to 6 ms.
- **Change**: a test preload keeps each plan on disk under `node_modules/.cache/`, keyed by seed and a hash of the planner's source files, and hands it to `plan.js` through a small exported setter. CI doesn't restore the cache, so the gate always lays out afresh.
- **Gain**: up to 15% of the suite's CPU, about 3 of 20 local minutes. ESTIMATED from the measurement.
- **Effort**: S to M.
- **Risk**: a key that misses a source file serves a stale plan locally; CI still catches it. No game change beyond the setter.
- **Confidence**: MEASURED.
- **Verify**: the preload in `hook/` reports `layOutWorld` under 10 s for the suite on a second run.

### 7. The unit tests that dominate, and why: worlds built again and again, and long simulated time

- **Where**: `test/ground.test.js:84-93`, `test/goods.test.js:170`, `test/netplay.test.js:31, 47`, `test/director.test.js:45-60`.
- **Now**, MEASURED:
  - No file dominates: the top 10 are 21% of the CPU, the top 30 44%, the top 100 82%; 98 files take under a second.
  - The ten heaviest (CPU s): `world-server` 125, `director` 86, `clipping` 79, `invasions` 72, `snapshots` 72, `characters` 70, `goods` 67, `netplay` 66, `character-building` 65, `registry` 64.
  - `buildWorld` is called 841 times: 1,121 s, 30.8% of the suite, the plan included.
  - In the 28 heaviest files (1,290 s), 195,861 host steps (163 game-minutes) take 492 s (38%) and `buildWorld` 419 s (32%).
  - It is not model parsing: reading the body is 65 ms.
- **Change**, each on its own:
  - `ground.test.js`: move the "within 640 m" test above `overworld.chunkAt`. MEASURED three times each: 43.9 to 48.8 s CPU as written, 9.1 to 9.6 s after, the same 2,512 samples and steepest grades.
  - `goods.test.js:170`: 36,000 full host steps to see one buff wear off; the file is 57,305 steps, 55 of its 71 s. Show the wearing-off on the one-minute buff, or move the clock.
  - `netplay.test.js`: 66 world builds are 41 of 59 s. `director.test.js`: 43 builds, 30 s. `snapshots.test.js`: finding 8.
  - `clipping.test.js` (79 s) measures things sunk into bodies with the motion check's own `dress` and `itemDepths`, at the same 1.2 cm. SUSPECTED overlap, worth a look by someone who knows both.
- **Gain**: `ground` 35 s and `goods` about 25 s CPU: 1.7% of the suite for two small edits.
- **Effort**: S each.
- **Risk**: none to the game; the assertions stay.
- **Confidence**: MEASURED, but for `clipping`.
- **Verify**: `PERF_OUT=... NODE_OPTIONS="--import .../hook/register.mjs" node --test <file>`.

### 8. `test/snapshots.test.js` builds a world for every snapshot version ever kept

- **Where**: `test/snapshots.test.js:71-95`.
- **Now**: one test builds a world, restores and plays 100 steps for each of 27 fixtures. MEASURED: it's the slowest unit test (130 s wall in the run, 72 s CPU for the file: 33 world builds 30 s, 2,700 steps 35 s). The rule keeps every fixture, and four were added in the last seven days, so it grows about 10 s CPU a week.
- **Change**: bring every fixture forward as now (`Host.forward` is about 10 ms each, and is what a fixture is for), and restore and play on the oldest, the newest and those whose forwarded form differs in shape from the next's. The owner's call, since it tests less per fixture.
- **Gain**: about 50 s CPU now, and the growth stopped. ESTIMATED.
- **Effort**: S. **Risk**: a forwarded snapshot that restores badly goes unseen if its shape matches a neighbour's. **Confidence**: MEASURED cost, READ growth.
- **Verify**: the file's CPU no longer rises with each new fixture.

### 9. The local loop: the same checks, sooner

- **Where**: `package.json` (`check`, `lint`, `test`), `CLAUDE.md`.
- **Now**: `npm run check` is 60 CPU-minutes of unit tests behind lint.
- **Without loosening it**:
  - Findings 6 and 7.
  - `eslint . --cache --cache-strategy content`: MEASURED 47.3 s the first time, 1.0 s after (CI's lint is 15 to 24 s).
  - `--test-timeout` in `npm test`: a hung unit test today takes the job's 60 minutes and names nothing.
  - Affected files first: a script that orders the files so those a change can reach run first. The same tests; a failure shows in minutes.
- **A looser rule, the owner's to choose**: MEASURED over the last 60 merges, the tests a change can reach by imports, plus the 50 files that read files or start processes, are a median 36% of the unit CPU (26% if the generated `assets.js` and `manifest.js` don't count; 88 to 100% for the 26 merges that touch core hubs). Over 100 CI runs the unit tests never failed there.
- **Not worth it**: more concurrency (CI's four barely beats three; Pages at three takes the same 13 to 23 min); one process for all files (MEASURED on 24 files: 275 to 124 s CPU, but 8 of 274 tests fail on each other's global stand-ins).
- **Effort**: S. **Risk**: ESLint's cache can go stale if its config changes without the cache being cleared. **Confidence**: MEASURED.
- **Verify**: a second `npm run lint` in a second.

### 10. Time unit tests' speed limits in CPU time

- **Where**: `test/helpers.js:13-25` (`quickEnough`, 12 uses in 8 files), `test/world-plan.test.js:31-41`, `test/world-server.test.js:188`.
- **Now**: MEASURED: in the lead's timing run, at load 19 to 22, `overworld`, `world-plan` and `world-server` failed; in my run at load 8 to 12 all 3,427 tests passed. All three hold a wall-clock limit; `layOutWorld` must take under 8 s though it is 0.9 to 3.3 s of CPU.
- **Change**: a `cpuMs(fn)` beside `quickEnough` using `process.cpuUsage()` for synchronous work. `world-server.test.js:188`'s 15 s is real time across threads and needs a longer limit.
- **Gain**: no false failures on a busy machine. **Effort**: S. **Risk**: none. **Confidence**: MEASURED twice, cause READ.
- **Verify**: the three files pass with four other suites running beside them.

### 11. Rules that live in `game.js` can only be tested by loading the game

- **Where**: `client/js/app/game.js` (19,683 lines; `Game`, 561 methods), `client/js/main.js` (6,660 lines).
- **Now**: MEASURED: every module under `core`, `world`, `characters`, `beasts` and `audio` is imported by some unit test (one 34-line file isn't). `main.js` is imported by none; six tests import `game.js` for five small exports; none builds a `Game`. So its decisions are tested in the browser at a mean 94 s each. 67 of the 183 game tests (76 minutes) use no locator, click, key or touch; 57 of them read only what's in the scene. `test/app.test.js:1839` reads `game.js` as text; `test/joinedgame.js:15-19` re-implements part of `#tick`.
- **Change**: keep moving decisions into modules on plain values, as `app/camera.js` and `app/governor.js` are. First: host event to words and sound (`#hear`), who a tap is on (`#whoIsAt`, `tap`), who's held in full (`#marshal`).
- **Gain**: ESTIMATED 60 to 90 runner-seconds a run per browser test replaced.
- **Effort**: L, in slices of S. **Risk**: refactoring a large class. **Confidence**: MEASURED counts.
- **Verify**: `game.js`'s lines and the browser suite's minutes both fall.

### 12. `e2e/durations.json`: time only tests that passed, and drop tests that are gone

- **Where**: `scripts/e2e-durations.js:31-37`.
- **Now**: MEASURED: 12 of 337 entries sit on a whole minute (120.2, 180.2, 240.2, 300.2 s), the limit a test had when it ran out of time; 7 entries are for tests renamed or removed; 6 tests have none.
- **Change**: keep a passing result's time only; drop what `--list` no longer has.
- **Gain**: a slightly truer split. **Effort**: S. **Risk**: none. **Confidence**: MEASURED.
- **Verify**: no entry within a second of a whole minute past 120 s.

### 13. One set of helpers for each kind of test

- **Where**: `playing` is defined in nine specs with three time limits; `playUntil` twice. In `test/`, `run(host, ms)` is defined in 71 files, `HERO` in 78, `put` in 48, `hosted` in 21; `test/helpers.js` is 39 lines.
- **Change**: `e2e/fixtures.js` and a `test/world.js` hold them. Do this first: findings 2, 4, 5 and 6 are then one edit each.
- **Effort**: S. **Risk**: none. **Confidence**: READ.
- **Verify**: `grep -c "function playing" e2e/*.spec.js` is 0.

## 2. Checked and already good

- CI setup (1% of a job); npm's cache.
- The split of the browser tests (`scripts/e2e-shard.js`): even on average.
- A browser of its own per test (`e2e/fixtures.js`): about a second a test, and it fixed a real cause.
- Adaptive quality off under automation (`main.js:6449`).
- Fights played without drawing (`playUntil`).
- Determinism checked by a test (`test/setpieces.test.js:704-726`); only exact `Math.sqrt` remains in `core`.
- Unit tests reach every rules module.
- The test server compresses each file once (`server/static.js:61, 90`).
- **Reusing one loaded game**: not worth it. A load is about 20 s (the fastest single-load tests take 25 to 36 s), 214 loads are at most 71 of 379 minutes, and most tests change their world.
- **Two workers a runner**: not now. SwiftShader already draws on every thread (`together.spec.js:15-16`). Worth a trial on one share once tests are cheap to draw: SUSPECTED.
- **Docs-only skipping**: 0 of 60 merges, 8 of 300 commits.
- **Unit tests on two runners**: no gain until findings 2 and 3 make them the longest job.
- The motion check: longest first over all threads.

## 3. Bugs

- **`?quality=` is documented and does nothing**: offered in `main.js:17-18`, `README.md:612`, `contribution.md:179`; `main.js:6611-6644` never reads it. Sure.
- **Stale timings, and a close limit**: `contribution.md:96-99` and `ci.yml:29-30, 109-112` say `test` takes about 27 minutes and `e2e` about 28. MEASURED: `test` 46.5 median, 51.5 at most against a 60-minute limit; `e2e` up to 57.5 against 80. Sure.
- **A host's world can lose its code** (for the multiplayer reviewer): `server/broker.js:76-77, 556` keeps a listing 120 s after a close frame, 45 s without. `broker.spec.js:153` failed on CI with a new code after a reload (job 129232328054). When Safari closes a tab for memory there's no close frame, so a phone has 45 s to reload and reopen. SUSPECTED.
- **`durations.json` holds limits as times** (finding 12). Sure.
- **Nine taps off the picker's sample points** (finding 4). Suspected.
- **Wall-clock limits fail under load** (finding 10). Sure.

## 4. Code structure

- `Game` and `main.js` (finding 11) are why the browser suite is 194 tests and 20,239 lines in `e2e/pellagos.spec.js`.
- That file is 67% of the browser minutes. Splitting it by area would make "the tests your change touches" a file name.
- Copied helpers (finding 13).
- For the loading reviewer: a warm `buildWorld` is about 0.64 s CPU in Node, 60% of it the `Overworld` constructor: `settleCitadels` (`core/sites.js:441, 743`) 35% of the profile, and `Trails`' `nearestOn` (`core/trails.js:244`) 18%. A first `layOutWorld` is 2.4 to 3.3 s. Faster here speeds the game's load and 841 test builds (profile: `prof/`).

## 5. Gameplay and design

None beyond the broker's 45 seconds.

## 6. Questions for the owner

1. May `main` go untested after a merge, relying on the ruleset (finding 1)?
2. Would you pay for GitHub Pro (40 jobs at once)? contribution.md says nothing in the pipeline costs money.
3. Would you move the repository to a free organisation for a merge queue? MEASURED: 23 of the last 67 pull request runs existed only because `main` had moved.
4. Must `npm run check` before every push stay "every unit test" (finding 9)?
5. Is a test hero that changes every run wanted (finding 5)?
6. May a test that passes on a second try keep the job green, its first failure kept and listed?
7. May `snapshots.test.js` restore fewer than every fixture (finding 8)?

## Summary

The findings file could not be written (the harness refuses report files from sub-agents); the full findings are above, and the data is in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/tests/`.

In rank order:

1. **`main` is tested twice and its unit tests three times.** 60 of 60 merge commits have the tree a pull request just passed; those runs are a third of all CI, hold half the 20-job limit, and 24% fail on flakes. Pages' deploy waits 17 minutes on unit tests. Remove both.
2. **Browser tests draw the costliest view at the highest quality in software.** The repository's own timings show the new start view added 68 to 95 minutes a run. Start tests looking down, then shadows off, low quality, and undrawn for two-game tests (measured once: 290 s to 100 s). The rest needs the lead's browser.
3. **18 browser jobs behind one aggregate required check**, once (1) frees the limit: 52 to about 27 minutes. The limit of 20 is real and already binds.
4. **Flakiness is about one run in four.** At least 15 flaky failures in 100 runs: slow tests hitting limits, default 5 s waits, a random hero, races. A 20 s default, evidence kept on failure, and nine taps moved to the picker's own sample point (the suspected cause of `missions.spec.js:210`).
5. **Seed the `?play` hero**: three riding failures came from a hero rolled tall.
6. **Unit tests are 60 CPU-minutes, 31% of it building worlds.** A disk cache of the plan is worth 15%; `ground.test.js` drops from 44 to 9 s with a three-line reorder (measured); `goods.test.js` steps 36,000 times to see one buff end; `snapshots.test.js` grows with every version.
7. **Locally**: ESLint's cache (47 s to 1 s), a per-test timeout, affected tests first; choosing tests by imports would cut the median push to a third, if the owner allows.
8. **Wall-clock limits** failed three unit files under load; time them in CPU.
9. **Bugs**: `?quality=` does nothing; contribution.md's timings are stale and the `test` job is 8.5 minutes from its limit; a host that crashes has 45 s to reclaim its code.

Not worth doing: caching setup, reusing a loaded game, docs-only skipping, splitting the unit tests, and two Playwright workers until drawing is cheap.