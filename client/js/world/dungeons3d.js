// How a dungeon's levels look, beyond what's built for them (world/interiors3d.js dungeon): the
// photographs their rock and stone are drawn with (CC0, downloaded only once a dungeon's wanted:
// the catalog, app/assets.js; scripts/build-textures.js makes them), and the material that draws
// a level's rock (caverns.js) with them: the picture laid over it from all three sides at once
// (triplanar, so it's never stretched however the rock turns), its grain and its bumps, under the
// colour each theme gives its rock, lit by the room's flames (roomlight.js) and never cut away.

import * as THREE from "three";
import { ASSETS } from "../app/assets.js";
import { hashed } from "../app/catalog.js";
import { DUNGEON_PICTURES } from "./dungeonpictures.js";
import { roomLit } from "./roomlight.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { loadGltf } from "./art/engine/models.js";
import { CAVERNS } from "./caverns.js";

/**
 * The pictures a dungeon's rock and stone can be drawn with, by name (dungeonpictures.js, made by
 * scripts/build-textures.js): each a catalog entry (app/assets.js) of a colour picture and a
 * normal map (OpenGL's way up), how many metres one repeat of it covers (`metres`), and its
 * average colour (`mean`, 0 to 1: the picture's grain is taken as how far it is from that, the
 * colour itself being the theme's).
 */
export const ROCK_PICTURES = DUNGEON_PICTURES;

// A picture's texture, by its file: made at once, and drawn once its picture's come and been
// decoded (until then `loaded` says it isn't, and the rock's drawn without it)
const textures = new Map();

function pictureTexture(path, colour) {
    if (textures.has(path)) {
        return textures.get(path);
    }

    const texture = new THREE.Texture();
    const loaded = { value: 0 };
    const file = Object.values(ASSETS.models)
        .flatMap(({ files }) => files)
        .find((each) => each.path === path);

    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.flipY = false;
    texture.anisotropy = 4;
    texture.userData.loaded = loaded;
    textures.set(path, texture);

    if (file && typeof fetch === "function" && typeof createImageBitmap === "function") {
        fetch(new URL(hashed(file.path, file.hash), globalThis.document?.baseURI ?? globalThis.location?.href).href)
            .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`${response.status} ${path}`))))
            .then((blob) => createImageBitmap(blob))
            .then((bitmap) => {
                texture.image = bitmap;
                texture.needsUpdate = true;
                loaded.value = 1;
            })
            .catch((error) => console.warn(`Couldn't load ${path}`, error));
    }

    return texture;
}

/** A picture's colour and normal textures (ROCK_PICTURES' name), and whether each has loaded. */
export function rockPictures(name) {
    const picture = ROCK_PICTURES[name];
    const files = ASSETS.models[picture.entry]?.files ?? [];
    const of = (kind) => files.find(({ path }) => path.includes(`-${kind}.`))?.path ?? `${picture.entry}-${kind}`;

    return { colour: pictureTexture(of("colour"), true), normal: pictureTexture(of("normal"), false), picture };
}

// The rock's material for each picture: its points' colours (the theme's, shaded: caverns.js),
// the picture's grain and bumps over them
const rocks = new Map();

