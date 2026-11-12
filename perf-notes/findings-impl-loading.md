## Loading, downloads and sound: report

**1. Items**
1. DONE. `scripts/build-site.js`, a new Pages step after the copy (the stamp moved into it); `build-manifest.js --root`. It refuses the repository's own `client/` and fails if the stripped site would list other files.
2. DONE. Whole only when hurried, playing alone, with nothing of the file here yet. The request carries `X-Pellagos-Whole` so the service worker doesn't keep a second copy.
3. DONE, except the font: nothing in `node_modules` makes WOFF2, so it stays a TTF.
4. DONE. 5. DONE. 6. DONE.
7. DONE for recorded sounds, by group rule (a bed is an entry with `loop`); `build:sounds` writes `RECORDED_RATES` and checks every sound. Music left: lossless per-file rates save under 1 MB.
8. DONE. Worker plus IndexedDB, keyed by `COMMIT` and seed; unstamped ("dev") copies keep none.
9. Skipped as told.

**2. Commits** (`/home/user/conquest/.claude/worktrees/agent-a3ef6f1bfda215e0a`, branch `worktree-agent-a3ef6f1bfda215e0a`)
```
8940917 A whole file's last part isn't kept as a part; the worker answers the loader even if…
960761b The README's list of files names the plans' module and the site's build script
e266b21 Turned on, the sound asks for the ambience where the player is…
ebfb583 The caching browser test asserts what a page asks for now…
2fe5300 The world's plan laid out in a worker and kept between visits…
f83e85c Recorded sounds decoded at the rate their sound needs; a phone keeps 36 MB…
64942ed The loader stops waiting for a service worker that can't be registered
82c4bcd With Sound off, nothing's made, downloaded or decoded till it's turned on
5b4c8a1 The service worker and the loader no longer do work on every load that nothing uses
020549a The page preloads main.js's imports, asks for its style sheet by hash, and registers…
4ea91b0 A model the player's waiting for is asked for whole, so the server compresses it
95a1346 The website's copy of the game's code stripped of comments and indentation
```

**3. Outside my named files**
- `client/js/main.js`: two `await`s (`createGame`, `createJoinedGame` are now async).
- New `client/js/app/plans.js`, `plan-worker.js`.
- `e2e/caching.spec.js`.
- `README.md`, `docs/GAME.md`, `WORLD.md`, `WILDS.md`, `LICENSED_MODELS.md`, both `generated/` plans.

**4. Tests and measurements**
- Unit: 279 pass, 0 fail, in 15 files (new: `build-site`, `plans`). Lint clean.
- Browser: `caching.spec.js` and both `downloads.spec.js` tests pass. `pellagos.spec.js:335` fails its 90 s wait on this machine (load average about 30); it passed in a scratch copy with 420 s waits, since deleted.
- The stripped, stamped site played in Chromium, plan kept in IndexedDB, reload 0 B downloaded.

| | Before | After |
| --- | --- | --- |
| `strip.mjs`: own modules, gzip | 3.69 MB | 2.14 MB |
| `boot.mjs`: manifest as sent | 6.39 MB | 5.02 MB |
| `graph.mjs`: preloads (9 levels) | 0 | 68 |
| Page, gzip | 36.5 KB | 37.8 KB |
| Loader on a repeat visit (loaded machine, one run) | not timed | 0.5 s (first visit 17.0 s) |
| All recorded sounds decoded | 236 MB | 177 MB |
| Plan on the page's thread (Node) | 1.5 s | 0, plus about 0.1 s for its waters |

**5. For the lead and owner**
- **Plan trap.** A plan's waters come from the land as it was during settling, not from the plan. Made from the plan, seeds 7, 12 and 31 get different rivers (seed 7: 32 cells, up to 16 m), so a different world. `adoptPlan(plan, land)` requires `landOf(plan)`; the tests' on-disk cache must carry it too.
- Run `npm run build:manifest`. I committed only the hand-made hunks of `index.html` (inline script, comment); `manifest.js` and `assets.js` are uncommitted.
- Three tests changed because behaviour was meant to: the downloader's hurry test, the decode-rate test, the caching browser test.
- `recorded.js` has `RECORDED_RATES` added by hand, as the build writes it; I couldn't run `build:sounds` here.
- contribution.md needs:
  - Pages paragraph: the copy's code is stripped by `scripts/build-site.js` before the stamp.
  - `build:manifest` row: it writes the preloads and the style sheet's hash; `--root <folder>` for a copy.
  - `build:sounds` row: it checks each sound against its decode rate.
- `server/static.js` compresses text only, so a whole fetch gains nothing from a world server.
- Listen on an iPhone: beds hold up to −24 dB just under 12 kHz, mail hits and snake hisses −16 dB just under 18 kHz, where a resampler may roll off.
- No version bump. New IndexedDB database `pellagos-plans`. The site gains about 20 MB of `.map` files.
- Owner: the TTF could join the manifest's fonts to stop its per-load check.