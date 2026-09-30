// Water out in the world (lakes and rivers, a chunk at a time: chunks3d.js) and in a lizard-folk
// settlement's lagoon: a sheet over the squares with water, drawn where a field of how far each
// point is from the shore says.
//
// The field is worked out once for a sheet, a byte a square, from which squares are wet: how far
// into the water each is from the nearest dry square (and how far out of it, on land), softened,
// so that sampled between squares its shoreline runs in curves rather than stepping square by
// square. It sets the water's colour too: the bed shows through in the shallows, its light taken
// out with depth (red first, so the shallows are green and the deep blue), and the water's edge
// fades, with a thin broken line of foam along it. The surface ripples: two reads of a small
// tiling picture of slopes, drifting their own ways, reflecting the sky round them.

import * as THREE from "three";
import { TREE_WIND } from "./art/kits/trees.js";
import { distancesFrom } from "./fields.js";

/**
 * The water: how high over the ground it lies (metres), its colour deep and where the bed shows
 * through in the shallows, and how much of it shows where it's deep.
 */
export const WATER = Object.freeze({ level: 0.03, deep: 0x21495c, shallows: 0x52705a, opacity: 0.94 });

/**
 * The shore field: as far out as it's worked out (squares, either way from the shoreline), and
 * how finely (steps to a square, in each byte: 128 is the shoreline).
 */
export const SHORE = Object.freeze({ reach: 7, steps: 16 });

// The squares round a chunk's own worked out with it, so that its field meets its neighbours'
// (as far as the field reaches, and a square more to soften it and one to sample between)
export const MARGIN = SHORE.reach + 2;

// The ripples' picture (texels a side, tiling), and how steep they are
const RIPPLE_TEXELS = 128;
const RIPPLE_SLOPE = 0.16;

/**
 * How far each square of a grid (`wet`: bytes, `width` by `height`, non-zero for water) is from
 * the shore, softened: in water, how far in from the nearest dry square's middle less half a
 * square (so the shoreline lies between them); on land, as far out, below zero. Squares beyond
 * the grid count for nothing (so a grid is worked out with a margin round what's drawn). Clamped
 * to SHORE.reach either way. A Float32Array, a square each.
 */
export function shoreDistances(wet, width, height) {
    const count = width * height;
    const dry = new Uint8Array(count);

    for (let k = 0; k < count; k++) {
        dry[k] = wet[k] ? 0 : 1;
    }

    const inside = distancesFrom(dry, width, height);
    const outside = distancesFrom(wet, width, height);
    const field = new Float32Array(count);

    for (let k = 0; k < count; k++) {
        const signed = wet[k] ? inside[k] - 0.5 : 0.5 - outside[k];

        field[k] = Math.max(-SHORE.reach, Math.min(SHORE.reach, signed));
    }

    return soften(field, width, height);
}

// Each square the average of the nine round it (those in the grid), rounding off the shoreline's
// corners
function soften(field, width, height) {
    const soft = new Float32Array(field.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let [sum, count] = [0, 0];

            for (let j = Math.max(0, y - 1); j <= Math.min(height - 1, y + 1); j++) {
                for (let i = Math.max(0, x - 1); i <= Math.min(width - 1, x + 1); i++) {
                    sum += field[j * width + i];
                    count++;
                }
            }

            soft[y * width + x] = sum / count;
        }
    }

    return soft;
}

/** A shore field (shoreDistances) as bytes, SHORE.steps to a square, the shoreline at 128. */
export function shoreBytes(field) {
    const bytes = new Uint8Array(field.length);

    for (let k = 0; k < field.length; k++) {
        bytes[k] = Math.max(0, Math.min(255, Math.round(128 + field[k] * SHORE.steps)));
    }

    return bytes;
}

let ripples = null;

// The ripples' waves: [across, along] (whole waves to the picture, so it tiles), how high (to the
// first's), and where each starts (radians)
const WAVES = [[3, 1, 1, 0.3], [-2, 3, 0.85, 2.1], [4, -3, 0.6, 4.4], [1, 5, 0.55, 1.2], [-5, -2, 0.45, 5.5], [6, 4, 0.3, 3.3], [-3, 7, 0.28, 0.8], [8, -1, 0.22, 2.6], [-7, -6, 0.18, 4.9], [2, -9, 0.15, 1.7]];

// The ripples' picture: the slopes (across and along, 128 flat) of a few waves running different
// ways, whole waves to the picture so it tiles, and how high they stand (for the foam), made the
// first time water is drawn. (Waves rather than noise: noise's lattice would show as lines.)
function rippleTexture() {
    if (!ripples) {
        const n = RIPPLE_TEXELS;
        const data = new Uint8Array(n * n * 4);
        const total = WAVES.reduce((sum, [kx, ky, a]) => sum + a * Math.hypot(kx, ky), 0);
        const rise = WAVES.reduce((sum, [, , a]) => sum + a, 0);

        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                let [h, dx, dy] = [0, 0, 0];

                for (const [kx, ky, a, phase] of WAVES) {
                    const angle = (2 * Math.PI * (kx * x + ky * y)) / n + phase;

                    h += a * Math.sin(angle);
                    dx += a * kx * Math.cos(angle);
                    dy += a * ky * Math.cos(angle);
                }

                const k = (y * n + x) * 4;

                data[k] = Math.round(127.5 - (dx / total) * 127);
                data[k + 1] = Math.round(127.5 - (dy / total) * 127);
                data[k + 2] = Math.round(127.5 + (h / rise) * 127);
                data[k + 3] = 255;
            }
        }

        ripples = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
        ripples.wrapS = THREE.RepeatWrapping;
        ripples.wrapT = THREE.RepeatWrapping;
        ripples.magFilter = THREE.LinearFilter;
        ripples.minFilter = THREE.LinearMipmapLinearFilter;
        ripples.generateMipmaps = true;
        ripples.needsUpdate = true;
    }

    return ripples;
}

