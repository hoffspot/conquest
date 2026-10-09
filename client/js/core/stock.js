// What the specialist shops and the master shops have in today (docs/WAR.md *Shops*): each day a
// new assortment of the things they deal in, so many of each, and a daily special, the rarest and
// dearest thing they'll have; worked out from the world's seed, the shop and the day, so that
// everyone who plays together sees the same (core/host.js keeps what's been sold of it).
//
// And how a thing's made as it's bought (what's rolled on gear, a wand's boost), and what a shop
// asks for it.
//
// Pure data and arithmetic, no DOM.

import { rollGear, UNIFORM_PEOPLES } from "./gear.js";
import { comesInMakes, gradeOf, ITEMS, priceOf, rollBoost, SHOPS } from "./progress.js";
import { createRandom } from "./random.js";

/** How much more a shop's daily special costs than the same thing on its shelves. */
export const SPECIAL_MARKUP = 1.25;

/**
 * Which shop's stock someone keeps (`id`: theirs, as host.js has them): the building they keep it
 * in ("…/smith" and "…/apprentice" keep the same), or their own.
 */
export const stockKey = (id) => (typeof id === "string" && id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : String(id));

/** A thing in a shop's stock, as a key ("sword|rare"). */
export const wareKey = ({ id, quality = "common" }) => `${id}|${quality}`;

// A whole number for a world's seed, a shop and a day (FNV-1a, then stirred well: murmur3's
// finish, so that one day's is nothing like the next's)
function mix(seed, key, day) {
    let sum = 2166136261 ^ (seed >>> 0);

    for (const char of `${key}#${day}`) {
        sum = Math.imul(sum ^ char.charCodeAt(0), 16777619) >>> 0;
    }

    sum = Math.imul(sum ^ (sum >>> 16), 0x85ebca6b);
    sum = Math.imul(sum ^ (sum >>> 13), 0xc2b2ae35);

    return (sum ^ (sum >>> 16)) >>> 0;
}

/**
 * A thing made (random.js random): gear with what's rolled on it (core/gear.js), its people's for
 * a uniform's piece; a wand or a grimoire with its boost; anything else as it is.
 */
export function madeOf({ id, quality = "common", people = null }, random) {
    const made = ITEMS[id]?.slot ? rollGear(id, quality, random, { people }) : { id, quality };

    return ITEMS[id]?.magic ? { ...made, boost: rollBoost(random) } : made;
}

// What a shop could have in, by the makes (or how rare they are) it weighs: [{ id, quality, weight }]
function choicesOf(items, grades) {
    return items.flatMap((id) => {
        if (comesInMakes(id)) {
            return Object.entries(grades).map(([quality, weight]) => ({ id, quality, weight }));
        }

        const weight = grades[gradeOf({ id })] ?? 0;

        return weight ? [{ id, quality: "common", weight }] : [];
    });
}

/**
 * What a shop with a daily stock (progress.js SHOPS `daily`) has in on a day (`day`: core/
 * daytime.js dayOf) of a world (`seed`), the shop being the one kept at `key` (stockKey) by
 * `people`: { wares: [{ id, quality, count, people? }] (each so many), special: the thing it is,
 * made (madeOf: what's rolled on it already) }; or null, for a shop without one. The same for
 * the same world, shop and day; another assortment the next.
 */
export function dailyStock(shop, { seed = 1, key = "", day = 0, people = "human" } = {}) {
    const daily = SHOPS[shop]?.daily;

    if (!daily) {
        return null;
    }

    const random = createRandom(mix(seed, key, day));
    const maker = UNIFORM_PEOPLES.includes(people) ? people : "human";
    const whose = (id) => (ITEMS[id]?.uniform ? { people: maker } : {});
    const choices = choicesOf(SHOPS[shop].items, daily.grades);
    const wares = [];

    // Its shelves: what it always has (a swordsmith's swords) and so many different things more
    // (a piece of gear in two makes, at most), each so many of
    while (wares.length < daily.picks) {
        const always = daily.always?.find((id) => !wares.some((ware) => ware.id === id));
        const left = choices.filter((choice) => (!always || choice.id === always) && !wares.some((ware) => wareKey(ware) === wareKey(choice)) && wares.filter((ware) => ware.id === choice.id).length < 2);

        if (!left.length) {
            break;
        }

        const { id, quality } = random.pickWeighted(left, ({ weight }) => weight);

        wares.push({ id, quality, count: random.int(...daily.count), ...whose(id) });
    }

    // Its special: one thing, of the rarest, the more likely the more it's worth
    const specials = choicesOf(SHOPS[shop].items, daily.special);
    const pick = specials.length ? random.pickWeighted(specials, ({ id, weight }) => weight * (ITEMS[id]?.price ?? 1)) : null;
    const special = pick && madeOf({ id: pick.id, quality: pick.quality, people: ITEMS[pick.id]?.uniform ? maker : null }, random);

    return { wares, special };
}

/**
 * What a shop asks for something (gold): its price (progress.js priceOf, less the buyer's
 * haggling), more at a master's shop (its `markup`), and more again as its daily special.
 */
export function shopPrice(item, shop, { haggle = 0, special = false } = {}) {
    const markup = (SHOPS[shop]?.markup ?? 1) * (special ? SPECIAL_MARKUP : 1);

    return Math.max(1, Math.round(priceOf(item, { haggle }) * markup));
}
