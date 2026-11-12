**Crowds: report.** Worktree `/home/user/conquest/.claude/worktrees/agent-a02bdecee0be799ca`, branch `worktree-agent-a02bdecee0be799ca`, on the characters branch (384200e, fast-forward; B1 is fixed there). Four commits, nothing pushed. Generated files are uncommitted on purpose.

**1. Items**
- **A, DONE, `7026a64`** (the plan's `5-5`). Other players' garments are one mesh with one picture. A gear change shows at once, one by one, and is put together in steps after 5 s; a second change starts over and lets go of what was half made. Ways back: `Game.drawApart(id)` (the per-avatar flag) and `OUTFITTING.others`.
  - One departure: a player joining mid-game is dressed in one frame, so they start one by one and are merged from the next frame.
- **B, DONE, `e4bf8a5`.** `client/js/app/precedence.js` replaces the three `fighting` copies, `kept` and the four sorts. Its comment names `5-2`, `5-4`, `5-6`.
- **C, DONE, `ada5174`.** Bars are placed in that order; one more than half covered is hidden. The target's, the party's and attackers' never are. Soldiers' bars only within 60 m. Party icons untouched.
- **D, DONE, `f4e251c`.** `generated/crowd_rendering_plan.md`, a companion to the scaling plan. There is no index of `generated/`; it is linked from docs/GAME.md.

**2. Measured** (headless Chromium, software; the player and seven others in mixed gear)

| | One by one | All at once |
|---|---|---|
| The seven's meshes (skinned) | 105 (79) | 56 (30) |
| Frame's own draws, 8 heroes | 119 | 70 (41% fewer) |
| With shadow-map draws, near / far | 166 / 207 | 117 / 158 (30% / 24% fewer) |
| Garment pictures on the card, near / far | 33.3 / 33.3 MB | 18.7 / 4.7 MB |
| Held on the page by the seven | 45.8 MB | 34.8 near, 23.9 far |

- **`5-5`'s 35%:** met in the frame's own pass, not with shadow draws counted.
- **`5-5`'s 2%** (share of a figure's pixels changed by more than 48 of 255, docs/CHARACTERS.md):
  - In full detail: 0.00 to 0.21% for all seven outfits.
  - At the quarter level (under 360 px): 0.2 to 1.0% for four, 2.0% and 2.4% for the humans' and elves' uniforms, 3.2% for plate. An outfit is simplified as one mesh there.
- **Memory:** with the seven near, the whole card held the same either way (282.1 against 281.9 MB). A garment's picture is shared; an outfit's is not.
- Pictures and logs are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/crowd/` (`out3/`, `run2.log`, `run3.log`, `bytes.log`).

**3. Tests**
- **Unit, all pass:** new `outfit-merging` (11), `precedence` (16), `plate-cover` (9); also `throng`, `app`, `character-building`, `wardrobe`, `crowd`, `folkcrowd`, `wounds`. ESLint is clean on every file changed.
- **`npm run check:motion`:** 11,910 played, no regressions.
- **Browser:** the repository's own run could not start a game in its 90 s (failed twice at "Not playing"). I ran scratch copies whose only change was a longer start limit.
  - New: the bars test (`e2e/pellagos.spec.js`) and the two-page outfit test (`e2e/together.spec.js`) pass.
  - Existing: the soldiers' budget test and the trade test pass. The party test hit its own 11-minute limit once, then passed alone in 9.7.
- No existing test was changed.

**4. For the lead**
- Run `npm run build:manifest`; time the two new browser tests after CI (`npm run e2e:durations`).
- No version bumps; contribution.md needs nothing.
- Files outside my named lines: `characters/wardrobe.js`. `shared` now counts who is taking a making's steps and drops one its last taker closes. `readyingOutfit` and `outfitReady` are new, and `leaveGarments` takes ids.
- Expect conflicts in `game.js` `#update` (two one-line edits) and docs/GAME.md.
- Scaling plan, change log row: `| 3 | 11 November 2026 | Slice 5-5 built: draw calls for 8 heroes fell 41% in the frame's own pass (24 to 30% with shadow maps); picture difference at most 0.21% in full, up to 3.2% (plate) at the quarter level. The full-tier order is client/js/app/precedence.js, for 5-2, 5-4 and 5-6. DOM plates are culled on overlap ahead of 5-3. See crowd_rendering_plan.md |`
- Slice `5-5`'s row, append: `**Built** (app/game.js #outfitting; flag: Game.drawApart). 41% in the frame's own pass; picture within 0.21% in full.`

**5. Left alone**
- Another player's shadow draws (about 6 a hero near, 11 far) are why 35% is missed with shadows counted.
- The first step of compositing any outfit is one long step (60 to 700 ms on this loaded machine); it predates this work.
- A soldier healed to full loses its bar for that frame; existing behaviour.
- Invisibility has no browser test. The re-apply after a gear change or merge is by code reading only.
- There is no hidden-helmet option and no dye system for players; nothing to test there.

**6. For the owner**
1. Is 3.2% on plate at the quarter level within what `5-5` means by 2%, or should plate stay one by one?
2. Is the 35% counted with shadow draws?
3. The order puts "whoever's fighting my party" between attackers and whoever I'm talking with; the plan's wording omits it. Keep?
4. Bars hide at more than half covered, and hired adventurers' bars are never hidden. Right?
5. Will there be friends or guilds for the order to know of?