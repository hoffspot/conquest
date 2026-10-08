// The sites the world plan puts out in the wild and among the peoples that no people builds (the
// terrain plan's §9 rows 4 and 6): the ruins of old halls, caves, shrines, circles of standing
// stones, the ruined castles where the wight lords keep, the dragon's lair, the watchtowers no
// one keeps any more, and the old graveyards outside the towns where the players start. Each is laid out here as what stands where, and which of it stands in the
// way: the parts (for the art kits, world/art/kits/neutral.js, to build just as laid out), the
// rectangles no one walks through (a circle of stones is walked into between its stones, a ruin's
// hall through its door and its breaches, a ruined castle's courtyard through its broken gate),
// and its heart: where its master stands, if it has one, clear of everything.
//
// Laid out facing south (its front, where it's come at from, towards the road), in metres from
// its north-west corner; sites.js turns it to face its road. Pure, and the same in every browser:
// the seeded random numbers (random.js) and exact maths (exact.js) only.

import { cos, PI, sin } from "../exact.js";
import { createRandom } from "../random.js";
import { layoutCastle } from "./castle.js";
import { pieceCatalog, PLOT } from "./pieces.js";
import { layoutWorks, WORKS_SIZE } from "./works.js";

/**
 * Each neutral site's size (plots across and deep), as it's built: a circle of stones 24 m across,
 * a shrine 12 m, a cave's crag 20 by 16, a ruined hall 24 by 20, a ruined castle as big as the
 * humans' own, the dragon's crag 40 by 36, a broken watchtower, and a walled graveyard 24 by 20.
 * The peoples' works are laid out the same way (works.js WORKS_SIZE).
 */
export const NEUTRAL = Object.freeze({
    ...WORKS_SIZE,
    "standing stones": [6, 6],
    shrine: [3, 3],
    cave: [5, 4],
    ruins: [6, 5],
    "ruined castle": [18, 16],
    "dragon's lair": [10, 9],
    watchtower: [3, 3],
    graveyard: [6, 5],
});

/**
 * An old graveyard, as old churchyards are (docs/GAME.md, *The sites no people keeps*; the
 * research behind it: graves run east and west, their headstones at their heads, at the west;
 * metres):
 * - its wall of field stone (`wall`: how thick at its foot, how high at its least and most,
 *   narrowing as it rises: art/kits/neutral.js), its way in at the middle of its front between
 *   two piers (`gate`: how wide between them, the piers how wide and how high), iron gates
 *   hanging open or fallen;
 * - a path of flagstones (`path` wide) from there to what stands at its back: a chest tomb mostly,
 *   a family's mausoleum seldom (`mausoleum` of them: a few hundred stand in all of Britain's
 *   twenty thousand churchyards); a few tombs more beside the path (`tombs`), chest or table
 *   tombs, the grander graves; seldom an obelisk (`obelisk`), and a grave railed round now and
 *   then (`railing`); a yew by the gate, on the path's west side;
 * - the graves, close as an old yard's are (`grave`: `long` by `wide`, in rows `row` apart along
 *   them and `across` apart side by side, set off their places by up to `jitter` and turned by up
 *   to `yaw`), east and west as the world lies, whichever way the yard faces; nearly every plot
 *   used (`keep` of them), the north side's too, but fewer of those marked (the side no one
 *   wanted a stone on: `north`, the share of the rest's marked there; that no one was buried there
 *   at all is a myth);
 * - a headstone at under half of the graves' heads (`marked` of them; the rest unmarked mounds, as
 *   most of an old yard's are), shaped as it was cut (`stones`: how often each), as tall as it was
 *   cut (`tall`: from and to, the taller the rarer; a cross the tallest), its face to the west
 *   mostly (`faces`: west, east, or turned to the path); leaning over the grave as the coffin under
 *   it gives way and the ground sinks (back from its face, for one looking west), sunk, fallen or
 *   snapped (`lean`); a footstone at some graves' feet (`footstone`);
 * - over each, a mound gone to grass, the earth freshly turned, nothing (sunk level), or the
 *   grave broken open where its dead have risen (`ground`: how often each).
 */
export const GRAVEYARD = Object.freeze({
    wall: { thick: 0.6, low: 0.9, high: 1.4 },
    gate: { wide: 2.2, pier: 0.55, high: [1.8, 2.1] },
    path: 1.4,
    mausoleum: 0.08,
    tombs: [2, 4],
    obelisk: 0.12,
    railing: 0.3,
    grave: { long: 2.2, wide: 0.85, row: 2.7, across: 0.98, jitter: 0.22, yaw: 0.14 },
    keep: 0.92,
    north: 0.35,
    marked: 0.62,
    stones: { round: 3, segmental: 2, shouldered: 2, pointed: 1.5, flat: 1.5, cross: 1 },
    tall: [0.55, 1.3],
    faces: { west: 0.7, east: 0.2, path: 0.1 },
    lean: { forward: 0.45, sunk: 0.25, fallen: 0.07, snapped: 0.04 },
    footstone: 0.25,
    ground: { mound: 0.5, fresh: 0.12, open: 0.13, flat: 0.25 },
});

