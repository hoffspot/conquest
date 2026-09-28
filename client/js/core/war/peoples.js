// The peoples at war (docs/WAR.md): each people's temperament, and its rulers, rolled for each
// world.
//
// Each people has a core temperament (orcs warlike, elves slow to anger and slow to forget...),
// but its leader's traits are rolled a little either side of it in every world, so no people
// plays the same way twice. What the leader is like is told in rumours (describeLeader).
//
// Every trait is from 0 to 1:
//  - aggression: how ready to go to war, and to throw forces at the enemy;
//  - greed: how keen to take land, and to tax it;
//  - loyalty: how faithful to allies, and how slow to break with them;
//  - grudge: how deeply a wrong is felt, and how long it's remembered;
//  - caution: how ready to make peace when a war goes badly.

import { RACES } from "../worldplan/races.js";

export const TRAITS = Object.freeze(["aggression", "greed", "loyalty", "grudge", "caution"]);

/** Each people's colour: their banners, and how they're shown on the maps. */
export const COLOURS = Object.freeze({ human: "#f0c96a", elf: "#7fe6a2", darkElf: "#b98fff", cat: "#ffb35c", lizard: "#4fd8c8", orc: "#ff6b5c" });

/** What's said of one of a people ("an orcish guard"). */
export const ADJECTIVES = Object.freeze({ human: "human", elf: "elven", darkElf: "dark elven", cat: "cat-folk", lizard: "lizard-folk", orc: "orcish" });

/** Each people's core temperament, and how far either side of it a leader's traits are rolled. */
export const TEMPERAMENTS = Object.freeze({
    human: { aggression: 0.5, greed: 0.5, loyalty: 0.6, grudge: 0.45, caution: 0.55, spread: 0.25, nature: "steady" },
    elf: { aggression: 0.3, greed: 0.3, loyalty: 0.7, grudge: 0.75, caution: 0.6, spread: 0.2, nature: "aloof" },
    darkElf: { aggression: 0.6, greed: 0.65, loyalty: 0.3, grudge: 0.8, caution: 0.4, spread: 0.25, nature: "scheming" },
    cat: { aggression: 0.5, greed: 0.7, loyalty: 0.45, grudge: 0.35, caution: 0.45, spread: 0.3, nature: "proud" },
    lizard: { aggression: 0.4, greed: 0.4, loyalty: 0.6, grudge: 0.6, caution: 0.7, spread: 0.25, nature: "patient" },
    orc: { aggression: 0.8, greed: 0.6, loyalty: 0.5, grudge: 0.5, caution: 0.2, spread: 0.2, nature: "warlike" },
});

/**
 * What each people calls its realm, its ruler (a man's title, a woman's), and how its people's
 * given names end (their beginnings are those of its places: races.js names).
 */
export const REALMS = Object.freeze({
    human: { realm: "Kingdom", titles: ["King", "Queen"], endings: ["ric", "win", "mund", "bert", "wyn", "ild", "helm", "a"] },
    elf: { realm: "Court", titles: ["High Lord", "High Lady"], endings: ["ion", "iel", "dor", "wen", "las", "ith", "ael"] },
    darkElf: { realm: "Dominion", titles: ["Archon", "Archon"], endings: ["ra", "zza", "ryn", "dril", "vek", "thra", "ss"] },
    cat: { realm: "Prides", titles: ["Khan", "Khatun"], endings: ["ra", "sha", "hir", "kan", "ri", "zar", "mau"] },
    lizard: { realm: "Covenant", titles: ["Great Speaker", "Great Speaker"], endings: ["ssk", "zul", "ix", "tl", "ath", "oq", "ish"] },
    orc: { realm: "Horde", titles: ["Warchief", "Warchief"], endings: ["gash", "rok", "nak", "zug", "gul", "mak", "ush"] },
});

// A leader's given name, from their people's sounds
function nameOf(race, random) {
    const name = random.pick(race.names.starts) + random.pick(REALMS[race.id].endings);

    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/**
 * A new leader for a people (a RACES id): { name, title, woman, traits } with each trait rolled
 * about the people's temperament. `random` is the war's (random.js).
 */
export function rollLeader(raceId, random) {
    const race = RACES.find(({ id }) => id === raceId);
    const temperament = TEMPERAMENTS[raceId];
    const woman = random.chance(0.5);
    const traits = Object.fromEntries(TRAITS.map((trait) => [trait, Math.round(Math.min(1, Math.max(0, temperament[trait] + random.range(-temperament.spread, temperament.spread))) * 100) / 100]));

    return { name: nameOf(race, random), title: REALMS[raceId].titles[woman ? 1 : 0], woman, traits };
}

// What's said of a leader for each trait, when it's marked (low, high)
const SAYINGS = Object.freeze({
    aggression: ["slow to take up arms", "spoiling for a fight"],
    greed: ["content with what they have", "hungry for land and gold"],
    loyalty: ["fickle with their friends", "true to their allies"],
    grudge: ["quick to forgive", "never forgets a wrong"],
    caution: ["reckless", "wary, and quick to sue for peace"],
});

/**
 * What's said of a leader (their marked traits, the most marked first): [{ trait, high, saying }],
 * for rumours (and the war viewer). A trait near their people's usual isn't worth saying.
 */
export function describeLeader(leader, raceId) {
    const temperament = TEMPERAMENTS[raceId];

    return TRAITS.map((trait) => {
        const value = leader.traits[trait];
        const high = value >= 0.5;

        return { trait, high, value, marked: Math.abs(value - 0.5) + Math.abs(value - temperament[trait]) * 0.5, saying: SAYINGS[trait][high ? 1 : 0] };
    })
        .filter(({ value }) => Math.abs(value - 0.5) >= 0.2)
        .sort((a, b) => b.marked - a.marked)
        .map(({ trait, high, saying }) => ({ trait, high, saying }));
}
