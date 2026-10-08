// A line of battle (docs/WAR.md *Lines of battle*): an army's soldiers each in a place of their own
// by what they fight with, the way armies have stood since the Greeks (the research behind it is
// in the docs): a shield wall in front, two-handers behind its ends to plug its gaps and fall on
// the enemy's flanks, archers either side of the casters behind them, the healers behind them in
// reach of the line, and a few shields facing the rear.
//
// The places are worked out here (placesOf), and the battle keeps each soldier to its own as its
// formation moves (battle.js `formation`); every number in metres. Pure data and arithmetic.

import { cos, sin } from "./exact.js";

/**
 * Each role in a line of battle: how far from its place it goes after an enemy (`leash`: the
 * shield line and the two-handers go out to meet them; the archers and casters stand and shoot
 * as far as they reach; the healers keep back).
 */
export const ROLES = Object.freeze({
    front: Object.freeze({ label: "Shield line", leash: 10 }),
    heavy: Object.freeze({ label: "Two-handers", leash: 12 }),
    archer: Object.freeze({ label: "Archers", leash: 15 }),
    caster: Object.freeze({ label: "Casters", leash: 16 }),
    healer: Object.freeze({ label: "Healers", leash: 5 }),
});

// What each weapon makes its soldier in a line (weapons.js): a sword or cleaver and its shield the
// line; whatever's held in both hands up close the two-handers; the bow the archers; the wand and
// the grimoire the casters
const BY_WEAPON = Object.freeze({ sword: "front", cleaver: "front", hammer: "heavy", greatsword: "heavy", axe: "heavy", staff: "heavy", gauntlets: "heavy", bow: "archer", wand: "caster", grimoire: "caster" });

/** A soldier's role in a line of battle by its weapon, or a healer's (`heals`: one carrying a staff to heal with). */
export function roleOf(weapon, { heals = false } = {}) {
    return heals ? "healer" : (BY_WEAPON[weapon] ?? "front");
}

/**
 * The share of each role in an army (the research behind it in docs/WAR.md *Lines of battle*): a
 * shield line two fifths of it, a quarter archers, the two-handers, casters and healers the rest.
 */
export const MIX = Object.freeze({ front: 0.4, heavy: 0.15, archer: 0.25, caster: 0.1, healer: 0.1 });

/**
 * Each people's own lean in its armies (docs/WAR.md *Lines of battle*), MIX's shares shifted, every
 * one at least half up close, a fifth to a third archers, no more than an eighth casters or
 * healers: the humans as MIX (every arm in its place); the elves the bow; the dark elves magic;
 * the cats and the orcs the two-handers' shock, the orcs fewest casting or healing; the lizards
 * a deep, stubborn shield line, healed the most.
 */
export const DOCTRINES = Object.freeze({
    human: MIX,
    elf: Object.freeze({ front: 0.38, heavy: 0.12, archer: 0.32, caster: 0.09, healer: 0.09 }),
    darkElf: Object.freeze({ front: 0.38, heavy: 0.15, archer: 0.22, caster: 0.13, healer: 0.12 }),
    cat: Object.freeze({ front: 0.35, heavy: 0.25, archer: 0.22, caster: 0.09, healer: 0.09 }),
    lizard: Object.freeze({ front: 0.45, heavy: 0.15, archer: 0.2, caster: 0.08, healer: 0.12 }),
    orc: Object.freeze({ front: 0.4, heavy: 0.25, archer: 0.2, caster: 0.08, healer: 0.07 }),
});

/**
 * An army of `size`'s roles, as near `mix`'s shares as whole soldiers go (the largest remainders
 * rounded up; the shield line first among any as near): the shield line first, then the
 * two-handers, archers, casters and healers.
 */
export function rolesOf(size, mix = MIX) {
    const roles = Object.keys(mix);
    const counts = roles.map((role) => Math.floor(size * mix[role]));
    const left = size - counts.reduce((sum, count) => sum + count, 0);

    roles
        .map((role, k) => [size * mix[role] - counts[k], -k, k])
        .sort((a, b) => b[0] - a[0] || b[1] - a[1])
        .slice(0, left)
        .forEach(([, , k]) => counts[k]++);

    return roles.flatMap((role, k) => new Array(counts[k]).fill(role));
}