/** The material a level's rock is drawn with, with a picture (ROCK_PICTURES' name). */
export function rockMaterial(name) {
    if (rocks.has(name)) {
        return rocks.get(name);
    }

    const { colour, normal, picture } = rockPictures(name);
    const result = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    const uniforms = {
        rockColour: { value: colour },
        rockNormal: { value: normal },
        rockLoaded: colour.userData.loaded,
        rockBumps: normal.userData.loaded,
        rockRepeat: { value: 1 / picture.metres },
        rockMean: { value: new THREE.Vector3(...picture.mean) },
    };

    result.name = `rock-${name}`;
    result.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vCutWorld;\nvarying vec3 vRockNormal;")
            .replace("#include <project_vertex>", "#include <project_vertex>\nvCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRockNormal = normalize(mat3(modelMatrix) * objectNormal);");
        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>
varying vec3 vCutWorld;
varying vec3 vRockNormal;
uniform sampler2D rockColour;
uniform sampler2D rockNormal;
uniform float rockLoaded;
uniform float rockBumps;
uniform float rockRepeat;
uniform vec3 rockMean;

// (How much each of the three sides the picture's laid from counts here, by which way the rock
// faces: sharply, so each side's own picture shows where it faces that way)
vec3 rockWeights(vec3 n) {
    vec3 w = pow(abs(n), vec3(6.0));

    return w / (w.x + w.y + w.z);
}`,
            )
            .replace(
                "#include <map_fragment>",
                `#include <map_fragment>
{
    vec3 w = rockWeights(normalize(vRockNormal));
    vec3 p = vCutWorld * rockRepeat;
    vec3 grain = texture2D(rockColour, p.zy).rgb * w.x + texture2D(rockColour, p.xz).rgb * w.y + texture2D(rockColour, p.xy).rgb * w.z;

    diffuseColor.rgb *= mix(vec3(1.0), clamp(grain / rockMean, 0.0, 2.5), rockLoaded);
}`,
            )
            .replace(
                "#include <normal_fragment_maps>",
                `#include <normal_fragment_maps>
if (rockBumps > 0.5) {
    // (Each side's bumps turned to the world, as the whiteout blend has it, then summed by how
    // much each side counts, and into the view)
    vec3 n = normalize(vRockNormal);
    vec3 w = rockWeights(n);
    vec3 p = vCutWorld * rockRepeat;
    vec3 tx = texture2D(rockNormal, p.zy).xyz * 2.0 - 1.0;
    vec3 ty = texture2D(rockNormal, p.xz).xyz * 2.0 - 1.0;
    vec3 tz = texture2D(rockNormal, p.xy).xyz * 2.0 - 1.0;

    tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
    ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
    tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);

    vec3 bumped = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);

    normal = normalize((viewMatrix * vec4(bumped, 0.0)).xyz);
}`,
            );
        roomLit(shader);
    };
    result.customProgramCacheKey = () => "rock-triplanar";
    rocks.set(name, result);

    return result;
}

// Each face of a box: its four corners (which of x0/x1, y0/y1, z0/z1: 0 or 1 each), counter-
// clockwise seen from outside, and which way it faces
const FACES = [
    { corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], normal: [1, 0, 0] },
    { corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], normal: [-1, 0, 0] },
    { corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], normal: [0, 1, 0] },
    { corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], normal: [0, -1, 0] },
    { corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], normal: [0, 0, 1] },
    { corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], normal: [0, 0, -1] },
];

/**
 * Boxes drawn with one of the pictures (ROCK_PICTURES), each its own shade of the colour it's
 * given (a temple's walls and floor, a hideout's timbers): metres, as the level's laid out.
 */
export class Blocks {
    constructor() {
        this.positions = [];
        this.normals = [];
        this.shades = [];
        this.indices = [];
    }

    /**
     * A box from (x0, y0, z0) to (x1, y1, z1), `shade` times as dark as the colour (0 to 1),
     * turned `turn` radians round the upright through its middle (a tomb's lid pushed askew).
     */
    box(x0, y0, z0, x1, y1, z1, shade = 1, turn = 0) {
        const at = [
            [x0, x1],
            [y0, y1],
            [z0, z1],
        ];
        const [cx, cz, cos, sin] = [(x0 + x1) / 2, (z0 + z1) / 2, Math.cos(turn), Math.sin(turn)];
        // (A point or a way turned round the upright through the middle, as three.js turns: +x to -z)
        const turned = (x, z, about = true) => {
            const [dx, dz] = about ? [x - cx, z - cz] : [x, z];

            return [(about ? cx : 0) + dx * cos + dz * sin, (about ? cz : 0) - dx * sin + dz * cos];
        };

        for (const { corners, normal } of FACES) {
            const first = this.positions.length / 3;
            const [nx, nz] = turned(normal[0], normal[2], false);

            for (const corner of corners) {
                const [x, z] = turned(at[0][corner[0]], at[2][corner[2]]);

                this.positions.push(x, at[1][corner[1]], z);
                this.normals.push(nx, normal[1], nz);
                this.shades.push(shade);
            }

            this.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
        }
    }

    /**
     * The boxes as a mesh drawn with a picture (ROCK_PICTURES' name) in `colour` (a hex colour;
     * the picture's own, if none), or null if there are none.
     */
    mesh(picture, colour = null, name = picture) {
        if (!this.indices.length) {
            return null;
        }

        const geometry = new THREE.BufferGeometry();
        const tint = colour === null ? new THREE.Color().setRGB(...ROCK_PICTURES[picture].mean, THREE.LinearSRGBColorSpace) : new THREE.Color(colour);
        const colours = new Float32Array(this.shades.length * 3);

        this.shades.forEach((shade, k) => colours.set([tint.r * shade, tint.g * shade, tint.b * shade], k * 3));
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
        geometry.setIndex(this.positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.indices, 1) : new THREE.Uint16BufferAttribute(this.indices, 1));

        const result = new THREE.Mesh(geometry, rockMaterial(picture));

        result.name = name;
        // (A floor casts no shadow on anything)
        result.userData.shadowless = name === "floor";

        return result;
    }
}

/**
 * The scanned models a dungeon's rooms are furnished with (scripts/build-props.js: Poly Haven's,
 * CC0), by name, as the catalog (app/assets.js) lists them: each its file's entry (`asset`,
 * downloaded only once a dungeon's wanted) and, for one of a set's pieces (three candleholders in
 * one file, a heap of rocks), its nodes in that file (`nodes`; null for the whole file).
 */
export const DUNGEON_PROPS = Object.freeze(
    Object.fromEntries(
        Object.entries(ASSETS.models)
            .filter(([asset]) => asset.startsWith("dungeon-prop-"))
            .flatMap(([asset, { pieces }]) => (pieces ? Object.entries(pieces).map(([name, nodes]) => [name, Object.freeze({ asset, nodes })]) : [[asset.slice("dungeon-prop-".length), Object.freeze({ asset, nodes: null })]])),
    ),
);

// Each file, once read (a promise of its scene), and each model, once taken from it (a promise of
// its parts and size)
const files = new Map();
const props = new Map();

// What's kept of a model's meshes, joined: where they are, which way they face, where their
// pictures lie (a model without pictures given none)
const KEPT = Object.freeze(["position", "normal", "uv"]);

// A model's meshes (those under its `nodes`, or all of them), joined into one for each material
// it's drawn with: its parts ([{ geometry, source }]) and how big it is ({ min, max }, its own
// metres), or null if it has no meshes
function partsOf(scene, nodes) {
    const wanted = nodes && new Set(nodes);
    const byMaterial = new Map();

    scene.updateMatrixWorld(true);
    scene.traverse((node) => {
        let at = node;

        while (wanted && at && !wanted.has(at.name)) {
            at = at.parent;
        }

        if (node.isMesh && at) {
            const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);

            for (const name of Object.keys(geometry.attributes)) {
                if (!KEPT.includes(name)) {
                    geometry.deleteAttribute(name);
                }
            }

            if (!geometry.attributes.uv) {
                geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
            }

            byMaterial.set(node.material, [...(byMaterial.get(node.material) ?? []), geometry.index ? geometry : geometry.setIndex([...Array(geometry.attributes.position.count).keys()])]);
        }
    });

    const box = new THREE.Box3();
    const parts = [...byMaterial].map(([source, geometries]) => {
        const geometry = geometries.length > 1 ? mergeGeometries(geometries) : geometries[0];

        geometry.computeBoundingBox();
        geometry.userData.shared = true;
        box.union(geometry.boundingBox);

        return { geometry, source };
    });

    return parts.length ? { parts, box } : null;
}

/**
 * A model's parts (its meshes joined, one for each material it's drawn with: [{ geometry,
 * source }]) and how big it is (`box`: { min, max }, its own metres), read once (DUNGEON_PROPS'
 * name): null if it's not in the catalog (or there's no page to read it from).
 */
export function loadProp(name) {
    if (!props.has(name)) {
        const entry = DUNGEON_PROPS[name];
        const file = entry && ASSETS.models[entry.asset]?.files[0];
        const page = globalThis.document?.baseURI ?? globalThis.location?.href;

        if (file && page && !files.has(entry.asset)) {
            files.set(
                entry.asset,
                loadGltf(new URL(hashed(file.path, file.hash), page).href).then(({ scene }) => scene),
            );
        }

        props.set(name, file && page ? files.get(entry.asset).then((scene) => partsOf(scene, entry.nodes)) : Promise.resolve(null));
    }

    return props.get(name);
}

// How metal a model's drawn at most: with nothing about it to shine back but the room's flames, a
// wholly metal thing would be all but black
const METAL = 0.3;

// A model's material in a colour (`tint`, times its picture's), lit by the room's flames as the
// rock is, never cut away, drawn many times over at once (instanced); one for each of its parts
// and tints. How rough and how metal it is, and whether it glows or can be seen through (glass, a
// flame), as its own material has it.
const propMaterials = new Map();

function propMaterial(name, part, source, tint) {
    const key = `${name}|${part}|${tint ?? ""}`;

    if (propMaterials.has(key)) {
        return propMaterials.get(key);
    }

    const result = new THREE.MeshStandardMaterial({
        map: source.map ?? null,
        normalMap: source.normalMap ?? null,
        emissiveMap: source.emissiveMap ?? null,
        emissive: source.emissive ?? new THREE.Color(0),
        color: new THREE.Color(tint ?? 0xffffff).multiply(source.color ?? new THREE.Color(0xffffff)),
        roughness: source.roughness ?? 0.85,
        metalness: Math.min(METAL, source.metalness ?? 0),
        transparent: source.transparent ?? false,
        opacity: source.opacity ?? 1,
        depthWrite: !source.transparent,
        alphaTest: source.alphaTest ?? 0,
    });

    result.name = `prop-${name}`;
    result.userData.shared = true;
    result.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vCutWorld;").replace("#include <project_vertex>", "#include <project_vertex>\nvCutWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;");
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vCutWorld;");
        roomLit(shader);
    };
    result.customProgramCacheKey = () => "dungeon-prop";
    propMaterials.set(key, result);

    return result;
}

// How big a thing placed must be to cast a shadow (metres, its longest side): the small things
// strewn about cast none (a light's shadows are drawn six ways round, each thing in reach once
// for each)
const SHADOWS_FROM = 0.45;

const _turn = new THREE.Quaternion();
const _roll = new THREE.Quaternion();
const _pitch = new THREE.Quaternion();
const _corner = new THREE.Vector3();

/**
 * Furnish a level with models (`placements`: [{ model (DUNGEON_PROPS' name), x, z (level metres:
 * where its middle stands), y (how high its foot is: metres, or `on` another placement, on top of
 * it), turn (radians round the upright), roll (radians round its own z: an axe laid down), pitch
 * (radians round its own x, before that: a shield leant back),
 * size (its longest side, metres; or `scale`: times its own size, a number or one for each side;
 * or `fit`: its own length, height and width made these, metres), tint (a colour it's darkened
 * to), shadow (whether it casts one: if it's as big as SHADOWS_FROM, unless it's said) }]), each
 * model's copies in each tile of the level (the rock's, CAVERNS) drawn at once (instanced, one for
 * each of its materials), so what's out of sight or of a light's reach isn't drawn; added to
 * `group` once they're all read (`read`: how, loadProp). What isn't read (not in the catalog, not
 * downloaded) is left out, and what's on it. Resolves once they're in.
 */
export async function furnish(group, placements, { read: reading = loadProp } = {}) {
    const names = [...new Set(placements.map(({ model }) => model))];
    const read = await Promise.all(
        names.map((name) =>
            Promise.resolve(reading(name)).catch((error) => {
                console.warn(`Couldn't load ${name}`, error);

                return null;
            }),
        ),
    );
    const models = new Map(names.map((name, k) => [name, read[k]]));
    const tops = new Map();
    const lots = new Map();

    for (const placement of placements) {
        const prop = models.get(placement.model);
        const below = placement.on;

        if (!prop || (below && !tops.has(below))) {
            continue;
        }

        const { x, z, turn = 0, roll = 0, pitch = 0, size, fit, tint = null } = placement;
        const extent = prop.box.getSize(new THREE.Vector3());
        const each = fit ? [fit[0] / extent.x, fit[1] / extent.y, fit[2] / extent.z] : (placement.scale ?? (size ? size / Math.max(extent.x, extent.y, extent.z) : 1));
        const scale = Array.isArray(each) ? new THREE.Vector3(...each) : new THREE.Vector3(each, each, each);
        const turned = _turn.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, turn).multiply(_pitch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch)).multiply(_roll.setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(), turned, scale);
        const box = new THREE.Box3();

        // (Its box turned and sized, its middle then set over (x, z) and its foot on the floor or
        // on what it's on)
        for (let k = 0; k < 8; k++) {
            box.expandByPoint(_corner.set(k & 1 ? prop.box.max.x : prop.box.min.x, k & 2 ? prop.box.max.y : prop.box.min.y, k & 4 ? prop.box.max.z : prop.box.min.z).applyMatrix4(matrix));
        }

        const y = below ? tops.get(below) : (placement.y ?? 0);

        matrix.premultiply(new THREE.Matrix4().makeTranslation(x - (box.min.x + box.max.x) / 2, y - box.min.y, z - (box.min.z + box.max.z) / 2));
        tops.set(placement, y + box.max.y - box.min.y);

        const key = `${placement.model}|${tint ?? ""}|${Math.floor(x / CAVERNS.tile)},${Math.floor(z / CAVERNS.tile)}`;

        if (!lots.has(key)) {
            lots.set(key, { name: placement.model, prop, tint, matrices: [], shadow: false });
        }

        const lot = lots.get(key);

        lot.matrices.push(matrix);
        lot.shadow ||= placement.shadow ?? Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) >= SHADOWS_FROM;
    }

    for (const { name, prop, tint, matrices, shadow } of lots.values()) {
        prop.parts.forEach(({ geometry, source }, part) => {
            const mesh = new THREE.InstancedMesh(geometry, propMaterial(name, part, source, tint), matrices.length);

            matrices.forEach((matrix, k) => mesh.setMatrixAt(k, matrix));
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
            mesh.castShadow = shadow && !source.transparent;
            mesh.receiveShadow = true;
            mesh.name = `prop-${name}`;
            group.add(mesh);
        });
    }
}
