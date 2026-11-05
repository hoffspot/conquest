// What lays a scene set into the land (world/landmark3d.js: Bellhaven's castle on its crag) into it
// past its own art, for the eye only:
// - Its heights (heightsOf): the top of its terrain, of its terrain and rocks, and of all of it,
//   over each metre of it, read from the art drawn.
// - Shadow at the feet of what stands on its ground: its ground darkened round what stands on it,
//   as the world's ground is round its buildings and rocks (ground.js contactOf); and its rocks and
//   walls darkened at their feet (footed), a few metres up from the terrain they stand in (rocks)
//   or the terrain or rock they stand on (walls), but for what faces up.
// - Boulders and scree of our own rocks (kits/rocks.js) along its crag's foot (screeOf): on the
//   world's land round it (scenes.js `open`) and its own bare terrain by its rocks, not on its road.
// - Mist lying in its chasm (mistOf): soft puffs drifting to and fro along it, faded where they
//   meet its walls and floor, and as the player comes into them.
// Each drawn with the far land and with the near world as the art is, but for the scree (small
// enough to go with the near world, faded out with it), and the mist (each puff drawn with the one
// or the other, by how far off it is, so it's never drawn twice over).

import * as THREE from "three";
import { createRandom } from "../core/random.js";
import { landHeight } from "../core/terrain/height.js";
import { growsAt, onItsRoad, toWorld } from "../core/terrain/scenes.js";
import { cliffMaterial } from "./art/engine/atlas.js";
import { MATERIALS } from "./art/engine/painters.js";
import { TREE_WIND } from "./art/kits/trees.js";
import { randomOf, rockLook, StoneMesher } from "./art/kits/rocks.js";
import { SKY_GLOW } from "./daytime.js";
import { contactOf } from "./ground.js";
import { WATER_DETAIL } from "./water.js";

/**
 * - `square`: the heights' squares (metres); `rocks`, the art's rocks' materials (by name).
 * - `feet`: how tall what stands on the ground darkens it as much as can be (metres, as ground.js
 *   ROCK_CONTACT's `tall`), and that most (`most`: of ground.js's darkening, as much as a town's
 *   walls give, would leave its crag's ground in shade black), how high over it what hangs over it is, not standing on it (`hangs`,
 *   metres: none), how far up a rock's or a wall's foot is darkened (`band`, metres) and
 *   how much at its foot (`dark`, of its colour), and from how upright a face's left as it is
 *   (`up`: its normal's upward part, from the first to the second, the darkening gone).
 * - `scree`: how far out from the crag's rocks it's strewn (`reach`, metres); how many boulders,
 *   how big (metres, the longest way), how far apart at least; how many heaps of scree, how many
 *   stones in each, how big, how far from the heap's middle (metres); how much of each sunk into
 *   the ground (`sunk`, of its height); its tint (the art's rocks' grey-beige); how many looks.
 * - `mist`, by scene: where its chasm is (`box`, [x0, z0, x1, z1], its own metres), how low the
 *   ground under a puff is (`low`, metres: the chasm's floor and lower walls), how many puffs, how
 *   big (metres across), how high over the ground (metres), how far they drift to and fro along it
 *   (metres) and how fast (radians a second), how thick at most (`alpha`), how far over the ground
 *   they're faded in (`soft`, metres), how near the eye they fade out (metres), where each is
 *   drawn with the near world, then the far land (`pass`, metres from the eye: between, both,
 *   each less), and its colour (sRGB, lit by the sky's light).
 */
export const DRESS = Object.freeze({
    square: 1,
    rocks: /^M_Rock/,
    feet: Object.freeze({ tall: 2.2, most: 0.55, hangs: 1.5, band: 3, dark: 0.45, up: Object.freeze([0.55, 0.9]) }),
    scree: Object.freeze({
        reach: 10,
        boulders: 90,
        boulder: Object.freeze([0.9, 2.8]),
        apart: 4,
        heaps: 110,
        stones: Object.freeze([4, 9]),
        stone: Object.freeze([0.18, 0.55]),
        spread: 2.6,
        sunk: Object.freeze([0.15, 0.3]),
        tint: Object.freeze([0.93, 0.9, 0.86]),
        looks: 6,
    }),
    mist: Object.freeze({
        bellhaven: Object.freeze({
            box: Object.freeze([-176, -92, 176, -4]),
            low: 12,
            puffs: 120,
            size: Object.freeze([22, 40]),
            over: Object.freeze([1, 11]),
            drift: 14,
            speed: 0.012,
            alpha: 0.5,
            soft: 5,
            near: Object.freeze([4, 16]),
            pass: Object.freeze([70, 110]),
            colour: 0xdfe5e8,
        }),
    }),
});

