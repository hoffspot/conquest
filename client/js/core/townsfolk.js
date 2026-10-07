// The townsfolk out about their business (docs/GAME.md *Townsfolk*): in the streets of every
// settlement a player comes near, its people going to market and back with a pannier on the back
// or a jug in the hand, porters under sacks and firewood, field hands out to the fields with their
// hay forks, merchants about the market and the guild, sweepers with their brooms, friars between
// the church and the houses; and in a castle's wards, its servants, grooms and scribes. Each goes
// round its errands (its routine's stops: battle.js #routine), from one kind of place to another,
// lingering a while at each: more of them by day, a few at night.
//
// Where they go is worked out from the settlement's layout (setpieces/town.js layoutTown) or the
// castle's wards (sites.js), and who they are from the place and the world's seed, so the same
// folk are out whenever a player comes back, in every copy of the world. Pure data, no DOM.

import { atan2, cos, hypot, sin } from "./exact.js";
import { namePeople } from "./names.js";
import { createRandom } from "./random.js";
import { PLOT } from "./setpieces/pieces.js";

/** How many townsfolk are out in a settlement by day, by its kind (setpieces/town.js SETTLEMENT_KINDS'); and in a castle's wards. */
export const TOWNSFOLK = Object.freeze({ farmstead: 2, hamlet: 3, village: 5, town: 8, city: 12, capital: 14, castle: 5 });

/** At night, a third of them (at least one): the rest at home. */
export const NIGHT_SHARE = 1 / 3;

/**
 * How near a player comes to a settlement's edge (metres) before its townsfolk are out, and how far
 * every player's gone before they're home again (a castle's from its middle, its edge as far again).
 */
export const TOWNSFOLK_REACH = Object.freeze({ near: 100, far: 220 });

/**
 * Each calling: its title (a shopper's a townsman or townswoman, or in a village a villager), who's
 * of it (picked from: "f", "m"), and the kinds of place its errands take it to (errandsOf's); the
 * castle's in its wards.
 */
export const CALLINGS = Object.freeze({
    shopper: { title: null, sexes: ["f", "f", "m"], goes: ["stall", "trade", "well", "home", "market", "church"] },
    porter: { title: "Porter", sexes: ["m", "m", "f"], goes: ["trade", "stall", "yard", "exit", "market"] },
    fieldhand: { title: "Field hand", sexes: ["m", "f"], goes: ["exit", "yard", "well", "market", "home"] },
    merchant: { title: "Merchant", sexes: ["m", "f"], goes: ["market", "stall", "guild", "hall", "tavern", "trade"] },
    sweeper: { title: "Sweeper", sexes: ["m", "f"], goes: ["market", "stall", "church", "tavern", "hall", "home"] },
    friar: { title: "Friar", sexes: ["m", "m", "f"], goes: ["church", "market", "home", "well"] },
    servant: { title: "Servant", sexes: ["f", "m"], goes: ["court", "keep", "heart"] },
    groom: { title: "Groom", sexes: ["m", "f"], goes: ["heart", "court"] },
    scribe: { title: "Scribe", sexes: ["m", "f"], goes: ["keep", "court"] },
});

// Who's out, by the kind of place: the callings taken in turn from a shuffle of these
const MIX = Object.freeze({
    small: ["shopper", "fieldhand", "shopper", "porter", "fieldhand", "friar"],
    large: ["shopper", "porter", "merchant", "shopper", "sweeper", "friar", "fieldhand", "porter", "merchant", "shopper", "sweeper", "shopper", "porter", "merchant"],
    castle: ["servant", "groom", "scribe", "servant", "groom"],
});

// The settlements counted small: their townsfolk villagers
const SMALL = new Set(["farmstead", "hamlet", "village"]);

/** How long each lingers at each kind of place (ms: from and to). */
export const LINGER = Object.freeze({ market: [4000, 9000], stall: [5000, 12000], trade: [4000, 9000], well: [6000, 12000], home: [5000, 14000], church: [6000, 12000], exit: [2000, 5000], yard: [5000, 10000], tavern: [3000, 8000], guild: [3000, 7000], hall: [3000, 7000], court: [4000, 10000], keep: [4000, 9000], heart: [3000, 7000] });

// The landmarks errands go to the doors of, by their names
const DOORS = new Set(["church", "tavern", "guild", "hall"]);

// How far out in front of a building or a stall (metres, past its lot's front) someone stands at
// it; how far round a well; how far in from a way out of the settlement
const FRONT = 1.2;
const ROUND_WELL = 1.6;
const IN_FROM_EXIT = 4;

