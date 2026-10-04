# conquest

[![CI](https://github.com/hoffspot/conquest/actions/workflows/ci.yml/badge.svg)](https://github.com/hoffspot/conquest/actions/workflows/ci.yml)

**Pellagos**: make a character, choose a weapon, and defend a market town from the orc that
prowls its fields, then walk out of it into the world round it: 8 kilometres of fields, woods,
rivers and roads, drawn round you as you go, with no loading screens. It's drawn in real-time 3D with [Three.js](https://threejs.org), plays in the
browser on phones, tablets and computers, and can be installed as an app.

**Play it at <https://hoffspot.github.io/conquest/>.** The character lab, for building and
dressing characters and watching them walk and fight, is at
<https://hoffspot.github.io/conquest/character-lab.html>. The world map, showing the whole world
(8 kilometres square: six peoples, their cities, towns, villages, hamlets and farmsteads, the
roads between them, and the ruins, caves and enemy camps in the wild), is at
<https://hoffspot.github.io/conquest/world-map.html>. The town map, laying out a settlement (a
farmstead, hamlet, village, town, city or capital) from a seed as the game's are laid out (streets wandering out from a market place,
lanes curving round between them, and houses turned every way to face them), is at
<https://hoffspot.github.io/conquest/town-map.html>. The building lab, building a street of every
style of house, the taverns (each named, with its own painted sign), the adventurers' guild, the
temples and the smithy, a whole town, any kind of settlement out in the world, or a stretch of
any land (its rocks, fallen trees, grass and wildflowers), for any of the six peoples (each
building its own way: the cat folk's Sahel mud-brick, the orcs' hide longhouses and ring forts,
the lizard folk's stilt houses over their lagoons, the elves' and dark elves' flowing stone and
great trees), their castles and special places, their homelands' own ground, trees and things
lying about, and their war camps, in 3D from a seed to go round and look at, is at
<https://hoffspot.github.io/conquest/building-lab.html>.

The creature lab, showing every creature of the wilds walking, running, attacking, resting,
struck, knocked down and dying (and the wyvern and the dragon flying and coming down to land), is at <https://hoffspot.github.io/conquest/creature-lab.html>.
The uniform lab, showing each people's soldiers in their uniforms and their officials in their
livery side by side, is at <https://hoffspot.github.io/conquest/uniform-lab.html>.
The fire lab, showing every kind of fire (torches, a brazier, a camp fire, candles) lighting what's
round it at night and the seven fire spells cast again and again, is at
<https://hoffspot.github.io/conquest/fire-lab.html>.
The motion check's contact sheet, drawing each place a motion goes wrong on some people's body (a
joint past its range, something in the body, a foot sliding or in the ground, a hand off its haft)
as it happened, is at <https://hoffspot.github.io/conquest/motion-sheet.html>. Choose a report
there (a CI run's `motion-report`), or run `npm run check:motion` and `npm start` to see your own
(contribution.md, *The motion check*).

The war between the six peoples, played out on a world's map turn by turn (who holds which town,
the forces out, the rulers and how they stand with each other, and the news), is at
<https://hoffspot.github.io/conquest/war.html>.

[docs/GAME.md](docs/GAME.md) describes how the game works: the world, the fighting, the drawing,
the screens and debug mode. [docs/CHARACTERS.md](docs/CHARACTERS.md) describes the character
engine, and [docs/WORLD.md](docs/WORLD.md) the world: its plan, and how it's built from it in
chunks. [docs/WAR.md](docs/WAR.md) sets out the war between the six peoples that's being built,
and how the engine's made ready for other players to hop in and out of a running world.
[docs/WILDS.md](docs/WILDS.md) describes the wild's creatures: what they are, where and how strong,
how they behave, what lingers after their blows and its cures, what they leave, trading between
players, and how they're built and animated in code. [docs/MAGIC.md](docs/MAGIC.md) describes
magic: the schools and how they grow, wands and grimoires, the tomes and their spells, the wonders
the host works, the spellbook, and how every spell looks.

## How to play

