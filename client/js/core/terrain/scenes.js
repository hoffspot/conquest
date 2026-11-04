// Where a fixed scene (Bellhaven's castle on its crag: core/scenery.js, docs/WORLD.md) is set into
// the world's land, from the world plan alone, as the volcano's crater is cut into it (height.js):
// turned to face the road it's come up to by, its own ground standing on the land.
//
// - Where it stands, the land's laid just under it: under the lowest of it over each patch of the
//   ground (its walk's `under`, baked from its art by the model pipeline), so the land never shows
//   through it, and it never stands over a gap.
// - Its own height's set by its road's end (`approach`, at its near ridge's end): that stands
//   `rise` above the land's own lie there, and the rest of it with it.
// - Toward its edges (within `ring`), the land comes up to its own lie where that's higher than
//   the scene's outlying ground: the land round it runs on into it.
// - Past its edges, where the scene's higher than the land round it (the crag's back, its ridge),
//   the land eases down from it to its own lie (within `band`); elsewhere it's the land's own.
// - Its road's end is a level pad at the ridge's height, out from the ridge into the land.
//
// Plain data and arithmetic (+ - * /, floor and square roots): the same in every browser and
// worker, wherever and whenever it's asked.

import BELLHAVEN from "../scenery/bellhaven.walk.js";
import { cos, sin } from "../exact.js";
import { floorAt, NONE, readWalk, squareOf } from "../walk.js";

/**
 * Each scene as it's set into the land, by id: its walk (core/scenery.js SCENERY's); `approach`,
 * the point of its near edge its road comes up to ([x, z]: the scene's own metres, as its art and
 * walk are laid out); `ridge`, the point of its floor its road's end is level with, and the road's
 * end, a pad `pad` metres wide each side of the approach, from there out; `rise`, how high above
 * the land's own lie its road's end stands (metres); `margin`, how far the land's laid under its
 * lowest surface (metres); `ring`, how far in from its edges the land may come up to its own lie
 * (metres); `band`, how far out past its edges the land eases back down to its own lie (metres).
 * Bellhaven's road comes up to the end of the ridge of earth that rises to its bridge's near end:
 * its near edge's middle, 88 m south of the bridge's middle. Its way in (`way`) is on the pad
 * there, at its near edge: the squares within `across` metres of the approach and `deep` metres in
 * from its edge are stepped onto to go in; they come back out `out` metres out from its edge, on
 * the pad; the door's glow is `height` metres high, across the way in.
 */
export const SCENES = Object.freeze({
    bellhaven: Object.freeze({ walk: BELLHAVEN, approach: Object.freeze([0, 88]), ridge: Object.freeze([0, 75]), pad: 8, rise: 20, margin: 1, ring: 60, band: 96, way: Object.freeze({ across: 3, deep: 6, out: 3, height: 4 }) }),
});

/**
 * How far into the pad its sides and its inner end ease to the land round them (metres), and how
 * far under the ridge's floor it's laid (metres: the ground drawn just under the floor drawn on it).
 */
const PAD = Object.freeze({ ease: 6, under: 0.05 });

// Each scene worked out once: its ground's patches, filled and lowered, its box, its middle
const MADE = new Map();

/**
 * A scene as it's set into the land: its id, walk (read), `box` ([x0, z0, x1, z1]: its patches'
 * extent, the scene's metres), `middle` ([x, z]), `reach` (from its middle to its box's corners,
 * metres), `ridge` (the height of the floor its road's end is level with, metres), and `low`
 * (a Float32Array, metres: each patch's height the land's laid under, the lowest of it there or
 * round it, so the land between patches never comes up through it either).
 */
