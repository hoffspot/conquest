// The trees seen from afar (the terrain plan's §9 row 8): past where the chunks' own trees are
// drawn, each tree the land would grow there as one card turned to face the camera, its crown's
// outline its kind's (round, conical, columnar, flat-topped), in its kind's colour. Where the trees
// stand is worked out as the overworld plants them (core/overworld.js #plant: the same random
// numbers, chunk by chunk), so each card stands where its tree will when the player comes near;
// only what the chunk itself would keep them off (its roads, its rivers' banks, what's built) isn't
// known from afar. Pure: worked out in a worker (silhouette-worker.js), drawn by silhouettes.js.

import { FLORA } from "../../core/overworld.js";
import { createRandom } from "../../core/random.js";
import { HOME_TREES } from "../../core/setpieces/pieces.js";
import { heightAt } from "../../core/terrain/height.js";
import { CELL, CELLS, CHUNK, WATER } from "../../core/worldplan/plan.js";
import { BIOMES, RACES } from "../../core/worldplan/races.js";

/**
 * Each kind of tree from afar: how tall (metres, at size 1), how wide its card (a share of its
 * height), its crown's outline (FORMS), and its leaves' colour (sRGB).
 */
export const FAR_TREES = Object.freeze({
    oak: { height: 8, width: 0.8, form: "round", colour: 0x4c6a2e },
    beech: { height: 9, width: 0.7, form: "round", colour: 0x557a32 },
    birch: { height: 8.5, width: 0.55, form: "oval", colour: 0x799a46 },
    pine: { height: 9.5, width: 0.5, form: "top", colour: 0x3e5c36 },
    spruce: { height: 8.5, width: 0.45, form: "cone", colour: 0x2e4a32 },
    poplar: { height: 10.8, width: 0.32, form: "oval", colour: 0x5c7e38 },
    apple: { height: 4.7, width: 0.95, form: "round", colour: 0x587a34 },
    acacia: { height: 6.2, width: 1.2, form: "flat", colour: 0x6c7a38 },
    ironbark: { height: 5.7, width: 0.85, form: "round", colour: 0x4a4a30 },
    willow: { height: 8, width: 0.9, form: "round", colour: 0x7a8a48 },
    silverbark: { height: 12.5, width: 0.55, form: "oval", colour: 0x94ac98 },
    nightspire: { height: 10.2, width: 0.42, form: "cone", colour: 0x3a2e48 },
});

/** The crowns' outlines, as the shader knows them. */
export const FORMS = Object.freeze({ round: 0, oval: 1, cone: 2, top: 3, flat: 4 });

/** How many numbers each tree takes: x, y (up), z, height, width, form, and its colour (light's r, g, b). */
export const TREE_FLOATS = 9;

/**
 * How many numbers each corner of a tree's card takes: its tree's foot (x, y, z), which corner it
 * is (across: -0.5 or 0.5; up: 0 or 1), and its tree's height, width, form and colour.
 */
export const CARD_FLOATS = 11;

// As the overworld plants them: tried every so many metres in a chunk, so many in a hundred
// square metres, kept clear of the places still to be built by so much (core/overworld.js)
const GRID = 4;
const HOME_SHARE = 0.7;
const CLEAR_OF_PLACES = 12;