// A rectangle `long` along `along` ([x, y], a unit vector) and `wide` across it, round (x, y): its
// corners; and the box round some points
const cornersOf = (x, y, [ax, ay], long, wide) =>
    [
        [1, 1],
        [1, -1],
        [-1, -1],
        [-1, 1],
    ].map(([i, j]) => [x + (ax * long * i) / 2 - (ay * wide * j) / 2, y + (ay * long * i) / 2 + (ax * wide * j) / 2]);
const boundsOf = (points) => [Math.min(...points.map(([x]) => x)), Math.min(...points.map(([, y]) => y)), Math.max(...points.map(([x]) => x)), Math.max(...points.map(([, y]) => y))];
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const grown = ([x0, y0, x1, y1], by) => [x0 - by, y0 - by, x1 + by, y1 + by];

/** The tree a graveyard's yew is drawn as (setpieces/pieces.js TREE_KINDS: a dark spruce, of the middling size). */
export const YEW = 8;

/**
 * An old hall's crypt's way down (metres): a stair-house `wide` across and `deep`, against the
 * hall's back wall, its door `door` wide and high.
 */
export const RUINS = Object.freeze({ crypt: { wide: 3.4, deep: 3.2, door: [1.4, 2.2] } });

/**
 * A ruined castle's keep's way in (metres): the breach where its door was (kits/castle.js
 * ruinedKeep's), `breach` wide and high, over the step before it (`sill` high).
 */
export const RUINED_KEEP = Object.freeze({ breach: [3.2, 3.5], sill: 0.8 });

const TAU = 6.283185307179586;
const catalog = new Map(pieceCatalog().map((piece) => [piece.key, piece]));

/**
 * A neutral site laid out (its `kind`, its `seed`): { size ([w, h] plots), parts (what the art
 * builds: each { part, ... } in metres from its north-west corner), solid ([[x0, y0, x1, y1]]
 * metres: what no one walks through), heart ([x, y] metres: open ground in its middle), castle
 * (for a ruined castle: its castle.js pieces, ruined), entry (where it's gone into, if it can be:
 * { x, y (metres: the middle of its way in, on the line of its face), width, height, inside (what
 * it's like within: insides.js's kinds) }, facing out the way the site does) }; or null if the
 * kind isn't one. A people's works (works.js, its `people`'s) has its yard, posts and round too.
 */
export function layoutNeutral({ kind, seed, form = null, facing = 0, people = null }) {
    const size = NEUTRAL[kind];

    if (!size) {
        return null;
    }

    const random = createRandom((seed ^ 0x5eed) >>> 0);
    const [width, depth] = [size[0] * PLOT, size[1] * PLOT];
    const laid = WORKS_SIZE[kind] ? layoutWorks(kind, random, width, depth, people) : LAYOUTS[kind](random, width, depth, seed, form, facing);

    return { size, ...laid };
}

