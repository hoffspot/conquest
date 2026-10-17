# The wilds

Out of town the world has creatures in it: wolves on the roads, bears in the woods, slimes in the
meadows, and each people's own strange things in the wilds of their lands. They're about as strong
as a new adventurer near home and stronger the further out, with the mightiest kept to the
perilous places for players near the height of their power. This covers what they are, where and
how strong, how they behave, how they're kept about the players, and how they're built and
animated.

The code: `client/js/core/creatures.js` (what each is), `core/battle.js` (how they fight),
`core/host.js` (keeping them about the players, and the elites), `core/caches.js` (the adventurers'
caches and the brigands keeping them), `core/weapons.js` `NATURAL` (their fangs, claws
and breath), `core/afflictions.js` (what lingers after their blows, and the cures),
`client/js/beasts/` (how each looks and moves), and `world/effects.js`, `world/ailments3d.js`
(their fire, venom, webs and roots, and what shows on whoever they hit). The model viewer
(`model-viewer.html`, *The model viewer* below) shows every one, doing everything it does.

## The creatures

Hit points are at the first tier (each tier up multiplies them, and the blows, by 1.18: about a
third more to beat). "Pack" is how many come together at their least tier; packs grow by one every
two tiers above it, up to their most.

| Creature | HP | Temper | Pack | Tiers | Where |
| --- | --- | --- | --- | --- | --- |
| Giant rat | 22 | aggressive | 1–2 | 1–3 | anywhere |
| Porcupine | 34 | defensive | 1 | 1–3 | woods, meadow, heath, farmland, elfwood, tundra |
| Green slime | 30 | defensive | 1–2 | 1–3 | meadow, farmland, woods, marsh, jungle, elfwood |
| Bat swarm | 26 | aggressive | 1 | 1–4 | anywhere |
| Wolf | 24 | aggressive | 2–4 | 2–5 | woods, tundra, heath, elfwood, meadow, snow, darkwood |
| Wild boar | 44 | territorial | 1–2 | 2–5 | woods, farmland, meadow, heath, jungle |
| Adder | 20 | territorial | 1 | 2–6 | heath, meadow, marsh, savannah, badlands, jungle, farmland |
| Bandit | 32 | aggressive | 1–3 | 2–7 | farmland, meadow, woods, heath |
| Brown bear | 60 | territorial | 1 | 3–7 | woods, mountain, tundra, elfwood, darkwood |
| Puma | 40 | territorial | 1 | 3–7 | mountain, woods, heath, badlands, darkwood |
| Dire wolf | 30 | aggressive | 1–3 | 3–8 | tundra, snow, woods, heath, mountain |
| Werewolf | 64 | aggressive | 3–5, with its wolves | 5–9 | woods, darkwood, heath, tundra, elfwood, mountain, meadow; only by night |
| Goblin raider | 26 | aggressive | 2–5 | 3–8 | heath, mountain, badlands, woods |
| Goblin bomber | 22 | aggressive | among goblin raiders | 3–8 | with goblins (*Goblins*, below) |
| Goblin King | 34 | aggressive | leads goblins | 3–8 | the goblins' elite (*Goblins*, below) |
| Skeleton | 34 | aggressive | 1–3 | 3–9 | marsh, heath, tundra |
| Cultist | 28 | aggressive | 1–3 | 3–8 | marsh, jungle, darkwood, volcanic |
| Troll | 90 | aggressive | 1–2 | 4–9 | mountain, snow, tundra, heath |
| Ogre | 80 | aggressive | 1–2 | 4–9 | badlands, heath, mountain, savannah, marsh |
| Wyvern | 60 | aggressive | 1–2 | 5–9 | mountain, badlands, volcanic, snow |
| Black shuck | 50 | aggressive | 1 | 3–8 | the humans' wilds only |
| Boggart | 30 | territorial | 1 | 1–6 | the humans' wilds only |
| Badger | 30 | territorial | 1 | 1–4 | the humans' wilds only: woods, heath, meadow |
| Wild bull | 56 | territorial | 1–2 | 2–6 | the humans' wilds only: meadow, farmland |
| Rook flock | 24 | territorial | 1 | 1–4 | the humans' wilds only: farmland, meadow |
| Knucker | 70 | territorial | 1 | 3–8 | the humans' wilds only: woods, marsh, meadow |
| Hodmedod | 44 | aggressive | 1 | 2–7 | the humans' wilds only: farmland, at night |
| Will-o'-wisp | 22 | aggressive | 1–2 | 1–7 | the elves' wilds only |
| Blighted treant | 80 | territorial | 1 | 4–9 | the elves' wilds only |
| Mandrake | 20 | defensive | 1–2 | 1–4 | the elves' wilds only: elfwood |
| Hound of Annwn | 28 | aggressive | 2–4 | 3–7 | the elves' wilds only |
| Pixie swarm | 20 | territorial | 1 | 1–4 | the elves' wilds only: elfwood, meadow |
| Hart | 40 | territorial | 1–3 | 2–5 | the elves' wilds only: meadow, elfwood |
| Kelpie | 62 | aggressive | 1 | 3–8 | the elves' wilds only |
| Cave spider | 24 | territorial | 1–4 | 1–7 | the dark elves' wilds only |
| Shadow stalker | 50 | aggressive | 1 | 4–9 | the dark elves' wilds only |
| Cave olm | 26 | territorial | 1–2 | 1–4 | the dark elves' wilds only |
| Giant centipede | 26 | aggressive | 1–2 | 1–5 | the dark elves' wilds only |
| Basilisk | 44 | territorial | 1 | 3–7 | the dark elves' wilds only |
| Draugr | 72 | aggressive | 1–2 | 4–9 | the dark elves' wilds only |
| Mare | 34 | aggressive | 1 | 2–6 | the dark elves' wilds only, at night |
| Hyena | 22 | aggressive | 2–5 | 1–7 | the cat folk's wilds only |
| Sand scorpion | 30 | territorial | 1–2 | 1–7 | the cat folk's wilds only |
| Jackal | 18 | aggressive | 2–4 | 1–4 | the cat folk's wilds only |
| Cape buffalo | 64 | territorial | 1–3 | 3–7 | the cat folk's wilds only |
| Nandi bear | 62 | aggressive | 1 | 4–8 | the cat folk's wilds only |
| Locust swarm | 22 | aggressive | 1 | 1–4 | the cat folk's wilds only |
| Spitting cobra | 30 | territorial | 1 | 2–6 | the cat folk's wilds only |
| Bog frog | 28 | territorial | 1–2 | 1–6 | the lizard folk's wilds only |
| Marsh crocodile | 60 | territorial | 1 | 3–8 | the lizard folk's wilds only |
| Giant leech | 20 | territorial | 1–2 | 1–3 | the lizard folk's wilds only: marsh |
| Jaguar | 42 | territorial | 1 | 2–6 | the lizard folk's wilds only: jungle |
| Great boa | 58 | territorial | 1 | 4–8 | the lizard folk's wilds only |
| Bloodfly swarm | 18 | aggressive | 1 | 1–4 | the lizard folk's wilds only: jungle, marsh |
| Ahuizotl | 38 | territorial | 1–2 | 3–7 | the lizard folk's wilds only: marsh, jungle |
| Magma slime | 45 | territorial | 1–2 | 1–8 | the orcs' wilds only |
| Rock tusker | 80 | territorial | 1 | 4–9 | the orcs' wilds only |
| Gila monster | 30 | defensive | 1 | 1–4 | the orcs' wilds only: badlands, heath |
| Salamander | 32 | territorial | 1–2 | 2–6 | the orcs' wilds only: volcanic, badlands |
| Death worm | 40 | territorial | 1 | 2–6 | the orcs' wilds only: badlands |
| Vulture flock | 30 | aggressive | 1 | 1–4 | the orcs' wilds only: badlands, heath |
| Chimera | 85 | aggressive | 1 | 5–9 | the orcs' wilds only: volcanic, badlands |
| Giant ant | 24 | aggressive | an ants' nest's packs | 1–9 | the ants' nests only (docs/DUNGEONS.md) |
| Great centipede | 52 | aggressive | an ants' nest's packs | 3–10 | the ants' nests only |
| Ant Monster | 96 | aggressive | 1, calling its flock | 4–10 | the ants' nests: their boss |
| Restless ghost | 26 | aggressive | 1–2 | 3–9 | the ruins, ruined castles and graveyards, with their dead |
| Wraith | 46 | aggressive | 1 | 5–10 | the ruins and ruined castles, with their dead |
| Drake | 90 | aggressive | 1 | 10 | the drake's lair |
| Dreadthorn | 220 | aggressive | 1 | 10 | a Dreadthorn's lair |
| Wight lord | 70 | aggressive | 1 | 9–10 | the ruined castles |
| Frost troll | 75 | aggressive | 1 | 9–10 | the high snows |

A few do something besides biting and clawing: the adder, bog frog, magma slime, salamander,
death worm and knucker spit (venom, venom, lava, fire, acid, venom), a spitting cobra spits venom
in the eyes (staggering whoever it catches, and leaving none lying), a mandrake shrieks
(staggering whoever's near), a pixie swarm dazzles (staggering and slowing whoever's near: led
astray), a basilisk's glare staggers and slows whoever meets it, a great boa and a knucker throw
their coils round whoever they're after (crushing and slowing them), a kelpie's bite and an
ahuizotl's tail-hand drag whoever they hold (slowing them), a chimera's serpent tail strikes
(venomous) and it breathes fire as the drake does, the
will-o'-wisp looses bolts of light, the treant calls up roots, the cave spider
spits webs, the drake breathes fire, the wight lord and a draugr lay a curse, a mare sends
nightmares (withering), a ghost wails (staggering whoever it reaches) and a wraith draws the life out of whoever it holds its hand out to (each flies
as a projectile). A ghost's touch is the grave's cold, slowing; a wraith's claws wither.
The bog frog's tongue reaches two squares off. The rock tusker's charge, a Cape buffalo's, and a
kelpie's hooves knock whoever they catch off their feet (below). Many leave something lingering: poison, a sickness, a curse, fire, a
bleeding wound, a web or roots holding them (below: "What lingers").

### Werewolves

