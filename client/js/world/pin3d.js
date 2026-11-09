// The world map's pin in the world (the terrain plan's M7g, §9 Pins on the world map): a round
// column of blue light rising very high into the sky where it's dropped, seen from far off, and a
// glowing blue way from the player to its foot, the way they'd walk. And the pings of the player's
// party (app/mapicons.js PING): each a lower column of the party's green light where it was made,
// as the pin's, fading as it gets older.
//
// The way there is a ribbon of misty light floating half a metre over the ground, smoothed over its
// bumps, turned to face the camera, a swell of light leaving the player along it every second and
// a half, and wisps drifting up off it near them; hidden by what stands in front of it, but never
// by the grass's blades.
//
// The column is a strip that always turns to face the camera (round, from wherever it's seen),
// drawn twice: in the near pass where it's within the near camera's reach (FAR.nearFar), over the
// near ground and behind what stands in front of it, and in the far pass for the rest of it, above
// the near camera's reach and out to the far land's, where it's brought in towards the camera as
// far as it's beyond that and shrunk as much, so it looks the same however far off (through the
// haze a little fainter). It's never thinner on the screen than a few pixels. Additive, no shadows,
// no textures: one draw near, one far, and a glow on the ground round its foot.

import * as THREE from "three";
import { nearestAlong } from "../core/journey.js";
import { FAR } from "./far/levels.js";

/**
 * How the column looks: how high it rises (metres), its bright core's half width (metres), how
 * wide its glow is (core half widths each way), the least it's drawn across on the screen (a
 * share of the distance to it: about 5 pixels either side of its middle on a phone), its colours (linear), how bright, and
 * how much fainter at the far land's edge.
 */
export const PIN_COLUMN = Object.freeze({ height: 900, half: 1.4, glow: 6, least: 0.006, core: [0.78, 0.92, 1.0], edge: [0.18, 0.48, 1.0], strength: 1.5, haze: 0.45 });

/** How a ping's column looks, as the pin's (PIN_COLUMN: its glow, its least width and its haze the same): in the party's green. */
export const PING_COLUMN = Object.freeze({ height: 420, half: 1.1, core: [0.82, 1.0, 0.84], edge: [0.14, 0.82, 0.26], strength: 1.4 });

/**
 * How the way there looks: a ribbon of misty light floating over the ground, turned to face the
 * camera. How wide it is (metres either side of its middle) and the least it's drawn across (a
 * share of the distance to it); how high its middle floats over the ground as it's drawn (metres),
 * its heights smoothed over `smooth` points either way (so it glides over bumps and across dips,
 * never lower than that over the ground); how far along it's drawn at most (metres: past it, the
 * column shows the way) and how far apart its points (metres); how strong its light; how far in
 * front of it something has to be to hide it (metres: so the grass's blades never do, and a hill,
 * a wall or a tree does); how much it rises and falls as it floats (metres); and its pulses, a
 * swell of light leaving the player every `every` seconds and running along it at `speed` metres a
 * second, away from them, fading as it goes.
 */
export const WAY_LINE = Object.freeze({
    half: 0.3,
    least: 0.0025,
    over: 0.5,
    smooth: 2,
    reach: 180,
    step: 1,
    strength: 0.75,
    through: 1.2,
    bob: 0.07,
    pulse: Object.freeze({ every: 1.5, speed: 12 }),
});

/**
 * The wisps drifting up off the way: how many, how long each lasts (seconds), how far it rises
 * (metres), where along the way they rise (metres past the player, from and to), and how big each
 * is (metres across).
 */
export const WAY_WISPS = Object.freeze({ count: 36, life: 2.8, rise: 0.9, from: 3, to: 40, size: 0.16 });

/**
 * Where the player's come to along the way there, followed each frame: looked for from `back`
 * metres behind where they were last to `on` metres on from it, or anywhere along it once they're
 * more than `off` metres from it there.
 */
export const WAY_FOLLOW = Object.freeze({ back: 3, on: 12, off: 6 });

