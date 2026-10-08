// Each people's works (docs/WAR.md *The works*; the world plan's: worldplan/settle.js workings),
// laid out as the sites no people builds are (setpieces/neutral.js): what stands where, what of it
// stands in the way, and the open ground in it. Each is worked as such places were before
// there were engines to do it (the research behind them):
// - **a lumber mill**, in a clearing in the woods, the trees standing round it on three sides
//   and the stumps of those felled between: a saw shed (an open roof on posts over two tall
//   trestles, a log laid along them and a long two-man saw standing in its cut, as a pit saw's
//   worked over a saw pit), the logs dragged in piled on their skids beside it, the planks sawn
//   from them stacked to dry with sticks between their courses; a woodcutter's lodge, its
//   firewood stacked along its wall, a chopping block, a heap of sawdust, and a charcoal clamp
//   smoking under its earth;
// - **a mine**, a hole in the ground: a pit dug down to the shaft, shored round with timber, a
//   windlass over the shaft to wind up the ore in its bucket, the spoil heaped round the rim; the
//   ore, red with iron, heaped by a bloomery's clay furnace, its bellows beside it under a roof,
//   charcoal for it heaped by it, and a shed for the tools;
// - **a quarry**, stone round it on three sides: its faces cut back in benches, a block half
//   split from them, a shear-legs crane over the face winding a block up; rough blocks stacked
//   on its floor, dressed ones by the masons' lodge (a lean-to over a banker, a block on it),
//   their chippings heaped, a block on a sledge, boulders round its back.
// Each has its yard at its front, where its goods are loaded on the wagons, and the posts its
// guards keep and the round they walk (host.js musters them).
//
// Laid out facing south (its front, where it's come at from, towards its road or its trail), in
// metres from its north-west corner; sites.js turns it to face its way. Pure, and the same in
// every browser: the seeded random numbers (random.js) and exact maths (exact.js) only.

import { cos, sin } from "../exact.js";
import { homeTree, TREE_KINDS, TREE_VARIANTS } from "./pieces.js";

/** Each kind of works' size (plots across and deep, 4 m each): a mill 36 by 32 m, a mine 32 by 32, a quarry 36 by 32. */
export const WORKS_SIZE = Object.freeze({ "lumber mill": [9, 8], mine: [8, 8], quarry: [9, 8] });

/**
 * A lumber mill as it's laid out (metres): the ring of trees round it (`ring`: how far apart along
 * it, how far each is set off its place, how much of its depth from the front's left open), the
 * stumps of those felled between (`stumps`), its saw shed (`shed`: how wide and deep), the log
 * deck beside it, and its planks' stacks (`stacks`).
 */
export const MILL = Object.freeze({ ring: { every: 4.6, jitter: 0.8, open: 9 }, stumps: [6, 10], shed: [11, 6], stacks: [2, 3] });

/** A mine as it's laid out (metres): its pit (how far round its floor, how deep, how steep its banks), and how many spoil heaps round its rim. */
export const MINE = Object.freeze({ pit: { radius: 4.6, drop: 3.6, ease: 2.6 }, heaps: [3, 4] });

/**
 * A quarry as it's laid out (metres): its faces' rock (`face`: how thick, how high at the back and
 * the sides), how many stacks of rough blocks (`blocks`), and how many boulders round its back.
 */
export const QUARRY = Object.freeze({ face: { thick: 5, back: 5.5, sides: 4.2 }, blocks: [3, 5], boulders: [3, 6] });

// The trees a lumber mill's felling, as the woods round it have them: the broadleaved and the
// conifers of the land (TREE_KINDS: any of the first TREE_VARIANTS but the orchard's apples), or
// the people's own (homeTree)
const WOODLAND = TREE_KINDS.slice(0, TREE_VARIANTS).flatMap(([kind], k) => (kind === "apple" || kind === "poplar" ? [] : [k]));

const TAU = 6.283185307179586;
const box = (x, y, w, d) => [x - w / 2, y - d / 2, x + w / 2, y + d / 2];

/**
 * A works laid out (its `kind`, its `seed`, its people: `people`): { size, parts (each { part,
 * ... } in metres from its north-west corner: what the art builds, art/kits/works.js), solid
 * ([[x0, y0, x1, y1]] metres: what no one walks through), heart ([x, y]: open ground in its
 * middle), yard ([x, y]: where its wagons are loaded, at its front), posts ([[x, y]]: where its
 * guards stand), round ([[x, y]]: the round its other guards walk), pad (a mine's pit: { at,
 * radius, raise, ease }) }; or null if the kind isn't one.
 */
