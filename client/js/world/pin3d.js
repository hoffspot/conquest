// The world map's pin in the world (the terrain plan's M7g, §9 Pins on the world map): a round
// column of blue light rising very high into the sky where it's dropped, seen from far off, and a
// thin, half-transparent, glowing blue line along the ground from the player to its foot, the way
// they'd walk.
//
// The column is a strip that always turns to face the camera (round, from wherever it's seen),
// drawn twice: in the near pass where it's within the near camera's reach (FAR.nearFar), over the
// near ground and behind what stands in front of it, and in the far pass for the rest of it, above
// the near camera's reach and out to the far land's, where it's brought in towards the camera as
// far as it's beyond that and shrunk as much, so it looks the same however far off (through the
// haze a little fainter). It's never thinner on the screen than a few pixels. Additive, no shadows,
// no textures: one draw near, one far, and a glow on the ground round its foot.

import * as THREE from "three";
import { FAR } from "./far/levels.js";

/**
 * How the column looks: how high it rises (metres), its bright core's half width (metres), how
 * wide its glow is (core half widths each way), the least it's drawn across on the screen (a
 * share of the distance to it: about 5 pixels either side of its middle on a phone), its colours (linear), how bright, and
 * how much fainter at the far land's edge.
 */
export const PIN_COLUMN = Object.freeze({ height: 900, half: 1.4, glow: 6, least: 0.006, core: [0.78, 0.92, 1.0], edge: [0.18, 0.48, 1.0], strength: 1.5, haze: 0.45 });

/**
 * How the line along the ground looks: how wide (metres), how high over the ground (metres, over
 * the grass's roots), how far along it's drawn at most (metres: past it, the column shows the
 * way), how far apart its points (metres), and how strong its light.
 */
export const WAY_LINE = Object.freeze({ half: 0.16, over: 0.14, reach: 180, step: 1, strength: 0.7 });

const COLUMN_VERTEX = /* glsl */ `
uniform vec3 foot;
uniform float reach;
uniform float time;
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
    float wide = max(${PIN_COLUMN.half.toFixed(3)}, far * ${PIN_COLUMN.least.toFixed(5)}) * k;
    vec3 world = base + side * at.x * wide * ${PIN_COLUMN.glow.toFixed(1)} + vec3(0.0, at.y * ${PIN_COLUMN.height.toFixed(1)} * k, 0.0);

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
varying vec2 vAt;
varying float vHaze;
varying float vDepth;

void main() {
    // (Each pass draws its own part: the near what's within the near camera's reach)
    if ((nearPass > 0.5) != (vDepth < ${(FAR.nearFar * 0.97).toFixed(1)})) discard;

    float across = abs(vAt.x);
    float core = exp(-across * across * 1.8);
    float glow = exp(-across * 0.9) * 0.45;
    float up = vAt.y;
    float fade = (1.0 - smoothstep(0.25, 1.0, up)) * smoothstep(0.0, 0.002, up);
    // (Light rising up it, slowly)
    float rising = 0.82 + 0.18 * sin(up * 140.0 - time * 2.2);
    vec3 colour = mix(vec3(${PIN_COLUMN.edge.join(", ")}), vec3(${PIN_COLUMN.core.join(", ")}), core);
    float strength = (core + glow) * fade * rising * vHaze * ${PIN_COLUMN.strength.toFixed(2)};

    gl_FragColor = vec4(colour * strength, 1.0);
}
`;

const RING_FRAGMENT = /* glsl */ `
uniform float time;
varying vec2 vUv;

void main() {
    float r = length(vUv - 0.5) * 2.0;
    float off = (r - 0.62 - 0.05 * sin(time * 2.0)) * 9.0;
    float ring = exp(-off * off) * 0.8;
    float pool = (1.0 - smoothstep(0.0, 1.0, r)) * 0.35;
    float strength = (ring + pool) * (1.0 - smoothstep(0.9, 1.0, r));

    gl_FragColor = vec4(vec3(${PIN_COLUMN.edge.join(", ")}) * strength * 1.4, 1.0);
}
`;

const RING_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const LINE_VERTEX = /* glsl */ `
attribute float along;
attribute float across;
varying float vAlong;
varying float vAcross;

void main() {
    vAlong = along;
    vAcross = across;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const LINE_FRAGMENT = /* glsl */ `
uniform float time;
uniform float lineLength;
varying float vAlong;
varying float vAcross;

