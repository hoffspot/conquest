// Where a fixed scene (Bellhaven's castle on its crag: core/scenery.js, docs/WORLD.md) is set into
// the world's land, from the world plan alone, as the volcano's crater is cut into it (height.js):
// turned to face the road it's come up to by, its own ground standing on the land.
//
// - Where it stands, the land's laid just under it: under the lowest of it over each patch of the
//   ground (its walk's `under`, baked from its art by the model pipeline), so the land never shows
//   through it, and it never stands over a gap.
// - Its own height's set by its road's end (`approach`, at its near ridge's end): that stands
//   `rise` above the land's own lie there, and the rest of it with it.
// - Toward its edges (within `ring`), the land rises to meet the top of the scene's ground there
//   (its highest floor: its walk's `under.top`), a little over it at the very edge, or to its own
//   lie where that's higher: the scene's ragged edges buried, and the land round it running on
//   into its outlying ground.
// - Past its edges, the land eases from there to its own lie (within `band`). Where its edge stands
//   high over that, as Bellhaven's crags do behind it, the land eases down over more (its `hill`):
//   a hill no steeper than trees grow on and a body climbs, wooded (woodsOn), that stops short of
//   the roads, the waters, the sites, the camps and the settlements round it (hillOf).
// - Its road's end is a level pad at the ridge's height, out from the ridge into the land.
// - Where its walk has its own terrain (`ground`: the top of its terrain's own triangles, and what
//   stands on it), the world's land is drawn in its terrain's place on the open ground leading up
//   to it and round it, where nothing of it stands near (world/landmark3d.js cuts its terrain away
//   there): laid along its top, and eased out from its edges to the land's own lie; its trees and
//   the land's things grow there (growsAt). Its own terrain's kept round all that stands on it (its
//   crag, its rocks, its castle): what it has standing there stands on the ground it was made on,
//   none of it off it, and the land's laid along it at its edge with the open, then under it.
//
// Plain data and arithmetic (+ - * /, floor and square roots): the same in every browser and
// worker, wherever and whenever it's asked.

import BELLHAVEN from "../scenery/bellhaven.walk.js";
import { cos, sin } from "../exact.js";
import { floorAt, NONE, readWalk, squareOf } from "../walk.js";
import { CELL, CELLS, WATER } from "../worldplan/terrain.js";

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
 * the pad; the door's glow is `height` metres high, across the way in. Where its own terrain's
 * drawn as the land, `path` ([across, from]) is the way from its road's end up to its ridge, kept
 * clear of trees: within `across` metres of the approach, from `from` (its z, metres) to the ridge.
 * Its `hill`: where its edge stands far over the land's own lie (or under it), the band past it is
 * as wide as keeps the land no steeper than `slope` (rise over run, at its steepest), up to `most`
 * metres, its trees as thick as `woods` at least (core/overworld.js FLORA's: a forest, thicker than
 * a jungle) where it's steep (woodsOn: `wooded`), and on its own open ground `inward` metres in
 * from its edges, fading; it stops `clear` metres short of a road's or a water's cell, a site, a
 * camp or a settlement (hillOf: each as wide as `cell`, `site` and `camp` say, a settlement its
 * own radius), read every `every` metres round its box, and widens or narrows along its edges by
 * no more than `turn` metres a metre.
 */
export const SCENES = Object.freeze({
    bellhaven: Object.freeze({
        walk: BELLHAVEN,
        approach: Object.freeze([0, 88]),
        ridge: Object.freeze([0, 75]),
        pad: 8,
        rise: 20,
        margin: 1,
        ring: 80,
        band: 96,
        way: Object.freeze({ across: 3, deep: 6, out: 3, height: 4 }),
        path: Object.freeze([28, -40]),
        hill: Object.freeze({ slope: 0.7, most: 420, woods: 1.5, wooded: Object.freeze([0.25, 0.6]), inward: 60, clear: 40, every: 16, turn: 1, cell: 24, site: 48, camp: 32 }),
    }),
});

