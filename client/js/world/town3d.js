// The town in 3D: every piece of the town's layout (houses, the tavern, church and blacksmith,
// props, trees: core/setpieces/town.js) built by the art kits (art/kits), each turned about its
// middle to face its street, with the trees in the fields round it, merged into as few meshes as
// possible (the trees a tile of the map at a time, so those out of view aren't drawn: trees.js).
// The world round it is drawn a chunk at a time (chunks3d.js).
//
// The kits build facing south, in the art's world pixels (a plot is 20, x east, y up and z south),
// and the world is in metres, so the town is scaled by PIXEL: a plot is PLOT (4) metres, a door 2
// metres tall. Everything that doesn't move is merged a block of the town (TILE metres square) at
// a time, all the kits' materials into the art's one (atlas.js), so each block is a draw call or
// two, and only the blocks in view (and in the sun's shadows) are drawn.
//
// The camera looks north over the town, so a house can stand between it and the player. The
// town's materials can cut a hole round the player through anything nearer the camera than them
// (CUTAWAY, set by the view when the town's height map says something's in the way).

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { atlasMaterial, glowMaterial, LIT_ALL_NIGHT, toAtlas, toGlow } from "./art/engine/atlas.js";
import { material } from "./art/engine/materials.js";
import { Solid } from "./art/engine/solid.js";
import { createRandom } from "../core/random.js";
import { pieceCatalog } from "../core/setpieces/pieces.js";
import { footprint } from "../core/setpieces/town.js";
import { PLOT } from "../core/world.js";
import { gatehouse, keep, RUINED, tower, wall } from "./art/kits/castle.js";
import { citadelPart } from "./art/kits/citadel.js";
import { house } from "./art/kits/house.js";
import { landmark } from "./art/kits/landmarks.js";
import { neutral } from "./art/kits/neutral.js";
import { builderFor } from "./art/peoples/index.js";
import { prop } from "./art/kits/props.js";
import { tree } from "./art/kits/town.js";
import { lieOf, yard } from "./art/kits/yards.js";
import { plantTrees, VARIANTS } from "./art/kits/trees.js";
import { canopyTint } from "./canopy.js";
import { lightsMesh, lightsOf } from "./lights.js";
import { chimneysOf, smokeMesh } from "./smoke.js";
import { clothMesh, clothOf } from "./cloth.js";

/** Metres per art world pixel. */
export const PIXEL = PLOT / 20;

// What builds each kind of piece (castle pieces too, for towns with walls one day; and each part
// of a hill citadel: kits/citadel.js)
export const BUILDERS = { house, landmark, prop, tree, wall, tower, gatehouse, keep, neutral, yard, citadel: citadelPart };

const catalog = new Map(pieceCatalog().map((piece) => [piece.key, piece]));

/**
 * What builds a piece: its people's kit if it's theirs (peoples/index.js), the castle's pieces
 * left to ruin if it's a ruined castle's (kits/castle.js RUINED), or the builder for its kind.
 */
export function builderOf(piece) {
    return builderFor(piece) ?? (piece.ruined ? RUINED[piece.kind] : null) ?? BUILDERS[piece.kind];
}

/**
 * The hole the town's materials cut round the player: its middle on the screen (drawing buffer
 * pixels, from the bottom left) and depth (0 near to 1 far), and its radius in pixels (0: none).
 */
export const CUTAWAY = Object.freeze({ centre: { value: new THREE.Vector3() }, radius: { value: 0 } });

// How far a building's roof reaches past its footprint (metres: the eaves)
const EAVES = 0.4;

/** How big a block of the town merged together is (metres a side). */
export const TILE = 32;

// What the camera pulls in closer than, rather than looking through (view.js): what's built,
// not the props (carts, wells, stalls) or the trees
const BUILT = new Set(["house", "landmark", "structure", "wall", "tower", "gatehouse", "keep", "neutral", "citadel"]);

