# The war for the continent

Six peoples share the world ([WORLD.md](WORLD.md)), and each wants it for its own. Each is ruled
from its capital, and each sends out its forces to bring the others under it. The aim is to make
the others serve, not to wipe them out.

The player isn't any people's ruler. They're one of their people, and they make their mark on the
war in three ways:
- by what they do themselves;
- by the requests their people's rulers give them;
- by the standing they earn, which gives them a say in what their people decide.

This file sets out how the war works, what's built so far and what's to come. It also sets the
rules the engine keeps so that other players can later **hop in and out** of a running world.

## What's decided

| | |
| --- | --- |
| **The simulation** | Two layers. The **war** is played out as numbers: forces, towns, treasuries, relations, a turn every so often. Near any player, the war **comes to life** as real people in the battle, about 20 to 30 at most in a skirmish. |
| **Time** | The war moves on only while someone's playing. It's paced so that a player has time to grow: they shouldn't learn their third spell only to find a rival's great army at the gates. |
| **The player's people** | Humans, to start with. The other five come later, with their own looks. |
| **The other peoples' looks** | Bodies adapted from the one there is: elves tall and slender with long ears, dark elves the same in grey and violet, cat folk with ears, tails and fur, lizard folk scaled with a snout and tail, orcs as the orc. |
| **Standing** | A ladder of ranks within their people, from commoner up to one of the rulers' own council. Each rank opens more of what the player can ask and do. |
| **Commanding** | Followers, then squads under the player; and mercenaries and adventurers hired for gold. |
| **Conquest** | A town's folk stay when it falls, under their new rulers. |
| **The end** | A people that brings every other under it has won, and play goes on. Losing goes on too: the player serves the overlord until they can rise against them. |
| **Where the rulers sit** | A keep in each capital, and a town hall in each town and city. |
| **Scale** | Skirmishes of 20 to 30 real people near a player. |
| **Diplomats** | Travel the roads, and can be escorted, or waylaid. |
| **Pacing** | The war grows fiercer as the player grows stronger. |
| **Growing stronger** | Skills that grow by being used, each unlocking stronger ones along its own tree (below). Gear, bought and found, counts too. |
| **The rulers' temperaments** | Each people has its core temperament, but its rulers' traits are rolled a little differently in every world, so there's no one way to play any people. The player learns them from rumours of their leaders. |
| **Those in between** | Neutral peoples remember: grudges and favours. |

## The peoples at war

Each people is a **realm**. It holds:

- **its rulers**, sitting in the keep in its capital: a leader with a few traits (below) and a
  council;
- **its towns**: its capital, cities, towns and villages (the plan's places in its lands), each
  with a **garrison** in keeping with its size and **patrols** on the roads round it;
- **its treasury**: taxes from every town it holds, paid in each turn;
- **its forces in the field**: expeditions on the march, the camps they set up, and the raids
  and patrols the camps send out;
- **its relations** with each other realm it's met (below).

### Relations

Two realms know of each other once their people have met: forces within sight of each other.
Then they're one of:

| | |
| --- | --- |
| **Allied** | They help each other: their forces fight side by side, and come to each other's aid. |
| **Neutral** | Neither helps nor hinders. A neutral people can turn allied or hostile, and so can any of its people on their own account: a guard turns on those who harm his town. |
| **Hostile** | Their forces attack each other on sight, and they send expeditions against each other. |
| **Vassal** | Beaten. The vassal's forces are the overlord's allies, and the overlord's rulers direct both. |

**Diplomats** go by road between the capitals of peoples who know each other. A diplomat can:
- ask an ally to break off their alliance (both become neutral);
- ask a hostile people for a truce (both become neutral, with their vassals).

A diplomat who doesn't arrive, waylaid on the road, carries nothing.

### Growing and fighting

Every turn, each realm:
1. collects its taxes;
2. pays for its garrisons and forces;
3. decides, by its rulers' traits and its relations, what to spend on:
   - strengthening garrisons;
   - sending **expeditions** towards a hostile people;
   - sending diplomats.

An expedition marches the roads, then sets up a **camp** within reach of an enemy town. The camp
sends out patrols and **raids**, and stages the forces for an attack.

A town whose forces are all destroyed is **taken**:
- its garrison becomes the attacker's;
- its folk stay, under their new rulers;
- its taxes go to its new realm.

A **capital** taken, its forces and its leader destroyed, makes its people the conqueror's
**vassal**. Every one of its garrisons now serves the conqueror, whose rulers direct both.

### The rulers' traits

Each people has a core temperament. Orcs are warlike and humans steady, for example. Each world
rolls its rulers' traits a little differently around that core: how bold, how greedy, how
faithful to allies, how quick to hold a grudge. So no people plays the same way every time. The
player learns a ruler's traits from rumours about them.

### Grudges and favours

Every realm remembers what's been done to it, and who did it:
- a raid, a broken truce, a diplomat waylaid;
- or help in a fight, or a request carried out.

Grudges and favours fade slowly. They weigh on which way a neutral people turns.

## The player's part

- **The news of the war** reaches the player as it would anyone:
  - tavern rumours;
  - what folk say;
  - requests at the adventurers' guild, to drive off a rival's camp or break up a raid.
- **Requests** come from their people's rulers at the keep and the town halls. The player can:
  - carry messages;
  - escort diplomats, or waylay a rival's;
  - scout a camp, or break it up;
  - defend a town.

  Carrying them out raises the player's **standing**.
- **Standing** is a rank in their people. Higher ranks bring:
  - more say in what the rulers decide (where the next expedition goes, whether to make peace);
  - more to ask for: a squad of their own, the pick of the armoury.
- **Skills** grow by use, each along a tree of its own:
  - swordplay leads to stronger strikes;
  - healing leads to stronger healing;
  - talk leads to haggling, then persuasion, then diplomacy.

  The war moves faster as a player's fighting grows. A player who fights little (a healer, a
  talker) can still bring it on, with the mercenaries, adventurers and followers they hire.