/** How much steeper than its mean a band's at its steepest, eased as it is (smoothstep's). */
const STEEPEST = 1.5;

/**
 * How steep a scene's hill is at its steepest (rise over run), eased down `drop` metres (or up,
 * less than 0) over as much `room` past its edge (metres) as it has, no less than its band nor
 * more than its hill's `most` (SCENES): Bellhaven's (worldplan/settle.js backedOf).
 */
export function hillSlope(drop, room, id = "bellhaven") {
    const settings = SCENES[id];
    const fall = STEEPEST * Math.abs(drop);
    const wanted = fall / settings.hill.slope;
    // (As bandOf has it)
    const band = wanted <= settings.band ? settings.band : Math.min(wanted, Math.max(settings.band, Math.min(settings.hill.most, room)));

    return fall / band;
}

/**
 * How far into the pad its sides and its inner end ease to the land round them (metres), and how
 * far under the ridge's floor it's laid (metres: the ground drawn just under the floor drawn on it);
 * and how far over the top of the scene's ground the land's laid at its edges (`over`, metres: its
 * ragged edge and what hangs from it buried, the land and its ground meeting in its ring); and how
 * far under the top of its own terrain the land's laid, where it's drawn in its place (`terrain`,
 * metres: under its floors, its rocks' feet, where they're at the terrain's own height).
 */
const PAD = Object.freeze({ ease: 6, under: 0.05, over: 1.5, terrain: 0.1 });

// Each scene worked out once: its ground's patches, filled and lowered, its box, its middle
const MADE = new Map();

// A grid's patches nothing's over (NaN) given their neighbours' (`pick`: the lowest of them, or
// their mean), ring by ring in from those that have one; NaN left only if none has
function filledIn(grid, [width, depth], pick) {
    let filled = grid;

    for (let left = filled.some(Number.isNaN), more = true; left && more; ) {
        const next = filled.slice();

        [left, more] = [false, false];

        for (let z = 0; z < depth; z++) {
            for (let x = 0; x < width; x++) {
                if (!Number.isNaN(filled[z * width + x])) {
                    continue;
                }

                const round = [];

                for (let dz = -1; dz <= 1; dz++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const [nx, nz] = [x + dx, z + dz];
                        const h = nx >= 0 && nz >= 0 && nx < width && nz < depth ? filled[nz * width + nx] : NaN;

                        if (!Number.isNaN(h)) {
                            round.push(h);
                        }
                    }
                }

                next[z * width + x] = round.length ? pick(round) : NaN;
                left ||= !round.length;
                more ||= round.length > 0;
            }
        }

        filled = next;
    }

    return filled;
}

/**
 * How many patches round each the land under it looks to for the lowest (each way: the far land,
 * read every 8 m at its finest, world/far/levels.js, then never comes up through it between its
 * points either).
 */
const LOWEST_ROUND = 2;

/**
 * How far round what stands on a scene's terrain (its castle, its bridge, its rocks, its walls) its
 * own terrain's kept, and the open left of trees and the land's own things (patches of its
 * terrain's grid, each way).
 */
const KEEP_OPEN = Object.freeze({ standing: 3 });

/**
 * Where a scene's own terrain's kept, how far in from its edge with the open the land's laid along
 * it (`from`, patches: where its edge is cut, the two meet), and over how many more it eases down
 * under it (`ease`, patches), to the lowest of the scene round it, as under all else of it: the far
 * land, read every 8 m or more, never comes up through it there.
 */
const KEPT = Object.freeze({ from: 2, ease: 6 });

