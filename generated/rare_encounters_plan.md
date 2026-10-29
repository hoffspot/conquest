# Rare encounters: the engine

The plan for the wilds director's rare encounters, from `reports/Rare once per world encounters.md`
(the research) and the owner's decisions of 2026-10-29. It builds the engine that keeps, deals and
pays out rare encounters; the encounters themselves (the cards, their threads and their unique
rewards) are designed later, one at a time. Until then the engine deals nothing in play: a sample
card only debug mode can deal tries every part of it. Four stages, built in this order and
shipped together in one pull request (the owner's word, 2026-10-29).

## Decided

- **Two kinds of card.** *Unique* cards happen once in a world and once to a character: a character
  who's completed one never meets it again in any world, and on a world with many players the first
  party to complete it takes it for that world (the rest hear of it and find its aftermath).
  *Recurring* cards come now and then, like the invasion but rarer: each at most once every 4 to 6
  hours of play in a world.
- **How often.** A player's first rare card about an hour into their play in a world's wilds, then
  about one every 2 hours: a chance that rises after each miss (each ordinary card dealt instead),
  with a cap by which it's certain. **Each player's own clock**, kept for them in the world.
- **Inside** (dungeon floors, towers, crypts, ruins and their like, on going in): a **separate
  clock**, counted by the floors a player enters. A rare foe on the floor; its death drops a key or
  breaks a ward, which opens a door added to that floor, to a sealed room of special foes and
  rewards.
- **One at a time** in a world, whichever venue, with a short gap after each.
- **Dealt without repeats**: a world's deck of what's still to come, in an order of its own. A card
  not taken up, or taken up and not finished, goes back in the deck and comes again later.
- **Not taken up**: once every player's over 220 m from it and at least 10 minutes have passed since
  it was first seen (a night one also ends at dawn), it's gone from there, back in the deck, and
  never put on that spot again. One no one ever saw goes back as soon as everyone's far.
- **Where**: each card says how it's dealt: ahead of a player, as the director's other cards are
  (further, 90 to 140 m, with a sight line), or kept at a place the world picks from its seed,
  with gates (an hour, a moon, a season, a land) that rumours and shrine hints point to.
- **Gates are preferences**: an hour, the moon, a people's land, the player's history in the world;
  a card whose gates don't hold is passed over, and after enough passes it's dealt anyway.
- **Told plainly and from afar**: its own sound (in the sound studio's catalog), something seen or
  heard further off than any other card's, a mark on the map once seen, a line to the party.
- **Every encounter starts a thread**, the world's: anyone may take up its next step, and everyone
  who takes part in a step gets that step's reward; it's told in every participant's journal. Its
  steps can be: a follow-up card; a place to go; a person in a town, or a change in a town (new
  stock, a festival, a price or a service); a guild contract or bounty; a lock opened.
- **Locks**: a dungeon's way in, a special place's door (a ruined castle, a tower, a lair), a door in
  a town, or a sealed place the world adds, kept shut till a thread opens it. Selecting a locked
  door says what might open it.
- **Rewards**: each player who takes part gets their own, no rolling for it: an item found nowhere
  else in the game, as strong as a legendary of the land with an effect of its own, made at their
  level when it's given, kept with the character into every world, at most one of each a character.
  Some also change the world (a shop's stock, a festival, a place revealed).
- **Reacting to the player**: a card can read the world's history (what's been met there, its
  threads, what the player's searched and slain) to choose a variant or a gate.

## The engine (`core/rare.js`)

Pure data and arithmetic, no DOM, as `core/director.js` is; the host drives it with its own random
(the host runs in lockstep on every copy: nothing else may roll).

- **`RARE`**, its tuning: the clocks (below), `ahead` [90, 140] m, `seen` 140 m, `far` 220 m,
  `wait` 10 minutes, `gap` 10 minutes between rare encounters, `reach` 40 m (taking part),
  `recur` [4, 6] hours.
- **`RARE_CARDS`**, the cards in play (none yet), each `{ id, kind: "unique"|"recurring", venue:
  "wilds"|"inside", where: "ahead"|"site", site?, gates?, pass?, shape, reward, thread?, requires?,
  tell }`. `shape` says what it is in the world; the engine has `foe` (a named, ranked foe, done when
  it falls) to start with, and more are added with the first cards that need them (a figure to talk
  to, a find to search). **`SAMPLE`**, the one card debug mode deals.
- **`UNIQUES`** and **`THREADS`**: the unique rewards and the threads, keyed by id (none yet, but
  the sample's).
- **`Legends`**, a world's: the players' clocks; the decks; the one `active`; `done` (what was met,
  where, when, by whom, how it ended); `owed` (rewards kept for a participant who left before the
  end); the threads' progress; the locks; the world's changes (stock, prices, festivals). Its
  methods take the world's time and random and return what's to happen (`due`, `pick`, `deal`,
  `tell`, `engage`, `take`, `end`, `advance`), so they're unit-tested without a host.

### The clocks

- **Wilds**, a player's, as they cross the wilds (out of the settlements, on foot, standing): the
  time since their last rare card (or since they first came out in this world), and the ordinary
  cards dealt since then. At each ordinary card, from `least` on, a chance of the rare card instead
  that rises by `step` with each miss; certain once it's `most` since. First: `least` 40 minutes,
  `most` 90; after: 100 and 150; `step` 0.03. That's about an hour, then about two, at the
  director's 250–450 m a card; a simulation of seeded walks in the unit tests holds it to that.
- **Inside**, a player's: the floors they've gone into since their last rare card inside; from
  `least` (20 minutes the first time, 60 after), a chance on going into a floor that rises by 0.1
  with each, certain by the tenth.
- **Held, not lost**: a card that's due but can't be dealt (another's active, the gap since the last
  isn't up, nothing in the deck fits, a bad moment: a foe after them or within the last 5 seconds,
  below half their health, a build-up's hunters coming, the card just after an ambush) stays due,
  and comes at the next chance that's clear.

### The decks and the cards dealt

- A world's deck for each venue: its cards shuffled once, in an order of its own; a card dealt goes
  to the back, so none comes again before the rest have had their turn.
- **What can be dealt** to a player (or the group they're with): a unique card not done in this
  world, nor by their character in any world; a recurring card not dealt within `recur`; its
  `requires` met (a thread at the step that calls for it: those come first); its gates holding, or
  passed over `pass` times already (then dealt anyway).
- **Placed**: ahead, 90–140 m on, on open ground, out of the settlements, off the roads, with a
  sight line from where they are; or at its site, waiting there (told by rumours till it's met).
- **Its life**: placed, then **seen** (a player within `seen`: its sound, its mark on the map, the
  party told where), **taken up** (a player within `reach`, or fighting it), then **done**, **failed**
  (everyone's left it, or fallen) or **passed** (not taken up: `far` and `wait`). Failed and passed,
  it goes back in the deck. Done: a unique's gone from the world and kept by each participant's
  character; a recurring one waits out `recur`.
- **Taking part**: a player within `reach` of it while it's taken up, or fighting it. When it's
  done, each of them is given their own reward; one who's left the world finds it waiting when they
  come back (`owed`).

### Rewards (`UNIQUES`)

- A unique is `{ id, name, base (a piece of gear), about, effect?, bonuses? }`: made as a legendary
  of its base at the player's level when it's given (`rollGear`'s level, from their might), its
  name, its effect and its look its own. A new make, `unique`, coloured as no other.
- **Bound to the character**: it can't be sold, dropped, traded, discarded or given to a follower
  (refused, said why); a character who's had one can't be given it again (`progress.legends`).
- Its effect is one of the legendary effects, or one of its own added to them (`legendary.js
  EFFECTS`, with its look in `world/effects.js` and its sound in the catalog), designed with it.

### Kept

- **The world's `Legends`**: in the host's snapshot (a new `SNAPSHOT_VERSION`) for a world server,
  and, on a device, with the world (save.js: kept beside the war, saved as it changes), so a world
  played alone keeps its legends, its threads and every player's clocks.
- **The character's** (`progress.legends`): the unique cards they've done and the uniques they've
  been given, kept with the character into every world (`Progress`, `loadProgress`, a snapshot step,
  character files).
- A joined player's game keeps nothing of it; the host does.

### Shown

- **Its sound**: a sting of its own as it's seen, a single sign that this isn't an ordinary card
  (the catalog: what it is and when it plays).
- **On the maps**: its mark once seen (a mark of its own, never an ordinary card's), and the
  thread's next step once there's one.
- **In the journal**: *Legends*, the world's: its threads, each with its next step and what's known
  of it, and what's been met in this world (what, where, when, by whom).
- **Said**: to the party, where it was seen ("Bryn has seen something strange to the north-east");
  as it ends, plainly, that it won't come again, for a unique.
- **Debug mode**: a *Rare encounter* button deals the sample ahead of the player, and *Inside*, on
  the floor they're on.

## Stage 1: the engine and the wilds

- `core/rare.js`: `RARE`, `Legends` (clocks, decks, dealing, its life, taking part, owed rewards),
  the `foe` shape, `SAMPLE` and its unique.
- The host: the wilds clock at each ordinary card (`#deal`), the rare card placed ahead or at its
  site, its life followed each step (seen, taken up, done, failed, passed), the rewards given, the
  world's `done` kept; a debug command to deal the sample.
- Uniques: the `unique` make, `UNIQUES`, bound items refused for sale, dropping, trade, discarding
  and followers; `progress.legends`.
- Kept: the snapshot step, the world save beside the war, `loadProgress`, character files.
- Shown: the sting (catalog), its mark, the party's line, the journal's *Legends*.
- Tests: the clocks (a simulation of seeded walks: about an hour, then about two; none past the
  cap), the deck (none twice before the rest), its life, taking part and owed rewards, bound items,
  a snapshot round trip and a reload mid-encounter; a browser test dealing the sample and
  completing it in a party of two. Docs: WILDS.md *Rare encounters*, GAME.md, SERVER.md (what a
  world keeps of a hero).

## Stage 2: threads and the world's changes

- `THREADS`: steps of a follow-up card, a place to go (marked, done when reached or cleared), a
  person to talk to in a settlement (a reply of the thread's added to their talk while the thread's
  there), a guild contract (a request of the thread's offered at the guild); each step's reward to
  those who take part.
- The world's changes: a shop's stock in a settlement, a price or a service, a festival (cried, its
  prices for a day), a place revealed, a writing given.
- The sample's thread, two steps, in debug mode.

## Stage 3: locks

- A lock on a link: a building's door, a site's way in, a dungeon's, or a sealed place the world
  adds; kept shut for players (as the hells' seals are) till what opens it is done: a thread's step,
  a key carried, a ward broken. The world's locks are chosen from its seed as the world's made, for
  the threads that have them.
- Selecting a locked door says its hint at once, before walking there; and any door that refuses
  now says why (today the hells' sealed portals refuse in silence).

## Stage 4: inside

- The inside clock on going into a floor; the rare foe put on it, away from the way in; its key
  dropped, or its ward broken as it falls.
- The door added to that floor: a sealed arch against a wall, a link to a room of its own built for
  it (its plan from the dungeon's theme, at origins of its own, so it overlaps nothing), sealed by
  the foe (the hells' seal) or by the key; its foes woken as someone goes in; each participant's
  reward in its chest.
- Kept: the room made again from the world's record after a reload, as the dungeon is from its seed.

## To decide with the first cards

- Each card's shape, tell, gates, thread and unique, and any new shape or effect they need.
- The clocks' numbers, tuned by play.
