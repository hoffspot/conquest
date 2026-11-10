// A hell rift torn open in the wilds, as it's drawn (core/hellrift.js; host.js #hellRifts): tears
// in the world itself, ragged and hanging in the air, a fire swirling in each, white-hot at its eye,
// its torn rim flaring and the whole throbbing and flickering as if with rage; a glow licking out
// round each, embers streaming up off it, and the ground under it scorched and glowing. The great
// tear at its heart stands over its altar, a column of red light going up from it, seen across the
// land (in the far pass too); its lesser tears scattered about it; its altar of black stone, a
// burning sigil on it, under a dome of red light while its guards stand. A tear sealed folds in on
// itself and is gone; the rift closed or faded, all of it does.
//
// The tears and the altar stand in the battle too, as things to strike (battle.js STANDS): their
// avatars (RiftThingAvatar) are only where they stand, for their plates and the blows on them; this
// draws them, from the rift as the host keeps it.

import * as THREE from "three";
import { HELL_RIFT } from "../core/hellrift.js";
import { FortAvatar } from "./forts3d.js";

/**
 * How each is drawn: the great tear at the rift's heart and its lesser tears (`tall`, `wide`: metres;
 * `lift`: its foot over the ground; `glow`: the radius of the glow on the ground under it; `embers`:
 * how many embers stream off it), the altar (`size`: across, up, deep), the ward's dome over it
 * (`dome`: its radius), the column of light going up from the heart (`column`: high, wide), how fast
 * each throbs (`throb`: a second), and how long one takes to fold in on itself (`fold`: seconds).
 */
export const RIFT_LOOKS = Object.freeze({
    heart: Object.freeze({ tall: 6.5, wide: 3.2, lift: 0.8, glow: 9, embers: 70 }),
    tear: Object.freeze({ tall: 2.8, wide: 1.3, lift: 0.45, glow: 3.2, embers: 26 }),
    altar: Object.freeze({ size: [2.4, 1.1, 1.5], dome: 4.2 }),
    column: Object.freeze({ high: 140, wide: 5 }),
    throb: 0.55,
    fold: 0.8,
});

// Shared by the shaders: the time, and how fast they throb
const NOISE = `
float riftHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float riftNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(mix(riftHash(i), riftHash(i + vec2(1.0, 0.0)), u.x), mix(riftHash(i + vec2(0.0, 1.0)), riftHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// (A throb: a heartbeat's double beat, hard and angry, and a flicker over it)
float riftThrob(float time, float seed) {
    float beat = fract(time * ${RIFT_LOOKS.throb.toFixed(3)} + seed);

    return max(exp(-pow((beat - 0.08) * 14.0, 2.0)), 0.7 * exp(-pow((beat - 0.26) * 14.0, 2.0)));
}
float riftFlicker(float time, float seed) { return 0.82 + 0.18 * riftNoise(vec2(time * 11.0, seed * 37.0)); }
`;

// A tear's face: a rip in the world, a seething dark in it, a red fire swirling deep within it and
// glowing at its eye; its torn rim burning, red to gold to white-hot at its very edge, flaring as it
// throbs; the whole throbbing and flickering
const TEAR_VERTEX = `
attribute float edge;
varying vec2 vAt;
varying float vEdge;

void main() {
    vAt = position.xy;
    vEdge = edge;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TEAR_FRAGMENT = `
uniform float time;
uniform float seed;
uniform float strength;
uniform vec2 eye;
varying vec2 vAt;
varying float vEdge;
${NOISE}