// A scene's terrain, as its walk has it (`ground`: the top of its own terrain's triangles over each
// patch, and the highest of all else, `over`): `top` (metres, each patch's; where it has none, its
// neighbours'), `has` (1 where it has some, else 0), `bare` (1 where it has none but something else
// stands there, its castle on no ground of its own, else 0: read between patches, how much of a
// point the land's laid under it rather than along its terrain), `open` (1 where nothing stands on
// it nor near, reached from its edges without crossing any of that: its terrain, or where it has
// nothing at all, as at its box's corners; its terrain's cut away there and the land drawn in its
// place, and trees grow there, on the land leading up to it and round it, never within its walls),
// `deep` (where its terrain's kept, how far the land's laid under it: 0 at its edge with the open,
// to 1, under all else of it there), and `over` (metres, the highest of what stands on it; NaN where nothing does)
function terrainOf(walk) {
    const { square, origin, size, heights, over, materials } = walk.ground;
    const [width, depth] = size;
    const has = Float32Array.from(heights, (h) => (h === NONE ? 0 : 1));
    const bare = Float32Array.from(heights, (h, k) => (h === NONE && over[k] !== NONE ? 1 : 0));
    const highest = filledIn(Float32Array.from(heights, (h) => (h === NONE ? NaN : h / 100)), size, (round) => round.reduce((sum, h) => sum + h, 0) / round.length);
    // (Its height at each patch's middle: the highest of it over the patch, less half its rise
    // across the patch each way, as its neighbours have it; on a slope the highest is at the
    // patch's upper edge, and read between middles would stand the land over it)
    const at = (x, z) => highest[Math.min(depth - 1, Math.max(0, z)) * width + Math.min(width - 1, Math.max(0, x))];
    const top = highest.map((h, k) => {
        const [x, z] = [k % width, Math.floor(k / width)];

        return h - (Math.abs(at(x + 1, z) - at(x - 1, z)) + Math.abs(at(x, z + 1) - at(x, z - 1))) / 4;
    });
    const closed = new Uint8Array(width * depth);
    const shut = (px, pz, round) => {
        for (let dz = -round; dz <= round; dz++) {
            for (let dx = -round; dx <= round; dx++) {
                const [x, z] = [px + dx, pz + dz];

                if (x >= 0 && z >= 0 && x < width && z < depth) {
                    closed[z * width + x] = 1;
                }
            }
        }
    };

    for (let k = 0; k < width * depth; k++) {
        if (over[k] !== NONE) {
            shut(k % width, Math.floor(k / width), KEEP_OPEN.standing);
        }
    }

    // (Open only out from its edges, never past what stands on it: nothing grows within its
    // walls, in its courts or on its crag's enclosed ground, only on the land leading up to it and
    // round it)
    const open = new Uint8Array(width * depth);
    const queue = [];
    const visit = (x, z) => {
        const k = z * width + x;

        if (x >= 0 && z >= 0 && x < width && z < depth && !open[k] && !closed[k]) {
            open[k] = 1;
            queue.push(k);
        }
    };

    for (let x = 0; x < width; x++) {
        visit(x, 0);
        visit(x, depth - 1);
    }

    for (let z = 0; z < depth; z++) {
        visit(0, z);
        visit(width - 1, z);
    }

    for (let next = 0; next < queue.length; next++) {
        const [x, z] = [queue[next] % width, Math.floor(queue[next] / width)];

        visit(x + 1, z);
        visit(x - 1, z);
        visit(x, z + 1);
        visit(x, z - 1);
    }

    // (How far each patch is from the open, in patches, each way and across: its terrain kept
    // there, the land laid under it from KEPT.from in)
    const far = new Float32Array(width * depth).fill(Infinity);
    const near = [];

    for (let k = 0; k < width * depth; k++) {
        if (open[k]) {
            far[k] = 0;
            near.push(k);
        }
    }

    for (let next = 0; next < near.length; next++) {
        const [x, z] = [near[next] % width, Math.floor(near[next] / width)];

        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const [nx, nz] = [x + dx, z + dz];
                const k = nz * width + nx;

                if (nx >= 0 && nz >= 0 && nx < width && nz < depth && far[k] === Infinity) {
                    far[k] = far[near[next]] + 1;
                    near.push(k);
                }
            }
        }
    }

    const deep = far.map((steps) => smoothstep(KEPT.from, KEPT.from + KEPT.ease, steps));

    return { materials, square, origin, size, top, has, bare, open, deep, over: Float32Array.from(over, (h) => (h === NONE ? NaN : h / 100)) };
}