const LAYOUTS = {
    // A ring of tall stones round a flat one, one or two fallen
    "standing stones"(random, width, depth) {
        const [cx, cy] = [width / 2, depth / 2];
        const count = random.int(7, 11);
        const radius = random.range(7.6, 9.2);
        const fallen = new Set([random.int(0, count - 1), ...(random.chance(0.4) ? [random.int(0, count - 1)] : [])]);
        const parts = [{ part: "altar", x: cx, y: cy, w: random.range(1.8, 2.4), d: random.range(1.1, 1.4), h: random.range(0.6, 0.85) }];
        const solid = [box(cx, cy, 2.6, 1.6)];
        const turn = random.range(0, TAU);

        for (let k = 0; k < count; k++) {
            const angle = turn + (k / count) * TAU + random.range(-0.12, 0.12);
            const [x, y] = [cx + cos(angle) * radius, cy + sin(angle) * radius];
            const stone = { part: "stone", x, y, angle, w: random.range(0.9, 1.4), d: random.range(0.5, 0.75), h: random.range(2.2, 3.8), fallen: fallen.has(k) };

            parts.push(stone);
            // (A fallen stone lies along the ring, as long as it stood tall)
            solid.push(stone.fallen ? box(x, y, 1.6, 1.6) : box(x, y, 1.2, 1.2));
        }

        // (Its heart beside the flat stone, on the side away from where it's come at)
        return { parts, solid, heart: [cx, cy - 2.4] };
    },

    // A figure on a stepped plinth, braziers either side of its front, a curved wall behind
    shrine(random, width, depth) {
        const [cx, cy] = [width / 2, depth / 2 - 0.6];
        const figure = random.pick(["robed", "obelisk", "hands"]);
        const parts = [
            { part: "plinth", x: cx, y: cy, w: 3.2, d: 3.2, h: 0.7 },
            { part: "figure", x: cx, y: cy, figure, h: random.range(2.4, 3) },
            { part: "brazier", x: cx - 2.4, y: cy + 2.3 },
            { part: "brazier", x: cx + 2.4, y: cy + 2.3 },
            { part: "backwall", x: cx, y: cy - 2.7, radius: 3.4, h: random.range(1.4, 2.2) },
        ];
        const solid = [box(cx, cy, 3.4, 3.4), box(cx, cy - 3.2, 6.6, 1.4), box(cx - 2.4, cy + 2.3, 0.8, 0.8), box(cx + 2.4, cy + 2.3, 0.8, 0.8)];

        return { parts, solid, heart: [cx, cy + 3.8] };
    },

    // A cave: cut into a hillside where the land rises behind it (its mouth in a face of rock
    // standing out of the slope, the hill going on over its brow), or going down into the ground
    // where the land's flat (a pit sunk into it, stone-lined, steps down to a dark doorway in its
    // back wall); torches either side of the way in
    cave(random, width, depth, seed, form) {
        const cx = width / 2;

        if (form === "pit") {
            const cy = 6;
            const pit = { radius: 2, ease: 2.2, drop: 3.2 };
            const reach = pit.radius + pit.ease;
            const parts = [
                { part: "pit", x: cx, y: cy, ...pit, mouth: { w: 2.2, h: 2.6 }, seed: random.seed() },
                { part: "torch", x: cx - 1.6, y: cy + reach + 0.6 },
                { part: "torch", x: cx + 1.6, y: cy + reach + 0.6 },
            ];
            const solid = [box(cx, cy, reach * 2 + 0.4, reach * 2 + 0.4), box(cx - 1.6, cy + reach + 0.6, 0.6, 0.6), box(cx + 1.6, cy + reach + 0.6, 0.6, 0.6)];

            // (Gone into down its steps, from the pit's front edge)
            return { parts, solid, heart: [cx, cy + reach + 2], pad: { at: [cx, cy], radius: pit.radius, raise: -pit.drop, ease: pit.ease }, entry: { x: cx, y: cy + reach + 0.2, width: 2.2, height: 2.6, inside: "cave" } };
        }

        const back = 10.5;
        const mouth = random.range(3.2, 4.2);
        const tall = random.range(2.8, 3.4);
        // (Its face as wide as the floor dug in front of it, about: its mouth and a few metres of
        // rock either side)
        const half = mouth / 2 + 3;
        const parts = [
            { part: "outcrop", x0: cx - half, y0: 0.2, x1: cx + half, y1: back, h: random.range(5, 6.5), face: tall + 1.4, mouth: { w: mouth, h: tall }, seed: random.seed() },
            { part: "torch", x: cx - mouth / 2 - 1.1, y: back + 1.1 },
            { part: "torch", x: cx + mouth / 2 + 1.1, y: back + 1.1 },
        ];
        const solid = [[cx - half, 0.2, cx + half, back + 0.4], box(cx - mouth / 2 - 1.1, back + 1.1, 0.6, 0.6), box(cx + mouth / 2 + 1.1, back + 1.1, 0.6, 0.6)];

        // (Where it's cut into the hill: the face's line, and how high it stands over the floor dug
        // in front of it: sites.js levels that floor)
        return { parts, solid, heart: [cx, back + 2.6], cut: { x: cx, y: back, face: tall + 1.4 }, entry: { x: cx, y: back + 0.4, width: mouth, height: tall, inside: "cave" } };
    },

    // An old hall's walls, broken off unevenly, its door in front and a breach in a side; the
    // stumps of its columns down its middle, and the stones fallen from it in heaps
    ruins(random, width, depth) {
        const [x0, y0, x1, y1] = [3.2, 2.6, width - 3.2, depth - 2.8];
        const thick = 0.9;
        const door = { at: (x0 + x1) / 2, half: 1.3 };
        const side = random.pick(["west", "east"]);
        const breach = { at: random.range(y0 + 3.5, y1 - 3.5), half: random.range(1.2, 1.8) };
        const walls = [];
        // (A wall from a to b along x or y, with a gap: [from, to] along it)
        const run = (a, b, along, gap = null) => {
            const [start, end] = along === "x" ? [a[0], b[0]] : [a[1], b[1]];
            const spans = gap ? [[start, gap[0]], [gap[1], end]] : [[start, end]];

            for (const [s, e] of spans) {
                if (e - s > 0.4) {
                    walls.push(along === "x" ? { part: "wall", x0: s, y0: a[1] - thick / 2, x1: e, y1: a[1] + thick / 2, h: random.range(1.6, 4.6), seed: random.seed() } : { part: "wall", x0: a[0] - thick / 2, y0: s, x1: a[0] + thick / 2, y1: e, h: random.range(1.6, 4.6), seed: random.seed() });
                }
            }
        };

        run([x0 - thick / 2, y0], [x1 + thick / 2, y0], "x");
        run([x0 - thick / 2, y1], [x1 + thick / 2, y1], "x", [door.at - door.half, door.at + door.half]);
        run([x0, y0], [x0, y1], "y", side === "west" ? [breach.at - breach.half, breach.at + breach.half] : null);
        run([x1, y0], [x1, y1], "y", side === "east" ? [breach.at - breach.half, breach.at + breach.half] : null);

        const parts = [...walls];
        const solid = walls.map(({ x0: a, y0: b, x1: c, y1: d }) => [a, b, c, d]);

        // (Two rows of column stumps down the hall, some fallen)
        const rows = random.int(2, 3);

        for (let k = 0; k < rows; k++) {
            const y = y0 + ((k + 1) / (rows + 1)) * (y1 - y0);

            for (const x of [x0 + (x1 - x0) * 0.3, x1 - (x1 - x0) * 0.3]) {
                const fallen = random.chance(0.3);

                parts.push({ part: "column", x, y, h: fallen ? 0.6 : random.range(1.2, 3.8), fallen, turn: random.range(0, TAU) });
                solid.push(box(x, y, 1, 1));
            }
        }

        // (The way down to its crypt: a stair-house of the hall's stone against its back wall in
        // the middle, between its columns, its arched door facing the hall's own; the crypt under
        // the hall, gone into by it: insides.js)
        const crypt = { x: (x0 + x1) / 2, half: RUINS.crypt.wide / 2, back: y0 + thick / 2, deep: RUINS.crypt.deep };

        // (Heaps of fallen stone, in the breach's way out and against the walls: clear of the
        // stair-house)
        const breachX = side === "west" ? x0 - 1.4 : x1 + 1.4;

        parts.push({ part: "rubble", x: breachX, y: breach.at + random.range(-0.6, 0.6), r: random.range(1, 1.4), seed: random.seed() });

        for (let k = 0; k < random.int(2, 4); k++) {
            const [along, y, r] = [random.range(x0 + 1.4, x1 - 1.4), random.pick([y0 + 1.2, y1 - 1.6]), random.range(0.7, 1.1)];
            const aside = crypt.half + r + 0.3;
            const x = y < crypt.back + crypt.deep && Math.abs(along - crypt.x) < aside ? crypt.x + (along < crypt.x ? -aside : aside) : along;

            parts.push({ part: "rubble", x, y, r, seed: random.seed() });
        }

        parts.push({ part: "crypt", x0: crypt.x - crypt.half, y0: crypt.back, x1: crypt.x + crypt.half, y1: crypt.back + crypt.deep });
        solid.push([crypt.x - crypt.half, crypt.back, crypt.x + crypt.half, crypt.back + crypt.deep]);

        return {
            parts,
            solid,
            heart: [(x0 + x1) / 2, (y0 + y1) / 2],
            entry: { x: crypt.x, y: crypt.back + crypt.deep, width: RUINS.crypt.door[0], height: RUINS.crypt.door[1], inside: "crypt" },
        };
    },

    // A castle laid out as the humans' are (castle.js), left to ruin: its walls broken down, its
    // towers' tops gone, its keep open to the sky, its gate's way through clear; nothing in its
    // courtyard but what's fallen
    "ruined castle"(random, width, depth, seed) {
        const [w, h] = [width / PLOT, depth / PLOT];
        const castle = layoutCastle({ width: w, height: h, gate: "s", seed });
        const kept = new Set(["wall", "tower", "gatehouse", "keep"]);
        const pieces = [];
        const solid = [];
        const parts = [];

        for (const piece of castle.pieces) {
            const spec = catalog.get(piece.key);

            if (!spec || !kept.has(spec.kind)) {
                // (What stood in the courtyard: a heap of what it was built of, its timbers fallen
                // across it)
                if (spec?.kind === "house") {
                    const [hx, hy] = [(piece.x + piece.w / 2) * PLOT, (piece.y + piece.h / 2) * PLOT];

                    parts.push({ part: "rubble", x: hx, y: hy, r: 1.4, seed: random.seed() }, { part: "timbers", x: hx + random.range(-0.6, 0.6), y: hy + random.range(-0.6, 0.6), r: 1.8, seed: random.seed() });
                }

                continue;
            }

            pieces.push({ ...piece, ruined: true });

            const [px0, py0, px1, py1] = [piece.x * PLOT, piece.y * PLOT, (piece.x + piece.w) * PLOT, (piece.y + piece.h) * PLOT];

            // (The gatehouse's way through clear between its two halves)
            if (spec.kind === "gatehouse") {
                const along = piece.w >= piece.h;
                const [mid, half] = along ? [(px0 + px1) / 2, PLOT] : [(py0 + py1) / 2, PLOT];

                solid.push(along ? [px0, py0, mid - half, py1] : [px0, py0, px1, mid - half], along ? [mid + half, py0, px1, py1] : [px0, mid + half, px1, py1]);
            } else {
                solid.push([px0, py0, px1, py1]);
            }
        }

        // (Its heart: the courtyard's square nearest its middle that nothing stands on)
        const free = (x, y) => !solid.some(([a, b, c, d]) => x > a - 1 && x < c + 1 && y > b - 1 && y < d + 1);
        let heart = [width / 2, depth / 2];

        for (let ring = 0, found = false; ring < Math.max(w, h) && !found; ring++) {
            for (let j = -ring; j <= ring && !found; j++) {
                for (let i = -ring; i <= ring && !found; i++) {
                    const [x, y] = [width / 2 + i * PLOT, depth / 2 + j * PLOT];

                    if ((Math.abs(i) === ring || Math.abs(j) === ring) && free(x, y)) {
                        heart = [x, y];
                        found = true;
                    }
                }
            }
        }

        // (Gone into by the breach where its keep's door was, in the middle of its south face: its
        // great hall within, open to the sky, insides.js)
        const keep = pieces.find(({ key }) => catalog.get(key)?.kind === "keep" && catalog.get(key).door);
        const entry = keep ? { x: (keep.x + keep.w / 2) * PLOT, y: (keep.y + keep.h) * PLOT - 0.2, width: RUINED_KEEP.breach[0], height: RUINED_KEEP.breach[1], floor: RUINED_KEEP.sill, inside: "ruin" } : null;

        // (What its last keepers left: stores of barrels and crates against its walls, a cart, on
        // open squares of the courtyard beside what stands, clear of its heart, of the way in from
        // the gate and of the breach into its keep)
        const beside = (x, y) => [[PLOT, 0], [-PLOT, 0], [0, PLOT], [0, -PLOT]].some(([dx, dy]) => !free(x + dx, y + dy));
        const spots = [];

        for (let j = 1; j < h - 1; j++) {
            for (let i = 1; i < w - 1; i++) {
                const [x, y] = [(i + 0.5) * PLOT, (j + 0.5) * PLOT];

                if (free(x, y) && beside(x, y) && Math.abs(x - width / 2) > PLOT * 1.5 && Math.abs(x - heart[0]) + Math.abs(y - heart[1]) > PLOT * 2 && !(entry && Math.abs(x - entry.x) < PLOT * 1.5 && y > entry.y && y - entry.y < PLOT * 2)) {
                    spots.push([x, y]);
                }
            }
        }

        for (let k = Math.min(spots.length, random.int(3, 5)); k > 0; k--) {
            const [x, y] = spots.splice(random.int(0, spots.length - 1), 1)[0];
            const cart = k === 1 && random.chance(0.7);

            parts.push(cart ? { part: "cart", x, y, turn: random.range(0, TAU), seed: random.seed() } : { part: "stores", x, y, seed: random.seed() });
            solid.push(box(x, y, cart ? 3 : 2.2, cart ? 3 : 2.2));
        }

        return { parts, solid, heart, castle: pieces, ...(entry ? { entry } : {}) };
    },

    // The dragon's lair, cut into a mountainside: a great cave's mouth in a face of dark rock, the
    // hill going on over it; spurs of rock either side running down from it round a hollow, open
    // at the front; bones about the hollow
    "dragon's lair"(random, width, depth) {
        const [cx, cy] = [width / 2, depth / 2 + 2];
        const parts = [
            { part: "outcrop", x0: 4, y0: 0.5, x1: width - 4, y1: 12, h: random.range(12, 15), face: 8, mouth: { w: 7, h: 6 }, seed: random.seed() },
            { part: "spur", x0: 0.5, y0: 8, x1: 8.5, y1: depth - 6, h: random.range(5, 7.5), seed: random.seed() },
            { part: "spur", x0: width - 8.5, y0: 8, x1: width - 0.5, y1: depth - 8, h: random.range(5, 7.5), seed: random.seed() },
        ];

        for (let k = 0; k < random.int(4, 7); k++) {
            const angle = random.range(0, TAU);
            const out = random.range(2, 7);

            parts.push({ part: "bones", x: cx + cos(angle) * out, y: cy + sin(angle) * out, turn: random.range(0, TAU), big: random.chance(0.35) });
        }

        const solid = [
            [4, 0.5, width - 4, 12.4],
            [0.5, 8, 8.5, depth - 6],
            [width - 8.5, 8, width - 0.5, depth - 8],
        ];

        return { parts, solid, heart: [cx, cy], cut: { x: cx, y: 12, face: 8 }, entry: { x: cx, y: 12.4, width: 7, height: 6, inside: "lair" } };
    },

    // An old graveyard outside a town (GRAVEYARD): a wall of field stone round it, broken here
    // and there; its way in at the front between two piers, its iron gates hanging open; a path
    // of flagstones up to a mausoleum or a chest tomb at its back, tombs beside it; a yew by the
    // gate; and the graves, east and west as the world lies (`facing`: which way the yard's
    // turned), their headstones at their heads, the ground over them as the years and the risen
    // dead have left it
    graveyard(random, width, depth, seed, form, facing) {
        const { wall, gate, path, grave } = GRAVEYARD;
        const cx = width / 2;
        const [x0, y0, x1, y1] = [0.6, 0.6, width - 0.6, depth - 0.6];
        const inner = [x0 + wall.thick / 2, y0 + wall.thick / 2, x1 - wall.thick / 2, y1 - wall.thick / 2];
        // (The world's east and north as the yard lies in it: sites.js turns a layout so)
        const east = [cos(facing), sin(facing)];
        const north = [sin(facing), -cos(facing)];
        const parts = [];
        const solid = [];
        // (What the graves keep clear of)
        const kept = [];
        const run = (a, b, c, d) => {
            parts.push({ part: "lowWall", x0: a, y0: b, x1: c, y1: d, h: random.range(wall.low, wall.high), seed: random.seed() });
            solid.push([a, b, c, d]);
        };

        // Its wall, the way in at the front between its piers, a stretch of a side fallen now and
        // then
        const half = gate.wide / 2 + gate.pier;
        const side = random.chance(0.5) ? random.pick(["west", "east"]) : null;
        const fallen = { at: random.range(y0 + 4, y1 - 4), half: random.range(1, 1.5) };

        run(x0 - wall.thick / 2, y0 - wall.thick / 2, x1 + wall.thick / 2, y0 + wall.thick / 2);
        run(x0 - wall.thick / 2, y1 - wall.thick / 2, cx - half, y1 + wall.thick / 2);
        run(cx + half, y1 - wall.thick / 2, x1 + wall.thick / 2, y1 + wall.thick / 2);

        for (const [x, which] of [
            [x0, "west"],
            [x1, "east"],
        ]) {
            if (side === which) {
                run(x - wall.thick / 2, y0 + wall.thick / 2, x + wall.thick / 2, fallen.at - fallen.half);
                run(x - wall.thick / 2, fallen.at + fallen.half, x + wall.thick / 2, y1 - wall.thick / 2);
                parts.push({ part: "rubble", x: x + (which === "west" ? 1 : -1) * 0.9, y: fallen.at + random.range(-0.4, 0.4), r: random.range(0.6, 0.9), seed: random.seed() });
                kept.push(box(x, fallen.at, 3, fallen.half * 2 + 1));
            } else {
                run(x - wall.thick / 2, y0 + wall.thick / 2, x + wall.thick / 2, y1 - wall.thick / 2);
            }
        }

        const high = random.range(...gate.high);

        for (const hand of [-1, 1]) {
            const x = cx + hand * (gate.wide / 2 + gate.pier / 2);
            // (Each gate hangs from its pier, swung in, or fallen; or it's gone)
            const state = random.pickWeighted(
                [
                    ["open", 0.6],
                    ["fallen", 0.25],
                    ["gone", 0.15],
                ],
                ([, weight]) => weight,
            )[0];

            parts.push({ part: "gatepost", x, y: y1, w: gate.pier, h: high, seed: random.seed() });
            solid.push(box(x, y1, gate.pier, gate.pier + 0.1));

            if (state !== "gone") {
                parts.push({ part: "gate", x: cx + (hand * gate.wide) / 2, y: y1, hand, wide: gate.wide / 2, open: random.range(1, 1.7), fallen: state === "fallen", seed: random.seed() });
            }
        }

        // What stands at its back, the path's end: a chest tomb; seldom a family's mausoleum, its
        // door to the path
        const along = (yaw = 0) => [cos(facing + yaw), sin(facing + yaw)];
        // (A grave's or a tomb's turn, as the art takes it: its across, a quarter turn back from
        // along it)
        const turnOf = (yaw) => facing + yaw - PI / 2;
        let end;

        if (random.chance(GRAVEYARD.mausoleum)) {
            const [w, d] = [random.range(3, 3.6), random.range(3.6, 4.2)];
            const y = inner[1] + 0.7 + d / 2;

            parts.push({ part: "mausoleum", x: cx, y, w, d, h: random.range(2.8, 3.4), roof: random.chance(0.65) ? "gable" : "pyramid", door: random.chance(0.6) ? "ajar" : "shut", seed: random.seed() });
            solid.push(box(cx, y, w + 0.5, d + 0.5));
            kept.push(box(cx, y, w + 1.6, d + 1.6));
            end = y + d / 2 + 0.6;
        } else {
            const tomb = tombAt(random, cx, inner[1] + 2.2, along, turnOf, "chest");

            parts.push(tomb.part);
            solid.push(tomb.solid);
            kept.push(grown(tomb.solid, 0.6));
            end = tomb.solid[3] + 0.3;
        }

        parts.push({ part: "flags", x0: cx - path / 2, y0: end, x1: cx + path / 2, y1: y1 + wall.thick / 2, seed: random.seed() });
        kept.push([cx - path / 2 - 0.45, y0, cx + path / 2 + 0.45, depth]);

        // The yew by the gate, on the path's west side (as the world lies); a few tombs beside
        // the path, seldom an obelisk
        const west = east[0] > 0.2 ? -1 : east[0] < -0.2 ? 1 : random.pick([-1, 1]);
        const yew = [cx + west * random.range(3.6, 4.6), y1 - random.range(2.8, 3.6)];

        parts.push({ part: "tree", x: yew[0], y: yew[1], variant: YEW });
        solid.push(box(...yew, 1.2, 1.2));
        kept.push(box(...yew, 4.4, 4.4));

        const beside = (reach) => {
            for (let tries = 0; tries < 12; tries++) {
                const hand = random.pick([-1, 1]);
                const at = [cx + hand * (path / 2 + 0.6 + reach), random.range(end + 1.4, y1 - 3)];

                if (!kept.some((rect) => overlaps(rect, box(...at, reach * 2, reach * 2)))) {
                    return at;
                }
            }

            return null;
        };

        for (let k = random.int(...GRAVEYARD.tombs); k > 0; k--) {
            const at = beside(1.2);

            if (at) {
                const tomb = tombAt(random, ...at, along, turnOf, random.chance(0.65) ? "chest" : "table");

                parts.push(tomb.part);
                solid.push(tomb.solid);
                kept.push(grown(tomb.solid, 0.5));
            }
        }

        const obelisk = random.chance(GRAVEYARD.obelisk) ? beside(0.8) : null;

        if (obelisk) {
            parts.push({ part: "obelisk", x: obelisk[0], y: obelisk[1], h: random.range(2.2, 3.2), seed: random.seed() });
            solid.push(box(...obelisk, 1.1, 1.1));
            kept.push(box(...obelisk, 1.8, 1.8));
        }

        // The graves, row on row east and west as the world lies, close, their places set off a
        // little and turned (an old yard's, not laid out with a line); the north side's as full,
        // but fewer of its graves marked
        const middle = [(inner[0] + inner[2]) / 2, (inner[1] + inner[3]) / 2];
        const northmost = Math.max(...cornersOf(...middle, [1, 0], inner[2] - inner[0], inner[3] - inner[1]).map(([x, y]) => (x - middle[0]) * north[0] + (y - middle[1]) * north[1]));
        const room = grown(inner, -0.35);
        const pick = (weights) => random.pickWeighted(Object.entries(weights), ([, weight]) => weight)[0];
        const graves = [];

        for (let i = -6; i <= 6; i++) {
            for (let j = -14; j <= 14; j++) {
                const ahead = i * grave.row + random.range(-grave.jitter, grave.jitter);
                const aside = j * grave.across + random.range(-grave.jitter, grave.jitter) * 0.6;
                const [x, y] = [middle[0] + east[0] * ahead + north[0] * aside, middle[1] + east[1] * ahead + north[1] * aside];
                const yaw = random.range(-grave.yaw, grave.yaw);
                const way = along(yaw);
                const corners = cornersOf(x, y, way, grave.long, grave.wide);
                const bounds = boundsOf(corners);
                const keep = random.chance(GRAVEYARD.keep);

                if (!keep || corners.some(([px, py]) => px < room[0] || py < room[1] || px > room[2] || py > room[3]) || kept.some((rect) => overlaps(rect, bounds))) {
                    continue;
                }

                graves.push({ x, y, yaw, way, bounds, northern: aside > northmost * 0.3 });
            }
        }

        // (A grave railed round, now and then: one by the path)
        const railed = random.chance(GRAVEYARD.railing) ? graves.reduce((best, each) => (!best || Math.abs(each.x - cx) < Math.abs(best.x - cx) ? each : best), null) : null;

        for (const { x, y, yaw, way, bounds, northern } of graves) {
            const marked = random.chance(GRAVEYARD.marked * (northern ? GRAVEYARD.north : 1));
            const stone = marked ? pick(GRAVEYARD.stones) : null;
            const look = pick(GRAVEYARD.faces);
            const forward = random.chance(GRAVEYARD.lean.forward);
            const fall = random.next();
            const state = fall < GRAVEYARD.lean.fallen ? "fallen" : fall < GRAVEYARD.lean.fallen + GRAVEYARD.lean.snapped ? "snapped" : "standing";
            const ground = pick(GRAVEYARD.ground);
            const part = {
                part: "grave",
                x,
                y,
                w: grave.wide,
                d: grave.long,
                turn: turnOf(yaw),
                // (Its headstone: shaped, how tall (the taller the rarer), broad and thick, which way
                // its face looks (west, east, or to the path: an angle, in the yard), leaning over
                // the grave (`sag`) and to a side (`lean`), sunk, fallen or snapped; and its stone,
                // one of the land's few)
                stone,
                ring: stone === "cross" && random.chance(0.4),
                tall: stone === "cross" ? random.range(0.9, GRAVEYARD.tall[1]) : tallOf(random),
                broad: random.range(0.45, 0.75),
                thick: random.range(0.08, 0.15),
                look: look === "west" ? facing + yaw + PI : look === "east" ? facing + yaw : x < cx ? 0 : PI,
                sag: forward ? random.range(0.05, 0.35) : random.range(-0.03, 0.05),
                lean: random.range(-0.1, 0.1),
                sunk: random.chance(GRAVEYARD.lean.sunk) ? random.range(0.1, 0.3) : 0,
                state,
                tone: random.int(0, 2),
                footstone: marked && random.chance(GRAVEYARD.footstone),
                ground,
                railed: railed?.x === x && railed?.y === y,
                seed: random.seed(),
            };
            const head = [x - (way[0] * grave.long) / 2 + way[0] * 0.25, y - (way[1] * grave.long) / 2 + way[1] * 0.25];

            parts.push(part);

            // (What's in the way: its headstone, standing or lying; its footstone; the whole of it
            // railed round, or broken open)
            if (part.railed || ground === "open") {
                solid.push(grown(bounds, 0.1));
            } else if (stone && state === "fallen") {
                solid.push(box(head[0] + way[0] * 0.5, head[1] + way[1] * 0.5, 1.2, 1.2));
            } else if (stone) {
                solid.push(box(...head, 0.8, 0.8));
            }

            if (part.footstone && !part.railed && ground !== "open") {
                solid.push(box(x + (way[0] * grave.long) / 2 - way[0] * 0.15, y + (way[1] * grave.long) / 2 - way[1] * 0.15, 0.5, 0.5));
            }
        }

        // (Its heart on the path, halfway up it)
        return { parts, solid, heart: [cx, Math.max(end + 1.5, (end + y1) / 2)] };
    },

    // A watchtower no one keeps: its top fallen in, a heap at its foot
    watchtower(random, width, depth) {
        const [cx, cy] = [width / 2, depth / 2 - 1];

        // (Gone into by the dark doorway at its foot, on its south side)
        return {
            parts: [{ part: "brokenTower", x: cx, y: cy, r: 3.2, h: random.range(6.5, 9.5), seed: random.seed() }],
            solid: [box(cx, cy, 7.2, 7.2)],
            heart: [cx, depth - 1.5],
            entry: { x: cx, y: cy + 3.6, width: 1.1, height: 2.1, inside: "tower" },
        };
    },
};

