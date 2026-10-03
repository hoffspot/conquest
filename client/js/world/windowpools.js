// The light lit windows throw on the ground at night (the terrain plan's M7j-3; §9's "lit windows
// at dusk": "a cheap glow on the ground under each would do"): in front of each window, a pool of
// warm light lying on the ground, widest and brightest at the wall, fading out as it spreads; the
// higher the window, the further it throws its light and the fainter it is. Each comes on, goes
// out late and flickers with its own window (atlas.js windowOn: the same seed, worked out the same
// way), so a pool is never lit under a dark window.
// - The windows are the upright panes the atlas found as the buildings were merged (atlas.js
//   windowSeeds' panes: where each is, which way it faces, its seed).
// - A chunk's (and the start town's) pools are one mesh: a few corners each, lying on the ground
//   (a little over it, following its slope), added onto what's drawn there (additive, no depth
//   written), nothing drawn by day.

import * as THREE from "three";
import { WINDOW_LIGHT, WINDOW_ON_GLSL } from "./art/engine/atlas.js";

/**
 * How a window's light lies on the ground (metres): from the wall out `reach` (a window at its
 * foot; one `high` up throws it to the second), `spread` times as wide at its far end as the
 * window (at the wall, as wide as it, a little more); `lift` over the ground; its colour (sRGB: a
 * hearth's or a candle's, paler than the window's own glow, as the light thrown is) as bright as
 * `strength` at its brightest, fainter the higher the window (1 / (1 + `fall` × its height²));
 * none from a window more than `highest` up, nor further off than `far` (fading out from `fade`).
 */
export const WINDOW_POOLS = Object.freeze({ reach: [1.6, 3.4], high: 4, spread: 1.8, lift: 0.04, colour: 0xffb46e, strength: 0.28, fall: 0.06, highest: 7, fade: 35, far: 80 });

// Corners across a pool and along it
const ACROSS = 3;
const ALONG = 4;

const VERTEX = `
attribute vec4 pool;
uniform vec4 windowLight;
varying vec3 vPool;
varying float vOn;
varying float vAway;
${WINDOW_ON_GLSL}

void main() {
    vOn = windowOn(pool.w, windowLight);
    vPool = pool.xyz;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    vAway = -mvPosition.z;
    // (None drawn while its window's dark: by day, none at all)
    gl_Position = vOn > 0.0 ? projectionMatrix * mvPosition : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAGMENT = `
uniform vec3 poolColour;
varying vec3 vPool;
varying float vOn;
varying float vAway;

void main() {
    // (Soft at its sides, rising from the wall's foot and fading out as it goes)
    float across = 1.0 - smoothstep(0.15, 1.0, abs(vPool.x));
    float along = smoothstep(0.0, 0.15, vPool.y) * (1.0 - vPool.y) * (1.0 - vPool.y);
    float near = 1.0 - smoothstep(${WINDOW_POOLS.fade.toFixed(1)}, ${WINDOW_POOLS.far.toFixed(1)}, vAway);

    gl_FragColor = vec4(poolColour * vPool.z * vOn * across * along * near, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`;

let material = null;

/** The pools' material, shared by every pool (lit by WINDOW_LIGHT, as the windows are). */
export function poolMaterial() {
    if (!material) {
        material = new THREE.ShaderMaterial({
            name: "window pools",
            uniforms: { windowLight: WINDOW_LIGHT, poolColour: { value: new THREE.Color(WINDOW_POOLS.colour) } },
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
        });
    }

    return material;
}

/**
 * The pools of light under `panes` (atlas.js windowSeeds' panes, world metres) on the ground
 * (`groundAt(x, z)`, metres): a mesh, or null if there are none.
 */
export function poolsMesh(panes, groundAt) {
    const pools = panes.flatMap((pane) => {
        const foot = groundAt(pane.at[0] + pane.out[0] * 0.3, pane.at[2] + pane.out[1] * 0.3);
        const height = pane.at[1] - foot;

        return height > 0 && height <= WINDOW_POOLS.highest ? [{ pane, height }] : [];
    });

    if (!pools.length) {
        return null;
    }

    const corners = (ACROSS + 1) * (ALONG + 1);
    const position = new Float32Array(pools.length * corners * 3);
    const pool = new Float32Array(pools.length * corners * 4);
    const index = [];

    pools.forEach(({ pane, height }, p) => {
        const { at, out, width, seed } = pane;
        const side = [-out[1], out[0]];
        const reach = WINDOW_POOLS.reach[0] + (WINDOW_POOLS.reach[1] - WINDOW_POOLS.reach[0]) * Math.min(1, height / WINDOW_POOLS.high);
        const strength = WINDOW_POOLS.strength / (1 + WINDOW_POOLS.fall * height * height);
        const first = p * corners;

        for (let j = 0; j <= ALONG; j++) {
            const v = j / ALONG;
            const half = (width * (1.1 + (WINDOW_POOLS.spread - 1.1) * v)) / 2 + 0.15;

            for (let i = 0; i <= ACROSS; i++) {
                const u = (2 * i) / ACROSS - 1;
                const x = at[0] + out[0] * (0.05 + reach * v) + side[0] * half * u;
                const z = at[2] + out[1] * (0.05 + reach * v) + side[1] * half * u;
                const k = first + j * (ACROSS + 1) + i;

                position.set([x, groundAt(x, z) + WINDOW_POOLS.lift, z], k * 3);
                pool.set([u, v, strength, seed], k * 4);
            }
        }

        for (let j = 0; j < ALONG; j++) {
            for (let i = 0; i < ACROSS; i++) {
                const a = first + j * (ACROSS + 1) + i;
                const b = a + ACROSS + 1;

                // (Facing up)
                index.push(a, a + 1, b, a + 1, b + 1, b);
            }
        }
    });

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("pool", new THREE.BufferAttribute(pool, 4));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, poolMaterial());

    mesh.name = "window pools";
    mesh.renderOrder = 1;
    mesh.matrixAutoUpdate = false;
    // (Not drawn at all while no window's lit: by day, not even a draw)
    Object.defineProperty(mesh, "visible", { get: () => WINDOW_LIGHT.value.x > 0, set: () => {} });

    return mesh;
}
