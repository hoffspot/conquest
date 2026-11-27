# Crafting

The owner asked for it on 15 November 2026: the wild's drops made worth more, as what gear is made
of at a shop that works it. Every piece of gear there is can be made (all 44 of core/gear.js
`GEAR`), at a crafter's, of a metal, a wood, a cloth, a leather or a gem as its main material,
something of another kind as its second, and, if the player likes, an essence: a creature's part
kept for what's in it, a demon's horn or a black widow's venom gland. What it's made of decides
everything about it: how well made it is, what it's called, and every power it has. "An
Adamantite Demon Sword" is an adamantite ingot, a wyvern's scale for its grip and a demon's horn,
very rare, with fire on every blow.

This is the system's reference. It's built in five stages (*The five stages*, at the end), the
first of which is this page and the data and pure rules it describes:

- `client/js/core/materials.js`: the ingredients (`INGREDIENTS`, and the commoner ones sold at the
  shops, `MATERIALS`), the powers they bring (`FAMILIES`, `RANGES`, `MAKE_STRENGTH`), the new
  blows (`ON_BLOW`, `BLOW_CAP`, `UNHOLY`), and the new creatures, what each borrows and what it
  leaves (`NEW_BEASTS`: in the world since stage 3, *New beasts*).
- `client/js/core/recipes.js`: a recipe for every piece (`RECIPES`), the crafters (`CRAFTERS`),
  which settlements keep which (`CRAFTER_TOWNS`), what gear broken down gives back (`SALVAGE`),
  and the fee (`CRAFT_FEE`).
- `client/js/core/crafting.js`: the rules, pure, with no clock and no `Math.random`, for the host to
  run in lockstep and the pack to show first: what a crafter makes (`recipesAt`), why it can't
  (`craftRefusal`), what a piece would be (`previewOf`: its make, name, each power's range, its
  fee), what a pack's short of (`lackingIn`), the piece made (`craftItem`), what gear broken down
  gives back (`salvageOf`, `salvagesAt`, `junkSalvage`), and where an ingredient comes from and
  what it's used for (`sourcesOf`, `usesOf`).
- The new creatures' parts in core/spoils.js `PARTS` (fifteen, each left by something since stage 3),
  the sold materials in core/progress.js `ITEMS` (`material: true`), and their pictures in
  app/icons.js (two new kinds, a cut `gem` and a `bolt` of cloth).
- `test/crafting.test.js`.

Stage 2 put its rules in the game, the host's to run the same on every copy of the world:

- the seven new blows (*The new blows*) as bonuses there are (core/gear.js `STATS`), kept on what's
  made (progress.js `thingOf`), totalled no more than `BLOW_CAP` each (progress.js `bonuses`), said
  on a piece's card and among the totals (app/gearinfo.js), put on the hero in the battle (host.js
  `#outfit`, the actor's `blows`), striking (battle.js `#onBlow`, *How they strike*) and counted in
  a hero's might (strength.js `weaponHarm`, might.js);
- making and breaking down at a crafter's (host.js `#craft`, `#salvage`, `#salvageJunk`:
  *Multiplayer*), at every crafter there is, a capital's to the legendary (*The crafters*);
- `NET_VERSION` 231; `test/crafting-host.test.js`.

Stage 5 put it before the player (*What the player sees*, below; docs/GAME.md *Crafting*): a
crafter's Craft tab, breaking down, an ingredient's card, the bestiary's parts in their makes'
colours, the new blows seen, and sounds for making and breaking down. Stage 3 put the new beasts
in the world, and what they and some creatures there were leave (*New beasts*); stage 4 the four
new crafters' shops in the settlements that keep them, their keepers and their "What can you
make?", and the materials on every crafter's shelves (*The crafters*).

## How a piece is made

1. **At a crafter's.** Each crafter lists everything it makes (`recipesAt`): each piece it makes,
   in every main material it works, with what goes with it and what it asks.
2. **The player fills its slots** (`RECIPES`: each piece's three): its main material, so many of
   it (a sword one ingot, plate three); its second, of another kind (a sword's leather grip, an
   axe's wooden haft, a bow's string of cloth, a ring's metal setting); and an essence, one of any
   creature's parts, or none.
3. **What it'll be is shown first** (`previewOf`): its make, its name, each power with the range
   it can come out in, a legendary weapon's effect, the fee and what the ingredients are worth.
4. **Made at once.** The fee's paid, the ingredients are taken from the pack, and the piece is in
   it, its powers rolled within the ranges shown (`craftItem`), of the maker's might's level.

### Its make

A piece is as well made (core/progress.js `QUALITIES`) as its main material, but never more than a
make above the poorest of what goes with it (`MAKE_ABOVE`, 1): its second, that is. The essence is
left out of that: it can only add a power, never lower the make. So:

| Main material | Second | Essence | Make |
| --- | --- | --- | --- |
| Adamantite (very rare) | Wyvern scale (rare) | Demon's horn | very rare |
| Orichalcum (legendary) | Tanned leather (common) | none | fine |
| Orichalcum (legendary) | Drake scale (very rare) | Rat tail | legendary |
| Iron (common) | Dreadthorn scale (legendary) | Dreadthorn's heart | common |
| Star ruby (legendary) | Gold (masterwork) | none | rare |

The sold leathers, woods and cloths go no further than fine, so what's made only of what's bought
is masterwork at the best; anything finer wants what's hunted. That's the point: the drops are
what make the fine gear.

### Its powers

Every ingredient brings one power, its family's (`FAMILIES`), as the piece reads it:

- **in a weapon that strikes** (`arms`: every main-hand weapon but a wand and a grimoire, and a
  quiver): its blows. On a bow or a quiver, whose blows are shots, `melee` is read as `ranged`.
- **in a wand or a grimoire** (`magic`): its spells.
- **in anything worn** (`worn`: armour, shields, clothes, jewellery): what keeps its wearer whole.

So a demon's horn is fire on every blow in a sword, fire's harm kept off in plate, and stronger
spells in a wand, as a gem in Diablo II is fire in a weapon and fire's resistance in a shield. Two
ingredients that add to the same thing add together, and their ranges too (`powersOf`).

How strong a power is: its range at a common ingredient (`RANGES`, on a piece of the first level),
times its ingredient's make's strength (`MAKE_STRENGTH`: 1 common, 1.25 fine, 1.5 masterwork, 1.75
rare, 2 very rare, 2.5 legendary), times the piece's level's (core/gear.js `levelFactor`: 1 at the
first, 2 at the hundredth). It's rolled anywhere in that range, as a found piece's bonuses are
(gear.js `rollGear`: the least, and a random share of the rest), and rounded as it's shown, a whole
percent or a whole number; the range shown is rounded the same, so whatever's rolled is in it. A
finer ingredient brings a stronger power whatever the piece's make: a demon's horn in an iron sword
is a common sword with strong fire in it.

The piece's own armour and bonus (gear.js `GEAR`: a belt's stamina) are as they always are, as
strong as its make and level (gear.js `statsOf`).

### Its level

Its maker's might's (core/might.js `mightOf`, as gear.js `levelOf` has it), as what's bought is
(host.js `#buy`): crafted gear keeps up with whoever makes it, and comes out stronger the mightier
they are.

### Its name

Its main material's word, its essence's if it has one, and its recipe's noun, each a capital
(`nameOf`): "Adamantite Demon Sword", "Moonsilk Behemoth Travelling Cloak", "Star Ruby Demon Ring",
"Yew Bow". Kept as a legendary piece's own name is (`name`: progress.js `thingOf` keeps 40 letters,
and no name made is longer). It's the name, whatever the make: a crafted legendary weapon isn't
given one of the legendary names by chance.

### What else it is

- **A legendary weapon** lets loose the effect of its essence's family (`FAMILIES` `legend`: fire
  Cinderburst, frost and binding Frostbind, storm and swiftness Stormlash, might, stoutness, venom
  and acid Earthsunder, the rest Ruinblast), or with no essence its main material's
  (`legendOf`): chosen, not by chance.
- **A shield** has how much of a blow it takes rolled as a bought one's is (gear.js `rollBlock`),
  **a wand or a grimoire** its boost to spells (progress.js `rollBoost`).
- **A uniform's piece** (a helm, a hauberk, a war belt...) is of the crafter's people, and **a
  sword, a kite or a tower shield** in one of their designs (gear.js `DESIGNS`), as a shop's are; a
  mace in one of its looks.

## The ingredients

168 of them (`INGREDIENTS`): 11 metals, 10 woods, 12 cloths, 42 leathers, 14 gems and 79
essences. Every creature's part there is but what's eaten (meat, venison, locusts, frog legs) is
one, so everything the wild leaves is worth carrying home for something; with nineteen new
materials sold at the shops (`MATERIALS`) and fifteen new parts for the rarer grades
(core/spoils.js `PARTS`).

| | common | fine | masterwork | rare | very rare | legendary |
| --- | --- | --- | --- | --- | --- | --- |
| **Metals** | bronze, iron, rusted mail | steel, silver | black steel, gold | mythril, grave-iron | adamantite | orichalcum |
| **Woods** | pine, birch, oak | ash, yew, mahogany | blighted heartwood | ironwood | ghostwood | sylvanwood |
| **Cloths** | linen, wool | silk, spider silk, mare's hair, sackcloth | black widow silk, spectral veil, kelpie's mane | wraith's shroud | gloomsilk | moonsilk |
| **Leathers** | tanned leather, and six hides | hardened leather, and twelve | fourteen hides, pelts and scales | wyvern scale, shadow pelt, chimera's mane | drake scale, frost troll hide, the Moonfang's pelt | Dreadthorn scale, Behemoth's scale |
| **Gems** | quartz, jasper | amethyst, garnet, obsidian | basilisk's eye, nightmare shard | geode heart, soul shard, sapphire | wight crown shard, diamond | blighted crystal, star ruby |
| **Essences** | nineteen | thirty-one | eleven | seven | four | seven |

Every kind has an ingredient of every make, so every piece can be made in every make, and an essence
of any make put in it (a test holds it).

### Where they come from

- **Sold** (the commoner grades, common and fine, and only those): at the crafters
  (`CRAFTERS` `sells`), each what it works with. Nothing finer is ever sold.
- **Off the wild's creatures**: the parts they've always left, and the new ones, off the new
  beasts and some more off those there were (core/spoils.js `SPOILS`, since stage 3: *New beasts*).
  The rarest from the hardest foes: every legendary ingredient only off the perilous
  (the Dreadthorn, the drake, the Behemoth, the frost troll, Ashkhar, the Stone Golem of
  Harrowstone, and the new colossus, ancient and moon moth), every very rare one only off
  creatures met as far out as the ninth tier, every rare one the eighth (a test holds it).
- **Gear broken down** at a crafter's (*Salvage*, below): one of each kind and make.

### The catalogue

Each ingredient's id, name (progress.js `ITEMS`), make, family (its power: *Powers*, below),
price (what a shop asks for a sold one; what the adventurers' guild pays for a part, which sells
for all it's worth), picture (app/icons.js `partIcon`: its kind of picture and its colour), where
it comes from, and what it is, in the words its card will say. "(new)" is a sold material, "(new
part)" a creature's part new with this.
#### Metals

| Id | Name | Make | Family | Price | Icon | From | What it is |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| `bronzeIngot` (new) | Bronze ingot | common | vigour | 6 | ingot, `#b8803a` | sold: smith, swordsmith, armorer, leatherworker, jeweller | Copper and tin poured together: softer than iron, but it never rusts. |
| `ironIngot` (new) | Iron ingot | common | stout | 8 | ingot, `#6e7178` | sold: smith, swordsmith, armorer, leatherworker; salvage | Plain iron from the bloomery: the smith's daily bread. |
| `rustedMail` | Rusted mail rings | common | keen | 10 | ingot, `#4e4a42` | off: Draugr, Dirge warden, Bloat gorger, Pit ravager | Rings of a barrow's old mail, rusted together. Beaten out again, rust and all, it still bites. |
| `steelIngot` (new) | Steel ingot | fine | might | 24 | ingot, `#a9b4bf` | sold: smith, swordsmith, armorer, masterSwordsmith, masterArmorer; salvage | Iron folded with charcoal till it holds an edge and bends without breaking. |
| `silverIngot` (new) | Silver ingot | fine | holy | 30 | ingot, `#d8dde4` | sold: swordsmith, jeweller, masterSwordsmith, masterArmorer, emporium | Pure silver. The restless dead and the werewolf shrink from it. |
| `blackSteelIngot` (new part) | Black steel ingot | masterwork | keen | 40 | ingot, `#2a2c30` | off: Orc raider, Orc reaver, Orc warlord, Orc champion, Orc King; salvage | The orcs' own steel, quenched in blood and oil, black as a crow's wing. It takes a wicked edge. |
| `goldIngot` (new part) | Gold ingot | masterwork | luck | 45 | ingot, `#e8b830` | off: Gilded scarab, Goblin King, Bandit chief, Drake | Soft, heavy and bright. Too soft to fight in alone, but gold calls to gold, they say. |
| `mythrilIngot` (new part) | Mythril ingot | rare | swift | 80 | ingot, `#8ac8f0` | off: Mythril golem; salvage | Silver-blue, light as a feather and harder than steel: what a mythril golem is made of. |
| `graveIron` | Grave-iron | rare | shadow | 60 | ingot, `#3a3f4a` | off: Wight lord, Dirge warden, Forge brute | Iron from a barrow king's grave goods, cold to the touch however long it's held. |
| `adamantiteIngot` (new part) | Adamantite ingot | very rare | might | 160 | ingot, `#2e5a48` | off: Adamantite golem; salvage | Dark green-black, the hardest thing there is: it blunts every file in the forge. |
| `orichalcumIngot` (new part) | Orichalcum ingot | legendary | might | 340 | ingot, `#e07a30` | off: Orichalcum colossus; salvage | Red-gold and warm to the touch, the metal of the drowned kings' crowns. Nothing made by hands is finer. |

