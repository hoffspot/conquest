// Growing stronger (docs/WAR.md M3): skills that grow by being used, each along a tree of its own
// ranks; gear, bought and found, of better and worse make; gold; and a pack to carry it all in.
// And from all of it, a player's might, which brings the war on (war/war.js setMight).
//
// A skill grows by what it's used for: landing blows up close (blade), from afar (marksman),
// stunning (hexes), taking blows (endurance), slipping them (evasion: and a share of every skill
// of the body's growth), buying and selling (trade), talking (talk), and leading followers
// (command, from M9). Each rank up its tree makes it stronger, and some bring a
// new ability: a power strike, an aimed shot, a hold.
//
// Magic's schools (core/spells.js SCHOOLS: Healing, Fire, Earth, Air, Water) grow by the spells
// of each that land: each tier a school comes to, its next spell. Healing's open from the start;
// each element's once its first spell's learnt from its tome (bought at any adventurers' guild).
// And spells learnt from tomes.
// A wand or a grimoire makes spells stronger, each by its own share (rolled when it's made:
// rollBoost).
//
// The fighting trees and the gear make a player mighty; so does leading others (a healer or a
// talker hires the might they don't have: M9). Everything here is plain data (toJSON), kept with
// the character (app/save.js), and the host's to change (core/host.js). Pure JavaScript, no DOM.

import { CURES } from "./afflictions.js";
import { BREWS, CHARM_ROLLS, charmPower, CHARMS, charmStats, SCROLLS, STARTING_SCROLLS } from "./goods.js";
import { blockMost, disguiseOf, effectOf, GEAR, GEAR_SLOTS, gearName, levelFactor, levelOf, offHandFits, rollGear, sameGear, setBonuses, SLOT_IDS, STATS, statsOf, UNIFORM, UNIFORM_PEOPLES } from "./gear.js";
import { Bestiary } from "./bestiary.js";
import { clockOf } from "./invasions.js";
import { ELEMENT_TOME_PRICE, ELEMENT_TOMES, growthAt, GUILD_TOMES, SCHOOLS, SPELLS, TOME_RARITY, TOMES, tierAt, tomeOf } from "./spells.js";
import { PARTS } from "./spoils.js";
import { WEAPONS } from "./weapons.js";

/** A rank's title, and the experience it takes to reach it. */
export const RANKS = Object.freeze([
    { title: "Untried", xp: 0 },
    { title: "Trained", xp: 100 },
    { title: "Adept", xp: 300 },
    { title: "Veteran", xp: 800 },
    { title: "Master", xp: 2000 },
    { title: "Legend", xp: 4500 },
]);

/**
 * The skill trees: each one's name, what makes it grow, whether it's a fighting skill (for might),
 * what each rank of it gives (a list for each bonus: its value at ranks 0 to 5), and the ability
 * a rank brings (by rank).
 *
 * The bonuses: melee, ranged (the share more damage their blows do), heal (more healed), stun
 * (longer stuns), hp, stamina (more of each), armor (the share of each blow taken off), dodge (the
 * chance of slipping a blow or a shot, not magic: one in twenty from the start, one in four at
 * the most), block (the chance of catching a blow or a shot from in front on a shield carried, and
 * a spell on a spellward: one in ten from the start, one in two at the most), haggle (the share
 * off what's bought, and on what's sold), persuade (M4, M7), followers (M9).
 */
export const TREES = Object.freeze({
    blade: { name: "Blade", grows: "landing blows up close", fighting: true, bonus: { melee: [0, 0.1, 0.2, 0.3, 0.45, 0.6], hp: [0, 0, 0, 10, 15, 20] }, abilities: { 2: "powerStrike" } },
    marksman: { name: "Marksman", grows: "landing shots from afar", fighting: true, bonus: { ranged: [0, 0.1, 0.2, 0.3, 0.45, 0.6] }, abilities: { 2: "aimedShot" } },
    hexes: { name: "Hexes", grows: "stunning your foes", fighting: true, bonus: { stun: [0, 0.15, 0.3, 0.5, 0.75, 1] }, abilities: { 2: "hold" } },
    endurance: { name: "Endurance", grows: "taking blows and running hard", fighting: false, bonus: { hp: [0, 5, 10, 20, 30, 40], stamina: [0, 5, 10, 20, 30, 40], armor: [0, 0, 0.03, 0.05, 0.08, 0.1] }, abilities: {} },
    evasion: { name: "Evasion", grows: "fighting with the body and slipping blows", fighting: false, bonus: { dodge: [0.05, 0.09, 0.13, 0.17, 0.21, 0.25] }, abilities: {} },
    shield: { name: "Shield", grows: "blocking blows with a shield", fighting: false, bonus: { block: [0.1, 0.18, 0.26, 0.34, 0.42, 0.5] }, abilities: { 2: "shieldBash" } },
    trade: { name: "Trade", grows: "buying and selling", fighting: false, bonus: { haggle: [0, 0.05, 0.1, 0.15, 0.2, 0.25] }, abilities: {} },
    talk: { name: "Talk", grows: "talking with people", fighting: false, bonus: { persuade: [0, 0.1, 0.2, 0.3, 0.45, 0.6] }, abilities: {} },
    command: { name: "Command", grows: "leading your followers", fighting: false, bonus: { followers: [0, 1, 2, 3, 4, 6] }, abilities: {} },
});

/**
 * The abilities the trees bring: what each is (a spell cast as the one it's a greater form of,
 * or the next blow made stronger), and how it's shown.
 */
export const ABILITIES = Object.freeze({
    powerStrike: { label: "Power strike", tree: "blade", blow: "melee", factor: 2, cooldown: 12000 },
    // (The next blow up close slams the shield into them too: stunned `stun` ms, longer and
    // harder for a shield made for it, `bash`; only with a shield in the other hand)
    shieldBash: { label: "Shield bash", tree: "shield", blow: "melee", factor: 1, stun: 2000, cooldown: 15000, shield: true },
    aimedShot: { label: "Aimed shot", tree: "marksman", blow: "ranged", factor: 2, cooldown: 12000 },
    hold: { label: "Hold", tree: "hexes", spell: "hold" },
});

/**
 * How well made a piece of gear is, from the commonest to the rarest: what it adds to (a weapon's
 * blows, armour's protection), what it costs, and how mighty it makes whoever has it on. Rare
 * and very rare (the specialist shops' best, and the master shops': docs/WAR.md *Shops*) come
 * between a masterwork and a legendary piece, which they took nothing from.
 */
export const QUALITIES = Object.freeze({
    common: { label: "", power: 1, price: 1 },
    fine: { label: "Fine", power: 1.15, price: 3 },
    masterwork: { label: "Masterwork", power: 1.3, price: 8 },
    rare: { label: "Rare", power: 1.38, price: 14 },
    veryRare: { label: "Very rare", power: 1.44, price: 21 },
    legendary: { label: "Legendary", power: 1.5, price: 30 },
});

// How rare a tome is, as a make (QUALITIES: the colour it's shown in, and the shops that keep it),
// by how rare its spell's tomes are found (spells.js TOME_RARITY)
const TOME_GRADE = Object.freeze({ common: "fine", uncommon: "masterwork", rare: "rare" });

/**
 * Everything that can be carried: gear (core/gear.js GEAR: weapons, armour, cloaks and
 * jewellery, each in its slot), and things to use (heal hit points, fill stamina). `price` is
 * what a common one costs (gold).
 */
