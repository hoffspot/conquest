// The specialist shops' goods (docs/WAR.md *Shops*): an alchemist's draughts, elixirs and oils, an
// occult scriptorium's spell scrolls, and the charms carried for luck, sold there and at the
// Mystic Emporium. Each is one of progress.js ITEMS, as gear and the guild's draughts are.
//
// How rare each is (`rarity`, a progress.js QUALITIES make: the colour it's shown in, and which
// shops keep it) is its own: a draught or a scroll is only ever as it was made. A charm comes in
// every make, as gear does, the better made the stronger (CHARM_GRADE).
//
// Pure data, no DOM.

import { SCHOOLS, SPELLS } from "./spells.js";

// A boon in a bottle (host.js #use: on the drinker a while, one of each at a time)
const boon = (id, label, ms, effect) => ({ boon: { id, label, ms, ...effect } });

const MINUTES = 60000;

/**
 * The alchemist's brews: healing draughts stronger than the guild's, a draught of endurance, the
 * elixirs (a boon to blows, shots, spells, armour or healing a while), the warding elixirs (a
 * ward's spell in a bottle, half an hour: spells.js resistFire...), a phial of shadows
 * (Invisibility, a minute), a glowcap draught (Light, a quarter of an hour), and oils for a blade
 * (or arrows): each blow or shot a while likely to leave burning, frost or venom on what it hits.
 */
export const BREWS = Object.freeze({
    greaterPotion: { label: "Greater healing draught", about: "Heals 60.", use: { heal: 60 }, price: 45, rarity: "fine", colour: "#d8203a" },
    superiorPotion: { label: "Superior healing draught", about: "Heals 150.", use: { heal: 150 }, price: 120, rarity: "masterwork", colour: "#ff3a5a" },
    enduranceDraught: { label: "Draught of Endurance", about: "Your breath comes back half again as fast, ten minutes.", use: boon("endurance", "Enduring", 10 * MINUTES, { recoveryTimes: 1.6 }), price: 30, rarity: "fine", colour: "#e8a020" },
    elixirOfStrength: { label: "Elixir of Strength", about: "Your blows 15% stronger, ten minutes.", use: boon("strength", "Strength", 10 * MINUTES, { melee: 0.15 }), price: 55, rarity: "fine", colour: "#c83a1a" },
    elixirOfTheHawk: { label: "Elixir of the Hawk", about: "Your shots 15% stronger, ten minutes.", use: boon("hawk", "Hawk-eyed", 10 * MINUTES, { ranged: 0.15 }), price: 55, rarity: "fine", colour: "#d8c040" },
    elixirOfSorcery: { label: "Elixir of Sorcery", about: "Your spells 15% stronger, ten minutes.", use: boon("sorcery", "Sorcery", 10 * MINUTES, { spell: 0.15 }), price: 65, rarity: "masterwork", colour: "#7a4ae8" },
    elixirOfIronskin: { label: "Elixir of Ironskin", about: "Your skin as hard as mail: 5% more armour, ten minutes.", use: boon("ironskin", "Ironskin", 10 * MINUTES, { armor: 0.05 }), price: 65, rarity: "masterwork", colour: "#8a9aa8" },
    elixirOfMending: { label: "Elixir of Mending", about: "Your healing 20% stronger, ten minutes.", use: boon("mending", "Mending", 10 * MINUTES, { heal: 0.2 }), price: 50, rarity: "fine", colour: "#3ad06a" },
    elixirOfFireWarding: { label: "Elixir of Fire Warding", about: "Resist Fire's ward on you, half an hour.", use: { ward: "resistFire", ms: 30 * MINUTES }, price: 35, rarity: "fine", colour: "#ff6a1a" },
    elixirOfFrostWarding: { label: "Elixir of Frost Warding", about: "Resist Water's ward on you, half an hour.", use: { ward: "resistWater", ms: 30 * MINUTES }, price: 35, rarity: "fine", colour: "#4ab0ff" },
    elixirOfStormWarding: { label: "Elixir of Storm Warding", about: "Resist Air's ward on you, half an hour.", use: { ward: "resistAir", ms: 30 * MINUTES }, price: 35, rarity: "fine", colour: "#c8e8ff" },
    elixirOfStoneWarding: { label: "Elixir of Stone Warding", about: "Resist Earth's ward on you, half an hour.", use: { ward: "resistEarth", ms: 30 * MINUTES }, price: 35, rarity: "fine", colour: "#a8804a" },
    elixirOfSpellWarding: { label: "Elixir of Spell Warding", about: "Resist Magic's ward on you, half an hour.", use: { ward: "resistMagic", ms: 30 * MINUTES }, price: 70, rarity: "masterwork", colour: "#b07cff" },
    elixirOfVenomWarding: { label: "Elixir of Venom Warding", about: "Resist Poison's ward on you, half an hour.", use: { ward: "resistPoison", ms: 30 * MINUTES }, price: 30, rarity: "fine", colour: "#6ab018" },
    elixirOfPlagueWarding: { label: "Elixir of Plague Warding", about: "Resist Disease's ward on you, half an hour.", use: { ward: "resistDisease", ms: 30 * MINUTES }, price: 30, rarity: "fine", colour: "#a8b04a" },
    phialOfShadows: { label: "Phial of Shadows", about: "Unseen a minute, or till you strike, cast, talk, trade or use anything (Invisibility's).", use: { buff: "invisibility", ms: MINUTES }, price: 150, rarity: "rare", colour: "#2a2a3a" },
    glowcapDraught: { label: "Glowcap draught", about: "A globe of light over your shoulder, a quarter of an hour (Light's).", use: { buff: "light", ms: 15 * MINUTES }, price: 12, rarity: "common", colour: "#e8f0a0" },
    fireOil: { label: "Fire oil", about: "Rubbed on your weapon: a blow or shot in four may set them burning, five minutes. One oil at a time.", use: boon("fireOil", "Fire oil", 5 * MINUTES, { oil: { kind: "burn", chance: 0.25 } }), price: 40, rarity: "fine", colour: "#ff8a2a", oil: true },
    frostOil: { label: "Frost oil", about: "Rubbed on your weapon: a blow or shot in four may chill them, slowing them, five minutes. One oil at a time.", use: boon("frostOil", "Frost oil", 5 * MINUTES, { oil: { kind: "slow", look: "frost", chance: 0.25 } }), price: 40, rarity: "fine", colour: "#9ad8ff", oil: true },
    venomOil: { label: "Venom oil", about: "Rubbed on your weapon: a blow or shot in four may poison them, five minutes. One oil at a time.", use: boon("venomOil", "Venom oil", 5 * MINUTES, { oil: { kind: "poison", chance: 0.25 } }), price: 40, rarity: "fine", colour: "#7ac030", oil: true },
});