// A rectangle w by d round (x, y): [x0, y0, x1, y1]
const box = (x, y, w, d) => [x - w / 2, y - d / 2, x + w / 2, y + d / 2];

// How tall a headstone was cut (GRAVEYARD.tall): the taller the rarer
const tallOf = (random) => {
    const [least, most] = GRAVEYARD.tall;
    const roll = random.next();

    return least + (most - least) * roll * roll;
};

// A graveyard's tomb at (x, y), east and west as its graves are (`along`, `turnOf`: the
// graveyard's), a chest tomb (its lid shoved askew, or cracked, or whole) or a table tomb (a slab
// on legs): its part, and what of it's in the way
function tombAt(random, x, y, along, turnOf, kind) {
    const yaw = random.range(-0.06, 0.06);
    const [long, wide] = kind === "chest" ? [random.range(1.8, 2), random.range(0.8, 1)] : [random.range(1.75, 1.9), random.range(0.75, 0.9)];
    const lid = random.pickWeighted(
        [
            ["askew", 0.55],
            ["cracked", 0.2],
            ["whole", 0.25],
        ],
        ([, weight]) => weight,
    )[0];
    const part = { part: "tomb", kind, x, y, long, wide, h: kind === "chest" ? random.range(0.85, 1.05) : random.range(0.7, 0.85), turn: turnOf(yaw), lid, skew: random.range(0.26, 0.52) * random.pick([-1, 1]), shift: random.range(0.2, 0.45), seed: random.seed() };

    return { part, solid: grown(boundsOf(cornersOf(x, y, along(yaw), long + 0.3, wide + 0.3)), 0.05) };
}