- **Gear**, bought from the smiths and found in the world, makes the difference too.

## Hop in, hop out: playing with others

Later, another player's game can join a world that's running. The joining player:
- joins a people by the race of the character they choose;
- so stands allied, neutral or hostile to the host player, as their peoples stand;
- can leave again, while the world goes on.

The engine is built for this from the start. These are its rules:

1. **One authority.** The world belongs to its **host** (`core/host.js`), in the browser of the
   player who started it, or later in Node on a server. The host alone changes the world. Every
   other game only shows it.
2. **Players, not the player.** There's no one "player" in the engine:
   - players are a map of ids (`host.players`), and each game knows which one is its own (`me`);
   - the one playing alone is `"player"` (`HOST_PLAYER`);
   - the battle treats every character of kind `"player"` alike.
3. **Everything by command.** Whatever a player does that changes the world goes to the host as
   a **command**: walking, fighting, casting, going through a door, talking, and what's done by
   talking. The host checks each one before carrying it out, then answers `{ ok }` or
   `{ ok: false, reason }` (`host.command(playerId, command)`). A game never changes the battle
   itself.
4. **Plain data, kept and made again.** Everything in the world can be written down as plain
   data, and carried on from exactly as it would have gone (`host.snapshot()`, `Host.restore`):
   - the battle and everyone in it;
   - every random number generator's state (`random.js` `state`);
   - each character's last choices (`variety.js`);
   - which buildings' insides have been made, and in what order;
   - the players.

   Things are known by stable ids, never by reference. The world itself isn't written down: it's
   made again from its seed. `core/wire.js` carries it all as text (JSON, with the numbers JSON
   can't hold: `Infinity`, "never yet").
5. **The world and the character kept apart.** A world's save (the war, the battle) is the
   host's. A character's save is the player's own, and goes with them from world to world:
   - their hero;
   - what the folk remember of them, and what they've learnt;
   - what they've found of the world.
6. **Pause only when alone.** The menu and the world map stop the world only while there's no
   one else in it (`host.pausable`). Otherwise the world goes on, and only that player's taps and
   clicks stop.
7. **What's near any player comes to life.** The host decides what's real, looking at every
   player:
   - the buildings got ready to go into (`RELEVANCE`: those within 22 metres of any player, or
     that any player is heading into or is in; let go once every player's more than 90 away);
   - later, the war's forces in skirmishes.

   Each game draws only what the host has, as it comes and goes (`app/game.js` mirrors the
   battle's characters).
8. **Each player sees their own.** Fog, the map's icons, and talk are each player's own. A talk
   runs in the talking player's game: what's said is theirs, and what it does in the world goes
   to the host as a command.
9. **Hostility is between peoples.** Who fights whom follows the realms' relations, player or
   not. Two players of peoples at war are enemies. Players of allied peoples fight side by side.
10. **How games talk to each other is separate from what they say.**
    - **What they say:**
      - commands up to the host;
      - the host's events and state back down: a joiner gets the seed and a snapshot, then the
        events as they happen.
    - **How it gets there** is a separate matter: WebRTC data channels between browsers (with a
      small signalling service), or a WebSocket to a Node host.

## Milestones

| | | |
| --- | --- | --- |
| **M0** | Built | The engine made ready for other players: the host, players by id, commands, snapshots, pausing only when alone. This file. |
| **M1** | | The war on its own: realms, towns, garrisons, treasuries, turns, expeditions, camps, raids, conquest and vassals, relations and diplomats, as numbers. A page to watch it play out. |
| **M2** | | The war in the world: banners over the towns, guards and patrols of each people, hostility by relations, the war's forces brought to life near the player. |
| **M3** | | Growing stronger: skills that grow by use along their trees, gear, gold, a pack, shops. |
| **M4** | | The player's people: the keep and town halls, the rulers' requests, a journal, ranks. |
| **M5** | | The other peoples' looks. |
| **M6** | | Camps, raids and conquest played out around the player. |
| **M7** | | Diplomats on the roads, to escort or waylay; grudges and favours. |
| **M8** | | News and rumours: the war told in the taverns and by the folk; the guild's requests. |
| **M9** | | Followers, mercenaries and adventurers for hire. |
| **M10** | | The end: victory, and serving an overlord until the rising. |
| **M11** | | Hop in, hop out: other players joining a running world. |

## What's built

### The host (core/host.js)

`new Host(world)` holds everything that changes in the world:
- **the battle** (`host.battle`);
- **the players** (`host.players`, by id): each is `{ id, hero, realm, talks, explored }`;
- **the folk** in the battle (`host.folk`, by id: how each looks and talks);
- **the buildings got ready** (`host.open`, by key: their folk's ids);
- **what's been done by talking** (`host.done`, the last 50).

**Players.**
- `join({ id, hero, talks, explored })` puts a player in, at the world's start or the nearest free
  square to it.
- `leave(id)` takes them out, and returns their character as it's to be kept.
- `populate()` puts in the world's own people (the orc, the tavern's folk) after whoever's there
  to start with.

**Commands.** `command(playerId, command)` does what a player asks, if it can be done:

| Command | Does |
| --- | --- |
| `{ type: "move", to: [x, y] }` | Walk there (a square: whole numbers). |
| `{ type: "ahead", facing }` | Walk straight ahead as far as the way is clear. |
| `{ type: "engage", target }` | Go and fight someone (only an enemy). |
| `{ type: "approach", target }` | Walk up to someone, to talk. |
| `{ type: "enter", link }` | Go through a door or up the stairs (and the building's got ready at once). |
| `{ type: "stop" }` | Stop. |
| `{ type: "cast", spell, target }` | Cast a spell. |
| `{ type: "talk", with }` | Start talking to one of the folk near them (or stop: `null`). |
| `{ type: "effect", effect }` | Something done by talking, to whoever they're talking to. |

Any order can have `run: true`. A command that can't be done is refused, with a reason
(`REFUSALS`, or a spell's own: `CAST_FAILURES`):
- no such player;
- no such target, or the wrong kind (only enemies can be fought, only folk talked to);
- a door that isn't there;
- too far to talk;
- not talking to anyone.

**Advancing.** `advance(ms)` runs the battle and returns its events, with the host's own:

| Event | Says |
| --- | --- |
| `join`, `leave` | A player came or went. |
| `open`, `close` | A building was got ready, or let go, with its folk. |
| `explored` | A player found a new chunk, or went into a building for the first time. |
| `talk` | A player started or stopped talking. |
| `effect` | Something was done by talking. |

**Keeping it.** `snapshot()` gives all of it as plain data. `Host.restore(world, snapshot)` carries
on from it, in a world made again from the same seed:
- the buildings' insides are made again in the same order (so each is drawn in the same place);
- the settlements they're in are laid out first.

`test/host.test.js` checks that a restored world runs step for step the same as the one it was
kept from.

### The game (app/game.js)

The game makes a host when it's given none (playing alone), and joins its player to it as `me`.
From then on it only shows the world:
- **Drawing.** It draws everyone in the battle as the host has them (`#dress`, `#mirror`): a
  player from their hero, the orc, the folk. A building the host has got ready is built a piece
  at a time: its floors, then its folk. One it's let go is thrown away.
- **Doing.** Every tap, click, swipe and flick of the wheel becomes a command. Talk runs in the
  game, and asks the host to start and stop, and for whatever it does.
- **Keeping.** What the folk remember of the player, what they've learnt and what they've found
  are the host's player's own (`game.memory`, `game.knowledge`, `game.explored`), kept by the game
  as they change.
- **Pausing.** `game.pause()` stops the world only when it can. `game.stop()` stops it whatever
  (for tests stepping it on by hand).