/**
 * Carried charms: each does its good (STATS: gear.js) while it's in the pack, the best made of a
 * kind counting, never two alike. A common one's as `charm` has it, a better made one the more
 * (CHARM_GRADE). Some add to what gear can (blows, shots, spells, hit points, healing,
 * haggling), some to what only a charm can: the gold found on the fallen (`fortune`), how little
 * running tires (`endurance`), and how much less an element's spells and blows hurt (`wardFire`,
 * `wardWater`, `wardAir`, `wardEarth`; every spell, `wardMagic`).
 */
export const CHARMS = Object.freeze({
    rabbitsFoot: { label: "Rabbit's foot", about: "Luck in a bargain.", charm: { haggle: 0.03 }, price: 50, look: "foot" },
    luckyCoin: { label: "Lucky coin", about: "More gold found on the fallen.", charm: { fortune: 0.08 }, price: 70, look: "coin" },
    wolfTooth: { label: "Wolf-tooth charm", about: "A hunter's bite in your blows.", charm: { melee: 0.03 }, price: 70, look: "tooth" },
    hawkFeather: { label: "Hawk-feather charm", about: "A hawk's eye for your shots.", charm: { ranged: 0.03 }, price: 70, look: "feather" },
    moonstone: { label: "Moonstone charm", about: "Your spells a little stronger.", charm: { spell: 0.03 }, price: 80, look: "moonstone" },
    oakHeart: { label: "Heart of oak", about: "A sliver of an old oak's heart: more hit points.", charm: { hp: 8 }, price: 60, look: "oak" },
    swiftwind: { label: "Swiftwind charm", about: "Running tires you less.", charm: { endurance: 0.12 }, price: 60, look: "whistle" },
    saintsToken: { label: "Saint's token", about: "Your healing a little stronger.", charm: { heal: 0.05 }, price: 60, look: "token" },
    emberStone: { label: "Ember stone", about: "Fire hurts you a little less.", charm: { wardFire: 0.08 }, price: 65, look: "ember" },
    rimeStone: { label: "Rime stone", about: "Water and frost hurt you a little less.", charm: { wardWater: 0.08 }, price: 65, look: "rime" },
    stormGlass: { label: "Storm glass", about: "Wind and lightning hurt you a little less.", charm: { wardAir: 0.08 }, price: 65, look: "storm" },
    hagStone: { label: "Hag stone", about: "Stone and earth hurt you a little less.", charm: { wardEarth: 0.08 }, price: 65, look: "hag" },
    witchEye: { label: "Witch's eye", about: "Every spell hurts you a little less.", charm: { wardMagic: 0.05 }, price: 110, look: "eye" },
});

