// The journal's bestiary (docs/GAME.md *The bestiary*): a page for each kind of creature the player
// has met, telling as much of it as they've found out (core/bestiary.js: its level), each level
// opening more of it:
// - Sighted: what it is (core/lore/bestiary.js), where it's met, and when;
// - Known: its ways (how it sets on whoever comes, how many go together), its home (the camps and
//   lairs it keeps to), the sign of it found on its trail, and how far out it's met;
// - Studied: how strong it is, what keeps harm off it, and how it fights;
// - Mastered: what it leaves, and the edge the player has on it.
// What's not yet found out is shown shut, with how to: watch for it, read its signs, slay it.
// Every word of it is the game's own (CREATURES, weapons.js, spoils.js): pageOf.

import { CAMP_FOLK, CREATURES, LAIRS, RITES, tierPower } from "../core/creatures.js";
import { DENS as BEAST_DENS } from "../core/dens.js";
import { MASTERED, RESEARCH, levelAt, payOf } from "../core/bestiary.js";
import { BESTIARY_LORE } from "../core/lore/bestiary.js";
import { AFFLICTIONS } from "../core/afflictions.js";
import { NATURAL, WEAPONS } from "../core/weapons.js";
import { SPOILS } from "../core/spoils.js";
import { itemLabel } from "../core/progress.js";

// Each land a creature's met in, in words
const LANDS = Object.freeze({
    farmland: "the farmland",
    meadow: "the meadows",
    woods: "the woods",
    heath: "the heaths",
    marsh: "the marshes",
    elfwood: "the elves' woods",
    darkwood: "the dark woods",
    savannah: "the savannah",
    jungle: "the jungle",
    badlands: "the badlands",
    volcanic: "the burning lands",
    tundra: "the tundra",
    snow: "the snows",
    mountain: "the mountains",
    beach: "the shores",
});

// Each people's wilds, in words
const WILDS = Object.freeze({ human: "the humans' wilds", elf: "the elves' wilds", darkElf: "the dark elves' wilds", cat: "the cat folk's wilds", lizard: "the lizard folk's wilds", orc: "the orcs' wilds" });

// Where the creatures met in no land of their own are (their `biomes` empty: the dungeons', the
// lairs', the hells', the Rift's, and those only met among others of theirs)
const PLACES = Object.freeze({
    banditChief: "at the head of the outlaws holding a cave, a ruin or a watchtower",
    goblinBomber: "among the goblins' raiding parties",
    goblinKing: "at the head of a goblin war band, and on the goblin caves' throne",
    dragon: "in the drake's lair",
    dreadthorn: "in the Dreadthorns' lairs",
    moonfang: "in the werewolves' dens",
    ghost: "in the ruins, the ruined castles and the graveyards",
    wraith: "in the ruins and the ruined castles",
    wightLord: "in the ruined castles",
    cultLeader: "at a hell's way in, by night",
    riftling: "at the Tower of Sar Mordal",
    riftStalker: "at the Tower of Sar Mordal",
    kaiju: "out of the Rift, against a town by night",
});

// The ants' nests' own, and the hells' (met nowhere else)
const NESTS = new Set(["ant", "greatCentipede", "dungeonSpider", "eliteDungeonSpider", "dungeonScorpion", "giantCockroach", "dungeonWasp", "blackWidow", "antMonster"]);
const HELLS = new Set(["flayling", "cinderHusk", "pyreAcolyte", "ossuaryPriest", "dirgeWarden", "flayedHierarch", "slagGorger", "forgeBrute", "chainedGlutton", "bloatGorger", "pitRavager", "gorgerWarlord", "demonLord", "fiend"]);

// The wild camps' holders, by faction (worldplan/races.js FACTIONS), and the lairs, in words
const CAMPS = Object.freeze({ bandits: "the bandits' camps", wolves: "the wolf packs' camps", goblins: "the goblins' camps", spiders: "the giant spiders' camps", undead: "the restless dead's camps", trolls: "the trolls' camps", raiders: "the raiders' camps", cultists: "the cultists' camps" });
const DENS = Object.freeze({ "dragon's lair": "the drake's lair", "dreadthorn's lair": "the Dreadthorns' lairs", "werewolf's den": "the werewolves' dens", "ruined castle": "the ruined castles", "rift tower": "the Tower of Sar Mordal", hell: "the hells' ways in, by night" });