export const ITEMS = Object.freeze({
    ...GEAR,
    potion: { label: "Healing draught", use: { heal: 25 }, price: 15 },
    meal: { label: "Hot meal", use: { heal: 15 }, price: 5 },
    ale: { label: "Tankard of ale", use: { stamina: 1000 }, price: 2 },
    // A boon in a bottle: twice the stamina for five minutes (host.js #outfit), one at a time;
    // sold at the adventurers' guild
    staminaBoost: {
        label: "Stamina Boost potion",
        about: "Doubles your stamina for five minutes. Only one at a time.",
        use: { boon: { id: "staminaBoost", label: "Stamina Boost", staminaTimes: 2, ms: 5 * 60000 } },
        price: 20,
    },
    // A scroll read to be carried home: to the market square of the town the player started in,
    // three seconds after it's begun (host.js #safety), unless they fall first; sold at the
    // adventurers' guild
    scrollOfSafety: {
        label: "Scroll of Safety",
        about: "Read it to be carried to the market square of the town you started in, three seconds after you begin. Fall before then and it's lost.",
        scroll: true,
        use: { safety: true },
        price: 25,
    },
    // A treasure map (core/treasure.js): read out in the world, where it leads is marked as a circle
    // to search on the reader's world map and their party's (host.js #readMap). It comes in every
    // make gear does (its `quality`), the rarer leading the further, kept the fiercer and the
    // richer; found now and then in chests, and a common one sold at the adventurers' guild
    treasureMap: {
        label: "Treasure map",
        about: "Read it out in the wilds: where it leads is marked on your world map, and your party's, as a circle to search. Something keeps what's buried there. The rarer the map, the further off, the fiercer its keepers and the richer the treasure. Your party shares it. Three at a time.",
        map: true,
        use: { treasure: true },
        price: 40,
    },
    // A key dropped by a rare foe below ground (core/rare.js VAULT `key`): carried through the
    // sealed door added to that floor, it opens it, and it's spent; worth nothing to a shop
    vaultKey: {
        label: "Sealed key",
        about: "Dropped by something rare below ground. Carry it through the sealed door that's come to that floor and the door opens; the key's spent.",
        key: true,
        price: 1,
    },
    // A goblin's bomb, lit and thrown at a foe up to `reach` metres off (battle.js lob, BOMBS): it
    // lands, fizzes and bursts, hurting (`damage`, at its heart) and throwing their side round it;
    // found on goblins, never sold
    goblinBomb: {
        label: "Goblin Bomb",
        about: "A clay pot of black powder with a short fuse. Lit and thrown at a foe up to 12 metres off, it lands, fizzes a moment and bursts, hurting and throwing everyone of theirs nearby. It never hurts or throws you or your allies.",
        bomb: true,
        use: { bomb: "goblinBomb", damage: [14, 24], reach: 12 },
        price: 18,
    },
    // Food for the wild's beasts (core/wary.js BAIT), thrown to the one the player's set on (or
    // ahead of them) up to `reach` metres off (battle.js toss): a beast that eats it goes to it and
    // eats, and leaves them be after, or one after them is drawn off them a moment; a curious one,
    // fed enough, follows them. Meat for the hunters (any meat carved from a beast does as well),
    // the feed bag for the grazers; sold at taverns, the adventurers' guild and by pedlars
    meatBait: {
        label: "Meat bait",
        about: "Scraps of raw meat to throw to a hunting beast (wolves, bears, big cats). One that eats it leaves you be after; one already after you is drawn off a moment. A curious one fed enough follows you. Any meat you've carved from a beast does as well.",
        bait: "meat",
        use: { bait: "meat", reach: 12 },
        price: 3,
    },
    feedBag: {
        label: "Feed bag",
        about: "A sack of apples and grain to throw to a grazing beast (boar, deer, bulls). One that eats it leaves you be after; one already after you is drawn off a moment. A curious one fed enough follows you.",
        bait: "feed",
        use: { bait: "feed", reach: 12 },
        price: 2,
    },
    // The cures for what lingers after some creatures' blows (afflictions.js): each ends one
    ...Object.fromEntries(Object.entries(CURES).map(([id, { label, cure, price }]) => [id, { label, use: { cure }, price }])),
    // The spells' tomes (spells.js TOMES): each read to learn its spell at once; found on creatures
    // with hands, or given for a guild's contract; the rarer, the dearer
    ...Object.fromEntries(TOMES.map((spell) => [tomeOf(spell), { label: `Tome of ${SPELLS[spell].label}`, tome: spell, use: { learn: spell }, price: SPELLS[spell].price ?? TOME_RARITY[SPELLS[spell].tome].price, rarity: TOME_GRADE[SPELLS[spell].tome] }])),
    // The elements' first spells' tomes (spells.js ELEMENT_TOMES): each read to open its school,
    // sold at any adventurers' guild
    ...Object.fromEntries(ELEMENT_TOMES.map((spell) => [tomeOf(spell), { label: `Tome of ${SPELLS[spell].label}`, tome: spell, opens: SPELLS[spell].school, use: { learn: spell }, price: ELEMENT_TOME_PRICE }])),
    // The alchemist's brews, the charms carried for luck (in every make, as gear is) and the
    // occult scriptorium's spell scrolls (goods.js)
    ...BREWS,
    ...CHARMS,
    ...SCROLLS,
    // The wild's creatures' parts (spoils.js): what the adventurers' guild pays for each; some to
    // eat or drink
    ...Object.fromEntries(Object.entries(PARTS).map(([id, { label, worth, use, icon }]) => [id, { label, price: worth, part: true, ...(use ? { use } : {}), ...(icon === "meat" ? { food: true } : {}) }])),
});

// The arms a smith keeps, from a sword to a quiver (not a wand or a grimoire: the arcane's)
const ARMS = Object.freeze(["sword", "hammer", "greatsword", "axe", "staff", "bow", "gauntlets", "quiver"]);

// The armour a smith keeps: shields, and what's worn, head to foot
const ARMOUR = Object.freeze(["roundShield", "kiteShield", "towerShield", "cap", "nasalHelm", "jerkin", "gambeson", "mail", "plate", "bracers", "gloves", "platedGloves", "belt", "trousers", "breeches", "greaves", "leatherBoots", "sabatons", "boots", "travelCloak"]);

// The arcane: what's held, worn and carried by those who cast, and charms
const ARCANA = Object.freeze(["wand", "grimoire", "spellward", "wizardHat", ...Object.keys(CHARMS)]);

// The alchemist's: every draught there is, and the cures (a stamina draught and a Stamina Boost
// on its shelves every day: SHOPS `always`)
const DRAUGHTS = Object.freeze(["potion", "staminaBoost", ...Object.keys(BREWS), ...Object.keys(CURES)]);

// A specialist's shelves (a swordsmith's, an armorer's, an occult scriptorium's, an alchemist's),
// how well made, or how rare, what's on them is, and its special; and a master's (the Master
// Swordsmith's, the Master Armorer's, the Mystic Emporium's)
const SPECIALIST = Object.freeze({ fine: 0.35, masterwork: 0.4, rare: 0.2, veryRare: 0.05 });
const SPECIALIST_SPECIAL = Object.freeze({ veryRare: 0.6, legendary: 0.4 });
const MASTER = Object.freeze({ rare: 0.5, veryRare: 0.35, legendary: 0.15 });
const MASTER_SPECIAL = Object.freeze({ legendary: 1 });

/**
 * The lines of things a shop buys (SHOPS `line`), by what each thing is: arms (a weapon but a
 * wand or a grimoire; a quiver), armour (shields, and what's worn but jewellery), the arcane (wands
 * and grimoires, a spellward, a wizard's hat, tomes, scrolls and charms), jewellery, draughts (all
 * that's drunk but ale, and cures; not a bomb) and provisions (ale, a hot meal and bait for the
 * wild's beasts). The
 * adventurers' guild buys everything.
 */
export const LINES = Object.freeze({
    arms: (def) => (def.slot === "mainHand" && !def.magic) || Boolean(def.quiver),
    armour: (def) => Boolean(def.slot) && def.slot !== "mainHand" && !def.quiver && !def.jewel,
    arcana: (def) => Boolean(def.magic || def.tome || def.scroll || def.charm || def.id === "spellward" || def.id === "wizardHat"),
    jewels: (def) => Boolean(def.jewel),
    draughts: (def) => Boolean(def.use && !def.slot && !def.part && !def.food && !def.tome && !def.scroll && !def.bomb && !def.bait && def.id !== "meal" && def.id !== "ale"),
    provisions: (def) => def.id === "meal" || def.id === "ale" || Boolean(def.bait),
});

/**
 * What each shop sells (`items`: the things it keeps), and the best make it has of each (`best`);
 * what it buys (`line`: LINES); whether its stock is each day's (`daily`: so many things
 * (`picks`), so many of each (`count`), of which makes, or as rare (`grades`), and its daily
 * special's (`special`), and what else may be its special as if it were of the rarest
 * (`specials`: the Mystic Emporium's Tome of Explosion, now and then), how often it has a special
 * at all (`sometimes`; always, without), and what it always has (`always`): core/stock.js), and
 * how much more it asks (`markup`).
 *
 * - **A blacksmith** (`smith`): every weapon and piece of armour, and its people's uniform, as well
 *   made as the player buying is mighty (`tiered`: SMITH_MAKES).
 * - **The specialists**, in the towns and cities: a swordsmith's arms, an armorer's armour, an
 *   occult scriptorium's tomes, scrolls and the arcane, an alchemist's draughts; better made than a
 *   blacksmith's, a new assortment each day, so many of each (as many as there are, for everyone
 *   who plays together), and a special, very rare or legendary.
 * - **The masters**, one of each for each people: the Master Swordsmith's arms, the Master
 *   Armorer's armour, and the Mystic Emporium's tomes, jewellery, charms and the arcane: rare,
 *   very rare and legendary, at twice the price, and a legendary special.
 * - **A castle's** quartermaster (its armoury: the arms and armour of war, up to legendary) and
 *   arcanist (the arcane and draughts); an abbey's herbalist (draughts, holy jewels and books of
 *   prayer); a people's watchtower's quartermaster (their own shop, not their part's: host.js
 *   `#shopkeeper`: the garrison's plain arms and armour, up to fine); a tavern's ale and meals, a
 *   temple's healing draughts. Taverns, the guild and pedlars sell bait for the wild's beasts too
 *   (meat bait and the feed bag: core/wary.js).
 * - **The adventurers' guild**: what a new adventurer needs (the elements' first tomes, the first
 *   spells' scrolls, draughts and cures, the Stamina Boost, the Scroll of Safety, a wand and the
 *   rest; a treasure map, only ever common: core/treasure.js), and it buys everything, the
 *   creatures' parts and the tomes too.
 * - **A pedlar** met out in the wilds (core/director.js STRANGERS): odds and ends, a healing
 *   draught, meat bait and a feed bag (core/wary.js) and a few more draughts and cures each day, and
 *   some days a common treasure map or a charm, a little dearer than in town.
 */
