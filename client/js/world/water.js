// Water out in the world (lakes, rivers and the sea, a chunk at a time: chunks3d.js) and in a
// lizard-folk settlement's lagoon: a sheet over the squares with water, drawn where a field of how
// far each point is from the shore says.
//
// The field is worked out once for a sheet, four bytes a square: how far into the water each is
// from the nearest dry square (and how far out of it, on land), softened, so that sampled between
// squares its shoreline runs in curves rather than stepping square by square; how the water runs
// there (east and south, metres a second: a river's current, still in a lake); and how deep it is.
//
// The surface ripples: a small tiling picture of slopes, read twice, half a cycle apart, each
// carried along the way the water runs from where it last started over and faded out as it starts
// again, so that neither's restart shows (flow maps, after Valve's), the cycles set off from place
// to place so they don't pulse together; on medium quality and up, a finer picture over it, the
// same way. Faster water ripples harder and breaks into foam, as the water does at its shore. Its
// colour is the bed's seen through it, its light taken out the further it has to come through the
// water (Beer and Lambert: red first, so the shallows are green and the deep blue), and the sky
// reflected off it, more the more glancing the look (Fresnel, after Schlick: 0.02 square on).

import * as THREE from "three";
import { TREE_WIND } from "./art/kits/trees.js";
import { distancesFrom } from "./fields.js";

/**
 * The water: how high over the ground it lies (metres), its own colour (what it scatters back of
 * the light it takes out), and its bed's (the packed earth of a river's or a lake's bed: ground.js
 * bedOf), as the bed's colours it lets through are reckoned from.
 */
export const WATER = Object.freeze({ level: 0.03, deep: 0x1f4a4e, bed: 0x8f8470 });

/**
 * The shore field: as far out as it's worked out (squares, either way from the shoreline), and
 * how finely (steps to a square, in each byte: 128 is the shoreline).
 */
export const SHORE = Object.freeze({ reach: 7, steps: 16 });

// The squares round a chunk's own worked out with it, so that its field meets its neighbours'
// (as far as the field reaches, and a square more to soften it and one to sample between)
export const MARGIN = SHORE.reach + 2;

/**
 * Water whose bed is carved into the ground (a surface given) carries on this far (metres) past
 * the wet squares, under the banks: the ground hides it, so its edge is where the bank rises out
 * of it, not where the squares say.
 */
export const UNDER_BANKS = 2;

/**
 * The field's other bytes: how the water runs (metres a second, each way: `flow` steps to a metre a
 * second, 128 still) and how deep it is (`depth` steps to a metre, from 0).
 */
export const FIELD = Object.freeze({ flow: 25, depth: 50 });

/** How much the water draws: 1 for the finer ripples over the rest (medium quality and up), 0 not (game.js sets it). */
export const WATER_DETAIL = { value: 1 };

// The ripples' picture (texels a side, tiling), and how steep they are
const RIPPLE_TEXELS = 128;
const RIPPLE_SLOPE = 0.16;

// How long each read of the ripples is carried along by the water before it starts over (seconds)
const FLOW_CYCLE = 1.6;

// How much of each colour's light the water takes out a metre it comes through (red first)
const ABSORBS = [0.85, 0.4, 0.5];

// Lagoons' depth (metres) for each metre in from their shores, having no surface of their own
const LAGOON_DEEPENS = 0.3;

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
 * The water's material, its field (a texture: waterField) covering the squares from (x0, y0),
 * `width` by `height`, drawn `under` metres out past the shore (under the banks). Owns the field
 * (userData.mask: dispose it with the material).
 */
