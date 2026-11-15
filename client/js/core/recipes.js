// What each crafter makes, and of what (docs/CRAFTING.md): a recipe for every piece of gear there
// is (gear.js GEAR), each its main material and so many of it, a second of another kind, and an
// essence, a creature's part, if the player likes; the crafters, the smiths, armorers and
// scriptoria there are already and four new (a bowyer, a leatherworker, a tailor, a jeweller), what
// each makes, how fine a make it'll work to, and what ingredients it sells; which settlements keep
// which; and what gear broken down at one gives back.
//
// Pure data, no DOM: the crafters' rules are crafting.js's.

// A recipe: the noun a piece made by it is named with (crafting.js nameOf), its main material
// (`kind`, materials.js INGREDIENT_KINDS, and how many of it), and its second: each a slot, and
// last the essence, that can be left empty (`optional`)
const recipe = (noun, [kind, count], [second, seconds]) =>
    Object.freeze({ noun, slots: Object.freeze([Object.freeze({ kind, count }), Object.freeze({ kind: second, count: seconds }), Object.freeze({ kind: "essence", count: 1, optional: true })]) });

/**
 * Every piece of gear's recipe (gear.js GEAR ids): the noun it's named with ("Adamantite Demon
 * Sword"), and its slots: its main material, which sets its make (crafting.js makeOf), and so
 * many of it; its second, of another kind; and an essence, left out if the player likes.
 */
export const RECIPES = Object.freeze({
    // Weapons: blades and heads of metal on a leather grip or a wooden haft; bows, staves and
    // wands of wood, a bow strung with cloth, a staff and a wand tipped with a gem; a grimoire
    // bound in leather, a gem in its clasp
    sword: recipe("Sword", ["metal", 1], ["leather", 1]),
    wand: recipe("Wand", ["wood", 1], ["gem", 1]),
    staff: recipe("Staff", ["wood", 2], ["gem", 1]),
    hammer: recipe("War Hammer", ["metal", 2], ["wood", 1]),
    greatsword: recipe("Greatsword", ["metal", 2], ["leather", 1]),
    axe: recipe("Battle Axe", ["metal", 2], ["wood", 1]),
    mace: recipe("Mace", ["metal", 1], ["leather", 1]),
    bow: recipe("Bow", ["wood", 2], ["cloth", 1]),
    gauntlets: recipe("Spiked Gauntlets", ["metal", 1], ["leather", 1]),
    grimoire: recipe("Grimoire", ["leather", 2], ["gem", 1]),
    // The other hand: a round shield of boards bound in metal, the rest of metal on leather
    // straps or a wooden core; a spellward of warded wood, a gem at its boss; a quiver of leather
    roundShield: recipe("Round Shield", ["wood", 2], ["metal", 1]),
    kiteShield: recipe("Kite Shield", ["metal", 2], ["leather", 1]),
    towerShield: recipe("Tower Shield", ["metal", 3], ["wood", 1]),
    spellward: recipe("Spellward", ["wood", 2], ["gem", 1]),
    shield: recipe("Shield", ["metal", 2], ["leather", 1]),
    quiver: recipe("Quiver", ["leather", 1], ["wood", 1]),
    // The head
    cap: recipe("Cap", ["leather", 1], ["cloth", 1]),
    nasalHelm: recipe("Nasal Helm", ["metal", 1], ["leather", 1]),
    wizardHat: recipe("Wizard's Hat", ["cloth", 2], ["gem", 1]),
    helm: recipe("Helm", ["metal", 2], ["leather", 1]),
    // The body
    jerkin: recipe("Jerkin", ["leather", 2], ["cloth", 1]),
    gambeson: recipe("Gambeson", ["cloth", 3], ["leather", 1]),
    mail: recipe("Mail Shirt", ["metal", 2], ["leather", 1]),
    plate: recipe("Plate", ["metal", 3], ["leather", 1]),
    hauberk: recipe("Hauberk", ["metal", 3], ["cloth", 1]),
    // The forearms and hands
    bracers: recipe("Bracers", ["leather", 1], ["metal", 1]),
    vambraces: recipe("Vambraces", ["metal", 1], ["leather", 1]),
    gloves: recipe("Gloves", ["leather", 1], ["cloth", 1]),
    platedGloves: recipe("Plated Gloves", ["metal", 1], ["leather", 1]),
    warGloves: recipe("Gauntlets", ["metal", 1], ["leather", 1]),
    // The waist
    belt: recipe("Belt", ["leather", 1], ["metal", 1]),
    girdle: recipe("War Belt", ["leather", 2], ["metal", 1]),
    // The legs and feet
    trousers: recipe("Trousers", ["cloth", 2], ["leather", 1]),
    breeches: recipe("Breeches", ["leather", 2], ["cloth", 1]),
    greaves: recipe("Greaves", ["metal", 2], ["leather", 1]),
    legguards: recipe("Leg Guards", ["metal", 2], ["leather", 1]),
    leatherBoots: recipe("Boots", ["leather", 2], ["cloth", 1]),
    sabatons: recipe("Sabatons", ["metal", 2], ["leather", 1]),
    warBoots: recipe("War Boots", ["leather", 2], ["metal", 1]),
    boots: recipe("Spiked Boots", ["leather", 2], ["metal", 1]),
    // The back
    travelCloak: recipe("Travelling Cloak", ["cloth", 2], ["leather", 1]),
    cloak: recipe("Cloak", ["cloth", 2], ["leather", 1]),
    // Jewellery: a stone, set in metal
    amulet: recipe("Amulet", ["gem", 1], ["metal", 1]),
    ring: recipe("Ring", ["gem", 1], ["metal", 1]),
});