// A hex colour's light (linear) components
const lightOf = (hex) =>
    [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((byte) => {
        const c = byte / 255;

        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });

const LOOKS = Object.fromEntries(Object.entries(FAR_TREES).map(([kind, look]) => [kind, { ...look, light: lightOf(look.colour), shape: FORMS[look.form] }]));

const cellAt = (v) => Math.min(CELLS - 1, Math.max(0, Math.floor(v / CELL)));

/**
 * The trees from `from` to `reach` metres round (x, z) as the overworld would plant them, but for
 * the start town's square (`town`: [x0, y0, x1, y1]) and where places are to be built: a
 * Float32Array of TREE_FLOATS numbers a tree.
 */
export function gatherTrees(plan, { x, z, reach, from = 0, town = null }) {
    const out = [];
    const clearings = [
        ...plan.places.map(({ at, radius }) => ({ at, radius: radius + CLEAR_OF_PLACES })),
        ...plan.sites.map(({ at }) => ({ at, radius: 40 + CLEAR_OF_PLACES })),
    ].filter(({ at, radius }) => Math.hypot(at[0] - x, at[1] - z) < reach + radius);
    const [c0, c1] = [Math.max(0, Math.floor((x - reach) / CHUNK)), Math.min(CELLS * (CELL / CHUNK) - 1, Math.floor((x + reach) / CHUNK))];
    const [r0, r1] = [Math.max(0, Math.floor((z - reach) / CHUNK)), Math.min(CELLS * (CELL / CHUNK) - 1, Math.floor((z + reach) / CHUNK))];
    const steps = CHUNK / GRID;

    for (let cy = r0; cy <= r1; cy++) {
        for (let cx = c0; cx <= c1; cx++) {
            const [x0, y0] = [cx * CHUNK, cy * CHUNK];
            const near = Math.hypot(Math.max(0, Math.abs(x0 + CHUNK / 2 - x) - CHUNK / 2), Math.max(0, Math.abs(y0 + CHUNK / 2 - z) - CHUNK / 2));
            const far = Math.hypot(Math.abs(x0 + CHUNK / 2 - x) + CHUNK / 2, Math.abs(y0 + CHUNK / 2 - z) + CHUNK / 2);

            if (near > reach || far < from) {
                continue;
            }

            // (The same random numbers the overworld plants this chunk with, in the same order)
            const random = createRandom((Math.imul(cx + 1, 73856093) ^ Math.imul(cy + 1, 19349663) ^ Math.imul(plan.seed, 83492791)) >>> 0);

            for (let gy = 0; gy < steps; gy++) {
                for (let gx = 0; gx < steps; gx++) {
                    const tx = Math.min(x0 + CHUNK - 1, Math.max(x0 + 1, Math.round(x0 + (gx + random.next()) * GRID)));
                    const ty = Math.min(y0 + CHUNK - 1, Math.max(y0 + 1, Math.round(y0 + (gy + random.next()) * GRID)));
                    const [chance, pick, size] = [random.next(), random.next(), random.range(0.85, 1.3)];

                    random.next();

                    const cell = cellAt(ty) * CELLS + cellAt(tx);
                    const flora = FLORA[BIOMES[plan.biome[cell]].id];
                    const distance = Math.hypot(tx - x, ty - z);

                    if (chance >= (flora.density * GRID * GRID) / 100 || distance > reach || distance < from || plan.water[cell] === WATER.sea || plan.water[cell] === WATER.lake) {
                        continue;
                    }

                    if ((town && tx >= town[0] && ty >= town[1] && tx < town[2] && ty < town[3]) || clearings.some(({ at, radius }) => Math.hypot(at[0] - tx, at[1] - ty) < radius)) {
                        continue;
                    }

                    // (In a people's homeland, most of the trees are their own)
                    const owner = plan.territory?.[cell];
                    const own = owner ? HOME_TREES[RACES[owner - 1].id] : null;
                    const kinds = own && (pick * 7.31) % 1 < HOME_SHARE ? [own] : flora.kinds;
                    const look = LOOKS[kinds[Math.floor(pick * kinds.length)]] ?? LOOKS.oak;

                    out.push(tx, heightAt(plan, tx, ty), ty, look.height * size, look.width, look.shape, ...look.light);
                }
            }
        }
    }

    return Float32Array.from(out);
}

// Each card's corners, across and up
const CORNERS = [
    [-0.5, 0],
    [0.5, 0],
    [-0.5, 1],
    [0.5, 1],
];

/**
 * The trees (gatherTrees's) as cards, all in one mesh: four corners a tree (`vertices`,
 * CARD_FLOATS numbers each) and two triangles (`index`). Not one card drawn as many times as there
 * are trees: the browser tests' software renderer draws instances almost one at a time.
 */
export function treeCards(trees) {
    const count = trees.length / TREE_FLOATS;
    const vertices = new Float32Array(count * 4 * CARD_FLOATS);
    const index = count * 4 > 65536 ? new Uint32Array(count * 6) : new Uint16Array(count * 6);

    for (let t = 0; t < count; t++) {
        const tree = trees.subarray(t * TREE_FLOATS, (t + 1) * TREE_FLOATS);

        for (let c = 0; c < 4; c++) {
            const at = (t * 4 + c) * CARD_FLOATS;

            vertices.set(tree.subarray(0, 3), at);
            vertices.set(CORNERS[c], at + 3);
            vertices.set(tree.subarray(3), at + 5);
        }

        index.set([0, 1, 2, 2, 1, 3].map((k) => t * 4 + k), t * 6);
    }

    return { vertices, index };
}