// None there (metres: under all of it, read as half-floats)
const NONE = -1000;

/**
 * The heights of a scene's art (`object`, in its own metres; `box` [x0, z0, x1, z1] its extent,
 * `terrain` its terrain's materials, by name), over each DRESS.square: `terrain`, the top of its
 * terrain; `rock`, of its terrain and rocks; `all`, of all of it (Float32Arrays, NONE where none);
 * `low`, the lowest of what isn't its terrain (Infinity where none); from `origin` ([x, z]),
 * `size` ([width, depth] squares).
 */
export function heightsOf(object, box, terrain) {
    const { square, rocks } = DRESS;
    const origin = [box[0], box[1]];
    const size = [Math.ceil((box[2] - box[0]) / square), Math.ceil((box[3] - box[1]) / square)];
    const [width, depth] = size;
    const grids = { terrain: new Float32Array(width * depth).fill(NONE), rock: new Float32Array(width * depth).fill(NONE), all: new Float32Array(width * depth).fill(NONE) };
    // (And the lowest of what isn't its terrain: what stands on the ground, or hangs over it)
    const low = new Float32Array(width * depth).fill(Infinity);
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const matrix = new THREE.Matrix4();

    object.updateMatrixWorld(true);

    const fromWorld = object.matrixWorld.clone().invert();

    object.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.geometry.getAttribute("position")) {
            return;
        }

        const name = [mesh.material].flat()[0]?.name ?? "";
        const into = terrain.has(name) ? [grids.terrain, grids.rock, grids.all] : rocks.test(name) ? [grids.rock, grids.all] : [grids.all];
        const position = mesh.geometry.getAttribute("position");
        const index = mesh.geometry.index;
        const count = index ? index.count : position.count;
        // (The highest of it over the square a point's in)
        const over = into.length < 3;
        const visit = (x, z, y) => {
            const [i, j] = [Math.floor((x - origin[0]) / square), Math.floor((z - origin[1]) / square)];

            if (i >= 0 && j >= 0 && i < width && j < depth) {
                const k = j * width + i;

                for (const grid of into) {
                    if (y > grid[k]) {
                        grid[k] = y;
                    }
                }

                if (over && y < low[k]) {
                    low[k] = y;
                }
            }
        };
        // (Along an edge, every so often: what's upright has no squares of its own)
        const along = (p, q) => {
            const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (square * 0.7)));

            for (let s = 0; s <= steps; s++) {
                const t = s / steps;

                visit(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t, p.y + (q.y - p.y) * t);
            }
        };

        matrix.multiplyMatrices(fromWorld, mesh.matrixWorld);

        for (let t = 0; t + 2 < count; t += 3) {
            const at = (k) => (index ? index.getX(t + k) : t + k);

            a.fromBufferAttribute(position, at(0)).applyMatrix4(matrix);
            b.fromBufferAttribute(position, at(1)).applyMatrix4(matrix);
            c.fromBufferAttribute(position, at(2)).applyMatrix4(matrix);
            along(a, b);
            along(b, c);
            along(c, a);

            // (And at each square's middle it covers, its height there)
            const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);

            if (Math.abs(area) < 1e-6) {
                continue;
            }

            const [i0, i1] = [Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - origin[0]) / square)), Math.min(width - 1, Math.floor((Math.max(a.x, b.x, c.x) - origin[0]) / square))];
            const [j0, j1] = [Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - origin[1]) / square)), Math.min(depth - 1, Math.floor((Math.max(a.z, b.z, c.z) - origin[1]) / square))];

            for (let j = j0; j <= j1; j++) {
                for (let i = i0; i <= i1; i++) {
                    const [px, pz] = [origin[0] + (i + 0.5) * square, origin[1] + (j + 0.5) * square];
                    const u = ((px - a.x) * (c.z - a.z) - (c.x - a.x) * (pz - a.z)) / area;
                    const v = ((b.x - a.x) * (pz - a.z) - (px - a.x) * (b.z - a.z)) / area;

                    if (u >= 0 && v >= 0 && u + v <= 1) {
                        visit(px, pz, a.y + (b.y - a.y) * u + (c.y - a.y) * v);
                    }
                }
            }
        }
    });

    return { origin, size, square, ...grids, low };
}