// What's worked in metal at a smith's: its blades and heads, and its armour and shields
const METAL_ARMS = Object.freeze(["sword", "greatsword", "axe", "mace", "hammer", "gauntlets"]);
const METAL_ARMOUR = Object.freeze(["nasalHelm", "helm", "mail", "plate", "hauberk", "vambraces", "platedGloves", "warGloves", "greaves", "legguards", "sabatons", "roundShield", "kiteShield", "towerShield", "shield"]);

// What's made at a bowyer's, a leatherworker's, a tailor's, a scriptorium's and a jeweller's
const BOWYERS = Object.freeze(["bow", "staff", "quiver"]);
const LEATHERS = Object.freeze(["cap", "jerkin", "bracers", "gloves", "belt", "girdle", "breeches", "leatherBoots", "boots", "warBoots"]);
const TAILORS = Object.freeze(["wizardHat", "gambeson", "trousers", "travelCloak", "cloak"]);
const SCRIBES = Object.freeze(["wand", "grimoire", "spellward"]);
const JEWELS = Object.freeze(["amulet", "ring"]);

/**
 * The crafters (progress.js SHOPS ids, the four new ones stage 4's to add): what each makes
 * (RECIPES ids), the finest make it works to (`best`: none of a better main material; and the
 * same for what it breaks down, crafting.js salvagesAt), and the ingredients it sells (materials.js
 * MATERIALS ids: stage 4 puts them on its shelves).
 *
 * - **A blacksmith** (every village and greater): blades, heads and armour of metal, to a
 *   masterwork, as its wares go.
 * - **The specialists** (a town's, a city's, a capital's): the swordsmith the blades, the armorer
 *   armour and shields, the occult scriptorium wands, grimoires and spellwards; and the four new
 *   crafters (CRAFTER_TOWNS), the bowyer bows, staves and quivers, the leatherworker what's of
 *   leather, the tailor what's of cloth, the jeweller rings and amulets. All to the very rare.
 * - **The masters** (each people's one of each: worldplan/settle.js): the Master Swordsmith every
 *   weapon but the arcane, the Master Armorer everything worn but jewellery, the Mystic Emporium
 *   the arcane and jewellery. They work the legendary, as only they sell it; and so does every
 *   crafter in a capital, where the masters never are (CAPITAL_BEST).
 */