A **werewolf** is someone under a curse, out only by night (`night: "only"`), far out (tiers 5 to
9) in the woods, the dark woods, the heaths, the tundra, the elves' woods, the mountains and the
meadows. It hunts at the head of a pack of the wolves it calls to it: each of its pack but itself
a dire wolf or a wolf (creatures.js `band`), two to four of them, more the further out. It's fast
(3.8 m/s chasing), sees in the dark as well as by day, is too heavy to be thrown by a blast
(`steady`), and its hide turns a tenth of every blow. Its claws rake (6–11, laying a wound open a
third of the time), or it springs on whoever it's after, its whole weight behind it (9–16,
staggering): weapons.js `werewolf`. At daybreak, out of everyone's sight, it goes with the night
(*By night*, below). It drops its pelt and claws, and what was in its purse.

It's drawn from a model of its own once that's read (*Drawn from a model*, below): a bought one,
2.4 metres tall, in its own grey skin or one of three others, the dusk's (black), the ash's (pale)
or the russet's, by its seed; it rakes with its claws, leaps on whoever it's after, and howls and
looks about as it rests. Its model's read before one's met, wherever one may be by night and near
its dens. Till it's read, a great dark wolf, a third bigger than a dire wolf, stands in for it
(beasts/looks.js).

**The Moonfang** is the first of the werewolves, the master of each of their dens: one or two a
world, a cave's mouth cut into a wooded hillside, the bones of what's been dragged home about it
(`werewolf's den`: worldplan/settle.js `WEREWOLF_DENS`, setpieces/neutral.js). It's always there,
by day or night, with two of its werewolves, each at the head of a pack of its own (the wolves
it runs with join it against a stronger side), and three dire wolves (`LAIRS`), once a player's
within 100 metres; slain, it's gone 40 minutes. It's drawn from the werewolf's model, 3.4 metres
tall to a werewolf's 2.4, always in the moonfang's skin, black with a pale glow (beasts/model.js
`MODELS`), its hide turning a quarter of every blow; its claws rake harder (10–17) and its spring
reaches further and knocks down (14–24): weapons.js `moonfang`. Its pelt and a fang are its own
(`moonfangPelt`, `moonfangFang`), and its den's hoard has an old relic in it. Its model's asked
for once a player's within 1.5 km of a den (game.js `#modelLairs`), as a Dreadthorn's is near its
lair; it doesn't circle over its den as a drake does. Till it's read, the werewolf's stand-in,
bigger still and black, its eyes pale as the moon, stands in for it.

### Goblins

Goblins go about in raiding parties, and some of each party (each but its leader, 3 in 10:
creatures.js `band`, `memberOf`) are **goblin bombers**: slighter, a sack of bombs on the back, a
leather cap against the sparks. A bomber keeps its distance: come within 4 metres of it, it backs
off 6 (battle.js `KEEP`), at most once every 4 seconds, and fights where it stands between; it
never closes in to claw. From up to 10 metres off it lobs a lit bomb (every 3.8 seconds at most)
at where whoever it's after stands: the bomb flies at 9 m/s (half a second at least), lands and
fizzes there 1.5 seconds, a ring of light on the ground as wide as its blast, pulsing quicker as
its wick burns down; then it bursts (battle.js `BOMBS`, `#blast`). The blast hurts its thrower's
enemies within 2.5 metres (5–10 at its heart, half at its edge, times its tier: as fire, so a
ward against fire takes its share; but no shield, cover or dodge) and **throws them**: flung away
from its heart, 3 metres from its heart and half that from its edge, as far as the ground's
clear, onto the nearest free square (battle.js `TOSS`). The thrown are in the air 0.55 s and
0.09 s more a metre, and down and getting up 2.6 seconds in all (they can't move, fight, cast or
use anything); then they can't be thrown again for 4 seconds. Players and their companions are
thrown as anyone is; never the heavy or the unsolid (bats and the other flocks and swarms,
bears, trolls, ogres, wyverns, wisps, treants, crocodiles, rock tuskers, wild bulls, Cape
buffalo, Nandi bears, great boas, knuckers, kelpies, chimeras, draugar, drakes, ghosts, wraiths,
mares, frost trolls: creatures.js
`steady`), the perilous places' own, an elite, a dungeon's boss, a fortification, a palisade or
a wagon. The thrown body's a ragdoll (docs/CHARACTERS.md *Thrown*); a creature's tumbles whole.

The goblins' elite (*Elites*, below) is the **Goblin King**, not an "Elite Goblin raider":
bigger than any of them (as tall as a man), broad, crowned and caped in red edged with gold,
leading a war band of raiders and bombers on its round. A great cleaver up close; and every 7
seconds, at whoever keeps more than 3.5 metres off (as far as 11), a bigger bomb (`bigBomb`:
8–15 at its heart, 3.5 metres round, throwing them 1.4 times as far, its wick 1.8 seconds),
never itself thrown. It leaves the elite's prize, nearly always 3 to 5 Goblin Bombs, and a much
better chance of the Explosion spell's tome (docs/MAGIC.md): about two in five, where any other
that carries a tome seldom has this one. On the caves' throne it's harder still: docs/DUNGEONS.md
*Who's in it*.

A bomber leaves 1 to 3 **Goblin Bombs** three times in four, a raider one now and then (spoils.js).
A Goblin Bomb (progress.js `ITEMS.goblinBomb`; never sold) is thrown from the pack ("Throw") or
from an enemy's action wheel or a quick action at the foe the player's named or set on, or the
nearest they can see within 12 metres (host.js `#use`, battle.js `lob`): thrown as a bomber
throws (an underarm lob, an overarm one or a sidearm hurl), it does 14–24 at its blast's heart,
and throws their enemies, never the player or their friends and allies. Refused, and kept, with
no one in reach, out of sight, or in the middle of a blow or a spell.

## How strong, and where

The tier of a place goes up the further it is from home: `tierAt` counts from the player's own
people's start (where their heroes begin). It's the first tier as far as 1,450 m out
(`TIER_LAND.from` 600 m and `every` 850 m), the second from there, and one more every 850 m
further, up to 8 in the open. The high, cold and burning lands (snow, mountain, volcanic) two
tiers more once they're past tier 6, up to 10. So what's near home is a match for a new
adventurer, and the danger grows the further they go. What's found at a place (`candidatesAt`) is
whatever likes its land and has that tier among its tiers; the people's own creatures only in the
wilds of their lands. Each people has creatures of its own from the first tier, so what's about a
start town differs by who you play: the humans' boggarts, the elves' will-o'-wisps (by night),
the dark elves' cave spiders, the cat folk's hyenas and sand scorpions, the lizard folk's bog
frogs and the orcs' magma slimes. (The wild camps keep their own ladder, the first tier within
about 2 km of the start: docs/WORLD.md.)

The perilous places hold the mightiest, each a master and its guards (`LAIRS`): the drake at the
drake's lair, with two wyverns; a Dreadthorn at each of its own lairs, with three wyverns; the
Moonfang at each werewolves' den, with two werewolves and three dire wolves; a wight
lord and its dead in each ruined castle (three skeletons, two ghosts and a wraith); the frost troll
in the snows. The Dreadthorn is the mightiest of all, a fight for a party: its hide turns a third of
every blow (armour 0.35), its bite reaches two metres and lays a wound open, and its breath reaches
nine, setting whatever it reaches burning. Its hoard is greater than a drake's (`LOOT.greatHoard`,
500 to 900 gold and masterwork things), with an old relic in it as a ruined castle's has. Its
scales, horn and heart are its own (`dreadthornScale`, `dreadthornHorn`, `dreadthornHeart`, up to
700 gold for the heart). It circles high over its lair while it lives (34 to 48 metres), and comes
down to fight. Badly hurt (two fifths of its hit points or fewer), it takes to the air now and then
(`hover`, battle.js `#hover`): two seconds going up, twelve up there, two coming down, and not again
for 25 seconds after it's down. It goes up between blows, and stays where it is going up and
coming down. Up there:

- no blow up close reaches it, nor does its bite reach down. Whoever has only a blade waits under
  it, as near as they'd strike from;
- it breathes fire down from seven metres up, and starts no breath it wouldn't finish before it
  comes down;
- arrows, bolts and spells reach it, and killed up there it falls.

Whoever's fighting it is told it's out of reach of blows. It's drawn from its own model (HuyKhoi2407's Dreadthorn Dragon: beasts/model.js),
fetched as the player nears one of its lairs (within 1.5 km); a greater, darker drake stands in for
it until then (beasts/looks.js). Its fire is a long jet from its jaws, spreading along the ground
(beasts/breath.js). The ghosts and wraiths are found nowhere else but with the
dead at the ruins (core/places.js `PLACE_BANDS`): the restless dead of whoever lived there long ago;
and at the old graveyard outside each people's start town, a few bones and a ghost led by a
skeleton (`PLACE_BANDS.graveyard`), out by day as by night, so the dead and what they leave
(bone dust, old skulls, ectoplasm) are met near home, before the far ruins.
Once slain, a master is gone a long while (it comes back after `slain` has passed). The world
plan's wild camps (bandits, wolves, goblins, spiders and the rest) come to life when a player's
near them, as strong as the camp's distance from that player's home (`CAMP_FOLK`).

## Kept about the players

Players together are taken as one group (core/strength.js `groupsOf`): those on one map within 60
m of one another (`STRENGTH.apart`), one after another, so three walking in a line 50 m apart are
one group. A player on their own is a group of one.