/** A height of a scene's heights (heightsOf's: `grid` one of theirs) at a point of it (its own metres): NONE outside. */
export function heightAt(heights, grid, x, z) {
    const { origin, size, square } = heights;
    const [i, j] = [Math.floor((x - origin[0]) / square), Math.floor((z - origin[1]) / square)];

    return i >= 0 && j >= 0 && i < size[0] && j < size[1] ? heights[grid][j * size[0] + i] : NONE;
}

// How much of a square of a scene's heights is stood on (as ground.js ROCK_CONTACT has it: as tall
// as what stands on its terrain is over `tall` metres, at most 1; not what hangs over it, its foot
// `hangs` metres up or more)
function stoodOn(heights, k) {
    const [terrain, all, low] = [heights.terrain[k], heights.all[k], heights.low[k]];

    if (all === NONE || (terrain !== NONE && low - terrain > DRESS.feet.hangs)) {
        return 0;
    }

    return DRESS.feet.most * (terrain === NONE ? 1 : Math.min(1, Math.max(0, all - terrain - 0.3) / DRESS.feet.tall));
}

/**
 * The world's ground's darkening round what stands on a scene's ground (ground.js contactOf, for
 * its groundMaterial `contact`), over the squares of the world it covers; or null if nothing does.
 */
export function contactFor(placed, heights) {
    const { scene } = placed;
    const corners = [
        [scene.box[0], scene.box[1]],
        [scene.box[2], scene.box[1]],
        [scene.box[0], scene.box[3]],
        [scene.box[2], scene.box[3]],
    ].map(([x, z]) => toWorld(placed, x, z));
    const [x0, y0] = [Math.floor(Math.min(...corners.map(([x]) => x))), Math.floor(Math.min(...corners.map(([, y]) => y)))];
    const size = Math.ceil(Math.max(Math.max(...corners.map(([x]) => x)) - x0, Math.max(...corners.map(([, y]) => y)) - y0)) + 1;
    const { origin, size: [width, depth], square } = heights;
    const [c, s] = [placed.cos, placed.sin];

    return contactOf(
        (x, y) => {
            // (The square's middle in the scene: toScene, inlined)
            const [dx, dy] = [x + 0.5 - placed.at[0], y + 0.5 - placed.at[1]];
            const [i, j] = [Math.floor((dx * c - dy * s + scene.middle[0] - origin[0]) / square), Math.floor((dx * s + dy * c + scene.middle[1] - origin[1]) / square)];

            return i >= 0 && j >= 0 && i < width && j < depth ? stoodOn(heights, j * width + i) : 0;
        },
        [x0, y0, size],
    );
}

/**
 * A scene's heights as a texture (RG: the top of its terrain, of its terrain and rocks; half
 * floats, read between squares), and the uniforms its materials read it by (`landmarkHeights`,
 * `landmarkArea`: x, z, width, depth, its own metres), with `sceneFromWorld` (the world to the
 * scene's own metres) and `landmarkFeet` (DRESS.feet's band and dark).
 */
export function dressUniforms(heights, sceneFromWorld) {
    const { origin, size, square } = heights;
    const data = new Uint16Array(size[0] * size[1] * 2);

    for (let k = 0; k < size[0] * size[1]; k++) {
        data[k * 2] = THREE.DataUtils.toHalfFloat(heights.terrain[k]);
        data[k * 2 + 1] = THREE.DataUtils.toHalfFloat(heights.rock[k]);
    }

    const texture = new THREE.DataTexture(data, size[0], size[1], THREE.RGFormat, THREE.HalfFloatType);

    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    return {
        landmarkHeights: { value: texture },
        landmarkArea: { value: new THREE.Vector4(origin[0], origin[1], size[0] * square, size[1] * square) },
        sceneFromWorld: { value: sceneFromWorld },
        landmarkFeet: { value: new THREE.Vector4(DRESS.feet.band, DRESS.feet.dark, ...DRESS.feet.up) },
    };
}

const FEET_PARS = `
uniform sampler2D landmarkHeights;
uniform vec4 landmarkArea;
uniform mat4 sceneFromWorld;
uniform vec4 landmarkFeet;
uniform vec4 landmarkHollow;
uniform float landmarkHollowOver;
varying vec3 vLandmarkAt;
varying float vLandmarkUp;`;

