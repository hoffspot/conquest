Both failing tests are fixed in the game, by two separate causes, neither in the crowd figures. All eight crowd browser tests pass on the fixed code. Two commits sit on top of `origin/claude/optimistic-rubin-o1glnc-wip-pr2` (4c34979) on `worktree-agent-a8d7a78d89a3c653b`, not pushed.

Neither of your suspicions held: every figure was made (CI's code is "dev", so the store is off) and nothing threw.

## Cause 1: the guard never in its crowd (9892898)

- **What happened:** the nearest guard was begun in full before the marshal had looked at it with the cut budget, and once built was left in full by `MARSHAL.margin`.
- **Why now:** the paced clocks. The folk's room is now looked at about 0.25 s before the marshal's next look. With the test's budget it stopped dressing the crier, which freed the next in the queue, the nearest guard, at clock 0.4. The marshal looked at 0.6. On main both looked in the same frame, marshal first.
- **Is the game at fault:** yes, though narrowly, and the window was on main too. A soldier brought out between looks, or looked at before the bodies' budget was cut, could be begun in full with no room. A player would see nothing wrong; a phone would hold one body (about 10 MB, a second of building) over its budget, just as the memory guard cut it.
- **Fix:** a soldier about, or a rationed creature, is not begun until its job has looked at it with the present room (`#unlooked`, `#roomSaid`, a check in `#nextEnlistee`). The job is asked to look next frame by setting its clock to 0.

## Cause 2: the field battle never settling (4e6fa8e)

- **What happened:** two of the eighty soldiers (field-8 and field-30) were built in full, put back in their crowd and built again, 21 and 28 times in 120 game-seconds.
- **Why:** `#stature`, which came with `precedence.js`, measured height by the avatar's own body. In its crowd a soldier is as tall as its kind's figure (seed 1); in full, as tall as itself. So its rank changed each time it was built or let go, by more than the margin.
- **Is the game at fault:** yes. A player would see a soldier forever fading between its crowd figure and itself, and the game builds a body every few seconds for nothing.
- **Fix:** `#stature` measures everyone as tall as their kind is, however drawn. Soldiers and folk then rank by nearness, as on main.

## What I ran

- **Evidence:** read `e2e-failures-8` (first run) and `e2e-failures-5` (second run).
- **Reproduction:** headless scripts of each test's opening steps, on 4c34979.
  - Guard: still an `Avatar` after 90 s before the fix; `CrowdAvatar` with its figure made at 3.5 s after.
  - Field battle: never settled in 120 s before; settled at 20 s after, 10 in full and 70 in crowds.
- **The repository's own tests on the fixed code, all eight pass:** field battle, guard in its crowd, soldiers' budget, folk in the streets, townsfolk's crowd, creatures past the budget, bandit past 45 m, the Adaptive crowded fight.
  - This machine needs 70 to 135 s to reach playing, so I lengthened `playing`'s wait and the tests' own timeouts locally, then reverted both files; nothing in `e2e/` is committed.
- **Unit and lint:** `test/precedence.test.js`, `test/clocks.test.js`, `test/manifest.test.js` and `test/contribution.test.js` pass; ESLint is clean on `game.js`.

## Changed outside my own files

- **`client/js/app/game.js`:**
  - `#stature`: one line and its comment.
  - `#soldiersAbout`: split to add `#soldierAbout`.
  - New `#roomSaid` and `#unlooked`.
  - `this.looked`, set in `#marshal` and `#rationing`.
  - The check in `#nextEnlistee`.
- **`docs/GAME.md`:** a bullet under *Soldiers in their crowds*, and the `#stature` bullet under the order of precedence.
- `precedence.js`, `clocks.js` and the tests are untouched.

## For you

- Run `npm run build:manifest` after picking these; I committed no generated files.
- The second CI run also has an `e2e-failures-10` artifact I did not open; I took it to be the bars test the other engineer has.