/**
 * The glow on the ground round a column's foot: how far across it's drawn (metres), and how far
 * out its bright ring is (a share of its half width; it swells and shrinks a little with time).
 */
export const FOOT_RING = Object.freeze({ size: 7, ring: 0.62 });

/**
 * How near the pin's foot the player has to come to have reached it (metres): inside its ring of
 * light (FOOT_RING), where it's taken away (app/game.js).
 */
export const PIN_REACHED = (FOOT_RING.size / 2) * FOOT_RING.ring;

const COLUMN_VERTEX = /* glsl */ `
uniform vec3 foot;
uniform float reach;
uniform float time;
uniform float coreHalf;
uniform float height;
attribute vec2 at;
varying vec2 vAt;
varying float vHaze;
varying float vDepth;

void main() {
    vec3 rel = foot - cameraPosition;
    float far = length(rel.xz);
    // (Beyond the far camera's reach: brought in, and shrunk as much)
    float k = min(1.0, reach / max(far, 1.0));
    vec3 base = cameraPosition + rel * k;
    vec2 away = normalize(rel.xz + vec2(0.0001));
    vec3 side = vec3(-away.y, 0.0, away.x);
    float wide = max(coreHalf, far * ${PIN_COLUMN.least.toFixed(5)}) * k;
    vec3 world = base + side * at.x * wide * ${PIN_COLUMN.glow.toFixed(1)} + vec3(0.0, at.y * height * k, 0.0);

    vAt = vec2(at.x * ${PIN_COLUMN.glow.toFixed(1)}, at.y);
    vHaze = 1.0 - ${PIN_COLUMN.haze.toFixed(2)} * smoothstep(300.0, 4000.0, far);
    vec4 view = viewMatrix * vec4(world, 1.0);
    vDepth = length(view.xyz) / k;
    gl_Position = projectionMatrix * view;
}
`;

const COLUMN_FRAGMENT = /* glsl */ `
uniform float time;
uniform float nearPass;
uniform vec3 core;
uniform vec3 edge;
uniform float strength;
varying vec2 vAt;
varying float vHaze;
varying float vDepth;

void main() {
    // (Each pass draws its own part: the near what's within the near camera's reach)
    if ((nearPass > 0.5) != (vDepth < ${(FAR.nearFar * 0.97).toFixed(1)})) discard;

    float across = abs(vAt.x);
    float middle = exp(-across * across * 1.8);
    float glow = exp(-across * 0.9) * 0.45;
    float up = vAt.y;
    float fade = (1.0 - smoothstep(0.25, 1.0, up)) * smoothstep(0.0, 0.002, up);
    // (Light rising up it, slowly)
    float rising = 0.82 + 0.18 * sin(up * 140.0 - time * 2.2);
    vec3 colour = mix(edge, core, middle);

    gl_FragColor = vec4(colour * (middle + glow) * fade * rising * vHaze * strength, 1.0);
}
`;

const RING_FRAGMENT = /* glsl */ `
uniform float time;
uniform vec3 edge;
uniform float strength;
varying vec2 vUv;

void main() {
    float r = length(vUv - 0.5) * 2.0;
    float off = (r - ${FOOT_RING.ring.toFixed(2)} - 0.05 * sin(time * 2.0)) * 9.0;
    float ring = exp(-off * off) * 0.8;
    float pool = (1.0 - smoothstep(0.0, 1.0, r)) * 0.35;
    float lit = (ring + pool) * (1.0 - smoothstep(0.9, 1.0, r));

    gl_FragColor = vec4(edge * lit * strength, 1.0);
}
`;

