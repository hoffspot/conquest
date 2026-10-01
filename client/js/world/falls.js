// Waterfalls: wherever a river spills over a lip into the pool below it (core/terrain/waters.js's
// steps), a sheet of water falls from the lip across the river's width, arcing out as it drops
// (thrown forward as fast as the water comes over, pulled down as anything falls), its streaks
// running down it fast and its foot breaking up as it plunges into the pool (whose churning the
// water's own field already has: water.js). Below a high one, mist rises off the pool, puff after
// puff, drifting and spreading as it goes (on medium quality and up).
//
// A lip's place is the river's course's (unwandered), taken back through the wandering to where
// it lies in the world (waters.js placeOf), so the sheet stands where the water is drawn. Each
// chunk draws the falls whose lips are in it: one mesh of sheets and one of mist, sharing their
// materials with every other chunk's.

import * as THREE from "three";
import { TREE_WIND } from "./art/kits/trees.js";
import { rippleTexture, SHEER, WATER, WATER_DETAIL } from "./water.js";

/**
 * Lips a sheet is drawn over (metres, at least: as high as the water's own sheet leaves out,
 * water.js SHEER), and those high enough to raise mist.
 */
export const FALLS = Object.freeze({ sheet: SHEER, mist: 1.5 });

// How many points across a sheet, and down it
const ACROSS = 7;
const DOWN = 8;

// How fast water comes over a lip (metres a second: so fast, and faster the higher the lip, up
// to six metres of it), how far under the pool below a sheet reaches (metres), and how much wider
// it spreads at its foot than at its lip
const OVER = { least: 1.2, perMetre: 0.25, most: 6 };
// (And how many times the way back to where a lip meets the river below it is halved)
const EDGING = 10;
const UNDER = 0.3;
const SPREAD = 1.1;
const GRAVITY = 9.81;

// Mist: puffs to a fall, rising and spreading over how many seconds
const PUFFS = 8;
const PUFF_LIFE = 4.5;

/**
 * The lips in a chunk (cx, cy: `size` metres a side) high enough for a sheet: each { top (points
 * across the lip, [x, y] metres), way (the way the water goes over it: a unit vector), level (the
 * pool above's surface, metres), drop (how far to the pool below) }.
 */
export function lipsIn(waters, cx, cy, size) {
    const lips = [];
    const [x0, y0] = [cx * size, cy * size];

    for (const piece of waters.riversNear(cx, cy)) {
        if (piece.lip < FALLS.sheet) {
            continue;
        }

        const [lx, ly] = edgeOf(waters, piece);
        const [x, y] = waters.placeOf(lx, ly);

        if (x < x0 || y < y0 || x >= x0 + size || y >= y0 + size) {
            continue;
        }

        const half = piece.half[1] * 1.05;
        const top = [];

        for (let i = 0; i < ACROSS; i++) {
            const s = (-1 + (2 * i) / (ACROSS - 1)) * half;

            top.push(waters.placeOf(lx - piece.dy * s, ly + piece.dx * s));
        }

        // (The way over: the course's way at the lip, as the wandering bends it)
        const [ax, ay] = waters.placeOf(lx - piece.dx, ly - piece.dy);
        const [bx, by] = waters.placeOf(lx + piece.dx, ly + piece.dy);
        const length = Math.hypot(bx - ax, by - ay) || 1;

        lips.push({ top, way: [(bx - ax) / length, (by - ay) / length], level: piece.surface[1], drop: piece.lip });
    }

    return lips;
}

// Where a piece's lip is (unwandered, metres): its end, but for a stream's or river's last piece,
// whose course ends in the middle of the river it runs into: there, where its own water ends at
// that river's bank (found by halving the way back along it)
function edgeOf(waters, piece) {
    const at = (t) => [piece.ax + (piece.bx - piece.ax) * t, piece.ay + (piece.by - piece.ay) * t];
    const upper = (t) => (waters.river(...waters.placeOf(...at(t)), 0)?.surface ?? -Infinity) >= piece.surface[1] - 0.05;

    if (upper(1)) {
        return at(1);
    }

    let [low, high] = [0, 1];

    for (let k = 0; k < EDGING; k++) {
        const t = (low + high) / 2;

        [low, high] = upper(t) ? [t, high] : [low, t];
    }

    return at(low);
}

