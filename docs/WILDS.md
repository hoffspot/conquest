# The wilds

Out of town the world has creatures in it: wolves on the roads, bears in the woods, slimes in the
meadows, and each people's own strange things in the wilds of their lands. They're about as strong
as a new adventurer near home and stronger the further out, with the mightiest kept to the
perilous places for players near the height of their power. This covers what they are, where and
how strong, how they behave, how they're kept about the players, and how they're built and
animated.

The code: `client/js/core/creatures.js` (what each is), `core/battle.js` (how they fight),
`core/host.js` (keeping them about the players, and the elites), `core/director.js` (what the wilds
deal as a player crosses them), `core/caches.js` (the adventurers'
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
| Dungeon spider | 32 | aggressive | an ants' nest's spider packs | 2–10 | the ants' nests only |
| Elite dungeon spider | 72 | aggressive | leads each spider pack | 3–10 | the ants' nests only |
| Giant cockroach | 22 | aggressive | an ants' nest's packs, 3–5 | 1–8 | the ants' nests only |
| Dungeon wasp | 26 | aggressive | an ants' nest's packs, 2–4 | 2–10 | the ants' nests only |
| Dungeon scorpion | 64 | aggressive | an ants' nest's packs, 1–2 | 3–10 | the ants' nests only |
| Black widow | 54 | aggressive | alone under a gallery's roof, lurking; or a mini-boss, the Widow matriarch | 3–10 | the ants' nests only |
| Ant Monster | 96 | aggressive | 1, calling its flock | 4–10 | the ants' nests: their boss |
| Restless ghost | 26 | aggressive | 1–2 | 3–9 | the ruins, ruined castles and graveyards, with their dead |
| Wraith | 46 | aggressive | 1 | 5–10 | the ruins and ruined castles, with their dead |
| Drake | 90 | aggressive | 1 | 10 | the drake's lair |
| Dreadthorn | 220 | aggressive | 1 | 10 | a Dreadthorn's lair |
| Wight lord | 70 | aggressive | 1 | 9–10 | the ruined castles |
| High priest of the cult | 80 | aggressive | 1, with six of the faithful | 10 | a hell's way in, by night (docs/DUNGEONS.md *Hells*) |
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
mares, frost trolls, and a hell's fiends, cinder husks, dirge wardens, flayed hierarchs, forge
brutes, chained gluttons and gorger warlords: creatures.js
`steady`), the perilous places' own, an elite, a dungeon's boss (or a hell's level's master), a
fortification, a palisade or a wagon. The thrown body's a ragdoll (docs/CHARACTERS.md *Thrown*); a creature's tumbles whole.

Some of a hell's own kinds (docs/DUNGEONS.md *Its own kinds*) leave a blast of their own where they
fall dead (creatures.js `burst`): a cinder husk its embers, a bloat gorger its bile, lying there a
moment (1.2 and 1 second), a ring on the ground as wide as it'll reach, swelling, heard gathering,
then bursting as a bomb does on whoever of its foes is within 2.2 or 2.4 metres (never its own
kind), throwing them less far; the embers as fire, the bile as earth, poisoning whoever it
catches as often as not (battle.js `BOMBS` `cinders`, `bile`: their `look`, `element` and
`afflict`). So whoever kills one up close should step away. Others of them keep some kinds of harm
off themselves as a player's charms do (creatures.js `wards`: a cinder husk and a slag gorger half
of fire's, a dirge warden half of water's, a flayed hierarch some of magic's; battle.js `charmed`,
half at most); and a flayed hierarch's curse and a chained glutton's bite draw back into them a
share of the harm they do, healing them (weapons.js `drain`: told as "healed", as Vampirism's is).

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
from an enemy's action wheel or the Action Bar at the foe the player's named or set on, or the
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
in the snows. And by night at each hell's way in, its cult at their rite (`RITES`: kept as a lair
is, but only after dark): a high priest of the cult, robed and a head taller than its faithful,
swinging its staff and calling hellfire down from nine metres, with six of the faithful round its
ring (docs/DUNGEONS.md *Hells*). The Dreadthorn is the mightiest of all, a fight for a party: its hide turns a third of
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
hired warriors of the level a guild offers for the tier, docs/WAR.md *Mercenaries that grow*, a
summoner with five creatures), the players as strong for the tier as its creatures,
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

## Might and power

What a player finds is made for how mighty they are, and an easy kill finds the exceptional less
often (core/might.js; the user: "Propose a design similar to the game borderlands where the players'
power/strength is taken into consideration when rolling the number of attributes and attribute
ranges of an item drop ... If a player can easily smash an enemy by virtue of the differences in
power between the player and enemy, the probability of receiving exceptional loot from that enemy
should be reduced").

- **One scale for both, 0 to 100** (`MIGHT`, `scaleOf`): a fighting value (*A side's strength*,
  above: √(toughness × harm)) a step up each time it's so many times as much, a fresh hero with a
  sword 0 (a fighting value of 20.6), a hero of the highest ranks in legendary gear of the highest
  level about 100 (eighteen times that). A tier of a creature's (×1.18) is about six steps; ten
  steps is about ×1.34.
- **A player's might** (`mightOf`, `heroValue`) is what's lasting about them, and nothing else:
  their gear (its make and level, what's rolled on it, a legendary weapon's effect, let loose as
  often as its charge fills), their skills and abilities (a Power strike's or an Aimed shot's
  doubled blow now and then), the spells they know that harm faster than their blows do (as *A
  side's strength* has them: a mighty weapon's wielder doesn't leave off it for a weak spell), their
  healing (their best healing spell's and Vampirism's, as if cast a fifth of a 30-second fight,
  and what Leeching draws back: as hit points more), their stuns beyond what anyone's Stun does
  (as harm not done to them, at most 30%), and their charms. Not their followers, nor the creatures
  they've called or raised, nor a boon, a draught or a spell that lasts a while (the user: "hired
  followers, summons, or zombies should not be taken into consideration for power"). A fresh hero
  is 0; a hero at rank 1 in a fine kit with fire's second spell about 26; at rank 3 in masterwork
  with fire's fourth about 58; at rank 5 in a legendary sword and tower shield and every school's
  seventh spell about 86 (93 in gear of level 50, 99 in gear of level 100). Shown in the pack's
  totals. What a player finds is made for the highest might they've had in the last ten minutes
  (`LOOT_MIGHT`, Host `mightFor`, kept as they're outfitted: `mightPeak`), so their gear taken off
  just before a kill makes nothing of an easy one.
- **A foe's power** (`powerOf`) is its own, as it is: its tier, an elite's or a champion's strength,
  its armour (a rat near home 0, a bear of the fifth tier about 16, a troll of the ninth 57, the
  Dreadthorn 84, a dungeon's boss Demon Lord 99; the Behemoth and the kaiju 100). People (soldiers,
  orcs, raiders) each their own. A pack of the wild's counts together only for those of it that came
  at a player (`#fights`: each one that's set on them, struck at them, kept by pack and player, the
  fallen too, till the last of the pack's gone), as one (`packPower`: √(their toughness together ×
  their harm together)): three wolves of the third tier that fought a player together are about 17,
  where each alone is 0; a wolf that never reached them is its own (the user: "Monster's power
  should be calculated on an individual basis, not in packs unless the pack acts together to attack
  the player").
- **A piece's level** (`levelFor`, `LOOT_LEVEL`) for a player's share of a kill: the fight's power,
  kept to no more than 10 below their might and no more than 5 above it, and a little luck (3
  either way), 1 to 100. A fair fight finds pieces of their own might's level; a harder one up to
  5 more; an easy one never more than 10 less; a strong friend can't lift a weak one more than 5.
  In a party, each player's own might counts for their own share. What a level does: docs/WAR.md
  *Levels*.
- **An easy kill** (`falloff`): a player more than 10 mightier than the fight's power finds a
  rare, very rare or legendary piece half as likely for each 10 more, never less than a tenth as
  likely, what's taken given to the common, fine and masterwork, each as much more as it was
  likely (progress.js `fallenOff`); 2 less mighty, as it's reckoned, against a kind they've Mastered
  in their bestiary (`MASTERED_STEPS`). Only the makes rolled: never a relic, moonsilver, a map's
  prize, an invasion's thanks or the armoury's gift; nor gold, parts, draughts or tomes.
- **Where nothing was fought** (`tierPowerOf`): what's found stands for its land's tier, ten steps
  a tier past the first: an adventurers' cache's band, a place's chest, a lair's hoard (its
  master's tier), a dungeon's chests and fallen (its level's tier) and hoard (the hoard's tier), a
  treasure, a fallen adventurer's remains. A shop's wares, the armoury's gifts and an invasion's
  thanks are made at the player's might's level, as it is.
- **The tiers of old** (`mightTier`): what came with a player's might of 0 to 8 before comes with
  one for every ten of it, 0 to 10: the war's ages (docs/WAR.md), the smith's makes, an adventurers'
  cache's, a treasure's, a dungeon's and a hoard's tier.
- **Seen** (app/hud.js `sizeUp`, game.js `#sizeUp`): each foe's plate coloured by how a fight with
  it goes for the player (`fightLook`): grey and dimmed, what it leaves less likely exceptional
  (more than 10 weaker than them); as it is, a fair fight; amber, harder (more than 10 stronger);
  red, far harder (more than 25); an elite's name stays gold, its level by it coloured instead
  (styles.css `.look-easy`, `.look-hard`, `.look-deadly`). The Evaluate spell (docs/MAGIC.md) shows its power by its name
  too ("Pw 31"), crossed blades after it while it's with others of its pack that came at them.

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
    then very rare or legendary, and better the further out; of a level for the player's might and
    the elite's power, the exceptional less likely for one it came too easily to (*Might and
    power*).

## The wilds director

Every so far a player crosses the wilds, something's dealt ahead of them from a deck of what the
wilds hold (`core/director.js`, the host's `#caches` and `#deal`), as the old tabletop wilderness
dice did, so that crossing them is more than one guarded chest after another.
- **How often** (`DIRECTOR.every`): every 250 to 450 m crossed (rolled each time), counted as a
  cache's is (*Adventurers' caches*, below): on foot, out of the settlements, afresh for everyone
  together once one's dealt to any of them.
- **The deck** (`DIRECTOR.cards`, `shuffled`): an adventurer's cache, a fallen adventurer's
  remains, an old campsite, fresh tracks, a stranger, something across the way, an ambush
  (*Ambushes*, below). Each comes once a deck, in an order of its own, the deck shuffled
  again once it's all been dealt, never with the card just dealt first again (Left 4 Dead's
  director dealt its bosses so: no two of the same running). Each player has their own, kept in
  the world's snapshot (`travel`). A card with nowhere to go ahead waits for the next look.
- **Where** (`#spotAhead`): as a cache is, 70 to 100 m ahead, on open ground clear of the roads,
  the settlements, the places worth finding and every other cache and find.
- **A fallen adventurer's remains** (`FINDS.remains`): bones stretched out where they lay, a cloak
  gone to rags under them, a pack by their head, and their sword thrust upright in the earth by
  their hand, its hilt over the tall grass (world/finds3d.js); a coin over them till they're searched.
  Said once a player's within 60 m ("The remains of an adventurer who fell out here long ago.
  Search them: they may have left something.") and marked on their maps with a skull. Tapped,
  they're searched (a chest that's no chest: `#searchRemains`), a share for each player near
  (`rollRemains`): 6 to 16 gold, 35% more for each tier past the first; a piece of gear 35% of the
  time, made as a cache's is at the land's tier; a healing draught 40%; a treasure map 20%, made as
  a chest's at the tier. Half the time there's a note in their hand, of the nearest place within
  1.5 km that player hasn't found (`noteOf`, of those rumours are told of): written in the journal
  as a crier's rumour is ("A fallen adventurer's note"), its circle on the world map, said with a
  quill's scratch. Searched once; their mark greyed after.
- **An old campsite** (`FINDS.campsite`): a ring of stones round a bed of ash and burnt logs, a
  log to sit on, a lean-to of branches, and a rag tied to a pole by it to find it again over the
  grass. Said within 60 m ("An old campsite… A good place to
  make camp: safe from the wild, and you'd wake well rested.") and marked with its fire ring.
  Camped at within 8 m of its ring: a camp's only refused for the wild with something hostile
  within 16 m (not 40), the fire's lit in its ring, and they wake well rested (`WELL_RESTED`: the
  breath back half again as fast and every heal 10% more, for 20 minutes, kept between visits as
  any boon is).
- **Fresh tracks** (`FRESH`, the host's `#putTracks`): a short trail of prints, not long made, from
  8 m ahead of the player to 10 m short of a pack of the wild's roaming 30 to 85 m off (those ahead
  of them first), or, none, one of the land's put out 60 to 85 m ahead (within the 90 m the wild's
  roaming packs are kept about a player). Every 6 m, wandering up to 3 m off the straight way
  (`freshTrail`), drawn as the trails out of the wild's homes are (*Tracking*), but deeper; never
  to what leaves no prints, what flies, floats or swarms (`TRACKLESS`, held to world/tracks3d.js by
  a test). Said once a player's within 12 m of them ("Fresh tracks, not long made: a wolf's, and
  not alone. They lead off to the north-east: they're on your minimap."), and from then on dotted
  on their minimap the way they lead, prints being hard to make out in long grass. Follow them and
  find the pack first, or see what made them and steer clear. Let go after six minutes, once their pack's all gone, or once every player's 140 m
  from where they start.