/** How much stronger a charm is for each make (progress.js QUALITIES), than a common one. */
export const CHARM_GRADE = Object.freeze({ common: 1, fine: 1.25, masterwork: 1.5, rare: 1.75, veryRare: 2, legendary: 2.5 });

/**
 * A charm's good (its CHARMS `charm`, as strong as its make: CHARM_GRADE): { stat: value }, each
 * share to a whole percent's tenth, each number whole.
 */
export function charmOf(id, quality = "common") {
    const grade = CHARM_GRADE[quality] ?? 1;

    return Object.fromEntries(Object.entries(CHARMS[id]?.charm ?? {}).map(([stat, value]) => [stat, Number.isInteger(value) ? Math.round(value * grade) : Math.round(value * grade * 1000) / 1000]));
}

// A school spell's scroll by its tier: how rare it is, and what it costs
const TIER_SCROLLS = Object.freeze([
    { rarity: "common", price: 15 },
    { rarity: "common", price: 30 },
    { rarity: "fine", price: 55 },
    { rarity: "masterwork", price: 95 },
    { rarity: "rare", price: 160 },
    { rarity: "veryRare", price: 260 },
    { rarity: "legendary", price: 420 },
]);

// A tome's spell's scroll by how rare its tome is (spells.js TOME_RARITY)
const TOME_SCROLLS = Object.freeze({ common: { rarity: "fine", price: 30 }, uncommon: { rarity: "masterwork", price: 75 }, rare: { rarity: "rare", price: 180 } });

// The Hexes' (spells.js stun, hold)
const HEX_SCROLLS = Object.freeze({ stun: { rarity: "fine", price: 40 }, hold: { rarity: "masterwork", price: 80 } });

/**
 * The spells there are scrolls of (an occult scriptorium's): every school's (spells.js SCHOOLS),
 * the Hexes', and the tomes' cast on an enemy, oneself or a friend with nothing in hand (not a
 * place, the fallen or a summons; not the wards' and cures', which come in bottles).
 */
export const SCROLL_SPELLS = Object.freeze([
    ...Object.values(SCHOOLS).flatMap(({ tiers }) => tiers),
    ...Object.keys(HEX_SCROLLS),
    ...Object.keys(SPELLS).filter((id) => SPELLS[id].tome && !SPELLS[id].ward && !SPELLS[id].cures && !SPELLS[id].needs && ["enemy", "self", "friend"].includes(SPELLS[id].target) && id !== "teleport"),
]);

/** A spell's scroll's item id ("scrollFireball"). */
export const scrollOf = (spell) => `scroll${spell.charAt(0).toUpperCase()}${spell.slice(1)}`;

/**
 * Each spell scroll: read, it casts its spell (spells.js) as its reader would, though they've
 * never learnt it, and it's gone: on the foe they're set on (or the nearest they can see in its
 * reach), or on themselves. As rare and dear as the spell's great.
 */
export const SCROLLS = Object.freeze(
    Object.fromEntries(
        SCROLL_SPELLS.map((spell) => {
            const def = SPELLS[spell];
            const { rarity, price } = def.tier ? TIER_SCROLLS[def.tier - 1] : (HEX_SCROLLS[spell] ?? TOME_SCROLLS[def.tome]);

            return [scrollOf(spell), { label: `Scroll of ${def.label}`, about: `Read it to cast ${def.label} once, though you've never learnt it. ${def.about ?? ""}`.trim(), scroll: true, use: { cast: spell }, price, rarity, spell }];
        }),
    ),
);