/**
 * Foundations: how far the ground under what's built may rise or fall across it (metres) before
 * it's stood on a foundation, and how far into the ground below its lowest corner that goes.
 */
const FOUNDATION = Object.freeze({ from: 0.3, below: 0.3 });

// What each people builds its foundations of (as they build the rest): the humans' plain stone
const FOUNDED = Object.freeze({ cat: "mud-dark", elf: "stone-moon", darkElf: "stone-black", orc: "basalt", lizard: "stone-lime" });

/**
 * How high whatever stands on each square of an area is (metres): { x0, z0 (its north-west
 * square), width, height, rows (Float32Array rows, rows[z - z0][x - x0]), at(x, z) (any point,
 * 0 outside it) }.
 */
export function heightMap([x0, z0, width, height]) {
    const rows = Array.from({ length: height }, () => new Float32Array(width));

    return { x0, z0, width, height, rows, at: (x, z) => rows[Math.floor(z) - z0]?.[Math.floor(x) - x0] ?? 0 };
}

/**
 * Build the town and the trees in its fields: { object: a Group (in metres) of merged meshes,
 * heights: the height of whatever stands on each of its squares that could hide the player (what's
 * built and the trees, not the props: heightMap's), and buildings: the same for what's built alone
 * (BUILT) }. The town's corner is at `world.origin` ([x, z] or
 * a number for both), and its squares are `world.stamp`'s (where it's set in the world: [x, z]
 * `at`, its width and height) or the world's own. `onProgress(done, total)` hears as each piece
 * is built; `landAt(x, z)` says what land (BIOMES id) a tree stands in, its leaves coloured as
 * the land colours them (canopy.js).
 */