The host keeps about four creatures (`WILDS.count`; five after dark; against a stronger side, as
many more as *How the wild answers* has it: twelve for four alike, fifteen after dark) within 60 m of each group out in
the world (of any of its players), each pack as big and as tough as their side has it, put out about its leader (their party's leader, if
they're with them, or else the first of them into the world), as strong as the land is from that
leader's home, 30 to 44 m away (out of sight), 60 m or more clear of every settlement
(`WILDS.clear`, so they don't gather at a town's edge) and 10 m or more from every road, track and
trail (`WILDS.road`; they may wander onto one after), and lets them go once every player's 90 m away
(never one that's fighting). Ground cleared of them stays clear a while: each one killed out in the
world marks where it fell for two minutes (`WILDS.cleared`, the host's `cleared`, kept in a
snapshot), and while it lasts none are put out within 60 m of it and one fewer is kept about
anyone within 60 m of it, whoever they are; so a player who clears the ground round them has it to
themselves for two minutes, and then they come back, a pack at a time as each mark runs out. A
camp's folk come out when a player's 60 m from it and go once everyone's 140 m off. So there's
always something about, and never more than a player can see: the creatures are shared by everyone
playing (whoever's near sees the same ones and can fight them together), and each is kept, moved
and fought by the host like anyone else, so it plays out the same on every machine.

## A side's strength

How strong the players' side is, as the wild weighs it (core/strength.js, the host's `#side` and
`strengthOf`): each group's players, and everyone with any of them within 60 m (`STRENGTH.reach`),
their hired adventurers and the creatures they've called or raised.

- **Each one's fighting value** is how long they'd last and how fast they harm, met in the middle:
  √(toughness × harm), from what they are now.
  - *Toughness* is their health over the share of each blow that gets through: their armour, their
    knack for slipping blows (Evasion) and their shield (half of what it catches, as only blows
    from in front land on it), each taking off at most 90% (`STRENGTH.most`).
  - *Harm* is hit points a second: their best attack's blow on average, as strong as their power
    for it, over the time from one to the next (kicks mixed in with a weapon's blows, the two on
    average). A caster's spells are cast the hardest-hitting for the time they take first, each
    as often as it's ready (a cast holds the next for a second, or as long as it takes to cast),
    till there's no more time to cast in; their weapon in the time that's left.
  - So gear, skills, spells and a creature's tier all count. A new adventurer and a newly hired
    one are about alike; as the player grows, their hire is less beside them.
- **The side's strength (S)** is its members' values summed, over its strongest player's: a
  player alone is 1, two alike 2, a new player and a new hire about 2, a mighty player and that
  same hire about 1.3. Never less than 1.
- **The opposition (F)** the wild sets against it is a little less than it, S^0.8
  (`OPPOSITION.answer`): 1 alone, about 1.7 for two alike, about 3 for four. So each of a group
  finds it a little easier than alone, and every ally is still worth having.

The debug overlay shows it for the player's side ("Side S 2.00  F 1.74  (2 players, 0 allies)").

### How the wild answers

The opposition's spent as most games played together spend theirs (`SCALING`, worked out when
the foes are put out, never after):

- **An ordinary one of a pack:** more of them (how many × F), each a little tougher (hit
  points × F^0.25).
- **A pack's leader** (an elite, a cache's chief): tougher still (hit points × F^0.8), the escort
  with it more and each a little tougher, as ordinary ones are.
- **Their blows are as hard as ever,** so defences that hold alone hold together.
- A number of them that comes out in between is made whole with the world's own dice (4.5 is as
  often 4 as 5), so every machine in a game puts out the same; alone, none are thrown.

| Their side | S | How many | Each one's hit points | A leader's |
| --- | --- | --- | --- | --- |
| Alone | 1 | ×1 | ×1 | ×1 |
| Two alike | 2 | ×1.7 | ×1.15 | ×1.6 |
| Four alike | 4 | ×3 | ×1.3 | ×2.4 |
| A new adventurer and a new hire | about 2 | ×1.7 | ×1.15 | ×1.6 |

So a tier-4 wolf pack is three wolves of 39 hit points against one player, five of 45 against two,
nine of 52 against four. Each of a side of N alike so takes about N^-0.2 of what one alone would
(0.87 for two, 0.76 for four): a little easier together, as the balance runner bears out (*Tuning
it*, below: it was F^0.75 first, and each of four took under half).

### Where it applies

Wherever foes are put out near the players, against the side there when they are:

- **Roaming packs, elites and caches:** against the group's side (*Kept about the players*,
  *Elites* and *Adventurers' caches*, below).
- **Wild camps:** against the players within the camp's round; its folk and its patrols each
  ordinary ones.
- **Lairs:** against the players near it or inside it; its master as a leader, its guards
  ordinary ones.
- **The outlaws' and the dead's places, and works overrun** (docs/WAR.md): against the players
  near or inside; the leader as a leader, the band ordinary ones.
- **Dungeons** (docs/DUNGEONS.md): each level as it wakes, against the players on it, on the
  level above it, or (the first level) by its way in. The boss and mini-bosses are leaders; each
  pack ordinary ones, the more of it beside those its plan has. And a dungeon's as strong as its
  land, or as the mightiest of those finding it is, whichever's the more, as a cache is
  (`caches.js` `cacheTier`): settled as it's made, and kept with it.

### More mid-fight

What a pack is is settled when it's put out, and those there never grow tougher, nor weaker. But
should the side it's fighting grow by one or more since (`REINFORCE.grown`: a player come, more
called to their side), more of the pack come (`host.js` `#reinforce`): as many more as the
opposition grown has them, each as tough as the side now has them, from 10 m past the fight
(`REINFORCE.from`), beyond those it's fighting; held to the body budget (*A ceiling*). Each
roaming pack, elite's escort and cache's band is kept for it (`host.packs`, in snapshots), till
it's gone.

### A ceiling

Every machine in a game draws everyone near a fight, so there's a body budget there
(`BODIES`): sixty at most of the side's and the wild's within 80 m of where foes are put out.

- **Foes give way first.** Past it, what more of a pack there'd have been goes into the hit
  points of those there are instead (six there for nine wanted, each half as tough again), never
  fewer of them than against one alone. The opposition still matches the side, with fewer bodies.
- **Allies keep their rules.** Hirelings follow Command, and the creatures called and raised the
  spells' levels (docs/MAGIC.md); but where the budget's full about a player who calls or raises
  another, the oldest of theirs goes for it.

So many near a fight are drawn for less (`app/game.js` `MANY`):

- **A creature small on the screen** (under 40 pixels tall) casts no shadow, and is posed only as
  often as a character as small would be (`world/avatar.js` `posingEvery`: every second to fourth
  frame, every eighth out of view); where it is and which way it faces, every frame.
- **A creature drawn smaller** is drawn with fewer triangles, as a character is (`characters/lod.js`
  `LODS`: a quarter of them under 360 pixels tall, a tenth under 140), made once for each kind
  built alike, off the page's thread, over its very vertices (`beasts/beast.js` `lowerDetail`).
- **The players' allies past the nearest four** (hired adventurers, creatures called or raised in
  people's shape) are drawn at the middle level of detail (`characters/lod.js`), with their
  contact shadow and not the sun's, and so posed seldom out of view.
- **Too slow even so** (Adaptive), those least seen of the hired adventurers, the people-shaped
  creatures and the beasts are drawn in their kind's crowd, as a battle's soldiers are, a few at a
  time, and drawn in full again a few at a time once there's time to spare (docs/GAME.md *Standing
  in*; *In a crowd*, below).

Why sixty: with all but the nearest few standing in their crowds, sixty about a fight cost less to
draw than forty all in full did before there were crowds (docs/GAME.md *Standing in*: the update
under half, a third fewer draws), and even with Adaptive off (all in full), sixty take 326 draws to
forty's 259. Each body more takes about 4 MB (its own skin, garments and pose, past the first of
its kind), so eighty waits on the game taking less memory first. What the world's rules cost about
one fight hardly grows with it: 0.34 ms a frame for forty, 0.41 for sixty, 0.48 for eighty, all
fighting (the host's battle step, in Node).

### What the more leave

Those of a pack more than a player alone would have met (`extra`: past as many as there'd be
alone, or come mid-fight) leave their gold and their parts, and nothing else: no gear, no tome, no
draught nor bomb (*What they leave*, below). Their dice are thrown all the same, and what's found
on them left out, so the world's dice go on as they would. Otherwise four together would each
come away with about twice the gear for three quarters of the fight. An elite, a cache's chief and
its hoard, a dungeon's boss and mini-bosses, and every pack's first as many as alone keep one roll
for each player near.

### Tuning it

`npm run balance` (`scripts/balance.js`) runs the world's rules alone, nothing drawn: sides of
each make-up out in the wilds at tiers 2, 5 and 8 (`SIDES`: one player, two, four, one with four
hirelings, a summoner with five creatures), the players as strong for the tier as its creatures,
each at the nearest of the wild's about, fight after fight on fresh ground. For each it says the
side's S and F, how many foes a fight brought, how long it lasted, the hit points each player lost
in it and how often one fell, and the share of what one alone loses that each of them does. The
aim is about three quarters for four together; the numbers here (`OPPOSITION`, `SCALING`,
`BODIES`) are where it started, for it to bear out or change.

```
npm run balance                        # every side, at tiers 2, 5 and 8 (a few minutes)
npm run balance -- --tiers 5 --sides solo,four --fights 6
npm run balance -- --json              # the numbers as JSON
```

That the players together are one group, one roll for an elite and one cache between them, the
wild answering their side's strength wherever foes are put out, more coming mid-fight, a dungeon
as strong as its finders, and the more of a pack leaving only their gold and parts, changed the
rules every game plays by (`NET_VERSION` 107), and what a snapshot holds (`SNAPSHOT_VERSION` 26:
the packs kept, each dungeon's tier).

## Elites

Now and then, out past the land nearest home, a pack's led by an elite of its kind: an "Elite
Wolf" at the head of the wolves, an "Elite Brown bear" alone (`creatures.js` `ELITES`, the host's
`#putOutElite`). A kind with an elite of its own has that instead (`elite`, `eliteOf`): the
goblins' is the Goblin King, called by its own name (*Goblins*, above). (Not the dungeons' packs'
stronger members, `docs/DUNGEONS.md`, which are only a tier up.)

