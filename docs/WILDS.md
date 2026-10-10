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
(their fire, venom, webs and roots, and what shows on whoever they hit). The creature lab
(`creature-lab.html`) shows every one, doing everything it does.

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
| Will-o'-wisp | 22 | aggressive | 1–2 | 1–7 | the elves' wilds only |
| Blighted treant | 80 | territorial | 1 | 4–9 | the elves' wilds only |
| Cave spider | 24 | territorial | 1–4 | 1–7 | the dark elves' wilds only |
| Shadow stalker | 50 | aggressive | 1 | 4–9 | the dark elves' wilds only |
| Hyena | 22 | aggressive | 2–5 | 1–7 | the cat folk's wilds only |
| Sand scorpion | 30 | territorial | 1–2 | 1–7 | the cat folk's wilds only |
| Bog frog | 28 | territorial | 1–2 | 1–6 | the lizard folk's wilds only |
| Marsh crocodile | 60 | territorial | 1 | 3–8 | the lizard folk's wilds only |
| Magma slime | 45 | territorial | 1–2 | 1–8 | the orcs' wilds only |
| Rock tusker | 80 | territorial | 1 | 4–9 | the orcs' wilds only |
| Restless ghost | 26 | aggressive | 1–2 | 3–9 | the ruins, ruined castles and graveyards, with their dead |
| Wraith | 46 | aggressive | 1 | 5–10 | the ruins and ruined castles, with their dead |
| Dragon | 90 | aggressive | 1 | 10 | the dragon's lair |
| Wight lord | 70 | aggressive | 1 | 9–10 | the ruined castles |
| Frost troll | 75 | aggressive | 1 | 9–10 | the high snows |

A few do something besides biting and clawing: the adder, bog frog and magma slime spit (venom,
venom, lava), the will-o'-wisp looses bolts of light, the treant calls up roots, the cave spider
spits webs, the dragon breathes fire, the wight lord lays a curse, a ghost wails (staggering
whoever it reaches) and a wraith draws the life out of whoever it holds its hand out to (each flies
as a projectile). A ghost's touch is the grave's cold, slowing; a wraith's claws wither.
The bog frog's tongue reaches two squares off. The rock tusker's charge knocks whoever it catches
off their feet (below). Many leave something lingering: poison, a sickness, a curse, fire, a
bleeding wound, a web or roots holding them (below: "What lingers").

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
thrown as anyone is; never the heavy or the unsolid (bats, bears, trolls, ogres, wyverns, wisps,
treants, crocodiles, rock tuskers, dragons, ghosts, wraiths, frost trolls: creatures.js
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

The perilous places hold the mightiest, each a master and its guards (`LAIRS`): the dragon at the
dragon's lair, a wight lord and its dead in each ruined castle (three skeletons, two ghosts and a
wraith), the frost troll in the snows. The ghosts and wraiths are found nowhere else but with the
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

The host keeps about four creatures (`WILDS.count`; five after dark) within 60 m of each group
out in the world (of any of its players), put out about its leader (their party's leader, if
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
That the players together are one group, one roll for an elite and one cache between them changed
the rules every game plays by (`NET_VERSION` 104).

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
  alone.
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
  leader too), their leader two tiers above the rest (`CACHES.lead`). Hard to beat alone.
- **How they keep it.** Their leader stands by the cache; the rest walk a round seven metres about
  it, six stops spread round it (`roundOf`), each starting at its own and standing a moment (1.5 to
  3.5 s) at each before walking on to the next (`wild.round`, battle.js `#wild`). Each goes for
  anyone who comes within 8 m of them (`CACHES.guard`), and they're one pack, so strike one and the
  rest who see it come too.
- **Its chest** is the places' chest (drawn by `world/drops3d.js`), locked while any of them stands
  ("It's locked fast, and those keeping it are still about."). Once the last falls it opens, a share
  for each player within 39 m of it, theirs alone to take (`rollCache`): 20 to 45 gold, 35% more for
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
  will-o'-wisps, the black shuck and the shadow stalkers are out only after dark (from half through
  the dusk to half through the dawn, when the guards' torches are lit). At daybreak those out of
  everyone's sight (30 m or more from every player) and not fighting go to ground (let go); none are
  put out by day. The skeletons of the undead camps and the ruined castles are always there.
- **The night's hunters** (`night: "more"`): wolves, dire wolves, pumas, hyenas, sand scorpions and
  cultists are met twice as often after dark, and the night's own three times (`NIGHT_WEIGHT`).
- **More of them:** after dark the host keeps one more (`WILDS.night`) about each player out in
  the world, five in all.
- **Seeing in the dark** (`darkSight`): out of the light everyone sees less far at night (a third
  to a half as far: docs/GAME.md, *Seeing at night*), but the night's own, the wolves, the big
  cats, the hyenas, the cave spiders and the wight lord see as far as by day. So out in the dark
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
  the rock tusker's charge, 1.5 s) stuns them for that long. They fall (quicker than a death), lie
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
| Poisoned | 9 s | 1 every 1.5 s | | adder, bog frog (spit), wyvern and scorpion stings, cave spider's bite | Cure poison draught, 12 gold |
| Diseased | 45 s | 1 every 5 s | stamina comes back at 40% | rats, bats, hyenas, skeletons, boggarts | Cure disease draught, 18 gold |
| Withered | 20 s | 1 every 2.5 s | healing takes half as well | the wight lord's curse, the black shuck's bite, a wraith's claws and draining | Invigorating draught, 22 gold |
| Burning | 4 s | 1 every 0.8 s | | the dragon's fire, a magma slime's lava and slam | Burn salve, 8 gold |
| Bleeding | 10 s | 1 every 2 s | | wolves, boars, bears, pumas, crocodiles, the dragon's bite... | Bandage, 5 gold |
| Slowed | 5 s | | moving at half pace | a spider's web, a treant's roots, a frost troll's club, a ghost's touch | Quickening draught, 10 gold |

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