export const SHOPS = Object.freeze({
    smith: { items: [...ARMS, ...ARMOUR, ...UNIFORM], best: "masterwork", tiered: true, line: ["arms", "armour"] },
    swordsmith: { items: ARMS, best: "veryRare", line: ["arms"], daily: { picks: 9, count: [1, 3], grades: SPECIALIST, special: SPECIALIST_SPECIAL, always: ["sword"] } },
    armorer: { items: ARMOUR, best: "veryRare", line: ["armour"], daily: { picks: 10, count: [1, 3], grades: SPECIALIST, special: SPECIALIST_SPECIAL } },
    scriptorium: { items: [...ARCANA, ...TOMES.map(tomeOf), ...Object.keys(SCROLLS)], best: "veryRare", line: ["arcana"], daily: { picks: 12, count: [1, 3], grades: { common: 0.2, ...SPECIALIST }, special: SPECIALIST_SPECIAL } },
    alchemist: { items: DRAUGHTS, best: "veryRare", line: ["draughts"], daily: { picks: 12, count: [2, 6], grades: { common: 0.5, ...SPECIALIST }, special: SPECIALIST_SPECIAL, always: ["staminaDraught", "staminaBoost"] } },
    masterSwordsmith: { items: ARMS, best: "legendary", line: ["arms"], markup: 2, daily: { picks: 7, count: [1, 1], grades: MASTER, special: MASTER_SPECIAL, always: ["sword"] } },
    masterArmorer: { items: ARMOUR, best: "legendary", line: ["armour"], markup: 2, daily: { picks: 8, count: [1, 1], grades: MASTER, special: MASTER_SPECIAL } },
    emporium: { items: [...ARCANA, "amulet", "ring", ...TOMES.map(tomeOf), ...Object.keys(SCROLLS)], best: "legendary", line: ["arcana", "jewels"], markup: 2, daily: { picks: 10, count: [1, 2], grades: MASTER, special: MASTER_SPECIAL, specials: [tomeOf("explosion")] } },
    armoury: { items: ["sword", "hammer", "greatsword", "axe", "bow", "gauntlets", "quiver", "roundShield", "kiteShield", "towerShield", "nasalHelm", "gambeson", "mail", "plate", "platedGloves", "greaves", "sabatons", ...UNIFORM], best: "legendary", line: ["arms", "armour"] },
    arcane: { items: ["wand", "grimoire", "staff", "spellward", "wizardHat", "amulet", "ring", "potion", ...Object.keys(CURES)], best: "masterwork", line: ["arcana", "jewels", "draughts"] },
    abbey: { items: ["potion", ...Object.keys(CURES), "amulet", "ring", "grimoire"], best: "masterwork", line: ["draughts", "jewels", "arcana"] },
    watch: { items: ["sword", "hammer", "greatsword", "axe", "bow", "quiver", "roundShield", "kiteShield", "cap", "nasalHelm", "jerkin", "gambeson", "mail", "bracers", "gloves", "greaves", "leatherBoots", "boots", ...UNIFORM], best: "fine", line: ["arms", "armour"] },
    tavern: { items: ["ale", "meal", "meatBait", "feedBag"], best: "common", line: ["provisions"] },
    temple: { items: ["potion"], best: "common", line: ["draughts"] },
    pedlar: { items: ["potion", "glowcapDraught", ...Object.keys(CURES), "meatBait", "feedBag"], best: "common", line: ["draughts"], markup: 1.25, daily: { picks: 6, count: [1, 3], grades: { common: 1 }, special: { rare: 1 }, specials: ["treasureMap", ...Object.keys(CHARMS)], sometimes: 0.5, always: ["potion", "meatBait", "feedBag"] } },
    guild: { items: ["wand", "grimoire", "spellward", "wizardHat", "amulet", "ring", "potion", "staminaBoost", "glowcapDraught", "scrollOfSafety", ...Object.keys(CURES), ...ELEMENT_TOMES.map(tomeOf), ...GUILD_TOMES.map(tomeOf), ...STARTING_SCROLLS, "treasureMap", "meatBait", "feedBag"], best: "fine" },
});

/**
 * How well made a blacksmith's wares are for the player buying (SHOPS `tiered`), by how mighty
 * they are (Progress might, 0 to 8): common and fine to begin with, fine and masterwork as they
 * grow, and masterwork alone for the mightiest. Better than that is the specialists'.
 */
export const SMITH_MAKES = Object.freeze([["common", "fine"], ["common", "fine"], ["common", "fine"], ["fine", "masterwork"], ["fine", "masterwork"], ["fine", "masterwork"], ["masterwork"], ["masterwork"], ["masterwork"]]);

/**
 * The kinds of thing a shop's wares are shown under, in turn (the pack's Buy tab: app/pack.js):
 * weapons, what's held in the off hand, what's worn, jewellery, things to eat, drink and cure
 * with, tomes and scrolls, and the spoils of the wild.
 */
export const WARE_KINDS = Object.freeze({ weapon: "Weapons", offHand: "Shields and off hand", worn: "Clothes and armour", jewel: "Jewellery", charm: "Charms", supplies: "Food, drink and draughts", tome: "Tomes and scrolls", spoils: "Spoils of the wild" });

/** Which of WARE_KINDS a thing is (its id). */
export function wareKind(id) {
    const def = ITEMS[id];

    return !def ? "supplies" : def.tome || def.scroll || def.map ? "tome" : def.part ? "spoils" : def.charm ? "charm" : def.slot === "mainHand" ? "weapon" : def.slot === "offHand" ? "offHand" : def.jewel ? "jewel" : def.slot ? "worn" : "supplies";
}

/** Whether a thing comes in every make (QUALITIES), as gear and charms do; else it's only ever common. */
export const comesInMakes = (id) => Boolean(ITEMS[id]?.slot || ITEMS[id]?.charm);

/**
 * How rare a thing is (a QUALITIES make: the colour it's shown in, and the shops that keep it):
 * gear, charms and treasure maps as well made as they are; a draught, scroll or tome as rare as
 * it is (goods.js `rarity`), or common.
 */
export const gradeOf = ({ id, quality = "common" }) => (comesInMakes(id) || ITEMS[id]?.map ? (QUALITIES[quality] ? quality : "common") : (ITEMS[id]?.rarity ?? "common"));

/**
 * The order a shop's wares are shown in ({ id, quality }, as wares has them): by kind
 * (WARE_KINDS), then the commoner made first, then by name.
 */
export function shopOrder(a, b) {
    const kinds = Object.keys(WARE_KINDS);
    const makes = Object.keys(QUALITIES);

    const [x, y] = [ITEMS[a.id]?.label ?? a.id, ITEMS[b.id]?.label ?? b.id];

    // (Names compared code by code, not by the browser's language: the same everywhere)
    return kinds.indexOf(wareKind(a.id)) - kinds.indexOf(wareKind(b.id)) || makes.indexOf(a.quality ?? "common") - makes.indexOf(b.quality ?? "common") || (x < y ? -1 : x > y ? 1 : 0);
}

/**
 * Whether a shop buys a thing (its id): the adventurers' guild everything, the creatures' parts
 * too; any other, only its own line (SHOPS `line`: LINES).
 */
export function buys(shop, id) {
    const def = ITEMS[id];

    return shop === "guild" || Boolean(def && SHOPS[shop]?.line?.some((line) => LINES[line]({ ...def, id })));
}

/** What sells for what (a share of its price), before haggling. */
export const SELL_SHARE = 0.4;

/**
 * What each kind of foe has on them when they fall: gold ([least, most]), and things (each with
 * its chance): a piece of their people's uniform (`uniform`, core/gear.js), as well made as it
 * happens to be (MAKES).
 */
