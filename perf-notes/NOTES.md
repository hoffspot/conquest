# Lead's notes: Pellagos performance review (task #32)

## The deliverable
- Claude doc "Pellagos performance review": https://claude.ai/artifact/9FN636SEfxQqPubYqWBSW7
- doc id (container): 42ca846c-7968-4e24-95ce-6a8346cb7c3c ; body node id: d2237f32-591c ; session m96rx7119w7
- pending blocks to replace (one update per section, "as":"markdown"): s1 m96rx7119w7.34 summary; s2 .35 how measured;
  s3 .36 libraries; s4 .37 phones; s5 .38 loading; s6 .39 game logic; s7 .40 multiplayer; s8 .41 tests/CI;
  s9 .42 beyond performance; s10 .43 order of work + captures.
- update call shape: mcp__Claude_Docs__update(ref={"object":"node","id":"d2237f32-591c"}, engine="prose",
  container={"kind":"project","id":"42ca846c-7968-4e24-95ce-6a8346cb7c3c"}, payload={"ops":[{"op":"replace",
  "target":{"kind":"blocks","ids":["m96rx7119w7.34"]},"with":{"from":{"kind":"inline","content":"## ...\n\n..."},"as":"markdown"}}]})
- Final chat reply: one short line with the doc link, no recap (docs connector rule); then usual summary is NOT wanted by connector,
  but the user needs the headline: keep it to a line or two.

## Owner's answers
All four areas matter; weakest device = recent iPhones (15+); visual changes only if imperceptible (e.g. lower detail at
distance); scope = everything worth improving (bugs, structure, gameplay/design too).

## Reviewers (agent ids) and where their reports are saved (python3 save-report.py <tasks/ID.output> <area>)
render a91816f5c78f157e9 DONE -> findings-render.md
bodies af1b5a4b57ab1a616 DONE -> findings-bodies.md
combat ab6acf1145f0a6630 DONE -> findings-combat.md
host aa08f226a3dd0c1ef DONE -> findings-host.md
app a84d2acd090eaedfb DONE -> findings-app.md
loading a9ef6dbaba659a1ab DONE -> findings-loading.md
multiplayer aabf33aba2d144251 DONE -> findings-multiplayer.md
tests ab688bcac6e5cb138 DONE -> findings-tests.md
platform ade8d2c76f3b19e8a DONE -> findings-platform.md
(Reviewers cannot write files; their reports come as hand-back messages; save-report.py extracts them from
/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/tasks/<id>.output)

