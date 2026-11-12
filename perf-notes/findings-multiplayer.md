**The findings file was not written.** The harness refused the write ("subagents should return findings as text, not write report files"), so `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-multiplayer.md` does not exist. The full findings are below in the file's format, ready to save as they are; the 400-word summary is at the end. Nothing under `/home/user/conquest` was touched. The scripts behind every measurement are in `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/multiplayer/`.

---

# Findings: multiplayer (playing together, and the servers)

Reviewed 2026-11-11, read-only, Node v22.23.4 on the shared 4-core machine. Timings are noisy: each one that decides something was run three times or more and the spread is given; byte and step counts are exact. "Phone" figures are the desktop figure times five, the code's own ratio (`client/js/core/netplay.js:125`); no phone was measured.

## 0. The netcode as built, with numbers

**Who is authoritative.** One `Host` (`client/js/core/host.js`): the hosting player's page, or one worker thread per world on the world server running the same `Host` and `Hosting` (`server/world-worker.js:98-103`). It is deterministic lockstep: the authority records each step, command, join, leaving and found path as an op and sends them each step (`netplay.js:479-546`, `runner.js:17`). **A guest's device runs the whole simulation**: every op is replayed on its own `Host` (`netplay.js:1465-1563`, `game.js:3832-3852`). In the harness a guest copy's step cost the same as the host's (1.2 to 3.2 ms mean here, so some 6 to 16 ms of each 50 ms on a phone).

**What is sent, measured** (`wire.mjs`: seed 2's start town, the host's player and 3 or 7 guests joined through `Hosting`/`Joining` in one process; all text is ASCII JSON, binary as base64):

| To one guest (payload) | Quiet, standing | Walking (one on the stick) | Field battle, 15 a side (about 100 actors) |
|---|---|---|---|
| `ops` (20 a second) | 0.94 KB/s (47 B each) | 1.4 KB/s | 2.2 to 2.3 KB/s (110 to 116 B each) |
| `motion` (5 a second) | 2.4 to 2.9 KB/s (487 to 575 B) | 2.4 to 2.9 KB/s | 5.0 to 5.3 KB/s (993 to 1,059 B) |
| `self` (1 to 9 a second) | 0.14 KB/s | 1.5 to 1.7 KB/s (244 to 258 B) | 2.0 to 2.2 KB/s |
| `pong` | 0.04 KB/s | 0.04 | 0.04 |
| **In all** | **3.6 to 4.0 KB/s, 27 messages/s** | **5.4 to 6.0 KB/s, 32/s** | **9.3 to 9.7 KB/s, 35/s** |

