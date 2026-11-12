All eleven items are done and committed, with two findings partly done on purpose (5 and 3, below). Nothing is pushed.

Worktree `/home/user/conquest/.claude/worktrees/agent-acbdbc1c6ff7d3964`, branch `worktree-agent-acbdbc1c6ff7d3964`, 11 commits on 9ab20b2 (#695), tree clean, generated files not committed.

## 1. Items

| Item | State | Commit | What changed |
| --- | --- | --- | --- |
| 2. Finding 2 | DONE | e01eeba | Searches fill one kept list; points read by index. No rule change. |
| 5. Finding 6 | DONE | 8b513f4 | `#standingNear` over the index at 12 places, roster order, each keeping its own test (plan slice 1-10's way, `Battle.indexing` as the switch). Tower and standing player look only as far as they reach. |
| 3. Finding 3 | DONE in battle.js | 1f7d789, cd6eb27 | One shape (`OPTIONAL`, `#made`), no `delete`; snapshot text unchanged. The host's two deletes are yours (section 4). |
| 1. Finding 1 | DONE | eaf93c4 | Looks and `#arm` four times a second in a step of one's own by id; players noticed in-step. No snapshot field. |
| 4. Finding 5 | PARTLY | 2280344 | `#pursue` ways spread. A line's march left alone: those steps now cost about the mean. |
| 6. Bug 1 | DONE | 79bbf6a | A shot fizzles past 1.5 × reach. |
| 7. Bug 2 | DONE | 79bbf6a | GAME.md and MAGIC.md Stun (18 m, 5 s), the elements' reaches, the wards comment. |
| 8. Bugs 4, 5 | DONE | 79bbf6a | Hazard hits are no one's once the caster has fallen; `#regroup` closes ranks on a fall plus a join. |
| 9. Stuns on bosses | DONE | b12274e | `STUNS` { 0.5, 20 s } through `#stunFor` for spell, shield bash and legendary stuns; descriptions and four docs. |
| 10. Followers | DONE | f566c4b | Strikes back at whoever is on it, struck it, or struck its leader down; otherwise holds. |
| 11. The cap | DONE, one gap fixed | 2668ed7 | One struck while fighting someone else was held back by a full cap; `#roomOn` now lets it through. |

## 2. Numbers (review's scripts, Node 22, load 10 to 27)

| Measure | Before | After |
| --- | --- | --- |
| Field battle 50 a side, battle's part: mean / p99 / worst | 1.163 / 3.725 / 7.11 ms | 0.499 / 1.386 / 3.96 |
| Field battle 100 a side | 2.393 / 9.225 / 12.70 ms | 1.069 / 3.089 / 5.70 |
| Whole step marching, 50 and 100 a side | 1.337, 2.843 ms | 0.709, 0.999 |
| Idle camp: 100 / 400 standing | 1.278 / 9.316 ms | 0.223 / 1.577 |
| Idle, 200 in a line: mean (p95) | 1.863 (3.850) ms | 0.617 (0.652) |
| Open field, 200 fighting (3 rounds back to back) | 1.59–1.70 ms | 1.41–1.50 |
| Garbage a step, field battle | 1,086 KB | 352 KB |
| Most ways in a step after the first, 100 / 200 fighting | 88 / 186 | 19 / 38 |
| Actor shapes in the field battle (mustered, 30 s, restored, 5 s after) | 3, 8, 8, 9 | 1 throughout |
| Hold recast on a tier-10 boss, 120 s | stunned 99.5%, 0 blows | 5.9% (Hexes 2), 10.0% (Hexes 6), 3.5% (Hold and Stun); 42–43 blows |
| Fireball at a galloping rider | lands 344 m off after 38 s | gone within 5 s |
| Snapshot of 100 actors | 3.1 ms | 3.05–3.09 |
| Restore of 100 actors | 3.2 ms | 4.1 |

- **Open field, 100 fighting:** no gain measurable in the noise.
- **Open field, 200:** the three no-rule-change commits alone give 1.39–1.40 ms.
- **`verify.mjs`:** nine battles hash the same as base after each of findings 2, 6 and 3.

## 3. Tests

- **New:** `test/battle-rules.test.js` (35 tests) and two in `test/field-battle.test.js`. Mutation checks fail as they should for the helper's order, the reach bound, the way spread, `#regroup` and the cap gap.
- **Wide run, 138 battle and host files over the head:** 1,957 of 1,959 pass. The two failures are in `test/update.test.js` and come from the frozen copy not being a git checkout; the file passes in the worktree.
- **Latest commit (cd6eb27):** made after that run; 158 tests in 9 files pass on it, including snapshots, netplay and forecast.
- **`test/snapshots.test.js`:** passes unchanged.
- **Manifest, sw, boot, contribution:** pass in the worktree after `build:manifest`.
- **One expectation moved:** `test/combat.test.js` "puts its weapon away…" upper bound is 250 ms later, because a weapon is sheathed only in the character's own step.
- **`check:motion`:** exits 1 with one regression (`attack/staff/4|human-shortest-f`). The base's code gives the identical result in a full run, and that motion passes alone on both, so it is not from this branch.

## 4. For the lead

- **NET_VERSION:** bump for eaf93c4, 2280344, 79bbf6a, b12274e, f566c4b and 2668ed7.
- **SNAPSHOT_VERSION:** two new kept fields, `projectile.flown` and a boss's `actor.stunned`. Both read as absent in older snapshots, so the step can be empty; the fixture needs regenerating.
- **`host.js:7898-7899`:** change `delete actor.sight; delete actor.keep` to `= undefined`; I was told not to edit that file. After a clash, survivors still go slow until this is done.
- **Conflicts:** cd6eb27 and 1f7d789 touch `snapshot()`, `fork()` and `restore()`, which is the snapshot engineer's ground. `#clear` is untouched.
- **Files outside those named:** `weapons.js`, `grid.js`, `light.js`, `formation.js` (index reads only); docs GAME, MAGIC, WAR, WILDS, DUNGEONS.
- **Plan:** its default is "rule changes only if the p99 gate fails". Findings 1 and 5 are rule changes made on the owner's say, as the assignment directs.

## 5. Left alone

- **Wild creatures have no cap:** ten of ten wolves come for a player. It is the guards' and soldiers' cap only; the docs now say so. The owner should know.
- **A player's own hero** draws up to 200 ms later for an enemy that is not after it.
- **`#mend`:** healers still search every step, 16–24% of an idle camp's step with one healer in ten. Throttling it is a rule change nobody approved.
- **Knockdowns on bosses** are not shortened; only stuns are.
- **`app/game.js`** says "shrugs off your spell" for a shrugged-off shield bash.
- **`core/might.js`** still counts stuns at full length against bosses.
- **`delete actor.formation.post/facing/refuge`** in `engagement.js` and `host.js`.
- **`#aside`** asks `walkable` eight times per call (finding 2's leftover, in the navigation engineer's `#clear`).