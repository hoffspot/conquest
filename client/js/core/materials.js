// What gear is made of at a crafter's (docs/CRAFTING.md): its ingredients, each a metal, a wood, a
// cloth, a leather, a gem or an essence (a creature's part kept for what's in it), and each of a
// make (progress.js QUALITIES), from the commonest to the legendary. The commoner metals, woods,
// cloths, leathers and gems are sold at the shops (MATERIALS); the rarer come only off the wild's
// creatures (spoils.js PARTS: the parts they've always left, and some new), or back from gear
// broken down at a crafter's (recipes.js SALVAGE).
//
// Each ingredient brings one power to what's made of it, its family's (FAMILIES): which of the
// gear's bonuses (gear.js STATS, and the new blows of ON_BLOW) it is depends on what's made, a
// weapon that strikes, a wand or grimoire, or anything worn. How strong, by its make (MAKE_STRENGTH)
// and the piece's level, rolled within its range as a found piece's bonuses are (crafting.js).
//
// Pure data, no DOM: the crafters' rules (crafting.js), the pack and the bestiary read it.

/**
 * The ingredients sold at the shops (the commoner grades: recipes.js CRAFTERS `sells`), and not
 * off any creature: each one's name, what it costs (gold), and what it looks like in the pack
 * (`icon`, a kind of picture, and `tint`, its colour: app/icons.js, as a creature's part's).
 */
export const MATERIALS = Object.freeze({
    // Metals, as ingots
    bronzeIngot: { label: "Bronze ingot", price: 6, icon: "ingot", tint: "#b8803a" },
    ironIngot: { label: "Iron ingot", price: 8, icon: "ingot", tint: "#6e7178" },
    steelIngot: { label: "Steel ingot", price: 24, icon: "ingot", tint: "#a9b4bf" },
    silverIngot: { label: "Silver ingot", price: 30, icon: "ingot", tint: "#d8dde4" },
    // Woods, sawn and seasoned
    pineWood: { label: "Pine wood", price: 4, icon: "wood", tint: "#d8b47a" },
    birchWood: { label: "Birch wood", price: 5, icon: "wood", tint: "#e6dcc4" },
    oakWood: { label: "Oak wood", price: 6, icon: "wood", tint: "#8a6234" },
    ashWood: { label: "Ash wood", price: 16, icon: "wood", tint: "#c8a878" },
    yewWood: { label: "Yew wood", price: 20, icon: "wood", tint: "#b0582e" },
    mahoganyWood: { label: "Mahogany", price: 22, icon: "wood", tint: "#6e2a1a" },
    // Cloths, by the bolt
    linenBolt: { label: "Bolt of linen", price: 4, icon: "bolt", tint: "#e8e0cc" },
    woolBolt: { label: "Bolt of wool", price: 5, icon: "bolt", tint: "#8a7a64" },
    silkBolt: { label: "Bolt of silk", price: 26, icon: "bolt", tint: "#c84a6a" },
    // Leathers, tanned and hardened
    tannedLeather: { label: "Tanned leather", price: 6, icon: "hide", tint: "#8a5a32" },
    hardenedLeather: { label: "Hardened leather", price: 18, icon: "hide", tint: "#5a3418" },
    // Gems, cut
    quartz: { label: "Quartz", price: 8, icon: "gem", tint: "#e8eef4" },
    jasper: { label: "Jasper", price: 8, icon: "gem", tint: "#a8402e" },
    amethyst: { label: "Amethyst", price: 28, icon: "gem", tint: "#9a5ad0" },
    garnet: { label: "Garnet", price: 26, icon: "gem", tint: "#8a1a2a" },
});

/** The kinds of ingredient, as a recipe's slots ask for them (recipes.js RECIPES). */
export const INGREDIENT_KINDS = Object.freeze(["metal", "wood", "cloth", "leather", "gem", "essence"]);

/**
 * The new blows a crafted weapon can strike (docs/CRAFTING.md *Blows*), each a bonus as gear.js
 * STATS are (a share: so much of each blow's harm again, of its element), its name as it's shown,
 * its element (the wards against it: a creature's `wards`, a player's charms and gear, battle.js
 * `charmed`), and what else it does:
 *
 *  - `afflict`: the foe struck left with that (core/afflictions.js), as often as `chance` times
 *    the share (frost's slowing in its frost `look`);
 *  - `bare`: its share of the blow's harm before armour (acid eats through it);
 *  - `only`: harming only those of UNHOLY (holy fire, the dead's and the demons' bane), or `not`:
 *    harming all but them (shadow, which is theirs already).
 *
 * The battle lets them loose as of stage 2 (gear.js STATS takes them then): until then they're
 * only kept on what's made.
 */
