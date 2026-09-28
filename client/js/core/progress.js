// Growing stronger (docs/WAR.md M3): skills that grow by being used, each along a tree of its own
// ranks; gear, bought and found, of better and worse make; gold; and a pack to carry it all in.
// And from all of it, a player's might, which brings the war on (war/war.js setMight).
//
// A skill grows by what it's used for: landing blows up close (blade), from afar (marksman),
// stunning (hexes), taking blows (endurance), buying and selling (trade), talking (talk), and
// leading followers (command, from M9). Each rank up its tree makes it stronger, and some bring a
// new ability: a power strike, an aimed shot, a hold.
//
// Magic's schools (core/spells.js SCHOOLS: Healing, Fire, Earth, Air, Water) grow by the spells
// of each that land: each tier a school comes to, its next spell. And spells learnt from tomes.
// A wand or a grimoire makes spells stronger, each by its own share (rolled when it's made:
// rollBoost).
//
// The fighting trees and the gear make a player mighty; so does leading others (a healer or a
// talker hires the might they don't have: M9). Everything here is plain data (toJSON), kept with
// the character (app/save.js), and the host's to change (core/host.js). Pure JavaScript, no DOM.

import { CURES } from "./afflictions.js";
import { SCHOOLS, SPELLS, tierAt } from "./spells.js";
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
 * (longer stuns), hp, stamina (more of each), armor (the share of each blow taken off), haggle
 * (the share off what's bought, and on what's sold), persuade (M4, M7), followers (M9).
 */
export const TREES = Object.freeze({
    blade: { name: "Blade", grows: "landing blows up close", fighting: true, bonus: { melee: [0, 0.1, 0.2, 0.3, 0.45, 0.6], hp: [0, 0, 0, 10, 15, 20] }, abilities: { 2: "powerStrike" } },
    marksman: { name: "Marksman", grows: "landing shots from afar", fighting: true, bonus: { ranged: [0, 0.1, 0.2, 0.3, 0.45, 0.6] }, abilities: { 2: "aimedShot" } },
    hexes: { name: "Hexes", grows: "stunning your foes", fighting: true, bonus: { stun: [0, 0.15, 0.3, 0.5, 0.75, 1] }, abilities: { 2: "hold" } },
    endurance: { name: "Endurance", grows: "taking blows and running hard", fighting: false, bonus: { hp: [0, 5, 10, 20, 30, 40], stamina: [0, 5, 10, 20, 30, 40], armor: [0, 0, 0.03, 0.05, 0.08, 0.1] }, abilities: {} },
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
    aimedShot: { label: "Aimed shot", tree: "marksman", blow: "ranged", factor: 2, cooldown: 12000 },
    hold: { label: "Hold", tree: "hexes", spell: "hold" },
});

/** How well made a piece of gear is: what it adds to (a weapon's blows, armour's protection), and what it costs. */
export const QUALITIES = Object.freeze({
    common: { label: "", power: 1, price: 1, might: 0 },
    fine: { label: "Fine", power: 1.15, price: 3, might: 0.5 },
    masterwork: { label: "Masterwork", power: 1.3, price: 8, might: 1 },
    legendary: { label: "Legendary", power: 1.5, price: 30, might: 1.5 },
});

/**
 * Everything that can be carried: weapons (any of the WEAPONS a hero can start with, in the
 * weapon slot), armour (body and shield slots: `armor`, the share of each blow it takes off, and
 * what it looks like: `equipment`), and things to use (heal hit points, fill stamina). `price` is
 * what a common one costs (gold).
 */