const RING_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// The way there: each point's middle (`position`, floating over the ground), which way the way
// runs there (`ahead`), and which side of it a corner is (`across`): the ribbon turned about its
// middle to face the camera, never thinner than WAY_LINE.least of the distance to it, rising and
// falling a little as it floats; and drawn a little nearer the camera than it is (WAY_LINE.through
// metres), where it's seen on the screen the same, so the grass's blades in front of it never hide
// it and what stands further in front does
const LINE_VERTEX = /* glsl */ `
uniform float time;
attribute vec3 ahead;
attribute float along;
attribute float across;
varying float vAlong;
varying float vAcross;

void main() {
    vec3 middle = (modelMatrix * vec4(position, 1.0)).xyz;

    middle.y += ${WAY_LINE.bob.toFixed(3)} * (0.5 + 0.5 * sin(along * 0.31 - time * 1.1));

    vec3 toCamera = cameraPosition - middle;
    float far = max(length(toCamera), 0.001);
    vec3 way = normalize(mat3(modelMatrix) * ahead);
    vec3 side = cross(way, toCamera / far);
    float sideways = length(side);

    // (Looked at end on: across the way, on the level)
    side = sideways > 0.05 ? side / sideways : normalize(vec3(-way.z, 0.0, way.x) + vec3(0.0001, 0.0, 0.0));

    float wide = max(${WAY_LINE.half.toFixed(3)}, far * ${WAY_LINE.least.toFixed(5)});
    vec4 view = viewMatrix * vec4(middle + side * across * wide, 1.0);
    float distance = max(length(view.xyz), 0.001);

    view.xyz *= max(distance - ${WAY_LINE.through.toFixed(2)}, distance * 0.5) / distance;
    vAlong = along;
    vAcross = across;
    gl_Position = projectionMatrix * view;
}
`;

// Its light: a bright thread down its middle in a soft mist feathered out to its edges, wavering,
// a shimmer drifting along it; fading in from the player (`from`: how far along the way drawn
// they've come since it was laid) and out at its end; and the pulses (`pulse`: how far the one
// leaving the player's come, metres, kept on as the way's laid again), each a swell of whiter light
// with a sharp front and a long tail, fading as it goes
const LINE_FRAGMENT = /* glsl */ `
uniform float time;
uniform float lineLength;
uniform float from;
uniform float pulse;
varying float vAlong;
varying float vAcross;

void main() {
    float waver = 0.1 * sin(vAlong * 1.7 + time * 1.3) + 0.07 * sin(vAlong * 0.63 - time * 0.9);
    float across = clamp(abs(vAcross + waver), 0.0, 1.0);
    float thread = exp(-across * across * 26.0);
    float mist = 1.0 - smoothstep(0.0, 1.0 - abs(waver), across);
    float shimmer = 0.78 + 0.22 * sin(vAlong * 0.9 - time * 2.3) * sin(vAlong * 0.37 + time * 1.1);
    float past = vAlong - from;
    float fadeOut = min(25.0, lineLength * 0.4);
    float ends = smoothstep(0.6, 2.6, past) * (1.0 - smoothstep(lineLength - fadeOut, lineLength, vAlong));
    float spacing = ${(WAY_LINE.pulse.every * WAY_LINE.pulse.speed).toFixed(2)};
    float behind = mod(pulse - past, spacing);
    float swell = max(exp(-behind / 3.2), exp(-pow((spacing - behind) / 0.7, 2.0))) * (1.0 - 0.7 * smoothstep(0.0, ${WAY_LINE.reach.toFixed(1)}, past));
    vec3 edge = vec3(${PIN_COLUMN.edge.join(", ")});
    vec3 core = vec3(${PIN_COLUMN.core.join(", ")});
    vec3 light = mix(edge, core, thread * 0.8) * (thread * 1.1 + mist * mist * 0.5) * shimmer;

    light += core * swell * (thread * 0.9 + mist * 0.45);
    gl_FragColor = vec4(light * ends * ${WAY_LINE.strength.toFixed(2)} * 1.6, 1.0);
}
`;

const additive = (uniforms, vertexShader, fragmentShader) =>
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });

// A column's strip: from its foot up, turned to the camera in its shader (its rows closer together
// low down, where it's seen near)
function columnStrip() {
    const strip = new THREE.BufferGeometry();
    const rows = 24;
    const at = [];
    const index = [];

    for (let r = 0; r <= rows; r++) {
        const up = (r / rows) ** 2;

        at.push(-1, up, 1, up);

        if (r < rows) {
            index.push(r * 2, r * 2 + 1, r * 2 + 2, r * 2 + 1, r * 2 + 3, r * 2 + 2);
        }
    }

    strip.setAttribute("at", new THREE.Float32BufferAttribute(at, 2));
    strip.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(at.length * 1.5), 3));
    strip.setIndex(index);

    return strip;
}

// A column in a pass (`near`, or the far pass), its look (`look`: PIN_COLUMN's or PING_COLUMN's)
// and where it stands, how far the far pass sees and the time shared (`shared`: { foot, reach,
// time }), as bright as `strength` has it ({ value }), named
function column(strip, near, look, shared, strength, name) {
    const uniforms = { ...shared, nearPass: { value: near ? 1 : 0 }, coreHalf: { value: look.half }, height: { value: look.height }, core: { value: new THREE.Vector3(...look.core) }, edge: { value: new THREE.Vector3(...look.edge) }, strength };
    const mesh = new THREE.Mesh(strip, additive(uniforms, COLUMN_VERTEX, COLUMN_FRAGMENT));

    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.name = `${name} ${near ? "near" : "far"}`;
    mesh.visible = false;

    return mesh;
}

// The glow on the ground round a column's foot (`look`: its colours), as bright as `strength` has it ({ value })
function footRing(look, time, strength, name) {
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(FOOT_RING.size, FOOT_RING.size).rotateX(-Math.PI / 2), additive({ time, edge: { value: new THREE.Vector3(...look.edge) }, strength }, RING_VERTEX, RING_FRAGMENT));

    ring.name = name;
    ring.visible = false;
    ring.renderOrder = 4;

    return ring;
}