export async function buildTown(world, { onProgress = () => {}, groundAt = () => 0, landAt = () => "meadow" } = {}) {
    const art = new THREE.Group();
    const [ox, oz] = Array.isArray(world.origin) ? world.origin : [world.origin, world.origin];
    // (The yards behind its houses too, standing on the ground as it lies under each: kits/yards.js)
    const yards = (world.town.yards ?? []).map((one) => ({ ...one, lie: lieOf(one, groundAt, [ox, oz]) }));
    const total = world.town.pieces.length + yards.length + world.trees.length;
    const area = world.stamp ? [...world.stamp.at, world.stamp.width, world.stamp.height] : [0, 0, world.width, world.height];
    const heights = heightMap(area);
    const buildings = heightMap(area);
    let done = 0;

    art.scale.setScalar(PIXEL);

    // Let the page update (and show the progress) every so often
    let lastYield = performance.now();
    const breathe = async () => {
        if (performance.now() - lastYield > 30) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            lastYield = performance.now();
        }
    };

    // The trees, planted together at the end (trees.js: merged a tile at a time), each turned
    // and sized a little differently: in the town, in the fields, and in the forest round them
    const planted = [];
    const random = createRandom(world.seed * 13 + 5);
    const plant = (x, z, variant, size) => planted.push({ x, z, variant, size: size * random.range(0.9, 1.1), turn: random.next() * Math.PI * 2 });

    for (const piece of [...world.town.pieces, ...yards]) {
        // (A layout's piece says what it is; the art catalogue's pieces are its sizes)
        const spec = piece.kind ? piece : catalog.get(piece.key);

        // A tree stands on its trunk's point, where four squares meet
        if (spec.kind === "tree") {
            plant(ox + piece.x, oz + piece.y, spec.variant, 0.9);
            onProgress(++done, total);
            continue;
        }

        // Everything else is built facing south (by its people's kit, if it's theirs; left to ruin,
        // if it's a ruined castle's), and turned to face its street (or the market) about its middle
        const build = builderOf(spec);

        if (!build) {
            onProgress(++done, total);
            continue;
        }

        // (A piece that fails to build is left out rather than keeping the town from being drawn)
        let built;

        try {
            built = await build(spec);
        } catch (error) {
            console.warn(`Left out ${spec.key ?? spec.kind}: it failed to build.`, error);
            onProgress(++done, total);
            continue;
        }

        const object = new THREE.Group();

        // (Trees a piece grows round itself, as the elves build into great trees: planted with
        // the town's, where they stand as the piece is turned)
        for (const { x, z, variant, size = 1 } of built.userData?.trees ?? []) {
            const [lx, lz] = [(x - piece.w * 10) * PIXEL, (z - piece.h * 10) * PIXEL];
            const [c, s] = [Math.cos(piece.facing), Math.sin(piece.facing)];

            plant(ox + piece.x + lx * c + lz * s, oz + piece.y - lx * s + lz * c, variant, size);
        }

        const y = grounded(built, piece, groundAt, [ox, oz]);

        built.position.set(-piece.w * 10, 0, -piece.h * 10);
        object.add(built);
        object.rotation.y = piece.facing;
        object.position.set((ox + piece.x) / PIXEL, y / PIXEL, (oz + piece.y) / PIXEL);
        object.userData.built = BUILT.has(spec.kind);
        object.userData.piece = piece;
        art.add(object);
        onProgress(++done, total);
        await breathe();
    }

    // Field trees stand on their trunk's point, where four squares meet
    for (const { x, y, variant } of world.trees) {
        plant(x, y, variant, 1);
        onProgress(++done, total);
    }

    await breathe();

    const trees = plantTrees(
        planted.map((tree) => ({ ...tree, tint: canopyTint(landAt(tree.x, tree.z), VARIANTS[tree.variant % VARIANTS.length][0], tree.x, tree.z) })),
        { groundAt },
    );

    art.updateMatrixWorld(true);

    // (Smoke rising from its chimneys: smoke.js; its banners and flags in the breeze: cloth.js;
    // its torches and lanterns, lit at night: lights.js)
    const smoke = smokeMesh(chimneysOf(art));
    const cloth = clothMesh(clothOf(art));
    const lights = lightsOf(art);
    const lit = lightsMesh(lights);

    // How high everything stands on each square
    const stand = (box, built) => {
        for (const map of built ? [heights, buildings] : [heights]) {
            for (let z = Math.max(map.z0, Math.floor(box.min.z)); z < Math.min(map.z0 + map.height, Math.ceil(box.max.z)); z++) {
                const row = map.rows[z - map.z0];

                for (let x = Math.max(map.x0, Math.floor(box.min.x)); x < Math.min(map.x0 + map.width, Math.ceil(box.max.x)); x++) {
                    row[x - map.x0] = Math.max(row[x - map.x0], box.max.y);
                }
            }
        }
    };

    // (A building's height over the squares under it and its eaves, as it's turned: not its
    // turned box's, which would be wider; a yard's fences and washing in no one's way, nor the
    // props, a well's roof, a cart, a stall, low enough to see the player round: as out in the
    // world, chunks3d.js, the camera never cuts a hole through them for standing behind one)
    for (const object of art.children.filter(({ userData }) => userData.piece.kind !== "yard" && userData.piece.kind !== "prop")) {
        const top = new THREE.Box3().setFromObject(object).max.y;
        const corners = footprint(object.userData.piece, EAVES).map(([x, y]) => [ox + x, oz + y]);
        const xs = corners.map(([x]) => x);
        const zs = corners.map(([, z]) => z);

        for (const map of object.userData.built ? [heights, buildings] : [heights]) {
            for (let z = Math.max(map.z0, Math.floor(Math.min(...zs))); z < Math.min(map.z0 + map.height, Math.ceil(Math.max(...zs))); z++) {
                for (let x = Math.max(map.x0, Math.floor(Math.min(...xs))); x < Math.min(map.x0 + map.width, Math.ceil(Math.max(...xs))); x++) {
                    if (within(corners, x + 0.5, z + 0.5)) {
                        map.rows[z - map.z0][x - map.x0] = Math.max(map.rows[z - map.z0][x - map.x0], top);
                    }
                }
            }
        }
    }

    trees.boxes.forEach((box) => stand(box, false));

    // Merged a block at a time (by where each piece's middle is), into the art's one material
    const object = new THREE.Group();
    const blocks = new Map();

    for (const child of [...art.children]) {
        const { x, y } = child.userData.piece;
        const key = `${Math.floor((ox + x) / TILE)},${Math.floor((oz + y) / TILE)}`;

        if (!blocks.has(key)) {
            const block = new THREE.Group();

            block.scale.setScalar(PIXEL);
            blocks.set(key, block);
        }

        blocks.get(key).add(child);
    }

    for (const [key, block] of blocks) {
        block.updateMatrixWorld(true);

        const merged = merge(block, { atlas: true });

        for (const mesh of [...merged.children]) {
            mesh.name = `${mesh.name} ${key}`;
            object.add(mesh);
        }
    }

    object.name = "town";

    for (const mesh of [...object.children, ...trees.object.children.filter(({ userData }) => !userData.onGround)]) {
        cutAway(mesh.material);
    }

    object.add(trees.object);

    for (const drawn of [smoke, cloth, lit]) {
        if (drawn) {
            object.add(drawn);
        }
    }

    return { object, heights, buildings, lights };
}

