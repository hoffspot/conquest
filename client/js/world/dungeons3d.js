// How a dungeon's levels look, beyond what's built for them (world/interiors3d.js dungeon): the
// photographs their rock and stone are drawn with (CC0, downloaded only once a dungeon's wanted:
// the catalog, app/assets.js; scripts/build-textures.py makes them), and the material that draws
// a level's rock (caverns.js) with them: the picture laid over it from all three sides at once
// (triplanar, so it's never stretched however the rock turns), its grain and its bumps, under the
// colour each theme gives its rock, lit by the room's flames (roomlight.js) and never cut away.

import * as THREE from "three";
import { ASSETS } from "../app/assets.js";
import { hashed } from "../app/catalog.js";
import { DUNGEON_PICTURES } from "./dungeonpictures.js";
import { roomLit } from "./roomlight.js";

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

    /** A box from (x0, y0, z0) to (x1, y1, z1), `shade` times as dark as the colour (0 to 1). */
    box(x0, y0, z0, x1, y1, z1, shade = 1) {
        const at = [
            [x0, x1],
            [y0, y1],
            [z0, z1],
        ];

        for (const { corners, normal } of FACES) {
            const first = this.positions.length / 3;

            for (const corner of corners) {
                this.positions.push(at[0][corner[0]], at[1][corner[1]], at[2][corner[2]]);
                this.normals.push(...normal);
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