export class PinMarks {
    /**
     * @param {THREE.Scene} scene - The near pass's (view.js scene).
     * @param {THREE.Scene} farScene - The far pass's (view.far.scene).
     */
    constructor(scene, farScene) {
        this.time = { value: 0 };
        this.foot = { value: new THREE.Vector3() };
        this.reach = { value: 1000 };

        // The column: a strip from its foot up, turned to the camera in its shader (one in each
        // pass); and the glow on the ground round its foot
        const shared = { foot: this.foot, reach: this.reach, time: this.time };

        this.strip = columnStrip();
        this.near = column(this.strip, true, PIN_COLUMN, shared, { value: PIN_COLUMN.strength }, "pin column");
        this.far = column(this.strip, false, PIN_COLUMN, shared, { value: PIN_COLUMN.strength }, "pin column");
        this.ring = footRing(PIN_COLUMN, this.time, { value: 1.4 }, "pin ring");

        // The way there: as many points as it can have made room for once, those it has drawn (two
        // corners each, at its middle, turned to the camera in its shader; a strip between each two)
        const most = Math.floor(WAY_LINE.reach / WAY_LINE.step) + 2;
        const line = new THREE.BufferGeometry();
        const strips = [];

        for (let k = 0; k < most - 1; k++) {
            strips.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
        }

        line.setAttribute("position", new THREE.BufferAttribute(new Float32Array(most * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
        line.setAttribute("ahead", new THREE.BufferAttribute(new Float32Array(most * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
        line.setAttribute("along", new THREE.BufferAttribute(new Float32Array(most * 2), 1).setUsage(THREE.DynamicDrawUsage));
        line.setAttribute("across", new THREE.BufferAttribute(new Float32Array(Array.from({ length: most * 2 }, (_, v) => (v % 2 ? 1 : -1))), 1));
        line.setIndex(strips);
        this.most = most;
        this.lineLength = { value: 0 };
        this.from = { value: 0 };
        this.pulse = { value: 0 };
        this.line = new THREE.Mesh(line, additive({ time: this.time, lineLength: this.lineLength, from: this.from, pulse: this.pulse }, LINE_VERTEX, LINE_FRAGMENT));
        this.line.name = "way to the pin";
        this.line.frustumCulled = false;
        this.line.visible = false;
        this.line.renderOrder = 4;
        // (Its middle's points as laid, [x, y, z], and how far along each is: where the player's
        // come to along it, and where the wisps rise)
        this.middles = [];
        this.flat = [];
        this.alongs = [];

        // The wisps drifting up off it near the player: each where it rose from, how old it is, and
        // which way it drifts
        this.wisps = new Wisps();

        scene.add(this.near, this.ring, this.line, this.wisps.points);
        farScene.add(this.far);
        this.scenes = [scene, farScene];
        this.clock = null;
    }

    /** Where the pin stands (world metres: x, the ground's height, z), or nowhere (null). */
    setPin(at) {
        const shown = Boolean(at);

        this.near.visible = this.far.visible = this.ring.visible = shown;

        if (shown) {
            this.foot.value.set(at.x, at.y, at.z);
            this.ring.position.set(at.x, at.y + 0.06, at.z);
        } else {
            this.setLine(null);
        }
    }

    /**
     * The way there (`points`: [x, y, z] world metres, the ground's height at each, from the
     * player's feet on), or none (null, or fewer than two): floating WAY_LINE.over over the
     * ground, its heights smoothed (floatingOver).
     */
    setLine(points) {
        const geometry = this.line.geometry;

        if (!points || points.length < 2) {
            this.line.visible = false;
            this.wisps.points.visible = false;
            this.middles = [];
            this.flat = [];
            this.alongs = [];

            return;
        }

        const count = Math.min(points.length, this.most);
        const middles = floatingOver(points.slice(0, count));
        const positions = geometry.attributes.position.array;
        const ahead = geometry.attributes.ahead.array;
        const along = geometry.attributes.along.array;
        const alongs = [];
        let walked = 0;

        for (let k = 0; k < count; k++) {
            const [x, y, z] = middles[k];
            const [px, py, pz] = middles[Math.max(0, k - 1)];
            const [nx, ny, nz] = middles[Math.min(count - 1, k + 1)];
            const [dx, dy, dz] = [nx - px, ny - py, nz - pz];
            const long = Math.hypot(dx, dy, dz) || 1;

            if (k > 0) {
                walked += Math.hypot(x - middles[k - 1][0], z - middles[k - 1][2]);
            }

            alongs.push(walked);

            for (const s of [0, 1]) {
                const v = k * 2 + s;

                positions.set([x, y, z], v * 3);
                ahead.set([dx / long, dy / long, dz / long], v * 3);
                along[v] = walked;
            }
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.ahead.needsUpdate = true;
        geometry.attributes.along.needsUpdate = true;
        geometry.setDrawRange(0, (count - 1) * 6);
        this.lineLength.value = walked;
        this.from.value = 0;
        this.middles = middles;
        this.flat = middles.map(([x, , z]) => [x, z]);
        this.alongs = alongs;
        this.line.visible = true;
        this.wisps.points.visible = true;
    }

    /**
     * The time (seconds), for the light rising up the column and along the way there, its pulses
     * and its wisps; how far the far pass sees (metres); and where the player is ([x, z] metres:
     * how far along the way they've come since it was laid, where it fades in from and where its
     * pulses leave them from).
     */
    update(time, farReach, at = null) {
        const dt = this.clock === null ? 0 : Math.min(0.25, Math.max(0, time - this.clock));

        this.clock = time;
        this.time.value = time;
        this.reach.value = farReach * 0.9;
        this.pulse.value = (this.pulse.value + dt * WAY_LINE.pulse.speed) % (WAY_LINE.pulse.every * WAY_LINE.pulse.speed * 1000);

        // (Looked for near where they were along it last: a way that comes back close to itself,
        // round a bend or up a slope's zigzags, isn't taken for further along than they are;
        // anywhere along it once they're well off it there)
        if (this.line.visible && at && this.flat.length > 1) {
            const near = nearestAlong(this.flat, at, { from: this.from.value - WAY_FOLLOW.back, to: this.from.value + WAY_FOLLOW.on });

            this.from.value = near.off <= WAY_FOLLOW.off ? near.along : nearestAlong(this.flat, at).along;
        }

        this.wisps.update(dt, this.line.visible ? this : null);
    }

    /** Where along the way there a point is, `distance` metres from its start ([x, y, z] metres, its middle as laid), or null if there's none. */
    pointAt(distance) {
        const [middles, alongs] = [this.middles, this.alongs];

        if (middles.length < 2) {
            return null;
        }

        let k = 1;

        while (k < alongs.length - 1 && alongs[k] < distance) {
            k++;
        }

        const t = Math.min(1, Math.max(0, (distance - alongs[k - 1]) / (alongs[k] - alongs[k - 1] || 1)));

        return middles[k - 1].map((value, i) => value + (middles[k][i] - value) * t);
    }

    /** Let go of it all. */
    dispose() {
        for (const mesh of [this.near, this.far, this.ring, this.line]) {
            mesh.removeFromParent();
            mesh.material.dispose();
        }

        this.strip.dispose();
        this.ring.geometry.dispose();
        this.line.geometry.dispose();
        this.wisps.dispose();
    }
}

/**
 * The way there's middle at each of its points ([x, y, z] metres, the ground's height at each):
 * WAY_LINE.over over the ground, its heights the mean of those either side (weighted, as far as
 * WAY_LINE.smooth points each way, and as many each way at its ends), so it glides over bumps and
 * across dips; never lower over the ground than that.
 */
export function floatingOver(points) {
    return points.map(([x, ground, z], k) => {
        const reach = Math.min(WAY_LINE.smooth, k, points.length - 1 - k);
        let [sum, weights] = [0, 0];

        for (let j = -reach; j <= reach; j++) {
            const weight = reach + 1 - Math.abs(j);

            sum += points[k + j][1] * weight;
            weights += weight;
        }

        return [x, Math.max(sum / weights, ground) + WAY_LINE.over, z];
    });
}

// A soft round spot of light, for the wisps (its middle brightest)
function spot() {
    const size = 32;
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
            const lit = Math.round(255 * Math.max(0, 1 - r) ** 2);

            data.set([lit, lit, lit, 255], (y * size + x) * 4);
        }
    }

    const texture = new THREE.DataTexture(data, size, size);

    texture.needsUpdate = true;

    return texture;
}

// The wisps drifting up off the way there near the player: each rising from a point on it,
// swaying as it goes, brightening and fading over its life, and rising again from another once
// it's gone (WAY_WISPS); their lives spread out, so as many rise at any time
class Wisps {
    constructor() {
        const { count } = WAY_WISPS;
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
        this.texture = spot();
        this.points = new THREE.Points(
            geometry,
            new THREE.PointsMaterial({ size: WAY_WISPS.size, map: this.texture, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false }),
        );
        this.points.name = "wisps over the way to the pin";
        this.points.frustumCulled = false;
        this.points.visible = false;
        this.points.renderOrder = 4;
        // (A little sequence of its own, the same every time: where each rises and which way it drifts)
        this.seed = 1;
        this.each = Array.from({ length: count }, (_, k) => ({ age: (k / count) * WAY_WISPS.life, from: null, drift: [0, 0], phase: 0 }));
    }

    #random() {
        this.seed = (this.seed * 1103515245 + 12345) % 2147483648;

        return this.seed / 2147483648;
    }

    /** On by `dt` seconds, rising from the way (`way`: the PinMarks, or none: all gone at once). */
    update(dt, way) {
        const positions = this.points.geometry.attributes.position.array;
        const colours = this.points.geometry.attributes.color.array;
        const edge = PIN_COLUMN.edge;

        for (const [k, wisp] of this.each.entries()) {
            wisp.age += dt;

            if (!way) {
                wisp.from = null;
            } else if (wisp.age >= WAY_WISPS.life || !wisp.from) {
                const past = way.from.value + WAY_WISPS.from + this.#random() * (WAY_WISPS.to - WAY_WISPS.from);

                wisp.age = wisp.from ? wisp.age % WAY_WISPS.life : wisp.age;
                wisp.from = past < way.lineLength.value - 2 ? way.pointAt(past) : null;
                wisp.drift = [(this.#random() - 0.5) * 0.5, (this.#random() - 0.5) * 0.5];
                wisp.phase = this.#random() * Math.PI * 2;
            }

            const life = Math.min(1, wisp.age / WAY_WISPS.life);
            const lit = wisp.from ? Math.sin(Math.PI * life) * 0.85 : 0;
            const [x, y, z] = wisp.from ?? [0, -1000, 0];
            const sway = Math.sin(wisp.phase + wisp.age * 2.1) * 0.12;

            positions.set([x + wisp.drift[0] * life + sway, y + WAY_WISPS.rise * life, z + wisp.drift[1] * life - sway], k * 3);
            colours.set([edge[0] * lit + 0.3 * lit * lit, edge[1] * lit + 0.3 * lit * lit, edge[2] * lit], k * 3);
        }

        this.points.geometry.attributes.position.needsUpdate = true;
        this.points.geometry.attributes.color.needsUpdate = true;
    }

    dispose() {
        this.points.removeFromParent();
        this.points.geometry.dispose();
        this.points.material.dispose();
        this.texture.dispose();
    }
}

export class PingBeacons {
    /**
     * @param {THREE.Scene} scene - The near pass's (view.js scene).
     * @param {THREE.Scene} farScene - The far pass's (view.far.scene).
     */
    constructor(scene, farScene) {
        this.scene = scene;
        this.farScene = farScene;
        this.time = { value: 0 };
        this.reach = { value: 1000 };
        this.strip = columnStrip();

        /** What's drawn, by the ping's id: { near, far, ring, foot, strength }. */
        this.shown = new Map();
    }

    /**
     * The pings to show (`pings`: [{ id, x, y (the ground's height there), z, fade (1 new, down to
     * 0 as it goes) }] world metres), each as it was (and those no longer in it let go).
     */
    set(pings) {
        const wanted = new Set(pings.map(({ id }) => id));

        for (const [id, drawn] of [...this.shown]) {
            if (!wanted.has(id)) {
                for (const mesh of [drawn.near, drawn.far, drawn.ring]) {
                    mesh.removeFromParent();
                    mesh.material.dispose();
                }

                drawn.ring.geometry.dispose();
                this.shown.delete(id);
            }
        }

        for (const { id, x, y, z, fade } of pings) {
            let drawn = this.shown.get(id);

            if (!drawn) {
                const foot = { value: new THREE.Vector3() };
                const strength = { value: 0 };
                const glow = { value: 0 };
                const shared = { foot, reach: this.reach, time: this.time };

                drawn = { foot, strength, glow, near: column(this.strip, true, PING_COLUMN, shared, strength, `ping ${id} column`), far: column(this.strip, false, PING_COLUMN, shared, strength, `ping ${id} column`), ring: footRing(PING_COLUMN, this.time, glow, `ping ${id} ring`) };
                drawn.near.visible = drawn.far.visible = drawn.ring.visible = true;
                this.scene.add(drawn.near, drawn.ring);
                this.farScene.add(drawn.far);
                this.shown.set(id, drawn);
            }

            drawn.foot.value.set(x, y, z);
            drawn.ring.position.set(x, y + 0.06, z);
            drawn.strength.value = PING_COLUMN.strength * fade;
            drawn.glow.value = 1.4 * fade;
        }
    }

    /** The time (seconds), for the light rising up the columns; and how far the far pass sees (metres). */
    update(time, farReach) {
        this.time.value = time;
        this.reach.value = farReach * 0.9;
    }

    /** Let go of it all. */
    dispose() {
        this.set([]);
        this.strip.dispose();
    }
}
