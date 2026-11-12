The third of three pull requests implementing the performance review (2026-11-11), after hoffspot/conquest#695 (tests and CI) and hoffspot/conquest#696 (the game on the device). This one changes rules and what's sent between games, so `NET_VERSION` goes 223 to 224 and `SNAPSHOT_VERSION` 52 to 53, once, for all of it: every player updates together, and older worlds are carried forward (`SNAPSHOT_STEPS[52]`).

Figures are the engineers' own measurements on a loaded 4-core machine, in the thread's own processor time unless said.

### The owner's rules changes

- **Stuns on bosses** last half as long, and each within 20 s of the last half as long again (as Fear wears thin). Hold recast on a tier-10 boss for two minutes: stunned 99.5% of the time and landing no blow before; 6 to 10% and 42 to 43 blows now. Knockdowns are as they were.
- **The first raid comes at ten minutes,** not five.
- **A follower whose leader is down or on another floor defends itself:** it strikes back at whoever is on it, struck it, or struck its leader down, and otherwise holds.
- **Anyone a player strikes may come for them whatever the cap.** One gap closed: a soldier struck while fighting someone else was still held back by a full cap. The docs say the cap is the guards' and soldiers' (wild creatures have none).
- **A shot gives up** once it has flown one and a half times its reach (a fireball loosed at a galloping rider followed for 38 s and landed 344 m away).
- "An elven convoy", "An orcish convoy".

### The battle

| | Before | After |
| --- | --- | --- |
| Field battle, 100 a side: the battle's part of a step, mean / worst | 2.39 / 12.70 ms | 1.07 / 5.70 ms |
| An idle camp of 400 standing | 9.32 ms a step | 1.58 ms |
| Garbage a step, field battle | 1,086 KB | 352 KB |
| Most ways found in one step, 200 fighting | 186 | 38 |

Searches among those near make no lists; those set on no one look round four times a second, each in a step of its own (players are still noticed at once); every character is made in one shape and nothing is deleted off one; ways are spread over the steps.

### Multiplayer and the servers

| | Before | After |
| --- | --- | --- |
| A guest's download: quiet / walking / fight | 3.6 / 5.4 / 13.4 KB/s | 1.2 / 3.0 / 4.3 KB/s |
| Guests sent the whole world again in a fight | 1 each (246 KB) | 0 |
| Joining the start town | 129 KB | 79 KB of text, about 14 to 15 KB as sent |
| An 8-player world: size / time to read | 604 KB / 24 to 26 ms | 310 KB / 2 ms |
| A character in a snapshot | 2.0 KB | 0.8 KB |
| A world server's steps: how late, median / 90th percentile | 27 to 32 / 53 to 59 ms | 1 / 7 to 12 ms |