export const LOOT = Object.freeze({
    orc: { gold: [5, 15], items: [{ id: "potion", chance: 0.3 }, { uniform: true, chance: 0.12 }, { id: "sword", quality: "fine", chance: 0.06 }] },
    soldier: { gold: [2, 8], items: [{ id: "potion", chance: 0.15 }, { uniform: true, chance: 0.15 }, { id: "bow", quality: "fine", chance: 0.03 }] },
    // (One of an invasion's raiders: no people's uniform, what they've taken on the roads: core/invasions.js BANDS)
    raider: { gold: [2, 7], items: [{ id: "potion", chance: 0.12 }, { id: "sword", quality: "fine", chance: 0.02 }, { id: "bow", quality: "fine", chance: 0.02 }] },
    // (The chest a place's occupiers guarded, opened once they're put to the sword: core/places.js)
    chest: { gold: [25, 60], items: [{ id: "potion", chance: 0.9 }, { uniform: true, chance: 0.9 }, { uniform: true, chance: 0.5 }, { id: "sword", quality: "fine", chance: 0.2 }, { id: "bow", quality: "fine", chance: 0.15 }] },
    // (The dragon's hoard in its lair, opened once it's slain: core/host.js #lairs)
    hoard: { gold: [180, 320], items: [{ id: "potion", chance: 1 }, { id: "potion", chance: 0.6 }, { id: "ring", quality: "fine", chance: 0.8 }, { id: "amulet", quality: "fine", chance: 0.5 }, { id: "sword", quality: "masterwork", chance: 0.35 }, { id: "bow", quality: "masterwork", chance: 0.25 }] },
    // (A Dreadthorn's, greater: creatures.js LAIRS, an old relic in it too)
    greatHoard: { gold: [500, 900], items: [{ id: "potion", chance: 1 }, { id: "potion", chance: 1 }, { id: "ring", quality: "masterwork", chance: 0.8 }, { id: "amulet", quality: "masterwork", chance: 0.7 }, { id: "sword", quality: "masterwork", chance: 0.6 }, { id: "bow", quality: "masterwork", chance: 0.45 }] },
});

/**
 * The relics the restless dead guard (their chest at the ruins, the wight lord's hoard in a ruined
 * castle's keep: core/host.js), one in each share of it: a jewel of whoever lived there long ago,
 * of the legendary make (its bonuses rolled as any's are: gear.js rollGear) and named for them, an
 * amulet (`amulet`) or a ring (`ring`) "of" one of them (`of`).
 */
export const RELICS = Object.freeze({
    amulet: ["Reliquary", "Torc", "Locket", "Pendant"],
    ring: ["Signet", "Seal", "Band"],
    of: ["the Last King", "the Drowned Queen", "the Barrow Lord", "the Hollow Saint", "the Fallen Abbot", "the Forgotten House", "the Old Kings", "the Ashen Bride", "the Pale Knight", "the Lost Prince"],
});

/**
 * A relic of moonsilver, what Lunara's guardian keeps at a ring of standing stones under a full moon
 * (core/rings.js TRIAL): a legendary amulet or ring, named for her.
 */
export const MOONSILVER = Object.freeze({ amulet: ["Torc", "Locket", "Pendant"], ring: ["Band", "Seal"], of: "of the Silver Lady" });

/** A relic of moonsilver (MOONSILVER), made (random.js random) of a `level` (gear.js rollGear). */
export function rollMoonsilver(random, { level = 1 } = {}) {
    const id = random.chance(0.5) ? "amulet" : "ring";
    const relic = rollGear(id, "legendary", random, { level });

    relic.name = `Moonsilver ${MOONSILVER[id][Math.floor(random.next() * MOONSILVER[id].length) % MOONSILVER[id].length]} ${MOONSILVER.of}`;

    return relic;
}

/** One of the dead's relics (RELICS), made (random.js random) of a `level`: a legendary amulet or ring, with its own name. */
export function rollRelic(random, { level = 1 } = {}) {
    const id = random.chance(0.5) ? "amulet" : "ring";
    const relic = rollGear(id, "legendary", random, { level });
    const pick = (list) => list[Math.floor(random.next() * list.length) % list.length];

    relic.name = `${pick(RELICS[id])} of ${pick(RELICS.of)}`;

    return relic;
}

/** How likely a piece of gear found on a foe is to be of each make. */
export const MAKES = Object.freeze({ common: 0.7, fine: 0.22, masterwork: 0.06, rare: 0.012, veryRare: 0.005, legendary: 0.003 });

/** The makes that are exceptional: those an easy kill finds less often (core/might.js falloff). */
export const EXCEPTIONAL = Object.freeze(["rare", "veryRare", "legendary"]);

/**
 * How likely each make is (`odds`: { make: chance }) found by one for whom it came too easily
 * (`falloff`: core/might.js, 1 for a fair fight, down to a tenth): each exceptional make
 * (EXCEPTIONAL) that much less likely, what's taken from them given to the others, each as much
 * more as it was likely already.
 */
export function fallenOff(odds, falloff = 1) {
    if (!(falloff < 1)) {
        return odds;
    }

    const kept = Math.max(0, falloff);
    const taken = EXCEPTIONAL.reduce((sum, make) => sum + (odds[make] ?? 0) * (1 - kept), 0);
    const plain = Object.keys(odds).filter((make) => !EXCEPTIONAL.includes(make));
    const rest = plain.reduce((sum, make) => sum + odds[make], 0);

    if (!rest) {
        return odds;
    }

    return Object.fromEntries(Object.entries(odds).map(([make, chance]) => [make, EXCEPTIONAL.includes(make) ? chance * kept : chance + (taken * chance) / rest]));
}

/**
 * How many slots a pack has, and how many are shown at a time (a page's). Each holds a stack of
 * things alike (as many as there are: the same kind, as well made), or nothing.
 */
export const PACK_SIZE = 40;
export const PACK_PAGE = 20;

/**
 * How much stronger a wand or grimoire makes spells (a share: 0.1 to 1), rolled when one's made:
 * each band ([least, most]) as likely as its `weight` has it, then anywhere in it. The weaker are
 * common, the strongest very rare.
 */
export const BOOSTS = Object.freeze([
    { band: [0.1, 0.2], weight: 40, rarity: "common" },
    { band: [0.2, 0.3], weight: 25, rarity: "fairly common" },
    { band: [0.3, 0.4], weight: 15, rarity: "uncommon" },
    { band: [0.4, 0.6], weight: 10, rarity: "somewhat rare" },
    { band: [0.6, 0.8], weight: 6, rarity: "rare" },
    { band: [0.8, 0.9], weight: 3, rarity: "quite rare" },
    { band: [0.9, 1], weight: 1, rarity: "very rare" },
]);

/** The boost a wand or grimoire a new character starts with has (a common one). */
export const STARTING_BOOST = 0.12;

/**
 * A wand's or grimoire's boost to spells, rolled (random.js random) for one of a `level` (gear.js
 * levelFactor: the higher, the stronger): a whole percent, 10 to 100.
 */
export function rollBoost(random, level = 1) {
    const total = BOOSTS.reduce((sum, { weight }) => sum + weight, 0);
    let pick = random.next() * total;
    const { band } = BOOSTS.find(({ weight }) => (pick -= weight) < 0) ?? BOOSTS[0];

    return Math.min(1, Math.round((band[0] + random.next() * (band[1] - band[0])) * levelFactor(level) * 100) / 100);
}

/** How rare a boost is (BOOSTS: "common" to "very rare"). */
export const rarityOf = (boost) => (BOOSTS.find(({ band }) => boost < band[1]) ?? BOOSTS.at(-1)).rarity;

/**
 * Whether two things are alike (the same kind, as well made, as strong a boost; gear, of the same
 * people's make, with the same bonuses): they go on one stack.
 */
export const alike = (a, b) => Boolean(a && b) && a.id === b.id && (a.quality ?? "common") === (b.quality ?? "common") && (a.boost ?? null) === (b.boost ?? null) && sameGear(a, b);

/**
 * A thing as it's kept: its kind, its make, (a wand or grimoire) its boost, (gear and charms) its
 * level past the first, (gear) whose make it is, what was rolled on it and its own name, (a
 * legendary weapon) its effect, and (a charm) what was rolled on it. Anything else of it left off.
 */
export function thingOf(item) {
    const def = ITEMS[item.id];
    const quality = QUALITIES[item.quality] ? item.quality : "common";
    const thing = { id: item.id, quality, ...(def?.magic ? { boost: boostOf(item) } : def?.robust ? { boost: blockOf(item.id, quality, item.boost) } : {}) };

    if ((def?.slot || def?.charm) && levelOf(item.level) > 1) {
        thing.level = levelOf(item.level);
    }

    if (def?.uniform) {
        thing.people = UNIFORM_PEOPLES.includes(item.people) ? item.people : "human";
    }

    if ((def?.slot || def?.charm) && item.bonuses && typeof item.bonuses === "object") {
        const bonuses = Object.entries(item.bonuses).filter(([stat, value]) => (def.charm ? CHARM_ROLLS[stat] : STATS[stat]) && Number.isFinite(value));

        if (bonuses.length) {
            thing.bonuses = Object.fromEntries(bonuses);
        }

        if (bonuses.length && def.slot) {
            thing.affixes = Array.isArray(item.affixes) ? item.affixes.filter((key) => typeof key === "string") : [];
        }
    }

    if (def?.slot && typeof item.name === "string" && item.name) {
        thing.name = item.name.slice(0, 40);
    }

    // (A legendary weapon's effect: its own, or, one made before they had them, one all the same)
    const effect = def?.slot ? effectOf(item) : null;

    if (effect) {
        thing.effect = effect;
    }

    // (A unique, a rare encounter's reward found nowhere else: which it is, core/rare.js UNIQUES;
    // bound to who has it)
    if (def?.slot && typeof item.unique === "string" && item.unique) {
        thing.unique = item.unique.slice(0, 40);
    }

    return thing;
}