/**
 * How a line's laid out: its files `apart` and its ranks `rank` apart; the shield line `width`
 * files wide at most (and at least), in two ranks once it's `deep` strong; a share of it (`rear`,
 * once it's that strong) kept back facing the rear; the two-handers in blocks `block` files wide.
 */
export const FORMATION = Object.freeze({ apart: 1.6, rank: 1.8, width: Object.freeze([4, 24]), deep: 8, rear: 0.12, block: 3 });

/**
 * Each soldier's place in a line of battle, in the order given (`roles`: each one's, ROLES'
 * keys): [right, back], metres to the right of the middle of its front rank and behind it,
 * facing the way it faces. Every place its own; whoever's foremost in the front rank (the shield
 * line, or, with none, the two-handers, or the archers and casters).
 */
export function placesOf(roles) {
    const { apart, rank, width, deep, rear, block } = FORMATION;
    const by = { front: [], heavy: [], archer: [], caster: [], healer: [] };
    const places = new Array(roles.length);

    roles.forEach((role, k) => (by[role] ?? by.front).push(k));

    // (A row of so many, `across` apart, centred, so far back)
    const row = (ids, back, across = apart, offset = 0) => ids.forEach((id, k) => (places[id] = [offset + (k - (ids.length - 1) / 2) * across, back]));

    // The shield line: a rank, or two once it's strong; its rear guard put by
    const guards = by.front.length >= deep ? Math.round(by.front.length * rear) : 0;
    const line = by.front.slice(0, by.front.length - guards);
    const files = Math.max(1, Math.min(width[1], Math.max(Math.min(width[0], line.length), line.length >= deep ? Math.ceil(line.length / 2) : line.length)));
    const lineRanks = Math.ceil(line.length / files);

    for (let r = 0; r < lineRanks; r++) {
        row(line.slice(r * files, (r + 1) * files), r * rank);
    }

    // The two-handers: two blocks, behind the outer thirds of the line
    const half = (Math.max(files, block * 2) - 1) * apart * 0.5;
    const blocks = [by.heavy.filter((_, k) => k % 2 === 0), by.heavy.filter((_, k) => k % 2 === 1)];
    let heavyRanks = 0;

    blocks.forEach((ids, side) => {
        const across = Math.min(block, ids.length);
        const centre = (side === 0 ? -1 : 1) * half * (2 / 3);

        for (let r = 0; r * across < ids.length; r++) {
            row(ids.slice(r * across, (r + 1) * across), (lineRanks + r) * rank, apart, centre);
            heavyRanks = Math.max(heavyRanks, r + 1);
        }
    });

    // Behind them, the casters in the middle and the archers either side of them, then the rest of
    // the archers behind, rows as wide as the line and a file more each side
    const shootingFiles = Math.max(files + 2, 4);
    const archers = [...by.archer];
    const rows = [];

    for (let k = 0; k < by.caster.length; k += shootingFiles) {
        rows.push(by.caster.slice(k, k + shootingFiles));
    }

    for (const each of rows.length ? rows : [(rows[0] = [])]) {
        for (let k = 0; each.length < shootingFiles && archers.length; k++) {
            k % 2 === 0 ? each.push(archers.shift()) : each.unshift(archers.shift());
        }
    }

    while (archers.length) {
        rows.push(archers.splice(0, shootingFiles));
    }

    let back = (lineRanks + heavyRanks + 0.5) * rank;

    for (const each of rows.filter((ids) => ids.length)) {
        row(each, back);
        back += rank;
    }

    // The healers behind them, spread out; then the rear guard, wider still
    back += rank * 0.5;
    row(by.healer, back, apart * 2);
    back += by.healer.length ? rank * 1.2 : 0;
    row(by.front.slice(line.length), back, apart * 2);

    // (Whoever's foremost in the front rank)
    const front = places.reduce((least, [, back]) => Math.min(least, back), Infinity);

    return places.map(([right, back]) => [right, back - front]);
}

/**
 * Where a place in a formation is, in the world: from its formation's `anchor` ([x, y], the
 * middle of its front rank) and `facing` (radians from south, towards east), its place
 * ([right, back]: placesOf; to its right as it faces, and behind).
 */
export function placeAt({ anchor, facing }, [right, back]) {
    const [ax, ay] = [sin(facing), cos(facing)];

    return [anchor[0] - ay * right - ax * back, anchor[1] + ax * right - ay * back];
}