// What of a scene's art isn't drawn while it's seen from inside it (hollowed), every scene's the
// same: none (its box's far corner before its near)
const HOLLOW = { landmarkHollow: { value: new THREE.Vector4(0, 0, -1, -1) }, landmarkHollowOver: { value: 0 } };

/**
 * A scene's art left out where it's seen from inside it (`hollow`: { box: [x0, z0, x1, z1], floor },
 * the scene's own metres: all of it in the box over `floor`, Bellhaven's keep's own walls seen out
 * of from its floors, core/scenery.js keepOutlook), or all of it drawn again (null).
 */
export function hollowed(hollow) {
    if (hollow) {
        HOLLOW.landmarkHollow.value.set(...hollow.box);
        HOLLOW.landmarkHollowOver.value = hollow.floor;
    } else {
        HOLLOW.landmarkHollow.value.set(0, 0, -1, -1);
    }
}

/**
 * A copy of one of a scene's art's materials (its rocks', `on` "rock", or its castle's, "wall"),
 * not faded out with the near world (it goes on into the far land, as the ground does: fog.js),
 * darkened at its feet (DRESS.feet): up from the top of the terrain under it (a rock's), or of the
 * terrain or rock under it (a wall's), but where it faces up; and left out where it's hollowed.
 * `uniforms`: dressUniforms'.
 */
export function footed(material, on, uniforms) {
    const own = material.clone();

    own.defines = { ...own.defines, NO_NEAR_FADE: "", LANDMARK_FEET_ON: on === "rock" ? "below.r" : "below.g" };
    own.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms, HOLLOW);
        shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>${FEET_PARS}`).replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
vLandmarkAt = (sceneFromWorld * modelMatrix * vec4(transformed, 1.0)).xyz;
vLandmarkUp = normalize(transpose(mat3(viewMatrix)) * transformedNormal).y;`,
        );
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>${FEET_PARS}`).replace(
            "#include <color_fragment>",
            `#include <color_fragment>