// How far each kind of part reaches each way from its middle (metres, across and deep: so it's a
// piece of its own, stood on the ground where it is), for those laid out at a point
const REACH = Object.freeze({ pit: [8.8, 8.8], stores: [2.2, 2.2], cart: [3, 3], stone: [1.6, 1.6], altar: [2.4, 1.4], plinth: [3.2, 3.2], figure: [1.2, 1.2], brazier: [0.6, 0.6], backwall: [6.8, 1.2], torch: [0.4, 0.4], column: [1, 1], bones: [2, 2], brokenTower: [7.2, 7.2], gatepost: [0.8, 0.8], gate: [2.6, 2.6], grave: [3.2, 3.2], tomb: [3, 3], mausoleum: [5.2, 5.6], obelisk: [1.4, 1.4] });

/**
 * A part's middle and size, laid out ([x, y, w, d] metres, from its site's north-west corner):
 * those laid out as a rectangle (walls, crags), or at a point.
 */
export function extentOf(part) {
    if (part.x0 !== undefined) {
        return [(part.x0 + part.x1) / 2, (part.y0 + part.y1) / 2, part.x1 - part.x0, part.y1 - part.y0];
    }

    const [w, d] = part.r ? [part.r * 2, part.r * 2] : (REACH[part.part] ?? [1, 1]);

    return [part.x, part.y, part.w && part.part !== "stone" ? Math.max(w, part.w) : w, part.d && part.part !== "stone" ? Math.max(d, part.d) : d];
}