// What each affliction a blow leaves does, in words
const LEAVES = Object.freeze({ poison: "poisons", venom: "envenoms", disease: "sickens", pox: "sickens", wither: "withers", burn: "sets alight", bleed: "lays a wound open", slow: "slows", fear: "terrifies" });

// A list in words: "a", "a and b", "a, b and c"
export function listed(words) {
    return words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

const capital = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);

// A share in words: "half", "a quarter", "a tenth", or a percentage
function shareOf(share) {
    const named = [[0.5, "half"], [0.25, "a quarter"], [0.75, "three quarters"], [0.1, "a tenth"], [1 / 3, "a third"], [0.2, "a fifth"]].find(([value]) => Math.abs(value - share) < 0.005);

    return named?.[1] ?? `${Math.round(share * 100)}%`;
}

// How often, from a chance
const often = (chance) => (chance >= 0.75 ? "nearly always" : chance >= 0.45 ? "often" : chance >= 0.2 ? "sometimes" : "now and then");

/** Where a kind's met, in words ("in the woods, the tundra and the heaths", "anywhere"...). */
export function whereOf(kind) {
    const spec = CREATURES[kind];

    if (PLACES[kind]) {
        return PLACES[kind];
    }

    if (NESTS.has(kind)) {
        return "in the ants' nests";
    }

    if (HELLS.has(kind)) {
        return "in the hells";
    }

    const lands = spec.biomes === null ? null : listed(spec.biomes.map((biome) => LANDS[biome] ?? biome));
    const camps = homesOf(kind);

    if (spec.people) {
        return lands ? `in ${lands} of ${WILDS[spec.people]}` : `anywhere in ${WILDS[spec.people]}`;
    }

    return lands ? `in ${lands}` : camps.length ? `in ${listed(camps)}` : "anywhere";
}

// More than one of a kind, in words: "two wyverns", "three dire wolves"
const NUMBERS = ["no", "a", "two", "three", "four", "five", "six", "seven", "eight"];
const many = (count, name) => `${NUMBERS[count] ?? count} ${count === 1 ? name : name.replace(/wolf$/, "wolve").replace(/([^s])$/, "$1s")}`;

/** Those who guard a kind's lair with it, in words ("two wyverns"), if it's a lair's master; or null. */
export function guardsOf(kind) {
    const lair = [...Object.values(LAIRS), ...Object.values(RITES)].find(({ master }) => master[0] === kind);

    if (!lair) {
        return null;
    }

    const counts = new Map();

    for (const [guard, count] of lair.guards) {
        counts.set(guard, (counts.get(guard) ?? 0) + count);
    }

    return listed([...counts].map(([guard, count]) => many(count, CREATURES[guard]?.name.toLowerCase() ?? guard)));
}

/** The homes a kind keeps to, in words: the camps, the dens (core/dens.js) and the lairs it holds or guards. */
export function homesOf(kind) {
    const homes = [];

    for (const [faction, folk] of Object.entries(CAMP_FOLK)) {
        if (folk.some(([creature]) => creature === kind)) {
            homes.push(CAMPS[faction] ?? `${faction}' camps`);
        }
    }

    for (const { creature, all } of Object.values(BEAST_DENS)) {
        if (creature === kind) {
            homes.push(all);
        }
    }

    for (const [site, lair] of [...Object.entries(LAIRS), ...Object.entries(RITES)]) {
        if (lair.master[0] === kind || lair.guards.some(([creature]) => creature === kind)) {
            homes.push(DENS[site] ?? site);
        }
    }

    return [...new Set(homes)];
}