if (all(greaterThan(vLandmarkAt.xz, landmarkHollow.xy)) && all(lessThan(vLandmarkAt.xz, landmarkHollow.zw)) && vLandmarkAt.y > landmarkHollowOver) discard;
{
    vec2 below = texture2D(landmarkHeights, (vLandmarkAt.xz - landmarkArea.xy) / landmarkArea.zw).rg;
    float foot = (1.0 - smoothstep(-0.5, landmarkFeet.x, vLandmarkAt.y - LANDMARK_FEET_ON)) * (1.0 - smoothstep(landmarkFeet.z, landmarkFeet.w, vLandmarkUp));

    diffuseColor.rgb *= 1.0 - landmarkFeet.y * foot;
}`,
        );
    };
    own.customProgramCacheKey = () => `landmark feet ${on}`;

    return own;
}

// Our rocks' looks, made once: boulders (fresh broken and weathered) and scree
const looks = { boulders: [], scree: [] };

function looksOf(kind) {
    if (!looks[kind].length) {
        for (let k = 0; k < DRESS.scree.looks; k++) {
            const seed = (kind === "scree" ? 6151 : 3571) * (k + 1) + 29;

            looks[kind].push(kind === "scree" ? rockLook(randomOf(seed), { family: "talus", detail: 1, layer: "rock" }) : rockLook(randomOf(seed), { family: k % 2 ? "corestone" : "talus", detail: 2, layer: "rock" }));
        }
    }

    return looks[kind];
}

const cliffsOf = {};

// Our rocks' material (atlas.js cliffMaterial), not faded out with the near world, for the boulders
// drawn with the far land and with the near world: one for each (`pass`), as their lights aren't
// the same (one material between the two, its lights changed between them, drew them black)
function cliffsFor(pass) {
    if (!cliffsOf[pass]) {
        const cliffs = cliffMaterial();
        const material = new THREE.MeshLambertMaterial({ vertexColors: true });

        material.name = "landmark boulders";
        material.shadowSide = cliffs.shadowSide;
        material.userData = { ...cliffs.userData };
        material.defines = { NO_NEAR_FADE: "" };
        material.onBeforeCompile = cliffs.onBeforeCompile;
        material.customProgramCacheKey = () => "cliffs+landmark";
        cliffsOf[pass] = material;
    }

    return cliffsOf[pass];
}

/**
 * Where a scene's crag's foot is strewn (its own metres): each square of its heights within
 * DRESS.scree `reach` of its rocks (as far as that from one: a chamfer distance), on the world's
 * land round it (growsAt) or on its own terrain with nothing over it, not on its road; with
 * `height` there (the world's land's, less the scene's `base`, or its terrain's) and how far from
 * the rocks. `land(x, y)`: the world's land's height (metres).
 */
export function footOf(placed, heights, land) {
    const { scene, base } = placed;
    const { origin, size, square } = heights;
    const [width, depth] = size;
    const far = new Float32Array(width * depth).fill(Infinity);
    const queue = [];

    for (let k = 0; k < width * depth; k++) {
        const [terrain, rock] = [heights.terrain[k], heights.rock[k]];

        if (rock !== NONE && (terrain === NONE || rock - terrain > 1)) {
            far[k] = 0;
            queue.push(k);
        }
    }

    // (Out from the rocks, a square at a time, as far as `reach`: Dijkstra over the squares, each
    // step its length)
    const reach = DRESS.scree.reach / square;
    const steps = [
        [1, 0, 1],
        [-1, 0, 1],
        [0, 1, 1],
        [0, -1, 1],
        [1, 1, Math.SQRT2],
        [1, -1, Math.SQRT2],
        [-1, 1, Math.SQRT2],
        [-1, -1, Math.SQRT2],
    ];

    for (let head = 0; head < queue.length; head++) {
        const k = queue[head];
        const [i, j] = [k % width, Math.floor(k / width)];

        for (const [di, dj, step] of steps) {
            const [ni, nj] = [i + di, j + dj];
            const n = nj * width + ni;

            if (ni >= 0 && nj >= 0 && ni < width && nj < depth && far[k] + step < far[n] && far[k] + step <= reach) {
                far[n] = far[k] + step;
                queue.push(n);
            }
        }
    }

    const foot = [];

    for (let k = 0; k < width * depth; k++) {
        if (!(far[k] > 0 && far[k] <= reach)) {
            continue;
        }

        const [sx, sz] = [origin[0] + ((k % width) + 0.5) * square, origin[1] + (Math.floor(k / width) + 0.5) * square];

        if (onItsRoad(scene, sx, sz)) {
            continue;
        }

        const [wx, wy] = toWorld(placed, sx, sz);

        if (growsAt(placed, wx, wy)) {
            foot.push({ at: [sx, sz], height: land(wx, wy) - base, far: far[k] * square });
        } else if (heights.terrain[k] !== NONE && heights.all[k] - heights.terrain[k] < 0.3) {
            foot.push({ at: [sx, sz], height: heights.terrain[k], far: far[k] * square });
        }
    }

    return foot;
}

/**
 * Boulders and scree of our own rocks along a scene's crag's foot (footOf; `seed`, its own): the
 * boulders `far` and `near` (one mesh, drawn with each), the scree `near` (with the near world, and
 * faded out with it); or null if it has no foot. In its own metres.
 */
export function screeOf(placed, heights, land, seed) {
    const foot = footOf(placed, heights, land);

    if (!foot.length) {
        return null;
    }

    const { boulders, boulder, apart, heaps, stones, stone, spread, sunk, tint } = DRESS.scree;
    const { next } = createRandom(seed);
    const perMetre = () => 5 / MATERIALS.rock.world;
    // (A spot of the foot, nearer the rocks the likelier: tried a few times, the nearest kept)
    const spot = () => {
        let best = foot[Math.floor(next() * foot.length)];

        for (let k = 0; k < 2; k++) {
            const other = foot[Math.floor(next() * foot.length)];

            best = other.far < best.far ? other : best;
        }

        return best;
    };
    const big = new StoneMesher(boulders * 400);
    const small = new StoneMesher(heaps * stones[1] * 90);
    const put = (mesher, look, [x, z], height, across) => {
        const scale = [across * (0.8 + next() * 0.4), across * (0.55 + next() * 0.35), across * (0.8 + next() * 0.4)];

        mesher.place(look, { at: [x, height - scale[1] * (sunk[0] + next() * (sunk[1] - sunk[0])), z], turn: next() * Math.PI * 2, tilt: [(next() - 0.5) * 0.5, (next() - 0.5) * 0.3], scale, tint, growth: { lichen: 0.3, moss: 0.15 }, perMetre });
    };
    const spots = [];

    for (let tries = 0; spots.length < boulders && tries < boulders * 20; tries++) {
        const { at, height } = spot();

        if (spots.some(([x, z]) => Math.hypot(x - at[0], z - at[1]) < apart)) {
            continue;
        }

        spots.push(at);
        put(big, looksOf("boulders")[spots.length % DRESS.scree.looks], at, height, boulder[0] + next() * next() * (boulder[1] - boulder[0]));
    }

    for (let h = 0; h < heaps; h++) {
        const middle = spot().at;
        const count = stones[0] + Math.floor(next() * (stones[1] - stones[0] + 1));

        for (let k = 0; k < count; k++) {
            const [angle, out] = [next() * Math.PI * 2, Math.sqrt(next()) * spread];
            const at = [middle[0] + Math.cos(angle) * out, middle[1] + Math.sin(angle) * out];
            const height = heightUnder(placed, heights, land, at);

            if (height === null) {
                continue;
            }

            put(small, looksOf("scree")[(h + k) % DRESS.scree.looks], at, height, stone[0] + next() * next() * (stone[1] - stone[0]));
        }
    }

    const geometry = big.geometry();
    const far = new THREE.Mesh(geometry, cliffsFor("far"));
    const near = new THREE.Group();
    const scree = new THREE.Mesh(small.geometry(), cliffMaterial());

    far.name = "landmark boulders";
    scree.name = "landmark scree";
    near.name = "landmark boulders and scree";
    near.add(new THREE.Mesh(geometry, cliffsFor("near")), scree);
    near.children[0].name = "landmark boulders";

    return { far, near, geometries: [geometry, scree.geometry], boulders: spots.length };
}

// The ground's height under a point of a scene (its own metres) where scree may lie (footOf's
// rules), or null where it may not
function heightUnder(placed, heights, land, [sx, sz]) {
    const { origin, size, square } = heights;
    const [i, j] = [Math.floor((sx - origin[0]) / square), Math.floor((sz - origin[1]) / square)];

    if (i < 0 || j < 0 || i >= size[0] || j >= size[1] || onItsRoad(placed.scene, sx, sz)) {
        return null;
    }

    const k = j * size[0] + i;
    const [wx, wy] = toWorld(placed, sx, sz);

    if (growsAt(placed, wx, wy)) {
        return land(wx, wy) - placed.base;
    }

    return heights.terrain[k] !== NONE && heights.all[k] - heights.terrain[k] < 0.3 ? heights.terrain[k] : null;
}

/**
 * Where a scene's chasm's mist lies (DRESS.mist, `seed` its own): each puff's middle (its own
 * metres) over low ground in its box, its phase (0 to 1), and how big; none for a scene with no
 * chasm.
 */
export function puffsOf(id, heights, seed) {
    const mist = DRESS.mist[id];

    if (!mist) {
        return [];
    }

    const { next } = createRandom(seed);
    const [x0, z0, x1, z1] = mist.box;
    const puffs = [];

    for (let tries = 0; puffs.length < mist.puffs && tries < mist.puffs * 40; tries++) {
        const [x, z] = [x0 + next() * (x1 - x0), z0 + next() * (z1 - z0)];
        const ground = heightAt(heights, "terrain", x, z);

        if (ground === NONE || ground > mist.low) {
            continue;
        }

        puffs.push({ at: [x, ground + mist.over[0] + next() * (mist.over[1] - mist.over[0]), z], phase: next(), size: mist.size[0] + next() * (mist.size[1] - mist.size[0]) });
    }

    return puffs;
}

// The mist's material, for the near world's pass or the far land's: soft round puffs drifting to
// and fro along the chasm, breathing in and out, faded where they meet the ground (its terrain's
// heights: dressUniforms') and near the eye; the fog's as anything is; none on low quality
function mistMaterial(mist, uniforms, pass) {
    const f = (value) => value.toFixed(3);

    return new THREE.ShaderMaterial({
        name: `landmark mist (${pass})`,
        transparent: true,
        depthWrite: false,
        fog: true,
        defines: { NO_NEAR_FADE: "", [pass === "near" ? "MIST_NEAR" : "MIST_FAR"]: "" },
        uniforms: {
            ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
            mistTime: TREE_WIND.time,
            mistDetail: WATER_DETAIL,
            mistColour: { value: new THREE.Color(mist.colour) },
            skyGlow: SKY_GLOW,
            landmarkHeights: uniforms.landmarkHeights,
            landmarkArea: uniforms.landmarkArea,
        },
        vertexShader: `