// A grid ({ origin, square, size }) read at a point (the scene's own metres), between its patches'
// middles, kept within it
function sample({ origin, square, size }, values, sx, sz) {
    const [width, depth] = size;
    const u = Math.min(width - 1, Math.max(0, (sx - origin[0]) / square - 0.5));
    const v = Math.min(depth - 1, Math.max(0, (sz - origin[1]) / square - 0.5));
    const [i, j] = [Math.min(width - 2, Math.floor(u)), Math.min(depth - 2, Math.floor(v))];
    const [tu, tv] = [u - i, v - j];
    const k = j * width + i;

    return (values[k] * (1 - tu) + values[k + 1] * tu) * (1 - tv) + (values[k + width] * (1 - tu) + values[k + width + 1] * tu) * tv;
}

/**
 * A scene as it's set into the land: its id, walk (read), `box` ([x0, z0, x1, z1]: its patches'
 * extent, the scene's metres), `middle` ([x, z]), `reach` (from its middle to its box's corners,
 * metres), `ridge` (the height of the floor its road's end is level with, metres), `low` (a
 * Float32Array, metres: each patch's height the land's laid under, the lowest of it there or round
 * it, LOWEST_ROUND patches each way, so the land between patches never comes up through it either)
 * `top` (each patch's highest floor, metres: the top of its ground, where the land meets it at
 * its edges; where it has none, its neighbours'), and `ground`, its own terrain, where its walk has
 * it (terrainOf: the world's land drawn in its place, laid along its top).
 */
