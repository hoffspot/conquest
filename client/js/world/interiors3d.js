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
import { WATER_DETAIL } from "./water.js";
import { cavern, SHELLS, tiles } from "./caverns.js";
import { Blocks, furnish, loadProp, ROCK_PICTURES, rockMaterial } from "./dungeons3d.js";
import { blockAt, bonesAt, clutterAt, hashOf, onTable, remainsAt, seatsAt, shelvesAt, sideTableAt, standAt, strewnAt, vesselsAt, workbenchAt } from "./dungeondressing.js";

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
        } else if (name === "daylight") {
            // Daylight seen out of a cave's mouth, bright
            result = new THREE.MeshBasicMaterial({ color: 0xfff0d2, toneMapped: false });
            result.name = name;
        } else if (name === "candle-flame" || name.startsWith("sconce")) {
            result = new THREE.MeshBasicMaterial({ color: { sconce: 0xff5a4a, "sconce-warm": 0xffb45a }[name] ?? 0xffd27a, toneMapped: false });
            result.name = name;
        } else if (name === "portal-veil") {
            // (A guild's portal's veil: its swirling light worked out as it's drawn, veilShader)
            result = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
            result.name = name;
            result.userData.veil = true;
        } else if (name === "portal-rune") {
            // (The runes round a portal, glowing)
            result = new THREE.MeshBasicMaterial({ color: 0xb8e6ff, toneMapped: false });
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

        if (target.userData.veil) {
            veilShader(shader);
        }
    };
    target.customProgramCacheKey = () => `interior-cut-${target.type}${target.userData.leaded ? "-leaded" : ""}${target.userData.veil ? "-veil" : ""}`;
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
// in lead (texture coordinates are art pixels: five to a metre); the day's sky in them, or the
// sun's on the sunny side, going over to the night's (NIGHT_PANE) as the daylight goes
// (INTERIOR_GLOW.daylight)
function leadedShader(shader) {
    shader.uniforms.paneDaylight = INTERIOR_GLOW.daylight;
    shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vLeaded;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvLeaded = uv;");
    shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vLeaded;\nuniform float paneDaylight;")
        .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
{
    vec2 diamond = vec2(vLeaded.x + vLeaded.y, vLeaded.x - vLeaded.y) * 1.6;
    vec2 cell = floor(diamond);
    vec2 within = abs(fract(diamond) - 0.5);
    float lead = smoothstep(0.42, 0.47, max(within.x, within.y));
    float tint = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);

    // (The night's sky in them as the daylight goes, faintly moonlit: NIGHT_PANE)
    vec3 sky = mix(vec3(${NIGHT_PANE.map((v) => v.toFixed(3)).join(", ")}), diffuseColor.rgb, paneDaylight);

    diffuseColor.rgb = mix(sky * (0.86 + 0.2 * tint), vec3(0.09, 0.08, 0.07), lead);
}`,
        );
}

/**
 * A guild's portal's veil: how long its swirl takes to come round to where it began (seconds:
 * the time it's given runs from 0 to this, over and over, so it never grows too big for the
 * graphics card to count finely), and the time in it (set as the room's drawn: update).
 */
export const VEIL = Object.freeze({ loop: 120, time: { value: 0 } });

// A guild's portal's veil, as fluid swirling into a vortex: worked out for each point of it
// (its shape's texture coordinates, art pixels: five to a metre from the middle of the opening's
// foot), in log-polar coordinates about its eye (as far round as it is out, so its eddies stay
// round), twisted into five arms that wind tighter towards the eye (still, as a galaxy's arms
// are: only what flows along them moves, turning and falling inward, so it never winds up), a
// noise flowing along them warped by another (the folds of a fluid), finer only where there's
// room to draw it (band-limited), in the deep blues of the guild's portals: streaks of light
// along the arms, a bright eye, the light drawn inward to it, a churning rim against the stone,
// and the whole breathing slowly. Every way it moves comes round whole each loop (VEIL), so it
// never jumps; the noise repeats round the eye, so there's no seam. Its finer fold at medium
// quality and up (WATER_DETAIL, as the water's ripples)
function veilShader(shader) {
    Object.assign(shader.uniforms, { veilTime: VEIL.time, veilDetail: WATER_DETAIL });
    shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vVeil;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvVeil = uv;");
    shader.fragmentShader = shader.fragmentShader
        .replace(
            "#include <common>",
            `#include <common>
varying vec2 vVeil;
uniform float veilTime;
uniform float veilDetail;

const float VEIL_LOOP = ${VEIL.loop.toFixed(1)};
const float VEIL_ARMS = 5.0;
const vec2 VEIL_PERIOD = vec2(VEIL_ARMS, 8.0);
const vec2 VEIL_EYE = vec2(0.0, 1.35);

// (A hash without sines, Dave Hoskins's; value noise on a lattice wrapped to its period, so it tiles
// round the eye; and its octaves, each faded out where it would be finer than a pixel)
float veilHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);

    p3 += dot(p3, p3.yzx + 33.33);

    return fract((p3.x + p3.y) * p3.z);
}

float veilNoise(vec2 p, vec2 period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 i0 = mod(i, period);
    vec2 i1 = mod(i + 1.0, period);

    return mix(mix(veilHash(i0), veilHash(vec2(i1.x, i0.y)), u.x), mix(veilHash(vec2(i0.x, i1.y)), veilHash(i1), u.x), u.y);
}

float veilFbm(vec2 p, vec2 period, float footprint, int octaves) {
    float sum = 0.0;
    float amplitude = 0.5;
    float total = 0.0;

    for (int k = 0; k < 4; k++) {
        if (k >= octaves) break;

        sum += amplitude * (veilNoise(p, period) - 0.5) * smoothstep(1.0, 0.5, footprint);
        total += amplitude;
        p = p * 2.0 + 0.37;
        period *= 2.0;
        footprint *= 2.0;
        amplitude *= 0.5;
    }

    return 0.5 + sum / total;
}

// (How far a point is inside the opening, negative within it: a semicircle size.x across, on
// legs size.y long, from the middle of the semicircle's foot; Inigo Quilez's)
float veilEdge(vec2 p, vec2 size) {
    p.x = abs(p.x);
    p.y = -p.y;

    vec2 q = p - size;
    float d1 = dot(vec2(max(q.x, 0.0), q.y), vec2(max(q.x, 0.0), q.y));

    q.x = p.y > 0.0 ? q.x : length(p) - size.x;

    float d2 = dot(vec2(q.x, max(q.y, 0.0)), vec2(q.x, max(q.y, 0.0)));
    float d = sqrt(min(d1, d2));

    return max(q.x, q.y) < 0.0 ? -d : d;
}