// A wand's or grimoire's boost: as it is, or (one made before they had them) a common one
const boostOf = (item) => (Number.isFinite(item.boost) ? Math.max(0.1, Math.min(1, item.boost)) : STARTING_BOOST);

// How much of a blow a shield takes: as it was rolled (no more than its make can), or (one made
// before shields blocked) two thirds of the most its make can, the average roll's
const blockOf = (id, quality, block) => {
    const most = blockMost(id, quality);

    return Number.isFinite(block) ? Math.max(0.01, Math.min(most, block)) : Math.round(most * (2 / 3) * 100) / 100;
};

const isSlot = (slot) => Number.isInteger(slot) && slot >= 0 && slot < PACK_SIZE;

// Whether a stack is of a kind of thing (of any make, or only one; of any boost, or only one)
const matches = (stack, id, quality, boost) => stack?.id === id && (quality === null || stack.quality === quality) && (boost === null || (stack.boost ?? null) === boost);
const isCount = (count) => Number.isInteger(count) && count > 0;

// A pack as kept: its slots, each a stack ({ id, quality, count }) or null, in their places; and
// one kept before things stacked (a list of things, one each), each put in, those alike together
function packOf(kept) {
    const pack = Array(PACK_SIZE).fill(null);
    const loose = [];

    (Array.isArray(kept) ? kept : []).forEach((item, slot) => {
        if (!ITEMS[item?.id]) {
            return;
        }

        const stack = { ...thingOf(item), count: isCount(item.count) ? item.count : 1 };

        if (isCount(item.count) && isSlot(slot) && !pack[slot]) {
            pack[slot] = stack;
        } else {
            loose.push(stack);
        }
    });

    for (const stack of loose) {
        const into = pack.findIndex((each) => alike(each, stack));
        const slot = into >= 0 ? into : pack.indexOf(null);

        if (slot >= 0) {
            pack[slot] = { ...stack, count: (pack[slot]?.count ?? 0) + stack.count };
        }
    }

    return pack;
}

/**
 * A thing's name: gear's by its make and what was rolled on it ("Keen sword of the Bear", an
 * orcish helm; one made before bonuses were, its make's word: "Fine sword"); a wand or grimoire
 * with its boost: "Wand (+34% spells)"; a shield with how much of a blow it takes: "Kite shield
 * (blocks 32%)".
 */
export function itemLabel(item) {
    const { id, quality = "common", boost = null } = item;
    const { label, magic, robust, slot } = ITEMS[id] ?? { label: id };
    const made = QUALITIES[quality]?.label;
    const plain = !item.affixes?.length && !item.name;
    const named = slot ? gearName(item) : label;
    const name = made && plain ? `${made} ${named.charAt(0).toLowerCase()}${named.slice(1)}` : named;

    return magic && boost ? `${name} (+${Math.round(boost * 100)}% spells)` : robust && boost ? `${name} (blocks ${Math.round(boost * 100)}%)` : name;
}

// How much more a thing's worth for what was rolled on it, once it's been made: a wand or a
// grimoire the more it boosts spells, a shield the more of a blow it takes of the most it could
const rolledWorth = ({ id, quality, boost }) => (!boost ? 1 : ITEMS[id]?.magic ? 1 + 4 * (boost - 0.1) : ITEMS[id]?.robust ? 1 + 2 * Math.max(0, boost / (blockMost(id, quality) || 1) - 0.5) : 1);

// How much more a piece or a charm is worth for its level (gear.js levelFactor): but a wand's or
// a grimoire's, worth what its boost is (rolled the stronger the higher its level: rollBoost)
const levelWorth = ({ id, level }) => (ITEMS[id]?.magic ? 1 : levelFactor(level));

/** What something costs (gold): its price by its make and level, less the haggling (or, sold, a share of it and more for haggling). */
export function priceOf({ id, quality = "common", boost = null, level = 1 }, { haggle = 0, selling = false } = {}) {
    const base = (ITEMS[id]?.price ?? 0) * (QUALITIES[quality]?.price ?? 1) * rolledWorth({ id, quality, boost }) * levelWorth({ id, level });

    // (A creature's part sells for what it's worth: its price is what the guild pays)
    const share = ITEMS[id]?.part ? 1 : SELL_SHARE;

    return Math.max(1, Math.round(selling ? base * share * (1 + haggle) : base * (1 - haggle)));
}

/**
 * What a shop has for sale ([{ id, quality, people }]): each thing it keeps, common, and better
 * made as far as it goes; a uniform's pieces, its own people's (`people`: whose shop it is).
 * (What's rolled on a better made one is rolled as it's bought, as a wand's boost is.)
 */
export function wares(shop, people = "human", { tier = null } = {}) {
    const { items, best, tiered } = SHOPS[shop] ?? { items: [], best: "common" };
    const makes = tiered && tier !== null ? SMITH_MAKES[Math.max(0, Math.min(SMITH_MAKES.length - 1, Math.floor(tier)))] : Object.keys(QUALITIES).slice(0, Object.keys(QUALITIES).indexOf(best) + 1);
    const maker = UNIFORM_PEOPLES.includes(people) ? people : "human";

    return items.flatMap((id) => (comesInMakes(id) ? makes.map((quality) => ({ id, quality, ...(ITEMS[id].uniform ? { people: maker } : {}) })) : [{ id, quality: "common" }]));
}

/** A make, as likely as MAKES has it (random.js random), each exceptional one less likely for an easy kill (`falloff`: fallenOff). */
export function rollMake(random, { falloff = 1 } = {}) {
    const odds = fallenOff(MAKES, falloff);
    let pick = random.next();

    return Object.keys(odds).find((quality) => (pick -= odds[quality]) < 0) ?? "common";
}

/**
 * What a fallen foe of a kind has on them (random.js random; `people`: theirs, for their
 * uniform's pieces), or what's in a place's chest: { gold, items }. Gear comes with its bonuses
 * rolled, of a `level` (gear.js rollGear), a uniform's piece's make as likely as MAKES has it, less
 * likely exceptional for an easy kill (`falloff`: rollMake); and, the dead's (`relic`), one of their
 * relics (rollRelic); or, Lunara's guardian's (`relic` "moonsilver"), a relic of moonsilver
 * (rollMoonsilver).
 */
export function rollLoot(kind, random, { people = kind === "orc" ? "orc" : "human", relic = false, level = 1, falloff = 1 } = {}) {
    const table = LOOT[kind];

    if (!table) {
        return { gold: 0, items: [] };
    }

    const bundle = {
        gold: random.int(...table.gold),
        items: table.items.filter(({ chance }) => random.chance(chance)).map(({ id, quality, uniform }) => {
            const kindOf = uniform ? UNIFORM[Math.floor(random.next() * UNIFORM.length) % UNIFORM.length] : id;

            return ITEMS[kindOf].slot ? rollGear(kindOf, quality ?? (uniform ? rollMake(random, { falloff }) : "common"), random, { people, level }) : { id: kindOf, quality: quality ?? "common" };
        }),
    };

    // (What the restless dead guarded: one of their relics too, `relic`)
    if (relic) {
        bundle.items.push(relic === "moonsilver" ? rollMoonsilver(random, { level }) : rollRelic(random, { level }));
    }

    return bundle;
}

/** The most of each blow armour takes off, all of it together. */
export const ARMOR_CAP = 0.6;

/**
 * The most a bargain is bettered, all the haggling together (Trade's, the Fox's, a set's and a
 * rabbit's foot's): off what's bought, onto what's sold. Below where a thing bought could be sold
 * straight back for more (1 - h < SELL_SHARE (1 + h) from h = 3/7, about 0.43), with room to spare.
 */
export const HAGGLE_CAP = 0.35;

/** The most chance of catching a blow on a shield there is (the Shield skill's half, and a shield's own bonus). */
export const BLOCK_CAP = 0.6;

/**
 * The most of each blow and shot slipped (Evasion's and gear's: the Dodge spell's on top), the
 * most sooner each blow comes (Swift), of the harm done by them got back (Leeching), and the most
 * likely a blow is to leave its foe bleeding (Vicious): core/gear.js AFFIXES.
 */
export const DODGE_CAP = 0.5;
export const HASTE_CAP = 0.3;
export const LEECH_CAP = 0.25;
export const BLEED_CAP = 0.5;

// The ring slots
const RINGS = ["ring1", "ring2"];

/** The shield a new character starts with in the other hand, by the weapon they chose: a sword's a round shield, a wand's a spellward. */
export const STARTING_SHIELDS = Object.freeze({ sword: "roundShield", wand: "spellward" });

/** How much of a blow a new character's shield takes, of the most a common one can (an average roll's). */
export const STARTING_BLOCK = 2 / 3;

