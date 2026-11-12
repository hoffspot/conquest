The tavern door test's second "plate" was not a bar: it was the town crier's speech bubble. The game is right; the test counted the wrong thing, and I fixed the test without loosening it. One other test in the verification batch fails on this machine only (the folk in the streets); details below.

**Cause**
- The test counted every `.floater` in the page as `plates`. Words said over a head are floaters too (`hud.js` `say` makes `div.floater.said`), kept for a few seconds of real time (`performance.now`).
- The crier (`crier:human-town-6`) calls out at game clock 25.9, as the player reaches the tavern door, and his words last 7 real seconds.
- So the test has always raced that bubble's expiry. The crier calls at the same moment on the game before these commits (10e4e3c's `game.js`).
- 519d2d3 (my gate) is the commit that tipped it: guards out of reach now go to their crowds as they come out and are not built in full first, so that stretch runs quicker. Here it took 12.6 s from his call to the count, against 18.6 s before; CI got there within the 7 s.
- No one has a bar who shouldn't, and no one is built who shouldn't be while the player is indoors. A player sees nothing wrong: the bubble is hidden with the crier out of sight.
- I reproduced CI's failure exactly by making bubbles last four times as long: floaters `["floater plate hostile:orc", "floater said:crier:human-town-6"]`, `plates` 2.

**Commit**
d7b2cde, "The tavern door test counts the bars over heads, not a crier's words with them", on `worktree-agent-a8d7a78d89a3c653b`, on top of a51813a. It touches `e2e/pellagos.spec.js` only; not pushed.
- `plates` is now the ids of `.floater.plate`, and must be exactly `["orc"]`. That is stricter than a count of 1: it says whose bar it is.
- A new assertion says every other floater must be a crier's words, so nothing else may float over anyone.
- With the bubble forced to last to the count, the old test found 2 and the new one passes with `PLATES ["orc"]`, `SAID ["said crier:human-town-6"]`.

**What I ran**
On d7b2cde, one worker, with local uncommitted longer waits (since reverted): the door test, the eight crowd tests and the two bars tests.

| Test (`e2e/pellagos.spec.js` line) | Result |
|---|---|
| 5319 tavern door | passed |
| 6225 townsfolk's crowd | passed |
| 18089 field battle | passed |
| 18253 soldiers' budget | passed |
| 18360 bars over a file of soldiers | passed |
| 18563 guard in its crowd | passed |
| 18695 Adaptive crowded fight | passed |
| 18843 bandit past 45 m | passed |
| 19408 creatures past the budget | passed |
| 5119 bars over others | timed out at the default 180 s in the batch (load about 37); passed alone with more time |
| 6117 folk out in the streets | failed, in the batch and alone |

**The folk test (6117) fails here on machine speed, not on this head's code**
- It fails only its last assertion: folk dressed again within 80 frames of leaving the smithy, expected at least 9, got 6 to 8 across five runs at load 11 to 37.
- Dressing is budgeted in real time (`VISITS.budget`, 6 ms a frame), but the test counts frames. Frame by frame here, every dressing frame took 25 to 180 ms (idle frames 4 to 16 ms), so one step a frame is all that fits.
- In those 80 frames the crier took 7, one guard built in full took 20, and each townsperson 4 to 9. All 10 were back by frame 88 to 100.
- The gate costs nothing: the crier is being dressed on frame 0 and the queue never waits.
- The same test on `game.js` from 0c5cf5f (before dcf5a02) at the same load gave 6 at frame 80. That file passed this test here earlier, when the machine was calmer.
- On CI, the only failing job in run 43120360010 on a51813a was "e2e (2 of 12)", where you reported only the door test failing.
- I left the test alone. It is a standing risk on a slow runner, because it counts frames against a real-millisecond budget; you may want it to wait for the folk with a bound instead.

**State**
The worktree is clean at d7b2cde: test edits reverted, generated manifest files restored and not committed, my server on port 8155 stopped. GitHub was only read (the run's job list).