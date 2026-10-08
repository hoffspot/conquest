# Contributing to Pellagos with Claude Code

This is how to set up Claude Code in your own account so it can work on this game, run the same
checks CI runs, and open a pull request that's safe to merge. It's written for a person and for
Claude: point Claude Code at this file before it starts (the repository's `CLAUDE.md` does this for
you in every session).

## The standing rule: keep this document current

> **contribution.md is part of the development pipeline.** Any change to how the game is set up,
> built, tested, checked or merged updates this document in the same pull request. That includes:
> `package.json`'s scripts or Node version; anything in `.github/workflows/`;
> `playwright.config.js`, `eslint.config.js`, `e2e/fixtures.js` or how the browser tests are split;
> `scripts/`; the tools in `utilities/` and their checks; the rules for the version numbers; the branch, review and merge conventions; what
> an environment needs to run the checks; and the repository's settings on GitHub (section 6,
> *The repository's settings*). A pull request that changes the pipeline without updating this
> file isn't ready to merge.
>
> **Only the owner (hoffspot) can change the repository's settings.** When a change needs one
> changed (a CI job added, renamed or removed; a different number of browser test jobs; a new
> rule for `main`), say so to the owner, with the exact steps, in the pull request and in your
> session. Update the settings table in section 6 in the same pull request, and check that the
> owner has made the change before it's merged. Whenever a setting is changed or added, the table
> is updated to match.

The rule is written down three times, so no one can miss it:

- here;
- in `CLAUDE.md`, which Claude Code reads at the start of every session in this repository;
- in `test/contribution.test.js`. It fails when an npm script, a workflow, a CI job or the Node
  version changes and this file hasn't been updated to match, and when a CI job isn't among the
  required checks in the settings table. That test is the part of the rule a machine can check;
  everything else is up to you and your reviewer.

## What you need