#include <common>
#include <fog_pars_vertex>
attribute vec4 puff;
attribute float size;
uniform float mistTime;
uniform float mistDetail;
varying vec2 vCorner;
varying float vFade;
varying vec3 vAt;

void main() {
    float phase = puff.w * 6.2832;
    vec3 at = puff.xyz + vec3(sin(mistTime * ${f(mist.speed)} + phase) * ${f(mist.drift)}, sin(mistTime * 0.05 + phase * 1.7) * 1.5, cos(mistTime * ${f(mist.speed * 0.7)} + phase) * ${f(mist.drift * 0.2)});
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float depth = - (modelViewMatrix * vec4(at, 1.0)).z;

    // (Facing the eye: the camera's sideways and up turned into the scene's own)
    vAt = at + transpose(mat3(modelMatrix)) * (right * position.x + up * position.y) * size;

    vec4 mvPosition = modelViewMatrix * vec4(vAt, 1.0);

    gl_Position = projectionMatrix * mvPosition;
    vCorner = position.xy;
#ifdef MIST_NEAR
    float pass = 1.0 - smoothstep(${f(mist.pass[0])}, ${f(mist.pass[1])}, depth);
#else
    float pass = smoothstep(${f(mist.pass[0])}, ${f(mist.pass[1])}, depth);
#endif
    float ends = 1.0 - smoothstep(${f((mist.box[2] - mist.box[0]) * 0.42)}, ${f((mist.box[2] - mist.box[0]) * 0.5)}, abs(at.x - ${f((mist.box[0] + mist.box[2]) / 2)}));

    vFade = pass * ends * step(0.5, mistDetail) * smoothstep(${f(mist.near[0])}, ${f(mist.near[1])}, depth) * (0.7 + 0.3 * sin(mistTime * 0.07 + phase * 3.0));

    #include <fog_vertex>
}`,
        fragmentShader: `