export function sceneOf(id) {
    if (!MADE.has(id)) {
        const { walk: json, ridge } = SCENES[id];
        const walk = readWalk(json);
        const { square, origin, size, heights } = walk.under;
        const [width, depth] = size;
        let filled = Float32Array.from(heights, (h) => (h === NONE ? NaN : h / 100));

        // (Each patch nothing's over, at the corners of its ground, given its neighbours' lowest,
        // ring by ring in from those that have one)
        for (let left = filled.some(Number.isNaN); left; ) {
            const next = filled.slice();

            left = false;

            for (let z = 0; z < depth; z++) {
                for (let x = 0; x < width; x++) {
                    if (!Number.isNaN(filled[z * width + x])) {
                        continue;
                    }

                    let lowest = Infinity;

                    for (let dz = -1; dz <= 1; dz++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const [nx, nz] = [x + dx, z + dz];
                            const h = nx >= 0 && nz >= 0 && nx < width && nz < depth ? filled[nz * width + nx] : NaN;

                            lowest = Number.isNaN(h) ? lowest : Math.min(lowest, h);
                        }
                    }

                    next[z * width + x] = lowest === Infinity ? NaN : lowest;
                    left ||= lowest === Infinity;
                }
            }

            filled = next;
        }

        // (Each the lowest of itself and the eight round it: read between patches' middles, the
        // land over a patch is then never above the lowest of it)
        const low = new Float32Array(width * depth);

        for (let z = 0; z < depth; z++) {
            for (let x = 0; x < width; x++) {
                let lowest = Infinity;

                for (let dz = -1; dz <= 1; dz++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const [nx, nz] = [Math.min(width - 1, Math.max(0, x + dx)), Math.min(depth - 1, Math.max(0, z + dz))];

                        lowest = Math.min(lowest, filled[nz * width + nx]);
                    }
                }

                low[z * width + x] = lowest;
            }
        }

        const box = [origin[0], origin[1], origin[0] + width * square, origin[1] + depth * square];
        const middle = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
        const [rx, rz] = squareOf(walk, ridge);

        MADE.set(id, {
            id,
            walk,
            square,
            size,
            box,
            middle,
            reach: Math.sqrt((box[2] - middle[0]) ** 2 + (box[3] - middle[1]) ** 2),
            ridge: floorAt(walk, 0, rx, rz),
            low,
        });
    }

    return MADE.get(id);
}

/**
 * A scene as a site of the world's plan has it (worldplan/settle.js BELLHAVEN: its `scenery`, its
 * middle `at` and the way its road comes up to it, `facing`, radians: 0 south, toward +y): { scene
 * (sceneOf), at, facing, cos, sin }, for toScene and toWorld.
 */
export function placedOf(site) {
    return { scene: sceneOf(site.scenery), at: site.at, facing: site.facing, cos: cos(site.facing), sin: sin(site.facing) };
}

/**
 * A point of the world ([x, y] metres) as the scene's own ([x, z] metres): its middle at the
 * site's spot, its near edge (+z) toward its road.
 */
export function toScene({ scene, at, cos: c, sin: s }, x, y) {
    const [dx, dy] = [x - at[0], y - at[1]];

    return [dx * c - dy * s + scene.middle[0], dx * s + dy * c + scene.middle[1]];
}

/** A point of the scene ([x, z], its own metres) in the world ([x, y] metres): toScene's other way. */
export function toWorld({ scene, at, cos: c, sin: s }, sx, sz) {
    const [dx, dz] = [sx - scene.middle[0], sz - scene.middle[1]];

    return [at[0] + dx * c + dz * s, at[1] - dx * s + dz * c];
}

/** Whether a point of the scene ([x, z], its own metres) is within its box: where it stands. */
export function within(scene, sx, sz) {
    const [x0, z0, x1, z1] = scene.box;

    return sx >= x0 && sz >= z0 && sx < x1 && sz < z1;
}

function smoothstep(from, to, value) {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));

    return t * t * (3 - 2 * t);
}

// The height the land's laid at under a point of a scene (the scene's own metres, kept within its
// box): its patches' lowest read between their middles, `margin` under that; along its road's end,
// the pad, level with the ridge's floor, easing to that at its sides and its inner end
function underOf(scene, settings, sx, sz) {
    const { box, square, size, low } = scene;
    const [width, depth] = size;
    const u = Math.min(width - 1, Math.max(0, (sx - box[0]) / square - 0.5));
    const v = Math.min(depth - 1, Math.max(0, (sz - box[1]) / square - 0.5));
    const [i, j] = [Math.min(width - 2, Math.floor(u)), Math.min(depth - 2, Math.floor(v))];
    const [tu, tv] = [u - i, v - j];
    const k = j * width + i;
    const ground = (low[k] * (1 - tu) + low[k + 1] * tu) * (1 - tv) + (low[k + width] * (1 - tu) + low[k + width + 1] * tu) * tv - settings.margin;
    const across = 1 - smoothstep(settings.pad, settings.pad + PAD.ease, Math.abs(sx - settings.approach[0]));
    const along = smoothstep(settings.ridge[1] - PAD.ease, settings.ridge[1], sz);
    const pad = across * along;

    return pad > 0 ? ground + (scene.ridge - PAD.under - ground) * pad : ground;
}