void main() {
    vec2 from = (vAt - eye) / vec2(0.5, 1.0);
    float r = length(from);
    float a = atan(from.y, from.x);
    float throb = riftThrob(time, seed);
    float flicker = riftFlicker(time, seed);
    // (Its fire swirling in about its eye, twisting as it falls in)
    float twist = a * 3.0 + log(r + 0.05) * 2.6 + time * 1.9 + seed * 9.0;
    float swirl = riftNoise(vec2(twist, r * 3.0 - time * 1.3)) * 0.65 + riftNoise(vec2(twist * 2.0 - time * 0.7, r * 7.0 + time * 2.1)) * 0.35;
    float heat = clamp(1.0 - vEdge, 0.0, 1.0);
    vec3 dark = vec3(0.05, 0.0, 0.012);
    vec3 deep = vec3(0.34, 0.02, 0.02);
    vec3 red = vec3(0.95, 0.12, 0.03);
    vec3 gold = vec3(1.0, 0.6, 0.16);
    vec3 white = vec3(1.0, 0.95, 0.8);
    // (The dark in it seething, a fire swirling deep in it, brighter as it throbs)
    vec3 light = mix(dark, deep, smoothstep(0.3, 0.8, swirl));

    light = mix(light, red, smoothstep(0.62, 0.95, swirl) * (0.35 + 0.65 * throb));
    light += red * pow(heat, 6.0) * (0.4 + 0.9 * throb);
    // (Its torn rim burning, white-hot at its very edge, flaring as it throbs)
    float rim = smoothstep(0.5, 1.0, vEdge);

    light = mix(light, mix(red, gold, rim), rim * rim);
    light += white * smoothstep(0.9, 1.0, vEdge) * (0.5 + 1.0 * throb);
    gl_FragColor = vec4(light * (0.85 + 0.6 * throb) * flicker * strength, 1.0);
}
`;

// The glow licking out round a tear's rim: as bright as it's near the rim, flames licking out of it
// at the throb
const LICK_VERTEX = `
attribute float out;
attribute float round;
varying float vOut;
varying float vRound;

void main() {
    vOut = out;
    vRound = round;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const LICK_FRAGMENT = `
uniform float time;
uniform float seed;
uniform float strength;
varying float vOut;
varying float vRound;
${NOISE}

void main() {
    float throb = riftThrob(time, seed);
    float flames = riftNoise(vec2(vRound * 22.0, time * 3.2 + seed * 5.0));
    float reach = 0.35 + 0.65 * flames + 0.4 * throb;
    float fade = pow(clamp(1.0 - vOut / reach, 0.0, 1.0), 1.6);

    gl_FragColor = vec4(vec3(1.0, 0.22, 0.04) * fade * (0.5 + 1.1 * throb) * riftFlicker(time, seed) * strength, 1.0);
}
`;

// Embers streaming up off a tear: each rising and drifting, fading as it goes, round and soft
const EMBER_VERTEX = `
uniform float time;
uniform float high;
uniform float wide;
uniform float strength;
attribute vec3 seeds;
varying float vLife;

void main() {
    float life = fract(time * (0.18 + 0.22 * seeds.x) + seeds.y);
    vec3 at = vec3((seeds.z - 0.5) * wide + sin(life * 7.0 + seeds.y * 30.0) * 0.35 * wide, life * high, sin(seeds.x * 40.0 + life * 5.0) * 0.3);
    vec4 view = modelViewMatrix * vec4(at, 1.0);

    vLife = life;
    gl_PointSize = (2.0 + 4.0 * seeds.x) * strength * (300.0 / max(1.0, -view.z));
    gl_Position = projectionMatrix * view;
}
`;

const EMBER_FRAGMENT = `
varying float vLife;

void main() {
    float d = length(gl_PointCoord - 0.5);
    float soft = smoothstep(0.5, 0.0, d);

    gl_FragColor = vec4(mix(vec3(1.0, 0.75, 0.3), vec3(0.9, 0.12, 0.02), vLife) * soft * (1.0 - vLife) * 1.6, 1.0);
}
`;

// The glow on the ground under a tear (and its scorch): brightest under it, throbbing
const GLOW_VERTEX = `
varying vec2 vAt;

void main() {
    vAt = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GLOW_FRAGMENT = `
uniform float time;
uniform float seed;
uniform float radius;
uniform float strength;
varying vec2 vAt;
${NOISE}

void main() {
    float d = length(vAt) / radius;
    float throb = riftThrob(time, seed);
    float ragged = 0.85 + 0.3 * riftNoise(vec2(atan(vAt.y, vAt.x) * 4.0, time * 0.6 + seed));
    float glow = pow(clamp(1.0 - d * ragged, 0.0, 1.0), 2.2);

    gl_FragColor = vec4(vec3(0.95, 0.12, 0.02) * glow * (0.45 + 0.8 * throb) * strength, 1.0);
}
`;

// The column of red light going up from the heart, seen far off: softest at its edges, fading as it
// goes up, throbbing; turned to the camera (#face)
const COLUMN_FRAGMENT = `
uniform float time;
uniform float strength;
varying vec2 vAt;
${NOISE}

void main() {
    float across = 1.0 - abs(vAt.x) * 2.0;
    float up = clamp(vAt.y, 0.0, 1.0);
    float throb = riftThrob(time, 0.0);
    float rising = 0.75 + 0.25 * riftNoise(vec2(vAt.x * 6.0, up * 12.0 - time * 1.5));

    gl_FragColor = vec4(vec3(1.0, 0.16, 0.03) * pow(max(across, 0.0), 2.0) * pow(1.0 - up, 1.5) * rising * (0.5 + 0.7 * throb) * strength, 1.0);
}
`;

// The ward's dome over the altar while its guards stand: brightest at its rim (seen edge on),
// shimmering, throbbing
const DOME_VERTEX = `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vAt;

void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);

    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-view.xyz);
    vAt = position;
    gl_Position = projectionMatrix * view;
}
`;

const DOME_FRAGMENT = `
uniform float time;
uniform float strength;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vAt;
${NOISE}

