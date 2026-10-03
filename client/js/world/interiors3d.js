// The insides of buildings in 3D (core/interiors.js has their plans, core/insides.js which a
// building has), built by each floor's style: for now a tavern's taproom, with its flagstones,
// tables and benches however they're set out, the bar and the tapped barrels behind it, the great
// hearth with a boar turning on a spit over an animated fire, and the stairs up if there's a floor
// above; and that floor, with its rugs, the counter, a chaise longue, and the hallway to four
// bedrooms behind curtained doorways, each with a canopied bed, a washstand and a chest (a madam's
// house in rose and red velvet, an inn in whitewash and wool). Each taproom has its own walls (the
// map's `finish`). A smithy: bare stone walls and beaten earth, the forge under its hood with its
// coals glowing and a fire, the bellows, the anvil on its stump, the quenching trough, a
// grindstone that turns while it's cranked, racks of tools and of finished work, a workbench with
// its vice, and a heap of charcoal.
//
// Built with the art kits' Solid (five art pixels to a metre) and their materials, and drawn as
// the buildings outside are, from the atlas (atlas.js: its textures, lit as relief, what shines
// shining), each map in its own group at its place in the world (its `origin`). Every floor has
// its ceiling, of beams and boards (each people's own way: ceiling()), with wheels of candles
// hanging from it on chains; looking down from above it, the camera sees through it (what of it
// is lower than the camera isn't drawn: so from under it, all of it, and from over it, none).
// What stands in front of the player (INTERIOR_CUT, set each frame by the game: a strip from them
// towards the camera) is cut away: walls down to their stone footing, a whole square's length at a
// time, and anything else above head height that's in the way of seeing them, so the player is
// always in view whichever way the camera looks, and every other wall stands full height; where a
// cut shows the inside of something, it's dark wood, as if solid.
//
// The rooms are lit by what would light them: the daylight through their windows (open to it,
// leaded panes in them, the view's sun shining in through the windows on the sunny side, beams
// of it in the dusty air), and their flames (every hearth's fire, wheel of candles, candle and
// sconce a light of its own: roomlight.js), each flame with a soft glow round it.

import * as THREE from "three";
import { shrinesOf } from "../core/insides.js";
import { GOD_IDS, GODS } from "../core/lore/gods.js";
import { atlasVariant, layerOf } from "./art/engine/atlas.js";
import { material as artMaterial } from "./art/engine/materials.js";
import { Solid } from "./art/engine/solid.js";
import { joined, partsOf } from "./town3d.js";
import { gather, roomLit } from "./roomlight.js";
import { fireMaterials, FIRES, firesMesh } from "./fire.js";
import { allAtOnce } from "../core/steps.js";

/** How high a floor's walls are, and how far above it the next floor is (metres). */
export const STOREY = 3;

/**
 * Where the player is and where the camera is, shared by every interior material: what's in front
 * of them (more than `margin` metres nearer the camera than they are, and less than `width` metres
 * to either side of the line from them to it) is cut away: walls (above their footing, which is
 * built apart and never cut) altogether, a square at a time (whether each square's middle is in
 * front of them: the walls round the edge, the square inside them, within `bounds`, the floor
 * shown: x0, z0, x1, z1 in world metres), and everything else above `height` metres that's no
 * higher than `over` metres above the line from the camera to the player's head (`head` metres
 * up: what's higher than that is above the player as seen, and hides nothing of them); where the
 * inside of something cut shows, it's `cap`. The ceilings aren't cut so, but where they're lower
 * than the camera (seen from above) aren't drawn at all.
 */
export const INTERIOR_CUT = Object.freeze({
    player: { value: new THREE.Vector3() },
    camera: { value: new THREE.Vector3(0, 100, 0) },
    toCamera: { value: new THREE.Vector2(0, 1) },
    height: { value: 1.7 },
    head: { value: 1.6 },
    over: { value: 0.5 },
    margin: { value: 0.1 },
    width: { value: 2.5 },
    bounds: { value: new THREE.Vector4(0, 0, 1, 1) },
    cap: { value: new THREE.Color(0x2b1d13) },
});

/** Cut away what's in front of the player on a map (interiors.js's): where they are, and where the camera is (world metres). */
export function cutFor(map, player, camera) {
    const [ox, oz] = map.origin;

    INTERIOR_CUT.player.value.copy(player);
    INTERIOR_CUT.camera.value.copy(camera);
    INTERIOR_CUT.toCamera.value.set(camera.x - player.x, camera.z - player.z).normalize();
    INTERIOR_CUT.bounds.value.set(ox, oz, ox + map.width, oz + map.height);
}

/**
 * Whether a point (world metres) is cut away, as the interior materials' shaders decide it:
 * `wall` for a wall's (a square at a time, from the floor up), `ceiling` for a ceiling's (lower
 * than the camera), else anything else's (above head height, in the way of seeing the player).
 * Pure maths on INTERIOR_CUT, for tests.
 */
export function cutsAway([x, y, z], { wall = false, ceiling = false } = {}) {
    const { player, camera, toCamera, height, head, over, margin, width, bounds } = INTERIOR_CUT;

    if (ceiling) {
        return y < camera.value.y;
    }

    const inside = (value, least, most) => Math.min(most - 0.001, Math.max(least + 0.001, value));
    const [px, pz] = wall ? [Math.floor(inside(x, bounds.value.x, bounds.value.z)) + 0.5, Math.floor(inside(z, bounds.value.y, bounds.value.w)) + 0.5] : [x, z];
    const [dx, dz] = [px - player.value.x, pz - player.value.z];
    const [tx, tz] = [toCamera.value.x, toCamera.value.y];
    const along = dx * tx + dz * tz;
    const across = Math.abs(-dx * tz + dz * tx);
    const [eye, top] = [player.value.y + head.value, camera.value.y];
    const sight = eye + (top - eye) * Math.min(1, along / Math.max(0.01, Math.hypot(camera.value.x - player.value.x, camera.value.z - player.value.z)));
    const low = wall || y < sight + over.value;

    return y - player.value.y > (wall ? 0 : height.value) && along > margin.value && across < width.value && low;
}

const M = 5;
const m = (metres) => metres * M;

// What's part of a wall (cut away from the floor up, a square at a time: INTERIOR_CUT), or of a
// ceiling (never cut, but not drawn lower than the camera)
const WALL = Object.freeze({ wall: true });
const CEILING = Object.freeze({ ceiling: true });

// What each thing inside is drawn as (by name, the art's: engine/materials.js), and the same
// again for walls (`wall`: cut lower) and ceilings (`ceiling`: drawn only over the camera). What
// the atlas can draw only says what it's drawn from (atlasInside draws it); the rest (daylight in
// the windows, candle flames, the roast, lights and embers) are each their own copy, cut away as
// the atlas is
const materials = new Map();

// The people whose inside is being built: its materials (PALETTES) in place of the humans', and
// whether its walls are framed with posts and a beam (FRAMED) as the humans' are; and what lights
// it, as it's built: its flames (each a light, and a glow round it: lit()), its windows and the
// daylight through them (walledIn)
let palette = null;
let framed = true;
let lighting = { flames: [], glows: [], panes: [], daylight: null, candles: [] };

// How each of a thing's cuts is known (its material's and its mesh's): a wall's, a ceiling's, or
// anything else's
const cutOf = ({ wall = false, ceiling = false } = {}) => (wall ? "wall" : ceiling ? "ceiling" : "");

function material(asked, how = {}) {
    const name = palette?.[asked] ?? asked;
    const cut = cutOf(how);
    const key = cut ? `${name}|${cut}` : name;

    if (!materials.has(key)) {
        let result;

        if (name.startsWith("god-")) {
            // (A god's own colour: "god-aurelia"...)
            result = new THREE.MeshLambertMaterial({ color: GODS[name.slice(4)]?.colours[0] ?? 0xffffff });
            result.name = name;
            result.userData.plain = true;
        } else if (name === "window" || name === "window-sun") {
            // Daylight in the leaded panes: the sky's, or the sun's on the sunny side
            result = new THREE.MeshBasicMaterial({ color: name === "window" ? 0xc9dcef : 0xfff0d2, toneMapped: name === "window" });
            result.name = name;
            result.userData.leaded = true;
        } else if (name === "candle-flame" || name.startsWith("sconce")) {
            result = new THREE.MeshBasicMaterial({ color: { sconce: 0xff5a4a, "sconce-warm": 0xffb45a }[name] ?? 0xffd27a, toneMapped: false });
            result.name = name;
        } else if (name === "roast") {
            result = new THREE.MeshStandardMaterial({ color: 0x9c5424, roughness: 0.45, metalness: 0 });
            result.name = name;
        } else {
            result = artMaterial(name).clone();
        }

        if (layerOf(result) >= 0) {
            result.userData.cut = cut;
        } else {
            result.name = `${name}-inside${cut ? `-${cut}` : ""}`;
            result.shadowSide = THREE.DoubleSide;
            cutAway(result, cut);
        }

        materials.set(key, result);
    }

    return materials.get(key);
}

// The atlas as the insides draw it: cut away in front of the player, walls', ceilings' and
// everything else's (a copy each: their cuts differ)
const insides = new Map();

function atlasInside(cut = "") {
    if (!insides.has(cut)) {
        const result = atlasVariant(`atlas-inside${cut ? `-${cut}` : ""}`, (shader) => cutShader(shader, cut));

        result.side = THREE.DoubleSide;
        result.customProgramCacheKey = () => "atlas-inside";
        insides.set(cut, result);
    }

    return insides.get(cut);
}

// Cut away what stands in front of the player (INTERIOR_CUT, as cutsAway): a wall's squares whole
// (`cut` "wall"), a ceiling under the camera ("ceiling"), anything else above head height; drawn
// both sides, the inside of whatever's cut showing as solid (the cap colour)
function cutAway(target, cut) {
    target.side = THREE.DoubleSide;
    target.onBeforeCompile = (shader) => {
        cutShader(shader, cut);

        if (target.userData.leaded) {
            leadedShader(shader);
        }
    };
    target.customProgramCacheKey = () => `interior-cut-${target.type}${target.userData.leaded ? "-leaded" : ""}`;
    target.needsUpdate = true;
}

// (The cut, in three.js's own shader for a material, as onBeforeCompile is given it; and the
// room's flames lighting it, if it's lit: roomlight.js)
function cutShader(shader, cut) {
    Object.assign(shader.uniforms, {
        cutPlayer: INTERIOR_CUT.player,
        cutCamera: INTERIOR_CUT.camera,
        cutToCamera: INTERIOR_CUT.toCamera,
        cutHeight: cut === "wall" ? { value: 0 } : INTERIOR_CUT.height,
        cutHead: INTERIOR_CUT.head,
        cutOver: cut === "wall" ? { value: 1000 } : INTERIOR_CUT.over,
        cutSquares: { value: cut === "wall" ? 1 : 0 },
        cutCeiling: { value: cut === "ceiling" ? 1 : 0 },
        cutMargin: INTERIOR_CUT.margin,
        cutWidth: INTERIOR_CUT.width,
        cutBounds: INTERIOR_CUT.bounds,
        cutCap: INTERIOR_CUT.cap,
    });
    shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCutWorld;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCutWorld;\nuniform vec3 cutPlayer;\nuniform vec3 cutCamera;\nuniform vec2 cutToCamera;\nuniform float cutHeight;\nuniform float cutHead;\nuniform float cutOver;\nuniform float cutSquares;\nuniform float cutCeiling;\nuniform float cutMargin;\nuniform float cutWidth;\nuniform vec4 cutBounds;\nuniform vec3 cutCap;")
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
if (cutCeiling > 0.5) {
    if (vCutWorld.y < cutCamera.y) discard;
} else {
    vec2 cutAt = (cutSquares > 0.5 ? floor(clamp(vCutWorld.xz, cutBounds.xy + 0.001, cutBounds.zw - 0.001)) + 0.5 : vCutWorld.xz) - cutPlayer.xz;
    float cutAlong = dot(cutAt, cutToCamera);
    float cutAcross = abs(dot(cutAt, vec2(-cutToCamera.y, cutToCamera.x)));
    float cutEye = cutPlayer.y + cutHead;
    float cutSight = cutEye + (cutCamera.y - cutEye) * min(1.0, cutAlong / max(0.01, distance(cutCamera.xz, cutPlayer.xz)));

    if (vCutWorld.y - cutPlayer.y > cutHeight && cutAlong > cutMargin && cutAcross < cutWidth && vCutWorld.y < cutSight + cutOver) discard;
}`)
        .replace("#include <dithering_fragment>", "#include <dithering_fragment>\nif (!gl_FrontFacing) gl_FragColor = vec4(cutCap, 1.0);");
    roomLit(shader);
}

// A window's leaded panes: small diamonds of glass (each a little different, as old glass is),
// in lead (texture coordinates are art pixels: five to a metre)
function leadedShader(shader) {
    shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vLeaded;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvLeaded = uv;");
    shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vLeaded;")
        .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
{
    vec2 diamond = vec2(vLeaded.x + vLeaded.y, vLeaded.x - vLeaded.y) * 1.6;
    vec2 cell = floor(diamond);
    vec2 within = abs(fract(diamond) - 0.5);
    float lead = smoothstep(0.42, 0.47, max(within.x, within.y));
    float tint = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);

    diffuseColor.rgb = mix(diffuseColor.rgb * (0.86 + 0.2 * tint), vec3(0.09, 0.08, 0.07), lead);
}`,
        );
}

// --- Flames ---

// The fires indoors are fire.js's (their tongues licking and twisting up, hottest low in their
// middles, each its own and puffing as fires do), but none where it's cut away in front of the
// player (INTERIOR_CUT, as cutsAway: anything but a wall), as the glows round them aren't
const CUT_GLSL = /* glsl */ `
uniform vec3 cutPlayer;
uniform vec3 cutCamera;
uniform vec2 cutToCamera;
uniform float cutHeight;
uniform float cutHead;
uniform float cutOver;
uniform float cutMargin;
uniform float cutWidth;

bool cutAt(vec3 world) {
    vec2 at = world.xz - cutPlayer.xz;
    float along = dot(at, cutToCamera);
    float across = abs(dot(at, vec2(-cutToCamera.y, cutToCamera.x)));
    float eye = cutPlayer.y + cutHead;
    float sight = eye + (cutCamera.y - eye) * min(1.0, along / max(0.01, distance(cutCamera.xz, cutPlayer.xz)));

    return world.y - cutPlayer.y > cutHeight && along > cutMargin && across < cutWidth && world.y < sight + cutOver;
}
`;

// The cut's uniforms, each the shared one (INTERIOR_CUT), as the shaders name them
function cutUniforms() {
    const { player, camera, toCamera, height, head, over, margin, width } = INTERIOR_CUT;

    return { cutPlayer: player, cutCamera: camera, cutToCamera: toCamera, cutHeight: height, cutHead: head, cutOver: over, cutMargin: margin, cutWidth: width };
}

let insideFlames = null;

// The fires' flames as the insides draw them: fire.js's, cut away as the rest is (its uniforms
// the same shared ones)
function insideFlamesMaterial() {
    if (!insideFlames) {
        const { flames } = fireMaterials();

        insideFlames = flames.clone();
        insideFlames.name = "flames-inside";
        insideFlames.uniforms = { ...flames.uniforms, ...cutUniforms() };
        insideFlames.vertexShader = flames.vertexShader.replace("void main() {", `${CUT_GLSL}\nvoid main() {`).replace(/\}\s*$/, "    if (cutAt(foot)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);\n}");
        insideFlames.userData.shared = true;
    }

    return insideFlames;
}

/**
 * A fire (fire.js FIRES `kind`: a hearth's, a forge's), `width` and `height` (art pixels) across
 * and high at its tallest, its own way (`seed`: any number), in a group to stand where it burns
 * (art pixels): its flames, cut away as the insides are; and how it burns (`userData.fire`: its
 * seed, rate and steadiness), for the light it gives the room to rise and fall with it
 * (roomlight.js strengthOf).
 */
export function flame(width, height, seed, kind = "hearth") {
    const own = FIRES[kind];
    const fire = { x: 0, y: 0, z: 0, kind, width: width / M, height: height / M, spread: (own.spread * width) / M / own.width, seed: seed * 0.618034 - Math.floor(seed * 0.618034) };
    const group = firesMesh([fire]);

    group.traverse((node) => {
        // (Its size is in metres, so its bounds in the room's pixels are no use)
        node.frustumCulled = false;

        if (node.isMesh) {
            node.material = insideFlamesMaterial();
        }
    });
    group.userData.fire = { seed: fire.seed, rate: own.rate, steady: own.steady };

    return group;
}

/**
 * The flames of a room's candles (`candles`: [x, y, z, seed] art pixels), fire.js's, one mesh of
 * them all, cut away as the insides are; or null if there are none.
 */
function candleFlames(candles) {
    const group = firesMesh(candles.map(([x, y, z, seed]) => ({ x, y, z, kind: "candle", seed })));

    group?.traverse((node) => {
        node.frustumCulled = false;

        if (node.isMesh) {
            node.material = insideFlamesMaterial();
        }
    });

    return group;
}

// --- Glows and beams of daylight ---

/**
 * What the glows round the flames and the beams of daylight are drawn by, shared by every
 * inside: the time (seconds: the game's, for their flicker and the dust drifting in the beams),
 * how many pixels a metre is a metre from the camera (view.js pixelsPerMetre, for the glows'
 * size), and how strong the daylight is (0 to 1).
 */
export const INTERIOR_GLOW = Object.freeze({ time: { value: 0 }, scale: { value: 800 }, daylight: { value: 1 } });

