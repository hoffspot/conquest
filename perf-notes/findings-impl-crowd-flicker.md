**Bar flicker on the third pull request: report.** One commit on top of dd02610: `47a5f3e` "A body's stood on its ground the frame it's put down, so its bar's over its head from that frame, and never passed over". Worktree `/home/user/conquest/.claude/worktrees/agent-a02bdecee0be799ca`, branch `worktree-agent-a02bdecee0be799ca`, nothing pushed.

**Cause: a fault in the game, and mine**
- A soldier's bar blinked off for one frame each time its body was built in full in place of its crowd figure. That is what a player saw.
- Watched frame by frame, on the frame the avatar changes from `CrowdAvatar` to `Avatar` the game told the hud nothing for that bar. `#place` puts the new body down, and my rule from the last fix ("no bar over a body the frame it's put down") skipped it.
- It reproduced here about one run in four or five on the third pull request's head.
- Probably why it never showed on the second pull request's runs: this pull request moved when bodies get built (garments painted in the worker), so a hand-over now falls inside the test's three seconds. I did not confirm that.
- The same blink has been in the merged game since the second pull request; this commit removes it there too.

**The fix, at the right end this time**
- The real fault was that a body put down late in a frame had no height until the frame after. That covers one drawn that frame from `#visit`, one built in full in its figure's place, and one come through a door.
- `#place` now stands the body on its ground at once (`#standsAt`, as `#updateBody` does a frame later). The skip rule is removed from `#plated`.
- Seen frame by frame: each slime's bar is at its place from its first frame (308, 194 and 153 pixels down the screen; the first was at 791 for a frame before any fix), and none is hidden.
- Side effect to know: every body put down is at ground height one frame earlier than before.

**Tests**
- No existing assertion changed. One comment in "the bars over others" reworded to match.
- New test in `e2e/pellagos.spec.js`: "a soldier's bar stays over it, shown on every frame, as its body's let go to its kind's crowd and as it's built in full again in the figure's place".
  - Twelve soldiers in two ranks with bars clear of one another; room in full is cut to two, then given back.
  - It asserts five or more go each way and that every bar is shown on every frame.
  - Against the game before the fix it failed on the first hand-over's frame, in the one run I made ("field-0: no bar shown at 13.034"). On the fix it passes in about 50 s.
- `docs/GAME.md` updated: the bars passage and the test list.

**What I ran on the fix** (the machine was quiet, so the last three used the repository's own configuration and its 90 s start):
- "bars over a file of soldiers": 8 of 8 from a watching scratch copy, then 5 more of 5.
- "the bars over others": 5 of 5.
- The new hand-over test: 6 of 6.
- Tavern door test and the camp's stakes test: pass.
- For the earlier ground height, five tests of bodies put down other ways all pass: the moon roads, the adventurer hired from their drink, the hired adventurer knocked down, the dungeon gone into, and the horse in `e2e/riding.spec.js`.
- Unit tests `precedence`, `plate-cover`, `app`, `throng`: 117 pass. ESLint is clean on `game.js` and the spec.

**For the lead**
- Run `npm run build:manifest`: `game.js` changed and I left the generated files uncommitted, as before.
- The new browser test is untimed in `e2e/durations.json`.