export const CRAFTERS = Object.freeze({
    smith: { makes: [...METAL_ARMS, ...METAL_ARMOUR], best: "masterwork", sells: ["bronzeIngot", "ironIngot", "steelIngot", "oakWood", "tannedLeather"] },
    swordsmith: { makes: METAL_ARMS, best: "veryRare", sells: ["bronzeIngot", "ironIngot", "steelIngot", "silverIngot", "oakWood", "ashWood", "tannedLeather", "hardenedLeather"] },
    armorer: { makes: METAL_ARMOUR, best: "veryRare", sells: ["bronzeIngot", "ironIngot", "steelIngot", "oakWood", "tannedLeather", "hardenedLeather", "linenBolt", "woolBolt"] },
    scriptorium: { makes: SCRIBES, best: "veryRare", sells: ["birchWood", "ashWood", "yewWood", "tannedLeather", "quartz", "amethyst"] },
    bowyer: { makes: BOWYERS, best: "veryRare", sells: ["pineWood", "birchWood", "oakWood", "ashWood", "yewWood", "mahoganyWood", "linenBolt", "tannedLeather", "quartz"] },
    leatherworker: { makes: LEATHERS, best: "veryRare", sells: ["tannedLeather", "hardenedLeather", "linenBolt", "woolBolt", "bronzeIngot", "ironIngot"] },
    tailor: { makes: TAILORS, best: "veryRare", sells: ["linenBolt", "woolBolt", "silkBolt", "tannedLeather", "quartz", "jasper"] },
    jeweller: { makes: JEWELS, best: "veryRare", sells: ["quartz", "jasper", "amethyst", "garnet", "bronzeIngot", "silverIngot"] },
    masterSwordsmith: { makes: [...METAL_ARMS, ...BOWYERS], best: "legendary", sells: ["steelIngot", "silverIngot", "ashWood", "yewWood", "hardenedLeather", "silkBolt"] },
    masterArmorer: { makes: [...METAL_ARMOUR, ...LEATHERS, ...TAILORS.filter((id) => id !== "wizardHat")], best: "legendary", sells: ["steelIngot", "silverIngot", "hardenedLeather", "silkBolt", "woolBolt", "oakWood"] },
    emporium: { makes: [...SCRIBES, "wizardHat", ...JEWELS], best: "legendary", sells: ["silkBolt", "silverIngot", "birchWood", "hardenedLeather", "amethyst", "garnet", "quartz"] },
});

/**
 * The finest make every crafter in a capital works to, whatever its `best` elsewhere (crafting.js
 * `capital`): the legendary. The owner's ruling (15 November 2026): every town needn't have every
 * kind of shop, but the capital should; the masters never stand in one (worldplan/settle.js), so
 * the capital's own crafters work to the legendary, its blacksmith and specialists alike.
 */
export const CAPITAL_BEST = "legendary";

/**
 * Which of the four new crafters each kind of settlement keeps (setpieces/town.js SETTLEMENT_KINDS:
 * stage 4's), as houses near its market made over, as the specialists' are: those it always has
 * (`always`), and `count` more of `some`, chosen by its seed. A village or a town one or two of the
 * country's trades, a city those and its jeweller, the capital all four. A hamlet or a farmstead,
 * none.
 */
export const CRAFTER_TOWNS = Object.freeze({
    village: { always: [], some: ["leatherworker", "bowyer", "tailor"], count: 1 },
    town: { always: [], some: ["leatherworker", "bowyer", "tailor"], count: 2 },
    city: { always: ["jeweller"], some: ["leatherworker", "bowyer", "tailor"], count: 2 },
    capital: { always: ["leatherworker", "bowyer", "tailor", "jeweller"], some: [], count: 0 },
});

/**
 * What a piece of gear broken down at a crafter's gives back (crafting.js salvageOf), by its main
 * material's kind (its recipe's) and its make: one ingredient of that kind and make, and one more
 * for each two more of it its recipe takes.
 */
export const SALVAGE = Object.freeze({
    metal: { common: "ironIngot", fine: "steelIngot", masterwork: "blackSteelIngot", rare: "mythrilIngot", veryRare: "adamantiteIngot", legendary: "orichalcumIngot" },
    wood: { common: "oakWood", fine: "ashWood", masterwork: "heartwood", rare: "ironwood", veryRare: "ghostwood", legendary: "sylvanwood" },
    cloth: { common: "linenBolt", fine: "silkBolt", masterwork: "widowSilk", rare: "wraithShroud", veryRare: "gloomsilk", legendary: "moonsilk" },
    leather: { common: "tannedLeather", fine: "hardenedLeather", masterwork: "trollHide", rare: "wyvernScale", veryRare: "dragonScale", legendary: "dreadthornScale" },
    gem: { common: "quartz", fine: "amethyst", masterwork: "basiliskEye", rare: "sapphire", veryRare: "diamond", legendary: "starRuby" },
});

/** What the crafter asks for its work: this share of what a piece of its make and level would cost (crafting.js feeOf). */
export const CRAFT_FEE = 0.5;