#### Woods

| Id | Name | Make | Family | Price | Icon | From | What it is |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| `pineWood` (new) | Pine wood | common | vigour | 4 | wood, `#d8b47a` | sold: bowyer | Light, straight and sappy: cheap staves and shields. |
| `birchWood` (new) | Birch wood | common | arcane | 5 | wood, `#e6dcc4` | sold: scriptorium, bowyer, emporium | Pale birch, the hedge-witch's wand wood. |
| `oakWood` (new) | Oak wood | common | stout | 6 | wood, `#8a6234` | sold: smith, swordsmith, armorer, bowyer, masterArmorer; salvage | Heavy and hard: the wood of shields, hafts and stout old staves. |
| `ashWood` (new) | Ash wood | fine | keen | 16 | wood, `#c8a878` | sold: swordsmith, scriptorium, bowyer, masterSwordsmith; salvage | Springy ash, for shafts and hafts that take a shock and come back. |
| `yewWood` (new) | Yew wood | fine | might | 20 | wood, `#b0582e` | sold: scriptorium, bowyer, masterSwordsmith | Heartwood and sapwood together, as a longbow wants it. |
| `mahoganyWood` (new) | Mahogany | fine | luck | 22 | wood, `#6e2a1a` | sold: bowyer | Red jungle wood brought up the rivers: rich men's furniture, and a lucky grip. |
| `heartwood` | Blighted heartwood | masterwork | arcane | 25 | wood, `#5a4a3a` | off: Blighted treant; salvage | The black heart of a blighted treant, still faintly warm. It drinks spells like water. |
| `ironwood` (new part) | Ironwood | rare | might | 70 | wood, `#4a4a4e` | off: Ironbark treant; salvage | Grey wood as heavy as iron, from the ironbark treants of the orcs' lands. It sinks, and it turns an axe. |
| `ghostwood` (new part) | Ghostwood | very rare | shadow | 150 | wood, `#c8dce8` | off: Ghostwood treant; salvage | Pale wood you can almost see through, from a tree that walks at night. It's cold, and it whispers. |
| `sylvanwood` (new part) | Sylvanwood | legendary | swift | 330 | wood, `#c8d8b0` | off: Sylvan ancient; salvage | Silver-barked wood from an ancient of the elves' forests, light as a reed and stronger than steel. |

#### Cloths

| Id | Name | Make | Family | Price | Icon | From | What it is |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| `linenBolt` (new) | Bolt of linen | common | mending | 4 | bolt, `#e8e0cc` | sold: armorer, bowyer, leatherworker, tailor; salvage | Flax woven plain: shirts, linings and bandages. |
| `woolBolt` (new) | Bolt of wool | common | stout | 5 | bolt, `#8a7a64` | sold: armorer, leatherworker, tailor, masterArmorer | Thick fulled wool. Warm even wet, as the shepherds say. |
| `silkBolt` (new) | Bolt of silk | fine | arcane | 26 | bolt, `#c84a6a` | sold: tailor, masterSwordsmith, masterArmorer, emporium; salvage | Silk from far off, light as breath and dear as gold. Mages swear by it. |
| `spiderSilk` | Spider silk | fine | swift | 6 | silk, `#e8e8f0` | off: Cave spider, Dungeon spider, Elite dungeon spider, Black widow, Egg sac | A spider's thread, wound off by the yard: fine, light and strong as wire. |
| `mareHair` | Mare's hair | fine | binding | 9 | silk, `#2a2430` | off: Mare | Black hair from a mare's mane, the stuff of bad dreams. Woven, it holds. |
| `sackFace` | Hodmedod's sack face | fine | luck | 12 | silk, `#b89c6a` | off: Hodmedod | A hodmedod's sacking face, stitched eyes and all. Scarecrows are lucky, for some. |
| `widowSilk` (new part) | Black widow silk | masterwork | venom | 22 | silk, `#2a2430` | off: Black widow; salvage | Black, glossy thread from a black widow's spinnerets, stronger than steel wire and bitter with venom. |
| `spectralVeil` | Spectral veil | masterwork | arcane | 16 | silk, `#c8dcea` | off: Restless ghost | A ghost's veil, cold and weightless. Spells pass through it as it passes through walls. |
| `kelpieMane` | Kelpie's mane | masterwork | frost | 18 | silk, `#2a5a3a` | off: Kelpie | Weed-green hair from a kelpie's mane, forever damp and as cold as the loch. |
| `wraithShroud` | Wraith's shroud | rare | shadow | 26 | silk, `#24202c` | off: Wraith; salvage | A wraith's shroud, black as a moonless night: whoever wears it is hard to make out. |
| `gloomsilk` (new part) | Gloomsilk | very rare | binding | 150 | silk, `#3a2a5a` | off: Gloomweaver; salvage | Violet-black thread from a gloomweaver's web. Whatever it touches is caught. |
| `moonsilk` (new part) | Moonsilk | legendary | holy | 320 | silk, `#e8f0ff` | off: Moon moth; salvage | Spun from moonlight by the moon moth, the elves say: it glows, and nothing unholy bears its touch. |

#### Leathers

| Id | Name | Make | Family | Price | Icon | From | What it is |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| `tannedLeather` (new) | Tanned leather | common | stout | 6 | hide, `#8a5a32` | sold: smith, swordsmith, armorer, scriptorium, bowyer, leatherworker, tailor; salvage | Cowhide tanned in oak bark: belts, boots, grips and jerkins. |
| `boarHide` | Boar hide | common | stout | 6 | hide, `#6e5440` | off: Wild boar | Bristly, thick and tough. |
| `badgerPelt` | Badger pelt | common | stout | 6 | pelt, `#8a8680` | off: Badger | Coarse grey fur, hard-wearing. |
| `snakeSkin` | Adder skin | common | venom | 5 | skin, `#7a7a40` | off: Adder | A shed adder's skin, patterned in zigzags. |
| `olmSkin` | Olm skin | common | frost | 5 | skin, `#ead0c6` | off: Cave olm | A cave olm's pale skin, soft, cold and damp. |
| `hyenaHide` | Hyena hide | common | vigour | 6 | hide, `#a08a5a` | off: Hyena | Spotted, coarse and smelly. Its owner never tired, nor does it. |
| `jackalPelt` | Jackal pelt | common | swift | 5 | pelt, `#b47c42` | off: Jackal | Light sandy fur from the cat folk's plains. |
| `hardenedLeather` (new) | Hardened leather | fine | might | 18 | hide, `#5a3418` | sold: swordsmith, armorer, leatherworker, masterSwordsmith, masterArmorer, emporium; salvage | Leather boiled in wax and shaped while hot: stiff as wood, and it turns a blade. |
| `wolfPelt` | Wolf pelt | fine | vigour | 7 | pelt, `#6a655c` | off: Wolf | Grey wolf fur, warm and hard-wearing: a ranger's lining. |
| `pumaPelt` | Puma pelt | fine | swift | 14 | pelt, `#b08050` | off: Puma | A mountain cat's tawny pelt, light and supple. |
| `direPelt` | Dire wolf pelt | fine | vigour | 12 | pelt, `#2e2c2e` | off: Dire wolf | Thick black fur from a dire wolf. |
| `bullHide` | Wild bull's hide | fine | vigour | 12 | hide, `#e8e2d4` | off: Wild bull | A wild bull's white hide, as thick as a door. |
| `hartHide` | Hart hide | fine | vigour | 8 | hide, `#8a5634` | off: Hart | Supple red-brown deerskin. |
| `carapace` | Carapace plate | fine | might | 7 | plate, `#b89458` | off: Giant centipede, Great centipede, Dungeon scorpion, Giant cockroach, Sand scorpion, Gilded scarab | A plate of a great insect's shell, light and as hard as horn. |
| `cobraSkin` | Cobra skin | fine | venom | 10 | skin, `#6a5a40` | off: Spitting cobra | A spitting cobra's banded skin. |
| `poisonSkin` | Poison frog skin | fine | venom | 8 | skin, `#5a7a2a` | off: Bog frog | Bright, slick skin from a poison frog. Handle it with gloves. |
| `ahuizotlPelt` | Ahuizotl pelt | fine | frost | 14 | pelt, `#16161a` | off: Ahuizotl | Sleek black fur from the water-dog of the lizard folk's swamps, never dry. |
| `gilaSkin` | Gila monster skin | fine | venom | 6 | skin, `#e07a4a` | off: Gila monster | Beaded skin, orange and black. |
| `salamanderSkin` | Salamander skin | fine | fire | 12 | skin, `#1a1412` | off: Salamander | Black, glossy skin that never burns. |
| `wormHide` | Death worm hide | fine | acid | 12 | hide, `#a83a2a` | off: Death worm | A death worm's red hide, pitted by its own acid. |
| `bearPelt` | Bear pelt | masterwork | stout | 16 | pelt, `#5a3e28` | off: Brown bear | A brown bear's pelt, heavy and warm. |
| `trollHide` | Troll hide | masterwork | blood | 22 | hide, `#6b7a6a` | off: Troll; salvage | Grey-green and warty, and it still knits itself where it's cut. |
| `ogreHide` | Ogre hide | masterwork | stout | 18 | hide, `#a08060` | off: Ogre | Thick, leathery and scarred. |
| `werewolfPelt` | Werewolf pelt | masterwork | blood | 26 | pelt, `#4a4440` | off: Werewolf | Coarse grey fur off a werewolf, that was someone once. |
| `shuckFur` | Spectral fur | masterwork | shadow | 18 | pelt, `#20202a` | off: Black shuck | Black fur that seems to drink the light. |
| `knuckerScale` | Knucker scale | masterwork | frost | 18 | scale, `#3a4a3a` | off: Knucker | A water dragon's dark green scale, cold and slick. |
| `houndPelt` | Otherworld hound's pelt | masterwork | holy | 16 | pelt, `#eceae4` | off: Hound of Annwn | White fur off a hound of the Otherworld, that never gets dirty. |
| `crownScale` | Basilisk's crown scale | masterwork | binding | 18 | scale, `#f0ecd8` | off: Basilisk | A pale scale off a basilisk's crown. Look at it too long and your eyes ache. |
| `buffaloHide` | Buffalo hide | masterwork | stout | 18 | hide, `#2c2622` | off: Cape buffalo | A cape buffalo's black hide, thick enough to stop a spear. |
| `nandiPelt` | Nandi bear pelt | masterwork | keen | 26 | pelt, `#6e5c48` | off: Nandi bear | Shaggy brown fur off a Nandi bear. |
| `crocHide` | Crocodile hide | masterwork | might | 20 | hide, `#3e4a2c` | off: Marsh crocodile | A marsh crocodile's armoured green hide. |
| `jaguarPelt` | Jaguar pelt | masterwork | swift | 16 | pelt, `#d09a42` | off: Jaguar | Golden fur, rosetted black. |
| `boaSkin` | Boa skin | masterwork | binding | 20 | skin, `#8c7a58` | off: Great boa | A great boa's skin, long enough to wrap a house in. |
| `riftlingScale` | Riftling's scale | masterwork | storm | 26 | scale, `#24301e` | off: Riftling, Rift stalker | A riftling's scale, glowing faintly at its edges. |
| `wyvernScale` | Wyvern scale | rare | storm | 20 | scale, `#3e5a4a` | off: Wyvern; salvage | A wyvern's scale, light as horn: the wind slides off it. |
| `shadowPelt` | Shadow pelt | rare | shadow | 30 | pelt, `#2a1e3a` | off: Shadow stalker | A shadow stalker's pelt: it's hard to see where it ends. |
| `chimeraMane` | Chimera's mane | rare | fire | 34 | pelt, `#5a3216` | off: Chimera | A chimera's lion mane, singed at the ends and warm. |
| `dragonScale` | Drake scale | very rare | fire | 60 | scale, `#6e1812` | off: Drake; salvage | A drake's scale, dark red and hot to the touch: proof against fire. |
| `frostHide` | Frost troll hide | very rare | frost | 70 | hide, `#b8c8d8` | off: Frost troll | Rime-white hide off a frost troll, always cold. |
| `moonfangPelt` | The Moonfang's pelt | very rare | shadow | 90 | pelt, `#1c1a1c` | off: Moonfang | The Moonfang's black pelt, a pale glow along its hairs. |
| `dreadthornScale` | Dreadthorn scale | legendary | fire | 140 | scale, `#3a2a1c` | off: Dreadthorn; salvage | A Dreadthorn's scale, as wide as a shield and harder than any steel. |
| `riftScale` | Behemoth's scale | legendary | storm | 160 | scale, `#1c241c` | off: Behemoth of the Rift | A scale off the Behemoth of the Rift, crackling faintly with the Rift's light. |

