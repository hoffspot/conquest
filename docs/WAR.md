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
| **M1** | Built | The war on its own: realms, towns, garrisons, treasuries, turns, expeditions, camps, raids, conquest and vassals, relations and envoys, as numbers. A page to watch it play out. |
| **M2** | Built | The war in the world: banners over the towns, guards and patrols of each people, hostility by relations, the war's forces brought to life near the player. |
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

### The war (core/war)

The war is played out as numbers (`War`, `core/war/war.js`), from the world's plan, a turn every
minute of play (`TURN_MS`). Everything in it is plain data with seeded random numbers:
`war.snapshot()` and `War.restore(plan, snapshot)` carry on from where it was, the same every time
for a seed. A turn takes a millisecond or two.

**The realms.** Each people's realm holds:
- its **capital**, where its rulers sit (its `seat`);
- its **leader**, with a name, a title and traits (`peoples.js`). Each trait is rolled about the
  people's temperament: orcs warlike, elves slow to anger and slow to forget, dark elves scheming,
  cat folk proud and greedy, lizard folk patient, humans steady. `describeLeader` says what's
  marked about a leader, for rumours;
- its **treasury** (60 gold to start with), and its **standing** with each other realm (grudges
  and favours, fading a little every turn, more slowly the more the leader holds a grudge);
- its **overlord**, once it's been brought under another. A vassal of a vassal serves the top
  one.

**The towns.** The plan's capitals, cities, towns and villages are fought over (`HOLDINGS`).
Hamlets and farmsteads go with the town nearest them (`holdingAt`).

| | Garrison when full | Taxes a turn | Walls | Patrols (from M2) |
| --- | --- | --- | --- | --- |
| Capital | 40 | 6 | ×1.6 | 3 |
| City | 24 | 4 | ×1.35 | 2 |
| Town | 12 | 2 | ×1.15 | 1 |
| Village | 5 | 1 | ×1 | 1 |

**The ages of the war** (`STAGES`) say what can be taken, how big an expedition can be, and how
many forces each realm can have out:

| Age | Comes with might | What can be taken | Biggest expedition | Forces out |
| --- | --- | --- | --- | --- |
| An uneasy peace | 0 | Nothing: camps only raid | 8 | 1 |
| Border wars | 2 | Villages | 16 | 2 |
| War | 4 | Villages, towns and cities | 30 | 3 |
| Conquest | 6 | Capitals too | 60 | 4 |

The next age comes with the strongest player's **might** (`war.setMight`, 0 to 8: from their
skills, gear and followers, from M3), or after 90 turns each (an hour and a half of play) whatever.
It never goes back. So a player has an hour and a half before a village can be taken, and far
longer before a capital can.

**Each turn:**
1. **The age** moves on, if it's time.
2. **Meeting.** Peoples whose towns or forces come within 1.5 km of each other meet (neutral to
   start with).
3. **Taxes and keep.** Every town pays its holder, unless it was raided this turn or last. A
   vassal pays half of it to its liege. Every soldier costs 0.1 gold a turn. A realm that can't pay
   loses a twentieth of each garrison.
4. **Grudges and favours** fade.
5. **Each liege's rulers decide**, for their realm and its vassals:
   - **Garrisons:** fill them up (five a town at most), the seat first, then those threatened,
     keeping gold back for the troops' keep and, at war, for the war.
   - **Envoys** (one out at a time, 10 gold), to the other ruler's seat:
     - to sue for peace in a war going badly (the more cautious, the sooner);
     - to part an enemy from its ally;
     - to win over a neutral against a shared enemy (the more loyal, the likelier).
   - **War**, on a neutral they think they can beat or bear a grudge against. It's likelier the
     more warlike and greedy the ruler, the further the war's come, and the longer it's gone on.
     Its allies may join in against them. Once there's no one else to fight, the greedy and warlike
     may break with their allies.
   - **Relief** for their own or an ally's town with an enemy camp outside it stronger than its
     garrison.
   - **Expeditions** against the enemy's weakest near town. They go for one of their camps
     already outside first, to reinforce it, then for the enemy's seat, once it can be taken and
     they're strong enough. Each is as big as it takes, and as the age and the treasury allow
     (5 gold a soldier).
6. **The march.** Forces go along the roads (`roads.js`), or across country where there's none
   (counting 1.8 times as long): 250 m a turn, envoys 400. An expedition within 350 m of its
   target camps there, or joins its people's camp there.
7. **The camps.** Each turn a camp does one of these:
   - Is **sallied out** against by a garrison much stronger than it.
   - **Storms** its town, if the age allows it, it's sat there 3 turns (`SIEGE`), and it's strong
     enough for its ruler's taste. The fight goes round by round, the defenders' walls counting
     for them, until one side's gone or the attack breaks.
   - Otherwise it may **raid**: a few of its soldiers out against the town's fields, killing a few
     of its guard and stopping its taxes.
8. **Envoys** passing an enemy's forces may be **waylaid**.
9. **Vassals** that have served 60 turns may **rise** against their overlord: rarely, and likelier
   the stronger they are beside them, the more they resent them, and the harder pressed they are.
10. **The reckoning.** A people whose every rival serves it has **won**; play goes on. A rising
    can undo it.