export function waterMaterial(field, x0, y0, [width, height], under = 0) {
    const water = new THREE.MeshStandardMaterial({ color: WATER.deep, roughness: 0.12, metalness: 0, transparent: true, depthWrite: false, premultipliedAlpha: true });

    water.name = "water";
    water.userData.mask = field;
    water.userData.own = true;
    water.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
            waterField: { value: field },
            waterArea: { value: new THREE.Vector4(x0, y0, width, height) },
            waterRipples: { value: rippleTexture() },
            waterTime: TREE_WIND.time,
            waterDetail: WATER_DETAIL,
            waterBed: { value: new THREE.Color(WATER.bed) },
            waterUnder: { value: under },
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
uniform float waterDetail;
uniform vec3 waterBed;
uniform float waterUnder;
float waterEdge;
float waterFoam;
vec3 waterThrough;
vec2 waterSlope;

// The ripples at a scale, carried along by the water: two reads half a cycle apart, each faded
// out as it starts over
vec4 waterCarried(vec2 at, vec2 drift, vec2 flow, float phase) {
    float first = fract(phase);
    float second = fract(phase + 0.5);
    float weight = 1.0 - abs(1.0 - 2.0 * first);

    return texture2D(waterRipples, at + drift - flow * first) * weight + texture2D(waterRipples, at + drift - flow * second + vec2(0.5, 0.25)) * (1.0 - weight);
}`)
            .replace("#include <map_fragment>", `
// The field here: how far in from the shore (metres), how the water runs (metres a second, east
// and south), and how deep it is (metres)
vec4 waterHere = texture2D(waterField, (vWater - waterArea.xy) / waterArea.zw);
float waterShore = (waterHere.r * 255.0 - 128.0) / ${SHORE.steps.toFixed(1)};
waterEdge = waterShore + waterUnder;

if (waterEdge < 0.0) discard;

vec2 waterFlow = (waterHere.gb * 255.0 - 128.0) / ${FIELD.flow.toFixed(1)};
float waterDepth = waterHere.a * 255.0 / ${FIELD.depth.toFixed(1)};
float waterSpeed = length(waterFlow);

// The ripples, carried along the way the water runs, their cycles set off from place to place
float waterPhase = waterTime / ${FLOW_CYCLE.toFixed(2)} + 0.5 * (sin(vWater.x * 0.071 + vWater.y * 0.033) + sin(vWater.y * 0.057 - vWater.x * 0.029));
vec4 waterRipple = waterCarried(vWater * 0.19, vec2(0.021, 0.013) * waterTime, waterFlow * ${(FLOW_CYCLE * 0.19).toFixed(3)}, waterPhase);
float waterRise = waterRipple.b;

waterSlope = waterRipple.rg * 2.0 - 1.0;

if (waterDetail > 0.5) {
    vec4 finer = waterCarried(vWater * 0.43, vec2(-0.017, 0.024) * waterTime, waterFlow * ${(FLOW_CYCLE * 0.43).toFixed(3)}, waterPhase + 0.25);

    waterSlope += (finer.rg * 2.0 - 1.0) * 0.8;
    waterRise = (waterRise + finer.b * 0.8) / 1.8;
}

// How much of each colour of the bed's light comes up through the water, over the way through it
// (red's taken out first: the shallows green, the deep blue)
vec3 waterLook = normalize(vViewPosition);
float waterUp = dot(waterLook, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));

waterThrough = exp(-(waterDepth / max(waterUp, 0.15)) * vec3(${ABSORBS.map((a) => a.toFixed(3)).join(", ")}));

// Foam: a broken line along the shore, and streaks wherever the water runs fast, more the faster
float waterFast = smoothstep(2.2, 4.2, waterSpeed);
float waterFoaming = max(1.0 - smoothstep(0.0, 0.25, waterEdge), waterFast);