/**
 * A chunk's falls (lipsIn's lips): a Group of their sheets and, under the high ones, their mist,
 * or null if there are none.
 */
export function fallsOf(lips) {
    if (!lips.length) {
        return null;
    }

    const group = new THREE.Group();

    group.name = "falls";
    group.add(sheetsOf(lips));

    const misty = lips.filter(({ drop }) => drop >= FALLS.mist);

    if (misty.length) {
        group.add(mistOf(misty));
    }

    return group;
}

// Where a fall's water is a while after it comes over (seconds), from a point on its lip
function arc({ way, level, drop }, [x, y], time, spread = 1) {
    const over = OVER.least + OVER.perMetre * Math.min(drop, OVER.most);

    return [x + way[0] * over * time * spread, level + WATER.level - 0.5 * GRAVITY * time * time, y + way[1] * over * time * spread];
}

// How long a fall's water takes to reach under the pool below it (seconds)
const fallTime = (drop) => Math.sqrt((2 * (drop + UNDER)) / GRAVITY);

// The sheets: each a grid ACROSS by DOWN, from its lip down its arc, with how far across (metres
// and a share of its width) and down (metres) each point is, for its streaks
function sheetsOf(lips) {
    const positions = [];
    const falls = [];
    const indices = [];

    for (const lip of lips) {
        const base = positions.length / 3;
        const middle = lip.top[(ACROSS - 1) >> 1];
        const time = fallTime(lip.drop);
        const width = Math.hypot(lip.top[ACROSS - 1][0] - lip.top[0][0], lip.top[ACROSS - 1][1] - lip.top[0][1]);

        let [down, last] = [0, arc(lip, middle, 0)];

        for (let j = 0; j < DOWN; j++) {
            const t = (time * j) / (DOWN - 1);
            const spread = 1 + ((SPREAD - 1) * j) / (DOWN - 1);
            const here = arc(lip, middle, t);

            // (How far down the sheet, along its middle)
            down += Math.hypot(here[0] - last[0], here[1] - last[1], here[2] - last[2]);
            last = here;

            for (let i = 0; i < ACROSS; i++) {
                // (Spreading from the middle of the lip)
                const at = [middle[0] + (lip.top[i][0] - middle[0]) * spread, middle[1] + (lip.top[i][1] - middle[1]) * spread];

                positions.push(...arc(lip, at, t));
                falls.push(((i / (ACROSS - 1)) - 0.5) * width * spread, down, i / (ACROSS - 1));
            }
        }

        for (let j = 0; j < DOWN - 1; j++) {
            for (let i = 0; i < ACROSS - 1; i++) {
                const k = base + j * ACROSS + i;

                indices.push(k, k + ACROSS, k + 1, k + 1, k + ACROSS, k + ACROSS + 1);
            }
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("fall", new THREE.Float32BufferAttribute(falls, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, sheetMaterial());

    mesh.name = "fall sheets";
    mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false;

    return mesh;
}

// The mist: PUFFS puffs over the foot of each high fall, each a square turned to face the eye,
// all in one draw
function mistOf(lips) {
    const geometry = new THREE.InstancedBufferGeometry();
    const puffs = [];
    const spreads = [];

    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);

    for (const lip of lips) {
        const middle = lip.top[(ACROSS - 1) >> 1];
        const [x, y, z] = arc(lip, middle, fallTime(lip.drop - UNDER));
        const width = Math.hypot(lip.top[ACROSS - 1][0] - lip.top[0][0], lip.top[ACROSS - 1][1] - lip.top[0][1]);

        for (let k = 0; k < PUFFS; k++) {
            puffs.push(x, y, z, k / PUFFS + ((x * 0.37 + z * 0.11) % 1));
            spreads.push(width * 0.6, 1.5 + Math.min(lip.drop, 6) * 0.45);
        }
    }

    geometry.setAttribute("puff", new THREE.InstancedBufferAttribute(new Float32Array(puffs), 4));
    geometry.setAttribute("spread", new THREE.InstancedBufferAttribute(new Float32Array(spreads), 2));
    geometry.instanceCount = puffs.length / 4;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(puffs[0], puffs[1], puffs[2]), 1e5);

    const mesh = new THREE.Mesh(geometry, mistMaterial());

    mesh.name = "fall mist";
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;

    return mesh;
}

let sheet = null;

// The sheets' material: lit as anything is, foam-white streaks over green-blue water, running down
// fast, fading at the sheet's sides and breaking up at its foot
function sheetMaterial() {
    if (!sheet) {
        sheet = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        sheet.name = "fall sheets";
        sheet.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, { fallRipples: { value: rippleTexture() }, fallTime: TREE_WIND.time });
            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", "#include <common>\nattribute vec3 fall;\nvarying vec3 vFall;")
                .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFall = fall;");
            shader.fragmentShader = shader.fragmentShader
                .replace("#include <common>", "#include <common>\nuniform sampler2D fallRipples;\nuniform float fallTime;\nvarying vec3 vFall;")
                .replace("#include <map_fragment>", `
// Streaks, long down the sheet, running down it fast (two reads at their own speeds)
float streak = texture2D(fallRipples, vec2(vFall.x * 0.45, vFall.y * 0.08 - fallTime * 0.9)).b * 0.6 + texture2D(fallRipples, vec2(vFall.x * 0.9 + 0.3, vFall.y * 0.15 - fallTime * 1.6)).b * 0.4;
float foam = smoothstep(0.35, 0.75, streak);

diffuseColor.rgb = mix(vec3(0.42, 0.62, 0.62), vec3(0.93, 0.95, 0.95), foam);
diffuseColor.a = smoothstep(0.0, 0.16, vFall.z) * smoothstep(1.0, 0.84, vFall.z) * mix(0.5, 0.95, foam);`);
        };
        sheet.customProgramCacheKey = () => "fall sheets";
    }

    return sheet;
}