#include <common>
#include <fog_pars_fragment>
uniform vec3 mistColour;
uniform vec3 skyGlow;
uniform sampler2D landmarkHeights;
uniform vec4 landmarkArea;
varying vec2 vCorner;
varying float vFade;
varying vec3 vAt;

void main() {
    float ground = texture2D(landmarkHeights, (vAt.xz - landmarkArea.xy) / landmarkArea.zw).r;
    float alpha = (1.0 - smoothstep(0.0, 0.5, length(vCorner))) * vFade * ${f(mist.alpha)} * smoothstep(0.0, ${f(mist.soft)}, vAt.y - ground);

    if (alpha <= 0.002) discard;

    gl_FragColor = vec4(mistColour * skyGlow, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}`,
    });
}

/**
 * A scene's chasm's mist (puffsOf's puffs), `far` and `near` (each drawn by how far off it is), in
 * its own metres; or null for a scene with no chasm.
 */
export function mistOf(id, heights, uniforms, seed) {
    const mist = DRESS.mist[id];
    const puffs = mist ? puffsOf(id, heights, seed) : [];

    if (!puffs.length) {
        return null;
    }

    const geometry = new THREE.InstancedBufferGeometry();
    const [x0, z0, x1, z1] = mist.box;

    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute("puff", new THREE.InstancedBufferAttribute(Float32Array.from(puffs.flatMap(({ at, phase }) => [...at, phase])), 4));
    geometry.setAttribute("size", new THREE.InstancedBufferAttribute(Float32Array.from(puffs, ({ size }) => size), 1));
    geometry.instanceCount = puffs.length;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2), Math.hypot(x1 - x0, z1 - z0) / 2 + mist.size[1] + mist.drift + 20);

    const [far, near] = ["far", "near"].map((pass) => {
        const mesh = new THREE.Mesh(geometry, mistMaterial(mist, uniforms, pass));

        mesh.name = "landmark mist";
        mesh.renderOrder = 3;

        return mesh;
    });

    return { far, near, geometry, puffs: puffs.length };
}

/** A scene's land, for screeOf: the world's land's height at a point (metres) of `plan`. */
export const landOf = (plan) => (x, y) => landHeight(plan, x, y);
