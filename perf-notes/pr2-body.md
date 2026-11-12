The second of three pull requests implementing the performance review (2026-11-11): the game on the device. It changes no rule of the game and bumps no version number. The first was hoffspot/conquest#695 (tests and CI); the third (the simulation, multiplayer and servers, with the gameplay changes) follows.

Figures are the engineers' own measurements, in Node or headless Chromium on a loaded machine unless said. Headless Chromium has no compressed textures, so a real iPhone will differ: see *For the owner*.

### Memory

| | Before | After |
| --- | --- | --- |
| Start town's own copies on the page (Node) | 24.1 MB | 9.7 MB |
| Page copies of the world, start town at High (Chromium) | 142 MB (95 once the camera has turned) | 57 MB |
| A capital's buildings | 39.9 MB | 20.0 MB |
| 30 signs at Medium, seen from 120 m | 62.4 MB | 1.9 MB |
| A 2048 shadow map's colour | 16 MB | 4 MB |
| 25 bodies seen small: pictures on the graphics card | 100.3 MB | 38.3 MB |
| The character kit on the page | about 99 MB | 38.3 MB (4 MB once let go of) |
| A bought model as read, without pictures (werewolf / Order knights / riders) | 6.6 / 23.8 / 34.5 MB | 2.2 / 10.1 / 15.3 MB |
| A soldier's crowd figure on the graphics card / on the page | 3.91 / 3.70 MB | 1.66 / 0.63 MB |
| An Order rider | 16 skeletons, 484 KB of bones a frame | 1 skeleton, 30 KB |
| Recorded sounds decoded, all of them | 236 MB | 177 MB (a phone keeps 36 MB, not 48) |

- **The world:** merged static meshes, a chunk's ground and its features let go of their page copies once the graphics card has them; signs are painted as finely as they're seen; shadow maps keep a byte a texel of the colour nothing reads; the buildings' corners are shared and their normals bytes; interiors let go of their builders.
- **Characters:** an outfit's picture is made once for two built turn and turn about; a body's pictures are held at 256 a side while it's under 120 pixels tall (never the player's own hero); the kit lets go of its page copies once used.
- **Bought models and crowd figures:** a glTF file's parser is dropped once read; compressed pictures are let go of off the page once sent; on touch screens a model only predicted is fetched, not read; crowd figures keep only the corners their triangles use, packed; a bought model of many parts is posed by one skeleton.
- **The counters are truthful now:** a compressed picture is counted as what it holds (it was counted as four bytes a pixel), and the models' and the character kit's page copies are counted and told in the debug overlay and the crash log.
- **The memory guard** no longer see-saws (it backs off: 32 level changes in ten minutes of a modelled city became 10), reads what's held once every 2 s after the frame, sees the models and the kit, and lets the kit's idle pictures go as it goes up a level. Its marks stay at 400 and 460 MB (*For the owner*).

### Smoothness

| | Before | After |
| --- | --- | --- |
| Steady 30 frames a second (Low Power Mode), 14 soldiers | 6 left in full for good; pixels cut to half | nothing taken away |
| The three "keeping up" judges, a frame | 169 to 202 µs | 4 to 6 µs |
| "Is an enemy close", 173 characters | 0.40 to 0.80 ms a frame | 0.03 to 0.06 ms |
| Minimap's icons gathered | 56 to 70 µs a draw | 3 to 5 µs |
| Posing: garbage a body a frame | 132 KB | 89 KB |
| A crowd figure | 25 s of steps to make | 15 ms read from the browser's storage on later visits |

- **Keeping up** is judged against the frames the browser asks for, and not by frames spent building: the phone's logs showed every slow stretch was building, which fewer pixels can't cure.
- The frame's half-second jobs each have their own time and none begins on a frame that stepped the battle; what follows the battle is looked at as it steps, not every frame; the minute's saves are written after the frame.
- What's newly built is sent to the graphics card in a pass of its own after the frame.
- The HUD's lasting pulses move only opacity and transform (three of five; see *Not done*).

### Loading

| | Before | After |
| --- | --- | --- |
| The game's own code as the site sends it (gzip) | 3.69 MB | 2.14 MB |
| The manifest as sent | 6.39 MB | 5.02 MB |
| The world's plan on the page's thread | 1.5 s every load | none: a worker lays it out, and it's kept between visits |
| Modules preloaded by the page | 0 | 68 |

- The Pages copy alone has its comments and indentation stripped (`scripts/build-site.js`), a source map beside each file; `npm start`, the tests and the Mac app keep the code as written.
- A model the player is waiting for is asked for whole, so the server compresses it.
- With Sound off, nothing is made, downloaded or decoded till it's turned on.
- The loader no longer waits 3 s for a service worker that can't be registered.

### What the owner asked for