- **A stranger** (`STRANGERS`, the host's `#putStranger`): someone met on the way, put out where a
  cache would be. The next of three, each met once before any again, as the cards are (each
  player's `strangers`, kept with their deck). Let go once every player's 180 m off and none's
  fighting them.
  - *A pedlar*, resting by the way, their pannier on their back and a walking staff in hand (one of
    the folk, `pedlar`, characters/folk.js). Said within 40 m ("A pedlar, resting by the way with
    their pack: they'll have odds and ends to sell."). Talked to, they sell out of their own stock
    for the day (`SHOPS.pedlar`, core/stock.js): a healing draught, meat bait and a feed bag always
    (*Bait*), and three more of the common draughts and cures, one to three of each. Half the days there's a special too, a common
    treasure map or a common charm (`sometimes`). All a quarter dearer than in town (`markup`).
  - *A wounded hunter*, in greens with their bow and quiver slung, down to 30% of their health
    (`hunter`). Said within 40 m ("Someone's down ahead, hurt…"). Healed, with a healing draught
    given them in a talk (the least the player has: `HEALING_DRAUGHTS`) or a healing spell cast on
    them (in a talk, the least the player knows that's ready, or any time from the wheel), they
    tell whoever healed them of the nearest place within 1.5 km that player hasn't found, as a
    fallen adventurer's note does (`noteOf`). It's written in the journal ("A hunter you healed"),
    its circle on the world map, said with a quill's scratch. Eight seconds later they go on their
    way, 60 m off from the nearest player. Turned down in a talk, or left unhealed three minutes
    after a player first came within 40 m, they limp off at half their pace.
  - *Hungry bandits*: three or four outlaws, their chief and his band (`CACHE_BANDS.bandits`), as
    strong as the land there, no one's enemy till they're refused (`neutral`). The chief hails a
    player who comes within 14 m ("Hold there, friend!"; "Bandits bar your way, hungry: they want
    food or gold to let you by…"). Talked to (any of them), they want food (two cuts of the wild's
    meat, else a hot meal: `foodFor`) or gold (12 to 20, 35% more for each tier past the first:
    `banditToll`). Paid, they let everyone by. Refused, or walked away from (a hailed player 30 m
    from their chief, unpaid), they draw their blades and fight like any of the wild's, after that
    player.
- **Something across the way** (`OBSTACLES`, the host's `#putObstacle`): a fallen tree or a
  rockslide, long since down (one or the other at random), 45 to 70 m ahead of the player, across
  the way they're going, road or not. Out of the settlements and away from the places worth
  finding and every other cache, find and obstacle (`cacheClear`), on land, its squares all free.
  - *Over its squares*: a tree seven squares long and one wide, rocks four across and three deep,
    along the world's axis nearest across the way (`obstacleBox`: no slipping through it corner to
    corner). The world blocks them as its chunks are made (overworld.js `setObstacles`), the way
    round's found again (`dropTiles`), and the ground under it's drawn again. Drawn by
    world/obstacles3d.js: the trunk on the ground, its roots torn up in a plate of soil at one end,
    broken branches and a little dead leaf at the other; or boulders heaped over it, stones round.
  - *Said* within 40 m ("A fallen tree lies across the way ahead. Go round it, or hold on it to
    clear it."). Tapped, the player walks up to it and is told to hold on it.
  - *Cleared* (the `clear` command, `#clearing`): held on, the player walks up to it and sets to it
    within 2.5 m of it, stopped, swinging at it every 1.1 s (their weapon's blow, a chop or a crush
    heard). It's six seconds' work alone for a tree, eight for rocks, at a second's work a second;
    twice as quick with an axe or a hammer, 1.75 with a cleaver, 1.5 with a greatsword (`TOOLS`),
    and everyone at it together adds theirs. It costs 5 stamina a second; out of breath, they leave
    off, told so. They leave off too once they let go, walk off or fight.
  - *Cleared, it's gone for everyone*, and it's a game of chance (`clearedTurnsUp`): 30% of the time
    brigands were waiting (`OBSTACLES.brigands`: the land's cache band, three or four, out 7 to
    10 m round it) and jump whoever cleared it the moment they have ("It was a trap!"); 40% of the
    time a cart's load spilled under it long ago, a share for each who cleared it where it lay
    (`rollSpilled`: 8 to 20 gold, 35% more for each tier past the first, and half the time a hot
    meal, an ale, a healing draught, a bandage or a glowcap draught); otherwise only the way clear.
  - Let go once every player's 200 m away and no one's clearing it.
- **An ambush** (`core/ambush.js`, the host's `#putAmbush`): a band of the land lying in wait
  ahead, at a bridge, a ford or a road through the trees if there's one (*Ambushes*, below). Set
  aside for later in the deck, the next card dealt in its stead, in a quiet spell after a hard
  fight, and at night half the time when no one there has light about them (`AMBUSH.dark`).
- **Let go** once every player's 220 m away (`FINDS.far`); another comes later. Nothing's kept in
  a snapshot till one's been dealt (`finds`, `fresh`, `strangers`, `obstacles`, `ambushes`).
- **The pacing** (`PACING`, the host's `#pace`; Left 4 Dead's director: "Algorithm adjusts pacing,
  not difficulty"), kept for each player with their deck:
  - *A quiet spell after a hard fight*: a fight a player fell below half their health in (or
    fell), once it's over (no foe after them for 5 seconds), is followed by a minute to a minute
    and a half of quiet. Half as many of the wild come about them (*Kept about the players*), no
    elite, and the next card dealt's a peaceful one (`peacefulNext`: the first in the deck, or the
    deck shuffled again if none's left in it, never the card just dealt first). Said: "The wild
    grows quiet round you, for a while."
  - *A build-up after a long calm*: four minutes and 400 m crossed out in the wilds without a
    fight, and the land's hunters (`encounterAt`, two at least) are heard 70 to 90 m ahead
    (`#buildUp`): folk with hands drumming (synth.js `warDrums`), beasts calling and others
    answering (their own call; drums for one that has none), heard up to 160 m off, and said which
    way ("A wolf calls, somewhere off to the north-east, and others answer."). 12 to 20 seconds
    later they're put out there and come for the player, running (`#hunt`: "They're on you!", or,
    folk, "Here they come!"). Those sent so aren't minded as wary beasts are (*Wary beasts*):
    they're coming for the player. A third of the time and more (`AMBUSH.silent`, 35%) there's
    no build-up heard: an ambush is laid ahead of them instead, in silence (*Ambushes*), the only
    tell the wild gone still ("The wild's gone quiet round you. Too quiet.").

## Ambushes

One of the wilds director's cards (*The wilds director*, above; `core/ambush.js`, the host's
`#putAmbush`, `#ambushesAbout`, `#spring`): a band of the land lying hidden in wait ahead of a
player, told by something off as they come near, and sprung as they walk into it or wait about
near it. Springing it catches them by surprise: it acts first, from where it lay, and is no harder
for it. Seen through and struck first, before it springs, it's caught out.
- **Where** (`#ambushSite`, `AMBUSH.ahead`, `spread`): 45 to 80 m ahead of the player it's laid
  for, within a third of a turn of the way they're going (any way, none), where a cache may be
  (`cacheClear`: off the settlements and the places worth finding, clear of every other cache,
  find and ambush; the roads no matter), on dry land with room about its heart (two in three of
  the squares within 6 m free: `#openFor`). Of a dozen such places, the one most made for it
  (`#chokepoint`): by a bridge's end or on the way over a ford, then on a road, then in the woods
  (woods, dark woods, elf woods, jungle), then anywhere.
- **Who for**: at night, the one of the party with light about them (the Light over them, or
  standing in a lit place: a torch-bearer's an easy mark), and the card's set aside half the time
  when no one has (*The wilds director*). Its band's as strong as the land there or the mightiest
  player near, as a cache's guards are (`cacheTier`, `cacheCount`; its leader a tier up), and
  tougher against a party, as anything is (strength.js `SCALING`). All of them one pack, so a
  player who fights any of them fights all of them (their power pooled: *Might and power*).
- **Its band, and its way** (`STYLES`, `ambushBand`, `ambushStyle`: one of those of the land there,
  `stylesFor`; the restless dead twice as likely at night):
  - *Bandits* (where there are outlaws, or where there's nothing else): a pincer, their chief and
    two ahead of its heart, one of them a bowman on a rise (`arms` "bow"), and two behind it, who
    go for the hindmost of the party once it's sprung. Told by a glint of steel in the brush
    ("Steel glints in the brush ahead. Someone's waiting there."); sprung within 3 m of its heart.
  - *Goblins* (raiders under an ogre, or goblins under a troll in the trolls' lands): a snare laid
    at its heart that roots whoever steps in it two seconds (`snare`, drawn as a rope noose
    pulled tight round their feet), and two bombers lobbing from the brush. Told by a twig
    snapping ("A twig snaps in the brush ahead. Something's waiting there."); sprung within
    1.5 m.
  - *Wolves* (the land's pack hunters, `huntersOf`: wolves, dire wolves in the cold and the
    heights, hyenas in the catfolk's lands, hounds of Annwn in the elves'): one shown ahead as
    bait, lying in the open, the rest in the cover on either flank, two of them behind. Told by
    the birds bursting from the trees and going quiet ("The birds burst from the trees ahead,
    and go quiet."); sprung within 3 m of its heart, or 8 m of the one in sight
    (`AMBUSH_SHOWN`), or once it's struck.
  - *The dead* (the restless dead, more often by night): four or five under the earth in a ring
    4.5 m round its heart, rising (1.2 s, `rise`) as their hands break through it, clods flung up.
    Told by the earth turned ("The earth ahead's been turned, not long since, and a cold hush
    hangs over it.", mounds of fresh earth drawn there); never glimpsed; sprung within 3.5 m.
  - *Spiders* (the dark elves' wilds): cave spiders and a giant centipede in a ring 5 m round its
    heart, in their holes and overhead. Told by fresh webs strung across the way ("Fresh webs
    strung across the way ahead, and nothing moving."); never glimpsed; sprung within 4 m.
  - *Cultists*: one lying hurt by the way, a "Wounded traveller" (`lure`: no one's enemy till it's
    sprung, at 40% of their health), the rest in the brush 9 m about them. Told only nearer, within
    15 m, by the mark on the lure's sleeve ("Their sleeve bears a mark you've seen on cultists'
    robes."). Sprung on whoever talks to the lure or comes within 3 m of it, or waits about within
    18 m for eight seconds (`linger`).
- **Told** (`AMBUSH.tell`): to the first to come within 24 m of its heart (the cultists', 15 m),
  said, heard (synth.js `steelGlint`, `twigSnap`, `birdsFlush`) and seen (sparks off steel, leaves
  shaken from the brush, birds bursting from the trees: effects.js `birds`, `leaves`). Those of
  its band that can be (`glimpsed`: not the dead nor the spiders) are glimpsed from then on, drawn
  faintly through their cover as anyone hidden is, and can be struck; till then they're hidden
  (`hidden`: not drawn, no bar, not on the minimap, no one's foe nor anyone's to fight).
- **Sprung** (`#spring`): on whoever comes within its style's `spring` of its heart, or once a
  player's waited about within 18 m of it (`near`) seven seconds after its tell (`waits`): its band
  out of cover and after them at once, as if struck by them, those ahead of its heart and its
  leader at whoever walked into it, those behind at the hindmost of the players near (furthest
  back the way they came), the goblins' snare round whoever stepped in it. Said ("Ambush!
  Outlaws, ahead and behind!", "Ambush! Goblins in the brush!", "Ambush! The pack comes in from
  the sides!", "The dead rise from the earth round you!", "Spiders! All round you!", "It's a
  trap! Cultists!") and heard (`ambushSprung`, a goblins' `snareSnap`, the dead's `earthBreak`),
  leaves kicked up where each was lying.
- **Caught out** (battle.js "caught"; the host's `#caughtOut`): one of its band struck while
  hidden or glimpsed, before it springs, and the tables are turned: all of them stunned a moment
  (`AMBUSH.caught`, a second) as they're sprung, and their leader's stash theirs once he falls
  (`stash`: 20 to 45 gold more, and a prize as an elite's: caches.js `elitePrize`). Said: "You've
  caught them out! They're reeling." Striking the one shown (the wolves' bait) springs it as
  walking into it would.
- **Let go** once every player's 220 m from it (`AMBUSH.far`) and none of its band's fighting, or
  once they've all fallen; kept in the world's snapshot (`ambushes`, `SNAPSHOT_VERSION` 44).

## Adventurers' caches

Here and there out in the wilds lies a chest some adventurer stowed and never came back for, and a
band of the land's brigands has found it and keeps it (`core/caches.js`, the host's `#caches`).
- **Where.** It's one of the wilds director's cards (*The wilds director*, above): one turns up
  70 to 100 m ahead of a player, within about 35° of the way they're going. Only ground crossed on
  foot out of the settlements counts: not a step in a town, nor a leap of more than 20 m in half a
  second (carried by magic or a portal). It's put on open,
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
  (their might's tier, one every ten of it, a tier above it: `cacheTier`, core/might.js
  `mightTier`), whichever's the more. So it's never weaker
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

## Treasure maps

Now and then a chest holds a map of where something was buried, and any adventurers' guild sells
a plain one (`core/treasure.js`, the host's `#treasures`). Read out in the wilds, it marks a circle
to search on its reader's maps, and their party's; whoever buried it left a band to keep it.
- **The map.** One thing (`treasureMap`, progress.js ITEMS) in every make gear comes in: common,
  fine, masterwork, rare, very rare and legendary (`MAP_GRADES`), named for it ("Rare treasure
  map") and shown in its colour, worth more the rarer (its make's price, as gear's). It's read
  from the pack ("Read"), kept with the tomes and scrolls.
- **Where it's had.**
  - **Bought:** a common one, 40 gold, at any adventurers' guild; never a better one, and no other
    shop has them.
  - **In a share of a chest** (`MAP_FINDS`, `withMap`: each player's share rolled for itself):
    - one in ten of a place's chests and of the adventurers' caches;
    - one in twelve of a dungeon's chests (never its fallen's remains);
    - three in ten of a hoard (a drake's, a dungeon boss's);
    - half of a great hoard (a Dreadthorn's, the Tower of Sar Mordal's).

    How well made it is goes by the chest's tier (`MAP_MAKES`, `foundMap`; a lair's hoard, its
    master's: a drake's and a Dreadthorn's the tenth):
    - tiers 1 and 2: common, now and then fine;
    - tiers 3 and 4: up to masterwork;
    - tiers 5 and 6: up to very rare;
    - tiers 7 and 8: up to legendary, now and then;
    - tiers 9 and 10: rare or better, a legendary one in seven.
  - **In a treasure dug up:** one in eight of the shares holds another, as well made or the next
    better.
- **Read.** Only out in the world (not in a building: "Read it out in the world, under the open
  sky."), and three of a player's own at most at once (`TREASURE.most`: "You're on the trail of
  three treasures already").
  - **Where it leads** (`placeTreasure`): as far off as its make has it (`TREASURES` `reach`), any
    way, 150 m in from the world's edge, on the ground a cache could be on (`cacheClear`: dry, off
    the roads, clear of the settlements, the places worth finding, the camps, any cache or other
    treasure), with a way there across the world from where it was read (core/journey.js
    `wayAcross`).
  - **What's marked:** a circle round the spot, its make's `radius` wide, its middle anywhere that
    keeps the spot within two thirds of the way to its edge.
  - **What it's called:** the map's gone from the pack, and its reader's told which way and how
    far ("The rare treasure map shows somewhere 1.2 km south-west…"), with a quill's scratch.
  - **Nowhere found** ("The map's marks fit nothing round here"): the map's kept.

  | Make | How far (m) | Circle (m) | Keepers | Tiers up | Leader | Gold | Gear | Prize |
  |---|---|---|---|---|---|---|---|---|
  | Common | 300–700 | 40 | 3–4 | 0 | | ×1.5 | 1–2 | |
  | Fine | 450–950 | 50 | 3–5 | 0 | | ×2 | 1–2 | fine |
  | Masterwork | 600–1,300 | 60 | 4–5 | 1 | | ×3 | 2–3 | masterwork |
  | Rare | 800–1,700 | 75 | 4–6 | 1 | | ×4.5 | 2–3 | rare |
  | Very rare | 1,000–2,200 | 90 | 5–6 | 2 | elite | ×6 | 2–3 | very rare |
  | Legendary | 1,300–2,800 | 110 | 5–7 | 2 | elite | ×9 | 3–4 | legendary |
- **Who hunts it** (`huntersOf`): its reader, and whoever's in their party (*Parties*, docs/WAR.md),
  now. Each of them has its circle on their world map and minimap (`drawSearch`, app/mapicons.js:
  a dashed ring in the map's make's colour, faintly filled, an X at its middle; their own bolder
  than another's), and the hunt in their journal (*Treasure hunts*: which way, and whose map), their
  own each to give up ("Give up": the `treasure` command, `do` "abandon"; its keepers let go). Told
  when one of their party reads one ("Bryn's fine treasure map: where it leads is marked…"). Anyone
  else sees nothing of it.
- **Its keepers wake** once one of its hunters out in the world comes within 40 m of its circle
  (`TREASURE.rouse`, `nearTreasure`).
  - **Where they stand:** about where it's buried, on open enough ground for them, as near where
    the map has it as can be (within 12 m: `TREASURE.shift`; `spot`, kept from then on).
  - **Who they are:** a band of the land there (`CACHE_BANDS`, as a cache's: outlaws, goblin raiders,
    goblins under a troll, the restless dead, cultists), as many as its make has (`treasureCount`).
  - **How strong:** as a cache there would be, its make's tiers more (`treasureTier`: the land's
    tier or the reader's might's tier when it was read, whichever's the more), up to the tenth.
  - **How they keep it:** as a cache's band keeps it (#putBand, shared with the caches), against
    the side of the group the hunter's in.
  - **Its leader:** a very rare or legendary map's is an elite (*Elites*: three times the hit
    points, its prize when it falls).
  - **What's told:** those of its hunters near it: "Whoever buried it left outlaws keeping it. Put
    them all down to dig it up."
  - **What's seen:** nothing above ground. Within 15 m of where it's buried (`TREASURE.seen`), its
    hunters see it glint (world/treasure3d.js: a twinkling gold star over a mound of turned earth).
  - **Let go** with the caches once every player's further than 200 m, and its circle's width
    twice over and 40 m more, from them (never while a hunter's near enough to wake them again).
    The treasure stays where it was buried, for them to wake afresh.
- **Dug up** once the last of them falls (#unearth).
  - **Who has a share:** each of its hunters within 39 m of it (as at a cache), and each who struck
    or felled one of them (`fought`) wherever they are, told so ("The treasure's dug up: your share
    waits where it was buried."). Another player there, in no party with its reader, has none.
  - **Each share** (`rollTreasure`), theirs alone to take where it was buried, for five minutes:
    - gold: 20 to 45 times its make's `gold`, 35% more for each tier past the first;
    - gear as well made as a cache's at its tier, as many as its make has;
    - from a fine map on, a prize as well made as the map;
    - a healing draught;
    - now and then (`TREASURE.map`) another map.

    Its lid's lifted ("You dig up the treasure…"), with no lock to turn.
  - **The hunt's done**, and its hunters not there are told ("Bryn's treasure's been dug up,
    without you.").

The treasures hunted are kept in a snapshot (`SNAPSHOT_VERSION` 32, none in a world kept before),
so a player joining finds them as they are; what's said between games changed (`NET_VERSION` 155).

## Seen from high ground

A player on a rise well above the land round them finds the places worth finding that the land
between doesn't hide, without going near (`core/sighting.js`, the host's `#spotting`; the
Alexandrian's "visible" locations, spotted from a distance).
- **High ground** (`highGround`): the land stands at least 10 m above the average of eight points
  80 m round. About one spot in twenty-one is, in the two worlds scanned (seeds 1 and 2):
  hilltops, ridges and crags, not the plains.
- **How far** (`reachOver`): 200 m, and 15 m more for each metre the player stands over the
  place's ground, up to a kilometre.
- **In sight** (`inSight`): no land along the way, sampled every 16 m, stands above the line from
  the player's eyes (1.7 m up) to 4 m over the place's ground. The last 24 m at either end aren't
  sampled: the rise's own top, and the place's own ground.
- **What's found** (`sightedFrom`): the places worth finding they hadn't found (`core/places.js`
  `placesOf`, the dungeons' ways in, and the dens, *Dens*), the nearest first: four from a typical
  rise, fifteen at most in the two worlds scanned. The host looks each time it looks round (every
  500 ms); a look takes about a quarter of a millisecond. It's pure arithmetic over the lie of the land
  (`terrain/height.js` `landHeight`), the same on every copy of the world.
- **Kept** as spotted (`Explored.spot`, `spotted`, kept with the character; nothing's written till
  something's seen, so older saves and snapshots carry on as they were). It's found wherever being
  near would count (`Explored.knows`, the one rule): its icon on the world map, over the fog; the
  rumour of it done with (`rumoursNear`, the journal's circles); a guild's request to survey it,
  ready.
- **Said**, with a quill's scratch: "From up here you can see a ruined castle, 900 m north-east:
  it's on your map." (or how many).
- **The party** finds them too, as found by the one who saw them ("Ada found …", and "found by
  Ada" on the world map), as with shared finds (docs/WAR.md *Parties*).

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
  whoever strikes it or its pack. The wary beasts roaming the wilds are minded by a reaction roll
  instead (*Wary beasts*, below), their temper swaying it.
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

## Wary beasts

The wild's natural beasts roaming out in the world (`core/wary.js` `WARY`: rats, porcupines,
wolves, dire wolves, boars, snakes, bears, pumas, badgers, wild bulls, rook flocks, harts, hyenas,
jackals, Cape buffalo, jaguars, crocodiles, boas, spitting cobras, Gila monsters, rock tuskers)
don't all simply come for a player on sight: each pack is minded one way or another the first time
it sees one, by a reaction roll as the old tabletop games had it (battle.js `#wary`, `#mind`). The
rest of the wild (the night's own, the fae, the dead, monsters, swarms of vermin, dungeon things)
fights as it always has, and so do the wary beasts that keep a camp, a cache, a lair or a place,
an elite and its escort, and those sent after a player (a build-up's, an ambush's: `reacts`
false). A den's are minded too, the readier to fight for being near it.
- **The roll** (`twoDice`, `moodFor`, `REACTION`): two dice, and what sways it added (`NERVE`, the
  host's `#nerve`, `nerveOf`), the lower the worse for the player: 2 or less, it comes for them;
  3 to 5, it warns them off; 6 to 8, it watches them (a hunter stalks them); 9 to 11, it keeps
  away; 12 or more, it's curious (one that can't be tamed watches instead). One mood for its
  whole pack, rolled against the first player it sees, and rolled again once that player's gone,
  fallen, elsewhere or far off (60 m past its leash), or its while fed is over.
- **What sways it** (`NERVE`): its temper (aggressive −3, territorial −1, defensive +2); how a
  fight with it would go for the player, their might against its power (core/might.js
  `fightLook`: an easy kill +3, fair 0, hard −1, deadly −2); a pack of three or more −1; a night
  hunter after dark −1 (*By night*); near its den −2; light about the player (the Light over them,
  or standing in a lit place) +2 to one shy of fire (`fireShy`: the hunting beasts); a player
  under half their health −2 to a hunter (`predator`); one carrying meat (meat bait, or meat
  carved from a beast) −1 to a hunter.
- **Warning them off** (`MOODS.warn`, `#warnOff`): it stands its ground turned to them and makes
  its display every 2.6 s while they're within 12 m ("warning", `display`: a wolf snarls and
  snaps, a boar scrapes the ground, a bear rears, a big cat hisses and swipes, a bull or buffalo
  paws and stamps, a hart lowers its antlers, a snake coils, a porcupine bristles and rattles its
  quills, a rook flock scatters up and calls: app/game.js `WARNINGS`, audio `beastGrowl`,
  `beastSnort`, `beastHiss`, `quillRattle`). It charges, its pack with it ("charge"), one who comes
  within 5 m (or its guard, territorial) or stays within 12 m six seconds; it settles once they're
  past 16 m.
- **Watching** (`MOODS.watch`): a grazer keeps 12 m off, turned to them (`#watch`); a hunter stalks
  them (`#stalk`), keeping 16 to 22 m off and following them as far as 60 m past its leash,
  closing in again at a run when it falls behind, and strikes once they're under half their
  health, fighting something else, or making camp near it (below). Its eyes shine in the dark at
  night, out beyond the light (world/wild3d.js `EyeShine`: two pale points, up to 42 m off, once
  the day's light is under 35%), as any hunting beast's do.
- **Keeping away** (`MOODS.avoid`, `#keepAway`): off to 20 m from them, and off again if they come
  within 12 m.
- **Curious** (`MOODS.curious`, `#nose`): it comes up to 6 m of them, keeps within 8 m, sniffing
  at them now and then, for a minute; only watching them after that. Fed while curious, it may
  follow them (*Tamed beasts*).
- **Fed** (`MOODS.fed`): food thrown it and eaten (*Bait*), it leaves them be three minutes,
  wandering as it would, unless it's struck.
- **Struck**, any of them, the pack's minded to come for whoever struck it, as ever.
- **Its nerve** (`MORALE`, `#limpOff`, `#unnerve`, `#falter`): at a quarter of its health or under,
  it limps off from the nearest of its foes at 0.9 of its walking pace, slower than a player, so
  one who goes after it catches it ("fled"); and so does the
  rest of its pack once its leader falls or half of it's down (of as many as were put out:
  `packSize`). Cornered, nowhere to go and someone within 2 m, it turns and fights. Once it's 40 m
  from every player, it's gone (let go, its spoils with it). A den's own (*Dens*) stand their
  ground there: minded as the rest, but their nerve never goes (`stands`).
- **Spared** ("spared"; core/bestiary.js `spare`, `RESEARCH.spared`): a pack warned, watching,
  keeping away, curious or fed, and left behind unfought 30 m off: the player knows its kind the
  better for it, a point of research to its page.
- **Shown** (hud.js `mood`, `MOOD_MARKS`): a mark on its bar, coloured: "!" warning you off, "◉"
  watching you (stalking you, a hunter's), "↩" keeping away, "?" curious, "✓" fed, "↯" fleeing;
  its words its title (shown with the mouse over it) and its label. A player who knows its kind well (its bestiary page
  at 2 or more: game.js `MINDS_KNOWN`) is told how it's minded, once a pack and mood ("The wolf's
  hackles are up: it'll come at you if you come on, or stay. Back away.", "The wolf's watching
  you, keeping its distance: waiting for you to weaken.", "The boar watches you warily, keeping
  off.", "The hart wants nothing to do with you.", "The wolf's curious about you. Feed it, and it
  may follow you.").
- **Making camp** (core/host.js `#camp`, `campRefusal`): a wary beast that means no harm just now
  (keeping away, fed, curious, its nerve gone, or a grazer only watching) doesn't keep a player
  from making camp, as one hostile near would. A hunter stalking them does: they're refused, and
  it strikes.

## Bait

Food thrown to the wild's beasts (`core/wary.js` `BAIT`, battle.js `toss`, `#forage`; core/host.js
`#use`): meat for the hunters, feed for the grazers (`WARY` `eats`: the boars, bears, badgers and
rats take either).
- **Meat bait** (`meatBait`, 3 gold: "Scraps of raw meat to throw to a hunting beast…") and a
  **feed bag** (`feedBag`, 2 gold: "A sack of apples and grain…"), sold at the taverns (the
  barkeep, the serving wenches, the innkeeper), the adventurers' guild and always by a pedlar on
  the road (*A stranger*: a healing draught, the meat bait and the feed bag always, and three
  more). Any meat carved from a beast (its `food` part: *What they leave*) does as meat bait.
- **Thrown** at the beast the player's named, set on or locked on, or the nearest they can see
  within 12 m that eats it (`#eaterNear`), landing a stride short of its feet; none, 5 m ahead of
  them. It's a throw like a blow, let go 0.4 s in (refused "Out of range" past 12 m, or in the
  middle of a blow or a spell); seen arcing through the air and lying on the ground where it lands
  (world/wild3d.js `BaitLook`: a bundle of raw meat, or a tied sack of feed with apples at its
  neck), heard landing (`baitLand`). From the pack ("Throw", or "Throw to a beast" for meat carved from one),
  from an enemy's wheel, or from the Action Bar (docs/GAME.md *The action wheel*). Lying uneaten,
  it's gone after a minute.
- **Eaten**: a wary beast that eats it, within 10 m of where it lands, goes to it and eats eight
  seconds (`eat`, heard: `beastEat`), its pack's to share (one bait feeds a pack); then it's fed
  (*Wary beasts*), leaving them be three minutes. One already coming for a player is drawn off
  them only a moment (`distract`, four seconds), and back after them, once for each bait thrown.

## Tamed beasts

A curious wary beast that can be tamed (`WARY` `tames`: the wolves, dire wolves, boars, bears,
pumas, badgers, wild bulls, harts, hyenas, jackals, Cape buffalo, jaguars, rock tuskers and the
porcupine) fed three times (`BAIT.tame`) by the player it's curious of, within its minute of
curiosity (each feeding starting it afresh), follows them ("tamed": core/host.js `#tame`; "The
wolf follows you now, fed and tamed: yours till it falls, or you let it go.", heard: synth.js
`tamedChime`).
- **Theirs** as a creature called by a spell is (a companion: `#companion`, `tamed`), fighting
  beside them, as hurt as it was, but for no while: till it falls or they let it go (Dismiss, in
  the party menu). One at a time: another tamed, the one before goes back to the wild. Never part
  of their might (core/might.js: companions never are).
- **Shown** down the party's side with a tawny rim (hud.js `PARTY_KINDS` `tamed`, styles.css
  `--tamed`), no time left under it.
- **Kept** with their character (characterOf's `followers`: `{ tamed, creature, tier, name }`;
  netplay.js `characterFrom`, one, of a kind that tames; app/save.js `loadFollowers`), and brought
  back with them when they join a world. Carried off by magic (Teleport, Word of Recall, Wizard's
  Walk, a summons, or to safety after they fall), where a creature called by a spell is lost, it
  finds them again as a companion left behind does (`#keepUp`).

## What lingers

Some creatures' blows leave something behind (`core/afflictions.js`; each attack's `afflict` in
`core/weapons.js` `NATURAL`: which, and how likely). Each hurts a little every so often, or
hinders, until it wears off; the one who did it is who brought down anyone it's the last of.
Struck again with it while it's on, it lasts from then (as strong as the stronger). The hurt each
time is as strong as the creature (its tier's power), so a far-out scorpion's venom is worse than
an adder's near home.

| Affliction | Lasts | Hurts | Besides | From | Cure (at the guild) |
| --- | --- | --- | --- | --- | --- |
| Envenomed | 12 s | 2 every 1.2 s | moving at three quarters' pace | a black widow's bite and pounce | Cure poison draught, 12 gold |
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
- **On the player's plate**, an icon for each (a venom drop with a skull in it, a black drop with
  a widow's red hourglass and two fangs over it, a pocked ball with
  flies, a cracked grey heart, a flame, a drop of blood, a web or roots or a snowflake for what's
  slowing them), on a blood-red disc ringed in its colour, darkening round as it wears off, the
  soonest over first (before the gold-rimmed sapphire tiles of what does them good, in one row:
  docs/MAGIC.md). Over the bars of anyone
  else with something on them, the same, smaller. The player's told when something takes hold
  ("You're poisoned!"), the first time with the cure and where it's sold, and when it's over.
- **On whoever has it:** venom's bubbles rising and green drips falling, and their skin tinged
  green (a widow's venom thicker and faster, darker in the skin); a sickness's flies circling and a yellow miasma; a curse's violet motes circling them,
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

## Their tracks

Each of the wild's creatures leaves a print on the ground where it sets a foot down, out in the
world (world/tracks3d.js; app/game.js `#printed`, from its avatar's footfalls, as they're heard),
so where they've been can be seen, and followed. Only what's drawn in full leaves them, and only
what has feet to leave them with: nothing that flies, floats or swarms (bats, rooks, wisps,
ghosts...), nothing on another map than the world's own.

- **As its feet are** (`printOf`, `PRINTS`): a dog's paw, four toes and their claws (the wolves,
  the hounds, the hyenas); a cat's, round and clawless (the puma, the jaguar, the chimera); a
  bear's broad one, five toes and long claws (the brown bear, the Nandi bear, the badger); a
  cloven hoof (whatever's hooved: the boar, the bull, the hart, the buffalo...); a drake's
  three-toed claw and its heel's spur (the drake, the wyverns, the Dreadthorn, the Behemoth's,
  huge); a lizard's splayed toes (the crocodile, the salamander, the basilisk...); a boot's sole
  and heel, its tread showing (the people-shaped: bandits, cultists...), or a bare foot (goblins,
  trolls, ogres, the dead...); a frog's webbed foot; a spider's or a centipede's eight pricks; a
  serpent's slither; a slime's smear. Each as big as the one leaving it (its gait's `size`).
- **Where each foot comes down** (`footAt`): a four-legged one's forefeet ahead of its middle and
  its hind behind, left and right either side; a two-legged one's either side; a serpent's or a
  slime's under it. Its toes the way it faces.
- **As deep as the ground takes it** (`TAKES`, by what's underfoot as it's heard: audio/
  footing.js): snow and mud deepest, then sand, bare earth and roads, grass and a wood's fallen
  leaves faint (and tall grass hides it), scree fainter still; none on stone, boards or in water.
- **Drawn** as the contact shadows under everyone are (world/contacts.js): darkening the ground,
  so right by day and by night, and fogged away with it; lying along the ground where it slopes.
  All of them one instanced quad, a single draw call: as many as 768 at once (`TRACKS.most`),
  the oldest let go for the newest. Each lies there three minutes (`lasts`), then fades over one
  more (`fade`). Their shapes are drawn once onto a canvas, a cell each (`printAtlas`).
- Only the player's own game draws them: nothing of them is the host's, and both ends of a game
  needn't agree on them.

## Dens

Out in the wild, where each kind's land is, the roaming beasts keep dens of their own (core/
dens.js; host.js `#dens`; world/dens3d.js; app/game.js `#denning`): seed 2 has 31.

- **The kinds** (`DENS`): a bear's den (8 a world at most), a boars' wallow (8), a puma's lair (6),
  a jaguar's lair (4, in the jungles), a wyverns' nest (5) and a knucker's hole (4). Each is kept by
  the mightiest of its kind round about, its master, and a few more of it (`with`): the boars a
  sounder of one to three more, the wyverns a mate, the rest one more at most or none.
- **Where** (`densOf`, laid out once from the world plan, after everything else and by a draw of
  its own, so nothing else moves): a cell of its kind's land, off the water and the roads, 260 m
  clear of the settlements' edges (`DEN.clear`), 4 cells from the sites, 5 from the camps and 10
  from each other; on the flattest ground within 48 m of its cell's middle (terrain/flats.js, as a
  camp's pitched), and only where that's level (no more than 1.2 m up or down 7 m out from it, a
  wyverns' nest 2.5 m, up on a crag); and only so far in as the land's nearly strong enough for
  what keeps it (two tiers short of its kind's least, from every people's start). The trees keep
  14 m clear round each (`DEN.ground`): a glade.
- **Its beasts** (`#dens`): put out once a player's within 90 m (`DEN.near`), kept to it
  (territorial), roaming 7 m; let go once every player's 180 m off (`DEN.far`). Its master a tier
  up on the rest and 1.6 times as hardy (`DEN.master`); the rest as strong as the den's tier from
  the home of the player nearest it (`denTier`, as a camp's, within its kind's tiers). More of them
  and tougher against a stronger side (*A side's strength*). Its master slain is gone 20 minutes
  (`DEN.back`), and one of the mightiest in the bestiary (5 points). If none could be put out (its
  ground not made yet), tried again the next step.
- **Seen** within 140 m (world/dens3d.js `DenProps`), each of a few plain shapes on the ground
  where it lies: a mound of earth with a dark mouth dug into it, boulders and bones (a bear's); a
  hollow of wet mud, the earth rooted up round it, a fallen log (a boars'); a flat-topped rock to
  lie up on, boulders and bones (a puma's or a jaguar's); a ring of heaped sticks round a hollow,
  eggs in it (a wyverns'); a dark still pool ringed with stones and reeds (a knucker's).
- **On the maps** as a lair's icon, rimmed as a beast's place: on the minimap near it, on the world
  map once found (or tracked). Its trails lead to it, as a camp's (*Tracking*).
- **In the bestiary**: among the homes its kind keeps to ("the bears' dens").
- **Kept** in a snapshot (`dens`, as the wild camps are: `SNAPSHOT_VERSION` 35, a world from before
  with none out).

## Shrines

The wayside shrines out in the land (the world plan's sites of kind "shrine": seed 2 has 26) are
each to one of the twelve gods (core/shrines.js; core/lore/gods.js `PANTHEON`): the Six of the
Hearth, whose temples are in the towns (theirs alone), and the Wild Six, the world's own gods,
worshipped only at the shrines:

| God | Of | Their gift at a shrine (`GIFTS`) |
| --- | --- | --- |
| Aurelia, the Dawnmother | life, health and vigour | *Aurelia's Dawn*: 20 more hit points, healing a sixth the stronger |
| Brannoc, the Red Horn | battle and the hunt | *The Red Horn*: blows and shots a twelfth the harder |
| Ithriel, the Veiled Star | magic | *A Thread of the Veil*: spells a sixth the harder |
| Morvaine, the Keeper of the Last Gate | death | *The Lantern's Ward*: a quarter of magic's harm kept off, armour 3% |
| Seliane, the Rose of Evening | love | *The Rose's Grace*: healing a quarter the stronger, breath back a quarter the faster |
| Dunmar, Anvilhand | crafts and trades | *Anvilhand's Mettle*: armour 6%, the shield's bash 15% |
| Tharos, the Thunderlord | the sky, storms and kings | *Thunder in the Hand*: stuns a fifth the more, blows a twentieth the harder, a quarter of the storm's harm kept off |
| Nerreth, the Deep-Caller | the sea and the rivers | *The Tide's Strength*: a quarter more breath, a third of water's harm kept off |
| Ceryn, the Harvest Mother | fields, flocks and plenty | *Harvest Plenty*: 15 more hit points, breath back a third the faster |
| Lunara, the Silver Lady | the moon, the night and the old stones | *Moonsight*: seeing in the dark as the night's creatures do, dodging 5% |
| Wick, the Wayfarer | roads, luck and clever hands | *Fortune's Wink*: dodging 6%, a quarter more gold found |
| Bacchar, the Merry Lord | wine, feasts and revels | *Revelry*: half as much breath again, blows 6% the harder, armour 2% the less |

- **Which god's** (`shrinesOf`): the twelve dealt out round the world's shrines in an order of its
  own (its seed's), so every god has two or three; the same every time.
- **Prayed at** (tapped, the player walks up to the space before its figure, as to a lectern; a
  `pray` command within `SHRINE.reach` 4 m of its heart: host.js `#pray`): its god's gift for half an
  hour (`SHRINE.ms`), a boon as a tavern's drink or a priest's blessing is (host.js `#outfit`: its
  share of each bonus; `darkSight` on the player's actor, battle.js `canSee`; `fortune` in what's
  found, `#fortune`). One god's at a time: a new one takes the place of another god's, but a drink
  and the priests' blessing go on with it. Each shrine answers each player once a world day
  (daytime.js `dayOf`: refused "The shrine has answered you today", `prayed`); kept in a
  snapshot (`SNAPSHOT_VERSION` 36). Told what it is and does, a healing's warmth heard, a burst of
  gold light about them.
- **A hint** (`rumoursNear`): the god shows them somewhere near the shrine they've still to find,
  the nearest: written in their journal under *Heard tell* as a crier's rumour is ("Shown at the
  shrine of Lunara"), in the same words but "of the shrine" (rumours.js `rumourWord` `from`), and
  circled on their map till it's found.
- **A sanctuary** (`SHRINE.sanctuary` 60 m round where it rests, sites.js `restingOf`:
  `sanctuaryAt`):
  - nothing hostile's put out in it (host.js `#putOut`);
  - the wild's creatures don't go after anyone in it, and those chasing give up at its edge
    (battle.js `haven`: as if beyond their leash), unless they've just been struck from it;
  - a camp's always made there, whatever's about (`campRefusal`);
  - a rest there cures the poisons, the sicknesses and the withering curse (`SHRINE.cures`:
    poisoned, envenomed, diseased, the pox, withered), told as each goes ("cured").

## Moon roads

The rings of standing stones out in the land (the world plan's sites of kind "standing stones":
seed 2 has 14) are Lunara's roads (core/rings.js; host.js `#ringStep`, `#walkMoonRoad`; app/game.js
`#ringEvent`, `openMoonRoads`, `#moonlit`).

- **Each ring's moon** (`ringsOf`): each ring bound to one of the moon's eight phases (`PHASES`, a
  world day each: daytime.js `MOON_DAYS`), dealt round them in an order of the world's own so each
  phase has one or two. A night's phase is the moon's at its sunset, held till sunrise
  (`phaseOfNight`).
- **Stood in**: once a player steps into a ring's middle (`RING.middle` 2.6 m of its heart, by its
  flat stone), its moon is theirs to know (core/explored.js `rings`, kept with what they've found):
  told the first time, the quill heard, and in the journal (*Moon roads*: tonight's moon, and each
  ring they've stood in with the moon it wakes under and where it is, those woken tonight edged).
- **By night** (stepping in each time: `inRing`):
  - **under most moons**, they're carried to the ring bound to tonight's (`moonRoad`: of two, the
    one they're not in, or the nearer), with the others of their party standing within its stones
    (`RING.round` 9.5 m) and each one's company (their followers, unless told to wait, and what's
    at their side), each set down in its middle (and not carried on from there till they step out
    and in again); told, a burst of moonlight where they come to (world/spellfx.js `moon`);
  - **under a full moon**, every ring's awake: the world map opens as the moon roads (the travel
    map's way: app/worldmap.js, main.js), showing the rings they've stood in with their moons; one
    tapped and agreed to ("Step into the moonlight"), they're carried there with their party in the
    ring (a `moonroad` command: refused if they're in no ring's middle or haven't stood in that one,
    or if it isn't a full moon);
  - **under a new moon**, the rings sleep: told so.
- **Seen** within 80 m by night while they're awake (world/moongates3d.js `MoonGates`): a pale circle
  of moonlight on the ground in each one's middle, where to step, and a soft light over it, both
  breathing slowly, the ring tonight's moon wakes (or every one, under a full moon) the brighter.
- **The full moon's trial** (`TRIAL`, `trialOf`; host.js `#moonTrials`, `#trialFell`): on each
  full-moon night one ring (by the night, the same every time) holds Lunara's guardian, the Pale
  Stag (a hart) or the Silver Wolf (a dire wolf), turn about each full moon: moon-touched, a
  champion "moon" (dungeons/play.js `CHAMPIONS`: four times as hardy, its blows a quarter again as
  hard; beasts/champions.js: bigger, pale as moonsilver, its eyes brighter), two tiers above the
  land there. Woken once a player's within 60 m, by its flat stone, a locked chest by it; let go,
  the chest with it, at daybreak or once every player's 140 m off. Slain, a share for each player
  there with a relic of moonsilver in it (progress.js `rollMoonsilver`: a legendary amulet or ring,
  "Moonsilver Torc of the Silver Lady"), and not woken again that night; one of the mightiest in the
  bestiary. Told to those near, as it wakes (the wake's chime) and as it falls; and under a full
  moon the journal says where it is tonight.
- **Kept** in a snapshot: each player's `inRing`, the trial out (`trials`): `SNAPSHOT_VERSION` 37.

## Tracking

The wild's camps, dens and perilous sites wear trails out into the country round them, as Monster
Hunter's tracks and a hexcrawl's spoor do: found and followed, sign by sign, a trail leads home
(core/tracks.js; host.js `#readSign`; app/game.js `#trailing`, `#signRead`).

- **The trails** (`trailsOf`, laid out once from the world plan, the same on every machine): each
  wild camp wears two (`TRAILS.camp`), each den two (`TRAILS.den`: *Dens*), each perilous site
  three (`TRAILS.lair`: the drake's and the Dreadthorns' lairs, the werewolves' den, the ruined
  castles, the Tower of Sar Mordal, and the cults' camps at the hells' ways in). Each starts 30 m out of its home (`from`) and winds on 170
  to 250 m (`length`) in 8 m steps (`step`), its way turned a little at each (`wander`) but drawn
  back to it, round the water and 25 m clear of the settlements (`clear`). One that can't get
  half as far as the shortest isn't worn. Seed 2 has 229, to 114 homes (61 of them to its dens).
- **What wore it** (`trailCreature`): a camp's folk, as strong as the camp is from the reader's
  home (as its folk are when met: creatures.js `campFolk`); a den's beasts; a lair's master on its first, its
  guards on the others, one kind after another (the drake, then wyverns).
- **Its signs** (`signs`): three along each, 92%, 60% and 28% of the way out (`TRAILS.signs`), the
  furthest first: what's to be found of what made it (core/lore/bestiary.js `sign`: a line of
  four-toed prints in single file, split-hoof prints and the earth rooted up...), and which way
  the trail runs home from there (`way`: "north-east", toward a point well back along it).
- **Seen** (world/signs3d.js `TrailSigns`) within 40 m: a patch of scuffed earth with a snapped
  stick across it, and over it, till it's read, a pale green glint that swells and fades, slower
  than a treasure's. Tapped (the pointer's hand over it), the player walks up and reads it
  (`#keepToSign`, as a lectern's read). Within 45 m, the trail's prints too (tracks3d.js
  `lookPrint`: as big as one of its kind's been seen, or as its look is), a stride apart, one
  foot then the other, their toes toward its home; fainter than fresh ones (`TRAIL_SEEN.depth`),
  as deep as the ground takes them, and lasting. Laid again once the player's gone 12 m on.
- **Read** (a "read" command, within `TRAILS.reach` 3 m of it, out in the world): told what made
  it, what it is and which way the trail runs, toward what ("toward a wolf pack's camp", `HOMES`),
  and how many of its home's signs they've read; the first time, the quill heard, and its maker
  the better known (core/bestiary.js `read`: 2 points). Read again, told again, nothing more.
- **Tracked**: three of a home's signs read (`TRAILS.tracked`: one trail followed to its end, or
  any three of its trails'), its home's tracked (core/explored.js `tracked`): told where it is,
  a pin's note heard, and marked on the minimap and the world map with a pale paw (app/mapicons.js
  `drawTracked`), on the world map whether it's been found or not.
- **In the journal** (Trails): a note for each home they've read signs toward, the latest first,
  those still to follow before those tracked: what made it, how many signs they've read, which
  way the last ran and where it is now; once tracked, that it is, and where.
- **Kept** with what they've found of the world (core/explored.js `signs`, `tracked`): in the
  save, and in a snapshot (`SNAPSHOT_VERSION` 34: a world from before, its players none read).

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
meet leaves only its gold and its parts (*What the more leave*, above). Any of them, of any tier,
leaves a Tome of Evaluate one time in forty (spoils.js `EVALUATE_DROP`; docs/MAGIC.md). The only way
to share what's found is to trade it (below).

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
  theirs undoes both players' agreeing: what's agreed to is what's there. What's offered is that
  very thing, whole: its make, level, boost, bonuses, name, people and effect (progress.js
  `heldAlike`, `removeAlike`; before levels, a trade passed on only a thing's kind and make).
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
catalog as the others are (`beast-ant`, `beast-centipede`, `beast-dungeon-spider`,
`beast-elite-dungeon-spider`, `beast-giant-cockroach`, `beast-dungeon-wasp`,
`beast-dungeon-scorpion`, `beast-ant-monster`), sized and paced
by measuring each model in a browser: how long and tall it stands idle, and how fast its feet go
back along the ground while planted.

- **The giant ant** (`ant`): drawn 1.5 m long, about as it's made, half a metre high; rearing to
  bite (its Attack clip); resting by looking about, drinking or rearing up. Its walk is 0.62 m/s
  as it's drawn, its run 1.55.
- **The great centipede** (`greatCentipede`): the centipede's model, made 6.7 m long, drawn 4. It's
  made standing 0.42 m above where it is, so it's sunk that far to the ground (`sink`, metres as
  it's made). Its fangs (Attack), or rearing to strike down (`rear`, a special: Attack 2); resting
  by looking about or eating; flinching and falling as its model does.
- **The dungeon spider** (`dungeonSpider`): made 1.43 m long, legs and all, drawn 1.8 m. It
  bites (Attack, Attack 5), springs (`leap`: Attack 2, rearing high and pouncing), and spits its
  web to slow whoever it's after (`web`: Attack 3, its forelegs flung out); it rests by rearing up
  or eating, and dies flipped over, its legs curled. Its walk is 0.54 m/s as it's drawn, its run
  1.07.
- **The elite dungeon spider** (`eliteDungeonSpider`): a model of its own, red and black, its
  markings glowing (its own emissive map), made 3 m long, drawn 2.8 m, sunk 0.09 m to the ground.
  It's the dungeon spider's elite (`elite`, `king`, as the Goblin King is the goblins'): it leads
  each pack of them. It bites (Attack) or lunges (Attack 3), brings its sting over (`sting`:
  Attack 2, its belly curled forward), and sprays its web from its spinnerets (`web`: Butt
  Attack). It rests by looking about or cowering; its model's only fall is its Explode, so it
  bursts apart as it dies. Its walk carries it as fast as it ever goes, 0.87 m/s as it's drawn: no
  run.
- **The giant cockroach** (`giantCockroach`): made 2.3 m long, feelers and all, drawn 2 m. Quick
  and in numbers: it bites (`Bite`, lunging head down, made for it), paws with its forelegs
  (Attack), or rears up to strike down (`rear`: Rear Strike, made for it); its bite may carry
  sickness. It rests by eating, feeling about or cleaning itself, and dies on its back, its legs
  twitching. Its walk is 0.96 m/s as it's drawn, its run 1.66.
- **The dungeon wasp** (`dungeonWasp`): made 0.8 m long, its abdomen curled under it, drawn 1.3
  m. It's made hovering over where it is, so it's drawn hanging about a metre over the ground
  there (though it's fought on the ground, as the bat and fly swarms are, within any blade's
  reach), and its falls drop it to the ground. It stings (Attack), jabs (Attack 2) or lunges
  (Attack 4), or dives in from above (`dive`: Attack 3), venomous; it rests hanging there, its
  sting out. Its flight carries it, its wings beating the faster the faster it goes; it makes no
  footfalls.
- **The dungeon scorpion** (`dungeonScorpion`): made 1.95 m long, its tail raised over its back,
  drawn 2.4 m; armoured. Its pincers thrust out or snapping (Attack, Attack 2, Attack 4), or its
  sting brought over its back (`sting`: Attack 3), staggering, venomous. It rests rearing up, its
  pincers raised; it flinches to its left, and dies flipped onto its back (Death 2). Its walk is a
  slow creep, 0.17 m/s as it's drawn; its run, 0.66, is what carries it after anyone.
- **The black widow** (`blackWidow`): made 1.79 m long, legs and all, drawn 2.2 m; its full detail
  only (its bristles don't simplify, so its model has no lower details: `detail: 1`). It rears up
  to bite (Attack), or pounces (`leap`: Attack 3, a leap of 1.7 m as it's made and back), each with
  a venom of its own (*Envenomed*, above: over three times poison's hurt, slowing). It rests
  shifting its legs, and dies flipped onto its back, its legs curled. Its walk is 0.68 m/s as it's
  drawn, its run 1.83.
  - **It lurks** (`creatures.js` `lurk`, `battle.js` `#lurk`): put out hanging unseen under the
    roof over where it stands, where its room's roof is highest, as far from the rock as it'll go,
    and never at the rock's edge, where the roof comes down (`place.js` `openestFirst`).
    While it lurks it's no one's enemy nor anyone its: nothing sets on it, no blow, spell or blast
    reaches it, no one bumps into it, and it isn't on the minimap. Once an enemy it can see (and
    has noticed: not Invisible) comes within 3.5 m of beneath it, it drops on its thread: 1.8 s
    coming down, stunned till it lands, then at them. It's told ("… drops on you from the dark
    above!") and heard.
  - **Drawn hanging** (`game.js` `#hanging`, `HANG`; `BeastAvatar.hang`): its middle 0.9 m under
    the rock over it (`caverns.js` `roof`: how high the rock closes over a point), never lower
    than 3.4 m (its lowest out of a blade's reach) nor higher than 6. Its model hangs and drops by
    its own clip (Web Ground: made hanging from a thread 6 m up and sliding down it, touching the
    ground and turning onto its feet; held from where it hangs that high, and played on from there
    over its drop: `model.js` `lurk`, `poseOf`); its thread runs up into the rock. Its stand-in
    hangs upside down under a thread of its own, let down on it and turned over onto its feet. While
    it's up there it's drawn wherever the camera looks (its culling sphere is round where it
    stands, not up there).
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
- `e2e/models.spec.js`: each drawn from its model, as long as it's drawn, the great centipede and
  the elite dungeon spider on the ground; the ant rolled over dead till the Ant Monster's read, then falling as it does.
  `test/model.test.js`: every clip and bone each names in its model, those the ant borrows (and the
  bones they're played on) in the Ant Monster's; the ant's poses before and after it's lent them.

**The Kaiju** (`beast-kaiju`: HuyKhoi2407's Kaiju, bought on Fab, 36 m long and 13 m tall) is the
Behemoth of the Rift in the game (*The Behemoth of the Rift*, below); the model viewer shows it
among the mightiest, and every clip as it was made (`?model=beast-kaiju`). Its Energy Breath is an
atomic breath (`beasts/beam.js`, `BEAMS`), as a kaiju's should be:

- **Charging** (0.3 s in to 1.3): the glow on its spines and body (its emissive map) lit from its
  tail's tip to its head, a bright crest running along it, turning from green to blue-white and
  brighter as it goes. Its material's a copy of the model's, its shader given how far along it
  each point is, from its tail's tip to its head as it was bound.
- **Aimed** at the ground in front of it, where what it fights would be: first 13 m in front of its
  mouth, raked on to 18 by the time it stops. Its neck and head are turned (each bone a share) so
  the way out of its jaws, halfway between them, meets it, from where the clip has them (whose own
  line hits 6 to 12 m out and wanders as its head bobs). Turned in as its jaws open, let go of as
  they shut, 35° at most.
- **Firing** (1.3 s to 4.6, its jaws wide open): a beam from between its lips to where it lands,
  shot out in a seventh of a second: a white-hot core in blue fire, thickening from 1.2 m to 2.2
  (its radius) and churning, pulses running out along it, light coiling round it and sparks
  running out along it; a flare at its mouth; and where it lands, a blinding flare 20 m across,
  billows of blue-white fire bursting up and out, sparks thrown up every way and on the way it was
  going, the ground lit 18 m round with rings of light running out over it and a track glowing
  where it's raked, and blue mist rolling off and lingering after it stops. Its glow is at its
  brightest, flickering with the beam, and its face is lit by it.
- **Timed by the clip's time,** nothing kept from one moment to the next: each spark and puff is
  where its age puts it, thrown up from where it landed when it was. So it's the same played,
  paused or stepped back and forth through, and costs little a frame (a few of its shaders' values
  set, its head turned, the ground looked along for where it lands), nothing at all in its other
  clips. Drawn as light added to what's behind it, by its own shaders (a draw call each part),
  never culled; no lights are added (that would have every material's shader compiled again).
- `e2e/model-viewer.spec.js`: nothing of it before it charges or in its other clips; charging,
  its glow lit; firing, aimed, its glow at its brightest, landing 10 to 20 m in front of its mouth,
  and the beam's blue-white drawn.
- **Its sounds** (`scripts/sounds/creatures.js`, `kaiju…`; heard in the game as the Behemoth of the
  Rift's, below, and in the model viewer as its clips play, at the moments measured from them:
  `beasts/sounds.js` `CLIP_SOUNDS`): all mixed from CC0
  recordings on OpenGameArt to sound like a kaiju. Its roar is a monster's snarls with a demon's
  held call and a troll's roar, slowed a little, its rumble taken off, 4.75 s, a rasp up to 4 kHz
  over a band near 250 Hz; in its Roar a short cry cut from them as its head goes up (its attack's,
  as its every move is in the game) and its roar as its jaws open wide. Struck, a short
  cry, higher; then it roars back. Its death is its roar slowed and dying away, then the crash of a
  great beast falling as it hits the ground, a footfall's thud with it. It growls now and then
  standing (a demon's growl slowed and muffled). Drawing breath, its snarls play backwards,
  swelling into an overload, loudest as it fires; its atomic breath is an explosion's blast, then a
  demon's growl roaring over a deep rumble and a slowed rocket, its snarls under it, into a second
  explosion over a deep boom as the beam stops. Each foot coming down, walking or running, is a
  sci-fi explosion's crack and a stomp, slowed, rolling away into a rumble, its thud as the foot
  is at its lowest. Each sound has two or three takes, played in turn. `test/clip-sounds.test.js`:
  each a recorded sound the game knows how loud to play and the sound studio describes, at a
  moment inside a clip its model has. `e2e/model-viewer.spec.js`: heard as its clips play, at
  those moments, none paused, and the Sound option turning them off and on.

### The Behemoth of the Rift (creatures.js `kaiju`, `COLOSSUS`; battle.js `#colossus`)

One of the great beasts of the other world, come through the rift outside the Tower of Sar Mordal.
Drawn from the Kaiju's model (`beasts/model.js` MODELS `kaiju`), 36 m long and 13 m tall, as
it's made; its stand-in till that's read is the Dreadthorn's body, wingless and twice as big
again, its spines glowing green (`beasts/looks.js`).

- **On no side but its own** (`RIFT`, host.js `#against`): everyone's enemy, the players', the
  soldiers', an invasion's raiders' and the wild's creatures', and everyone its.
- **Too vast to be moved**: never thrown, stunned, staggered, knocked down, frightened, slowed,
  calmed or made to falter by a spell; what burns, poisons or bleeds it takes hold.
- **Its body as wide as it's drawn.** Where it stands is under its hips, where its model's made
  standing (its hind feet 2.5 m before that, its fore feet 12). Its body's middle is 7 m before
  that, and the squares 6 m round it are its `footprint`, moved with it each step: whoever's after
  it closes to the nearest of them (as on a fortification's walls), not its middle.
- **Its own walk** (`#stride`, in place of a character's): turning no faster than 0.6 radians a
  second, toward the next corner of its way or to whom it's after, stepping on as it turns (more
  slowly the further it has to turn), through whoever's in its way. Walking, it treads on whoever's
  under it every 0.7 s: within 6.5 m of its body's middle, hurt and thrown aside (`tread`).
  Standing, it shifts its feet every 1.8 s on whoever's within 7.5 m of its body's middle (under it,
  or hard against it: `still`, `round`).
- **Whom it fights** (`#colossalTarget`, looked at again every second): of the enemies it sees
  within 90 m, standing, those within reach of its jaws first (as far from its body's middle as
  they land, 14 m); of them, the one with the most of their fellows within 6 m of them, those where
  its breath would land counting more. On its way it walks over whoever's at its feet.
- **Where it goes**: on to them till they're under its jaws (16 m before where it stands), then it
  stands its ground, turned to them, and never backs off. Its breath catches them as they come
  within its reach on the way.
- **Seen**, by night as by day, as far off as anyone looks (battle.js `canSee`): towering and aglow,
  and to the nearest of its body's squares, not where it stands. Whoever's after it is in a fight
  while they see its body as far as they reach, however far off where it stands is (`#inFight`):
  their weapons drawn, not put away. One under it strikes the square of it next to theirs
  (`#aimAt`).
- **Its moves** (`#colossalMove`; weapons.js `kaiju`; each no sooner than its `every` after the
  last), the first it's ready to make that would catch anyone:
  - **Its atomic breath** (every 12 s at most), when three or more stand where it would land, or
    all of them about with fewer left. Its Energy Breath plays: its glow charges for 1.3 s, then
    the beam's raked over the ground from 13 to 18 m before its mouth (its mouth 15.9 m before
    where it stands), over 3.3 s, the way it faces then. A blast every quarter of a second where it
    lands (`#rake`), 4 m round: whoever it catches hurt once a breath (18 to 28), burning half the
    time, and thrown back, away from it, up to 7.8 m. It's drawn by its beam (`beasts/beam.js`),
    aimed where the battle has it land.
  - **Its jaws slammed down** (every 5 s), 16 m before where it stands or 10 m (whichever catches
    more), 5 m round: 26 to 38, most of a soldier's 40. The start of its Roar, its head reared and
    brought down.
  - **Its roar** (every 18 s), once five or more are within 15 m of its body's middle: all of them
    thrown off their feet, its Roar played through its bellow.
  Each plays as much of its clip as the move lasts (MODELS `spans`), at the clip's own pace. Struck
  it flinches in the start of its Hit React; it falls in its Faint, held where it lies.
- **Heard** in the Kaiju's own sounds (*The Kaiju*, above; sound.js `CREATURE_VOICES` `kaiju`):
  its roar as it sets on someone (and twice, 450 m off, as it comes against a town), every move
  loudest as it lands, its cry struck, its death; its breath charging, loudest as it fires, and
  fired, heard 120 m off (app/game.js); each foot coming down as it walks, heard 80 m off
  (sound.js `GAITS` `colossal`); and falling, the crash of a great beast.
- **Seen**: its jaws slammed down and its roar shake the ground (spellfx.js `quake`: earth thrown up
  and dust rolling out, a shockwave for its roar, a little dust under its tread), and the camera
  within 60 m. Within 150 m of the player its name and strength are across the top of the screen
  (hud.js `boss`), and within 90 m the camera frames it, drawn back as far as it's tall and looking
  up at it (view.js `BIG_FOE` `colossal`). Its model's read the moment it comes, and it's drawn
  before anyone else, from its model at once.
- **Its spoils**: scales off its hide, a dorsal spine that still glows, and its heart (spoils.js).
- **Called up** before the player, 70 m off the way they face, by the debug overlay's *Behemoth of
  the Rift* (host.js `"rift"`).
- **Comes against a town** by night, now and then, in place of a band of raiders (WAR.md
  *Invasions*, *The Behemoth of the Rift*).
- `test/kaiju.test.js`: its breath raked over those where it lands, each hurt once and thrown away
  from it; its jaws, its roar, its tread, walking and standing; its walk on them till they're under
  its jaws, turning slowly, its body's squares with it, whoever's in its way brought down; never
  after anyone in a town it's come against; everyone's enemy, nothing that stuns, frightens or
  slows it taking hold.

### The Tower of Sar Mordal (creatures.js `riftling`, `riftStalker`, LAIRS `rift tower`)

The wizard Sinclair's tower, abandoned. Monsters from another world came through a rift he'd
opened and killed his wife; he followed them back through it and was never seen again. The rift's
still open beside his tower, and what comes through it keeps the place: the Behemoth of the Rift
among them, now and then, by night (WAR.md *The Behemoth of the Rift*).

- **One a world** (worldplan/settle.js `RIFT_TOWER`; WORLD.md *Sites*), out in the wild on bare,
  lonely land, far from every people's start. On the maps, a broken tower with the rift's green
  tear beside it (app/mapicons.js `riftTower`); the criers tell of it (core/rumours.js).
- **Outside** (setpieces/neutral.js `"rift tower"`, `RIFT_TOWER_LAID`): a tall tower, its top fallen
  in (15 to 19 m still standing, art/kits/neutral.js `brokenTower`), gone into by the dark doorway
  at its foot; to its east the rift, a ragged tear in the air 4 to 4.6 m tall, swirling green day
  and night (`riftTear`, veil.js `VEILS.rift`), lighting the land round it green after dark
  (lights.js `riftTear`); the bones of what came too near it about it.
- **Inside** (core/insides.js `RIFT_HALL`, `RIFT_STUDY`; world/interiors3d.js `riftHall`,
  `riftStudy`), two floors 12 m across. Below, his hall gone to ruin: his shelves of books, his long
  table with books left open on it, heaps of what's fallen, old bones and someone who died there,
  and the rift's green light seeping up through a crack across the floor. Above, his study, open
  to the sky: his shelves, his table, his lectern with his journal open on it, to be read there
  and kept (GAME.md *Writings*), and his hoard.
- **Kept** (`LAIRS`, `within`: host.js `#lairs`) once a player's within 100 m, back 40 minutes
  after it's slain. The rift stalker is in the study by the hoard (its chest locked while it
  lives, an old relic in it), with a riftling; two riftlings hold the hall; the rest prowl round
  the rift.
- **The riftlings** are the Behemoth's kind, a man's height: 46 hp, quick (3.6 m/s after someone),
  their jaws 6 to 11, laying a wound open 3 times in 10 (weapons.js `riftling`); they see in the
  dark, and their scales turn a tenth of every blow.
- **The rift stalker** leads them, half as big again: 150 hp, its scales turning a quarter of every
  blow, never staggered; its jaws 10 to 17, and the rift's green fire breathed from up to 7 m off
  every 6 s, 12 to 20, setting them alight 6 times in 10 (`riftFire`): a roaring green stream from
  its jaws (app/game.js `BREATHED`, effects.js `riftBreath`), heard as a drake's fire.
- **Drawn** from the Kaiju's own model, small (beasts/model.js `MODELS`, `rift`): a riftling 4.2 m
  long, a stalker 7, running as the Behemoth never does; their bite the start of its Roar, the
  stalker's breath its Energy Breath with no beam (`beam: false`), roaring as they rest. Till it's
  read, the Behemoth's stand-in, small and greener (beasts/looks.js).
- **Heard** in the Kaiju's own voice, higher (sound.js `CREATURE_VOICES`: a riftling's at 1.24, a
  stalker's at 1.12).
- **Their spoils**: riftlings' scales, and a rift-fire gland; a stalker's now and then a glowing
  dorsal spine as the Behemoth's (spoils.js).

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
adventurer, a soldier, or one of the folk in their role: CHARACTERS.md, *The motion check*; or
one of a band invading a town, or its chief: WAR.md, *Invasions*), or one of the things, and it's drawn as the game draws it. The things are a works' wagon and its ox
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
- **Person** (one of the people): of which people, a woman or a man, and, an adventurer, a
  soldier or an invader, with which weapon (an adventurer any a player may start with, or an
  orc's cleaver; a soldier their people's; an invader any of their band's, its chief their own,
  their band their people). **Wagon** (the ox's): its people's timber, and its load.
- **The game's moves,** each by name: a beast's attacks, its special ones and its ways of resting;
  a people-shaped one's weapon's attacks and its ways of resting (characters/actions.js); one of
  the people's every motion, as the motion check plays it (characters/motioncheck.js `motions`):
  their weapon's attacks, drawing and putting it away, their role's work and rests, the emotes,
  the spells, the blows and dodges, and the falls.
- **Clips in its model:** drawn from a model (the Dreadthorn), every clip in its file by name and
  length, played alone as it was made (`modelBody`'s `hold`), and slid through. One built in code
  has none: its moves are worked out as it plays. The Kaiju breathes its beam in its Energy Breath
  (*The Kaiju*, above); `window.lab.breath()` says what it's doing.
- **Sound** (on the playback bar, 🔊 on a phone, shown only with something that makes any): what
  its clips sound like (the Kaiju's: *The Kaiju*, above), as the game plays sounds
  (`audio/sound.js`), its recordings downloaded once it's shown, heard from the first click or key
  press (as browsers want). Heard as a clip plays on, slower or faster as it's played (but not
  slower than half speed), and stopped when it's paused, stepped through or does something else;
  off, nothing. `window.lab.heard()` lists what its clips have asked to be heard, and when.
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