**A town taken** is the attacker's: its garrison is what's left of their camp, and its folk stay
under their new rulers. **A realm's seat taken** makes it the taker's liege's **vassal**, with any
realms that served it:
- it gets a new ruler, and rules from its seat again (its seat is given back to it);
- its own dealings end: its liege's friends and enemies are its own;
- its forces fight for its liege.

**Relations** (`war.relation(a, b)`): `self`, `overlord`, `vassal`, `unknown`, or, as their lieges
stand, `allied`, `neutral` or `hostile`. Realms under the same liege are allied. `hostile` and
`friendly` answer the question the world will ask (from M2): will these two fight?

**From the world** (from M2 and M6):
- `war.loss(id, count)`: losses in fights played out near a player;
- `war.remember(realm, about, amount)`: grudges and favours earned by players.

**The news** (`news.js` `tell`): every event in words, "The Orcs have declared war on the
Humans.", for the war page now and the taverns later.

**In the game** the host keeps the war (`host.war`) and moves it on as the world's played. Its
events come as the host's `war` events, and a `turn` event after each turn. The war is kept with
the saved world, apart from the character (`save.js` `loadWorld`, `saveWorld`), and made again
from it the next time. Nothing in the world shows it yet (M2).

**The war page** (`war.html`, `lab/war.js`) plays the war out on a world's map:
- every town in the colour of whoever holds it, ringed in its builders' colour if it's been taken,
  with its garrison beside it;
- the forces out: shields for expeditions and relief, with the way they're going; tents for camps;
  scrolls for envoys;
- each realm, its ruler, what they're like, what it holds and its gold;
- how each stands with each other, and the news.

Play it a turn at a time or faster, and turn the players' might up to bring the next age on.
`?seed=N&might=M` chooses the world and the might.

### The war come to life (M2)

Near a player, the war's towns come to life: their soldiers are real people in the battle, of
whoever holds the town, and whom they fight is as their peoples stand.

**Mustering** (`host.js`, `war/muster.js`).
- **When.** Every half a second the host looks over the war's towns. A town's soldiers come out
  once any player is within 120 metres of its edge (out in the world, or in one of its buildings).
  They're let go once every player is more than 250 metres off. A town that's changed hands has
  its soldiers let go, and its new holders' come out.
- **Guards.** Guards stand in pairs either side of each road out of the town, just past its edge,
  facing out, then round the edge if it has fewer roads than guards. How many:
  - as many as its garrison has, up to its posts: a capital 8, a city 6, a town 4, a village 2;
  - each goes after an enemy within 14 metres of its post (its **leash**), and comes back to it.
- **Patrols.** Patrols of two walk a round of six points just outside the town's edge, each round
  the other way from the last (as many as the town has: `HOLDINGS` patrols), while its garrison's
  at least half full.
- **Each soldier stands for a share of the garrison.** One who falls takes that share off it in
  the war (`war.loss`), and is taken away 10 seconds after. A soldier never comes back to life:
  the town musters again from what's left of its garrison the next time a player comes.
- **Banners.** A banner stands beside each road out with guards at it, 3 metres further out than
  them: its people's colour, a trim, and their emblem (`world/banners3d.js`):

  | People | Emblem |
  | --- | --- |
  | Humans | a crown |
  | Elves | a leaf |
  | Dark elves | a spider |
  | Cat folk | a sun |
  | Lizard folk | a serpent |
  | Orcs | a skull |

  When the town changes hands, its banners come down and the new holders' go up.
- **What they carry** (`characters/soldiers.js`) is what they fight with. Guards carry the first
  of their people's weapons; patrols carry each of them in turn:

  | People | Guards | Patrols |
  | --- | --- | --- |
  | Humans | sword | sword, bow |
  | Elves | bow | bow, sword |
  | Dark elves | sword | sword, wand |
  | Cat folk | spiked gauntlets | spiked gauntlets, bow |
  | Lizard folk | staff | staff, bow |
  | Orcs | cleaver | cleaver |

  Orcs look as the orc does. The rest are dressed as the adventurers' guild's warriors and
  rangers until they have looks of their own (M5).

**Who fights whom** (`Battle.hostile`, and the host's `relations`):
- The folk: no one, ever.
- Anyone who has lately struck someone, or someone of their own they saw: the one struck, and its
  fellows who saw, hold it against them for a minute (`FOE_MS`), whatever their peoples.
- Two of the same people: never, otherwise.
- Two peoples' soldiers, or players: as their peoples stand in the war. At war, they fight on
  sight.
- The wild (the orc, and later the camps' foes, which are no people's) is set against the players,
  but not against the peoples' soldiers. A player's own soldiers who see the player struck fight
  for them.

**A neutral people's guards** can be talked to, or fought:
- Holding on one opens a wheel with **Fight** (crossed swords): picking a fight with them.
- The one picked on, and its fellows who see, fight back.
- Every blow on a soldier whose people aren't at war with the striker's is a grudge between the
  peoples (`war.remember`).

**Talking to soldiers.** A soldier who isn't an enemy can be tapped to talk to, as the folk can
(the `guard` talk):
- what they say depends on how their people stand with the player's (their `stance`: their own,
  allies, or neither);
- they tell who holds the town and who rules them, and how the war goes: its age, and who
  they're at war with.

**On the screen:**
- A bar over each soldier who's an enemy (or who's hurt); none over the rest.
- Soldiers drawn a few at a time as they come out (within the budget buildings are built in).

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
