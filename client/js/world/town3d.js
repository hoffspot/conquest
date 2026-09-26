// The town in 3D: every piece of the town's plan (houses, the tavern, church and blacksmith, props,
// trees) built by the art kits (art/kits), with the trees in the fields round it, merged into as
// few meshes as possible.
//
// The kits build in the art's world pixels (a plan square is 20, x east, y up and z south), and
// the world is in metres, so the town is scaled by PIXEL: a plan square is PLOT (4) metres, a door
// 2 metres tall. Everything that doesn't move is merged by material, so the whole town draws in a
// few dozen draw calls, however many houses it has.
//
// The camera looks north over the town, so a house can stand between it and the player. The
// town's materials can cut a hole round the player through anything nearer the camera than them
// (CUTAWAY, set by the view when the town's height map says something's in the way).

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createRandom } from "../core/random.js";
import { GROUND, pieceCatalog, TREE_VARIANTS } from "../core/setpieces/pieces.js";
import { PLOT } from "../core/world.js";
import { gatehouse, keep, tower, wall } from "./art/kits/castle.js";
import { house } from "./art/kits/house.js";
import { landmark } from "./art/kits/landmarks.js";
import { prop, tree } from "./art/kits/town.js";

/** Metres per art world pixel. */
export const PIXEL = PLOT / 20;

// The forest round the map: how far outside its edge trees grow (metres)
const BORDER = { near: 1.5, far: 16 };

// What builds each kind of piece (castle pieces too, for towns with walls one day)
export const BUILDERS = { house, landmark, prop, tree, wall, tower, gatehouse, keep };

const catalog = new Map(pieceCatalog().map((piece) => [piece.key, piece]));

/**
 * The hole the town's materials cut round the player: its middle on the screen (drawing buffer
 * pixels, from the bottom left) and depth (0 near to 1 far), and its radius in pixels (0: none).
 */
export const CUTAWAY = Object.freeze({ centre: { value: new THREE.Vector3() }, radius: { value: 0 } });

/**
 * Build the town and the trees round it: { object: a Group (in metres) of merged meshes, heights:
 * the height of whatever stands on each square, heights[y][x], in metres }. `onProgress(done,
 * total)` hears as each piece is built.
 */
export async function buildTown(world, { onProgress = () => {} } = {}) {
    const art = new THREE.Group();
    const origin = world.origin / PIXEL;
    const total = world.town.pieces.length + world.trees.length;
    const heights = Array.from({ length: world.height }, () => new Float32Array(world.width));
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

    for (const piece of world.town.pieces) {
        const spec = catalog.get(piece.key);
        const built = await BUILDERS[spec.kind](spec);
        let object = built;

        // The tavern turns to face the square (or a street: world.js), about its middle
        if (spec.kind === "landmark" && spec.name === "tavern" && world.tavern) {
            const [halfW, halfH] = [piece.w * 10, piece.h * 10];

            object = new THREE.Group();
            built.position.set(-halfW, 0, -halfH);
            object.add(built);
            object.rotation.y = world.tavern.facing;
            object.position.set(origin + piece.x * 20 + halfW, 0, origin + piece.y * 20 + halfH);
        } else {
            object.position.set(origin + piece.x * 20, 0, origin + piece.y * 20);
        }

        art.add(object);
        onProgress(++done, total);
        await breathe();
    }

    // Field trees stand on their trunk's point, where four squares meet (the kit centres a tree
    // in a 20-pixel square)
    for (const { x, y, variant } of world.trees) {
        const object = await tree({ variant });

        object.position.set(x / PIXEL - 10, 0, y / PIXEL - 10);
        art.add(object);
        onProgress(++done, total);
        await breathe();
    }

    // A forest round the map's edge, where no one can go, leaving the roads' ways out clear
    for (const { x, y, variant, size } of borderTrees(world)) {
        const object = await tree({ variant });

        object.scale.setScalar(size);
        object.position.set(x / PIXEL - 10 * size, 0, y / PIXEL - 10 * size);
        art.add(object);
    }

    art.updateMatrixWorld(true);

    // How high everything stands on each square
    const box = new THREE.Box3();

    for (const object of art.children) {
        box.setFromObject(object);

        for (let y = Math.max(0, Math.floor(box.min.z)); y < Math.min(world.height, Math.ceil(box.max.z)); y++) {
            for (let x = Math.max(0, Math.floor(box.min.x)); x < Math.min(world.width, Math.ceil(box.max.x)); x++) {
                heights[y][x] = Math.max(heights[y][x], box.max.y);
            }
        }
    }

    const object = merge(art);

    object.name = "town";

    for (const mesh of object.children) {
        cutAway(mesh.material);
    }

    return { object, heights };
}