- **Where, and how often.** Each time a pack's put out about a group (*Kept about the players*,
  above) in land of the second tier or further (`ELITES.least`, from its leader's home), about one
  time in twelve (`ELITES.chance`) it's an elite's instead: one roll for the group, not one for
  each of them.
  It's put out 80 to 100 m off (further than the rest, to be seen coming), with the same clearances
  from the settlements, roads and cleared ground, on dry land all round its round. None of the
  perilous kinds (a frost troll, say) is ever one.
- **How many.** Never two within 400 m of each other (`ELITES.apart`), so never more than one
  about a player; and none of a group one's been put out for has another for ten minutes
  (`ELITES.rest`, the host's `eliteRest`, kept in a snapshot), nor is one put out for a group while
  any of them is still resting from their last. So out in the wilds players meet one now and then,
  about one each ten or so minutes' going at the most, however many of them there are together.
- **How strong.** Three times the hit points and a quarter harder blows than one of its kind
  (`ELITES.hp`, `ELITES.power`), and a tier up on the land's on top of that (`ELITES.up`): an
  Elite Wolf where wolves are of the second tier has the hit points of about four of them, and
  bites like one of the third and a quarter more.
- **Its kind with it.** It leads as many of its kind as a pack of theirs there would be, ordinary
  ones at the land's tier, keeping with it; one of a kind that goes alone (a bear, an adder) is
  alone. Against a stronger side (*How the wild answers*), it's tougher still (its hit points ×
  F^0.8), and its kind with it more and each a little tougher.
- **Its round.** It walks a round of six stops 10 m about where it was put out (`ELITES.loop`,
  `ELITES.stops`), resting a moment at each, its kind keeping with it.
- **Avoiding it.** It sees 18 squares (`ELITES.sight`; the rest see 12), so it notices from
  further off; but it goes no further after anyone than 12 m beyond its round (`ELITES.leash`: 22 m
  from its middle), and only sets on someone within that. So a player who keeps a wide berth of it
  (25 m or more from its middle) is left be, and one who runs from it is let go once they're past
  that. It's let go once every player's 160 m away (`ELITES.far`), not 90 m as the rest are.
- **Seen from afar.** It's drawn a quarter bigger, its coat gilded and what glows on it brighter
  (`beasts/champions.js` `CHAMPION_LOOKS.elite`), radiant: a glow of gold on the ground round it
  and sparks of gold rising about it (`world/ailments3d.js` "elite"). Its name and level are in
  gold over it, on a broader plate edged in gold (`hud.js`, `.floater.elite`), and it's a star of
  gold on the minimap from 80 m off (`ELITES.marker`), at the minimap's edge the way it is while
  it's further than the minimap shows, before it's noticed anyone.
- **What it leaves** (`spoils.js` `ELITE_SPOILS`, `caches.js` `elitePrize`), for each player
  within 30 m when it falls, beyond what one of its kind would:
  - its kind's gold three times over, and a purse for a beast that carries none (never nothing);
  - its kind's things much likelier, as if found eight tiers above its least (a wolf's pelt about
    two times in three);
  - on one with hands, a tome four times as likely, at any tier;
  - and always a prize: a piece of gear any cache might hold, or (three times in ten) a charm,
    made as a cache's two tiers further out would be. Never common; mostly fine to rare, now and
    then very rare or legendary, and better the further out.

## Adventurers' caches

Here and there out in the wilds lies a chest some adventurer stowed and never came back for, and a
band of the land's brigands has found it and keeps it (`core/caches.js`, the host's `#caches`).
- **Where.** About every half a kilometre a player crosses the wilds (350 to 650 m, rolled each
  time: `CACHES.every`), one turns up 70 to 100 m ahead of them, within about 35° of the way
  they're going. Only ground crossed on foot out of the settlements counts: not a step in a town,
  nor a leap of more than 20 m in half a second (carried by magic or a portal). It's put on open,
  dry ground (85% of the squares out to its guards' round free to walk on, and every stop on the
  round: `openAround`), at least 25 m from every road, track and trail with its guards' round and
  all (32 m from the cache), 80 m clear of every settlement, 90 m from the places worth finding and
  the wild camps, and 150 m from any other cache (`cacheClear`). Nowhere like that ahead, it's
  tried for again on the next look, and it may then turn up any way about them. Players crossing
  the wilds together (one group) find one between them, not one each: once one's put out ahead of
  any of them, how far each of them has crossed is counted afresh from there.
- **Who keeps it** (`CACHE_BANDS`), brigands of that land, all with hands:
  - outlaws under a bandit chief in the farmland, meadows, woods, elfwood, heath and on the beaches;
  - goblin raiders under an ogre in the badlands, the savannah and on the heath;
  - goblins under a troll in the mountains, the snows and the tundra;
  - the restless dead (skeletons, a stronger one leading) in the marshes and on the tundra;
  - cultists in the marshes, dark woods, jungle and the burning lands.

  Where more than one band's found, it's any of them.
- **How strong.** As strong as its land (`tierAt`), or as the mightiest player within 120 m of it
  (their might, 0 to 8, a tier above it: `cacheTier`), whichever's the more. So it's never weaker
  than what lives there, and a strong player meets a band to match them anywhere. Three keep it
  near home, up to four from the third tier and up to five from the fifth (`cacheCount`, their
  leader too), their leader two tiers above the rest (`CACHES.lead`). Hard to beat alone. Against
  the side of those it's put out for (*How the wild answers*), more of the band and each tougher,
  their leader tougher still.
- **How they keep it.** Their leader stands by the cache; the rest walk a round seven metres about
  it, six stops spread round it (`roundOf`), each starting at its own and standing a moment (1.5 to
  3.5 s) at each before walking on to the next (`wild.round`, battle.js `#wild`). Each goes for
  anyone who comes within 8 m of them (`CACHES.guard`), and they're one pack, so strike one and the
  rest who see it come too.