/**
 * What a new character starts with on: their weapon (none, if they fight in spiked boots alone:
 * the `boots` weapon), a common shield with a sword or a wand (STARTING_SHIELDS), leather
 * bracers and breeches, and boots (spiked, if they chose them).
 */
export function startingGear({ weapon = "sword", boots = false } = {}) {
    const gear = Object.fromEntries(SLOT_IDS.map((slot) => [slot, null]));

    gear.mainHand = weapon !== "boots" && ITEMS[weapon]?.slot === "mainHand" ? thingOf({ id: weapon }) : null;
    gear.offHand = STARTING_SHIELDS[weapon] ? thingOf({ id: STARTING_SHIELDS[weapon], quality: "common", boost: Math.round(STARTING_BLOCK * blockMost(STARTING_SHIELDS[weapon]) * 100) / 100 }) : null;
    gear.bracers = { id: "bracers", quality: "common" };
    gear.legs = { id: "breeches", quality: "common" };
    gear.boots = { id: boots || weapon === "boots" ? "boots" : "leatherBoots", quality: "common" };

    return gear;
}

// Gear as kept: each slot's piece (checked: that it goes there, and with the weapon in hand); or
// as kept before there was a slot for everything ({ weapon, body, shield }), those in theirs with
// what a new character starts with on. { worn, off: what can't be worn, for the pack }
function gearOf(kept, hero) {
    if (!kept || typeof kept !== "object") {
        return { worn: startingGear(hero), off: [] };
    }

    const old = !("mainHand" in kept);
    const from = old ? { ...startingGear({ weapon: kept.weapon?.id ?? hero.weapon, boots: hero.boots }), chest: kept.body ?? null, offHand: kept.shield ?? null } : kept;

    if (old && ITEMS[kept.weapon?.id]?.slot === "mainHand") {
        from.mainHand = kept.weapon;
    }

    const worn = Object.fromEntries(SLOT_IDS.map((slot) => [slot, null]));
    const off = [];

    for (const { id: slot, takes } of GEAR_SLOTS) {
        const piece = from[slot];

        if (piece && ITEMS[piece.id]?.slot === takes) {
            worn[slot] = thingOf(piece);
        }
    }

    // (Nothing to fight with: their weapon, or spiked boots)
    if (!worn.mainHand && !ITEMS[worn.boots?.id]?.kicks) {
        worn.mainHand = thingOf({ id: ITEMS[hero.weapon]?.slot === "mainHand" ? hero.weapon : "sword" });
    }

    if (worn.offHand && offHandFits(worn.mainHand?.id ?? null, worn.offHand.id)) {
        off.push(worn.offHand);
        worn.offHand = null;
    }

    return { worn, off };
}

/** A player's skills, gold, pack and gear. */
// A list of ids kept (strings, each once), from what was kept: none, if it wasn't a list
const idsOf = (kept) => [...new Set((Array.isArray(kept) ? kept : []).filter((id) => typeof id === "string"))];

export class Progress {
    /**
     * @param {object} [kept] - As toJSON gave it: { skills: { tree: xp }, gold, pack: [stacks], gear: { slot: piece }, invasion, bestiary, legends }.
     * @param {object} [hero] - Their hero (for the weapon they started with, and their spiked boots).
     */
    constructor({ skills = {}, schools = null, spells = [], spellXp = {}, gold = 20, pack = [], gear = null, invasion = null, bestiary = null, legends = null } = {}, { weapon = "sword", boots = false } = {}) {
        this.skills = Object.fromEntries(Object.keys(TREES).map((tree) => [tree, Math.max(0, Number(skills[tree]) || 0)]));

        /**
         * Each school of magic's experience (core/spells.js SCHOOLS). (Kept from before there
         * were schools: the healing skill's, as Healing's)
         */
        const kept = schools ?? { healing: skills.healing ?? 0 };

        this.schools = Object.fromEntries(Object.keys(SCHOOLS).map((school) => [school, Math.max(0, Number(kept[school]) || 0)]));

        /** The spells learnt from tomes (spells.js SPELLS ids). */
        this.spells = [...new Set((Array.isArray(spells) ? spells : []).filter((id) => SPELLS[id]))];

        /** Each spell that grows as it's used's experience (spells.js `grows`: Vampirism, Dodge, Poison, Summon, Zombify). */
        this.spellXp = Object.fromEntries(Object.entries(spellXp ?? {}).filter(([id, xp]) => SPELLS[id]?.grows && Number(xp) > 0).map(([id, xp]) => [id, Number(xp)]));
        this.gold = Math.max(0, Math.floor(Number(gold) || 0));

        /** The pack's slots: each a stack of things alike ({ id, quality, count, and a wand's boost }), or null. */
        this.pack = packOf(pack);

        /**
         * What they wear and wield: each slot's piece (core/gear.js GEAR_SLOTS), or null. (What
         * was kept that can't be worn as it was goes in the pack)
         */
        const { worn, off } = gearOf(gear, { weapon, boots });

        this.gear = worn;

        for (const piece of off) {
            this.stow(piece);
        }

        /**
         * Their time in towns, for the invasions that come to them (core/invasions.js clockOf:
         * how many they've been in, the time since the last, when the next comes, and the town
         * they're in now and how long they've been there).
         */
        this.invasion = clockOf(invasion);

        /** What they've found out about each kind of creature (core/bestiary.js): carried with them, wherever they go. */
        this.bestiary = new Bestiary(bestiary);

        /**
         * Their rare encounters (core/rare.js), carried with them wherever they go: the unique
         * cards they've done (`met`: never met again, in any world), and the uniques they've been
         * given (`uniques`: never given again).
         */
        this.legends = { met: idsOf(legends?.met), uniques: idsOf(legends?.uniques) };
    }

    /** A school of magic's tier (1 to its last: 5 for Healing, 7 for the elements). */
    tierOf(school) {
        return tierAt(school, this.schools[school] ?? 0);
    }

    /** How far a school is to its next tier: { xp, from, to } (to: null at its last). */
    toNextTier(school) {
        const { xp: steps } = SCHOOLS[school];
        const tier = this.tierOf(school);

        return { xp: this.schools[school], from: steps[tier - 1], to: steps[tier] ?? null };
    }

    /**
     * A school grows by `amount`: the spells it comes to (those of each tier it's reached now,
     * that it hadn't: spells.js ids).
     */
    growSchool(school, amount) {
        if (!SCHOOLS[school] || !(amount > 0)) {
            return [];
        }

        const before = this.tierOf(school);

        this.schools[school] += amount;

        return SCHOOLS[school].tiers.slice(before, this.tierOf(school));
    }

    /**
     * Whether a school of magic's open to them: Healing always; an element once its first spell's
     * been learnt from its tome (spells.js ELEMENT_TOMES).
     */
    opened(school) {
        return school === "healing" || this.spells.includes(SCHOOLS[school]?.tiers[0]);
    }

    /**
     * The spells they can cast (spells.js ids): each open school's up to its tier; Stun (anyone
     * can) and Hold (once Hexes brings it); and those learnt from tomes.
     */
    known() {
        const schooled = Object.keys(SCHOOLS).filter((school) => this.opened(school)).flatMap((school) => SCHOOLS[school].tiers.slice(0, this.tierOf(school)));
        const hexes = ["stun", ...(this.abilities().includes("hold") ? ["hold"] : [])];

        return [...new Set([...schooled, ...hexes, ...this.spells])];
    }

    /** Whether they can cast a spell (a spells.js id). */
    knows(spell) {
        return this.known().includes(spell);
    }

    /** A spell that grows as it's used's level (1 to 5; 1 for any other). */
    levelOf(spell) {
        return growthAt(this.spellXp[spell] ?? 0);
    }

    /** A spell that grows as it's used used (and landing): its level now, if that's a new one, else null. */
    growSpell(spell, amount) {
        if (!SPELLS[spell]?.grows || !(amount > 0)) {
            return null;
        }

        const before = this.levelOf(spell);

        this.spellXp[spell] = (this.spellXp[spell] ?? 0) + amount;

        return this.levelOf(spell) > before ? this.levelOf(spell) : null;
    }

    /** A spell learnt (from a tome): whether it's new to them. */
    learn(spell) {
        if (!SPELLS[spell] || this.knows(spell)) {
            return false;
        }

        this.spells.push(spell);

        return true;
    }

    /** A tree's rank (0 to 5). */
    rank(tree) {
        return RANKS.findLastIndex(({ xp }) => this.skills[tree] >= xp);
    }

    /** How far a tree is to its next rank: { xp, from, to } (to: null at the top). */
    toNext(tree) {
        const rank = this.rank(tree);

        return { xp: this.skills[tree], from: RANKS[rank].xp, to: RANKS[rank + 1]?.xp ?? null };
    }