// The way to face to look from one point at another (battle.js: radians from south, towards east)
const facingTo = ([x, y], [tx, ty]) => atan2(tx - x, ty - y);

/**
 * Where a settlement's townsfolk go about their business: its layout (setpieces/town.js
 * layoutTown's) set down with its north-west corner at `origin` ([x, y] metres in the world), and
 * `free`, the square someone can be put to stand on nearest a point ([x, y] metres: a square, or
 * null). By kind: the market (its middle and round it), its stalls (in front of each), its well
 * (round it), its tradesmen's houses and the others (in front of each: `trade`, `home`), its
 * church's, tavern's, guild's and hall's doors (in front of their lots), its ways out (a little in
 * from each: the fields beyond) and its yards; each [{ square, facing }], each square once.
 */
export function errandsOf(layout, [ox, oy], free) {
    const errands = Object.fromEntries(Object.keys(LINGER).map((kind) => [kind, []]));
    const seen = new Set();
    const add = (kind, [x, y], looking) => {
        const square = free([ox + x, oy + y]);

        if (!square || seen.has(`${square[0]},${square[1]}`)) {
            return;
        }

        seen.add(`${square[0]},${square[1]}`);
        errands[kind].push({ square, facing: facingTo([square[0] + 0.5 - ox, square[1] + 0.5 - oy], looking) });
    };
    // (In front of a piece: its middle, out along the way it faces past its lot's front)
    const before = (piece, out) => {
        const [fx, fy] = [sin(piece.facing ?? 0), cos(piece.facing ?? 0)];
        const reach = (piece.h * PLOT) / 2 + out;

        return [piece.x + fx * reach, piece.y + fy * reach];
    };
    const centre = layout.market?.centre ?? layout.centre;

    // The market: its middle, and round it
    add("market", centre, centre);

    for (let k = 0; k < 4; k++) {
        const angle = (k * Math.PI) / 2 + Math.PI / 4;
        const at = [centre[0] + cos(angle) * 5, centre[1] + sin(angle) * 5];

        add("market", at, centre);
    }

    for (const piece of layout.pieces) {
        if (piece.kind === "prop" && piece.name === "tent") {
            // (A stall's open front, the way it faces: stood at, looking in at its wares)
            add("stall", before(piece, FRONT / 2), [piece.x, piece.y]);
        } else if (piece.kind === "prop" && piece.name === "well") {
            for (let k = 0; k < 4; k++) {
                const angle = (k * Math.PI) / 2;

                add("well", [piece.x + cos(angle) * ROUND_WELL, piece.y + sin(angle) * ROUND_WELL], [piece.x, piece.y]);
            }
        } else if (piece.kind === "house" && !piece.back) {
            add(piece.use ? "trade" : "home", before(piece, FRONT), [piece.x, piece.y]);
        } else if (piece.kind === "landmark" && DOORS.has(piece.name)) {
            add(piece.name === "church" ? "church" : piece.name, before(piece, FRONT), [piece.x, piece.y]);
        }
    }

    for (const [x, y] of layout.exits ?? []) {
        const apart = hypot(centre[0] - x, centre[1] - y) || 1;

        add("exit", [x + ((centre[0] - x) / apart) * IN_FROM_EXIT, y + ((centre[1] - y) / apart) * IN_FROM_EXIT], [x, y]);
    }

    for (const yard of layout.yards ?? []) {
        add("yard", [yard.x, yard.y], [yard.x, yard.y + 1]);
    }

    return errands;
}

/**
 * Where a castle's folk go in its wards (sites.js: a castle set down): its courtyard's squares
 * (`courts`, [[x, y], ...]), its heart (`heart`, [x, y] metres: its middle) and its keep's door
 * (`keep`: the square in front of it, [x, y] metres); each kind [{ square, facing }] as
 * errandsOf's, on squares someone can be put to stand on (`free`). A dozen of the courts'
 * squares, spread through them, each facing the keep.
 */
export function wardErrandsOf({ courts, heart, keep }, free) {
    const errands = { court: [], keep: [], heart: [] };
    const middle = keep ?? heart;
    const seen = new Set();
    const add = (kind, [x, y], looking) => {
        const square = free([x, y]);

        if (square && !seen.has(`${square[0]},${square[1]}`)) {
            seen.add(`${square[0]},${square[1]}`);
            errands[kind].push({ square, facing: facingTo([square[0] + 0.5, square[1] + 0.5], looking) });
        }
    };

    if (keep) {
        add("keep", keep, keep);
    }

    if (heart) {
        add("heart", heart, middle);
    }

    const step = Math.max(1, Math.floor(courts.length / 12));

    for (let k = 0; k < courts.length; k += step) {
        add("court", [courts[k][0] + 0.5, courts[k][1] + 0.5], middle);
    }

    return errands;
}

