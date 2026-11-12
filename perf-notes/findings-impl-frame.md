**Frame loop, judges and HUD: report**

Worktree `/home/user/conquest/.claude/worktrees/agent-a6db1fe329aa0492c`, branch `worktree-agent-a6db1fe329aa0492c`, 13 commits on `84f08e2`. Nothing pushed.

The official Playwright tests could not be run to completion on this machine: the game took 93–166 s to reach "playing" (baseline 104–152 s) against the tests' 90 s. I checked the same steps in headless Chromium with longer waits instead (section 3). The lead or CI must run them.

**1. Items**

1. **DONE, with one deviation** (`5591bee`). New `app/frames.js` (`FrameWindow`, `Beat`); governor, throng and budget use it, judged four times a second against the beat. Frames after more than half a beat of building (`#visit`) aren't judged.
   - Deviation: steps are put back only when the *last* step is reached with nothing bought, not after one step. A single-step undo breaks the throng's existing test (slow above 14 in full, fine at 14 or fewer): 26 is as slow as 30, so it would give up.
   - Addition: the beat is taken only from frames whose own work was no more than half the interval, so a device too slow for 60 is still judged against 60.
2. **DONE** (`5fb0f3f`). `#savingpower` note on the Graphics page, via `app/graphicsnotes.js` `powerNote`. No new setting.
3. **DONE** (`58d6442`). `app/fight.js` `foeNear`, `guardDue`; each answer kept on its avatar for 0.25 s of battle time.
4. **DONE; hook left** (`4dbae14`). Back-off in `guardLevel`; new `MemoryGuard` class with `onLevel` and `letGo`.
5. **DONE** (`2c6b901`, `831e50f`). `app/clocks.js`: each job has its own slot; one due on a stepped frame waits a frame. `#marshal`, `#rationing`, `#shutIn`, `#folkRoom`, `#thronging` are untouched inside; only their call sites in `#update` are wrapped (`#inTurn`). Memory is read once per 2 s after the frame (`memoryLately`).
6. **DONE** (`ab5bd2d`, `8a78bff`). Icon lists kept, near-player gathering, `ResizeObserver`, unchanged draws skipped.
7. **DONE, except `#ailing`** (`dbd614a`). `#ailing` is gated only while no one is ailed; otherwise its bursts would thin. `#threats` and `#clearOfFight` still place per frame, from a kept list (`#afterMe`).
8. **DONE** (`5591bee`). The budget tells 60 at any governor step down or a median interval over 1.2 beats.
9. **DONE** (`a1153e0`). `saveSoon` in `main.js`; `save.js` `hearRefusal` tells the player once per game.
10. **PARTLY** (`3524e43`). Done: `attacker-pulse`, `charge-full`, `rift-throb`. Not done: `member-pulse` and `chain-pulse`. Both elements have `overflow: hidden`, and the slot's two pseudo-elements are taken, so a glow needs another DOM element.
11. **DONE** (`45ccec2`). `HOLD_MS` 500 and `TAP_SLOP` 12 live in `app/press.js`. The maps' and pack's own 8 px drag distances are left as they were.
12. **DONE** (`5fb0f3f`). `#edgesnote`.

Browser test additions: `561d638`.

**2. Measurements (Node unless said)**

| What | Before | After |
|---|---|---|
| Steady 30 fps, 14 crowdable, Low | throng 10 then 6 in full for good; governor to `low@0.5` at 41 s | no change, all three time roundings |
| Three judges, per frame | 169–202 µs; 556 scavenges | 4–6 µs; 8 scavenges |
| `#fighting`, 173 actors | 0.40–0.80 ms/frame | 0.03–0.06 ms/frame, same answers |
| Guard model, city at 15 MB/body | 32 level changes in 10 min, 88 bodies rebuilt; 189 in an hour | 10 and 29; 20 in an hour |
| Minimap icon gathering | 56–70 µs/draw | 3–5 µs/draw |
| Pulses, old vs new stills (Chromium) | – | 0.5–2 of 255 mean difference |

A fight played as frames play it in Chromium: 161 list refreshes in 480 frames, kept list equal to a fresh one, no faults.

**3. Tests**

- Unit: 258 of 258 pass across governor, throng, memoryguard, telemetry, app, frames, graphicsnotes, clocks, fight, press, pulses, pacing, gamepad, manifest, contribution, invasions. ESLint is clean on every changed file.
- New test files: `frames`, `graphicsnotes`, `clocks`, `pulses`.
- Changed because behaviour changed:
  - `governor.test.js` and `throng.test.js`: the "steady slow to the bottom" cases now use a cost that falls per step; steady slow is now asserted as put back.
  - `memoryguard.test.js`: `guardLevel` also returns `wait` and `left`.
  - `telemetry.test.js`: trend entries carry `guard`.
- Playwright `e2e/pellagos.spec.js:837`: 5 attempts, all timed out at the 90 s "playing" wait.
- Checked by hand in Chromium:
  - wheel opens between 362 and 533 ms;
  - minimap hold opens the world map between 407 and 634 ms; a 150 ms tap does not;
  - both Graphics notes show the right text;
  - the adapt path steps `high@0.85` then `medium@1`.

**4. For the lead**

- Regenerate `manifest.js`, `assets.js` and the import map; none are committed. `client/index.html` has one hand hunk: two `<p>` elements after `#adapted`.
- Hook: `game.js`, the `letGo` callback of `new MemoryGuard(...)`, marked `HOOK`. Add `letGoOfIdle(kit)` there.
- Files outside my list: `pack.js` and `worldmap.js` (import `HOLD_MS`), `telemetry.js` (trend `guard`), `docs/WAR.md`, and new `frames.js`, `clocks.js`, `graphicsnotes.js`.
- Likely conflicts: `game.js` `#update` call sites and the constructor; `docs/GAME.md`.
- Run the browser tests at lines 837, 3257, 10394, 10605, 15146, 15418, 15662, plus 18149 and 18385 (bodies, throng).
- No version bumps, no contribution.md change.

**5. Risks left alone**

- A device GPU-bound at a perfectly steady 30 with light main-thread work looks like a battery-saving phone after 10 s; the throng then stops shedding bodies for it.
- Switching Low Power Mode on mid-game still costs a few steps for up to 10 s before they are put back.
- By-hand play (`advance`) keeps the lists fresh every frame, but the half-second jobs' second pass now lands 0.1–0.6 s after the first (was 0.5 s); a test timed to that could shift.
- `#riftchip.urgent` still animates `box-shadow`.
- `device.js:43` stale comment is untouched.