- A GitHub account.
- Claude Code: the command line, the desktop app, or Claude Code on the web
  (<https://claude.ai/code>). It runs on your own Claude plan, so its usage is yours.
- Node.js 22 or newer (`package.json`'s `engines`; CI uses 22).
- Chromium for the browser tests. Playwright downloads it, or you point it at one you already
  have with `CHROMIUM_PATH`.

Nothing in this pipeline costs money. CI runs on GitHub's free runners for this public
repository, and the game needs no paid services, keys or secrets. Never add a secret to the
repository or to a pull request.

## 1. Get the code where Claude can reach it

The repository is public: <https://github.com/hoffspot/conquest>.

- **Without write access (most contributors):** fork it on GitHub, and have Claude Code work on
  your fork. Your pull requests go from your fork's branch to `hoffspot/conquest`'s `main`.
- **With write access** (ask the owner, hoffspot): work on a branch of your own in the
  repository. Never push to `main`.

### Claude Code on the web (a cloud session)

1. Connect GitHub to Claude: <https://claude.ai/connect-github>. If the Claude GitHub App isn't
   installed on your fork (or on the repository, if you have write access), install it from that
   page.
2. Create a cloud environment for the repository (in claude.ai/code, from the environment menu;
   the steps are at <https://code.claude.com/docs/en/cloud-environments>):
   - **Network access:** any level that lets the package managers through (the default does).
     `npm ci` needs the npm registry; nothing else is fetched.
   - **Setup script:** `npm ci`
   - **Environment variables:** `CHROMIUM_PATH=/opt/pw-browsers/chromium`. Chromium is already
     installed in Claude's cloud containers. Don't have Claude run `npx playwright install`
     there.
3. Start a session with your fork (or your branch) selected and give it the task. Ask it to
   follow `contribution.md`.

### Claude Code on your own computer (the command line or desktop app)

```sh
git clone https://github.com/<you>/conquest.git   # your fork
cd conquest
npm ci                                            # exactly the versions in package-lock.json
npx playwright install chromium                   # once; or set CHROMIUM_PATH instead
npm start                                         # http://localhost:8080 (PORT=3000 for another port)
```

Then run `claude` in the folder. Claude Code asks before running commands and before editing
files. Read what it wants to do, above all a `git push`.

## 2. The checks: what CI runs, and how to run them yourself

CI (`.github/workflows/ci.yml`) runs on every pull request, and on `main` when one is merged. A
pull request's run is cancelled when you push to it again; only its newest commit's run counts.
`main`'s runs always run to the end. A job that hangs is ended at about twice the longest it's
taken, rather than held to GitHub's 6 hours: `test` at 20 minutes (it takes about 7½), `motion` at
25 (about 10), each `e2e` job at 20 (about 9; its Chromium download is tried three times, 5
minutes a try).

| CI job | What it runs | Locally |
| --- | --- | --- |
| `test` | `npm ci`, then `npm run lint` (ESLint) and `npm test` (Node's test runner, `test/*.test.js`) | `npm run check`, which runs both |
| `e2e` (8 jobs side by side) | each job's share of the Playwright browser tests (`e2e/*.spec.js`), split by how long each took (`scripts/e2e-shard.js`, `e2e/durations.json`) | `npm run test:e2e`, or only the tests you touched (below) |
| `motion` | `npm run check:motion`: the motion check (below), failing on anything worse than its baseline. Its report is kept with the run as `motion-report` | `npm run check:motion` |

`.github/workflows/pages.yml` runs when `main` changes: lint and the unit tests again, then
`npm run build:manifest`, and it publishes `client/` to GitHub Pages
(<https://hoffspot.github.io/conquest/>); its build is ended at 20 minutes and its deploy at 15.
Whatever is merged to `main` goes live, so `main` must always be green.

### Every npm script

| Script | When to run it |
| --- | --- |
| `npm start` | Serves the game and the multiplayer relay on port 8080. Open `/?play` to go straight into a game (`&seed=12`, `&people=elf`, `&quality=low`) |
| `npm run dev` | The same, restarting the server when its code changes |
| `npm test` | Every change. The unit tests take a few minutes |
| `npm run lint` | Every change. ESLint must be clean |
| `npm run check` | Lint and the unit tests together: run it before every push |
| `npm run test:e2e` | Changes to the game in the browser: the screens, controls, HUD, drawing, multiplayer |
| `npm run check:motion` | Changes to how characters move or what they're built from: the body, bones, joints, walking, attacks, rests, items, clothes (below). About 5 minutes |
| `npm run e2e:durations` | After adding browser tests, or making them much slower or quicker (below) |
| `npm run build:manifest` | After changing anything under `client/`. It lists what the game downloads before it starts (`client/js/app/manifest.js`, the data with the hashes of its bytes), and the catalog of models downloaded only as they're wanted (`client/js/app/assets.js`, from `client/models/assets.json`). The unit tests fail until you do |
| `npm run build:characters` | Only when rebuilding the body from MakeHuman's MPFB2 (`-- --mpfb2=../mpfb2`). Then `npm run build:vitruvian`, which carries its shapes over |
| `npm run build:vitruvian` | Only when rebuilding the Vitruvian body (`client/characters/vitruvian.*` and its masks) from CharMorph's Vitruvian, or after rebuilding the MakeHuman body, whose shapes it carries over. It needs Vitruvian's files, and its `char.blend` is in Git LFS: `git clone --depth 1 https://github.com/Upliner/CharMorph-Vitruvian ../charmorph-vitruvian`, then fetch `char.blend` on its own as the top of `scripts/build-vitruvian.js` says, then `-- --from=../charmorph-vitruvian`. About 4 minutes. Then `npm run build:manifest` |
| `npm run build:music` | Only when remaking the music's instrument recordings |
| `npm run build:sounds` | Only when remaking the recorded sounds (`client/sounds` and `client/js/audio/recorded.js`: footsteps, and the recipes in `scripts/sounds`). It downloads their CC0 and public-domain recordings once, into `.cache` (about 700 MB: Freesound's previews, the VCSL's samples, the National Park Service's, OpenGameArt's, Kenney's and an itch.io pack whole), and takes a few minutes. Then `npm run build:manifest`, and describe any new sound in `client/js/audio/catalog.js` |
| `npm run build:clips` | Only when remaking the character lab's animation clips, or the clips baked into the game's attacks, rests, guards' sway, flinches and dodges (`client/js/characters/clip-keys.js`, from `scripts/bake-clips.js`'s list, baked on MakeHuman's body whichever the game plays on: `BAKE_BODY`; a rest's timing in `client/js/core/roles.js` is its clip's, which the tests check). It needs Mesh2Motion's files: `git clone --depth 1 https://github.com/Mesh2Motion/mesh2motion-app ../mesh2motion-app`, then `-- --from=../mesh2motion-app/static/animations` |
| `npm run build:footprints` | After changing how a prop or a yard's fence looks (`client/js/world/art/kits/props.js`, `peoples/props.js`, `kits/yards.js`): measures what each stands on into `client/js/core/setpieces/outlines.js`, which the navigation mesh walks round. `test/footprints.test.js` fails until you do. Then `npm run build:manifest` |
| `npm run vendor:three` | Only after changing the `three` version in `package.json`, or which of its add-ons the game uses (`ADDONS` in `scripts/vendor-three.js`). Then `npm run build:manifest` |
| `npm run vendor:meshopt` | Only after changing the `meshoptimizer` version |
| `npm run vendor:recast` | Only after changing the recast-navigation version |

### The browser tests

They play the game in Chromium, in software without a GPU, so they're slow (each has 2 minutes).
Run the ones your change touches, one at a time:

```sh
CHROMIUM_PATH=/opt/pw-browsers/chromium E2E_PORT=8096 \
  npx playwright test e2e/pellagos.spec.js -g "<part of the test's name>" --workers=1 --reporter=line
```

- `E2E_PORT` picks the port for the test server, so it doesn't clash with a game you're running
  (the default is 8095).
- `rm -rf test-results` first, if an earlier run left its pictures and traces there.
- A test that waits on the game's time stops the game and plays it on by hand (`playUntil` in
  `e2e/pellagos.spec.js`). Do the same in new tests, and never wait on the clock.
- After adding browser tests, time them as CI runs them so CI's split stays even:
  `PLAYWRIGHT_JSON_OUTPUT_NAME=report.json npx playwright test --workers=1 --reporter=json`,
  then `npm run e2e:durations -- report.json`. Commit `e2e/durations.json`, not the report.

### The motion check

`scripts/motion-check.js` plays every motion the characters make on each people's bodies at the
ends of their builds (thinnest, shortest, bulkiest, tallest), holding what they hold. It measures:

- joints turned past their ranges;
- things held or worn sunk into the body, and forearms or hands sunk into the torso;
- planted feet sliding, and feet in the ground;
- a two-handed weapon's second hand off its haft.

What's wrong already is kept in `test/motion-baseline.json`. The check fails only on what's new or
worse than that, so CI catches a change that makes any motion worse on any body.

```sh
npm run check:motion                      # everything (about 5 minutes, all your threads)
npm run check:motion -- --only attack/    # only the motions whose ids start so
npm run check:motion -- --body orc-       # only those bodies
npm run check:motion -- --update          # keep this run's failures as the new baseline
npm run check:motion -- --data vitruvian  # on another body's data (the baseline is the game's body's)
```

- **To see what it found**, run `npm start` and open `/motion-sheet.html`. It draws each failure
  as it happened, the spot ringed in red, worst first; what's worse than the baseline is outlined
  in amber (*Only what's new*). Tick *Close up* to look closely. It reads the report the check
  leaves beside it (`client/motion-report.json`, not committed); a CI run's `motion-report`
  artifact can be chosen with *Report*.
- **To watch a motion through**, open `/motion-sheet.html?film=attack/gauntlets/5,attack/sword/0&body=human-tallest-m&frames=8`:
  each motion a row of frames from its start to its end on that body (ids as the report has
  them). Add `&view=front` or `&view=side` to see it from there, and `&data=vitruvian` (or
  `human`) for another body's data. Use it for before-and-after pictures of a motion you've
  changed.
- **When it fails** (`WORSE:` lines): fix the motion. If the change is right and the motion was
  meant to change, run it with `--update`, which says again what got worse, and say why in the
  pull request.
- **When something got better** (`better:` lines), run it with `--update` and commit the smaller
  baseline, so the improvement is kept.

### The tools in `utilities/`

`utilities/blenderpipeline/` turns `.blend` files into GLB models for the game, with their
animations (its `README.md`). It's a project of its own, with its own `package.json`, lockfile
and tests. The game's `npm ci` doesn't install it, and CI doesn't run its tests, because it needs
Blender (a large download). CI's `npm run lint` does lint its JavaScript (`eslint.config.js`).
When you change anything in it, run its checks there:

```sh
cd utilities/blenderpipeline
npm ci
npm run setup          # once: Blender as a Python module, in .venv (Python 3.11; about 1 GB)
npm run build          # rebuild the examples into dist/, and commit dist/
npm test               # unit tests, and every example built with Blender: fit, and as dist/ has it
CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:browser   # every GLB played in Three.js
```

- `npm run setup` needs Python 3.11 and the Python package index (PyPI), which the cloud
  environments' default network access lets through. Or set `BLENDER` to a Blender 4.2 or later.
- `npm test` fails if `dist/` isn't what the sources build: after changing the pipeline or an
  example, `npm run build` and commit `dist/`.
- Bought assets never go in the repository, built or not: `utilities/blenderpipeline/private/`
  is ignored by git for them (section 3, *Assets*).

## 3. Making a change

1. **Start from the latest `main`**, on a branch named for the change
   (`git fetch origin main && git checkout -b <you>/<what-it-does> origin/main`). One topic per
   pull request: small pull requests are reviewed quickly and are easy to undo.
2. **Read the docs for what you're changing first.** The game's design lives in `docs/`
   (`GAME.md`, `WORLD.md`, `WAR.md`, `WILDS.md`, `DUNGEONS.md`, `MAGIC.md`, `CHARACTERS.md`), the tooling in
   `README.md`, and plans in progress in `generated/` (e.g.
   `generated/terrain_navmesh_overhaul_plan.md`).
3. **Write the code the way the code around it is written:**
   - Four-space indents, double quotes, semicolons. There's no formatter: don't run Prettier or
     any other formatter over the code. ESLint (`eslint.config.js`) is the only style check.
   - `client/js/core/` is the game's rules, its world generation and multiplayer. It must not
     touch the DOM (it also runs under Node). It must come out the same in every browser: use
     `client/js/core/exact.js` (`sin`, `cos`, `atan2`, `hypot`, `sqrt`, `pow`, `log`, `exp`)
     instead of `Math.sin` and the like, and the seeded random numbers
     (`client/js/core/random.js`) it's given, never `Math.random`. Two players' browsers must
     build the same world and play out the same fight.
   - The game has to run well on a phone (the budget is an iPhone 16 Pro). Anything costly to
     draw goes under the Visual quality setting's levels.
   - A new shield (an item in `ITEMS`, `client/js/characters/equipment.js`, held on the left
     forearm or fist) must say whether it's slung on the back once the weapons are put away:
     `sling: true` for a round, kite or other strapped shield light and short enough, `false`
     for one that isn't (a tower shield, one with spikes round its rim, one carried by a stick).
     The reasons for each are kept beside `SLING` and in `docs/CHARACTERS.md`. A test fails if
     a shield doesn't say.
   - A new blade hung at the hip (`SHEATHS`, `hangs: true`) goes on a frog (`leftFrog`), with
     `round` (degrees round the front of the hip) if 35° doesn't suit it. It's fitted to each
     body and canted 45°, and the left hand rests on its pommel walking. A test checks the cant
     and the fit on every motion-check body. A rest whose left hand passes that hip must bring it
     over the hilt and scabbard, not through them (the sentry's `ARMED_*` rests). Or it can rest
     the hand on the pommel with `pommel: 1` in its keys.
   - A sound added or changed (`SOUNDS` in `client/js/audio/synth.js`, or a recording in
     `client/js/audio/recorded.js` by `npm run build:sounds`) is described in
     `client/js/audio/catalog.js`: its group, its name, what it is and when the game plays it.
     The sound studio (`client/sound-studio.html`) shows and plays it from there, so keep its
     words true when the sound or where it plays changes. A recording names its source in
     `SOURCES` (title, recordist, page, licence). `test/audio.test.js` fails if a sound isn't
     described or a recording has no CC0 source.
4. **Bump a version number when you change what it guards:**
   - `NET_VERSION` (`client/js/core/netplay.js`): anything players' games say to each other, or
     anything that changes the world or the rules two games must agree on. A game of another
     version can't join.
   - `SNAPSHOT_VERSION` (`client/js/core/host.js`): what a snapshot of the world holds.
   - `SAVE_VERSION` (`client/js/app/save.js`): the save format. A save from another version is
     set aside, not misread; or, where it can be, moved to the new one, as version 1's one
     character is (save.js `migrate`). Players keep their characters.
   - The caches' versions (the `-v2` in `client/sw.js`): never for a release. Data is kept by the
     hash of its bytes, so a changed model, body or image needs nothing. Change the shell's
     (`SHELL`) only to let go of code no release uses any more, such as an old Three.js's
     folder; the others only when how they're laid out changes. Changing one lets go of all it
     holds, and nothing else.
5. **Test it.** Add or update unit tests (`test/*.test.js`, `node:test`) for every change to the
   rules, the world or the tools, and a browser test (`e2e/`) for anything a player does on
   screen. Never skip, disable or loosen a test to get CI green: fix the cause.
6. **Show it.** For anything that changes how the game looks, take before and after pictures
   from the same place, and put them in the pull request. Picture sheets and scratch scripts
   aren't committed.
7. **Document it.** Update the `docs/` page for the game's behaviour, `README.md` for tooling,
   and this file for the pipeline (the standing rule).
8. **Assets:** only your own work, or CC0, MIT and similarly permissive assets, each with its
   licence file and a credit in `README.md`'s *Credits and license*. Nothing with a licence that
   restricts use. That goes for the tools' test assets in `utilities/` too. A bought model, and
   anything built from it, stays out of the repository: keep it in `utilities/blenderpipeline/private/`,
   which git ignores. Third-party code goes in `client/vendor/` through a `scripts/vendor-*.js`
   script.
9. **Heavy models go in the catalog, not in what's downloaded before the game starts.** That has
   a budget, `BOOT_BUDGET` in `test/manifest.test.js` (12 MB), and raising it is a choice to make
   in review. A model the game can start without goes in `client/models/assets.json`: each with
   its `tier` (`near`, fetched when it's predicted to be wanted soon, or `demand`, only once it's
   needed) and its `files` (`path`s under `client/`, its lower-detail copy first), and whatever
   else `generated/asset_streaming_plan.md` (section 2) says it needs. Then `npm run build:manifest`.

## 4. Before you push

Run these and fix everything they find:

```sh
npm run build:manifest   # if anything under client/ changed
npm run check            # lint + unit tests, as CI's test job runs them
npm run check:motion     # if characters' motions, bodies or what they hold changed
npx playwright test ...  # the browser tests your change touches (above)
# if anything under utilities/blenderpipeline/ changed, its own checks there (section 2)
git status               # only the files you meant to change
```

- **Docs only** (nothing changed but Markdown files: `docs/`, the plans in `generated/`,
  `README.md`, this file): run none of the checks that run code. CI still runs them all, and
  `test/contribution.test.js` reads this file, so a script it no longer names fails there.

- Add files by name (`git add path/to/file`), not `git add -A` or `git add .`. Never commit
  `node_modules/`, `test-results/`, `playwright-report/`, reports, pictures you took to check
  your work, or scratch files.
- Read your own diff as a reviewer would.
- Write a commit message that says what changed and why. If Claude wrote the commit, it adds
  its own `Co-Authored-By` line. Keep it.

## 5. Opening the pull request

1. Push your branch (`git push -u origin <branch>`) to your fork, or to the repository if you
   have write access.
2. Open a pull request against `hoffspot/conquest`'s `main`. Say:
   - what it changes and why;
   - how you tested it (which unit and browser tests; what you checked by playing);
   - before and after pictures for anything that looks different;
   - any version you bumped.
3. CI runs: the `test` job, the `motion` job and the 8 `e2e` jobs, about ten minutes. A first-time contributor's
   CI may wait for a maintainer to approve the run.
4. If CI fails, read the failing job's log, reproduce it locally, fix it and push again. A
   failure is never "just flaky" until a re-run of the same commit passes and you know why it
   failed. Don't push empty commits, or close and reopen the pull request, to set CI going again.
5. If `main` moves on, bring your branch up to date (section 6).
6. Answer every review comment: change the code, or say why not.
7. A maintainer merges it, with a merge commit, once CI is green on a head that's up to date with
   `main` and it's been reviewed. Don't merge your own pull request unless the owner has said you
   may. Once it's merged, GitHub Pages publishes the game from `main`.

## 6. Merging cleanly when others are working too

Several people, and their Claude sessions, work on this repository at once. A pull request's CI
tests it merged into `main` as `main` was when CI ran. If someone else merges first, your green
tick may no longer be true: the two changes can conflict, or each pass alone and fail together
(both bump `NET_VERSION` to the same number; both add to the same table).

**Before you merge (or ask for a merge):**

1. Bring the branch up to date: `git fetch origin main && git merge origin/main`. Merge, don't
   rebase: rebasing rewrites commits other people may have checked out. Never force-push a branch
   someone else has.
2. Resolve conflicts as described below, then run the checks again: `npm run build:manifest`,
   `npm run check`, and the browser tests the change touches.
3. Push, and wait for CI to go green on that new head.
4. Merge only if `main` hasn't moved again in the meantime. If it has, go back to step 1.

### The repository's settings

GitHub enforces all of that. There's no merge queue, because that's only for repositories owned by
an organisation and this one belongs to a person. These are the settings as they stand; keep this
table current (the standing rule). They were last checked on 2026-10-04, after `motion` was made a
required check.

| Where | Setting | As it is |
| --- | --- | --- |
| *Settings → Rules → Rulesets*, the ruleset `main` | Enforcement | Active, on the default branch (`main`); nobody can bypass it, the owner included |
| | Restrict creations | On. It covers only creating `main` itself, which already exists, so it changes nothing day to day |
| | Restrict deletions | On |
| | Block force pushes | On |
| | Require a pull request before merging | On, with 0 approvals required. A maintainer reviews, but can't approve a pull request they opened themselves |
| | Require status checks to pass | On. Required checks, from GitHub Actions: `test`, `motion` and `e2e (1 of 8)` to `e2e (8 of 8)` |
| | Require branches to be up to date before merging | On |
| *Settings → General → Pull Requests* | Allow auto-merge | On |
| | Always suggest updating pull request branches | On (the *Update branch* button) |
| | Merge methods | Merge commits, squash and rebase are all allowed; this repository's convention is a merge commit |

**Every CI job is a required check.** A job that's added must be added to the ruleset once it has
run on a pull request (GitHub only offers checks it has seen). A job that's renamed or removed must
be changed in or taken out of the ruleset, or every pull request waits for a check that never
comes. The same goes for the number of `e2e` jobs: each is required by its name, `e2e (N of 8)`.
Only the owner can make these changes, so ask them, with the steps:

1. *Settings → Rules → Rulesets → main → Require status checks to pass → Add checks*.
2. Type the job's name, and choose the one from GitHub Actions. Remove any check that no longer
   exists.
3. *Save changes*.

Then the routine is: *Update branch* on the pull request (it merges `main` in), then *Enable
auto-merge*. GitHub merges the pull request once it's green on that up-to-date head. If `main`
moves first, update the branch again.

**Conflicts in files no one should merge by hand:**

| File | What to do |
| --- | --- |
| `client/js/app/manifest.js`, `client/js/app/assets.js` | Take either side, then `npm run build:manifest`. They're generated from everything under `client/` and from `client/models/assets.json` (which is merged by hand: keep both sides' models). |
| `client/js/characters/clip-keys.js` | Generated: take the side whose `scripts/bake-clips.js` list you keep, then `npm run build:clips -- --from=...` (above) if both changed it, and `npm run build:manifest`. A clip rest's `hitAt` and `duration` in `client/js/core/roles.js` are its clip's `hit` and `seconds` there. |
| `client/js/core/setpieces/outlines.js` | Generated: take either side, then `npm run build:footprints` on the merged code, and `npm run build:manifest`. |
| `client/characters/vitruvian.json`, `vitruvian.bin`, `vitruvian/masks/*.png` | Generated together: take one side's three, never a mix, then `npm run build:vitruvian -- --from=...` (above) if both sides changed what it's made from (`scripts/build-vitruvian.js` or the MakeHuman body), and `npm run build:manifest`. |
| `package-lock.json` | Take `main`'s, then `npm install` to bring your own dependency changes back in. |
| `e2e/durations.json` | Take both sides' entries. Re-time your own tests if they changed (section 2). |
| `test/motion-baseline.json` | Take `main`'s, then `npm run check:motion` on the merged code. Run it with `--update` only for what your own change meant to make different, and say so. |
| `NET_VERSION`, `SNAPSHOT_VERSION`, `SAVE_VERSION` | If both sides bumped one, take the higher number and add one. The merged game is different from both. |
| `docs/*.md`, the plans in `generated/` | Keep both sides' text. Change-log entries stay in date order. |

**Claude sessions merging their own pull requests** (only where the owner has said so): bring the
branch up to date and have CI green on that head, as above. Use auto-merge where it's turned on,
and merge by hand only when `main` hasn't moved since the green run.

## Working with Claude Code: what to ask for

A good first message in a session:

> Read contribution.md and CLAUDE.md. Then: <the change>. Branch from the latest main, follow the
> conventions there, add tests, run `npm run build:manifest`, `npm run check` and the browser
> tests the change touches, show me the diff and the pictures, and only then commit and push.
> Don't open the pull request until I say so.

- Keep Claude's permission prompts on for `git push` and anything that leaves your machine.
- Claude Code on the web can watch your pull request: ask it to subscribe to the pull request's
  activity, and it will answer review comments and fix CI failures as they come in.
- If Claude says it can't reach something (GitHub, the npm registry, a host it needs), it's your
  environment's settings, not the code. Its message says where to change them.
- Claude follows the rules here, but you're the contributor: review what it pushes as your own
  work.

## When something goes wrong

| What you see | What to do |
| --- | --- |
| `manifest.test.js` fails: "is up to date" | `npm run build:manifest`, and commit `client/js/app/manifest.js` and `client/js/app/assets.js` |
| `manifest.test.js` fails: "within its budget" | What's downloaded before the game starts has grown past `BOOT_BUDGET`. Move a heavy model to the catalog (section 3, rule 9), or raise the budget and say why in the pull request |
| `contribution.test.js` fails | You changed the pipeline: update this file (the standing rule) |
| The Blender pipeline's `npm test` says `dist/` differs | `npm run build` in `utilities/blenderpipeline`, and commit `dist/` |
| The Blender pipeline says "No Blender to run" | `npm run setup` there (it needs Python 3.11), or set `BLENDER` to a Blender 4.2 or later |
| Browser tests can't find Chromium | `npx playwright install chromium`, or set `CHROMIUM_PATH` to a Chromium or Chrome |
| Browser tests time out locally | Run fewer at once (`--workers=1`), and close other heavy programs: drawing without a GPU is slow |
| The port's in use | `E2E_PORT=8096` for the tests, `PORT=3000` for `npm start` |
| `npm ci` fails in a cloud session | The environment's network access must let the npm registry through, and its setup script be `npm ci` |
| A conflict in `manifest.js`, `assets.js`, `package-lock.json` or a version number | Section 6: regenerate it or take the higher number; don't merge it by hand |
| The `motion` job fails | Its `WORSE:` lines say which motion, on which body, and what. Draw them: `npm run check:motion`, then `/motion-sheet.html?new=1` (section 2) |
| A pull request waits on "Expected — Waiting for status to be reported" | A required check that CI no longer runs (a job renamed or removed). The owner updates the ruleset (section 6, *The repository's settings*) |
| An `e2e` job failed at *Install Chromium for the end-to-end tests* after three 5-minute tries, or was ended at 20 minutes | Playwright's download hung: not your change. *Re-run failed jobs* on the run. If its log says a library is missing, the runner's image changed: CI installs Chromium without `--with-deps` (apt-get there has hung for good), so add the library to the step |
| Another CI job "has exceeded the maximum execution time" | It ran twice as long as it ever has. A unit test or the motion check that hangs (a promise that never settles, a loop that never ends) is the usual reason: run the job's checks locally. If it was only slow, raise its `timeout-minutes` in `.github/workflows/`, and say why in the pull request |
| A CI job cancelled after about 15 minutes, with no steps and no logs | It was never given a runner: GitHub's doing, not your change. *Re-run failed jobs* on the run |
| CI was green, but red after merging `main` in | Someone else's change and yours don't fit together. Fix it on your branch before merging (section 6) |
