**Bars fix: report.** One commit on top of the integrated branch (10e4e3c): `aaff58d` "No bar over a body the frame it's put down; the bars' own test stands its slimes clear of one another". Worktree `/home/user/conquest/.claude/worktrees/agent-a02bdecee0be799ca`, branch `worktree-agent-a02bdecee0be799ca`, nothing pushed.

**What the failure really was**
- The four bars in a line do not overlap once the slimes stand. Their boxes are clear: 157 to 167, 183 to 213 and 287 to 327 pixels down the screen.
- The cause is a body's first frame. A body built late in a frame (`#place`, from `#visit`) has no height yet, so its bar was drawn that frame far from its head: 791 pixels down for the nearest slime, 308 the frame after. That misplacement predates my change.
- With my change, a far slime's bar landing under a nearer one's for that frame was hidden as covered, then held hidden for the half-second hold.
- So the test failed only when it looked within half a second of the far slime being drawn. The original test failed one run in two here, with the same error as CI.

**What I changed**
- **Game (`client/js/app/game.js`):** nobody gets a bar on the frame they are put down. `#place` marks the avatar and `#plated` skips it once. A bar now appears one frame later, at its right place.
- **Test (`e2e/pellagos.spec.js`), no assertion changed:**
  - The slimes stand 20 degrees to either side of the line of sight, turn about, at the same 6, 24, 48 and 66 m from the player.
  - The far slime comes up to 4 m beside the nearest, not 1 m. At 1 m the two full bars do overlap by more than half, so that part would have failed for a true reason.
  - One assertion added: each slime's bar is within 10 pixels of its place the frame after, from the first frame it is put anywhere. Before the fix that gap was 483 pixels.
- **Docs (`docs/GAME.md`):** the first-frame rule, and that it is everyone's bar that is hidden, with who never is.

**Item 3, from the code**
- The hiding applies to every bar over a head: `#barsOverHeads` ranks every tracked actor on the player's map. That covers wild creatures, townsfolk, other players, soldiers, fortifications and stakes.
- Never hidden (`always` in `#barsOverHeads`, plus the target check in `Hud.place`):
  - the one the player is set on (the battle's target, the locked one whose bar is lit, or whoever their blow is at);
  - the other players in their party;
  - whoever is attacking them (set on them, or a blow at them under way);
  - anyone in `this.allied`: the player's own hired adventurers and tamed, called or raised creatures, and their party's.
- A dungeon boss's or an elite's over-head bar can be hidden under a nearer one's unless it is the target or an attacker.

**Other browser tests that read a bar** (only `e2e/pellagos.spec.js` has any). None could be broken by a covered bar:
- Target ring test, wolf's power test: the target's bar, never hidden.
- Guard tower, camp stakes, elite, wary wolf's mood and taunt: they read existence, classes or text, which hiding does not change.
- Invasion test: soldiers' bars are attackers' within 60 m.
- The room test counts `.floater` elements, shown or not.

**What I ran**
- The repository's own run still cannot start a game in 90 s on this machine. I used a scratch copy of the specs with only `playing`'s start limit lengthened in a copied `fixtures.js`.
- "the bars over others": 5 runs, 5 passes after the fix.
- My "bars over a file of soldiers" test: 3 of 3.
- For regressions from the first-frame rule: target ring, camp stormed, guard tower and elite tests all pass.
- Unit tests `precedence`, `plate-cover`, `app`: 108 pass. ESLint is clean on both changed code files.

**For the lead**
- Run `npm run build:manifest`: `game.js` changed and I left the generated files uncommitted, as before.
- Side effect to know: a bar appears one frame late after any `#place`, including arrivals through a door.