void main() {
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.5);
    float shimmer = 0.6 + 0.4 * riftNoise(vec2(atan(vAt.z, vAt.x) * 6.0 + time * 0.8, vAt.y * 3.0 - time * 1.4));

    gl_FragColor = vec4(vec3(1.0, 0.15, 0.04) * (0.04 + 0.7 * rim) * shimmer * (0.45 + 0.7 * riftThrob(time, 0.4)) * strength, 1.0);
}
`;

const additive = (uniforms, vertexShader, fragmentShader, more = {}) =>
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide, ...more });

// A tear's shape, from its foot up (metres; across it x, up it y), its eye a little over halfway up:
// up its right side and down its left, ragged, bent a little, as torn cloth is
function tearEdge(tall, wide, seed) {
    let state = seed >>> 0 || 1;
    const next = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
    const points = 16;
    const edge = [];

    for (const side of [1, -1]) {
        for (let k = side > 0 ? 0 : points - 1; side > 0 ? k <= points : k >= 1; k += side > 0 ? 1 : -1) {
            const t = k / points;
            const half = (wide / 2) * Math.sin(Math.PI * t) ** 0.7 * (k % 2 ? 1 : 0.5 + next() * 0.4);
            const bend = wide * 0.13 * Math.sin(Math.PI * 2 * t + 0.6);

            edge.push([bend + side * half, t * tall]);
        }
    }

    return edge;
}

// A tear's face (a fan from its eye to its ragged edge: `edge` 0 at the eye, 1 at the edge), and the
// glow licking out round its rim (a strip from its edge out: `out` 0 to 1, `round` how far round)
function tearGeometries(tall, wide, seed) {
    const edge = tearEdge(tall, wide, seed);
    const eye = [0, tall * 0.56];
    const face = new THREE.BufferGeometry();
    const lick = new THREE.BufferGeometry();
    const at = [...eye, 0];
    const edges = [0];
    const fan = [];

    edge.forEach(([x, y], k) => {
        at.push(x, y, 0);
        edges.push(1);
        fan.push(0, k + 1, ((k + 1) % edge.length) + 1);
    });

    face.setAttribute("position", new THREE.Float32BufferAttribute(at, 3));
    face.setAttribute("edge", new THREE.Float32BufferAttribute(edges, 1));
    face.setIndex(fan);

    const out = [];
    const outs = [];
    const rounds = [];
    const strip = [];
    const reach = Math.max(0.5, wide * 0.55);

    edge.forEach(([x, y], k) => {
        // (Out from the eye, as the tear's squashed: as far out at its sides as at its ends)
        const [dx, dy] = [(x - eye[0]) / wide, (y - eye[1]) / tall];
        const length = Math.hypot(dx, dy) || 1;

        out.push(x, y, -0.01, x + (dx / length) * reach, y + (dy / length) * reach, -0.01);
        outs.push(0, 1);
        rounds.push(k / edge.length, k / edge.length);

        const n = (k + 1) % edge.length;

        strip.push(k * 2, k * 2 + 1, n * 2, k * 2 + 1, n * 2 + 1, n * 2);
    });

    lick.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    lick.setAttribute("out", new THREE.Float32BufferAttribute(outs, 1));
    lick.setAttribute("round", new THREE.Float32BufferAttribute(rounds, 1));
    lick.setIndex(strip);

    return { face, lick, eye };
}

// A tear, as a group: its face, its licking glow and its embers (standing, turned to the camera:
// #face), and the glow on the ground under it (`look`: RIFT_LOOKS heart's or tear's)
function tearOf(look, seed, time) {
    const group = new THREE.Group();
    const standing = new THREE.Group();
    const strength = { value: 1 };
    const seedOf = { value: (seed % 997) / 997 };
    const { face, lick, eye } = tearGeometries(look.tall, look.wide, seed);
    const faceMesh = new THREE.Mesh(face, new THREE.ShaderMaterial({ uniforms: { time, seed: seedOf, strength, eye: { value: new THREE.Vector2(...eye) } }, vertexShader: TEAR_VERTEX, fragmentShader: TEAR_FRAGMENT, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    const lickMesh = new THREE.Mesh(lick, additive({ time, seed: seedOf, strength }, LICK_VERTEX, LICK_FRAGMENT));
    const seeds = new Float32Array(look.embers * 3);

    for (let k = 0; k < seeds.length; k++) {
        seeds[k] = ((Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
    }

    const embers = new THREE.BufferGeometry();

    embers.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(look.embers * 3), 3));
    embers.setAttribute("seeds", new THREE.Float32BufferAttribute(seeds, 3));

    const emberPoints = new THREE.Points(embers, additive({ time, high: { value: look.tall * 1.6 }, wide: { value: look.wide * 0.7 }, strength }, EMBER_VERTEX, EMBER_FRAGMENT));
    const glow = new THREE.Mesh(new THREE.CircleGeometry(look.glow, 32).rotateX(-Math.PI / 2), additive({ time, seed: seedOf, radius: { value: look.glow }, strength }, GLOW_VERTEX.replace("vAt = position.xy;", "vAt = position.xz;"), GLOW_FRAGMENT, { side: THREE.FrontSide }));

    for (const mesh of [faceMesh, lickMesh, emberPoints, glow]) {
        mesh.frustumCulled = false;
        mesh.userData.shadow = false;
    }

    faceMesh.renderOrder = 3;
    lickMesh.renderOrder = 4;
    emberPoints.renderOrder = 4;
    glow.renderOrder = 2;
    glow.position.y = 0.06;
    standing.position.y = look.lift;
    emberPoints.position.y = eye[1] * 0.5;
    standing.add(faceMesh, lickMesh, emberPoints);
    group.add(standing, glow);

    return { group, standing, strength, phase: seedOf.value, materials: [faceMesh.material, lickMesh.material, emberPoints.material, glow.material], geometries: [face, lick, embers, glow.geometry] };
}

// The altar at the rift's heart: a block of black stone on a broader foot, horns at its corners, a
// sigil burning on its top
function altarOf(time) {
    const [across, up, deep] = RIFT_LOOKS.altar.size;
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x241918, roughness: 0.92, metalness: 0.05 });
    const horn = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.7, emissive: new THREE.Color(0x3a0500) });
    const foot = new THREE.Mesh(new THREE.BoxGeometry(across * 1.15, up * 0.3, deep * 1.2), stone);
    const block = new THREE.Mesh(new THREE.BoxGeometry(across, up * 0.7, deep), stone);
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(across * 0.9, deep * 0.9).rotateX(-Math.PI / 2), additive({ time, strength: { value: 1 } }, GLOW_VERTEX.replace("vAt = position.xy;", "vAt = position.xz;"), SIGIL_FRAGMENT, { side: THREE.FrontSide }));

    foot.position.y = up * 0.15;
    block.position.y = up * 0.3 + up * 0.35;
    sigil.position.y = up + 0.01;
    sigil.userData.shadow = false;
    group.add(foot, block, sigil);

    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.85, 6), horn);

        spike.position.set((sx * across) / 2, up + 0.3, (sz * deep) / 2);
        spike.rotation.set(sz * 0.35, 0, -sx * 0.35);
        group.add(spike);
    }

    const dome = new THREE.Mesh(new THREE.SphereGeometry(RIFT_LOOKS.altar.dome, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), additive({ time, strength: { value: 1 } }, DOME_VERTEX, DOME_FRAGMENT));

    dome.userData.shadow = false;
    dome.renderOrder = 5;
    group.add(dome);

    return { group, dome };
}

// The sigil burning on the altar's top: a ring and a five-pointed star in it, smouldering, flaring
// as it throbs
const SIGIL_FRAGMENT = `
uniform float time;
uniform float strength;
varying vec2 vAt;
${NOISE}

float segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;

    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

void main() {
    vec2 p = vAt / 0.62;
    float r = length(p);
    float d = abs(r - 0.9);

    for (int k = 0; k < 5; k++) {
        float a = 1.5708 + float(k) * 2.5133;
        float b = 1.5708 + float(k + 2) * 2.5133;

        d = min(d, segment(p, 0.85 * vec2(cos(a), sin(a)), 0.85 * vec2(cos(b), sin(b))));
    }

    float line = smoothstep(0.07, 0.0, d) * (0.7 + 0.3 * riftNoise(p * 9.0 + time));

    gl_FragColor = vec4(vec3(1.0, 0.25, 0.04) * line * (0.6 + 1.0 * riftThrob(time, 0.2)) * strength, 1.0);
}
`;

// The column of light going up from the heart, in a pass
function columnOf(time) {
    const { high, wide } = RIFT_LOOKS.column;
    const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const mesh = new THREE.Mesh(plane, additive({ time, strength: { value: 1 } }, GLOW_VERTEX, COLUMN_FRAGMENT));

    mesh.scale.set(wide, high, 1);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.userData.shadow = false;

    return mesh;
}

/**
 * The hell rift open in the world, drawn (in the near pass, and its column in the far pass too): its
 * tears, its altar and its ward, from the rift as the host keeps it (update).
 */
export class HellRifts {
    /**
     * @param {THREE.Scene} scene - The near pass's (view.js scene).
     * @param {THREE.Scene} farScene - The far pass's (view.far.scene).
     */
    constructor(scene, farScene = null) {
        this.scene = scene;
        this.farScene = farScene;
        this.time = { value: 0 };
        this.group = new THREE.Group();
        this.group.name = "hell rift";
        scene.add(this.group);
        this.id = null;
        this.tears = new Map();
        this.folding = [];
        this.altar = null;
        this.columns = [];
    }

    /**
     * Drawn as the rift stands (`open`: the host's hellRifts.open, or null), where the world's
     * metres are (`origin`: the town map's [x, z]), on its ground (`groundAt`: (x, z) metres, or
     * null), turned to the camera (`camera`), `dt` seconds on; shown only out of doors (`shown`).
     */
    update(dt, open, { origin = [0, 0], groundAt = null, camera = null, shown = true } = {}) {
        this.time.value = (this.time.value + dt) % 3600;
        this.group.visible = shown;

        for (const column of this.columns) {
            column.visible = shown && Boolean(open);
        }

        if ((open?.id ?? null) !== this.id) {
            this.#close();
            this.id = open?.id ?? null;
        }

        const [ox, oz] = origin;
        const ground = (x, z) => groundAt?.(x, z) ?? 0;

        if (open) {
            const heart = [ox + open.at[0], oz + open.at[1]];

            // (The great tear behind the altar, to the north of it)
            this.#stand("heart", RIFT_LOOKS.heart, [heart[0], heart[1] - 4], ground, 7);
            open.tears.forEach((tear, k) => {
                if (tear.sealed) {
                    this.#fold(`tear-${k}`);
                } else {
                    this.#stand(`tear-${k}`, RIFT_LOOKS.tear, [ox + tear.at[0], oz + tear.at[1]], ground, 101 + k * 17);
                }
            });
            this.#raise(heart, ground, !open.guards?.fell);
            this.#column(heart, ground);
        }

        // (Those folding in on themselves, smaller and dimmer till they're gone)
        this.folding = this.folding.filter((one) => {
            one.left -= dt;

            const share = Math.max(0, one.left / RIFT_LOOKS.fold);

            one.standing.scale.set(share * share, share, 1);
            one.strength.value = 0.4 + 1.6 * (1 - share);

            if (one.left > 0) {
                return true;
            }

            this.#dispose(one);

            return false;
        });

        // (Each swelling as it throbs, as its shaders throb: RIFT_LOOKS throb)
        for (const one of this.tears.values()) {
            const beat = (((this.time.value * RIFT_LOOKS.throb + one.phase) % 1) + 1) % 1;
            const throb = Math.max(Math.exp(-(((beat - 0.08) * 14) ** 2)), 0.7 * Math.exp(-(((beat - 0.26) * 14) ** 2)));

            one.standing.scale.set(1 + 0.09 * throb, 1 + 0.035 * throb, 1);
        }

        // (Each turned to the camera, as a tear in the air is seen whichever way it's come at)
        if (camera) {
            for (const one of [...this.tears.values(), ...this.folding]) {
                one.standing.rotation.y = Math.atan2(camera.position.x - one.group.position.x, camera.position.z - one.group.position.z);
            }

            for (const column of this.columns) {
                column.rotation.y = Math.atan2(camera.position.x - column.position.x, camera.position.z - column.position.z);
            }
        }
    }

    // A tear (`key`) stood where it is (world metres), on the ground there, made the first time
    #stand(key, look, [x, z], ground, seed) {
        let one = this.tears.get(key);

        if (!one) {
            one = tearOf(look, seed, this.time);
            one.key = key;
            this.tears.set(key, one);
            this.group.add(one.group);
        }

        one.group.position.set(x, ground(x, z), z);
    }

    // A tear folding in on itself: sealed, or the rift gone
    #fold(key) {
        const one = this.tears.get(key);

        if (one) {
            this.tears.delete(key);
            one.left = RIFT_LOOKS.fold;
            this.folding.push(one);
        }
    }

    // The altar at the heart (warded: its dome over it), made the first time
    #raise([x, z], ground, warded) {
        if (!this.altar) {
            this.altar = altarOf(this.time);
            this.group.add(this.altar.group);
        }

        this.altar.group.position.set(x, ground(x, z), z);
        this.altar.dome.visible = warded;
    }

    // The column of light going up from the heart, in each pass
    #column([x, z], ground) {
        if (!this.columns.length) {
            this.columns = [this.scene, this.farScene].filter(Boolean).map((scene) => {
                const column = columnOf(this.time);

                scene.add(column);

                return column;
            });
        }

        for (const column of this.columns) {
            column.position.set(x, ground(x, z - 4) + RIFT_LOOKS.heart.lift, z - 4);
        }
    }

    // All of it gone: its tears folding in on themselves, its altar and its column taken away
    #close() {
        for (const key of [...this.tears.keys()]) {
            this.#fold(key);
        }

        if (this.altar) {
            this.altar.group.removeFromParent();
            this.altar.group.traverse((each) => {
                each.geometry?.dispose();
                each.material?.dispose();
            });
            this.altar = null;
        }

        for (const column of this.columns) {
            column.removeFromParent();
            column.geometry.dispose();
            column.material.dispose();
        }

        this.columns = [];
    }

    #dispose(one) {
        one.group.removeFromParent();
        one.materials.forEach((material) => material.dispose());
        one.geometries.forEach((geometry) => geometry.dispose());
    }

    /** Whether a point (world metres) is in the open rift's land (HELL_RIFT.radius of its heart), for how strongly the sky's reddened there (0 to 1: fully within a tenth of its edge). */
    static within(open, [x, z], origin = [0, 0]) {
        if (!open) {
            return 0;
        }

        const far = Math.hypot(x - origin[0] - open.at[0], z - origin[1] - open.at[1]);

        return Math.max(0, Math.min(1, (HELL_RIFT.radius - far) / (HELL_RIFT.radius * 0.1)));
    }

    dispose() {
        this.#close();
        this.folding.forEach((one) => this.#dispose(one));
        this.folding = [];
        this.group.removeFromParent();
    }
}

/**
 * A rift's tear or altar in the battle, as an avatar (game.js): only where it stands, as tall as
 * it's drawn (for its plate and the blows on it); drawn by HellRifts.
 */
export class RiftThingAvatar extends FortAvatar {
    /** A tear's ("tear") or the altar's ("altar"). */
    constructor(kind) {
        super("stakes");
        this.kind = kind;
        this.character.height = kind === "altar" ? RIFT_LOOKS.altar.size[1] + 0.6 : RIFT_LOOKS.tear.lift + RIFT_LOOKS.tear.tall;
        this.loops = this.character.height * 0.6;
    }
}
