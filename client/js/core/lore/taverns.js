// Taverns' names, and the pictures on their signs: every tavern in the world named from its
// place's seed, the name and the sign going together (The Prancing Stag has a stag on its sign,
// The Three Bells three bells), in the ways old inns were named:
//
// - The (adjective) (thing): The Golden Crown, The Drunken Boar, The Rusty Anchor;
// - The (thing) and (thing): The Rose and Crown, The Fox and Hounds;
// - The (creature)'s Head: The Boar's Head, The Stag's Head;
// - The (number) (things): The Three Bells, The Seven Stars;
//
// and a house of pleasure's name is its own: The Velvet Garter, The Rosy Cheek.
//
// What's upstairs goes with the name: rooms to let at an inn, some of them let by the hour at
// most, and a whole house of courtesans at a few.

/**
 * The pictures a sign can have (signs.js paints each). Each has what it's called in a name, its
 * plural, and whether it's a creature (for "the ...'s Head").
 */
export const EMBLEMS = Object.freeze({
    boar: { word: "Boar", many: "Boars", creature: true },
    stag: { word: "Stag", many: "Stags", creature: true },
    fox: { word: "Fox", many: "Foxes", creature: true },
    swan: { word: "Swan", many: "Swans", creature: true },
    cockerel: { word: "Cockerel", many: "Cockerels", creature: true },
    dragon: { word: "Dragon", many: "Dragons", creature: true },
    crown: { word: "Crown", many: "Crowns" },
    moon: { word: "Moon", many: "Moons" },
    sun: { word: "Sun", many: "Suns" },
    star: { word: "Star", many: "Stars" },
    keys: { word: "Keys", many: "Keys" },
    bell: { word: "Bell", many: "Bells" },
    anchor: { word: "Anchor", many: "Anchors" },
    tankard: { word: "Tankard", many: "Tankards" },
    barrel: { word: "Barrel", many: "Barrels" },
    horseshoe: { word: "Horseshoe", many: "Horseshoes" },
    sword: { word: "Sword", many: "Swords" },
    ship: { word: "Ship", many: "Ships" },
    rose: { word: "Rose", many: "Roses" },
    oak: { word: "Oak", many: "Oaks" },
    lantern: { word: "Lantern", many: "Lanterns" },
    harp: { word: "Harp", many: "Harps" },
});

const ADJECTIVES = ["Golden", "Silver", "Drunken", "Laughing", "Prancing", "Sleeping", "Crooked", "Rusty", "Jolly", "Red", "Black", "White", "Green", "Merry", "Wandering", "Hungry", "Lucky", "Old", "Blue", "Gilded", "Leaping", "Grinning"];

// Which adjectives suit which pictures (a creature can prance, a crown can't)
const MOVING = new Set(["Drunken", "Laughing", "Prancing", "Sleeping", "Wandering", "Hungry", "Leaping", "Grinning", "Jolly", "Merry"]);

// Pairs as old inns had them (the first thing's the sign's)
const PAIRS = [["rose", "Crown"], ["fox", "Hounds"], ["crown", "Anchor"], ["tankard", "Pipe"], ["barrel", "Bung"], ["ship", "Anchor"], ["moon", "Stars"], ["sword", "Shield"], ["stag", "Hounds"], ["keys", "Lantern"], ["swan", "Rushes"], ["oak", "Acorn"], ["harp", "Fiddle"], ["bell", "Lantern"], ["cockerel", "Hen"], ["dragon", "Knight"]];

const NUMBERS = [["Two", 2], ["Three", 3], ["Four", 4], ["Five", 5], ["Seven", 7], ["Nine", 9]];

// Houses of pleasure's names, and the pictures on their signs
const HOUSES = [["The Velvet Garter", "rose"], ["The Rosy Cheek", "rose"], ["The Tipsy Maiden", "tankard"], ["The Silken Sheets", "moon"], ["The Wench and Barrel", "barrel"], ["The Scarlet Lantern", "lantern"], ["The Painted Swan", "swan"], ["The Merry Widow", "harp"], ["The Honeyed Rose", "rose"], ["The Midnight Moon", "moon"]];

/**
 * What's upstairs in a tavern: rooms to let (an inn), rooms to let with some let by the hour
 * (a courtesan or two), or a whole house of courtesans.
 */
export const UPSTAIRS = Object.freeze({ inn: "inn", mixed: "mixed", bordello: "bordello" });

/**
 * A tavern's name and sign, and what's upstairs, from a random of its own: { name, emblem (an
 * EMBLEMS key), count (how many of it the name says there are: the sign shows them), upstairs (UPSTAIRS: null for none, one
 * storey), storeys }. `storeys` is how many it has (a bordello has two, a village tavern may
 * have one); `taken` the names already used nearby, not to be used again.
 */
export function nameTavern(random, { storeys = 2, taken = new Set() } = {}) {
    const upstairs = storeys < 2 ? null : random.pickWeighted([[UPSTAIRS.inn, 5], [UPSTAIRS.mixed, 3], [UPSTAIRS.bordello, 2]], ([, weight]) => weight)[0];

    for (let tries = 0; tries < 40; tries++) {
        const named = upstairs === UPSTAIRS.bordello && random.chance(0.7) ? house(random) : ordinary(random);

        if (!taken.has(named.name)) {
            return { ...named, upstairs, storeys };
        }
    }

    const fallback = ordinary(random);

    return { ...fallback, name: `${fallback.name} ${random.int(2, 9)}`, upstairs, storeys };
}

function house(random) {
    const [name, emblem] = random.pick(HOUSES);

    return { name, emblem, count: 1 };
}

function ordinary(random) {
    const emblems = Object.keys(EMBLEMS);
    const way = random.pickWeighted([["adjective", 6], ["pair", 3], ["head", 2], ["number", 2]], ([, weight]) => weight)[0];

    if (way === "pair") {
        const [emblem, other] = random.pick(PAIRS);

        return { name: `The ${EMBLEMS[emblem].word} and ${other}`, emblem, count: 1 };
    }

    if (way === "head") {
        const emblem = random.pick(emblems.filter((id) => EMBLEMS[id].creature));

        return { name: `The ${EMBLEMS[emblem].word}'s Head`, emblem, count: 1 };
    }

    if (way === "number") {
        const emblem = random.pick(emblems.filter((id) => id !== "keys"));
        const [number, count] = random.pick(NUMBERS);

        return { name: `The ${number} ${EMBLEMS[emblem].many}`, emblem, count };
    }

    const emblem = random.pick(emblems);
    const adjectives = ADJECTIVES.filter((word) => EMBLEMS[emblem].creature || !MOVING.has(word));

    return { name: `The ${random.pick(adjectives)} ${EMBLEMS[emblem].word}`, emblem, count: 1 };
}
