# Assignment: THE BATTLE (pull request 3, "the simulation, multiplayer and servers")

Read first: `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/IMPL.md` (the common brief: follow it exactly), then `CLAUDE.md` and `contribution.md` in your checkout, `docs/GAME.md` on fighting, spells and followers, and the review's findings, the whole file: `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-combat.md` (its benchmarks are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/combat/`; the appendix says how to run them; run them before and after).

This pull request changes the rules, so every copy of a world must come out the same: `client/js/core/` is deterministic (`core/exact.js`, seeded random numbers, no iteration order that could differ). The lead bumps `NET_VERSION` and `SNAPSHOT_VERSION` once for the whole pull request: do NOT bump them and do NOT change what a snapshot holds (another engineer owns the snapshot's format). If one of your changes needs a field kept in the snapshot, say so in your report.

You own `client/js/core/battle.js`, `client/js/core/spells.js`, `client/js/core/progress.js` as far as the items below need, their tests, and their docs. Do not edit `client/js/core/host.js`, `client/js/core/navigation/`, `client/js/net/`, `server/`.

## Performance (findings-combat.md, section 1)
1. Finding 1: those set on no one look for an enemy four times a second, each in its own step by id, instead of every step. Players are still noticed in the step they come into sight (the owner was told up to a fifth of a second for a guard or beast to notice an enemy who is not a player; that stands).
2. Finding 2: search among those near without making lists, and read points by index.
3. Finding 3: never `delete` a property of an actor; make every actor with every property it may come to have. This must not change what a snapshot holds or its checksum: if it would, give the properties defaults the snapshot already leaves out, or stop and report.
4. Finding 5: spread the ways found over the steps.
5. Finding 6: one helper over the index for "everyone within r of a point who is an enemy", used at the eleven places that run through everyone.
(Finding 4 belongs to the navigation engineer, finding 7 to the snapshot's.)

## Bugs (section 3)
6. Bug 1: a shot gives up once it has flown about one and a half times its attack's reach (it fizzles; no hit). Docs say shots home; say now that they give up.
7. Bug 2: docs/GAME.md's Stun (9 m against 18 m; 3,000 against 5,000 ms) and spells.js's "five minutes" comment brought into line with the code.
8. Bug 4: a hazard's hits not credited to a caster who has fallen. Bug 5: a line's ranks closed when one falls and another joins in the same second.

## The owner's decisions (rules changes)
9. **Hold and stuns on bosses.** The owner: "For hold, halve stuns on bosses and shorten each repeat, as Fear already wears thin." A stun of any kind on a boss lasts half as long, and each one within 20 s of the last lasts half as long again (find how Fear wears thin and follow its form and constants where it has them). Measured before: a tier-10 boss stunned 99.5% of two minutes by Hold alone (`combat/bug-hold.mjs`); run it after and report the share. What counts as a boss is whatever already resists taunts, Fear, Pacify and Polymorph. The spell's description, GAME.md's tables and any tip that mentions it say so.
10. **A follower whose leader is down or on another floor defends itself** (bug 3, `battle.js` about 4343-4347): it strikes back at whoever strikes it or its leader's fallen body, and otherwise holds where it is; it does not go looking for a fight or wander.
11. **The cap on who goes for a player stays** (`AGGRO`). The owner: "If a player strikes an enemy, it can be hostile beyond the cap", which is how the code is written: check that it is exactly so (anyone a player strikes may come for them whatever the cap; the cap holds back only those not struck), add a test that says it, and make the docs say it plainly where the cap is described.

## Proving it
`test/battle*.test.js`, `test/spells.test.js`, every test that names what you touch, the motion checksum tests and `test/snapshots.test.js` (which must pass UNCHANGED apart from what the rules changes above really alter; say exactly which expectations moved and why), `npm run check:motion`, and the review's benchmarks with numbers before and after (`node /tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/combat/...`). `npm run step-budget` is judged by the wall clock and fails on a busy machine: another engineer is fixing that; do not rely on it.

## The scaling plan (read before you start)
`generated/multiplayer_scaling_plan.md` (on main since 11 November; in your checkout if your base has it, else `git show origin/main:generated/multiplayer_scaling_plan.md`) is the owner's agreed programme for taking a world from 8 players to 100, in numbered slices. Where an item of yours is one of its slices (its Stage 0 measurements, Stage 1's passes on a grid, Stage 2's limits, the foundations' rules such as "a switch for every step" and "no checksum changes in Stage 1"), build it the way the slice says, name the slice in your commit and your report, and do not go further into the plan than your items here. Where the plan and this assignment disagree, stop and report rather than choose.
