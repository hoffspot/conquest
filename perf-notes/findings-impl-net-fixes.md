All four failing tests pass now; none was a fault in what a snapshot holds, and the host engineer's claim that nothing of theirs needs a snapshot field holds. Two commits on top of c932d11 on `worktree-agent-a232813c3ecf06a79`, nothing pushed, tree clean.

## Commits

- **f80ea1e** — the fixes: `core/keptactor.js` (one small change), `test/snapshot-fields.test.js`, `test/netplay.test.js`.
- **798bfca** — `client/index.html`, `client/js/app/manifest.js` and `assets.js` from `npm run build:manifest`, because `keptactor.js` changed and the integrated branch keeps these committed. Its message starts "WIP:" because it also records where the proofs stood; drop or regenerate it as you prefer.

## Cause of each failure

1. **`netplay` › "has a joined copy take the ways…"** The guest's own move command reaches the host after the test's last sending, and its way is found as the host does the command. So that way had not been sent when the navigation engineer's new assertion compared ways heard with ways found.
   - On their branch it passed only by accident: the test played 200 steps, which is past `PACE.tooFar`, so the copy asked for the world again and answering that flushed the way first. The copy never actually replayed anything there.
   - With `CHECK_EVERY` at 4 the test plays 8 steps and really replays. The test now flushes, delivers and has the copy take the last way before comparing, still counting that the copy finds none of its own.
   - No code change in `netplay.js`; the `onWay` hook is right.

2. **`snapshot-fields` › "carries every field…" and "sets a copy right in place…"** The guard named three new `Host` fields: `placesById`, `dungeonSites`, `buildingsInOrder`. A fourth of the same kind, `sitesById`, wasn't yet made in the test's world. All four are caches, now in `NOT_KEPT` with reasons:
   - `placesById`, `sitesById`: the plan's places and sites by id, made on first use; the plan never changes.
   - `dungeonSites`: the plan's dungeons plus the keeps', made on first use from the plan.
   - `buildingsInOrder`: the world's buildings sorted by key, re-sorted when `interiors.version` changes.

   The rest of the host work, read through:
   - `Host.soon()` only reads.
   - `Interiors.give` keeps levels made ahead on the building and uses them only when the rules make the dungeon, so the order buildings are made in is unchanged.
   - Chunks made a piece at a time are the land's, rebuilt from the seed.
   - Their diff adds no other field to `Host`, and the other parts' work doesn't touch `battle.js`.

3. **`snapshot-fields` › "keeps each character…"** A place in a line given back is now `formation.post = undefined` instead of deleted. The battle's whole in-memory snapshot still has that key as undefined; one read back from text has no such key, so the strict comparison differed.
   - Text never held it, so bytes are unaffected.
   - The test now compares whole snapshots as text and back.
   - `keptactor.js` `copied()` now skips undefined inside tables, so the host's snapshot has none even in memory.
   - The test checks for undefined at any depth, and asserts its world actually contains such a character.

## Numbers on the integrated branch

| Measure | Value |
|---|---|
| Down to one guest: quiet / walking / fight (`wire.mjs`, 3 guests) | 1.20 / 3.02 / 4.31 KB/s |
| Welcome, start town | 79 KB |
| World again after the fight | 117 KB |
| Bytes per character | 819 |
| Desyncs (`wire.mjs` 600 checks per guest; `messenger-desync.mjs` 625 checks) | 0 |
| `step-budget`, thread time: mean / worst | 0.86 / 15.3 ms, exit 0 |
| `step-budget --field 50` (259 in the battle): mean / worst | 1.63 / 12.0 ms, exit 0 |

All unchanged from my merged branch within noise.

## Tests

- **The two files:** `test/netplay.test.js` and `test/snapshot-fields.test.js`, 39 pass, 0 fail.
- **Your list plus a few:** 14 files, 237 pass, 0 fail (netplay, snapshot-fields, snapshots, rare, together, ahead, soon, invasions, navbaker, manifest, contribution, field-battle, battle-rules, forecast).
- **Manifest:** `test/manifest.test.js` passes on the tip with the regenerated files (19).
- **Lint:** `npm run lint` clean.
- **Soak:** `node scripts/soak.js --minutes 3 --browsers none` exits 0, about 900 checks per copy, none astray.

## Fixture

Remade after the fixes, it is byte-identical to the one at c932d11, so it is not in my commits. The commands are unchanged:

```
npm run build:manifest
npm run snapshot-fixture
node --import ./test/plan-cache.js --test test/snapshots.test.js test/snapshot-fields.test.js test/rare.test.js
git add test/fixtures/snapshots/53.json.gz
```

## One thing to know about the short soak

A three-minute soak fails on a single resync of its judged bot, and on this loaded machine a bot does sometimes fall too far behind. In this run it was the idle bot, in play (one skip, one resync, counted together), which the soak doesn't judge.

That is not the split I reported last time on the failing run, where the ask came before the clock and the world after. That split has not reappeared in the three runs since the limit got three in hand, but those runs don't prove the limit was its cause.