export const ON_BLOW = Object.freeze({
    fireBlow: { label: "Fire on each blow", element: "fire", afflict: "burn", chance: 1 },
    frostBlow: { label: "Frost on each blow", element: "water", afflict: "slow", look: "frost", chance: 2 },
    stormBlow: { label: "Lightning on each blow", element: "air" },
    venomBlow: { label: "Venom on each blow", element: "earth", afflict: "poison", chance: 2 },
    acidBlow: { label: "Acid on each blow", element: "earth", bare: true },
    holyBlow: { label: "Holy fire on each blow", element: "magic", only: true },
    shadowBlow: { label: "Shadow on each blow", element: "magic", afflict: "wither", chance: 1, not: true },
});

/** The most of each blow's harm one of ON_BLOW adds, all of a hero's gear together. */
export const BLOW_CAP = 0.4;

/**
 * Those holy fire harms and shadow doesn't (ON_BLOW `only` and `not`): the restless dead, the
 * hells' and the Breach's demons, and the hounds of the dark (creatures.js ids).
 */
export const UNHOLY = Object.freeze([
    "skeleton", "draugr", "ghost", "wraith", "wightLord", "blackShuck", "flayling", "cinderHusk", "ossuaryPriest", "dirgeWarden", "flayedHierarch", "slagGorger", "forgeBrute", "chainedGlutton", "bloatGorger", "pitRavager", "gorgerWarlord", "henchman",
    "brimstoneWalker", "ashWalker", "hellwalker", "bileWalker", "fiend", "greaterDemon", "demonLord", "vharzul", "cerberus", "ashmaw", "demonBoss", "ashkhar",
]);

/**
 * The powers an ingredient brings, by its family: what it adds to (gear.js STATS, ON_BLOW) in a
 * weapon that strikes, or a quiver (`arms`: `melee` read as `ranged` on a bow or a quiver, whose
 * blows are shots); in a wand or a grimoire (`magic`); and in anything worn (`worn`: armour,
 * shields, clothes, jewellery). And the effect a legendary weapon made with it lets loose
 * (`legend`: core/legendary.js EFFECTS), its essence's, or with none its main material's.
 */
export const FAMILIES = Object.freeze({
    might: { label: "Might", arms: "melee", magic: "spell", worn: "armor", legend: "earthsunder" },
    stout: { label: "Stoutness", arms: "hp", magic: "hp", worn: "hp", legend: "earthsunder" },
    vigour: { label: "Vigour", arms: "stamina", magic: "stamina", worn: "endurance", legend: "ruinblast" },
    swift: { label: "Swiftness", arms: "haste", magic: "spell", worn: "dodge", legend: "stormlash" },
    keen: { label: "Keenness", arms: "bleed", magic: "spell", worn: "melee", legend: "ruinblast" },
    arcane: { label: "The arcane", arms: "spell", magic: "spell", worn: "spell", legend: "ruinblast" },
    mending: { label: "Mending", arms: "heal", magic: "heal", worn: "heal", legend: "ruinblast" },
    binding: { label: "Binding", arms: "stun", magic: "stun", worn: "stun", legend: "frostbind" },
    luck: { label: "Luck", arms: "fortune", magic: "fortune", worn: "haggle", legend: "ruinblast" },
    fire: { label: "Fire", arms: "fireBlow", magic: "spell", worn: "wardFire", legend: "cinderburst" },
    frost: { label: "Frost", arms: "frostBlow", magic: "stun", worn: "wardWater", legend: "frostbind" },
    storm: { label: "Storm", arms: "stormBlow", magic: "spell", worn: "wardAir", legend: "stormlash" },
    venom: { label: "Venom", arms: "venomBlow", magic: "stun", worn: "wardEarth", legend: "earthsunder" },
    acid: { label: "Acid", arms: "acidBlow", magic: "spell", worn: "wardEarth", legend: "earthsunder" },
    holy: { label: "Holiness", arms: "holyBlow", magic: "heal", worn: "wardMagic", legend: "ruinblast" },
    shadow: { label: "Shadow", arms: "shadowBlow", magic: "stun", worn: "dodge", legend: "ruinblast" },
    blood: { label: "Blood", arms: "leech", magic: "heal", worn: "hp", legend: "ruinblast" },
});

/**
 * How strong each power is ([least, most]) from a common ingredient, on a piece of the first
 * level: a share (as gear.js STATS shows it), or hit points and stamina, whole. Stronger the better
 * the ingredient's make (MAKE_STRENGTH) and the higher the piece's level (gear.js levelFactor).
 */