#### Gems

| Id | Name | Make | Family | Price | Icon | From | What it is |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| `quartz` (new) | Quartz | common | arcane | 8 | gem, `#e8eef4` | sold: scriptorium, bowyer, tailor, jeweller, emporium; salvage | Clear rock crystal: it takes a spell and holds it, a little. |
| `jasper` (new) | Jasper | common | stout | 8 | gem, `#a8402e` | sold: tailor, jeweller | A red-brown stone, polished smooth: a soldier's lucky stone. |
| `amethyst` (new) | Amethyst | fine | mending | 28 | gem, `#9a5ad0` | sold: scriptorium, jeweller, emporium; salvage | Violet crystal, said to keep the head clear and wounds clean. |
| `garnet` (new) | Garnet | fine | vigour | 26 | gem, `#8a1a2a` | sold: jeweller, emporium | Deep red, like a drop of blood: a traveller's stone. |
| `obsidian` | Obsidian shard | fine | keen | 10 | shard, `#2a2230` | off: Magma slime, Fiend, Greater demon, Demon lord, Vharzul the Greenflame, Demon Boss, Cinder husk, Slag gorger, Forge brute, Gorger warlord, Pit henchman, Brimstone walker, Ash walker, Hellwalker, Bile walker | Black volcanic glass, sharper than steel and as brittle. |
| `basiliskEye` | Basilisk's eye | masterwork | binding | 26 | core, `#e8d040` | off: Basilisk; salvage | A basilisk's yellow eye, hard as a gem. Its stare still holds. |
| `nightmareShard` | Nightmare shard | masterwork | shadow | 20 | shard, `#d0a8ff` | off: Mare | A splinter of a mare's dream, violet and cold. |
| `geodeHeart` | Geode heart | rare | arcane | 30 | core, `#c080ff` | off: Rock tusker | Violet crystal from inside a rock tusker, where its heart should be. |
| `soulShard` | Soul shard | rare | blood | 32 | shard, `#8affc0` | off: High priest of the cult, Wraith, Fiend, Greater demon, Demon lord, Vharzul the Greenflame, Cerberus, Ashmaw, Demon Boss, Ashkhar the Bellbound, Ossuary priest, Flayed hierarch, Chained glutton, Gorger warlord, Pit henchman, Brimstone walker, Ash walker, Hellwalker, Bile walker, Soul jar | Green crystal with a soul caught in it, faintly singing. |
| `sapphire` (new part) | Sapphire | rare | frost | 80 | gem, `#2a5ad8` | off: Mythril golem; salvage | Deep blue and as cold as a winter lake, grown in a mythril golem's chest. |
| `crownShard` | Wight crown shard | very rare | shadow | 120 | shard, `#c8a840` | off: Wight lord, Flayed hierarch, Gorger warlord, Pit henchman | A shard of a wight's crown, gold and dark stone. |
| `diamond` (new part) | Diamond | very rare | holy | 170 | gem, `#eef6ff` | off: Adamantite golem; salvage | The clearest and hardest of stones, from an adamantite golem's heart. It shines even in the dark. |
| `blightCrystal` | Blighted crystal shard | legendary | arcane | 260 | shard, `#8a4ad0` | off: Stone golem | A splinter of the flawed crystal at the Stone Golem of Harrowstone's heart, dark with the blight in it. |
| `starRuby` (new part) | Star ruby | legendary | fire | 360 | gem, `#d81a3a` | off: Orichalcum colossus; salvage | A ruby with a six-rayed star in it, from an orichalcum colossus's chest. It's warm, and it never dims. |

#### Essences

| Id | Name | Make | Family | Price | Icon | From | What it is |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| `ratTail` | Rat tail | common | luck | 2 | tail, `#c9938a` | off: Giant rat | A giant rat's long pink tail. Lucky, if you're a rat. |
| `ratTooth` | Rat's incisors | common | keen | 3 | fang, `#e6c77c` | off: Giant rat | A giant rat's yellow incisors, chisel-sharp. |
| `quill` | Porcupine quill | common | keen | 2 | quill, `#e8e0cc` | off: Porcupine | A porcupine's barbed quill. |
| `slimeGel` | Slime jelly | common | acid | 3 | gel, `#58c040` | off: Green slime | A blob of green slime, eating at whatever it's on. |
| `batWing` | Bat wing | common | swift | 2 | wing, `#4a3a34` | off: Bat swarm | A bat's wing, leathery and light. |
| `wolfFang` | Wolf fang | common | keen | 4 | fang, `#efe6d0` | off: Wolf | A wolf's fang, sharp and curved. |
| `goblinEar` | Goblin ear | common | luck | 4 | ear, `#6a8a3a` | off: Goblin raider, Goblin bomber, Goblin King, Orc warlord | A goblin's ear. Goblins steal, and their luck comes with it. |
| `boneDust` | Bone dust | common | shadow | 5 | dust, `#d8cfb4` | off: Skeleton, Draugr, Cerberus, Flayling, Ossuary priest, Chained glutton, Bloat gorger, Pit ravager, Brimstone walker, Ash walker, Hellwalker, Bile walker | Old bone ground to dust: the dead's. |
| `badgerClaw` | Badger claw | common | keen | 4 | claw, `#1e1c1a` | off: Badger | A badger's digging claw. |
| `rookFeather` | Rook feather | common | storm | 2 | wing, `#16161c` | off: Rook flock | A black rook's feather, that rides the gale. |
| `hyenaJaw` | Hyena jaw | common | keen | 5 | jaw, `#e6dcc4` | off: Hyena | A hyena's jaw, that cracks bones. |
| `jackalTooth` | Jackal tooth | common | keen | 3 | fang, `#efe6d0` | off: Jackal | A jackal's small, sharp tooth. |
| `leech` | Leech | common | blood | 4 | gel, `#2e3020` | off: Giant leech | A giant leech, alive and still hungry. |
| `bloodflyWing` | Bloodfly wings | common | blood | 2 | wing, `#b8c0c8` | off: Bloodfly swarm | A bloodfly's wings, veined red. |
| `antMandible` | Ant mandible | common | keen | 4 | fang, `#7a2a14` | off: Giant ant | A giant ant's mandible. |
| `waspWing` | Wasp's wing | common | swift | 4 | wing, `#b0a8d0` | off: Dungeon wasp | A wasp's wing, as thin as glass. |
| `vultureFeather` | Vulture feather | common | storm | 4 | wing, `#2a241e` | off: Vulture flock | A vulture's dark flight feather, that rides the hot wind. |
| `vultureTalon` | Vulture talon | common | keen | 5 | claw, `#c8c0b0` | off: Vulture flock | A vulture's hooked talon. |
| `centipedeFang` | Centipede fang | common | venom | 5 | fang, `#5a1a14` | off: Giant centipede, Great centipede | A centipede's venom fang. |
| `boarTusk` | Boar tusk | fine | might | 6 | tusk, `#ece2c8` | off: Wild boar | A boar's curved tusk. |
| `venomSac` | Venom sac | fine | venom | 7 | gland, `#9ac04a` | off: Adder, Spitting cobra, Gila monster | A snake's venom sac, full. |
| `bearClaw` | Bear claw | fine | keen | 8 | claw, `#2a2018` | off: Brown bear | A brown bear's claw, as long as a finger. |
| `pumaClaw` | Puma claw | fine | keen | 7 | claw, `#3a2a1a` | off: Puma | A puma's hooked claw. |
| `direFang` | Dire wolf fang | fine | keen | 8 | fang, `#f4ecd8` | off: Dire wolf | A dire wolf's fang, as long as a thumb. |
| `oldSkull` | Old skull | fine | shadow | 6 | skull, `#d8cfb4` | off: Skeleton, Ossuary priest, Flayed hierarch, Chained glutton, Pit ravager | An old skull out of a barrow. |
| `cultSigil` | Cult sigil | fine | binding | 8 | sigil, `#8a2f5a` | off: Cultist, High priest of the cult, Demon Boss, Flayling, Pyre acolyte | A cultist's iron sigil, a star in a circle. |
| `ogreTooth` | Ogre tooth | fine | might | 12 | fang, `#e0d0a0` | off: Ogre | An ogre's molar, as big as a fist. |
| `shuckFang` | Shuck fang | fine | fire | 14 | fang, `#ff7a5a` | off: Black shuck | A black shuck's fang, glowing red as its eyes did. |
| `boggartCharm` | Boggart's charm | fine | luck | 10 | charm, `#8a6a3a` | off: Boggart | A boggart's lucky charm, stolen from someone. |
| `bullHorn` | Wild bull's horn | fine | might | 9 | tusk, `#e0d4b8` | off: Wild bull | A wild bull's horn. |
| `knuckerFang` | Knucker fang | fine | frost | 12 | fang, `#efe6d0` | off: Knucker | A water dragon's fang, cold and wet. |
| `witchStraw` | Bewitched straw | fine | binding | 7 | wood, `#d8b860` | off: Hodmedod | Straw from a hodmedod, bewitched: it twitches. |
| `wispEssence` | Wisp essence | fine | holy | 12 | essence, `#9ae8ff` | off: Will-o'-wisp | A will-o'-wisp's light in a bottle. |
| `ectoplasm` | Ectoplasm | fine | arcane | 12 | gel, `#a8e8e0` | off: Restless ghost, Ghostwood treant | A ghost's ectoplasm, cold and clinging. |
| `blightCap` | Blight cap | fine | venom | 12 | fungus, `#8a4a9a` | off: Blighted treant | A violet toadstool off a blighted treant. |
| `mandrakeRoot` | Mandrake root | fine | mending | 8 | wood, `#a88a5e` | off: Mandrake | A mandrake root, shaped like a little man. It screams when it's cut. |
| `houndEar` | Red hound's ear | fine | luck | 9 | ear, `#a82a20` | off: Hound of Annwn | A red hound's ear: it still twitches at a sound. |
| `pixieDust` | Pixie dust | fine | arcane | 9 | dust, `#7ae8a8` | off: Pixie swarm, Moon moth | A pinch of glittering pixie dust. |
| `antler` | Hart's antler | fine | holy | 10 | tusk, `#d8c8a4` | off: Hart | A hart's antler. The white hart's are holy, they say, and some of it rubs off on the rest. |
| `venomGland` | Venom gland | fine | venom | 8 | gland, `#8a2020` | off: Cave spider, Dungeon spider, Elite dungeon spider | A spider's venom gland. |
| `olmGills` | Olm gills | fine | frost | 6 | gland, `#d8807e` | off: Cave olm | A cave olm's pink, feathery gills. |
| `scorpionSting` | Scorpion sting | fine | venom | 9 | sting, `#b89458` | off: Dungeon scorpion, Sand scorpion | A scorpion's sting, a bead of venom on its tip. |
| `buffaloHorn` | Buffalo horn | fine | might | 14 | tusk, `#4a4238` | off: Cape buffalo | A cape buffalo's heavy horn. |
| `crocTooth` | Crocodile tooth | fine | keen | 8 | fang, `#e8e0c0` | off: Marsh crocodile | A crocodile's tooth. |
| `jaguarFang` | Jaguar fang | fine | keen | 9 | fang, `#f0e6d0` | off: Jaguar | A jaguar's fang. |
| `emberGland` | Ember gland | fine | fire | 10 | gland, `#ffa020` | off: Salamander, Cinder husk | A salamander's ember gland, glowing orange. |
| `acidSac` | Acid sac | fine | acid | 10 | gland, `#c8d040` | off: Death worm | A death worm's acid sac. |
| `acidGland` | Ant's acid gland | fine | acid | 7 | gland, `#c8a030` | off: Giant ant, Ant Monster | A giant ant's acid gland. |
| `waspStinger` | Wasp's stinger | fine | venom | 8 | sting, `#2a2018` | off: Dungeon wasp | A wasp's stinger. |
| `bellToken` | Bell of the Order | fine | holy | 12 | charm, `#b08840` | off: Initiate of the Bell, Brother of the Bell, Rider of the Bell, Black Choir Rider, Spear-brother of the Bell, Mace-brother of the Bell, Bowman of the Bell, Knight of the Black Choir, Prior of the Bell | The little bronze bell an initiate of the Order wears on a cord, the Bell's cross on it. |
| `werewolfClaw` | Werewolf claw | masterwork | blood | 15 | claw, `#d8c8b0` | off: Moonfang, Werewolf | A werewolf's claw, that leaves wounds slow to close. |
| `trollBlood` | Troll's blood | masterwork | mending | 15 | vial, `#4a7a3a` | off: Troll | A troll's green blood in a vial, still trying to heal something. |
| `shadowClaw` | Shadow claw | masterwork | shadow | 18 | claw, `#a060ff` | off: Shadow stalker | A shadow stalker's violet claw. |
| `nandiClaw` | Nandi bear claw | masterwork | keen | 15 | claw, `#1e1812` | off: Nandi bear | A Nandi bear's claw. |
| `ahuizotlHand` | Ahuizotl's tail-hand | masterwork | binding | 16 | claw, `#3a2c26` | off: Ahuizotl | The ahuizotl's tail-hand, that drags swimmers under. |
| `magmaCore` | Magma core | masterwork | fire | 18 | core, `#ff7020` | off: Magma slime, Slag gorger | A magma slime's molten heart, still glowing. |
| `stoneTusk` | Stone tusk | masterwork | might | 22 | tusk, `#b8b0a0` | off: Rock tusker | A rock tusker's stone tusk. |
| `chimeraHorn` | Chimera's horn | masterwork | might | 26 | tusk, `#9a8a70` | off: Chimera | A chimera's goat horn. |
| `nightglowGland` | Nightglow gland | masterwork | storm | 22 | gland, `#ff6040` | off: Elite dungeon spider | An elite spider's glowing gland, bright as a lantern and crackling. |
| `widowGland` | Black widow's venom gland | masterwork | venom | 18 | gland, `#c81818` | off: Black widow, Gloomweaver | A black widow's venom gland. Its venom cramps as it burns. |
| `barrowRing` | Barrow ring | masterwork | luck | 24 | charm, `#c8a840` | off: Draugr | A gold ring off a draugr's finger. Whoever it was, they were rich. |
| `wyvernSting` | Wyvern sting | rare | venom | 30 | sting, `#d8ccaa` | off: Wyvern | A wyvern's tail sting, as long as a knife. |
| `kelpieBridle` | Kelpie's bridle | rare | binding | 40 | charm, `#9ab8a8` | off: Kelpie | A kelpie's bridle: whoever holds it is its master. |
| `fireGland` | Fire gland | rare | fire | 30 | gland, `#ff8010` | off: Chimera, Fiend, Greater demon, Demon lord, Vharzul the Greenflame, Cerberus, Ashmaw, Demon Boss, Pyre acolyte, Forge brute | A fire gland, hot enough to light a pipe on. |
| `hellFang` | Hellhound fang | rare | fire | 45 | fang, `#ff4a1a` | off: Cerberus, Ashmaw | A cerberus's fang, as long as a dagger and still warm. |
| `queenMandible` | Ant Monster's mandible | rare | acid | 45 | fang, `#1c1618` | off: Ant Monster | The Ant Monster's mandible, black and dripping. |
| `royalJelly` | Royal jelly | rare | mending | 30 | gland, `#f0d890` | off: Ant Monster, Egg clutch | Royal jelly from an ants' nest, that heals whoever eats it. |
| `moonfangFang` | The Moonfang's fang | rare | blood | 55 | fang, `#e8eeff` | off: Moonfang | The Moonfang's fang, pale as the moon. |
| `demonHorn` | Demon's horn | very rare | fire | 50 | tusk, `#d8ccb4` | off: Demon Boss, Ashkhar the Bellbound | A horn as long as a forearm, ridged and bone-pale, off a demon of the Breach. It smoulders. |
| `dragonFang` | Drake fang | very rare | fire | 90 | fang, `#f0e4c8` | off: Drake | A drake's fang, blackened at its root by its fire. |
| `golemStone` | Runed golem stone | very rare | might | 90 | shard, `#8a857a` | off: Stone golem | A stone off the Stone Golem of Harrowstone, its maker's rune cut in it. |
| `riftGland` | Rift-fire gland | very rare | fire | 75 | gland, `#5aff90` | off: Riftling, Rift stalker | A gland of the Rift's green fire. |
| `dragonHeart` | Drake's heart | legendary | fire | 250 | heart, `#c02010` | off: Drake | A drake's heart, still hot, still beating now and then. |
| `dreadthornHorn` | Dreadthorn horn | legendary | might | 220 | tusk, `#2a2018` | off: Dreadthorn | A Dreadthorn's horn, as long as a man is tall. |
| `dreadthornHeart` | Dreadthorn's heart | legendary | fire | 700 | heart, `#ff5a14` | off: Dreadthorn | A Dreadthorn's heart, the furnace of its fire. |
| `frostHeart` | Frost heart | legendary | frost | 140 | heart, `#80d0ff` | off: Frost troll, Ashkhar the Bellbound | A heart of blue ice, that never melts. |
| `riftSpine` | Glowing dorsal spine | legendary | storm | 320 | shard, `#40ff90` | off: Behemoth of the Rift, Rift stalker | A dorsal spine off the Behemoth, still glowing. |
| `riftHeart` | Heart of the Behemoth | legendary | storm | 1200 | heart, `#3ad0ff` | off: Behemoth of the Rift | The Heart of the Behemoth of the Rift, lightning caught in it. |
| `ancientSap` (new part) | Ancient's sap | legendary | mending | 300 | gel, `#e8a830` | off: Sylvan ancient | Golden sap from a sylvan ancient, sweet as honey: the life of a tree a thousand years old. |