let mist = null;

// The mist's material: soft round puffs, each rising and spreading as it goes and fading in and
// out over its life, the fog's as anything is; none on low quality
function mistMaterial() {
    if (!mist) {
        mist = new THREE.ShaderMaterial({
            name: "fall mist",
            transparent: true,
            depthWrite: false,
            fog: true,
            uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), mistTime: TREE_WIND.time, mistDetail: WATER_DETAIL, mistColour: { value: new THREE.Color(0xe6eef0) } },
            vertexShader: `
#include <common>
#include <fog_pars_vertex>
attribute vec4 puff;
attribute vec2 spread;
uniform float mistTime;
uniform float mistDetail;
varying vec2 vCorner;
varying float vFade;

void main() {
    float age = fract(mistTime / ${PUFF_LIFE.toFixed(1)} + puff.w);
    float turn = puff.w * 43.0;
    vec3 at = puff.xyz + vec3(cos(turn) * spread.x * (0.2 + age), 0.3 + age * spread.y, sin(turn) * spread.x * (0.2 + age));
    vec4 mvPosition = viewMatrix * vec4(at, 1.0);

    mvPosition.xy += position.xy * spread.y * (0.8 + age * 1.6);
    gl_Position = projectionMatrix * mvPosition;
    vCorner = position.xy;
    vFade = sin(age * PI) * step(0.5, mistDetail);

    #include <fog_vertex>
}`,
            fragmentShader: `
#include <common>
#include <fog_pars_fragment>
uniform vec3 mistColour;
varying vec2 vCorner;
varying float vFade;

void main() {
    float alpha = (1.0 - smoothstep(0.0, 0.5, length(vCorner))) * vFade * 0.55;

    if (alpha <= 0.0) discard;

    gl_FragColor = vec4(mistColour, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}`,
        });
    }

    return mist;
}