    /** Use a skill: its experience grows by `amount`. Returns the ranks it's come to ([{ tree, rank, title, ability }]). */
    gain(tree, amount) {
        if (!TREES[tree] || !(amount > 0)) {
            return [];
        }

        const before = this.rank(tree);

        this.skills[tree] = Math.round((this.skills[tree] + amount) * 10) / 10;

        const after = this.rank(tree);
        const ups = [];

        for (let rank = before + 1; rank <= after; rank++) {
            ups.push({ tree, rank, title: RANKS[rank].title, ability: TREES[tree].abilities[rank] ?? null });
        }

        return ups;
    }

    /** Everything the trees and gear give: { melee, ranged, heal, stun, hp, stamina, armor, dodge, haste, leech, bleed, haggle, persuade, followers, ... }. */
    bonuses() {
        const totals = { melee: 0, ranged: 0, heal: 0, stun: 0, spell: 0, hp: 0, stamina: 0, armor: 0, dodge: 0, haste: 0, leech: 0, bleed: 0, block: 0, bash: 0, haggle: 0, persuade: 0, followers: 0, fortune: 0, endurance: 0, wardFire: 0, wardWater: 0, wardAir: 0, wardEarth: 0, wardMagic: 0 };

        for (const [tree, { bonus }] of Object.entries(TREES)) {
            const rank = this.rank(tree);

            for (const [key, values] of Object.entries(bonus)) {
                totals[key] += values[rank];
            }
        }

        // The gear's: a weapon's make and level, in the blows it makes (up close, from afar)
        const weapon = this.gear.mainHand;
        const made = (QUALITIES[weapon?.quality]?.power ?? 1) * levelFactor(weapon?.level);
        const kinds = new Set((WEAPONS[weapon?.id]?.attacks ?? []).map(({ kind }) => kind));

        if (kinds.has("melee")) {
            totals.melee = (1 + totals.melee) * made - 1;
        }

        if (kinds.has("ranged")) {
            totals.ranged = (1 + totals.ranged) * made - 1;
        }

        // (A wand or a grimoire in hand: spells as much stronger as its boost)
        if (ITEMS[weapon?.id]?.magic) {
            totals.spell += boostOf(weapon);
        }

        // Everything worn: its armour and bonuses (as well made as it is), and what it was rolled
        // with; and the sets' (each people's uniform worn together)
        for (const slot of SLOT_IDS) {
            const piece = this.gear[slot];

            if (piece) {
                for (const [stat, value] of Object.entries(statsOf(piece, slot === "mainHand" ? 1 : (QUALITIES[piece.quality]?.power ?? 1)))) {
                    totals[stat] += value;
                }
            }
        }

        for (const [stat, value] of Object.entries(setBonuses(this.gear))) {
            totals[stat] += value;
        }

        // The charms carried (goods.js CHARMS): each kind's best made, never two alike, its own
        // good and what was rolled on it
        for (const charm of Object.values(this.charms())) {
            for (const [stat, value] of Object.entries(charmStats(charm))) {
                totals[stat] += value;
            }
        }

        // (A grimoire held open in both hands: all of it a quarter stronger again)
        totals.spell = (1 + totals.spell) * (ITEMS[weapon?.id]?.spellTimes ?? 1) - 1;
        totals.armor = Math.min(ARMOR_CAP, totals.armor);
        totals.haggle = Math.min(HAGGLE_CAP, totals.haggle);
        totals.dodge = Math.min(DODGE_CAP, totals.dodge);
        totals.haste = Math.min(HASTE_CAP, totals.haste);
        totals.leech = Math.min(LEECH_CAP, totals.leech);
        totals.bleed = Math.min(BLEED_CAP, totals.bleed);

        return totals;
    }

    /**
     * The charms carried that count (goods.js CHARMS): each kind's strongest (its own good, as
     * well made and as high its level: charmPower), the first in the pack of those as strong
     * ({ id: { id, quality, level, bonuses } }, `level` past the first, `bonuses` what was rolled
     * on it, if anything).
     */
    charms() {
        const best = {};

        for (const stack of this.pack) {
            const quality = QUALITIES[stack?.quality] ? stack.quality : "common";

            if (stack && ITEMS[stack.id]?.charm && (!best[stack.id] || charmPower({ quality, level: stack.level }) > charmPower(best[stack.id]))) {
                best[stack.id] = { id: stack.id, quality, ...(levelOf(stack.level) > 1 ? { level: levelOf(stack.level) } : {}), ...(stack.bonuses ? { bonuses: { ...stack.bonuses } } : {}) };
            }
        }

        return best;
    }

    /** The abilities the trees have brought. */
    abilities() {
        return Object.entries(TREES).flatMap(([tree, { abilities }]) => Object.entries(abilities).filter(([rank]) => this.rank(tree) >= Number(rank)).map(([, ability]) => ability));
    }

    /**
     * What they wear that shows: each piece but the weapon in their hand ([{ id, people }]:
     * characters/liveries.js dresses a character in them).
     */
    worn() {
        return SLOT_IDS.filter((slot) => slot !== "mainHand" && this.gear[slot]).map((slot) => {
            const { id, people } = this.gear[slot];

            return people ? { id, people } : { id };
        });
    }

    /**
     * The shield in the other hand, as the battle has it (core/battle.js `shield`): how often
     * they catch a blow on it (their Shield skill and its bonuses: `bonus`, theirs by default),
     * how much of it it takes, and whether it turns spells too (a spellward); null, none.
     */
    guard(bonus = this.bonuses()) {
        const piece = this.gear.offHand;
        const def = GEAR[piece?.id];

        return def?.robust ? { chance: Math.min(BLOCK_CAP, bonus.block), share: blockOf(piece.id, piece.quality, piece.boost), spells: Boolean(def.spells) } : null;
    }

    /** Whether they kick (in spiked boots). */
    kicks() {
        return Boolean(ITEMS[this.gear.boots?.id]?.kicks);
    }

    /** The people they pass for (core/gear.js disguiseOf), or null. */
    disguise() {
        return disguiseOf(this.gear);
    }

    /** How many of a thing (an ITEMS id, of any make) are in the pack. */
    count(id) {
        return this.pack.reduce((sum, stack) => sum + (stack?.id === id ? stack.count : 0), 0);
    }

    /** Each kind of thing in the pack (ITEMS ids, once each). */
    carried() {
        return [...new Set(this.pack.filter(Boolean).map(({ id }) => id))];
    }

    /** The slot the first of a kind of thing (an ITEMS id) is in, or -1. */
    slotOf(id) {
        return this.pack.findIndex((stack) => stack?.id === id);
    }

    /**
     * Put something in the pack (`count` of it): on the first stack of things alike, or else in
     * the first empty slot. Whether there was room.
     */
    stow(item, count = 1) {
        if (!ITEMS[item?.id] || !isCount(count)) {
            return false;
        }

        const thing = thingOf(item);
        const onto = this.pack.findIndex((stack) => alike(stack, thing));
        const slot = onto >= 0 ? onto : this.pack.indexOf(null);

        if (slot < 0) {
            return false;
        }

        this.pack[slot] = { ...thing, count: (this.pack[slot]?.count ?? 0) + count };

        return true;
    }

    /**
     * How many of a kind of thing (an ITEMS id, however well made, or only of one make; and, a
     * wand or grimoire, of any boost or only of one) are in the pack.
     */
    held(id, quality = null, boost = null) {
        return this.pack.reduce((sum, stack) => sum + (matches(stack, id, quality, boost) ? stack.count : 0), 0);
    }

    /** How many of a thing exactly as it is (alike: its make, level, what's rolled on it) are in the pack. */
    heldAlike(item) {
        const thing = thingOf(item);

        return this.pack.reduce((sum, stack) => sum + (alike(stack, thing) ? stack.count : 0), 0);
    }

    /** Take `count` of a thing exactly as it is (alike) out of the pack: true, or false (and nothing taken) if there aren't so many. */
    removeAlike(item, count) {
        const thing = thingOf(item);

        if (!isCount(count) || this.heldAlike(thing) < count) {
            return false;
        }

        let left = count;

        for (let slot = 0; slot < this.pack.length && left > 0; slot++) {
            if (alike(this.pack[slot], thing)) {
                const taken = Math.min(left, this.pack[slot].count);

                this.take(slot, taken);
                left -= taken;
            }
        }

        return true;
    }

    /** A thing as the pack keeps it (its kind, make, level, what's rolled on it, and the rest: thingOf), for a trade to carry whole. */
    static thing(item) {
        return thingOf(item);
    }

    /**
     * Take `count` of a kind of thing (of any make, or only of one) out of the pack, from
     * whichever stacks hold it (the smallest first): true, or false (and nothing taken) if there
     * aren't so many.
     */
    remove(id, count, quality = null, boost = null) {
        if (!isCount(count) || this.held(id, quality, boost) < count) {
            return false;
        }

        let left = count;
        const slots = this.pack.map((stack, slot) => (matches(stack, id, quality, boost) ? slot : -1)).filter((slot) => slot >= 0).sort((a, b) => this.pack[a].count - this.pack[b].count);

        for (const slot of slots) {
            const taken = Math.min(left, this.pack[slot].count);

            this.take(slot, taken);
            left -= taken;

            if (!left) {
                break;
            }
        }

        return true;
    }