export const RANGES = Object.freeze({
    armor: [0.008, 0.016],
    hp: [3, 8],
    stamina: [3, 8],
    melee: [0.02, 0.05],
    ranged: [0.02, 0.05],
    spell: [0.02, 0.05],
    heal: [0.03, 0.07],
    stun: [0.05, 0.12],
    haggle: [0.01, 0.025],
    dodge: [0.006, 0.014],
    haste: [0.01, 0.025],
    leech: [0.01, 0.025],
    bleed: [0.03, 0.07],
    fortune: [0.03, 0.07],
    endurance: [0.04, 0.09],
    wardFire: [0.02, 0.05],
    wardWater: [0.02, 0.05],
    wardAir: [0.02, 0.05],
    wardEarth: [0.02, 0.05],
    wardMagic: [0.015, 0.035],
    fireBlow: [0.03, 0.07],
    frostBlow: [0.03, 0.07],
    stormBlow: [0.03, 0.07],
    venomBlow: [0.03, 0.07],
    acidBlow: [0.03, 0.07],
    holyBlow: [0.06, 0.14],
    shadowBlow: [0.03, 0.07],
});

/** How many times as strong an ingredient's power is (RANGES) by its make. */
export const MAKE_STRENGTH = Object.freeze({ common: 1, fine: 1.25, masterwork: 1.5, rare: 1.75, veryRare: 2, legendary: 2.5 });

// An ingredient: its kind (INGREDIENT_KINDS), its make (progress.js QUALITIES), its family
// (FAMILIES), the word it gives a piece's name (crafting.js nameOf: its main material's, its
// essence's), and what it is
const of = (kind, make, family, word, about) => Object.freeze({ kind, make, family, word, about });

/**
 * Every ingredient (an ITEMS id: MATERIALS, or a creature's part, spoils.js PARTS), as it goes into
 * a recipe. A creature's part that's eaten (spoils.js `meat`) is none.
 */
