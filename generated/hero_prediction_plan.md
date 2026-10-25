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
- **The stick stays at twice a second**, and at once on a start, a release, a change between
  running and walking or a turn past 7°: ten a second was decided, then measured worse with the
  forecast (stage 3), so it's dropped.
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
  drawn 6.6 m before, 3.1–3.4 m after; the rest is the swing's hold, unpredicted till stage 2.

## Stage 2: the hero predicted from the host's latest state (NET_VERSION)

- **The host tells each joiner where their hero is** (`core/selfstate.js`, the `self` message):
  the host's step time, the last of their commands it's applied (`seq`), and what the rules move
  them by (place, facing, pace, path and where it's going, order, run, swing, cast and their times,
  stagger and stun, stamina, lock, striking, map). Ten times a second while it changes, at once
  when a command's done, once a second all the same; what's as it always is left out (built:
  about 3 KB a second, the joined game's 6.7 KB all told, under the browser test's 10).
- **The forecast** (`app/forecast.js`): a private `Battle` made from the copy's (`fork`), holding
  the hero, reset from the host's latest state, and the 24 nearest within 15 m of them as they are
  on the copy, frozen (`still`: in the way, and someone to strike). The commands the host hasn't
  applied yet are given it as the host will get them (each at its sending time plus half the round
  trip), and it's stepped on to the present the player's commands act in (the host's now plus half
  the round trip), drawn between its steps. What it does is only drawn: no blow it strikes lands,
  nothing it says is heard twice. The host's now is reckoned from the quickest of its words of
  the last second (a held-up one doesn't put it back), and the round trip (the middle of the
  latest five, a second at most) followed slowly (0.1 ms a ms).
- **Ways found on the phone:** over the navigation tiles already made only (`bakedOnly`); off
  them, the stick's way goes straight on. Baking tiles round the hero on the phone was tried and
  measured: no better (the copy's own play has the tiles round the hero made), so it's left out.
- **Drawn:** the forecast's place, a new state's difference slid away at 6 m/s over 100–500 ms
  (closed in 100 ms, a 2 m one looked like a jump; snapped only onto another map, or more than
  8 m). `app/predict.js` goes.
- **A hold keeping the pace** was judged again with the forecast: no better and no worse, so it's
  left out (a hold stops them, as now).
- **The debug log** counts the corrections (0.5–2 m, over 2 m, snaps, the biggest) for the field.
- Tests: `test/forecast.test.js` (a host and a joined copy in Node, `test/joinedgame.js`: running,
  stopping and going, a tap; power strikes running past a foe and burns cast running round one;
  the copy never astray; a teleport drawn at once), the browser test of playing together; docs
  (WAR.md *Playing together*).
- Measured (the hero drawn jumping in all, on the mean of four links; the biggest single jump in
  any), today's drawing against the forecast, at a 300 ms round trip: running 2.3 m/0.41 →
  0.12/0.35; zig-zagging 18/5.8 → 0.67/0.31; stopping and going 16/4.4 → 0.10/0.35; running into
  things 1.7/0.36 → 0.05/0.28; a tap 4.8/4.6 → 0.06/0.41; power strikes running past 24/7.9 →
  2.2/0.36; burns running round 16/3.6 → 0.39/0.25. Snaps: 60 in the 28 runs before, none after.
- Found by measuring, and fixed before it went in: the host leaves the town out of its word (as
  what's always so), and the forecast read the map as none, so in the town its battle held the
  hero alone (no foe to strike, no one in the way); and it did a command a step after the host
  does (the host does one at once, as of its last step); and it reckoned the host's clock as
  keeping time, which a browser host drawing few frames doesn't (the two-player browser test's,
  at three frames a second, played at about a third of the clock's pace), so it drew the hero as
  far ahead as it looks, 2 s, and put them right by over 8 m at once. Now from the quickest of
  the host's words of the last second, come down to over half a second; and from the middle of
  the latest five round trips, none over a second.

## Stage 3: the stick, ten times a second (dropped, measured)

- Planned: `steering.js` sending the stick every 100 ms while held (from 500), at once on a start,
  a release, a run or a walk, or a turn past `TURNED`, at most once in 50 ms, each asking for 10 m
  ahead (`HELD_REACH`, from 30); latest wins.
- Measured with the forecast (four links each, a 300 ms round trip), against two a second:
  zig-zagging jumped 0.67 m in all → 1.66 m; running into things, the mean distance from where the
  host will have them 0.51 m → 1.15 m; running in the open 0.44 m → 0.57 m. Asking for 10 m alone
  (two a second) changes nothing measurable; sending ten a second alone does all of it.
- Why: over TCP an order sent again says nothing new, and each one the host takes sets the
  hero's way again from where they are; the forecast takes each a step off now and then (as a
  link's jitter has it), and the more there are, the more the two part (near a wall, or folk the
  hero brushes past). Two a second, and at once on a turn, a start, a stop or a change of pace,
  stays (a stick turned smoothly is sent up to sixteen times a second already, on its turns).
- So the stick stays as it is. Reconsidered only with a link that loses what's sent
  (WebTransport datagrams), where sending again is what gets it there.

## Stage 4: your own swings and casts at once

- The forecast keeps the `attack` and `cast` events its looks ahead begin for the hero (but a shot
  or a throw), and gives each back once (`begun`) as the present they're drawn in reaches it:
  shown and heard then (game.js `#attackSeen`, `#castSeen`), with the hold it puts on them. Begun
  again in a later look ahead within 300 ms of one shown, it's that one.
- The copy's of each (`claim`: the same kind, within 300 ms, not claimed already) isn't shown
  again; one the forecast never began is shown as the copy begins it, as before.
- A cast begun ahead: its glow in the hand, its sound, and its being broken off (cut short,
  fizzling) go by the forecast's casting (`casting`, at `present`), not the copy's.
- A shot or a throw is left to the copy: its arrow or spear is the copy's (a look ahead has none
  of its own past the next word), and the draw goes with it.
- The hero faces as an attacker does (not their way) while the forecast has them swinging or
  casting (`acting`).
- Measured (as below, a 300 ms round trip): power strikes running past a foe and burns cast
  running round one, every one the host made begun by the forecast and claimed, 420–650 ms before
  the copy's; none shown late; a cast the host refused (pressed in its cooldown) begun once.

## Measured at each stage

A host and a joined game in one process over a simulated phone link (half the round trip each way,
40 ms of jitter, one message in a hundred held up 300 ms as a lost TCP segment is), the joined game
played frame by frame as `game.js #tick` plays it, its hero drawn as `game.js` draws it, and a
scripted player: running, zig-zagging, stopping and going, running into things, a tap's move,
power strikes while running past an enemy, burns cast while running round one. Scored against
where the host has the hero when what's sent now reaches it: the frames the hero's drawn moving
further than anyone can run (jumps, and how far over), snaps (half a metre in a frame), and the
error (mean, 95th percentile, most), at 150 and 300 ms round trips. Each stage no worse than the
one before in any of them; stage 2 lands it as a test with limits (`test/forecast.test.js`).

## Later, not in these

- WebTransport datagrams for the stick (Safari 26.4+), keeping the WebSocket for older iPhones.
- A blow's start back-dated by the joiner's latency (up to 100 ms), and a short queue for the next
  quick action.
- A dropped player's hero (kept five minutes, doing what it was last told): the owner's to decide.