// Trees in a band round the outside of the map (metres), clear of the roads leaving it
function borderTrees(world) {
    const random = createRandom(world.seed * 7 + 3);
    const trees = [];
    const { width, height, ground } = world;
    const roadAt = (x, y) => ground[Math.min(height - 1, Math.max(0, Math.floor(y)))][Math.min(width - 1, Math.max(0, Math.floor(x)))] === GROUND.road;

    for (let k = 0; k < (width + height) * 0.55; k++) {
        const along = random.next() * 2 * (width + height);
        const out = BORDER.near + random.next() ** 1.5 * (BORDER.far - BORDER.near);
        let [x, y] = along < width ? [along, -out] : along < width + height ? [width + out, along - width] : along < 2 * width + height ? [along - width - height, height + out] : [-out, along - 2 * width - height];

        x += (random.next() - 0.5) * 2;
        y += (random.next() - 0.5) * 2;

        // Where the nearest edge square is a road, leave the way clear
        const edgeX = Math.min(width - 1, Math.max(0, x));
        const edgeY = Math.min(height - 1, Math.max(0, y));
        const nearRoad = [-3, 0, 3].some((d) => roadAt(edgeX + (x < 0 || x > width ? 0 : d), edgeY + (y < 0 || y > height ? 0 : d)));

        if (!nearRoad) {
            trees.push({ x, y, variant: random.int(0, TREE_VARIANTS - 1), size: 0.85 + random.next() * 0.5 });
        }
    }

    return trees;
}

// Cut a hole round the player through the parts of a material nearer the camera than they are,
// with a dithered edge (the shadows it casts stay whole)
function cutAway(material) {
    if (material.userData.cutAway) {
        return;
    }

    material.userData.cutAway = true;
    material.onBeforeCompile = (shader) => {
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
    material.customProgramCacheKey = () => "cutAway";
    material.needsUpdate = true;
}

// A key for materials that look the same (models' materials are copied for each copy of a model)
function materialKey(material) {
    return [material.type, material.name, material.map?.uuid ?? "", material.color?.getHexString() ?? "", material.vertexColors, material.side, material.transparent].join("|");
}

/** Merge every mesh under `root` (baked to its place) into one mesh per material. */
export function merge(root) {
    const groups = new Map();

    root.traverse((node) => {
        if (!node.isMesh) {
            return;
        }

        const materials = Array.isArray(node.material) ? node.material : [node.material];
        const source = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();

        source.applyMatrix4(node.matrixWorld);

        // One part per material group (most meshes have one)
        const parts = node.geometry.groups.length && materials.length > 1
            ? node.geometry.groups.map((group) => [extract(source, group.start, group.count), materials[group.materialIndex]])
            : [[source, materials[0]]];

        for (const [geometry, material] of parts) {
            const key = materialKey(material);

            for (const name of Object.keys(geometry.attributes)) {
                if (!["position", "normal", "uv"].includes(name) && !(name === "color" && material.vertexColors)) {
                    geometry.deleteAttribute(name);
                }
            }

            if (!geometry.attributes.uv) {
                geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
            }

            if (!groups.has(key)) {
                groups.set(key, { material, geometries: [] });
            }

            groups.get(key).geometries.push(geometry);
        }
    });

    const result = new THREE.Group();

    for (const { material, geometries } of groups.values()) {
        const mesh = new THREE.Mesh(mergeGeometries(geometries), material);

        mesh.name = material.name || "part";
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        result.add(mesh);
    }

    return result;
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