// Its ways: how it sets on whoever comes, and how many go together
function waysOf(kind) {
    const spec = CREATURES[kind];
    const [least, most] = spec.pack;
    const lines = [];

    const guards = guardsOf(kind);

    lines.push(spec.temper === "aggressive" ? "Sets on whoever it sees." : spec.temper === "territorial" ? `Keeps its ground, and sets on whoever comes within ${spec.guard ?? 0} m of it.` : "Fights only once it's struck.");
    lines.push(guards ? `Guarded by ${guards}.` : PLACES[kind] ? null : most <= 1 ? "Goes alone." : `Goes ${least === most ? `${least}` : `${least} to ${most}`} together.`);

    if (spec.band) {
        lines.push(`Among them, now and then: ${listed(Object.keys(spec.band).map((member) => CREATURES[member]?.name.toLowerCase() ?? member))}.`);
    }

    if (spec.elite) {
        lines.push(`At the head of the strongest of them: the ${CREATURES[spec.elite]?.name ?? spec.elite}.`);
    }

    if (spec.night) {
        lines.push(spec.night === "only" ? "Out only by night." : "Out more by night.");
    }

    return lines.filter(Boolean);
}

// One of its attacks, in words: "Bite: 2 to 4 (lays a wound open now and then)"
function attackOf(attack) {
    if (attack.either) {
        return attack.either.map(attackOf).join("; or ");
    }

    const [least, most] = attack.damage ?? [0, 0];
    const name = capital(String(attack.id ?? attack.kind).replace(/([A-Z])/g, " $1").toLowerCase());
    const more = [
        attack.kind === "ranged" && attack.reach ? `from up to ${attack.reach} m` : null,
        attack.afflict ? `${often(attack.afflict.chance ?? 1)} ${LEAVES[attack.afflict.kind] ?? AFFLICTIONS[attack.afflict.kind]?.label.toLowerCase() ?? attack.afflict.kind}` : null,
        attack.knockdown ? "knocks down" : null,
        attack.drain ? "heals it" : null,
        attack.bomb ? "bursts as a bomb" : null,
    ].filter(Boolean);

    return `${name}: ${least === most ? least : `${least} to ${most}`}${more.length ? ` (${more.join(", ")})` : ""}`;
}