export const INGREDIENTS = Object.freeze({
    // Metals: from bronze and iron, sold at every smithy, to orichalcum, the drowned kings' metal
    bronzeIngot: of("metal", "common", "vigour", "Bronze", "Copper and tin poured together: softer than iron, but it never rusts."),
    ironIngot: of("metal", "common", "stout", "Iron", "Plain iron from the bloomery: the smith's daily bread."),
    rustedMail: of("metal", "common", "keen", "Rusted", "Rings of a barrow's old mail, rusted together. Beaten out again, rust and all, it still bites."),
    steelIngot: of("metal", "fine", "might", "Steel", "Iron folded with charcoal till it holds an edge and bends without breaking."),
    silverIngot: of("metal", "fine", "holy", "Silver", "Pure silver. The restless dead and the werewolf shrink from it."),
    blackSteelIngot: of("metal", "masterwork", "keen", "Blacksteel", "The orcs' own steel, quenched in blood and oil, black as a crow's wing. It takes a wicked edge."),
    goldIngot: of("metal", "masterwork", "luck", "Gold", "Soft, heavy and bright. Too soft to fight in alone, but gold calls to gold, they say."),
    mythrilIngot: of("metal", "rare", "swift", "Mythril", "Silver-blue, light as a feather and harder than steel: what a mythril golem is made of."),
    graveIron: of("metal", "rare", "shadow", "Grave-iron", "Iron from a barrow king's grave goods, cold to the touch however long it's held."),
    adamantiteIngot: of("metal", "veryRare", "might", "Adamantite", "Dark green-black, the hardest thing there is: it blunts every file in the forge."),
    orichalcumIngot: of("metal", "legendary", "might", "Orichalcum", "Red-gold and warm to the touch, the metal of the drowned kings' crowns. Nothing made by hands is finer."),
    // Woods: pine and birch to the sylvan ancients' silver wood
    pineWood: of("wood", "common", "vigour", "Pine", "Light, straight and sappy: cheap staves and shields."),
    birchWood: of("wood", "common", "arcane", "Birch", "Pale birch, the hedge-witch's wand wood."),
    oakWood: of("wood", "common", "stout", "Oak", "Heavy and hard: the wood of shields, hafts and stout old staves."),
    ashWood: of("wood", "fine", "keen", "Ash", "Springy ash, for shafts and hafts that take a shock and come back."),
    yewWood: of("wood", "fine", "might", "Yew", "Heartwood and sapwood together, as a longbow wants it."),
    mahoganyWood: of("wood", "fine", "luck", "Mahogany", "Red jungle wood brought up the rivers: rich men's furniture, and a lucky grip."),
    heartwood: of("wood", "masterwork", "arcane", "Heartwood", "The black heart of a blighted treant, still faintly warm. It drinks spells like water."),
    ironwood: of("wood", "rare", "might", "Ironwood", "Grey wood as heavy as iron, from the ironbark treants of the orcs' lands. It sinks, and it turns an axe."),
    ghostwood: of("wood", "veryRare", "shadow", "Ghostwood", "Pale wood you can almost see through, from a tree that walks at night. It's cold, and it whispers."),
    sylvanwood: of("wood", "legendary", "swift", "Sylvanwood", "Silver-barked wood from an ancient of the elves' forests, light as a reed and stronger than steel."),
    // Cloths: linen and wool to the moon moth's silk
    linenBolt: of("cloth", "common", "mending", "Linen", "Flax woven plain: shirts, linings and bandages."),
    woolBolt: of("cloth", "common", "stout", "Wool", "Thick fulled wool. Warm even wet, as the shepherds say."),
    silkBolt: of("cloth", "fine", "arcane", "Silk", "Silk from far off, light as breath and dear as gold. Mages swear by it."),
    spiderSilk: of("cloth", "fine", "swift", "Spidersilk", "A spider's thread, wound off by the yard: fine, light and strong as wire."),
    mareHair: of("cloth", "fine", "binding", "Marehair", "Black hair from a mare's mane, the stuff of bad dreams. Woven, it holds."),
    sackFace: of("cloth", "fine", "luck", "Sackcloth", "A hodmedod's sacking face, stitched eyes and all. Scarecrows are lucky, for some."),
    widowSilk: of("cloth", "masterwork", "venom", "Widowsilk", "Black, glossy thread from a black widow's spinnerets, stronger than steel wire and bitter with venom."),
    spectralVeil: of("cloth", "masterwork", "arcane", "Spectral", "A ghost's veil, cold and weightless. Spells pass through it as it passes through walls."),
    kelpieMane: of("cloth", "masterwork", "frost", "Kelpie", "Weed-green hair from a kelpie's mane, forever damp and as cold as the loch."),
    wraithShroud: of("cloth", "rare", "shadow", "Wraith", "A wraith's shroud, black as a moonless night: whoever wears it is hard to make out."),
    gloomsilk: of("cloth", "veryRare", "binding", "Gloomsilk", "Violet-black thread from a gloomweaver's web. Whatever it touches is caught."),
    moonsilk: of("cloth", "legendary", "holy", "Moonsilk", "Spun from moonlight by the moon moth, the elves say: it glows, and nothing unholy bears its touch."),
    // Leathers: tanned cowhide to the Dreadthorn's scales
    tannedLeather: of("leather", "common", "stout", "Leather", "Cowhide tanned in oak bark: belts, boots, grips and jerkins."),
    boarHide: of("leather", "common", "stout", "Boarhide", "Bristly, thick and tough."),
    badgerPelt: of("leather", "common", "stout", "Badger", "Coarse grey fur, hard-wearing."),
    snakeSkin: of("leather", "common", "venom", "Snakeskin", "A shed adder's skin, patterned in zigzags."),
    olmSkin: of("leather", "common", "frost", "Olmskin", "A cave olm's pale skin, soft, cold and damp."),
    hyenaHide: of("leather", "common", "vigour", "Hyena", "Spotted, coarse and smelly. Its owner never tired, nor does it."),
    jackalPelt: of("leather", "common", "swift", "Jackal", "Light sandy fur from the cat folk's plains."),
    hardenedLeather: of("leather", "fine", "might", "Hardened", "Leather boiled in wax and shaped while hot: stiff as wood, and it turns a blade."),
    wolfPelt: of("leather", "fine", "vigour", "Wolfskin", "Grey wolf fur, warm and hard-wearing: a ranger's lining."),
    pumaPelt: of("leather", "fine", "swift", "Puma", "A mountain cat's tawny pelt, light and supple."),
    direPelt: of("leather", "fine", "vigour", "Direfur", "Thick black fur from a dire wolf."),
    bullHide: of("leather", "fine", "vigour", "Bullhide", "A wild bull's white hide, as thick as a door."),
    hartHide: of("leather", "fine", "vigour", "Harthide", "Supple red-brown deerskin."),
    carapace: of("leather", "fine", "might", "Chitin", "A plate of a great insect's shell, light and as hard as horn."),
    cobraSkin: of("leather", "fine", "venom", "Cobraskin", "A spitting cobra's banded skin."),
    poisonSkin: of("leather", "fine", "venom", "Frogskin", "Bright, slick skin from a poison frog. Handle it with gloves."),
    ahuizotlPelt: of("leather", "fine", "frost", "Ahuizotl", "Sleek black fur from the water-dog of the lizard folk's swamps, never dry."),
    gilaSkin: of("leather", "fine", "venom", "Gila", "Beaded skin, orange and black."),
    salamanderSkin: of("leather", "fine", "fire", "Salamander", "Black, glossy skin that never burns."),
    wormHide: of("leather", "fine", "acid", "Wormhide", "A death worm's red hide, pitted by its own acid."),
    bearPelt: of("leather", "masterwork", "stout", "Bearskin", "A brown bear's pelt, heavy and warm."),
    trollHide: of("leather", "masterwork", "blood", "Trollhide", "Grey-green and warty, and it still knits itself where it's cut."),
    ogreHide: of("leather", "masterwork", "stout", "Ogrehide", "Thick, leathery and scarred."),
    werewolfPelt: of("leather", "masterwork", "blood", "Werehide", "Coarse grey fur off a werewolf, that was someone once."),
    shuckFur: of("leather", "masterwork", "shadow", "Shuckfur", "Black fur that seems to drink the light."),
    knuckerScale: of("leather", "masterwork", "frost", "Knucker", "A water dragon's dark green scale, cold and slick."),
    houndPelt: of("leather", "masterwork", "holy", "Annwn", "White fur off a hound of the Otherworld, that never gets dirty."),
    crownScale: of("leather", "masterwork", "binding", "Crownscale", "A pale scale off a basilisk's crown. Look at it too long and your eyes ache."),
    buffaloHide: of("leather", "masterwork", "stout", "Buffalo", "A cape buffalo's black hide, thick enough to stop a spear."),
    nandiPelt: of("leather", "masterwork", "keen", "Nandi", "Shaggy brown fur off a Nandi bear."),
    crocHide: of("leather", "masterwork", "might", "Crocodile", "A marsh crocodile's armoured green hide."),
    jaguarPelt: of("leather", "masterwork", "swift", "Jaguar", "Golden fur, rosetted black."),
    boaSkin: of("leather", "masterwork", "binding", "Boaskin", "A great boa's skin, long enough to wrap a house in."),
    riftlingScale: of("leather", "masterwork", "storm", "Riftling", "A riftling's scale, glowing faintly at its edges."),
    wyvernScale: of("leather", "rare", "storm", "Wyvernscale", "A wyvern's scale, light as horn: the wind slides off it."),
    shadowPelt: of("leather", "rare", "shadow", "Shadowhide", "A shadow stalker's pelt: it's hard to see where it ends."),
    chimeraMane: of("leather", "rare", "fire", "Chimera", "A chimera's lion mane, singed at the ends and warm."),
    dragonScale: of("leather", "veryRare", "fire", "Drakescale", "A drake's scale, dark red and hot to the touch: proof against fire."),
    frostHide: of("leather", "veryRare", "frost", "Frosthide", "Rime-white hide off a frost troll, always cold."),
    moonfangPelt: of("leather", "veryRare", "shadow", "Moonfang", "The Moonfang's black pelt, a pale glow along its hairs."),
    dreadthornScale: of("leather", "legendary", "fire", "Dreadthorn", "A Dreadthorn's scale, as wide as a shield and harder than any steel."),
    riftScale: of("leather", "legendary", "storm", "Behemoth", "A scale off the Behemoth of the Rift, crackling faintly with the Rift's light."),
    // Gems: quartz and jasper to the Star Ruby
    quartz: of("gem", "common", "arcane", "Quartz", "Clear rock crystal: it takes a spell and holds it, a little."),
    jasper: of("gem", "common", "stout", "Jasper", "A red-brown stone, polished smooth: a soldier's lucky stone."),
    amethyst: of("gem", "fine", "mending", "Amethyst", "Violet crystal, said to keep the head clear and wounds clean."),
    garnet: of("gem", "fine", "vigour", "Garnet", "Deep red, like a drop of blood: a traveller's stone."),
    obsidian: of("gem", "fine", "keen", "Obsidian", "Black volcanic glass, sharper than steel and as brittle."),
    basiliskEye: of("gem", "masterwork", "binding", "Basilisk", "A basilisk's yellow eye, hard as a gem. Its stare still holds."),
    nightmareShard: of("gem", "masterwork", "shadow", "Nightmare", "A splinter of a mare's dream, violet and cold."),
    geodeHeart: of("gem", "rare", "arcane", "Geode", "Violet crystal from inside a rock tusker, where its heart should be."),
    soulShard: of("gem", "rare", "blood", "Soul", "Green crystal with a soul caught in it, faintly singing."),
    sapphire: of("gem", "rare", "frost", "Sapphire", "Deep blue and as cold as a winter lake, grown in a mythril golem's chest."),
    crownShard: of("gem", "veryRare", "shadow", "Crown", "A shard of a wight's crown, gold and dark stone."),
    diamond: of("gem", "veryRare", "holy", "Diamond", "The clearest and hardest of stones, from an adamantite golem's heart. It shines even in the dark."),
    blightCrystal: of("gem", "legendary", "arcane", "Blightstone", "A splinter of the flawed crystal at the Stone Golem of Harrowstone's heart, dark with the blight in it."),
    starRuby: of("gem", "legendary", "fire", "Star Ruby", "A ruby with a six-rayed star in it, from an orichalcum colossus's chest. It's warm, and it never dims."),
    // Essences: the creatures' parts kept for what's in them, a power for whatever they go into
    ratTail: of("essence", "common", "luck", "Rat", "A giant rat's long pink tail. Lucky, if you're a rat."),
    ratTooth: of("essence", "common", "keen", "Rat", "A giant rat's yellow incisors, chisel-sharp."),
    quill: of("essence", "common", "keen", "Quill", "A porcupine's barbed quill."),
    slimeGel: of("essence", "common", "acid", "Slime", "A blob of green slime, eating at whatever it's on."),
    batWing: of("essence", "common", "swift", "Bat", "A bat's wing, leathery and light."),
    wolfFang: of("essence", "common", "keen", "Wolf", "A wolf's fang, sharp and curved."),
    goblinEar: of("essence", "common", "luck", "Goblin", "A goblin's ear. Goblins steal, and their luck comes with it."),
    boneDust: of("essence", "common", "shadow", "Bone", "Old bone ground to dust: the dead's."),
    badgerClaw: of("essence", "common", "keen", "Badger", "A badger's digging claw."),
    rookFeather: of("essence", "common", "storm", "Rook", "A black rook's feather, that rides the gale."),
    hyenaJaw: of("essence", "common", "keen", "Hyena", "A hyena's jaw, that cracks bones."),
    jackalTooth: of("essence", "common", "keen", "Jackal", "A jackal's small, sharp tooth."),
    leech: of("essence", "common", "blood", "Leech", "A giant leech, alive and still hungry."),
    bloodflyWing: of("essence", "common", "blood", "Bloodfly", "A bloodfly's wings, veined red."),
    antMandible: of("essence", "common", "keen", "Ant", "A giant ant's mandible."),
    waspWing: of("essence", "common", "swift", "Wasp", "A wasp's wing, as thin as glass."),
    vultureFeather: of("essence", "common", "storm", "Vulture", "A vulture's dark flight feather, that rides the hot wind."),
    vultureTalon: of("essence", "common", "keen", "Vulture", "A vulture's hooked talon."),
    centipedeFang: of("essence", "common", "venom", "Centipede", "A centipede's venom fang."),
    boarTusk: of("essence", "fine", "might", "Boar", "A boar's curved tusk."),
    venomSac: of("essence", "fine", "venom", "Venom", "A snake's venom sac, full."),
    bearClaw: of("essence", "fine", "keen", "Bear", "A brown bear's claw, as long as a finger."),
    pumaClaw: of("essence", "fine", "keen", "Puma", "A puma's hooked claw."),
    direFang: of("essence", "fine", "keen", "Direwolf", "A dire wolf's fang, as long as a thumb."),
    oldSkull: of("essence", "fine", "shadow", "Skull", "An old skull out of a barrow."),
    cultSigil: of("essence", "fine", "binding", "Cult", "A cultist's iron sigil, a star in a circle."),
    ogreTooth: of("essence", "fine", "might", "Ogre", "An ogre's molar, as big as a fist."),
    shuckFang: of("essence", "fine", "fire", "Shuck", "A black shuck's fang, glowing red as its eyes did."),
    boggartCharm: of("essence", "fine", "luck", "Boggart", "A boggart's lucky charm, stolen from someone."),
    bullHorn: of("essence", "fine", "might", "Bull", "A wild bull's horn."),
    knuckerFang: of("essence", "fine", "frost", "Knucker", "A water dragon's fang, cold and wet."),
    witchStraw: of("essence", "fine", "binding", "Witch", "Straw from a hodmedod, bewitched: it twitches."),
    wispEssence: of("essence", "fine", "holy", "Wisp", "A will-o'-wisp's light in a bottle."),
    ectoplasm: of("essence", "fine", "arcane", "Ghost", "A ghost's ectoplasm, cold and clinging."),
    blightCap: of("essence", "fine", "venom", "Blight", "A violet toadstool off a blighted treant."),
    mandrakeRoot: of("essence", "fine", "mending", "Mandrake", "A mandrake root, shaped like a little man. It screams when it's cut."),
    houndEar: of("essence", "fine", "luck", "Hound", "A red hound's ear: it still twitches at a sound."),
    pixieDust: of("essence", "fine", "arcane", "Pixie", "A pinch of glittering pixie dust."),
    antler: of("essence", "fine", "holy", "Hart", "A hart's antler. The white hart's are holy, they say, and some of it rubs off on the rest."),
    venomGland: of("essence", "fine", "venom", "Spider", "A spider's venom gland."),
    olmGills: of("essence", "fine", "frost", "Olm", "A cave olm's pink, feathery gills."),
    scorpionSting: of("essence", "fine", "venom", "Scorpion", "A scorpion's sting, a bead of venom on its tip."),
    buffaloHorn: of("essence", "fine", "might", "Buffalo", "A cape buffalo's heavy horn."),
    crocTooth: of("essence", "fine", "keen", "Crocodile", "A crocodile's tooth."),
    jaguarFang: of("essence", "fine", "keen", "Jaguar", "A jaguar's fang."),
    emberGland: of("essence", "fine", "fire", "Ember", "A salamander's ember gland, glowing orange."),
    acidSac: of("essence", "fine", "acid", "Worm", "A death worm's acid sac."),
    acidGland: of("essence", "fine", "acid", "Ant", "A giant ant's acid gland."),
    waspStinger: of("essence", "fine", "venom", "Wasp", "A wasp's stinger."),
    bellToken: of("essence", "fine", "holy", "Bell", "The little bronze bell an initiate of the Order wears on a cord, the Bell's cross on it."),
    werewolfClaw: of("essence", "masterwork", "blood", "Werewolf", "A werewolf's claw, that leaves wounds slow to close."),
    trollBlood: of("essence", "masterwork", "mending", "Troll", "A troll's green blood in a vial, still trying to heal something."),
    shadowClaw: of("essence", "masterwork", "shadow", "Shadow", "A shadow stalker's violet claw."),
    nandiClaw: of("essence", "masterwork", "keen", "Nandi", "A Nandi bear's claw."),
    ahuizotlHand: of("essence", "masterwork", "binding", "Ahuizotl", "The ahuizotl's tail-hand, that drags swimmers under."),
    magmaCore: of("essence", "masterwork", "fire", "Magma", "A magma slime's molten heart, still glowing."),
    stoneTusk: of("essence", "masterwork", "might", "Tusker", "A rock tusker's stone tusk."),
    chimeraHorn: of("essence", "masterwork", "might", "Chimera", "A chimera's goat horn."),
    nightglowGland: of("essence", "masterwork", "storm", "Nightglow", "An elite spider's glowing gland, bright as a lantern and crackling."),
    widowGland: of("essence", "masterwork", "venom", "Widow", "A black widow's venom gland. Its venom cramps as it burns."),
    barrowRing: of("essence", "masterwork", "luck", "Barrow", "A gold ring off a draugr's finger. Whoever it was, they were rich."),
    wyvernSting: of("essence", "rare", "venom", "Wyvern", "A wyvern's tail sting, as long as a knife."),
    kelpieBridle: of("essence", "rare", "binding", "Kelpie", "A kelpie's bridle: whoever holds it is its master."),
    fireGland: of("essence", "rare", "fire", "Flame", "A fire gland, hot enough to light a pipe on."),
    hellFang: of("essence", "rare", "fire", "Hellhound", "A cerberus's fang, as long as a dagger and still warm."),
    queenMandible: of("essence", "rare", "acid", "Queen", "The Ant Monster's mandible, black and dripping."),
    royalJelly: of("essence", "rare", "mending", "Royal", "Royal jelly from an ants' nest, that heals whoever eats it."),
    moonfangFang: of("essence", "rare", "blood", "Moonfang", "The Moonfang's fang, pale as the moon."),
    demonHorn: of("essence", "veryRare", "fire", "Demon", "A horn as long as a forearm, ridged and bone-pale, off a demon of the Breach. It smoulders."),
    dragonFang: of("essence", "veryRare", "fire", "Drake", "A drake's fang, blackened at its root by its fire."),
    golemStone: of("essence", "veryRare", "might", "Golem", "A stone off the Stone Golem of Harrowstone, its maker's rune cut in it."),
    riftGland: of("essence", "veryRare", "fire", "Riftfire", "A gland of the Rift's green fire."),
    dragonHeart: of("essence", "legendary", "fire", "Drakeheart", "A drake's heart, still hot, still beating now and then."),
    dreadthornHorn: of("essence", "legendary", "might", "Dreadthorn", "A Dreadthorn's horn, as long as a man is tall."),
    dreadthornHeart: of("essence", "legendary", "fire", "Dreadthorn", "A Dreadthorn's heart, the furnace of its fire."),
    frostHeart: of("essence", "legendary", "frost", "Frostheart", "A heart of blue ice, that never melts."),
    riftSpine: of("essence", "legendary", "storm", "Riftspine", "A dorsal spine off the Behemoth, still glowing."),
    riftHeart: of("essence", "legendary", "storm", "Behemoth", "The Heart of the Behemoth of the Rift, lightning caught in it."),
    ancientSap: of("essence", "legendary", "mending", "Ancient", "Golden sap from a sylvan ancient, sweet as honey: the life of a tree a thousand years old."),
});