- **Copies no longer go astray at a war messenger:** four things a joined copy needs are in the snapshot now, with a test that fails when the host gains a field the rules read and a snapshot doesn't carry.
- The motion check is a checksum every four steps in the ops, not every character's place.
- A world is sent compressed (permessage-deflate on a server's sockets; `CompressionStream` on a direct link).
- A trade's agreeing names the offer agreed to.
- What one guest can make a host do is bounded: commands 30 a second, nothing over 64 KB, "the world again" three in hand then one every 10 s.
- A world server times its steps to when they're due, and lets go of what it's behind by beyond a quarter of a second, not playing it all back to back.

### The host and the world it makes

| | Before | After |
| --- | --- | --- |
| Coming up to a city: the step that musters it | 89 ms, 6 chunks made in it | 8 ms, none |
| An orc capital | 200 ms | 10 ms |
| A dungeon made in its step | 57 ms on the mean | 9 ms |
| 8 players for five minutes on a server: the thread's time | 33.6 s, never settled | 14.5 s, settled in 13 s |

The host says what ground and which dungeons it will soon want (the scaling plan's slice `1-6`), and the game and the server make them a piece at a time before the step that wants them.

### Navigation

- recast-navigation 0.44.0: its tiles and ways are the same to the last bit as 0.43.1's (1,095 tiles, 2,012 ways over three seeds), so no version number moves for it.
- A tile's bake leaves nothing behind (2,584 bytes a bake were kept for good), nor does a mesh.
- A joined copy's tiles, and a building's floors, are baked off the page's thread before the step that wants them (12 tiles in steps over two minutes, the worst 87 ms, became none).

### Characters, second round

- Garments' pictures are painted in the skins' worker: 56 ms a new garment on the page's thread became 0.6 ms, and dressing the start town for the first time 494 frames became 237. The same pixels either way (12 of 12 outfits hashed).
- What's measured at each of a body's vertices is held in columns (5.6 MB to 1.4 MB).

### Not done, and why

- The war's once-a-minute turn spread over steps: it would change checksums, which the scaling plan rules out at this stage.
- A world server keeping the plan between starts, and more than 1,024 navigation tiles kept (Detour refuses).
- The skin atlas's page copy: three callers paint a skin at once and would have to wait on the worker.

### Faults found on the way, fixed here

- **A soldier's bar blinked off for a frame each time its body was built in full in place of its crowd figure** (live since hoffspot/conquest#696: its rule that a body has no bar on the frame it's put down treated the symptom). A body is stood on its ground the frame it's put down now, so its bar is over its head from that frame and the rule is gone. A new browser test hands twelve soldiers over both ways and looks for every bar on every frame.
- **A dungeon the layouts' worker couldn't work out threw there,** which the page takes as the worker's end, letting it go with every settlement it had still to lay out. It answers with none, and the dungeon is made where it's wanted, as it always was.
- Three tests waited by the machine's clock for what takes as long as the machine does (a world compressed and read back; a world's clock run a second; a field battle outlasting its soldiers' rebuilding): each waits for the thing itself now, and asserts what it did.

### For the owner

1. **Everyone updates together.** `NET_VERSION` 224: an older game meeting a newer host, or the reverse, is told to update. Older worlds and saves load (`SNAPSHOT_STEPS[52]`); four old fixtures were checked to load to the same world.
2. **Wild creatures have no cap on how many come for a player** (ten of ten wolves will). The cap was only ever the guards' and soldiers'; the docs say so now.
3. **A guard or a beast notices an enemy who isn't a player up to a fifth of a second later** than before; a player is still noticed in the step they come into sight. A hero draws its weapon up to 200 ms later for an enemy that isn't after it.
4. **An idle player doesn't meet the first raid.** A player who gives no command for ten minutes is marked away just as it comes due; it comes 30 s after they're back. Say if it should come anyway.
5. **A world server lets time go** when it's more than a quarter of a second behind (the scaling plan's figure), where it used to play every step back to back. On a slow or busy server a world's first seconds after it opens can so run slower than real time, while it makes its ground ahead (the Health page's **pace** shows it); how far behind it may stay is one constant, `RUNNER.behind`. Each running world holds about 37 MB more, for the worker that makes ground ahead.
6. **"The world again"** is answered three in hand, then once every 10 s (the owner agreed the limit as built).
7. **Compression wasn't checked in Safari** here; the Soak workflow on this pull request is the cross-engine check.
8. **Arriving players are still dressed at once.** Whether they should join the stepped queue is the owner's to say; it's what dropping the skin atlas's page copy (8 MB) waits on.
9. **Healers still look for the wounded every step** (16 to 24% of an idle camp's step with one healer in ten): making that rarer is a rule change nobody approved.

### Tests

- Lint clean; 3,767 unit tests passed locally on the integrated code, and 3,768 in CI on this head; the motion check played 11,910 with no regressions, here and in CI; a three-minute soak passes with no copy astray.
- CI on this head: every job green on the fourth run but one browser test, which passed when its job was run again (below), and the Soak workflow (two games in other browsers' engines against a host, the cross-engine check of the checksum and the compression) passed every time it ran.
- Nine reference battles hash the same before and after the battle's changes that alter no rule, and on the merged tree.
- The engineers could not run the repository's in-game browser tests locally: this pull request's CI was their first real run. It took four rounds and found six failures: the two faults above, the three waits, and a test whose made-up dungeon theme the worker had never heard of (which is how the second fault was found).
- **One test is known to fail now and then, and is to be fixed in a pull request of its own** (the owner's decision, 2026-11-11, so that this is on `main`): `e2e/pellagos.spec.js`, "the town's guards stand at its ways out under its people's banner ...", where a soldier moved out of view behind the camera is looked for posed every eighth frame and was posed every third, once in four runs. It passed in the three runs before and here when run alone. What's known: the game poses a body that casts a shadow by its size even out of view (`#posing`'s `anywhere: mesh.castShadow`), and whether the soldier the test moves casts one at that moment varies with timing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XUfY7aYkNK4hmgUhgCyVx4