/**
 * Where a scene's own ground stands in the world: how high its 0 is (metres), so its road's end
 * stands `rise` over the land's own lie there (`lie(x, y)`: the land's height before it's set in).
 */
export function baseOf(placed, lie) {
    const settings = SCENES[placed.scene.id];
    const [x, y] = toWorld(placed, ...settings.approach);

    return lie(x, y) + settings.rise - placed.scene.ridge;
}

/** How far from its middle a scene set into the land changes it (metres). */
export const reachOf = (placed) => placed.scene.reach + SCENES[placed.scene.id].band;

/**
 * The land's height at a point of the world (metres) with a scene set into it (`placed`, with its
 * `base`: baseOf), given the land's own there (`lie`).
 */
export function setIn(placed, x, y, lie) {
    const { scene, base } = placed;
    const settings = SCENES[scene.id];
    const [sx, sz] = toScene(placed, x, y);
    const [x0, z0, x1, z1] = scene.box;
    const [cx, cz] = [Math.min(x1, Math.max(x0, sx)), Math.min(z1, Math.max(z0, sz))];
    const under = base + underOf(scene, settings, cx, cz);
    const [ex, ez] = [sx - cx, sz - cz];

    // (Where it stands: under it, but toward its edges up to the land's own lie if that's higher)
    if (ex === 0 && ez === 0) {
        const inward = Math.min(sx - x0, x1 - sx, sz - z0, z1 - sz);

        return lie > under ? under + (lie - under) * (1 - smoothstep(0, settings.ring, inward)) : under;
    }

    // (Past its edges: down from its edge to the land's own lie, where the edge is higher)
    return lie >= under ? lie : under + (lie - under) * smoothstep(0, settings.band, Math.sqrt(ex * ex + ez * ez));
}

/**
 * A scene's way in, in the world (`placed`: placedOf's): its squares stepped onto to go in
 * (`front`), the square they come back out on (`outside`), the way they face as they come out
 * (`facing`, the scene's: toward its road), and its door (`door`: { x, z, facing, width, height,
 * floor }: where its glow's drawn, across the way in at the scene's near edge), as a site's
 * entrance is (sites.js entranceAt).
 */
export function wayInOf(placed) {
    const { scene, facing } = placed;
    const { approach, way } = SCENES[scene.id];
    const edge = scene.box[3];
    const square = (sx, sz) => toWorld(placed, sx, sz).map(Math.floor);
    const front = [];
    const seen = new Set();

    // (Every square whose middle's within the way in: looked for round it, turned as it is)
    const reach = Math.ceil(Math.sqrt(way.across * way.across + way.deep * way.deep)) + 1;
    const [mx, my] = toWorld(placed, approach[0], edge - way.deep / 2);

    for (let y = Math.floor(my) - reach; y <= Math.floor(my) + reach; y++) {
        for (let x = Math.floor(mx) - reach; x <= Math.floor(mx) + reach; x++) {
            if (onWayIn(placed, x, y) && !seen.has(`${x},${y}`)) {
                seen.add(`${x},${y}`);
                front.push([x, y]);
            }
        }
    }

    const [dx, dz] = toWorld(placed, approach[0], edge);

    return { front, outside: square(approach[0], edge + way.out), facing, door: { x: dx, z: dz, facing, width: way.across * 2, height: way.height, floor: 0 } };
}

/** Whether a square of the world ([x, y]: its corner, metres) is on a scene's way in (wayInOf). */
export function onWayIn(placed, x, y) {
    const { scene } = placed;
    const { approach, way } = SCENES[scene.id];
    const [sx, sz] = toScene(placed, x + 0.5, y + 0.5);

    return Math.abs(sx - approach[0]) <= way.across && sz < scene.box[3] && sz >= scene.box[3] - way.deep;
}

/**
 * Whether a scene stands on a square of the world ([x, y]: its corner, metres): its middle within
 * the scene's box, but for its way in. No one walks there, nor sees through.
 */
export function standsOn(placed, x, y) {
    const [sx, sz] = toScene(placed, x + 0.5, y + 0.5);

    return within(placed.scene, sx, sz) && !onWayIn(placed, x, y);
}