- **A long press is half a second everywhere** (the world was 0.4 s, an icon 0.5 s, the minimap 0.55 s), from one module.
- **Low power:** Game options says when the phone is asking for 30 frames a second, and the game takes nothing away for it. No new setting.
- **Bars over heads:** one more than half covered by a bar that comes before it isn't drawn, for everyone (decided 2026-11-11), never the player's target's, their party's, an attacker's or a hired adventurer's. Party icons are as they were.
- **Crowds of players, first stage** (the scaling plan's slice `5-5`): other players' garments are one mesh with one picture, as everyone's but the player's own hero's already were. For the player and seven others the frame's own draws fall from 119 to 70 (41%; the owner counts the 35% there) and the seven's garment pictures on the graphics card from 33 MB to 19 near, 5 far. A gear change shows at once, piece by piece, and is put together after 5 s.
- **One order of precedence** (`client/js/app/precedence.js`) for who's held in full, drawn in full and has their bar: self, party, target, attackers, whoever's fighting the party, whoever the player's talking or trading with, then the biggest on screen. The scaling plan's wording has it now.
- `generated/crowd_rendering_plan.md`: the research, what's built and measured, the owner's decisions, and where it sits in `generated/multiplayer_scaling_plan.md`.

### CI

- **12 browser-test jobs** (14 jobs a run). The ruleset has required `ci` alone since 2026-11-11 (read back), so the number is `ci.yml`'s to change. Not the 18 the review worked out: the browser tests are 234 minutes of work now, not 379, and past 12 a run waits on the unit tests' 22 minutes. Runs on this pull request ended 25 to 26 minutes in (52½ before the first pull request, 36 after it).
- The browser tests were timed again from the first run drawn cheaply.

### Faults found on the way, fixed here

- **A soldier could be begun in full before the marshal had looked at it with the room there was** (on `main` too; the staggered clocks exposed it): a phone held a body over its budget just as the memory guard cut it.
- **A soldier built in full and put back in its crowd for ever** (two of eighty, 21 and 28 times in two minutes): the new order ranked by a body's own height, which differs between its crowd figure and itself. Ranked by its kind's height now.
- **A body's bar was drawn far from its head on its first frame** (791 pixels down the screen, 308 the frame after; on `main` too). No bar the frame a body is put down.
- **A palisade broken open could stand whole for up to 0.6 s** after what stood in for its stakes had gone. The breach asks for the redraw at once.
- A save the browser refuses is said once (it was silent after the first); a crowd doubling no longer deletes and resends its shared buffers; `releaseTexture` lets a compressed picture's levels go; the atlas's promise no longer keeps its painted layers.

Five browser tests were changed: four because what they read moved on purpose (the drawn ground let go of, a waited-for model in one request, the glow on the icon's layer, the bars' layout), one because it counted a crier's spoken words among the bars. None was skipped or loosened; two gained assertions.

### Not done, and why

- **Garments painted in the skins' worker** (the review's F13), with the rest of the kit's fixed data and two posing allocators: written, and in the third pull request, so this one needn't wait on a medium-to-large change.
- **Lighter trees far off:** the generator makes no lighter shape with a matching outline, and "no pop" can't be shown without a device.
- **Buildings' colour and layer as smaller numbers:** their values don't fit (colours above 1, layers to 33,083).
- **Two of the five CSS pulses** (party member, chain): both elements clip their overflow and have no pseudo-element free, so they need another element.
- **The font as WOFF2:** no tool here makes one.
- **three.js r187 and splitting `game.js` and `host.js`:** left for later, as the owner chose. The three shader patches accept r187's code as well as r186's, so a later upgrade can't silently lose reflections.

### For the owner

1. **The memory guard's marks stay at 400 and 460 MB.** Your crash logs put the counted total at 541 to 548 MB when Safari closed the tab. Counted as it is now the same scene reads about the same or a little less (compressed pictures no longer counted fourfold; the kit and models now counted), while what's held and counted nowhere fell much further. **Fresh debug logs from your iPhone once this is live would confirm it**: Options, Debug log, after a city and after the wilds.
2. **Things to look and listen for on the iPhone:** other players' plate at a distance (3.2% of pixels differ from piece by piece at the lower level of detail; you kept it merged); a creature met for the first time in the open may wait up to a second for its model; ambience, mail hits and snake hisses near their new decode cut-offs; a bar now appears one frame after its body.
3. **A dungeon boss's or elite's bar can be hidden under a nearer one** unless it's your target or attacking you. Say if they should always show.
4. **A phone that is truly graphics-bound at a perfectly steady 30** looks like one saving its battery, so the game stops shedding soldiers for it.
5. **Storage:** kept crowd figures can reach about 60 MB of the browser's storage (1.5 MB each, the 40 most recent); the kept plans are a new IndexedDB database, `pellagos-plans`; the site gains about 20 MB of source maps.
6. **Every iPhone is given Low on purpose now**, not by what Safari happens to report of its cores. Whether recent iPhones should try Medium is yours to say.

### Tests

- Lint clean; 3,667 unit tests pass locally; the motion check played 11,910 with no regressions.
- CI on this head: every job green, the browser tests among them, 26 minutes start to end.
- The engineers could not run the repository's in-game browser tests locally (the game takes longer to start on the shared machine than the tests allow): each proved its work with scratch copies given a longer start, and this pull request's CI was their first real run. It found eight failing tests over four rounds: four were tests reading what had moved on purpose, three were the faults above, and one had always raced a town crier's words (it counts the bars by whose they are now).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XUfY7aYkNK4hmgUhgCyVx4