    /**
     * Take `count` things off the stack in a slot (the whole stack, with no count): what was
     * taken ({ id, quality, count }), or null if there aren't so many.
     */
    take(slot, count = this.pack[slot]?.count) {
        const stack = isSlot(slot) ? this.pack[slot] : null;

        if (!stack || !isCount(count) || count > stack.count) {
            return null;
        }

        this.pack[slot] = count === stack.count ? null : { ...stack, count: stack.count - count };

        return { ...thingOf(stack), count };
    }

    /**
     * Move the stack in a slot to another: into an empty one, onto a stack of things alike (put
     * together), or swapped with what's there. Returns the reason it can't be, or null.
     */
    move(from, to) {
        if (!isSlot(from) || !isSlot(to) || !this.pack[from]) {
            return "item";
        }

        if (from === to) {
            return null;
        }

        const [moving, there] = [this.pack[from], this.pack[to]];

        if (alike(moving, there)) {
            this.pack[to] = { ...there, count: there.count + moving.count };
            this.pack[from] = null;
        } else {
            this.pack[to] = moving;
            this.pack[from] = there;
        }

        return null;
    }

    /**
     * Split `count` things off the stack in a slot, into another (`to`, which must be empty; or
     * the first empty one). Returns the reason it can't be, or null.
     */
    split(slot, count, to = this.pack.indexOf(null)) {
        const stack = isSlot(slot) ? this.pack[slot] : null;

        if (!stack || !isCount(count) || count >= stack.count) {
            return "count";
        }

        if (!isSlot(to) || this.pack[to]) {
            return "full";
        }

        this.pack[slot] = { ...stack, count: stack.count - count };
        this.pack[to] = { ...stack, count };

        return null;
    }

    /**
     * Put on (or take up) one of the pieces of gear in a slot of the pack, in its slot (a ring, on
     * the hand asked for: `to`, ring1 or ring2; else a bare one, else the first): what it replaces
     * goes into the pack, where it was if it can. Returns the reason it can't be, or null:
     * "item" (nothing to wear there), "slot" (it doesn't go there), "twoHanded" (the weapon takes
     * both hands), "bow" (a bow's other hand takes only a quiver), "quiver" (a quiver only with a
     * bow), "unarmed" (spiked boots off with nothing else to fight with), "full".
     */
    equip(index, to = null) {
        const stack = isSlot(index) ? this.pack[index] : null;
        const kind = stack && ITEMS[stack.id].slot;

        if (!kind) {
            return "item";
        }

        const slot = kind === "ring" ? (RINGS.includes(to) ? to : (RINGS.find((ring) => !this.gear[ring]) ?? RINGS[0])) : kind;

        if (to !== null && to !== slot) {
            return "slot";
        }

        const weapon = slot === "mainHand" ? stack.id : this.gear.mainHand?.id ?? null;
        const offHand = slot === "offHand" ? stack.id : this.gear.offHand?.id ?? null;

        if (slot === "offHand") {
            const why = offHandFits(weapon, offHand);

            if (why) {
                return why;
            }
        }

        if (slot === "boots" && !this.gear.mainHand && !ITEMS[stack.id].kicks) {
            return "unarmed";
        }

        // (A weapon the other hand's piece doesn't go with: that comes off too)
        const offToo = slot === "mainHand" && offHand && offHandFits(weapon, offHand) !== null;
        const before = this.pack.map((each) => each && { ...each });
        const item = this.take(index, 1);
        const off = [this.gear[slot], offToo ? this.gear.offHand : null].filter(Boolean);

        if (!off.every((piece, k) => (k === 0 && !this.pack[index] && !this.pack.some((each) => alike(each, piece)) ? Boolean((this.pack[index] = { ...thingOf(piece), count: 1 })) : this.stow(piece)))) {
            this.pack = before;

            return "full";
        }

        this.gear[slot] = thingOf(item);

        if (offToo) {
            this.gear.offHand = null;
        }

        return null;
    }

    /**
     * Take off a piece (a slot: core/gear.js GEAR_SLOTS), into the pack (a slot of it, `to`: empty,
     * or with things alike; else wherever it goes). Returns the reason it can't be, or null:
     * "item" (nothing there), "unarmed" (the weapon only off with spiked boots on to kick with,
     * and those only with a weapon in hand), "full".
     */
    unequip(slot, to = null) {
        const piece = SLOT_IDS.includes(slot) ? this.gear[slot] : null;

        if (!piece) {
            return "item";
        }

        if ((slot === "mainHand" && !this.kicks()) || (slot === "boots" && ITEMS[piece.id].kicks && !this.gear.mainHand)) {
            return "unarmed";
        }

        if (to !== null && (!isSlot(to) || (this.pack[to] && !alike(this.pack[to], piece)))) {
            return isSlot(to) ? "full" : "item";
        }

        // (The weapon off: a quiver with it)
        const quiver = slot === "mainHand" && this.gear.offHand && offHandFits(null, this.gear.offHand.id) !== null ? this.gear.offHand : null;
        const before = this.pack.map((each) => each && { ...each });

        if (to !== null) {
            this.pack[to] = { ...thingOf(piece), count: (this.pack[to]?.count ?? 0) + 1 };
        } else if (!this.stow(piece)) {
            return "full";
        }

        if (quiver && !this.stow(quiver)) {
            this.pack = before;

            return "full";
        }

        this.gear[slot] = null;

        if (quiver) {
            this.gear.offHand = null;
        }

        return null;
    }

    /**
     * What putting on a piece from the pack would change (as equip, `to`): { reason (why it can't
     * be, or null), before and after (bonuses()), off (what would come off: pieces), weapon (the
     * one they'd fight with) }. Nothing's changed.
     */
    trying(index, to = null) {
        return tryOn(new Progress(this.toJSON()), index, to);
    }

    /**
     * What putting on a piece that isn't carried would change (a shop's ware, as it is: nothing
     * rolled on it yet; or another's), as trying has it, the piece first in the pack's first free
     * slot; with no free slot, `reason` "room". Nothing's changed.
     */
    tryingOn(item) {
        const index = this.pack.indexOf(null);

        if (index < 0 || !ITEMS[item?.id]) {
            const before = this.bonuses();

            return { reason: index < 0 ? "room" : "item", before, after: before, off: [], weapon: weaponOf(this) };
        }

        const trial = new Progress(this.toJSON());

        trial.pack[index] = { ...thingOf(item), count: 1 };

        return tryOn(trial, index);
    }

    /**
     * Put the pack in order: gear first (by where it's worn, the best made first), then things to
     * use, then tomes, then creatures' parts; things alike put together.
     */
    sort() {
        const order = (stack) => {
            const def = ITEMS[stack.id];
            const group = def.slot ? 0 : def.use && !def.tome && !def.part ? 1 : def.tome ? 2 : 3;
            const slot = def.slot ? GEAR_SLOTS.findIndex(({ takes }) => takes === def.slot) : 0;

            return [group, slot, -Object.keys(QUALITIES).indexOf(stack.quality ?? "common"), def.label];
        };
        const stacks = packOf(this.pack.filter(Boolean)).filter(Boolean);

        stacks.sort((a, b) => {
            const [x, y] = [order(a), order(b)];

            return x.findIndex((value, k) => value !== y[k]) === -1 ? 0 : x.map((value, k) => (value < y[k] ? -1 : value > y[k] ? 1 : 0)).find((sign) => sign !== 0);
        });

        this.pack = [...stacks, ...Array(PACK_SIZE - stacks.length).fill(null)];

        return null;
    }

    /** What's kept. */
    toJSON() {
        return { skills: { ...this.skills }, schools: { ...this.schools }, spells: [...this.spells], spellXp: { ...this.spellXp }, gold: this.gold, pack: this.pack.map((stack) => (stack ? { ...stack } : null)), gear: structuredClone(this.gear), invasion: { ...this.invasion }, bestiary: this.bestiary.toJSON(), legends: { met: [...this.legends.met], uniques: [...this.legends.uniques] } };
    }
}

/** The weapon a player fights with (a WEAPONS key), from their gear: kicking, in spiked boots with nothing in hand. */
// A piece in the pack of a copy of someone's progress put on, as Progress trying has it (the copy changed)
function tryOn(trial, index, to = null) {
    const before = trial.bonuses();
    const was = { ...trial.gear };
    const reason = trial.equip(index, to);
    const off = reason ? [] : SLOT_IDS.filter((slot) => was[slot] && trial.gear[slot] !== was[slot] && !alike(trial.gear[slot], was[slot])).map((slot) => was[slot]);

    return { reason, before, after: reason ? before : trial.bonuses(), off, weapon: weaponOf(trial) };
}

export const weaponOf = (progress) => (WEAPONS[progress.gear.mainHand?.id] ? progress.gear.mainHand.id : progress.gear.boots && ITEMS[progress.gear.boots.id]?.kicks ? "boots" : "sword");