- **Its chest** is the places' chest (drawn by `world/drops3d.js`), locked while any of them stands
  ("It's locked fast, and those keeping it are still about."). Once the last falls it opens, a share
  for each player within 39 m of it, and for each who struck or felled any of its band (or whose
  follower or creature did: `fought`, host.js `#foughtFor`), however far off they drew them to do
  it, told so ("The adventurer's cache is open: your share waits at its mark."; the user: "I
  kited off the bandit chief and killed him fairly far from the adventurer's cache and killed his
  bandit companions and no chest showed up at the mark on the ground"); theirs alone to take, at
  the cache, for five minutes (`rollCache`): 20 to 45 gold, 35% more for
  each tier above the first; two or three pieces of gear (any but a people's uniform), as well made
  as the band was strong (`CACHE_MAKES`: mostly common and fine near home; masterwork, rare, very
  rare and legendary for the mightiest), a wand's or grimoire's boost rolled as a shop's is; and a healing
  draught, more often than not.
- **On the maps.** Once a player's within 60 m of it, it's said ("An adventurer's cache, and
  outlaws keeping it.") and marked on their minimap and world map with a chest's icon, rimmed grey
  once it's opened.
- **Gone** once every player's 200 m from it (and none of its guards is fighting): its guards let
  go, and the cache with them. Another comes later. Its guards don't count among those kept about
  the players, and the ground where they fall isn't marked cleared.

The caches and how far each player's crossed the wilds since the last are kept in a snapshot
(`SNAPSHOT_VERSION` 7), so a player joining finds them where they are.

## By night

The world's clock has a day and a night (docs/GAME.md, *Day and night*), and the wild has its own
hours (`night` in `CREATURES`; the terrain plan's M7e-3):
- **The night's own** (`night: "only"`): the bat swarms, the skeletons out in the open, the
  will-o'-wisps, the black shuck, the shadow stalkers, the hodmedods, the mares and the werewolves
  are out only
  after dark (from half through
  the dusk to half through the dawn, when the guards' torches are lit). At daybreak those out of
  everyone's sight (30 m or more from every player) and not fighting go to ground (let go); none are
  put out by day. The skeletons of the undead camps and the ruined castles are always there.
- **The night's hunters** (`night: "more"`): wolves, dire wolves, pumas, hyenas, sand scorpions,
  badgers, hounds of Annwn, jackals, Nandi bears, jaguars, bloodflies, giant centipedes, kelpies,
  ahuizotls, draugar and cultists are met twice as often after dark, and the night's own three times
  (`NIGHT_WEIGHT`).
- **More of them:** after dark the host keeps one more (`WILDS.night`) about each player out in
  the world, five in all.
- **Seeing in the dark** (`darkSight`): out of the light everyone sees less far at night (a third
  to a half as far: docs/GAME.md, *Seeing at night*), but the night's own, the night's hunters but
  the scorpions and cultists, the cave spiders, the blind cave olms, the basilisks and the wight
  lord see as far as by day. So out in the dark
  they see a hero long before the hero sees them; a torch or a lit road evens it.

## How they behave

- **Temper.** An aggressive creature comes for anyone it sees; a territorial one for anyone who
  comes within its `guard` squares; a defensive one (the porcupine, the green slime) fights only
  whoever strikes it or its pack.
- **Packs.** A pack keeps together, following its leader, and turns as one on whoever strikes any
  of them (who sees it).
- **Wandering.** Standing a while, then wandering off a little (within `roam` metres of where it
  was put out), and never chasing anyone more than `leash` metres from there.
- **The people's soldiers** go after any creature near them that's a menace (aggressive or
  territorial) or that's fighting, and leave the harmless be. Followers fight beside their player.
- **Knocked down.** A blow that knocks its target off its feet (`knockdown` on an attack, in ms:
  the rock tusker's charge, 1.5 s; a Cape buffalo's, 1.2 s) stuns them for that long. They fall (quicker than a death), lie
  a moment, sit up with their feet drawn under them and rise; until they're up they can't move,
  fight, cast, use anything or talk (the host refuses: "You're down: get up first").

## What lingers

Some creatures' blows leave something behind (`core/afflictions.js`; each attack's `afflict` in
`core/weapons.js` `NATURAL`: which, and how likely). Each hurts a little every so often, or
hinders, until it wears off; the one who did it is who brought down anyone it's the last of.
Struck again with it while it's on, it lasts from then (as strong as the stronger). The hurt each
time is as strong as the creature (its tier's power), so a far-out scorpion's venom is worse than
an adder's near home.

| Affliction | Lasts | Hurts | Besides | From | Cure (at the guild) |
| --- | --- | --- | --- | --- | --- |
| Poisoned | 9 s | 1 every 1.5 s | | adder, bog frog (spit), wyvern and scorpion stings, cave spider's bite, Gila monster's bite, death worm's bite and acid, a spitting cobra's, a basilisk's and a giant centipede's bite, cobra and knucker venom, a chimera's serpent tail | Cure poison draught, 12 gold |
| Diseased | 45 s | 1 every 5 s | stamina comes back at 40% | rats, bats, hyenas, jackals, cave olms, bloodflies, skeletons, draugar, boggarts | Cure disease draught, 18 gold |
| Withered | 20 s | 1 every 2.5 s | healing takes half as well | the wight lord's curse and a draugr's, the black shuck's bite, a wraith's claws and draining, a mare's nightmares | Invigorating draught, 22 gold |
| Burning | 4 s | 1 every 0.8 s | | the drake's fire and a chimera's, a magma slime's lava and slam, a salamander's bite and fire | Burn salve, 8 gold |
| Bleeding | 10 s | 1 every 2 s | | wolves, boars, bears, pumas, crocodiles, knuckers, harts' antlers, ahuizotls, chimeras' claws, a hodmedod's sickle, the drake's bite... | Bandage, 5 gold |
| Slowed | 5 s | | moving at half pace | a spider's web, a treant's roots, a frost troll's club, a ghost's touch, a great boa's or a knucker's coils, pixies' dazzle, a basilisk's glare, a kelpie's bite, an ahuizotl's tail-hand, a mare's weight | Quickening draught, 10 gold |

Caught at a bordello (a courtesan's company, one time in four: docs/GAME.md), the pox is
**Diseased** too, for an hour: stamina comes back at 40%, but it doesn't hurt; the Cure disease
draught ends it as it does the wild's sickness.

A cure ends it at once (and only it: used with nothing to cure, it isn't used). Each can go on an
action wheel, as a draught can.

**How it shows.**
- **On the player's plate**, an icon for each (a venom drop with a skull in it, a pocked ball with
  flies, a cracked grey heart, a flame, a drop of blood, a web or roots or a snowflake for what's
  slowing them), on a blood-red disc ringed in its colour, darkening round as it wears off, the
  soonest over first (before the gold-rimmed sapphire tiles of what does them good, in one row:
  docs/MAGIC.md). Over the bars of anyone
  else with something on them, the same, smaller. The player's told when something takes hold
  ("You're poisoned!"), the first time with the cure and where it's sold, and when it's over.
- **On whoever has it:** venom's bubbles rising and green drips falling, and their skin tinged
  green; a sickness's flies circling and a yellow miasma; a curse's violet motes circling them,
  dark shadow rising, a shadow pooled under them; flames licking up them, smoke rising, their skin
  aglow; blood dripping; a web wound round their legs and anchored to the ground; roots burst up
  round their feet and coiled up their legs; ice crusting their feet, frost glittering. Each hurt,
  a number the colour of it over them, and a puff of it.

**The creatures' own attacks.** Fire's breathed in a roaring stream from the drake's jaws to
whoever it's at, smoke rolling off it; venom and lava are spat in an arc and splash where they
land (spattering sparks and smoke, for lava); a web's thrown and bursts; roots burrow along the
ground and break it up at their feet; a curse bursts in shadow; a ghost's wail flies pale and
swirling, a wraith's draining green and dark, bursting in shadow; a mandrake's shriek flies as a
ghost's wail does, a salamander's fire as lava, a death worm's acid as venom, a basilisk's glare
as a curse. What doesn't bleed red spills its own when struck: a slime's gel, a spider's,
scorpion's or centipede's ichor, a treant's or a
mandrake's sap, a skeleton's, a draugr's and a wight lord's bone chips, a rock tusker's stone
chips, a hodmedod's straw, lava from a magma slime, shadow from a black shuck, a shadow stalker, a
wraith or a mare, a ghost's pale motes.

## What they leave

A creature brought down may leave something: its parts (a wolf's pelt and fangs, a boar's tusks
and meat, a wyvern's scales and sting, a drake's scales, fangs and heart), and the people-shaped
ones a little gold and gear (`core/spoils.js`). Every player within 30 m when it falls finds their
own bundle on it, rolled for them alone, where it fell, seen only by them, there for five minutes
to tap and take (what doesn't fit in the pack stays there). Each thing in it (and its gold) lies
on its own, round where it fell: its icon, turned to the camera, floats just off the ground and
bobs 3 cm up and down (its foot 2.5 to 8.5 cm off it, each in its own time), over a ring glowing
the colour of how rare it is, the pack's own colours (drops3d.js `FLOAT`, `RING`, `RARITY_GLOW`,
`shownOf`); a tap on any of them takes the lot, and what's left is drawn again, fewer. The first
time a fight leaves a character something they're told so across the screen in a line, for 5 s
("The wolf dropped something. Tap it to take it all, or turn on Auto-snag in Game options, Gameplay."); never
again for that character, not even after the game's started again (game.js `#once`,
`SPOILS_HINT`; kept with the character: save.js `loadTold`, given to the game by session.js
`createGame` and `createJoinedGame`; the user: "The big message on how the drops work is too big
and it pops up every time you restart the game. Make it pop up only once per character and try to
make it more concise and readable"). What's picked up rises over the player ("+3 gold, a rare ring"), not said across the
screen, and is kept for the journal's messages all the same (as a creature's fall rises off its
body, unless it's one of note: an elite, a boss, a perilous place's own or master, a wyvern;
creatures.js `notable`, GAME.md); only what there was no room for is
said (the user: "Only show a message box the first time an item drops for a new player ... Make
each collectible item float slightly above the ground with a glowing circle corresponding to the
items rarity under it"). With
**Auto-snag** on (Game options; off to start with), a player's spoils of a fight (a creature's
sack, a convoy's or a supply wagon's gold: not a chest's share, nor anything a player dropped) are
picked up as soon as they're within reach of them (`PICK_REACH`), each sack once (what there's no
room for is left to tap); and under its switch, **What auto-snag takes** (its own page) chooses
how rare and what kind, both ticked for it to take a thing: Legendary and Weapons alone, say, and
it takes legendary weapons and leaves the rest in the sack, gold too unless that's ticked
(host.js `snaggable`, `snagChoice`, `SNAG_GRADES`, `SNAG_KINDS`; app/save.js `autoSnag`,
`snagGrades`, `snagKinds`: null, everything; the user, "Create a setting called auto-snag ... if
the user only wants to pick up legendary weapons with auto-snag, that configuration is
possible"). Nothing's
certain: each thing has its chance, a little better for each tier the creature's above its least,
and gold's as much more as the creature's stronger. One of a pack more than a player alone would
meet leaves only its gold and its parts (*What the more leave*, above). The only way to share
what's found is to trade it (below).

The parts are worth what the adventurers' guild pays for them (only the guild buys them; other
shops have no use for them): a couple of gold for a rat's tail near home, a few for a wolf's pelt,
fifteen or so for a bear's, sixty for a drake's scale and two hundred and fifty for its heart. So
a creature near home is worth a gold piece or two a kill on average (often nothing), a bear a dozen,
and a drake a fortune. Some are good to eat or drink: boar, bear and frog meat heal, troll's blood
heals more, a wisp's essence fills your stamina. Each has its picture in the pack, in its colour.

The guilds' boards want them too ("Wanted at the guild": `standing.js` `offerContract`): a few of
one creature's parts (a creature found near home, anywhere), brought to the counter, paid 1.6
times what they'd sell for, and a few gold more (and handed over out of the pack). "Beasts on the
roads" counts the creatures brought down.

## Trading face to face

What each player finds is theirs alone; the one way anything passes between players is trading,
face to face (`core/host.js`: `trade`, `offer`, `agree`, `cancel`; `TRADE`):

- **Asking.** Tapping another player who isn't an enemy walks up to them (within 4 m) and asks
  them to trade. They're told ("Bryn would trade with you", with a Trade button, for 30 seconds);
  tapping it, or tapping the one who asked, says yes. Asking someone else stops asking the first;
  anyone trading already can't be asked ("They're trading with someone else").
- **Offering.** Once they've said yes, both players' packs open on the trade: what the other
  offers at the top ("Bryn agrees to this", once they have), then what they offer themselves, with
  gold to offer and buttons to agree or call it off, then what they carry. Tapping (or holding)
  something carried offers it, as many as they like of all they have of it (its stacks lit gold);
  anything offered can be taken back. Each change is the whole offer again, and whoever changes
  theirs undoes both players' agreeing: what's agreed to is what's there.
- **Agreeing.** Once both have agreed, everything offered changes hands at once: all of it, or
  (if either hasn't all they offered any more, or hasn't room in their pack for what they're
  given) none of it, and neither's agreed any more, with why said.
- **Off.** Closing the pack calls it off; so does either walking more than 7 m from the other,
  falling, or leaving the world.

The host does it all, as it does everything, so every copy of a world played together has it
alike (and a trade's kept with the world: `snapshot`).

## How they're built

Every creature but the Dreadthorn is made in code (no models downloaded), from its look
(`beasts/looks.js`), on one of a few bodies (`beasts/beast.js BUILDERS`). The Dreadthorn is drawn
from a model (*Drawn from a model*). Each of a kind is a little different: a little bigger or
smaller, its colour a little different, its markings its own.

- **Sculpted in one piece** (`sculpt.js`). A body's shapes (ellipsoids, and limbs that taper from
  one width to another) are blended into one surface where they meet, as clay would be, and
  turned into a mesh (surface nets, fine enough for about 4200 points), coloured from its shapes
  with fur, scales, bark or stone in its grain and its belly paler, and bound to its bones (each
  point to the nearest few, weighted by distance) so it bends where they do. The rest of its
  pieces (claws, teeth, horns, quills) are folded into a few meshes on the same bones (`fold`),
  so a creature's two to eight things to draw, 12,000 to 21,000 triangles. Both are made once
  for each of a kind's three looks and shared by every one of it after, until none of that look
  has been drawn for three minutes (*Let go of when none is drawn*).
- **Four-legged** (`quadruped.js`): a deep chest, a waist and haunch (sloping down behind for a
  hyena); a neck and head with a muzzle and jaw, or a cat's short face with whisker pads and
  whiskers, or a crocodile's long flat jaws with rows of teeth and its eyes and nostrils raised on
  top; ears of their kind; brows, horns, a cheek frill of spikes; a hart's antlers (a beam up, out
  and back from the crown, a tine forward at each bend and a brow tine, forking at the top); a
  lion's mane all round the neck, or a horse's ridge of long hair along its top and a forelock.
  Legs of three bones: a dog's on
  its toes; a bear's pillars in front and flat-footed behind, with long claws; a crocodile's
  sprawling out to the sides, swung round forward and back as it walks while its body and tail
  sway; a drake's with great hooked talons. Tails from a dog's brush (slim at the root, full,
  drawn to a point) to a cat's long hanging curve, a crocodile's deep flattened one with its double
  ridge of scutes, and a drake's spade; an ahuizotl's ends in a hand, its fingers curled; a
  chimera's is a serpent, its head at the tip. Wings as a bat's: an upper arm and forearm, three long
  fingers fanning from the wrist, skin stretched between them and back to the flank (a mesh of its
  own bound to the finger bones either side, so it stretches as they spread), folded along the
  flank at rest and beating when it runs or strikes. It flies too (`fly`): legs tucked up under
  it, neck stretched out ahead and head level, tail streaming behind, wings spread wide, beating
  (slower the bigger they are) or held out to glide, rising a little with each downstroke; so
  wyverns and the drake are seen in the air near where they hunt and come down out of the sky to
  fight (GAME.md, *What flies*). The model viewer's Fly and Land show it.
- **Serpents** (`serpent.js`): a body of bones down its length, the skin bound to them, tapering
  to the tail, banded or zig-zagged and pale beneath; a head with a jaw that opens on its fangs and
  a flickering tongue. It slithers (a wave down its length), stands with its front raised in an S
  and rests coiled, tasting the air, or stretched out basking. Some are more than a snake: a
  spitting cobra's hood spread wide beside its neck, and it rears up high (`hood`, `rear`); a
  basilisk's crown of spikes (`crest`); a knucker's great head with fins swept back from it, and
  a ridge of them down its back (`head`, `fins`); a giant centipede's pair of legs to each piece of
  its length, rippling as it goes, its feelers, and its footfalls a spider's skitter (`legs`,
  `feet`). A snake narrows to a fine tail; a giant leech, a death worm and a centipede hardly at
  all, blunt at both ends (`taper`).
- **Eight-legged** (`arachnid.js`): each leg reaches for its own place on the ground, spread round
  the body like the spokes of a wheel so none crosses another or the body, and bends its two bones
  to reach it each moment (knee up); walking, the feet stay planted as the body goes over them,
  then step forward, four at a time.
- **Swarms** (`flyers.js` `swarm`): a few to a dozen and more of the one kind, each flying its own
  round the swarm's middle (as far out as its `spread`): bats with their ears; birds (rooks,
  vultures) with a beak, a fanned tail and long wings beating slower; insects (locusts,
  bloodflies) long-bodied, with two pairs of clear wings beating fast; sprites (pixies) small and
  softly glowing, with clear wings.
- **Slimes** (`blob.js`): a see-through jelly; the magma slime a lumpy crust whose cracks glow
  (white-hot in the deepest, orange, dull red at their edges: how molten each point is is worked
  out once from noise, and its glow pulses slowly across it in the shader), spitting sparks now
  and then.
- **Two-legged** (`biped.js`, `bones.js`, `cloth.js`): a skeleton has the bones a body has, near
  enough, at a real body's sizes: a skull with its brow, sockets (a light glowing deep in each),
  cheekbones, nose and teeth and a hinged jaw; seven vertebrae in the neck, twelve behind the ribs
  and five below, curved as a spine is; twelve pairs of ribs sloping down to the breastbone, the
  lowest floating; collarbones, shoulder blades, the pelvis; the forearm's and shin's two bones
  each, hands and feet of their many small bones. The wight lord's cape is cloth: a grid of points
  joined by threads, fastened across its shoulders, falling under its own weight, streaming back as
  it walks, kept out of its legs, its hem torn. A draugr's flesh is dried dark and shrunk onto its
  bones (`flesh`: over its ribs, belly and hips, the top and back of its skull, its arms and legs;
  its face's bone showing, lank hair hanging), and it wears rusted barrow mail to the knee, a belt
  and an old helm (`mail`). A treant's crown is boughs forking into branches and twigs, sparse
  leaves at their tips. A hodmedod is a scarecrow come alive (`kind: "scarecrow"`), sculpted in one
  piece as a treant is: a sack for a head tied off at the neck, its eyes alight and its mouth
  stitched, an old hat; a ragged, patched coat hanging in skirts below the waist, breeches and
  boots; straw spilling out at the cuffs, the neck and the ankles; a sickle in its hand.
- **The restless dead that never lay down** (`spectre.js`): no legs, a hooded shroud sculpted in
  one piece (sculpt.js) from the hood to the tatters it ends in, each tatter two joints that stir
  as it hangs and stream back as it glides; sleeves sculpted held out from the body, so each goes
  with its arm, the bones of the arm and hand within (bones.js). A **ghost** is half see-through
  and faintly aglow (a soft light round it, seen in the dark), its skull in its hood and its arm
  bones dim through its sleeves, thinning below the waist to a wisp that floats clear of the
  ground; it casts no shadow. A **wraith** is a black robe flaring to a ragged hem, nothing under
  its deep cowl but two cold green lights, bony claws out of its cuffs. Each floats, bobbing, and
  leans into its glide; a ghost reaches to touch, claws, or throws back its head and wails, arms
  spread, brightening; resting, it drifts, mourns (head bowed, hands to its face) or fades almost
  away; struck, it flickers; dying, it sinks and fades to nothing. A wraith rakes with both claws,
  claws, or holds out its hand to drain; resting, it hovers, looms (rising tall, arms spread) or
  turns slowly; dying, it collapses into its empty robe, its lights going out. A **mare** is a
  wraith smaller and hunched (`hunch`), bent forward with its head raised to look ahead, its arms
  hanging long before it. A ghost is four
  things to draw and three soft lights, about 17,000 triangles; a wraith three and two, about
  14,000 (a skeleton's about 20,000).
- **People-shaped** (bandits, cultists, goblins, boggarts, trolls, ogres, frost trolls) are built
  on the character engine as everyone in the towns is (`characters/`), bigger or smaller, their
  hands placed for their size.

Each moves itself (`pose`): walking and running, breathing and looking about, three or four ways
of attacking it varies between, three to six ways of passing the time when nothing's near
(sitting, lying down, sniffing, grooming, howling, coiling, crouching, rooting), flinching when
struck, and dying its own way.

### Built a step at a time

Sculpting a body is the most of building a creature: about 70 ms in the browser the first time
each of a kind's three looks is wanted, up to 310 (a skeleton has no body to sculpt, but 300
bones to fold). Done in one piece in the middle of play, that's a frame or several lost. So where a creature comes while
playing, its body is made a step at a time within the frame's budget, as everyone's is
(CHARACTERS.md, *Built a step at a time*):

- **`sculpting(make)`** (`sculpt.js`) makes something whose making builds bodies (`make`: `new
  BeastAvatar(...)`) a step at a time. A body not made yet isn't made there and then: its build
  gives it back (`Unmade`), and `make` is done again once it's been made. That's the way React's
  Suspense works: the builders (5,000 lines of them) stay as they are, rather than each becoming
  steps of its own. It takes a few milliseconds to build a creature again, and a body made once
  for its look is shared by every one of it after, so only a look's first takes steps.
- **The steps:** so many points of the body's field sampled, cells of its grid netted into a
  surface, or points of its skin bound to its bones (6,000); then its pieces folded, 32 at a time.
  Half a millisecond in the browser, as a rule; the longest, a few builders' first run (their code
  compiled), up to 18.
- **Wanted twice at once** (two wolves of a look coming together), the second takes up the
  sculpting where the first had got to. One made all at once meanwhile (the model viewer) ends
  the steps.
- **The same:** a body made a step at a time is byte for byte what it was made all at once.
- **Where:** creatures coming into view (`dressingCreature`, as the game draws the wild's), and a
  wyvern or the drake before it comes into the sky (GAME.md, *What flies*). The model viewer
  builds at once.
- **Folding** a creature's pieces gathers their points into arrays made once, counted first,
  rather than grown a number at a time: a skeleton's or the wight lord's first build, mostly
  folding, went from 54 to 102 ms to 17 to 47 (in Node).

### Let go of when none is drawn

A look's sculpted body and folded pieces (and its body's fewer triangles when it's drawn smaller,
`lowerDetail`: *A ceiling*) were kept for the whole session once made, whether any of it was
still about or not: every look of every kind met, never given back. Every beast's three looks
(the convoys' ox among them), built in Node, hold 76.6 MB, and as much again on the graphics card
once drawn. Now (`sculpt.js`):

- **Held while drawn.** Each creature built holds its look's body (`hold`, as `BeastAvatar` is
  made) and lets go of it when it's let go of itself (`release`, its `dispose`: gone from the
  battle, a flier landed or gone, a crowd figure recorded), once however often it's disposed.
- **Kept a while after** (`LINGER`, three minutes since the last of its look was let go of): a
  kind met lately is likely met again, and another of it built meanwhile holds it again.
- **Then let go of** (`forget`, every five seconds: the game's `FORGET_EVERY`): out of what's kept,
  and its geometries disposed, so the graphics card lets go of them too, and its body's lower
  levels with it. Not while it's being made again. One wanted after is sculpted again, a step at
  a time, as the first was (45 to 170 ms of steps), the same as it was.
- **Told** in the debug overlay and log, under *Held*: how many looks are kept, their arrays' size,
  and how many of them none is drawn on (`kept`).

So what's kept is the looks of the creatures about and those met in the last three minutes,
rather than every look met since the game began: in Node, all 81 looks with something to keep
(76.6 MB) built and let go of, then kept for three minutes, then none.

### Drawn only in view

three.js leaves undrawn what's out of the camera's view (and out of a shadow's, in the shadow's
pass) by a sphere round each mesh. A skinned mesh's sphere is worked out from the pose it was
first drawn in, which goes stale as it moves, so the creatures' bodies were marked always to be
drawn: every creature near the player was drawn, and cast its shadow, wherever the camera looked.

- **One sphere round each creature** (`beast.js`, `BOUNDS`), shared by its skinned meshes and its
  cape, as a character's are by one round it whatever its pose (`character.js`): the sphere round its body at rest, twice as big, for how it moves. None moves further than
  1.75 times as far, measured over every kind's walk, run, attacks, rests, flinch, fall and
  flight. A swarm says where its bats fly (`spread`). Attacking, the sphere reaches further by as
  far as the attack does (at least 2 m, in its own measures): a frog's tongue shot out, a slime
  engulfing.
- **In view or not** is the camera's and each shadow's own test, so a creature behind the camera
  still casts its shadow into the picture.
- **The wight lord's cape** is cloth, stepped every frame (about 0.6 ms). Out of view
  (`BeastAvatar.seen`, from `View.heightOnScreen`) it's left as it is, hanging from the lord as
  it was, and goes on from there when the lord's seen again.
- **Measured:** 17 creatures of the wild (porcupines, rats, slimes and bats) in a ring 8 to 40 m
  round the player, the camera turned eight ways: the creatures took 66 draw calls and 252,000
  triangles whichever way it looked; now 10 to 18 and 35,000 to 57,000. The wight lord's frame
  out of view went from 0.6 ms to under 0.02.
- `test/beast-culling.test.js`: every kind stays in its sphere through all it does, its cape too,
  and the cape's left as it is out of view and blown about again once seen.

### Drawn from a model (beasts/model.js)

The Dreadthorn is drawn from a model, HuyKhoi2407's Dreadthorn Dragon from Superhive (in the
repository with permission: `client/models/beasts/LICENSE.md`). It was put through
`utilities/blenderpipeline`: 5.1 MB, its textures in KTX2, three levels of detail packed in, and
20 clips, some made there (its attacks, its fall). It's in the catalog (`beast-dreadthorn`), not in
what's downloaded before the game starts.

- **Fetched as it's wanted** (`wantModel`): once the player's within 1.5 km of one of its lairs
  (`modelsNear`, looked at every two seconds: the game's `#modelling`), or one comes into the
  battle. One that couldn't be read is asked for again a minute later.
- **Its stand-in meanwhile:** until it's read, its look (`beasts/looks.js`, a greater, darker
  drake) is drawn. Once it's read, a stand-in out of view, and not attacking, falling or coming
  down out of the sky, is let go of and drawn again from the model.
- **Let go of when none is drawn from it**, as a look's body is (*Let go of when none is drawn*,
  above): each drawn from it holds it (`holdModel`, as `BeastAvatar` is made; `releaseModel`, its
  `dispose`), and three minutes after the last is let go of (`MODEL_LINGER`), it's let go of too
  (`forgetModels`, every five seconds: the game's `FORGET_EVERY`): out of what's read, its
  meshes' shapes and its pictures, its skins' too, off the graphics card. Not while the player's
  within 2 km of one of its lairs (the game's `KEEP_MODELS`: further than it's asked for from, so
  it isn't let go of and read again going to and fro at the edge), nor where one may be met at
  that hour (a werewolf's, out in its woods by night: `modelsMet`), nor while it's being read.
  Wanted again, it's read again from what the downloader kept (nothing downloaded again), its
  stand-in drawn meanwhile. One read and never drawn from (asked for near a lair the player never
  went to) is let go of in the same way, counted from when it was read: it used to be kept for
  good. Each read is the model's own (`readGltf`, not the loader's `loadGltf`, which keeps what it
  reads by its address): read from a downloaded copy, each read was kept by the loader for good
  as well, under an address made for that read, so every model let go of and read again was
  another copy held. Told in the debug overlay and log, under *Held*: how many models are read,
  and how many of them none is drawn from (`keptModels`).
- **A body like any other** (`modelBody`): `BeastAvatar` takes it as its `plan`, as it does one
  built in code. `MODELS` names which of its clips are what (standing, walking, flying, gliding,
  struck, falling; its bite, claw and tail sweep, its breath; its roar) and which bones are its
  joints. Each frame, `poseOf` turns what the game asks of its body into a weight and a time for
  each clip (`test/model.test.js`), and a mixer poses its bones from them. Its fall plays at its
  own pace (3.6 seconds) and is held at its end.
- **Its levels of detail** are the model's own: one mesh each, the one for how big it is on the
  screen shown (`showLevel`, at the same sizes as a body built in code). Its shadow is always cast by
  the least detailed one. When that one isn't shown, it's drawn writing nothing to the screen,
  since three.js casts a shadow only from what the camera drawing sees.
- **Culled by one sphere** worked out from its skin as it stands, made big enough for its wings
  spread (its points are packed small, and made full size by its skin, so the mesh's own sphere is
  far too small).
- **Up in the air** over a fight (its `hover`, above), it hangs seven metres up, rising and falling
  a little (the game's `HOVERING`), posed by its own Hovering clip, and breathes fire with its Hover
  Breath, its head down. Its wings are heard beating, and it calls as it goes up. The stand-in beats
  its wings as it flies.
- **Its fire** (`beasts/breath.js`), while its breath's mouth is open (a second in to 2.8): flames,
  embers and smoke from between its lips, along its snout and turned a little toward its lower
  jaw. They spread along the ground and rise, are drawn where they are in the world as it moves,
  and are stepped a sixtieth of a second at a time, so they look the same at any frame rate. The
  stream the drake's breath draws isn't drawn for it.
- `e2e/models.spec.js`: drawn from its model once it's read, a level at a time, its fire out; its
  stand-in left drawn, with no error, when the model can't be read; a model let go of off the
  graphics card once none's drawn from it, and read again when it's wanted, nothing downloaded
  again.

The **werewolf** is drawn from a model too: Werewolf - Mythical Creature, bought on Fab under its
Standard License (`client/models/beasts/LICENSE.md`), 3.4 MB, 16,456 triangles, two lower levels
packed in, nine clips (three made in `utilities/blenderpipeline`: a howl, a claw swipe and a run).
What's the same as the Dreadthorn's, and what's its own:

- **Fetched before it's met:** wherever one may be met at that hour (`modelsMet`: by night, in
  its woods, five tiers or more from home; looked at every two seconds with the lairs, the
  game's `#modelsHere`), and within 1.5 km of a den, whose werewolves are out by day as by night
  (the game's `#modelLairs` lists each lair's guards drawn from a model as well as its master).
  So one's read before it comes, and isn't fought as its stand-in, which is only let go of out of
  view. Failing that (saving data, say), as one comes into the battle. With it, the three skins
  one of its kind may wear besides its own, all four together; the Moonfang's file is the same,
  read once for both.
- **Its skins** (`MODELS` `skins`): its own grey, or the dusk's, the ash's or the russet's, the
  catalog's `beast-werewolf-skins` (0.2 MB each: only the textures that differ, the pipeline's
  variants). Which one each wears is from its seed, well mixed (`skinOf`), so a pack's each wear
  their own. Its materials are its own copies, the skin's textures in place of the model's.
- **Its levels of detail** are each three meshes, its body and two lengths of fur, shown and
  hidden together; its two materials, its body's and its fur's, both tinted and both flushed red
  when it's struck.
- **Walking into a run** (`clips.run`): its walk at its pace (1.45 m/s, as it's drawn), giving
  way to its run from a fifth again that, all of it at twice, its run's own pace 2.6 m/s.
- **Its ways:** its claws (`claw`, the Claw clip), its spring (`pounce`, a special: its leap, the
  model's Attack clip), resting by howling or looking about; no fire (`mouth: null`).
- **Not in a crowd:** a kind drawn from a model isn't drawn in its kind's crowd (*In a crowd*,
  below: its figure would be its stand-in's); far off, its least detailed level is drawn.
- **The Moonfang's too:** drawn from the same model, bigger (`length`), its stride as long again
  (`pace`, `runPace`), only ever in the moonfang's skin. The model's file is read once for both
  kinds (`wantModel`: by the catalog's entry), each kind's skins read onto it as that kind's
  wanted, once each, so a den's werewolves and its Moonfang share one copy.
- `e2e/models.spec.js`: its model and three skins read, each skin worn by one of its seeds, its
  levels three meshes each, shown together, its fur flushed with its body; the Moonfang drawn
  from the same model as read, bigger, in its own skin.
- `e2e/pellagos.spec.js`, in the game: one met by night drawn from its model in one of its skins,
  clawing and springing at the player (both its model's clips), flushed red when struck, falling
  as its model falls, its pelt and claws and its purse's gold left; its model read out in its
  woods by night before one comes; and, a kilometre from a den by day, the Moonfang's and its
  werewolves' read, one file, before they're met. `test/model.test.js`: where its model's asked
  for (`modelsMet`), by night and day, far out and near home.

**The ants' nests' own** (docs/DUNGEONS.md), each drawn from a model bought on Fab, in the
catalog as the others are (`beast-ant`, `beast-centipede`, `beast-ant-monster`), sized and paced
by measuring each model in a browser: how long and tall it stands idle, and how fast its feet go
back along the ground while planted.

- **The giant ant** (`ant`): drawn 1.5 m long, about as it's made, half a metre high; rearing to
  bite (its Attack clip); resting by looking about, drinking or rearing up. Its walk is 0.62 m/s
  as it's drawn, its run 1.55.
- **The great centipede** (`greatCentipede`): the centipede's model, made 6.7 m long, drawn 4. It's
  made standing 0.42 m above where it is, so it's sunk that far to the ground (`sink`, metres as
  it's made). Its fangs (Attack), or rearing to strike down (`rear`, a special: Attack 2); resting
  by looking about or eating; flinching and falling as its model does.
- **The Ant Monster** (`antMonster`): made 6.8 m long, drawn 4.2 and 1.5 m tall (1.22 times that
  as a boss). Its mandibles (Attack, Attack 5), rearing to slam down (`slam`: Attack 2), its acid
  spat (`spit`: Attack 3, a pool of venom where it lands) and its flock called (`call`: Call
  Flock, docs/DUNGEONS.md); resting by looking about, swaying or rearing in threat. Its walk carries
  it as fast as it ever goes, 2.34 m/s as it's drawn: no run.
- **The ant borrows the Ant Monster's fall and flinch** (`borrows`, `borrowClips`): its own model
  has neither. Once both models are read (as they are at a nest's door), its Hit React and Death
  are the Ant Monster's, played on its own skeleton. Each of its bones is lent one of the Ant
  Monster's: its body the pelvis, its belly the segments of the tail, each leg's three bones the
  first three of the Ant Monster's four, its head, feelers and mandibles theirs. Each turns in the
  world as its lender turns from how it stands idle, sampled 30 times a second (`BORROW_RATE`).
  The whole ant is carried as the pelvis is, less far across as it's shorter, and less far up and
  down as its body stands lower. It rears, then sinks to the ground with its legs splayed. The
  borrowed clips are made in the browser from the two models as read, so nothing of the bought
  models is kept anywhere else. Drawn before it's lent them, struck, it doesn't flinch, and dead,
  it rolls onto its back (`fallOf`).
- `e2e/models.spec.js`: each drawn from its model, as long as it's drawn, the great centipede on
  the ground; the ant rolled over dead till the Ant Monster's read, then falling as it does.
  `test/model.test.js`: every clip and bone each names in its model, those the ant borrows (and the
  bones they're played on) in the Ant Monster's; the ant's poses before and after it's lent them.

### A place's creatures, ready before they're met (beasts/model.js, app/readying.js)

Creatures drawn from models of 3 to 5 MB each live mostly in places with a way in: a dungeon,
first. Their models are got ready before the player meets them, kept while the player's in there,
and let go of soon after they've left (the user: "an interstitial loading page when entering the
place where the models exist so that they have an opportunity to fully download to the local
browser cache before the creature they are associated with is encountered"; "when the area where
they exist is left, they are unloaded out of memory but of course kept in cache").

- **Which.** `modelsInside(building)`: the kinds drawn from a model a place holds. For a dungeon
  that's made, its foes (insides.js `dungeonRooms`); one not made yet, everything its theme can
  put in it (its packs, mini-bosses, bosses and their guards). Other places hold none yet.
- **Fetched on the way.** Within 150 m of a dungeon's way in (the game's `APPROACH`, looked at
  every two seconds with the lairs), its kinds' models are downloaded and kept, not read
  (`fetchModel`, the downloader's `keep`: one kept already isn't even read from where it's kept),
  so nothing's held in memory for a place the player only passes. One that couldn't be had is
  asked for again a minute later.
- **Waited for at the door.** Tapping the door of a place whose models aren't all read
  (`#readyAtDoor`), the player waits there while they're got ready (`readyModels`): each file
  fetched, hurried (the downloader's `hurry`: before anything else, at quiet times too, and
  playing alone as fast as the link goes), then read. Alone, the world stops meanwhile, as it does
  under the menu. Playing with others it can't: they wait at the door outside. A card over the game
  (`app/readying.js`) shows after a quarter of a second (`READYING.grace`: what's kept already is
  read in less, and nothing's seen). It has the place's name, a bar, so many MB of so many, and
  each creature, *Ready* once its model's read. Once all are, they go in, as tapped.
  - **Go in now**, offered after five seconds (`READYING.patience`), goes in at once. Those not
    read yet are drawn as their stand-ins till they are, as they'd be anywhere; their files are
    still hurried.
  - **Not now** (or Escape) stays out. What's begun is fetched on, no longer hurried.
  - A file that can't be had (a licensed model missing from someone's own copy) is given up on, as
    is the creature's model, which then stays its stand-in. The wait never stops anyone going in.
- **Kept while in there.** The kinds of the place the player's in, or waiting at the door of, are
  kept (`forgetModels`' `area`), however long it is since one was drawn.
- **Let go of soon after.** Once the player's left, and its foes are asleep again (no one near its
  way in: docs/DUNGEONS.md), they're let go of 30 s after they were last wanted (`AREA_LINGER`),
  not the three minutes of one met in the wild: off the graphics card, kept by the downloader, so
  going back in reads them, nothing downloaded. One wanted out in the world as well (near a lair)
  is kept as one met in the wild is.
- **Kept on the phone.** The service worker lets go of the catalog's least recently used files
  first when room runs short. It can't see what the downloader reads from where it keeps them, so
  each file the downloader keeps or reads is told to it as used (sw.js `used`). The big models a
  player's been near aren't the first to go.
- `test/model.test.js`: a place's kinds, made or not; its models kept while the player's in it,
  let go of `AREA_LINGER` after; a place's models got ready, each file kept first, hurried, then
  read, how far it's got, calmed. `test/fetcher.test.js`: a hurried file fetched at a quiet time,
  before the rest, its parts back to back; calmed, waiting with the rest; kept without being
  handed over; the service worker told. `test/sw.test.js`: a file the page says was used isn't let
  go of first. `e2e/pellagos.spec.js`, in the game: a dungeon made a den of werewolves (a theme of
  the test's own). At its door, the world stops and the card shows, nothing ready. Not now stays
  out. Tapped again, Go in now is offered after a while, and the player goes in once both models
  are read. Left and walked away from, the models are kept a while, then let go of. Near another
  den, of the Dreadthorn's, its model is fetched in the background, not read.

### In a crowd (beasts/herd.js)

More than 45 metres from the camera, and in a crowded fight that comes too slowly those least
seen, are drawn in their kind's crowd (docs/GAME.md *Standing in*), beasts as well as people. A beast's kind's figure is made once for
each of the three it's built as (`seed % 3`), at its kind's size, each drawn at its own:

- **Its figure.** Its sculpted body and its folded pieces merged into one mesh as they're bound to
  its bones (`figureOf`, as a soldier's), coloured by its corners (its pictures 32 pixels square,
  all white). Its pieces are a triangle apart each (`fold`), so corners alike are welded first:
  a skeleton's 59,000 become 11,000, and its fewer triangles near and far (lod.js) have something
  to take away.
- **Its moves.** Standing, walking, running, its first way of attacking (0.8 s, struck at 0.4), a
  flinch and its fall, each played on it once (`pose`) and recorded 20 times a second. Its walk and
  run are recorded a stride each (its body's `phase`: a quadruped's, a biped's, a spider's legs, a
  serpent's wave, a frog's hop), the oftener for a quick one, so a stride has 16 moments at least
  (a rat's and a porcupine's run, 0.2 s a stride). What's played over and over has its end eased
  into its start over a quarter of a second, as its breathing and looking about aren't in step with
  its stride.
- **Which.** Those whose bodies move by their bones alone, aren't seen through and aren't drawn
  from a model (`herds`):
  four-legged beasts, skeletons and treants, spiders and scorpions, snakes, bog frogs. Not a slime
  (its body squashed as a whole), bats (a swarm), a wisp, a ghost or wraith, the black shuck or the
  shadow stalker (seen through), a wyvern or drake (wings), nor the wight lord (its cape).
- In a crowd, a beast doesn't rest (it stands), and bites with its first way of attacking whatever
  it does in full; a special (a spit, a breath) is a bite too.
- `test/herd.test.js`: which are drawn in a crowd; a wolf's figure, posed as its bones are walking
  and biting, every corner where its own body's is (within half a centimetre); every kind's moves
  recorded, its walk and run a stride each, every one played over and over going round without a
  jump; a stand-in for a beast told its bites, flinches and falls and not a dodge, and its actions
  as they were after; a stand-in twice its kind's size taking a stride in twice the ground.

## The model viewer

`model-viewer.html` (`js/lab/model-viewer.js`, `js/lab/inspect.js`) is for watching the
creatures and the people move, at <https://hoffspot.github.io/conquest/model-viewer.html>. It was
the creature lab; `creature-lab.html` sends on to it, with what it was asked for. Choose a
creature of the wild, a dungeon's boss or mini-boss (DUNGEONS.md), one of the people (an
adventurer, a soldier, or one of the folk in their role: CHARACTERS.md, *The motion check*), or
one of the things, and it's drawn as the game draws it. The things are a works' wagon and its ox
(WAR.md, *Convoys on the roads*: of a people's timber, laden with wood, stone or metal, or
empty); what's carried and worn that's a model of its own, built in code (characters/items.js:
the weapons, shields, helms and hats, quivers and packs, the tusks and tails); and the catalog's
props (app/assets.js: the dungeons' and the shops' furniture, wares and dressing, and the
treasure chest, its opening its one clip). Drag to
go round it and pinch or scroll to come nearer. The bar at its foot has it stand, walk, run,
attack, be struck, rest, die or be knocked down, and fly, land or hover if it can; over it,
**playback** (below). Its panel (**Inspect**) is beside it on a screen wider than it's tall, and
under it on a phone or tablet held upright, its lower half; what's shown is centred in what the
bars and the panel leave of the view, the camera far enough back to see all of it there (and the
fog as far off, so a big creature seen from far back on a narrow screen isn't lost in it).

- **On a phone** (narrower than 760 px, or shorter than 520: either way up), the page is compact:
  the top bar one row (the picker as wide as there's room for, its buttons icons) and what's shown
  one line under it, cut short; playback one row of icons; what it does one row scrolled across
  (side by side with playback on its side); the panel in tabs (Moves, Show, Details, and Person or
  Wagon), one part at a time, shut with its ✕; every button at least 44 px. The script lays it
  out (`layout`), and again as the screen turns or the bars take more or fewer lines.

The panel and playback:

- **Playback** (the bar over what it does, always there): pause and play (Space), a frame back
  or on (← and →, a thirtieth of a second), as slow as a tenth or twice as fast, and each move
  over and over (**Loop**) or once. Stepping back
  goes through the last ten seconds as they were drawn (`Rewind`: each bone where it was), and on
  again to just where it was.
- **Show:** its skeleton (three.js's `SkeletonHelper`) and its wireframe, each on and off.
- **Person** (one of the people): of which people, a woman or a man, and, an adventurer or a
  soldier, with which weapon (an adventurer any a player may start with, or an orc's cleaver; a
  soldier their people's). **Wagon** (the ox's): its people's timber, and its load.
- **The game's moves,** each by name: a beast's attacks, its special ones and its ways of resting;
  a people-shaped one's weapon's attacks and its ways of resting (characters/actions.js); one of
  the people's every motion, as the motion check plays it (characters/motioncheck.js `motions`):
  their weapon's attacks, drawing and putting it away, their role's work and rests, the emotes,
  the spells, the blows and dodges, and the falls.
- **Clips in its model:** drawn from a model (the Dreadthorn), every clip in its file by name and
  length, played alone as it was made (`modelBody`'s `hold`), and slid through. One built in code
  has none: its moves are worked out as it plays.
- **Details** (`detailsOf`): how it's made (a model's file and its size, or the game's code); its
  source (a prop's maker and licence, as the catalog has them); how tall and long it is (a
  thing, how wide, deep and tall); the triangles, vertices, meshes and materials drawn of it as
  it's shown (one level of detail); its textures, each once, the largest first; its bones and
  clips; and its licence, linked to.

`?creature=` opens it on one, `&action=` doing something, `&clip=` playing one of its model's clips
(once the model's read); `?person=` one of the people (`adventurer`, `soldier`, or a role: `smith`),
`&people=`, `&sex=` (`f` or `m`) and `&weapon=` who they are; `?item=` one of the things carried
and worn (an EQUIPMENT id: `sword`), `?prop=` one of the catalog's props (`chest`); and the ox's
wagon, `?creature=ox&load=stone&people=orc`. `e2e/model-viewer.spec.js` uses it as a player would. `test/inspect.test.js`
covers what it says of a model, its wireframe, and stepping back and on.
