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
boost), `core/spoils.js` and `core/standing.js` (tomes found and given), `app/spellbook.js` (the
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
| Mend Wounds | 700 ms | 6 s | 16–24 | |
| Detraumatize | 900 ms | 9 s | 28–40 | stops bleeding |
| Renewal | 1100 ms | 14 s | 45–65 | ends bleeding, poison and disease |
| Astral Heal | 1400 ms | 45 s | all | ends everything lingering |

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
| Engulf | 4 | 800 ms | 7 s | 20–30 | the earth holds them (slowed) |
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
| Waterbolt | 2 | 600 ms | 3.5 s | 12–18 | knocks them back (staggered) |
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

The Hexes skill's (core/progress.js): **Stun** (an enemy within 9 metres, 400 ms, a 3 s
cooldown: it can't move, fight, cast or think for 3 seconds, and turns on whoever did it) and,
once the skill brings it, **Hold** (600 ms, 6 s cooldown, 6 seconds).

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
120 or 300 gold at the adventurers' guild, which buys them. (The elements' first spells' tomes,
above, are the guild's to sell, never found or given.)

- **Found**: on those with hands (bandits, goblins, skeletons, cultists, trolls, ogres, boggarts,
  the wight lord, the frost troll: creatures.js `hands`) who've been about the wilds a while:
  from tier 4, 3 in 100 of them, half a percent likelier each tier beyond; one of the perilous
  places' own, 1 in 5 (spoils.js `TOME_DROP`).
- **Given**: by the adventurers' guilds for their harder work, from their libraries: breaking up a
  camp always pays a tome besides its gold, a bounty about a third of the time (standing.js
  `GUILD_TOMES`). The contract says which.

| Spell | Rarity | On | Casts in | Cooldown | Does |
| --- | --- | --- | --- | --- | --- |
| Resist Fire, Water, Air, Earth | common | oneself or a friend | 700 ms | 15 s | five minutes: 30% less from that element's spells and creatures' blows, and what it sets on them ends sooner |
| Resist Magic | common | oneself or a friend | 700 ms | 15 s | 30% less from every spell, curses and wisps' bolts; hexes hold less long |
| Resist Poison, Disease | common | oneself or a friend | 700 ms | 15 s | poison (or disease) hurts 30% less and ends sooner |
| Cure Poison, Cure Disease, Lift Curse, Quench, Staunch, Unbind | common | anyone | 500 ms | 6 s | ends poisoning, disease, withering, burning, bleeding, being slowed |
| Embolden | common | anyone | 500 ms | 6 s | ends Fear |
| Zombify | uncommon | one fallen | 1200 ms | 30 s | an enemy fallen in the last half minute rises to follow and fight for you, five minutes (a grimoire) |
| Teleport | uncommon | oneself | 1500 ms | 60 s | anywhere in the world, in an instant |
| Swole | uncommon | oneself | 600 ms | 30 s | running and fighting take a quarter of the breath, five minutes |
| Reflect | uncommon | oneself | 800 ms | 30 s | a fifth of every blow and spell turned back on whoever dealt it, five minutes (a wand) |
| Invisibility | rare | oneself | 1000 ms | 60 s | unseen, five minutes or till you strike, cast, talk, trade or use anything |
| Word of Recall | uncommon | oneself | 2000 ms | 60 s | to the door of the nearest temple (a grimoire) |
| Wizard's Walk | rare | a place | 1200 ms | 5 min | anywhere on the map you've uncovered, in a step (a wand) |
| Summon | common | a creature, or a player | 1500 ms | 60 s | one of the creatures of these parts at your side, five minutes; or another player, if they'll come |
| Levitate | common | oneself | 600 ms | 20 s | float above the ground, five minutes: nothing on it touches you |
| Fear | uncommon | an enemy | 500 ms | 8 s | it runs blindly away, ten seconds |
| Polymorph | rare | an enemy | 900 ms | 20 s | a creature turned into another of the world's |
| Attraction | uncommon | oneself | 800 ms | 30 s | a puff of smoke, and out of it one of the creatures of these parts |
| Inertial Barrier | uncommon | oneself or a friend | 700 ms | 20 s | a quarter less from blows and arrows, five minutes |
| Surge | uncommon | oneself | 500 ms | 60 s | blows and arrows 30% stronger, everything hurts 15% more, two minutes |
| Pacify | uncommon | an enemy | 800 ms | 15 s | no longer hostile to you, till you strike it |
| Vampirism | uncommon | an enemy | 700 ms | 6 s | draws their life into you: 6–10, growing to 24–34 |
| Dodge | uncommon | oneself | 500 ms | 30 s | a chance to slip every blow and spell, five minutes: one in ten, growing to one in four; added to the player's own knack for slipping blows (Evasion: docs/WAR.md) |
| Poison | common | an enemy | 500 ms | 5 s | poisons them: 2 a time, growing to 7 |
| Light | common (10 gold at every adventurers' guild) | oneself | 500 ms | 3 s | a globe of light over their shoulder, fifteen minutes: the dark round them as bright as day; cast again to put it out |

**Growing.** Vampirism, Dodge and Poison grow as they're used (their own experience, `SPELL_XP` a
cast that lands): five levels, at 0, 60, 200, 500 and 1200 (`GROWTH_XP`), each stronger, and said
("Vampirism grows stronger (3 of 5)").

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

## Wonders (host.js)

What a spell does beyond the battle, the host does when it hears the spell land (`#wonder`), the
same for everyone playing (docs/GAME.md: hosting and joining):

- **Zombify** raises an enemy creature fallen in the last half minute (they lie 30 s: long enough)
  as the caster's companion, and **Summon** (on a creature) calls one of the creatures of these
  parts as one: a companion follows its player and fights their enemies, five minutes (its time
  up, it's gone). One left more than 14 metres behind (stuck, or on another floor) is brought to
  a few squares behind them (`COMPANION`). They're lost when their player's carried off by magic.
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
  the cures draw what they cure up out of them turning to gold, the wards close a dome of their
  colour over them.
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
casting on another map isn't drawn.