export const ITEMS = Object.freeze({
    sword: { label: "Sword", slot: "weapon", price: 30 },
    staff: { label: "Staff", slot: "weapon", price: 20 },
    wand: { label: "Wand", slot: "weapon", price: 40, magic: true },
    grimoire: { label: "Grimoire", slot: "weapon", price: 45, magic: true },
    hammer: { label: "War hammer", slot: "weapon", price: 35 },
    bow: { label: "Bow", slot: "weapon", price: 35 },
    gauntlets: { label: "Spiked gauntlets", slot: "weapon", price: 25 },
    boots: { label: "Spiked boots", slot: "weapon", price: 25 },
    gambeson: { label: "Gambeson", slot: "body", armor: 0.08, price: 25, equipment: ["gambeson"], might: 0.5 },
    mail: { label: "Mail shirt", slot: "body", armor: 0.16, price: 80, equipment: ["mail"], might: 1 },
    roundShield: { label: "Round shield", slot: "shield", armor: 0.06, price: 20, equipment: ["roundShield"], might: 0.25 },
    kiteShield: { label: "Kite shield", slot: "shield", armor: 0.1, price: 45, equipment: ["kiteShield"], might: 0.5 },
    potion: { label: "Healing draught", use: { heal: 25 }, price: 15 },
    meal: { label: "Hot meal", use: { heal: 15 }, price: 5 },
    ale: { label: "Tankard of ale", use: { stamina: 1000 }, price: 2 },
    // The cures for what lingers after some creatures' blows (afflictions.js): each ends one
    ...Object.fromEntries(Object.entries(CURES).map(([id, { label, cure, price }]) => [id, { label, use: { cure }, price }])),
    // The wild's creatures' parts (spoils.js): what the adventurers' guild pays for each; some to
    // eat or drink
    ...Object.fromEntries(Object.entries(PARTS).map(([id, { label, worth, use, icon }]) => [id, { label, price: worth, part: true, ...(use ? { use } : {}), ...(icon === "meat" ? { food: true } : {}) }])),
});

/** The weapons a shield can be carried with (one-handed, up close). */
export const WITH_SHIELD = Object.freeze(["sword", "hammer"]);

/** What each shop sells: the things it keeps, and the best make it has of each. */
export const SHOPS = Object.freeze({
    smith: { items: ["sword", "hammer", "staff", "bow", "gauntlets", "boots", "gambeson", "mail", "roundShield", "kiteShield"], best: "masterwork" },
    tavern: { items: ["ale", "meal"], best: "common" },
    temple: { items: ["potion"], best: "common" },
    guild: { items: ["wand", "grimoire", "potion", ...Object.keys(CURES)], best: "fine" },
});

/** What sells for what (a share of its price), before haggling. */
export const SELL_SHARE = 0.4;

/** What each kind of foe has on them when they fall: gold ([least, most]), and things (each with its chance). */
export const LOOT = Object.freeze({
    orc: { gold: [5, 15], items: [{ id: "potion", chance: 0.3 }, { id: "gambeson", chance: 0.08 }, { id: "sword", quality: "fine", chance: 0.06 }] },
    soldier: { gold: [2, 8], items: [{ id: "potion", chance: 0.15 }, { id: "roundShield", chance: 0.05 }, { id: "mail", chance: 0.03 }, { id: "bow", quality: "fine", chance: 0.03 }] },
});

/**
 * How many slots a pack has. Each holds a stack of things alike (as many as there are: the same
 * kind, as well made), or nothing.
 */
export const PACK_SIZE = 20;

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

/** A wand's or grimoire's boost to spells, rolled (random.js random): a whole percent, 10 to 100. */
export function rollBoost(random) {
    const total = BOOSTS.reduce((sum, { weight }) => sum + weight, 0);
    let pick = random.next() * total;
    const { band } = BOOSTS.find(({ weight }) => (pick -= weight) < 0) ?? BOOSTS[0];

    return Math.round((band[0] + random.next() * (band[1] - band[0])) * 100) / 100;
}

/** How rare a boost is (BOOSTS: "common" to "very rare"). */
export const rarityOf = (boost) => (BOOSTS.find(({ band }) => boost < band[1]) ?? BOOSTS.at(-1)).rarity;

/** Whether two things are alike (the same kind, as well made, and as strong a boost): they go on one stack. */
export const alike = (a, b) => Boolean(a && b) && a.id === b.id && (a.quality ?? "common") === (b.quality ?? "common") && (a.boost ?? null) === (b.boost ?? null);

// A thing as it's kept: its kind, its make, and (a wand or grimoire) its boost
const thingOf = (item) => ({ id: item.id, quality: QUALITIES[item.quality] ? item.quality : "common", ...(ITEMS[item.id]?.magic ? { boost: boostOf(item) } : {}) });

// A wand's or grimoire's boost: as it is, or (one made before they had them) a common one
const boostOf = (item) => (Number.isFinite(item.boost) ? Math.max(0.1, Math.min(1, item.boost)) : STARTING_BOOST);

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

/** A piece of gear's name: "Fine sword"; a wand or grimoire with its boost: "Wand (+34% spells)". */
export function itemLabel({ id, quality = "common", boost = null }) {
    const { label, magic } = ITEMS[id] ?? { label: id };
    const made = QUALITIES[quality]?.label;
    const name = made ? `${made} ${label.toLowerCase()}` : label;

    return magic && boost ? `${name} (+${Math.round(boost * 100)}% spells)` : name;
}

