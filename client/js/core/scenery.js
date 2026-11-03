// The places drawn from a fixed scene of their own (a bought castle: Bellhaven, the White Castle,
// docs/WORLD.md), each a map apart from the world, gone into from a landmark in it. A scene's map
// is walked as its walk has it (core/walk.js: baked from its art by the model pipeline), its
// squares those of the walk's grid: a square with a floor is walked on, one without is blocked
// (a wall, a tower, the chasm under its bridge). Plain data, the same for everyone, with the art or
// without it: the art (its licensed model) is only drawn, by world/scenery3d.js.

import BELLHAVEN from "./scenery/bellhaven.walk.js";
import { FACING } from "./interiors.js";
import { GROUND } from "./setpieces/pieces.js";
import { floorAt, readWalk, squareOf } from "./walk.js";

/**
 * Where each scene's map is drawn in the 3D world: beyond the sealed rooms' (rare.js VAULT), a
 * column each (its `column`), `step` apart: each the same wherever and whenever it's made.
 */
export const SCENERY_ORIGINS = Object.freeze({ x: 34000, step: 1000 });

/**
 * The scenes, by id: each one's name, its walk (as the pipeline wrote it), its models in the
 * catalog (client/models/assets.json: drawn there, and seen from the world round it), its column
 * of SCENERY_ORIGINS, where one comes in (`arrive`: the scene's own metres, [x, z]) and the way
 * they face, and the way back out (`out`: [x0, z0, x1, z1], the scene's metres: its floor's
 * squares in that box). Bellhaven's way in is its bridge's foot, a court at 67 m with stairs down
 * either side to the ground below the crag: come in at its middle, facing the castle across the
 * chasm, and out by its southern edge, the road's end in the world.
 */
export const SCENERY = Object.freeze({
    bellhaven: Object.freeze({
        name: "Bellhaven",
        walk: BELLHAVEN,
        model: "scenery-bellhaven",
        far: "scenery-bellhaven-far",
        column: 0,
        arrive: [0, 64],
        facing: FACING.n,
        out: [-20, 75, 20, 77],
    }),
});

/**
 * How far two floors side by side can be apart and still be one floor to stand on, eased from
 * one to the next (metres: the walk's step, utilities/blenderpipeline/lib/walk.js `climb`).
 */
export const STEP = 0.8;

// Each scene's walk read (its heights out of base64), once
const read = new Map();

/** A scene's walk, read (core/walk.js readWalk). */
export function walkOf(scenery) {
    if (!read.has(scenery)) {
        read.set(scenery, readWalk(SCENERY[scenery].walk));
    }

    return read.get(scenery);
}

/** Where a scene's map is in the 3D world: its corner ([x, z] metres). */
export function sceneryOrigin(scenery) {
    return [SCENERY_ORIGINS.x + SCENERY[scenery].column * SCENERY_ORIGINS.step, 0];
}

/**
 * The square of a scene's map a point of the scene is on ([x, z], the scene's own metres, as its
 * art and its walk are laid out: the map's squares are counted from the walk's `origin`).
 */
export function squareIn(scenery, at) {
    return squareOf(walkOf(scenery), at);
}

/**
 * The height of the floor at a point of a scene's map (metres from its corner: x, y), eased from
 * one square's floor to the next (the four squares' round it, those within a STEP of its own),
 * so whoever walks it doesn't jolt up and down each square; off any floor (a wall, the chasm),
 * those beside it, or the lowest of its floors.
 */
export function heightOn(walk, x, y) {
    const own = floorAt(walk, 0, Math.floor(x), Math.floor(y));
    const [fx, fy] = [x - 0.5, y - 0.5];
    const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
    const [tx, ty] = [fx - x0, fy - y0];
    let [sum, weights] = [0, 0];

    for (const [dx, dy, weight] of [
        [0, 0, (1 - tx) * (1 - ty)],
        [1, 0, tx * (1 - ty)],
        [0, 1, (1 - tx) * ty],
        [1, 1, tx * ty],
    ]) {
        const floor = weight > 0 ? floorAt(walk, 0, x0 + dx, y0 + dy) : null;

        if (floor !== null && (own === null || Math.abs(floor - own) <= STEP)) {
            sum += floor * weight;
            weights += weight;
        }
    }

    return weights > 0 ? sum / weights : (own ?? walk.levels[0].low);
}

/**
 * A scene's map (its id `id`, named `name`, the place `building` it's the inside of): its walk's
 * grid as squares (grid.js squaresOf), a square with no floor blocked and blocking sight, every
 * one stone underfoot and raised (battle.js: no blow struck between two whose floors are too far
 * one over the other, a ledge's top and its foot); the floor's height anywhere on it (heightOn);
 * and where it's drawn (`origin`: its corner, the walk's origin; `offset`, where the scene's own
 * metres are from it, for its art).
 */
export function sceneryMap(scenery, id, { name = SCENERY[scenery].name, building = null } = {}) {
    const walk = walkOf(scenery);
    const [width, height] = walk.size;
    const blocked = (x, y) => floorAt(walk, 0, x, y) === null;

    return {
        id,
        name,
        width,
        height,
        origin: sceneryOrigin(scenery),
        offset: [-walk.origin[0], -walk.origin[1]],
        scenery,
        walk,
        building,
        squares: { width, height, blocked, opaque: blocked, ground: () => GROUND.courtyard, raised: () => true },
        heightAt: (x, y) => heightOn(walk, x, y),
    };
}

/**
 * A scene's map's ways in and out: where one comes in (`arrive`, a square, and `facing`), and the
 * squares that take them back out (`out`: its floor's in SCENERY's box, row by row).
 */
export function sceneryWays(scenery) {
    const walk = walkOf(scenery);
    const { arrive, facing, out: [x0, z0, x1, z1] } = SCENERY[scenery];
    const [ax, ay] = squareIn(scenery, [x0, z0]);
    const [bx, by] = squareIn(scenery, [x1, z1]);
    const out = [];

    for (let y = ay; y < by; y++) {
        for (let x = ax; x <= bx; x++) {
            if (floorAt(walk, 0, x, y) !== null) {
                out.push([x, y]);
            }
        }
    }

    return { arrive: squareIn(scenery, arrive), facing, out };
}
