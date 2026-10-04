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
- the version numbers' rules;
- branch, review and merge conventions;
- what an environment needs to run the checks.

`test/contribution.test.js` checks the parts a machine can check. The rest is yours.

## Before every push

- `npm run build:manifest` if anything under `client/` changed.
- `npm run check` (lint and unit tests).
- The browser tests the change touches.
- `git add` files by name only.
- Never skip, disable or loosen a test to get CI green.
- Don't run Prettier or any other formatter. The code uses four-space indents and ESLint is the
  only style check.