waterFoam = waterFoaming * smoothstep(0.62 - 0.1 * waterFast, 0.8 - 0.08 * waterFast, waterRise);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.88, 0.87), waterFoam);`)
            .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
{
    // (Harder where it runs fast; gentler further off, where many ripples fall in a pixel and
    // would glitter)
    vec2 slope = waterSlope * ${RIPPLE_SLOPE.toFixed(3)} * (1.0 + 0.3 * min(waterSpeed, 4.0)) * (1.0 - 0.7 * smoothstep(15.0, 60.0, length(vViewPosition)));

    normal = normalize(normal + (viewMatrix * vec4(slope.x, 0.0, slope.y, 0.0)).xyz);
}`)
            .replace("#include <opaque_fragment>", `
// What's seen (premultiplied: the bed behind is kept as much as is left):
// - the bed, through what the water lets through of it, less what's reflected, none through foam:
//   as much of it as its red light comes through (the colour taken out first), and the rest of
//   its green and blue added as the bed would look, lit as the water is (one share of the bed
//   behind can't be kept more of one colour than another)
// - the water's own colour: what it takes out of the light
// - foam, and the sky and sun reflected off it, more the more glancing the look (Schlick)
float waterReflects = 0.02 + 0.98 * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
float waterKeeps = (1.0 - waterReflects) * (1.0 - 0.85 * waterFoam);
vec3 waterLit = totalDiffuse / max(diffuseColor.rgb, vec3(0.001));
float waterFade = smoothstep(0.0, 0.15, waterEdge);
float waterAlpha = (1.0 - waterThrough.r * waterKeeps) * waterFade;
vec3 waterLight = (waterLit * waterBed * (waterThrough - waterThrough.r) * waterKeeps + totalDiffuse * ((1.0 - waterThrough) * waterKeeps + 0.85 * waterFoam) + totalSpecular * (1.0 - 0.8 * waterFoam)) * waterFade;

gl_FragColor = vec4(waterLight / max(waterAlpha, 0.001), waterAlpha);`);
    };
    water.customProgramCacheKey = () => "water flowing";

    return water;
}

/**
 * The field's texture over a grid of squares (`across` by `down`): how far each is from the shore
 * (`shore`: shoreDistances'), how the water runs there (`flow`: metres a second, east then south,
 * two a square; none, still) and how deep it is (`depth`: metres a square; none, as deep as a
 * lagoon a way in from its shore).
 */
export function fieldTexture(shore, across, down, { flow = null, depth = null } = {}) {
    const count = across * down;
    const bytes = new Uint8Array(count * 4);
    const shores = shoreBytes(shore);
    const byte = (value) => Math.max(0, Math.min(255, Math.round(value)));

    for (let k = 0; k < count; k++) {
        bytes[k * 4] = shores[k];
        bytes[k * 4 + 1] = flow ? byte(128 + flow[k * 2] * FIELD.flow) : 128;
        bytes[k * 4 + 2] = flow ? byte(128 + flow[k * 2 + 1] * FIELD.flow) : 128;
        bytes[k * 4 + 3] = byte((depth ? depth[k] : Math.max(0, shore[k]) * LAGOON_DEEPENS) * FIELD.depth);
    }

    const texture = new THREE.DataTexture(bytes, across, down, THREE.RGBAFormat);

    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.flipY = false;
    texture.needsUpdate = true;

    return texture;
}

// With the water's surface given, the sheet's corners are this many metres apart
const SURFACE_STEP = 2;

/**
 * A sheet of water over the squares from (x0, y0), `width` by `height`, drawn where `wet` (bytes,
 * one a square, non-zero for water, with `margin` more squares all round, so its shore meets the
 * sheets beside it) says: flat, or at `surfaceAt(x, z)` (metres: a river running down its
 * valley, a lake at its level) at each of its corners. Its field's shore distances worked out
 * already, its flow and depth (fieldTexture's), can be given (`field`).
 */
export function waterSheet(wet, [x0, y0, width, height], margin = 1, surfaceAt = null, { shore = null, flow = null, depth = null } = {}) {
    const [across, down] = [width + 2 * margin, height + 2 * margin];
    const field = fieldTexture(shore ?? shoreDistances(wet, across, down), across, down, { flow, depth });

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

    const mesh = new THREE.Mesh(plane, waterMaterial(field, x0 - margin, y0 - margin, [across, down], surfaceAt ? UNDER_BANKS : 0));

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
    return waterMaterial(fieldTexture(Float32Array.of(SHORE.reach), 1, 1), 0, 0, [1, 1]);
}
