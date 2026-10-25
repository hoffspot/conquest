# Your hero, predicted by the game's own rules

The plan for keeping a joined player's own hero smooth while they run, strike and cast, from
`reports/Smooth hero movement in multiplayer.md` (the research) and the owner's decisions of
2026-10-25. One stage to a pull request, in this order.

## What's wrong now

A joined phone draws its hero ahead of its copy of the world (`app/predict.js`) by guessing: on
along the stick's way, or along the copy's path. It never runs the rules. So whenever the host does
anything else with the hero (a swing, a cast, a throw, a stagger, a stop, a slide round a lamppost),
the drawn hero is pulled back to a copy that runs 275–600 ms behind, and past 3 m (`PREDICT.far`,
inside a sprint's 2.2–4.7 m lead) it's put there at once: a teleport. Auto target lock (#556) made
striking and casting at a locked enemy while running the ordinary way to fight, and a quick blow at
a far-off locked enemy turns the hero round to walk to it (`host.js #ability` → `engage`).

## Decided

- **The goal is D.** The phone predicts its hero by running `battle.js`'s own rules from the host's
  latest state for that hero, over the commands the host hasn't applied yet; everything else is
  drawn from the copy, as now. The rules stay the one authority; the copy is never touched.
- **A melee blow at a locked enemy out of reach, while steering:** refused like a spell out of
  reach (said, its slot flashed red, nothing cooling down); the stick keeps deciding where the
  hero goes. Standing still or sent somewhere by a tap, it still takes them there, at a run, the
  lock kept, and strikes.
- **...but waited on a moment if the enemy's near** (decided once measured: melee reaches only the
  squares touching the hero, so pressed while running past an enemy it was all but always out of
  reach): within 3 m, the blow waits up to 0.75 s and strikes as the enemy comes into reach, the
  stick still steering; never in reach, refused, nothing spent.
- **Swings and casts keep rooting the hero**, for as long as they take, and are predicted.
- **A swing that hasn't landed is committed:** neither the stick nor a tap calls it off.
- **The stick is sent ten times a second**, and at once on a start, a release, a change between
  running and walking or a turn past 7°; never more than once a host step (50 ms).
- **Switched over outright**, no toggle: the old prediction goes once the new one's in.

## Stage 1: the host's rules stop fighting the stick (NET_VERSION)

- An `ahead` order marks the move it makes as held input (`order.held`), so the host knows the
  player's steering.
- `host.js #ability`, a blow at a foe: in reach, struck where the hero is, the way they're going
  kept (a new `battle.strike`: the swing roots them, then they go on). Out of reach, steering:
  refused (`"reach"`, as a spell out of reach), not empowered, nothing cooling down. Out of reach
  otherwise: `engage` at a run, the lock kept.
- `battle.js order`: walking away no longer calls off a swing that hasn't landed.
- Near while steering (within `BLOW_WAIT.near`, 3 m): waited on `BLOW_WAIT.ms` (750 ms), struck
  as the enemy comes into reach; never, an `unstruck` event: its cooldown given back, the blow no
  stronger, its slot flashed red and "Out of reach" said.
- Tests (quick blows, abilities), docs (GAME.md *Fighting*, *Locked on*; WAR.md *Abilities*), the
  sound catalog (Refused's `plays`).
- Measured (`netfeel`, below): blows struck running past an enemy, the biggest jump of the hero
  drawn 6.6 m before, 3.1–3.4 m after; the rest is the swing's hold, unpredicted till stage 3.

## Stage 2: the hero predicted from the host's latest state (NET_VERSION)

- **The host tells each joiner where their hero is**, with every flush (50 ms): the host's step
  time, the last of their commands it's applied (`seq`), and what the rules move them by (place,
  facing, pace, path and where it's going, order, run, swing, cast and their times, stagger and
  stun, stamina, lock, map).
- **The forecast** (`app/forecast.js`): a private `Battle` over the same world (maps, links, the
  copy's relations), holding the hero, reset from the host's latest state, and the characters
  within 15 m of them as they are on the copy, frozen (no minds of their own: in the way, and
  someone to strike). The commands the host hasn't applied yet are given it as the host will get
  them (each at its sending time plus half the round trip), and it's stepped on to the present the
  player's commands act in (the host's now plus half the round trip), drawn between its steps.
  What it does is only drawn: no blow it strikes lands, nothing it says is heard twice.
- **Ways found on the phone:** a joined phone bakes the navigation tiles round its hero, off the
  page's thread where it can (as a host does), for the forecast's ways and raycasts; a tile not in
  yet, it goes the way the host last sent rather than bake one on the spot. Measured in Chromium
  first (time and memory a minute's running about town and the wilds), and kept to the tiles near
  the hero.
- **Drawn:** the forecast's place, with the gap closed over 100 ms whenever a new state of the
  host's moves it (snapped only onto another map, or more than 8 m). `app/predict.js` goes.
- **A hold keeps the pace** the hero had (a swing, a cast, a stagger, a stun), only standing still
  starting them again from a walk: moved here from stage 1, as with today's prediction (which
  draws a set-off from a walk) it made casting while running jumpier (measured); with the
  forecast running the same rule, it's judged again by the measurements.
- **The debug log** counts the corrections (over 0.5 m, over 2 m, the biggest) for the field.
- Tests: the forecast against a host and a joined copy in Node (held stick past a lamppost, a
  quick blow and a spell while running, a stop, a stagger, a door), the browser test of playing
  together; docs (WAR.md *Playing together*, GAME.md).

## Stage 3: the stick, ten times a second

- `steering.js`: sent every 100 ms while held (`AGAIN_MS`), at once on a start, release, run or
  walk, or a turn past `TURNED`; at most once in 50 ms. Each asks for 10 m ahead (`HELD_REACH`,
  from 30): never braking between messages at a sprint (braking starts within about 4.3 m), and
  stopping within about 1.3 s if they stop coming (a phone put away, a link gone quiet).
- Latest wins: a held-input order not yet sent (the socket's `bufferedAmount` over nothing) is
  replaced by the newer, not queued behind it.
- After the forecast, not before (measured: sent ten times a second, today's prediction, which
  starts again from the copy at every order, got far jumpier: zig-zagging at a 300 ms round trip,
  9.2 m jumped and 2 snaps before, 31.8 m and 8 after; casting while running, 1 snap and 6). The
  forecast replays every order the host hasn't had yet, so more of them is only truer to the hand.
- Tests (steering with a fake clock, netplay's latest-wins), docs.

## Stage 4: your own swings and casts at once

- The hero's swing, cast and throw shown (and heard) when the forecast starts them, not when the
  copy catches up; the copy's own for the same command not shown again (a ledger by command).
  Whether a blow lands, damage and everyone else's answer still come from the copy.

## Measured at each stage

A host and a joined game in one process over a simulated phone link (half the round trip each way,
40 ms of jitter, one message in a hundred held up 300 ms as a lost TCP segment is), the joined game
played frame by frame as `game.js #tick` plays it, its hero drawn as `game.js` draws it, and a
scripted player: running, zig-zagging, stopping and going, running into things, a tap's move,
power strikes while running past an enemy, burns cast while running round one. Scored against
where the host has the hero when what's sent now reaches it: the frames the hero's drawn moving
further than anyone can run (jumps, and how far over), snaps (half a metre in a frame), and the
error (mean, 95th percentile, most), at 150 and 300 ms round trips. Each stage no worse than the
one before in any of them; stage 3 lands it as a test with limits (`test/netfeel.test.js`).

## Later, not in these

- WebTransport datagrams for the stick (Safari 26.4+), keeping the WebSocket for older iPhones.
- A blow's start back-dated by the joiner's latency (up to 100 ms), and a short queue for the next
  quick action.
- A dropped player's hero (kept five minutes, doing what it was last told): the owner's to decide.