## My own measurements (scratchpad/perf/out/)
- Versions (npm outdated): three 0.186.0 -> 0.187.0; @playwright/test 1.63.0 -> 1.65.0; @recast-navigation/* 0.43.1 -> 0.44.0;
  draco3dgltf 1.5.7 -> 1.5.9; eslint 9.39.5 -> 10.14.0 (@eslint/js 10.0.1); globals 16.5.0 -> 17.14.0. Node 22.
- Heap, emulated iPhone 15 Pro, Low, headless Chromium, after forced GC:
  - start town (18 avatars): JS heap 427 MB, of which ArrayBuffer data 329 MB in 16,329 buffers; code 30 MB; GPU 174.5 MB
    (textures 133, buffers 39); game's Safari-style total would be ~290 MB; real ~600.
    Holders: game.kit 101.5 (garmentMaterials 32.6: ~25 x 1 MB 512x512 RGBA on page; composites 28.1; texelMap 11.4;
    referenceMeasures 10; atlas 8; human 7.4); chunks 39.7; town 34.2; avatars 20.6; navBaker 17.5 (16 wasm); world.plan 13.5;
    sound 12.3 (pre-tap: made PCM + MP3 bytes); view.scene 34; view.occluders atlas 15; models read 43 + files 8.6; modules/code ~37.
  - human city (25 avatars, 68 actors): heap 526 MB (467 ArrayBuffer), GPU 204 (tex 135, buf 67); models read 145 MB for 3 unheld
    models (one 81 MB, parser 69) -- BUT this Chromium has no compressed-texture support so KTX2 fell back to RGBA (4-8x bigger
    than an iPhone's ASTC/ETC2): model pictures overstate a phone; parser share (file bytes) is the same.
  - Files: out/town-phone.heapsum-1mb.txt, out/city-phone.heapsum-1mb.txt, heaptop.py to list top holders.
- game.memoryNow() (game.js:1915-1922): on Safari total = bodies + interiors + gpu + sound + wasm (no heap). Docs admit it.
- Owner's crash logs (from transcript): device screen 402x874, cores 4, memoryGB null, quality low, drawing buffer 402x812
  (pixel ratio 1), at times 341x690 and 281x568 (governor at 0.85 and 0.7). So a recent iPhone gets Low at 1x and is still
  stepped down: the bottleneck is not pixels. detectQuality (view.js:78-88): touch && (memory<=4 || cores<=4) -> low.
- Cold first visit to the live title (https://hoffspot.github.io/conquest/, HTTP/2, gzip, SW blocked): 984 requests, 604 unique
  URLs; game code 817 requests 3.9 MB gzip (+ vendor 29 / 345 KB); each module fetched by the loader then imported from cache
  (no double download); total 8.9 MB over the wire to the title incl. vitruvian.bin 2.1 MB, sounds 1.6 MB. cache-control max-age=600.
  Timings there were taken on a saturated machine: redo.
- Ranged downloads miss gzip (MEASURED, range.cjs): fetcher.js:645 uses Range; Chromium sends Accept-Encoding: identity for it;
  ant.bin 1,000,000-byte range came as 1,000,737 bytes on the wire; whole file comes gzipped 1,872,051 for 2,254,056.
- First profile (machine saturated, load average ~17): frame timings unusable; while the town's folk are built after arriving,
  the "inside" phase took most of each frame, js/characters 38% of CPU samples and 70% of 90 MB/s allocated. Redo clean:
  node prof.cjs <arrive|town|walk|city|fight|herd> <phone|desktop>  (draw calls stubbed; writes out/<tag>.json).
- Unit test times: unit-times.tsv (292 of 299 lines; test/overworld.test.js failed under load). Slowest: snapshots 269 s,
  places 184, rare 182, registry 138, order 126, realm 120, trails 108, netplay 103, director 101 (under 4x contention).
- Local server for profiling: PORT=4917 node server/index.js (running; kill by PID when done).
- Licensed models are placed in client/models (git-ignored). Never commit.

## Verified reviewer claims so far
- loading #1/#render #2: models.js read() returns loader.parseAsync result whole (parser kept) -- code matches.
- render #1: game.js:2185 const atlas = prepareAtlas(); closure at 2241; occluders closure at 2270 -- matches.
- render #5: gpumemory.js texelBytes falls back to 4 bytes/texel for formats it doesn't know -- matches.
- render #12: owner's iPhone reports cores 4 -> Low, pixel ratio 1 (crash logs) -- confirmed.
- loading #5: Pages gzips .bin fetched whole; ranged fetches are uncompressed -- measured.
- multiplayer #1: host.js:17981-17985 messengersAt and 11239-11241 rareLooked are set nowhere else (not in snapshot/#load) -- code matches;
  re-run its script to confirm when the machine is calm: cd multiplayer && node messenger-desync.mjs 200 135 2 70 (expects desyncs>0 today).
- multiplayer #5: netplay.js:1106 this.held = 0 and :1123 this.held = false -- matches. #3: wire.js:27 JSON.parse with a reviver -- matches.

## Real-device evidence: the owner's two pasted debug logs (saved to out/owner-logs.json)
iPhone, iOS 18.7, Safari, screen 402x874 @3x (an iPhone 16 Pro-size screen), cores 4, quality low, adaptive true.
- At rest the phone holds 60 fps (recent frame intervals 16-17 ms) with 30-52 avatars, at 402x812 and at 281x568.
- Every "slow" event (19.6-27.8 fps over 3 s) is the `inside` phase (game.js #visit: building floors, folk, crowd figures,
  soldiers and creatures a step at a time): mean 18.5 / 21.1 / 24 / 31.6 ms a frame, against VISITS.budget = 6 ms
  (game.js:574; ENTERING.budget 30 ms only while the screen comes up from black, game.js:597). Other phases then: steps 2-4,
  bodies 1.4-4.2, effects 1.6-2.4, draw 4.5-6.2, world 0.4-1.3 (12.1 once, arriving in a city).
- Longest single jobs on the phone (ms): the new character 735, 237, 109; dressing player 216, 190; dressing orc 163;
  crowd figure 136, 131, 129, 99, 85, 69, 67, 56, 48, 45; dressing folk 122, 99; making the dungeon 116, 92;
  dressing soldier 95, 65, 50, 42, 32, 31, 24, 22; dressing beast ogre 48, 33; minimap patch 46, 23;
  handling the world's news 29, 28.
- Freezes: 3.14 s in draw (horse shaders; fixed by the prepare() change since), 0.51 s and 0.27 s at the start of play
  (effects 190 / draw 161 / inside 66 / bodies 55), 0.22 s (bodies 121).
- The governor had cut pixels to 341x690 (0.85) and 281x568 (0.7) in the crash entries while frames were 16-17 ms:
  it reads building stutter as "too slow" and cuts pixels, which cannot help.
- Multiplayer #1 reproduced by me: node multiplayer/messenger-desync.mjs 200 135 2 70 -> desyncs 1, world sent again 151 KB.
- App review (findings-app.md) #4: the memory guard I merged today can see-saw (its saving exceeds its 40 MB ease); #5: its
  memoryNow() walk runs in the frame every 2 s. Both are mine to own up to in the report.

## Doc progress
- WRITTEN: s3 Libraries (rev 2), s7 Multiplayer (rev 3), s5 Loading (rev 4-5), s4 Phones (rev 6: S1-S9, M1-M11), s6 Game logic (rev 7: G1-G9), s9 Beyond performance (rev 8). Remaining pending: s1 .34 summary, s2 .35 how measured, s8 .41 tests/CI, s10 .43 order of work.
- Add at the end: a Sources list (three r187 notes, migration guide, PR 34585, WebGPU manual, Node schedule, recast releases, WebKit bug 277848, Apple jetsam page).
- platform review verified by me: r187 has 0 ENVMAP_TYPE_CUBE_UV (5 ENVMAP_TYPE_PMREM), the skin's lighting line is gone, PMREM MIN_SIZE 256.
- My profile of the settled town (out/town-phone.json, Chromium, adaptive on, draws stubbed, machine loaded): about 1 MB allocated
  a frame (33 MB/s at 33 fps): js/characters 47% (character.js:1130 and :2139 the scabbard 'hang' solver 22%, drapes.js 6%),
  js/app 17% (budget.js:18 4.3%, minimap draw 3.8%), three.js 14%. CPU: three.js 18.5% of the main thread, game code about 11%.
  The fight and herd runs are NOT usable (my draw stubs made every portrait blank, so they were retaken for ever).
- Host review cross-check with the phone's log: 'making the dungeon the Swarming Mound' 116 and 92 ms on the phone (host finding 5
  measured 41-83 ms in Node), so the phone is not faster than this machine for that job.

## Clean runs (quiet machine, 13:48-13:51)
- Live title, cold, SW blocked: ready 8.3 s (includes a 3.04 s gap = the 'service worker can't register' 3 s wait, device.js:107, which
  my blocked-SW setup triggers); main.js's 69 static modules 0.44-1.07 s (615 KB); loader's 396 files 4.11-5.72 s, 16 at once.
  Slowed link (80 ms, 12 Mbit/s): ready 12.9 s; the 69 modules 0.41-2.27 s (1.9 s: the nine-level waterfall); loader 5.32-8.37 s (3.05 s).
- Settled town, emulated iPhone Low, draws stubbed, adaptive on: 60 fps; JS a frame median 5.7 ms, p90 8.0, p99 10.2; phases mean ms:
  draw 3.5 (three.js's own work), bodies 1.75, effects 0.24, steps 0.14; allocated 689 KB a frame (41 MB/s): characters 47%, app 18%, three 14%.
- First 15 s after arriving (same setup): 30.7 fps; JS a frame median 15.5, p90 40.6, p99 111.5, max 179 ms; `inside` phase mean 15.1 ms
  (p90 31.3) against the 6 ms budget; js/characters 37% of CPU; 210 of 461 frames over 16.7 ms, 72 over 33 ms. Reproduces the phone's log.
- ALL NINE REVIEWS IN. findings-*.md saved for: loading render multiplayer app platform bodies host combat tests.

## DONE (13:59)
- The doc is complete (rev 26): Summary, How measured, Libraries, Phones (S1-S9, M1-M11), Loading (1-6), Game logic (G1-G9),
  Multiplayer (1-8), Tests and CI (T1-T8), Beyond performance (11 bugs, design, structure), Suggested order + decisions + captures, Sources.
- Local server stopped; heap snapshots and the downloaded Node binaries deleted (summaries kept in out/).
- Task #32 to mark completed. Final chat reply: one or two lines with the doc link.

# PHASE 2: IMPLEMENTING THE REVIEW (owner's request, after the doc was delivered)
Owner: "implement all the recommendations in the performance review in as few PRs as possible", plus gameplay changes:
- Hold: halve stuns on bosses and shorten each repeat (as Fear wears thin).
- First raid: at 10 minutes (was 5).
- Long press: 0.5 s everywhere (world 0.4, icon 0.5, minimap 0.55 today).
- Party icons: leave as they are.
- Soldier health bars: if they overlap, don't draw the ones behind (never hide the player's target's).
- "Start to look towards a crowd rendering approach taken in MMOs as we look to increase concurrent players": answer = plan + first stage.
- Low power mode: a good option if straightforward (say in Game options the phone asks for 30 fps; don't cut quality for it).
- "If a player strikes an enemy, it can be hostile beyond the cap": the cap stays; document it.
Answers to my questions: file splits (game.js/host.js) and three.js r187 = LATER (not in this push); crowds = plan plus first stage;
models = fetch whole when a player is waiting (no repack); followers = defend themselves when their leader is down.
NOT doing: snapshots.test.js restoring fewer fixtures (would loosen a test), T8 (moving decisions out of game.js: part of the splits).

## Plan: three PRs from the one branch claude/optimistic-rubin-o1glnc, in order (reset to origin/main after each merges)
PR 1 tests and CI (task #33)  ->  PR 2 the game on the device (task #34)  ->  PR 3 simulation, multiplayer, servers + gameplay (task #35).
Crowd research/plan/first stage = task #36. Common brief for implementers: perf/IMPL.md (worktrees; no push; lead regenerates manifest;
commit footers: Co-Authored-By: <the model name the session gives> <noreply@anthropic.com> + Claude-Session: https://claude.ai/code/session_01XUfY7aYkNK4hmgUhgCyVx4).
Owner must change the ruleset once (only `ci` required) before the e2e matrix can go from 8 to 18: give exact steps in PR 1.

## PR 1 engineers (worktree agents), launched 14:2x
pipeline aa717ae8cdac423fc  (.github, contribution.md, contribution.test.js, e2e-durations.js, build-mac-app.js; Node 26; `ci` job)
e2e      af453ddf9d0ca4d25  (e2e/**, playwright.config.js, main.js ?play/?quality, heroes.js, README.md; cheap drawing by default)
unit     a568e149ab009dd78  (test/**, package.json scripts, .gitignore, worldplan/plan.js setter, scripts/test-affected.js)
deps     afcc5bf9b0b03cb02  (package.json devDependencies + lock, eslint.config.js, 25 lint fixes; draco 1.5.9; Playwright 1.65 if it works)
crowds research a6baa6bc22a16e437 (web; returns text; save with save-report.py <output> crowds)
When each reports: cherry-pick its commits onto claude/optimistic-rubin-o1glnc, run build:manifest, npm run check, push, open PR 1,
subscribe, enable auto-merge, tell the owner the ruleset steps. Then launch PR 2's engineers while CI runs.

## PR 2 engineers launched early (15:15), in worktrees under /home/user/conquest/.claude/worktrees/agent-<id> (based on main 84f08e2, before PR 1)
bodies  a87da234a9606675b  assignment perf/assign/bodies.md  (characters/**, wounds.js; B1, F1, F2, F8, F10-F13, posing garbage; exports a kit flush + kit bytes fn)
world   a6dcab61fbc43fe04  assignment perf/assign/world.md   (world/** bar crowd/release/models; atlas promise, joined release, town trees, signs, packing, shadow map, uploads, gpumemory counter, detectQuality, shader patches version-proof, far trees)
loading a3ef6f1bfda215e0a  assignment perf/assign/loading.md (sw.js, loader, fetcher whole-when-hurry, device, session, audio rates, build-manifest, build-site.js, pages.yml step, plan in worker + kept)
STILL TO LAUNCH for PR 2 (after PR 1's engineers finish): 
 - frame loop & HUD: governor/throng/budget vs beat + typed rings + ignore building frames; memory guard back-off + flush hook + memory after frame;
   #fighting cache; staggered clocks; minimap icon caching; lists refreshed on step; bars only within 60 m and hidden when overlapped (never the target's);
   long press 0.5 s in one module; low power notice in Game options; saves after frame; CSS pulses; save-failure notice; antialias note; invasion budget.
 - crowds & models: crowd.js compaction (F3) + B4 + cache between sessions (F5); models.js parser drop + releaseCompressed in release.js + heldOnPage compressed;
   beasts/model.js fetch-not-read predicted models, Order one skeleton (F7); memoryNow lines; KTX2 pool.
 - MMO stage one (after the research reports): likely other players as one merged outfit (F9 for others) + priority order for who is held in full.
NOTE: launching worktree agents needs the shell's cwd to be /home/user/conquest (cd there in a Bash call first).
NOTE: worktrees live inside the repo folder; `eslint .` from the main checkout would lint them too: remove worktrees (git worktree remove) before npm run check.

## Crowd research DONE -> findings-crowds.md (a6baa6bc22a16e437)
Plan's stages: 1 other players as one merged outfit + one order of precedence (+ plates culled on overlap as its first user);
2 players in crowds of their own (needs F3, F5); 3 standard figures then plates alone (perceptible: owner's choice); 4 the earlier
scaling report's stages 0-2; 5 replication in tiers matching the drawing tiers; 6 copies of crowded towns.
FIRST STAGE to build in PR 2 (one engineer, AFTER the bodies engineer's commits are in its base, since both touch character.js):
 A. game.js:2673 `merge: actor.id !== this.me`; game.js:10551 #regear: another player's gear drawn one by one at once, and after ~5 s
    unchanged put together as one outfit in steps and swapped (character.js:1352, merged at :632-662). Own hero stays one by one.
 B. a pure module beside app/throng.js with the order: self; party; my target; whoever attacks me; whoever fights my party; whoever I'm
    talking or trading with; then tallest on screen; other maps last. Replaces three `fighting` copies (game.js:4735, :5082, :5641),
    `kept` (:5260) and four sorts (:4741, :5083, :5270, :5659). Players are exempt from rationing today yet counted by #heldInFull (:4695).
 D. bars: placed in that order at game.js:4391-4403, one covered by a higher one hidden in Hud.place (hud.js:831), never the target's,
    the party's or an attacker's; and only tracked within the 60 m they can be seen at (app finding 7). OWNER ASKED FOR THIS.
 Also: write generated/crowd_rendering_plan.md from findings-crowds.md (the repo keeps plans in generated/).
Owner questions from the research (ask at a natural point, not blocking stage one): what is acceptable when more players gather than
can be held in full (own far figure / standard figure / plate alone / second copy of the town); target 16, 32 or 100 a world, gathered
or spread; a "characters shown" option or only Adaptive; friends/guilds to feed the order.

## PR 1 integration log (on claude/optimistic-rubin-o1glnc, local, not pushed yet)
- deps engineer DONE and cherry-picked (e9da49c lint fixes, c82be91 ESLint 10 + globals 17, 52d07f3 draco 1.5.9 lockfile, a9ae261 Playwright 1.65).
  For the PR text: npm audit goes 0 -> 4 moderate (one advisory, minimatch under ESLint 10; dev-only); ESLint 10 needs Node 22.13+;
  draco is lockfile-only (if the lockfile is ever remade, run `npm update draco3dgltf` again); Playwright 1.64+ gives pages screen 1920x1080.
  Main checkout's node_modules is now stale: run `npm ci` before `npm run check`.

## 16:20 usage limit
Four engineers (unit a568e149ab009dd78, bodies a87da234a9606675b, loading a3ef6f1bfda215e0a, world a6dcab61fbc43fe04) stopped on
"You've reached your <model> limit" (HTTP 429). Owner said "Try again": all four resumed with SendMessage (context intact, worktrees kept).
pipeline aa717ae8cdac423fc and e2e af453ddf9d0ca4d25 never stopped. If the limit hits again: tell the owner plainly, don't loop;
consider fewer engineers at once. Worktree branches are named worktree-agent-<id>; commits are cherry-picked from them.

## 16:5x progress
- PR 1 branch (local): deps 4 commits + unit 10 commits + f1fa5de (.claude/worktrees ignored by lint and git) + a9623e2 (lint fix in
  test/helpers.test.js). `npm ci` done in the main checkout. Full check running in background (b4h154d4i, log scratchpad/check-pr1a.log);
  push when it passes. Still to integrate for PR 1: pipeline aa717ae8cdac423fc, e2e af453ddf9d0ca4d25, and any later unit commits.
- loading engineer DONE (PR 2): 12 commits on worktree-agent-a3ef6f1bfda215e0a (report saved: findings-impl-loading.md).
  Needs at integration: npm run build:manifest; contribution.md sentences (Pages copy stripped by scripts/build-site.js before the stamp;
  build:manifest row: preloads + style sheet's hash, --root; build:sounds row: checks each sound against its decode rate).
  It touched main.js (two awaits), e2e/caching.spec.js, README.md, docs. Site gains ~20 MB of .map files. New IndexedDB db pellagos-plans.
  PLAN TRAP: a plan's waters come from the land during settling; adoptPlan(plan, land) needs landOf(plan). Told the unit engineer to check
  its on-disk cache against seeds 7, 12, 31. Both edit core/worldplan/plan.js: expect a conflict when PR 2 goes on top of PR 1.
  Owner to listen on iPhone: ambience beds and mail hits/snake hisses near the new decode rates' cut-offs.
- pipeline engineer DONE (PR 1): 6 commits on worktree-agent-aa717ae8cdac423fc, oldest first: aa958f2 c404639 70dd425 51ebd70 e50953f 009888d
  (report: findings-impl-pipeline.md). Node 26 NOT done: test/registry.test.js:281 ("giving back its memory") fails 3 of 3 on Node 26 AND on
  Node 24.21.0 (the Mac app's Node), passes on 22: after worlds' threads end Node 22 returns 82% of memory at once, 24 after 3-10 s, 26 only
  14% after 45 s. Owner's call (server or test). CI stays on 22. README badge now points at the Pages deploy.
  Owner steps after merge: Settings -> Rules -> Rulesets -> main -> Require status checks: add `ci` (GitHub Actions), remove `test`, `motion`,
  `e2e (1 of 8)`..`e2e (8 of 8)`, leave "Require branches to be up to date" ticked, save. THEN matrix to 18: shard [1..18], E2E_SHARES 20,
  and "8 e2e jobs" in contribution.md. CLAUDE.md's "(every job is a required check)" goes stale then: update it in that change.
  Leftover: scratchpad/pipeline-node26/x and x24 (438 MB of Node binaries) to delete.
  Integrate AFTER the background check (b4h154d4i) finishes and the first push is made.

## 18:11 PR 1 fully integrated locally (27 commits on claude/optimistic-rubin-o1glnc, NOT pushed)
deps (4) + unit (10) + worktrees ignore + lint fix + pipeline (6) + contribution.md/manifest + e2e (3: 30eacac, 1e333d0, 467e730) + contribution.md.
Owner decided: STAY ON NODE 22. First check (b4h154d4i) was killed at 90 min under load ~30. Second full check running: background
bqm... (see tasks list), log scratchpad/check-pr1b.log, 2 h limit. Earlier load-only failures to re-run alone if they recur:
"bringing a world from the game" (servers), "characters built a step at a time" (character-building), "the tunnel listener" (world-server).
After it passes: git fetch origin main (merge if moved), push, open PR 1 (title: tests and CI), subscribe, auto-merge, tell owner the
ruleset steps, send_later check-in. PR text must say: npm audit 4 moderate (dev only), Node 26 not taken (registry test), expect some
browser tests to need `view: "start"`/`quality: "high"`/FULL after the first CI run; re-time e2e/durations.json from that run.
unit engineer a568e149ab009dd78 is still finishing (asked to check the plan trap; its cache already carries the land): pick any new commits.
e2e report: findings-impl-e2e.md. Remaining PR 2 engineers running: bodies a87da234a9606675b, world a6dcab61fbc43fe04.

## State at 1:25 PM ET, 11 Nov (after a context compaction)
- PR 1 fully integrated locally (31 commits ahead of origin/main 84f08e2), third full check running (br7sq705z, check-pr1c.log). Push + open PR with pr1-body.md when it passes.
- Assignments written in assign/: frame.md, models.md, crowd.md (PR 2, not yet launched); combat.md, host.md, net.md, nav.md (PR 3, not yet launched). net.md's engineer owns PR 3's one version bump.
- crowd.md's engineer must merge worktree-agent-a87da234a9606675b (bodies) first: launch only after the bodies engineer has finished.
- Launch order: frame + models once the check has passed; crowd when bodies is done; PR 3's four when PR 2's are in.
- 1:27 PM ET: launched frame (a6db1fe329aa0492c) and models (a8d7a78d89a3c653b) engineers. Local branch pr2-integration (worktree .claude/worktrees/pr2) = PR 1 head + loading's 12 commits (conflicts in plan.js and WORLD.md resolved) + contribution.md commit 1a66d84. No node_modules there; build:manifest still to run when it moves onto the real branch.
- Bodies engineer done (report: findings-impl-bodies.md). Left: F13 (garments painted in the worker; resume a87da234a9606675b for it AFTER the crowd engineer is integrated, telling it to merge that branch first), F11 atlas page copy and typed reference vertices (not done, reasons in report). At integration: wire letGoOfIdle(kit) into the guard and heldByKit(kit) into memoryNow (hooks left by frame and models engineers); check e2e/pellagos.spec.js:1883 (blood texels > 200 at 256 px); view.js QUALITY comment "about ten megabytes" stale (tell world engineer or fix myself).
- Crowd stage-one engineer launched: a02bdecee0be799ca (merges bodies branch first).
- 2:02 PM ET: full check passed (3,459 tests). Merged origin/main 422badc (docs only: generated/multiplayer_scaling_plan.md by another session, PR 694). Pushed fd41b5c. PR 1 = hoffspot/conquest#695, auto-merge on, subscribed, check-in at 2:58 PM ET (trig_01F9T94KtDwt1f7b6SP6NbKd).
- The scaling plan on main overlaps: Stage 5 slice 5-5 = crowd item A; 5-7 figure diet = models F3; Stage 1 grid passes ~ PR 3 host items; F-2 says Node 24 (owner said stay on 22 to me: mention the disagreement). Crowd engineer told to write a companion doc, not a competing plan. PR 3 assignments carry a paragraph about it.
- 2:10 PM ET: world engineer done (findings-impl-world.md); its 15 commits picked onto pr2-integration (contribution.md conflict resolved). Not done: item 12 (lighter far trees; no generator shape, needs a device), item 7 partly (colour/layer stay floats). Guard's 400/460 MB marks may want revisiting (GPU counter no longer over-counts compressed pictures x4; bodies fall too): decide at integration from measured before/after.
- pr2-integration now = PR 1 head (pre-merge-of-main) + loading + contribution commit + bodies 5 + world 15. Waiting: frame, models, crowd; then F13 round.
- 2:38 PM ET: PR 1 (hoffspot/conquest#695) merged, green first time, CI 36 min; Pages live 2:39 PM ET (deploy took 51 s; no CI run on main). Unsubscribed, check-in deleted. Task #33 done.
- Branch reset to origin/main 9ab20b2 + 33 PR 2 commits (loading 12, contribution 1, bodies 5, world 15) + durations re-timed (7c66cbf; 339 tests, 233.9 min total) + manifest (2b13b42). NOT pushed (check b8cb86nyx running, log scratchpad/check-pr2a.log). Worktrees of finished engineers removed except bodies (to resume for F13).
- Owner still to change the ruleset (add `ci`, remove test/motion/e2e x8); then raise matrix to 18 and E2E_SHARES to 20 in PR 2 (and "8 e2e jobs" in contribution.md, CLAUDE.md's "(every job is a required check)"). If the owner hasn't by the time PR 2 is ready, leave the matrix at 8 in PR 2.
- 3:00 PM ET: models engineer done (findings-impl-models.md); 10 commits picked onto local branch pr2-integration (worktree .claude/worktrees/pr2; based on main checkout HEAD 2b13b42; conflicts in contribution.md, test/release.test.js, docs/GAME.md resolved keeping both). Main checkout NOT yet advanced (check b8cb86nyx running on it): after the check, `git merge --ff-only pr2-integration` in the main checkout.
- Wiring left for me after the frame engineer's commits are in: (1) memoryNow: kitMB = heldByKit(this.kit) at the "THE KIT'S LINE GOES HERE" comment (game.js ~1943), debug overlay + telemetry trend + test; (2) #memoryGuarding sum (game.js ~5645) + modelsMB + kitMB; (3) guard calls letGoOfIdle(this.kit) going up a level (frame engineer leaves a hook); (4) decide the guard's 400/460 marks from the owner's logs (scratchpad/perf/out/owner-logs.json): compressed pictures were counted x4 before, bodies/kit/models change; (5) new browser tests need durations (models: 2 new); (6) run on a quiet machine: in-game crowd, den and Bellhaven keep browser tests; e2e/pellagos.spec.js:1883 blood texels.
- Models engineer's left-alone list worth telling the owner: figure storage up to ~60 MB in Cache API; figureOf paint would throw for a crowd member carrying licensed gear (pre-existing).
- 3:27 PM ET: check on loading+bodies+world passed (3,568 tests). Main checkout fast-forwarded to include models (95f8277 = manifest). Running check + check:motion on that (bqb5ne7kw; logs scratchpad/check-pr2b.log, motion-pr2b.log). Push after both pass; then open PR 2 as a DRAFT to get CI's browser tests early while frame and crowd finish.
- Guard marks decision: KEEP 400/460. Owner's crash logs: counted total 541-548 MB at the crashes (gpu 312-375, sound 77-82, wasm 16, bodies 47-77, interiors 33-54); on Safari the guard's sum == totalMB. New count: compressed pictures x1 not x4 (lower by maybe 30-80 MB in those states), + kitMB (~38 MB, 4 flushed) + modelsMB (2-15). Net about a wash to -40 MB for the same state, while the real uncounted memory fell far more (kit 99->38 MB, world page copies 142->57 MB, parsers 5-8 MB a kind). So the same marks are safer than before. Say so in the PR and GAME.md; ask the owner for fresh debug logs after PR 2 is live.
- 3:30 PM ET: PR 3 started: combat engineer acbdbc1c6ff7d3964, net/snapshot engineer a232813c3ecf06a79 (owns the one version bump). Host and nav engineers to launch when frame (a6db1fe329aa0492c) and crowd (a02bdecee0be799ca) finish. Task #35 in progress.
- 4:05 PM ET: frame engineer done (findings-impl-frame.md); its 13 commits + my wiring commit (kitMB, guard sum, letGoOfIdle, docs) + manifest are on local branch pr2-integration (worktree .claude/worktrees/pr2, node_modules symlinked). Unit tests of the wiring pass (113). Not done by frame: member-pulse and chain-pulse CSS (need another DOM element), #ailing gating partial. Browser tests to watch in CI: pellagos.spec.js 837, 3257, 10394, 10605, 15146, 15418, 15662, 18149, 18385, 1883.
- Next: when bqb5ne7kw (check+motion on main checkout at 95f8277) passes: push, open DRAFT PR 2, subscribe. Then ff main checkout to pr2-integration, run check again, push. Then crowd. Then F13 round (resume bodies engineer). Launch host + nav engineers for PR 3 now that frame is done (machine permitting).

## CHECKPOINT 4:15 PM ET, 11 Nov (owner expects a usage cut-off and a restart)
- Remote branch claude/optimistic-rubin-o1glnc = c887820: main 9ab20b2 + PR 2 so far (loading, bodies, world, models, frame, wiring, durations, manifest). Pushed as a checkpoint with NO pull request open; the full check on it has NOT finished (targeted tests pass; check bqb5ne7kw on 95f8277 was still running, no failures at 162 suites). Local main checkout is at 95f8277 (behind its upstream: `git merge --ff-only origin/claude/optimistic-rubin-o1glnc` once the check is done).
- Before opening PR 2: full `npm run check` + `npm run check:motion` on the head; crowd engineer's commits (worktree-agent-a02bdecee0be799ca, cherry-pick only its own commits after the merge of the bodies branch); F13 round; e2e matrix to 18 only if the owner has changed the ruleset; durations for new browser tests; PR body (not yet written: use the five findings-impl-*.md reports' numbers and not-done lists).
- Running engineers told to commit WIP every 20-30 min: crowd a02bdecee0be799ca (PR 2), combat acbdbc1c6ff7d3964 and net a232813c3ecf06a79 (PR 3). Not yet launched: host (assign/host.md), nav (assign/nav.md). If agents are lost, relaunch from the assign/*.md files; their WIP is on local branches worktree-agent-<id> (lost if the container is reclaimed unless backed up to the remote).

## BACKUPS (owner said yes, 4:20 PM ET): how to restore after a restart
- Remote branches: `claude/optimistic-rubin-o1glnc` (PR 2 so far, c887820+), `claude/optimistic-rubin-o1glnc-wip-{crowd,combat,net,bodies}` (engineers' branches, force-pushed every 10 min by scratchpad/backup.sh in a background loop), `claude/optimistic-rubin-o1glnc-wip-notes` (this folder: a parentless commit, files under perf-notes/; model names replaced by placeholders in IMPL.md and NOTES.md: put the session's footer line back into IMPL.md on restore).
- Restore in a fresh container: `git fetch origin 'refs/heads/claude/optimistic-rubin-o1glnc-wip-*:refs/remotes/origin/wip/*'`; `git archive origin/wip/notes perf-notes | tar -x -C <scratchpad>` then move perf-notes to scratchpad/perf; licensed models must be fetched again into client/models (git-ignored; see docs/LICENSED_MODELS.md and earlier in the transcript); relaunch unfinished engineers from assign/*.md telling each to start from its wip branch (`git merge origin/wip/<area>` in its worktree).
- Delete the wip branches when their work is merged (`git push origin --delete <branch>`), and say so to the owner.
- Add new engineers to the loop's list (host, nav) when launched: restart the loop with their ids.
- 3:50 PM ET: owner changed the ruleset; read back: required_status_checks = [ci] (integration 15368), strict true. Commit eb67d0f on pr2-integration (pushed to the branch): 12 e2e jobs, E2E_SHARES 14 (NOT 18: browser tests are 234 min now, unit tests' 22 min is the long pole), contribution.md settings table + rule, CLAUDE.md. Remote branch head eb67d0f. Main checkout still at 95f8277 running check bqb5ne7kw (494 suites, no failures so far).
- 4:22 PM ET: usage limit hit; crowd, combat, net engineers stopped; owner said "Try again"; all three resumed by SendMessage. Their WIP commits are on the wip backup branches. Check on 95f8277 passed (3,595 tests); motion check running (bqb5ne7kw). Remote branch head eb67d0f = pr2-integration (frame + wiring + 12 e2e jobs) — the full check has NOT run on that yet.
- 4:50 PM ET: motion check passed on 95f8277 (11,910 played, no regressions). Main checkout fast-forwarded to eb67d0f (= remote head). Full check on eb67d0f running (b8xzsoea3, check-pr2c.log). DRAFT PR 2 opened: hoffspot/conquest#696 (subscribed; no auto-merge while draft). Its CI is the first run of 12 e2e jobs and the first run of the in-game browser tests on PR 2's work: expect failures to fix (bodies at 256 px: pellagos.spec.js:1883 blood texels; frame: 837, 3257, 10394, 10605, 15146, 15418, 15662, 18149, 18385; models: den, crowds, Bellhaven keep). pr2-integration worktree still exists at eb67d0f for side integration (crowd next).
- When ready: rewrite the PR body (numbers from findings-impl-*.md, not-done list), mark ready for review, enable auto-merge, merge by hand when green.
- 5:20 PM ET: crowd engineer done (findings-impl-crowd.md); its 4 commits integrated (game.js conflict: kept #inTurn calls + #outfitting). Scaling plan's 5-5 row + change log updated. First CI run on PR 696 (12 jobs) took 25 min; 5 browser tests failed, one each in 5 jobs:
  1. pin's line test raycast released ground -> test rebuilds the ground (44f0c69).
  2. den test: whole-file fetch made the wait too short -> test holds whole requests 7 s (9b00c1a).
  3. camp palisade: stockades redraw waited up to 0.6 s -> breach sets fortsClock = 0 in the game (350c1dc).
  4. attackers' icon pulse now on ::after -> test reads ::after (4c34979).
  5. "a guard in its crowd..." never becomes a CrowdAvatar with its figure made: UNFIXED, sent to the models engineer a8d7a78d89a3c653b (resumed; told to reset its worktree to origin/...-wip-pr2 and commit a fix on its branch).
- Pushed 4c34979 to the PR branch (second CI run). Local full check NOT run on this head (machine saturated; CI's test job passed lint+unit on eb67d0f in 19 min): lint clean + 171 targeted tests pass locally. Run the full local check before marking the PR ready.
- Owner questions from the crowd stage (ask when presenting PR 2): plate at the quarter level differs 3.2% (> the plan's 2%): keep merged or keep plate one by one?; is the 35% counted with shadow draws (41% without, 24-30% with)?; "whoever's fighting my party" kept in the order?; bars hidden at more than half covered, hired adventurers' never hidden: right?; friends/guilds later?
- 5:35 PM ET: owner decided: plate stays merged; 35% counted in the frame's own pass (5-5 met); rung 5 (whoever fights my party) kept; hired adventurers' bars never hidden. Written into generated/crowd_rendering_plan.md, the scaling plan (wording, 5-5 row, change log v4) and precedence.js's comment: local commit on the branch (backed up to wip-pr2), NOT yet pushed to the PR branch (CI run 2 in progress on 4c34979; push with the next round). Still open for the owner: friends/guilds later; is "more than half covered" the right bar rule.
- 5:45 PM ET: owner: parties only for now; half covered is right. Recorded in crowd_rendering_plan.md (local commit, backed up; goes to the PR with the next push). No crowd questions left open.
- 5:50 PM ET: CI run 2 (4c34979) done: 3 browser tests failed: (a) guard in its crowd (same as run 1) and (b) field battle crowds never drawn (NEW with the crowd-of-players stage; passed on eb67d0f) -> both with models engineer a8d7a78d89a3c653b; (c) "the bars over others" step: far slime's bar hidden by the overlap rule -> crowd engineer a02bdecee0be799ca resumed to re-lay the test out (assertions unchanged) and check other bar tests. The four round-1 fixes held (pin line, den, palisade, attackers' glow passed). Pushed 10e4e3c (two docs commits) to the PR branch: run 3 will fail on the same three until the engineers' fixes are in.
- Told the owner: bar hiding applies to every bar over a head, not only soldiers'; waiting to hear if they want it narrowed.
- TIP: `gh api repos/hoffspot/conquest/actions/jobs/<id>/logs > file` works here and can be grepped locally (cheaper than the MCP log tool); `gh api repos/hoffspot/conquest/commits/<sha>/check-runs` lists results.
- 6:15 PM ET: combat engineer done (findings-impl-combat.md, 11 commits on worktree-agent-acbdbc1c6ff7d3964, base 9ab20b2) and net engineer done (findings-impl-net.md, 15 commits on worktree-agent-a232813c3ecf06a79, take all in order; NET 223->224, SNAPSHOT 52->53 in its last commit 77bdee6 with fixture 53). Combat's "one shape" (OPTIONAL fields, projectile.flown, boss actor.stunned) will trip net's guard test (core/keptactor.js ACTOR_FIELDS/ACTOR_DEFAULTS): net engineer resumed to merge combat's branch into its own, reconcile, remake the fixture.
- Launched PR 3's host engineer a5aadf58c8953f274 and nav engineer a7dd13691d7d5c6b2 (both told to merge origin/claude/optimistic-rubin-o1glnc = PR 2 first).
- PR 3 integration plan: after PR 2 merges, reset branch to main, `git merge` the net engineer's combined branch (net+combat), then host and nav (cherry-pick their own commits past the PR 2 merge), build:manifest, snapshot-fixture, full check, check:motion, soak (the Soak workflow runs on the PR since scripts/soak.js changed).
- Owner should hear (PR 3): wild creatures have no cap on who goes for a player (cap is guards'/soldiers' only); a hero draws its weapon up to 200 ms later for an enemy not after it; healers still search every step; knockdowns on bosses not shortened (only stuns); server now lets time go when >250 ms behind (plan said 250 ms, my note said 1 s); "again" answered once per 10 s; Safari not checked for compression.
- check:motion on combat's branch: one regression (attack/staff/4|human-shortest-f) that the base also gives in a full run under load: watch for it in CI's motion job.
- 6:25 PM ET: owner: hide covered bars for everyone (as built). Recorded in crowd_rendering_plan.md (local commit 'covered bars are hidden for everyone', backed up; push with the next round). Crowd engineer told.
- 6:45 PM ET: models engineer fixed both crowd failures in the game (findings-impl-models-crowdfix.md): (1) a soldier isn't begun in full until the marshal has looked at it with the present room (paced clocks exposed it); (2) #stature ranks by the kind's height, not the body's own (precedence's regression: soldiers built and let go for ever). Picked onto the branch (519d2d3, da68ddc) + manifest; local, backed up to wip-pr2; all eight crowd browser tests pass on its machine with longer start waits. Waiting for the crowd engineer's bars-test fix (its commit aaff58d exists; still checking other bar tests) to push the round together.
- 6:55 PM ET: crowd engineer's bars fix in (findings-impl-crowd-barsfix.md; dcf5a02): the real cause was a body's first frame (its bar drawn far from its head, then hidden as covered and held half a second); game: no bar the frame a body is put down; test re-laid (20 degrees either side; far slime comes to 4 m beside, not 1 m) + one assertion added. Pushed with the two crowd fixes and the docs: PR branch head = manifest commit after dcf5a02. CI run on it should be the first with all known failures fixed. If green: full local check + check:motion, PR body, mark ready, merge.
- Remaining for PR 2 before ready: F13 (garments painted in the worker; resume bodies engineer a87da234a9606675b, tell it to reset to the PR branch) - or leave for a follow-up and say so; durations for new browser tests; PR body.
- 7:00 PM ET: DECISION: F13 (+ F11 remainder, Rig.evaluate/Actions.sample garbage) goes into PR 3, not PR 2, so PR 2 can merge as soon as it is green. Bodies engineer a87da234a9606675b resumed for it, based on the PR 2 branch (reset to origin/claude/optimistic-rubin-o1glnc). Its branch is in neither backup loop's list: back up by hand (backup.sh "a87da234a9606675b:bodies") or add at the next loop restart.
- Running now: bodies (F13 round), net (merging combat), host, nav. Done: loading, world, models (+crowd fixes), frame, crowd (+bars fix), combat.
- 7:45 PM ET: PR 2's final description written: scratchpad/perf/pr2-body.md (fill UNIT_COUNT and CI_NOTE before use). Full local check + motion running on a51813a (bft5ar2tn; logs check-pr2d.log, motion-pr2d.log).
- 7:55 PM ET: net engineer merged combat into its branch (findings-impl-net-merge.md): worktree-agent-a232813c3ecf06a79 tip 6cdc3f2 = net + combat, one design for kept characters (keptactor.js only says what's left out; Battle.snapshot({ keep })), SNAPSHOT_STEPS[52] gives shots flown: 0, fixture 53 remade, NET 224 / SNAPSHOT 53. `git merge` this branch for PR 3. Its AGAIN limit is { every: 10000, burst: 3 } (deviation from slice 1-5's one per 10 s after a soak failure; inference only): tell the owner; burst 1 restores the plan's rule.
- Fixture remake commands after host + nav: npm run build:manifest; npm run snapshot-fixture; node --import ./test/plan-cache.js --test test/snapshots.test.js test/snapshot-fields.test.js test/rare.test.js; git add test/fixtures/snapshots/53.json.gz
- 8:05 PM ET: owner: the guest 'world again' limit as built (three in hand, then one per 10 s) is fine.
- 8:10 PM ET: CI on a51813a finished: 13 jobs green, only e2e (2 of 12) red: tavern test plates 2 != 1 (new with 519d2d3/da68ddc/dcf5a02) -> models engineer a8d7a78d89a3c653b resumed to find it. Guard, field battle and bars tests PASS in CI now.
- 8:35 PM ET: nav engineer done (findings-impl-nav.md): 7 commits on worktree-agent-a7dd13691d7d5c6b2 past 10e4e3c (64bbb7e recast 0.44.0 bit-identical, 4b62d4a leak, c517b1b wrappers, bf1097e generators removed + version test, 403def4 copy bakes ahead + floors in worker + netplay hook `onWay`, cda6826 walkable direct, 8c1b27a comment). No version bump. Integrate: cherry-pick 10e4e3c..tip, `npm install` to regenerate package-lock, build:manifest. Conflicts expected with net (netplay.js, test/netplay.test.js, e2e/together.spec.js) and game.js.
- 8:50 PM ET: host engineer done (findings-impl-host.md): 11 commits on worktree-agent-a5aadf58c8953f274 past 10e4e3c. Not done: tiles kept at 1,024 (Detour refuses more), server keeping the plan between world starts (not its files), finding 9 war's turn spread (would change checksums; plan forbids in Stage 1), might.js stun (would move tiers). First raid at 10 min; an idle player (10 min no command) is marked away as it comes due: tell the owner. Scaling plan change-log row 5 from it (renumber: mine are 3 and 4). New browser test needs durations.
- PR 3 parts done: combat+net (merged, worktree-agent-a232813c3ecf06a79 tip 6cdc3f2), nav (worktree-agent-a7dd13691d7d5c6b2), host (worktree-agent-a5aadf58c8953f274). Running: bodies F13 round. PR 3 can be integrated on a local branch NOW on top of the PR 2 head: do it in a side worktree while PR 2 finishes.
- 9:05 PM ET: PR 3 integrated locally: worktree .claude/worktrees/pr3, branch pr3-integration = PR 2 head a51813a + merge of net+combat (02f7620) + host's 11 picks + nav's 7 picks (one conflict, docs/WAR.md, kept both). Lockfile in sync; manifest and fixture 53 regenerated (uncommitted until tests bfx5azrwo pass); lint clean. node_modules there is a symlink to the main checkout's (still recast 0.43.1 installed: run `npm ci` in the main checkout once PR 3 is on the real branch). Still to add: bodies' F13 round; tavern fix via PR 2. Not yet backed up: push pr3-integration to origin/claude/optimistic-rubin-o1glnc-wip-pr3.
- 10:05 PM ET (11 Nov): PR 2 local full check PASSED on a51813a (3,667 tests, lint clean); motion check half done. PR 2 waits only on the tavern test (models engineer a8d7a78d89a3c653b, commit d7b2cde, still verifying).
- PR 3 integrated branch (origin/...-wip-pr3, c932d11): 341 of 345 shared unit tests pass; 4 fail in test/netplay.test.js (1: nav's onWay hook vs net's ops) and test/snapshot-fields.test.js (3: host's new fields/one shape): net engineer a232813c3ecf06a79 resumed to fix on that branch (it resets its worktree to it; cherry-pick its new commits onto pr3-integration).
- 10:25 PM ET: PR 2 motion check PASSED on a51813a (see bft5ar2tn). Local gate for PR 2 is met for a51813a; any later commit (tavern fix) needs its own targeted tests.
- 10:30 PM ET: tavern fix (test only, stricter: plates by id = [orc]; other floaters only a crier's words; cause: the test raced the crier's speech floater, exposed when 519d2d3 made that stretch quicker) picked and pushed. CI running on the new head. If green: fill pr2-body.md, update PR, mark ready, merge.

## CHECKPOINT 10:45 PM ET, 11 Nov (owner: almost out of usage again)
STATE ON GITHUB (everything below is pushed):
- `claude/optimistic-rubin-o1glnc` = PR 2 (hoffspot/conquest#696, DRAFT), head b2ec8a3. CI running on it (the tavern test fix was the last known failure). Local gates met on a51813a: lint clean, 3,667 unit tests, motion check no regressions; b2ec8a3 adds one test-file change only.
- `claude/optimistic-rubin-o1glnc-wip-pr3` = PR 3 integrated so far (PR 2 + merge of net+combat + host + nav + fixture/manifest), tip c932d11. 341/345 shared unit tests pass; the 4 failing (test/netplay.test.js x1, test/snapshot-fields.test.js x3) are with the net engineer.
- `-wip-net`, `-wip-bodies` (F13 round, WIP), `-wip-combat`, `-wip-host`, `-wip-nav`, `-wip-crowd`, `-wip-models`, `-wip-pr2`, `-wip-notes` (this folder).
WHEN RESUMING:
1. PR 2: check CI on b2ec8a3 (`gh api repos/hoffspot/conquest/commits/b2ec8a3/check-runs --jq '.check_runs[]|"\(.name) \(.conclusion)"'`). If green: fill scratchpad/perf/pr2-body.md (UNIT_COUNT = 3,667; CI_NOTE = the run's time), update the PR body, mark ready (not draft), enable auto-merge, merge by hand (merge method "merge", expectedHeadSha), confirm Pages, unsubscribe, `git checkout -B claude/optimistic-rubin-o1glnc origin/main`, push. Re-time e2e/durations.json from the green run in PR 3 (new tests: crowd bars, two-page outfit, models' den/workers, host's new test).
2. PR 3: resume net engineer a232813c3ecf06a79 (fixing the 4 unit failures on origin/...-wip-pr3; it resets its worktree to that) and bodies engineer a87da234a9606675b (F13 round, based on the PR 2 branch). Then: cherry-pick the net engineer's new commits and the bodies engineer's commits (those past a51813a) onto pr3-integration (worktree .claude/worktrees/pr3); after PR 2 merges, `git merge origin/main` there is NOT needed if PR 2 merged unchanged; put pr3-integration onto the real branch (`git checkout -B claude/optimistic-rubin-o1glnc pr3-integration` after the reset, since it contains PR 2's commits already merged); `npm ci` (recast 0.44.0); build:manifest; snapshot-fixture; full check; check:motion; short soak; push; open PR 3 (body from findings-impl-{combat,net,net-merge,host,nav}.md and the bodies report); subscribe; fix CI rounds; merge; delete all -wip-* branches (tell the owner).
3. If agents can't be resumed (container lost): relaunch from assign/*.md, telling each to start from its -wip-<area> branch.
OWNER DECISIONS RECORDED TODAY: stay on Node 22; 12 e2e jobs; plate merged; 35% counted in the frame's own pass; rung 5 kept; hired adventurers' bars never hidden; half covered; parties only; covered bars hidden for everyone; guest "again" limit as built is fine. OPEN: should bosses'/elites' bars always show; idle player skips the first raid (comes 30 s after return): OK?; fresh iPhone debug logs after PR 2 is live.
- 11:25 PM ET: models engineer's tavern report saved (findings-impl-models-tavern.md); its d7b2cde is already on the PR (b2ec8a3). It flags e2e/pellagos.spec.js 'folk out in the streets' (line ~6117) as a standing risk on a slow runner: counts 80 frames against a real-ms dressing budget; passed in CI so far; left alone.
- 11:40 PM ET: net engineer fixed the 4 unit failures (findings-impl-net-fixes.md): test-only for netplay (the way sent after the last flush) and guard (4 host caches into NOT_KEPT; undefined never kept: keptactor copied() skips undefined). Picked f80ea1e onto pr3-integration (6b9e1d0) + manifest; 66/66 of the affected files pass; fixture unchanged; backed up to -wip-pr3. PR 3 now waits on: bodies' F13 round, PR 2's merge, then full check + motion + soak and CI.
- 11:55 PM ET: bodies round 2 done (findings-impl-bodies2.md): F13 done (garment 56 -> 0.6 ms on the page; first town dressed 494 -> 237 frames), typed vertices done (5.6 -> 1.4 MB), Actions.sample done, Rig.evaluate partly; atlas page copy NOT done (three callers paint at once; owner's call whether arriving players join the stepped queue). 6 commits picked onto pr3-integration + manifest; lint clean; backed up to -wip-pr3. ALL CONSTRUCTION FOR PR 3 IS NOW DONE AND INTEGRATED. Next for PR 3: full check + motion + soak on pr3-integration (in the pr3 worktree; node_modules is a symlink to the main checkout's with recast 0.43.1 installed: fine for tests, which use client/vendor), then wait for PR 2 to merge.

## CHECKPOINT 8:40 PM ET, 11 Nov (clock: earlier note times after about 6 PM were guessed and run late; trust this one)
- PR 2 (hoffspot/conquest#696) MERGED 8:38 PM ET, live on Pages 8:39 PM ET (deploy 54 s). Unsubscribed. Tasks #34 and #36 done.
- Branch reset to origin/main 557d98c + `git merge pr3-integration` (e261246) + durations re-timed from PR 2's green run (058c057; 343 timed, 1 new untimed). Pushed. PR 3 = hoffspot/conquest#697, DRAFT, subscribed, check-in in 45 min (trig_01LctDyvgtPdXuKrq8mpTmX3).
- ALL engineers have finished; none running. Local full check + motion on pr3-integration running in the pr3 worktree (b80lhx52u). Do NOT `npm ci` in the main checkout until it finishes (the pr3 worktree's node_modules is a symlink to it).
- For PR 3's final body: findings-impl-{combat,net,net-merge,net-fixes,host,nav,bodies2}.md. Owner list: wild creatures have no cap; non-player enemies noticed up to 0.2 s later; knockdowns on bosses unchanged; server lets time go past 250 ms behind; +37 MB a running world (third worker); idle player skips the first raid until 30 s after return; Safari untested for compression (Soak workflow is the cross-engine check); arriving players still painted at once; each open question in the CHECKPOINT above.
- After PR 3 merges: delete branches claude/optimistic-rubin-o1glnc-wip-{pr2,pr3,net,bodies,combat,host,nav,crowd,models,notes} (`git push origin --delete ...`), remove worktrees, tell the owner.
- PR 3's final body drafted: scratchpad/perf/pr3-body.md (fill UNIT_COUNT, CI_NOTE, CI_ROUNDS; add any faults CI finds).
- PR 3's final body drafted: scratchpad/perf/pr3-body.md (fill UNIT_COUNT, CI_NOTE, CI_ROUNDS; add any faults CI finds).
- 9:00 PM ET: PR 3 CI round 1: unit test test/peer.test.js 'compress a long message' failed on CI (fixed 50 ms wait): fixed locally (commit 'The link's compression test waits...'), backed up to -wip-pr3, NOT pushed to the PR yet (waiting for the browser jobs of run on 058c057).
- 9:15 PM ET: PR 3 local gates on pr3-integration 2616c31: lint clean, 3,767 unit tests pass, motion check no regressions (560 s on the quiet machine). `npm ci` run in the main checkout (recast 0.44.0).
- PR 3 CI round 1 (058c057) so far: (1) unit test/peer.test.js compress test waited a fixed 50 ms -> waits for what it expects (779cd35); (2) den browser test: the layouts' worker threw "No dungeon theme dragonDen" for a test-only theme -> worker answers none, page makes it as ever (dd02610, game fix + unit test). Both local, backed up to -wip-pr3; push when the run finishes.
- 9:20 PM ET: PR 3 CI round 1, third failure: e2e (1 of 12): the crowd engineer's own bars test ('bars over a file of soldiers seen end-on') finds field-11's bar flipping on two frames running (9.933, 9.967): a one-frame flicker on PR 3's code, never on PR 2's. Crowd engineer a02bdecee0be799ca resumed to find the cause (reset to -wip-pr3). TOOL: scratchpad/failed.sh <job id> prints a job's failures.
- 9:10 PM ET: PR 3 CI round 1 finished on 058c057: 12 green incl. motion; Soak workflow PASSED (cross-engine); 3 failures: unit peer test (fixed 779cd35), den test (fixed dd02610), bars flicker (crowd engineer on it). Pushed dd02610: round 2 running.
- 9:35 PM ET: PR 3 CI round 2 (dd02610): unit test/registry.test.js:92 'runs its clock only while someone's present' failed on CI: world time <= 1000 ms after 1.5 s of wall time (a world just opened lets time go when > 250 ms behind). Test now waits for the world's reported clock > 1200 (local commit, backed up; push when round 2 finishes). Tell the owner: a newly opened world on a slow server runs slow for its first seconds.
- 9:40 PM ET: PR 3 CI round 2 finished on dd02610: 14 green (ALL browser tests, incl. the bars test that flickered in round 1: so the flicker is intermittent), Soak passed again; only the unit registry test failed (fixed, 91e9f6f). Pushed 91e9f6f: round 3 running. Crowd engineer still on the flicker's cause.
- 9:50 PM ET: crowd engineer fixed the flicker (findings-impl-crowd-flicker.md): a soldier's bar blinked off one frame each time its body was built in full in place of its crowd figure, because of the "no bar the frame a body's put down" rule from PR 2 (so the blink is in the merged game since PR 2). Proper fix: #place stands the body on its ground at once (#standsAt), the skip rule removed; new browser test of the hand-over both ways. Picked (5800d9b) + manifest (9677fa1), pushed: CI round 3 running on 9677fa1 (cancelled the run on 91e9f6f). ALL engineers idle. If green: fill pr3-body.md (add faults: worker throwing on unknown theme; bar blink on hand-over; and the two test waits), mark ready, merge.
- 10:10 PM ET: PR 3 CI round 3 (9677fa1): motion job's e2e share: the NEW hand-over bars test failed on CI: Object.assign(null) in playPinned: the debug field battle ran out (FIELD_BATTLE.lasts 300 s of game time) on the slow runner. Both pinned-field tests now keep field.at = battle.time each frame (local commit, backed up; push when round 3 finishes).
- 10:15 PM ET: pushed f9c3eb2 (field battle kept alive in the bars' tests): CI round 4 running. Round 3 on 9677fa1: 13 green + Soak; only the motion job's e2e share failed (the hand-over test); job 12 was still running when pushed (it passed in rounds 1 and 2).
- 10:40 PM ET: PR 3 CI round 4 (f9c3eb2): 14 green + Soak; ONE failure, new and intermittent: e2e (2 of 12) `pellagos.spec.js:7261` "the town's guards stand at its ways out ..." at line 7405: `posing.aside` 3, expected POSING.unseen 8 (a soldier moved behind the camera still posed by its size). Passed in rounds 1-3. Lead investigating: game.js #posing uses heightOnScreen(position, height, pixels, { anywhere: mesh.castShadow }), so one that casts a shadow is posed by size even out of view; whether the moved soldier's mesh casts one (allies near; detail level) varies with timing. Local repro running (bg0b8nmnw, 4 runs). pr3-body.md is complete otherwise.
- 10:45 PM ET: OWNER: "If it's just flaky go ahead and merge and then fix this as needed in a separate PR. I need all your changes visible on main so I can do some analysis in a separate session." Re-ran the failed job of run 43146531162 (e2e 2 of 12; rerun_failed_jobs); PR 697 marked READY, auto-merge (MERGE) on. Local runs of the guards' test: 2 of 2 pass so far (bg0b8nmnw). When `ci` goes green: it merges itself (or merge by hand with head f9c3eb2dce5a6ba6c3a12bbbc171e276107bbdc9); then update the PR body from scratchpad/perf/pr3-body.md, confirm Pages, unsubscribe, reset the branch, FOLLOW-UP PR: fix the guards' posing test (pellagos.spec.js ~7261, line 7405; #posing's `anywhere: mesh.castShadow`), then delete the -wip-* branches and tell the owner.
- Local runs of the guards' posing test on f9c3eb2: 4 of 4 passed (not reproduced on a quiet machine).

## 11:08 PM ET, 11 Nov: PR 3 (hoffspot/conquest#697) MERGED at 11:07 PM ET (auto-merge, after the re-run of e2e 2 of 12 passed). main = c601d30. ALL THREE PULL REQUESTS ARE ON MAIN (695, 696, 697).
- PR body updated to the final description. Branch reset to origin/main and pushed. Check-in trigger deleted.
- STILL TO DO: (1) confirm the Pages deploy of c601d30; (2) follow-up PR: fix the guards' posing test (e2e/pellagos.spec.js "the town's guards stand at its ways out ...", `expect(posing.aside).toBe(posing.seldom)`; game.js #posing uses `anywhere: mesh.castShadow`); (3) delete branches claude/optimistic-rubin-o1glnc-wip-{pr2,pr3,net,bodies,combat,host,nav,crowd,models,notes} after the owner has what they need (ask before deleting -wip-notes: it holds the findings), remove agent worktrees and pr2/pr3 worktrees; (4) task #35 complete.