export function layoutWorks(kind, random, width, depth, people) {
    return LAYOUTS[kind]?.(random, width, depth, people) ?? null;
}

const LAYOUTS = {
    // A lumber mill (MILL): a clearing in the woods
    "lumber mill"(random, width, depth, people) {
        const cx = width / 2;
        const parts = [];
        const solid = [];
        const { ring, shed } = MILL;

        // The trees round it, at the back and down its sides, its front open; the stumps of
        // those felled between them and the shed
        const tree = (x, y) => {
            parts.push({ part: "tree", x: x + random.range(-ring.jitter, ring.jitter), y: y + random.range(-ring.jitter, ring.jitter), variant: homeTree(people, random.pick(WOODLAND)) });
        };

        for (let x = 2; x <= width - 2; x += ring.every) {
            tree(x, 1.8);
        }

        for (let y = 1.8 + ring.every; y < depth - ring.open; y += ring.every) {
            tree(1.8, y);
            tree(width - 1.8, y);
        }

        for (let k = random.int(...MILL.stumps); k > 0; k--) {
            const [x, y] = [random.range(4.5, width - 4.5), random.range(4.2, depth - 6)];

            if (Math.abs(x - cx) > shed[0] / 2 + 1 || y > 16) {
                parts.push({ part: "stump", x, y, r: random.range(0.3, 0.5), seed: random.seed() });
            }
        }

        // The saw shed in the middle at the back: a log on its trestles under it, the saw in it
        const [sx0, sy0, sx1, sy1] = [cx - shed[0] / 2, 7, cx + shed[0] / 2, 7 + shed[1]];

        parts.push({ part: "sawshed", x0: sx0, y0: sy0, x1: sx1, y1: sy1, seed: random.seed() });
        solid.push(box(cx, (sy0 + sy1) / 2, shed[0] - 2.4, 1.2));

        for (const x of [sx0 + 0.3, sx1 - 0.3]) {
            for (const y of [sy0 + 0.3, sy1 - 0.3]) {
                solid.push(box(x, y, 0.8, 0.8));
            }
        }

        // Its logs on their skids to the west, its planks stacked to dry to the east
        parts.push({ part: "logdeck", x0: 4.5, y0: 6, x1: sx0 - 1.2, y1: 12.5, seed: random.seed() });
        solid.push([4.5, 6, sx0 - 1.2, 12.5]);

        for (let k = 0, count = random.int(...MILL.stacks); k < count; k++) {
            const [x, y] = [sx1 + 4 + (k % 2) * 3.2, 7.5 + k * 3.4];

            parts.push({ part: "planks", x, y, w: 4.6, d: 1.5, h: random.range(0.9, 1.5), seed: random.seed() });
            solid.push(box(x, y, 4.8, 1.7));
        }

        // The woodcutters' lodge at the front to the west, its door to the yard, its firewood
        // stacked along its back; the chopping block by it
        parts.push({ part: "lodge", x0: 4.5, y0: 16, x1: 10.5, y1: 21, seed: random.seed() });
        solid.push([4.5, 16, 10.5, 21]);
        parts.push({ part: "cordwood", x0: 4.6, y0: 14.6, x1: 10.4, y1: 15.6, seed: random.seed() });
        solid.push([4.6, 14.6, 10.4, 15.6]);
        parts.push({ part: "block", x: 12.6, y: 19.5, seed: random.seed() });
        solid.push(box(12.6, 19.5, 0.8, 0.8));

        // Sawdust heaped by the shed, and the charcoal clamp smoking at the front to the east
        parts.push({ part: "sawdust", x: cx + random.range(-2, 2), y: sy1 + 2.4, r: random.range(1.3, 1.8), seed: random.seed() });
        parts.push({ part: "clamp", x: width - 7, y: depth - 9.5, r: 2.2, seed: random.seed() });
        solid.push(box(width - 7, depth - 9.5, 4, 4));

        return {
            parts,
            solid,
            heart: [cx, sy1 + 5],
            yard: [cx, depth - 4],
            posts: [
                [cx - 4.5, depth - 1.5],
                [cx + 4.5, depth - 1.5],
                [sx0 - 0.8, sy1 + 1.2],
                [sx1 + 0.8, sy1 + 1.2],
            ],
            round: ringRound(cx, depth / 2 + 2, width / 2 - 5, depth / 2 - 6, solid, [width, depth]),
        };
    },

    // A mine (MINE): a hole in the ground, the windlass over its shaft
    mine(random, width, depth) {
        const cx = width / 2;
        const { pit } = MINE;
        const [px, py] = [cx, 12.5];
        const reach = pit.radius + pit.ease;
        const parts = [];
        // (The pit stood in the way as a cross over it, its banks too steep to walk between)
        const solid = [box(px, py, reach * 2 + 0.4, reach * 1.2), box(px, py, reach * 1.2, reach * 2 + 0.4)];

        // The pit, shored round with timber, steps down its front; the shaft at its middle, the
        // windlass over it
        parts.push({ part: "minepit", x: px, y: py, radius: pit.radius, drop: pit.drop, ease: pit.ease, seed: random.seed() });
        parts.push({ part: "shaft", x: px, y: py, seed: random.seed() });

        // The spoil heaped round its rim (at the back and sides, not its front), each between two
        // of the stops of its guards' round (ringRound's, every sixth of the way round from its
        // front), so they've a way round between them
        const slots = random.shuffle([Math.PI, (Math.PI * 4) / 3, (Math.PI * 5) / 3, Math.PI * 2]).slice(0, random.int(...MINE.heaps));

        for (const slot of slots) {
            const a = slot + random.range(-0.08, 0.08);
            const out = reach + random.range(2.2, 3.2);
            const [x, y] = [px + cos(a) * out, py + sin(a) * out];
            const r = random.range(1.8, 2.6);

            parts.push({ part: "spoil", x, y, r, h: random.range(1.3, 2.2), seed: random.seed() });
            solid.push(box(x, y, r * 1.6, r * 1.6));
        }

        // The ore heaped at the front, the bloomery beside it, its charcoal, and the tool shed
        // across the yard
        parts.push({ part: "ore", x: cx - 5, y: depth - 7, r: 1.5, seed: random.seed() });
        solid.push(box(cx - 5, depth - 7, 2.6, 2.6));
        parts.push({ part: "bloomery", x: 5.5, y: depth - 9, w: 4.6, d: 4, seed: random.seed() });
        solid.push(box(5.5, depth - 9, 4.4, 3.6));
        parts.push({ part: "charcoal", x: 5, y: depth - 4.2, r: 1.2, seed: random.seed() });
        solid.push(box(5, depth - 4.2, 2, 2));
        parts.push({ part: "toolshed", x0: width - 9, y0: depth - 11, x1: width - 4, y1: depth - 6.5, seed: random.seed() });
        solid.push([width - 9, depth - 11, width - 4, depth - 6.5]);
        parts.push({ part: "barrow", x: cx + 3, y: depth - 9, turn: random.range(-0.6, 0.6), seed: random.seed() });

        return {
            parts,
            solid,
            heart: [cx, py + reach + 2.4],
            yard: [cx, depth - 3.5],
            pad: { at: [px, py], radius: pit.radius, raise: -pit.drop, ease: pit.ease },
            posts: [
                [cx - 4.5, depth - 1.5],
                [cx + 4.5, depth - 1.5],
                [px - reach - 1, py + reach - 1],
                [px + reach + 1, py + reach - 1],
            ],
            round: ringRound(px, py, reach + 1.6, reach + 1.6, solid, [width, depth]),
        };
    },

    // A quarry (QUARRY): stone round it on three sides, cut back in benches
    quarry(random, width, depth) {
        const cx = width / 2;
        const { face } = QUARRY;
        const parts = [];
        const solid = [];
        const floor = [face.thick + 1, face.thick + 1, width - face.thick - 1, depth - 9];

        // Its faces: at the back, and down each side as far as its floor goes, a half-split
        // block in the back one
        parts.push({ part: "face", x0: 1, y0: 1, x1: width - 1, y1: 1 + face.thick, h: face.back, side: "back", seed: random.seed() });
        parts.push({ part: "face", x0: 1, y0: 1 + face.thick, x1: 1 + face.thick, y1: floor[3], h: face.sides, side: "west", seed: random.seed() });
        parts.push({ part: "face", x0: width - 1 - face.thick, y0: 1 + face.thick, x1: width - 1, y1: floor[3], h: face.sides, side: "east", seed: random.seed() });
        solid.push([1, 1, width - 1, 1 + face.thick], [1, 1 + face.thick, 1 + face.thick, floor[3]], [width - 1 - face.thick, 1 + face.thick, width - 1, floor[3]]);

        // The crane over the back face, winding a block up from the floor
        parts.push({ part: "derrick", x: cx + random.range(-3, 3), y: floor[1] + 1.8, seed: random.seed() });

        // Rough blocks stacked on its floor, out of the crane's way
        for (let k = 0, count = random.int(...QUARRY.blocks); k < count; k++) {
            const x = k % 2 ? random.range(floor[2] - 6, floor[2] - 2.5) : random.range(floor[0] + 2.5, floor[0] + 6);
            const y = floor[1] + 4 + Math.floor(k / 2) * 4.2 + random.range(-0.5, 0.5);

            parts.push({ part: "blocks", x, y, w: 3, d: 2.2, seed: random.seed() });
            solid.push(box(x, y, 3, 2.4));
        }

        // The masons' lodge at the front to the west, the dressed stone stacked by it; their
        // chippings heaped across the yard; a block on its sledge
        parts.push({ part: "lodge", lean: true, x0: 2, y0: depth - 8.5, x1: 9, y1: depth - 3.5, seed: random.seed() });
        solid.push([2, depth - 8.5, 9, depth - 3.5]);
        parts.push({ part: "ashlar", x: 11.5, y: depth - 6, w: 2.6, d: 1.6, seed: random.seed() });
        solid.push(box(11.5, depth - 6, 2.8, 1.8));
        parts.push({ part: "chippings", x: width - 6, y: depth - 5.5, r: random.range(1.8, 2.3), h: random.range(0.9, 1.3), seed: random.seed() });
        solid.push(box(width - 6, depth - 5.5, 3.2, 3.2));
        parts.push({ part: "sledge", x: cx + 4, y: depth - 10.5, turn: random.range(-0.4, 0.4), seed: random.seed() });
        solid.push(box(cx + 4, depth - 10.5, 1.8, 1.8));

        // Boulders round its back and sides, outside its faces
        for (let k = random.int(...QUARRY.boulders); k > 0; k--) {
            const side = random.int(0, 2);
            const [x, y] = [
                [random.range(2, width - 2), random.range(-2.5, -0.5)],
                [random.range(-2.5, -0.5), random.range(2, depth - 10)],
                [random.range(width + 0.5, width + 2.5), random.range(2, depth - 10)],
            ][side];

            parts.push({ part: "boulder", x, y, r: random.range(0.5, 1), seed: random.seed() });
        }

        return {
            parts,
            solid,
            heart: [cx, floor[3] - 3],
            yard: [cx, depth - 3.5],
            posts: [
                [cx - 4.5, depth - 1.5],
                [cx + 4.5, depth - 1.5],
                [floor[0] + 1, floor[1] + 1.5],
                [floor[2] - 1, floor[1] + 1.5],
            ],
            round: ringRound(cx, (floor[1] + floor[3]) / 2 + 1, (floor[2] - floor[0]) / 2 - 1.2, (floor[3] - floor[1]) / 2, solid, [width, depth]),
        };
    },
};

// A round of six stops about (x, y), `rx` across and `ry` deep, starting at the front; any that
// would stand in the way of something (`solid`) moved out a little, or else in, till it's clear
// of it by a step, and kept in its plots (`bounds`: [width, depth])
function ringRound(x, y, rx, ry, solid, [width, depth]) {
    const clear = ([px, py]) => px > 1 && py > 1 && px < width - 1 && py < depth - 1 && solid.every(([x0, y0, x1, y1]) => px < x0 - 0.6 || px > x1 + 0.6 || py < y0 - 0.6 || py > y1 + 0.6);
    const tries = [1, 1.1, 0.9, 1.2, 0.8, 1.3, 0.7, 1.4, 0.6, 1.5];

    return Array.from({ length: 6 }, (_, k) => {
        const a = TAU / 4 + (k / 6) * TAU;
        const out = tries.find((each) => clear([x + cos(a) * rx * each, y + sin(a) * ry * each])) ?? 1;

        return [Math.round((x + cos(a) * rx * out) * 100) / 100, Math.round((y + sin(a) * ry * out) * 100) / 100];
    });
}