## Powers

### The families

What each family's ingredients add to (core/gear.js `STATS`, or the new blows), in a weapon, in a
wand or grimoire, and worn; and the effect a legendary weapon of it lets loose (core/legendary.js
`EFFECTS`).

| Family | In a weapon (arms) | In a wand or grimoire (magic) | Worn | A legendary weapon's effect |
| --- | --- | --- | --- | --- |
| might | `melee` | `spell` | `armor` | earthsunder |
| stout | `hp` | `hp` | `hp` | earthsunder |
| vigour | `stamina` | `stamina` | `endurance` | ruinblast |
| swift | `haste` | `spell` | `dodge` | stormlash |
| keen | `bleed` | `spell` | `melee` | ruinblast |
| arcane | `spell` | `spell` | `spell` | ruinblast |
| mending | `heal` | `heal` | `heal` | ruinblast |
| binding | `stun` | `stun` | `stun` | frostbind |
| luck | `fortune` | `fortune` | `haggle` | ruinblast |
| fire | `fireBlow` | `spell` | `wardFire` | cinderburst |
| frost | `frostBlow` | `stun` | `wardWater` | frostbind |
| storm | `stormBlow` | `spell` | `wardAir` | stormlash |
| venom | `venomBlow` | `stun` | `wardEarth` | earthsunder |
| acid | `acidBlow` | `spell` | `wardEarth` | earthsunder |
| holy | `holyBlow` | `heal` | `wardMagic` | ruinblast |
| shadow | `shadowBlow` | `stun` | `dodge` | ruinblast |
| blood | `leech` | `heal` | `hp` | ruinblast |

### How strong

Each power's range (`RANGES`) at a common ingredient on a piece of the first level, then at a
legendary one (×2.5), and a legendary one on a piece of the hundredth level (×5, the most). A very
rare one is ×2, a rare ×1.75, a masterwork ×1.5, a fine ×1.25; and every level between the first
and the hundredth a hundredth more, as gear's are. They're about half a found piece's affix's
(gear.js `AFFIXES`) at a fine make, and about as strong as one at the best: a crafted piece has two
or three powers, chosen, where a legendary found one has three to five by chance.

| Power | Shown as | Common, level 1 | Legendary, level 1 | Legendary, level 100 |
| --- | --- | --- | --- | --- |
| `armor` | Armour | 0.8% to 1.6% | 2% to 4% | 4% to 8% |
| `hp` | Hit points | 3 to 8 | 8 to 20 | 15 to 40 |
| `stamina` | Stamina | 3 to 8 | 8 to 20 | 15 to 40 |
| `melee` | Melee damage | 2% to 5% | 5% to 12.5% | 10% to 25% |
| `ranged` | Ranged damage | 2% to 5% | 5% to 12.5% | 10% to 25% |
| `spell` | Spell power | 2% to 5% | 5% to 12.5% | 10% to 25% |
| `heal` | Healing | 3% to 7% | 7.5% to 17.5% | 15% to 35% |
| `stun` | Stun length | 5% to 12% | 12.5% to 30% | 25% to 60% |
| `haggle` | Haggling | 1% to 2.5% | 2.5% to 6.3% | 5% to 12.5% |
| `dodge` | Dodge | 0.6% to 1.4% | 1.5% to 3.5% | 3% to 7% |
| `haste` | Blow speed | 1% to 2.5% | 2.5% to 6.3% | 5% to 12.5% |
| `leech` | Life from blows | 1% to 2.5% | 2.5% to 6.3% | 5% to 12.5% |
| `bleed` | Bleeding blows | 3% to 7% | 7.5% to 17.5% | 15% to 35% |
| `fortune` | Gold found | 3% to 7% | 7.5% to 17.5% | 15% to 35% |
| `endurance` | Running's toll | 4% to 9% | 10% to 22.5% | 20% to 45% |
| `wardFire` | Fire's harm | 2% to 5% | 5% to 12.5% | 10% to 25% |
| `wardWater` | Water's harm | 2% to 5% | 5% to 12.5% | 10% to 25% |
| `wardAir` | Air's harm | 2% to 5% | 5% to 12.5% | 10% to 25% |
| `wardEarth` | Earth's harm | 2% to 5% | 5% to 12.5% | 10% to 25% |
| `wardMagic` | Spells' harm | 1.5% to 3.5% | 3.8% to 8.8% | 7.5% to 17.5% |
| `fireBlow` | Fire on each blow | 3% to 7% | 7.5% to 17.5% | 15% to 35% |
| `frostBlow` | Frost on each blow | 3% to 7% | 7.5% to 17.5% | 15% to 35% |
| `stormBlow` | Lightning on each blow | 3% to 7% | 7.5% to 17.5% | 15% to 35% |
| `venomBlow` | Venom on each blow | 3% to 7% | 7.5% to 17.5% | 15% to 35% |
| `acidBlow` | Acid on each blow | 3% to 7% | 7.5% to 17.5% | 15% to 35% |
| `holyBlow` | Holy fire on each blow | 6% to 14% | 15% to 35% | 30% to 70% |
| `shadowBlow` | Shadow on each blow | 3% to 7% | 7.5% to 17.5% | 15% to 35% |

The caps hold, as they hold now (progress.js `ARMOR_CAP`, `DODGE_CAP`, `HASTE_CAP`, `LEECH_CAP`,
`BLEED_CAP`, `HAGGLE_CAP`; a ward, half at most, battle.js `charmed`); and the new blows each
`BLOW_CAP` (0.4) of a blow's harm at the most, all a hero's gear together.

### The new blows (`ON_BLOW`)

Seven new bonuses, each a share: so much of each blow's harm again, of its element, landing with
it. Fire, frost, lightning, venom, acid, holy fire and shadow, as the owner asked ("extra fire
damage with each swing, frost slowing, leeching life": leeching life is `leech`, which there is
already). Each in a weapon's `arms` place; the same ingredients give the wards against them
(`wardFire`...) worn.

| Bonus | Element (the wards against it) | Besides |
| --- | --- | --- |
| `fireBlow`, Fire on each blow | fire | the foe struck set burning (afflictions.js `burn`) as often as the share |
| `frostBlow`, Frost on each blow | water | the foe struck slowed (`slow`, its frost look) as often as twice the share |
| `stormBlow`, Lightning on each blow | air | nothing |
| `venomBlow`, Venom on each blow | earth (as the battle's poisons are: a gas bladder's, bile, acid) | the foe struck poisoned (`poison`) as often as twice the share |
| `acidBlow`, Acid on each blow | earth | its share of the blow's harm before armour, not after: acid eats through it |
| `holyBlow`, Holy fire on each blow | magic | harms only the unholy (`UNHOLY`: the restless dead, the hells' and the Breach's demons, the black shuck), twice the others' range for it |
| `shadowBlow`, Shadow on each blow | magic | harms all but the unholy, and withers the foe struck (`wither`: healing takes half) as often as the share |

**How they strike** (stage 2, core/battle.js `#hit`). Once a blow has landed (its harm worked out
as now: the weapon's roll, the striker's power, the target's armour, its wards against the blow
itself, the bestiary's edge, a boss's shield; then a shield's block), if it was a weapon's
(`weaponBlow`, as Leeching and Vicious are: a weapon's blow or shot, not a spell, not what's on the
ground, not reflected) and did any harm, and the target wasn't on horseback (the horse takes it,
as it does now): for each of the striker's blows (the actor's `blows`, { fireBlow: share, ... },
put on it by host.js `#outfit` from progress.js `bonuses()`, each no more than `BLOW_CAP`):

1. **Whom it harms.** Holy fire only one of `UNHOLY`, shadow anyone but; the rest anyone.
2. **How much.** `share × harm`, the harm the blow did (`bare`: acid's, the blow's harm before
   armour), times what gets through the target's wards against its element: its kind's own
   (creatures.js `wards`: a cinder husk keeps off half of fire, a dirge warden half of water's, a
   flayed hierarch three tenths of magic's), a player's from their charms and gear
   (`wardFire`...), half at the most, exactly as a spell's are (battle.js `charmed(target, null,
   element)`); and a Ward spell against that element (`#warded`, `WARD`). At least 1, rounded.
