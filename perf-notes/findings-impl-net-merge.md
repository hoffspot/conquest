The battle engineer's branch is merged into mine and the two now agree: one way a character is kept and made whole, the fixture remade, every proof you listed run. Along the way the soak failed once and I changed the "world again" limit in response; that's the one thing here you should look at.

Branch `worktree-agent-a232813c3ecf06a79`, nothing pushed, tree clean but for the three generated files.

## Commits

- **1dfc3e7** — the merge (`git merge --no-edit worktree-agent-acbdbc1c6ff7d3964`, a real merge commit), with the design work and the remade fixture in it.
- **6cdc3f2** — the "world again" limit gets three in hand; docs for the merged design.

## Conflicts

No file conflicted as text (only `docs/WAR.md` and `docs/WILDS.md` auto-merged). The two sides met in meaning, in how a character is kept and read back. I made it one design:

- **The battle makes every character whole, always.** Its `#made` plus `restore` already fill in whatever a snapshot left out, which is exactly what `core/keptactor.js` leaves out. So I removed `wholeActor`, `wholeBattle` and `ACTOR_FIELDS` from `keptactor.js`. It now says only what is left out: `ACTOR_DEFAULTS`, `spareActor`, `keptOf`, `spareBattle`.
- **Attacks left out are made again in `Battle.restore`.** That was the one thing restore couldn't know. `armsIn` is exported from `battle.js` and `keptactor.js` uses it, so there is no second copy of that rule.
- **The host takes its snapshot through the battle.** `Battle.snapshot({ keep })` keeps each character as `keep` makes of it (the host passes `keptOf`), otherwise whole as before. `Host.#battleKept`, which emptied `battle.actors` for a moment, is gone.
- **Undefined is never kept.** `keptOf` and `spareActor` skip what a character is only made with (`OPTIONAL`), so the one shape brings nothing back into the text.
- **`SNAPSHOT_STEPS[52]`** gives each shot in the air `flown: 0`. A boss's `stunned` needs nothing of an older world. No second bump: 224 and 53 cover the battle's rule changes.

My edits in `battle.js` are those three places only: the `armsIn` export, `snapshot`'s `keep`, and four lines in `restore`.

## The soak failure and what I changed

The first soak on the merged tree exited 1: its playing bot was sent the world again once in play, found neither astray nor too far behind.

My reading, which is an inference: a bot that fell too far behind twice as it arrived had its second ask held for the 10 s limit, stood still, and the world then arrived after the soak's clock started. The pre-merge soak showed the same pattern on the idle bot, which the soak doesn't judge. The only other explanation I can see is a link drop.

The change: `AGAIN` is now `{ every: 10000, burst: 3 }`. Slice 1-5's rate is kept, with three in hand so the second and third asks in a row are answered at once. A hundred asks still get four in 10 s.

Two soaks after the change both exit 0 with no resyncs. Neither run had an arriving resync at all, so they pass but don't confirm the mechanism.

Decision for you: this deviates from slice 1-5's plain "one per 10 s". Setting `burst` to 1 restores it exactly, at the cost of a slow-arriving game standing still for up to 10 s.

## Numbers after the merge

| Measure | Before the merge | After |
|---|---|---|
| Down to one guest: quiet / walking / fight (`wire.mjs`, 3 guests) | 1.20 / 3.02 / 4.45 KB/s | 1.20 / 3.02 / 4.31 KB/s |
| Welcome, start town | 79 KB | 79 KB |
| World again after the fight | 117 KB | 117 KB |
| Bytes per character | 816 | 819 |
| The 52 fixture re-kept | 261 KB, 958 per character | 261 KB, 958 per character |
| `host.snapshot()` / with encode, 138 characters | 1.8 / 4.2 ms | 1.8 / 3.8 ms |
| `step-budget --field 50`, thread time: mean / worst | 2.52 / 16.0 ms | 1.60 / 12.6 ms |
| `step-budget` plain: mean / worst | 0.75–0.85 / 12–16 ms | 0.61 / 13.2 ms |

- **Desyncs:** none in `wire.mjs` (600 checks per guest) or `messenger-desync.mjs` (625 checks).
- **Restore cost:** `Battle.restore` of 138 characters is 8.7 ms from a whole snapshot and 9.1 ms from a spare one, measured under load. I have no pre-merge figure from the same script.

## Old snapshots

Fixtures 52, 26, 40 and 47 load to the same world before and after the merge: same checksum, and every character's every given field identical. The only difference is each shot's new `flown: 0`. They play on differently afterwards, as expected with the rules changed.

## Tests

- **Lint:** `npm run lint` clean.
- **At the merge commit:** 14 files, 243 pass, 0 fail (snapshots, snapshot-fields, rare, battle-rules, field-battle, combat, netplay, together, forecast, host, runner, trading, followers, bot).
- **On the tip:** 9 files, 144 pass, 0 fail (netplay, snapshots, snapshot-fields, rare, together, contribution, manifest, world-server, runner).
- **`verify.mjs`:** nine battles hash the same on the battle branch and on the merged tree, host field battles and their checksums included. So the merge changes nothing the battle plays.
- **Soak:** one failure, then two passes, as above.
- **Expectations changed:**
  - `test/snapshot-fields.test.js`: its two character tests are rewritten for the one design. They now go through `Battle.restore`, check every restored character has the battle's own shape, and check every left-out field against what `#made` gives each kind.
  - `test/netplay.test.js`: the "again" test now covers the three in hand.
- No browser tests were run after the merge.

## The battle engineer's list

The items in my files were the bump, the step and the fixture; all are done. `host.js:7898-7899` is untouched, as asked.

## Remaking the fixture once host and navigation are in

```
npm run build:manifest
npm run snapshot-fixture
node --import ./test/plan-cache.js --test test/snapshots.test.js test/snapshot-fields.test.js test/rare.test.js
git add test/fixtures/snapshots/53.json.gz
```

Remade on the tip it is byte-identical to the committed one. If `snapshot-fields` fails after their work:

- A field the rules read that a snapshot doesn't carry goes into `Host.snapshot` and `#load` (and into `SNAPSHOT_STEPS[52]` if an older world needs a value), or into the test's `NOT_KEPT` with a reason.
- A default that `#made` no longer gives comes out of `ACTOR_DEFAULTS`.

Nothing else needs keeping in step by hand now.

## Left alone

- A snapshot relabelled as older than 48 and run through the old steps would give an archer in a line only its knife, because step 47 reads `actor.arms`. Real old snapshots always carry `arms`, so only a test that fakes one could hit it; none does.
- The docs still carry the battle engineer's own snapshot and restore timings (3.1 and 4.1 ms per hundred), which I didn't re-measure.

Scratch scripts and outputs are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/net-impl/` (`scripts/old-fixture.mjs`, `scripts/diff-loaded.mjs`, `verify-theirs/`, `verify-merged/`, `out/`).