/** What something costs (gold): its price by its make, less the haggling (or, sold, a share of it and more for haggling). */
export function priceOf({ id, quality = "common", boost = null }, { haggle = 0, selling = false } = {}) {
    // (A wand or grimoire worth the more the more it boosts spells: known once it's been made)
    const base = (ITEMS[id]?.price ?? 0) * (QUALITIES[quality]?.price ?? 1) * (ITEMS[id]?.magic && boost ? 1 + 4 * (boost - 0.1) : 1);

    // (A creature's part sells for what it's worth: its price is what the guild pays)
    const share = ITEMS[id]?.part ? 1 : SELL_SHARE;

    return Math.max(1, Math.round(selling ? base * share * (1 + haggle) : base * (1 - haggle)));
}

/** What a shop has for sale ([{ id, quality }]): each thing it keeps, common, and better made as far as it goes. */
export function wares(shop) {
    const { items, best } = SHOPS[shop] ?? { items: [], best: "common" };
    const makes = Object.keys(QUALITIES).slice(0, Object.keys(QUALITIES).indexOf(best) + 1);

    return items.flatMap((id) => (ITEMS[id].slot ? makes.map((quality) => ({ id, quality })) : [{ id, quality: "common" }]));
}

/** What a fallen foe of a kind has on them (random.js random): { gold, items }. */
export function rollLoot(kind, random) {
    const table = LOOT[kind];

    if (!table) {
        return { gold: 0, items: [] };
    }

    return {
        gold: random.int(...table.gold),
        items: table.items.filter(({ chance }) => random.chance(chance)).map(({ id, quality = "common" }) => ({ id, quality })),
    };
}