/**
 * A piece built by the art kits (facing south, in world pixels), turned to face the way it does
 * about its middle and put where it stands (metres: its layout's place plus `origin`, on ground
 * `y` metres high), in a group scaled to world pixels.
 */
export function placed(built, piece, [ox, oz] = [0, 0], y = 0) {
    const object = new THREE.Group();

    built.position.set(-piece.w * 10, 0, -piece.h * 10);
    object.add(built);
    object.rotation.y = piece.facing;
    object.position.set((ox + piece.x) / PIXEL, y / PIXEL, (oz + piece.y) / PIXEL);
    object.userData.built = BUILT.has(piece.kind);
    object.userData.piece = piece;

    return object;
}

/**
 * How high a piece stands (metres): its own `base` if it has one (a citadel's part, on its ward's
 * terrace); else the ground under its middle (`groundAt(x, y)`, metres, from
 * `origin`); or, for what's built on ground that rises or falls more than FOUNDATION.from across
 * it (a settlement lying with a slope), its highest corner's, a foundation added to it (as the
 * art kits built it, before it's placed: of its people's stone, or the cat folk's mud brick) from
 * there down past its lowest corner, under all of it but its eaves.
 */
export function grounded(built, piece, groundAt, [ox, oz] = [0, 0]) {
    // (A citadel's part stands on its ward's terrace, and reaches down its face itself)
    if (piece.base !== undefined) {
        return piece.base;
    }

    const middle = groundAt(ox + piece.x, oz + piece.y);

    // (A neutral site's parts reach down into the ground themselves: art/kits/neutral.js)
    if (!BUILT.has(piece.kind) || piece.kind === "neutral") {
        return middle;
    }

    const heights = footprint(piece).map(([x, y]) => groundAt(ox + x, oz + y));
    const [low, high] = [Math.min(middle, ...heights), Math.max(middle, ...heights)];

    if (high - low < FOUNDATION.from) {
        return middle;
    }

    // (Under what's built, as far as its plot: a little in from its widest, past which the eaves
    // reach)
    built.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(built);
    const [x0, x1] = [Math.max(0, box.min.x) + 2, Math.min(piece.w * 20, box.max.x) - 2];
    const [z0, z1] = [Math.max(0, box.min.z) + 2, Math.min(piece.h * 20, box.max.z) - 2];

    if (x1 > x0 && z1 > z0) {
        const solid = new Solid();

        solid.box(x0, -(high - low + FOUNDATION.below) / PIXEL, z0, x1, 0.05 / PIXEL, z1, material(FOUNDED[piece.people] ?? "stone"));
        built.add(solid.toObject());
    }

    return high;
}

