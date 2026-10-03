// Great lone trees (the terrain plan's M7j, §9 row 8, "gnarled great lone trees"): here and there
// in the open land, an old oak half again the height of the trees round it standing on its own,
// its great crooked limbs spreading wide, as an old field tree does in a pasture or on a heath.
// One tried in every square of `cell` metres, in its own spot in it, kept if its land is open
// land, the land's gentle there, there's no water, and it's clear of the settlements, the places
// and any field's sown strips (about 200 to 250 a world); the land's other trees keep `clear`
// metres off it, so it stands alone.
//
// Worked out from the plan alone, so the overworld (which plants it and blocks its squares) and
// the trees seen from afar (world/far/trees.js) find the same ones, and the same trees round them
// kept off. Exact maths only (it's in core: what's blocked is the rules').

import { TAU } from "./exact.js";
import { CROP, fieldAt } from "./fields.js";
import { hashOf } from "./noise.js";
import { TREE_KINDS } from "./setpieces/pieces.js";
import { heightAt } from "./terrain/height.js";
import { BIOME, BIOMES, CELL, CELLS, CHUNK, WATER, WORLD_SIZE } from "./worldplan/plan.js";

/**
 * The lone trees: how big a square each is tried in (metres), and how likely one is in each land
 * (none in the others); how far the land's other trees keep off (metres); how much the land may
 * rise across its crown (metres, over `span` metres either way); how far it keeps from a
 * settlement's edge or a place (metres); and its size (as grown: about 13 to 16 m high at 1).
 */
export const LONE_TREES = Object.freeze({
    cell: 128,
    lands: Object.freeze({ meadow: 0.55, farmland: 0.45, heath: 0.45, tundra: 0.2 }),
    clear: 16,
    rise: 1.6,
    span: 6,
    keep: Object.freeze({ place: 24, site: 64 }),
    size: Object.freeze([0.95, 1.2]),
});

/** The variants (TREE_KINDS indices) a lone tree is grown as. */
export const LONE_VARIANTS = Object.freeze(TREE_KINDS.flatMap(([kind], k) => (kind === "greatoak" ? [k] : [])));

const made = new WeakMap();
const cellAt = (v) => Math.min(CELLS - 1, Math.max(0, Math.floor(v / CELL)));
const odds = new Map(Object.entries(LONE_TREES.lands).map(([id, chance]) => [BIOMES.findIndex((biome) => biome.id === id), chance]));

/**
 * A world plan's lone trees: [{ x, y (its trunk, where four squares meet: whole metres, two or
 * more metres inside its chunk), variant (TREE_KINDS index), size, turn (radians) }], the same
 * every time, worked out the first time they're wanted and kept with the plan. Not every one is
 * planted: the overworld also keeps them off its roads, its rivers' banks, what's built and the
 * camps (as it does any tree); but the land's other trees keep off every one.
 */
export function loneTreesOf(plan) {
    if (!made.has(plan)) {
        made.set(plan, Object.freeze(placed(plan)));
    }

    return made.get(plan);
}

/** The lone trees (loneTreesOf's) within `reach` metres of a box [x0, y0, x1, y1]. */
export function loneTreesNear(plan, [x0, y0, x1, y1], reach = 0) {
    return loneTreesOf(plan).filter(({ x, y }) => x > x0 - reach && x < x1 + reach && y > y0 - reach && y < y1 + reach);
}

/** Whether a tree at (x, y) would stand too near one of `lone` (loneTreesNear's) to stay. */
export const nearLone = (lone, x, y) => lone.some((tree) => Math.abs(tree.x - x) < LONE_TREES.clear && Math.abs(tree.y - y) < LONE_TREES.clear && (tree.x - x) * (tree.x - x) + (tree.y - y) * (tree.y - y) < LONE_TREES.clear * LONE_TREES.clear);

function placed(plan) {
    const { cell, rise, span, keep } = LONE_TREES;
    const across = Math.floor(WORLD_SIZE / cell);
    const trees = [];

    for (let j = 0; j < across; j++) {
        for (let i = 0; i < across; i++) {
            // (Its spot in its square, kept a quarter of the way in from the square's sides, and two
            // metres inside its chunk, so the squares it fills are all its chunk's)
            const inside = (v, h) => {
                const at = Math.floor(v + cell / 4 + h * (cell / 2));
                const into = at % CHUNK;

                return into < 2 ? at + 2 - into : into > CHUNK - 2 ? at - (into - (CHUNK - 2)) : at;
            };
            const x = inside(i * cell, hashOf(i, j, plan.seed * 31 + 3));
            const y = inside(j * cell, hashOf(i, j, plan.seed * 31 + 5));
            const k = cellAt(y) * CELLS + cellAt(x);
            const chance = odds.get(plan.biome[k]) ?? 0;

            if (hashOf(i, j, plan.seed * 31 + 7) >= chance || plan.water[k] !== WATER.none) {
                continue;
            }

            // (Not where the land's more than gently sloping under its crown)
            const heights = [heightAt(plan, x - span, y - span), heightAt(plan, x + span, y - span), heightAt(plan, x - span, y + span), heightAt(plan, x + span, y + span), heightAt(plan, x, y)];

            if (Math.max(...heights) - Math.min(...heights) > rise) {
                continue;
            }

            // (Nor in a settlement or by a place, nor in a field's sown strips)
            const near = (at, radius) => Math.abs(at[0] - x) < radius && Math.abs(at[1] - y) < radius && (at[0] - x) * (at[0] - x) + (at[1] - y) * (at[1] - y) < radius * radius;

            if (plan.places.some(({ at, radius }) => near(at, radius + keep.place)) || plan.sites.some(({ at }) => near(at, keep.site))) {
                continue;
            }

            if (sownNear(plan, x, y)) {
                continue;
            }

            const h = hashOf(i, j, plan.seed * 31 + 11);

            trees.push({
                x,
                y,
                variant: LONE_VARIANTS[Math.floor(h * LONE_VARIANTS.length)],
                size: LONE_TREES.size[0] + ((h * 7.13) % 1) * (LONE_TREES.size[1] - LONE_TREES.size[0]),
                turn: ((h * 3.71) % 1) * TAU,
            });
        }
    }

    return trees;
}

// Whether any square within three metres of (x, y) is in a field's sown strip (as the overworld
// sows them: a block's farmed if the land at its middle is farmland)
function sownNear(plan, x, y) {
    for (let sy = y - 3; sy < y + 3; sy++) {
        for (let sx = x - 3; sx < x + 3; sx++) {
            const field = fieldAt(plan.seed, sx, sy);
            const [mx, my] = field.middle;

            if (field.crop !== CROP.none && plan.biome[cellAt(my) * CELLS + cellAt(mx)] === BIOME.farmland) {
                return true;
            }
        }
    }

    return false;
}