/** A player's skills, gold, pack and gear. */
export class Progress {
    /**
     * @param {object} [kept] - As toJSON gave it: { skills: { tree: xp }, gold, pack: [stacks], gear: { weapon, body, shield } }.
     * @param {object} [hero] - Their hero (for the weapon they started with).
     */
    constructor({ skills = {}, schools = null, spells = [], gold = 20, pack = [], gear = null } = {}, { weapon = "sword" } = {}) {
        this.skills = Object.fromEntries(Object.keys(TREES).map((tree) => [tree, Math.max(0, Number(skills[tree]) || 0)]));

        /**
         * Each school of magic's experience (core/spells.js SCHOOLS). (Kept from before there
         * were schools: the healing skill's, as Healing's)
         */
        const kept = schools ?? { healing: skills.healing ?? 0 };

        this.schools = Object.fromEntries(Object.keys(SCHOOLS).map((school) => [school, Math.max(0, Number(kept[school]) || 0)]));

        /** The spells learnt from tomes (spells.js SPELLS ids). */
        this.spells = [...new Set((Array.isArray(spells) ? spells : []).filter((id) => SPELLS[id]))];
        this.gold = Math.max(0, Math.floor(Number(gold) || 0));

        /** The pack's slots: each a stack of things alike ({ id, quality, count, and a wand's boost }), or null. */
        this.pack = packOf(pack);
        this.gear = { weapon: thingOf(gear?.weapon && ITEMS[gear.weapon.id] ? gear.weapon : { id: weapon }), body: gear?.body ?? null, shield: gear?.shield ?? null };
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
     * The spells they can cast (spells.js ids): each school's up to its tier; Stun (anyone can)
     * and Hold (once Hexes brings it); and those learnt from tomes.
     */
    known() {
        const schooled = Object.keys(SCHOOLS).flatMap((school) => SCHOOLS[school].tiers.slice(0, this.tierOf(school)));
        const hexes = ["stun", ...(this.abilities().includes("hold") ? ["hold"] : [])];

        return [...new Set([...schooled, ...hexes, ...this.spells])];
    }

    /** Whether they can cast a spell (a spells.js id). */
    knows(spell) {
        return this.known().includes(spell);
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

    /** Everything the trees and gear give: { melee, ranged, heal, stun, hp, stamina, armor, haggle, persuade, followers }. */
    bonuses() {
        const totals = { melee: 0, ranged: 0, heal: 0, stun: 0, spell: 0, hp: 0, stamina: 0, armor: 0, haggle: 0, persuade: 0, followers: 0 };

        for (const [tree, { bonus }] of Object.entries(TREES)) {
            const rank = this.rank(tree);

            for (const [key, values] of Object.entries(bonus)) {
                totals[key] += values[rank];
            }
        }

        // The gear's: a weapon's make, armour
        const made = QUALITIES[this.gear.weapon?.quality]?.power ?? 1;

        totals.melee = (1 + totals.melee) * made - 1;
        totals.ranged = (1 + totals.ranged) * made - 1;

        // (A wand or a grimoire in hand: spells as much stronger as its boost)
        if (ITEMS[this.gear.weapon?.id]?.magic) {
            totals.spell += boostOf(this.gear.weapon);
        }

        for (const piece of [this.gear.body, this.gear.shield]) {
            if (piece) {
                totals.armor += (ITEMS[piece.id].armor ?? 0) * (QUALITIES[piece.quality]?.power ?? 1);
            }
        }

        totals.armor = Math.min(0.6, totals.armor);

        return totals;
    }

    /** The abilities the trees have brought. */
    abilities() {
        return Object.entries(TREES).flatMap(([tree, { abilities }]) => Object.entries(abilities).filter(([rank]) => this.rank(tree) >= Number(rank)).map(([, ability]) => ability));
    }

    /**
     * How mighty they are (0 to 8), for the war to come on with: their best fighting rank (or
     * their command of others, as good), and their gear.
     */
    might() {
        const casting = ["fire", "earth", "air", "water"].map((school) => Math.floor(((this.tierOf(school) - 1) * 5) / 6));
        const fighting = Math.max(...Object.entries(TREES).filter(([, { fighting }]) => fighting).map(([tree]) => this.rank(tree)), ...casting);
        const command = this.rank("command");
        const gear = (QUALITIES[this.gear.weapon?.quality]?.might ?? 0) + [this.gear.body, this.gear.shield].reduce((sum, piece) => sum + (piece ? (ITEMS[piece.id].might ?? 0) * (QUALITIES[piece.quality]?.power ?? 1) : 0), 0);

        return Math.min(8, Math.floor(Math.max(fighting, command) + gear));
    }

    /** What they wear and carry that shows (their body armour, their shield: equipment ids). */
    worn() {
        return [this.gear.body, this.gear.shield].filter(Boolean).flatMap(({ id }) => ITEMS[id].equipment ?? []);
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
     * Put on (or take up) one of the pieces of gear in a slot of the pack: what it replaces goes
     * into the pack. Returns the reason it can't be, or null. (A shield only with a weapon it
     * goes with; no weapon ever given up for nothing; nothing put on without room for what comes
     * off.)
     */
    equip(index) {
        const stack = isSlot(index) ? this.pack[index] : null;
        const slot = stack && ITEMS[stack.id].slot;

        if (!slot) {
            return "item";
        }

        if (slot === "shield" && !WITH_SHIELD.includes(this.gear.weapon.id)) {
            return "shield";
        }

        // (A weapon that can't be carried with a shield: the shield's put away too)
        const shieldOff = slot === "weapon" && this.gear.shield && !WITH_SHIELD.includes(stack.id);
        const before = this.pack.map((each) => each && { ...each });
        const item = this.take(index, 1);
        const off = [this.gear[slot], shieldOff ? this.gear.shield : null].filter(Boolean);

        if (!off.every((piece) => this.stow(piece))) {
            this.pack = before;

            return "full";
        }

        this.gear[slot] = thingOf(item);

        if (shieldOff) {
            this.gear.shield = null;
        }

        return null;
    }

    /** Take off armour (a slot: body or shield), into the pack. Returns the reason it can't be, or null. */
    unequip(slot) {
        if (!["body", "shield"].includes(slot) || !this.gear[slot]) {
            return "item";
        }

        if (!this.stow(this.gear[slot])) {
            return "full";
        }

        this.gear[slot] = null;

        return null;
    }

    /** What's kept. */
    toJSON() {
        return { skills: { ...this.skills }, schools: { ...this.schools }, spells: [...this.spells], gold: this.gold, pack: this.pack.map((stack) => (stack ? { ...stack } : null)), gear: structuredClone(this.gear) };
    }
}

/** The weapon a player fights with (a WEAPONS key), from their gear. */
export const weaponOf = (progress) => (WEAPONS[progress.gear.weapon?.id] ? progress.gear.weapon.id : "sword");
