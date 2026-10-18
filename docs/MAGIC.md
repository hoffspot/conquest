# Magic

Spells are cast rather than struck: each takes a moment in the caster's raised hands, then lands.
Magic is in schools: Healing, and the four elements (Fire, Earth, Air and Water), each growing
with use from a weak first spell to a seventh (fifth, for Healing) that fills the screen. Besides
the schools there are the Hexes (a skill's), and the spells learnt from tomes: wards and cures,
and wonders (raising the dead, calling creatures and friends, going anywhere in a moment, being
unseen). This covers them all: what each does, how they grow, where tomes come from, what the
host does for the wonders, and how each looks.

The code: `client/js/core/spells.js` (every spell), `core/battle.js` (casting and landing: `cast`,
`#land`, and what lasts on someone: `buff`), `core/host.js` (the wonders, and the schools' and
spells' growing), `core/progress.js` (what's known, the tomes as things, wands' and grimoires'
boost), `core/spoils.js` and `core/standing.js` (tomes found and given), `core/goods.js` (spell scrolls), `app/spellbook.js` (the
spellbook), `app/spellicons.js` (each spell's icon), `app/game.js` (a spell cast and landing in
play) and `world/spellfx.js` (how each looks).

## The schools

Everyone can cast Vigor, Healing's first spell, from the start. Each element's school opens with
its first spell, learnt from its tome (the Tome of Burn, of Rumble, of Hurt, of Blister: spells.js
`ELEMENT_TOMES`), sold at every adventurers' guild for 25 gold (`ELEMENT_TOME_PRICE`); until
then none of its spells can be cast, and it doesn't grow. A character kept from before the
elements' tomes has every element open, as it had (app/save.js `PROGRESS_FORMAT`). A school
grows by its spells that land: each
brings it `SPELL_XP` (8) experience for each tier of the spell (a tier 5 spell five times what a
tier 1 does), and at each tier's experience the school's next spell comes (said, and put in the
spellbook to be put on a wheel). Each tier's spell is stronger, slower to cast and slower to come
round again; the experience needed grows about twice over each tier.

| Tier | Experience | Healing | Fire | Earth | Air | Water |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | Vigor | Burn | Rumble | Hurt | Blister |
| 2 | 150 | Mend Wounds | Fireball | Stone Crush | Dustgust | Waterbolt |
| 3 | 700 | Detraumatize | Burstflame | Shatterstone | Shockbolt | Steamblast |
| 4 | 2000 | Renewal | Immolate | Engulf | Lightning | Bloodboil |
| 5 | 5000 | Astral Heal | Flamefill | Earthquake | Thunderbolt | Iceblade |
| 6 | 11000 | | Inferno | Acidify | Tornado | Putrify |
| 7 | 24000 | | Hellfire | Disintegrate | Ionize | Absolute Zero |

**Casting.** A spell is cast on someone (`target`): an enemy in reach and sight (the elements, the
hexes, Fear, Polymorph, Pacify, Vampirism, Poison), anyone (the heals and cures, friend or foe: a
heal never starts a fight), oneself or a friend (the wards, Inertial Barrier), oneself, one fallen
(Zombify), someone to summon, or a place (Wizard's Walk). A spell cast on someone reaches 16 m
(`SPELL_REACH`: across a street or a clearing), an attack spell 2 m more from its third tier and
2 m more again from its sixth, the hexes and Fear 18 m; twice what they did, at the player's
asking ("The range of ranged spells like vigor and hurt seems too short"). That's further than
most are seen from (`SIGHT`, 12 m), so its caster sees as far as it reaches, with nothing in
the way (out in the world at night, only as far as the light lets them). Casting stands still
and calls off a blow that hasn't landed; being stunned, knocked down or struck down calls off the
spell. Each spell has its own cooldown, and after casting any, none can be cast for a second
(`SPELL_COOLDOWN`). One that can't be cast says why (`CAST_FAILURES`: "Not ready yet", "Out of
reach", "Needs a wand in hand", "Nothing there for it to cure"...), and nothing happens.

**How strong.** An attack spell's damage is rolled evenly from its least to its most, times the
caster's spell power (the Magic skill's bonus, and a wand's or grimoire's boost); a heal's, times
their healing power (the Healing skill's). Healing restores less than damage is dealt, tier for
tier: the first tier of either is weak, as a new adventurer is.

### Healing

On anyone at all, friend, neutral or foe: it never counts as an attack.

| Spell | Casts in | Cooldown | Heals | Also |
| --- | --- | --- | --- | --- |
| Vigor | 500 ms | 4 s | 8–12 | |
| Mend Wounds | 700 ms | 12 s | 16–24 | |
| Detraumatize | 900 ms | 24 s | 28–40 | stops bleeding |
| Renewal | 1100 ms | 45 s | 45–65 | ends bleeding, poison (and a black widow's venom) and disease |
| Astral Heal | 1400 ms | 3 min | all | ends everything lingering |

Each heal past Vigor heals more at once, for an emergency, but over a fight no more than Vigor does
on its own (about 2.2 hit points a second; Mend Wounds 1.6, Detraumatize 1.5, Renewal 1.3, Astral
Heal 0.5, for one of 70 hit points): all of them cast in turn heal about 6.7 a second, three times
Vigor (they were 12.3, five and a half times, with cooldowns of 6, 9, 14 and 45 seconds). So three
creatures set on someone together aren't beaten by healing alone, but by fighting them, stunning
one and healing between: in the battle's own play, three of a player's own tier killed a player
who only fought and healed more often than not by the middle of the game, and almost never one
who stunned one of them as well (`Stun`'s 3 seconds every 3, as it was then, could hold one of
three out of it; it's every 5 now, the user: "Add increasing stun cooldown by two seconds").

### The elements

Each on an enemy within 8 metres (9 from the third tier, 10 from the sixth) and in sight. "Round
them" is every enemy of the caster's within so many metres of whoever it's cast on; a chain leaps
on to the next nearest enemy within 3 metres, so many times, each hit weaker.

| Spell | Tier | Casts in | Cooldown | Damage | Does |
| --- | --- | --- | --- | --- | --- |
| Burn | 1 | 450 ms | 2.5 s | 9–15 | may set them burning (1 in 5) |
| Fireball | 2 | 600 ms | 3.5 s | 12–18 | may set them burning (3 in 10) |
| Burstflame | 3 | 700 ms | 5 s | 16–24 | round them (1.5 m), may set them burning |
| Immolate | 4 | 800 ms | 7 s | 20–30 | sets them burning |
| Flamefill | 5 | 900 ms | 9 s | 26–38 | round them (2.2 m); fire on the ground there, 5 s |
| Inferno | 6 | 1000 ms | 12 s | 34–50 | round them (3 m), staggering |
| Hellfire | 7 | 1200 ms | 16 s | 44–62 | round them (4 m), all burning and thrown down; fire on the ground, 6 s |
| Rumble | 1 | 450 ms | 2.5 s | 9–15 | may slow them (rubble) |
| Stone Crush | 2 | 600 ms | 3.5 s | 12–18 | staggers them |
| Shatterstone | 3 | 700 ms | 5 s | 16–24 | round them (1.5 m), may make them bleed |
| Engulf | 4 | 800 ms | 7 s | 20–30 | the earth holds them back (slowed) |
| Earthquake | 5 | 900 ms | 9 s | 26–38 | round them (3 m), all thrown down |
| Acidify | 6 | 1000 ms | 12 s | 34–50 | round them (2 m), poisoned; acid on the ground, 5 s |
| Disintegrate | 7 | 1200 ms | 16 s | 48–66 | round them (1.5 m), staggering |
| Hurt | 1 | 400 ms | 2.5 s | 9–15 | |
| Dustgust | 2 | 550 ms | 3.5 s | 12–18 | may blind them a moment (stunned) |
| Shockbolt | 3 | 600 ms | 5 s | 16–24 | may stun them |
| Lightning | 4 | 700 ms | 7 s | 20–30 | leaps on to two more |
| Thunderbolt | 5 | 900 ms | 9 s | 26–38 | throws them down |
| Tornado | 6 | 1000 ms | 12 s | 34–50 | round them (3 m), all tossed (stunned) |
| Ionize | 7 | 1200 ms | 16 s | 44–62 | round them (2 m), leaps on to four more, all stunned |
| Blister | 1 | 450 ms | 2.5 s | 9–15 | may scald them (burning) |
| Waterbolt | 2 | 600 ms | 3.5 s | 12–18 | sends them reeling (staggered) |
| Steamblast | 3 | 700 ms | 5 s | 16–24 | round them (1.5 m), may scald them |
| Bloodboil | 4 | 800 ms | 7 s | 20–30 | they bleed |
| Iceblade | 5 | 900 ms | 9 s | 26–38 | chills them (slowed, frost) |
| Putrify | 6 | 1000 ms | 12 s | 34–50 | round them (2 m), all sickened; rot on the ground, 6 s |
| Absolute Zero | 7 | 1200 ms | 16 s | 44–62 | round them (3 m), all frozen solid (stunned), then slowed |

What they leave on the ground (battle.js `HAZARDS`) hurts every enemy of the caster's standing in
it, now and then, a share of the spell's damage, and may set on them what it is (fire burning,
acid poisoning, rot sickening); still only the enemies of the side the caster was on once they've
gone (a player who's left the game), never their friends or allies. Creatures' spit leaves pools
too: lava, venom.

Nothing round them, leaping on, or left on the ground ever touches the caster, their own people
(soldiers, other players of their people, their followers, what they've called or raised), the
folk, anyone they've calmed (Pacify), or a people allied to theirs or at peace with it: only
enemies (battle.js `hostile`). Players of two peoples at war are enemies (WAR.md), so their spells
strike each other's.

### Hexes

The Hexes skill's (core/progress.js): **Stun** (an enemy within 9 metres, 400 ms, a 5 s
cooldown: it can't move, fight, cast or think for 3 seconds, and turns on whoever did it) and,
once the skill brings it, **Hold** (600 ms, 6 s cooldown, 6 seconds).

### Prismatic Destruction

A reason to practise all four elements (core/prismatic.js, kept on the player's battle actor,
`prism`, so every copy of the world sees the same; healing and hexes have no part in it):

- **A chain.** An element's first spell landing starts a chain of it; each of its spells after
  that, in order, landing within **10 seconds** of the one before, carries it on, and makes
  every attack spell the player casts **5% stronger** for each spell of it past the first (the
  spell that carries it on included: its own share goes with it). So Burn, Fireball, Burstflame
  and Immolate in turn: Immolate, and every attack spell after it, 15% stronger. Anything cast out
  of order (another element's spell mid-chain, a lower or skipped one, a hex, a heal, a blow) is
  let be: it neither counts nor breaks it.
- **A piece of the sigil.** The element's last spell (its seventh) landing in its chain, with all
  its spells learnt and cast in order, earns that element's piece of the **Prismatic sigil**:
  the chain's 5% stacks give way to the piece's own **25%**, kept as long as the sigil lasts.
  Then another element whose piece isn't held, from its first spell, within the same 10 seconds
  of the last; a piece already held can't be earned again. The bonuses add: two pieces and three
  spells up a third element's chain, 60%.
- **A piece spent at once.** A piece just earned, the sigil can be spent there and then on that
  element's Prismatic spell, **Prismatic Fire, Earth, Air or Water** (`prismaticFire` and the
  rest; `ELEMENT_SPELLS`, `sigilSpell`), till the next element's first spell lands (or the 10
  seconds run out). No one learns them, nor can they be put on a wheel; each is cast like
  Prismatic Destruction (from the sigil, on the enemy the player's set to fight, within 20
  metres, 1.5 s to cast), a quarter of it: on them and every enemy of the caster's within **4
  metres**, past wards, charms, cover, shields, dodging and Reflect, never a friend, each loses a
  **quarter of their whole health** (the mightiest, three sixteenths: a quarter of what
  Prismatic Destruction takes from them), or as much as the element's last spell (Hellfire,
  Disintegrate, Ionize, Absolute Zero) would deal them with the chain's strength, whichever's
  more (`PRISMATIC.share`). All are thrown down (1.5 s), and more, each its element's way:
  - **Fire:** set burning, and the ground round them left aflame (4 metres, 6 seconds);
  - **Earth:** kept down twice as long (3 s);
  - **Air:** stunned (1.5 s), and it leaps on to four more beyond, each within 3 metres of the
    last (the first from whichever of those it struck is nearest), each leap a fifth less;
  - **Water:** frozen solid (3 s), then slowed.

  Cast, the sigil's spent, every stack and piece with it, as Prismatic Destruction spends it. (A
  spell of the sigil begun in time lands with it, though its time runs out as it's cast.) The
  fourth piece makes the sigil whole instead: Prismatic Destruction, not the fourth element's.
- **The sigil whole.** The fourth piece makes it whole: every attack spell **twice as strong**
  (four pieces, 100%), and **15 seconds** to cast Prismatic Destruction, the 10 seconds no longer
  counting.
- **Broken.** The next spell not landing in time (10 seconds; or the whole sigil not cast in 15)
  loses everything: every stack and every piece.
- **Prismatic Destruction** (`prismatic`: no one learns it, nor can it be put on a wheel; cast
  from the sigil, on the enemy the player's set to fight, within 20 metres, 1.5 s to cast): on
  them and every enemy of the caster's within **8 metres** of them, past wards, charms, cover,
  shields, dodging and Reflect, never a friend. It kills them outright, all but the mightiest
  (`mighty`: a dungeon's boss or a hell's level's master, an elite, one of the perilous places'
  own, a seat's ruler, a player), who lose **three quarters of their whole health** (and die, if that's all they had);
  all of them are thrown down. Cast, the sigil's spent: every stack and piece with it.

On screen (app/game.js; app/sigil.js): while a chain's live, a quick action holding a spell of an
element it goes on with (the element being cast up through; between chains, any whose piece isn't
held) shows the chain's next spell of it instead, if the player knows it, rolled in like a flick,
ringed in the element's colour with a dashed border marching round it, pulsing; what the player's
put there is kept, and shown again as the chain moves on. The **sigil** stands over the player's
card (beside it, on a phone on its side): a petal for each element (fire, earth, air and water,
from the top round), the element being cast up through glowing and filling as it climbs, each
piece held lit whole; a ring round it running down the time left (red in its last 30%); how much
stronger every attack spell is under it. Whole, its heart's a white star and it pulses: tapped
(or clicked), Prismatic Destruction's cast. Each spell of a chain is a glass bell, higher as it
climbs; a piece, a run of them; the sigil whole, a run up two octaves; broken or faded, the bells
falling (audio/catalog.js, "The Prismatic sigil"), each said in a message too. A piece just
earned, the sigil pulses in that element's colour, its petal the brightest and its heart a star
of that colour: tapped, that element's Prismatic spell is cast, as its element's greatest spells
are cast and land, a glass chord rung over its landing.

(`SNAPSHOT_VERSION` 29: every actor's chain, none in a world kept before, and a seat's ruler told
as one, `ruler`; `NET_VERSION` 123: both ends of a game must agree on every chain, and on what
Prismatic Destruction does; 127: and on the piece just earned, `piece`, and what the elements'
Prismatic spells do. A chain kept before it has no piece to spend on its own.)

## Wands and grimoires

A wand or a grimoire in hand makes spells stronger by its boost, rolled when it's made (bought,
found): a whole percent from 10 to 100, the weaker common and the strongest very rare
(progress.js `BOOSTS`). It's shown with it ("Wand (+34% spells)"), stacks only with others as
strong, and is worth the more the more it boosts. A new character's starts at 12%.

| Boost | How likely |
| --- | --- |
| 10–20% | 40 in 100 |
| 20–30% | 25 |
| 30–40% | 15 |
| 40–60% | 10 |
| 60–80% | 6 |
| 80–90% | 3 |
| 90–100% | 1 |

Some tomes' spells need one in hand: Reflect and Wizard's Walk a wand, Zombify and Word of Recall
a grimoire.

## Tomes

The spells that aren't a school's are learnt from tomes (a tome is a thing in the pack: used, its
spell's learnt, and it's gone; a tome of a spell already known can be sold). Each is as rare as
its spell is (`TOME_RARITY`): common ones found ten times as often as the rare, and worth 60,
120 or 300 gold to the adventurers' guild, an occult scriptorium and the Mystic Emporium, which
buy them (docs/WAR.md *Shops*), and shown in the colour of a make as rare (progress.js
`TOME_GRADE`: a common tome's fine, an uncommon one's masterwork, a rare one's rare). An occult
scriptorium sells them among its scrolls, as does the Mystic Emporium the rare; and now and then
the Mystic Emporium has the Tome of Explosion in as its daily special, as if it were of the
rarest (`SHOPS.emporium.daily.specials`: about one day in ten). (The elements' first spells'
tomes, above, are the guild's to sell, never found or given.)

- **Found**: on those with hands (bandits, goblins, skeletons, draugar, cultists, trolls, ogres,
  boggarts, the wight lord, the frost troll: creatures.js `hands`) who've been about the wilds a while:
  from tier 4, 3 in 100 of them, half a percent likelier each tier beyond; one of the perilous
  places' own, 1 in 5 (spoils.js `TOME_DROP`).
- **Given**: by the adventurers' guilds for their harder work, from their libraries: breaking up a
  camp always pays a tome besides its gold, a bounty about a third of the time (standing.js
  `GUILD_TOMES`). The contract says which.

| Spell | Rarity | On | Casts in | Cooldown | Does |
| --- | --- | --- | --- | --- | --- |
| Resist Fire, Water, Air, Earth | common | oneself or a friend | 700 ms | 15 s | an hour (`WARDING`; five minutes till the user had it an hour: `NET_VERSION` 86): 30% less from that element's spells and creatures' blows, and what it sets on them ends sooner |
| Resist Magic | common | oneself or a friend | 700 ms | 15 s | an hour: 30% less from every spell, curses and wisps' bolts; hexes hold less long |
| Resist Poison, Disease | common | oneself or a friend | 700 ms | 15 s | an hour: poison and a black widow's venom (or disease) hurt 30% less and end sooner |
| Cure Poison, Cure Disease, Lift Curse, Quench, Staunch, Unbind | common | anyone | 500 ms | 6 s | ends poisoning (and a black widow's venom), disease, withering, burning, bleeding, being slowed |
| Embolden | common | anyone | 500 ms | 6 s | ends Fear |
| Zombify | uncommon | one fallen | 1200 ms | 30 s | an enemy fallen in the last half minute rises to follow and fight for you, an hour; as many at once as its level, 1 to 5 (a grimoire) |
| Teleport | uncommon | oneself | 1500 ms | 60 s | anywhere in the world, in an instant |
| Swole | uncommon | oneself | 600 ms | 30 s | running and fighting take a quarter of the breath, five minutes |
| Reflect | uncommon | oneself | 800 ms | 30 s | a fifth of every blow and spell turned back on whoever dealt it, five minutes (a wand) |
| Invisibility | rare | oneself | 1000 ms | 60 s | unseen, five minutes or till you strike, cast, talk, trade or use anything |
| Word of Recall | uncommon | oneself | 2000 ms | 60 s | to the door of the nearest temple (a grimoire) |
| Wizard's Walk | rare | a place | 1200 ms | 5 min | anywhere on the map you've uncovered, in a step (a wand) |
| Summon | common | a creature, or a player | 1500 ms | 60 s | one of the creatures of these parts at your side, an hour, as many at once as its level, 1 to 5; or another player, if they'll come |
| Levitate | common | oneself | 600 ms | 20 s | float above the ground, five minutes: nothing on it touches you |
| Fear | uncommon | an enemy | 500 ms | 8 s | it runs blindly away, ten seconds |
| Polymorph | rare | an enemy | 900 ms | 20 s | a creature turned into another of the world's |
| Explosion | rare | an enemy | 1400 ms | 20 s | a blast round them (*Explosion*, below): every foe within 4 m hurt, 20–32 at its heart and half that at its edge, and thrown |
| Attraction | uncommon | oneself | 800 ms | 30 s | a puff of smoke, and out of it one of the creatures of these parts |
| Inertial Barrier | uncommon | oneself or a friend | 700 ms | 20 s | a quarter less from blows and arrows, five minutes |
| Surge | uncommon | oneself | 500 ms | 60 s | blows and arrows 30% stronger, everything hurts 15% more, two minutes |
| Pacify | uncommon | an enemy | 800 ms | 15 s | no longer hostile to you, till you strike it |
| Vampirism | uncommon | an enemy | 700 ms | 6 s | draws their life into you: 6–10, growing to 24–34 |
| Dodge | uncommon | oneself | 500 ms | 30 s | a chance to slip every blow and spell, five minutes: one in ten, growing to one in four; added to the player's own knack for slipping blows (Evasion: docs/WAR.md) |
| Poison | common | an enemy | 500 ms | 5 s | poisons them: 2 a time, growing to 7 |
| Light | common (10 gold at every adventurers' guild) | oneself | 500 ms | 3 s | a globe of light over their shoulder, fifteen minutes: the dark round them as bright as day; cast again to put it out |

**Explosion.** A blast of fire round the enemy it's cast at (battle.js `#blast`): every enemy of
the caster's within 4 metres is hurt (20–32 at its heart, times the caster's spell power, half
that at its edge; as fire, and as magic: a ward against fire or magic takes its share, but no
shield, cover or dodge does) and thrown (`TOSS`: away from the heart, the one it's cast at away
from the caster; as far as 4.5 metres at the heart and half that at the edge, as far as the
ground's clear, onto the nearest free square; down and getting up, 2.6 seconds; not thrown again
for 4). Never the caster or their friends and allies. Its look and sound are the blast's
(*Blasts*, below); casting, heat's drawn in round where it's going, the air stilling a moment.
There's no scroll of it, only its tome: found on those with hands (much likelier on the Goblin
King, docs/WILDS.md *Goblins*), and now and then the Mystic Emporium's special.

**Growing.** Vampirism, Dodge, Poison, Summon and Zombify grow as they're used (their own
experience, `SPELL_XP` a cast that lands): five levels, at 0, 60, 200, 500 and 1200 (`GROWTH_XP`),
each stronger, and said ("Vampirism grows stronger (3 of 5)"). Summon's and Zombify's level is how
many of what each brings can be at the caster's side at once (`company`: one at level 1, five at
5; ten together with both at 5), and said so ("Summon grows (3 of 5): up to 3 at your side at
once").

### What lasts

The wards, Swole, Reflect, Invisibility, Levitate, Inertial Barrier, Surge, Dodge and Light last on
whoever they're cast on (battle.js `buff`: their kind, till when, by whom, at what level), shown
by their icon on their plate (and the player's), and said when they end ("Your fire ward fades").
On a plate, what harms someone (poison, a web...: docs/WILDS.md) is shown first, each on a
blood-red disc, pulsing; then what does them good (these spells, and a player's boons:
docs/WAR.md), each on a sapphire tile rimmed in gold, steady. In each, the soonest over comes
first, and each darkens round as it wears off. It's one row, as wide as the health and stamina
bars: if more are on someone than fit, the last that fits is an ellipsis. Hold the player's card
(half a second) and it grows to show them all, row on row; tap it, and it's one row again.
Cast again, one lasts from then. They end at death.

- A **ward** (`WARD`: 0.7) takes 30% off what it's against (an element's attack spells, a
  creature's blows of it, afflictions: both how much they hurt and how long they last) and
  shortens a stun or a knockdown from it.
- **Reflect** turns a fifth of each blow and spell on whoever dealt it (not what lies on the
  ground, and never back again).
- **Invisibility**: no one sets on the invisible, or sees them to chase, and they don't strike
  back at anyone by themselves. Striking, casting, talking, trading or using anything ends it.
  Only the mightiest (a creature of tier 7 or more, or one of the unique) near (8 metres, in
  sight) may see through it: a chance each second that grows the longer they're near
  (`SEE_THROUGH`), and then they set on them ("The wight lord sees through your invisibility!").
- **Levitate**: nothing on the ground (fire, acid, rot, lava, venom) touches them; they float
  above it, bobbing.
- **Light** (the terrain plan's M7e-4): a small bright globe rises from the hand and follows a
  little over the caster's shoulder (world/globes.js), lighting what's round it in a cool white,
  steady, a light of its own (13.5 m by night, as firelight is: GAME.md *Against the dark*). In
  the rules (core/light.js) everyone sees as by day within 12 m of the caster at night, so they
  see an ambush before it sees them, and are seen too. It lasts fifteen minutes; cast again while
  it shines, it's put out. Its tome is sold at every adventurers' guild for 10 gold (spells.js
  `GUILD_TOMES`), and is found as other common tomes are.

### Bending wills

Fear, Pacify and Polymorph bend a creature's will. The mightier may shrug them off: none at tier 4,
15% likelier each tier beyond, up to 90% (`RESIST`); the unique (the perilous places' own), and
players, always do ("Resisted", "Immune"). Fear frightens a creature for ten seconds; cast on
it again within a minute of first frightening it (`FEAR_MEMORY`), half as long, and a third time,
not at all ("is past fearing you, for now"). A frightened creature runs from the caster, blindly.
Pacify leaves it no longer hostile to the caster till they strike it (`spared`).

## Spell scrolls

A spell scroll (`core/goods.js` `SCROLLS`, "Scroll of Fireball") casts its spell once, read, as its
reader would cast it at the first level of it, though they've never learnt it; then it's gone.
There's one for every school's spell, the Hexes' Stun and Hold, and the tomes' spells cast on an
enemy, oneself or a friend with nothing in hand (`SCROLL_SPELLS`: 48). The wards and cures aren't
among them (they come in bottles: docs/WAR.md *The alchemist's brews*), nor a wand's or a
grimoire's spells, nor those cast on a place, the fallen or a summons, nor Teleport, nor
Explosion (only ever its tome).

- **Read** from the pack, or from an action wheel: a scroll goes on the wheel its spell would (an
  enemy's for a spell cast on one), shown by its spell's name with the scroll's icon (a rolled
  sheet with the spell's mark on it and a ribbon of its make). From an enemy's wheel it's cast on
  that enemy; from the pack, on the foe they're set on, or else the nearest they can see within
  the spell's reach (host.js `#use`, `#foeNear`). The cast is the spell's own: its casting time,
  the reader's cooldowns, refused as a cast would be (nothing in reach, still recovering), and
  the scroll kept if it is.
- **How rare and how dear** by how great the spell is (shown in the colour of its make, docs/WAR.md
  *Makes*): a school's first two spells common (15 and 30 gold), then fine (55), masterwork (95),
  rare (160), very rare (260) and legendary (420) for the seventh; a tome's spell's scroll by its
  tome's rarity, fine (30), masterwork (75) or rare (180); Stun's fine (40), Hold's masterwork (80).
- **Shown** under "Tomes and scrolls" in a shop, and read ("Read") from the pack as a tome is.

## Wonders (host.js)

What a spell does beyond the battle, the host does when it hears the spell land (`#wonder`), the
same for everyone playing (docs/GAME.md: hosting and joining):

- **Zombify** raises an enemy creature fallen in the last half minute (they lie 30 s: long enough)
  as the caster's companion, and **Summon** (on a creature) calls one of the creatures of these
  parts as one: a companion follows its player and fights their enemies, an hour (`COMPANY`; its
  time up, it's gone). A player keeps as many called at once as Summon's level, and as many risen
  as Zombify's (*Growing*, above: one to five each, so ten at most); one more called or raised
  than that, and the oldest of that kind goes to make room for it ("Your wolf goes, to make room
  for another.", host.js `#companion`). And where there are already as many about as the body
  budget near a fight has room for (sixty within 80 m: docs/WILDS.md *A ceiling*), the oldest of
  theirs, called or raised, goes for the new one, short of what their levels allow. It keeps up as a follower does (docs/WAR.md *Following*: at its player's pace,
  a sprint as they sprint, faster the further behind), and one left more than 20 metres behind
  (stuck, or on another floor) is brought quietly to a few squares behind them (`FOLLOW.lost`,
  `COMPANION.behind`), out of a fight its player isn't in. They're lost when their player's
  carried off by magic. What a companion brings down counts for its player, as a follower's does:
  the loot is theirs, and it counts towards their requests and contracts (host.js `#learn`). It's
  one of their party (docs/GAME.md *The party*): told to wait, to follow, to go for whoever its
  player's set on, or to go, from its icon, its wheel or the party menu.
- **Attraction** brings one of the creatures of these parts out of a puff of smoke in front of
  the caster: as wild as any other (to hunt, for its parts or a guild's contract).
- **Summon** on a player (of a people not the caster's enemy) asks them to come: they have 30
  seconds to answer (`SUMMONING_MS`) ("Go to Aldric" or "Resist"; with **Resist all summons** on in Game options,
  they say no at once), and coming, they're carried to the caster's side.
- **Teleport** carries the caster anywhere at all in the world; **Word of Recall** to the door of
  the nearest temple; **Wizard's Walk** to the place they pick on the world map (the map opens to
  pick on: anywhere they've uncovered). Whoever was with them is left behind.
- **Polymorph** turns a creature into another of the world's creatures, any but the perilous
  places' own, as strong as its tier has it.

## The spellbook (app/spellbook.js)

The book button (top right) or B opens it: the wand or grimoire in hand and its boost; each school,
its tier and how far to the next (an element not yet learnt: which tome opens it, and where
it's sold), and its spells, known (to put on a wheel: the enemy wheel for those cast at enemies,
the self wheel for the rest) or still to come, and at what experience (or from what tome); the
hexes; and the spells learnt from tomes, with how far each that grows has grown, and how many
more there are to find. Each spell has its icon (app/spellicons.js: its school's colours, what it
does drawn plainly), what it does, its cooldown, how long it takes to cast and whom it's cast on.

## How spells look (world/spellfx.js)

Each spell has its own look (`SPELL_LOOKS`: a recipe each), cast and landing, grander the higher
its tier, built from the game's particles (effects.js) and a few meshes of its own: glowing orbs,
jagged bolts of lightning (made again every twentieth of a second, so they crackle), beams,
columns of light with streaks running up them, rings spreading over the ground, marks on it
(scorching, glows, circles of runes, cracks: textures drawn once on a canvas), shards and
tumbling stones, spikes of earth and ice bursting up, a whirlwind's funnel, domes.

- **Casting.** Light gathers in the caster's left hand while they cast, in the school's colours
  (a heal's or a stun's in the look it'll land in), more and bigger the higher the tier. From the
  fourth tier a circle of runes turns on the ground round them; the sixth's is wider; the
  seventh's is two circles turning against each other, a column of light standing up from them,
  and a circle of runes growing where it's going. A fire spell's circle turns round the caster's
  feet whatever its tier (its own tier's: below). A spell with a missile throws it to arrive as
  the spell lands: a flame for Burn, a fireball, a stone arcing for Stone Crush, a crescent of
  wind for Hurt, a blade of ice spinning for Iceblade, globs of scalding water and venom.
- **Landing.** Each its own: Fireball bursts and scorches the ground; Immolate wraps them in a
  wreath of fire; Engulf's earth rises round them in spikes; Lightning falls from the sky and
  leaps on to the others it struck; Tornado is a whirlwind of dust and debris; Iceblade shatters
  in ice and frost. The heals rise in green light (and the heal's look: a swirl, a fountain...),
  the cures draw what they cure up out of them turning to gold. A ward closes a shell of its
  colour round the whole of whoever it's on (`wardShell`), from under their feet to over their
  head: it rises up round them from a circle of runes turning under their feet, its rising edge
  brightest, three rings of light sweeping up it as it goes, and seals over their head with a
  flare; a lattice of light turns on it and bands run up it until it fades, two and a half
  seconds after, motes of its colour spiralling up round them.
- **The seventh tier fills the screen.** Hellfire darkens the sky and rains sixteen meteors out
  of a circle of runes turning in it over 10 metres round them, then the ground erupts in a
  column of fire 6 metres across reaching out of sight, shockwaves spreading 24 metres, fire and smoke everywhere,
  the ground scorched. Disintegrate is a beam 2.6 metres wide running from the caster's hand
  through them and on 26 metres, the ground scoured and everything round ground to dust.
  Ionize is a crackling dome of lightning 8 metres round and 22 bolts from the sky over 12
  metres. Absolute Zero freezes everything in an instant: 60 spears of ice burst up over 12
  metres, the ground cracks with frost, snow falls. Each washes the screen with its colour
  (strongest at the edges: `#wash`, a layer over the view) and shakes the camera, dying away.
  The fifth and sixth tiers shake it a little.
- **The fire spells burn as fire** (`blaze`: world/fire.js's flames, a spell's hotter and
  whirling round as no fire does, growing up, burning and dying away, hardly leaning in the
  breeze), from a little to a great deal of it as you asked. And each is a spell (you: "make sure
  all the tiers look good and are identifiable as spells. The spell circle you had on the ground
  was a good motif. Maybe one that is increased by tier"):
  - **Its circle** (`sigil`, `sigilTexture`): every fire spell's own tier's, turning round the
    caster's feet as it's cast (0.9 m round at the first tier to 4.2 at the seventh) and where it
    lands (0.85 m to 13), the greater the spell the more there is to it: a ring and fire's
    triangle at Burn; rings of runes, two triangles as a star, three, then stars of seven and
    eight points, little circles at their points, flame teeth round the rim, spokes and a second
    band of runes at Hellfire; a flame in the heart of each. Each line glows over a darker line
    burnt wider into the ground, so the circles show on bright ground by day as well as at night.
  - **By day as by night** (you: "Make sure the fire spells look good in the day too"): a spell's
    flames are a body of fire (fire.js `fireBody`), hiding more of what's behind them the brighter
    the day, their hearts deep orange-yellow rather than white, so they keep their colour against
    bright ground and sky; their circles, rings of runes and fireballs in flight show their colour
    over what's behind them rather than adding light to it, and the fireballs trail smoke.
  - **Burn** (1): its circle flaring, and a lick of flame 0.75 m high curling up them.
  - **Fireball** (2): it bursts into a fire 1.6 m high round them, twisting up.
  - **Burstflame** (3): a fire round them, and a ring of nine fires bursting out round its
    circle's rim, 1.65 m out.
  - **Immolate** (4): a wreath of ten tongues spiralling up 3.4 m round them, a ring of runes
    rising round it.
  - **Flamefill** (5): a firestorm (you: "There should be a clear progression of power"): a wave
    of fire rolling out across its circle, ring after ring, each taller than the last, a cone of
    fire up to 5 m high drawing in over the middle, fire running round the rim 3.3 m out, a ring
    of runes rising over it.
  - **Inferno** (6): its circle, 5.5 m round, spreading where it's cast as it's cast, the sky
    darkening a little; then a fire whirl 16 m tall from it, a wide swirl of fire at its foot and
    a hotter column twisting faster in its heart, three rings of runes rising up it, fire running
    all round the circle's rim, black smoke billowing out over it.
  - **Hellfire** (7): as it's cast, the sky darkens almost to black and reddens (view.js
    `setOmen`: the sky's colours, the haze and the clouds towards a burning dusk's, the sun and the
    light from all round dimmed, so the fire blazes against it, day or night), its great circle
    spreads 13 m round where it's cast and another turns in the sky 16 m over it; meteors fall out
    of that circle, each setting the ground alight, the ground splitting in glowing fissures; then
    a whirling column of fire 26 m high, a hotter one inside it reaching 30, a wide swirl of fire
    at its foot, five rings of runes rising up it, fire running round the great circle's rim, a
    crown of black smoke spreading over it.
- **The elements' Prismatic spells** (you: "Not quite as awesome as Prismatic Destruction, but
  more awesome than the 7th tier versions"), each a build-up, a climax and a brief dissipation, as
  realtime effects artists time them (researched for it: Riot's League of Legends VFX style
  guide, the most contrast, saturation and detail at the moment of impact, a clear edge to what's
  struck; Diablo III's legibility first; Meteor's telegraph, fall and burning ground; Genshin's
  frozen-then-shattered; chain lightning's trunk, branches and leaps), from what the spells are
  drawn with, and a few small additions (`prisms`; the `prism` and `spectrum` textures; a ring of
  a texture; spikes rising and sinking as told, and see-through; stones that rise; a held,
  collapsing fireball). Each shares the sigil's own:
  - **as it's cast:** the Prismatic sigil (`prism`: its four petals and star, in the element's
    colour, a band of the spectrum round its rim) turning under the caster and spreading under
    whom it's cast at, as wide as it'll strike, following them; four glass prisms (`prisms`: the
    first of the element's colour and bigger) circling over them and diving in as it's let go;
    a ring of the element's colour and one of the spectrum drawn in to them;
  - **as it lands:** the glass bursting (the spectrum's motes, white shards), and three
    shockwaves, a pale one, the spectrum's fringe a moment after (a chromatic split), then the
    element's; the sigil left burnt into the ground a few seconds. It keeps Prismatic
    Destruction's own to it: the sky turned, its four columns, its rings past 8 m.
  - **Prismatic Fire:** a sun kindled 3.6 m over them as it's cast (the blasts' fireball, held,
    golden), the sky darkening a little, four pyres round them streaming fire up into it; it
    collapses to a point as it's let go, then bursts: a dome of boiling fire, a pillar of fire 11
    m high twisting up out of it (a hotter one inside, to 13), six flares leaping out in arcs to
    set the ground alight where they fall, a wall of fire running round its rim, each struck set
    burning; embers, a crown of smoke, molten cracks and scorch left on the ground (the burning
    ground the battle leaves too: `hazard`).
  - **Prismatic Earth:** the ground trembling as it's cast, more and more (three shakes), stones
    lifting off it, its cracks glowing gold; a great stone driven down out of the sky onto them as
    it's let go; landing, the stone bursting, the ground heaving each struck up and splitting round
    them into a crown of twelve spires leaning out at its rim (more between, gold crystals in its
    heart), standing as long as they're down; dust rolling out low, stones raining back, two
    aftershocks; the spires sinking as they rise again.
  - **Prismatic Water:** water rising round them in fountains and a wall of it as it's cast, mist
    thickening, frost creeping in; landing, all of it frozen in an instant: ice blades opening out
    of them like a flower, the freeze racing out over the ground in spears of ice, nearest first,
    each struck sealed in a crystal of ice as tall as they are for the three seconds they're
    frozen, diamond dust glittering and snow falling; then the ice shattering.
  - **Prismatic Air:** the storm's eye opening over them as it's cast, dark cloud wheeling, wind
    spiralling up, static crackling over the ground, lightning flickering in the cloud; landing, a
    spear of lightning out of it into them, splitting to every one round them at once, then leaping
    on beyond, one after another, each struck from the sky too; a wall of wind wheeling round them
    and blades of wind cutting out; the storm discharging round its rim after, static clinging to
    the stunned; a lightning figure burnt into the ground.

  Each lighter than Hellfire on the graphics card: at most a little over half its particles and
  fires (Prismatic Fire's, the most of the four).
- **Prismatic Destruction**, the greatest spell there is (you: "Prismatic Destruction is the
  biggest spell in the game. It should be epic"), the top of the ladder: the only spell that
  turns the sky (view.js `setOmen`'s tints, `OMENS`: the fire spells' red dusk; an eclipse's
  violet; radiance's white), the only one with a collapse to a point and a breath held, the
  widest marks and the strongest wash and shake. Each element has a quarter round whom it's cast
  at, as the caster sees them (fire far left, earth far right, air near right, water near left:
  the sigil's order round; none behind them, none between them and the caster).
  - **As it's cast:** the sky eclipsed violet, the land dimmed; the whole sigil spreading under
    them, 19 m across (past the 8 m it strikes), and turning in the sky over them; four prisms,
    each its element's colour (`prisms` `colours`), circling over their quarters; in each quarter,
    10 m out, a column of the element's light, its power streaming in to them, and its own
    gathering (a sun swelling over a pyre; a monolith rising out of gold cracks, the ground
    trembling; a whirlwind, lightning crawling down it; a column of water and fountains, frost
    spreading); the four elements' rings and the spectrum's drawn in, a shell of light collapsing
    on them (`sphere`) to a point of white, held a moment.
  - **As it lands:** a beam out of the sky as wide as a house, split like light through a prism,
    red at its edge, blue, white at its heart, striking while the sky's still violet; then the
    sky white, the screen washed white and the ground heaving; a shell of light bursting out past
    all it strikes, the glass shattering, rings to 14, 16 and 28 m; the four element columns 24 m
    high round the beam; each element's own in its quarter, one after another (fire's pillar and
    flares, earth's spires, air's spear of lightning, water's ice blooming and shattering); each
    struck unmade in its quarter's light, a column of it over them and motes rising off them.
  - **What's left:** the whole sigil burnt into the ground, glowing cracks across all it struck,
    scorch, each quarter's ice and spires standing a few seconds, light falling like ash.
  - **Heard:** its cast with a low drone rising under the four glass tones and a rush of air
    sucked to a point at the last; its landing a crack and a falling glass tone for the beam, the
    greatest blast after it, each element on its beat, the glass chord over all
    (audio/catalog.js).
  - **What it costs:** at most about 1.4 times Hellfire's particles, with a dozen struck (it adds
    no more for more than that), and far fewer fires; within a phone's means. The spikes and
    shards every spell throws (earth's, ice's, a bomb's) are each drawn at once now
    (`InstancedMesh`: one draw call however many), so Absolute Zero's 113 meshes are 15.
- **Blasts** (`blast`: Explosion's, a goblin bomb's, the Goblin King's bigger one), built in
  layers as realtime effects artists build an explosion (researched for it: the flash only a
  frame or two, the shockwave first, smoke starting at once and lasting longest; fast fire
  slowed hard by drag; sparks thrown in jets, not evenly, or they look floaty; earth and dust
  tying it to the ground; one clear focal point), each from what the spells are drawn with:
  - a flash of white-yellow light for a moment (lent a light, and a glow sprite), and its heat
    lighting what's round it longer, orange, fading;
  - **its fireball** (`fireball`): a ball heaved out and in by noise boiling up it (its vertices
    pushed along their normals by turbulence, after Jaume Sanchez's "fireball explosion"),
    swelling to its size in its first 0.15 s and slowing, rising once it's out, coloured by how
    hot it is as the flames are (red, orange, white-yellow, through fire.js's soft shoulder),
    hottest at its heart and where it bulges, cooling into sooty smoke and eaten away from its
    edges as it thins; premultiplied, as the flames: its heart adds light, its smoke hides what's
    behind it, the more by day. Its shader's made with the rest before play (`warm`), so the
    first blast doesn't stall while it compiles;
  - puffs of fire flung out and stopped short (drag 6), white-hot to orange to a dull red (the
    particles' colours can run through a third now: effects.js);
  - two shockwaves racing over the ground, the first pale and fast (to 2.2 times its reach in
    0.28 s), the next deeper; the spell's a third, and a dome of heat;
  - sparks in five or seven jets, up and out, falling;
  - soil and stones thrown up and pattering down, and a skirt of dust rolling out low round it;
  - dark smoke billowing up after it, higher the later, and embers drifting;
  - the spell's ground left burning in eight small fires round it;
  - scorched where it was (3 m round; the spell's 4.5 m, and cracked), glowing as it cools;
  - the camera shaken (the nearer the player, the harder: none past 25 m) and, for the spell,
    the screen washed with its light.
  A goblin bomb in flight is an iron-dark pot tumbling through the air, its wick sputtering
  sparks (`lob`); landed, it sits fizzing in a ring of light on the ground as wide as its blast
  will be, pulsing quicker and quicker as its wick burns down, till it bursts (`burst`).
  About 130 glowing particles and 70 of dust a bomb, 300 and 150 the spell (of 3,000 each).
- **What lasts** shows on whoever it's on: motes of its colour now and then; Levitate lifts them
  0.35 metres off the ground, bobbing; Invisibility leaves a shimmer of them.
- **What lies on the ground** glows there for as long as it lasts, leaving its mark.
- **Arriving and leaving by magic**: a column of light where a player's carried to (violet for
  Teleport and summoning, gold for Word of Recall); a companion comes in a circle of runes (the
  risen dead in cracked earth) and goes in a puff. A Scroll of Safety (WAR.md) turns a blue
  circle of runes under its reader, growing to two metres across as it's read, and shrinking away
  under them in the market square they're carried to (`underfoot`: a ring of runes, a second ring
  inside it turning the other way, a soft glow and motes rising off its rim).
- **Reflect** flashes silver from whoever turned the blow to whoever it's turned on.

Its fire, its flashes and its fireballs in flight each light what's round them, a light of their
own (`lightsNow`: as strong as each is now, fading as it does, a fire's flickering as fire does,
a flash's not), handed to the view with the world's fires (view.js `lightNear`), first of them all,
so the nearest take the view's two lamps and cast shadows and the rest light the world's
materials from their list; nothing it draws adds a light of three.js's (that would have every lit
material's shaders made again), and its shaders are made with the rest before play (`warm`).
(Before, its flashes borrowed the view's lamps, and the torches' lighting, after it each frame,
took them back: out of doors its flashes lit nothing.) Its meshes and materials are let go when
they're done (the shapes and textures kept for the next). The particle buffers hold 3000 of each
kind, for the seventh tier's.

## Playing together

Everything a spell does is the host's (battle.js and host.js: the same for everyone, from the
host's seeded random numbers), told as events (`cast`, `hit`, `spell`, `healed`, `stunned`,
`buffed`, `hazard`, `carried`, `companion`, `summons`, `polymorphed`, `attracted`) that everyone
joined sees the same way. How spells look is each player's own, drawn from those events: a player
casting on another map isn't drawn. Summon and Zombify growing, and how many each keeps at once,
changed the rules every game plays by (`NET_VERSION` 103).