export function sceneOf(id) {
    if (!MADE.has(id)) {
        const { walk: json, ridge } = SCENES[id];
        const walk = readWalk(json);
        const { square, origin, size, heights } = walk.under;
        const [width, depth] = size;
        const filled = filledIn(Float32Array.from(heights, (h) => (h === NONE ? NaN : h / 100)), size, (round) => Math.min(...round));
        const top = filledIn(Float32Array.from(walk.under.top ?? heights, (h) => (h === NONE ? NaN : h / 100)), size, (round) => round.reduce((sum, h) => sum + h, 0) / round.length).map((h, k) => (Number.isNaN(h) ? filled[k] : Math.max(h, filled[k])));

        // (Each the lowest of itself and those round it: read between patches' middles, the land
        // over a patch is then never above the lowest of it)
        const low = new Float32Array(width * depth);

        for (let z = 0; z < depth; z++) {
            for (let x = 0; x < width; x++) {
                let lowest = Infinity;

                for (let dz = -LOWEST_ROUND; dz <= LOWEST_ROUND; dz++) {
                    for (let dx = -LOWEST_ROUND; dx <= LOWEST_ROUND; dx++) {
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
        const ground = walk.ground ? terrainOf(walk) : null;

        MADE.set(id, {
            id,
            walk,
            square,
            size,
            box,
            middle,
            reach: Math.sqrt((box[2] - middle[0]) * (box[2] - middle[0]) + (box[3] - middle[1]) * (box[3] - middle[1])),
            ridge: floorAt(walk, 0, rx, rz),
            low,
            top,
            ground,
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

// A grid of a scene's patches (`low`, `top`) read at a point of it (the scene's own metres, kept
// within its box), between its patches' middles
function readAt(scene, grid, sx, sz) {
    const { box, square, size } = scene;
    const [width, depth] = size;
    const u = Math.min(width - 1, Math.max(0, (sx - box[0]) / square - 0.5));
    const v = Math.min(depth - 1, Math.max(0, (sz - box[1]) / square - 0.5));
    const [i, j] = [Math.min(width - 2, Math.floor(u)), Math.min(depth - 2, Math.floor(v))];
    const [tu, tv] = [u - i, v - j];
    const k = j * width + i;

    return (grid[k] * (1 - tu) + grid[k + 1] * tu) * (1 - tv) + (grid[k + width] * (1 - tu) + grid[k + width + 1] * tu) * tv;
}

// The land under a point of a scene (its own metres, kept within its box; over the scene's 0):
// `under` its lowest there, `margin` under that; `edge`, what the land's laid at at its edges, just
// over the top of its ground. Along its road's end both are the pad, level with the ridge's floor,
// easing to the rest at its sides and its inner end.
function landUnder(scene, settings, sx, sz) {
    const under = readAt(scene, scene.low, sx, sz) - settings.margin;

    // (Its own terrain drawn as the land: the land along its top, on where it has nothing at all;
    // under all else where it has none, its castle's floors and the like, and under its terrain
    // where that's kept, in from its edge with the open)
    if (scene.ground) {
        const { ground } = scene;
        const top = sample(ground, ground.top, sx, sz) - PAD.terrain;
        const land = top + (Math.min(top, under) - top) * Math.max(sample(ground, ground.bare, sx, sz), sample(ground, ground.deep, sx, sz));
        const pad = padOf(settings, sx, sz);
        const level = scene.ridge - PAD.under;
        const laid = pad > 0 ? land + (level - land) * pad : land;

        return { under: laid, edge: laid, terrain: true };
    }

    const edge = readAt(scene, scene.top, sx, sz) + PAD.over;
    const pad = padOf(settings, sx, sz);
    const level = scene.ridge - PAD.under;

    return pad > 0 ? { under: under + (level - under) * pad, edge: edge + (level - edge) * pad } : { under, edge };
}

// How much of a point of a scene (its own metres) is its road's end's pad: 1 on it, easing to 0 at
// its sides and its inner end
function padOf(settings, sx, sz) {
    const across = 1 - smoothstep(settings.pad, settings.pad + PAD.ease, Math.abs(sx - settings.approach[0]));
    const along = smoothstep(settings.ridge[1] - PAD.ease, settings.ridge[1], sz);

    return across * along;
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

/** How far from its middle a scene set into the land changes it (metres): its hill's too. */
export const reachOf = (placed) => placed.scene.reach + Math.max(SCENES[placed.scene.id].band, SCENES[placed.scene.id].hill?.most ?? 0);

/**
 * What a scene's hill stops short of round a spot (`at`, [x, y] metres), within `reach` metres and
 * a little more (hillOf's `near`: [x, y, radius], metres): each cell of the plan's `road`, `water`
 * and what `running` has running (terrain/waters.js runningIn), each of its `sites` but `own`, each
 * of its `camps` and its `places` (settlements, their radius theirs). The same for the plan being
 * laid out (worldplan/settle.js backedOf) and the land laid out from it (terrain/height.js).
 */
export function aroundOf({ road, water, running, sites = [], camps = [], places = [] }, at, reach, own = null, id = "bellhaven") {
    const { hill } = SCENES[id];
    const near = [];
    const [ax, ay] = at;
    const far = reach + CELL * 2;
    const [i0, i1] = [Math.max(0, Math.floor((ax - far) / CELL)), Math.min(CELLS - 1, Math.floor((ax + far) / CELL))];
    const [j0, j1] = [Math.max(0, Math.floor((ay - far) / CELL)), Math.min(CELLS - 1, Math.floor((ay + far) / CELL))];

    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
            const k = j * CELLS + i;

            if (road[k] || water[k] !== WATER.none || running[k]) {
                near.push([(i + 0.5) * CELL, (j + 0.5) * CELL, hill.cell]);
            }
        }
    }

    const by = ([x, y], radius) => (x - ax) * (x - ax) + (y - ay) * (y - ay) < (far + radius) * (far + radius);

    for (const site of sites) {
        if (site !== own && site.id !== own?.id && by(site.at, hill.site)) {
            near.push([site.at[0], site.at[1], hill.site]);
        }
    }

    for (const camp of camps) {
        if (by(camp.at, hill.camp)) {
            near.push([camp.at[0], camp.at[1], hill.camp]);
        }
    }

    for (const place of places) {
        if (by(place.at, place.radius)) {
            near.push([place.at[0], place.at[1], place.radius]);
        }
    }

    return near;
}

// A point of a scene's edge (its own metres, on its box) as how far round its box it is (metres):
// along its back from its first corner, then up its right side, back along its front, and down
// its left side
function roundOf(scene, sx, sz) {
    const [x0, z0, x1, z1] = scene.box;
    const [width, depth] = [x1 - x0, z1 - z0];

    if (sz <= z0) {
        return sx - x0;
    }

    if (sx >= x1) {
        return width + (sz - z0);
    }

    if (sz >= z1) {
        return width + depth + (x1 - sx);
    }

    return 2 * width + depth + (z1 - sz);
}

/**
 * How far out past its edges a scene's hill may reach (`placed`: placedOf's), round its box (a
 * Float32Array, metres, one each SCENES `hill.every` metres from roundOf's 0): its `most`, but
 * `clear` short of each thing round it (`near`: [x, y, radius], the world's metres: a road's or a
 * water's cell, a site, a camp, a settlement), never less than its `band`, and widening or
 * narrowing along its edges by no more than `turn` metres a metre. Null for a scene with no hill.
 */
export function hillOf(placed, near) {
    const settings = SCENES[placed.scene.id];
    const { hill } = settings;

    if (!hill) {
        return null;
    }

    const { scene } = placed;
    const [x0, z0, x1, z1] = scene.box;
    const count = Math.ceil((2 * (x1 - x0 + z1 - z0)) / hill.every);
    const most = new Float32Array(count).fill(hill.most);

    for (const [x, y, radius] of near) {
        const [sx, sz] = toScene(placed, x, y);
        const [cx, cz] = [Math.min(x1, Math.max(x0, sx)), Math.min(z1, Math.max(z0, sz))];
        const out = Math.sqrt((sx - cx) * (sx - cx) + (sz - cz) * (sz - cz)) - radius - hill.clear;

        if (out >= hill.most) {
            continue;
        }

        // (Its stretch of the edges, and as far either way as it's wide)
        const at = Math.round(roundOf(scene, cx, cz) / hill.every);
        const spread = Math.ceil((radius + hill.clear) / hill.every) + 1;

        for (let k = at - spread; k <= at + spread; k++) {
            const i = ((k % count) + count) % count;

            most[i] = Math.min(most[i], Math.max(settings.band, out));
        }
    }

    // (No faster along its edges than `turn` a metre, round them twice each way)
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < count; i++) {
            most[i] = Math.min(most[i], most[(i + count - 1) % count] + hill.every * hill.turn);
        }

        for (let i = count - 1; i >= 0; i--) {
            most[i] = Math.min(most[i], most[(i + 1) % count] + hill.every * hill.turn);
        }
    }

    return most;
}

// A point of a scene's edge `round` metres round its box (roundOf's other way): [x, z] (its own
// metres) and the way out from it there ([x, z])
function edgeAt(scene, round) {
    const [x0, z0, x1, z1] = scene.box;
    const [width, depth] = [x1 - x0, z1 - z0];

    if (round < width) {
        return [x0 + round, z0, 0, -1];
    }

    if (round < width + depth) {
        return [x1, z0 + (round - width), 1, 0];
    }

    if (round < 2 * width + depth) {
        return [x1 - (round - width - depth), z1, 0, 1];
    }

    return [x0, z1 - (round - 2 * width - depth), -1, 0];
}

/**
 * How steep a scene's hill would be at its steepest round it (rise over run), set into the land so
 * (`placed`: placedOf's, with its `base`), given what's round it (`near`: aroundOf's) and the
 * land's own lie (`lie(x, y)`, metres): at each stretch of its edges (hillOf's), from its edge
 * there to the land at its hill's foot.
 */
export function steepestOf(placed, near, lie) {
    const settings = SCENES[placed.scene.id];
    const most = hillOf(placed, near);

    if (!most) {
        return 0;
    }

    const { scene, base } = placed;
    let steepest = 0;

    for (let k = 0; k < most.length; k++) {
        const [cx, cz, ox, oz] = edgeAt(scene, k * settings.hill.every);
        const land = landUnder(scene, settings, cx, cz);
        const own = lie(...toWorld(placed, cx + ox * most[k], cz + oz * most[k]));
        const edge = land.terrain ? base + land.edge : Math.max(base + land.edge, own);

        steepest = Math.max(steepest, hillSlope(edge - own, most[k], scene.id));
    }

    return steepest;
}

// How far out past a point of its edge (cx, cz: the scene's own metres) the land eases from the
// edge's height there (`edge`, metres) to its own lie (`lie`): its band, or where the edge stands
// far over the lie or under it, as far as keeps it no steeper than its hill's slope, as far as its
// hill may reach there (hillOf: `placed.hill`)
function bandOf(placed, settings, cx, cz, edge, lie) {
    const { hill } = settings;

    if (!hill || !placed.hill) {
        return settings.band;
    }

    const wanted = (STEEPEST * Math.abs(edge - lie)) / hill.slope;

    if (wanted <= settings.band) {
        return settings.band;
    }

    const count = placed.hill.length;
    const along = roundOf(placed.scene, cx, cz) / hill.every;
    const k = Math.floor(along);
    const t = along - k;
    const most = placed.hill[k % count] * (1 - t) + placed.hill[(k + 1) % count] * t;

    return Math.min(wanted, Math.max(settings.band, most));
}

// A point of the world past a scene's edges (metres): its edge's point (cx, cz: the scene's own
// metres), how high the land is laid there (`edge`, metres), how far out it is (`out`, metres) and
// how far the land eases from there to its own lie (`lie`: bandOf); null within its box
function pastOf(placed, x, y, lie) {
    const { scene, base } = placed;
    const settings = SCENES[scene.id];
    const [sx, sz] = toScene(placed, x, y);
    const [x0, z0, x1, z1] = scene.box;
    const [cx, cz] = [Math.min(x1, Math.max(x0, sx)), Math.min(z1, Math.max(z0, sz))];

    if (cx === sx && cz === sz) {
        return null;
    }

    const land = landUnder(scene, settings, cx, cz);
    // (At its edges, the top of its ground, or the land's own lie where that's higher)
    const edge = land.terrain ? base + land.edge : Math.max(base + land.edge, lie);

    return { cx, cz, edge, out: Math.sqrt((sx - cx) * (sx - cx) + (sz - cz) * (sz - cz)), band: bandOf(placed, settings, cx, cz, edge, lie) };
}

/**
 * How thick trees grow at least at a point of the world (metres) on a scene's hill (`placed`:
 * scenesIn's, with its `hill`), given the land's own lie there (`lie`) and, if it's known, how
 * steep the land's set there (`slopeAt`: a function, rise over run): as thick as its `woods` where
 * the land falls (or rises) steeply from its edges to the land's own, or is steep there all the
 * same, as by its chasm's walls carried out past its edges (SCENES hill `wooded`: from as steep as
 * its first to its second), thinning out over the last of its band to its foot; on its own open
 * ground, where the land's drawn in its terrain's place, as thick where it's steep there, and its
 * hill's woods carried in from its edges (SCENES hill `inward`); 0 elsewhere, on its road's end and
 * the level land round it.
 */
export function woodsOn(placed, x, y, lie, slopeAt = null) {
    const settings = SCENES[placed.scene.id];

    if (!settings.hill || !placed.hill) {
        return 0;
    }

    const { scene } = placed;
    const [sx, sz] = toScene(placed, x, y);
    const { woods, wooded } = settings.hill;

    if (onItsRoad(scene, sx, sz)) {
        return 0;
    }

    // (On its own ground where the land's drawn in its place and trees grow: as thick where it's
    // steep, and in from its edges its hill's woods at its nearest edge carried in, fading out
    // over `inward` metres)
    if (within(scene, sx, sz)) {
        if (!openOn(scene, sx, sz)) {
            return 0;
        }

        const [x0, z0, x1, z1] = scene.box;
        const sides = [[sx - x0, x0 - 1, sz], [x1 - sx, x1 + 1, sz], [sz - z0, sx, z0 - 1], [z1 - sz, sx, z1 + 1]];
        const [inward, ex, ez] = sides.reduce((nearest, side) => (side[0] < nearest[0] ? side : nearest));
        const carried = inward < settings.hill.inward ? woodsOn(placed, ...toWorld(placed, ex, ez), lie) * (1 - smoothstep(0, settings.hill.inward, inward)) : 0;

        return Math.max(carried, slopeAt ? woods * smoothstep(wooded[0], wooded[1], slopeAt()) : 0);
    }

    const past = pastOf(placed, x, y, lie);

    if (!past || past.out >= past.band) {
        return 0;
    }

    // (As steep as its band is at its steepest, or as the land's set there, the steeper)
    const steepest = (STEEPEST * Math.abs(past.edge - lie)) / past.band;
    const steep = smoothstep(wooded[0], wooded[1], steepest);

    return woods * Math.max(steep, steep < 1 && slopeAt ? smoothstep(wooded[0], wooded[1], slopeAt()) : 0) * (1 - smoothstep(past.band * 0.85, past.band, past.out));
}

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
    const land = landUnder(scene, settings, cx, cz);
    // (At its edges, the top of its ground, or the land's own lie where that's higher)
    const edge = land.terrain ? base + land.edge : Math.max(base + land.edge, lie);
    const [ex, ez] = [sx - cx, sz - cz];

    // (Where it stands, its own terrain the land's: the land along it, to its edges)
    if (ex === 0 && ez === 0 && land.terrain) {
        return base + land.under;
    }

    // (Where it stands: under it, rising toward its edges to meet them)
    if (ex === 0 && ez === 0) {
        const inward = Math.min(sx - x0, x1 - sx, sz - z0, z1 - sz);
        const under = base + land.under;

        return under + (Math.max(under, edge) - under) * (1 - smoothstep(0, settings.ring, inward));
    }

    // (Past its edges: from its edge to the land's own lie, over its band, or its hill)
    return edge + (lie - edge) * smoothstep(0, bandOf(placed, settings, cx, cz, edge, lie), Math.sqrt(ex * ex + ez * ez));
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

/**
 * Whether a point of a scene (its own metres) is on its road's end, on out past its edge, or on its
 * way up from there to its ridge (SCENES `path`): kept clear of what grows, and what's strewn.
 */
export function onItsRoad(scene, sx, sz) {
    const settings = SCENES[scene.id];

    if (Math.abs(sx - settings.approach[0]) < settings.pad + PAD.ease + 4 && sz > settings.ridge[1] - 10 && sz < scene.box[3] + 30) {
        return true;
    }

    return Boolean(settings.path) && Math.abs(sx - settings.approach[0]) < settings.path[0] && sz > settings.path[1] && sz <= settings.ridge[1];
}

// Whether a point of a scene (its own metres) is on its open ground: its own terrain drawn as the
// land there, nothing of it standing near (terrainOf `open`)
function openOn(scene, sx, sz) {
    const { ground } = scene;

    if (!ground) {
        return false;
    }

    const [px, pz] = [Math.floor((sx - ground.origin[0]) / ground.square), Math.floor((sz - ground.origin[1]) / ground.square)];

    return px >= 0 && pz >= 0 && px < ground.size[0] && pz < ground.size[1] && ground.open[pz * ground.size[0] + px] === 1;
}

/**
 * Whether trees and the land's own things may stand at a point of the world (metres) a scene's set
 * into (`placed`: placedOf's): where its own terrain's drawn as the land, nothing of it standing
 * near (terrainOf `open`); and out past it, but for along its road's end; not on the rest of it.
 */
export function growsAt(placed, x, y) {
    const { scene } = placed;
    const [sx, sz] = toScene(placed, x, y);

    if (onItsRoad(scene, sx, sz)) {
        return false;
    }

    if (!within(scene, sx, sz)) {
        return true;
    }

    return openOn(scene, sx, sz);
}