vec3 veilAt(vec2 at) {
    vec2 d = at - VEIL_EYE;
    float r = max(length(d), 1e-4);
    vec2 lp = vec2(atan(d.y, d.x) / PI2 * VEIL_ARMS, log(r) * VEIL_ARMS / PI2);
    float footprint = 1.5 * fwidth(lp.y);

    lp.x += 0.5 * lp.y + VEIL_ARMS / PI2 * 1.2 / (r + 0.12);

    vec2 flow = VEIL_PERIOD * vec2(4.0, 2.0) * (veilTime / VEIL_LOOP);
    int octaves = veilDetail > 0.5 ? 3 : 2;
    vec2 drift = lp + flow * 0.5;
    vec2 q = vec2(veilFbm(drift, VEIL_PERIOD, footprint, 2), veilFbm(drift + vec2(2.0, 3.0), VEIL_PERIOD, footprint, 2));
    vec2 swirl = lp + flow + 1.6 * (q - 0.5);
    float f = veilFbm(swirl, VEIL_PERIOD, footprint, octaves);
    float ridge = 1.0 - abs(2.0 * veilNoise(swirl * vec2(1.0, 3.0), VEIL_PERIOD * vec2(1.0, 3.0)) - 1.0);
    vec3 deep = vec3(0.02, 0.05, 0.20);
    vec3 middle = vec3(0.07, 0.30, 0.85);
    vec3 high = vec3(0.45, 0.88, 1.0);
    vec3 colour = mix(deep, middle, smoothstep(0.25, 0.8, f));

    colour = mix(colour, high, 0.8 * smoothstep(0.55, 0.95, f));
    colour += high * 0.6 * pow(ridge, 6.0) * smoothstep(1.0, 0.3, footprint * 3.0);
    colour = mix(colour, vec3(0.85, 0.97, 1.0), exp(-r / 0.09));
    colour *= (0.75 + 0.5 * exp(-r / 0.45)) * (0.93 + 0.07 * sin(PI2 * 15.0 * veilTime / VEIL_LOOP));
    colour += vec3(0.35, 0.75, 1.0) * 0.9 * exp((veilEdge(at - vec2(0.0, 1.75), vec2(0.8, 1.75)) + 0.04 * (f - 0.5)) / 0.07);

    // (Worked out as it's to be seen: into the light it's drawn in, as every colour is)
    return pow(max(colour, 0.0), vec3(2.2));
}`,
        )
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `vec4 diffuseColor = vec4( veilAt(vVeil / ${M.toFixed(1)}), opacity );`);
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

/** What's seen through a window from inside by night (linear colour): the dark sky, faintly moonlit. */
export const NIGHT_PANE = Object.freeze([0.05, 0.07, 0.12]);

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
    // (The dark elves' own: the witchlight in their hanging lamps, cold and all but steady, and
    // the amethyst shards in their iron cups on the walls, glowing)
    witchlight: { intensity: 4, distance: 9, flicker: 0.03, colour: 0xbc9cff, glow: 0.55 },
    shard: { intensity: 2.6, distance: 6, flicker: 0.02, colour: 0xa898ff, glow: 0.4 },
    // (A guild's portal: its veil's cold light, all but steady)
    portal: { intensity: 3.4, distance: 8, flicker: 0.04, colour: 0x7fb2ff, glow: 0.45 },
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

    // Beaten earth underfoot, dark with soot; bare stone walls, the door in the middle of the south
    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("earth-sooty"));

    const doors = map.marks.D;
    const doorMiddle = (doors[0][0] + doors.at(-1)[0] + 1) / 2;

    walledIn(solid, map, "stone", [{ side: "s", from: doorMiddle - 0.7, to: doorMiddle + 0.7, lintel: 2.2 }], [{ side: "e", at: 4 }, { side: "e", at: 9 }, { side: "s", at: 3.5 }, { side: "s", at: 12.5 }]);
    solid.box(m(doorMiddle - 0.7), 0, h - 0.2, m(doorMiddle + 0.7), m(2.2), h + 0.4, material("planks-dark", WALL));
    ceiling(solid, map);

    const works = forgeworks(solid, map, moving);

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

    // A lantern hanging in the middle
    solid.add(objectSolid(lantern(m(map.width / 2), m(map.height * 0.6), m(2.2))));

    return { solid, moving, flames: works.fires, lights: [works.light], hearth: works.hearth };
}

// A forge's works (a smithy's, and a castle keep's undercroft's), as its plan has them: the forge
// under its hood, its bellows, the anvil on its stump, the quenching trough, the grindstone (a
// part that turns as it's cranked: into `moving`), the heap of coals, and a workbench if there's
// one. { fires (its flames), light (the forge's), hearth (where its fire is) }
function forgeworks(solid, map, moving) {
    const at = (kind) => map.pieces.find((piece) => piece.kind === kind);

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

    // The workbench along a wall: a vice, a hammer and files on it
    const bench = at("workbench");

    if (bench) {
        const [wx0, wx1, wz0, wz1] = [m(bench.x + 0.05), m(bench.x + bench.w - 0.1), m(bench.y + 0.1), m(bench.y + bench.h - 0.1)];

        table(solid, wx0, wz0, wx1, wz1);
        solid.box(wx1 - m(0.25), m(0.78), wz0 + m(0.6), wx1 - m(0.05), m(0.98), wz0 + m(0.8), material("iron"));
        solid.box(wx0 + m(0.2), m(0.78), wz0 + m(1.4), wx0 + m(0.4), m(0.82), wz0 + m(1.8), material("iron"));
        candle(solid, (wx0 + wx1) / 2, wz1 - m(0.4), m(0.78));
    }

    return {
        fires,
        light: { kind: "fire", x: forge.x + forge.w / 2, y: 1.2, z: forge.y + forge.h, colour: 0xff7a2a, intensity: 10, distance: 14, flicker: 0.3, ...fires[0].userData.fire },
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

    // An abbey's herbalist's counter, and their shelves of jars, phials and books on the wall
    // behind it
    for (const counter of at("counter")) {
        desk(solid, counter, "linen");
    }

    for (const shelf of at("shelves")) {
        phialShelves(solid, shelf, { north: true });
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

    walledIn(solid, map, "plaster-ochre", [{ side: "s", from: doorMiddle - 1.1, to: doorMiddle + 1.1, lintel: 2.6 }], [{ side: "s", at: 4.5 }, { side: "s", at: 14.5 }, { side: "e", at: 3 }]);
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

    // The portal beside it (core/portals.js), its veil swirling
    for (const piece of at("portal")) {
        portal(solid, w, m(piece.y + piece.h / 2));
    }

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

// A guild's portal on the east wall (`w`: its x; `z` the middle of it, art pixels): an arch of
// dressed stone (the people's), runes cut in its face glowing, a worn step before it, and in it a
// veil of light swirling into a vortex (veilShader), lighting the room round it a cold blue
function portal(solid, w, z) {
    const [spring, inner, outer, deep] = [m(1.75), m(0.8), m(1.2), m(0.5)];
    const shape = new THREE.Shape();

    // (Its outline, one piece: up the outside of one leg, over the top, down the other, and back
    // round the opening)
    shape.moveTo(-outer, 0);
    shape.lineTo(-outer, spring);
    shape.absarc(0, spring, outer, Math.PI, 0, true);
    shape.lineTo(outer, 0);
    shape.lineTo(inner, 0);
    shape.lineTo(inner, spring);
    shape.absarc(0, spring, inner, 0, Math.PI, false);
    shape.lineTo(-inner, 0);
    shape.closePath();

    const arch = new THREE.Group();
    const face = w + m(0.05) - deep;

    arch.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: deep, bevelEnabled: false, curveSegments: 10 }).rotateY(-Math.PI / 2).translate(w + m(0.05), 0, z), material("stone", WALL)));

    // (The veil, a little in from the arch's face)
    const opening = new THREE.Shape();

    opening.moveTo(-inner, 0);
    opening.lineTo(inner, 0);
    opening.lineTo(inner, spring);
    opening.absarc(0, spring, inner, 0, Math.PI, false);
    opening.closePath();
    arch.add(new THREE.Mesh(new THREE.ShapeGeometry(opening, 10).rotateY(-Math.PI / 2).translate(face + m(0.2), 0, z), material("portal-veil", WALL)));
    solid.add(objectSolid(arch));

    // Runes up the arch's face, glowing, and the step before it
    for (let k = 0; k < 9; k++) {
        const angle = Math.PI * (k / 8);
        const [rz, ry] = [Math.cos(angle) * (inner + outer) * 0.5, spring + Math.sin(angle) * (inner + outer) * 0.5];

        solid.box(face - 0.15, ry - m(0.07), z + rz - m(0.05), face, ry + m(0.07), z + rz + m(0.05), material("portal-rune", WALL));
    }

    for (const side of [-1, 1]) {
        for (const ry of [m(0.5), m(1.1)]) {
            solid.box(face - 0.15, ry - m(0.08), z + side * (inner + outer) * 0.5 - m(0.05), face, ry + m(0.08), z + side * (inner + outer) * 0.5 + m(0.05), material("portal-rune", WALL));
        }
    }

    solid.box(face - m(0.45), 0, z - outer - m(0.1), face + m(0.1), m(0.08), z + outer + m(0.1), material("stone-dark"));

    // (Its light, the colour of the veil's)
    lit("portal", face + m(0.1), spring - m(0.3), z, { glows: [[face + m(0.1), spring - m(0.3), z]] });
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
// An armoury's rack against the north wall (a plan's "R" run along it): swords and spears
// upright, shields hung above
function armoury(solid, rack) {
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

// A keep's war table (core/wartable.js): a heavy board on turned legs, the map of the land spread
// over it (its sea along the north, a river winding down to it, woods and roads), the peoples'
// pieces stood on it where their armies are, a pointer laid by, and candles at two corners
function warTable(solid, piece) {
    const [x0, z0, x1, z1] = [m(piece.x + 0.12), m(piece.y + 0.12), m(piece.x + piece.w - 0.12), m(piece.y + piece.h - 0.12)];
    const top = m(0.86);
    const sheet = top + m(0.012);
    const [w, d] = [x1 - x0, z1 - z0];
    const at = (u, v) => [x0 + w * u, z0 + d * v];

    for (const [u, v] of [[0.06, 0.1], [0.94, 0.1], [0.06, 0.9], [0.94, 0.9]]) {
        const [x, z] = at(u, v);

        solid.cylinder(x, z, 0, m(0.12), m(0.11), m(0.09), material("timber"), { segments: 8 });
        solid.cylinder(x, z, m(0.12), top - m(0.1), m(0.07), m(0.07), material("timber"), { segments: 8 });
    }

    solid.box(x0 + m(0.1), m(0.2), (z0 + z1) / 2 - m(0.05), x1 - m(0.1), m(0.3), (z0 + z1) / 2 + m(0.05), material("timber"));
    solid.box(x0, top - m(0.1), z0, x1, top, z1, material("planks-dark"));

    // The map: its parchment, the sea along its north edge, the river, the woods, the roads
    const [mx0, mz0, mx1, mz1] = [x0 + m(0.12), z0 + m(0.12), x1 - m(0.12), z1 - m(0.12)];

    solid.box(mx0, top, mz0, mx1, top + m(0.01), mz1, material("parchment"));
    solid.box(mx0, top + m(0.01), mz0, mx1, sheet, mz0 + (mz1 - mz0) * 0.18, material("water"));

    for (const [u0, v0, u1, v1] of [[0.62, 0.16, 0.66, 0.4], [0.58, 0.38, 0.63, 0.62], [0.52, 0.6, 0.6, 0.88]]) {
        const [ax, az] = at(u0, v0);
        const [bx, bz] = at(u1, v1);

        solid.box(Math.min(ax, bx), top + m(0.01), az, Math.max(ax, bx), sheet, bz, material("water"));
    }

    for (const [u, v, r] of [[0.2, 0.35, 0.09], [0.28, 0.6, 0.07], [0.82, 0.7, 0.08], [0.4, 0.8, 0.06]]) {
        const [x, z] = at(u, v);

        solid.cylinder(x, z, top + m(0.01), sheet, w * r, w * r, material("grass"), { segments: 10 });
    }

    for (const [u0, v0, u1, v1] of [[0.1, 0.5, 0.9, 0.53], [0.33, 0.25, 0.36, 0.9]]) {
        const [ax, az] = at(u0, v0);
        const [bx, bz] = at(u1, v1);

        solid.box(ax, top + m(0.01), az, bx, sheet + m(0.002), bz, material("ochre"));
    }

    // The pieces: their own in gold, the enemy's in red, each a block with a pennant on a pin;
    // and the towns, little towers of stone
    for (const [u, v, kind] of [[0.24, 0.47, "gold"], [0.3, 0.44, "gold"], [0.45, 0.72, "gold"], [0.74, 0.3, "paint-red"], [0.8, 0.36, "paint-red"], [0.7, 0.56, "paint-red"]]) {
        const [x, z] = at(u, v);

        solid.box(x - m(0.05), sheet, z - m(0.035), x + m(0.05), sheet + m(0.05), z + m(0.035), material(kind));
        solid.cylinder(x, z, sheet + m(0.05), sheet + m(0.17), m(0.006), m(0.006), material("iron"), { segments: 4 });
        solid.box(x, sheet + m(0.13), z - m(0.004), x + m(0.06), sheet + m(0.17), z + m(0.004), material(kind === "gold" ? "velvet" : "wine"));
    }

    for (const [u, v] of [[0.18, 0.62], [0.86, 0.5]]) {
        const [x, z] = at(u, v);

        solid.cylinder(x, z, sheet, sheet + m(0.09), m(0.04), m(0.045), material("stone"), { segments: 6 });
        solid.cylinder(x, z, sheet + m(0.09), sheet + m(0.13), m(0.05), 0, material("stone-dark"), { segments: 6 });
    }

    // (A pointer laid along its south edge)
    solid.box(x0 + w * 0.3, top, z1 - m(0.08), x0 + w * 0.7, top + m(0.025), z1 - m(0.055), material("timber-light"));

    candle(solid, x0 + m(0.12), z0 + m(0.12), top);
    candle(solid, x1 - m(0.12), z1 - m(0.12), top);
}

function keep(map) {
    const solid = new Solid();
    const [w, h] = [m(map.width), m(map.height)];
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);
    const [stair] = at("stairs");

    // Its flagstones; a people's castle's, round the stairwell down to its undercroft
    if (stair) {
        stairwell(solid, map, stair);
    } else {
        solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("stone"));
    }

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

    // The war table, below the council's
    for (const piece of at("war-table")) {
        warTable(solid, piece);
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

    // The armoury's racks in the corner
    for (const rack of at("rack")) {
        armoury(solid, rack);
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

// A castle keep's great hall's floor, round its stairwell (`stair`, the plan's piece) down to its
// undercroft along the north wall: the stairs going down west from the hall's floor, the well's
// walls, a dark floor far down, and a low parapet along its open sides (the way onto the stairs at
// its east end)
function stairwell(solid, map, stair) {
    const [w, h] = [m(map.width), m(map.height)];
    const [hole0, hole1, well0, well1] = [m(stair.x), m(stair.x + stair.w), m(stair.y), m(stair.y + stair.h)];
    const [ledge, high] = [m(0.25), m(0.9)];

    solid.box(-m(0.3), -0.5, -m(0.3), hole0, 0, h + m(0.3), material("stone"));
    solid.box(hole1, -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("stone"));
    solid.box(hole0, -0.5, well1, hole1, 0, h + m(0.3), material("stone"));
    stairs(solid, hole0, hole1, well0, well1, -m(STOREY), 0, well1);

    solid.box(hole0, -m(STOREY) - 0.5, well0, hole1, -m(STOREY), well1, material("shadow"));
    solid.box(hole0 - 0.5, -m(STOREY), well0, hole0, -0.5, well1, material("stone-dark"));
    solid.box(hole0, -m(STOREY), well1, hole1, -0.5, well1 + 0.5, material("stone-dark"));
    // (The parapet, its coping proud of it)
    for (const [x0, z0, x1, z1] of [[hole0 - ledge, well0, hole0, well1 + ledge], [hole0, well1, hole1, well1 + ledge]]) {
        solid.box(x0, 0, z0, x1, high, z1, material("stone-dark"));
        solid.box(x0 - 0.3, high, z0, x1 + 0.3, high + 0.6, z1 + 0.3, material("stone"), { under: material("stone") });
    }
}

// How a castle keep's undercroft is vaulted (metres): its vault springs from its pillars and its
// walls at `spring`, and rises to `crown` in the middle of each bay; each bay's vault is drawn in
// `cells` by `cells` (the stairwell's left open, cell by cell, with a shaft `shaft` metres up over
// it)
const UNDERCROFT = Object.freeze({ spring: 2.5, crown: 3.2, cells: 8, shaft: 1.5 });

// A groin vault over a bay (art pixels: [x0, z0, x1, z1]), seen from below: the two barrel vaults
// across it crossing, the higher of them at each point, so its edges arch from corner to corner
// and its groins run from corner to corner across it. Its cells over `hole` (x0, z0, x1, z1: their
// middles in it) left open, and a dark shaft up from round them
function groinVault(solid, [x0, z0, x1, z1], hole) {
    const { spring, crown, cells, shaft } = UNDERCROFT;
    const height = (u, v) => m(spring + (crown - spring) * Math.max(Math.sin(Math.PI * u), Math.sin(Math.PI * v)));
    const point = (i, j) => [x0 + ((x1 - x0) * i) / cells, height(i / cells, j / cells), z0 + ((z1 - z0) * j) / cells];
    const open = (i, j) => {
        const [cx, cz] = [x0 + ((x1 - x0) * (i + 0.5)) / cells, z0 + ((z1 - z0) * (j + 0.5)) / cells];

        return i >= 0 && j >= 0 && i < cells && j < cells && hole && cx > hole[0] && cx < hole[2] && cz > hole[1] && cz < hole[3];
    };
    const stone = material("stone", CEILING);
    const top = m(crown + shaft);

    for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
            if (!open(i, j)) {
                const [a, b, c, d] = [point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)];

                solid.facing([a, b, c], [0, -1, 0], stone);
                solid.facing([a, c, d], [0, -1, 0], stone);
                continue;
            }

            // (The shaft's sides, up from the vault round an open cell, facing into it; its top dark)
            for (const [di, dj, from, to] of [[0, -1, [0, 0], [1, 0]], [0, 1, [0, 1], [1, 1]], [-1, 0, [0, 0], [0, 1]], [1, 0, [1, 0], [1, 1]]]) {
                if (!open(i + di, j + dj)) {
                    const [p, q] = [point(i + from[0], j + from[1]), point(i + to[0], j + to[1])];

                    solid.facing([p, q, [q[0], top, q[2]], [p[0], top, p[2]]], [-di, 0, -dj], material("stone-dark", CEILING));
                }
            }

            const [a, c] = [point(i, j), point(i + 1, j + 1)];

            solid.box(a[0], top, a[2], c[0], top + 0.3, c[2], material("shadow", CEILING), { under: material("shadow", CEILING) });
        }
    }
}

// A suit of armour on a stand (art pixels: where it stands): a post on a foot, a mail coat hung on
// it with its skirt, a surcoat over it in the castle's colour, plates at its shoulders and a helm
function armourStand(solid, x, z, seed) {
    solid.box(x - m(0.28), 0, z - m(0.28), x + m(0.28), m(0.08), z + m(0.28), material("timber"));
    solid.box(x - m(0.04), m(0.08), z - m(0.04), x + m(0.04), m(0.6), z + m(0.04), material("timber"));
    solid.cylinder(x, z, m(0.55), m(0.8), m(0.25), m(0.21), material("iron"), { segments: 10 });
    solid.cylinder(x, z, m(0.8), m(1.42), m(0.2), m(0.24), material("iron"), { segments: 10 });
    solid.box(x - m(0.16), m(0.62), z + m(0.17), x + m(0.16), m(1.38), z + m(0.27), material(seed > 0.5 ? "velvet" : "wool-blue"));
    solid.cylinder(x, z, m(1.42), m(1.52), m(0.24), m(0.08), material("iron"), { segments: 10 });

    for (const side of [-1, 1]) {
        solid.cylinder(x + side * m(0.27), z, m(1.3), m(1.46), m(0.09), m(0.13), material("iron"), { segments: 8 });
    }

    solid.cylinder(x, z, m(1.52), m(1.78), m(0.12), m(0.13), material("iron"), { segments: 10 });
    solid.cylinder(x, z, m(1.78), m(1.9), m(0.13), m(0.03), material("iron"), { segments: 10 });
    solid.box(x - m(0.09), m(1.62), z + m(0.11), x + m(0.09), m(1.66), z + m(0.14), material("shadow"));
}

// An arcanist's shelves against the south wall (a shelves piece along it; an abbey herbalist's,
// `north`, against the north wall): four boards on a back, each crowded with jars and phials of
// coloured glass, stoppered bottles, clay pots, books, a skull, and a phial or two glowing
function phialShelves(solid, shelf, { north = false } = {}) {
    const [x0, x1] = [m(shelf.x), m(shelf.x + shelf.w)];
    // (The wall it's against, and the way out from it)
    const [z, out] = north ? [m(shelf.y), 1] : [m(shelf.y + 1), -1];
    const span = (a, b) => [Math.min(z + out * a, z + out * b), Math.max(z + out * a, z + out * b)];
    const glass = ["glass-green", "glass-violet", "wine", "glass", "calabash", "pewter", "glass-green", "glow-blue", "glass-violet", "glow-green"];
    const [back0, back1] = span(0, m(0.1));

    solid.box(x0, 0, back0, x1, m(2.2), back1, material("planks-dark", WALL));

    for (const [y, k0] of [[0.35, 0], [0.8, 3], [1.25, 5], [1.7, 7]]) {
        const [board0, board1] = span(0, m(0.45));

        solid.box(x0, m(y), board0, x1, m(y + 0.05), board1, material("planks", WALL));

        for (let x = x0 + m(0.18), k = k0; x < x1 - m(0.15); x += m(0.22), k++) {
            const pick = Math.round(x * 3.7 + y * 11) % 7;
            const [cz, base] = [z + out * m(0.22), m(y + 0.05)];

            if (pick === 0) {
                solid.box(x - m(0.07), base, cz - m(0.13), x + m(0.07), base + m(0.28), cz + m(0.13), material(k % 2 ? "ledger" : "leather", WALL));
            } else if (pick === 1 && k % 5 === 0) {
                solid.box(x - m(0.08), base, cz - m(0.08), x + m(0.08), base + m(0.14), cz + m(0.08), material("bone", WALL));
            } else {
                const tall = m(0.12 + ((k * 7) % 5) * 0.035);
                const wide = m(0.05 + ((k * 3) % 3) * 0.018);

                solid.cylinder(x, cz, base, base + tall, wide, wide, material(glass[(k * 7 + pick) % glass.length], WALL), { segments: 8 });
                solid.cylinder(x, cz, base + tall, base + tall + m(0.05), wide * 0.45, wide * 0.4, material(pick % 2 ? "timber" : "linen", WALL), { segments: 6 });
            }
        }
    }
}

// An arcanist's worktable (a table piece): an alembic over a flame, its glass bulb and its pipe to
// a phial, open books, a crystal ball on its stand, a mortar and pestle, candles
function worktable(solid, piece) {
    const [x0, z0, x1, z1] = [m(piece.x), m(piece.y), m(piece.x + piece.w), m(piece.y + piece.h)];
    const top = m(0.78);
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];

    table(solid, x0 + m(0.05), z0 + m(0.1), x1 - m(0.05), z1 - m(0.1));

    // (The alembic: a ring stand over a lamp, its bulb, the pipe down to the phial catching what drips)
    solid.cylinder(x0 + m(0.7), cz, top, top + m(0.06), m(0.08), m(0.06), material("brass"), { segments: 8 });
    solid.cylinder(x0 + m(0.7), cz, top + m(0.06), top + m(0.3), m(0.015), m(0.015), material("iron"), { segments: 4 });
    solid.cylinder(x0 + m(0.7), cz, top + m(0.3), top + m(0.52), m(0.15), m(0.12), material("glass-green"), { segments: 10 });
    solid.cylinder(x0 + m(0.7), cz, top + m(0.52), top + m(0.62), m(0.04), m(0.02), material("glass-green"), { segments: 6 });
    solid.tube([[x0 + m(0.7), top + m(0.6), cz], [x0 + m(1.05), top + m(0.5), cz], [x0 + m(1.25), top + m(0.2), cz]], m(0.012), material("glass"), { sides: 4 });
    solid.cylinder(x0 + m(1.25), cz, top, top + m(0.18), m(0.06), m(0.05), material("glow-green"), { segments: 8 });

    // (Books open and shut; the crystal ball; a mortar and pestle; candles)
    solid.box(cx - m(0.25), top, z0 + m(0.25), cx + m(0.25), top + m(0.03), z0 + m(0.55), material("parchment"));
    solid.box(cx + m(0.35), top, z1 - m(0.6), cx + m(0.65), top + m(0.12), z1 - m(0.25), material("ledger"));
    solid.cylinder(x1 - m(0.5), z0 + m(0.4), top, top + m(0.08), m(0.09), m(0.07), material("brass"), { segments: 8 });
    solid.cylinder(x1 - m(0.5), z0 + m(0.4), top + m(0.08), top + m(0.26), m(0.1), m(0.1), material("glow-violet"), { segments: 10 });
    solid.cylinder(x1 - m(0.45), z1 - m(0.45), top, top + m(0.1), m(0.08), m(0.1), material("stone-dark"), { segments: 8 });
    solid.box(x1 - m(0.47), top + m(0.06), z1 - m(0.47), x1 - m(0.37), top + m(0.22), z1 - m(0.43), material("timber"));
    candle(solid, cx - m(0.5), z1 - m(0.35), top);
    candle(solid, x1 - m(0.25), cz, top);
}

// A castle keep's undercroft, under its great hall: flagstones; bare walls of its stone; its
// groin vault on four pillars (a pilaster on the walls where a bay meets them); the stairs up to
// the hall along the north wall, the vault open over them; the castle's forge in the north-east
// (as a smithy's works: forgeworks); the quartermaster's armoury beside the stairs, the castle's
// arms on racks on the wall behind their counter, a suit of armour on a stand either side of it;
// the arcanist's corner in the south-west, their shelves of jars and phials behind their counter,
// their worktable and its alembic beside it; barrels along the west wall, strongboxes in the
// south-east corner; lit by the forge, torches on the walls and the arcanist's candles
function undercroft(map) {
    const solid = new Solid();
    const moving = [];
    const [w, h] = [m(map.width), m(map.height)];
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);
    const [stair] = at("stairs");
    const pillars = at("pillar");
    const { spring, crown } = UNDERCROFT;
    const thick = m(THICK);

    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("stone"));
    walledIn(solid, map, "stone", [], []);

    // (Its walls carried up to the vault's crown)
    for (const [x0, z0, x1, z1] of [[-thick, -thick, w + thick, 0], [-thick, h, w + thick, h + thick], [-thick, 0, 0, h], [w, 0, w + thick, h]]) {
        solid.box(x0, m(STOREY), z0, x1, m(crown + 0.3), z1, material("stone", WALL));
    }

    stairs(solid, m(stair.x), m(stair.x + stair.w), m(stair.y), m(stair.y + stair.h), 0, m(STOREY), m(stair.y + stair.h));

    // The vault, bay by bay between the lines of pillars and the walls, open over the stairs
    const lines = [0, ...new Set(pillars.map(({ x }) => x + 0.5)), map.width].sort((a, b) => a - b);
    const rows = [0, ...new Set(pillars.map(({ y }) => y + 0.5)), map.height].sort((a, b) => a - b);
    const hole = [m(stair.x - 0.1), m(stair.y - 0.1), m(stair.x + stair.w + 0.5), m(stair.y + stair.h + 0.4)];

    for (let j = 0; j + 1 < rows.length; j++) {
        for (let i = 0; i + 1 < lines.length; i++) {
            groinVault(solid, [m(lines[i]), m(rows[j]), m(lines[i + 1]), m(rows[j + 1])], hole);
        }
    }

    // Its pillars: square plinths, round shafts and capitals up to where the vault springs; and
    // a pilaster on each wall where a line of them meets it
    for (const pillar of pillars) {
        const [cx, cz] = [m(pillar.x + 0.5), m(pillar.y + 0.5)];

        solid.box(cx - m(0.42), 0, cz - m(0.42), cx + m(0.42), m(0.35), cz + m(0.42), material("stone-dark"));
        solid.cylinder(cx, cz, m(0.35), m(spring - 0.3), m(0.3), m(0.3), material("stone"), { segments: 12 });
        solid.box(cx - m(0.42), m(spring - 0.3), cz - m(0.42), cx + m(0.42), m(spring), cz + m(0.42), material("stone-dark"));
    }

    for (const x of lines.slice(1, -1)) {
        for (const [z0, z1] of [[0, m(0.25)], [h - m(0.25), h]]) {
            solid.box(m(x - 0.3), 0, z0, m(x + 0.3), m(spring), z1, material("stone-dark", WALL));
        }
    }

    for (const z of rows.slice(1, -1)) {
        for (const [x0, x1] of [[0, m(0.25)], [w - m(0.25), w]]) {
            solid.box(x0, 0, m(z - 0.3), x1, m(spring), m(z + 0.3), material("stone-dark", WALL));
        }
    }

    // The forge
    const works = forgeworks(solid, map, moving);

    // The armoury: its racks, its counter, its suits of armour on their stands
    for (const rack of at("rack")) {
        armoury(solid, rack);
    }

    const [armouryDesk, arcaneDesk] = at("counter").sort((a, b) => a.y - b.y);

    desk(solid, armouryDesk, "velvet");
    desk(solid, arcaneDesk, "velvet-purple");

    for (const stand of at("stand")) {
        armourStand(solid, m(stand.x + 0.5), m(stand.y + 0.5), roughOf(stand.x, stand.y));
    }

    // The arcanist's: their shelves and their worktable
    for (const shelf of at("shelves")) {
        phialShelves(solid, shelf);
    }

    // (The arcanist's worktable, and the garrison's long table, a run of squares, its benches)
    for (const piece of at("table")) {
        if (piece.h > 1) {
            worktable(solid, piece);
            continue;
        }

        const [x0, z0, x1, z1] = [m(piece.x), m(piece.y), m(piece.x + piece.w), m(piece.y + piece.h)];

        table(solid, x0, z0 + m(0.1), x1, z1 - m(0.1));
        tankard(solid, x0 + m(0.8), (z0 + z1) / 2, m(0.78), true);
        tankard(solid, x1 - m(1.4), z0 + m(0.3), m(0.78), true);
        candle(solid, (x0 + x1) / 2, (z0 + z1) / 2, m(0.78));
    }

    for (const run of benchRuns(map)) {
        bench(solid, m(run.x), m(run.y), m(run.x + run.w), m(run.y + 1));
    }

    // The stores: barrels on their sides along the west wall, strongboxes in the corner
    for (const barrels of at("barrels")) {
        for (let y = barrels.y; y < barrels.y + barrels.h; y++) {
            cask(solid, m(barrels.x + 0.1), m(y + 0.5), 0, m(0.8), m(0.4));
        }
    }

    for (const box of at("chest")) {
        chest(solid, m(box.x + 0.5), m(box.y + 0.5));
    }

    // Torches on the walls: by the foot of the stairs, the armoury, the arcanist's and the stores
    const torches = [[0.3, 4], [m(armouryDesk.x - 1.5) / M, 0.3], [0.3, arcaneDesk.y - 1], [map.width - 0.3, map.height - 3]].map(([x, z]) => wallTorch(solid, m(x), m(z)));

    return {
        solid,
        moving,
        flames: [...works.fires, ...torches.map(({ fire }) => fire)],
        lights: [works.light, ...torches.map(({ light }) => light)],
        hearth: works.hearth,
    };
}

// --- The places worth finding gone into (core/insides.js: a cave, the dragon's lair, a broken
// watchtower) ---

// Each square its own way (0 to 1: from where it is)
function roughOf(x, y) {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;

    return s - Math.floor(s);
}

// The rock round a cave or a lair: each of its plan's rock squares by open ground a crag from the
// floor to over head height, of two blocks, each square's its own height and lean into the cave,
// cut away as a wall is (in front of the player); and a rock roof over it all, not drawn lower
// than the camera (as a ceiling)
function crags(solid, map, stuff, { low = 2.8, high = 4.2 } = {}) {
    const rock = (x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height || map.plan[y][x] === "#";
    const near = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (!rock(x, y) || near.every(([dx, dy]) => rock(x + dx, y + dy))) {
                continue;
            }

            const [r, s, t] = [roughOf(x, y), roughOf(y + 17, x + 5), roughOf(x + 31, y + 11)];
            const [cx, cz] = [m(x + 0.5), m(y + 0.5)];
            const top = m(low + (high - low) * r);
            // (Leaning out over the floor a little, towards the open ground beside it)
            const [ox, oz] = near.reduce(([sx, sz], [dx, dy]) => (rock(x + dx, y + dy) ? [sx, sz] : [sx + dx, sz + dy]), [0, 0]);
            const lean = Math.hypot(ox, oz) || 1;
            const [lx, lz] = [(ox / lean) * m(0.25), (oz / lean) * m(0.25)];

            solid.turnedBox(cx, cz, m(0.62 + 0.1 * s), m(0.62 + 0.1 * t), 0, top * 0.55, r * 1.2, material(stuff, WALL));
            solid.turnedBox(cx + lx * 0.6, cz + lz * 0.6, m(0.5 + 0.12 * t), m(0.45 + 0.12 * r), top * 0.45, top * 0.85, s * 1.5 + 0.4, material(stuff, WALL));
            solid.turnedBox(cx - lx * 0.3, cz - lz * 0.3, m(0.35 + 0.15 * r), m(0.4 + 0.1 * s), top * 0.8, top, t * 1.4 + 0.9, material(stuff, WALL));
            solid.turnedBox(cx + lx, cz + lz, m(0.3 + 0.15 * s), m(0.25 + 0.12 * t), 0, m(0.3 + 0.5 * t), s * 2.3, material(stuff, WALL));
        }
    }

    solid.box(-m(1), m(high + 0.6), -m(1), m(map.width + 1), m(high + 1), m(map.height + 1), material(stuff, CEILING), { under: material(stuff, CEILING) });
}

// The way out (its door squares, the plan's "D"): daylight in the mouth, the rock over it; and
// the daylight it lets in, a light a little inside it (`bright`: how bright)
function mouth(solid, map, stuff, { wide = 1, bright = 5 } = {}) {
    const doors = map.marks.D;
    const [x0, x1] = [doors[0][0] - wide * 0.1, doors.at(-1)[0] + 1 + wide * 0.1];
    const z = m(map.height);

    solid.facing([[m(x0), 0, z], [m(x1), 0, z], [m(x1), m(2.6), z], [m(x0), m(2.6), z]], [0, 0, -1], material("daylight", WALL));
    solid.box(m(x0) - m(0.3), m(2.4), z - m(0.4), m(x1) + m(0.3), m(3.4), z + 0.3, material(stuff, WALL));

    return { kind: "fire", x: (x0 + x1) / 2, y: 1.8, z: map.height - 1.2, colour: 0xe8eeff, intensity: bright, distance: 12, flicker: 0, seed: 0.5, rate: 0.1, steady: 1 };
}

// A fire on the ground, ringed with stones, logs in it (unless `ringed` is false: a dungeon's, its
// ring, ash and wood the scanned fire pit's) (art pixels: its middle): { fire (fire.js's flames), light }
function campfire(solid, x, z, { ringed = true } = {}) {
    for (let k = 0; k < (ringed ? 9 : 0); k++) {
        const angle = (k / 9) * Math.PI * 2;
        const [sx, sz] = [x + Math.cos(angle) * m(0.42), z + Math.sin(angle) * m(0.42)];

        solid.box(sx - m(0.09), 0, sz - m(0.08), sx + m(0.09), m(0.12 + 0.05 * roughOf(k, x)), sz + m(0.08), material("rock-dark"));
    }

    // (Its embers and logs: the scanned fire pit's own ash and charred wood, if it's that)
    if (ringed) {
        solid.cylinder(x, z, 0, m(0.05), m(0.34), m(0.3), material("embers"), { segments: 10 });
        solid.turnedBox(x, z, m(0.32), m(0.05), m(0.04), m(0.13), 0.5, material("timber"));
        solid.turnedBox(x, z, m(0.32), m(0.05), m(0.08), m(0.17), 2.1, material("timber"));
    }

    const fire = flame(m(0.75), m(0.7), x * 0.013 + z * 0.007, "hearth");

    fire.position.set(x, m(0.05), z);

    return { fire, light: { kind: "fire", x: x / M, y: 0.8, z: z / M, colour: 0xff8a3a, intensity: 9, distance: 13, flicker: 0.3, ...fire.userData.fire } };
}

// A torch in an iron bracket on a wall (art pixels: where it stands, by the wall), its flame and
// its light
function wallTorch(solid, x, z) {
    solid.box(x - 0.3, m(1.55), z - 0.3, x + 0.3, m(2.05), z + 0.3, material("timber"));
    solid.box(x - 0.6, m(1.65), z - 0.6, x + 0.6, m(1.75), z + 0.6, material("iron"));

    const fire = flame(m(0.24), m(0.46), x * 0.031 + z * 0.017, "torch");

    fire.position.set(x, m(2.05), z);

    return { fire, light: { kind: "fire", x: x / M, y: 2.2, z: z / M, colour: 0xffa050, intensity: 4.5, distance: 10, flicker: 0.25, ...fire.userData.fire } };
}

// Where a torch goes by a stretch of open ground's edge: the open square nearest (x, y) that has
// rock or wall beside it, and the way to it
function byTheWall(map, [x, y]) {
    const open = (i, j) => i >= 0 && j >= 0 && i < map.width && j < map.height && !map.blocked[j][i];
    let best = null;

    for (let j = 0; j < map.height; j++) {
        for (let i = 0; i < map.width; i++) {
            if (!open(i, j) || map.plan[j][i] !== ".") {
                continue;
            }

            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (!open(i + dx, j + dy) && map.plan[j + dy]?.[i + dx] === "#") {
                    const apart = Math.hypot(i - x, j - y);

                    if (!best || apart < best.apart) {
                        best = { apart, x: m(i + 0.5 + dx * 0.42), z: m(j + 0.5 + dy * 0.42) };
                    }
                }
            }
        }
    }

    return best;
}

// A bedroll on the ground (art pixels: its middle), a blanket over a hide, a rolled cloak for a
// pillow, along z
function bedroll(solid, x, z, seed) {
    const turn = (seed - 0.5) * 0.5;

    solid.turnedBox(x, z, m(0.38), m(0.95), 0, m(0.04), turn, material("hide"));
    solid.turnedBox(x + m(0.03), z + m(0.15), m(0.33), m(0.7), m(0.04), m(0.1), turn, material(seed > 0.5 ? "wool-blue" : "wool-green"));
    solid.turnedBox(x - Math.sin(turn) * m(0.75), z - Math.cos(turn) * m(0.75), m(0.3), m(0.11), 0, m(0.2), turn, material("linen"));
}

// An outlaws' cave: earth underfoot, rock all round, its mouth bright with daylight; their
// bedrolls and their fire, sacks and a crate by them, torches on the walls of its passage
function cave(map) {
    const solid = new Solid();
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);
    const lights = [];
    const flames = [];

    solid.box(-m(1), -0.5, -m(1), m(map.width + 1), 0, m(map.height + 1), material("mud"));
    crags(solid, map, "rock-dark");
    lights.push(mouth(solid, map, "rock-dark"));

    for (const spot of at("campfire")) {
        const { fire, light } = campfire(solid, m(spot.x + 0.5), m(spot.y + 0.5));

        flames.push(fire);
        lights.push(light);
    }

    for (const roll of at("bedroll")) {
        bedroll(solid, m(roll.x + 0.5), m(roll.y + 0.5), roughOf(roll.x, roll.y));
    }

    // (Sacks of plunder and a crate by the chief)
    const [chief] = map.marks.l ?? [[map.width / 2, 3]];

    solid.box(m(chief[0] - 1.4), 0, m(chief[1] - 1.2), m(chief[0] - 0.6), m(0.7), m(chief[1] - 0.4), material("planks-dark"));
    solid.cylinder(m(chief[0] + 1.6), m(chief[1] - 0.8), 0, m(0.6), m(0.28), m(0.22), material("canvas-sack"), { segments: 8 });
    solid.cylinder(m(chief[0] + 2.1), m(chief[1] - 0.6), 0, m(0.5), m(0.25), m(0.2), material("canvas-sack"), { segments: 8 });

    for (const spot of [[map.width / 2, map.height - 3], [map.width / 2, map.height / 2]]) {
        const wall = byTheWall(map, spot);

        if (wall) {
            const { fire, light } = wallTorch(solid, wall.x, wall.z);

            flames.push(fire);
            lights.push(light);
        }
    }

    return { solid, moving: [], flames, lights, hearth: lights[0] ? { x: lights[0].x, y: 0.5, z: lights[0].z } : null };
}

// The dragon's lair: a great cavern of dark rock, the floor scorched, bones about it, embers
// smouldering in its cracks, the hoard heaped at the back (gold in heaps, coins strewn), its mouth
// bright with daylight
function lair(map) {
    const solid = new Solid();
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);
    const lights = [];

    solid.box(-m(1), -0.5, -m(1), m(map.width + 1), 0, m(map.height + 1), material("basalt"));
    crags(solid, map, "basalt", { low: 4, high: 6 });
    lights.push(mouth(solid, map, "basalt", { wide: 2, bright: 7 }));

    // (Old bones, the scanned ones: dungeondressing.js)
    const props = at("bones").flatMap((heap) => bonesAt(heap.x + 0.5, heap.y + 0.5, { rough: roughOf(heap.x, heap.y) }));

    // The hoard: heaps of gold either side of where the chest stands, coins strewn round them
    const hoard = map.marks.h ?? [];

    if (hoard.length) {
        const [hx, hz] = [m((hoard[0][0] + hoard.at(-1)[0] + 1) / 2), m(hoard[0][1] + 0.5)];

        for (const [dx, dz, r, tall] of [[-1.6, -0.2, 1.1, 0.55], [1.7, 0, 1, 0.5], [-0.6, -0.9, 0.8, 0.4], [0.9, -0.8, 0.7, 0.35]]) {
            solid.cone(hx + m(dx), hz + m(dz), 0, m(tall), m(r), material("gold"), 14);
        }

        for (let k = 0; k < 40; k++) {
            const [a, d] = [roughOf(k, 3) * Math.PI * 2, 1 + roughOf(5, k) * 2.2];

            solid.cylinder(hx + Math.cos(a) * m(d), hz + Math.sin(a) * m(d) * 0.8, 0, m(0.012), m(0.06), m(0.06), material("gold"), { segments: 6 });
        }

        // (Embers smouldering by it, the gold catching their light)
        lights.push({ kind: "fire", x: hx / M, y: 1.4, z: hz / M + 1.5, colour: 0xffa040, intensity: 6, distance: 9, flicker: 0.25, seed: 0.37, rate: 1.4, steady: 0.8 });
    }

    // Embers in the cracks, the dragon's breath's (a glow, flickering)
    for (const [cx, cz] of [[0.3, 0.55], [0.7, 0.4], [0.45, 0.75], [0.62, 0.2]].map(([u, v]) => [map.width * u, map.height * v])) {
        solid.turnedBox(m(cx), m(cz), m(1.2), m(0.12), 0, 0.15, roughOf(cx, cz) * 3, material("embers"));
        lights.push({ kind: "fire", x: cx, y: 0.5, z: cz, colour: 0xff5a20, intensity: 6, distance: 11, flicker: 0.35, seed: cx * 0.1 + cz * 0.3, rate: 1.6, steady: 0.8 });
    }

    return { solid, moving: [], flames: [], lights, hearth: null, props };
}

// A tomb (art pixels from its plan's piece: a run of squares): a chest of stone (`stone`) on a
// plinth, its lid over it, a cross cut in it; now and then the lid pushed askew, the dark inside
// showing
function tomb(solid, tomb, stone) {
    const [x0, z0, x1, z1] = [m(tomb.x + 0.12), m(tomb.y + 0.18), m(tomb.x + tomb.w - 0.12), m(tomb.y + tomb.h - 0.18)];
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const along = x1 - x0 >= z1 - z0;
    const opened = roughOf(tomb.x * 7, tomb.y * 3) > 0.72;

    solid.box(x0 - m(0.06), 0, z0 - m(0.06), x1 + m(0.06), m(0.15), z1 + m(0.06), material("stone-dark"));
    solid.box(x0, m(0.15), z0, x1, m(0.75), z1, material(stone));

    if (opened) {
        solid.box(x0 + m(0.08), m(0.74), z0 + m(0.08), x1 - m(0.08), m(0.76), z1 - m(0.08), material("shadow"));
    }

    const [lx, lz, turn] = opened ? [cx + (along ? m(0.35) : m(0.15)), cz + (along ? m(0.15) : m(0.35)), 0.35] : [cx, cz, 0];
    const [hx, hz] = [(x1 - x0) / 2 + m(0.05), (z1 - z0) / 2 + m(0.05)];

    solid.turnedBox(lx, lz, hx, hz, m(0.75), m(0.9), turn, material("stone"));
    solid.turnedBox(lx, lz, along ? hx * 0.7 : m(0.04), along ? m(0.04) : hz * 0.7, m(0.9), m(0.92), turn, material("stone-dark"));
    solid.turnedBox(lx + (along ? -hx * 0.35 : 0), lz + (along ? 0 : -hz * 0.35), along ? m(0.04) : m(0.22), along ? m(0.22) : m(0.04), m(0.9), m(0.92), turn, material("stone-dark"));
}

// Candles burning in an iron stand (art pixels from its plan's piece), and their light, warm on
// what's round them
function candleStand(solid, stand) {
    const [cx, cz] = [m(stand.x + 0.5), m(stand.y + 0.5)];

    for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.4;

        solid.turnedBox(cx + Math.cos(a) * m(0.18), cz + Math.sin(a) * m(0.18), m(0.025), m(0.025), 0, m(0.95), a, material("iron"));
    }

    solid.cylinder(cx, cz, m(0.95), m(1.0), m(0.32), m(0.28), material("iron"), { segments: 10 });

    for (const [dx, dz] of [[0, 0], [0.16, 0.08], [-0.14, 0.1], [0.05, -0.17]]) {
        candle(solid, cx + m(dx), cz + m(dz), m(1.0));
    }

    return { kind: "fire", x: stand.x + 0.5, y: 1.4, z: stand.y + 0.5, colour: 0xffb060, intensity: 5, distance: 10, flicker: 0.2, seed: roughOf(stand.x, stand.y), rate: 1.1, steady: 0.85 };
}

// How high a crypt's vault is at its crown, and its stair's steps (metres)
const CRYPT = Object.freeze({ tall: 3.4, step: { rise: 0.2, tread: 0.3 }, steps: 13 });

// The crypt under an old hall's ruins: flagstones, its walls of old dressed stone, two tiers of
// burial niches let into them (a skull and bones in some); its vault over all on its pillars, ribs
// across and along from pillar to pillar; the tombs, lidded, a cross cut in each lid, one here and
// there pushed askew on the dark within; bones about; candles burning in iron stands before the
// apse, where the dead's master keeps their chest; and the stair up to the hall at its south end,
// daylight at its head
function crypt(map) {
    const solid = new Solid();
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);
    const stone = "stone-old";
    const tall = m(CRYPT.tall);
    const lights = [];
    const wall = (x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height || map.plan[y][x] === "#";
    const sides = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    solid.box(-m(1), -0.5, -m(1), m(map.width + 1), 0, m(map.height + 1), material("stone"));

    // Its walls: each of its plan's wall squares by open ground, up to the vault; a niche or two
    // in each face of one, now and then, a skull in it
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (!wall(x, y) || sides.every(([dx, dy]) => wall(x + dx, y + dy))) {
                continue;
            }

            solid.box(m(x), 0, m(y), m(x + 1), tall, m(y + 1), material(stone, WALL));

            for (const [dx, dy] of sides) {
                if (wall(x + dx, y + dy) || (y + dy >= map.height - 3 && dy !== 0) || roughOf(x * 3 + dx, y * 5 + dy) < 0.35) {
                    continue;
                }

                // (The face, and along it: the niche's dark mouth just proud of it, a sill under it)
                const face = (u, d) => (dy ? [m(x + u), m(y + 0.5 + dy * (0.5 + d))] : [m(x + 0.5 + dx * (0.5 + d)), m(y + u)]);

                for (const [low, high] of [[0.85, 1.35], [1.75, 2.25]]) {
                    const [[ax, az], [bx, bz]] = [face(0.18, -0.01), face(0.82, 0.02)];
                    const [[sx, sz], [tx, tz]] = [face(0.12, 0), face(0.88, 0.1)];

                    solid.box(Math.min(ax, bx), m(low), Math.min(az, bz), Math.max(ax, bx), m(high), Math.max(az, bz), material("shadow", WALL));
                    solid.box(Math.min(sx, tx), m(low - 0.08), Math.min(sz, tz), Math.max(sx, tx), m(low), Math.max(sz, tz), material("stone-dark", WALL));

                    if (roughOf(x + low, y + dx + dy) > 0.45) {
                        const [kx, kz] = face(0.5, 0.06);

                        solid.box(kx - m(0.09), m(low), kz - m(0.09), kx + m(0.09), m(low + 0.17), kz + m(0.09), material("bone", WALL));
                    }
                }
            }
        }
    }

    // The vault over it all (not drawn lower than the camera, as a ceiling), ribs across it at
    // each row of pillars and along each line of them
    const pillars = at("pillar");
    const rows = [...new Set(pillars.map(({ y }) => y))];
    const lines = [...new Set(pillars.map(({ x }) => x))];

    solid.box(-m(1), tall, -m(1), m(map.width + 1), tall + m(0.4), m(map.height + 1), material(stone, CEILING), { under: material(stone, CEILING) });

    for (const y of rows) {
        solid.box(m(1), tall - m(0.35), m(y + 0.3), m(map.width - 1), tall, m(y + 0.7), material("stone-dark", CEILING));
    }

    for (const x of lines) {
        solid.box(m(x + 0.3), tall - m(0.3), m(Math.min(...rows) + 0.5), m(x + 0.7), tall, m(Math.max(...rows) + 0.5), material("stone-dark", CEILING));
    }

    // Its pillars: plinths, round shafts and capitals up to the ribs
    for (const pillar of pillars) {
        const [cx, cz] = [m(pillar.x + 0.5), m(pillar.y + 0.5)];

        solid.box(cx - m(0.38), 0, cz - m(0.38), cx + m(0.38), m(0.35), cz + m(0.38), material("stone-dark"));
        solid.cylinder(cx, cz, m(0.35), tall - m(0.6), m(0.26), m(0.26), material(stone), { segments: 10 });
        solid.box(cx - m(0.38), tall - m(0.6), cz - m(0.38), cx + m(0.38), tall - m(0.35), cz + m(0.38), material("stone-dark"));
    }

    // The tombs, lidded, now and then pushed askew
    for (const piece of at("tomb")) {
        tomb(solid, piece, stone);
    }

    // (Old bones, the scanned ones: dungeondressing.js)
    const props = at("bones").flatMap((heap) => bonesAt(heap.x + 0.5, heap.y + 0.5, { rough: roughOf(heap.x, heap.y) }));

    // Candles burning in iron stands, their light warm on the stone
    for (const stand of at("candles")) {
        lights.push(candleStand(solid, stand));
    }

    // The stair up to the hall from its door, under its own vault, daylight at its head
    const doors = map.marks.D;
    const [x0, x1] = [m(doors[0][0] - 0.1), m(doors.at(-1)[0] + 1.1)];
    const { rise, tread } = CRYPT.step;
    const z = m(map.height);

    for (let k = 0; k < CRYPT.steps; k++) {
        solid.box(x0, -m(0.5), z + m(k * tread), x1, m((k + 1) * rise), z + m((k + 1) * tread), material(stone), { top: material("stone") });
    }

    const top = m(CRYPT.steps * rise);
    const end = z + m(CRYPT.steps * tread);

    for (const [a, b] of [[x0 - m(0.6), x0], [x1, x1 + m(0.6)]]) {
        solid.box(a, 0, z, b, top + m(2.6), end + m(0.6), material(stone, WALL));
    }

    solid.box(x0 - m(0.6), m(2.4), z - m(0.2), x1 + m(0.6), top + m(3), end + m(0.6), material(stone, CEILING), { under: material(stone, CEILING) });
    solid.facing([[x0, top, end], [x1, top, end], [x1, top + m(2.4), end], [x0, top + m(2.4), end]], [0, 0, -1], material("daylight", WALL));
    lights.push({ kind: "fire", x: (x0 + x1) / 2 / M, y: 2.2, z: map.height + 0.6, colour: 0xe8eeff, intensity: 4, distance: 9, flicker: 0, seed: 0.5, rate: 0.1, steady: 1 });

    return { solid, moving: [], flames: [], lights, hearth: null, props };
}

// How high a ruined keep's walls still stand round its hall, at the least and the most (metres)
const RUIN_WALL = Object.freeze({ low: 3.2, high: 9 });

// An iron brazier on three legs (art pixels: where it stands), its coals and its fire, and its light
function brazier(solid, x, z, seed) {
    for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;

        solid.turnedBox(x + Math.cos(a) * m(0.22), z + Math.sin(a) * m(0.22), m(0.04), m(0.04), 0, m(0.7), a, material("iron"));
    }

    solid.cylinder(x, z, m(0.62), m(0.82), m(0.18), m(0.36), material("iron"), { segments: 12 });
    solid.cylinder(x, z, m(0.8), m(0.84), m(0.32), m(0.32), material("embers"), { segments: 12 });

    const fire = flame(m(0.55), m(0.6), seed, "hearth");

    fire.position.set(x, m(0.84), z);

    return { fire, light: { kind: "fire", x: x / M, y: 1.5, z: z / M, colour: 0xff9a40, intensity: 7, distance: 12, flicker: 0.3, ...fire.userData.fire } };
}

// A ruined castle's keep's great hall, open to the sky: its flagstones, its old stone walls broken
// off along their tops, high and low, the light through tall windows where they still stand high
// enough; two rows of pillars, some broken off short; heaps of what fell from its floors and roof,
// charred joists lying across them; bones about; at the back the dais and its two thrones of
// stone, one toppled; braziers burning either side of it, where the wight lord keeps its hoard; the
// land outside seen over the walls
function ruin(map) {
    const solid = new Solid();
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);
    const stone = "stone-old";
    const [w, h] = [m(map.width), m(map.height)];
    const wall = (x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height || map.plan[y][x] === "#";
    const sides = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    // (How high the wall still stands at a square, rising and falling along it)
    const topAt = (x, y) => m(RUIN_WALL.low + (RUIN_WALL.high - RUIN_WALL.low) * (0.5 + 0.3 * Math.sin(x * 0.7 + y * 0.45) + 0.2 * Math.sin(x * 1.9 - y * 1.3 + 1.7)));

    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("cobbles"));
    solid.box(-m(60), -m(0.6), -m(60), w + m(60), -m(0.5), h + m(60), material("grass"));

    // (Grass come up between the flagstones here and there, in tufts turned this way and that)
    for (let k = 0; k < 40; k++) {
        const [x, z] = [1.5 + roughOf(k, 3) * (map.width - 3), 1.5 + roughOf(7, k) * (map.height - 4)];

        for (let t = 0; t < 3; t++) {
            const [dx, dz] = [roughOf(k, t + 5) - 0.5, roughOf(t + 9, k) - 0.5];

            solid.turnedBox(m(x + dx * 0.8), m(z + dz * 0.8), m(0.12 + 0.2 * roughOf(k + t, 2)), m(0.08 + 0.14 * roughOf(4, k + t)), 0, 0.06 + 0.04 * t, roughOf(k * 3, t) * Math.PI, material("grass"));
        }
    }

    // Its walls, broken off along their tops; a window through each stretch high enough, the
    // daylight through it
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (!wall(x, y) || map.plan[y]?.[x] === "D" || sides.every(([dx, dy]) => wall(x + dx, y + dy))) {
                continue;
            }

            const top = topAt(x, y);

            solid.box(m(x), 0, m(y), m(x + 1), top, m(y + 1), material(stone, WALL));

            for (const [dx, dy] of sides) {
                if (wall(x + dx, y + dy) || (x + y) % 4 !== 0 || top < m(5.2) || y + dy >= map.height - 1) {
                    continue;
                }

                const face = dy ? m(y + 0.5 + dy * 0.51) : m(x + 0.5 + dx * 0.51);
                const quad = dy
                    ? [[m(x + 0.15), m(1.8), face], [m(x + 0.85), m(1.8), face], [m(x + 0.85), m(4.2), face], [m(x + 0.15), m(4.2), face]]
                    : [[face, m(1.8), m(y + 0.15)], [face, m(1.8), m(y + 0.85)], [face, m(4.2), m(y + 0.85)], [face, m(4.2), m(y + 0.15)]];

                solid.facing(quad, [dx, 0, dy], material("daylight", WALL));
            }
        }
    }

    // Its pillars: some whole to their capitals, some broken off short
    for (const pillar of at("pillar")) {
        const [cx, cz] = [m(pillar.x + 0.5), m(pillar.y + 0.5)];
        const broken = roughOf(pillar.x * 3, pillar.y * 7) > 0.55;
        const tall = broken ? m(1.2 + 2 * roughOf(pillar.y, pillar.x)) : m(6.5);

        solid.box(cx - m(0.42), 0, cz - m(0.42), cx + m(0.42), m(0.35), cz + m(0.42), material("stone-dark"));
        solid.cylinder(cx, cz, m(0.35), tall, m(0.3), m(0.3), material(stone), { segments: 10 });

        if (broken) {
            solid.turnedBox(cx + m(0.05), cz, m(0.26), m(0.2), tall, tall + m(0.25), roughOf(pillar.x, 9) * 3, material(stone));
        } else {
            solid.box(cx - m(0.44), tall, cz - m(0.44), cx + m(0.44), tall + m(0.4), cz + m(0.44), material("stone-dark"));
        }
    }

    // Heaps of what fell, a charred joist across each
    for (const heap of at("rubble")) {
        for (const [x, y] of heap.squares) {
            const [cx, cz] = [m(x + 0.5), m(y + 0.5)];

            solid.cone(cx, cz, 0, m(0.55 + 0.25 * roughOf(x, y)), m(0.75), material("rubble-old"), 7);

            for (let k = 0; k < 4; k++) {
                const size = m(0.18 + 0.16 * roughOf(x + k, y));
                const [bx, bz] = [cx + m(roughOf(k, x) - 0.5) * 1.1, cz + m(roughOf(y, k) - 0.5) * 1.1];

                solid.turnedBox(bx, bz, size, size * 0.8, 0, size * 1.3 + m(0.1 * k), roughOf(k, y) * 3, material(stone));
            }
        }

        const [x, y] = heap.squares[0];
        const turn = roughOf(x * 5, y) * Math.PI;

        solid.turnedBox(m(x + 0.5 + Math.cos(turn) * 1.4), m(y + 0.5 + Math.sin(turn) * 1.4), m(2.2), m(0.13), 0, m(0.7), turn, material("timber-char"));
    }

    // (Old bones, the scanned ones: dungeondressing.js)
    const props = at("bones").flatMap((heap) => bonesAt(heap.x + 0.5, heap.y + 0.5, { rough: roughOf(heap.x, heap.y) }));

    // The dais and its thrones, the second toppled on its back
    const lights = [];
    const flames = [];
    const thrones = at("throne");

    if (thrones.length) {
        const [x0, x1] = [m(Math.min(...thrones.map(({ x }) => x)) - 1), m(Math.max(...thrones.map(({ x }) => x)) + 2)];

        solid.box(x0, 0, m(0.5), x1, m(0.3), m(2.4), material("stone-dark"));

        thrones.forEach((throne, k) => {
            const [cx, cz] = [m(throne.x + 0.5), m(throne.y + 0.5)];

            if (k === 0) {
                solid.box(cx - m(0.4), m(0.3), cz - m(0.3), cx + m(0.4), m(0.8), cz + m(0.3), material(stone));
                solid.box(cx - m(0.42), m(0.3), cz - m(0.42), cx + m(0.42), m(2.4), cz - m(0.28), material(stone));
            } else {
                solid.turnedBox(cx + m(0.3), cz + m(0.5), m(0.4), m(1.1), m(0.3), m(0.75), 0.25, material(stone));
            }
        });

        // (A brazier burning either side of it)
        for (const x of [Math.min(...thrones.map((one) => one.x)) - 2, Math.max(...thrones.map((one) => one.x)) + 3]) {
            const { fire, light } = brazier(solid, m(x + 0.5), m(2.5), x * 0.37);

            flames.push(fire);
            lights.push(light);
        }
    }

    // (The sky over it, the sun on it)
    lighting.daylight = [0.45, 1, 0.35];

    return { solid, moving: [], flames, lights, hearth: null, open: true, props };
}

// A broken watchtower below: flagstones, its walls of old stone, the stairs up along the north
// wall, rubble in the corners, a torch by the door; its floor above carried on beams. A people's,
// kept (`look` "kept"): its walls their stone, its door shut behind, the racks of their arms by
// the stairs, a table and benches, barrels, a torch either side, no rubble
function tower(map) {
    const solid = new Solid();
    const [w, h] = [m(map.width), m(map.height)];
    const kept = map.look === "kept";
    const stone = kept ? "stone" : "stone-old";
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);
    const stair = at("stairs")[0];
    const doors = map.marks.D;
    const doorMiddle = (doors[0][0] + doors.at(-1)[0] + 1) / 2;

    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("stone"));
    walledIn(solid, map, stone, [{ side: "s", from: doorMiddle - 0.8, to: doorMiddle + 0.8, lintel: 2.3 }], []);
    stairs(solid, m(stair.x), m(stair.x + stair.w), m(stair.y), m(stair.y + stair.h), 0, m(STOREY), m(stair.y + stair.h));
    ceiling(solid, map, [m(stair.x), m(stair.y), m(stair.x + stair.w), m(stair.y + stair.h)]);

    if (kept) {
        solid.box(m(doorMiddle - 0.8), 0, h - 0.2, m(doorMiddle + 0.8), m(2.3), h + 0.4, material("planks-dark", WALL));

        for (const rack of at("rack")) {
            armoury(solid, rack);
        }

        for (const piece of at("table")) {
            const [x0, z0, x1, z1] = [m(piece.x), m(piece.y), m(piece.x + piece.w), m(piece.y + piece.h)];

            table(solid, x0, z0 + m(0.1), x1, z1 - m(0.1));
            tankard(solid, x0 + m(0.6), (z0 + z1) / 2, m(0.78), true);
            tankard(solid, x1 - m(0.8), z0 + m(0.35), m(0.78), true);
            candle(solid, (x0 + x1) / 2, (z0 + z1) / 2, m(0.78));
        }

        for (const run of benchRuns(map)) {
            bench(solid, m(run.x), m(run.y), m(run.x + run.w), m(run.y + 1));
        }

        for (const barrels of at("barrels")) {
            for (let y = barrels.y; y < barrels.y + barrels.h; y++) {
                cask(solid, m(barrels.x + 0.1), m(y + 0.5), 0, m(0.8), m(0.4));
            }
        }
    } else {
        for (const [x, z] of [[map.width - 1.2, map.height - 1.6], [0.8, map.height - 2.4], [map.width - 1.4, 3.4]]) {
            for (let k = 0; k < 4; k++) {
                const [dx, dz, size] = [roughOf(x, k) - 0.5, roughOf(k, z) - 0.5, 0.18 + 0.2 * roughOf(x + k, z)];

                solid.box(m(x + dx * 0.8 - size), 0, m(z + dz * 0.8 - size), m(x + dx * 0.8 + size), m(size * 1.4), m(z + dz * 0.8 + size), material("stone-old"));
            }
        }
    }

    const torches = kept ? [doorMiddle - 1.6, doorMiddle + 1.6] : [doorMiddle + 1.6];
    const lit = torches.map((x) => wallTorch(solid, m(x), h - m(0.45)));

    return { solid, moving: [], flames: lit.map(({ fire }) => fire), lights: lit.map(({ light }) => light), hearth: null };
}

// How far a watchtower's top is over the ground round it (metres)
const TOWER_TALL = 11;

// A broken watchtower's top: boards over the floor below, the stairs coming up through them, its
// parapet broken (its merlons fallen here and there), rubble on it, open to the sky. A people's,
// kept: its parapet whole, a brazier burning on it
function towerTop(map) {
    const solid = new Solid();
    const kept = map.look === "kept";
    const stone = kept ? "stone" : "stone-old";
    const [w, h] = [m(map.width), m(map.height)];
    const stair = map.pieces.find((piece) => piece.kind === "stairs");
    const [hole0, hole1, well0, well1] = [m(stair.x), m(stair.x + stair.w), m(stair.y), m(stair.y + stair.h)];

    solid.box(-m(0.3), -0.5, -m(0.3), hole0, 0, h + m(0.3), material("planks"));
    solid.box(hole1, -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("planks"));
    solid.box(hole0, -0.5, well1, hole1, 0, h + m(0.3), material("planks"));
    stairs(solid, hole0, hole1, well0, well1, -m(STOREY), 0, well1);

    // (The stairwell down a dark well: the floor below, and its walls)
    solid.box(hole0, -m(STOREY) - 0.5, well0, hole1, -m(STOREY), well1, material("stone"));
    solid.box(hole0 - 0.5, -m(STOREY), well0 - 0.5, hole1, -0.5, well0, material(stone));
    solid.box(hole1, -m(STOREY), well0, hole1 + 0.5, -0.5, well1, material(stone));
    solid.box(hole0 - 0.5, -m(STOREY), well0, hole0, -0.5, well1, material(stone));

    // (Its walls falling away to the ground below, far down, where the parapet's looked over)
    const thick = m(0.5);
    const fall = m(TOWER_TALL);

    solid.box(-thick, -fall, -thick, w + thick, -0.5, h + thick, material(stone));
    solid.box(-m(120), -fall - 0.5, -m(120), m(map.width + 120), -fall, m(map.height + 120), material("grass"));

    // The parapet, a merlon every metre and a half, some fallen (none on a kept one)

    for (const [x0, z0, x1, z1] of [[-thick, -thick, w + thick, 0], [-thick, h, w + thick, h + thick], [-thick, 0, 0, h], [w, 0, w + thick, h]]) {
        solid.box(x0, 0, z0, x1, m(1), z1, material(stone, WALL));

        const along = x1 - x0 > z1 - z0;
        const length = along ? x1 - x0 : z1 - z0;

        for (let s = m(0.4); s < length - m(0.6); s += m(1.5)) {
            if (!kept && roughOf(x0 + s, z0 + s) < 0.3) {
                continue;
            }

            const tall = kept ? m(1.75) : m(1.6 + 0.3 * roughOf(s, x0));

            if (along) {
                solid.box(x0 + s, m(1), z0, x0 + s + m(0.7), tall, z1, material(stone, WALL));
            } else {
                solid.box(x0, m(1), z0 + s, x1, tall, z0 + s + m(0.7), material(stone, WALL));
            }
        }
    }

    // (A kept one's brazier: an iron bowl on three legs, its coals and its fire)
    const fires = [];

    for (const piece of map.pieces.filter((each) => each.kind === "campfire")) {
        const [x, z] = [m(piece.x + 0.5), m(piece.y + 0.5)];

        for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2;

            solid.turnedBox(x + Math.cos(a) * m(0.22), z + Math.sin(a) * m(0.22), m(0.04), m(0.04), 0, m(0.7), a, material("iron"));
        }

        solid.cylinder(x, z, m(0.62), m(0.82), m(0.18), m(0.36), material("iron"), { segments: 12 });
        solid.cylinder(x, z, m(0.8), m(0.84), m(0.32), m(0.32), material("embers"), { segments: 12 });

        const fire = flame(m(0.55), m(0.6), x * 0.011 + z * 0.019, "hearth");

        fire.position.set(x, m(0.84), z);
        fires.push({ fire, light: { kind: "fire", x: x / M, y: 1.5, z: z / M, colour: 0xff9a40, intensity: 7, distance: 12, flicker: 0.3, ...fire.userData.fire } });
    }

    for (const piece of map.pieces.filter((each) => each.kind === "rock")) {
        for (const [x, y] of piece.squares) {
            for (let k = 0; k < 3; k++) {
                const size = 0.2 + 0.18 * roughOf(x + k, y);

                solid.box(m(x + 0.3 + 0.4 * roughOf(k, x) - size), 0, m(y + 0.3 + 0.4 * roughOf(y, k) - size), m(x + 0.3 + 0.4 * roughOf(k, x) + size), m(size * 1.3 + 0.1 * k), m(y + 0.3 + 0.4 * roughOf(y, k) + size), material("stone-old"));
            }
        }
    }

    // (The sky over it, the sun on it)
    lighting.daylight = [0.45, 1, 0.35];

    return { solid, moving: [], flames: fires.map(({ fire }) => fire), lights: fires.map(({ light }) => light), hearth: null, open: true };
}

// --- A dungeon's levels (core/dungeons: docs/DUNGEONS.md) ---

// How each theme's levels are drawn (by its look: core/dungeons/themes.js): its rock as one surface
// (`shell`: caverns.js SHELLS) or its walls of dressed stone (`walls`, `tall` metres high, a vault
// over them); the pictures they're drawn with (`picture`, and underfoot `underfoot`: dungeons3d.js
// ROCK_PICTURES) in the colours `tint` and `ground` (the pictures' own, if not given); what its
// heaps of fallen stuff are (`rubble`, and `rock` the stuff of what stands up from its floor); and
// whether its tunnels are shored up with timber (an outlaws' hideout's)
const DUNGEON_LOOKS = Object.freeze({
    caves: { rock: "rock-dark", shell: "caves", picture: "rock-cave", underfoot: "ground-cave", rubble: "rock-dark", tint: 0x6f665c, ground: 0x5d554b },
    hideout: { rock: "rock", shell: "dug", picture: "rock-dug", underfoot: "ground-dug", rubble: "rock", shored: true, ground: 0x6e5440 },
    ancient: { walls: "stone-old", tall: 4.2, rubble: "rubble-old", picture: "stone-temple", underfoot: "floor-temple" },
});

// A flight of a dungeon's stairs: how many steps, how far each goes up or down, and how deep the
// stone under the floor goes either side of one going down (metres)
const FLIGHT = Object.freeze({ steps: 6, rise: 0.32, deep: 2.6 });

// An outlaws' hideout's shoring: across a tunnel no wider than `widest` squares, every `every`
// squares along it, `tall` metres to the cap
const SHORING = Object.freeze({ widest: 6, every: 4, tall: 2.5 });

// A level's floor (`blocks`: dungeons3d.js's, metres), all but where a flight of stairs goes down
// through it (`hole`: its plan's piece, or none)
function floorAround(blocks, map, hole) {
    const [w, h] = [map.width + 1, map.height + 1];

    if (!hole) {
        blocks.box(-1, -0.1, -1, w, 0, h);

        return;
    }

    const [x0, z0, x1, z1] = [hole.x, hole.y, hole.x + hole.w, hole.y + hole.h];

    blocks.box(-1, -0.1, -1, w, 0, z0);
    blocks.box(-1, -0.1, z1, w, 0, h);
    blocks.box(-1, -0.1, z0, x0, 0, z1);
    blocks.box(x1, -0.1, z0, w, 0, z1);
}

// A level's walls of dressed stone (`blocks`: dungeons3d.js's, metres; `tall` metres high): each
// run along a row of its plan's rock squares by open ground as one, a plinth of darker stone along
// its foot and a cornice under the vault; and the vault over all
function dressedWalls(blocks, map, { tall }) {
    const rock = (x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height || map.plan[y][x] === "#";
    const near = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    const edge = (x, y) => rock(x, y) && near.some(([dx, dy]) => !rock(x + dx, y + dy));

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (!edge(x, y)) {
                continue;
            }

            let end = x;

            while (end + 1 < map.width && edge(end + 1, y)) {
                end++;
            }

            blocks.box(x, 0, y, end + 1, tall, y + 1, 0.85 + 0.15 * roughOf(x, y));
            blocks.box(x - 0.08, 0, y - 0.08, end + 1.08, 0.35, y + 1.08, 0.55);
            blocks.box(x - 0.1, tall - 0.3, y - 0.1, end + 1.1, tall, y + 1.1, 0.6);
            x = end;
        }
    }

    blocks.box(-1, tall, -1, map.width + 1, tall + 0.4, map.height + 1, 0.7);
}

// A flight of stairs dug into a level's rock (its plan's piece) from the landing before it: down
// through the floor to the next level (`down`), or up into the rock to the one above; the dark it
// goes on into at its far end (in front of the rock by `inset` metres), and going down, the stone
// either side of it and beyond it under the floor
function flight(solid, map, piece, stuff, { down, inset }) {
    const landing = map.marks[down ? ">" : "<"] ?? [];
    const mean = (k) => landing.reduce((sum, square) => sum + square[k] + 0.5, 0) / Math.max(1, landing.length);
    const [lx, ly] = landing.length ? [mean(0), mean(1)] : [map.width / 2, map.height / 2];
    const [px, py] = [piece.x + piece.w / 2, piece.y + piece.h / 2];
    const alongX = Math.abs(px - lx) > Math.abs(py - ly);
    const sign = (alongX ? px - lx : py - ly) >= 0 ? 1 : -1;
    const length = alongX ? piece.w : piece.h;
    const start = alongX ? piece.x + (sign > 0 ? 0 : piece.w) : piece.y + (sign > 0 ? 0 : piece.h);
    const [a0, a1] = alongX ? [piece.y, piece.y + piece.h] : [piece.x, piece.x + piece.w];
    const stone = material(stuff);
    // (A box from `u0` to `u1` squares along the flight from its start, `c0` to `c1` across, `y0`
    // up to `y1` metres)
    const span = (u0, u1, c0, c1, y0, y1) => {
        const [p, q] = [start + sign * u0, start + sign * u1].sort((a, b) => a - b);

        if (alongX) {
            solid.box(m(p), m(y0), m(c0), m(q), m(y1), m(c1), stone);
        } else {
            solid.box(m(c0), m(y0), m(p), m(c1), m(y1), m(q), stone);
        }
    };
    const way = down ? -1 : 1;
    const tread = length / FLIGHT.steps;

    for (let k = 0; k < FLIGHT.steps; k++) {
        span(k * tread, (k + 1) * tread, a0, a1, down ? -FLIGHT.deep : 0, way * FLIGHT.rise * (k + 1));
    }

    if (down) {
        span(0, length + 0.4, a0 - 0.4, a0, -FLIGHT.deep, 0);
        span(0, length + 0.4, a1, a1 + 0.4, -FLIGHT.deep, 0);
        span(length, length + 0.4, a0, a1, -FLIGHT.deep, 0);
    }

    const far = start + sign * (length - inset);
    const [foot, head] = down ? [-FLIGHT.rise * FLIGHT.steps, 0] : [FLIGHT.rise * FLIGHT.steps, FLIGHT.rise * FLIGHT.steps + 2.3];
    const quad = alongX
        ? [[m(far), m(foot), m(a0)], [m(far), m(foot), m(a1)], [m(far), m(head), m(a1)], [m(far), m(head), m(a0)]]
        : [[m(a0), m(foot), m(far)], [m(a1), m(foot), m(far)], [m(a1), m(head), m(far)], [m(a0), m(head), m(far)]];

    solid.facing(quad, alongX ? [-sign, 0, 0] : [0, 0, -sign], material("shadow"));
}

// An outlaws' hideout's tunnels shored up: every few squares along a tunnel (open ground between
// rock, clear of every room's bounds), a post against the rock either side and a cap across between
// them (`blocks`: dungeons3d.js's, metres)
function shoring(blocks, map) {
    const open = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.plan[y][x] !== "#";
    const roomed = new Uint8Array(map.width * map.height);
    const tall = SHORING.tall;

    for (const room of map.dungeon?.rooms ?? []) {
        for (let y = room.y; y < room.y + room.h; y++) {
            roomed.fill(1, y * map.width + room.x, y * map.width + room.x + room.w);
        }
    }

    // (Across a tunnel running north and south, along a row; then across one running east and
    // west, along a column: `u` across, `v` along)
    for (const across of [true, false]) {
        const at = (u, v) => (across ? [u, v] : [v, u]);
        const box = (u0, u1, v0, v1, y0, y1, shade) => (across ? blocks.box(u0, y0, v0, u1, y1, v1, shade) : blocks.box(v0, y0, u0, v1, y1, u1, shade));
        const [wide, long] = across ? [map.width, map.height] : [map.height, map.width];

        for (let v = SHORING.every; v < long - 1; v += SHORING.every) {
            for (let u = 0; u < wide; u++) {
                if (!open(...at(u, v)) || open(...at(u - 1, v))) {
                    continue;
                }

                let end = u;

                while (open(...at(end + 1, v))) {
                    end++;
                }

                // (Only open ground, no room's, and going on either side of it: a tunnel's)
                const run = Array.from({ length: end - u + 1 }, (_, k) => at(u + k, v));
                const middle = Math.floor((u + end) / 2);
                const tunnel = run.length <= SHORING.widest && run.every(([x, y]) => map.plan[y][x] === "." && !roomed[y * map.width + x]) && open(...at(middle, v - 1)) && open(...at(middle, v + 1));

                if (tunnel) {
                    // (The posts set back into the rock's hollows, as the rock stands back from the
                    // open ground: caverns.js)
                    box(u - 0.45, u - 0.15, v + 0.35, v + 0.65, -0.1, tall, 0.9);
                    box(end + 1.15, end + 1.45, v + 0.35, v + 0.65, -0.1, tall, 0.9);
                    box(u - 0.5, end + 1.5, v + 0.32, v + 0.68, tall - 0.25, tall, 0.75);
                }

                u = end;
            }
        }
    }
}

// Rock standing up from a cave's floor (art pixels: where), each its own way (`rough`, 0 to 1),
// and rock hanging over it from the roof (`roof`: how high)
function stalagmite(solid, x, z, rough, stuff, roof) {
    const tall = m(1.1 + 1.6 * rough);

    solid.cone(x, z, 0, tall, m(0.42 + 0.12 * rough), material(stuff), 7);
    solid.cone(x + m(0.3), z - m(0.2), 0, tall * 0.55, m(0.26), material(stuff), 6);
    solid.cylinder(x - m(0.1), z + m(0.1), roof - m(0.7 + 0.9 * (1 - rough)), roof, 0, m(0.3), material(stuff), { segments: 6 });
}

// A rack of spears and axes standing free (art pixels from its plan's piece), along its longer side
function weaponRack(solid, piece) {
    const along = piece.w >= piece.h;
    const [x0, z0, x1, z1] = [m(piece.x + 0.15), m(piece.y + 0.15), m(piece.x + piece.w - 0.15), m(piece.y + piece.h - 0.15)];
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const length = along ? x1 - x0 : z1 - z0;
    const at = (s, d = 0) => (along ? [x0 + s, cz + d] : [cx + d, z0 + s]);

    for (const s of [0, length]) {
        const [x, z] = at(s);

        solid.box(x - 0.4, 0, z - 0.4, x + 0.4, m(1.7), z + 0.4, material("timber"));
    }

    for (const y of [0.35, 1.45]) {
        const [[ax, az], [bx, bz]] = [at(0, -0.3), at(length, 0.3)];

        solid.box(Math.min(ax, bx), m(y), Math.min(az, bz), Math.max(ax, bx), m(y + 0.08), Math.max(az, bz), material("timber"));
    }

    for (let s = m(0.3), k = 0; s < length - m(0.2); s += m(0.32), k++) {
        const [x, z] = at(s);

        solid.cylinder(x, z, m(0.35), m(2.1), m(0.03), m(0.03), material("timber-light"), { segments: 5 });
        solid.cylinder(x, z, m(2.1), m(2.35), m(0.05), 0, material("iron"), { segments: 5 });

        if (k % 2) {
            solid.turnedBox(x, z, m(0.14), m(0.02), m(1.3), m(1.6), along ? 0 : Math.PI / 2, material("iron"));
        }
    }
}

// An ancient temple's altar (`blocks`: dungeons3d.js's, of the theme's stone, metres, from its
// plan's piece): a block of stone on a darker step, a darker slab over it, stained, candles burning
// at its ends (`solid`'s, art pixels)
function altarStone(blocks, solid, piece) {
    const [x0, z0, x1, z1] = [piece.x + 0.1, piece.y + 0.15, piece.x + piece.w - 0.1, piece.y + piece.h - 0.15];
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const along = x1 - x0 >= z1 - z0;

    blocks.box(x0 - 0.2, 0, z0 - 0.2, x1 + 0.2, 0.18, z1 + 0.2, 0.6);
    blocks.box(x0 + 0.1, 0.18, z0 + 0.1, x1 - 0.1, 0.9, z1 - 0.1, 1);
    blocks.box(x0, 0.9, z0, x1, 1.04, z1, 0.75);
    solid.box(m(cx - 0.35), m(1.04), m(cz - 0.25), m(cx + 0.35), m(1.045), m(cz + 0.25), material("shadow"));

    for (const s of [0.18, 0.82]) {
        const [x, z] = along ? [x0 + (x1 - x0) * s, cz] : [cx, z0 + (z1 - z0) * s];

        candle(solid, m(x), m(z), m(1.04));
    }
}

// A tomb of a dungeon's stone (`blocks`: dungeons3d.js's, metres, from its plan's piece): its
// plinth, its chest, its lid with a cross cut in it; now and then the lid pushed askew on the dark
// within (`solid`'s, art pixels)
function stoneTomb(blocks, solid, piece) {
    const [x0, z0, x1, z1] = [piece.x + 0.12, piece.y + 0.18, piece.x + piece.w - 0.12, piece.y + piece.h - 0.18];
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const along = x1 - x0 >= z1 - z0;
    const opened = roughOf(piece.x * 7, piece.y * 3) > 0.72;

    blocks.box(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.15, z1 + 0.06, 0.6);
    blocks.box(x0, 0.15, z0, x1, 0.75, z1, 1);

    if (opened) {
        solid.box(m(x0 + 0.08), m(0.74), m(z0 + 0.08), m(x1 - 0.08), m(0.76), m(z1 - 0.08), material("shadow"));
    }

    const [lx, lz, turn] = opened ? [cx + (along ? 0.35 : 0.15), cz + (along ? 0.15 : 0.35), 0.35] : [cx, cz, 0];
    const [hx, hz] = [(x1 - x0) / 2 + 0.05, (z1 - z0) / 2 + 0.05];
    // (A bar of the cross, cut a little into the lid's top: darker)
    const bar = (x, z, wx, wz) => blocks.box(x - wx, 0.9, z - wz, x + wx, 0.92, z + wz, 0.45, turn);

    blocks.box(lx - hx, 0.75, lz - hz, lx + hx, 0.9, lz + hz, 1.1, turn);
    bar(lx, lz, along ? hx * 0.7 : 0.04, along ? 0.04 : hz * 0.7);
    bar(lx + (along ? -hx * 0.35 : 0), lz + (along ? 0 : -hz * 0.35), along ? 0.04 : 0.22, along ? 0.22 : 0.04);
}

// --- A dungeon's furniture: the scanned models (dungeons3d.js furnish), placed in metres ---

// The way from a square of a level's plan to the rock beside it ([dx, dy]), or null if there's
// none; and the turn (radians) that faces a model (its front along +z) away from that rock
function rockBeside(map, x, y) {
    return [[0, -1], [-1, 0], [1, 0], [0, 1]].find(([dx, dy]) => map.plan[y + dy]?.[x + dx] === "#") ?? null;
}

const facingFrom = ([dx, dy]) => Math.atan2(-dx, -dy);

// Rough tables along a plan's table piece, end to end, each a scanned table (the rough one or the
// plank one) made the piece's width and as long as its share (`fit`: its own length, height and
// width), stools drawn up to them, what's eaten and drunk set out on them (dungeondressing.js),
// tankards among it, and an axe laid on the first now and then (art pixels: `solid`'s)
function tableRun(solid, piece, rough) {
    const along = piece.w >= piece.h;
    const [length, depth] = along ? [piece.w, piece.h] : [piece.h, piece.w];
    const count = Math.max(1, Math.round(length / 1.5));
    const each = length / count;
    const placed = [];

    for (let k = 0; k < count; k++) {
        const [u, v] = [(k + 0.5) * each, depth / 2];
        const [x, z] = along ? [piece.x + u, piece.y + v] : [piece.x + v, piece.y + u];
        const top = 0.8;

        placed.push({ model: roughOf(piece.x + k, piece.y) > 0.6 ? "table-plank" : "table", x, z, fit: [each - 0.08, top, depth - 0.14], turn: along ? 0 : Math.PI / 2 });
        placed.push(...onTable(x, z, { along, length: each - 0.1, depth: depth - 0.15, top, rough: rough + k }), ...seatsAt(x, z, { along, length: each, depth: depth - 0.14, rough: rough + k }));

        if (roughOf(piece.x + k, piece.y + 1) > 0.5) {
            const w = (roughOf(1, k + piece.x) - 0.5) * (each - 0.5);

            tankard(solid, m(along ? x + w : x + 0.1), m(along ? z + 0.1 : z + w), m(top), true);
        }
    }

    if (rough > 0.4) {
        placed.push({ model: "axe", on: placed[0], x: placed[0].x, z: placed[0].z, size: 0.7, roll: Math.PI / 2, turn: rough * 5 });
    }

    return placed;
}

// Crates of plunder (metres: where), one on another now and then
function crateStack(x, z, rough) {
    const turn = (rough - 0.5) * 0.8;
    const crates = ["crate", "crate", "crate-long", "crate-big"];
    const below = { model: crates[Math.floor(hashOf(x, z, 1) * crates.length)], x, z, size: 1.05, turn };
    const above = rough > 0.45 ? { model: rough > 0.8 ? "basket-lidded" : crates[Math.floor(hashOf(x, z, 2) * 3)], on: below, x: x + 0.04, z: z - 0.03, size: rough > 0.8 ? 0.3 : 0.85, turn: turn + 0.4 + rough } : null;

    return above ? [below, above] : [below];
}

// Rocks fallen from a cave's roof (metres: where): a great one, smaller ones tumbled about it (those
// on open ground kept: dungeon), all in `tint`
function fallenRocks(x, z, rough, tint) {
    const great = ["boulder", "boulder-02", "boulder-03", "boulder-04", "boulder-06"];
    const lesser = ["boulder", "rock-a", "rock-b", "rock-c", "rock-d", "rock-e", "rock-f", "rock-flat", "stone"];
    const placed = [{ model: great[Math.floor(hashOf(x, z, 3) * great.length)], x, z, size: 0.9 + 0.5 * rough, turn: rough * 6, tint }];

    for (let k = 0; k < 3; k++) {
        const a = rough * 9 + k * 2.1;
        const out = 0.65 + 0.25 * roughOf(k, x);

        placed.push({ model: lesser[Math.floor(hashOf(x + k, z, 4) * lesser.length)], x: x + Math.cos(a) * out, z: z + Math.sin(a) * out, size: 0.28 + 0.22 * roughOf(z, k), turn: a * 3, tint });
    }

    return placed;
}

// Blocks of dressed stone fallen from an ancient temple's vault (`blocks`: dungeons3d.js's,
// metres: where), lying in a heap, one on another
function fallenStones(blocks, x, z, rough) {
    let top = 0;

    for (let k = 0; k < 4; k++) {
        const [w, h, d] = [0.5 + 0.35 * roughOf(k, x), 0.3 + 0.2 * roughOf(z, k), 0.4 + 0.3 * roughOf(x + k, z)];
        const on = k === 3;
        const [cx, cz] = on ? [x, z] : [x + Math.cos(rough * 7 + k * 2.1) * 0.5, z + Math.sin(rough * 7 + k * 2.1) * 0.5];
        const y = on ? top : 0;

        blocks.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, 0.6 + 0.3 * roughOf(k, rough));
        top = Math.max(top, on ? 0 : h * 0.9);
    }
}

// A square pillar of a dungeon's stone (`blocks`: dungeons3d.js's, metres: where):
// its plinth, its shaft up to its capital under the vault (`tall` metres)
function stonePillar(blocks, x, z, tall) {
    blocks.box(x - 0.42, 0, z - 0.42, x + 0.42, 0.4, z + 0.42, 0.55);
    blocks.box(x - 0.3, 0.4, z - 0.3, x + 0.3, tall - 0.5, z + 0.3, 0.85 + 0.15 * roughOf(x, z));
    blocks.box(x - 0.44, tall - 0.5, z - 0.44, x + 0.44, tall, z + 0.44, 0.6);
}

// A bust of white marble on a pedestal of the dungeon's stone (`blocks`, metres: where; `high`: how
// high the pedestal is, `size`: how tall the bust), facing `turn` (as facingFrom has it: the scanned
// bust looks along its own -x, a quarter turn from +z)
function bustOnPedestal(blocks, x, z, { high, size, turn, wide = 0.45 }) {
    blocks.box(x - wide, 0, z - wide, x + wide, high - 0.1, z + wide, 0.8);
    blocks.box(x - wide - 0.07, high - 0.1, z - wide - 0.07, x + wide + 0.07, high, z + wide + 0.07, 0.65);

    return { model: "bust", x, z, y: high, size, turn: turn + Math.PI / 2 };
}

// The colour a cave's or a hideout's fallen rock is darkened to (its own picture's grey times this)
const FALLEN = Object.freeze({ "rock-dark": 0x9a9080, rock: 0xb7a58c });

// How likely a square of open ground by a dungeon's rock is to have something small strewn on it
const STREWN = 0.22;

// A dungeon's level, as its theme has it drawn (DUNGEON_LOOKS: caves of dark rock, an outlaws'
// hideout dug out and shored up with timber, an ancient temple of dressed stone under its vault):
// its floor, its rock or walls; daylight at the way in on its first level; its stairs down through
// the floor and up into the rock; what's in its rooms (core/dungeons/place.js's props, by plan
// character: drawn with the scanned models, `props`, where there are any for them); gold heaped by
// the boss's hoard; and torches on its walls
function dungeon(map) {
    const solid = new Solid();
    const look = DUNGEON_LOOKS[map.look] ?? DUNGEON_LOOKS.caves;
    const stuff = look.walls ?? look.rock;
    const shell = look.shell ? SHELLS[look.shell] : null;
    const roof = m(look.walls ? look.tall : shell.low);
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);
    const lights = [];
    const flames = [];
    const props = [];
    const burning = ({ fire, light }) => {
        flames.push(fire);
        lights.push(light);
    };

    // (What's drawn with the pictures as boxes: a temple's walls, floor and vault, a hideout's
    // timbers)
    const [walls, floor, timber] = [new Blocks(), new Blocks(), new Blocks()];

    if (!shell) {
        floorAround(floor, map, at("stairs-down")[0]);
    }

    if (look.walls) {
        dressedWalls(walls, map, look);
    }

    if (map.marks.D) {
        lights.push(mouth(solid, map, stuff));
    }

    for (const [kind, down] of [["stairs-down", true], ["stairs-up", false]]) {
        for (const piece of at(kind)) {
            flight(solid, map, piece, stuff, { down, inset: look.walls ? 0.02 : 0.45 });
        }
    }

    if (look.shored) {
        shoring(timber, map);
    }

    // (The room a square's in, the smallest round it: its look says what's left in it)
    const roomOf = (x, y) => (map.dungeon?.rooms ?? []).filter((room) => x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h).sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;
    const theme = map.look ?? "caves";
    const tint = FALLEN[look.rubble] ?? null;

    for (const piece of map.pieces) {
        const [x, z] = [m(piece.x + piece.w / 2), m(piece.y + piece.h / 2)];
        const rough = roughOf(piece.x, piece.y);
        // (Where it is, in metres, the rock beside it and its room's look: dungeondressing.js's)
        const spot = { w: piece.w, h: piece.h, wall: rockBeside(map, piece.x, piece.y), rough, theme, look: roomOf(piece.x, piece.y)?.look ?? null, tint };

        switch (piece.kind) {
            case "stalagmite":
                stalagmite(solid, x, z, rough, stuff, roof);
                break;
            case "bones":
                props.push(...bonesAt(x / M, z / M, spot));
                break;
            case "rubble":
                if (look.walls) {
                    fallenStones(walls, x / M, z / M, rough);
                } else {
                    props.push(...fallenRocks(x / M, z / M, rough, FALLEN[look.rubble] ?? null).filter(({ x: rx, z: rz }) => (map.plan[Math.floor(rz)]?.[Math.floor(rx)] ?? "#") !== "#"));
                }

                break;
            case "campfire": {
                burning(campfire(solid, x, z, { ringed: false }));
                props.push({ model: "fire-pit", x: x / M, z: z / M, size: 1.3, turn: rough * 6 });

                // (A pot by the stones, a bowl and its spoon, firewood heaped)
                const by = (k, out) => [x / M + Math.cos(rough * 7 + k * 2.3) * out, z / M + Math.sin(rough * 7 + k * 2.3) * out];
                const [px, pz] = by(0, 0.95);
                const [bx, bz] = by(1, 1.0);
                const [fx, fz] = by(2, 1.2);

                props.push(rough > 0.7 ? { model: "cauldron", x: px, z: pz, size: 0.55, turn: rough * 9 } : { model: rough > 0.4 ? "pot-brass" : "pot", x: px, z: pz, size: 0.36, turn: rough * 9, shadow: false });
                props.push({ model: "bowl", x: bx, z: bz, size: 0.28, turn: rough * 4, shadow: false }, { model: "spoon", x: bx + 0.18, z: bz, size: 0.24, turn: rough * 3, shadow: false });
                props.push({ model: "branches-a", x: fx, z: fz, size: 1, turn: rough * 5 }, { model: "branches-b", x: fx + 0.1, z: fz - 0.08, size: 0.9, turn: rough * 5 + 0.5 });
                break;
            }
            case "bedroll": {
                bedroll(solid, x, z, rough);

                // (By its head now and then: a light, a bottle, a bowl)
                if (rough > 0.3) {
                    const things = ["lantern", "candlestick", "pot-clay", "bowl-small", "goblet-b", "lantern"];
                    const name = things[Math.floor(hashOf(x, z, 5) * things.length)];

                    props.push({ model: name, x: x / M + 0.38, z: z / M - 0.62, size: name === "lantern" ? 0.42 : 0.26, turn: rough * 6, shadow: false });
                }

                // (A sheepskin laid by it now and then)
                if (hashOf(x, z, 12) < 0.35) {
                    props.push({ model: "pelt", x: x / M - 0.5, z: z / M + 0.1, size: 1.1, pitch: -Math.PI / 2, turn: rough * 5, shadow: false });
                }

                break;
            }
            case "barrels": {
                const kinds = ["barrel", "barrel", "barrel-old", "barrel-worn"];

                for (const [sx, sy] of piece.squares) {
                    props.push({ model: kinds[Math.floor(hashOf(sx, sy, 6) * kinds.length)], x: sx + 0.5, z: sy + 0.5, size: 0.95, turn: roughOf(sx, sy) * Math.PI * 2 });
                }

                break;
            }
            case "crates":
                props.push(...crateStack(x / M, z / M, rough));

                // (A sack by them now and then)
                if (rough < 0.35) {
                    solid.cylinder(x + m(0.55), z + m(0.3), 0, m(0.45), m(0.22), m(0.16), material("canvas-sack"), { segments: 8 });
                }

                break;
            case "table":
                props.push(...tableRun(solid, piece, rough));
                break;
            case "rack": {
                weaponRack(solid, piece);

                // (Its arms: a shield leant on its end, an estoc laid at its foot)
                const along = piece.w >= piece.h;

                props.push({ model: "shield-kite", x: along ? piece.x + piece.w - 0.2 : x / M, z: along ? z / M : piece.y + piece.h - 0.2, size: 1, turn: along ? Math.PI / 2 : 0, pitch: -0.15 });
                props.push({ model: rough < 0.5 ? "sword" : "estoc", x: x / M, z: z / M, size: rough < 0.5 ? 0.95 : 1.3, turn: along ? Math.PI / 2 : 0, shadow: false });
                break;
            }
            case "throne": {
                // (The chief's: a tall carved chair, its back to the rock)
                const back = rockBeside(map, piece.x, piece.y) ?? [0, -1];

                props.push({ model: "chair-gothic", x: x / M, z: z / M, size: 1.9, turn: facingFrom(back) });

                // (A sheepskin before it)
                props.push({ model: "pelt", x: x / M - back[0] * 1.05, z: z / M - back[1] * 1.05, size: 1.2, pitch: -Math.PI / 2, turn: facingFrom(back) + Math.PI / 2, shadow: false });
                break;
            }
            case "statue": {
                const turn = facingFrom(rockBeside(map, piece.x, piece.y) ?? [0, -1]);
                const which = hashOf(piece.x, piece.y, 7);

                if (which < 0.38) {
                    props.push(bustOnPedestal(walls, x / M, z / M, { high: 1.2, size: 0.95, turn }));
                } else if (which < 0.56) {
                    // (A cloaked figure on a low plinth)
                    walls.box(x / M - 0.55, 0, z / M - 0.55, x / M + 0.55, 0.3, z / M + 0.55, 0.7);
                    props.push({ model: "statue-gothic", x: x / M, z: z / M, y: 0.3, size: 1.9, turn });
                } else if (which < 0.76) {
                    // (A winged beast kneeling on its block, guarding)
                    walls.box(x / M - 0.5, 0, z / M - 0.5, x / M + 0.5, 0.35, z / M + 0.5, 0.7);
                    props.push({ model: "guardian", x: x / M, z: z / M, y: 0.35, size: 1.25, turn });
                } else {
                    // (A beast's head, a horse or a cat on a tall pedestal)
                    const beasts = ["lion-head", "bull-head", "horse-head", "cat-statue", "cat-statue"];
                    const name = beasts[Math.floor(hashOf(piece.x, piece.y, 8) * beasts.length)];

                    walls.box(x / M - 0.4, 0, z / M - 0.4, x / M + 0.4, 1.1, z / M + 0.4, 0.8);
                    walls.box(x / M - 0.47, 1.1, z / M - 0.47, x / M + 0.47, 1.2, z / M + 0.47, 0.65);
                    props.push({ model: name, x: x / M, z: z / M, y: 1.2, size: 0.62, turn });
                }

                break;
            }
            case "pillar":
                stonePillar(walls, x / M, z / M, look.tall ?? shell.low);
                break;
            case "tomb":
                if (hashOf(piece.x, piece.y, 11) < 0.45) {
                    // (A carved stone sarcophagus, the length of the squares it's on)
                    const along = piece.w >= piece.h;

                    props.push({ model: "sarcophagus-stone", x: x / M, z: z / M, fit: [Math.max(piece.w, piece.h) - 0.15, 0.95, Math.min(piece.w, piece.h) - 0.1], turn: (along ? 0 : Math.PI / 2) + (rough < 0.5 ? Math.PI : 0) });
                } else {
                    stoneTomb(walls, solid, piece);
                }

                break;
            case "wagon": {
                // (A handcart along the wall if there's room, a barrow if not)
                const along = piece.w >= piece.h;
                const long = Math.max(piece.w, piece.h);
                const model = long >= 3 ? "cart" : "wheelbarrow";

                props.push({ model, x: x / M, z: z / M, size: model === "cart" ? Math.min(2.6, long - 0.2) : 1.45, turn: (along ? 0 : Math.PI / 2) + (rough < 0.5 ? Math.PI : 0) });
                break;
            }
            case "clutter":
                props.push(...clutterAt(x / M, z / M, spot));
                break;
            case "remains":
                props.push(...remainsAt(x / M, z / M, spot));
                break;
            case "shelves":
                props.push(...shelvesAt(x / M, z / M, spot));
                break;
            case "side-table":
                props.push(...sideTableAt(x / M, z / M, spot));
                break;
            case "stand":
                props.push(...standAt(x / M, z / M, spot));
                break;
            case "votive":
                props.push(...vesselsAt(x / M, z / M, spot));
                break;
            case "workbench":
                props.push(...workbenchAt(x / M, z / M, spot));
                break;
            case "anvil":
                props.push(...blockAt(x / M, z / M, spot));
                break;
            case "candles":
                lights.push(candleStand(solid, piece));
                break;
            case "altar": {
                altarStone(walls, solid, piece);

                // (Brass vases on it, between its candles)
                const along = piece.w >= piece.h;

                for (const s of [0.34, 0.66]) {
                    const bronze = hashOf(piece.x, piece.y, s * 10) < 0.35;

                    props.push({ model: bronze ? "bronze-vessel" : "vase", x: along ? piece.x + piece.w * s : x / M, z: along ? z / M : piece.y + piece.h * s, y: 1.04, size: bronze ? 0.3 : 0.34, turn: s * 4 });
                }

                break;
            }
            case "shrine": {
                const [dx, dy] = rockBeside(map, piece.x, piece.y) ?? [0, -1];

                props.push(bustOnPedestal(walls, x / M, z / M, { high: 0.85, size: 0.6, turn: facingFrom([dx, dy]), wide: 0.38 }));

                // (An offering before it: a goblet, a lamp or a little vase)
                const offerings = ["goblet-a", "goblet-b", "goblet-c", "candlestick", "vase-small", "pot-flat"];

                props.push({ model: offerings[Math.floor(rough * offerings.length)], x: x / M - dx * 0.62, z: z / M - dy * 0.62, size: 0.22, turn: rough * 6, shadow: false });

                // (Its candles before it, either side)
                for (const side of [-1, 1]) {
                    const [cx, cz] = [x / M - dx * 0.25 + side * dy * 0.25, z / M - dy * 0.25 - side * dx * 0.25];

                    candle(solid, m(cx), m(cz), m(0.85));
                }

                break;
            }
            case "brazier":
                burning(brazier(solid, x, z, rough));
                break;
            case "hoard":
                // (Gold heaped either side of where the hoard's chest stands, coins strewn)
                for (const [dx, dz, r, tall] of [[-1.3, -0.1, 0.7, 0.4], [1.3, 0.1, 0.6, 0.35], [-0.5, -0.8, 0.45, 0.25]]) {
                    solid.cone(x + m(dx), z + m(dz), 0, m(tall), m(r), material("gold"), 12);
                }

                for (let k = 0; k < 18; k++) {
                    const [a, d] = [roughOf(k, piece.x) * Math.PI * 2, 0.9 + roughOf(piece.y, k) * 1.4];

                    solid.cylinder(x + Math.cos(a) * m(d), z + Math.sin(a) * m(d), 0, m(0.012), m(0.06), m(0.06), material("gold"), { segments: 6 });
                }

                // (Plunder heaped with it: goblets, vases, arms, candleholders)
                for (const [k, [name, size]] of [["goblet-a", 0.2], ["goblet-c", 0.18], ["vase-brass", 0.5], ["candleholder-c", 0.75], ["shield-kite", 1], ["mace", 0.65], ["dagger", 0.34], ["vase-tall", 0.6], ["sword", 0.95], ["bronze-vessel", 0.32], ["chest-old", 0.85]].entries()) {
                    const [a, d] = [roughOf(k + 30, piece.x) * Math.PI * 2, 1.1 + roughOf(piece.y, k + 30) * 1.1];

                    props.push({ model: name, x: x / M + Math.cos(a) * d, z: z / M + Math.sin(a) * d, size, turn: a * 3, roll: name === "mace" || name === "dagger" || name === "sword" ? Math.PI / 2 : 0, pitch: name === "shield-kite" ? -1.45 : 0 });
                }

                break;
            default:
                break;
        }
    }

    // Small things strewn along the walls to walk over (dungeondressing.js): on open ground by the
    // rock, now and then, never on a way in or a stair's landing
    for (let y = 1; y < map.height - 1; y++) {
        for (let x = 1; x < map.width - 1; x++) {
            const wall = map.plan[y][x] === "." ? rockBeside(map, x, y) : null;

            if (wall && hashOf(x, y, 9) < STREWN) {
                props.push(...strewnAt(x + 0.5, y + 0.5, { theme, wall, rough: roughOf(x, y), tint }));
            }
        }
    }

    // Torches on the walls (place.js's: each by a wall, and which way it is)
    for (const torch of map.dungeon?.lights ?? []) {
        if (torch.kind === "torch") {
            const [x, y] = torch.at;
            const [dx, dy] = torch.wall ?? [0, 0];

            burning(wallTorch(solid, m(x + 0.5 + dx * 0.42), m(y + 0.5 + dy * 0.42)));
        }
    }

    const blocks = [walls.mesh(look.picture, look.tint ?? null, "walls"), floor.mesh(look.underfoot, look.ground ?? null, "floor"), timber.mesh("timber", 0x8a7a66, "timbers")].filter(Boolean);

    // (What's set about a piece and come out over the rock left out: a lantern by a bedroll in a
    // corner)
    const placed = props.filter(({ x, z }) => (map.plan[Math.floor(z)]?.[Math.floor(x)] ?? "#") !== "#");

    // (The scanned models wanted, read from now on: buildingInterior furnishes the level with them)
    for (const name of new Set(placed.map(({ model }) => model))) {
        loadProp(name);
    }

    return { solid, moving: [], flames, lights, hearth: null, ceiling: roof / M, shell: shell && rockShell(map, look, shell), blocks, props: placed };
}

// The rock round a dungeon's level as one surface (caverns.js), a step at a time: its walls and
// roof, shaded darker where the rock closes in, drawn as the rest is lit (roomlight.js) but never
// cut away (the camera's kept out of the rock instead: view.js); its roof kept clear over stairs
// going up
function* rockShell(map, look, shell) {
    const rock = (x, y) => map.plan[y][x] === "#";
    const ups = map.pieces.filter((piece) => piece.kind === "stairs-up");
    const least = (x, z) => (ups.some((piece) => x > piece.x - 1 && x < piece.x + piece.w + 1 && z > piece.y - 1 && z < piece.y + piece.h + 1) ? FLIGHT.rise * FLIGHT.steps + 2.6 : 0);
    const hole = map.pieces.find((piece) => piece.kind === "stairs-down") ?? null;
    const made = yield* cavern(map.width, map.height, rock, shell, { seed: [...map.id].reduce((hash, c) => Math.imul(hash, 31) + c.charCodeAt(0), 7), least, hole });
    const group = new THREE.Group();

    // (Its points coloured as the theme has it, shaded as caverns.js has them, a tile at a time)
    const meshesOf = (surface, colour, picture, name) => {
        const tint = colour === null ? new THREE.Color().setRGB(...ROCK_PICTURES[picture].mean, THREE.LinearSRGBColorSpace) : new THREE.Color(colour);

        for (const { positions, normals, indices, shade } of tiles(surface)) {
            const geometry = new THREE.BufferGeometry();
            const colours = new Float32Array(shade.length * 3);

            shade.forEach((each, k) => colours.set([tint.r * each, tint.g * each, tint.b * each], k * 3));
            geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
            geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
            geometry.setIndex(new THREE.BufferAttribute(indices, 1));

            const mesh = new THREE.Mesh(geometry, rockMaterial(picture));

            mesh.name = name;
            // (A floor casts no shadow on anything)
            mesh.userData.shadowless = name === "floor";
            group.add(mesh);
        }
    };

    meshesOf(made, look.tint ?? null, look.picture, "rock");
    yield;
    meshesOf(made.floor, look.ground ?? null, look.underfoot, "floor");

    return group;
}

// A bunk (a plan's "B" run, a metre wide and two long, along the wall it stands by): two beds one
// over the other on four posts, a straw mattress and a blanket on each, a bolster at the head
function bunk(solid, piece, blanket) {
    const along = piece.h >= piece.w;
    const [x0, z0, x1, z1] = [m(piece.x + 0.08), m(piece.y + 0.08), m(piece.x + piece.w - 0.08), m(piece.y + piece.h - 0.08)];
    const top = m(1.75);

    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        solid.box(x - (x === x0 ? 0 : 0.5), 0, z - (z === z0 ? 0 : 0.5), x + (x === x0 ? 0.5 : 0), top, z + (z === z0 ? 0.5 : 0), material("timber"));
    }

    for (const y of [m(0.3), m(1.2)]) {
        solid.box(x0 + 0.2, y - m(0.08), z0 + 0.2, x1 - 0.2, y, z1 - 0.2, material("planks-dark"));
        solid.box(x0 + 0.5, y, z0 + 0.5, x1 - 0.5, y + m(0.12), z1 - 0.5, material("canvas-sack"));
        solid.box(x0 + 0.45, y + m(0.12), along ? z0 + m(0.55) : z0 + 0.45, x1 - 0.45, y + m(0.16), z1 - 0.45, material(blanket));

        const head = along ? [x0 + 0.6, z0 + 0.6, x1 - 0.6, z0 + m(0.45)] : [x0 + 0.6, z0 + 0.6, x0 + m(0.45), z1 - 0.6];

        solid.box(head[0], y + m(0.12), head[1], head[2], y + m(0.24), head[3], material("linen"));
    }
}

// A barracks' long room: limewashed walls and boards underfoot, the garrison's arms on their racks
// along the north wall and its barrels beside them, the captain's desk before the shelves of its
// rolls, bunks two high along the walls, the mess table and its benches, the hearth, strongboxes
// by the door, a banner of its people's colours over the racks, and torches on the walls
function barracks(map) {
    const solid = new Solid();
    const [w, h] = [m(map.width), m(map.height)];
    const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);

    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("planks"));

    const doors = map.marks.D;
    const doorMiddle = (doors[0][0] + doors.at(-1)[0] + 1) / 2;

    walledIn(solid, map, "plaster-white", [{ side: "s", from: doorMiddle - 1, to: doorMiddle + 1, lintel: 2.5 }], [{ side: "s", at: 3.5 }, { side: "s", at: 14.5 }, { side: "w", at: 4 }, { side: "w", at: 10 }, { side: "e", at: 2.5 }]);
    solid.box(m(doorMiddle - 1), 0, h - 0.2, m(doorMiddle + 1), m(2.5), h + 0.4, material("planks-dark", WALL));
    ceiling(solid, map);

    for (const rack of at("rack")) {
        armoury(solid, rack);
    }

    for (const barrels of at("barrels")) {
        for (let x = barrels.x; x < barrels.x + barrels.w; x++) {
            const [cx, cz] = [m(x + 0.5), m(barrels.y + 0.5)];

            solid.cylinder(cx, cz, 0, m(0.9), m(0.38), m(0.38), material("planks"), { segments: 12 });
            solid.cylinder(cx, cz, m(0.15), m(0.2), m(0.4), m(0.4), material("iron"), { segments: 12 });
            solid.cylinder(cx, cz, m(0.7), m(0.75), m(0.4), m(0.4), material("iron"), { segments: 12 });
        }
    }

    for (const shelf of at("shelves")) {
        rollShelves(solid, shelf, "wool-blue");
    }

    for (const counter of at("counter")) {
        desk(solid, counter, "wool-blue");
    }

    for (const bed of at("bed")) {
        bunk(solid, bed, (bed.x + bed.y) % 2 ? "wool-blue" : "wool-green");
    }

    // The mess table: bowls, a loaf, tankards and a candle down it
    for (const piece of at("table")) {
        const [x0, z0, x1, z1] = [m(piece.x), m(piece.y), m(piece.x + piece.w), m(piece.y + piece.h)];

        table(solid, x0, z0 + m(0.1), x1, z1 - m(0.1));
        candle(solid, (x0 + x1) / 2, (z0 + z1) / 2, m(0.78));

        for (let x = x0 + m(0.6), k = 0; x < x1 - m(0.4); x += m(1.1), k++) {
            if (k % 2) {
                tankard(solid, x, z0 + m(0.3), m(0.78), true);
            } else {
                solid.cylinder(x, z1 - m(0.3), m(0.78), m(0.84), m(0.1), m(0.13), material("planks"), { segments: 10 });
            }
        }

        solid.cylinder(x0 + m(1.6), (z0 + z1) / 2, m(0.78), m(0.9), m(0.16), m(0.12), material("bread"), { segments: 10 });
    }

    for (const run of benchRuns(map)) {
        bench(solid, m(run.x), m(run.y), m(run.x + run.w), m(run.y + 1));
    }

    for (const box of at("chest")) {
        chest(solid, m(box.x + 0.5), m(box.y + 0.5));
    }

    wallBanner(solid, m(6.5), 0.3, "z", "velvet", "cloth-gold", { low: 1.2, high: 2.9 });

    const [hearth] = at("hearth");
    const fire = sideHearth(solid, map, hearth);
    const torches = [[0.3, 7], [map.width - 0.3, 10], [6, map.height - 0.3]].map(([x, z]) => wallTorch(solid, m(x), m(z)));

    return {
        solid,
        moving: [],
        flames: [fire.fire, ...torches.map(({ fire: flame }) => flame)],
        lights: [fire.light, ...torches.map(({ light }) => light)],
        hearth: fire.at,
    };
}

// --- The specialists' and the masters' shops (core/insides.js SHOP_INSIDES: docs/WAR.md *Shops*) ---

// Each shop's look inside (its map's `look`: the shop's kind): its walls' finish, its counter's
// cloth, what's on its shelves (phials and jars, books and scrolls, or the gear it sells), its
// banners' cloth and trim (a master's), and whether its rug's laid up from the door
const SHOP_LOOKS = Object.freeze({
    swordsmith: { walls: "stone", cloth: "leather", shelves: "hilts", rug: "rug" },
    armorer: { walls: "stone", cloth: "wool-blue", shelves: "helms", rug: "rug" },
    scriptorium: { walls: "plaster-white", cloth: "velvet", shelves: "books", rug: "rug" },
    alchemist: { walls: "plaster-ochre", cloth: "wool-green", shelves: "phials", rug: null },
    masterSwordsmith: { walls: "stone", cloth: "velvet", shelves: "hilts", rug: "rug", banner: ["velvet", "cloth-gold"] },
    masterArmorer: { walls: "stone", cloth: "velvet", shelves: "helms", rug: "rug", banner: ["velvet", "cloth-gold"] },
    emporium: { walls: "plaster-white", cloth: "velvet-purple", shelves: "curios", rug: "rug", banner: ["velvet-purple", "cloth-gold"] },
});

// Shelves against whichever wall they stand by (a run of squares along it: core/insides.js
// SHOP_INSIDES), four boards up, and on them what the shop sells: phials and jars of every colour
// (`phials`), books and scrolls (`books`), helms and gauntlets (`helms`), sheathed blades and
// daggers (`hilts`), or a curio-seller's mix of them all (`curios`)
function wallShelves(solid, shelf, map, what) {
    const along = shelf.w >= shelf.h;
    const side = along ? (shelf.y === 0 ? "n" : "s") : shelf.x === 0 ? "w" : "e";
    const origin = { n: [m(shelf.x), m(shelf.y)], s: [m(shelf.x), m(shelf.y + 1)], w: [m(shelf.x), m(shelf.y)], e: [m(shelf.x + 1), m(shelf.y)] }[side];
    const out = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[side];
    const dir = along ? [1, 0] : [0, 1];
    const length = m(along ? shelf.w : shelf.h);
    const at = (u, d) => [origin[0] + dir[0] * u + out[0] * d, origin[1] + dir[1] * u + out[1] * d];
    const box = (u0, y0, d0, u1, y1, d1, name) => {
        const [[ax, az], [bx, bz]] = [at(u0, d0), at(u1, d1)];

        solid.box(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), material(name, WALL));
    };
    const glass = ["glass-green", "glass-violet", "wine", "glass", "calabash", "pewter", "glow-blue", "glow-green"];

    box(0, 0, 0, length, m(2.2), m(0.1), "planks-dark");

    for (const [k, y] of [0.35, 0.8, 1.25, 1.7].entries()) {
        box(0, m(y), 0, length, m(y + 0.05), m(0.42), "planks");

        for (let u = m(0.22), n = 0; u < length - m(0.18); u += m(what === "phials" ? 0.22 : 0.32), n++) {
            const pick = roughOf(shelf.x * 7 + n, shelf.y * 5 + k);
            const base = m(y + 0.05);
            const [cx, cz] = at(u, m(0.22));
            const kind = what === "curios" ? ["phials", "books", "phials", "skull"][Math.floor(pick * 4)] : what;

            if (kind === "phials") {
                const [tall, wide] = [m(0.12 + pick * 0.16), m(0.05 + ((n * 3) % 3) * 0.018)];

                solid.cylinder(cx, cz, base, base + tall, wide, wide, material(glass[Math.floor(pick * 97) % glass.length], WALL), { segments: 8 });
                solid.cylinder(cx, cz, base + tall, base + tall + m(0.05), wide * 0.45, wide * 0.4, material(pick < 0.5 ? "timber" : "linen", WALL), { segments: 6 });
            } else if (kind === "books") {
                if (pick < 0.25) {
                    solid.cylinder(cx, cz, base, base + m(0.25), m(0.07), m(0.07), material("parchment", WALL), { segments: 8 });
                } else if (pick < 0.85) {
                    box(u - m(0.08), base, m(0.1), u + m(0.08), base + m(0.3 + pick * 0.08), m(0.4), pick < 0.5 ? "ledger" : pick < 0.7 ? "velvet" : "leather");
                }
            } else if (kind === "helms") {
                if (pick < 0.6) {
                    solid.lathe(cx, cz, [[m(0.14), base], [m(0.15), base + m(0.12)], [m(0.11), base + m(0.25)], [0, base + m(0.29)]], material(pick < 0.3 ? "iron" : "pewter"), { segments: 10 });
                } else {
                    box(u - m(0.14), base, m(0.1), u - m(0.02), base + m(0.07), m(0.32), "iron");
                    box(u + m(0.02), base, m(0.1), u + m(0.14), base + m(0.07), m(0.32), "iron");
                }
            } else if (kind === "hilts") {
                // (A blade in its scabbard, standing hilt up, or a dagger laid flat)
                if (pick < 0.65) {
                    box(u - m(0.03), base, m(0.12), u + m(0.03), base + m(0.32), m(0.18), "leather");
                    box(u - m(0.1), base + m(0.32), m(0.11), u + m(0.1), base + m(0.35), m(0.19), pick < 0.3 ? "brass" : "iron");
                    box(u - m(0.02), base + m(0.35), m(0.13), u + m(0.02), base + m(0.42), m(0.17), "leather");
                } else {
                    box(u - m(0.14), base, m(0.2), u + m(0.14), base + m(0.03), m(0.26), "iron");
                }
            } else if (pick < 0.5) {
                solid.lathe(cx, cz, [[m(0.07), base], [m(0.09), base + m(0.06)], [m(0.08), base + m(0.14)], [0, base + m(0.16)]], material("bone", WALL), { segments: 8 });
            }
        }
    }
}

// A wall of shields hung on a rack: round ones and kite shields in turn, painted
function shieldRack(solid, rack) {
    const along = rack.w >= rack.h;
    const [x0, z0] = [m(rack.x), m(rack.y)];
    const length = m(along ? rack.w : rack.h);
    const paints = ["paint-red", "paint-blue", "paint-green", "paint-ochre"];

    solid.box(x0, m(0.4), z0, x0 + (along ? length : m(0.1)), m(2.3), z0 + (along ? m(0.1) : length), material("planks-dark", WALL));

    for (let s = m(0.5), k = 0; s < length - m(0.3); s += m(0.75), k++) {
        const [x, z] = along ? [x0 + s, z0 + m(0.14)] : [x0 + m(0.14), z0 + s];
        const y = m(k % 2 ? 1.0 : 1.75);
        const r = m(k % 3 === 2 ? 0.26 : 0.3);
        const ring = Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;

            return along ? [x + Math.cos(a) * r, y + Math.sin(a) * r, z] : [x, y + Math.sin(a) * r, z + Math.cos(a) * r];
        });

        solid.facing(ring, along ? [0, 0, 1] : [1, 0, 0], material(paints[k % paints.length]));
        solid.box(x - m(0.05), y - m(0.05), z - m(0.02), x + m(0.05), y + m(0.05), z + m(0.06), material("iron"));
    }
}

// A display table: a cloth over it, and on it what the shop sells laid out (gauntlets and a helm;
// a candle and an inkpot; jewels on velvet), its blades, books and orbs models (shopWares)
function displayTable(solid, piece, look, kind) {
    const [x0, z0, x1, z1] = [m(piece.x + 0.1), m(piece.y + 0.1), m(piece.x + piece.w - 0.1), m(piece.y + piece.h - 0.1)];
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const top = m(0.85);

    table(solid, x0, z0, x1, z1);
    solid.box(x0 + m(0.1), top - m(0.06), z0 + m(0.1), x1 - m(0.1), top - m(0.04), z1 - m(0.1), material(look.cloth));

    // (A swordsmith's blades are laid on it as models: shopWares)
    if (kind === "armorer" || kind === "masterArmorer") {
        solid.lathe(cx - m(0.35), cz, [[m(0.16), top - m(0.04)], [m(0.17), top + m(0.1)], [m(0.12), top + m(0.26)], [0, top + m(0.3)]], material("iron"), { segments: 10 });

        for (const dz of [-0.25, 0.25]) {
            solid.box(cx + m(0.15), top - m(0.04), cz + m(dz) - m(0.07), cx + m(0.55), top + m(0.04), cz + m(dz) + m(0.07), material("pewter"));
        }
    } else if (kind === "scriptorium") {
        // (Its book, quill and scroll are models: shopWares)
        candle(solid, x0 + m(0.3), z0 + m(0.3), top - m(0.04));
        solid.cylinder(x1 - m(0.3), z0 + m(0.3), top - m(0.04), top + m(0.04), m(0.05), m(0.04), material("iron-black"), { segments: 8 });
    } else if (kind === "emporium") {
        // (The Emporium's: jewels on a velvet cushion, its crystal ball or globe beside it a model)
        solid.box(cx + m(0.1), top - m(0.04), cz - m(0.25), cx + m(0.6), top + m(0.04), cz + m(0.25), material("velvet"));

        for (const [dx, dz, gem] of [[0.22, -0.12, "gold"], [0.4, 0.1, "silver"], [0.5, -0.15, "jade"]]) {
            solid.cylinder(cx + m(dx), cz + m(dz), top + m(0.04), top + m(0.06), m(0.05), m(0.05), material(gem), { segments: 8 });
        }
    }
}

// A lectern by the wall (its great book open on it a model: shopWares)
function lectern(solid, piece) {
    const [cx, cz] = [m(piece.x + 0.5), m(piece.y + 0.5)];

    solid.box(cx - m(0.05), 0, cz - m(0.05), cx + m(0.05), m(1.05), cz + m(0.05), material("planks-dark"));
    solid.box(cx - m(0.3), m(1.0), cz - m(0.22), cx + m(0.3), m(1.06), cz + m(0.22), material("planks-dark"));
}

// A whetting bench (or a fitting bench) against the wall: a table, tools on it, a vice
function benchOfTools(solid, piece) {
    const [x0, z0, x1, z1] = [m(piece.x + 0.1), m(piece.y + 0.05), m(piece.x + piece.w - 0.05), m(piece.y + piece.h - 0.05)];

    table(solid, x0, z0, x1, z1);

    for (let k = 0; k < 3; k++) {
        const z = z0 + m(0.3) + k * ((z1 - z0 - m(0.6)) / 2);

        solid.box(x0 + m(0.15), m(0.78), z - m(0.03), x0 + m(0.55), m(0.81), z + m(0.03), material("iron"));
    }

    solid.box(x1 - m(0.35), m(0.78), (z0 + z1) / 2 - m(0.1), x1 - m(0.1), m(0.98), (z0 + z1) / 2 + m(0.1), material("iron-black"));
}

/**
 * A specialist's or a master's shop inside (core/insides.js SHOP_INSIDES, by its `look`): its
 * floorboards and walls, the door south, windows either side of it; the counter across the room
 * under its cloth; its shelves along the walls, its racks of blades or shields, its stands of
 * harness, its display tables, its benches, casks and strongboxes; a rug up from the door; a
 * master's banners either side of the counter; lit by torches on the walls and candle stands.
 */
function shop(map) {
    const solid = new Solid();
    const kind = map.look ?? "swordsmith";
    const look = SHOP_LOOKS[kind] ?? SHOP_LOOKS.swordsmith;
    const [w, h] = [m(map.width), m(map.height)];
    const at = (piece) => map.pieces.filter((each) => each.kind === piece);

    solid.box(-m(0.3), -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("planks"));

    const doors = map.marks.D;
    const doorMiddle = (doors[0][0] + doors.at(-1)[0] + 1) / 2;

    walledIn(solid, map, look.walls, [{ side: "s", from: doorMiddle - 0.9, to: doorMiddle + 0.9, lintel: 2.4 }], [{ side: "s", at: 4 }, { side: "s", at: map.width - 4 }]);
    solid.box(m(doorMiddle - 0.9), 0, h - 0.2, m(doorMiddle + 0.9), m(2.4), h + 0.4, material("planks-dark", WALL));
    ceiling(solid, map);

    for (const counter of at("counter")) {
        desk(solid, counter, look.cloth);
    }

    for (const shelf of at("shelves")) {
        wallShelves(solid, shelf, map, look.shelves);
    }

    const props = shopWares(map, kind);
    const modelled = new Set(props.map(({ piece }) => piece).filter(Boolean));

    for (const rack of at("rack").filter((each) => !modelled.has(each))) {
        if (kind === "armorer" || kind === "masterArmorer") {
            shieldRack(solid, rack);
        } else {
            armoury(solid, rack);
        }
    }

    for (const stand of at("stand").filter((each) => !modelled.has(each))) {
        armourStand(solid, m(stand.x + 0.5), m(stand.y + 0.5), roughOf(stand.x, stand.y));
    }

    // (An alchemist's tables bare, its stills and jars models; any other's a cloth over it, its
    // wares set out)
    for (const piece of at("table")) {
        if (kind === "alchemist") {
            table(solid, m(piece.x + 0.05), m(piece.y + 0.1), m(piece.x + piece.w - 0.05), m(piece.y + piece.h - 0.1));
        } else {
            displayTable(solid, piece, look, kind);
        }
    }

    for (const piece of at("side-table")) {
        lectern(solid, piece);
    }

    for (const piece of at("workbench")) {
        benchOfTools(solid, piece);
    }

    for (const barrels of at("barrels")) {
        for (let y = barrels.y; y < barrels.y + barrels.h; y++) {
            cask(solid, m(barrels.x + 0.1), m(y + 0.5), 0, m(0.8), m(0.4));
        }
    }

    for (const box of at("chest")) {
        chest(solid, m(box.x + 0.5), m(box.y + 0.5));
    }

    for (const carpet of at("carpet")) {
        if (look.rug) {
            rug(solid, m(carpet.x), m(carpet.y), m(carpet.x + carpet.w), m(carpet.y + carpet.h));
        }
    }

    if (look.banner) {
        const [counter] = at("counter");

        for (const x of [counter.x - 1, counter.x + counter.w + 1]) {
            wallBanner(solid, m(x), 0.3, "z", ...look.banner, { low: 1.2, high: 3 });
        }
    }

    const stands = at("votive").map((stand) => candleStand(solid, stand));
    const torches = [[0.3, map.height / 2], [map.width - 0.3, map.height / 2], [map.width / 2, map.height - 0.3]].map(([x, z]) => wallTorch(solid, m(x), m(z)));

    // (The models wanted, read from now on: buildingInterior furnishes the room with them)
    for (const name of new Set(props.map(({ model }) => model))) {
        loadProp(name);
    }

    return {
        solid,
        moving: [],
        flames: torches.map(({ fire }) => fire),
        lights: [...torches.map(({ light }) => light), ...stands],
        props: props.map(({ piece: _piece, ...placement }) => placement),
    };
}

// How high a shop's things are topped (metres): its counter's cloth, a display table's, a bare
// table's, a bench's, a lectern's
const SHOP_TOPS = Object.freeze({ counter: 1.09, display: 0.81, table: 0.78, bench: 0.78, lectern: 1.06 });

/**
 * What a shop sets out (by its kind: core/insides.js SHOP_INSIDES) as makers' models and museums'
 * scans (scripts/build-props.js, furnished by dungeons3d.js furnish): each placement (metres)
 * on its counter, its tables, benches and lecterns, or standing in for a rack, a stand or the
 * grindstone of its plan (`piece`: drawn as the model, not as its own art). Blades laid out on
 * a swordsmith's tables (a master's the great swords), sword racks and a weapon rack down its
 * walls, its grindstone; an armorer's shields leant by its harness, helms, and a mail shirt and
 * a shield on its benches; a scribe's open books, quills and scrolls; an alchemist's alembics, mortars, flasks and
 * apothecary's jars; the Emporium's crystal ball and celestial globe.
 */
export function shopWares(map, kind) {
    const placed = [];
    const at = (name) => map.pieces.filter((each) => each.kind === name);
    const put = (model, x, z, more = {}) => placed.push({ model, x, z, ...more });
    const [counter] = at("counter");
    const [cx, cz] = [counter.x + counter.w / 2, counter.y + 0.45];
    const tables = at("table");
    const middle = (piece) => [piece.x + piece.w / 2, piece.y + piece.h / 2];
    // (Lying down: what's made standing up laid along x; a flat thing stood up laid on its back)
    const [laid, onBack] = [{ roll: Math.PI / 2 }, { pitch: -Math.PI / 2 }];
    const master = kind === "masterSwordsmith" || kind === "masterArmorer";

    if (kind === "swordsmith" || kind === "masterSwordsmith") {
        const blades = master
            ? [["zweihander", "sword-chevalier", "claymore"], ["sword-long", "estoc", "sword-arming"]]
            : [["sword-arming", "sword-long", "dagger"], ["claymore", "saber", "mace"]];

        tables.forEach((table, k) => {
            const [x] = middle(table);

            blades[k % 2].forEach((model, n) => {
                const turned = { "sword-chevalier": { turn: Math.PI / 2 }, dagger: { ...onBack, turn: Math.PI / 2 }, saber: laid, mace: laid, estoc: laid }[model] ?? {};

                put(model, x, table.y + 0.55 + n * 0.45, { y: SHOP_TOPS.display, ...turned });
            });
        });

        put("sword-arming", cx, cz, { y: SHOP_TOPS.counter, turn: 0.12 });

        // (The racks down the walls: two long ones each side, four blades standing in each, hilts
        // up (the blades' hilts are their -x ends), their flats along the rack; the rest as
        // they're drawn)
        const racked = master ? ["zweihander", "claymore", "sword-long", "claymore"] : ["sword-long", "sword-arming", "claymore", "sword-arming"];

        for (const rack of at("rack").filter(({ x, h }) => h >= 4 && (x === 0 || x === map.width - 1))) {
            const west = rack.x === 0;
            const [x, turn] = [west ? 0.3 : map.width - 0.3, west ? Math.PI / 2 : -Math.PI / 2];

            for (const [n, z] of [rack.y + 1, rack.y + 3].entries()) {
                put("sword-rack", x, z, { turn, ...(n ? {} : { piece: rack }) });

                racked.forEach((model, k) => put(model, x, z + (k - 1.5) * 0.36, { y: 0.06, roll: -Math.PI / 2 }));
            }
        }

        for (const stone of at("grindstone")) {
            put("grindstone", stone.x + 0.5, stone.y + 0.5, { size: 1, turn: Math.PI / 2, piece: stone });
        }

        for (const bench of at("workbench")) {
            put("dagger", bench.x + 0.5, bench.y + bench.h - 0.6, { y: SHOP_TOPS.bench, ...onBack });
            put("hammer", bench.x + 0.45, bench.y + 0.55, { y: SHOP_TOPS.bench });
        }
    } else if (kind === "armorer" || kind === "masterArmorer") {
        // (A shield leant at the foot of each harness along the walls, facing the room, a heater and
        // a kite in turn)
        at("stand")
            .filter(({ x }) => x === 0 || x === map.width - 1)
            .forEach((stand, k) => {
                const west = stand.x === 0;

                put(k % 2 ? "shield-kite" : "shield-heater", stand.x + (west ? 0.75 : 0.25), stand.y + 0.5, { size: k % 2 ? 1.1 : 0.8, pitch: -0.25, turn: west ? Math.PI / 2 : -Math.PI / 2 });
            });

        // (Its fitting benches: a helm on each, and a mail shirt or a shield laid by it)
        at("workbench").forEach((bench, k) => {
            put(k % 2 ? "barbuta-visored" : "barbuta", bench.x + 0.5, bench.y + 0.4, { y: SHOP_TOPS.bench, turn: k % 2 ? -1.2 : 1.2 });
            put(k % 2 ? "shield-heater" : "hauberk", bench.x + 0.5, bench.y + 1.2, { y: SHOP_TOPS.bench, ...onBack, turn: Math.PI / 2 });
        });

        put("great-helm", cx - 0.5, cz, { y: SHOP_TOPS.counter, turn: 0.3 });
        put(master ? "barbuta-visored" : "barbuta", cx + 0.4, cz, { y: SHOP_TOPS.counter, turn: -0.3 });
    } else if (kind === "scriptorium") {
        tables.forEach((table, k) => {
            const [x] = middle(table);

            put("book-open", x - 0.15, table.y + 0.95, { y: SHOP_TOPS.display, ...onBack, turn: k % 2 ? 0.1 : -0.1 });
            put("quill", x + 0.45, table.y + 0.85, { y: SHOP_TOPS.display, turn: 0.5 });
            put("scroll", x + 0.3, table.y + 1.5, { y: SHOP_TOPS.display, turn: k % 2 ? 0.2 : -0.2 });
            put("books", x - 0.5, table.y + 1.45, { y: SHOP_TOPS.display, turn: 0.4 });
        });

        for (const lectern of at("side-table")) {
            put("book-open", lectern.x + 0.5, lectern.y + 0.5, { y: SHOP_TOPS.lectern, ...onBack });
        }

        put("books", cx - 0.6, cz, { y: SHOP_TOPS.counter, turn: -0.3 });
        put("hourglass", cx + 0.3, cz, { y: SHOP_TOPS.counter });
    } else if (kind === "alchemist") {
        tables.forEach((table, k) => {
            const [x, z] = middle(table);

            put("alembic", x - 0.35, z - 0.3, { y: SHOP_TOPS.table, turn: k % 2 ? Math.PI : 0 });
            put("mortar", x + 0.5, z - 0.5, { y: SHOP_TOPS.table });
            put("bottle-magic", x + 0.45, z + 0.25, { y: SHOP_TOPS.table, turn: 0.6 });
            put("bottle-magic-2", x + 0.65, z + 0.55, { y: SHOP_TOPS.table });
            put("albarello", x - 0.45, z + 0.5, { y: SHOP_TOPS.table });
            put("albarello", x - 0.15, z + 0.6, { y: SHOP_TOPS.table, turn: 1.3 });
        });

        put("mortar", cx - 0.6, cz, { y: SHOP_TOPS.counter });
        put("albarello", cx, cz, { y: SHOP_TOPS.counter });
        put("bottle-magic", cx + 0.5, cz, { y: SHOP_TOPS.counter, turn: -0.5 });
    } else if (kind === "emporium") {
        tables.forEach((table, k) => {
            const [x, z] = middle(table);

            put(k % 2 ? "globe-celestial" : "crystal-ball", x - 0.35, z, { y: SHOP_TOPS.display, turn: 0.4 });
            put(k % 2 ? "candleholder-a" : "skull", x - 0.6, z + 0.6, { y: SHOP_TOPS.display, turn: -0.5 });
            put("book-open", x + 0.35, z + 0.6, { y: SHOP_TOPS.display, ...onBack, turn: k % 2 ? -0.3 : 0.3 });
            put(k % 2 ? "bottle-magic" : "bottle-magic-2", x - 0.65, z - 0.55, { y: SHOP_TOPS.display });
        });

        put("hourglass", cx - 0.5, cz, { y: SHOP_TOPS.counter });
        put("books", cx + 0.3, cz, { y: SHOP_TOPS.counter, turn: 0.3 });
        put("bottle-magic", cx + 0.85, cz, { y: SHOP_TOPS.counter, turn: 0.8 });
    }

    return placed;
}

// (A dungeon theme added without art of its own drawn as `dungeon` draws any: buildingInterior)
const BUILDERS = { taproom, upstairs, smithy, temple, guild, hall, keep, barracks, undercroft, shop, cave, lair, crypt, ruin, tower, "tower-top": towerTop, "dungeon-caves": dungeon, "dungeon-hideout": dungeon, "dungeon-ancient": dungeon };

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

// The light each people's lamps give, in place of candlelight (their fires burn as anyone's; the
// dark elves' a pale lavender, light enough to see their black stone by)
const LAMPLIGHT = Object.freeze({ orc: 0xffa060, elf: 0xcfe0ff, darkElf: 0xd0b8ff, lizard: 0xe8ffc8 });

// The dark elves' amethyst shards on their walls (interiors3d.js ACCENTS.darkElf): how high
// their cups are (art pixels) and how far out from the wall, how far clear of a window's side
// (metres), and each shard of a cluster (its offset along the wall and out, how tall and how wide
// at its foot: metres)
const DARK_SHARDS = Object.freeze({
    high: m(1.95),
    out: m(0.22),
    clear: 0.45,
    points: [
        [0, 0, 0.3, 0.05],
        [-0.06, 0.03, 0.2, 0.04],
        [0.06, -0.02, 0.24, 0.04],
    ],
});

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
    // lamps hanging, lit by witchlight, and between them amethyst shards in iron cups on the
    // walls, glowing (their black stone and charred wood want more light than others' rooms)
    darkElf(solid, { length, at, along, spots, clear }) {
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
            lit("witchlight", x, y, z);
        }

        // (Half a lamp's spacing on from each, an amethyst shard's cluster in an iron cup on a
        // bracket, over the furniture at a sconce's height, clear of the windows)
        const spacing = length / spots.length;

        for (const s of spots.map((each) => each + spacing / 2).filter((each) => each < length - m(0.5) && clear(each, DARK_SHARDS.clear))) {
            const [x, y, z] = at(s, DARK_SHARDS.high, DARK_SHARDS.out);
            const [wx, , wz] = at(s, DARK_SHARDS.high, 0);
            const iron = material("iron-black", WALL);
            const glow = material("glow-violet", WALL);

            solid.tube([[wx, y - m(0.08), wz], [x, y - m(0.08), z]], m(0.02), iron, { sides: 4 });
            solid.lathe(x, z, [[0, y - m(0.12)], [m(0.09), y - m(0.06)], [m(0.1), y], [0, y]], iron, { segments: 6 });

            for (const [aside, out, high, wide] of DARK_SHARDS.points) {
                const [px, , pz] = at(s + m(aside), y, DARK_SHARDS.out + m(out));

                solid.cone(px, pz, y - m(0.02), m(high), m(wide), glow, 4);
            }

            lit("shard", x, y + m(0.12), z);
        }
    },
};

// A people's things round the walls of an inside (all but the south one, with its door)
function accents(solid, map, people) {
    const [w, h] = [m(map.width), m(map.height)];
    const runs = [
        { side: "n", from: [m(0.6), 0], to: [w - m(0.6), 0], out: [0, 1] },
        { side: "w", from: [0, m(0.6)], to: [0, h - m(0.6)], out: [1, 0] },
        { side: "e", from: [w, m(0.6)], to: [w, h - m(0.6)], out: [-1, 0] },
    ];

    for (const { side, from, to, out } of runs) {
        const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
        const along = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
        const at = (s, y, d = 0) => [from[0] + along[0] * s + out[0] * d, y, from[1] + along[1] * s + out[1] * d];
        const count = Math.max(1, Math.floor(length / m(3)));
        const spots = Array.from({ length: count }, (_, k) => ((k + 0.5) * length) / count);

        at.outward = [out[0], 0, out[1]];

        // (Whether a place along it, `s`, is clear of its windows by `by` metres, either side: the
        // room's, as it was walled in)
        const clear = (s, by) => !lighting.panes.some((pane) => pane.side === side && Math.abs((side === "n" ? from[0] + s : from[1] + s) / M - pane.at) < PANE.half + by);

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

        ACCENTS[people]?.(solid, { length, along, out, at, box, disc, spots, clear });
    }
}

/**
 * Build a map's inside: { map, object (a Group at the map's place in the world, in metres),
 * lights (its flames, as point lights: { kind, x, y, z (world metres), colour, intensity,
 * distance, flicker, seed }, its fires first: roomlight.js), daylight (the way towards the sun
 * shining in at its windows, [x, y, z], or null for none), ceiling (how high it is: STOREY, or a dungeon level's roof),
 * props (a dungeon level's scanned furniture, as placed: dungeons3d.js furnish; none for others),
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
        built = (BUILDERS[map.style ?? map.id] ?? (map.dungeon ? dungeon : null))(map);

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

    if (built.shell) {
        object.add(yield* built.shell);
    }

    for (const each of built.blocks ?? []) {
        object.add(each);
    }

    // (A dungeon's scanned furniture, added once its models are read: dungeons3d.js)
    if (built.props?.length) {
        furnish(object, built.props).catch((error) => console.warn("Couldn't furnish", map.id, error));
    }

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
            node.castShadow = !node.material.name.startsWith("window") && !node.userData.shadowless;
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
        // (A dungeon's level's lights each its own, however many: the view lights it by those nearest)
        lights: gather([...built.lights, ...lit.flames], map.dungeon ? Infinity : undefined).map((light, k) => ({ ...light, colour: ((light.kind === "lamp" || light.kind === "candle") && LAMPLIGHT[own]) || light.colour, x: ox + light.x, z: oz + light.z, seed: light.seed ?? k * 17.3 })),
        daylight: lit.daylight,
        open: Boolean(built.open),
        ceiling: built.ceiling ?? STOREY,
        props: built.props ?? [],
        hearth: built.hearth ? { x: ox + built.hearth.x, y: built.hearth.y, z: oz + built.hearth.z } : null,
        update(dt, time) {
            for (const part of built.moving) {
                // (A named part turns only while it's driven: the grindstone while cranked)
                if (!part.name || time < (part.until ?? 0)) {
                    part.object.rotation[part.axis ?? "z"] += part.turn * dt;
                }
            }

            INTERIOR_GLOW.time.value = time;
            VEIL.time.value = time % VEIL.loop;
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
        // (Its own geometry and flames: the materials are shared by every inside, and the scanned
        // models' meshes by every dungeon)
        dispose() {
            object.traverse((node) => {
                if (node.isInstancedMesh) {
                    node.dispose();
                }

                if (!node.geometry?.userData.shared) {
                    node.geometry?.dispose();
                }

                if (node.material?.type === "ShaderMaterial" && !node.material.userData.shared) {
                    node.material.dispose();
                }
            });
            object.removeFromParent();
        },
    };
}
