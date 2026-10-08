// How a dungeon's levels look, beyond what's built for them (world/interiors3d.js dungeon): the
// photographs their rock and stone are drawn with (CC0, downloaded only once a dungeon's wanted:
// the catalog, app/assets.js; scripts/build-textures.py makes them), and the material that draws
// a level's rock (caverns.js) with them: the picture laid over it from all three sides at once
// (triplanar, so it's never stretched however the rock turns), its grain and its bumps, under the
// colour each theme gives its rock, lit by the room's flames (roomlight.js) and never cut away.

import * as THREE from "three";
import { ASSETS } from "../app/assets.js";
import { hashed } from "../app/catalog.js";
import { roomLit } from "./roomlight.js";

/**
 * The pictures a dungeon's rock and stone can be drawn with, by name: each a catalog entry
 * (app/assets.js) of a colour picture and a normal map (OpenGL's way up), how many metres one
 * repeat of it covers (`metres`), and its average colour (`mean`, 0 to 1: the picture's grain is
 * taken as how far it is from that, the colour itself being the theme's).
 */
export const ROCK_PICTURES = {
    "rock-cave": { entry: "dungeon-rock-cave", metres: 2.6, mean: [0.0739, 0.0708, 0.0551] },
    "ground-cave": { entry: "dungeon-ground-cave", metres: 2.2, mean: [0.2547, 0.2498, 0.2305] },
    "ground-dug": { entry: "dungeon-ground-dug", metres: 1.8, mean: [0.0681, 0.0372, 0.0253] },
};

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