void main() {
    float edge = 1.0 - smoothstep(0.35, 1.0, abs(vAcross));
    // (Pulses running along it the way to go, and fading in from the player's feet and out at its end)
    float pulse = 0.7 + 0.3 * smoothstep(0.6, 1.0, sin(vAlong * 0.55 - time * 4.0));
    float ends = smoothstep(0.5, 2.5, vAlong) * (1.0 - smoothstep(lineLength - 25.0, lineLength, vAlong));
    float strength = edge * pulse * ends * ${WAY_LINE.strength.toFixed(2)};

    gl_FragColor = vec4(vec3(${PIN_COLUMN.edge.join(", ")}) * 1.6 * strength, 1.0);
}
`;

const additive = (uniforms, vertexShader, fragmentShader) =>
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });

export class PinMarks {
    /**
     * @param {THREE.Scene} scene - The near pass's (view.js scene).
     * @param {THREE.Scene} farScene - The far pass's (view.far.scene).
     */
    constructor(scene, farScene) {
        this.time = { value: 0 };
        this.foot = { value: new THREE.Vector3() };
        this.reach = { value: 1000 };

        // The column: a strip from its foot up, turned to the camera in its shader (one in each pass)
        const strip = new THREE.BufferGeometry();
        const rows = 24;
        const at = [];
        const index = [];

        for (let r = 0; r <= rows; r++) {
            // (Its rows closer together low down, where it's seen near)
            const up = (r / rows) ** 2;

            at.push(-1, up, 1, up);

            if (r < rows) {
                index.push(r * 2, r * 2 + 1, r * 2 + 2, r * 2 + 1, r * 2 + 3, r * 2 + 2);
            }
        }

        strip.setAttribute("at", new THREE.Float32BufferAttribute(at, 2));
        strip.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(at.length * 1.5), 3));
        strip.setIndex(index);
        this.strip = strip;

        const column = (near) => {
            const mesh = new THREE.Mesh(strip, additive({ foot: this.foot, reach: this.reach, time: this.time, nearPass: { value: near ? 1 : 0 } }, COLUMN_VERTEX, COLUMN_FRAGMENT));

            mesh.frustumCulled = false;
            mesh.renderOrder = 5;
            mesh.name = `pin column ${near ? "near" : "far"}`;
            mesh.visible = false;

            return mesh;
        };

        this.near = column(true);
        this.far = column(false);

        // The glow on the ground round its foot
        this.ring = new THREE.Mesh(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), additive({ time: this.time }, RING_VERTEX, RING_FRAGMENT));
        this.ring.name = "pin ring";
        this.ring.visible = false;
        this.ring.renderOrder = 4;

        // The line along the ground: as many points as it can have made room for once, those it
        // has drawn (a strip each side of the way between each two)
        const most = Math.floor(WAY_LINE.reach / WAY_LINE.step) + 2;
        const line = new THREE.BufferGeometry();
        const strips = [];

        for (let k = 0; k < most - 1; k++) {
            strips.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
        }

        line.setAttribute("position", new THREE.BufferAttribute(new Float32Array(most * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
        line.setAttribute("along", new THREE.BufferAttribute(new Float32Array(most * 2), 1).setUsage(THREE.DynamicDrawUsage));
        line.setAttribute("across", new THREE.BufferAttribute(new Float32Array(Array.from({ length: most * 2 }, (_, v) => (v % 2 ? 1 : -1))), 1));
        line.setIndex(strips);
        this.most = most;
        this.lineLength = { value: 0 };
        this.line = new THREE.Mesh(line, additive({ time: this.time, lineLength: this.lineLength }, LINE_VERTEX, LINE_FRAGMENT));
        this.line.name = "way to the pin";
        this.line.frustumCulled = false;
        this.line.visible = false;
        this.line.renderOrder = 4;
        this.line.material.polygonOffset = true;
        this.line.material.polygonOffsetFactor = -2;
        this.line.material.polygonOffsetUnits = -2;

        scene.add(this.near, this.ring, this.line);
        farScene.add(this.far);
        this.scenes = [scene, farScene];
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
     * The line along the ground (`points`: [x, y, z] world metres, the ground's height at each,
     * from the player's feet on), or none (null, or fewer than two).
     */
    setLine(points) {
        const geometry = this.line.geometry;

        if (!points || points.length < 2) {
            this.line.visible = false;

            return;
        }

        const count = Math.min(points.length, this.most);
        const positions = geometry.attributes.position.array;
        const along = geometry.attributes.along.array;
        let walked = 0;

        for (let k = 0; k < count; k++) {
            const [x, y, z] = points[k];
            const [px, , pz] = points[Math.max(0, k - 1)];
            const [nx, , nz] = points[Math.min(count - 1, k + 1)];
            let [dx, dz] = [nx - px, nz - pz];
            const long = Math.hypot(dx, dz) || 1;

            [dx, dz] = [dx / long, dz / long];

            if (k > 0) {
                walked += Math.hypot(x - points[k - 1][0], z - points[k - 1][2]);
            }

            for (const [s, side] of [[0, -1], [1, 1]]) {
                const v = k * 2 + s;

                positions[v * 3] = x - dz * WAY_LINE.half * side;
                positions[v * 3 + 1] = y + WAY_LINE.over;
                positions[v * 3 + 2] = z + dx * WAY_LINE.half * side;
                along[v] = walked;
            }
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.along.needsUpdate = true;
        geometry.setDrawRange(0, (count - 1) * 6);
        this.lineLength.value = walked;
        this.line.visible = true;
    }

    /** The time (seconds), for the light rising up the column and along the line; and how far the far pass sees (metres). */
    update(time, farReach) {
        this.time.value = time;
        this.reach.value = farReach * 0.9;
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
    }
}
