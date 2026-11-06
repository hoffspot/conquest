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
import { toWorld } from "./terrain/scenes.js";

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
 * squares in that box). Bellhaven's way in is the slope of earth that rises to its bridge's near
 * end, at 67 m, the ground falling away either side of it to the land under the crag: come in on
 * it, facing the castle across the chasm, and out by its foot, the road's end in the world. And its keep
 * (`keep`), a dungeon of its own (core/dungeons/themes.js `theme`), gone into by its doors off its
 * court: the doorway's squares (`squares`: [x0, z0, x1, z1], the scene's metres), where whoever
 * comes back out of it stands and the way they face (`arrive`, `facing`), and the doors' face
 * (`door`: how far north it is, its width and height, metres), facing the court; where the keep's
 * own walls stand (`shell`: [x0, z0, x1, z1], the scene's metres, its towers and the spire over its
 * doors with them), left out of what's seen from its floors (keepOutlook); and how high its topmost
 * floor stands (`top`, the scene's metres: its belfry, over its roof and under its spire, as high as
 * the top of the cliff its back's built into), its others between that and its doors. Its court
 * (`court`), held by the Order of the Bell (core/creatures.js bellInitiate and the rest) while
 * anyone's in the castle: each of its `posts` one of the Order, of a kind, standing at [x, z] (the
 * scene's metres) and facing a way: spear-brothers at the bridge's end, brothers at the gate,
 * mace-brothers either side of the keep's doors, initiates at their drill under a brother, bowmen on the court's
 * east side, a brother and a spear-brother at its ends; what they say to whoever lingers by them
 * who hasn't crossed the Order (`warnings`), and what as one does (`crossed`); what's heard as its
 * Prior falls, the Great Bell's one low note struck by no one (`fallen`: host.js #priorFell), and as
 * the keep's made again, the bell tolling and the Prior walking again (`tolls`: #remakeDungeon); and
 * the thread its warning begins, if it isn't (`thread`: core/rare.js THREADS bellhaven, the Bell
 * Tolls Again).
 * And its patrols (`patrols`), the Order's riders on barded warhorses on the roads round it
 * (host.js #patrolsAbout): `riders`, each patrol's kinds (core/creatures.js bellRider, choirRider:
 * its first its leader), riding a round of `stops` stops `ring` metres out past where the scene
 * stands (terrain/scenes.js patrolRound), out as anyone comes within `near` metres of it in the
 * world, let go once everyone's further than `far`.
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
        keep: Object.freeze({ theme: "keep", name: "the Keep of Bellhaven", squares: [-1, -142, 1, -140], arrive: [-0.5, -137.5], facing: FACING.s, door: Object.freeze({ z: -142, width: 2, height: 3.6 }), shell: Object.freeze([-34, -216, 34, -134]), top: 168 }),
        court: Object.freeze({
            posts: Object.freeze([
                ["bellSpearman", [-4, -90], FACING.s],
                ["bellSpearman", [4, -90], FACING.s],
                ["bellBrother", [-4, -128], FACING.s],
                ["bellBrother", [4, -128], FACING.s],
                ["bellMaceman", [-10, -140], FACING.s],
                ["bellMaceman", [10, -140], FACING.s],
                ["bellBrother", [-20, -136], FACING.s],
                ["bellInitiate", [-17, -133], FACING.n],
                ["bellInitiate", [-23, -133], FACING.n],
                ["bellInitiate", [-28, -130], FACING.e],
                ["bellArcher", [34, -136], FACING.s],
                ["bellArcher", [40, -130], FACING.s],
                ["bellBrother", [-50, -138], FACING.e],
                ["bellSpearman", [50, -138], FACING.w],
            ].map((post) => Object.freeze(post))),
            warnings: Object.freeze([
                "Keep your distance, unrung one.",
                "The Bell sees you, stranger. Walk softly here.",
                "Kneel to the Bell, or keep walking.",
                "This is holy ground. Mind where you tread.",
                "The Prior has no time for the unrung.",
                "The keep is the Order's. Don't go near its doors.",
            ]),
            crossed: Object.freeze(["Unclean! Take them!", "The Bell has judged you!", "Cleanse them!"]),
            fallen: "Above you the Great Bell gives one low note, though no one's touched it. It's not done with him. When it tolls again, he'll walk again, and every one of the Order will know your face.",
            tolls: "Far off, the Great Bell of Bellhaven tolls three times. The Prior walks again.",
            thread: "bellhaven",
        }),
        patrols: Object.freeze({
            riders: Object.freeze([Object.freeze(["choirRider", "bellRider"]), Object.freeze(["bellRider", "bellRider"])]),
            ring: 25,
            stops: 8,
            near: 380,
            far: 520,
        }),
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
 * one over the other, a ledge's top and its foot), and nothing low enough to be seen over; the floor's height anywhere on it (heightOn);
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
        squares: { width, height, blocked, opaque: blocked, ground: () => GROUND.courtyard, raised: () => true, low: () => false },
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