/**
 * The new creatures, each so that a rarer ingredient has one to come off (docs/CRAFTING.md *New
 * beasts*), in the world as creatures.js CREATURES, spoils.js SPOILS, the dungeons' packs
 * (dungeons/themes.js), beasts/model.js MODELS and beasts/looks.js LOOKS have them (the tests hold
 * them to this): each one's name; the creature whose body and fight it borrows (`like`), drawn
 * `size` times as big in its own colour (`tint`), or the borrowed model's skin (`skin`); the
 * catalog entry its own model will be, once one's bought (`model`: beasts/model.js OWN_MODELS); its
 * tiers, where it's met (its `people`'s lands' wilds, or `biomes`; and the dungeons' `themes`),
 * when (`night`), whether it's `perilous`; and what it leaves (as spoils.js SPOILS `items`).
 */
export const NEW_BEASTS = Object.freeze({
    mythrilGolem: { name: "Mythril golem", like: "stoneGolem", skin: "frost", tint: "#8ac8f0", size: 0.8, model: "beast-mythril-golem", tiers: [6, 9], biomes: ["mountain", "snow", "tundra"], themes: ["caves"], items: [{ id: "mythrilIngot", chance: 0.6, count: [1, 2] }, { id: "sapphire", chance: 0.15 }] },
    adamantiteGolem: { name: "Adamantite golem", like: "stoneGolem", skin: "moss", tint: "#2e5a48", size: 1, model: "beast-adamantite-golem", tiers: [8, 10], biomes: ["volcanic", "badlands", "mountain"], themes: ["caves"], items: [{ id: "adamantiteIngot", chance: 0.55, count: [1, 2] }, { id: "diamond", chance: 0.12 }] },
    orichalcumColossus: { name: "Orichalcum colossus", like: "stoneGolem", skin: "ember", tint: "#e07a30", size: 1.6, model: "beast-orichalcum-colossus", tiers: [10, 10], perilous: true, biomes: ["volcanic"], themes: ["hell"], items: [{ id: "orichalcumIngot", chance: 0.6, count: [1, 2] }, { id: "starRuby", chance: 0.15 }] },
    gildedScarab: { name: "Gilded scarab", like: "giantCockroach", tint: "#e8b830", size: 1.4, model: "beast-gilded-scarab", tiers: [3, 7], people: "cat", themes: [], items: [{ id: "goldIngot", chance: 0.35 }, { id: "carapace", chance: 0.4 }] },
    ironbarkTreant: { name: "Ironbark treant", like: "treant", tint: "#4a4a4e", size: 1.1, model: "beast-ironbark-treant", tiers: [6, 9], people: "orc", themes: [], items: [{ id: "ironwood", chance: 0.5, count: [1, 2] }] },
    ghostwoodTreant: { name: "Ghostwood treant", like: "treant", tint: "#c8dce8", size: 1.15, model: "beast-ghostwood-treant", tiers: [8, 10], night: "only", biomes: ["darkwood", "marsh"], themes: ["ancient"], items: [{ id: "ghostwood", chance: 0.5 }, { id: "ectoplasm", chance: 0.35 }] },
    sylvanAncient: { name: "Sylvan ancient", like: "treant", tint: "#c8d8b0", size: 1.6, model: "beast-sylvan-ancient", tiers: [8, 10], perilous: true, people: "elf", themes: [], items: [{ id: "sylvanwood", chance: 0.6, count: [1, 2] }, { id: "ancientSap", chance: 0.3 }] },
    gloomweaver: { name: "Gloomweaver", like: "blackWidow", tint: "#3a2a5a", size: 1.5, model: "beast-gloomweaver", tiers: [8, 10], perilous: true, people: "darkElf", themes: ["nest"], items: [{ id: "gloomsilk", chance: 0.6, count: [1, 2] }, { id: "widowGland", chance: 0.5 }] },
    moonMoth: { name: "Moon moth", like: "dungeonWasp", tint: "#e8f0ff", size: 2.2, model: "beast-moon-moth", tiers: [8, 10], perilous: true, night: "only", biomes: ["elfwood", "meadow"], themes: [], items: [{ id: "moonsilk", chance: 0.5 }, { id: "pixieDust", chance: 0.5, count: [1, 2] }] },
});