/**
 * A settlement's townsfolk (or a castle's folk), as the host keeps its folk: [{ id, local, title,
 * role: "townsfolk", look (their calling: characters/folk.js), sex, name, seed, people, map: "town",
 * square, facing, routine, place, townName }], `count` of them, each going round three to five of
 * its errands (errandsOf's: of the kinds its calling goes to, one of each it can find), from one
 * kind to another (`order: "alternate"`), starting at whichever `start` picks (square → whether
 * they can be put there now: out of every player's sight), or their first. None with fewer than
 * two errands to go round.
 * @param {object} options
 * @param {string} options.place - The place's id (its townsfolk's ids are `townsfolk:${place}/${k}`).
 * @param {string} options.kind - Its kind: a settlement's (SETTLEMENT_KINDS'), or "castle".
 * @param {string} [options.people] - Whose people its folk are (a RACES id).
 * @param {string} [options.name] - Its name.
 * @param {object} options.errands - Where they go (errandsOf's, wardErrandsOf's).
 * @param {number} options.count - How many are out.
 * @param {number} options.seed - The world's seed.
 */
export function townsfolkOf({ place, kind, people = "human", name = "", errands, count, seed, start = () => true }) {
    const random = createRandom(hashOf(`${place}|${seed}`));
    const mix = kind === "castle" ? MIX.castle : SMALL.has(kind) ? MIX.small : MIX.large;
    const callings = random.shuffle([...mix]);
    const folk = [];

    for (let k = 0; k < count; k++) {
        const calling = callings[k % callings.length];
        const { goes, sexes } = CALLINGS[calling];
        const sex = random.pick(sexes);
        // (One errand of each kind it goes to, each picked from those there are)
        const stops = goes.filter((each) => errands[each]?.length).map((each) => ({ ...random.pick(errands[each]), group: each, wait: [...LINGER[each]] }));

        if (stops.length < 2) {
            continue;
        }

        const first = stops.findIndex(({ square }) => start(square));
        const at = stops[Math.max(0, first)];

        folk.push({
            id: `townsfolk:${place}/${k}`,
            local: calling,
            title: titleOf(calling, kind, sex, people),
            role: "townsfolk",
            look: calling,
            sex,
            seed: hashOf(`${place}/folk-${k}|${seed}`),
            people,
            map: "town",
            square: [...at.square],
            facing: at.facing,
            routine: { order: "alternate", wait: [4000, 10000], stops },
            place,
            townName: name,
        });
    }

    return namePeople(folk, hashOf(`${place}|names|${seed}`), people);
}

/** How many are out at a place of a kind: TOWNSFOLK's by day, NIGHT_SHARE of them at night. */
export function countOut(kind, night = false) {
    const day = TOWNSFOLK[kind] ?? 0;

    return night ? Math.max(day ? 1 : 0, Math.ceil(day * NIGHT_SHARE)) : day;
}

// Each people's own name for a friar's calling (their priests about the town, characters/dress.js
// their dress): the elves' moon-priests, the dark elves' web-priests, the cat folk's sun-priests,
// the lizard folk's serpent-priests, the orcs' shamans; [a man's, a woman's]
const PRIESTS = Object.freeze({ elf: ["Moon-priest", "Moon-priestess"], darkElf: ["Web-priest", "Web-priestess"], cat: ["Sun-priest", "Sun-priestess"], lizard: ["Serpent-priest", "Serpent-priestess"], orc: ["Shaman", "Shaman"] });

// A calling's title: a shopper's by where they live and who they are, a friar's by their people
function titleOf(calling, kind, sex, people) {
    if (calling === "friar" && PRIESTS[people]) {
        return PRIESTS[people][sex === "f" ? 1 : 0];
    }

    if (calling !== "shopper") {
        return CALLINGS[calling].title;
    }

    if (SMALL.has(kind)) {
        return "Villager";
    }

    return sex === "f" ? "Townswoman" : "Townsman";
}

// A whole number from a string (FNV-1a), for seeds
function hashOf(text) {
    let hash = 2166136261;

    for (let k = 0; k < text.length; k++) {
        hash = Math.imul(hash ^ text.charCodeAt(k), 16777619) >>> 0;
    }

    return hash;
}
