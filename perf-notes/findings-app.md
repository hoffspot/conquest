# Pellagos performance review: the app shell and the frame loop (area: app)

**The findings file could not be written.** The harness refused the Write of `findings-app.md` ("subagents should return findings as text, not write report files"), and I did not work round it. The full findings are below instead; save them to `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-app.md` if you want the file. The summary (under 400 words) is at the end.

Reviewed: `client/js/app/game.js`, `client/js/main.js`, the other 74 files of `client/js/app/`, `client/index.html`, `client/styles.css`, and `docs/GAME.md` (*Performance*, *Keeping up*, *The memory guard*, *The debug log*). No browser was run. Everything marked MEASURED was run in Node 22 on this machine (4 shared cores, noisy; three runs given where a time decides anything). The scripts are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/app/`. The worlds measured are real ones (`buildWorld({ seed: 3 })`, a `Host`, a field battle and an invasion, as `scripts/snapshot-fixture.js` makes them). Garbage figures are V8's, counted from what each scavenge freed (`--trace-gc`); Safari doesn't box numbers, so its figures will be lower where I say so.

**Overall.** The frame loop is in better shape than its size suggests. At peace the app's own per-frame work is small: the passes over everyone that I could replay cost about 0.05 ms together with 49 actors. What is worth doing is in four places:
- the three judges of the frame rate (governor, throng, budget), which cost too much every frame and misjudge a browser that asks for only 30 frames a second;
- one quadratic check in the pass over everyone, which only shows in battles;
- the memory guard, which can undo its own work every half minute;
- ten jobs that all land in the same frame.

---

## 1. Findings (ranked)

### 1. Judge "too slow" against the frames the browser asks for, not against 60

- **Where:** `client/js/app/throng.js:25` (`slow: 48`), `:83`, `:96-99`; `client/js/app/governor.js:23-24` (`floor: 30`, `target: 60`), `:133`, `:143-149`; driven from `client/js/app/game.js:3672-3685`. `client/js/app/pacing.js:23-31` already knows the screen's beat (`Pacing.refresh`), and neither judge is given it.
- **Now:** both judge the median frame interval against fixed rates. A browser that only asks for 30 frames a second looks "slow" for ever, however easily the device keeps up. Safari on an iPhone in Low Power Mode halves `requestAnimationFrame`; so do Chrome's Energy Saver and a 30 Hz screen.
- **MEASURED on the real classes** (`lowpower.mjs`), fed a steady 30 a second:
  - The throng, with 14 crowdable about, goes 14 → 10 at 1.4 s → 6 at 4.3 s and stays at 6. It needs 54 a second to put any back.
  - The governor's floor *is* 30, so it sits on a knife edge. With times rounded to the millisecond (as Safari gives them) the median is 33 ms and nothing happens. With exact times it steps to `low@0.85` at 11 s, `0.7` at 17.7 s, `0.6` at 34 s and `0.5` at 41 s, and can never climb back (it needs 18.5 ms).
- **Cost, to whom:** an iPhone player in Low Power Mode has every crowded fight (more than 10 hired adventurers, goblins, bandits or wolves within 160 m) drawn with only 6 bodies in full and the rest as crowd figures, for no gain: the frame rate cannot rise. On a 30 Hz-capped desktop browser the picture can ratchet down to Low at half the pixels. Both make the game look plainer, which the owner asked not to trade away.
- **Change:**
  - (a) Let a step that bought nothing be undone. If the median interval after a step down (governor) or after more went into crowds (throng) is within about 5% of what it was, put it back and hold there until the beat changes.
  - (b) Judge against the beat seen, not 60: "slow" is `typical > max(1000/slow, beat × 1.3)`, "time to spare" is `typical <= max(1000/(target × fast), beat × 1.1)`. Take `beat` as the shortest interval over the last 10 s or so, longer than `Pacing`'s 30 askings, so a device really missing every other frame still shows its true 16.7 ms now and then.
- **Gain:** correctness, not milliseconds: full bodies and full quality kept on capped browsers.
- **Effort:** S (two pure classes with unit tests: `test/throng.test.js`, `test/governor.test.js`).
- **Risk:** a device truly GPU-bound at a steady 30 must still be helped; rule (a) keeps that, since drawing less does shorten its frames. No simulation change. Nothing a player sees except that less is taken away.
- **Confidence:** MEASURED for what the classes do at 30 a second. That iOS Low Power Mode caps `requestAnimationFrame` at 30 is WebKit's long-standing behaviour, not checked here on a device.
- **Verify:** unit tests feeding 30 a second (as `lowpower.mjs`). On an iPhone with Low Power Mode on, stand by a goblin camp with the debug overlay up: "in full" should stay "all".

### 2. Don't ask "is anyone near enough to fight?" of everyone, for everyone, every frame

- **Where:** `client/js/app/game.js:4084`, in the pass over everyone (`:4018`), calls `#fighting` (`:4454-4468`). Its last line is `this.battle.actors.some(...)` with `Math.hypot`, `battle.hostile` and `battle.canSee` (`:4467`).
- **Now:** for every armed, living character in sight that hasn't struck in the last 2.5 s, every frame, all actors are scanned to decide whether it stands on guard. That is actors × actors.
- **Cost:** MEASURED (`fighting.mjs`, the code copied as written, a real battle; ms a frame, three runs):

  | Battle | Actors (armed in sight / scanning) | As written | Distance squared, plain loop |
  |---|---|---|---|
  | A phone's invasion (field battle 4 a side + invasion), +30 s | 173 (75 / 50) | 1.22 / 0.95 / 0.82 | 0.53 / 0.38 / 0.34 |
  | The same, +45 s | 170 (76 / 47) | 0.57 / 0.47 / 0.62 | 0.44 / 0.38 / 0.29 |
  | 200 a side + invasion (a computer's size), +30 s | 359 (163 / 93) | 4.44 / 3.57 / 4.33 | 1.09 / 1.45 / 1.41 |
  | The same, +45 s | 303 (173 / 124) | 5.70 / 4.07 / 4.31 | 2.04 / 1.96 / 2.89 |

  At peace it is nothing (the folk are `neutral` and return at once). So it is paid exactly when frames are scarcest: 3 to 7% of a 16.7 ms frame in a phone-sized battle, a fifth to a third of one at 360. The answer can only change when the battle steps (20 times a second), yet it is asked 60 times.
- **Change:** keep each one's answer on its avatar with the time it was worked out, and work it out again only every 0.25 s or so, staggered by id. In the scan, compare squared distances and test map and distance before `hostile`. Either alone helps; together the cost is roughly the table's right column ÷ 15.
- **Gain:** about 0.5 to 1.2 ms a frame in a phone's invasion and 3.6 to 5.7 ms in the largest (measured, as written); estimated under 0.1 ms and 0.3 ms after.
- **Effort:** S.
- **Risk:** none to the simulation (drawing only). A guard pose taken up to 0.25 s later; `setGuard` eases anyway.
- **Confidence:** MEASURED (Node, V8). The phone's figure will differ; the growth won't.
- **Verify:** `fieldBattle(100)` from the debug overlay; the debug log's `bodies` phase before and after; the pose still taken as lines close.

### 3. The governor, the throng and the invasion budget: keep the window in typed rings and look at it a few times a second

- **Where:** `client/js/app/governor.js:33-37`, `:119-130`; `client/js/app/throng.js:35`, `:68-79`; `client/js/app/budget.js:17-21`, `:49-59`; called every frame from `client/js/app/game.js:3673`, `:3679`, `:3694`.
- **Now:** each pushes a `{ now, interval }` object a frame. Once its window is full it maps the window to a new array, copies it, and sorts the copy with a comparator: 180 numbers (3 s), 90 (1.5 s) and 600 (10 s), every frame. The median is used for a decision a few times a minute at most. The throng does it even with nothing crowdable about, when no outcome is possible (`throng.js:83`, `:99`).
- **Cost:** MEASURED (`window.mjs`, `icons2.mjs`; three runs): 157 to 219 µs a frame and about 149 KB of garbage a frame for the three together (governor 31 KB, throng 15 KB, budget 94 KB). That is about 8.9 MB a second at 60 frames, the largest steady source of garbage I found in the app, and around a tenth of the docs' 1.3 ms median frame.
  - The docs' frame timings were taken under automation, where Adaptive is off (`main.js:6449`). The governor's and the throng's share isn't in them; the budget's is.
  - In Safari expect roughly the arrays alone: about 25 KB a frame, 1.5 MB a second (reasoned, not measured).
- **Change:** one small shared class: two typed rings (times, values) and a scratch `Float32Array`. Find the median by copying the window into the scratch and calling its own `sort()` (no comparator, nothing allocated). Look every 250 ms, and not at all when nothing can come of it. A prototype is in `window.mjs`: the same median in 715 of 715 looks.
- **Gain:** MEASURED on the prototype: 3.5 to 16 µs a frame and no garbage when looked at 4 times a second; 71 to 80 µs and no garbage if the median is still wanted every frame.
- **Effort:** S. Do it with finding 1: the same three files.
- **Risk:** decisions come up to 250 ms later; unit tests that count frames to a decision may need their numbers moved. No simulation change.
- **Confidence:** MEASURED.
- **Verify:** `node --trace-gc` on the classes as in `icons2.mjs`; in the browser, an allocation timeline over 10 s standing still.

### 4. The memory guard can undo its own work every half minute: make it back off as the governor does

- **Where:** `client/js/app/memoryguard.js:27-34`, `:42-54` (`ease: 40`, `hold: 30`); `client/js/app/game.js:5520-5548`, `:5510-5512`.
- **Now:** past 400 MB it holds 20 bodies in full and 24 MB of sound. It comes back down once what it holds is 40 MB under the mark and 30 s have passed. But its own action usually saves more than 40 MB: the sound alone goes from 82 MB to 24 (58 MB), and each body is 10 to 15 MB as it counts them. So "40 under the mark" is reached *because* it is guarding. It lets go, the bodies are built again and the sound decoded again, the mark is passed, and it guards again. The governor and the throng both double their wait after a step that failed (`governor.js:136-137`, `throng.js:87-88`); the guard has no such memory.
- **Cost:** MEASURED on the real `guardLevel` with a stated model (`guard.mjs`: bodies let go at once and built again one every 1.5 s; sound cut at once and regrown 1 MB/s):

  | Place (held unguarded) | Changes of level in 10 min | Bodies built again |
  |---|---|---|
  | City of the 2026-11-11 report, 30 about, 8 to 12 MB a body (541 MB) | 2 (settles at level 1) | 8 |
  | The same at 15 MB a body | 32 (a cycle every 38 s) | 88 |
  | A town, 22 about, 410 MB | 16 (every 78 s) | 16 |
  | A village, 18 about, 405 MB (the sound's saving alone) | 15 (every 84 s) | 0 |

  Each cycle rebuilds bodies, sends their pictures again and decodes sound again on the device shortest of everything, and takes the page back up to the mark it was guarding against.
- **Change:** in `guardLevel`'s state, keep what was held just before each rise. Come down a level only when what is held now *plus what that level saved* is under the mark by the margin. Simpler alternative: double `hold` each time a level is come back to within a minute or two of leaving it (30 s, 60, 120 …), forgotten after ten quiet minutes.
- **Gain:** the periodic rebuild and its hitches gone where it happens; the page kept further from the mark.
- **Effort:** S (pure function, `test/memoryguard.test.js`).
- **Risk:** a phone stays at "holding less" longer after a busy place is left. The back-off must forget, or a long session never gets its bodies back.
- **Confidence:** the arithmetic is MEASURED on the real function. Whether real places fall in the bands is SUSPECTED: my body and sound figures come from the crash reports quoted in the code.
- **Verify:** on an iPhone, stand five minutes in a city square and read the debug log's notes: `trend[].soundMB` and `avatars` saw-toothing with a 40 to 90 s period is this. Add `guard` to the trend entries (`telemetry.js:527`) so it can be read directly.

### 5. Spread the half-second jobs, keep them off the frames that step the battle, and read the memory once, after the frame

- **Where:** ten clocks all start at 0 and are all reset to 0.5 by the same arithmetic, so they fire in the same frame for ever:
  - `game.js:3984-3998` (forts, stockades, burnt, thread camps), `:4717-4721` (marshal), `:17694-17695` (boss), `:5050-5054` (rationing), `:5159-5163` (shut in), `:5234-5238` (folk room), `:5558-5562` (thronging), `:9774-9780` (what's heard), `:4226-4231` (criers), `:18926-18932` (sizing up).
  - Every 2 s as well: `:5374-5375` (models) and, on touch screens, the memory guard's `memoryNow()` in the frame (`:5533`), which walks every body (`:1920`, `world/release.js:81-124`). The debug log's notes call `memoryNow()` again a moment later (`:1542`, via `telemetry.js:541-556`).
- **Now:** one frame in 30 carries all ten jobs, each filtering, mapping and sorting over the actors (`#marshal` alone makes about ten passes over the soldiers about, `:4730-4744`). One frame in 120 on a phone also carries the walk over every body. One frame in three already carries a step of the battle (the code's own figure: "some 2 ms on a desktop and 10 on a phone" with a fight in it, `core/netplay.js:125`).
- **Cost:** not the average, the worst frames: a regular bump every half second and a bigger one every two, landing on a step a third of the time.
  - MEASURED on stand-in bodies (`held.mjs`: 80 nodes, 9 meshes each; three runs): the walk takes 1.0 to 1.6 ms for 30 bodies, 2.7 to 3.7 ms for 60, 5.3 to 9.1 ms for 100.
  - The walk allocates two arrays for every node, bones included (`release.js:111`). In my stand-ins 70 of each body's 80 nodes are bones; the real proportion is for the lead to count.
- **Change:**
  - (a) Give each clock its own first delay (0, 0.05, 0.1 …) so no two share a frame.
  - (b) Let the frame know whether it stepped (`#tick` already returns `steps`, `:3640`): a job due on a stepping frame waits for the next one.
  - (c) Take one reading of the memory every 2 s in the task after the frame that the notes already use (`aliveSoon`), and give it to both the guard and the notes.
  - (d) In `heldOnPage`, return early for a node with no geometry, material or skeleton before making any array.
- **Gain:** the tallest regular frame lowered by nine of the ten jobs; 1 to 9 ms taken out of a frame every 2 s on phones (measured on stand-ins), and one walk instead of two.
- **Effort:** S.
- **Risk:** the guard acts one task later (under 20 ms). None to the simulation.
- **Confidence:** READ for the coincidence (the arithmetic is identical, so the clocks cannot drift apart). MEASURED on stand-ins for the walk. The jobs' own cost in a battle is not measured (needs the browser).
- **Verify:** the debug log's `setup` phase, frame by frame, over two seconds in a battle: the spike every 30th frame flattens.

### 6. The minimap: gather what it shows only when that changes, and draw only when the picture would differ

- **Where:** `client/js/app/game.js:6206-6266` (30 times a second: `minimap.js:191`, `:490-492`); the icon lists `:6769-6785` (`worksIcons`), `:6794-6808` (`fortIcons`), `:7070-7075` (`dungeonIcons`' loop), `:6910-6924`; the three filters over everyone `:6236-6246`; `client/js/app/minimap.js:516-517` (`clientWidth`, `clientHeight`), `:543`.
- **Now:** every draw:
  - makes afresh an object and a sentence for each of the world's works and forts (36 and 60 in the world measured, three hours into its war) and a new sentence for each of its 53 dungeons, though the minimap shows 128 m and nearly none are in it;
  - filters everyone three times and makes an object for each;
  - asks the browser for the canvas's size, a layout read after the frame's HUD writes;
  - resamples the painted patch at "high" quality.

  Standing still, that is 30 identical pictures a second.
- **Cost:** MEASURED (`icons.mjs`, `icons2.mjs`, `tail.mjs`): the icon lists 30 to 90 µs and 44.5 KB of garbage a draw (1.3 MB/s); the three filters 44 to 68 µs and 56 KB a draw at 173 actors (1.7 MB/s in a battle). Together about 3 MB/s of garbage in a battle, second only to finding 3.
- **Change:**
  - Keep the works', forts' and dungeons' icons until the war's turn or the count changes, as `placeIcons` and `denIcons` already do (`:7090-7107`, `:6947-6949`), and pass the minimap only those within its span.
  - Keep the canvas's size from a `ResizeObserver`, the recipe `View.toScreen` already uses (`world/view.js:1869-1871`).
  - Skip the draw when the player, the camera's bearing and the dots have moved less than a device pixel since the last, with a slow tick (4 a second) for pings and fades.
- **Gain:** about 0.1 to 0.15 ms and 100 KB of garbage saved per draw avoided (measured parts); most draws avoided while standing or talking.
- **Effort:** S to M.
- **Risk:** a stale icon if a cache's key misses a change (a works taken mid-turn): key on the host's events as well as the turn.
- **Confidence:** MEASURED for the gathering; the canvas's own cost SUSPECTED (needs the browser).
- **Verify:** allocation timeline standing still in a town; the minimap still follows a turn of the camera at once.

### 7. Refresh what follows the battle when the battle steps, not every frame

- **Where:** all in `client/js/app/game.js`, every frame: `#allying` `:4552-4565`; `#threats` `:7904-7940`; `#attackers` `:7949-7992` → `hud.js:1022-1089`; `#foe` `:8511-8532`; `#partyIcons` `:11560-11623` (with `host.partyOf`, `core/host.js:15383-15392`); `#quickActions` `:18860-18906` → `quickbar.js:82-108`, `:395-408`; `#ailing` `:16311-16376`; the bars wanted `:4365-4378` and placed `:4391-4403`; `#clearOfFight` `:8172-8194`; `#lightGlobes` `:2062-2076`; `#wildWays` `:13325-13422`; `inFight` `:4214`; `#underAttack` `:18854`.
- **Now:** about fifteen full passes over the actors a frame, plus two over the avatars and three more at 30 a second for the minimap. Most build new arrays, Sets and objects, to refresh lists that can only change 20 times a second.
- **Cost:** MEASURED for ten of them replayed together (`world2.mjs`): 0.06 to 0.16 ms a frame at 173 actors, 0.03 to 0.05 at 49. Small beside finding 2, but two thirds wasted, and the source of the frame's long tail of small garbage.
- **Three details inside it:**
  - The bar of every hostile soldier drawn is tracked wherever it is (`:4370-4374`) and projected to the screen every frame (`:4395-4401`, `view.js:1862-1876`: a clone and an object each), though `plateScale` hides it past 60 m (`hud.js:170-179`). Test the distance first.
  - `hud.setStamina` is called for everyone in sight (`:4137`) and looks its bar up in the page each time (`querySelector`, `dataset`: `hud.js:1675-1680`). `fillSlot` does the same for each Action Bar slot (`quickbar.js:86`, `:97`, `:103`: a regular expression and a sentence a slot a frame). Keep the elements and what they last showed on the JavaScript side, as `plate.dim`, `plate.faint` and `plate.layer` already are (`hud.js:844-861`).
  - `hud.keepClear` reads six boxes from the page (`hud.js:977-985`) straight after `hud.attackers` and `hud.threats` have written to it, every frame a message is up in a fight. This is the write-then-read the docs describe curing for the bars. Measure the fixed boxes only when what decides them changes, as `#partyFit` does (`hud.js:1231-1253`).
  - `#foe` calls `hostile` on everyone *before* the cheap tests, then sorts: reorder the tests.
- **Change:** split `#update` in two. What moves (bodies, camera, bars' places, effects) runs every frame. What follows the rules (the lists above) runs on the frame *after* one that stepped, or when a command of the player's was sent that frame, so a tap still answers at once.
- **Gain:** about 0.05 to 0.1 ms a frame on average at 173 actors (measured parts × 2/3), the small garbage cut by about as much, one forced layout a frame gone in fights, and the stepping frames lighter.
- **Effort:** M (it touches the order of a long method; the pieces are already separate methods).
- **Risk:** something read by a later phase in the same frame (`this.allied`, `this.alliesNear`, `enemyRing`) is a frame older; each needs a look. Nothing in the simulation.
- **Confidence:** MEASURED for the passes; READ for the page reads.
- **Verify:** the debug log's `effects` and `bars` phases; Chromium's "forced reflow" warnings in a fight with a message up.

### 8. The invasion budget measures the processor only: a phone held back by its graphics is told it has room for the biggest

- **Where:** `client/js/app/game.js:3694`, `:3721-3737` (`work` is `rendered - frameStart`); `client/js/app/budget.js:35-70`; `client/js/core/invasions.js:96-112`.
- **Now:** the size told the host is `(27.8 ms − median work) / 0.1`, capped at 120 for a phone. `work` ends when three.js has handed its commands over, not when the picture is made, and the frame's interval is used only to notice a pause (`budget.js:38`). A phone at 25 frames a second because of pixels and shadows, its governor already drawing less, can still report 8 ms of work and be told 120. A bigger invasion then makes it slower, and the governor takes more of the picture away.
- **Cost:** on such a phone, the biggest invasions at the lowest quality, where a smaller one at full quality was on offer.
- **Change:** give `observe` the governor's step and the median interval. At any step below the chosen quality, or with the median interval more than a fifth over the beat, tell the least (60).
- **Gain:** invasions sized to what the phone draws well; no quality lost to them.
- **Effort:** S.
- **Risk:** it changes how big invasions are on weak devices. That is a `budget` command's value: no change to the rules or to the netplay or snapshot versions. A matter of taste: see the questions.
- **Confidence:** READ for the logic. SUSPECTED that an iPhone's frames are held back that way; your in-browser profile will show whether `update + render` tracks the interval.
- **Verify:** debug overlay on an iPhone: frame interval against `update` + `render` where the governor has stepped down.

### 9. Write the minute's saves after the frame, not in it

- **Where:** `client/js/app/game.js:15530-15535` (the `turn` event, handled inside the step, inside the frame); `client/js/main.js:1228-1231`, `:1247-1250`; `client/js/app/save.js:264-272`, `:1036-1047`.
- **Now:** each minute of play one frame takes the war's snapshot, encodes it and writes five keys to `localStorage`, all synchronously.
- **MEASURED** (`warsize.mjs`):
  - The world's save is 24 KB at the start, 65 KB after an hour, 97 KB after three. It then levels at 103 to 108 KB (ASCII) out to fifty hours, because the war's log is capped: a good property.
  - Snapshot and encoding take 1 to 2.5 ms up to three hours in, 2.6 to 8.6 ms later (noisy machine).
  - The other four keys are under 3 KB each. Eight worlds at most is under 1 MB: no danger to the quota.
- **Cost:** a few milliseconds, once a minute, in the same frame as the war's own turn. Not a stutter by itself; it makes the minute's worst frame worse.
- **Change:** in `onWar`, `setTimeout(save, 0)` (as the debug log's notes do), still flushed at once on `pagehide` and when the page is hidden.
- **Gain:** 2 to 9 ms off one frame a minute.
- **Effort:** S.
- **Risk:** the save lands a few milliseconds later; the flush on hiding covers the one case that matters.
- **Confidence:** MEASURED for size and encoding; the write itself not measured (needs Safari).
- **Verify:** the debug log's `steps` phase in the frame of a turn.

### 10. Pulse with opacity, not with shadows and filters

- **Where:** `client/styles.css:2650` and `:2716-2728` (`attacker-pulse`: `box-shadow`); `:2986` and `:2989-3001` (`member-pulse`); `:1905`, `:1938-1946` (`chain-pulse`); `:2021`, `:2039-2050` (`charge-full`: `filter: drop-shadow`); `:6879-6914` (`rift-throb`: `filter`).
- **Now:** these run for ever while shown; the icon of whoever the player is set on pulses for the whole of every fight. A shadow or a filter can't be animated on the compositor, so the icon is painted again on the page's thread every frame.
- **Cost:** small (a 48 px box): SUSPECTED some tenths of a millisecond of painting a frame on a phone, during fights.
- **Change:** put the brightest shadow on a pseudo-element once and animate its `opacity` (and `transform` for the scale): the same look, run by the compositor.
- **Gain:** the page's thread left alone by them. **Effort:** S. **Risk:** the glow's falloff must be matched by eye. **Confidence:** SUSPECTED. **Verify:** Safari's Timelines, "Paint", in a fight.

---

## 2. Checked and already good

- **The app's modules load late.** `main.js` imports only the shell; the game, the host, three.js and the screens come by `import()` when wanted (`main.js:268-270`, `:1482`, `:1689` …).
- **Timers.** Seven `setInterval`s in the app, each cleared or guarded: the updater checks `document.hidden` (`main.js:6531`); the war map's (`:1756`, cleared `:2197`); the rejoin record (`:3205`, 10 s, clears itself); the debug overlay's only while shown (`debug.js:196-200`); the controller's loop only while one is connected (`padplay.js:238-241`).
- **Listeners.** The game's are all added through `#on` and removed in `#deafen` (`game.js:16512-16515`, `:3227-3232`); the HUD's parts keep theirs by name and remove them in `dispose`. None found added twice.
- **Maps that grow.** Those keyed by a character's id are emptied in `#undress` (`game.js:2904-2911`); the rest are bounded by the world's own things.
- **Hidden and shown again.**
  - Hidden: the place and vitals are kept, the world stops if it can, the sound stops, the notes are closed, a host's guests are told (`main.js:6279-6291`, `:1313-1339`).
  - Shown: the governor, throng and budget start their windows afresh on a gap over a second; a frame's time is capped at 0.1 s (`game.js:3630`); a joined game catches up at most 40 steps or 8 ms a frame (`core/netplay.js:129`).
  - The drawing lost: three.js prevents the default (`WebGLRenderer.js:1113-1115`), so it is given back; the page then reloads where the player was, by design (`main.js:290-303`).
- **Telemetry's own cost.** MEASURED on the real class (`telemetry.mjs`): 0.95 to 1.2 µs a frame. Everything dear is done only when an event is kept, and the notes are written after the frame.
- **The HUD's writers** mostly compare before they write (the boss bar, the sigil, stamina, the horse's bar, the Action Bar's slots, the party's icons), and the bars over heads move by `transform` alone.
- **The world map** is drawn only when something changes (`worldmap.js:577-590`), at no more than twice the screen's pixels, and gives its canvases back when closed (`:1339-1346`).
- **The save's size** levels off (finding 9), and the seven-day forgetting on iPhones is known and handled (`homescreen.js`, `device.js:86-96`).
- **CSS over the canvas.** One `backdrop-filter` in the whole sheet, on menu cards (`styles.css:507`), not on the HUD. No large blurred layers.
- **How many elements.** MEASURED (`dom.mjs`): 1,563 in `index.html`, of which about 1,300 are in 24 closed dialogs and 95 in the HUD. A bar over a head is 8 more. A count on the playing screen needs the browser.
- **Parsing.** MEASURED (`compile.mjs`, five runs): `game.js` (888 KB, 190 KB as Brotli) compiles lazily in 27 to 43 ms, `main.js` (270 KB) in 7 to 25 ms. Not a loading problem.
- **Passes at peace.** With 49 actors every pass replayed costs single microseconds; `linkAt` in `#stepIn` is 0.6 µs with the 15 to 24 links a start town has.

## 3. Bugs (not performance)

- **Adaptive at 30 frames a second** (finding 1) is a bug as much as a cost. Sure of the logic.
- **Stale comment, `client/js/app/device.js:43`:** it says a "turn your device" screen covers the game in portrait. There is none; portrait is played (`world/view.js:1140-1143`).
- **Saves that fail are silent after the first.** `save.js:264-272` returns false; only `writeSave` at character creation is looked at (`main.js:1071-1074`); every later save's result is dropped (`main.js:1212-1249`). If storage starts refusing mid-game, nothing tells the player. Rare; low confidence that it happens in practice.
- Nothing else confirmed. I looked for the player's own avatar being absent mid-frame (`game.js:4206-4208` and `:4317` assume it; other lines guard for it) and found no path that removes it.

## 4. Code structure

- **`Game` is one class of 334 fields, 460 private methods and 188 imports.** The cost is not parsing; it is that none of it can be driven in Node. The tests show the strain: one reads `game.js` as text and matches `case "…":` lines with a regular expression (`test/app.test.js:1836-1847`); another re-implements `#tick` to test what a joined game draws (`test/joinedgame.js:5`, `:17`, `:180`). Every piece already lifted out as a pure module (`governor.js`, `throng.js`, `budget.js`, `fight.js`, `memoryguard.js`, `pacing.js`, `forecast.js`) has unit tests and was easy to measure here.
- **The seams, by where the lines are:**
  - *Who is drawn how* (`:4686-5780`, about 1,100 lines: marshal, rationing, folk room, shut in, thronging, crowding, modelling, forgetting, the memory guard). Its decisions are pure given "who is about, how far, what is held". It is the code the iPhone crashes turn on, and today only a browser test can reach it. First to lift out.
  - *What the maps show* (`:6753-7200`: the icon lists, `worldMapView`, `partyView`, `battleView`): pure functions of the host, the plan and what's explored. Lifting them makes finding 6's caches natural.
  - *What the player is told* (`#handle` `:14564-15117`, `#hear` `:15117-15773`: 1,200 lines of `switch`): a table from event to words, testable without a screen.
  - *Input* (`:16517-17400`) and *talking* (`:8534-9670`).
- **A table of phases.** `#update` is 500 lines calling about 90 things in a fixed order, each with its own hand-rolled clock. A list of `{ name, every, offset, onStep }` entries run by one loop would make findings 5 and 7 a matter of data, let telemetry time each phase by name instead of eight coarse marks, and make "what runs each frame" readable.
- **What a split would not buy:** load time (27 to 43 ms to compile, and it already loads late).
- **Three "held" thresholds and two "tap" slops:** `game.js:385` (400 ms), `hud.js:50` (500 ms), `minimap.js:200` (550 ms); `game.js:369` (12 px), `minimap.js:194` (10 px). One module should own them.

## 5. Gameplay and design (a phone's touch screen)

- **A long press is three different lengths** depending on where the finger is: 0.4 s on the world, 0.5 s on an icon, 0.55 s on the minimap. Players learn one.
- **The party's icons shrink to 30 px** to fit (`hud.js:58`, `PARTY_ICON.least`), under the 44 pt a thumb needs, and they are pressed in fights. The "+N" chip is the better fallback past 36 px or so.
- **Every hostile soldier drawn has a bar in the page** (finding 7), a hundred or more in an invasion, each its own compositor layer when shown (`styles.css:3095-3104`, `will-change`). Tracking only those within the 60 m they can be seen at also thins the screen in a mêlée.
- **Low Power Mode** (finding 1) deserves a line in Game options saying what the game is doing ("your phone is asking for 30 frames a second"), as "Keeping up" already says what the governor does.

## 6. Questions for the owner

1. **Invasions on a struggling phone (finding 8):** smaller invasions at the chosen quality, or the biggest the processor can step at whatever quality that leaves? I assumed the first.
2. **The memory guard (finding 4):** is it acceptable that a phone which has once had to hold less in a place keeps doing so for several minutes after, rather than trying again at 30 s?
3. **Do you play with Low Power Mode on?** If so, the "in full" line of the debug overlay in a crowded fight will confirm finding 1 in a minute.

---

## Appendix: the frame, in order

`#frame` (`game.js:3622-3715`): pacing (skip if the quality's rate is met) → `#tick` → `#aim` (mouse only, every 100 ms) → `#together` (written when it changes) → `#worldLink` (every 500 ms) → draw → throng, governor → budget → telemetry.

`#tick` (`:3809-3899`): what was put off till now → the battle's steps (0 or 1 at 60 frames a second; each with `#remember`, one pass, and `#handle` for its events) → strays landed → catching up (joined) → `#update`.

`#update` (`:3956-4451`):

| Phase (telemetry's mark) | What | Needs to run |
|---|---|---|
| setup | arrival, `#stepIn`, tracks, forts and stockades, `#marshal`, `#bossBar`, `#rationing`, `#shutIn`, `#folkRoom`, `#thronging` (0.5 s each, same frame: finding 5), `#allying`, `#crowding` (a pass over avatars), `#forgetting` (5 s), `#memoryGuarding` (2 s), `#modelling` (2 s, plus a pass over avatars every frame), `#cheered` | `#allying`, `#crowding`: a few times a second |
| bodies | the pass over everyone: place, guard (finding 2), pose, gaze, ground, stamina bar, horse; then fading, pictures sent, crowds drawn | every frame, but for the guard and the stamina look-up |
| effects | projectiles, wheel, spells, buffs lingering (a pass), sound, `inFight` (a pass), criers (0.5 s), target and ally rings, `#partyIcons`, `#quickActions`, `#buffOn`, sigil, charge, `#sizeUp` (0.5 s), `#wielding`, `#bleed`, `#ailing` (a pass), `#grounds`, eight `#keepTo…`, `#restPlayer`, effects, drops, four `#spy…`, the minimap (30 a second) | on a step: the party, the Action Bar's state, ailing, the spies |
| world | time of day, light globes (a pass), the pin, glints, trails, dens, shrines, moon gates, finds, obstacles, pings; chunks, grass, motes, far land, look, torches (a pass at night), camps, lights | the "near me" scans: when the player has moved a metre |
| inside | `#visit` (building within a time budget), `#follow` (camera; with `#threats`, `#attackers`, `#clearOfFight`: three passes), `#inside` | the camera every frame; the lists on a step |
| bars | bars wanted (a pass), bars placed (a pass), `#wildWays` (two passes), words over heads, skin tints | wanted: on a step; placed: every frame, for those in range |

Passes over all actors in one frame: about fifteen, plus actors × armed for the guard, two over the avatars, three more at 30 a second for the minimap, and one a step.

---

## Summary (top findings in rank order)

No findings file exists: the harness refused the Write, so the full findings are above. Scratch scripts are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/app/`.

The app shell is mostly sound: timers, listeners, Maps, telemetry (1 µs a frame), the world map, save size (levels at about 105 KB), lazy module loading and CSS all checked clean. Ten findings, none touching the simulation:

1. **Adaptive misjudges a 30-frames-a-second browser** (iPhone Low Power Mode). Measured on the real classes: the throng drops to 6 bodies in full within 4.3 s and never recovers; the governor sits on a knife edge and can ratchet to Low at half the pixels. Fix: undo steps that bought nothing; judge against the beat seen. S.
2. **`#fighting` scans all actors for each armed actor every frame** (`game.js:4084`, `:4467`). Measured: 0.5 to 1.2 ms a frame in a phone-sized invasion, 3.6 to 5.7 ms at 360 actors. Cache per avatar for 0.25 s. S.
3. **Governor, throng and budget each sort their whole window every frame.** Measured: 157 to 219 µs and 149 KB of garbage a frame (8.9 MB/s in V8). A typed-ring prototype: 3.5 to 16 µs, no garbage. S.
4. **The memory guard can see-saw**: its own saving exceeds its 40 MB hysteresis. Simulated on the real `guardLevel`: a cycle every 38 to 84 s in plausible places, rebuilding bodies each time. Needs back-off. S; incidence suspected.
5. **Ten half-second jobs fire in the same frame**, and on phones `memoryNow()` walks every body in-frame every 2 s (1 to 9 ms on stand-ins), then again for the notes. Stagger, avoid step frames, read once after the frame. S.
6. **The minimap rebuilds its icon lists 30 times a second**: about 100 KB of garbage a draw in a battle. Cache, cull, skip unchanged draws. S to M.
7. **About fifteen passes over actors a frame refresh lists that change 20 times a second**, plus a write-then-read layout in `hud.keepClear` during fights. M.
8. **The invasion budget measures processor time only**, so a graphics-bound phone is told it can take the biggest invasion. S; suspected.
9. **Five synchronous saves land in the war-turn frame** each minute (2 to 9 ms). Defer. S.
10. **Shadow and filter pulses repaint every frame** in fights. S; suspected.

Structure: `Game` has 334 fields and 460 private methods; splitting buys testability, not load time (27 to 43 ms to compile). First seam: "who is drawn how" (`:4686-5780`), which the iPhone crashes turn on.

Three questions for the owner are in section 6.