// Each flame's glow: a soft round of its colour, as wide as it says, a little unsteady,
// brightening what's behind it; never bigger on the screen than a phone's GPU draws a point;
// none where its flame's cut away in front of the player (INTERIOR_CUT, as cutsAway: anything
// but a wall)
const GLOW_VERTEX = /* glsl */ `
attribute float size;
attribute vec3 tint;
uniform float time;
uniform float scale;
uniform vec3 cutPlayer;
uniform vec3 cutCamera;
uniform vec2 cutToCamera;
uniform float cutHeight;
uniform float cutHead;
uniform float cutOver;
uniform float cutMargin;
uniform float cutWidth;
varying vec3 vTint;

void main() {
    vec4 seen = modelViewMatrix * vec4(position, 1.0);
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 cutAt = world.xz - cutPlayer.xz;
    float cutAlong = dot(cutAt, cutToCamera);
    float cutAcross = abs(dot(cutAt, vec2(-cutToCamera.y, cutToCamera.x)));
    float cutEye = cutPlayer.y + cutHead;
    float cutSight = cutEye + (cutCamera.y - cutEye) * min(1.0, cutAlong / max(0.01, distance(cutCamera.xz, cutPlayer.xz)));
    bool cut = world.y - cutPlayer.y > cutHeight && cutAlong > cutMargin && cutAcross < cutWidth && world.y < cutSight + cutOver;
    float flicker = 0.88 + 0.12 * sin(time * 11.0 + position.x * 7.1 + position.z * 3.3);

    gl_Position = cut ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * seen;
    gl_PointSize = cut ? 0.0 : min(480.0, size * flicker * scale / max(0.3, -seen.z));
    vTint = tint;
}`;

const GLOW_FRAGMENT = /* glsl */ `
varying vec3 vTint;

void main() {
    vec2 at = gl_PointCoord * 2.0 - 1.0;
    float away = dot(at, at);

    if (away > 1.0) discard;

    gl_FragColor = vec4(vTint * pow(1.0 - away, 3.2) * 0.4, 1.0);
}`;

// A beam of daylight: brightest at the window, fading out towards the floor and at its edges,
// motes of dust drifting through it
const SHAFT_VERTEX = /* glsl */ `
attribute float along;
attribute float across;
varying float vAlong;
varying float vAcross;
varying vec3 vWorld;

void main() {
    vAlong = along;
    vAcross = across;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SHAFT_FRAGMENT = /* glsl */ `
uniform float time;
uniform float daylight;
varying float vAlong;
varying float vAcross;
varying vec3 vWorld;

