# Pellagos performance review: common brief

You are one of several reviewers, each with a different area of the same repository. A lead
reviewer will merge your findings into one report for the game's owner. Your area is in your own
prompt; this file is what all areas share.

## The game

Pellagos is a fantasy action RPG that runs in the browser: `/home/user/conquest` (GitHub
hoffspot/conquest). Three.js r186 (WebGL2), plain ES modules with an import map and no bundler, a
deterministic fixed-step simulation (`client/js/core/`, 50 ms steps) kept apart from drawing
(`client/js/world/`, `client/js/characters/`, `client/js/beasts/`) and from the app shell
(`client/js/app/`, `client/js/main.js`). Multiplayer: a player's own device can host; there is also
a Node world server (`server/`). Unit tests in `test/` (node --test), browser tests in `e2e/`
(Playwright). The docs in `docs/` are long and exact; `generated/` holds earlier plans and reports
(asset streaming, game delivery, multiplayer scaling, world server, hero prediction, navmesh).

## What the owner asked for

"Take a full performance pass at the game, examining the versions of imported libraries like
three.js as well as all components of game logic and the full suite of tests. Carefully analyze
every aspect of game functionality and write a set of recommendations for improvements if any are
uncovered that are worthwhile to implement."

Their answers to our questions:
- All four matter: phones (frame rate, stutters, Safari closing the tab for memory), loading,
  multiplayer and servers, test and CI time.
- Weakest device to run well on: recent iPhones (iPhone 15 and newer), in Safari. Macs and desktops
  too. Older phones don't have to run well.
- Visual changes may be recommended ONLY if a player couldn't perceive them (for example lower
  detail at a distance). Nothing that makes the game look plainer.
- Scope is "everything worth improving": performance first, but also bugs, code structure, and
  gameplay or design observations you come across.

## What is already done (do not re-recommend it)

The project has a lot of performance work in place and documents it. Before forming findings, read:
- `docs/GAME.md`, the section `## Performance` (starts near line 7067, about 110 lines) and the
  `## Testing` section after it.
- The parts of the other docs and of `generated/*.md` that touch your area (grep them).
A recommendation that the code already implements is worse than none. If a plan in `generated/`
proposes something not yet built, say so (planned, not done) rather than presenting it as new.

Known from this session (already merged, 2026-11-11):
- Three crash reports from the owner's iPhone had Safari close the tab at about 540 to 575 MB
  tracked (GPU textures 220 to 235 MB, sound about 82 MB decoded, bodies 76 to 129 MB, building
  floors 33 to 54 MB). Each character body drawn in full holds about 12 MB of textures on Low (its
  skin plus each garment's 512x512 picture and bump map).
- A memory guard now reacts on touch devices (`client/js/app/memoryguard.js`, `game.js`
  `#memoryGuarding`): past 400 MB and 460 MB it holds fewer bodies in full and less decoded sound.
  It treats the symptom; the base cost is unchanged.
- `QUALITY` levels are in `client/js/world/view.js` (about line 72): low, medium, high.

## Rules

- READ-ONLY on the repository. Do not edit, create or delete anything under `/home/user/conquest`
  or `/home/user/conquest-models`. No git commits, pushes, branches, pull requests, or GitHub posts.
- Put any scratch scripts and notes under
  `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/<your-area>/`.
- The licensed models are in `client/models/` on this machine only (git-ignored). Never copy them
  out of the repository directory or into any output.
- Do NOT launch browsers or start the game's servers: the lead does the in-browser profiling, and
  parallel browsers would spoil each other's timings. You may run Node (the unit tests' way of
  importing modules, small benchmark scripts of your own in the scratch folder, `npm run
  step-budget`, `npm run soak` and the like).
- The machine has 4 cores shared with the other reviewers, and a background job is timing the unit
  tests for roughly the first 30 minutes. Wall-clock timings are noisy: prefer counts (calls,
  allocations, bytes, draw calls, algorithmic growth) and reasoning from the code; when a timing
  decides something, run it at least three times and report the spread.
- Don't use sub-agents. Don't ask the owner questions; if something only they can answer would
  change a recommendation, list it under "Questions for the owner".

## Evidence standard

Every finding must be checkable. Cite `path:line` and say what the code does there. Label each:
- MEASURED: you ran something; give the numbers and the command or script.
- READ: you traced it in the code; the cost is reasoned (show the arithmetic).
- SUSPECTED: plausible, not confirmed; say exactly how to confirm it.
Don't inflate. Six solid findings beat twenty weak ones. If your area is in good shape, say so and
say what you checked. Do not present something as a problem unless you can say who pays for it
(a phone's frame, its memory, the load time, a server's step, CI minutes, a contributor's time) and
roughly how much.

## What to hand back

Write your full findings to
`/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-<your-area>.md`
and end your reply with a summary of at most 400 words (the top findings in rank order, and the
path of that file). The file has these parts:

1. **Findings**, ranked by value, at most 15. For each:
   - a title that states the change;
   - where (`path:line`);
   - what happens now, and what it costs whom (with the number);
   - the change proposed, concretely enough to start on;
   - the gain expected (measured or estimated, and say which);
   - effort: S (a day or less), M (2 to 5 days), L (over a week);
   - risk: what could break; whether it changes the simulation (the netplay and snapshot version
     numbers would need bumping) or anything a player could see;
   - confidence: MEASURED, READ or SUSPECTED;
   - how to verify it worked.
2. **Checked and already good**: short list, so the report can say what needs no work.
3. **Bugs** you came across (not performance): where, what goes wrong, how sure you are.
4. **Code structure** observations worth acting on (not style nits).
5. **Gameplay and design** observations, if your area has any.
6. **Questions for the owner**, if any.
