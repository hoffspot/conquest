## Pipeline part: report

**1. Items**

1. **No CI on `main`**: DONE. `ci.yml` keeps `pull_request` and `workflow_dispatch`; comments and concurrency note fixed.
2. **Pages without lint/tests**: DONE. Build limit 30 → 10 minutes. `npm ci` stays: it is what keeps npm's cache on `main` for pull requests' runs (the build itself needs no packages; I checked).
3. **`ci` job**: DONE. `needs: [test, motion, e2e]`, `if: always()`, fails unless every result is `success` (jq check tried locally on success, failure, cancelled, skipped). Matrix still 8, `E2E_SHARES` 10. The motion and unit-test jobs' shares were hard-coded as 9 and 10 in four places, so I made them `last-1` and `last` (the action turns them into numbers). The matrix and `E2E_SHARES` are now truly the only two numbers. Lists are identical to before for 10 and 20 shares, with the step run as GitHub runs it.
4. **Node 26**: NOT DONE, by your rule. One test genuinely fails (below). Workflows stay on 22, `mac.yml` and the Mac app on 24.21.0. `contribution.md` (*Which Node*) records the finding.
5. **Artifact on failure**: DONE. `test-results/` is uploaded as `e2e-failures-<share>` when the action fails; the JSON report is kept as before.
6. **Durations script**: DONE. Only a passing run is timed; a failed test keeps its old time; tests no longer in `--list` are dropped. It reads the reports named on its command line, so it never relied on `main`; the docs now say to use a pull request's run. `e2e/durations.json` is not regenerated.
7. **`contribution.md`**: DONE. `test` and `motion` limits 60 → 80 (as `e2e`). Settings table says what is set today (ruleset read back 2026-11-11: the ten jobs by name, up-to-date rule on) and what is asked.

**2. Commits** (base 84f08e2), worktree `/home/user/conquest/.claude/worktrees/agent-aa717ae8cdac423fc`, branch `worktree-agent-aa717ae8cdac423fc`
```
009888d CI stays on Node 22: why Node 26 isn't used yet, written down
e50953f CI's timings as measured, and its jobs ended at 80 minutes each
51ebd70 What a failed browser test left is kept with the run
70dd425 One CI job, ci, that passes only if every other did: to be the one required check
c404639 A browser test is timed only where it passed, and a test that's gone loses its time
aa958f2 CI no longer runs on main after a merge, and Pages deploys without testing again
```

**3. Files outside those named**
- `README.md`: three hunks. The badge at line 3 now points at the Pages deploy, because CI's badge would freeze at `main`'s last run; drop that hunk if unwanted.
- `docs/LICENSED_MODELS.md`: two lines.
- `test/e2e-durations.test.js`: new.

**4. Tests**
- `contribution`, `e2e-durations`, `e2e-shard`, `mac-app`, `install-mac`: 48 of 48 pass. `test/contribution.test.js` passes at every commit. Lint is clean and all six YAML files parse.
- I broke the pipeline 12 ways (job missing from `needs`, no `always()`, matrix 18 alone, `push` restored, and so on); the test failed each time.
- **Node 26.13.0** (SHA-256 verified), whole suite: 3,428 of 3,435 passed, at machine load 15 to 38.
  - `world-plan` and `world-server` pass when run alone (time limits under load).
  - `test/registry.test.js:281` ("giving back its memory") fails 3 of 3 alone on Node 26. It also fails 3 of 3 on Node 24.21.0, the Mac app's Node, and passes 3 of 3 on Node 22.23.4, at the same load.
  - Measured on Linux: two worlds take about 260 MB on Node 22, 340 on 24, 360 on 26. After their threads end, Node 22 returns 82% at once; Node 24 returns 83% after 3 to 10 s; Node 26 had returned 14% after 45 s (it reuses the memory for later worlds and releases it irregularly).

**5. For the lead and the owner**
- **Owner, after merge**: *Settings → Rules → Rulesets → main → Require status checks to pass*; add `ci` (GitHub Actions); remove `test`, `motion` and `e2e (1 of 8)` to `e2e (8 of 8)`; leave *Require branches to be up to date* ticked; save. Then the matrix can go to 18: `shard: [1..18]` and `E2E_SHARES: 20`, plus "8 `e2e` jobs" in `contribution.md`. Not before, or pull requests wait for ever.
- **Owner's call**: whether the server or the registry test should change for Node 24/26.
- `CLAUDE.md` is not edited (an agent may not). Its "(every job is a required check)" goes stale once the ruleset changes.
- `?quality=` is still documented in `contribution.md`'s `npm start` row; I left it for whoever owns `main.js`.
- `E2E_AHEAD` keeps 20 for the unit tests (22 measured).
- The comment edits to `mac.yml` and `build-mac-app.js` will trigger the Mac workflow on the pull request.
- Logs, scripts and the two Node binaries (438 MB) are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/pipeline-node26`; delete `x/` and `x24/` when done.