void main() {
    float edge = smoothstep(0.0, 0.3, vAcross) * smoothstep(1.0, 0.7, vAcross);
    float fade = pow(1.0 - vAlong, 1.4);
    float dust = 0.8 + 0.2 * sin(vWorld.x * 3.1 + vWorld.y * 4.7 + time * 0.6) * sin(vWorld.z * 2.3 - vWorld.y * 3.9 + time * 0.4);

    gl_FragColor = vec4(vec3(1.0, 0.88, 0.66) * 0.07 * edge * fade * dust * daylight, 1.0);
}`;

// The glows of a room's flames (world metres about the map's corner) in one drawing
function glowsOf(glows) {
    const geometry = new THREE.BufferGeometry();
    const colour = new THREE.Color();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(glows.flatMap(({ x, y, z }) => [x, y, z]), 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(glows.map(({ size }) => size), 1));
    geometry.setAttribute("tint", new THREE.Float32BufferAttribute(glows.flatMap(({ colour: hex }) => colour.set(hex).toArray()), 3));

    const uniforms = { time: INTERIOR_GLOW.time, scale: INTERIOR_GLOW.scale, ...cutUniforms() };
    const points = new THREE.Points(geometry, new THREE.ShaderMaterial({ uniforms, vertexShader: GLOW_VERTEX, fragmentShader: GLOW_FRAGMENT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));

    points.name = "glows";
    points.frustumCulled = false;

    return points;
}

// The beams of daylight through a room's sunny windows (shaftsOf), or null if none
function beamsOf(map, panes, daylight) {
    const { positions, along, across } = shaftsOf(map, panes, daylight);

    if (!positions.length) {
        return null;
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
    geometry.setAttribute("across", new THREE.Float32BufferAttribute(across, 1));

    const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ uniforms: { time: INTERIOR_GLOW.time, daylight: INTERIOR_GLOW.daylight }, vertexShader: SHAFT_VERTEX, fragmentShader: SHAFT_FRAGMENT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide }));

    mesh.name = "daylight";

    return mesh;
}

// --- Furniture (in art pixels, x east, y up, z south, from the map's north-west corner) ---

function table(solid, x0, z0, x1, z1) {
    const top = m(0.78);

    solid.box(x0 + 0.5, top - 0.6, z0 + 0.5, x1 - 0.5, top, z1 - 0.5, material("planks"));

    // Trestles at each end, and a stretcher between them
    for (const x of [x0 + m(0.25), x1 - m(0.25)]) {
        solid.box(x - 0.4, 0, z0 + m(0.15), x + 0.4, top - 0.6, z1 - m(0.15), material("timber"));
    }

    solid.box(x0 + m(0.25), m(0.25), (z0 + z1) / 2 - 0.3, x1 - m(0.25), m(0.35), (z0 + z1) / 2 + 0.3, material("timber"));
}

function bench(solid, x0, z0, x1, z1) {
    const seat = m(0.45);
    const inset = (z1 - z0) * 0.22;

    solid.box(x0 + 0.4, seat - 0.45, z0 + inset, x1 - 0.4, seat, z1 - inset, material("planks-dark"));

    for (const x of [x0 + m(0.2), x1 - m(0.2)]) {
        solid.box(x - 0.35, 0, z0 + inset + 0.3, x + 0.35, seat - 0.45, z1 - inset - 0.3, material("timber"));
    }
}

// A pewter tankard, or a wooden one, standing at (x, z) on a surface at `y`
function tankard(solid, x, z, y, wooden = false) {
    solid.cylinder(x, z, y, y + m(0.16), m(0.05), m(0.05), material(wooden ? "planks" : "pewter"), { segments: 8 });
    solid.box(x + m(0.05), y + m(0.04), z - 0.12, x + m(0.09), y + m(0.12), z + 0.12, material(wooden ? "timber" : "pewter"));
}

// How each kind of flame lights a room (roomlight.js): how bright (as a point light), how far
// it reaches (metres), how much it flickers, its colour; and how wide the glow round it is
// (metres). A wheel of candles is as bright as its candles (`each`, times how many)
const FLAMES = Object.freeze({
    candle: { intensity: 1.5, distance: 5, flicker: 0.12, colour: 0xffb260, glow: 0.32 },
    lamp: { each: 1.3, distance: 15, flicker: 0.06, colour: 0xffc27a, glow: 0.24 },
    sconce: { intensity: 1.8, distance: 6, flicker: 0.1, colour: 0xffa860, glow: 0.45 },
    lantern: { intensity: 4, distance: 11, flicker: 0.08, colour: 0xffbb70, glow: 0.6 },
});

/**
 * A flame lighting the room (art pixels): a light of its `kind` (FLAMES), and its glow (for each
 * of `glows`, or where it is: [x, y, z] art pixels, each as wide as its kind's); `colour` its
 * own, if not its kind's; and the flame drawn that it rises and falls with (`fire`: its seed,
 * rate and steadiness, fire.js), if there is one.
 */
function lit(kind, x, y, z, { count = 1, colour = FLAMES[kind].colour, glows = [[x, y, z]], fire = null } = {}) {
    const flame = FLAMES[kind];

    lighting.flames.push({ kind, x: x / M, y: y / M, z: z / M, colour, intensity: flame.intensity ?? flame.each * count, distance: flame.distance, flicker: flame.flicker, ...fire });

    for (const [gx, gy, gz] of glows) {
        lighting.glows.push({ x: gx / M, y: gy / M, z: gz / M, size: flame.glow, colour });
    }
}

// A candle in a holder, its flame lit (fire.js's, drawn with the room's others: candleFlames),
// its light rising and falling with it
function candle(solid, x, z, y) {
    solid.cylinder(x, z, y, y + 0.25, m(0.06), m(0.06), material("brass"), { segments: 8 });
    solid.cylinder(x, z, y + 0.25, y + m(0.2), m(0.022), m(0.022), material("candle"), { segments: 6 });

    const seed = candleSeed(x, y, z);

    lighting.candles.push([x, y + m(0.2), z, seed]);
    lit("candle", x, y + m(0.22), z, { fire: { seed, rate: FIRES.candle.rate, steady: FIRES.candle.steady } });
}

// A candle's own seed (0 to 1: from where it is)
function candleSeed(x, y, z) {
    const s = Math.sin(x * 1.9898 + y * 7.233 + z * 3.719) * 43758.5453;

    return s - Math.floor(s);
}

// A sconce on a wall: a glass of its colour round a candle (`warm`: clear, at an inn; else red)
function sconce(solid, x, z, warm) {
    solid.box(x - 0.5, m(1.8), z - 0.5, x + 0.5, m(2.1), z + 0.5, material(warm ? "sconce-warm" : "sconce", WALL));
    lit("sconce", x, m(1.95), z, { colour: warm ? 0xffa860 : 0xff6a5a });
}

// An iron lantern hanging on a chain from the ceiling over (x, z), `y` high (art pixels)
function lantern(x, z, y) {
    const group = new THREE.Group();

    group.add(new THREE.Mesh(new THREE.BoxGeometry(m(0.22), m(0.03), m(0.22)).translate(x, y, z), material("iron")));
    group.add(new THREE.Mesh(new THREE.ConeGeometry(m(0.17), m(0.14), 4).rotateY(Math.PI / 4).translate(x, y + m(0.36), z), material("iron")));

    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        group.add(new THREE.Mesh(new THREE.BoxGeometry(m(0.025), m(0.3), m(0.025)).translate(x + dx * m(0.1), y + m(0.15), z + dz * m(0.1)), material("iron")));
    }

    group.add(new THREE.Mesh(new THREE.BoxGeometry(m(0.16), m(0.26), m(0.16)).translate(x, y + m(0.15), z), material("sconce-warm")));
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, m(STOREY) - y - m(0.43), 4).translate(x, (m(STOREY) + y + m(0.43)) / 2, z), material("iron")));
    lit("lantern", x, y + m(0.15), z);

    return group;
}

// A barrel lying on its side along x, its end at x0 facing west with a brass tap
function cask(solid, x0, z, y, length, radius) {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 12, 1).rotateZ(Math.PI / 2).translate(x0 + length / 2, y + radius, z);
    const staves = new THREE.Mesh(geometry, material("planks"));
    const group = new THREE.Group();

    group.add(staves);

    for (const along of [0.12, 0.88]) {
        group.add(new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.04, radius * 1.04, length * 0.06, 12, 1, true).rotateZ(Math.PI / 2).translate(x0 + length * along, y + radius, z), material("iron")));
    }

    // The tap: a spout out of the head, and its handle
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.2, 6).rotateZ(Math.PI / 2).translate(x0 - 0.5, y + radius * 0.7, z), material("brass")));
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25).translate(x0 - 0.9, y + radius * 0.7 - 0.5, z), material("brass")));
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.8).translate(x0 - 0.5, y + radius * 0.7 + 0.4, z), material("brass")));
    solid.add(objectSolid(group));
}

// Wrap ready-made meshes so a Solid can take them
function objectSolid(object) {
    return { toObject: () => object };
}

function bed(solid, x0, z0, x1, z1, drape) {
    const [mattress, posts] = [m(0.6), m(2.2)];

    // Frame, mattress, coverlet and pillows (at the head, the north or south wall end)
    solid.box(x0 + 1, 0, z0 + 1, x1 - 1, m(0.35), z1 - 1, material("planks-dark"));
    solid.box(x0 + 1.4, m(0.35), z0 + 1.4, x1 - 1.4, mattress, z1 - 1.4, material("linen"));
    solid.box(x0 + 1.2, mattress - 0.6, z0 + m(0.55), x1 - 1.2, mattress + 0.4, z1 - 1.2, material(drape));

    for (const x of [x0 + m(0.45), x1 - m(0.45)]) {
        solid.box(x - m(0.3), mattress, z0 + 1.6, x + m(0.3), mattress + m(0.18), z0 + m(0.5), material("linen"));
    }

    // Four posts and the canopy, curtains gathered at the head and sides
    for (const [x, z] of [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]]) {
        solid.box(x - 0.45, 0, z - 0.45, x + 0.45, posts, z + 0.45, material("timber-light"));
    }

    solid.box(x0 + 0.6, posts, z0 + 0.6, x1 - 0.6, posts + m(0.2), z1 - 0.6, material(drape));
    solid.box(x0 + 1, m(0.7), z0 + 0.5, x1 - 1, posts, z0 + 1.2, material(drape));

    for (const x of [x0 + 0.5, x1 - 1.2]) {
        solid.box(x, m(0.5), z0 + 1, x + 0.7, posts, z0 + m(0.55), material(drape));
        solid.box(x, m(0.5), z1 - m(0.55), x + 0.7, posts, z1 - 1, material(drape));
    }
}

function washstand(solid, x, z) {
    solid.box(x - m(0.25), 0, z - m(0.22), x + m(0.25), m(0.8), z + m(0.22), material("timber-light"));
    solid.cylinder(x, z, m(0.8), m(0.88), m(0.16), m(0.2), material("pewter"), { segments: 12 });
    solid.cylinder(x + m(0.12), z - m(0.08), m(0.8), m(1.02), m(0.07), m(0.05), material("linen"), { segments: 8 });
}

function chest(solid, x, z) {
    solid.box(x - m(0.4), 0, z - m(0.26), x + m(0.4), m(0.5), z + m(0.26), material("planks-dark"));

    for (const dx of [-0.25, 0.25]) {
        solid.box(x + m(dx) - 0.25, 0, z - m(0.27), x + m(dx) + 0.25, m(0.52), z + m(0.27), material("iron"));
    }
}

// A rug: a border and a field
function rug(solid, x0, z0, x1, z1) {
    solid.box(x0, 0, z0, x1, 0.08, z1, material("rug-border"));
    solid.box(x0 + 1.2, 0.08, z0 + 1.2, x1 - 1.2, 0.12, z1 - 1.2, material("rug"));
}

// --- Walls ---

// A stretch of wall from (x0, z0) to (x1, z1) (along x or z), `thick` pixels thick, from the
// floor to the ceiling; plaster over a stone footing, with posts every so often and a beam
function wall(solid, x0, z0, x1, z1, thick, finish) {
    const along = x1 - x0 > z1 - z0 ? "x" : "z";
    const [ax0, az0, ax1, az1] = along === "x" ? [x0, z0 - thick / 2, x1, z0 + thick / 2] : [x0 - thick / 2, z0, x0 + thick / 2, z1];
    const top = m(STOREY);

    solid.box(ax0, 0, az0, ax1, m(0.35), az1, material("stone-warm"));
    solid.box(ax0 + 0.05, m(0.35), az0 + 0.05, ax1 - 0.05, top, az1 - 0.05, material(finish, WALL));

    if (!framed) {
        return;
    }

    solid.box(ax0, top - m(0.18), az0 - 0.2, ax1, top, az1 + 0.2, material("timber", WALL), { under: material("timber", WALL) });

    const length = along === "x" ? x1 - x0 : z1 - z0;
    const posts = Math.max(1, Math.round(length / m(2)));

    for (let k = 0; k <= posts; k++) {
        const t = k / posts;

        if (along === "x") {
            const x = x0 + (x1 - x0) * t;

            solid.box(x - 0.6, m(0.35), az0 - 0.2, x + 0.6, top, az1 + 0.2, material("timber", WALL));
        } else {
            const z = z0 + (z1 - z0) * t;

            solid.box(ax0 - 0.2, m(0.35), z - 0.6, ax1 + 0.2, top, z + 0.6, material("timber", WALL));
        }
    }
}

// --- Windows and daylight ---

// A window's opening (metres): its sill, its head, and half its width; and the outer walls'
// thickness
const PANE = Object.freeze({ sill: 0.95, head: 2.3, half: 0.6 });
const THICK = 0.3;

// Each side's way out of the room (x, z), and which come first for the daylight
const OUT = Object.freeze({ s: [0, 1], e: [1, 0], w: [-1, 0], n: [0, -1] });

// How high the sun stands over the windows it shines in at (degrees), and how far round to one
// side of straight in (so it falls across the floor aslant)
const DAYLIGHT = Object.freeze({ up: 35, round: 18 });

/**
 * Where the daylight comes in from, through a room's windows ({ side, at }: the wall they're in,
 * n, s, e or w, and metres along it): the side with the most of them (the south, east, west then
 * north first, if there are as many), the sun DAYLIGHT.up degrees over it and a little round to
 * one side. A direction towards the sun ([x, y, z], unit length), or null for no windows.
 */
export function daylightOf(panes) {
    const sides = Object.keys(OUT).filter((side) => panes.some((pane) => pane.side === side));

    if (!sides.length) {
        return null;
    }

    const side = sides.reduce((best, each) => (panes.filter((pane) => pane.side === each).length > panes.filter((pane) => pane.side === best).length ? each : best));
    const [ox, oz] = OUT[side];
    const [up, round] = [(DAYLIGHT.up * Math.PI) / 180, (DAYLIGHT.round * Math.PI) / 180];
    const [x, z] = [ox * Math.cos(round) - oz * Math.sin(round), ox * Math.sin(round) + oz * Math.cos(round)];

    return [x * Math.cos(up), Math.sin(up), z * Math.cos(up)];
}

// A point on one of a map's outer walls (art pixels): `u` along it (from its west or north end),
// `y` up, `d` in from the inside of the wall towards the room (less than 0: into the wall)
function onSide(map, side, u, y, d) {
    const [w, h] = [m(map.width), m(map.height)];

    return { n: [u, y, d], s: [u, y, h - d], w: [d, y, u], e: [w - d, y, u] }[side];
}

// A box between two such points (its underside too, `under`, if it's to be seen from below)
function sideBox(solid, map, side, from, to, stuff, under = false) {
    const [a, b] = [onSide(map, side, ...from), onSide(map, side, ...to)];

    solid.box(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), stuff, { under: under ? stuff : null });
}

// A window in an outer wall (`pane`: { side, at }, the opening left in the wall by outerWalls): a
// timber frame round it through the wall, a sill, a mullion, and leaded glass, the sun's in it
// on the side it shines in at (`sunny`)
function windowIn(solid, map, { side, at }, sunny) {
    const [u0, u1, sill, head, wall] = [m(at - PANE.half), m(at + PANE.half), m(PANE.sill), m(PANE.head), m(THICK)];
    const timber = material("timber", WALL);

    sideBox(solid, map, side, [u0 - 0.6, sill, -wall], [u0, head, 0.15], timber);
    sideBox(solid, map, side, [u1, sill, -wall], [u1 + 0.6, head, 0.15], timber);
    sideBox(solid, map, side, [u0 - 0.6, head, -wall], [u1 + 0.6, head + 0.4, 0.15], timber, true);
    sideBox(solid, map, side, [u0 - 0.8, sill - 0.3, -wall], [u1 + 0.8, sill, 0.6], timber);
    sideBox(solid, map, side, [(u0 + u1) / 2 - 0.1, sill, -wall * 0.6], [(u0 + u1) / 2 + 0.1, head, -wall * 0.4], timber);

    const glass = [[u0, sill], [u1, sill], [u1, head], [u0, head]].map(([u, y]) => onSide(map, side, u, y, -wall / 2));
    const [ox, oz] = OUT[side];

    solid.facing(glass, [-ox, 0, -oz], material(sunny ? "window-sun" : "window", WALL));
}

/**
 * The beams of daylight through the windows on the sunny side, as they'd show in a room's dusty
 * air: each window's opening swept in along the sunlight (`daylight`, towards the sun) down to
 * the floor (world metres about the map's corner): positions, how far along each corner is from
 * the window (0) to the floor (1), and how far across its face (0 to 1). For a mesh of its own
 * (shaftsOf).
 */
export function shaftsOf(map, panes, daylight) {
    const [positions, along, across] = [[], [], []];
    const [dx, dy, dz] = daylight.map((v) => -v);

    for (const { side, at } of panes) {
        const [ox, oz] = OUT[side];

        if (ox * daylight[0] + oz * daylight[2] <= 0.05) {
            continue;
        }

        // The opening's corners on the inside of the wall, and where the sun through each meets the floor
        const corner = (u, y) => onSide(map, side, m(u), m(y), 0).map((v) => v / M);
        const [a, b, c, d] = [corner(at - PANE.half, PANE.sill), corner(at + PANE.half, PANE.sill), corner(at + PANE.half, PANE.head), corner(at - PANE.half, PANE.head)];
        const floor = ([x, y, z]) => [x + (dx * y) / -dy, 0, z + (dz * y) / -dy];

        for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]]) {
            const [fp, fq] = [floor(p), floor(q)];

            for (const [point, t, s] of [[p, 0, 0], [q, 0, 1], [fq, 1, 1], [p, 0, 0], [fq, 1, 1], [fp, 1, 0]]) {
                positions.push(...point);
                along.push(t);
                across.push(s);
            }
        }
    }

    return { positions, along, across };
}

// The walls round a map's edge, with openings (gaps along a side: { side, from, to } in metres:
// a doorway, up to its `lintel`, or a window, from its `sill` to its `head`)
function outerWalls(solid, map, finish, openings = []) {
    const [w, h] = [m(map.width), m(map.height)];
    const thick = m(THICK);
    const sides = { n: [0, 0, w, 0], s: [0, h, w, h], w: [0, 0, 0, h], e: [w, 0, w, h] };

    for (const [side, [x0, z0, x1, z1]] of Object.entries(sides)) {
        const gaps = openings.filter((gap) => gap.side === side).sort((a, b) => a.from - b.from);
        const along = side === "n" || side === "s" ? "x" : "z";
        const outward = side === "n" || side === "w" ? -thick / 2 : thick / 2;
        let start = along === "x" ? x0 - thick : z0 - thick;
        const end = along === "x" ? x1 + thick : z1 + thick;

        for (const gap of [...gaps, { from: end / M, to: end / M }]) {
            const stop = m(gap.from);

            if (stop > start) {
                if (along === "x") {
                    wall(solid, start, z0 + outward, stop, z0 + outward, thick, finish);
                } else {
                    wall(solid, x0 + outward, start, x0 + outward, stop, thick, finish);
                }
            }

            // Wall over the opening (and under a window), its beam along the top carried over it
            if (gap.to > gap.from && (gap.lintel || gap.sill)) {
                const [a, b] = [m(gap.from), m(gap.to)];
                const span = (y0, y1, stuff, proud = 0) => {
                    if (along === "x") {
                        solid.box(a - proud, y0, z0 + outward - thick / 2 - proud, b + proud, y1, z0 + outward + thick / 2 + proud, stuff, { under: y0 > 0 ? stuff : null });
                    } else {
                        solid.box(x0 + outward - thick / 2 - proud, y0, a - proud, x0 + outward + thick / 2 + proud, y1, b + proud, stuff, { under: y0 > 0 ? stuff : null });
                    }
                };

                if (gap.sill) {
                    span(0, m(0.35), material("stone-warm"));
                    span(m(0.35), m(gap.sill), material(finish, WALL));
                }

                span(m(gap.lintel ?? gap.head), m(STOREY), material(finish, WALL));

                if (framed) {
                    span(m(STOREY) - m(0.18), m(STOREY), material("timber", WALL), 0.2);
                }

                if (gap.lintel && along === "x") {
                    solid.box(a - 0.6, m(gap.lintel) - 0.8, z0 + outward - thick / 2 - 0.3, b + 0.6, m(gap.lintel), z0 + outward + thick / 2 + 0.3, material("timber", WALL), { under: material("timber", WALL) });
                }
            }

            start = m(gap.to);
        }
    }
}

/**
 * A map's outer walls with its doors (openings as outerWalls's) and windows (`panes`: { side, at
 * }) in them: the windows framed and glazed, the sun shining in through those on the side with
 * the most (daylightOf), its beams in the air. Notes the windows and the daylight for the inside
 * being built.
 */
function walledIn(solid, map, finish, doors, panes) {
    const daylight = daylightOf(panes);

    // (The wall's posts either side of each stand clear of the glass)
    outerWalls(solid, map, finish, [...doors, ...panes.map(({ side, at }) => ({ side, from: at - PANE.half - 0.12, to: at + PANE.half + 0.12, sill: PANE.sill, head: PANE.head }))]);

    for (const pane of panes) {
        const [ox, oz] = OUT[pane.side];

        windowIn(solid, map, pane, daylight && ox * daylight[0] + oz * daylight[2] > 0.05);
    }

    lighting.panes = panes;
    lighting.daylight = daylight;
}

// --- Ceilings ---

// How each people's ceilings are made (by its materials' names, as PALETTES has them): the humans'
// of limewashed plaster between joists, carried on great beams across the room; the orcs' and the cat folk's of
// round logs (the cat folk's reeds over palm-trunk vigas); the lizard folk's of reeds on bamboo
// poles, on beams; the elves' a pale vault-smooth ceiling, ribbed; the dark elves' black stone on
// heavy charred beams. `beams`: [width, depth, apart] across the room's shorter way; `joists` the
// same along its longer way; `logs`: [radius, apart] across its shorter way (metres)
const CEILINGS = Object.freeze({
    human: { boards: "plaster", beams: [0.24, 0.3, 3.2], joists: [0.1, 0.14, 0.5] },
    orc: { boards: "planks-dark", logs: [0.15, 0.85] },
    cat: { boards: "reeds", logs: [0.1, 0.7] },
    lizard: { boards: "reeds", beams: [0.18, 0.2, 3.4], logs: [0.05, 0.32] },
    elf: { boards: "stone-moon", beams: [0.1, 0.1, 1.6] },
    darkElf: { boards: "stone-black", beams: [0.28, 0.32, 2.2] },
});

// The people whose ceiling's being built (buildingInterior's), for CEILINGS
let people = null;

/**
 * A map's ceiling, STOREY metres over its floor: boards, and under them its people's beams,
 * joists or logs (CEILINGS), left open over a stairwell (`hole`: x0, z0, x1, z1 in art pixels)
 * with a dark well above it.
 */
function ceiling(solid, map, hole = null) {
    const style = CEILINGS[people ?? "human"];
    const [w, h] = [m(map.width), m(map.height)];
    const top = m(STOREY);
    const board = 0.3;
    const across = w >= h ? "z" : "x";
    const [long, short] = across === "z" ? [w, h] : [h, w];
    const stuff = (name) => material(name, CEILING);
    // (A box in the room's own terms: `a` along its longer way, `b` across it)
    const lay = (a0, b0, a1, b1, y0, y1, name) => (across === "z" ? solid.box(a0, y0, b0, a1, y1, b1, stuff(name), { under: stuff(name) }) : solid.box(b0, y0, a0, b1, y1, a1, stuff(name), { under: stuff(name) }));
    const open = hole && (across === "z" ? hole : [hole[1], hole[0], hole[3], hole[2]]);
    // (Runs across the room's shorter way, `apart` metres apart, broken at the stairwell)
    const crossing = (apart, each) => {
        const count = Math.max(1, Math.round(long / m(apart)));

        for (let k = 0; k < count; k++) {
            each(((k + 0.5) / count) * long);
        }
    };

    // The boards (round the stairwell)
    if (open) {
        lay(0, 0, long, open[1], top, top + board, style.boards);
        lay(0, open[3], long, short, top, top + board, style.boards);
        lay(0, open[1], open[0], open[3], top, top + board, style.boards);
        lay(open[2], open[1], long, open[3], top, top + board, style.boards);
    } else {
        lay(0, 0, long, short, top, top + board, style.boards);
    }

    // Joists along the longer way, under the boards
    if (style.joists) {
        const [width, depth, apart] = style.joists.map(m);

        for (let b = apart / 2; b < short; b += apart) {
            const [b0, b1] = [b - width / 2, b + width / 2];

            if (open && b1 > open[1] && b0 < open[3]) {
                if (open[0] > 0) {
                    lay(0, b0, open[0], b1, top - depth, top, "timber");
                }

                lay(open[2], b0, long, b1, top - depth, top, "timber");
            } else {
                lay(0, b0, long, b1, top - depth, top, "timber");
            }
        }
    }

    // Beams across the shorter way, deeper than the joists, carrying them
    if (style.beams) {
        const [width, depth] = style.beams.map(m);

        crossing(style.beams[2], (a) => {
            const crosses = open && a + width / 2 > open[0] && a - width / 2 < open[2];

            if (crosses) {
                if (open[1] > 0) {
                    lay(a - width / 2, 0, a + width / 2, open[1], top - depth, top, "timber");
                }

                lay(a - width / 2, open[3], a + width / 2, short, top - depth, top, "timber");
            } else {
                lay(a - width / 2, 0, a + width / 2, short, top - depth, top, "timber");
            }
        });
    }

    // Round logs across the shorter way, half sunk into the boards
    if (style.logs) {
        const radius = m(style.logs[0]);

        crossing(style.logs[1], (a) => {
            if (open && a + radius > open[0] && a - radius < open[2]) {
                return;
            }

            const log = new THREE.CylinderGeometry(radius, radius * 0.92, short, 8, 1).rotateX(Math.PI / 2).translate(0, 0, short / 2);
            const mesh = new THREE.Mesh(across === "z" ? log.translate(a, top - radius * 0.4, 0) : log.rotateY(Math.PI / 2).translate(0, top - radius * 0.4, a), stuff("timber"));

            solid.add(objectSolid(mesh));
        });
    }

    // Round the stairwell: trimmers along its edges, and a dark well going up out of sight
    if (hole) {
        const [x0, z0, x1, z1] = hole;

        solid.box(x0 - 0.6, top - m(0.3), z0 - 0.6, x1 + 0.6, top, z0, stuff("timber"), { under: stuff("timber") });
        solid.box(x0 - 0.6, top - m(0.3), z1, x1 + 0.6, top, z1 + 0.6, stuff("timber"), { under: stuff("timber") });
        solid.box(x0, top + board, z0, x1, top + m(1.6), z1, stuff("soot"));
    }
}

// Walls through a floor: each wall square joined to its wall neighbours through its middle, and
// where a wall stops at a doorway, carried on to the doorway's edge
function innerWalls(solid, map, finish, curtain = "velvet") {
    const isWall = (x, y) => map.plan[y]?.[x] === "W";
    const thick = m(0.18);

    for (const { squares } of map.pieces.filter((piece) => piece.kind === "wall")) {
        for (const [x, y] of squares) {
            const [cx, cz] = [m(x + 0.5), m(y + 0.5)];
            const [east, west, south, north] = [isWall(x + 1, y), isWall(x - 1, y), isWall(x, y + 1), isWall(x, y - 1)];

            // To each neighbour, or to the map's edge, or on through the square where a run of
            // wall stops (at a doorway)
            if (east || x + 1 === map.width || (west && !south && !north)) {
                wall(solid, cx, cz, m(x + 1), cz, thick, finish);
            }

            if (west || x === 0 || (east && !south && !north)) {
                wall(solid, m(x), cz, cx, cz, thick, finish);
            }

            if (south || y + 1 === map.height || (north && !east && !west)) {
                wall(solid, cx, cz, cx, m(y + 1), thick, finish);
            }

            if (north || y === 0 || (south && !east && !west)) {
                wall(solid, cx, m(y), cx, cz, thick, finish);
            }
        }
    }

    // A curtained doorway (a lintel over it, curtains tied back at its sides) through a wall: a
    // run of floor one or two squares long with wall at both ends
    for (const { along, x0, y0, length } of doorways(map)) {
        const lintel = m(2.2);

        if (along === "x") {
            const [a, b, cz] = [m(x0), m(x0 + length), m(y0 + 0.5)];

            solid.box(a, lintel, cz - thick / 2, b, m(STOREY), cz + thick / 2, material(finish, WALL));
            solid.box(a - 0.4, lintel - 0.8, cz - thick / 2 - 0.3, b + 0.4, lintel, cz + thick / 2 + 0.3, material("timber", WALL));

            for (const [c0, c1] of [[a + 0.1, a + 1.2], [b - 1.2, b - 0.1]]) {
                solid.box(c0, m(0.1), cz - 0.3, c1, lintel - 0.8, cz + 0.3, material(curtain, WALL));
            }
        } else {
            const [a, b, cx] = [m(y0), m(y0 + length), m(x0 + 0.5)];

            solid.box(cx - thick / 2, lintel, a, cx + thick / 2, m(STOREY), b, material(finish, WALL));
            solid.box(cx - thick / 2 - 0.3, lintel - 0.8, a - 0.4, cx + thick / 2 + 0.3, lintel, b + 0.4, material("timber", WALL));

            for (const [c0, c1] of [[a + 0.1, a + 1.2], [b - 1.2, b - 0.1]]) {
                solid.box(cx - 0.3, m(0.1), c0, cx + 0.3, lintel - 0.8, c1, material(curtain, WALL));
            }
        }
    }
}

/** The doorways through a map's walls: runs of floor one or two squares long, walls at each end: [{ along ("x" or "z"), x0, y0, length }]. */
export function doorways(map) {
    const isWall = (x, y) => map.plan[y]?.[x] === "W";
    const open = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && !isWall(x, y);
    const found = [];

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            for (const [along, dx, dy] of [["x", 1, 0], ["z", 0, 1]]) {
                if (!open(x, y) || !isWall(x - dx, y - dy)) {
                    continue;
                }

                let length = 1;

                while (length <= 2 && open(x + dx * length, y + dy * length)) {
                    length++;
                }

                if (length <= 2 && isWall(x + dx * length, y + dy * length)) {
                    found.push({ along, x0: x, y0: y, length });
                }
            }
        }
    }

    return found;
}

// Stairs along x from x0 to x1 (pixels) at z0 to z1, rising from `from` to `to` pixels high as x
// grows (or falls, if `to` < `from`): solid steps, a stringer and a handrail on the open side
function stairs(solid, x0, x1, z0, z1, from, to, open) {
    const steps = 12;
    const run = (x1 - x0) / steps;
    const rise = (to - from) / steps;

    for (let k = 0; k < steps; k++) {
        const top = from + rise * (k + 1);

        solid.box(x0 + run * k, Math.min(from, top) - (to < from ? m(0.25) : 0), z0, x0 + run * (k + 1), top, z1, material("planks"), { top: material("planks-dark") });
    }

    // The handrail on posts along the open side
    const rail = (x) => from + ((x - x0) / (x1 - x0)) * (to - from) + m(0.9);

    for (let k = 0; k <= 4; k++) {
        const x = x0 + ((x1 - x0) * k) / 4;
        const base = from + ((x - x0) / (x1 - x0)) * (to - from);

        solid.box(x - 0.35, base, open - 0.35, x + 0.35, rail(x) + 0.3, open + 0.35, material("timber"));
    }

    const segments = 8;

    for (let k = 0; k < segments; k++) {
        const [a, b] = [x0 + ((x1 - x0) * k) / segments, x0 + ((x1 - x0) * (k + 1)) / segments];

        solid.box(a, Math.min(rail(a), rail(b)), open - 0.3, b, Math.max(rail(a), rail(b)) + 0.3, open + 0.3, material("timber"));
    }
}

// --- The taproom ---

function taproom(map) {
    const solid = new Solid();
    const moving = [];
    const [w, h] = [m(map.width), m(map.height)];

    // Flagstones
    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("stone"));

    // The walls, the door in the middle of the south one (between its two door squares); windows
    // in the north, south and west walls (and where the stairs would be, if there's no floor
    // above)
    const doors = map.marks.D;
    const doorMiddle = (doors[0][0] + doors.at(-1)[0] + 1) / 2;
    const stair = map.pieces.find((piece) => piece.kind === "stairs");
    const panes = [9.5, 14, ...(stair ? [] : [3.5])].map((at) => ({ side: "n", at })).concat([3.5, 14].map((at) => ({ side: "s", at })), [3.5, 12].map((at) => ({ side: "w", at })));

    walledIn(solid, map, map.finish ?? "plaster", [{ side: "s", from: doorMiddle - 0.9, to: doorMiddle + 0.9, lintel: 2.35 }], panes);

    // The door, shut, in its frame
    const [doorLeft, doorRight, wallZ] = [m(doorMiddle - 0.9), m(doorMiddle + 0.9), h];

    solid.box(doorLeft, 0, wallZ - 0.2, doorRight, m(2.35), wallZ + 0.4, material("planks-dark", WALL));
    solid.box(doorLeft - 0.8, 0, wallZ - 0.6, doorLeft, m(2.45), wallZ + 0.6, material("timber", WALL));
    solid.box(doorRight, 0, wallZ - 0.6, doorRight + 0.8, m(2.45), wallZ + 0.6, material("timber", WALL));
    solid.box(m(doorMiddle - 0.35), m(1.05), wallZ - 0.5, m(doorMiddle - 0.2), m(1.15), wallZ - 0.2, material("iron", WALL));

    // The stairs up, along the north wall, rising east from their foot (if there's a floor
    // above), through the ceiling
    if (stair) {
        stairs(solid, m(stair.x), m(stair.x + stair.w), m(stair.y), m(stair.y + stair.h), 0, m(STOREY), m(stair.y + stair.h));
    }

    ceiling(solid, map, stair ? [m(stair.x), m(stair.y), m(stair.x + stair.w), m(stair.y + stair.h)] : null);

    // The hearth: a stone chimney breast on the west wall, a wide opening, a mantel beam, the
    // hearthstone before it; logs and fire; a boar turning on a spit over the flames
    const hearth = map.pieces.find((piece) => piece.kind === "hearth");
    const [z0, z1] = [m(hearth.y), m(hearth.y + hearth.h)];
    const [open0, open1] = [z0 + m(0.85), z1 - m(0.85)];
    const breast = m(0.9);

    const hz = hearth.y + hearth.h / 2;

    solid.box(-m(0.1), 0, z0, breast, m(STOREY), open0, material("stone", WALL));
    solid.box(-m(0.1), 0, open1, breast, m(STOREY), z1, material("stone", WALL));
    solid.box(-m(0.1), m(1.6), open0, breast, m(STOREY), open1, material("stone", WALL));
    solid.box(-m(0.1), 0, open0, m(0.15), m(1.6), open1, material("soot", WALL));
    solid.box(-m(0.1), m(1.55), z0 - m(0.1), breast + m(0.15), m(1.8), z1 + m(0.1), material("timber", WALL));
    solid.box(0, 0, z0 - m(0.2), m(1.9), m(0.08), z1 + m(0.2), material("stone-dark"));

    const logs = new THREE.Group();

    for (const [x, z, turn] of [[0.55, hz - 0.4, 0.3], [0.6, hz + 0.3, -0.2], [1.2, hz - 0.2, 0.1], [1.25, hz + 0.25, -0.1]]) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(m(0.08), m(0.09), m(0.85), 7).rotateX(Math.PI / 2).rotateY(turn).translate(m(x), m(0.15), m(z)), material("timber-light"));

        logs.add(log);
    }

    logs.add(new THREE.Mesh(new THREE.BoxGeometry(m(1.1), 0.4, m(1.6)).translate(m(0.85), m(0.1), m(hz)), material("embers")));
    solid.add(objectSolid(logs));

    // The spit: iron stands either side, a rod through the boar, a crank
    const spitX = m(1.3);
    const spitY = m(0.95);

    for (const z of [open0 + m(0.15), open1 - m(0.15)]) {
        solid.box(spitX - 0.3, 0, z - 0.3, spitX + 0.3, spitY, z + 0.3, material("iron"));
        solid.box(spitX - 0.25, spitY - 0.3, z - 1.2, spitX + 0.25, spitY + 0.8, z - 0.9, material("iron"));
        solid.box(spitX - 0.25, spitY - 0.3, z + 0.9, spitX + 0.25, spitY + 0.8, z + 1.2, material("iron"));
    }

    const spit = new THREE.Group();

    spit.position.set(spitX, spitY, (open0 + open1) / 2);
    spit.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, open1 - open0 + m(0.5), 6).rotateX(Math.PI / 2), material("iron")));
    spit.add(boar());
    spit.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3).translate(0, -1, (open1 - open0) / 2 + m(0.25)), material("iron")));
    moving.push({ object: spit, turn: 0.35 });

    // The fires: a tall one in the hearth, a low one under the boar
    const fires = [flame(m(0.9), m(0.9), 1.3), flame(m(1.1), m(0.55), 7.1), flame(m(0.7), m(0.7), 3.7)];

    fires[0].position.set(m(0.5), m(0.12), m(hz));
    fires[1].position.set(spitX - m(0.1), m(0.1), m(hz - 0.15));
    fires[2].position.set(spitX, m(0.1), m(hz + 0.4));

    // A pair of antlers over the mantel
    for (const side of [-1, 1]) {
        solid.box(m(0.1), m(2.2), m(hz) + side * 1.5, m(0.3), m(2.9), m(hz) + side * 2.2, material("candle", WALL));
        solid.box(m(0.1), m(2.6), m(hz) + side * 2.2, m(0.3), m(2.75), m(hz) + side * 4.5, material("candle", WALL));
    }

    // Tables, and benches along them, with tankards, plates and candles
    for (const piece of map.pieces.filter((each) => each.kind === "table")) {
        const [x0, z0, x1, z1] = [m(piece.x), m(piece.y), m(piece.x + piece.w), m(piece.y + piece.h)];

        table(solid, x0, z0 + m(0.1), x1, z1 - m(0.1));
        candle(solid, (x0 + x1) / 2, (z0 + z1) / 2, m(0.78));
        tankard(solid, x0 + m(0.4), z0 + m(0.35), m(0.78), piece.x % 2 === 0);
        tankard(solid, x1 - m(0.5), z1 - m(0.3), m(0.78));
        solid.cylinder(x1 - m(0.35), z0 + m(0.3), m(0.78), m(0.8), m(0.14), m(0.14), material("pewter"), { segments: 10 });
    }

    for (const run of benchRuns(map)) {
        bench(solid, m(run.x), m(run.y), m(run.x + run.w), m(run.y + 1));
    }

    // The bar: a panelled counter with a thick top, tankards on it; the barrels behind, lying on
    // their stillage with taps, and shelves of tankards above
    const bar = map.pieces.find((piece) => piece.kind === "bar");
    const [barX0, barX1, barZ0, barZ1] = [m(bar.x + 0.1), m(bar.x + 0.9), m(bar.y), m(bar.y + bar.h)];

    solid.box(barX0, 0, barZ0, barX1, m(1.02), barZ1, material("planks-dark"));
    solid.box(barX0 - m(0.12), m(1.02), barZ0 - m(0.08), barX1 + m(0.05), m(1.12), barZ1 + m(0.08), material("planks"));

    for (let k = 0; k < bar.h * 2; k++) {
        const z = barZ0 + m(0.3 + k * 0.5);

        solid.box(barX0 - 0.15, m(0.15), z - m(0.2), barX0, m(0.9), z + m(0.2), material("timber"));

        if (k % 3 !== 1) {
            tankard(solid, barX0 + m(0.25), z, m(1.12), k % 2 === 0);
        }
    }

    candle(solid, barX0 + m(0.4), barZ0 + m(2.5), m(1.12));

    const barrels = map.pieces.find((piece) => piece.kind === "barrels");
    const [kx, kz0, kz1] = [m(barrels.x), m(barrels.y), m(barrels.y + barrels.h)];

    solid.box(kx + m(0.1), 0, kz0, kx + m(0.95), m(0.15), kz1, material("timber"));
    solid.box(kx + m(0.1), m(0.8), kz0, kx + m(0.95), m(0.88), kz1, material("timber"));

    for (let z = kz0 + m(0.5); z < kz1 - m(0.3); z += m(0.95)) {
        cask(solid, kx + m(0.08), z, m(0.15), m(0.88), m(0.32));
        cask(solid, kx + m(0.12), z, m(0.88), m(0.8), m(0.28));
    }

    for (const y of [m(1.9), m(2.4)]) {
        solid.box(kx + m(0.4), y, kz0, m(map.width), y + 0.4, kz1, material("planks"));

        for (let z = kz0 + m(0.35); z < kz1; z += m(0.55)) {
            tankard(solid, kx + m(0.7), z, y + 0.4, Math.round(z) % 2 === 0);
        }
    }

    // Wheels of candles hanging over the tables, and a lantern over the bar
    solid.add(objectSolid(candleWheel(m(7.5), m(5.5), m(2.45), m(0.7), 6)));
    solid.add(objectSolid(candleWheel(m(7.5), m(10.5), m(2.45), m(0.7), 6)));
    solid.add(objectSolid(lantern(m(bar.x + 1.5), m(bar.y + bar.h / 2), m(2.2))));

    return {
        solid,
        moving,
        flames: fires,
        lights: [{ kind: "fire", x: 1.1, y: 1.0, z: hz, colour: 0xff8a3a, intensity: 9, distance: 14, flicker: 0.25, ...fires[0].userData.fire }],
        hearth: { x: 1.1, y: 0.8, z: hz },
    };
}

// A wheel of `count` candles hanging from the ceiling on three chains, its middle at x, z (art
// pixels), `y` high, `radius` across
function candleWheel(wheelX, wheelZ, wheelY, radius, count) {
    const wheel = new THREE.Group();
    const top = m(STOREY);
    const hook = Math.min(top - m(0.25), wheelY + m(0.55));
    const flames = [];

    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.35, 5, 18).rotateX(Math.PI / 2).translate(wheelX, wheelY, wheelZ), material("timber")));

    for (let k = 0; k < count; k++) {
        const angle = (k / count) * Math.PI * 2;
        const [x, z] = [wheelX + Math.cos(angle) * radius, wheelZ + Math.sin(angle) * radius];

        wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, m(0.18), 6).translate(x, wheelY + m(0.09), z), material("candle")));
        // (Its flame: fire.js's, drawn with the room's others)
        lighting.candles.push([x, wheelY + m(0.18), z, candleSeed(x, wheelY, z)]);
        flames.push([x, wheelY + m(0.21), z]);
    }

    // Three chains from the rim to a ring, and one from the ring up to the hook in the ceiling
    for (let k = 0; k < 3; k++) {
        const angle = (k / 3) * Math.PI * 2 + 0.5;

        wheel.add(rod([wheelX + Math.cos(angle) * radius, wheelY, wheelZ + Math.sin(angle) * radius], [wheelX, hook, wheelZ], 0.08, material("iron")));
    }

    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 4, 10).rotateX(Math.PI / 2).translate(wheelX, hook, wheelZ), material("iron")));
    wheel.add(rod([wheelX, hook, wheelZ], [wheelX, top, wheelZ], 0.1, material("iron")));
    lit("lamp", wheelX, wheelY + m(0.25), wheelZ, { count, glows: flames });

    return wheel;
}

// A thin rod (a chain, seen from afar) from one point to another (art pixels)
function rod(from, to, radius, stuff) {
    const [a, b] = [new THREE.Vector3(...from), new THREE.Vector3(...to)];
    const length = a.distanceTo(b);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 4), stuff);

    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    mesh.updateMatrix();
    mesh.geometry.applyMatrix4(mesh.matrix);
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();

    return mesh;
}

// Runs of seats along each row (benches, `b`, or pews, `p`: each square a seat)
function benchRuns(map, mark = "b") {
    const runs = [];

    for (let y = 0; y < map.height; y++) {
        let start = null;

        for (let x = 0; x <= map.width; x++) {
            const seat = map.plan[y][x] === mark;

            if (seat && start === null) {
                start = x;
            } else if (!seat && start !== null) {
                runs.push({ x: start, y, w: x - start });
                start = null;
            }
        }
    }

    return runs;
}

// The boar, roasted golden brown, along the spit (z), an apple in its mouth
function boar() {
    const group = new THREE.Group();
    const roast = material("roast");

    group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12).scale(m(0.3), m(0.27), m(0.62)), roast));

    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10).scale(m(0.2), m(0.19), m(0.26)), roast);

    head.position.set(0, m(0.02), m(0.62));
    group.add(head);
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(m(0.09), m(0.12), m(0.2), 10).rotateX(Math.PI / 2).translate(0, -m(0.02), m(0.86)), roast));
    group.add(new THREE.Mesh(new THREE.SphereGeometry(m(0.085), 10, 8).translate(0, -m(0.03), m(0.99)), material("apples")));

    for (const side of [-1, 1]) {
        group.add(new THREE.Mesh(new THREE.ConeGeometry(m(0.07), m(0.14), 6).rotateZ(side * 0.5).translate(side * m(0.12), m(0.2), m(0.58)), roast));

        // Legs tied along the spit, fore and hind
        for (const [z, forward] of [[m(0.35), 1], [-m(0.4), -1]]) {
            group.add(new THREE.Mesh(new THREE.CylinderGeometry(m(0.05), m(0.07), m(0.36), 8).rotateX((forward * Math.PI) / 2.4).translate(side * m(0.14), -m(0.16), z + forward * m(0.14)), roast));
        }
    }

    return group;
}

// --- Upstairs ---

function upstairs(map) {
    const solid = new Solid();
    const [w, h] = [m(map.width), m(map.height)];
    const stair = map.pieces.find((piece) => piece.kind === "stairs");
    const [hole0, hole1] = [m(stair.x), m(stair.x + stair.w)];
    const [well0, well1] = [m(stair.y), m(stair.y + stair.h)];

    // Floorboards, with the stairwell open: the stairs going down in it, a rail round it
    solid.box(-m(0.3), -0.5, -m(0.3), hole0, 0, h + m(0.3), material("planks"));
    solid.box(hole1, -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("planks"));
    solid.box(hole0, -0.5, well1, hole1, 0, h + m(0.3), material("planks"));
    stairs(solid, hole0, hole1, well0, well1, -m(STOREY), 0, well1);

    for (const x of [hole0, hole0 + (hole1 - hole0) / 3, hole0 + ((hole1 - hole0) * 2) / 3]) {
        solid.box(x - 0.35, 0, well1 - 0.35, x + 0.35, m(1), well1 + 0.35, material("timber"));
    }

    solid.box(hole0, m(0.95), well1 - 0.3, hole1 - m(0.4), m(1.05), well1 + 0.3, material("timber"));
    solid.box(hole0 - 0.3, m(0.95), well0, hole0 + 0.3, m(1.05), well1, material("timber"));
    solid.box(hole0 - 0.35, 0, -0.35, hole0 + 0.35, m(1.05), 0.35, material("timber"));

    // A madam's house in rose and red velvet; an inn's plainer, in whitewash and wool
    const inn = map.look === "inn";
    const [finish, cloth] = inn ? ["plaster-white", "wool-green"] : ["plaster-rose", "velvet"];

    walledIn(solid, map, finish, [], [{ side: "w", at: 4 }, { side: "w", at: 11 }, ...[11, 15.5].flatMap((at) => [{ side: "n", at }, { side: "s", at }])]);
    innerWalls(solid, map, finish, cloth);
    ceiling(solid, map);

    // Rugs: a big one before the counter, a runner along the hallway
    rug(solid, m(0.6), m(6.2), m(7.4), m(12.8));
    rug(solid, m(8.3), m(6.4), m(17.6), m(8.6));

    // The counter: dark wood, a runner, a ledger, a bell, a candle, flowers
    const counter = map.pieces.find((piece) => piece.kind === "counter");
    const [cx0, cx1, cz0, cz1] = [m(counter.x), m(counter.x + counter.w), m(counter.y + 0.15), m(counter.y + 0.85)];

    solid.box(cx0, 0, cz0, cx1, m(1.05), cz1, material("planks-dark"));
    solid.box(cx0 - 0.4, m(1.05), cz0 - 0.4, cx1 + 0.4, m(1.12), cz1 + 0.4, material("timber-light"));
    solid.box(cx0 + m(0.3), m(1.12), cz0 + 0.5, cx1 - m(0.3), m(1.14), cz1 - 0.5, material(inn ? "rug-border" : "velvet"));
    solid.box(cx0 + m(0.6), m(1.14), cz0 + m(0.15), cx0 + m(1.05), m(1.2), cz0 + m(0.5), material("ledger"));
    solid.cylinder(cx0 + m(1.7), cz0 + m(0.35), m(1.14), m(1.22), m(0.06), 0.1, material("brass"), { segments: 10 });
    candle(solid, cx1 - m(0.35), cz0 + m(0.35), m(1.14));
    solid.cylinder(cx0 + m(2.4), cz0 + m(0.4), m(1.14), m(1.35), m(0.06), m(0.08), material("pewter"), { segments: 8 });

    for (let k = 0; k < 5; k++) {
        solid.cylinder(cx0 + m(2.4) + (k - 2) * 0.35, cz0 + m(0.4) + ((k % 2) - 0.5) * 0.4, m(1.35), m(1.5), 0.3, 0.3, material(k % 2 ? "flowers" : "leaves"), { segments: 5 });
    }

    // A chaise longue in red velvet, a side table with a candelabrum and wine
    const chaise = map.pieces.find((piece) => piece.kind === "chaise");
    const [lx0, lx1, lz] = [m(chaise.x), m(chaise.x + chaise.w), m(chaise.y)];

    solid.box(lx0 + 0.5, 0, lz + m(0.2), lx1 - 0.5, m(0.4), lz + m(0.85), material("timber"));
    solid.box(lx0 + 0.8, m(0.4), lz + m(0.25), lx1 - 0.8, m(0.52), lz + m(0.8), material(cloth));
    solid.box(lx0 + 0.5, m(0.4), lz + m(0.7), lx1 - 0.5, m(0.95), lz + m(0.88), material(cloth));
    solid.box(lx0 + 0.5, m(0.4), lz + m(0.2), lx0 + m(0.3), m(0.8), lz + m(0.85), material(cloth));

    const side = map.pieces.find((piece) => piece.kind === "side-table");
    const [sx, sz] = [m(side.x + 0.5), m(side.y + 0.5)];

    solid.cylinder(sx, sz, 0, m(0.65), m(0.08), m(0.08), material("timber"), { segments: 8 });
    solid.cylinder(sx, sz, m(0.62), m(0.68), m(0.35), m(0.35), material("timber-light"), { segments: 14 });
    candle(solid, sx - m(0.1), sz - m(0.1), m(0.68));
    candle(solid, sx + m(0.12), sz - m(0.05), m(0.68));
    solid.cylinder(sx + m(0.05), sz + m(0.15), m(0.68), m(0.95), m(0.05), m(0.03), material("wine"), { segments: 8 });

    // The bedrooms: canopied beds, a washstand and a chest in each, candles in sconces on the
    // walls
    const drapes = inn ? ["wool-green", "wool-blue", "wool-ochre", "linen"] : ["velvet", "velvet-purple", "velvet-purple", "velvet"];

    map.pieces.filter((piece) => piece.kind === "bed").forEach((piece, k) => {
        const [x0, z0, x1, z1] = [m(piece.x), m(piece.y), m(piece.x + piece.w), m(piece.y + piece.h)];

        // The head against the wall it touches (north for the north rooms, south for the south)
        if (piece.y === 0) {
            bed(solid, x0, z0, x1, z1, drapes[k]);
        } else {
            const turned = new Solid();

            bed(turned, 0, 0, x1 - x0, z1 - z0, drapes[k]);

            const object = turned.toObject();

            object.rotation.y = Math.PI;
            object.position.set(x1, 0, z1);
            solid.add(objectSolid(object));
        }
    });

    for (const piece of map.pieces.filter((each) => each.kind === "washstand")) {
        washstand(solid, m(piece.x + 0.5), m(piece.y + 0.5));
    }

    // (A candle on each chest, to go to bed by)
    for (const piece of map.pieces.filter((each) => each.kind === "chest")) {
        chest(solid, m(piece.x + 0.5), m(piece.y + 0.5));
        candle(solid, m(piece.x + 0.3), m(piece.y + 0.5), m(0.52));
    }

    // Sconces in the hallway and by the counter: red glass in a madam's house, clear at an inn
    for (const [x, z] of [[9, 5.62], [13.5, 5.62], [9, 9.38], [13.5, 9.38], [0.05, 8]]) {
        sconce(solid, m(x), m(z), inn);
    }

    // A wheel of candles over the lounge
    solid.add(objectSolid(candleWheel(m(4), m(8), m(2.45), m(0.7), 6)));

    return { solid, moving: [], flames: [], lights: [], hearth: null };
}

// --- The smithy ---

function smithy(map) {
    const solid = new Solid();
    const moving = [];
    const [w, h] = [m(map.width), m(map.height)];
    const at = (kind) => map.pieces.find((piece) => piece.kind === kind);

    // Beaten earth underfoot, dark with soot; bare stone walls, the door in the middle of the south
    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("earth-sooty"));

    const doors = map.marks.D;
    const doorMiddle = (doors[0][0] + doors.at(-1)[0] + 1) / 2;

    walledIn(solid, map, "stone", [{ side: "s", from: doorMiddle - 0.7, to: doorMiddle + 0.7, lintel: 2.2 }], [{ side: "e", at: 4 }, { side: "e", at: 9 }, { side: "s", at: 3.5 }, { side: "s", at: 12.5 }]);
    solid.box(m(doorMiddle - 0.7), 0, h - 0.2, m(doorMiddle + 0.7), m(2.2), h + 0.4, material("planks-dark", WALL));
    ceiling(solid, map);

    // The forge: a waist-high hearth of stone against the north wall, a bed of glowing coals on
    // it, a hood over it narrowing to the chimney, and a fire
    const forge = at("forge");
    const [fx0, fx1, fz0, fz1] = [m(forge.x), m(forge.x + forge.w), m(forge.y), m(forge.y + forge.h)];
    const fx = (fx0 + fx1) / 2;

    solid.box(fx0, 0, fz0, fx1, m(0.85), fz1 - m(0.2), material("stone-dark"));
    solid.box(fx0 + m(0.4), m(0.85), fz0 + m(0.4), fx1 - m(0.4), m(0.9), fz1 - m(0.6), material("embers"));
    solid.box(fx0 - m(0.1), m(0.85), fz0 + m(0.2), fx0 + m(0.3), m(1.15), fz1 - m(0.2), material("stone-dark"));
    solid.box(fx1 - m(0.3), m(0.85), fz0 + m(0.2), fx1 + m(0.1), m(1.15), fz1 - m(0.2), material("stone-dark"));
    solid.face([[fx0 - m(0.2), m(1.8), fz1], [fx1 + m(0.2), m(1.8), fz1], [fx1 - m(0.9), m(STOREY), fz0 + m(0.4)], [fx0 + m(0.9), m(STOREY), fz0 + m(0.4)]], material("stone-dark", WALL));
    solid.box(fx0 - m(0.2), m(1.65), fz1 - m(0.15), fx1 + m(0.2), m(1.8), fz1 + m(0.05), material("timber", WALL));

    for (const side of [fx0 - m(0.1), fx1 - m(0.1)]) {
        solid.box(side, m(1.15), fz0, side + m(0.2), m(1.8), fz0 + m(0.4), material("stone-dark", WALL));
    }

    // Tongs and pokers hanging from the hood's beam
    for (let k = 0; k < 4; k++) {
        const x = fx0 + m(0.5 + k * 0.4);

        solid.box(x - 0.15, m(1.05), fz1 - 0.1, x + 0.15, m(1.65), fz1 + 0.2, material("iron"));
    }

    const fires = [flame(m(1.4), m(0.5), 2.3, "forge"), flame(m(1), m(0.4), 5.9, "forge")];

    fires[0].position.set(fx, m(0.9), (fz0 + fz1) / 2 - m(0.2));
    fires[1].position.set(fx + m(0.5), m(0.9), (fz0 + fz1) / 2);

    // The bellows beside it: two boards and the leather between, on a frame, the lever over them
    const bellows = at("bellows");
    const [bx, bz] = [m(bellows.x + 0.5), m(bellows.y + 0.5)];

    solid.box(bx - m(0.35), 0, bz - m(0.4), bx + m(0.35), m(0.35), bz + m(0.4), material("timber"));
    solid.box(bx - m(0.3), m(0.35), bz - m(0.35), bx + m(0.3), m(0.42), bz + m(0.35), material("planks-dark"));
    solid.box(bx - m(0.28), m(0.42), bz - m(0.33), bx + m(0.28), m(0.62), bz + m(0.3), material("leather"));
    solid.box(bx - m(0.3), m(0.62), bz - m(0.35), bx + m(0.3), m(0.68), bz + m(0.35), material("planks-dark"));
    solid.box(bx - 0.25, m(0.1), bz - m(0.4), bx + 0.25, m(1.3), bz - m(0.3), material("timber"));
    solid.box(bx - 0.2, m(1.2), bz - m(0.35), bx + 0.2, m(1.28), bz + m(0.55), material("timber"));
    solid.box(bx + m(0.3), m(0.45), bz - m(0.08), fx0, m(0.55), bz + m(0.08), material("iron"));

    // The anvil on its stump
    const anvil = at("anvil");
    const [ax, az] = [m(anvil.x + 0.5), m(anvil.y + 0.5)];

    solid.cylinder(ax, az, 0, m(0.5), m(0.3), m(0.32), material("planks-dark"), { segments: 10 });
    solid.box(ax - m(0.12), m(0.5), az - m(0.1), ax + m(0.12), m(0.62), az + m(0.1), material("iron"));
    solid.box(ax - m(0.35), m(0.62), az - m(0.12), ax + m(0.3), m(0.8), az + m(0.12), material("iron"));
    solid.box(ax + m(0.3), m(0.68), az - m(0.07), ax + m(0.5), m(0.78), az + m(0.07), material("iron"));
    solid.box(ax - m(0.1), m(0.8), az - m(0.03), ax + m(0.15), m(0.83), az + m(0.03), material("embers"));

    // The quenching trough: a long box of planks, full of dark water
    const trough = at("trough");
    const [tx0, tx1, tz0, tz1] = [m(trough.x + 0.15), m(trough.x + trough.w - 0.15), m(trough.y + 0.1), m(trough.y + trough.h - 0.1)];

    const plank = 0.45;

    solid.box(tx0, 0, tz0, tx1, m(0.12), tz1, material("planks"));
    solid.box(tx0, 0, tz0, tx0 + plank, m(0.65), tz1, material("planks"));
    solid.box(tx1 - plank, 0, tz0, tx1, m(0.65), tz1, material("planks"));
    solid.box(tx0 + plank, 0, tz0, tx1 - plank, m(0.65), tz0 + plank, material("planks"));
    solid.box(tx0 + plank, 0, tz1 - plank, tx1 - plank, m(0.65), tz1, material("planks"));
    solid.box(tx0 + plank, m(0.12), tz0 + plank, tx1 - plank, m(0.55), tz1 - plank, material("water"));

    for (const z of [tz0 + m(0.3), tz1 - m(0.3)]) {
        solid.box(tx0 - 0.1, m(0.2), z - 0.25, tx1 + 0.1, m(0.28), z + 0.25, material("iron"));
    }

    // The grindstone: a stone wheel in a wooden frame, a crank and a treadle
    const stone = at("grindstone");
    const [gx, gz] = [m(stone.x + 0.5), m(stone.y + 0.5)];

    for (const side of [-1, 1]) {
        solid.box(gx + side * m(0.2) - 0.3, 0, gz - m(0.35), gx + side * m(0.2) + 0.3, m(0.75), gz - m(0.25), material("timber"));
        solid.box(gx + side * m(0.2) - 0.3, 0, gz + m(0.25), gx + side * m(0.2) + 0.3, m(0.75), gz + m(0.35), material("timber"));
    }

    const wheel = new THREE.Group();

    wheel.position.set(gx, m(0.72), gz);
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(m(0.32), m(0.32), m(0.12), 18).rotateZ(Math.PI / 2), material("stone")));
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, m(0.55), 6).rotateZ(Math.PI / 2), material("iron")));
    moving.push({ object: wheel, turn: 5, axis: "x", name: "grindstone" });

    // The coals, heaped in the corner, and sacks of them
    const coal = at("coal");

    solid.pyramid(m(coal.x), m(coal.y), m(coal.x + coal.w), m(coal.y + coal.h), 0, m(0.7), material("shadow"));
    solid.box(m(coal.x + coal.w - 0.8), 0, m(coal.y + coal.h + 0.1), m(coal.x + coal.w - 0.1), m(0.6), m(coal.y + coal.h + 0.6), material("canvas-sack"));

    // Racks: tools hung on a board along the north wall; finished work (swords, axes, shields)
    // along the east
    for (const rack of map.pieces.filter((piece) => piece.kind === "rack")) {
        const [rx0, rx1, rz0, rz1] = [m(rack.x), m(rack.x + rack.w), m(rack.y), m(rack.y + rack.h)];

        if (rack.w > rack.h) {
            solid.box(rx0 + 0.3, m(1.2), rz0, rx1 - 0.3, m(2), rz0 + 0.4, material("planks", WALL));
            solid.box(rx0 + 0.3, 0, rz0 + 0.5, rx1 - 0.3, m(0.8), rz1 - m(0.35), material("planks-dark"));

            for (let x = rx0 + m(0.4); x < rx1 - m(0.2); x += m(0.45)) {
                const long = (Math.round(x) % 3) * 0.6;

                solid.box(x - 0.12, m(1.25) - long, rz0 + 0.4, x + 0.12, m(1.85), rz0 + 0.65, material("iron", WALL));
                solid.box(x - 0.35, m(1.25) - long - 0.35, rz0 + 0.35, x + 0.35, m(1.25) - long, rz0 + 0.7, material("iron", WALL));
            }
        } else {
            solid.box(rx1 - m(0.35), m(0.2), rz0 + 0.3, rx1 - m(0.25), m(0.3), rz1 - 0.3, material("timber"));
            solid.box(rx1 - m(0.35), m(1.1), rz0 + 0.3, rx1 - m(0.25), m(1.2), rz1 - 0.3, material("timber"));

            for (let z = rz0 + m(0.3); z < rz1 - m(0.2); z += m(0.3)) {
                solid.box(rx1 - m(0.3) - 0.1, m(0.2), z - 0.2, rx1 - m(0.3) + 0.1, m(1.25), z + 0.2, material("iron"));
                solid.box(rx1 - m(0.3) - 0.25, m(0.85), z - 0.7, rx1 - m(0.3) + 0.25, m(0.9), z + 0.7, material("brass"));
            }

            solid.cylinder(rx1 - 0.3, (rz0 + rz1) / 2, m(1.4), m(1.45), m(0.35), m(0.35), material("paint-red", WALL), { segments: 14 });
        }
    }

    // The workbench along the west wall: a vice, a hammer and files on it
    const bench = at("workbench");
    const [wx0, wx1, wz0, wz1] = [m(bench.x + 0.05), m(bench.x + bench.w - 0.1), m(bench.y + 0.1), m(bench.y + bench.h - 0.1)];

    table(solid, wx0, wz0, wx1, wz1);
    solid.box(wx1 - m(0.25), m(0.78), wz0 + m(0.6), wx1 - m(0.05), m(0.98), wz0 + m(0.8), material("iron"));
    solid.box(wx0 + m(0.2), m(0.78), wz0 + m(1.4), wx0 + m(0.4), m(0.82), wz0 + m(1.8), material("iron"));
    candle(solid, (wx0 + wx1) / 2, wz1 - m(0.4), m(0.78));

    // A lantern hanging in the middle
    solid.add(objectSolid(lantern(m(map.width / 2), m(map.height * 0.6), m(2.2))));

    return {
        solid,
        moving,
        flames: fires,
        lights: [{ kind: "fire", x: forge.x + forge.w / 2, y: 1.2, z: forge.y + forge.h, colour: 0xff7a2a, intensity: 10, distance: 14, flicker: 0.3, ...fires[0].userData.fire }],
        hearth: { x: forge.x + forge.w / 2, y: 0.95, z: forge.y + forge.h / 2 },
    };
}

// --- The temple ---

// A figure robed to the ground, in `colour`, on a plinth: a statue of one of the Six, `tall` art
// pixels, arms out in blessing, their symbol's colour in a disc over their head
function statue(solid, x, z, tall, robe, halo) {
    const group = new THREE.Group();
    const stone = material(robe);

    group.add(new THREE.Mesh(new THREE.CylinderGeometry(tall * 0.13, tall * 0.22, tall * 0.72, 12).translate(x, tall * 0.36, z), stone));
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(tall * 0.07, tall * 0.13, tall * 0.14, 12).translate(x, tall * 0.79, z), stone));
    group.add(new THREE.Mesh(new THREE.SphereGeometry(tall * 0.075, 12, 10).translate(x, tall * 0.92, z), stone));

    for (const side of [-1, 1]) {
        group.add(new THREE.Mesh(new THREE.CylinderGeometry(tall * 0.035, tall * 0.05, tall * 0.34, 8).rotateZ(side * 1.05).translate(x + side * tall * 0.17, tall * 0.7, z + tall * 0.03), stone));
    }

    group.add(new THREE.Mesh(new THREE.TorusGeometry(tall * 0.1, tall * 0.012, 6, 20).translate(x, tall * 0.96, z - tall * 0.04), material(halo)));
    solid.add(objectSolid(group));
}

// A pew: a bench with a back, `x0` to `x1` along its row, its seat at `z0` to `z1`, facing north
function pew(solid, x0, z0, x1, z1) {
    const wood = material("planks-dark");

    solid.box(x0, m(0.42), z0 + m(0.1), x1, m(0.48), z1 - m(0.1), wood);
    solid.box(x0, m(0.48), z1 - m(0.16), x1, m(0.95), z1 - m(0.08), wood);
    solid.box(x0 - 0.1, m(0.9), z1 - m(0.2), x1 + 0.1, m(0.98), z1 - m(0.02), material("timber"));

    for (const x of [x0 + 0.3, x1 - 1.2]) {
        solid.box(x, 0, z0 + m(0.1), x + 0.9, m(0.98), z1 - m(0.02), material("timber"));
    }
}

function temple(map) {
    const solid = new Solid();
    const [w, h] = [m(map.width), m(map.height)];
    const patron = GODS[map.patron] ?? GODS.aurelia;
    const others = shrinesOf(map.patron);
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);

    // Pale flagstones, whitewashed walls, a red runner up the aisle to the altar's dais
    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("stone-warm"));

    const doors = map.marks.D;
    const doorMiddle = (doors[0][0] + doors.at(-1)[0] + 1) / 2;

    // Windows down both sides, one for each of the Six
    const panes = GOD_IDS.map((id, k) => ({ side: k % 2 ? "e" : "w", at: 3 + k * 2.4 })).filter(({ at }) => at < map.height - 2);

    walledIn(solid, map, "plaster-white", [{ side: "s", from: doorMiddle - 0.8, to: doorMiddle + 0.8, lintel: 2.6 }], panes);
    solid.box(m(doorMiddle - 0.8), 0, h - 0.2, m(doorMiddle + 0.8), m(2.6), h + 0.4, material("planks-dark", WALL));
    solid.box(m(doorMiddle - 0.5), m(0.02), m(3.4), m(doorMiddle + 0.5), m(0.04), h - m(0.6), material("rug"));
    ceiling(solid, map);

    // Pillars along the walls between the windows
    for (let z = m(2); z < h - m(1.5); z += m(2.4)) {
        for (const x of [m(0.25), w - m(0.25)]) {
            solid.cylinder(x, z, 0, m(STOREY), m(0.22), m(0.22), material("stone-warm", WALL), { segments: 10 });
        }
    }

    // The dais: two broad steps up to the altar, a white cloth over it with a gold border, candles,
    // a book; the patron's statue behind it, and their colours hanging either side
    const [altar] = at("altar");
    const [ax0, ax1, az0, az1] = [m(altar.x), m(altar.x + altar.w), m(altar.y), m(altar.y + altar.h)];

    solid.box(ax0 - m(1.5), 0, 0, ax1 + m(1.5), m(0.15), az1 + m(1), material("stone"));
    solid.box(ax0 - m(1), m(0.15), 0, ax1 + m(1), m(0.3), az1 + m(0.4), material("stone"));
    solid.box(ax0 + 0.3, m(0.3), az0 + 0.3, ax1 - 0.3, m(1.1), az1 - 0.3, material("stone-warm"));
    solid.box(ax0, m(1.1), az0, ax1, m(1.14), az1, material("linen"));
    solid.box(ax0, m(0.8), az1 - 0.05, ax1, m(1.14), az1 + 0.1, material("linen"));
    solid.box(ax0, m(0.78), az1 - 0.05, ax1, m(0.84), az1 + 0.12, material("brass"));

    for (const x of [ax0 + m(0.35), ax1 - m(0.35)]) {
        solid.cylinder(x, (az0 + az1) / 2, m(1.14), m(1.2), m(0.08), m(0.06), material("brass"), { segments: 8 });
        candle(solid, x, (az0 + az1) / 2, m(1.2));
    }

    solid.box((ax0 + ax1) / 2 - m(0.25), m(1.14), az0 + m(0.3), (ax0 + ax1) / 2 + m(0.25), m(1.2), az0 + m(0.65), material("ledger"));

    const [plinth] = at("statue");
    const [px, pz] = [m(plinth.x + plinth.w / 2), m(plinth.y + plinth.h / 2)];

    solid.box(px - m(0.6), m(0.3), pz - m(0.45), px + m(0.6), m(0.9), pz + m(0.45), material("stone-warm"));
    statue(solid, px, pz, m(2.2), "plaster-white", `god-${map.patron}`);

    for (const side of [-1, 1]) {
        const x = px + side * m(1.8);

        solid.box(x - m(0.4), m(0.6), 0.3, x + m(0.4), m(2.8), 0.5, material(`god-${map.patron}`, WALL));
        solid.box(x - m(0.45), m(2.8), 0.2, x + m(0.45), m(2.9), 0.7, material("brass", WALL));
    }

    // The shrines: a niche of the god's colour on the wall, a small statue of them in white on a
    // ledge, candles before it
    at("shrine").forEach((shrine, k) => {
        const id = others[k];
        const west = shrine.x === 0;
        const [x, z] = [m(shrine.x + 0.5), m(shrine.y + 0.5)];
        const wall = west ? 0 : w;
        const out = west ? 1 : -1;

        solid.box(Math.min(wall, wall + out * m(0.12)), m(0.6), z - m(0.55), Math.max(wall, wall + out * m(0.12)), m(2.4), z + m(0.55), material(`god-${id}`, WALL));
        solid.box(Math.min(x - out * m(0.5), x + out * m(0.3)), 0, z - m(0.45), Math.max(x - out * m(0.5), x + out * m(0.3)), m(0.9), z + m(0.45), material("stone-warm"));
        statue(solid, x - out * m(0.2), z, m(1.1), "plaster-white", `god-${id}`);

        for (const dz of [-0.28, 0, 0.28]) {
            candle(solid, x + out * m(0.2), z + m(dz), m(0.9));
        }
    });

    // The stand of votive candles: tiers of iron, rows of little lights
    for (const stand of at("votive")) {
        const [x, z] = [m(stand.x + 0.5), m(stand.y + 0.5)];

        for (const [tier, y] of [[0.4, 0.7], [0.28, 0.85], [0.16, 1]]) {
            solid.box(x - m(tier), m(y) - 0.3, z - m(0.35), x + m(tier), m(y), z + m(0.35), material("iron"));

            for (let dx = -tier + 0.08; dx <= tier - 0.08; dx += 0.12) {
                candle(solid, x + m(dx), z, m(y));
            }
        }

        solid.box(x - 0.3, 0, z - 0.3, x + 0.3, m(0.7), z + 0.3, material("iron"));
    }

    // Basins of water by the door: stone bowls on pedestals
    for (const basin of at("basin")) {
        const [x, z] = [m(basin.x + 0.5), m(basin.y + 0.5)];

        solid.cylinder(x, z, 0, m(0.75), m(0.12), m(0.16), material("stone-warm"), { segments: 10 });
        solid.cylinder(x, z, m(0.75), m(0.95), m(0.34), m(0.26), material("stone-warm"), { segments: 14 });
        solid.cylinder(x, z, m(0.9), m(0.92), m(0.3), m(0.3), material("water"), { segments: 14 });
    }

    // The pews, facing the altar
    for (const run of benchRuns(map, "p")) {
        pew(solid, m(run.x), m(run.y), m(run.x + run.w), m(run.y + 1));
    }

    // A great ring of candles hanging over the nave
    const [cx, cz] = [w / 2, h * 0.45];

    solid.add(objectSolid(candleWheel(cx, cz, m(2.4), m(1.1), 10)));

    return { solid, moving: [], flames: [], lights: [], hearth: null, patron };
}

// --- The adventurers' guild ---

function guild(map) {
    const solid = new Solid();
    const moving = [];
    const [w, h] = [m(map.width), m(map.height)];
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);

    // Floorboards, timber-framed plaster walls, the door in the middle of the south wall
    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("planks"));

    const doors = map.marks.D;
    const doorMiddle = (doors[0][0] + doors.at(-1)[0] + 1) / 2;

    walledIn(solid, map, "plaster-ochre", [{ side: "s", from: doorMiddle - 1.1, to: doorMiddle + 1.1, lintel: 2.6 }], [{ side: "s", at: 4.5 }, { side: "s", at: 14.5 }, { side: "e", at: 3 }, { side: "e", at: 12 }]);
    solid.box(m(doorMiddle - 1.1), 0, h - 0.2, m(doorMiddle + 1.1), m(2.6), h + 0.4, material("planks-dark", WALL));
    ceiling(solid, map);

    // The guild's banners, blue with a gold shield, either side of the counter and by the door
    const banner = (x, z, face) => {
        const across = face === "z" ? [m(0.45), 0.2] : [0.2, m(0.45)];

        solid.box(x - across[0], m(1.1), z - across[1], x + across[0], m(2.8), z + across[1], material("guild-blue", WALL));
        solid.box(x - across[0] * 0.5, m(1.7), z - across[1] * 0.5 - (face === "z" ? 0.1 : 0), x + across[0] * 0.5, m(2.3), z + across[1] * 0.5 + (face === "z" ? 0.1 : 0), material("guild-gold", WALL));
        solid.box(x - across[0] - 0.2, m(2.8), z - across[1] - 0.2, x + across[0] + 0.2, m(2.9), z + across[1] + 0.2, material("brass", WALL));
    };

    banner(m(9.5), 0.3, "z");
    banner(m(13), 0.3, "z");
    banner(0.3, m(11), "x");

    // Shelves along the north wall behind the counter: ledgers, scrolls in their pigeonholes, a
    // strongbox
    for (const shelf of at("shelves")) {
        const [x0, x1] = [m(shelf.x), m(shelf.x + shelf.w)];
        const z = m(shelf.y);

        solid.box(x0, 0, z, x1, m(2.2), z + m(0.1), material("planks-dark", WALL));

        for (const y of [0.35, 0.8, 1.25, 1.7]) {
            solid.box(x0, m(y), z, x1, m(y + 0.05), z + m(0.45), material("planks", WALL));

            for (let x = x0 + m(0.2); x < x1 - m(0.2); x += m(0.3)) {
                const pick = Math.round(x * 7 + y * 13) % 4;

                if (pick === 0) {
                    solid.cylinder(x, z + m(0.25), m(y + 0.05), m(y + 0.3), m(0.07), m(0.07), material("parchment", WALL), { segments: 8 });
                } else if (pick < 3) {
                    solid.box(x - m(0.08), m(y + 0.05), z + m(0.1), x + m(0.08), m(y + 0.38), z + m(0.4), material(pick === 1 ? "ledger" : "guild-blue", WALL));
                }
            }
        }
    }

    // The counter: dark wood with the guild's crest on its front, a blue runner along its top, a
    // bell, a ledger, a stamp and its pad, a stack of notices, a quill in its pot
    for (const counter of at("counter")) {
        const [x0, x1, z0, z1] = [m(counter.x), m(counter.x + counter.w), m(counter.y + 0.1), m(counter.y + 0.9)];

        solid.box(x0, 0, z0, x1, m(1.05), z1, material("planks-dark"));
        solid.box(x0 - 0.4, m(1.05), z0 - 0.4, x1 + 0.4, m(1.12), z1 + 0.4, material("timber-light"));
        solid.box(x0 + m(0.3), m(1.12), z0 + 0.5, x1 - m(0.3), m(1.14), z1 - 0.5, material("guild-blue"));
        solid.box((x0 + x1) / 2 - m(0.4), m(0.35), z1, (x0 + x1) / 2 + m(0.4), m(0.9), z1 + 0.15, material("guild-blue"));
        solid.box((x0 + x1) / 2 - m(0.2), m(0.45), z1 + 0.1, (x0 + x1) / 2 + m(0.2), m(0.8), z1 + 0.2, material("guild-gold"));
        solid.cylinder(x0 + m(0.6), (z0 + z1) / 2, m(1.14), m(1.22), m(0.06), 0.1, material("brass"), { segments: 10 });
        solid.box(x0 + m(1.4), m(1.14), z0 + m(0.15), x0 + m(1.9), m(1.2), z0 + m(0.5), material("ledger"));
        solid.box(x0 + m(2.5), m(1.14), z0 + m(0.2), x0 + m(2.8), m(1.16), z0 + m(0.5), material("rug-border"));
        solid.cylinder(x0 + m(2.65), z0 + m(0.35), m(1.16), m(1.28), m(0.03), m(0.04), material("timber"), { segments: 6 });

        for (let k = 0; k < 6; k++) {
            solid.box(x1 - m(1.6) + k * 0.1, m(1.14) + k * 0.12, z0 + m(0.15) + (k % 2) * 0.2, x1 - m(1.1) + k * 0.1, m(1.14) + (k + 1) * 0.12, z0 + m(0.55) + (k % 2) * 0.2, material("parchment"));
        }

        solid.cylinder(x1 - m(0.5), z0 + m(0.35), m(1.14), m(1.26), m(0.04), m(0.04), material("pewter"), { segments: 8 });
        solid.box(x1 - m(0.5) - 0.05, m(1.2), z0 + m(0.35) - 0.05, x1 - m(0.5) + 0.05, m(1.45), z0 + m(0.35) + 0.05, material("linen"));
    }

    // The quest board along the west wall: a framed board thick with notices, each pinned or
    // sealed in red wax, some curling
    for (const board of at("board")) {
        const [z0, z1] = [m(board.y), m(board.y + board.h)];

        solid.box(0, m(0.8), z0 + m(0.1), m(0.12), m(2.4), z1 - m(0.1), material("planks-dark", WALL));
        solid.box(0, m(0.75), z0, m(0.18), m(0.85), z1, material("timber", WALL));
        solid.box(0, m(2.35), z0, m(0.18), m(2.45), z1, material("timber", WALL));

        for (let k = 0; k < 18; k++) {
            const z = z0 + m(0.35) + ((k * 7) % 18) * ((z1 - z0 - m(0.7)) / 18);
            const y = m(1.0 + ((k * 5) % 6) * 0.22);
            const [tall, wide] = [m(0.24 + (k % 3) * 0.05), m(0.18 + (k % 2) * 0.06)];

            solid.box(m(0.12), y, z - wide / 2, m(0.15), y + tall, z + wide / 2, material("parchment", WALL));

            if (k % 3 === 0) {
                solid.box(m(0.15), y + tall - m(0.07), z - 0.2, m(0.17), y + tall - m(0.03), z + 0.2, material("wax-red", WALL));
            }
        }
    }

    // Tables, and benches along them, with tankards, a map, dice and candles
    for (const piece of at("table")) {
        const [x0, z0, x1, z1] = [m(piece.x), m(piece.y), m(piece.x + piece.w), m(piece.y + piece.h)];

        table(solid, x0, z0 + m(0.1), x1, z1 - m(0.1));
        candle(solid, (x0 + x1) / 2, (z0 + z1) / 2, m(0.78));
        tankard(solid, x0 + m(0.4), z0 + m(0.35), m(0.78), piece.x % 2 === 0);
        tankard(solid, x1 - m(0.5), z1 - m(0.3), m(0.78));
        solid.box(x0 + m(0.9), m(0.78), z0 + m(0.25), x0 + m(1.5), m(0.79), z1 - m(0.25), material("parchment"));

        for (const dx of [0, 0.12]) {
            solid.box(x1 - m(0.9 + dx), m(0.78), z0 + m(0.3), x1 - m(0.86 + dx), m(0.82), z0 + m(0.34), material("bone"));
        }
    }

    for (const run of benchRuns(map)) {
        bench(solid, m(run.x), m(run.y), m(run.x + run.w), m(run.y + 1));
    }

    // The hearth on the east wall, a fire in it, and over it a great horned skull
    const [hearth] = at("hearth");
    const [hz0, hz1] = [m(hearth.y), m(hearth.y + hearth.h)];
    const hz = (hz0 + hz1) / 2;

    solid.box(w - m(0.9), 0, hz0, w + m(0.1), m(STOREY), hz0 + m(0.8), material("stone", WALL));
    solid.box(w - m(0.9), 0, hz1 - m(0.8), w + m(0.1), m(STOREY), hz1, material("stone", WALL));
    solid.box(w - m(0.9), m(1.5), hz0, w + m(0.1), m(STOREY), hz1, material("stone", WALL));
    solid.box(w - m(0.15), 0, hz0, w + m(0.1), m(1.5), hz1, material("soot", WALL));
    solid.box(w - m(1.05), m(1.45), hz0 - m(0.1), w, m(1.65), hz1 + m(0.1), material("timber", WALL));
    solid.box(w - m(1.8), 0, hz0 - m(0.2), w, m(0.06), hz1 + m(0.2), material("stone-dark"));
    solid.box(w - m(0.8), m(0.05), hz - m(0.4), w - m(0.2), m(0.2), hz + m(0.4), material("embers"));

    const fire = flame(m(0.9), m(0.7), 4.2);

    fire.position.set(w - m(0.5), m(0.12), hz);

    const skull = new THREE.Group();
    const bone = material("bone", WALL);

    skull.add(new THREE.Mesh(new THREE.SphereGeometry(m(0.28), 10, 8).scale(1, 0.8, 1.3).translate(w - m(0.3), m(2.25), hz), bone));
    skull.add(new THREE.Mesh(new THREE.ConeGeometry(m(0.12), m(0.45), 8).rotateZ(Math.PI / 2).translate(w - m(0.6), m(2.2), hz), bone));

    for (const side of [-1, 1]) {
        skull.add(new THREE.Mesh(new THREE.ConeGeometry(m(0.07), m(0.7), 8).rotateX(side * 1.1).translate(w - m(0.3), m(2.55), hz + side * m(0.45)), bone));
    }

    solid.add(objectSolid(skull));

    // Barrels either side of the door
    for (const barrel of at("barrels")) {
        const [x, z] = [m(barrel.x + barrel.w / 2), m(barrel.y + 0.5)];

        solid.cylinder(x, z, 0, m(0.9), m(0.38), m(0.38), material("planks"), { segments: 12 });
        solid.cylinder(x, z, m(0.15), m(0.2), m(0.4), m(0.4), material("iron"), { segments: 12 });
        solid.cylinder(x, z, m(0.7), m(0.75), m(0.4), m(0.4), material("iron"), { segments: 12 });
    }

    // A ring of candles hanging over the tables
    solid.add(objectSolid(candleWheel(m(10.5), m(8), m(2.45), m(0.8), 8)));

    return {
        solid,
        moving,
        flames: [fire],
        lights: [
            { kind: "fire", x: map.width - 0.6, y: 1, z: hearth.y + hearth.h / 2, colour: 0xff8a3a, intensity: 7, distance: 14, flicker: 0.22, ...fire.userData.fire },
        ],
        hearth: { x: map.width - 0.5, y: 0.6, z: hearth.y + hearth.h / 2 },
    };
}

// A hearth set into a side wall (a piece along x = 0, the west wall, or the east), a fire in it:
// its stone cheeks and breast, the sooty back, the mantel and the hearthstone
function sideHearth(solid, map, hearth) {
    const w = m(map.width);
    const [z0, z1] = [m(hearth.y), m(hearth.y + hearth.h)];
    const z = (z0 + z1) / 2;
    const west = hearth.x === 0;
    const [wall, into] = west ? [0, 1] : [w, -1];
    const span = (a, b) => [Math.min(wall + into * a, wall + into * b), Math.max(wall + into * a, wall + into * b)];
    const [c0, c1] = span(-m(0.1), m(0.9));

    solid.box(c0, 0, z0, c1, m(STOREY), z0 + m(0.8), material("stone", WALL));
    solid.box(c0, 0, z1 - m(0.8), c1, m(STOREY), z1, material("stone", WALL));
    solid.box(c0, m(1.5), z0, c1, m(STOREY), z1, material("stone", WALL));
    solid.box(...(([a, b]) => [a, 0, z0, b, m(1.5), z1])(span(-m(0.1), m(0.15))), material("soot", WALL));
    solid.box(...(([a, b]) => [a, m(1.45), z0 - m(0.1), b, m(1.65), z1 + m(0.1)])(span(0, m(1.05))), material("timber", WALL));
    solid.box(...(([a, b]) => [a, 0, z0 - m(0.2), b, m(0.06), z1 + m(0.2)])(span(0, m(1.8))), material("stone-dark"));
    solid.box(...(([a, b]) => [a, m(0.05), z - m(0.4), b, m(0.2), z + m(0.4)])(span(m(0.2), m(0.8))), material("embers"));

    const fire = flame(m(0.9), m(0.7), 4.2 + hearth.y);

    fire.position.set(wall + into * m(0.5), m(0.12), z);

    return { fire, light: { kind: "fire", x: west ? 0.6 : map.width - 0.6, y: 1, z: hearth.y + hearth.h / 2, colour: 0xff8a3a, intensity: 7, distance: 14, flicker: 0.22, ...fire.userData.fire }, at: { x: west ? 0.5 : map.width - 0.5, y: 0.6, z: hearth.y + hearth.h / 2 } };
}

// Shelves against the north wall (a piece), laden with rolls, ledgers and boxes
function rollShelves(solid, shelf, bound = "ledger") {
    const [x0, x1] = [m(shelf.x), m(shelf.x + shelf.w)];
    const z = m(shelf.y);

    solid.box(x0, 0, z, x1, m(2.2), z + m(0.1), material("planks-dark", WALL));

    for (const y of [0.35, 0.8, 1.25, 1.7]) {
        solid.box(x0, m(y), z, x1, m(y + 0.05), z + m(0.45), material("planks", WALL));

        for (let x = x0 + m(0.2); x < x1 - m(0.2); x += m(0.3)) {
            const pick = Math.round(x * 7 + y * 13) % 4;

            if (pick === 0) {
                solid.cylinder(x, z + m(0.25), m(y + 0.05), m(y + 0.3), m(0.07), m(0.07), material("parchment", WALL), { segments: 8 });
            } else if (pick < 3) {
                solid.box(x - m(0.08), m(y + 0.05), z + m(0.1), x + m(0.08), m(y + 0.38), z + m(0.4), material(pick === 1 ? "ledger" : bound, WALL));
            }
        }
    }
}

// A desk (a counter piece): dark wood, a cloth over its top, a ledger, a stamp and its pad, papers,
// an inkpot and quill, and a bell
function desk(solid, counter, cloth) {
    const [x0, x1, z0, z1] = [m(counter.x), m(counter.x + counter.w), m(counter.y + 0.1), m(counter.y + 0.9)];

    solid.box(x0, 0, z0, x1, m(1), z1, material("planks-dark"));
    solid.box(x0 - 0.4, m(1), z0 - 0.4, x1 + 0.4, m(1.07), z1 + 0.4, material("timber-light"));
    solid.box(x0 + m(0.2), m(1.07), z0 + 0.4, x1 - m(0.2), m(1.09), z1 - 0.4, material(cloth));
    solid.box(x0 + m(0.6), m(1.09), z0 + m(0.15), x0 + m(1.1), m(1.15), z0 + m(0.5), material("ledger"));
    solid.box(x0 + m(1.5), m(1.09), z0 + m(0.2), x0 + m(1.8), m(1.11), z0 + m(0.5), material("rug-border"));
    solid.cylinder(x0 + m(1.65), z0 + m(0.35), m(1.11), m(1.23), m(0.03), m(0.04), material("timber"), { segments: 6 });

    for (let k = 0; k < 4; k++) {
        solid.box(x1 - m(1.5) + k * 0.1, m(1.09) + k * 0.12, z0 + m(0.15) + (k % 2) * 0.2, x1 - m(1) + k * 0.1, m(1.09) + (k + 1) * 0.12, z0 + m(0.55) + (k % 2) * 0.2, material("parchment"));
    }

    solid.cylinder(x1 - m(0.5), z0 + m(0.35), m(1.09), m(1.19), m(0.04), m(0.04), material("pewter"), { segments: 8 });
    solid.box(x1 - m(0.5) - 0.05, m(1.15), z0 + m(0.35) - 0.05, x1 - m(0.5) + 0.05, m(1.4), z0 + m(0.35) + 0.05, material("linen"));
    solid.cylinder(x0 + m(0.25), (z0 + z1) / 2, m(1.09), m(1.17), m(0.06), 0.1, material("brass"), { segments: 10 });
}

// A board of notices on the west wall (a piece along x = 0)
function noticeBoard(solid, board, count = 12) {
    const [z0, z1] = [m(board.y), m(board.y + board.h)];

    solid.box(0, m(0.8), z0 + m(0.1), m(0.12), m(2.2), z1 - m(0.1), material("planks-dark", WALL));
    solid.box(0, m(0.75), z0, m(0.18), m(0.85), z1, material("timber", WALL));
    solid.box(0, m(2.15), z0, m(0.18), m(2.25), z1, material("timber", WALL));

    for (let k = 0; k < count; k++) {
        const z = z0 + m(0.35) + ((k * 7) % count) * ((z1 - z0 - m(0.7)) / count);
        const y = m(1.0 + ((k * 5) % 5) * 0.22);
        const [tall, wide] = [m(0.24 + (k % 3) * 0.05), m(0.18 + (k % 2) * 0.06)];

        solid.box(m(0.12), y, z - wide / 2, m(0.15), y + tall, z + wide / 2, material("parchment", WALL));

        if (k % 2 === 0) {
            solid.box(m(0.15), y + tall - m(0.07), z - 0.2, m(0.17), y + tall - m(0.03), z + 0.2, material("wax-red", WALL));
        }
    }
}

// A banner hanging on a wall: `face` "z" (on the north wall, at z) or "x" (on a side wall)
function wallBanner(solid, x, z, face, cloth, trim, { low = 1.1, high = 2.8 } = {}) {
    const across = face === "z" ? [m(0.45), 0.2] : [0.2, m(0.45)];

    solid.box(x - across[0], m(low), z - across[1], x + across[0], m(high), z + across[1], material(cloth, WALL));
    solid.box(x - across[0] * 0.5, m(low + (high - low) * 0.35), z - across[1] * 0.5 - (face === "z" ? 0.1 : 0), x + across[0] * 0.5, m(low + (high - low) * 0.7), z + across[1] * 0.5 + (face === "z" ? 0.1 : 0), material(trim, WALL));
    solid.box(x - across[0] - 0.2, m(high), z - across[1] - 0.2, x + across[0] + 0.2, m(high + 0.1), z + across[1] + 0.2, material("brass", WALL));
}

// A town hall's chamber: plaster and timber, the rolls on their shelves and the reeve's desk
// before them, the council table and its benches, notices on the west wall, a hearth on the east,
// strongboxes, benches by the door, and the town's red banners with their gold keys
function hall(map) {
    const solid = new Solid();
    const [w, h] = [m(map.width), m(map.height)];
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);

    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("planks"));

    const doors = map.marks.D;
    const doorMiddle = (doors[0][0] + doors.at(-1)[0] + 1) / 2;

    walledIn(solid, map, "plaster-white", [{ side: "s", from: doorMiddle - 1, to: doorMiddle + 1, lintel: 2.5 }], [{ side: "s", at: 3.5 }, { side: "s", at: 14.5 }, { side: "w", at: 3 }, { side: "w", at: 10 }]);
    solid.box(m(doorMiddle - 1), 0, h - 0.2, m(doorMiddle + 1), m(2.5), h + 0.4, material("planks-dark", WALL));
    ceiling(solid, map);

    wallBanner(solid, m(8.5), 0.3, "z", "velvet", "cloth-gold");
    wallBanner(solid, m(10.5), 0.3, "z", "velvet", "cloth-gold");

    for (const shelf of at("shelves")) {
        rollShelves(solid, shelf, "wool-green");
    }

    for (const counter of at("counter")) {
        desk(solid, counter, "wool-green");
    }

    for (const board of at("board")) {
        noticeBoard(solid, board);
    }

    // The council table: papers, inkpots and candles down it
    for (const piece of at("table")) {
        const [x0, z0, x1, z1] = [m(piece.x), m(piece.y), m(piece.x + piece.w), m(piece.y + piece.h)];

        table(solid, x0, z0 + m(0.1), x1, z1 - m(0.1));

        for (let x = x0 + m(1); x < x1 - m(0.5); x += m(2)) {
            candle(solid, x, (z0 + z1) / 2, m(0.78));
            solid.box(x + m(0.4), m(0.78), z0 + m(0.25), x + m(0.95), m(0.79), z1 - m(0.25), material("parchment"));
            solid.cylinder(x + m(1.2), z0 + m(0.4), m(0.78), m(0.86), m(0.04), m(0.04), material("pewter"), { segments: 8 });
        }
    }

    for (const run of benchRuns(map)) {
        bench(solid, m(run.x), m(run.y), m(run.x + run.w), m(run.y + 1));
    }

    for (const box of at("chest")) {
        chest(solid, m(box.x + 0.5), m(box.y + 0.5));
    }

    const [hearth] = at("hearth");
    const fire = sideHearth(solid, map, hearth);

    solid.add(objectSolid(candleWheel(m(8), m(6.5), m(2.45), m(0.8), 8)));

    return {
        solid,
        moving: [],
        flames: [fire.fire],
        lights: [fire.light],
        hearth: fire.at,
    };
}

// A keep's great hall: stone walls and flags, the red carpet from the door to the two thrones on
// their dais, pillars down the hall, the council's tables, a hearth in each side wall, the
// steward's desk and shelves, strongboxes, the armoury's racks of swords, spears and shields, and
// long banners on the walls; a great wheel of candles over the carpet
function keep(map) {
    const solid = new Solid();
    const [w, h] = [m(map.width), m(map.height)];
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);

    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("stone"));

    const doors = map.marks.D;
    const doorMiddle = (doors[0][0] + doors.at(-1)[0] + 1) / 2;

    walledIn(solid, map, "stone-warm", [{ side: "s", from: doorMiddle - 1.2, to: doorMiddle + 1.2, lintel: 2.8 }], [3, 11].flatMap((at) => [{ side: "w", at }, { side: "e", at }]));
    solid.box(m(doorMiddle - 1.2), 0, h - 0.2, m(doorMiddle + 1.2), m(2.8), h + 0.4, material("planks-dark", WALL));
    ceiling(solid, map);

    // The carpet, from the door to the dais
    for (const carpet of at("carpet")) {
        solid.box(m(carpet.x), 0, m(carpet.y), m(carpet.x + carpet.w), 0.12, m(carpet.y + carpet.h), material("velvet"));
        solid.box(m(carpet.x) + 1.5, 0.12, m(carpet.y), m(carpet.x + carpet.w) - 1.5, 0.16, m(carpet.y + carpet.h), material("rug"));
    }

    // The dais, and the thrones on it: high backs, velvet seats, gilt finials
    const thrones = at("throne");

    if (thrones.length) {
        const [x0, x1] = [m(Math.min(...thrones.map(({ x }) => x)) - 0.5), m(Math.max(...thrones.map(({ x }) => x)) + 1.5)];

        solid.box(x0, 0, 0, x1, m(0.2), m(1.4), material("stone-dark"));
        solid.box(x0 + m(0.2), m(0.2), 0, x1 - m(0.2), m(0.35), m(1.1), material("stone-dark"));

        for (const throne of thrones) {
            const [cx, cz] = [m(throne.x + 0.5), m(throne.y + 0.5)];

            solid.box(cx - m(0.36), m(0.35), cz - m(0.3), cx + m(0.36), m(0.8), cz + m(0.3), material("timber"));
            solid.box(cx - m(0.3), m(0.8), cz - m(0.25), cx + m(0.3), m(0.86), cz + m(0.28), material("velvet"));
            solid.box(cx - m(0.38), m(0.35), cz - m(0.42), cx + m(0.38), m(2.3), cz - m(0.3), material("timber"));
            solid.box(cx - m(0.28), m(0.95), cz - m(0.3), cx + m(0.28), m(2), cz - m(0.28), material("velvet"));

            for (const side of [-1, 1]) {
                solid.box(cx + side * m(0.38) - m(0.06), m(0.8), cz - m(0.3), cx + side * m(0.38) + m(0.06), m(1.15), cz + m(0.3), material("timber"));
                solid.cylinder(cx + side * m(0.36), cz - m(0.36), m(2.3), m(2.5), m(0.06), 0.1, material("gold"), { segments: 8 });
            }

            solid.cylinder(cx, cz - m(0.36), m(2.3), m(2.55), m(0.08), 0.1, material("gold"), { segments: 8 });
        }
    }

    // Pillars down the hall: plinths, round shafts and capitals up to the beams
    for (const pillar of at("pillar")) {
        const [cx, cz] = [m(pillar.x + 0.5), m(pillar.y + 0.5)];

        solid.box(cx - m(0.4), 0, cz - m(0.4), cx + m(0.4), m(0.3), cz + m(0.4), material("stone-dark"));
        solid.cylinder(cx, cz, m(0.3), m(STOREY) - m(0.3), m(0.28), m(0.28), material("stone"), { segments: 12 });
        solid.box(cx - m(0.4), m(STOREY) - m(0.3), cz - m(0.4), cx + m(0.4), m(STOREY), cz + m(0.4), material("stone-dark"));
    }

    // The council's tables: candles, papers, cups of wine
    for (const piece of at("table")) {
        const [x0, z0, x1, z1] = [m(piece.x), m(piece.y), m(piece.x + piece.w), m(piece.y + piece.h)];

        table(solid, x0, z0 + m(0.1), x1, z1 - m(0.1));
        candle(solid, (x0 + x1) / 2, (z0 + z1) / 2, m(0.78));
        solid.box(x0 + m(0.5), m(0.78), z0 + m(0.25), x0 + m(1.3), m(0.79), z1 - m(0.25), material("parchment"));
        solid.cylinder(x1 - m(0.6), z0 + m(0.35), m(0.78), m(0.92), m(0.04), m(0.03), material("gold"), { segments: 8 });
        solid.cylinder(x1 - m(1.2), z1 - m(0.35), m(0.78), m(0.92), m(0.04), m(0.03), material("gold"), { segments: 8 });
    }

    for (const run of benchRuns(map)) {
        bench(solid, m(run.x), m(run.y), m(run.x + run.w), m(run.y + 1));
    }

    for (const counter of at("counter")) {
        desk(solid, counter, "velvet-purple");
    }

    for (const shelf of at("shelves")) {
        rollShelves(solid, shelf, "velvet");
    }

    for (const box of at("chest")) {
        chest(solid, m(box.x + 0.5), m(box.y + 0.5));
    }

    // The armoury's racks in the corner: swords and spears upright, shields hung above
    for (const rack of at("rack")) {
        const [x0, x1] = [m(rack.x), m(rack.x + rack.w)];
        const z = m(rack.y);

        solid.box(x0, m(0.2), z + m(0.1), x1, m(0.3), z + m(0.5), material("timber", WALL));
        solid.box(x0, m(1.2), z + m(0.05), x1, m(1.3), z + m(0.3), material("timber", WALL));

        for (let x = x0 + m(0.3), k = 0; x < x1 - m(0.2); x += m(0.35), k++) {
            if (k % 3 === 2) {
                solid.box(x - 0.2, m(0.3), z + m(0.25), x + 0.2, m(2.4), z + m(0.3), material("timber"));
                solid.cylinder(x, z + m(0.28), m(2.4), m(2.7), m(0.05), 0, material("iron"), { segments: 6 });
            } else {
                solid.box(x - 0.35, m(0.3), z + m(0.22), x + 0.35, m(1.3), z + m(0.3), material("iron"));
                solid.box(x - 0.9, m(1.3), z + m(0.2), x + 0.9, m(1.36), z + m(0.32), material("brass"));
                solid.box(x - 0.25, m(1.36), z + m(0.22), x + 0.25, m(1.55), z + m(0.3), material("leather"));
            }
        }

        for (let x = x0 + m(0.6); x < x1 - m(0.3); x += m(1)) {
            solid.cylinder(x, z + m(0.05), m(1.7), m(1.72), m(0.35), m(0.35), material("wool-blue", WALL), { segments: 12 });
        }
    }

    // Long banners either side of the dais, and down the side walls
    for (const x of [7.5, 14.5]) {
        wallBanner(solid, m(x), 0.3, "z", "velvet", "cloth-gold", { low: 0.9, high: 3 });
    }

    for (const z of [9.5, 13.5]) {
        wallBanner(solid, 0.3, m(z), "x", "velvet", "cloth-gold", { low: 0.9, high: 3 });
        wallBanner(solid, w - 0.3, m(z), "x", "velvet", "cloth-gold", { low: 0.9, high: 3 });
    }

    const fires = at("hearth").map((hearth) => sideHearth(solid, map, hearth));

    solid.add(objectSolid(candleWheel(m(map.width / 2), m(5), m(2.5), m(1.1), 12)));
    solid.add(objectSolid(candleWheel(m(map.width / 2), m(11), m(2.5), m(1.1), 12)));

    return {
        solid,
        moving: [],
        flames: fires.map(({ fire }) => fire),
        lights: fires.map(({ light }) => light),
        hearth: fires[0]?.at ?? null,
    };
}

const BUILDERS = { taproom, upstairs, smithy, temple, guild, hall, keep };

// --- Each people's own ---

// What each people builds its insides of, in place of the humans' plaster, flagstones, oak and
// pewter (by name): the cat folk's mud, whitewash and laterite, mats and calabashes; the orcs'
// basalt, hides and charred wood, iron and furs; the lizard folk's lime-washed stone, reeds and
// bamboo, jade and Maya blue; the elves' marble and moonstone, heartwood and silver; the dark
// elves' black stone and charred planks, violet cloth and silk
const PALETTES = Object.freeze({
    cat: { stone: "mud-pale", "stone-warm": "mud-red", "stone-dark": "mud-dark", plaster: "mud", "plaster-ochre": "mud-red", timber: "timber-light", planks: "planks-pale", "planks-dark": "timber-light", velvet: "laterite", "velvet-purple": "indigo", rug: "indigo", "rug-border": "ochre", pewter: "clay", brass: "sun-gold", "guild-blue": "indigo", "guild-gold": "cloth-saffron", "cloth-gold": "cloth-saffron", leather: "hide", "wool-blue": "indigo", "wool-green": "ochre" },
    orc: { stone: "basalt", "stone-warm": "rock-dark", "stone-dark": "basalt", plaster: "planks-dark", "plaster-white": "hide", "plaster-ochre": "hide-dark", timber: "deadwood", "timber-light": "deadwood", planks: "planks-dark", "planks-dark": "timber-char", velvet: "war-red", "velvet-purple": "war-red", rug: "fur", "rug-border": "fur-grey", pewter: "iron-black", brass: "rust", "guild-blue": "war-red", "guild-gold": "bone", "cloth-gold": "rust", linen: "fur-grey", leather: "hide-dark", "wool-blue": "fur", "wool-green": "fur-grey" },
    lizard: { stone: "stone-lime", "stone-warm": "stone-lime", "stone-dark": "jade-dark", plaster: "reeds", "plaster-ochre": "plaster-red", timber: "bamboo", "timber-light": "bamboo", planks: "planks-pale", "planks-dark": "bamboo", velvet: "jade", "velvet-purple": "maya-blue", rug: "maya-blue", "rug-border": "plaster-red", pewter: "calabash", brass: "jade", "guild-blue": "maya-blue", "guild-gold": "jade", "cloth-gold": "jade", leather: "reeds", "wool-blue": "maya-blue", "wool-green": "jade" },
    elf: { stone: "marble", "stone-warm": "stone-moon", "stone-dark": "stone-moon", plaster: "stone-moon", "plaster-white": "marble", "plaster-ochre": "heartwood", timber: "heartwood", "timber-light": "bark-silver", planks: "planks-pale", "planks-dark": "heartwood", velvet: "cloth-green", "velvet-purple": "cloth-green", rug: "cloth-green", "rug-border": "cloth-silver", pewter: "silver", brass: "verdigris", "guild-blue": "cloth-green", "guild-gold": "cloth-silver", "cloth-gold": "verdigris", "wool-blue": "cloth-green" },
    darkElf: { stone: "stone-black", "stone-warm": "stone-black", "stone-dark": "obsidian", plaster: "stone-black", "plaster-white": "planks-char", "plaster-ochre": "slate-violet", timber: "timber-char", "timber-light": "timber-char", planks: "planks-char", "planks-dark": "timber-char", velvet: "cloth-violet", "velvet-purple": "cloth-violet", rug: "cloth-violet", "rug-border": "black", pewter: "iron-black", brass: "silver", "guild-blue": "cloth-violet", "guild-gold": "cloth-silver", "cloth-gold": "cloth-silver", linen: "silk", "wool-blue": "cloth-violet", "wool-green": "black" },
});

// The peoples whose walls inside are framed with posts and a beam, as the humans' are (the orcs'
// with logs, the lizard folk's with bamboo); the rest are plain: mud, stone, marble
const FRAMED = new Set(["orc", "lizard"]);

// The light each people's lamps give, in place of candlelight (their fires burn as anyone's)
const LAMPLIGHT = Object.freeze({ orc: 0xffa060, elf: 0xcfe0ff, darkElf: 0xa47cff, lizard: 0xe8ffc8 });

// What each people puts up round its walls, high over the windows and the furniture: along each
// run of wall (`at(s, y, d)`: s along it, y up, d out from it into the room; `along` and `out`
// its ways; `spots` places for things), cut away with the walls
const ACCENTS = {
    // The cat folk: a frieze of laterite and whitewash, and a sun in gold between its rays
    cat(solid, { length, at, box, disc, spots }) {
        box(0, length, m(2.4), m(2.48), 0.5, "laterite");
        box(0, length, m(2.48), m(2.54), 0.5, "kaolin");

        for (const s of spots) {
            disc(s, m(2.74), m(0.2), 0.8, "sun-gold", 12);

            for (let k = 0; k < 8; k++) {
                const a = (k * Math.PI) / 4;
                const tri = [[s + Math.cos(a - 0.2) * m(0.24), m(2.74) + Math.sin(a - 0.2) * m(0.24)], [s + Math.cos(a) * m(0.36), m(2.74) + Math.sin(a) * m(0.36)], [s + Math.cos(a + 0.2) * m(0.24), m(2.74) + Math.sin(a + 0.2) * m(0.24)]];

                solid.facing(tri.map(([u, y]) => at(u, y, 0.6)), at.outward, material("ochre", WALL));
            }
        }
    },

    // The orcs: a band of dark hide, and horned skulls
    orc(solid, { length, at, along, box, spots }) {
        box(0, length, m(2.38), m(2.56), 0.6, "hide-dark");

        for (const s of spots) {
            const [x, y, z] = at(s, m(2.72), m(0.2));
            const bone = material("bone", WALL);

            solid.lathe(x, z, [[0, y - m(0.15)], [m(0.13), y - m(0.08)], [m(0.15), y + m(0.01)], [m(0.11), y + m(0.1)], [0, y + m(0.13)]], bone, { segments: 7 });

            for (const side of [-1, 1]) {
                const root = [x + along[0] * side * m(0.12), y + m(0.05), z + along[1] * side * m(0.12)];

                solid.tube([root, [root[0] + along[0] * side * m(0.2), root[1] + m(0.08), root[2] + along[1] * side * m(0.2)], [root[0] + along[0] * side * m(0.26), root[1] + m(0.3), root[2] + along[1] * side * m(0.26)]], [m(0.045), m(0.035), 0], bone, { sides: 5 });
            }
        }
    },

    // The lizard folk: a stepped fret of Maya blue and red, and jade set between
    lizard(solid, { length, box, disc, spots }) {
        const step = m(0.35);

        for (let k = 0; k * step < length; k++) {
            box(k * step, Math.min(length, (k + 1) * step), m(2.42) + (k % 2) * m(0.08), m(2.6) + (k % 2) * m(0.08), 0.5, k % 2 ? "maya-blue" : "plaster-red");
        }

        for (const s of spots) {
            disc(s, m(2.82), m(0.1), 0.7, "jade", 4);
        }
    },

    // The elves: a vine along the wall, waving, its leaves out either side, moon buds hanging
    elf(solid, { length, at, spots }) {
        const wave = (s) => m(2.62) + Math.sin(s / m(0.9)) * m(0.12);
        const points = Array.from({ length: Math.ceil(length / m(0.4)) + 1 }, (_, k) => Math.min(length, k * m(0.4)));

        solid.tube(points.map((s) => at(s, wave(s), 0.6)), m(0.035), material("heartwood", WALL), { sides: 4 });

        points.forEach((s, k) => {
            const up = k % 2 ? 1 : -1;
            const leaf = [[s, wave(s)], [s + m(0.12), wave(s) + up * m(0.14)], [s + m(0.02), wave(s) + up * m(0.26)], [s - m(0.08), wave(s) + up * m(0.12)]];

            solid.facing(leaf.map(([u, y]) => at(u, y, 0.7)), at.outward, material("leaves", WALL));
        });

        for (const s of spots) {
            const [x, y, z] = at(s, wave(s) - m(0.05), m(0.12));

            solid.lathe(x, z, [[0, y - m(0.3)], [m(0.07), y - m(0.24)], [m(0.08), y - m(0.16)], [m(0.04), y - m(0.08)], [0, y]], material("glow-moon", WALL), { segments: 6 });
        }
    },

    // The dark elves: fangs of obsidian along the top of the walls, webs in the corners, violet
    // lamps hanging
    darkElf(solid, { length, at, along, spots }) {
        for (let s = m(0.3); s < length; s += m(0.5)) {
            solid.tube([at(s, m(2.97), 0.6), at(s, m(2.62), 0.8)], [m(0.06), 0], material("obsidian", WALL), { sides: 4 });
        }

        for (const end of [m(0.1), length - m(0.1)]) {
            const corner = at(end, m(2.95), 0.5);
            const inward = end < length / 2 ? 1 : -1;
            const silk = material("silk", WALL);

            for (let k = 0; k <= 5; k++) {
                const a = (k * Math.PI) / 10;
                const tip = [corner[0] + along[0] * inward * Math.cos(a) * m(0.8), corner[1] - Math.sin(a) * m(0.8), corner[2] + along[1] * inward * Math.cos(a) * m(0.8)];

                solid.tube([corner, tip], m(0.012), silk, { sides: 3 });
            }

            for (const r of [0.3, 0.55]) {
                const arc = Array.from({ length: 6 }, (_, k) => {
                    const a = (k * Math.PI) / 10;

                    return [corner[0] + along[0] * inward * Math.cos(a) * m(r), corner[1] - Math.sin(a) * m(r), corner[2] + along[1] * inward * Math.cos(a) * m(r)];
                });

                solid.tube(arc, m(0.01), silk, { sides: 3 });
            }
        }

        for (const s of spots) {
            const [x, y, z] = at(s, m(2.45), m(0.3));

            solid.tube([[x, m(2.95), z], [x, y + m(0.12), z]], m(0.012), material("iron-black", WALL), { sides: 3 });
            solid.lathe(x, z, [[0, y - m(0.12)], [m(0.11), y - m(0.05)], [m(0.12), y + m(0.02)], [m(0.08), y + m(0.1)], [0, y + m(0.13)]], material("glow-violet", WALL), { segments: 6 });
        }
    },
};

// A people's things round the walls of an inside (all but the south one, with its door)
function accents(solid, map, people) {
    const [w, h] = [m(map.width), m(map.height)];
    const runs = [
        { from: [m(0.6), 0], to: [w - m(0.6), 0], out: [0, 1] },
        { from: [0, m(0.6)], to: [0, h - m(0.6)], out: [1, 0] },
        { from: [w, m(0.6)], to: [w, h - m(0.6)], out: [-1, 0] },
    ];

    for (const { from, to, out } of runs) {
        const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
        const along = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
        const at = (s, y, d = 0) => [from[0] + along[0] * s + out[0] * d, y, from[1] + along[1] * s + out[1] * d];
        const count = Math.max(1, Math.floor(length / m(3)));
        const spots = Array.from({ length: count }, (_, k) => ((k + 0.5) * length) / count);

        at.outward = [out[0], 0, out[1]];

        // (A band along the wall from s0 to s1, y0 up to y1, `d` out; a disc of `count` corners)
        const box = (s0, s1, y0, y1, d, name) => {
            const [a, b] = [at(s0, y0, 0), at(s1, y1, d)];

            solid.box(Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2]), material(name, WALL));
        };
        const disc = (s, y, r, d, name, corners) => {
            const points = Array.from({ length: corners }, (_, k) => {
                const a = (k * Math.PI * 2) / corners + Math.PI / 4;

                return at(s + Math.cos(a) * r, y + Math.sin(a) * r, d);
            });

            solid.facing(points, at.outward, material(name, WALL));
        };

        ACCENTS[people]?.(solid, { length, along, out, at, box, disc, spots });
    }
}

/**
 * Build a map's inside: { map, object (a Group at the map's place in the world, in metres),
 * lights (its flames, as point lights: { kind, x, y, z (world metres), colour, intensity,
 * distance, flicker, seed }, its fires first: roomlight.js), daylight (the way towards the sun
 * shining in at its windows, [x, y, z], or null for none), ceiling (how high it is: STOREY),
 * hearth (world point of its fire, or null), update(dt, time) (turns the spit, moves the flames), drive(name, time, seconds) (turns a
 * named part a while), dispose() }.
 */
export function buildInterior(map) {
    return allAtOnce(buildingInterior(map));
}

// A moving part's meshes merged as the rest are (drawn from the atlas where they can be), about the
// part's own origin: it turns as one
function mergeInPlace(part) {
    const [position, rotation] = [part.position.clone(), part.rotation.clone()];

    part.position.set(0, 0, 0);
    part.rotation.set(0, 0, 0);
    part.updateMatrixWorld(true);

    const merged = joined(partsOf(part, { atlas: (stuff) => atlasInside(stuff.userData.cut) }));

    part.traverse((node) => node.geometry?.dispose());
    part.clear();
    part.add(...merged.children);
    part.position.copy(position);
    part.rotation.copy(rotation);
}

/**
 * The same (buildInterior), a step at a time (each a yield, so that getting a building ready is
 * spread over frames: its rooms and furniture laid out, made into meshes, made ready to merge,
 * merged), returning it.
 */
export function* buildingInterior(map) {
    const own = PALETTES[map.people] ? map.people : null;
    let built;
    let lit;

    // (Built of its people's materials, its ceiling made their way, and dressed as they dress
    // their walls; its flames and windows noted as they're built)
    palette = PALETTES[own] ?? null;
    framed = !own || FRAMED.has(own);
    people = own;
    lighting = { flames: [], glows: [], panes: [], daylight: null, candles: [] };

    try {
        built = BUILDERS[map.style ?? map.id](map);

        if (own) {
            accents(built.solid, map, own);
        }
    } finally {
        lit = lighting;
        palette = null;
        framed = true;
        people = null;
        lighting = { flames: [], glows: [], panes: [], daylight: null, candles: [] };
    }

    yield;

    const art = new THREE.Group();
    const [ox, oz] = map.origin;

    art.scale.setScalar(1 / M);
    art.add(built.solid.toObject());

    const object = new THREE.Group();
    const statics = new THREE.Group();

    statics.add(art);
    statics.updateMatrixWorld(true);
    yield;

    // Everything that doesn't move merged: what the atlas draws into a mesh for the walls and one
    // for the rest, anything else by its material; the spit and flames apart
    const parts = partsOf(statics, { atlas: (stuff) => atlasInside(stuff.userData.cut) });

    yield;

    const merged = joined(parts);

    object.add(merged);

    const animated = new THREE.Group();

    animated.scale.setScalar(1 / M);

    for (const { object: part } of built.moving) {
        mergeInPlace(part);
        animated.add(part);
    }

    for (const fire of built.flames) {
        animated.add(fire);
    }

    const candles = candleFlames(lit.candles);

    if (candles) {
        candles.name = "candles";
        animated.add(candles);
    }

    object.add(animated);

    // The glows round the flames (the fires' as big as they are), and the beams of daylight
    const fires = built.lights.filter(({ kind }) => kind === "fire").map(({ x, y, z, colour }) => ({ x, y: y - 0.3, z, size: 1.5, colour }));

    object.add(glowsOf([...lit.glows, ...fires]));

    const beams = lit.daylight && beamsOf(map, lit.panes, lit.daylight);

    if (beams) {
        object.add(beams);
    }

    object.position.set(ox, 0, oz);
    object.name = map.id;

    // (Everything casts shadows but the flames, their glows and the beams of light, and the glass
    // the daylight comes in through)
    object.traverse((node) => {
        if (node.isMesh && node.material.type !== "ShaderMaterial") {
            node.castShadow = !node.material.name.startsWith("window");
            node.receiveShadow = true;
        }
    });

    for (const fire of built.flames) {
        fire.traverse((node) => {
            node.castShadow = false;
            node.receiveShadow = false;
        });
    }

    // Its ceiling (each mesh of it, how high its top is, world metres, and whether the camera's
    // over it all), drawn into the sun's shadows always (keeping the sun out but at the windows),
    // and into the view only while the camera's under some of it (none of it drawn, as three.js
    // has it, while its geometry's to draw none; its shadow drawn first)
    const overhead = [];

    object.updateMatrixWorld(true);
    object.traverse((node) => {
        if (node.isMesh && node.material.name.endsWith("-ceiling")) {
            const each = { top: new THREE.Box3().setFromObject(node).max.y, over: false };

            node.onBeforeShadow = () => {
                node.geometry.drawRange.count = Infinity;
            };
            node.onBeforeRender = () => {
                node.geometry.drawRange.count = each.over ? 0 : Infinity;
            };
            overhead.push(each);
        }
    });

    return {
        map,
        object,
        lights: gather([...built.lights, ...lit.flames]).map((light, k) => ({ ...light, colour: ((light.kind === "lamp" || light.kind === "candle") && LAMPLIGHT[own]) || light.colour, x: ox + light.x, z: oz + light.z, seed: light.seed ?? k * 17.3 })),
        daylight: lit.daylight,
        ceiling: STOREY,
        hearth: built.hearth ? { x: ox + built.hearth.x, y: built.hearth.y, z: oz + built.hearth.z } : null,
        update(dt, time) {
            for (const part of built.moving) {
                // (A named part turns only while it's driven: the grindstone while cranked)
                if (!part.name || time < (part.until ?? 0)) {
                    part.object.rotation[part.axis ?? "z"] += part.turn * dt;
                }
            }

            INTERIOR_GLOW.time.value = time;
        },
        /**
         * Seen from the camera (world metres): its ceiling not drawn while it's all lower than the
         * camera (the cut would throw away every pixel of it, each worked out first), but still
         * casting its shadow, so the sun comes in only at the windows.
         */
        seenFrom(camera) {
            for (const each of overhead) {
                each.over = each.top < camera.y;
            }
        },
        /** Turn one of its named moving parts (the grindstone) for a while, from `time` (s). */
        drive(name, time, seconds) {
            for (const part of built.moving.filter((each) => each.name === name)) {
                part.until = time + seconds;
            }
        },
        // (Its own geometry and flames: the materials are shared by every inside)
        dispose() {
            object.traverse((node) => {
                node.geometry?.dispose();

                if (node.material?.type === "ShaderMaterial" && !node.material.userData.shared) {
                    node.material.dispose();
                }
            });
            object.removeFromParent();
        },
    };
}