// How strong it is, what keeps harm off it, and how it fights
function fightOf(kind) {
    const spec = CREATURES[kind];
    const [least, most] = spec.tiers;
    const hp = (tier) => Math.round(spec.hp * tierPower(tier));
    const weapon = NATURAL[spec.weapon] ?? WEAPONS[spec.weapon];
    const lines = [least === most ? `${hp(least)} hit points.` : `${hp(least)} hit points at level ${least}, ${hp(most)} at level ${most}.`];

    if (spec.armor) {
        lines.push(`Turns ${shareOf(spec.armor)} of every blow.`);
    }

    for (const [element, share] of Object.entries(spec.wards ?? {})) {
        lines.push(`Keeps ${shareOf(share)} of ${element === "magic" ? "magic's" : `${element}'s`} harm off itself.`);
    }

    if (spec.steady) {
        lines.push("Never thrown by a blast.");
    }

    if (spec.darkSight) {
        lines.push("Sees in the dark.");
    }

    if (spec.hover) {
        lines.push("Takes to the air when it's badly hurt, out of reach of blows.");
    }

    if (spec.call) {
        lines.push(`Calls more of its kind to it as it fights: ${CREATURES[spec.call.kind]?.name.toLowerCase() ?? spec.call.kind}.`);
    }

    if (spec.burst) {
        lines.push("Bursts where it falls dead: step away.");
    }

    if (spec.bomb) {
        lines.push("Lobs a bomb at whoever keeps off.");
    }

    if (spec.keep) {
        lines.push(`Keeps ${spec.keep} m off whoever it's after.`);
    }

    lines.push(...(weapon?.attacks ?? []).map(attackOf));

    return lines;
}

// What it leaves
function spoilsOf(kind) {
    const spoils = SPOILS[kind];
    const lines = (spoils?.items ?? []).map(({ id, chance, count }) => `${capital(often(chance))}: ${itemLabel({ id })}${count && count[1] > 1 ? ` (${count[0]} to ${count[1]})` : ""}.`);

    if (spoils?.gold) {
        lines.push("Gold, in its purse.");
    }

    return lines.length ? lines : ["Nothing worth taking."];
}

/**
 * A kind's page, as far as `entry` (Bestiary entry: { points, seen, signs, slain }) has it: {
 * kind, name, level (0 to `levels`, MASTERED), title (its level's name), next (the next level's
 * name, or null at the last), points, from and to (the points its level and the next take: to
 * null at the last), counts (a line: how many seen, read, slain), sections: [{ heading, level
 * (the level it opens at), open, lines (or, shut, how to open it) }] }.
 */
export function pageOf(kind, entry = {}) {
    const spec = CREATURES[kind];
    const lore = BESTIARY_LORE[kind];
    const points = entry.points ?? 0;
    const level = levelAt(points);
    const homes = homesOf(kind);
    const [least, most] = spec.tiers;
    const pay = payOf(kind);
    const sections = [
        { heading: "What it is", level: 1, lines: [lore?.lore ?? "", `Met ${whereOf(kind)}.`] },
        { heading: "Its ways", level: 2, lines: [...waysOf(kind), ...(homes.length ? [`Keeps to ${listed(homes)}.`] : []), ...(lore?.sign ? [`On its trail: ${lore.sign}.`] : []), least === most ? `Met at level ${least}.` : `Met from level ${least} to ${most}.`] },
        { heading: "How it fights", level: 3, lines: fightOf(kind) },
        { heading: "What it leaves", level: MASTERED, lines: [...spoilsOf(kind), `You know where to strike it: ${Math.round((RESEARCH.edge - 1) * 100)}% harder.`, `The adventurers' guilds pay ${pay.gold} gold for your notes on it.`] },
    ];

    return {
        kind,
        name: spec.name,
        level,
        levels: MASTERED,
        title: RESEARCH.levels[level - 1]?.name ?? "Unknown",
        next: RESEARCH.levels[level]?.name ?? null,
        points,
        from: RESEARCH.levels[level - 1]?.points ?? 0,
        to: RESEARCH.levels[level]?.points ?? null,
        counts: [entry.seen ? "Seen" : null, entry.signs ? `${entry.signs} ${entry.signs === 1 ? "sign" : "signs"} read` : null, entry.slain ? `${entry.slain} slain` : null].filter(Boolean).join(" · "),
        sections: sections.map((section) => ({ ...section, open: level >= section.level, lines: level >= section.level ? section.lines.filter(Boolean) : [`At ${RESEARCH.levels[section.level - 1].name}: watch for it, read the signs it leaves, and slay it to learn more.`] })),
    };
}

/**
 * Where each kind met falls in the bestiary: the wilds anywhere, each people's wilds, the camps and
 * lairs' masters, the ants' nests, the hells (a heading for each, in that order).
 */
export function groupOf(kind) {
    const spec = CREATURES[kind];

    if (NESTS.has(kind)) {
        return "The ants' nests";
    }

    if (HELLS.has(kind) || kind === "cultLeader") {
        return "The hells";
    }

    if (spec.perilous || PLACES[kind]) {
        return "Lairs and strongholds";
    }

    return spec.people ? capital(WILDS[spec.people]) : "The wilds";
}

/** The bestiary's contents: every kind met ({ kind, name, level, title, group }), by group, then the most known first, then by name. */
export function contentsOf(kinds) {
    const order = ["The wilds", ...Object.values(WILDS).map(capital), "Lairs and strongholds", "The ants' nests", "The hells"];

    return Object.entries(kinds)
        .filter(([kind]) => CREATURES[kind])
        .map(([kind, entry]) => {
            const level = levelAt(entry.points ?? 0);

            return { kind, name: CREATURES[kind].name, level, title: RESEARCH.levels[level - 1]?.name ?? "Unknown", group: groupOf(kind) };
        })
        .filter(({ level }) => level > 0)
        .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.level - a.level || a.name.localeCompare(b.name));
}

/**
 * The bestiary as the journal shows it (app/journal.js), from what's been found out about each kind
 * (`kinds`: Bestiary's): { met (contentsOf), of (how many kinds there are), levels, pageOf(kind) }.
 */
export function bestiaryOf(kinds) {
    return { met: contentsOf(kinds), of: Object.keys(CREATURES).length, levels: MASTERED, pageOf: (kind) => (kinds[kind] && CREATURES[kind] ? pageOf(kind, kinds[kind]) : null) };
}
