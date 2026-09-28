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
| **M3** | Built | Growing stronger: skills that grow by use along their trees, gear, gold, a pack, shops. |
| **M4** | Built | The player's people: the keep and town halls, the rulers' requests, a journal, ranks. |
| **M5** | Built | The other peoples' looks: elves, dark elves, cat folk, lizard folk and orcs, as soldiers and as townsfolk. |
| **M6** | Built | Camps, raids and conquest played out around the player. |
| **M7** | Built | Diplomats on the roads, to escort or waylay; grudges and favours. |
| **M8** | Built | News and rumours: the war told in the taverns and by the folk; the guild's requests. |
| **M9** | Built | Followers, mercenaries and adventurers for hire. |
| **M10** | Built | The end: victory, and serving an overlord until the rising. |
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
9. **Vassals** grow **restless** as they serve, and rise once they're ready (M10, below). Those
   that have served 60 turns may **rise** against their overlord sooner: rarely, and likelier the
   stronger they are beside them, the more they resent them, the harder pressed they are, and the
   more restless. A **fallen** people rises again in one of its old towns, once it's stirred to it.
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
- `war.remember(realm, about, amount)`: grudges and favours earned by players;
- `war.watch(ids)`: the towns and envoys a player's near, whose raids and assaults are played out
  there, and who go at their own pace (M6, M7);
- `war.settle(camp, { reached, reckon })`: a sortie over (M6);
- `war.move(envoy, at, leg)`, `war.waylaid(envoy, by)`: an envoy's way in the world (M7).

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

  Each is of their own people, in their people's body, skin and parts (M5), dressed as the
  adventurers' guild's warriors and rangers; orcs are dressed as the orc is.

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

### Growing stronger (M3)

A player grows by what they do (`Progress`, `core/progress.js`), kept with their character
(`app/save.js`) and changed only by the host.

**Skills.** Eight trees, each grown by its own use. A rank takes 100, 300, 800, 2,000 and 4,500
experience in all: Untried, Trained, Adept, Veteran, Master, Legend.