/**
 * Record how high a built piece (placed's, its world matrix up to date) stands over the squares
 * under it and its eaves (as it's turned, not its turned box), in a height map's rows (or any
 * `rows`, `x0`, `z0`, `width`, `height` alike), from `origin`.
 */
export function standOn(map, object, [ox, oz] = [0, 0]) {
    const top = new THREE.Box3().setFromObject(object).max.y;
    const corners = footprint(object.userData.piece, EAVES).map(([x, y]) => [ox + x, oz + y]);
    const xs = corners.map(([x]) => x);
    const zs = corners.map(([, z]) => z);

    for (let z = Math.max(map.z0, Math.floor(Math.min(...zs))); z < Math.min(map.z0 + map.height, Math.ceil(Math.max(...zs))); z++) {
        for (let x = Math.max(map.x0, Math.floor(Math.min(...xs))); x < Math.min(map.x0 + map.width, Math.ceil(Math.max(...xs))); x++) {
            if (within(corners, x + 0.5, z + 0.5)) {
                map.rows[z - map.z0][x - map.x0] = Math.max(map.rows[z - map.z0][x - map.x0], top);
            }
        }
    }
}

// Is a point inside a polygon ([[x, z]...])?
function within(corners, px, pz) {
    let inside = false;

    for (let k = 0, last = corners.length - 1; k < corners.length; last = k++) {
        const [[ax, az], [bx, bz]] = [corners[k], corners[last]];

        if (az > pz !== bz > pz && px < ((bx - ax) * (pz - az)) / (bz - az) + ax) {
            inside = !inside;
        }
    }

    return inside;
}

/**
 * Cut a hole round the player through the parts of a material nearer the camera than they are,
 * with a dithered edge (the shadows it casts stay whole): once for each material.
 */
