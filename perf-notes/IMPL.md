# Implementing the performance review: common brief

You are one of several engineers, each implementing a different, named part of a performance review
of the game Pellagos (repository hoffspot/conquest). A lead integrates everyone's commits into three
pull requests. Your part is in your own prompt; this file is what all parts share.

## Where things are

- The review's findings, with file and line for each: one file per area in
  `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-<area>.md`
  (areas: render, bodies, combat, host, app, loading, multiplayer, tests, platform). The reviewers'
  own benchmark scripts are in the sibling folders of the same names; several are worth re-running to
  prove your change (each findings file says how).
- The repository's rules: read `CLAUDE.md` and `contribution.md` in your checkout BEFORE changing
  anything, and the docs for what you change (`docs/*.md`). They are binding.

## Your checkout

- You work in your own git worktree (your current directory). Do everything there. Never edit
  `/home/user/conquest` itself or `/home/user/conquest-models`.
- First: `npm ci`. Then put the licensed models in place for the tests that need them:
  `cp -rn /home/user/conquest/client/models/. client/models/` (they are git-ignored; NEVER `git add`
  anything under `client/models/beasts`, `client/models/scenery` or any other ignored path, and never
  copy them anywhere else).
- Commit your work on your worktree's branch in small, named commits. Do NOT push, do NOT open or
  touch pull requests, issues or anything on GitHub. The lead cherry-picks your commits.
- `git add` files by name only (never `git add -A` or `git add .`).
- Every commit message ends with exactly these two lines:
  `Co-Authored-By: <the model name the session gives> <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01XUfY7aYkNK4hmgUhgCyVx4`
  and names no AI model anywhere else. Write the message as the repository's are written
  (`git log -8` to see: a plain sentence saying what changed, then why).

## How to write the code

- As the code around it is written: four-space indents, double quotes, semicolons, private `#methods`
  where the class uses them, and comments in the codebase's own plain style that say why. No
  formatter (no Prettier). ESLint is the only style check: `npx eslint <the files you changed>`.
- `client/js/core/` must come out the same on every device: `core/exact.js` for trig and roots, the
  seeded random numbers it's given, never `Math.random`, `Date` or iteration order that could differ.
- Docs are part of the change: update `docs/*.md`, `README.md`, `contribution.md` and
  `client/js/audio/catalog.js` wherever what you changed is described, in the same commit, in the
  docs' own voice.
- Generated files: if anything under `client/` changed, run `npm run build:manifest` before running
  tests, but do NOT commit `client/js/app/manifest.js`, `client/js/app/assets.js` or the import map's
  hash changes in `client/index.html` (the lead regenerates them once when integrating; every part
  changes them, so committing them only makes conflicts). If you change `client/index.html` by hand,
  commit only your hand-made hunks and say so in your report.
- Version numbers (`NET_VERSION`, `SNAPSHOT_VERSION`, `WAR_VERSION`, `SAVE_VERSION`): do not bump
  them unless your prompt says you own the bump. If your change needs one, say so in your report.
- Never skip, disable or loosen a test to make it pass. If a test fails because the behaviour was
  meant to change, change the test to assert the new behaviour and say so. If your change would need
  an assertion weakened, stop and report instead.
- Keep to your part. If an item turns out to be wrong, unsafe or much bigger than described, do not
  force it: leave it undone and say exactly why. A smaller correct change beats a larger doubtful one.

## Proving it

- Add or extend tests for each change (unit tests in `test/`, run with `node --test test/<file>`).
- Run the unit tests your change can touch, and lint on what you changed. The machine has 4 cores
  shared with the other engineers: do not run the whole suite unless your prompt says to. Some tests
  hold wall-clock limits and fail on a busy machine: before believing a failure is yours, run that
  test file again on its own.
- Browser tests, only when your prompt asks:
  `CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test <file>:<line> --workers=1 --trace off`
  (one worker; they draw in software and are slow). Use a free port: `E2E_PORT=<8100 + a number of
  your own>`.
- Where the review gave a measurement and a script, re-run it before and after and report both.

## What to hand back (your final message)

1. For each item in your part: DONE, PARTLY (what is left) or NOT DONE (why), in one or two lines.
2. The commits you made (`git log --oneline <base>..HEAD`), your worktree's path and branch name.
3. Files changed outside what your prompt named (so the lead can watch for conflicts).
4. Tests run, with pass/fail counts, and any measurement before and after.
5. Anything the lead or the owner must do: a version to bump, a fixture to regenerate, a setting on
   GitHub, a question only the owner can answer.
Keep it under 600 words.
