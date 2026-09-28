# The wilds

Out of town the world has creatures in it: wolves on the roads, bears in the woods, slimes in the
meadows, and each people's own strange things in the wilds of their lands. They're about as strong
as a new adventurer near home and stronger the further out, with the mightiest kept to the
perilous places for players near the height of their power. This covers what they are, where and
how strong, how they behave, how they're kept about the players, and how they're built and
animated.

The code: `client/js/core/creatures.js` (what each is), `core/battle.js` (how they fight),
`core/host.js` (keeping them about the players), `core/weapons.js` `NATURAL` (their fangs, claws
and breath), and `client/js/beasts/` (how each looks and moves). The creature lab
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
| Skeleton | 34 | aggressive | 1–3 | 3–9 | marsh, heath, tundra |
| Cultist | 28 | aggressive | 1–3 | 3–8 | marsh, jungle, darkwood, volcanic |
| Troll | 90 | aggressive | 1–2 | 4–9 | mountain, snow, tundra, heath |
| Ogre | 80 | aggressive | 1–2 | 4–9 | badlands, heath, mountain, savannah, marsh |
| Wyvern | 60 | aggressive | 1–2 | 5–9 | mountain, badlands, volcanic, snow |
| Black shuck | 50 | aggressive | 1 | 3–8 | the humans' wilds only |
| Boggart | 30 | territorial | 1 | 2–6 | the humans' wilds only |
| Will-o'-wisp | 22 | aggressive | 1–2 | 2–7 | the elves' wilds only |
| Blighted treant | 80 | territorial | 1 | 4–9 | the elves' wilds only |
| Cave spider | 24 | territorial | 1–4 | 2–7 | the dark elves' wilds only |
| Shadow stalker | 50 | aggressive | 1 | 4–9 | the dark elves' wilds only |
| Hyena | 22 | aggressive | 2–5 | 2–7 | the cat folk's wilds only |
| Sand scorpion | 30 | territorial | 1–2 | 2–7 | the cat folk's wilds only |
| Bog frog | 28 | territorial | 1–2 | 2–6 | the lizard folk's wilds only |
| Marsh crocodile | 60 | territorial | 1 | 3–8 | the lizard folk's wilds only |
| Magma slime | 45 | territorial | 1–2 | 3–8 | the orcs' wilds only |
| Rock tusker | 80 | territorial | 1 | 4–9 | the orcs' wilds only |
| Dragon | 90 | aggressive | 1 | 10 | the dragon's lair |
| Wight lord | 70 | aggressive | 1 | 9–10 | the ruined castles |
| Frost troll | 75 | aggressive | 1 | 9–10 | the high snows |

A few do something besides biting and clawing: the adder, bog frog and magma slime spit (venom,
venom, lava), the will-o'-wisp looses bolts of light, the treant calls up roots, the cave spider
spits webs, the dragon breathes fire and the wight lord lays a curse (each flies as a projectile).
The bog frog's tongue reaches two squares off. The rock tusker's charge knocks whoever it catches
off their feet (below).

## How strong, and where

The tier of a place goes up the further it is from home: `tierAt` counts from the player's own
people's start (where their heroes begin), one tier from 1200 m out and another every 850 m, up
to 8 in the open. The high, cold and burning lands (snow, mountain, volcanic) two tiers more once
they're past tier 6, up to 10. So what's near home is a match for a new adventurer, and the danger
grows the further they go. What's found at a place (`candidatesAt`) is whatever likes its land
and has that tier among its tiers; the people's own creatures only in the wilds of their lands.

The perilous places hold the mightiest, each a master and its guards (`LAIRS`): the dragon at the
dragon's lair, a wight lord and skeletons in each ruined castle, the frost troll in the snows.
Once slain, a master is gone a long while (it comes back after `slain` has passed). The world
plan's wild camps (bandits, wolves, goblins, spiders and the rest) come to life when a player's
near them, as strong as the camp's distance from that player's home (`CAMP_FOLK`).

## Kept about the players

The host keeps about eight creatures (`WILDS.count`) within 60 m of each player out in the world,
put out 30 to 44 m away (out of sight) and clear of every settlement, and lets them go once every
player's 90 m away (never one that's fighting). A camp's folk come out when a player's 60 m from
it and go once everyone's 140 m off. So there's always something about, and never more than a
player can see: the creatures are shared by everyone playing (whoever's near sees the same ones
and can fight them together), and each is kept, moved and fought by the host like anyone else, so
it plays out the same on every machine.

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
  so a creature's two to eight things to draw, 12,000 to 21,000 triangles.
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
  flank at rest and beating when it runs or strikes.
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
- **People-shaped** (bandits, cultists, goblins, boggarts, trolls, ogres, frost trolls) are built
  on the character engine as everyone in the towns is (`characters/`), bigger or smaller, their
  hands placed for their size.

Each moves itself (`pose`): walking and running, breathing and looking about, three or four ways
of attacking it varies between, three to six ways of passing the time when nothing's near
(sitting, lying down, sniffing, grooming, howling, coiling, crouching, rooting), flinching when
struck, and dying its own way.