**Loading.** The first screen lists everything the game downloads (about 3 MB: the 3D engine,
the game's code, the body characters are made from, its skin details, and the props),
with a bar for each and one for the whole. Then the title screen offers to **Continue** with your
character, or make a **New character**.

**Making a character** takes three steps:

1. **Look.** Choose your **people**: human, elf, dark elf, cat folk, lizard folk or orc. Each
   looks as their people do (elves' long ears, cat folk's ears, tail and fur, lizard folk's
   scales, snout and tail, orcs' tusks), with their own skin colours to choose from, and you'll
   wake in one of their towns, as one of them. Shape the body (build, height, bust, heritage and
   physique), the face, and the colours and hair (skin, eyes, hairstyle, beard). **Random** makes
   someone new, of the same people. Drag across the picture to walk round them; each tab frames
   what it changes.
2. **Weapon.** Everyone starts in a tunic, leather bracers, leather pants and leather boots, and
   chooses one weapon (a bow comes with a quiver of arrows on the back). **Spiked boots** can be
   chosen on their own, or worn with any other weapon (a switch under the list):

   | Weapon | School | Reach | Damage | Attacks a second | Hits |
   | --- | --- | --- | --- | --- | --- |
   | Sword | Melee | Next square | 4–8 | 0.9 | Slash: twists away |
   | Staff | Melee | Next square | 3–7 | 1.0 | Strike: rocks back |
   | Wand | Magic | 7 m | 2–6 | 1.0 | Arcane bolt: a shudder |
   | Grimoire | Magic | 7 m | 4–9 | 0.6 | Fireball: shields their face from the fire |
   | War hammer | Melee | Next square | 6–12 | 0.6 | Crush: knocked back, knees buckling |
   | Bow | Ranged | 9 m | 3–7 | 0.7 | Arrow: a jolt, and it sticks |
   | Spiked gauntlets | Melee | Next square | 2–5 | 1.7 | Punch: the head snaps round |
   | Spiked boots | Melee | Next square | 3–7 | 1.0 | Kick: winded, doubled over |

   The damage is rolled for every blow: any whole number between the two, each as likely.
   Wearing spiked boots with another weapon, you kick too. With a melee weapon (gauntlets
   included), each blow up close is a kick or the weapon at random, both doing the damage halfway
   between the two (a sword and boots: 3.5–7.5, so 4 to 7). With a bow, wand or grimoire you kick
   whoever's next to you, for the boots' own damage, and shoot or cast at anyone further off. The
   kicks are a front kick, a roundhouse, a side kick, a stamp and a spinning back kick, with each
   leg in turn.
3. **Name.** Type one, or ask for a suggestion, and **Begin**.

Your character is saved in the browser, with the town they live in.

**In the town.** You wake in the market square. **Tap or click the ground** to walk there, or
**an enemy** to go and fight them: a red ring round it marks it as your target, and its name
lights up, until it falls or you're told to go elsewhere. **Double-tap** (or double-click) to run there instead, as much
faster than walking as people sprint: 7.9 metres a second to your walking 1.7. Running tires you:
it uses 3 points of **stamina** a second, and anything else gets 1 a second back. You have as
much stamina as hit points (50). Your name and health are in the bottom left corner; while your
stamina isn't full, an orange bar under your health shows what's left; with none left you're out of breath, and walk the rest of the way. Standing still,
you attack whatever is within your weapon's reach on your own: melee weapons reach the eight
squares round yours; ranged ones anything in range that you can see. Every weapon attacks in five
ways (a sword slashes, cuts backhand, chops overhead, thrusts and cuts upwards), never the same
way twice in a row, and fireballs, bolts and spells each have five looks too. **Swipe up from yourself**
(a quick flick upwards, starting on your character) to turn the way the camera looks and go
straight ahead that way, as far as you can until something's in the way: sprinting while you
have stamina, then walking.

**Weapons are put away** out of a fight, each in its place on the body:
- the sword in a scabbard at the left hip;
- the wand in the belt;
- the grimoire closed at the hip;
- the staff, war hammer, bow and the orc's cleaver slung on the back, from a strap across the chest.

You draw yours with a flourish when an enemy comes into sight, when anything's after you, or when
you tap an enemy to fight it:
- the sword's salute and twirl;
- the wand's spinning tip;
- the grimoire opened and its pages swept;
- the staff and hammer heaved over the shoulder;
- the bow swung round and its string plucked;
- a burst of shadow boxing for gauntlets, or of shadow kicks for boots.

It takes a moment before you can strike. Ten seconds after the fight, once no enemy is in sight
or after you, you put it away again. The orc does the same, on its patrol.

**The camera** follows you from your first step, swinging round smoothly (over about a second)
to look from behind you the way you're going. **Drag** (a finger, or the mouse held down) to turn
it round you, and up or down to tilt it; it stays where you leave it while you stand, and once
you walk again it swings back round behind you, facing the way you go. Pinch or scroll to zoom.
In the town, when a building would stand between you and the camera, it comes in closer than
the building, or rises over it.

**Blows leave their mark.** Every blow that lands leaves a mark of its weapon's kind where it
hits, on the body and through the clothes: a sword's cut, a cleaver's gash, an arrow left
sticking out of a bleeding hole, a staff's welt, a hammer's swollen bruise split open, a spiked
fist's row of holes, fire's charred, smouldering burn (smoke and embers rising from it a while),
arcane light's glowing violet veins. Falling below three quarters, a half and a quarter of their
hit points, the blow that did it leaves a much worse wound. Blood sprays with each blow, gushes
from the worst, splashes the ground and, once they're badly hurt, drips from them, leaving a
trail; the fallen lie in a spreading pool. Clothes are cut, torn and burnt through where they're
hit, showing the wound beneath. Healing back above a threshold heals that stage's wounds and
marks (all of them, at full health); coming back to life, all of them.

**Trees** stand about the town and its fields, and a forest round them: oaks with crooked,
spreading limbs, smooth grey beeches, white birches with drooping twigs, Scots pines on bare
orange trunks, spruces in tiers, tall poplars, and little apple trees, every one grown a little
differently, their leaves stirring in the breeze. Each is rooted: its foot swells out over roots
that run into the earth, the bark dark and mossy low down, on a patch of bare earth, moss and
fallen leaves or needles, and its crown casts a dappled shadow.

An orc patrols the fields from the north-west corner, halfway down the west side and back. When
it sees you (within 12 metres, with nothing in the way: walls, houses and trees hide you, a well,
barrels or a cart don't) it chases you and attacks whenever you're
within reach, giving up if it loses sight of you for three seconds. Each blow knocks off hit
points; at none, a character falls. You get up again in the market square five seconds later,
with full health; the orc comes back to its corner half a minute after it falls.

**The tavern.** Facing the market square (or, where it can't, a street) stands *Wenches and Ale*,
its name in gold blackletter on a red board along its front and, hanging from an iron bracket by
the door, a painted sign of a barmaid raising two foaming tankards. **Tap its door**: a green
glow traces round it, and you walk up to it and go in, coming out a couple of steps inside,
turned back to face the door (so it's in view to tap, and tapping the floor round you walks you
there rather than straight back out; the same at the stairs, and outside). The rooms are bigger
inside than the tavern looks from the street, with room to walk about: two metres and more
between the tables. Inside are long tables with benches, candles and tankards; the bar, with
barrels on a rack behind it, each with a brass tap; a great stone hearth, its fire flickering
and throwing embers, with a wild boar turning on a spit over the flames; and stairs up the north
wall. **Tap the stairs** to go up to the floor above, a brothel: the madam's velvet-topped
counter, a chaise longue by a side table with wine and candles, and a wide hallway to four
bedrooms through curtained doorways, each with a canopied bed, a washstand and a chest. Tap the stairwell there to come down, and the
inside of the door to go out again. Each floor is a map of its own: going through, the screen
dips to black and comes up on the other side. Indoors, the walls just in front of you, between
you and the camera, are taken down to their stone footing (and anything else higher than your
head there), so you can always see yourself whichever way the camera looks, while the rest of
the walls stand. Every room has a beamed ceiling, wheels of candles hanging from it on chains:
drag the camera up to look up at it. The rooms are lit by what would light them: the sun through
their leaded windows, in beams through the dusty air, and their hearths, candles, lanterns and
sconces, each flickering. If the orc is chasing you when you go in, it follows you through the door and up the
stairs, and the fight carries on; and if you're set to fight something that goes through a door,
you go after it.

**The tavern's folk.** The taproom is busy: a burly, bearded barkeep in an apron goes between the
bar and the barrels behind it, drawing ale; two serving wenches, in laced bodices and long
skirts, carry tankards between the bar and the tables and set them down; and four patrons sit on
the benches. Upstairs the madam, in a velvet gown, keeps her counter, and in each of the four
bedrooms a courtesan in lace lingerie (black, crimson under a corset, emerald, ivory; lined where
it counts, so nothing explicit shows) waits by her door. When you come into her sight in the
hallway she turns to you and beckons you in with a curl of her finger. Each has a name of their
own. No one fights them, and they fight no one; they're blue dots on the minimap. While you can
see them they pass the time, every several seconds one of five things their sort does: the
patrons raise a toast (the tankards clink), take a long drink, roar with laughter slapping the
table, thump their tankards down or look about; the barkeep wipes the bar, strokes his beard,
leans on it, folds his arms or rubs his neck; the wenches wipe their brows, put a hand on a hip,
tuck back their hair, curtsy or stretch their backs; the madam fans herself, puts her hands on
her hips, toys with her necklace, drums her fingers or smooths her gown; the courtesans twirl
their hair, stretch slowly, cock a hip, blow you a kiss or smooth their hands down their sides.
Stand still with
nothing going on for 15 seconds and you do too: stretching, looking about, rolling your
shoulders, yawning, shifting your weight.

**Going into the other buildings.** Every tavern, smithy, temple and adventurers' guild, in
your town and in every village, town and city out in the world, can be gone into the same way;
each is got ready as you come near. Every other tavern has its own name, sign, taproom and
upstairs (rooms to let, a courtesan or two, or a madam's house). In a **smithy**, named for its
smith, the smith heats the work in the forge, hammers it on the anvil (ringing, throwing sparks)
and quenches it hissing in the trough, while the apprentice pumps the bellows (the fire flares)
and turns the grindstone. A **temple** is to all of the Six under its patron: a whitewashed nave
with the patron's altar and statue, a shrine to each of the others, pews and candles; a priest
in white vestments blesses the pews and lights the shrines' candles, and worshippers pray. In an
**adventurers' guild**, a cheerful receptionist in the guild's uniform, her hair in twin tails,
stamps notices behind her counter, and adventurers of every calling read the quest board and
drink at the tables; she'll sign you up (Rank: Copper), though the board's jobs can't be taken
yet.

**Talking.** Tap one of the folk and you walk up to them (or to the bar, or the other side of a
table) and talk: their name and what they are, what they say, and what you can say back (tap a
reply, or press its number). They stop and turn to you. Each sort has their own things to talk
about: the barkeep sells ale and gossips about the orc, the wenches bring food and know everyone,
the patrons have news and opinions, the madam offers a room, the courtesans flirt, dance, sell
their callers' secrets and ask a favour; and some have their own stories.
They remember you, and what you've asked; and what you learn from one, another may know you
know. Choices that would cost something or change the world (buying, renting, taking on a job)
are there, but for now only the talk goes on. Walk off, or press Escape, to stop.

**Out of the town.** Its streets carry on as roads into the world round it, over rivers on
bridges, through fields, meadows and woods; walk anywhere you can, as far as you like. The world
is drawn round you as you go, with no loading screens: only its far edge in the fog is ever
being built. The hamlets, villages, towns and cities of the world plan are there, each with its
own buildings; the ruins and the enemy camps are still to come.

**The minimap**, in the top left corner (the spellbook, journal, pack and menu buttons are in the top right), shows where you are from above: out in
the world, the 128 metres or so round you, its roads, rivers, roofs and trees; inside, the
whole floor, its walls, furniture and stairs. On it are a pale wedge the way you're looking, you (an arrow pointing the way you face), where
you're going, and the orc when it's where you are (red; ringed when it's your target). Every
tavern, smithy, temple and guild you've been inside has an icon over it: a foaming tankard, an
anvil, a temple's columns, crossed swords and a shield. Tap it to walk there, or tap the orc on it
to go and fight it; double-tap to run.

**The world map.** Hold your finger (or the mouse) on the minimap, or press M, and the whole
world opens full screen, the game paused under it. A fog lies over every 64-metre patch of the
world you haven't set foot in, lifting as you walk into each; what you've seen is shown as the
minimap shows it, with the names of the places you've been and the icons of the buildings you've
gone into. Drag to look about, pinch or scroll to zoom, and close it with the cross, Escape or M.
What you've found is saved with your character.

**Pins and running far.** On the world map, hold your finger (or the mouse) somewhere you've been
to drop a pin there: out in the world a column of blue light rises from it high into the sky, seen
from far off, and a thin glowing line runs along the ground from your feet the way you'd go; the
map shows the way too. Hold on the pin (or tap the pin button) to take it away. Tap the map twice
anywhere to run there: the map closes and you set off, along the roads where they help, round
lakes and over bridges and fords; if there's no way there, the map says "A path cannot be found".
Anything else you do stops you. Your pin's saved with your character.

**Spells, and the action wheels.** Press and hold on yourself or on an enemy, and a see-through
wheel opens round them, cut in eight like a compass: N, NE, E, SE, S, SW, W and NW. Keep holding
and flick towards a slice to do what's in it; let go in the middle to change your mind. Flick
down (S) and the wheel turns over to its other side, wheel two, opened again under your finger.
What's on your own wheel and an enemy's, both sides of each, you choose in **Game options,
Action wheels**: the spells and blows you've learnt, and draughts, meals and ale from your pack
(each showing how many you have). You start with **Vigor** on yourself (a little healing) and
**Stun** on an enemy. Each element's school opens with its first spell's tome, 25 gold at any
adventurers' guild: **Burn**, **Rumble**, **Hurt** and **Blister** (fire, earth, air and water),
waiting greyed on your enemy wheel until you've read them. Each spell has its own
cooldown: while it runs, its slice is greyed over, and the grey sweeps back as it passes. A flick
at a greyed slice, or at an empty one, is refused, and a spell that can't be cast (out of reach,
out of sight, already at full health) says why.

**Quick actions.** In a fight (an enemy you've set on, or anyone after you), four slots rise from
the bottom of the screen, your name and the zoom buttons lifted above them. Tap one to use what's
in it at once: an attack, a hex or a blow on the enemy you're fighting, and anything else (Vigor,
a ward, a draught) on yourself. Attacks are greyed while no enemy's set on, and each is greyed
over while it cools down, as on the wheels. You start with Vigor, Stun, Burn and a healing
draught; hold a slot (or go to **Game options, Quick actions**) to choose what's in it. On a
keyboard, 1 to 4 tap them.

**Magic.** Each school grows with its spells that land, bringing its next spell at each tier:
Healing up to **Astral Heal** at the fifth, and each element up to its seventh (**Hellfire**,
**Disintegrate**, **Ionize**, **Absolute Zero**), which fills the screen. A wand or grimoire in
hand makes spells stronger, by 10% to (very rarely) 100%. Other spells are learnt from **tomes**,
now and then found on the wild's creatures with hands, or given by the adventurers' guilds for
their harder work: wards and cures, Teleport, Invisibility, Summon (a creature, or another player:
with **Resist all summons** in Game options you'll always say no), Zombify, Fear, Polymorph and
more. The **spellbook** (its button, or B) shows it all, and puts a spell on a wheel. See
[docs/MAGIC.md](docs/MAGIC.md).

**Gear.** You've a slot for each part of you: head, amulet, cloak, chest, bracers, gloves, belt,
legs, boots, two rings, and both hands. A two-handed weapon leaves nothing for the other hand (a
bow takes a quiver there); a one-handed one leaves it for a shield. The better made a piece is,
the more bonuses are rolled on it (a *Keen sword of the Bear*), and a legendary one has a name of
its own. Each people's soldiers wear a uniform in their own colours, with their emblem (the
humans in royal blue and gold, the elves in forest green and silver, the dark elves in violet and
black, the cat folk in indigo and saffron, the lizard folk in crimson and turquoise, the orcs in
blood red and black), and their officials a livery; you'll know whose they are at a glance.
Soldiers sometimes drop a piece of theirs, and the smiths sell their own people's. Wear three or
six of a people's pieces for their set's bonuses, and their helm, chest and cloak together to
pass for one of their soldiers (till one sees through it, or you strike one of them).

**The pack** (its button, or I) shows you in the middle of your gear, live, each slot round you
(the other hand greyed out behind a two-handed weapon), with the totals of all you wear, and 40
slots for what you carry, two pages of 20, each a stack of things alike with its icon and how
many; "Sort" puts them in order. Tap anything to see what it does (a piece in the pack compared
with what you're wearing); hold a piece of gear to put it on, or, worn, to take it off; hold
anything else (or right-click) and a wheel of what to do with it opens: drink or eat it, put it
on an action wheel, split the stack (choosing how many), sell it when trading, throw it away
(with a moment to undo), or drop it. Drag a stack onto one alike to put them together, or
elsewhere to move it; drag gear onto yourself to wear it. What's dropped lies on the ground for a
while, a bundle with its icon over it, for you or anyone playing with you to tap and pick up.

**Sound**, in three kinds, each with its own volume:

- **Effects**: swords, staffs, hammers and fists swish; bows twang and spells crackle and chime;
  every kind of blow sounds different where it lands; feet step on cobbles, dirt, grass and
  wooden boards; the tavern's door creaks open and bangs shut.
- **Environment**: the wind blows, birds sing, and the trees near you rustle; in the tavern, the
  hearth's fire crackles.
- **Music**: a four-minute score in the style of *The Bard's Tale* (1985), played on recordings
  of real, old instruments: an alto recorder, an ocarina, a folk harp, a strumstick (a
  small plucked folk instrument, for a lute), a Renaissance chamber organ, hand chimes, a frame
  drum and a tambourine, with harpsichord arpeggios in the bridge. It's in D Dorian, in 3/4, with
  an intro, verses, choruses, a bridge, a quiet verse, a last chorus and an outro that leads back
  into the intro, so it loops without a seam. It's quiet to start with, under the effects.
  In the tavern it fades into a lively jig, led by a lute (played on a classical guitar's nylon
  strings, the nearest to a lute's gut), with a recorder, a frame drum and a tambourine: in 6/8,
  in D Mixolydian with a strain in B minor, about a minute and a half, looping. Upstairs you hear
  it through the floor, quieter and muffled; back outside, the town's music carries on where it
  left off.

The effects and the town's sounds are made in code as the game starts (in a worker, so nothing
waits for them); the music's recordings (about 1.1 megabytes) are downloaded meanwhile. Effects and
the town are heard from where you stand: quieter further away, and to the left or right.

**Game options**, in the menu: turn the minimap on or off, turn all the sound on or off, and set
how loud the effects (50% to start with), the environment (40%) and the music (35%) are. The
defaults suit a phone at about 40% volume, with plenty of room to turn each up. They're
remembered.

| Action | Touch | Mouse and keyboard |
| --- | --- | --- |
| Walk | Tap the ground | Click the ground |
| Run | Double-tap the ground | Double-click (or Shift-click) the ground |
| Fight | Tap an enemy (double-tap to run at them) | Click an enemy (double-click to run at them) |
| Go through a door, up or down stairs | Tap the door or stairs | Click the door or stairs |
| Talk to someone | Tap them, then tap a reply | Click them, then click a reply or press its number; Escape to stop |
| Zoom | Pinch, or the + and − buttons | Scroll, or the + and − buttons |
| Walk or fight on the map | Tap the minimap (double-tap to run) | Click the minimap (double-click to run) |
| Cast a spell | Hold on yourself or an enemy, then flick to a slice | Hold the button down on them, then flick the mouse |
| Quick action (in a fight) | Tap one of the four along the bottom; hold one to change it | Click one, or press 1 to 4 |
| Pause, Game options | The menu button | The menu button or Escape |

**Playing together.** Anyone playing can open their world to others: in the menu, **Invite
others** gives a four-letter code, and a link with it in. Others choose **Join a world** on the
title screen and type the code (or open the link), and come in with their saved character (or
make one first). Each comes as one of their own people, by one of their people's towns if it
isn't yours, so they're at peace or at war with you as your peoples are. Come and go as you
like: the world goes on, and its menu no longer pauses it while anyone else is in it. The world is
yours, the one who opened it: what others do is done in it, and when you close it to others (or
leave), they're told, and go back to their title screen. A link that drops a moment (a phone
moving from Wi-Fi to its mobile network) comes back by itself, and everyone's shown what's
happening meanwhile: reconnecting, the host paused, or waiting for the host. What their
characters grow into, carry and earn goes with them. Games play together through the relay on the game's server
(`npm start` serves both); from GitHub Pages, add `?relay=wss://your.server/relay` to use one.
See [docs/WAR.md](docs/WAR.md#playing-together-m11).

**Debug mode.** The switch on the title screen shows an overlay, on every screen, of how the game
is running: frame rate and a graph of frame times, how long updating and drawing take, what's
drawn (draw calls, triangles, textures, shaders), memory, the GPU and screen, the battle, and how
long each part took to download and build. Its controls change the drawing quality, render
scale and shadows, and show the squares characters walk on and their paths. See
[docs/GAME.md](docs/GAME.md#debug-mode).

## Quick start

You need [Node.js](https://nodejs.org/) 22 or newer.

```sh
npm install
npm start
```

Open <http://localhost:8080>. To go straight into a game with a random character, open
<http://localhost:8080/?play> (add `&weapon=bow`, `&boots` for spiked boots too, `&seed=12` for another town,
`&people=elf` for one of another people, or `&quality=low`). `?join=ABCD` opens Join a world with a
world's code in it.

The server also carries the relay that games playing together talk through (at `/relay`: a
WebSocket), so others on your network can join your world at your computer's address.

The game is plain ES modules with no build step, so any static web server can serve the
`client/` folder.

| Setting | How |
| --- | --- |
| Port | `PORT=3000 npm start` (default 8080) |
| Network interface | `HOST=127.0.0.1 npm start` (default: all interfaces) |
| Restart the server when its code changes | `npm run dev` |

To play on a phone on the same Wi-Fi network, open the address the server prints, for example
`http://192.168.1.20:8080`, or use the online copy. For full screen without the browser's
toolbars, install it: on iPhone tap **Share** then **Add to Home Screen**; on Android use
**Install app** in the browser's menu. Installed from the online copy (or any HTTPS address), it
also plays offline.

### Hosting on GitHub Pages

[.github/workflows/pages.yml](.github/workflows/pages.yml) publishes the `client/` folder to
GitHub Pages every time `main` changes, once the lint and unit tests pass. To set it up, in the
repository's **Settings > Pages**, set **Source** to **GitHub Actions**. The workflow can also be
run by hand from the **Actions** tab.

## Development

Contributing, with Claude Code or without it: [contribution.md](contribution.md) explains how to set up,
the checks CI runs and how to run them, and how to open a pull request that's safe to merge.

```sh
npm run lint        # ESLint
npm test            # unit tests (Node's built-in test runner)
npm run test:e2e    # plays the game in Chromium using Playwright
npm run check       # lint + unit tests
npm run build:manifest  # after changing what the game downloads: lists it for the loading screen
npm run vendor:three    # after changing the three version in package.json: copies it to client/vendor
npm run build:characters -- --mpfb2=../mpfb2  # rebuilds client/characters from MakeHuman's MPFB2
npm run build:music     # remakes client/music, the music's instrument recordings, from the VCSL
npm run e2e:durations -- report.json  # keeps how long each browser test took, for CI's split
```

`npm test` checks that `client/js/app/manifest.js` (the loading screen's list of files and their
sizes) is up to date, so run `npm run build:manifest` after changing the game's code or data. The
browser tests need Chromium: run `npx playwright install chromium` once, or set `CHROMIUM_PATH`
to an existing Chromium or Chrome executable. Every browser test has a page of its own, in a
browser of its own (`e2e/fixtures.js`: without a GPU, the drawing a test leaves queued in its
browser's GPU process would slow the next test down by a minute or more), so they run side by
side (on half the machine's cores; `--workers=N` for more or fewer). They draw at half the
screen's pixels (`deviceScaleFactor: 0.5`, playwright.config.js: a fifth quicker in software
rendering; a test of the pixels themselves sets its own). A test that waits on the game's time
stops it and plays it on by hand (`playUntil` in e2e/pellagos.spec.js): drawn without a GPU, a
frame takes a second or more and the game goes on a tenth of a second a frame at most, so
waiting on it as it's drawn is waiting on how slow the machine is. CI splits them
between eight jobs run at once, each about as long as the others: `scripts/e2e-shard.js` gives
each job its share by how long each test last took (`e2e/durations.json`; a test not timed yet
counts as the median), and the job runs it with `--test-list`. After adding tests or making them
much slower or quicker, time them one at a time as CI runs them and keep the times:
`PLAYWRIGHT_JSON_OUTPUT_NAME=report.json npx playwright test --workers=1 --reporter=json`, then
`npm run e2e:durations -- report.json`. CI runs for each pull request, and for main as each is
merged; lint and the unit tests are a job of their own.

While the game is running, the browser console reaches it through `pellagos`: for example
`pellagos.game.battle.actor("orc")`, or `pellagos.game.advance(10)` to play on ten seconds
without drawing (handy on slow machines), then draw once (`{ render: false }`: not even that, as
the browser tests do stepping through what happens).

```
client/                 The game (static files served to the browser)
  index.html            The screens: loading, title, making a character, the game, the menu, debug
  styles.css            Layout for every screen size, from phones to desktops
  manifest.webmanifest  Lets the game be installed as an app
  sw.js                 Service worker: keeps a copy of the game for offline play
  characters/           The body characters are made from (made by npm run build:characters),
                        MakeHuman's texture masks, and motion capture clips
  models/kaykit/        KayKit Medieval Hexagon models (CC0), no longer used by the game (its props
                        are its own now), kept for serving glTF
  fonts/                UnifrakturMaguntia, the blackletter of the tavern's signs (SIL OFL)
  music/                The music's instruments: short recordings of real ones, as MP3s (made by
                        npm run build:music from the Versilian Community Sample Library, CC0)
  images/icons/         The app's icons
  character-lab.html    The character lab (with character-lab.css)
  world-map.html        The world map (with world-map.css)
  town-map.html         The town map (with world-map.css)
  war.html              The war between the peoples (with world-map.css and war.css)
  building-lab.html     The building lab (with world-map.css)
  creature-lab.html     The creature lab: every creature of the wilds, doing everything it does
  uniform-lab.html      The uniform lab: each people's soldiers and officials (with world-map.css)
  fire-lab.html         The fire lab: every kind of fire and the fire spells (with world-map.css)
  vendor/three-r186/    Three.js (minified by scripts/vendor-three.js; loaded through an import map)
  vendor/recast-navigation-0.43.1/  Recast and Detour as WebAssembly (scripts/vendor-recast.js): the
                        navigation meshes (core/navigation.js)
  js/main.js            The screens, from loading to playing (no Three.js: it loads first)
  js/app/               The game on the page
    loader.js           Downloads everything, counting every byte; manifest.js lists it
    session.js          The 3D view and the character kit, and starting games
    creator.js          Making a character; heroes.js has random ones and names
    game.js             Playing: the world, the battle, the characters, taps and the camera
    camera.js           How the camera follows the player from behind, and turns and tilts by drag
    doors.js            The doors and stairs to tap, and the green glow round them
    hud.js              Health, stamina, names, damage numbers and messages over the game
    wheel.js            The action wheels: hold, flick, two sides, cooldowns; icons.js draws
                        their icons, and every item's; wheelsetup.js sets what's on them
    quickbar.js         The quick actions: four slots up from the bottom in a fight, tapped to
                        use on the foe or the player; quicksetup.js sets what's in them
    minimap.js          The minimap: the map the player is on from above (out in the world, the
                        patch round them), with everyone on it; mapicons.js the buildings' icons
    worldmap.js         The world map: the whole world, under a fog where the player hasn't been
    debug.js            Debug mode's overlay
    talk.js             The talk: who's talking, what they say, and the replies to choose from
    pack.js             The pack: the player live on a paperdoll, a slot for each part of them;
                        two pages of stacks (dragged, held, split, dropped, thrown away,
                        sorted); the skills; a shop's wares. gearinfo.js says what gear does
    journal.js          The journal: the player's rank, their requests, their people, their
                        company
    spellbook.js        The spellbook: the schools, how far they've grown, every spell known
                        and still to come; spellicons.js draws each spell's icon
    fate.js             The war's great turns for the player's people: victory, brought under
                        another, fallen, risen
    together.js         Playing together: a world opened to others, or another's joined, through
                        the relay (a WebSocket)
    save.js             The saved character, what they've grown into and carry, what's been
                        said and found, and settings (local storage)
    device.js           Full screen and the service worker
  js/core/              The rules. No DOM or Three.js, so they also run in Node
    overworld.js        The world: 8 km of it on 1-metre squares, made a chunk at a time from its
                        plan, with the town set in where the player starts
    settlements.js      Every other settlement, laid out as the world near it is first made
    sites.js            Each people's castle, special places and watchtowers, set down where
                        the plan puts them, clear of roads and water, facing the nearest road
    wilds.js            The land's own features: boulders, fallen trees, bushes... (where, and
                        the squares they take); noise.js the smooth noise they're laid out by
    world.js            The town: on 1-metre squares, fields, trees, where everyone starts, the
                        tavern, and its maps and the links between them
    grid.js             Reading any map's squares (blocked, opaque, ground), in rows or chunks
    navigation.js       Navigation meshes (Recast and Detour): the world's tiles and each map of
                        squares' own, and the ways over them the battle walks
    navigation/         settings.js their measures; tiles.js and squares.js what a tile's made
                        from; bake.js baking one; recast.js loading Recast
    steps.js            Work done a step at a time (generators), or all at once
    interiors.js        Inside buildings: the tavern's floors, drawn as plans of their squares
    insides.js          Every building that can be gone into: its door, and its floors and folk
                        made the first time they're wanted
    explored.js         What the player has found: the buildings gone into, the chunks walked
    host.js             The one authority over a running world: its players (by id), their
                        commands, the buildings near them got ready, kept and made again
    wire.js             What goes between host and players, and into a save, as text
    netplay.js          Playing together: what's done in a hosted world, sent to those who've
                        joined it and done again on their copies of it, step for step
    war/                The war between the peoples (see docs/WAR.md): war.js the realms, towns,
                        forces, turns and conquest; peoples.js their temperaments and rulers;
                        roads.js the ways their forces go; news.js the war told in words;
                        muster.js where a town's guards stand and its patrols go, how a camp is
                        laid out, and where its raids come from
    battle.js           Moving (over the navigation meshes, round each other), fighting,
                        damage, dying and coming back; the orc's patrol
    weapons.js          The weapons and their attacks (and the wild's creatures' own)
    creatures.js        The wild's creatures: what each is, where and how strong (docs/WILDS.md)
    spoils.js           What they leave: their parts, and what the guild pays for them
    afflictions.js      What lingers after some of their blows (poison, a web...) and the cures
    progress.js         Growing stronger: skills and their trees, abilities, gear and its make,
                        shops, loot, gold and the pack; and from them, might
    gear.js             Gear: a slot for each part of a player, what goes in each (two-handed
                        weapons), bonuses rolled on it, each people's uniform, sets, disguise
    standing.js         Standing in a people: its ranks, the requests the rulers make, the
                        armoury's gifts and counsel's weight
    spells.js           Magic: the schools and their tiers, the hexes, and the tomes' spells
                        (docs/MAGIC.md)
    roles.js            Classes of people (barkeep, patron...): their titles and five rests each
    dialogue.js         Conversations: trees of what's said and the replies, conditions, effects
    names.js            People's names, drawn from the world's seed
    variety.js          Choosing one of a few ways of doing something, never the last one again
    random.js           Seeded random numbers
    lore/               The world's stories: gods.js the Six, taverns.js taverns' names and signs
    setpieces/          Town (and castle) layouts, and the pieces they're made from: town.js lays
                        out every kind of settlement, exact.js does their sums the same everywhere
    worldplan/          The world plan (see docs/WORLD.md): plan.js lays it out from a seed;
                        terrain.js the land, climate, rivers and territories; settle.js the
                        settlements, roads, sites and camps; races.js the peoples, lands and foes
  js/audio/             The sound: dsp.js has the building blocks; synth.js makes the effects
                        and the town's sounds (worker.js away from the page); score.js writes
                        the town's music and tavern.js the tavern's; instruments.js and
                        samples.js are the band's recordings; sound.js plays it all
  js/world/             Drawing the world
    view.js             The renderer, lights, sky, the camera (clear of buildings), quality
                        levels, the cutaway
    ground.js           The ground: textures blended square by square, in each land's colours
                        and each people's homeland its own ground
    chunks3d.js         The world round the player, a chunk at a time as they go: ground, water,
                        bridges, trees, the land's features, the undergrowth near the player,
                        and the settlements' buildings, each drawn a step at a time in each
                        frame's budget
    layouts.js          The settlements a little way ahead, laid out in a worker
                        (layout-worker.js) for the world to take when it first wants them
    town3d.js           The town's buildings, props and trees, merged into few meshes
    interiors3d.js      Inside the buildings: the taverns', smithies', temples' and guilds'
                        rooms and furniture, the fires, the boar on its spit, and taking
                        down the walls between the camera and the player
    art/                The art the town is built with: engine/ (solid.js's shapes, the
                        textures' painters.js, materials.js, and atlas.js, the one material
                        everything built is drawn with) and kits/ (house.js, with framing.js and
                        roofs.js; landmarks.js, props.js, trees.js; wilds.js, the land's rocks,
                        fallen trees, grass, flowers and the rest; and signs.js and emblems.js,
                        the taverns' and temples' signs), and peoples/ (each other people's
                        own houses, landmarks, special places, castles, walls, props and war
                        camp tents: cat.js, orc.js, lizard.js, elf.js, darkelf.js...)
    banners3d.js        The peoples' banners by their towns' roads out, in their colours
    camps3d.js          The war's camps near the player: each people's tents round a fire
    sky.js              The sky outdoors: blue overhead to the haze at the horizon, the sun,
                        clouds drifting
    flyers3d.js         What flies over the world: flocks of each land's birds, wyverns over
                        the wild lands, the dragon near its lair
    drops3d.js          Things dropped on the ground: a bundle, its icon floating over it
    avatar.js           A character in the world, following its place in the battle
    effects.js          Arrows, bolts, fireballs, sparks, dust, fire, arcane light, blood and
                        its splashes and pools, smoke and embers, the target ring, heals'
                        light and the stars round a stunned head, in five looks each; the
                        creatures' fire breathed, venom and lava spat, webs, roots, and what
                        rises off whoever something lingers on
    spellfx.js          How every spell looks, cast and landing, grander the higher its tier:
                        the seventh of each element filling the screen
    ailments3d.js       What lingers drawn on whoever has it: a web, roots, ice, a curse's motes
    wounds.js           Battle damage: each blow's mark and each threshold's wound, painted on
                        the body and its clothes
    squares.js          Debug mode's squares and paths
  js/beasts/            The wild's creatures, built and animated in code (see docs/WILDS.md):
    looks.js            How each looks; beast.js puts one in the world as an avatar is
    sculpt.js           A body's shapes blended into one skinned mesh; its pieces folded in
    quadruped.js        Four legs: faces, tails, legs of every kind, bats' wings
    arachnid.js         Spiders and scorpions, their legs reaching the ground (two-bone IK)
    biped.js, bones.js  Skeletons (every bone near enough) and treants; cloth.js a cape
    blob.js, flyers.js  Slimes (a magma slime's molten crust and sparks); swarms, wisps, frogs
  js/characters/        The character engine (see docs/CHARACTERS.md)
    body.js             Loading and shaping the body; macro.js and details.js are the sliders
    rig.js              The skeleton, anatomical joint angles and their limits, two-bone IK
    character.js        A character: its meshes, look and equipment
    skin.js, hair.js    Painting skin and eyes; growing hair and beards
    garments.js         Clothing and armour fitted to the body
    items.js            Weapons, shields, helmets and packs; equipment.js has slots and sockets
    gait.js             Walking and running data; locomotion.js walks and runs a character with it
    actions.js          Attacking and casting (five ways of each), flinching when hit, falling
    bvh.js              Motion capture: reading BVH files and retargeting them
    presets.js          The human, heroine and orc, and Wenches and Ale's folk
    folk.js             Everyone else's looks, made up from their part, sex, seed and people
    peoples.js          The other peoples' bodies, skins, ears and tails (elves, cat folk...)
    soldiers.js         The peoples' soldiers' looks, of their people, carrying what they fight with
    liveries.js         Each people's colours and emblem: their soldiers' uniforms, their
                        officials' livery, and how a player's gear is drawn
  js/lab/character-lab.js  The character lab
  js/lab/uniform-lab.js The uniform lab: each people's soldiers and officials side by side
  js/lab/world-map.js   The world map
  js/lab/town-map.js    The town map
  js/lab/war.js         The war
  js/lab/land.js        The land of a world plan painted as a picture, for the maps
  js/lab/building-lab.js  The building lab
  js/lab/fire-lab.js    The fire lab
server/                 A static file server for playing locally (npm start), and the relay that
                        games playing together talk through (relay.js)
test/                   Unit tests
e2e/                    Playwright browser tests, and how long each took (durations.json)
scripts/                vendor-three.js, build-characters.js, build-manifest.js, build-music.js,
                        build-clips.js (the lab's Mesh2Motion clips), vendor-recast.js,
                        e2e-shard.js and e2e-durations.js (CI's split of the browser tests)
.github/workflows/      CI (ci.yml) and publishing to GitHub Pages (pages.yml)
docs/GAME.md            How the game works
docs/CHARACTERS.md      The character engine, and the research behind it
docs/WORLD.md           The world: laid out from a seed as a plan, and built from it in chunks
docs/WAR.md             The war between the peoples, and playing with others (hop in, hop out)
docs/WILDS.md           The wild's creatures: roster, tiers, behaviour, and how they're built
docs/MAGIC.md           Magic: the schools, wands, tomes, wonders, the spellbook, and the spells' looks
docs/MODERNIZATION.md   The history: the book's Last Colony, modernized, before Pellagos replaced it
```

## Credits and license

- The KayKit Medieval Hexagon Pack by Kay Lousberg (<https://kaylousberg.com>), CC0
  (`client/models/kaykit/LICENSE.txt`): the town's props were these until the game built its own.
- The treasure chest (its model and its opening) is from the JMI 3D Toolkit by vidarr101
  (<https://github.com/JustMoreInnovation/foundry-vtt-modules>), MIT license
  (`client/models/jmi/LICENSE`).
- Houses laid out with a facade grammar after Wonka and Müller's split grammars; their jetties,
  timber framing and windows sized after the carpenters' own, and BlendBuildingCreator
  (<https://github.com/plastdrake/BlendBuildingCreator>), studied, not copied.
- Characters: the body, its shapes, skeleton and skin weights, the texture masks and the walk and
  zombie walk motion capture clips are from MakeHuman (<https://github.com/makehumancommunity>),
  CC0. Gait data from the normal datasets bundled with pyCGM2 (<https://github.com/pyCGM2/pyCGM2>).
  The character lab's idle, walk, run, sword attack and death clips are Quaternius's Universal
  Animation Library as packed by Mesh2Motion (<https://github.com/Mesh2Motion/mesh2motion-app>),
  CC0 (`client/characters/animations/mesh2motion.glb`, made by `npm run build:clips`).
- Town layouts after Watabou's Medieval Fantasy City Generator
  (<https://github.com/watabou/TownGeneratorOS>); castle pieces after Castle Builder by Jon
  Rubashkin (<https://github.com/JonRubashkin/Castle-Builder>).
- Music's instruments: recordings from the Versilian Community Sample Library by Versilian
  Studios (<https://github.com/sgossner/VCSL>), CC0, trimmed and made into MP3s by
  `scripts/build-music.js` (with its SFZ files from <https://github.com/smpldsnds/sgossner-vcsl>).
  The tavern's lute is FreePats' Spanish classical guitar
  (<https://github.com/freepats/spanish-classical-guitar>), CC0.
- The tavern's lettering: UnifrakturMaguntia by j. 'mach' wust (after Peter Wiegel), SIL Open
  Font License 1.1
  (`client/fonts/UnifrakturMaguntia-OFL.txt`).
- 3D engine: [Three.js](https://threejs.org) (MIT license, in `client/vendor/three-r186/LICENSE`).
- Navigation meshes: [Recast and Detour](https://github.com/recastnavigation/recastnavigation) by
  Mikko Mononen (zlib license) as built by
  [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js) by Isaac Mason (MIT
  license), in `client/vendor/recast-navigation-0.43.1/` with both licences.

This repository began as a modernization of Last Colony, the real-time strategy game from
[*Pro HTML5 Games*](https://www.apress.com/9781484229095) by Aditya Ravi Shankar. Pellagos has
replaced it (the book's game is in the git history, and
[docs/MODERNIZATION.md](docs/MODERNIZATION.md) describes it); the book's license for its code and
assets is in [LICENSE-BOOK-CODE.txt](LICENSE-BOOK-CODE.txt).

## Devlog

Working through the book Pro HTML5 Games, with all code and assets from the supporting materials.
This application will be neither good nor bug free so YMMV.

- 1/28/2022 Currently at listing 6-15
- 2/1/2022 Up to listing 6-19
- 2/15/2022 AM - Through end of chapter 6
- 2/15/2022 PM - Listing 7-3
- 2/22/2022 AM - Listing 7-6
- 2/28/2022 AM - Up to Listing 7-8
- 3/7/2022 PM - Listing 7-9
- 3/8/2022 PM - Working on Listing 7-10 up to processActions
- 5/3/2023 PM - Working to get back in the saddle
- 5/5/2023 AM - Got Github linked back up. Installed Copilot. Getting back to correct spot in code
- 6/19/2023 PM - Trying to enable new laptop
- 7/2/2025 AM - Since I'm never going to put in the direct work, using this project to learn about setting up Agentic AI. We'll see what that can do.
- 9/23/2026 - Replaced the partial first-edition code with a modernized version of the complete game from the 2nd edition's Chapter 13 (see docs/MODERNIZATION.md).
- 9/25/2026 - Replaced the strategy game with Pellagos: one character, made by the player, against an orc, in a town in real-time 3D (see docs/GAME.md).
