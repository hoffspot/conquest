# Assignment: THE HOST AND THE WORLD IT MAKES (pull request 3, "the simulation, multiplayer and servers")

Read first: `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/IMPL.md` (the common brief: follow it exactly), then `CLAUDE.md` and `contribution.md` in your checkout, `docs/WAR.md` and `docs/WORLD.md` where they describe what you change, `generated/world_server_plan.md`, and the review's findings, the whole file: `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-host.md` (scripts in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/host/`; run them before and after).

This pull request changes the rules; every copy of a world must come out the same (`core/exact.js`, seeded random numbers). The lead bumps `NET_VERSION` and `SNAPSHOT_VERSION` once for the whole pull request: do NOT bump them and do NOT change what a snapshot holds (another engineer owns the snapshot: `host.js` about 728-940 and 3095-3466, `restore`, `adopt`, `leave`, and trading at about 5137-5171 are theirs). If a change of yours needs something kept in the snapshot, say so in your report.

You own the rest of `client/js/core/host.js`, `client/js/core/invasions.js`, `client/js/core/missions.js`, `client/js/core/worldplan/` and the terrain and chunk making under `client/js/core/`, `server/ahead.js`, and what in `client/js/app/game.js` makes ground, towns and dungeons ahead (keep to that: other pull requests have just changed much of game.js). Do not edit `client/js/core/battle.js`, `client/js/core/navigation/`, `client/js/net/`, `client/js/core/runner.js`, `server/world-worker.js`.

## Performance (findings-host.md, section 1)
1. Finding 1: make the ground a town, an army or a camp will stand on before the step that brings them out (the stutter on coming up to a town). The structure note applies: "what the simulation will want soon" is said by the host, where the distances are; the browser and `server/ahead.js` only do the making.
2. Finding 2: on a world server, keep as many chunks as its players need (and bugs 3 and 6: `Ahead.settled` that can never come true; what was queued round a player who has gone).
3. Finding 3: make a chunk a step at a time, and give the server the terrain worker.
4. Finding 4 is already done for the browser in pull request 2 (the plan made in a worker and kept in IndexedDB, `client/js/app/plans.js`, `plan-worker.js`, `core/worldplan/plan.js` `landOf`/`adoptPlan`): do only what remains for the server, if anything, using the same two functions.
5. Finding 5: make a dungeon before the player is at its door, off the step.
6. Finding 8: the small things in the look round. Finding 9: the war's turn spread so it is not one 10 to 13 ms step a minute.
(Finding 6 belongs to the snapshot's engineer, finding 7 to the navigation engineer.)

## Bugs
7. Bug 1: "A elven convoy", "A orcish convoy" (`missions.js:377`): "An" before a vowel sound, with a test over every people's name.

## The owner's decision (a rules change)
8. **The first raid comes at ten minutes, not five** (`invasions.js` `first: 300000` to 600000). The owner: "Back the first raid showing up to 10 minutes." Its size stays. Every doc, tip and test that says five minutes says ten; a save made before the change must still load and behave sensibly (a world between five and ten minutes old whose first raid has not come: say what happens and test it).

## Proving it
The tests of everything you touch (`test/host*.test.js`, `test/invasions.test.js`, `test/missions.test.js`, `test/ahead.test.js`, `test/world-server*.test.js`, `test/snapshots.test.js` unchanged), the review's scripts with numbers before and after (steps over 50 ms on coming up to a town; chunks kept and settled with eight players; a dungeon's making), and at the end two or three browser tests that walk up to a town and into a dungeon (`E2E_PORT=8157`, one worker).

## The scaling plan (read before you start)
`generated/multiplayer_scaling_plan.md` (on main since 11 November; in your checkout if your base has it, else `git show origin/main:generated/multiplayer_scaling_plan.md`) is the owner's agreed programme for taking a world from 8 players to 100, in numbered slices. Where an item of yours is one of its slices (its Stage 0 measurements, Stage 1's passes on a grid, Stage 2's limits, the foundations' rules such as "a switch for every step" and "no checksum changes in Stage 1"), build it the way the slice says, name the slice in your commit and your report, and do not go further into the plan than your items here. Where the plan and this assignment disagree, stop and report rather than choose.

## Added by the lead after the battle engineer finished
- Your base: before anything else, `git merge --no-edit origin/claude/optimistic-rubin-o1glnc` in your worktree. That is pull request 2 (the game on the device), which merges before this one and changes `client/js/app/game.js`, `main.js`, `session.js` and the world's making heavily (the plan in a worker, `client/js/app/plans.js`; what's built sent to the graphics card in a pass of its own, `client/js/world/sending.js`; the half-second jobs on their own clocks, `client/js/app/clocks.js`). Build on it; the lead cherry-picks only your own commits. Three of its browser tests are being fixed by others (a guard in its crowd, the field battle's crowds, the bars over others): leave those alone.
- From the battle engineer's report (`findings-impl-combat.md` beside the findings): `client/js/core/host.js` about 7898-7899 does `delete actor.sight; delete actor.keep`, which changes the actor's shape and leaves a clash's survivors slow; every actor is now made with every field it may come to have and nothing is deleted off one (`battle.js` `OPTIONAL`, `#made`), so make these two `= undefined` (and the same for `delete actor.formation.post/facing/refuge` in `host.js`; `core/engagement.js` has the same deletes: take those too and say so). Check the snapshot's text does not change (`test/snapshots.test.js`), since the battle leaves undefined fields out.
- Also from that report, yours to weigh and do if small and sure: `core/might.js` still counts a stun at full length against a boss, where a boss's stuns are now half as long and wear thin (`battle.js` `STUNS`, `#stunFor`).
- The battle engineer's commits are on `origin/claude/optimistic-rubin-o1glnc-wip-combat` (not in your base): read them if you need to see `OPTIONAL` or `STUNS` (`git fetch origin claude/optimistic-rubin-o1glnc-wip-combat` then `git show FETCH_HEAD:client/js/core/battle.js`), but do not merge them: the lead integrates.
- Commit every 20 to 30 minutes of work and before any long run (a usage cut-off can stop you without warning): unfinished work as a commit whose message starts "WIP: " and says what is done, what is not and the next step.