export function cutAway(material) {
    if (material.userData.cutAway) {
        return;
    }

    // (After whatever the material does to its shader already: a tree's leaves' lighting)
    const before = material.onBeforeCompile.bind(material);
    const key = material.customProgramCacheKey();

    material.userData.cutAway = true;
    material.onBeforeCompile = (shader, renderer) => {
        before(shader, renderer);
        shader.uniforms.cutCentre = CUTAWAY.centre;
        shader.uniforms.cutRadius = CUTAWAY.radius;
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nuniform vec3 cutCentre;\nuniform float cutRadius;")
            .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
if (cutRadius > 0.0 && gl_FragCoord.z < cutCentre.z) {
    float r = length(gl_FragCoord.xy - cutCentre.xy) / cutRadius;
    float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

    if (r < 1.0 && dither > smoothstep(0.55, 1.0, r)) discard;
}`);
    };
    material.customProgramCacheKey = () => `cutAway|${key}`;
    material.needsUpdate = true;
}

// A key for materials that look the same (models' materials are copied for each copy of a model)
function materialKey(material) {
    return [material.type, material.name, material.map?.uuid ?? "", material.color?.getHexString() ?? "", material.vertexColors, material.side, material.transparent].join("|");
}

/**
 * Merge every mesh under `root` (baked to its place) into one mesh per material; with `atlas`,
 * everything the art's one material can draw into one mesh of it (atlas.js).
 */
export function merge(root, { atlas = false } = {}) {
    return joined(partsOf(root, { atlas }));
}

/**
 * The meshes under `root` (their world matrices up to date), each baked to its place and made
 * ready to be merged: a part for each material group, drawn into the art's one material if it can
 * be, with `atlas` (and every light into the one glowing material); or, `atlas` a function of what
 * a part was made in, into the material it gives, drawn from the atlas as that one is (the
 * insides': interiors3d.js), lights left as they are. [{ key, material, geometry, near (only worth
 * drawing near: Solid's) }], for `joined` (merge's first half, so that the parts of what's built a
 * piece at a time can be made a piece at a time: chunks3d.js).
 */
export function partsOf(root, { atlas = false } = {}) {
    const parts = [];
    // (Whether a node's in a building whose windows are lit all night: atlas.js LIT_ALL_NIGHT)
    const allNight = (node) => {
        for (let at = node; at; at = at.parent) {
            const piece = at.userData.piece;

            if (piece) {
                return LIT_ALL_NIGHT.landmarks.includes(piece.kind === "landmark" ? piece.name : piece.kind);
            }
        }

        return false;
    };

    root.traverse((node) => {
        if (!node.isMesh) {
            return;
        }

        const materials = Array.isArray(node.material) ? node.material : [node.material];
        const source = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();

        source.applyMatrix4(node.matrixWorld);

        // One part per material group (most meshes have one)
        const split = node.geometry.groups.length && materials.length > 1
            ? node.geometry.groups.map((group) => [extract(source, group.start, group.count), materials[group.materialIndex]])
            : [[source, materials[0]]];

        const night = { allNight: allNight(node) };

        for (const [part, own] of split) {
            const drawn = atlas ? toAtlas(part, own, night) : null;
            // (Every light in one mesh of its own, each face in its own colour)
            const lit = atlas === true && !drawn ? toGlow(part, own) : null;
            const [geometry, material] = drawn ? [drawn, atlas === true ? atlasMaterial() : atlas(own)] : lit ? [lit, glowMaterial()] : [part, own];
            const key = drawn && atlas === true ? "atlas" : lit ? "glow" : materialKey(material);
            const keep = drawn ? ["position", "normal", "uv", "color", "layer"] : ["position", "normal", "uv", ...(material.vertexColors ? ["color"] : [])];

            for (const name of Object.keys(geometry.attributes)) {
                if (!keep.includes(name)) {
                    geometry.deleteAttribute(name);
                }
            }

            if (!geometry.attributes.uv) {
                geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
            }

            parts.push({ key, material, geometry, near: Boolean(node.userData.near) });
        }
    });

    return parts;
}

/**
 * Parts (partsOf's, in order) merged: one mesh per material (merge's second half). What's only
 * worth drawing near comes last in each, after as many corners as its userData.far says: draw
 * only that many from further off (drawFar).
 */
export function joined(parts) {
    const groups = new Map();

    for (const { key, material, geometry, near } of parts) {
        if (!groups.has(key)) {
            groups.set(key, { material, geometries: [], near: [] });
        }

        groups.get(key)[near ? "near" : "geometries"].push(geometry);
    }

    const result = new THREE.Group();

    for (const { material, geometries, near } of groups.values()) {
        const mesh = new THREE.Mesh(mergeGeometries([...geometries, ...near]), material);

        mesh.name = material.name || "part";
        // (All but what says it casts none: cards of leaves cut out of their pictures, whose
        // shadows would be their whole rectangles)
        mesh.castShadow = material.userData.shadow !== false;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.userData.far = geometries.reduce((count, geometry) => count + geometry.attributes.position.count, 0);
        result.add(mesh);
    }

    return result;
}

/** Draw a merge's meshes (joined's) whole, or (`far`) without what's only worth drawing near. */
export function drawFar(merged, far) {
    for (const mesh of merged.children) {
        mesh.geometry.setDrawRange(0, far ? mesh.userData.far : Infinity);
    }
}

// The triangles of one material group of a (non-indexed copy of a) geometry. Groups count
// indices, and after toNonIndexed each index became a vertex, so the ranges still match
function extract(nonIndexed, start, count) {
    const geometry = new THREE.BufferGeometry();
    const end = start + count;

    for (const [name, attribute] of Object.entries(nonIndexed.attributes)) {
        const size = attribute.itemSize;

        geometry.setAttribute(name, new THREE.Float32BufferAttribute(attribute.array.slice(start * size, end * size), size));
    }

    return geometry;
}
