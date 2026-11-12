The first of three pull requests implementing the performance review (2026-11-11). This one is the tests and the pipeline; it changes nothing a player sees. The other two (the game on the device; the simulation, multiplayer and servers) follow.

### Why

Measured from the last 60 CI runs: a push takes a median 52.5 minutes, the browser tests are 379 of a run's 412 planned minutes, and every merge was tested again on `main` although its tree was identical to the pull request head that had just passed (60 of 60 merges). About one run in four on `main` failed on unchanged code.

### What changes

**The pipeline**
- **No CI on `main` after a merge.** `ci.yml` runs on pull requests (and by hand). The ruleset already requires a green, up-to-date pull request, so the merge commit's tree has just passed.
- **Pages deploys without testing again.** Lint and the unit tests come out of the deploy's build job: a merge is live about 17 minutes sooner.
- **One job, `ci`,** that needs every other job and passes only if each did. It is to become the only required check (see *For the owner*).
- **A failed browser test leaves what it saw:** `test-results/` is kept with the run as `e2e-failures-<share>`.
- **`e2e:durations`** times a test only where it passed, and drops tests that no longer exist.
- **Job limits** are 80 minutes each (the `test` job had come within 8½ minutes of its 60), and `contribution.md`'s timings are the measured ones.
- **The unit tests' step** no longer carries `-- --test-concurrency=4`: Node takes no option after the test files' names, so it never did anything.

**The browser tests**
- **Drawn cheaply unless a test is about what's drawn.** Every spec opens the game with one shared `playing` (`e2e/fixtures.js`): Low quality, no shadows, looking down. Measured in software at the tests' own settings: 0.4 frames a second at High from the start view, 2.1 this way. Tests of a higher quality, shadows, the camera or what's where on the screen ask for what they need, with a comment saying why. No assertion was weakened.
- **`expect` waits 20 seconds,** not 5.
- **Evidence on failure:** a picture of each page, the game's messages and where everyone was, and the debug log.
- **Nine taps moved to the height the game's own picker samples** (0.5, not 0.6): a tap between samples could be won by the player standing in line, who then walked instead of talking. The likely cause of `missions.spec.js:210` failing now and then.
- **`/?play`'s hero is made from the world's seed** (`&hero=K` for another body). The riding test had failed three times in two days on a hero rolled tall.
- **`&quality=low|medium|high`** on `/?play` works now. It was documented and did nothing.

**The unit tests and the local check**
- **A world's plan is kept between test processes** (`test/plan-cache.js`, under `node_modules/.cache/`): the same plan was laid out 183 times a run, 15% of the suite. Kept by seed and a hash of the planner's code, with the land its waters are worked out on. CI never restores the folder.
- **Speed limits are kept by the processor's time,** not the clock's: three files failed on a busy machine for nothing else.
- **`ground.test.js`** asks the cheap question first (54 s to 12 s of processor time); **`goods.test.js`** puts the clock on to a half-hour ward's last second and plays that, not the half hour.
- **`npm run lint` keeps a cache** (75 s to 1.5 s on a second run); **a test file that hangs is ended at 20 minutes and named;** **`npm run test:affected`** runs every unit test, those a change can reach first.
- The suite's processor time: 3,642 s to 3,270 s.

**Tooling**
- **ESLint 10** with @eslint/js 10 and globals 17. Its three new rules found 25 things: 19 values never read and 6 rethrown errors that lost their cause. All fixed; none was a bug.
- **Playwright 1.65,** **draco3dgltf 1.5.9** (lockfile only; built models byte-identical).
- Lint and git leave Claude Code's worktrees (`.claude/worktrees/`) alone.

### Not done, and why

- **Node 26.** One unit test fails on it, and on Node 24: `test/registry.test.js:281`, a world server giving its memory back after worlds close. Node 22 returns 82% at once; Node 26 had returned 14% after 45 seconds. The owner chose to stay on 22 for now. `contribution.md` records it.
- **18 browser-test jobs.** They wait on the ruleset change below; the matrix stays at 8.
- **`test/snapshots.test.js`** still restores every fixture: restoring fewer would loosen it.

### For the owner

1. **After this merges, one settings change:** *Settings → Rules → Rulesets → main → Require status checks to pass*: add `ci` (GitHub Actions); remove `test`, `motion` and `e2e (1 of 8)` to `e2e (8 of 8)`; leave *Require branches to be up to date before merging* ticked; save. The next pull request then raises the browser-test jobs from 8 to 18 (modelled from 430 observed runner speeds: a run ends at about 27 minutes against 52). Not before, or pull requests would wait for ever on checks that no longer exist.
2. **`npm audit` now lists 4 moderate advisories,** all one issue in minimatch, which ESLint 10 depends on. Development tools only; no fix short of going back to ESLint 9.
3. **Expect a round or two of fixes on this pull request's own CI:** only 36 of about 340 browser tests could be run here (all passed). A test that turns out to be about High quality or the start view gets a one-line opt-out.
4. **`e2e/durations.json` wants re-timing** from this pull request's first green run.

### Tests

- Lint clean; all 3,459 unit tests pass locally.
- 36 browser tests across ten specs pass with the cheap drawing; the riding test three times running.
- The pipeline was broken 12 ways on purpose (a job missing from `ci`'s needs, no `always()`, the `push` trigger restored, and so on): `test/contribution.test.js` failed each time.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XUfY7aYkNK4hmgUhgCyVx4