/**
 * The water's material, its shore field (a texture: shoreBytes) covering the squares from (x0,
 * y0), `width` by `height`. Owns the field (userData.mask: dispose it with the material).
 */
export function waterMaterial(field, x0, y0, [width, height]) {
    const water = new THREE.MeshStandardMaterial({ color: WATER.deep, roughness: 0.12, metalness: 0, transparent: true, depthWrite: false });

    water.name = "water";
    water.userData.mask = field;
    water.userData.own = true;
    water.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
            waterField: { value: field },
            waterArea: { value: new THREE.Vector4(x0, y0, width, height) },
            waterRipples: { value: rippleTexture() },
            waterTime: TREE_WIND.time,
            shallows: { value: new THREE.Color(WATER.shallows) },
        });
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec2 vWater;")
            .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWater = (modelMatrix * vec4(transformed, 1.0)).xz;");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>
varying vec2 vWater;
uniform sampler2D waterField;
uniform sampler2D waterRipples;
uniform vec4 waterArea;
uniform float waterTime;
uniform vec3 shallows;
float waterShore;
vec4 waterRipple;`)
            .replace("#include <map_fragment>", `
// How far in from the shore (metres), and the ripples here: two reads drifting their own ways
waterShore = (texture2D(waterField, (vWater - waterArea.xy) / waterArea.zw).r * 255.0 - 128.0) / ${SHORE.steps.toFixed(1)};

if (waterShore < 0.0) discard;

waterRipple = texture2D(waterRipples, vWater * 0.19 + vec2(0.021, 0.013) * waterTime) + texture2D(waterRipples, vWater * 0.43 + vec2(-0.017, 0.024) * waterTime);

// The bed seen through the shallows, its light taken out with depth, red first
vec3 through = exp(-waterShore * vec3(0.8, 0.36, 0.26));

diffuseColor.rgb = mix(diffuseColor.rgb, shallows, through);

// A thin line of foam along the shore, broken up by the ripples
float foam = (1.0 - smoothstep(0.0, 0.22, waterShore)) * smoothstep(0.95, 1.2, waterRipple.b);

diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.88, 0.86), foam * 0.55);
diffuseColor.a = ${WATER.opacity.toFixed(2)} * mix(0.4, 1.0, 1.0 - exp(-waterShore * 1.1)) * smoothstep(0.0, 0.15, waterShore);
diffuseColor.a = max(diffuseColor.a, foam * 0.6 * smoothstep(0.0, 0.08, waterShore));`)
            .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
{
    // (Gentler further off, where many ripples fall in a pixel and would glitter)
    vec2 slope = (waterRipple.rg - 1.0) * ${RIPPLE_SLOPE.toFixed(3)} * (1.0 - 0.7 * smoothstep(15.0, 60.0, length(vViewPosition)));

    normal = normalize(normal + (viewMatrix * vec4(slope.x, 0.0, slope.y, 0.0)).xyz);
}`);
    };
    water.customProgramCacheKey = () => "water";

    return water;
}

// With the water's surface given, the sheet's corners are this many metres apart
const SURFACE_STEP = 2;

/**
 * A sheet of water over the squares from (x0, y0), `width` by `height`, drawn where `wet` (bytes,
 * one a square, non-zero for water, with `margin` more squares all round, so its shore meets the
 * sheets beside it) says: flat, or at `surfaceAt(x, z)` (metres: a river running down its
 * valley, a lake at its level) at each of its corners.
 */
export function waterSheet(wet, [x0, y0, width, height], margin = 1, surfaceAt = null) {
    const [across, down] = [width + 2 * margin, height + 2 * margin];
    const field = new THREE.DataTexture(shoreBytes(shoreDistances(wet, across, down)), across, down, THREE.RedFormat);

    field.magFilter = THREE.LinearFilter;
    field.minFilter = THREE.LinearFilter;
    field.flipY = false;
    field.unpackAlignment = 1;
    field.needsUpdate = true;

    const plane = surfaceAt ? new THREE.PlaneGeometry(width, height, width / SURFACE_STEP, height / SURFACE_STEP) : new THREE.PlaneGeometry(width, height);

    plane.rotateX(-Math.PI / 2).translate(width / 2, WATER.level, height / 2);

    if (surfaceAt) {
        const { position } = plane.attributes;

        for (let k = 0; k < position.count; k++) {
            position.setY(k, WATER.level + surfaceAt(x0 + position.getX(k), y0 + position.getZ(k)));
        }

        plane.computeVertexNormals();
        plane.computeBoundingSphere();
        plane.computeBoundingBox();
    }

    const mesh = new THREE.Mesh(plane, waterMaterial(field, x0 - margin, y0 - margin, [across, down]));

    mesh.name = "water";
    mesh.position.set(x0, 0, y0);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
}

/** A water material to compile its shader with while the game loads (chunks3d.js primer). */
export function primingWater() {
    const field = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat);

    field.needsUpdate = true;

    return waterMaterial(field, 0, 0, [1, 1]);
}