| Tree | Grows by | Brings, by Legend | Rank 2 ability |
| --- | --- | --- | --- |
| Blade | landing blows up close (their damage) | +60% damage up close, +20 hit points | Power strike |
| Marksman | landing shots from afar (their damage) | +60% damage from afar | Aimed shot |
| Healing | healing with spells (what's healed) | +100% healed | Greater heal |
| Hexes | stunning foes (15 a stun) | stuns twice as long | Hold |
| Endurance | taking blows (their damage), running out of stamina | +40 hit points and stamina, 10% of each blow taken off | |
| Trade | buying and selling (half a point a copper) | 25% off what's bought, 25% more for what's sold | |
| Talk | talking with the folk | persuasion (M4, M7) | |
| Command | leading followers | more followers (M9) | |

**Abilities** come with a tree's second rank, and join the action wheel:
- **Greater heal** (the player's own wheel, right): a slower cast healing 25 to 40.
- **Hold** (an enemy's wheel, left): a longer stun, from 9 squares.
- **Power strike** and **aimed shot** (an enemy's wheel, right): the next blow (up close, or from
  afar) does twice the damage. Each is ready again 12 seconds after.

**Gear** is a weapon, something on the body (a gambeson, a mail shirt) and a shield (only with a
sword or a hammer). Each is of a make, which counts in its price and in what it does:

| Make | Blows / protection | Price | Might |
| --- | --- | --- | --- |
| Common | ×1 | ×1 | +0 |
| Fine | ×1.15 | ×3 | +0.5 |
| Masterwork | ×1.3 | ×8 | +1 |
| Legendary | ×1.5 | ×30 | +1.5 |

Armour takes a share off every blow (a mail shirt 16%, a kite shield 10%), never more than 60% in
all. What's worn shows on the character.

**Coppers and the pack.** A player starts with 20 coppers and room for 20 things.
- **Shops.** The folk who keep a shop sell from it, from their talk's "What have you got for
  sale?":
  - the barkeep, the serving wenches and the innkeeper: ale (stamina) and hot meals (a little
    healing);
  - the smith and the apprentice: weapons, armour and shields, up to masterwork;
  - the priest: healing draughts;
  - the guild's receptionist: wands, grimoires and draughts, up to fine.

  What's carried sells for 40% of its price. The shop stays open while the player's within a few
  steps of the keeper.
- **Bought by talking.** A room, an ale or a meal bought in talk is had at once; a sharpening at
  the smithy or a blessing at the temple is a boon for ten minutes (sharper blows up close; a
  little more of everything).
- **Found.** Foes carry coppers, and sometimes a draught or gear: an orc 5 to 15 coppers, a
  soldier 2 to 8.
- **The pack** (its button, top right, or I) shows the coppers, what's carried (to wear, wield
  or use), what's worn (to take off), and each skill's rank and how far to the next. Trading, it
  shows the shop's wares too, and what's carried can be sold. Escape closes it.

**Might** is how dangerous a player is: their best fighting rank (or their command of others),
plus their gear's make, up to 8. The mightiest player's might sets how fast the war comes on
(`war.setMight`).

### The player's people (M4)

A player stands in their people (`Standing`, `core/standing.js`), kept with their character
(`app/save.js`) and changed only by the host.

**Where their people are ruled from.** A town hall in every town and city, and a keep in every
capital: the biggest house by the market, made over (docs/GAME.md). In them:

| Who | Where | Does |
| --- | --- | --- |
| The reeve | a town hall | gives work, and pays for it done; takes letters for the town |
| The clerk | a town hall | takes word of work done |
| Petitioners | a town hall | wait, and grumble |
| The ruler | a keep's throne | gives the keep's work to those of rank; hears counsel |
| The steward | a keep | gives the keep's work to those of rank; takes letters and tithes; the armoury |
| Councillors | a keep | tell what the ruler's like |
| Sentries | a keep | stand guard |

The ruler is their people's own (as the war has them: their name and title), crowned; a keep
that isn't its holders' seat has a governor on the throne. Only a player's own people's officials
(or their liege's) give them work.

**Standing** is earned by what's done for their people, and lost by what's failed or given up
(5 each):

| Rank | Standing | Opens |
| --- | --- | --- |
| Commoner | 0 | Work from the reeves at the town halls. |
| Freeholder | 60 | Scouting for the reeves. |
| Retainer | 180 | An audience at the keep, work from the ruler, and the pick of its armoury. |
| Knight | 400 | A say in where the next expedition marches. |
| Lord | 800 | A say in war and peace. |
| Councillor | 1500 | A seat on the council: your word weighs the most. |

**Requests** are offered from how the war stands (`offerRequest`), at most three carried at once:

| Request | Asked | Done when | Worth |
| --- | --- | --- | --- |
| A letter to carry | to one of the three nearest of their own towns | it's handed to the reeve there (or a capital's steward) | 10 standing and 6 coppers, and 5 and 3 for each km |
| A tithe for the treasury | while the treasury's thin | its coppers are paid (a quarter goes into the treasury as gold) | half its coppers in standing |
| Thin their numbers | in a war | so many of the enemy's soldiers are brought down | 4 and 4, and 6 and 3 for each |
| Clear the roads | always | so many of the wild are brought down | 6 and 6, and 8 and 4 for each |
| Scouting | from a Freeholder | the player goes within 220 m of an enemy camp or army near (or their nearest town) | 25 and 15 |
| Hold the town | from a Retainer, with an enemy camp within 1 km | the player was there (within 180 m of its edge) and the camp's gone, the town still theirs | 50 and 30 |
| Break the camp | from a Retainer, with an enemy camp within 1 km (M6) | the player was at the camp (within 150 m) and it's gone; failed if it takes the town | 60 and 40 |
| See the envoy there | from a Knight, at the keep, with one of their envoys on the road (M7) | the player was with them (within 60 m) and they're heard at their road's end; failed if they're waylaid | 70 and 40 |
| Stop their envoy | from a Knight, at the keep, with an enemy's envoy on the road (M7) | they're waylaid by the player's people; failed if they get there | 70 and 50 |

Each has so long to be done (war turns: a minute's play each; a letter longer the further it
goes), and fails when it runs out; one whose target's gone comes to nothing. What's done is told
to whoever asked (a letter, to whoever it's for) for its reward. The keep's are worth half as
much again, and it asks the weightier things.

**The armoury** gives a gift for each rank from a Retainer up, once: a fine mail shirt; a
masterwork of the player's own weapon; a masterwork kite shield (or mail, with a weapon that takes
no shield); a legendary weapon.

**Counsel.** At the throne, a Knight can say where the next expedition should march (one of the
three nearest enemy towns); a Lord can counsel peace with an enemy, or war on a people they're
neutral with (`War.counsel`). It weighs more the higher their rank (0.4, 0.7, 1), and is heeded
for 20 turns or until it's acted on:
- **March:** the town counts as far nearer in choosing the next expedition's target.
- **Peace:** each turn, a chance (the counsel's weight, more with a cautious ruler) of sending an
  envoy for a truce.
- **War:** each turn, a chance (the weight, more with a warlike ruler) of declaring war.

**The journal** (its button, top right, or J) shows:
- the player's rank, how far to the next, and what each opens;
- each request they carry: who asked, what, how far it's come, which way and how far to go, and
  how long's left (each can be given up);
- their people: who rules them and from where, whom they're at war with and allied to, how many
  towns they hold;
- what's lately done, failed or given up.

Where the requests take the player is marked on the world map with a gold star.

### Camps, raids and conquest in play (M6)

Near a player, the war's camps and what they do come to life.

**Camps.** A camp (one of the war's forces) is **pitched** once a player's within 150 metres of it
(`CAMP_NEAR`), and struck once every player's more than 300 off, or it's gone from the war
(broken, gone home, or into the town it took). Pitched (`war/muster.js` `campOf`, the same every
time for a camp):
- **five tents** round its fire, their doors to it: ridge tents of undyed canvas with a little of
  their people's colour (`world/camps3d.js`);
- **a fire** in a ring of stones, logs crossed in it, flames flickering; **its banner** beside it;
- **its sentries**, round the tents facing out (a third of the camp, up to six), each going after an
  enemy within 18 metres of their post. Each stands for a share of the camp: one who falls takes
  that share off it in the war (`war.loss`). A camp too few to hold (under 3) is broken.

**Sorties.** While a town's soldiers are out (a player near it: `war.watch`), what a camp does
against it isn't reckoned in the war but **played out** there: the war sends it out as a **sortie**
(`war.js` `#sortie`, the host's `#setOut`) and waits for it to be settled (`war.settle`):

| | Who comes | From, and making for | Over when | Then |
| --- | --- | --- | --- | --- |
| **A raid** | raiders (a third of the camp, up to 6) | 40 m out from the town's edge on the camp's side, to its fields just outside it | they're all down; or 30 s after reaching the fields (within 10 m) | reached: the town's taxes stopped, a grudge (`raided`); else driven off (`repulsed`) |
| **An assault** | attackers (the whole camp, up to 16) | the same, into the town | they're all down; or the town's defenders are | none of its defenders left: the town's **taken**, its new holders' soldiers out at once; else thrown back |

- Each raider or attacker stands for a share of those the camp sent. Their losses and the town's
  are the war's as they fall. Those still standing when it's over go back to their camp.
- A sortie goes on 2.5 minutes at most. If every player leaves the town first, the rest of it is
  reckoned in the war (as it would have been), and one out for 3 turns (`SORTIE_TURNS`) is too.
- A sally from the town, relief against a camp and the rest of the war are reckoned as ever.
- **On the screen:** "Raiders of the Orcs are coming for Ashford's fields!", "The Orcs are
  storming Ashford!"; and how it ended: the fields burnt, the raid driven off, the assault thrown
  back, the town fallen, the camp broken. The news tells of it too (`news.js`: "sortie", and a
  raid "driven off").

**Break the camp.** From a Retainer up, a reeve (or the keep) may ask the player to break up an
enemy camp outside one of their towns (above).

**Kept.** The camps pitched and the sorties out are in the host's snapshot, and the watched towns
and each camp's sortie in the war's, so a saved or joined world carries on exactly.

### The war's end (M10)

**Unrest** (`war.js` `RISING`). A people that serves another, or has fallen, has an unrest from 0
to 100 (`realm.unrest`, kept with the war), towards rising against its **oppressor**
(`war.oppressor`): the one at the top of those it serves; for a fallen people, whoever holds most of
its old towns.
- A vassal grows restless as it serves: a quarter a turn, and as much again if it bears its
  overlord a grudge. A fallen people only by what's done for it.
- Its players stir it (`war.stir`, from the host: `STIR`):

| Done | Unrest |
| --- | --- |
| A request done for their own people's rulers (not their overlord's) | 10 |
| A tithe paid to them | 15 |
| A contract from a guild's board | 4 |
| One of their oppressors' soldiers brought down | 3 |

- While they serve, their own people's halls and keep ask tithes for the rising, whatever the
  treasury holds.

**The rising.** Ready (100), a people **rises** at the war's next turn; the players hear it's
ready first ("restless"). A player's **counsel** can call it sooner, at the ruler's feet in their
own people's keep (not their overlord's), from a Knight up: "Is it time we rose against the Orcs?".
It's heard once the people are ready enough for their word: at 80 for a Knight, 65 for a Lord,
half the way for a Councillor (`war.rise(realm, { weight })`, weighing their rank's `COUNSEL`).
- **A vassal rising** throws off its overlord, gets a new ruler, and is at war with whoever it
  served (the one at the top). A vassal's vassals go with it.
- **A fallen people rising** takes back the one of its old towns nearest a player of theirs (or
  the least held), held by six tenths of the soldiers a town of its kind keeps. It rules from there,
  and it's at war with those who held it.
- Either way its unrest is spent, and a victory it undoes is told ("undone").

**Serving.** Brought under another, the player's people's enemies are their overlord's, and their
overlord's halls and keep give them work as their own do (M4); their counsel on marching, war and
peace isn't heard (their overlord decides). The ruler tells how near the people are to rising.

**Told to the player** (`host.js` `#fate`, the host's `fate` events; `app/fate.js`): each of the war's
great turns for their people, in a panel over the game that plays on once it's read (Play on, or
Escape):

| Fate | When | Told |
| --- | --- | --- |
| Victory | Every other people serves theirs | "Victory", and `HONOURS` standing (200) |
| Serving | Another's won, and theirs serves them | "The continent is theirs" |
| Defeat | Another's won, and theirs has fallen | "Defeat" |
| Brought under | Their people's seat is taken | "Brought under" |
| Fallen | Their people hold no town | "Fallen" |
| Risen | Their people rise | "Risen!" |
| Rule broken | Their victory undone | "Rule broken" |
| Restless | Their people are ready to rise | in a word, across the screen |

The journal says where their people stand: whom they serve and how near they are to rising, or
that they've fallen; that they rule the continent, or who does.

### Followers (M9)

**Hiring.** The adventurers at a guild (reading its board, or drinking at its tables) can be
hired, for coppers by their calling (`HIRES`):

| Calling | Fights with | Price |
| --- | --- | --- |
| Warrior | sword | 40 |
| Ranger | bow | 40 |
| Rogue | sword | 30 |
| Mage | staff | 60 |
| Cleric | hammer | 60 |

A player leads one follower, and more as their **Command** grows (1 more at rank 1, up to 6 more at
rank 5: `progress.js`). Command grows by leading: a share of every blow their followers land.
Hired, an adventurer's gone from the guild for good (`host.hired`). Asked without the coppers, they
say what they'd want and stay where they are.

**Following** (`battle.js`, ai `"follow"`, `FOLLOW`):
- a follower keeps within 3 steps of their leader, at their pace (running when they run);
- they go after any enemy of their leader's they can see within 12 steps of them;
- through a door or up the stairs, they come out beside their leader;
- they stand with their leader against the wild, and as their people stand with the others;
- what they bring down counts for their leader: its loot is theirs, and it counts towards their
  requests.

**Orders** (talking to them): wait here (they stand guard where they are), come on (they follow
again), or go their own way (dismissed). A follower who falls is gone.

**Kept** with the character (`characterOf`'s `followers`: name, calling, looks, people;
`save.js` `saveFollowers`), so they come along to any world; and in the host's snapshot. The
journal shows the player's company: each follower, how they are, and how many they can lead.

### News and rumours, and the guild's board (M8)

**The war's news** is heard as it goes round (`news.js` `rumoursAt`):
- in a town: what's happened within 5 km of it (raids, assaults, towns taken, camps made, armies
  marching...), and what's heard everywhere (wars declared and joined, alliances broken, truces and
  treaties, peoples brought under another, risings, the war's new ages, victory);
- newest first, told in words (`tell`), three at most, none twice; not the war's small business
  (who's met whom, counsel, unpaid soldiers).

**What's said of the rulers** (`rumourOfRuler`): the most marked of a ruler's traits, of the town's
holders or a people they know of: "They say Warchief Gorgash of the Orcs is spoiling for a fight."

**Who tells it**: asked "What's the word on the war?", the barkeep, the patrons, the innkeeper and
the barmaids tell it, each their own way; an adventurer tells what they've heard on the road. The
game fills in what's heard where they are (`{rumour1}` to `{rumour3}`, `{rumourRuler}`), and they're
only asked when there's something to tell. The guards and officials say how the war goes too (M2,
M4).

**The adventurers' guild's board** (`standing.js` `offerContract`): its receptionist gives
contracts to any registered adventurer, of whatever people (no standing needed, none given; paid
in coppers):

| Contract | On the board | Done when | Pays |
| --- | --- | --- | --- |
| Beasts on the roads | always | 2 to 4 of the wild brought down | 10, and 7 for each |
| A bounty | the town's holders at war | 2 to 4 of their enemies' soldiers brought down | 8, and 6 for each |
| The camp outside the walls | an enemy camp before the town (M6) | the player was at it, and it's gone | 70 |

They're carried like the rulers' requests (the journal shows them), and told of at the counter.

### Envoys on the roads, grudges and favours (M7)

**Envoys.** An envoy on the road (one of the war's forces: going between two rulers' seats to
seek a truce, an alliance, or an end to one) is **met** once a player's within 150 metres of
them (`ENVOY`), and let go once every player's more than 300 off:
- **the envoy**, in a councillor's robes with a staff (`soldiers.js`, `part: "envoy"`), and **their
  escort**, two of their people's soldiers;
- they go along their road (its points in the war) as fast as they walk, making for a point 24
  metres on at a time. While they're met, the war doesn't move them on itself or waylay them: it's
  told where they've got to (`war.move`), and hears them at their road's end;
- **struck down**, the envoy's waylaid (`war.waylaid`), by whoever did it (a player's people, or
  their soldiers'; or no one's, the wild): what they carried comes to nothing, and their people bear
  the waylayers a grudge (10);
- the player's told when an envoy near them arrives, or falls;
- they can be talked to: "Envoy to the Humans", "Escort to the envoy to the Humans".

**Requests** (above): the keep asks a Knight to see its envoy there, or to stop an enemy's.

**Grudges and favours** (a realm's `standing` towards another: `war.remember`, fading) weigh on
whom a people makes war on, allies with and heeds (M1). Players earn them:
- **a grudge** for every blow on a soldier of a people not at war with theirs (M2), for a camp's
  raids and assaults (M6), and for an envoy waylaid;
- **a favour** (2) when a player brings down a people's enemy where that people's soldiers can see
  it (within 25 metres, `FAVOUR_SIGHT`): an ally's, or a neutral's.

**The journal** says how each people the player's have met regards them: "bear you a deep
grudge" (−30 or worse), "bear you a grudge", "think little of you either way", "owe you a
favour", "are much in your debt" (30 or more) (`journal.js` `regardOf`).

**Kept.** The envoys met are in the host's snapshot; the war's watched envoys in its own.

### The other peoples' looks (M5)

Each people has bodies of their own (`characters/peoples.js`), made from the one body there is
(MakeHuman's, `characters/body.js`) by its sliders, its skin and parts worn like gear. Each one of
a people is a little different, from a seed of their own:

| People | Body | Skin, eyes, hair | Their own |
| --- | --- | --- | --- |
| Humans | as their forebears were (`characters/folk.js`) | | |
| Elves | tall and slender, fine-faced, long legs and neck | fair; blue, green or amber eyes; pale or bright hair, long | long ears, pointed and swept back |
| Dark elves | the same, a little stronger | grey to violet, dark lips, pale brows; red, gold or violet eyes; white or silver hair | the same ears |
| Cat folk | lithe, short-nosed and broad across it, big-eyed | furred (a dun, ginger, grey, black, cream or white coat, some of them striped); slit eyes | a cat's ears on top of the head, and a long tail |
| Lizard folk | broad and strong, a snout, a heavy brow and a thick neck | scaled green, olive or teal; slit eyes; no hair | a heavy tail |
| Orcs | as the orc is, some taller or leaner; their women less heavy in brow and jaw | the orc's green, or near it, some painted | tusks |

- **Sliders** added for them (`characters/details.js`): the ears' length, tips, sweep and height,
  a snout, and the neck's length.
- **Fur, stripes and scales** are painted on the skin (`characters/skin.js`): the fields for them
  (Worley cells for scales, `characters/noise.js`) made the first time anyone wants them.
- **Ears and tails** are worn in slots of their own (`ears`, `tail`), on sockets on top of the head
  and at the base of the spine; they're in their wearer's own skin's colour, and tails sway as
  they go.
- **Soldiers** of every people are of it (`characters/soldiers.js`).
- **Townsfolk** are the people of the place (`Interiors.add`'s `people`): a cat folk's town's
  barkeep, reeve and patrons are cat folk, dressed for their parts, and named in their own tongue
  (`core/names.js`: "Khekan Mirrzeh", "Silwen Nimarilond"). Conquered townsfolk stay as they were:
  only a keep's governor is of its new holders' people.
- **The character lab** shows each people (Elf, Dark elf, Cat folk, Lizard folk).

### The host (core/host.js)

`new Host(world)` holds everything that changes in the world:
- **the battle** (`host.battle`);
- **the players** (`host.players`, by id): each is `{ id, hero, realm, talks, explored, progress, standing, boons }`;
- **the folk** in the battle (`host.folk`, by id: how each looks and talks);
- **the buildings got ready** (`host.open`, by key: their folk's ids);
- **what's been done by talking** (`host.done`, the last 50).

**Players.**
- `join({ id, hero, talks, explored, progress, standing })` puts a player in, at the world's start or the
  nearest free square to it, dressed in what they wear.
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
| `{ type: "effect", effect }` | Something done by talking, to whoever they're talking to: an official's work asked for or taken on (`work`), what's done told of (`report`), the armoury's gift (`armoury`), counsel (`counsel`). |
| `{ type: "buy", item, from }` | Buy something from a shopkeeper near them. |
| `{ type: "sell", index, to }` | Sell something from their pack. |
| `{ type: "equip", index }` | Wear or wield something from their pack. |
| `{ type: "unequip", slot }` | Take off their body armour or shield. |
| `{ type: "use", index }` | Drink or eat something from their pack. |
| `{ type: "ability", ability, target }` | Use an ability they've learnt. |
| `{ type: "abandon", request }` | Give up a request they carry. |

Any order can have `run: true`. A command that can't be done is refused, with a reason
(`REFUSALS`, or a spell's own: `CAST_FAILURES`):
- no such player;
- no such target, or the wrong kind (only enemies can be fought, only folk talked to);
- a door that isn't there;
- too far to talk;
- not talking to anyone.
- not enough coppers, nothing like that for sale, a full pack;
- an ability not learnt, or not ready yet;
- not the one to ask, a stranger, not of the rank, nothing to offer or to tell of, enough carried
  already, the armoury's gifts had, counsel that can't be taken.

**Advancing.** `advance(ms)` runs the battle and returns its events, with the host's own:

| Event | Says |
| --- | --- |
| `join`, `leave` | A player came or went. |
| `open`, `close` | A building was got ready, or let go, with its folk. |
| `explored` | A player found a new chunk, or went into a building for the first time. |
| `talk` | A player started or stopped talking. |
| `effect` | Something was done by talking. |
| `rank` | A player's skill reached a new rank (and any ability it brings). |
| `loot` | A player found coppers and things on a fallen foe. |
| `bought`, `sold`, `used` | A player bought, sold, or used something. |
| `gear` | What a player wears and wields changed. |
| `ability` | A player used an ability. |
| `request` | A player's request was taken, counted, done (to be told of), told of and rewarded, failed, given up or came to nothing. |
| `standing` | A player reached a new rank in their people. |
| `gift`, `counsel` | A player had the armoury's gift, or gave counsel. |

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