**The creatures' own attacks.** Fire's breathed in a roaring stream from the dragon's jaws to
whoever it's at, smoke rolling off it; venom and lava are spat in an arc and splash where they
land (spattering sparks and smoke, for lava); a web's thrown and bursts; roots burrow along the
ground and break it up at their feet; a curse bursts in shadow; a ghost's wail flies pale and
swirling, a wraith's draining green and dark, bursting in shadow. What doesn't bleed red spills its
own when struck: a slime's gel, a spider's or scorpion's ichor, a treant's sap, a skeleton's and a
wight lord's bone chips, a rock tusker's stone chips, lava from a magma slime, shadow from a
black shuck or a shadow stalker or a wraith, a ghost's pale motes.

## What they leave

A creature brought down may leave something: its parts (a wolf's pelt and fangs, a boar's tusks
and meat, a wyvern's scales and sting, a dragon's scales, fangs and heart), and the people-shaped
ones a little gold and gear (`core/spoils.js`). Every player within 30 m when it falls finds their
own bundle on it, rolled for them alone: a leather sack where it fell, seen only by them, there
for five minutes to tap and take (what doesn't fit in the pack stays in the sack). Nothing's
certain: each thing has its chance, a little better for each tier the creature's above its least,
and gold's as much more as the creature's stronger. The only way to share what's found is to trade
it (below).

The parts are worth what the adventurers' guild pays for them (only the guild buys them; other
shops have no use for them): a couple of gold for a rat's tail near home, a few for a wolf's pelt,
fifteen or so for a bear's, sixty for a dragon's scale and two hundred and fifty for its heart. So
a creature near home is worth a gold piece or two a kill on average (often nothing), a bear a dozen,
and a dragon a fortune. Some are good to eat or drink: boar, bear and frog meat heal, troll's blood
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

Every creature's made in code (no models downloaded), from its look (`beasts/looks.js`), on one of
a few bodies (`beasts/beast.js BUILDERS`). Each of a kind is a little different: a little bigger or
smaller, its colour a little different, its markings its own.

- **Sculpted in one piece** (`sculpt.js`). A body's shapes (ellipsoids, and limbs that taper from
  one width to another) are blended into one surface where they meet, as clay would be, and
  turned into a mesh (surface nets, fine enough for about 4200 points), coloured from its shapes
  with fur, scales, bark or stone in its grain and its belly paler, and bound to its bones (each
  point to the nearest few, weighted by distance) so it bends where they do. The rest of its
  pieces (claws, teeth, horns, quills) are folded into a few meshes on the same bones (`fold`),
  so a creature's two to eight things to draw, 12,000 to 21,000 triangles. Both are made once
  for each of a kind's three looks and shared by every one of it after.
- **Four-legged** (`quadruped.js`): a deep chest, a waist and haunch (sloping down behind for a
  hyena); a neck and head with a muzzle and jaw, or a cat's short face with whisker pads and
  whiskers, or a crocodile's long flat jaws with rows of teeth and its eyes and nostrils raised on
  top; ears of their kind; brows, horns, a cheek frill of spikes. Legs of three bones: a dog's on
  its toes; a bear's pillars in front and flat-footed behind, with long claws; a crocodile's
  sprawling out to the sides, swung round forward and back as it walks while its body and tail
  sway; a dragon's with great hooked talons. Tails from a dog's brush (slim at the root, full,
  drawn to a point) to a cat's long hanging curve, a crocodile's deep flattened one with its double
  ridge of scutes, and a dragon's spade. Wings as a bat's: an upper arm and forearm, three long
  fingers fanning from the wrist, skin stretched between them and back to the flank (a mesh of its
  own bound to the finger bones either side, so it stretches as they spread), folded along the
  flank at rest and beating when it runs or strikes. It flies too (`fly`): legs tucked up under
  it, neck stretched out ahead and head level, tail streaming behind, wings spread wide, beating
  (slower the bigger they are) or held out to glide, rising a little with each downstroke; so
  wyverns and the dragon are seen in the air near where they hunt and come down out of the sky to
  fight (GAME.md, *What flies*). The creature lab's Fly and Land show it.
- **Eight-legged** (`arachnid.js`): each leg reaches for its own place on the ground, spread round
  the body like the spokes of a wheel so none crosses another or the body, and bends its two bones
  to reach it each moment (knee up); walking, the feet stay planted as the body goes over them,
  then step forward, four at a time.
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
  it walks, kept out of its legs, its hem torn. A treant's crown is boughs forking into branches
  and twigs, sparse leaves at their tips.
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
  turns slowly; dying, it collapses into its empty robe, its lights going out. A ghost is four
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
  sculpting where the first had got to. One made all at once meanwhile (the creature lab) ends
  the steps.
- **The same:** a body made a step at a time is byte for byte what it was made all at once.
- **Where:** creatures coming into view (`dressingCreature`, as the game draws the wild's), and a
  wyvern or the dragon before it comes into the sky (GAME.md, *What flies*). The creature lab
  builds at once.
- **Folding** a creature's pieces gathers their points into arrays made once, counted first,
  rather than grown a number at a time: a skeleton's or the wight lord's first build, mostly
  folding, went from 54 to 102 ms to 17 to 47 (in Node).

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