- On the wire each message is its own WebSocket frame, TLS record and (with `setNoDelay`, `server/relay.js:99`) usually its own TCP segment: about 80 B of headers each, so add 2.2 to 2.8 KB/s. **Down, per player: about 6 KB/s quiet, 8.5 walking, 12.5 in a 30-soldier fight** (arithmetic on the measured payload).
- **Up, per guest:** 33 B/s idle (one `ping` a second); 0.24 KB/s on the stick (two `ahead` commands a second, 101 B each), up to about 1.6 KB/s while the stick turns (16 a second); with headers 0.1 to 3 KB/s.
- **The host sends each guest its own copy of everything** (`together.js:524`; the old relay's `all` line, `server/relay.js:440`, is never used by the client). With 7 guests the host's payload was 27.9 KB/s quiet (189 messages/s), 48 KB/s walking (242/s), about 56 KB/s in the fight: with headers some 45 to 75 KB/s (0.35 to 0.6 Mbit/s) of a hosting phone's uplink.

**What a join costs, measured** (`wire.mjs`, `save-cost.mjs`, `decode-bench.mjs`):

| World | Welcome (text) | Host: `snapshot()` + `encode` | Guest: `decode` | Guest: copy made |
|---|---|---|---|---|
| Start town, 43 to 48 actors | 129 to 141 KB | 4 to 8 ms + 2 ms | not timed alone | `Host.restore` 32 to 38 ms |
| In and after the fight, 69 to 101 actors | 196 to 271 KB | 4.4 to 6.3 + 2 ms | 12.7 ms | `adopt` 16 to 40 ms |
| 4 players in 4 towns, 148 actors | 369 KB | 7 to 24 + 6 to 8 ms | 47 ms | |
| 8 players over 6 towns, 229 actors | 563 to 604 KB | 8 to 22 + 5 to 13 ms | 34 to 41 ms | |

About 2 KB of JSON per actor. gzip takes it to 7 to 12% (19 to 41 KB). The guest also builds the world from its seed first (`buildWorld`: 0.8 to 1.0 s for a second build in a warm process; 5.8 to 7.3 s for the first, which the loading reviewer will have). The comments' "some 120 KB" holds only for a quiet start town.

**Input delay and prediction.** A command is done on the host on arrival and comes back among the ops; the copy plays the host's steps 2 to 8 steps behind (`PLAYOUT`, `netplay.js:176`: 100 to 400 ms). The player's own hero is drawn ahead by the rules themselves (`app/forecast.js`), so walking, swings and casts begin at once; everything else is seen half a round trip plus the buffer later (the docs' modelled 172 ms on Wi-Fi, 280 ms on 4G, 608 ms on weak 4G: `docs/WAR.md:3436-3441`). The forecast's cost on the guest (`forecast-cost.mjs`, 300 ms round trip, third warm round): it looks ahead afresh 14 times a second at 0.65 ms mean, 1.9 ms 95th percentile (0.17 ms a frame averaged).

**A phone as host, per 50 ms step** (measured here, times five): the simulation 0.84 to 1.2 ms quiet and 3.0 to 3.5 ms in the fight (4 to 6 ms and 15 to 18 ms on a phone); `Hosting.flush` 0.13 to 0.23 ms mean, 1 to 4 ms at the 99th percentile; one send call per guest per message (190 to 240 a second with 7 guests); and at each join or "the world again", a `snapshot()` and `encode` of 6 to 10 ms (30 to 50 ms on a phone) and 130 to 270 KB to upload, once per guest who asks. Building messages is not the phone's problem: the simulation is, and that is the lockstep design. Nothing but the snapshot's encoding could usefully leave the page's thread; findings 1, 2, 4 and 6 are what make the host's share smaller.

**The world server.** `npm run step-budget`, three runs: mean 1.3 to 1.5 ms, 99th percentile 11.5 to 14.1 ms, worst 34, 41 and 51 ms (one run of three exited 1 on this busy machine); heap 63 to 97 MB. One worker thread per world plus two baking threads (`server/workers.js`, `server/ahead.js:56-69`); the supervisor's one event loop carries every socket. Memory: 110 MB as a world opens, 130 to 136 MB after two hours with 8 players (`docs/SERVER.md:521-536`); the budget is 256 MB (`server/registry.js:29`). Caps: 8 players a world (`storage/worlds.js:105`), 64 a server (`access/limits.js:22`), 2 worlds at once by default (`storage/settings.js:27`). **A small machine** (2 cores, 4 GB): a world of 8 with field battles takes about a fifth of a core (the docs' soak), so four or five such worlds, 32 to 40 players, in about 1.3 GB at the budget, sending 2.5 to 4 Mbit/s (arithmetic). `recommendation()` (`registry.js:42`) keeps 4 GB back for the owner's apps, so on a 4 GB machine it recommends one world. What drives the cost is occupied places, not players. Backpressure: a socket with more than 8 MB waiting is closed (`relay.js:128`, `play.js:40`), its place kept five minutes; nothing stale is dropped before that.

**What the two plans recommended, and what is built.**
- `generated/hero_prediction_plan.md`: stages 1, 2 and 4 are built (`app/forecast.js`, `core/selfstate.js`, `BLOW_WAIT` at `host.js:1151`, `app/predict.js` gone); stage 3 was measured and dropped; its "Later" list (WebTransport datagrams for the stick, a blow back-dated by latency, a queue for the next quick action) is not built.
- `generated/multiplayer_scaling_report.md` (2026-11-07): none of its stages is built, as expected four days on. `groupsOf` is still players squared (`strength.js:162-191`), `packMotion` loops every actor against every player (`motion.js:58-74`), `mostPlayers` stops at 8, the "two welcomes at once" throttle (`generated/world_server_plan.md:1122`) has no code in `server/`, and snapshots and saves are taken on the world's thread. None of it matters at 8 players; planned, not done, and not re-recommended below.

## 1. Findings, ranked

### 1. Put three things in the snapshot that a joined copy needs, so copies stop going astray

- **Where:** `client/js/core/host.js:17981-17985` (`messengersAt`), `host.js:11239-11241` (`rareLooked`), `host.js:3197-3204` (`adopt`), against `snapshot()` at `host.js:3095-3176` and `#load` at `host.js:3262-3410`.
- **What happens now.** Three pieces of the world's state are not carried to a copy:
  1. `messengersAt` gates `#sendMessengers` to once every 3 s, is made on first use and is in no snapshot. The host's phase runs from its start; a copy's from its first step after joining. Five join times in six differ. **Measured** (`messenger-desync.mjs`): a guest joined at host time 10.00 s; when the host first sent messengers (at 120.05 s, after a field battle) the copy had none of them (50 actors against 48), found itself astray 150 ms later and was sent the world again (151 KB). Joined at 9.00 s (the same phase), no copy went astray. With 3 and 7 guests every guest went astray together (`wire.mjs`: 3 x 246 KB and 7 x 271 KB sent in one burst).
  2. `rareLooked` (how long since the director last looked) is not in the snapshot, so a copy's first look after joining counts no time. **Measured** (`legends-adopt.mjs`): with a player in the wilds, 40 steps after joining the host's wilds clock for them stood at 12,000 ms and the copy's at 11,500.
  3. `Host.adopt` (the world sent again) calls `#reset` and `#load`, and neither reads `snapshot.legends`; only the constructor does (`host.js:1215`). So a copy that skipped steps keeps its own rare-encounter state. **Measured**: a copy 160 steps behind (a phone's page hidden 8 s) asked for the world again; afterwards the host's `legends.played` was 20,250 ms and the copy's 12,250, and the two checksums still agreed (the checksum does not cover the legends, `host.js:3418-3466`), so nothing notices.
- **What it costs whom.** Each time a copy goes astray the guest downloads the whole world (130 to 600 KB), parses it (13 to 41 ms here, 60 to 200 ms on a phone), adopts it (16 to 40 ms; 80 to 200 on a phone) and sees everyone slide or jump; the host takes and encodes one snapshot per guest who asks (6.5 ms each here: 45 ms for 7 guests, about 230 ms of one or two frames on a hosting phone, which stalls the world for everyone) and uploads up to 1.9 MB. (1) happens at the first messenger, minutes into a session where the war has anything near, and at each later one. (2) and (3) bite later and worse: `Legends.due` (`core/rare.js:1138`) rolls the world's shared random numbers once a clock passes its least time (40 minutes in the wilds, 20 inside), so a copy whose clock is short does not roll when the host does, the random stream parts, the copy goes astray, and the world sent again puts the random state right but not the legends, so it can recur at the next chance (READ; the clocks' divergence is measured). (3) follows every time a guest's phone is put away for more than 5 s, which is ordinary use; whatever of the rare encounters happened in the skipped steps is also never known to that player's game.
- **The change.** Carry `messengersAt` and `rareLooked` in `snapshot()` and `#load` (or make both gates a function of the battle's time alone); have `#load` set `this.legends = new Legends(snapshot.legends)`. Add the guard that would have caught all three: a test that runs a host two minutes with a fight, restores a copy from its snapshot, and fails on any own field of `Host` or `Battle` that differs and is not on a short list of derived caches (`fields.mjs` does this: today it reports `messengersAt`, `rareLooked`, three caches and the order of `folk`), and a netplay test that skips a guest past `PACE.tooFar` and compares `legends.toJSON()`.
- **Gain:** no full-world resend at each messenger (measured: one per guest per send today); a guest back from the background keeps the host's rare-encounter clock.
- **Effort:** S. **Risk:** `SNAPSHOT_VERSION` (52) and `NET_VERSION` (223) both go up, with a `SNAPSHOT_STEPS` entry. Nothing a player sees but fewer jumps.
- **Confidence:** MEASURED (1, and the state differences of 2 and 3); READ (how 2 and 3 become repeated resyncs).
- **Verify:** `node messenger-desync.mjs 200 135 2 70` reports `desyncs 0`; `legends-adopt.mjs` shows the same clocks on both; `fields.mjs` lists only the caches.

### 2. Send the motion check as a checksum, not as every character's place

- **Where:** `netplay.js:537-543` (sent), `netplay.js:1543-1556` (compared), `core/motion.js:53-93`.
- **What happens now.** Five times a second the host packs up to 64 characters at 16 bytes each, base64s them and sends them to every guest. The only reader is the comparison at `netplay.js:1550`, which uses each one's index, x and y and nothing else (grep finds no other consumer). It is 69 to 72% of what a guest receives in a quiet town, 45 to 48% walking, 53 to 55% in the fight: the largest thing on the wire, and it carries no play. A host with 7 guests uploads 20 to 37 KB/s of it.
- **The change.** Put a check in the ops stream every `MOTION.every` steps as is already done every 100 (`["k", this.host.checksum()]`, `netplay.js:523-526`): 17 characters inside a message that is going anyway. `Host.checksum()` already covers every character's place to the millimetre, health, death and target. Drop the `motion` message.
- **Gain (measured bytes).** Down per guest: 3.6 to 1.2 KB/s quiet, 5.4 to 3.0 walking, 9.3 to 4.4 in the fight, and five fewer messages a second. A hosting phone with 7 guests uploads about half. CPU falls too (`checksum-cost.mjs`, 229 actors: checksum 57 to 83 microseconds; pack, base64 and encode 100 to 167).
- **Effort:** S. **Risk:** `NET_VERSION` goes up. The motion check allows 1 cm and the checksum none, but the checksum is already exact every 5 s and the soak's copies all match it. The debug overlay's and soak's "motion checks" count (`app/debug.js:67`, `scripts/soak.js:471`) and the motion tests change with it. Nothing a player sees.
- **Confidence:** MEASURED (bytes, cost); READ (no other reader).
- **Verify:** `wire.mjs` again: no `motion` line; the soak still reports every check matching.
- **A smaller follow-on:** a guest's `self` word could ride in the same frame as its ops (about 0.5 to 0.8 KB/s of headers per moving guest, arithmetic).

### 3. Read what arrives without a JSON reviver

- **Where:** `client/js/core/wire.js:26-38` (`decode`), called for every message (`netplay.js:599`, `1167`; twice per message on the world server: `server/world-worker.js:257`).
- **What happens now.** `decode` gives `JSON.parse` a reviver so `{ "$": "Infinity" }` comes back a number, which takes V8 off its fast path. **Measured** (`decode-bench.mjs`, three rounds): a 604 KB "world again" takes 34 to 41 ms with the reviver, 2.7 to 5.9 ms as a plain parse, and 3.2 to 9.2 ms as a plain parse plus a walk that puts the numbers back. The guest pays it on its page's thread at every join and resync: some 170 to 200 ms of one frame on a phone for the larger worlds.
- **The change.** Parse plainly; if the text has no `"$"`, return it; else walk the result in place. `decode-bench.mjs` has the walk and asserts the same data as `decode` for a snapshot and 300 real messages.
- **Gain:** 4 to 10 times less parse time: 30 ms here, about 150 ms on a phone, per join and resync. Per message the saving is tiny.
- **Effort:** S. **Risk:** none to the wire. `encode`'s replacer costs less (8.5 to 9.9 ms against 4.0 for 590 KB) and has no easy way round; leave it. **Confidence:** MEASURED.

### 4. Compress the world when it is sent

- **Where:** `server/relay.js:174-191`; the handshakes at `server/play.js:304`, `server/broker.js:627`, `server/relay.js:560` answer no `Sec-WebSocket-Extensions`; `client/js/app/peer.js:56-68`.
- **What happens now.** A welcome or a world sent again is 130 to 600 KB of JSON, sent as it is. gzip takes the measured ones to 7 to 12% (196 KB to 24 KB at level 1 in 1.5 ms). A guest on a phone's network waits for it at every join, every time its page was hidden more than 5 s, and every resync; a hosting phone uploads one per guest after its own link drops (7 x 270 KB = 1.9 MB).
- **The change, in two parts.** (1) On the server, answer `permessage-deflate` with no context takeover in `Socket`'s handshakes, deflate outgoing messages over about 1 KB, inflate incoming ones with the output capped. Browsers do their side themselves, so the game's code and `NET_VERSION` do not change. (2) For games linked directly (WebRTC), compress in the page with `CompressionStream` before `piecesOf`; that changes `NET_VERSION`.
- **Gain:** about ten times less to move: 600 KB to about 45 KB; at 2 Mbit/s, 2.4 s to 0.2 s (arithmetic). The cost is on the supervisor's thread, not the world's.
- **Effort:** M (two to three days each part). **Risk:** part 1 is hand-written WebSocket code on the path everything takes.
- **Confidence:** MEASURED (sizes, times); SUSPECTED that Safari offers the extension as Chrome and Firefox do: check `socket.extensions` in the lead's browser run before building.

### 5. Give the two things called `Joining.held` their own names

- **Where:** `netplay.js:1106` (`this.held = 0`: steps in hand, smoothed), `netplay.js:1123` (`this.held = false`: the menu holding the world); read as the first at `netplay.js:1454-1456` and `main.js:3155`, as the second at `netplay.js:1318`, `1370-1376`.
- **What happens now** (`held.mjs`, measured):
  1. `Game.start()` calls `remote.hold(false)` every time a menu or map closes (`game.js:3140`). The field is a number by then, so the "unchanged" test fails, a `hold` message is sent every time, and the smoothed count is set to `false` (0). The pace drops to 0.90 and is still 0.96 a second and a half later: after every menu a joined player closes, their world plays up to 10% slow for about two seconds.
  2. `resync()` sends `held: this.held`, a number while the menu is open (measured `"held":2.27`). The host takes anything but `true` as not held (`netplay.js:632`), so a world server's world stopped for its one player's open menu starts again when their link comes back.
- **The change.** Rename the smoothed count in `netplay.js` and `main.js:3155`; add a test.
- **Effort:** S. **Risk:** none to the wire. **Confidence:** MEASURED.

### 6. Bound what one guest can make the host do (robustness, brief)

What guests send is well checked (see section 2). What is missing is limits on how much and how often, mostly on direct links, which bypass the broker.

- **"The world again", unthrottled** (`netplay.js:887-894`). **Measured** (`fuzz.mjs`): 100 in a row took 649 ms of the host's thread and 12.2 MB of sending in the quiet start town (6.5 ms and 122 KB each; 13 to 35 ms and about 600 KB for 8 spread players). A direct guest has no limit; the world server allows 20 messages a second per player (`access/limits.js:28`), which is 13 to 44% of a world's thread and 2.4 to 12 MB/s out. **Change:** answer at most one per guest each second or two, and take the world once for all who ask in a step, as `Hosting.resync` does (`netplay.js:934-946`). That also removes the 230 ms stall on a hosting phone when every guest asks at once.
- **No rate limit on commands over a direct link** (`netplay.js:869-884`); the broker limits those it relays (`broker.js:421`). Each command is sent on to every guest. **Change:** a token bucket per guest in `Hosting` (30 a second), covering every kind of host.
- **`Pieces` has no limit** (`peer.js:71-91`): a direct peer can send `+` pieces for ever. **Change:** give up past 4 MB.
- **A character is taken in whole** (`netplay.js:337`, `350-351`: `structuredClone` of `hero`, `progress`, `standing`). The broker holds a relayed joiner to 64 KB; a direct link and the old relay (4 MB) do not, and an oversized hero is in every later snapshot. **Change:** refuse a `hello` over 64 KB in `Hosting`.
- **A slow guest on a direct link** (`peer.js:260-268`): what waits is kept without limit. **Change:** let them go at 8 MB, as the sockets do.
- **The old relay** (`server/relay.js`, "kept for one release") has no limit on wrong codes or links per address.
- **Effort:** S each. **Confidence:** MEASURED (`again`), READ (the rest).

### 7. Time the world server's steps to when they are due, not every 25 ms

- **Where:** `server/world-worker.js:54`, `359-372`.
- **What happens now.** A 25 ms timer hands the runner the time gone by; timers fire a little late, so every so often a step comes a whole tick early and the rest count as late against it. **Measured** (`tick.mjs`, 30 s each): lateness against the quickest of the last 2 s (the joined game's own measure, `netplay.js:1407-1446`): median 14.6 ms, 90th percentile 22.5 ms as now; 0.7 and 3.9 ms with a timer set for when the next step is due. A joined game keeps `ceil(lateness / 50)` steps in hand, two at the least, so the server's 22 ms pushes a link whose own figure is 80 to 100 ms (or 130 to 150) into one more step: 50 ms more delay on everything that player sees.
- **The change.** `setTimeout` for `STEP_MS - runner.lag` after each tick.
- **Effort:** S. **Risk:** none. **Confidence:** MEASURED (the timer); READ (what the client makes of it).

### 8. Show the whole tick on the server's Health page, and cap its catching up

- **Where:** `core/runner.js:143-148` (only `host.advance` is timed), `server/world-worker.js:359-372`, `server/keeper.js:38`, `server/ahead.js:124-152`.
- **What happens now.** **Measured** (`tick-cost.mjs`, 4 players in 4 towns, 130 s, four runs): the step alone had a worst of 34 to 62 ms and 0, 2, 0, 0 steps over 50 ms; the whole tick a worst of 46 to 106 ms and 1, 4, 1, 0 over 50 ms. A save's snapshot and encode was 12 to 32 ms once a minute; a tick that baked a tile of a building's inside on the world's thread (`ahead.js:145`) averaged 13 ms, worst 33. Separately `runner.advance(now - last)` (`world-worker.js:363`) has no upper bound: if steps ever averaged over 50 ms the thread would fall further behind each tick and stop answering. A browser host is bounded; the server is not.
- **The change.** Time and report the tick as well as the step; cap one tick at 250 ms of world time, counting what was dropped; then, if the figures show it, bake the insides' tiles on the baking thread.
- **Effort:** S (timing, cap), M (insides). **Confidence:** MEASURED (noisy machine: counts indicative); READ (the cap).

## 2. Checked and already good

- **What guests send is validated.** 72,207 malformed messages of every kind and command type (`fuzz.mjs`) put to `Hosting.hear`: none threw, none reached `Host.command`'s catch. Characters are rebuilt field by field (`netplay.js:263-355`); chat is cleaned and rate-limited.
- **Building messages is cheap:** `Hosting.flush` 0.13 to 0.23 ms mean with 3 to 7 guests.
- **The pacing design** (jitter buffer, catch-up within 8 ms a frame, the world again past 5 s, running on 100 ms): sound, documented and tested; its one fault is finding 5.
- **Hero prediction** costs about 1% of a desktop thread.
- **The world sent again is taken in incrementally** (`game.js:12515-12576`).
- **One slow guest does not slow the others:** the host never waits.
- **The world server's access limits** (`access/limits.js`, `guards.js`, `play.js`, `broker.js:73-86`).
- **Saves** are atomic and gzipped off the world's thread (`storage/files.js:63-85`).
- **The step budget** holds at 4 spread players.
- **Reconnecting** (`together.js`, `peer.js`): heartbeat, backoff with jitter, places kept.
- **Head-of-line blocking** is inherent to ordered ops; a second channel would not help play today.

## 3. Bugs (not performance)

1. Copies going astray at each messenger, and the rare encounters' clock lost on joining and on the world sent again: finding 1. Certain.
2. `Joining.held` is two things: finding 5. Certain.
3. **A trade can be agreed to without having been seen** (`host.js:5137-5171`, `app/pack.js:840`). `{ type: "agree" }` names no offer. If B changes their offer and agrees while A's agree to the old one is on its way, the host swaps on an offer A never saw. Sure from the code (READ); easy for a scripted game, and only matters with strangers. Fix: `agree` carries the offer's revision; S; `NET_VERSION`.
4. A guest of a browser-hosted world never says its page is hidden (`main.js:6283`: only on a server). `QUIET` covers it; noted as a difference.
5. `npm run step-budget` fails on a busy machine (1 run in 3 here). Not in CI, so no cost today.

## 4. Code structure

- **What a snapshot holds is kept by hand in two long lists** with nothing checking them against `Host`'s fields; finding 1's three faults come from that, and its field-comparison test closes the gap.
- **`Host.restore` and `adopt` clone every part** of a snapshot that was parsed a moment before; an owned path would cut `adopt`'s 16 to 40 ms (SUSPECTED, not measured apart).
- **The world's thread posts each message once per recipient** (`world-worker.js:101`): cheap at 8 players; worth changing only if the cap rises.
- **A browser host could say a broadcast once** to those the broker relays; after finding 2 it saves little.
- **Stale figures:** "some 120 KB" (`netplay.js:126`, `relay.js:42`, `docs/WAR.md:3458`, `3589`) against 130 to 600 KB; "about 1.2 KB a second" for motion (`docs/WAR.md:3492`) against 2.4 to 5.3.

## 5. Gameplay and design

- A hosting phone stops the world for everyone whenever its page is hidden (`main.js:6279-6281`). That is iOS, but it is the best reason to steer groups with an iPhone host towards a world server.
- A guest back from the background is always sent the whole world; with findings 3 and 4 that is about 45 KB and 25 ms rather than 600 KB and 200 ms.
- Trading between strangers wants bug 3 fixed before open worlds are advertised.
- Messengers arrive for every ungrouped player in the same step, which is why finding 1's resync hits every guest together.

## 6. Questions for the owner

1. Was the motion stream meant for more than a check (drawing others between steps, or later replication)? If so, keep its format and still send only the checksum now.
2. Are open worlds with strangers wanted soon? That sets the priority of the trade fix and finding 6.
3. Is the old relay still needed by any page in use?
4. How many guests does a phone usually host? With one or two, findings 2 and 4 matter mostly to guests; with seven they halve the host's upload.

---

## Summary (top findings, in rank order)

1. **Joined copies go astray because three things are missing from the snapshot** (`host.js:17981`, `11239`, `3197`). Measured: a guest who joins mid-session is sent the whole world again when the host first sends war messengers (every guest at once: 7 x 271 KB); and after a phone is backgrounded, its rare-encounter clock stays behind the host's by all the time skipped, which nothing detects. Small fix, plus a test that guards the whole class. Both version numbers go up.
2. **The motion stream is 45 to 72% of what a guest downloads and is only a check.** Sending a checksum in the ops instead takes a guest from 3.6 to 1.2 KB/s quiet and 9.3 to 4.4 in a fight, and halves a hosting phone's upload. Small.
3. **`decode` uses a JSON reviver:** 34 to 41 ms to parse a 604 KB world against 3 to 9 ms without. Small, no wire change.
4. **The world is sent uncompressed** (130 to 600 KB; gzip gives 7 to 12%). `permessage-deflate` on the server's sockets needs no client change. Medium.
5. **`Joining.held` is two fields in one:** every menu a joined player closes slows their world up to 10% for about two seconds, and a paused server world unpauses on reconnect. Small.
6. **Limits for direct links:** "the world again" is unthrottled (6.5 ms and 122 KB per ask), and direct links have no cap on commands, pieces or character size.
7. **The world server's 25 ms timer** adds up to 22 ms of send jitter (90th percentile) that a due-time timer removes.
8. **Health shows only the step:** whole ticks ran 46 to 106 ms at worst against 34 to 62 for the step, and catching up is uncapped.

Also: a trade can be agreed to on an offer the other player never saw (no revision in `agree`).

Checked and sound: validation of guest messages (72,207 malformed messages, none threw), flush cost, pacing, prediction cost, access limits, saves, the step budget.

Netcode as measured: lockstep, guests run the full simulation; about 6 KB/s down per player quiet and 12.5 in a 30-soldier fight with headers; 0.1 to 3 KB/s up; a welcome is 129 to 604 KB. Hero prediction stages 1, 2 and 4 are built; nothing from the scaling report is built yet.

The findings file could not be written (the harness refuses report files from subagents); the full text above is ready to save to `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-multiplayer.md`.