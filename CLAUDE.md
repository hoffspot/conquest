# Working on Pellagos with Claude Code

Read `contribution.md` before changing anything. It explains how to set up, which checks CI runs
and how to run them, the code's conventions, and how to open a pull request that's safe to merge.

## Standing rule: keep contribution.md current

`contribution.md` is part of the development pipeline. Whenever a change touches how the game is
set up, built, tested, checked or merged, update `contribution.md` in the same pull request. That
covers:

- `package.json`'s scripts or Node version;
- `.github/workflows/`;
- `playwright.config.js`, `eslint.config.js`, `e2e/fixtures.js` or the browser tests' split;
- `scripts/`;
- the tools in `utilities/` and their checks;
- the version numbers' rules;
- branch, review and merge conventions;
- what an environment needs to run the checks;
- the repository's settings on GitHub (contribution.md, section 6, *The repository's settings*).

`test/contribution.test.js` checks the parts a machine can check. The rest is yours.

## Repository settings: tell the owner

Only the owner (hoffspot) can change the repository's settings (the `main` ruleset, its required
checks, auto-merge, branch updates). This session can read them but not change them:
`gh api repos/hoffspot/conquest/rulesets` and `gh api repos/hoffspot/conquest`.

- When a change needs a setting changed, tell the owner in the session and in the pull request,
  with the exact steps. Examples: a CI job added, renamed or removed (every job is a required
  check); a different number of `e2e` jobs; a new rule for `main`.
- Update the settings table in contribution.md in the same pull request. Read the settings back
  before merging, to check the owner has made the change.
- Whenever a setting is changed or added, update the table to match.

## Before every merge

Others contribute too, so a green pull request can go stale (contribution.md, section 6):

- Merge `origin/main` into the branch; don't rebase.
- Regenerate rather than hand-merge `client/js/app/manifest.js` and `package-lock.json`. If both
  sides bumped a version number, take the higher one and add one.
- Merge only once CI is green on that up-to-date head and `main` hasn't moved since.
- Use auto-merge where it's turned on.

## Before every push

- `npm run build:manifest` if anything under `client/` changed.
- `npm run check` (lint and unit tests).
- `npm run check:motion` if characters' motions, bodies or what they hold changed.
- The browser tests the change touches.
- If anything under `utilities/blenderpipeline/` changed, its own checks there (contribution.md,
  section 2, *The tools in `utilities/`*).
- `git add` files by name only.
- Never skip, disable or loosen a test to get CI green.
- Don't run Prettier or any other formatter. The code uses four-space indents and ESLint is the
  only style check.
