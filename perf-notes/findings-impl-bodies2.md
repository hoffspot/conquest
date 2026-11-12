BODIES, ROUND 2

Worktree `/home/user/conquest/.claude/worktrees/agent-a87da234a9606675b`, branch `worktree-agent-a87da234a9606675b`, on a51813a, not pushed. Six commits: b8d74b8 (painter split from garments.js), f8b5d79 (typed vertices), 2fd7a26 + d6b12dc (F13; the first is a WIP commit, squash them), 4923df7 + f97b65c (pose garbage). Only the three generated files are uncommitted.

**1. F13: DONE.** The worker paints each garment's picture and an outfit's two (new `garment-painter.js`); `wardrobe.js`'s makings wait on them through one helper (`elsewhere`). Shared makings, taker counts, sizes held, `again`/`tendKit`, idle let-go and `merging` are unchanged. With no worker, a failed worker, a picture it can't paint, or steps that can't wait, the page paints the same code.
- Same pixels: 12 of 12 outfits (four peoples and townsfolk, both sexes) hash the same on the page and in a real worker in headless Chromium; 8 more in `test/garment-worker.test.js`.
- Page thread's own CPU time: new garment 56 ms → 0.6 ms; new outfit of eleven 259 ms → 1.6 ms (back after 0.3 s; 0.6–0.75 s with every garment new).
- Start town dressed for the first time (13 bodies, loaded machine, two runs each):

| | before | after |
|---|---|---|
| frames | 494 / 502 | 237 / 245 |
| page-thread scripts | 12.9 / 12.7 s | 7.5 / 7.9 s |
| garment painting on the page | 4.4 / 4.2 s | 0.57 / 0.62 s |

- Nothing leaked mid-making: no worker jobs, makings or wearers left, in the browser and at every fourth step of a build in the test.
- Not moved off the page: a player's own change of gear and a player arriving mid-game are still dressed at once by `game.js`.
- The worker now holds the texel map and garment pictures (30 s after use); `heldByKit` doesn't count them.

**2a. Atlas page copy: NOT DONE.** Three callers paint a skin at once: an arriving player (`#dress`), a bestiary portrait (`#portray`), and the character maker (`creator.js`). The masks aren't kept, so once the copy is dropped the page can't rebuild it synchronously; a missed path would show a flat-toned body. It needs all three to wait on the worker, for 8 MB at 512.

**2b. Typed reference vertices: DONE.** 5.6 MB → 1.4 MB; copying them to the worker 58 ms → under 1 ms. All 145 picture and mesh hashes are unchanged. Test edits are mechanical (`everyVertex`, `vertexAt`; the wardrobe's exact byte counts now include the measures).

**3. Pose allocators: PARTLY.** `Actions.sample` is done: 15.7 → 0.2 KB a frame for a fighting soldier; iterators 6.2 → 0.3. Six-body trace: 84.4 → 69.9 KB a body-frame. Poses are bit-identical (six-body hashes, plus 4,000 randomised reaches). `Rig.evaluate` is only partly reduced, 20 KB → 12–15 most runs and 25 in one. I tried rewriting the solver in plain numbers; it stayed bit-identical but allocated more on the trace, so I dropped it. The posing test reports this figure without asserting it.

**Outside my named areas**
- `client/js/app/game.js`: new `#giveUpBuilding(id)`, called from `#unenlist` and where `#nextEnlistee` puts one aside, closes an abandoned build's steps. Before, a body dropped while waiting on its skin stayed counted as a wearer and held its outfit's pictures at full size. `#outfitting` now takes steps with `{ wait: this.waits }`.
- Tests: `test/garment-worker.test.js` (new), `test/characters.test.js`, `test/wardrobe.test.js`, `test/posing-garbage.test.js`, and `test/character-building.test.js` (its worker test now waits for the outfit and expects the `measures` message).
- Docs: `docs/CHARACTERS.md`, `docs/GAME.md`.

**Checks:** the seven listed unit files plus garment-worker and wounds ran together, 202 of 203; the one failure was my own reachArm threshold, since removed, and that file passes alone. `npm run check:motion`: no regressions. Lint clean.

**For the lead**
- Regenerate the manifest; two new client modules (`garment-pictures.js`, `garment-painter.js`).
- Run `e2e/together.spec.js` (another player's outfit now waits on the worker) and the body-building e2e; I couldn't run e2e on this machine.
- No version bump needed.
- Owner's call: whether arriving players should join the stepped queue (removes their at-once paint; prerequisite for 2a).

Measurement scripts are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/bodies-impl/`.