/**
 * A scene's keep's site (SCENERY `keep`): not one the plan lays out, but the scene's site's own, a
 * dungeon's as the plan's are ({ id: its scene's site's and `-keep`, kind, theme, at: where its
 * scene's set in the world, seed, name, `parent`: its scene's site's id }), so whatever keeps
 * dungeons by their sites (host.js) keeps it too. Null for a site whose scene has no keep.
 */
export function keepSiteOf(site) {
    const keep = site?.scenery ? SCENERY[site.scenery]?.keep : null;

    return keep ? { id: `${site.id}-keep`, kind: "dungeon", theme: keep.theme, at: site.at, seed: ((site.seed ?? 1) * 31 + 7) % 2147483647, name: keep.name, parent: site.id } : null;
}

/**
 * A scene's keep's way in (SCENERY `keep`), on its map: its doorway's squares (those with a floor,
 * row by row), where whoever comes back out of it stands and the way they face, its theme and
 * name, and its doors' face in the map's own metres ({ x, z, width, height, floor }: the floor's
 * height before them), facing the court; or null for a scene with no keep.
 */
export function sceneryKeep(scenery) {
    const keep = SCENERY[scenery]?.keep;

    if (!keep) {
        return null;
    }

    const walk = walkOf(scenery);
    const [x0, z0, x1, z1] = keep.squares;
    const [ax, ay] = squareIn(scenery, [x0, z0]);
    const [bx, by] = squareIn(scenery, [x1, z1]);
    const squares = [];

    for (let y = ay; y < by; y++) {
        for (let x = ax; x < bx; x++) {
            if (floorAt(walk, 0, x, y) !== null) {
                squares.push([x, y]);
            }
        }
    }

    const [, fz] = squareIn(scenery, [0, keep.door.z]);
    const middle = (ax + bx) / 2;

    return {
        theme: keep.theme,
        name: keep.name,
        squares,
        arrive: squareIn(scenery, keep.arrive),
        facing: keep.facing,
        door: { x: middle, z: fz, width: keep.door.width, height: keep.door.height, floor: heightOn(walk, middle, fz + 0.5) },
    };
}

/**
 * How high a floor of a scene's keep stands (the scene's metres): its first (`level` 0) at its
 * doors, its topmost (of `levels`) at its `top`, the others evenly between, a long stair's climb
 * from one to the next.
 */
export function keepFloor(scenery, level, levels) {
    const { door } = sceneryKeep(scenery);

    return door.floor + (levels > 1 ? ((SCENERY[scenery].keep.top - door.floor) * level) / (levels - 1) : 0);
}

// How far over a keep's floor its own walls are left out of what's seen from it (metres): the
// floor itself, and all under it, kept
const HOLLOW_OVER = 0.25;

/**
 * Where a floor of a scene's keep stands in the world (`placed`: core/terrain/height.js scenesIn's,
 * the scene set into the land; `level`: how many floors up, 0 the first, of `levels`; `entry`: where
 * its own way in is, [x, y] of its plan's squares, its doors on the first floor and the head of its
 * stair up from the one under on the others; `origin`: its map's corner, [x, z] metres): its way in
 * at the keep's doors, the floor going on from there as the keep does (its plan's north the keep's,
 * into it from its doors), turned as the scene is, as high as keepFloor has it; and the keep's own
 * walls (its `shell`, the scene's metres) left out of what's seen from it, over the floor it's seen
 * from, so the castle round it and the land show past its parapets (world/view.js's outlook;
 * landmarkdress.js hollowed). { pivot: [x, z] (its way in, its map's metres), at: [x, z] (the
 * world's metres there), y (its floor's height in the world), turn: [cos, sin] (of how far it's
 * turned round the upright, as three.js turns: the scene's own), hollow: { box: [x0, z0, x1, z1], floor } (the scene's metres) }; or null for
 * a scene with no keep.
 */
export function keepOutlook(placed, { level, levels, entry, origin }) {
    const keep = SCENERY[placed.scene.id]?.keep;

    if (!keep) {
        return null;
    }

    const [x0, , x1] = keep.squares;
    const at = toWorld(placed, (x0 + x1) / 2, keep.door.z);
    const floor = keepFloor(placed.scene.id, level, levels);

    return { pivot: [origin[0] + entry[0], origin[1] + entry[1]], at, y: placed.base + floor, turn: [placed.cos, placed.sin], hollow: { box: keep.shell, floor: floor + HOLLOW_OVER } };
}

/**
 * Where a point of a keep's floor's map (x, z its map's metres, y over its floor) is in the world,
 * as keepOutlook stands the floor: [x, y, z] metres.
 */
export function outlookPoint({ pivot, at, y: floor, turn: [c, s] }, x, y, z) {
    const [dx, dz] = [x - pivot[0], z - pivot[1]];

    return [at[0] + dx * c + dz * s, floor + y, at[1] - dx * s + dz * c];
}