3. **As a hit of its own**, after the blow's: a `hit` event, its `attack` the bonus
   (`"fireBlow"`), its `reaction` one of those there are for its element, no stagger; its hit
   points taken off, its enmity counted, and the foe falls of it if it's the last (`#die`). It
   can't be dodged, covered or caught on a shield (the blow it rides
   on was or wasn't), it isn't leeched (Leeching is of the blow's own harm), and a boss that regrows
   is burnt by fire's (`burntAt`).
4. **What it leaves**, if the foe still stands: `afflict` as often as `chance` times the share, as
   an oil's is (core/goods.js `BREWS`), as strong as the striker's power for the blow.

Each in the order it's on the striker, each on a foe still standing: a foe the blow itself fells
takes none, and one felled by the first takes none of the rest. Its reaction is fire's for fire
(`"fire"`) and arcane light for the rest (`"arcane"`: the water's, the air's, the earth's and
magic's others land so, frost and rot, lightning, acid, bolts); its `projectile` none, the blow's
shot having landed already, so what it grows of a hero's skills is the striker's weapon's: a bow's
shot's, Marksman; any other's, Blade (host.js `#learn`, `#shot`: stage 5; stage 2 had a shot's
grow Blade); its enmity the harm it did, no seed on top (the blow's own `#provoke` has set the foe on the
striker already); it staggers no one. A blow's harm before armour, for acid's, is its roll times
the striker's power, then everything else the blow's harm went through as it is: the target's wards
against the blow, the bestiary's edge, a boss's shield and a shield's block.

A hero's fighting value (core/strength.js `weaponHarm`, might.js) counts them as harm: each share
on top of their blows', holy fire at a quarter (it harms only some).

## Recipes

Every piece of gear's (`RECIPES`). Each three slots: its main material and how many, its second and
how many, an essence (one, or none). The main material sets the make; the noun its name.

| Piece (GEAR id) | Named | Main material | Second | Essence | Reads powers as | Crafters |
| --- | --- | --- | --- | --- | --- | --- |
| `sword` (Sword, 30 gold) | Sword | 1 metal | 1 leather | 1, optional | arms | smith, swordsmith, masterSwordsmith |
| `wand` (Wand, 40 gold) | Wand | 1 wood | 1 gem | 1, optional | magic | scriptorium, emporium |
| `staff` (Staff, 20 gold) | Staff | 2 wood | 1 gem | 1, optional | arms | bowyer, masterSwordsmith |
| `hammer` (War hammer, 35 gold) | War Hammer | 2 metal | 1 wood | 1, optional | arms | smith, swordsmith, masterSwordsmith |
| `greatsword` (Greatsword, 45 gold) | Greatsword | 2 metal | 1 leather | 1, optional | arms | smith, swordsmith, masterSwordsmith |
| `axe` (Battle axe, 40 gold) | Battle Axe | 2 metal | 1 wood | 1, optional | arms | smith, swordsmith, masterSwordsmith |
| `mace` (Mace, 32 gold) | Mace | 1 metal | 1 leather | 1, optional | arms | smith, swordsmith, masterSwordsmith |
| `bow` (Bow, 35 gold) | Bow | 2 wood | 1 cloth | 1, optional | arms (melee read as ranged) | bowyer, masterSwordsmith |
| `gauntlets` (Spiked gauntlets, 25 gold) | Spiked Gauntlets | 1 metal | 1 leather | 1, optional | arms | smith, swordsmith, masterSwordsmith |
| `grimoire` (Grimoire, 45 gold) | Grimoire | 2 leather | 1 gem | 1, optional | magic | scriptorium, emporium |
| `roundShield` (Round shield, 20 gold) | Round Shield | 2 wood | 1 metal | 1, optional | worn | smith, armorer, masterArmorer |
| `kiteShield` (Kite shield, 45 gold) | Kite Shield | 2 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `towerShield` (Tower shield, 70 gold) | Tower Shield | 3 metal | 1 wood | 1, optional | worn | smith, armorer, masterArmorer |
| `spellward` (Spellward, 50 gold) | Spellward | 2 wood | 1 gem | 1, optional | worn | scriptorium, emporium |
| `shield` (Shield, 40 gold) | Shield | 2 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `quiver` (Quiver, 15 gold) | Quiver | 1 leather | 1 wood | 1, optional | arms (melee read as ranged) | bowyer, masterSwordsmith |
| `cap` (Leather cap, 8 gold) | Cap | 1 leather | 1 cloth | 1, optional | worn | leatherworker, masterArmorer |
| `nasalHelm` (Nasal helm, 30 gold) | Nasal Helm | 1 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `wizardHat` (Wizard's hat, 30 gold) | Wizard's Hat | 2 cloth | 1 gem | 1, optional | worn | tailor, emporium |
| `helm` (Helm, 40 gold) | Helm | 2 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `jerkin` (Leather jerkin, 15 gold) | Jerkin | 2 leather | 1 cloth | 1, optional | worn | leatherworker, masterArmorer |
| `gambeson` (Gambeson, 25 gold) | Gambeson | 3 cloth | 1 leather | 1, optional | worn | tailor, masterArmorer |
| `mail` (Mail shirt, 80 gold) | Mail Shirt | 2 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `plate` (Plate armour, 180 gold) | Plate | 3 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `hauberk` (Hauberk, 120 gold) | Hauberk | 3 metal | 1 cloth | 1, optional | worn | smith, armorer, masterArmorer |
| `bracers` (Leather bracers, 10 gold) | Bracers | 1 leather | 1 metal | 1, optional | worn | leatherworker, masterArmorer |
| `vambraces` (Vambraces, 30 gold) | Vambraces | 1 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `gloves` (Gloves, 6 gold) | Gloves | 1 leather | 1 cloth | 1, optional | worn | leatherworker, masterArmorer |
| `platedGloves` (Plated gloves, 25 gold) | Plated Gloves | 1 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `warGloves` (Gauntlets, 25 gold) | Gauntlets | 1 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `belt` (Belt, 5 gold) | Belt | 1 leather | 1 metal | 1, optional | worn | leatherworker, masterArmorer |
| `girdle` (War belt, 20 gold) | War Belt | 2 leather | 1 metal | 1, optional | worn | leatherworker, masterArmorer |
| `trousers` (Trousers, 5 gold) | Trousers | 2 cloth | 1 leather | 1, optional | worn | tailor, masterArmorer |
| `breeches` (Leather breeches, 12 gold) | Breeches | 2 leather | 1 cloth | 1, optional | worn | leatherworker, masterArmorer |
| `greaves` (Greaves, 40 gold) | Greaves | 2 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `legguards` (Leg guards, 40 gold) | Leg Guards | 2 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `leatherBoots` (Leather boots, 10 gold) | Boots | 2 leather | 1 cloth | 1, optional | worn | leatherworker, masterArmorer |
| `sabatons` (Plate boots, 35 gold) | Sabatons | 2 metal | 1 leather | 1, optional | worn | smith, armorer, masterArmorer |
| `warBoots` (War boots, 30 gold) | War Boots | 2 leather | 1 metal | 1, optional | worn | leatherworker, masterArmorer |
| `boots` (Spiked boots, 25 gold) | Spiked Boots | 2 leather | 1 metal | 1, optional | worn | leatherworker, masterArmorer |
| `travelCloak` (Travelling cloak, 12 gold) | Travelling Cloak | 2 cloth | 1 leather | 1, optional | worn | tailor, masterArmorer |
| `cloak` (Cloak, 25 gold) | Cloak | 2 cloth | 1 leather | 1, optional | worn | tailor, masterArmorer |
| `amulet` (Amulet, 60 gold) | Amulet | 1 gem | 1 metal | 1, optional | worn | jeweller, emporium |
| `ring` (Ring, 40 gold) | Ring | 1 gem | 1 metal | 1, optional | worn | jeweller, emporium |

Each recipe is listed at a crafter's in every main material it works, so a crafter's list is
1,813 rows in all (862 different, piece and main material, where several crafters make the
same). A list that long is shown by piece, each piece's materials under it (stage 5).

## Prices

**The fee** (`feeOf`): half (`CRAFT_FEE`) of what a piece of that make and level costs at a shop
(progress.js `priceOf`: its price, times its make's, `QUALITIES` `price`, 1, 3, 8, 14, 21, 30,
times its level's, gear.js `levelFactor`), less the maker's haggling, as what's bought is. It
escalates with the make (thirty times as much for a legendary piece as a common one), with the
piece (plate more than mail, mail more than a jerkin) and with its level. The same at every
crafter: what's dearer at a master's is what they sell, not their work.

| Piece | common | fine | masterwork | rare | very rare | legendary |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sword (30 gold), level 1 | 15 | 45 | 120 | 210 | 315 | 450 |
| Sword, level 100 | 30 | 90 | 240 | 420 | 630 | 900 |
| Plate armour (180 gold), level 1 | 90 | 270 | 720 | 1260 | 1890 | 2700 |
| Gloves (6 gold), level 1 | 3 | 9 | 24 | 42 | 63 | 90 |

**The ingredients' own.** A sold material's price is what a crafter asks for it (on its shelves:
progress.js `SHOPS` `materials`, a master's markup on top as for anything, twice); a creature's
part's is what the guild pays,
as it always was. The new parts are priced by their make, as the old ones were by their creature:
masterwork 22 to 45 gold, rare 70 to 80, very rare 150 to 170, legendary 300 to 360. So the
Adamantite Demon Sword's ingredients are worth 230 gold and its fee, at the 60th level, 503; a
very rare sword bought from a swordsmith's shelves, rolled by chance, would be about 1,000.

## The crafters

Each crafter is a shop (core/progress.js `SHOPS` id; the four new ones stage 4 added): what it
makes, the finest make it works to (`best`: none of a finer main material, and nothing finer
broken down; in a capital, the legendary, below), what it sells to make things with, and how many
rows its list has.

| Crafter | Makes | Works to | Sells | Recipes listed |
| --- | --- | --- | --- | ---: |
| `smith` | 21 pieces: sword, greatsword, axe, mace, hammer, gauntlets, nasalHelm, helm, mail, plate, hauberk, vambraces, platedGloves, warGloves, greaves, legguards, sabatons, roundShield, kiteShield, towerShield, shield | masterwork | bronzeIngot, ironIngot, steelIngot, oakWood, tannedLeather | 147 |
| `swordsmith` | 6 pieces: sword, greatsword, axe, mace, hammer, gauntlets | very rare | bronzeIngot, ironIngot, steelIngot, silverIngot, oakWood, ashWood, tannedLeather, hardenedLeather | 60 |
| `armorer` | 15 pieces: nasalHelm, helm, mail, plate, hauberk, vambraces, platedGloves, warGloves, greaves, legguards, sabatons, roundShield, kiteShield, towerShield, shield | very rare | bronzeIngot, ironIngot, steelIngot, oakWood, tannedLeather, hardenedLeather, linenBolt, woolBolt | 149 |
| `scriptorium` | 3 pieces: wand, grimoire, spellward | very rare | birchWood, ashWood, yewWood, tannedLeather, quartz, amethyst | 58 |
| `bowyer` | 3 pieces: bow, staff, quiver | very rare | pineWood, birchWood, oakWood, ashWood, yewWood, mahoganyWood, linenBolt, tannedLeather, quartz | 58 |
| `leatherworker` | 10 pieces: cap, jerkin, bracers, gloves, belt, girdle, breeches, leatherBoots, boots, warBoots | very rare | tannedLeather, hardenedLeather, linenBolt, woolBolt, bronzeIngot, ironIngot | 400 |
| `tailor` | 5 pieces: wizardHat, gambeson, trousers, travelCloak, cloak | very rare | linenBolt, woolBolt, silkBolt, tannedLeather, quartz, jasper | 55 |
| `jeweller` | 2 pieces: amulet, ring | very rare | quartz, jasper, amethyst, garnet, bronzeIngot, silverIngot | 24 |
| `masterSwordsmith` | 9 pieces: sword, greatsword, axe, mace, hammer, gauntlets, bow, staff, quiver | legendary | steelIngot, silverIngot, ashWood, yewWood, hardenedLeather, silkBolt | 128 |
| `masterArmorer` | 29 pieces: nasalHelm, helm, mail, plate, hauberk, vambraces, platedGloves, warGloves, greaves, legguards, sabatons, roundShield, kiteShield, towerShield, shield, cap, jerkin, bracers, gloves, belt, girdle, breeches, leatherBoots, boots, warBoots, gambeson, trousers, travelCloak, cloak | legendary | steelIngot, silverIngot, hardenedLeather, silkBolt, woolBolt, oakWood | 632 |
| `emporium` | 6 pieces: wand, grimoire, spellward, wizardHat, amulet, ring | legendary | silkBolt, silverIngot, birchWood, hardenedLeather, amethyst, garnet, quartz | 102 |

- **Metal is worked at the smiths**: a blacksmith (every village and greater) blades, heads and
  armour of metal to a masterwork, as its wares go (`SHOPS.smith` `best`); a swordsmith the blades
  and an armorer armour and shields to the very rare, as theirs go.
- **The four new crafters**, as the owner named them: a **bowyer** (bows, staves, quivers), a
  **leatherworker** (what's of leather: a jerkin, gloves, bracers, belts, boots, a cap, breeches),
  a **tailor** (what's of cloth: cloaks, hats, gambesons, trousers) and a **jeweller** (rings and
  amulets). To the very rare, as the specialists. Wands, grimoires and spellwards at the occult
  scriptorium.
- **The legendary at a master's**: the Master Swordsmith every weapon but the arcane (a bow, a
  staff and a quiver too), the Master Armorer everything worn but jewellery and the wizard's hat,
  the Mystic Emporium the arcane and jewellery. Only they sell the legendary now, and a legendary
  piece is the hardest thing in the game to come by: it should be a master's work, and worth the
  journey to the one of each a people keeps. Every piece is made legendary at one of them.
- **And at every crafter in a capital** (recipes.js `CAPITAL_BEST`; crafting.js `capital`, which
  `recipesAt`, `craftRefusal`, `previewOf`, `salvagesAt` and `junkSalvage` take): the owner's
  ruling, 15 November 2026, that every town needn't have every kind of shop but the capital should.
  The masters never stand in one (worldplan/settle.js `masterShops`), so a capital's own crafters,
  its blacksmiths, its specialists and stage 4's four, work to the legendary, and break it down: a
  capital's blacksmith makes an orichalcum sword. The host knows a capital's crafter by their
  building's settlement (host.js `#inCapital`, crafting.js `inCapital`, the one rule the pack shows
  it by too: the start's, for a building at home; never a site's, a castle's or a pedlar's out in
  the world). A master's list is the same anywhere.

### The shops

The four new crafters are shops as the specialists are (stage 4):

- **What they sell** (progress.js `SHOPS`): what each makes (`CRAFTERS` `makes`), a new
  assortment each day as a specialist's, fine to very rare (`grades`, as a swordsmith's), and a
  daily special, very rare or legendary (core/stock.js `dailyStock`): a bowyer 5 things a day
  (always a bow among them), a leatherworker 8, a tailor 6, a jeweller 4, 1 to 3 of each.
- **The materials on every crafter's shelves** (`SHOPS` `materials`: `CRAFTERS` `sells`), the
  smith's, the specialists' who make (not the alchemist's), the masters' and the four new: each
  common, under "Materials for crafting" (`WARE_KINDS` `material`). A blacksmith's as many as are
  asked for, as all its wares are; a shop with a daily stock 10 to 20 of each every day
  (`MATERIAL_COUNT`), for everyone who plays together (or for each character, where a world's
  rule `stock` is `"personal"`: docs/SERVER.md, *A world's preset*), worked out after its other wares and its
  special, so they're as they'd be without them (`dailyStock`'s `materials`; host.js `stockOf`
  puts them on its shelves after the rest).
- **What they buy** (`LINES`, `buys`): what they make (`bows`, `leathers`, `clothes`, a jeweller's
  `jewels`), and every crafter the materials it sells.
- **Inside** (core/insides.js `SHOP_INSIDES`, world/interiors3d.js `shop`, `shopWares`): a room 18
  by 12 metres as every shop's, its counter and keeper, and its trade's own. A bowyer's bows hung
  strung on racks along the walls, staves leant below, shelves of quivers, two tables of bows,
  staves, a quiver, a hatchet and a basket of fletchings, shaving benches with saws and mallets. A leatherworker's hides stretched
  on frames along the walls, shelves of leathers, belts and boots, cutting tables with sheepskins,
  boards and mallets, a jerkin on its stand, benches with knives and dye, a tub of tan. A tailor's
  shelves of bolts of every colour, two dummies in gowns or cloaks, cutting tables with a bolt
  unrolled, cloth folded, shears and baskets of thread. A jeweller's shelves of caskets, cups and
  plate, two cases of rings and stones on velvet under a propped lid of glass, benches with a
  candle and a bowl of stones. What there's a model of in the catalog is one (a hatchet, a saw, a
  mallet, a sheepskin, a board, a knife, baskets, cups, a ewer, candleholders); the rest (bows,
  staves, quivers, hides, bolts, dummies, rings) the game's own art.
- **Their keepers**: a Bowyer (dressed as an apprentice, in a leather apron), a Leatherworker (as
  a smith), a Tailor and a Jeweller (as an innkeeper, in good plain cloth), each shop named by its
  keeper ("Rowe's Bows", "Rowe's Leathers", "Rowe's Tailoring", "Rowe's Jewels"), "the bowyer's"
  and the rest before they're met. Each talks as the specialists do (core/dialogue.js
  `keeperTree`: of their trade, and of today's special).
- **"What can you make?"**: every crafter's keeper is asked it, the smith's (and a castle's
  smith, who makes as a smith) and the specialists' and masters' who make too, not the
  alchemist's (`commissionOf`: the talk ends on it, as on buying). Its effect is `{ commission:
  <the crafter: a CRAFTERS id> }`, handed to the game; app/game.js opens the keeper's shop on its
  Craft tab once the talk's over (`shopWanted` with `tab: "craft"`: *What the player sees*). The
  host keeps it as it keeps any effect of talk, and does nothing with it.
- **Their buildings** (setpieces/pieces.js `CRAFTER_SHOPS`, `SHOP_LANDMARKS`): a house made over
  (*Which settlements keep which*), gone into by its door as the specialists' are. Outside
  (art/kits/shopfront.js `SHOPFRONTS`), their names on their boards ("Bowyer", "Leatherworker",
  "Tailor", "Jeweller"), their signs (new emblems, kits/emblems.js: a longbow and arrow, a
  stretched hide, a tailor's shears, a ring and its stone) and what's set out by the door: a rack
  of bows and a straw butt with two arrows in it; a hide laced on its frame and hides piled on a
  trestle by a pair of boots; bolts of cloth in a rack and a dummy in a cloak; a jeweller's case
  under its propped lid and its scales. The humans' built of the licensed house kit each in a
  look of its own (art/kits/kitshop.js `SHOP_LOOKS`): the bowyer's yew-orange plaster under
  shingles, olive and buff stripes; the leatherworker's umber, half-hipped in red tiles, brown and
  tan; the tailor's madder rose, three jettied storeys, its gable to the street, rose and white;
  the jeweller's lapis blue over stone, hipped in slate, lapis and gold (new tints, painters.js
  `TINTS`; new stripes, cloth.js `SHOP_AWNINGS`); without the licensed models, the game's own in
  those walls, roofs and storeys. Every other people's built as their specialists' are, by their
  own kits.
- **On the maps** (app/mapicons.js): a bow and arrow, a stretched hide, shears, a ring.

### Which settlements keep which

`CRAFTER_TOWNS`: the four new crafters, each a house near the market made over as the specialists'
are (setpieces/town.js), the commonest trades in the smaller places and the jeweller only where
there's money:

| Settlement | The new crafters | Besides |
| --- | --- | --- |
| A farmstead, a hamlet | none | |
| A village | one of the leatherworker, the bowyer and the tailor, by its seed | its blacksmith |
| A town | two of them | its blacksmith and the four specialists |
| A city | two of them, and the jeweller | its blacksmiths and the specialists |
| A capital | all four | its blacksmiths and the specialists; every one of them to the legendary |

So the capital has every crafter but the masters, and wants none of theirs: every crafter there
works to the legendary (*The crafters*, the owner's ruling). The masters stay where they are
(worldplan/settle.js `masterShops`: each people's one of each in a village, town or city of theirs,
never their capital), the legendary there too, away from a capital.

How they're placed (setpieces/town.js `craftersOf`, stage 4):

- **Which**, by the settlement's kind and its seed (`layoutTown`'s), from a random of their own
  (`createRandom(seed * 29 + 3)`), so nothing else of the layout changes: `always`, and `count`
  of `some` shuffled. The same place always keeps the same ones.
- **Where**: each the house nearest the market whose door opens onto a street, on dry land if
  one can be (failing that, over a lagoon with its doorstep on a walk; failing that, a building
  behind the street's houses), as the specialists' are; made over in place, its style and storeys
  kept. They're made over last, after the specialists', a master's and the stable, so every
  building those chose is chosen as it was, and the ids and seeds of every landmark are as they
  were. **A world laid out before keeps every building it had**, each where it stood: only a few
  of its houses near the market are shops now (`test/shops.test.js` lays places out with and
  without them, `crafters: []`, and finds nothing else changed).
- **A place too small**: none in a place of `CRAFTER_SPARE` houses (3) or fewer, along its
  streets and behind them, so none is left with fewer than three (some lizard folk's and dark
  elves' villages of two or three houses), and the place is never laid out again for one: it does
  without. Every village, town
  and city of the humans', and every capital of every people's, has room.

## Salvage

Gear broken down at a crafter's (`salvageOf`) gives back one ingredient of its main material's kind
and its make, and one more for each two more of it its recipe takes (plate, three ingots: two
back). Any gear, made or found. A crafter breaks down what it makes, no finer than it works, never
what's bound to its hero (`salvagesAt`). No fee. Nothing else comes back (not its essence, not its
second).

**Never worth more than the piece.** What comes back never sells for more than the piece itself
would (progress.js `priceOf`; haggling counts the same on both, so it cancels). Where it would,
fewer come back, then the make below, as many again, till it doesn't. Otherwise a piece bought
could be broken down into parts the guild pays for in full, for more than it cost: a castle
quartermaster sells legendary gambesons without end, 488 gold at the first level with the most
haggling, and two moonsilk sell for 864. Now that gambeson gives back two gloomsilk (300, what it
sells for). The higher a piece's level, the more it's worth: at the hundredth every piece gives
back the whole but five, a legendary gambeson (one moonsilk, not two), belt, trousers and
travelling cloak, and very rare trousers, whose parts are worth more than such light gear sells
for (`test/crafting.test.js` names them).

| Kind | common | fine | masterwork | rare | very rare | legendary |
| --- | --- | --- | --- | --- | --- | --- |
| Metal | iron | steel | black steel | mythril | adamantite | orichalcum |
| Wood | oak | ash | blighted heartwood | ironwood | ghostwood | sylvanwood |
| Cloth | linen | silk | black widow silk | wraith's shroud | gloomsilk | moonsilk |
| Leather | tanned leather | hardened leather | troll hide | wyvern scale | drake scale | Dreadthorn scale |
| Gem | quartz | amethyst | basilisk's eye | sapphire | diamond | star ruby |

**Break down all junk** (`junkSalvage`), beside *Sell all junk* (docs/GAME.md *Junk*): every stack
of gear in the pack marked as junk that the crafter breaks down, each piece as `salvageOf` says,
what it won't still junk for one that will; never the stash's. It fits the junk feature as selling
does: the same marks, the same question first, all of it or nothing.

## New beasts

Nine creatures, so every rarer ingredient has one to come off (stage 3: in the game). Each borrows
a body and a fight from one there is, drawn in its own colour and size (beasts/model.js `MODELS`,
the borrowed model's skin where it has one that suits: the Stone Golem's model's ember, moss and
frost skins were kept "for something rarer"; beasts/looks.js `LOOKS` its stand-in), and has its own
entry in both, by its own id, and a catalog key of its own waiting (`model`): a model bought for it
later is put in by its entry's `asset`, and nothing of the rules changes (*Its own model, later*,
below). The owner's ruling: "Use existing models recolored but also allow for additional, specific
purchased models to be added in the future."

| Id | Name | Body (borrowed, tint, size) | Its own model, to come | Tiers | Met | Leaves |
| --- | --- | --- | --- | --- | --- | --- |
| `mythrilGolem` | Mythril golem | Stone golem (`stoneGolem`), its `frost` skin, `#8ac8f0`, ×0.8 | `beast-mythril-golem` | 6 to 9 | mountain, snow, tundra; dungeons: caves | Mythril ingot 60% ×1–2, Sapphire 15% |
| `adamantiteGolem` | Adamantite golem | Stone golem (`stoneGolem`), its `moss` skin, `#2e5a48`, ×1 | `beast-adamantite-golem` | 8 to 10 | volcanic, badlands, mountain; dungeons: caves | Adamantite ingot 55% ×1–2, Diamond 12% |
| `orichalcumColossus` | Orichalcum colossus | Stone golem (`stoneGolem`), its `ember` skin, `#e07a30`, ×1.6 | `beast-orichalcum-colossus` | 10 to 10, perilous | volcanic; dungeons: hell (the River of Fire) | Orichalcum ingot 60% ×1–2, Star ruby 15% |
| `gildedScarab` | Gilded scarab | Giant cockroach (`giantCockroach`), `#e8b830`, ×1.4 | `beast-gilded-scarab` | 3 to 7 | the cat folk's lands' wilds | Gold ingot 12%, Carapace plate 40% |
| `ironbarkTreant` | Ironbark treant | Blighted treant (`treant`), `#4a4a4e`, ×1.1 | `beast-ironbark-treant` | 6 to 9 | the orcs' lands' wilds | Ironwood 50% ×1–2 |
| `ghostwoodTreant` | Ghostwood treant | Blighted treant (`treant`), `#c8dce8`, ×1.15 | `beast-ghostwood-treant` | 8 to 10, night only | darkwood, marsh; dungeons: ancient | Ghostwood 50%, Ectoplasm 35% |
| `sylvanAncient` | Sylvan ancient | Blighted treant (`treant`), `#c8d8b0`, ×1.6 | `beast-sylvan-ancient` | 8 to 10, perilous | the elves' lands' wilds | Sylvanwood 60% ×1–2, Ancient's sap 30% |
| `gloomweaver` | Gloomweaver | Black widow (`blackWidow`), `#3a2a5a`, ×1.5 | `beast-gloomweaver` | 8 to 10, perilous | the dark elves' lands' wilds; dungeons: nest | Gloomsilk 60% ×1–2, Black widow's venom gland 50% |
| `moonMoth` | Moon moth | Dungeon wasp (`dungeonWasp`), `#e8f0ff`, ×2.2 | `beast-moon-moth` | 8 to 10, perilous, night only | elfwood, meadow | Moonsilk 50%, Pixie dust 50% ×1–2 |

Each fights as the creature it borrows from (its `weapon`, its moves, its temper, its hit points at
the first tier, its armour, what harm it keeps off, how it bleeds), its hit points and harm as its
tiers have them (creatures.js `TIER_GROWTH`); none of them a world's boss. Those out only at night
as the bats are (`night: "only"`), and see in the dark as the night's own do. They're in
creatures.js `CREATURES` (at its end), spoils.js `SPOILS`, the wilds' tables (creatures.js
`candidatesAt`: their lands and tiers) and the dungeons' (core/dungeons/themes.js `packs`), the
fresh tracks' (core/director.js `TRACKLESS`: the moon moth leaves none), the bestiary's lore
(core/lore/bestiary.js `BESTIARY_LORE`), their voices (audio/sound.js `CREATURE_VOICES`, the
borrowed creature's family, lower as each is bigger: audio/catalog.js says so), their prints
(world/tracks3d.js: the golems' the Stone Golem's), and the model viewer (*The crafters' quarry*).
`test/crafting.test.js`, `test/creatures.test.js` and `test/model.test.js` hold them to
materials.js `NEW_BEASTS`.

What was decided where the table didn't say:

- **Met out in the wilds though perilous** (creatures.js `abroad`, as the frost troll is; it was
  `id === "frostTroll"`): the colossus, the ancient, the gloomweaver and the moon moth. Perilous,
  they're met alone (pack 1), never an elite, and their fall's told across the screen; the rest
  keep the borrowed creature's pack (a gilded scarab's two to four, a giant cockroach's).
- **The sylvan ancient and the moon moth from the eighth tier, not the tenth.** The tenth tier is
  only ever reached in the mountains, snows and burning lands far out (creatures.js `TIER_LAND`);
  no people's lands but the orcs' come to it, and the elves' woods and the meadows never go past
  the eighth (measured over six worlds' plans), so at 10 to 10 neither would ever have been met.
  At 8 to 10 each is met at the eighth (`test/creatures.test.js` holds that every one of the nine
  is met in seed 2's world). The gloomweaver, 8 to 10 as planned, is met at the eighth too.
- **The gloomweaver doesn't lurk** (the black widow's `lurk`): it's met in the open, with no roof
  to hang from, and a creature's ways are the same wherever it's met.
- **Hit points** are the borrowed creature's at the first tier, as the table's "fights as" has it,
  but for the two perilous foes whose kind is small: the gloomweaver has 80 (a black widow's 54)
  and the moon moth 70 (a dungeon wasp's 26, which would have been 82 at the eighth tier, the
  weakest of the perilous by far for the legendary cloth). With them they stand with the frost
  troll (75), the wight lord (70) and the sylvan ancient (80).
- **Their colour on a borrowed model** (beasts/model.js `TINT`, the entry's `tint`): the model's
  pictures' light and shade kept, gentler (the square root of how light each point is), in the
  tint's colour, 85% of the way from its own, in its own copy of each material; a colour multiplied
  in would leave a dark model (a cockroach, a black widow) as dark as it was. A skin's glow (the
  ember skin's) is left as it is. Their stand-ins are coloured in their own looks.
- **The balance runner** (`npm run balance -- --tiers 5,8 --seeds 2,3,4,5,6,7 --sides solo,four`,
  24 fights each, before and after): at the fifth tier nothing changed. At the eighth, where the
  golems and treants are met now, a player alone lost 292 hit points a fight where they'd lost
  246 (562 a minute where 499), fell 0.29 times a fight where 0.25, and won 17 of 24 where 18;
  four together lost 279 each where 233, fell 1.54 times where 1.33, and won 15 where 16, fewer
  foes coming at them (5.8 where 7.1: a golem or a treant alone, where a pack was). The golems
  hit as the Stone Golem does, a world's boss's blows, at the tier they're met: a `hp` and a
  weapon of their own would soften them, if that's too much.
- **Where in the dungeons**: the caves' packs a mythril golem or an adamantite golem, alone; the
  ancient temples' a ghostwood treant; the ants' nests' a gloomweaver; a hell's River of Fire an
  orichalcum colossus. `DUNGEON_VERSION` 18 → 19, as what a seed makes changed.

### Its own model, later

Each new beast's `MODELS` entry is made by `quarryModel` (beasts/model.js): its own model once one's
been bought for it and the catalog has it, else the borrowed one, recoloured and resized (or, a
treant's kind, which has no model, none: its stand-in), and it names its own model to come either
way (`own`). `test/model.test.js` holds that each names `beast-<its id>`, that the catalog has none
yet, and that its own is drawn only once both are there. To give one its own bought model:

1. Bring the model in as `.claude/skills/import-licensed-model/SKILL.md` says (licence first,
   the pipeline, scrambled into `hoffspot/conquest-models`), under its own catalog key, the one
   materials.js `NEW_BEASTS` names (`beast-mythril-golem`; its skins, if it has any, as
   `beast-mythril-golem-skins`), and in `.gitignore`, `client/models/beasts/LICENSE.md`,
   `README.md`, `NOTICE.md`, `docs/LICENSED_MODELS.md`, `contribution.md`'s list and
   `test/scramble.test.js` as every licensed model is.
2. Write its entry in beasts/model.js `OWN_MODELS`, by its id (`mythrilGolem`), as any of `MODELS`'
   is, from the model: its `asset` (its own key), how long and tall it's made and drawn, its clips
   for each of the borrowed creature's ways (weapons.js `NATURAL`'s `animation`s: the golems'
   `smash`, `sweep`, `pound` and `heave`, the treants' `melee` and `roots`...), its joints, its
   pace. No `tint`: it's drawn in its own colours. Each of its clips and bones is checked against
   the model (`test/model.test.js`, with `LICENSED_MODELS=required`).
3. If its clips time its blows otherwise, give it a weapon of its own (weapons.js `NATURAL`, and
   creatures.js `weapon`), as each bought model's is; nothing else in the rules changes.
4. `npm run build:manifest`, its stand-in left as it is (it's drawn till the model's read), its
   line in the model viewer (lab/model-viewer.js `ABOUT`) and in docs/WILDS.md saying it's its own.

And more off creatures there were, in their `SPOILS` since stage 3 (materials.js's `MORE_SPOILS`,
which planned it, is gone, and crafting.js `sourcesOf` reads `SPOILS` alone):

| Creature | Leaves besides |
| --- | --- |
| Black widow (`blackWidow`, tiers 3 to 10) | Black widow silk 40% |
| Orc raider (`orcRaider`, tiers 3 to 10) | Black steel ingot 8% |
| Orc reaver (`orcReaver`, tiers 3 to 9) | Black steel ingot 25% |
| Orc warlord (`orcWarlord`, tiers 4 to 9) | Black steel ingot 30% |
| Orc champion (`orcIronjaw`, tiers 5 to 10) | Black steel ingot 40% |
| Orc champion (`orcBloodtusk`, tiers 5 to 10) | Black steel ingot 40% |
| Orc King (`orcKing`, tiers 6 to 10) | Black steel ingot 80% ×1–2 |
| Goblin King (`goblinKing`, tiers 3 to 8) | Gold ingot 30% |
| Bandit chief (`banditChief`, tiers 1 to 10) | Gold ingot 15% |
| Drake (`dragon`, tiers 10 to 10) | Gold ingot 60% ×1–2 |

## The bestiary

It lists what each creature leaves already, at Mastered (app/bestiary.js `spoilsOf`): every part
there is is an ingredient now, so that's where the player learns where each comes from. Stage 5:

- each part shown there in its make's colour, as gear is (progress.js `gradeOf`: an ingredient's
  make, stage 5: so a part on the ground, in the pack and in auto-snag's choice of makes is of its
  make too), with what it's for, briefly ("Fire on each blow, in a weapon": app/gearinfo.js
  `usedFor`, its power in a weapon), its name tapped opening its card beneath it (app/journal.js);
- an ingredient's card (tapped in the pack, at a crafter's, in the bestiary) says what it is
  (`about`), what it's used for (`usesOf`: its power in a weapon, a wand and worn, and its kind's
  slots), and where it comes from (`sourcesOf`): the crafters that sell it, the creatures that
  leave it (by name once they're in the bestiary, "Something in the mountains" till then, as
  Monster Hunter's ??? is), and that broken-down gear gives it back (app/craftinfo.js
  `ingredientInfo`, `sourcesWords`: a creature met is one Sighted; one still to come, stage 3's,
  where it'll be met, bestiary.js `whereNew`; three not yet met said, then "And by more you've yet
  to meet"); and a creature's part, what the guild pays for it.

## What the player sees

Stage 5 (docs/GAME.md *Crafting*, for the player's view of it):

- **The Craft tab** (app/pack.js; its words app/craftinfo.js, pure), beside Buy and Sell at every
  shop in `CRAFTERS` (keyed off it, so the four new crafters have it once they're keepers): the
  crafter's list by piece under where it goes (`craftList`), each piece's main materials in their
  makes' colours, what the pack's short of greyed and said, never hidden. A piece chosen shows its
  three slots, each one's choices from what the pack carries (`slotsOf`; never the stash's),
  filled first with the commonest second that keeps the piece as fine as its main material can
  make it, and no essence (`usingFirst`); the piece as it would be made (`previewInfo`, of
  `previewOf`, at the player's might's level and haggling, as the host makes it), the fee, what the
  ingredients are worth and what's short; **Craft** sends `{ type: "craft", from, base, using, fee
  }`, refusals said in the panel. The piece made is shown as it came out.
- **A capital's crafters** (`capital`): the pack asks the rule the host makes it by, core/crafting.js
  `inCapital(world, map)`, pure, of the world every copy builds (the keeper's building's
  settlement); host.js `#inCapital` calls it, so the two can't disagree.
- **Breaking down** on the Sell tab: a piece the crafter breaks down (`salvagesAt`) says in its
  card what it gives back, and its Break down asks first in the panel (of a stack, how many);
  **Break down all junk** under Sell all junk, asked once with what comes back (`junkSalvage`, the
  count shown sent: `salvageJunk`).
- **Opened on its Craft tab** by the game's `openCrafting(keeper)` (app/game.js), or by a talk's
  `shopWanted` with `tab: "craft"` (#endTalk opens it once the talk's over, as a shop's wares are).
  A crafter's keeper's "What can you make?" (core/dialogue.js `commissionOf`) does that: its
  `commission` effect handled in the talk's `onEffect` as `{ shop }`'s is, setting
  `this.shopWanted = { shop: keeps, keeper: npc.id, name: npc.name, tab: "craft" }`.
- **Told**: `crafted` and `brokenDown` heard (app/game.js `HOST_EVENTS`): "Made for you: Steel Demon
  Sword, for 45 gold. It's in your pack.", the anvil rung and the work quenched (`anvil`, `hiss`);
  "You break down your junk, 3 things: back come 4 iron ingots.", a hammer's crush (`crush`): the
  smithy's and a war hammer's own sounds, no new recording (audio/catalog.js says where they play).
- **The new blows seen** (app/game.js `BLOW_LOOKS`): each hit of its own shows a little of its
  element where the blow landed, out of the bursts there are (the burn's flames and embers, frost
  and a legendary weapon's frost and sparks, venom's bubbles, ichor for acid, a blessing's gold for
  holy fire, a curse's withering and shadows), a dozen or so sparks, and its number smaller than
  the blow's, in its element's colour (styles.css `.damage.blow-*`); no flinch, wound or blood of
  its own, the blow having had them.
- **The keys and a controller**, as at the stash: Enter (Cross) chooses and crafts, Escape (Circle)
  puts away what's open, then goes back to the list, then shuts the panel; L1 and R1 turn Buy,
  Sell and Craft; held, right-clicked or Square, a material's card. A phone upright or on its side
  fits it all, scrolled.
- **Tests**: `test/crafting-view.test.js` (the pure words and lists, the bestiary's parts, the
  grade), `test/crafting-host.test.js` (a shot's elemental harm growing Marksman, `inCapital`),
  `e2e/crafting.spec.js` (all of it played at the start town's blacksmith).

No message, field or refusal is new with it, and nothing of the world or the rules two games agree
on changed but the skill a shot's fire grows (the host's, in lockstep: `NET_VERSION` 231 is this
pull request's one bump) and an ingredient's grade (what auto-snag takes by make, the host's too).

## Multiplayer

Making and breaking down are the host's (stage 2), as buying and selling are, the same on every
copy of the world.

**Commands**, each new:

- `{ type: "craft", from, base, using, fee }`: at the crafter `from` (a keeper's id), the piece
  `base` (a `RECIPES` id) of `using` (an ingredient's id for each slot in order, `null` for the
  essence left out), for the fee the player was shown.
- `{ type: "salvage", from, index, count }`: the stack in that place of the pack, so many of it.
- `{ type: "salvageJunk", from, count }`: all the junk the crafter breaks down, as many pieces as
  the player was shown.

**What's checked**, in this order; refused with the reason (core/host.js `REFUSALS`), and nothing
changed:

| Refusal | When | New |
| --- | --- | --- |
| `dead` | the player's fallen | |
| `far` | no crafter near, alive (`#shopkeeper`) | |
| `command` | not as it should be: `base` not a string, `using` not a list of ids and nulls, `fee` or `count` not a whole number | |
| `uncrafted` | that crafter doesn't make that (`craftRefusal`) | yes |
| `unfit` | an ingredient left out that can't be, or not of its slot's kind (`craftRefusal`) | yes |
| `unworked` | its main material's finer than that crafter works (`craftRefusal`; in a capital, the legendary) | yes |
| `lacking` | the pack hasn't all it takes (`lackingIn`: never the stash's) | yes |
| `craftChanged` | the fee isn't what it comes to now (`previewOf`: the player's might or haggling has changed) | yes |
| `gold` | not enough gold for the fee | |
| `full` | no room for what's made, the ingredients taken, or for what's broken down | |
| `item`, `count`, `bound` | breaking down: nothing there, not so many, bound to its hero | |
| `unsalvaged` | breaking down: that crafter doesn't break that down (`salvagesAt`) | yes |
| `junkNone` | breaking down all junk: nothing marked at all (as selling it) | |
| `salvageNone` | breaking down all junk: nothing marked that crafter breaks down | yes |
| `salvageChanged` | breaking down all junk: not the count the player was shown | yes |

Breaking down one stack is checked `dead`, `far`, `command`, then `item`, `count`, `bound`,
`unsalvaged` and `full`; all the junk, `dead`, `far`, `command`, `junkNone`, `salvageNone`,
`salvageChanged` and `full`. An `index` that's no place of the pack is `item` (nothing there), as
selling has it; a `count` of none, `count`.

The new reasons' words are `CRAFT_REFUSALS` in crafting.js, for `REFUSALS` to take. All of it or
nothing: the ingredients are taken (`takesFrom`: a junk stack of one before one that isn't, then the
smallest, then the first), the piece made with the world's dice (`craftItem`, of the player's
might's level, `mightFor`, and the crafter's people) and put in the pack; if it won't go, the pack
and the gold are as they were. The fee grows the Trade skill, as buying does; breaking down is free
and grows nothing. Told: `crafted` (`{ id, item, fee, from, used }`: the piece as it's kept, the
ingredients taken, `needs`) and `brokenDown` (`{ id, items, yields, from, junk? }`), each new. Each
answers with what came of it (`{ ok, item, fee }`; `{ ok, count, yields }`; and with all the junk,
`left`, the junk gear kept). Each is trade with whoever's at the counter, as buying and selling are,
so it ends the player's Invisibility (host.js `SEEN`), refused or not.

**Every name new, never used before.** The commands, refusals, events, the shops' ids (`bowyer`,
`leatherworker`, `tailor`, `jeweller`), the new things' and creatures' ids and the seven new
bonuses' were each looked for in the whole of the repository's history (`git log --all -p`,
15 November 2026) and found nowhere. `salvaged` wasn't used for an event, as a world's record on a
server has a field of that name already.

**The versions** (contribution.md, section 3):

- `NET_VERSION` 230 → 231, once, in stage 2: new commands in lockstep, and the battle's rules
  change (the new blows), and with stages 3 and 4 the world's creatures and its towns (stage 4:
  its crafters' shops made over from houses, their doorsteps opened, the materials on the shelves,
  and a body of a battle that was gone coming back once it's reinforced, core/engagement.js). One
  bump for the one pull request. Nothing else guards a town's layout: there's no version of the
  world plan's or a town's, `TERRAIN_VERSION` is the ground's (a town's ground, its streets and
  what stands where are as they were) and `DUNGEON_VERSION` a dungeon's.
- `DUNGEON_VERSION` 18 → 19, in stage 3: the dungeons' packs have the new beasts in them, so what
  a seed makes changed (a dungeon kept by 18 is made again from its seed, core/dungeons/build.js).
- `SNAPSHOT_VERSION` stays 54 and `SAVE_VERSION` 2: what's made is gear as it's kept now (its
  `name`, its `bonuses`, its `effect`), only with bonuses that are new; kept only where they're
  set, and absent they mean nothing, so there's nothing for a step to fill in; an older game
  reading a newer save drops them and nothing else, as junk's marks went.
- No switch: it's a game feature, as the stash and junk were, not the replication programme's.
  The two netcodes: nothing replicated changes but what a pack and gear hold, which a view's
  schema would carry as it carries gear (none exists yet: `VIEW_VERSION` isn't there to bump).

## The five stages

1. **The design and the data** (this). This page; materials.js, recipes.js, crafting.js; the new
   parts, materials and pictures; the unit tests.
2. **The rules, the host and the blows** (done). The seven blows into gear.js `STATS` (labels as
   `ON_BLOW`, `share`), progress.js `bonuses()` (their totals and `BLOW_CAP`), app/gearinfo.js's
   words for them; the battle's (*How they strike*), host.js `#outfit` putting them on the actor;
   might.js and strength.js counting them; host.js `#craft`, `#salvage`, `#salvageJunk`, their
   refusals and events (*Multiplayer*); `NET_VERSION` 231; tests of all of it, in both ends of a
   lockstep game.
3. **The new beasts.** The nine in creatures.js, spoils.js, the wilds and the dungeons, their
   models (borrowed, by their own ids) and stand-ins, their lore; `MORE_SPOILS` into `SPOILS`
   (then taken out of materials.js, `sourcesOf` reading `SPOILS` alone); the bestiary's count
   where docs/GAME.md says it (it said 97, where there were 127 kinds: 136 now); tests
   (model.test.js, creatures.test.js, the balance runner for their tiers: `npm run balance`).
   Done: *New beasts* says what was decided.
4. **The shops and the towns** (done: *The shops*, *Which settlements keep which*). The four new
   crafters in `SHOPS` (their wares: what they sell, `CRAFTERS` `sells`, and what they make, as
   the specialists sell theirs; the lines they buy: materials, and what they make), the materials
   on the crafters' shelves; their buildings (setpieces/pieces.js `CRAFTER_SHOPS`, by
   `CRAFTER_TOWNS`: town.js `craftersOf`, made over from houses near the market and nothing else
   moved, so a world laid out before keeps every building it had), their insides and keepers
   (core/insides.js `SHOP_INSIDES`, `NAMES`), their keepers' talk (core/dialogue.js `keeperTree`,
   with a "What can you make?", `commissionOf`, that opens the crafting), their signs, awnings
   and map icons; every crafter's keeper asked it (the smith's, the specialists' and the masters'
   too); tests (test/shops.test.js, test/stock.test.js, and the expectations of the others that
   counted the shops, in its commit).
5. **What the player sees** (done: *What the player sees*). The pack's crafting (a crafter's list
   by piece and material, missing ingredients greyed, a slot's choices from what's carried, the
   piece shown first: make, name, powers and their ranges, effect, fee, worth; Craft), breaking
   down one piece and all junk; ingredients' cards and colours; the bestiary (*The bestiary*); the
   new blows' look; a shot's elemental harm growing Marksman; sounds for making and breaking down
   in audio/catalog.js; browser tests; docs/GAME.md (*Crafting*), docs/WAR.md (*Shops*), README,
   and this page brought up to date. docs/WILDS.md's new beasts are stage 3's.

## Choices the owner may want to change

- **The make rule**: no more than one make above the second ingredient (`MAKE_ABOVE`), the essence
  never lowering it. Two would let a legendary metal on bought hardened leather (fine) make a rare
  piece, where one makes it a masterwork.
- **Powers by where they're set**: an ingredient's power is its family's, read differently in a
  weapon, a wand and worn gear (a demon's horn: fire in a sword, fire kept off in plate). Every
  ingredient brings one, the commonest too (iron: hit points).
- **The essence is optional**: an iron sword can be made of what's bought alone; the owner's
  example has one, and a piece is named for it when it has one.
- **Counts**: a sword takes one ingot (the owner's example), a greatsword two, plate three, a
  gambeson three bolts.
- **Legendary at a master's, and in a capital** (the owner's ruling, 15 November 2026: every town
  needn't have every kind of shop, but the capital should). The masters stay out of the capitals
  (worldplan/settle.js), and a capital's own crafters work to the legendary instead
  (`CAPITAL_BEST`), so the capital lacks nothing and nothing about the towns moves. The other way
  would put the masters in the capitals too, moving a building in every world laid out before.
- **The fee**: half a shop's price for that make and level, the same at every crafter, no markup
  at a master's.
- **What's sold**: common and fine only; masterwork and finer only off creatures or back from
  broken-down gear.
- **Salvage**: free; one ingredient of the piece's main kind and make (two for the biggest), even
  of the legendary (a legendary sword gives an orichalcum ingot); any gear, made or found; never
  worth more than the piece sells for (*Salvage*: else bought gear broken down made gold without
  end). Light legendary pieces of a low level give back less: a crafted piece could be marked
  and give back its whole always, but that's a field on every piece, kept and sent.
- **Strength**: a legendary ingredient 2.5 times a common one's power, and the blows each up to
  0.4 of a blow's harm, all gear together.
- **The new beasts**: nine, golems, treants, a spider, a scarab, a moth, borrowing models there
  are; the moon moth a perilous foe for the legendary cloth, met at the eighth tier, not the
  tenth, as no elfwood or meadow is further out than that (and the sylvan ancient so too: *New
  beasts*). Each has the hit points of the creature it borrows but the gloomweaver (80) and the
  moon moth (70), given as many as the other perilous foes met in the wilds, so the very rare and
  legendary cloth are hard won. A gilded scarab goes in a giant cockroach's packs (two at the
  third tier, four by the seventh) and leaves a gold ingot one time in eight (12%), so a fight
  with them leaves about a quarter of an ingot at the third tier and two thirds of one at the
  seventh.
- **Holy fire harms only the unholy**, at twice the others' range; shadow harms all but them.
- **Every creature's part is an ingredient** but what's eaten, so none is only for selling now.
- **Names in capitals**, as the owner wrote "Adamantite Demon Sword", where the game's own
  labels are "Leather jerkin".

## Sources

How well-liked games do it, and what was taken:

- RuneScape's metals, bronze to iron, steel, black, mithril, adamant, rune and orikalkum above
  (runescape.wiki, *Metal*; oldschool.runescape.wiki, *Smithing*): the ladder of metals, mithril
  the lightest and adamant the hardest, black between steel and mithril (our black steel, the
  orcs').
- Skyrim's smithing, iron to steel, orcish, dwarven, elven, glass, ebony, daedric, dragonbone, a
  piece's main material its ingot or a dragon's scale, the rarest wanting a daedra's heart
  (en.uesp.net, *Skyrim:Smithing*): a main material, and a creature's part for the finest.
- Monster Hunter, each weapon made of a monster's parts and ores, its element from the monster,
  what can be made shown bright and what can't greyed, the hunter's notes saying what a monster
  leaves (the series' guides: Push Square, Shacknews, Gamer Guides): the essence, the greyed list,
  the bestiary telling where an ingredient comes from.
- Diablo II's gems, each one thing in a weapon (a ruby, fire), another in a shield (fire's
  resistance) and another in armour, a diamond's the bane of the undead (classic.battle.net,
  *Gems*; diablo2.diablowiki.net): the families' powers by where they're set, holy fire on the
  unholy alone.
- Diablo IV's salvage, gear broken down at the blacksmith into materials by its rarity
  (Icy Veins, *Blacksmith guide*; GameSpot): salvage by make.
- World of Warcraft's cloths, linen, wool, silk, mageweave, runecloth (warcraft.wiki.gg,
  *Tailoring*): the cloth ladder, linen and wool the commonest.
- Dungeons & Dragons' special materials, mithral, adamantine, cold iron against the fey,
  alchemical silver against lycanthropes, darkwood (Pathfinder's *Special Materials*,
  d20srd.org): silver against the restless dead and the werewolf, adamantite the hardest.
- The owner's own words: bronze, iron, steel, black steel, mythril, adamantite, orichalcum,
  silver and gold; pine, oak, birch, ash, yew, mahogany, ironwood, ghostwood, sylvanwood,
  heartwood; a demon's horn, black widow silk, wyvern hide.
