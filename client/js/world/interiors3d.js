// The insides of buildings in 3D (core/interiors.js has their plans): for now the tavern's
// taproom, with its flagstones, tables and benches, the bar and the tapped barrels behind it, the
// great hearth with a boar turning on a spit over an animated fire, and the stairs up; and the
// floor above, with its rugs, the madam's counter, a chaise longue, and the hallway to four
// bedrooms behind curtained doorways, each with a canopied bed, a washstand and a chest.
//
// Built with the art kits' Solid (five art pixels to a metre) and their materials, each map in
// its own group at its place in the world (MAP_ORIGINS). There are no ceilings, and every
// material cuts away what stands above waist height on the camera's side of the player
// (INTERIOR_CUT, set each frame by the game), like a doll's house with its near walls lowered, so
// the player is always in view whichever way the camera looks.

import * as THREE from "three";
import { material as artMaterial } from "./art/engine/materials.js";
import { Solid } from "./art/engine/solid.js";
import { merge } from "./town3d.js";

/** How high a floor's walls are, and how far above it the next floor is (metres). */
export const STOREY = 3;

/**
 * Where the player is and which way the camera looks from them (along the ground), shared by
 * every interior material: what's above `height` metres and more than `margin` metres nearer the
 * camera than the player is cut away.
 */
export const INTERIOR_CUT = Object.freeze({
    player: { value: new THREE.Vector3() },
    toCamera: { value: new THREE.Vector2(0, 1) },
    height: { value: 1.05 },
    margin: { value: 0.7 },
});

const M = 5;
const m = (metres) => metres * M;

// Colours the art kits don't have
const COLOURS = {
    velvet: 0x7a1826,
    "velvet-purple": 0x4a1f45,
    linen: 0xe9e2cf,
    pewter: 0x8d9194,
    brass: 0xb58f3e,
    candle: 0xf1e7c8,
    soot: 0x151211,
    ale: 0x6b4214,
    rug: 0x8e2a22,
    "rug-border": 0x2e3d5c,
    ledger: 0x3d2a1a,
    wine: 0x5a0f1c,
    flowers: 0xc24a6e,
    leaves: 0x3f6b35,
    apple: 0xb3261d,
};

// Each interior's own copies of the materials (the town's are shared, and cut differently)
const materials = new Map();

function material(name) {
    if (!materials.has(name)) {
        let result;

        if (COLOURS[name] !== undefined) {
            result = new THREE.MeshLambertMaterial({ color: COLOURS[name] });
            result.name = name;
        } else if (name === "window") {
            // Daylight in the panes
            result = new THREE.MeshBasicMaterial({ color: 0xd9e8f5 });
            result.name = name;
        } else if (name === "candle-flame" || name === "sconce") {
            result = new THREE.MeshBasicMaterial({ color: name === "sconce" ? 0xff5a4a : 0xffd27a, toneMapped: false });
            result.name = name;
        } else if (name === "roast") {
            result = new THREE.MeshStandardMaterial({ color: 0x9c5424, roughness: 0.45, metalness: 0 });
            result.name = name;
        } else {
            result = artMaterial(name).clone();
            result.name = `${name}-inside`;
        }

        result.shadowSide = THREE.DoubleSide;
        cutAway(result);
        materials.set(name, result);
    }

    return materials.get(name);
}

// Cut away what stands above INTERIOR_CUT.height on the camera's side of the player
function cutAway(target) {
    target.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, { cutPlayer: INTERIOR_CUT.player, cutToCamera: INTERIOR_CUT.toCamera, cutHeight: INTERIOR_CUT.height, cutMargin: INTERIOR_CUT.margin });
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vCutWorld;")
            .replace("#include <project_vertex>", "#include <project_vertex>\nvCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vCutWorld;\nuniform vec3 cutPlayer;\nuniform vec2 cutToCamera;\nuniform float cutHeight;\nuniform float cutMargin;")
            .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
{
    float nearer = dot(vCutWorld.xz - cutPlayer.xz, cutToCamera);
    float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (vCutWorld.y - cutPlayer.y > cutHeight && nearer > cutMargin + dither * 0.35) discard;
}`);
    };
    target.customProgramCacheKey = () => `interior-cut-${target.type}`;
    target.needsUpdate = true;
}

// --- Flames ---

const FLAME_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FLAME_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform float time;
uniform float seed;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int k = 0; k < 4; k++) {
        value += amplitude * noise(p);
        p *= 2.03;
        amplitude *= 0.5;
    }

    return value;
}

void main() {
    vec2 uv = vUv;
    float n = fbm(vec2(uv.x * 3.2 + seed, uv.y * 2.4 - time * 2.6));
    float sway = (n - 0.5) * 0.45 * uv.y;
    float width = 0.44 * (1.0 - uv.y) + 0.04;
    float body = smoothstep(width, width * 0.25, abs(uv.x - 0.5 + sway));
    float top = smoothstep(1.0, 0.2, uv.y + (n - 0.5) * 0.55);
    float a = clamp(body * top * 1.3, 0.0, 1.0);
    vec3 colour = mix(vec3(0.95, 0.22, 0.02), vec3(1.0, 0.86, 0.42), smoothstep(0.25, 0.95, a) * (1.0 - uv.y * 0.6));

    if (a < 0.02) discard;

    gl_FragColor = vec4(colour * 1.35, a);
}`;

/** A flame: crossed upright quads (width, height metres) with an animated flame on them. */
function flame(width, height, seed) {
    const shader = new THREE.ShaderMaterial({
        vertexShader: FLAME_VERTEX,
        fragmentShader: FLAME_FRAGMENT,
        uniforms: { time: { value: 0 }, seed: { value: seed } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
    const group = new THREE.Group();

    for (const angle of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0), shader);

        quad.rotation.y = angle;
        group.add(quad);
    }

    group.userData.flame = shader;

    return group;
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

// A candle in a holder, its flame lit
function candle(solid, x, z, y) {
    solid.cylinder(x, z, y, y + 0.25, m(0.06), m(0.06), material("brass"), { segments: 8 });
    solid.cylinder(x, z, y + 0.25, y + m(0.2), m(0.022), m(0.022), material("candle"), { segments: 6 });
    solid.cylinder(x, z, y + m(0.2), y + m(0.24), m(0.012), 0, material("candle-flame"), { segments: 5 });
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
    solid.box(ax0 + 0.05, m(0.35), az0 + 0.05, ax1 - 0.05, top, az1 - 0.05, material(finish));
    solid.box(ax0, top - m(0.18), az0 - 0.2, ax1, top, az1 + 0.2, material("timber"));

    const length = along === "x" ? x1 - x0 : z1 - z0;
    const posts = Math.max(1, Math.round(length / m(2)));

    for (let k = 0; k <= posts; k++) {
        const t = k / posts;

        if (along === "x") {
            const x = x0 + (x1 - x0) * t;

            solid.box(x - 0.6, m(0.35), az0 - 0.2, x + 0.6, top, az1 + 0.2, material("timber"));
        } else {
            const z = z0 + (z1 - z0) * t;

            solid.box(ax0 - 0.2, m(0.35), z - 0.6, ax1 + 0.2, top, z + 0.6, material("timber"));
        }
    }
}

// A window in a wall along x (at z, facing `out`: 1 south, -1 north) or along z (at x): a daylit
// pane in a timber frame
function windowIn(solid, along, at, centre, out) {
    const [low, high, half] = [m(1.1), m(2.2), m(0.45)];

    if (along === "x") {
        solid.box(centre - half - 0.5, low - 0.5, at - 0.9, centre + half + 0.5, high + 0.5, at + 0.9, material("timber"));
        solid.face(out > 0 ? [[centre - half, low, at - 1], [centre + half, low, at - 1], [centre + half, high, at - 1], [centre - half, high, at - 1]].reverse() : [[centre - half, low, at + 1], [centre + half, low, at + 1], [centre + half, high, at + 1], [centre - half, high, at + 1]], material("window"));
    } else {
        solid.box(at - 0.9, low - 0.5, centre - half - 0.5, at + 0.9, high + 0.5, centre + half + 0.5, material("timber"));
        solid.face(out > 0 ? [[at - 1, low, centre - half], [at - 1, low, centre + half], [at - 1, high, centre + half], [at - 1, high, centre - half]] : [[at + 1, low, centre + half], [at + 1, low, centre - half], [at + 1, high, centre - half], [at + 1, high, centre + half]], material("window"));
    }
}

// The walls round a map's edge, with openings (gaps along a side: { side, from, to } in metres)
function outerWalls(solid, map, finish, openings = []) {
    const [w, h] = [m(map.width), m(map.height)];
    const thick = m(0.3);
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

            // A lintel over the opening
            if (gap.to > gap.from && gap.lintel) {
                const [a, b] = [m(gap.from), m(gap.to)];

                if (along === "x") {
                    solid.box(a, m(gap.lintel), z0 + outward - thick / 2, b, m(STOREY), z0 + outward + thick / 2, material(finish));
                    solid.box(a - 0.6, m(gap.lintel) - 0.8, z0 + outward - thick / 2 - 0.3, b + 0.6, m(gap.lintel), z0 + outward + thick / 2 + 0.3, material("timber"));
                } else {
                    solid.box(x0 + outward - thick / 2, m(gap.lintel), a, x0 + outward + thick / 2, m(STOREY), b, material(finish));
                }
            }

            start = m(gap.to);
        }
    }
}

// Walls through a floor: each wall square joined to its wall neighbours through its middle
function innerWalls(solid, map, finish) {
    const isWall = (x, y) => map.plan[y]?.[x] === "W";
    const thick = m(0.18);

    for (const { squares } of map.pieces.filter((piece) => piece.kind === "wall")) {
        for (const [x, y] of squares) {
            const [cx, cz] = [m(x + 0.5), m(y + 0.5)];

            // To each neighbour, or to the map's edge
            if (isWall(x + 1, y) || x + 1 === map.width) {
                wall(solid, cx, cz, m(x + 1), cz, thick, finish);
            }

            if (isWall(x - 1, y) || x === 0) {
                wall(solid, m(x), cz, cx, cz, thick, finish);
            }

            if (isWall(x, y + 1) || y + 1 === map.height) {
                wall(solid, cx, cz, cx, m(y + 1), thick, finish);
            }

            if (isWall(x, y - 1) || y === 0) {
                wall(solid, cx, m(y), cx, cz, thick, finish);
            }
        }
    }

    // A curtained doorway where the floor meets wall on both sides
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (map.plan[y][x] === "W") {
                continue;
            }

            const acrossX = isWall(x - 1, y) && isWall(x + 1, y);
            const acrossZ = isWall(x, y - 1) && isWall(x, y + 1);

            if (!acrossX && !acrossZ) {
                continue;
            }

            const [cx, cz] = [m(x + 0.5), m(y + 0.5)];
            const lintel = m(2.2);

            if (acrossX) {
                solid.box(m(x), lintel, cz - thick / 2, m(x + 1), m(STOREY), cz + thick / 2, material(finish));
                solid.box(m(x) - 0.4, lintel - 0.8, cz - thick / 2 - 0.3, m(x + 1) + 0.4, lintel, cz + thick / 2 + 0.3, material("timber"));
                solid.box(m(x) + 0.1, m(0.1), cz - 0.3, m(x) + 1.2, lintel - 0.8, cz + 0.3, material("velvet"));
            } else {
                solid.box(cx - thick / 2, lintel, m(y), cx + thick / 2, m(STOREY), m(y + 1), material(finish));
                solid.box(cx - 0.3, m(0.1), m(y) + 0.1, cx + 0.3, lintel - 0.8, m(y) + 1.2, material("velvet"));
            }
        }
    }
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

    // The walls, the door in the middle of the south one (between its two door squares)
    const doors = map.marks.D;
    const doorMiddle = (doors[0][0] + doors.at(-1)[0] + 1) / 2;

    outerWalls(solid, map, "plaster", [{ side: "s", from: doorMiddle - 0.9, to: doorMiddle + 0.9, lintel: 2.35 }]);

    // The door, shut, in its frame
    const [doorLeft, doorRight, wallZ] = [m(doorMiddle - 0.9), m(doorMiddle + 0.9), h];

    solid.box(doorLeft, 0, wallZ - 0.2, doorRight, m(2.35), wallZ + 0.4, material("planks-dark"));
    solid.box(doorLeft - 0.8, 0, wallZ - 0.6, doorLeft, m(2.45), wallZ + 0.6, material("timber"));
    solid.box(doorRight, 0, wallZ - 0.6, doorRight + 0.8, m(2.45), wallZ + 0.6, material("timber"));
    solid.box(m(doorMiddle - 0.35), m(1.05), wallZ - 0.5, m(doorMiddle - 0.2), m(1.15), wallZ - 0.2, material("iron"));

    // Windows: daylight on the north, south and east walls
    for (const x of [7.5, 11]) {
        windowIn(solid, "x", 0, m(x), -1);
    }

    for (const x of [3, 11]) {
        windowIn(solid, "x", h, m(x), 1);
    }

    windowIn(solid, "z", 0, m(9), -1);

    // The stairs up, along the north wall, rising east from their foot
    const stair = map.pieces.find((piece) => piece.kind === "stairs");

    stairs(solid, m(stair.x), m(stair.x + stair.w), 0, m(1), 0, m(STOREY), m(1));

    // The hearth: a stone chimney breast on the west wall, a wide opening, a mantel beam, the
    // hearthstone before it; logs and fire; a boar turning on a spit over the flames
    const hearth = map.pieces.find((piece) => piece.kind === "hearth");
    const [z0, z1] = [m(hearth.y), m(hearth.y + hearth.h)];
    const [open0, open1] = [z0 + m(0.85), z1 - m(0.85)];
    const breast = m(0.9);

    solid.box(-m(0.1), 0, z0, breast, m(STOREY), open0, material("stone"));
    solid.box(-m(0.1), 0, open1, breast, m(STOREY), z1, material("stone"));
    solid.box(-m(0.1), m(1.6), open0, breast, m(STOREY), open1, material("stone"));
    solid.box(-m(0.1), 0, open0, m(0.15), m(1.6), open1, material("soot"));
    solid.box(-m(0.1), m(1.55), z0 - m(0.1), breast + m(0.15), m(1.8), z1 + m(0.1), material("timber"));
    solid.box(0, 0, z0 - m(0.2), m(1.9), m(0.08), z1 + m(0.2), material("stone-dark"));

    const logs = new THREE.Group();

    for (const [x, z, turn] of [[0.55, 4.6, 0.3], [0.6, 5.3, -0.2], [1.2, 4.8, 0.1], [1.25, 5.25, -0.1]]) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(m(0.08), m(0.09), m(0.85), 7).rotateX(Math.PI / 2).rotateY(turn).translate(m(x), m(0.15), m(z)), material("timber-light"));

        logs.add(log);
    }

    logs.add(new THREE.Mesh(new THREE.BoxGeometry(m(1.1), 0.4, m(1.6)).translate(m(0.85), m(0.1), m(5)), artMaterial("embers")));
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

    fires[0].position.set(m(0.5), m(0.12), m(5));
    fires[1].position.set(spitX - m(0.1), m(0.1), m(4.85));
    fires[2].position.set(spitX, m(0.1), m(5.4));

    // A pair of antlers over the mantel
    for (const side of [-1, 1]) {
        solid.box(m(0.1), m(2.2), m(5) + side * 1.5, m(0.3), m(2.9), m(5) + side * 2.2, material("candle"));
        solid.box(m(0.1), m(2.6), m(5) + side * 2.2, m(0.3), m(2.75), m(5) + side * 4.5, material("candle"));
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

    // A wheel of candles hanging over the tables
    const wheel = new THREE.Group();
    const [wheelX, wheelZ, wheelY] = [m(5.5), m(5.5), m(2.55)];

    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(m(0.7), 0.35, 5, 18).rotateX(Math.PI / 2).translate(wheelX, wheelY, wheelZ), material("timber")));

    for (let k = 0; k < 6; k++) {
        const angle = (k / 6) * Math.PI * 2;
        const [x, z] = [wheelX + Math.cos(angle) * m(0.7), wheelZ + Math.sin(angle) * m(0.7)];

        wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, m(0.18), 6).translate(x, wheelY + m(0.09), z), material("candle")));
        wheel.add(new THREE.Mesh(new THREE.ConeGeometry(0.12, m(0.06), 5).translate(x, wheelY + m(0.21), z), material("candle-flame")));
    }

    wheel.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, m(0.8), 0.15).translate(wheelX, wheelY + m(0.4), wheelZ), material("iron")));
    solid.add(objectSolid(wheel));

    return {
        solid,
        moving,
        flames: fires,
        lights: [
            { kind: "fire", x: 1.1, y: 1.0, z: 5, colour: 0xff8a3a, intensity: 9, distance: 12, flicker: 0.25 },
            { kind: "lamp", x: 5.5, y: 2.3, z: 5.5, colour: 0xffc27a, intensity: 5, distance: 14, flicker: 0.05 },
        ],
        hearth: { x: 1.1, y: 0.8, z: 5 },
    };
}

// Runs of benches along each row (each bench square is a seat)
function benchRuns(map) {
    const runs = [];

    for (let y = 0; y < map.height; y++) {
        let start = null;

        for (let x = 0; x <= map.width; x++) {
            const seat = map.plan[y][x] === "b";

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
    group.add(new THREE.Mesh(new THREE.SphereGeometry(m(0.085), 10, 8).translate(0, -m(0.03), m(0.99)), material("apple")));

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

    // Floorboards, with the stairwell open: the stairs going down in it, a rail round it
    solid.box(-m(0.3), -0.5, -m(0.3), hole0, 0, h + m(0.3), material("planks"));
    solid.box(hole1, -0.5, -m(0.3), w + m(0.3), 0, h + m(0.3), material("planks"));
    solid.box(hole0, -0.5, m(1), hole1, 0, h + m(0.3), material("planks"));
    stairs(solid, hole0, hole1, 0, m(1), -m(STOREY), 0, m(1));

    for (const x of [hole0, hole0 + (hole1 - hole0) / 2]) {
        solid.box(x - 0.35, 0, m(1) - 0.35, x + 0.35, m(1), m(1) + 0.35, material("timber"));
    }

    solid.box(hole0, m(0.95), m(1) - 0.3, hole1 - m(0.4), m(1.05), m(1) + 0.3, material("timber"));
    solid.box(hole0 - 0.3, m(0.95), 0, hole0 + 0.3, m(1.05), m(1), material("timber"));
    solid.box(hole0 - 0.35, 0, -0.35, hole0 + 0.35, m(1.05), 0.35, material("timber"));

    outerWalls(solid, map, "plaster-rose");
    innerWalls(solid, map, "plaster-rose");

    for (const z of [3, 8]) {
        windowIn(solid, "z", 0, m(z), -1);
    }

    for (const x of [8, 12]) {
        windowIn(solid, "x", 0, m(x), -1);
        windowIn(solid, "x", h, m(x), 1);
    }

    // Rugs: a big one before the counter, a runner along the hallway
    rug(solid, m(0.5), m(5.2), m(5.6), m(9.6));
    rug(solid, m(6.1), m(5.15), m(13.8), m(5.85));

    // The madam's counter: dark wood, a red runner, a ledger, a bell, a candle, flowers
    const counter = map.pieces.find((piece) => piece.kind === "counter");
    const [cx0, cx1, cz0, cz1] = [m(counter.x), m(counter.x + counter.w), m(counter.y + 0.15), m(counter.y + 0.85)];

    solid.box(cx0, 0, cz0, cx1, m(1.05), cz1, material("planks-dark"));
    solid.box(cx0 - 0.4, m(1.05), cz0 - 0.4, cx1 + 0.4, m(1.12), cz1 + 0.4, material("timber-light"));
    solid.box(cx0 + m(0.3), m(1.12), cz0 + 0.5, cx1 - m(0.3), m(1.14), cz1 - 0.5, material("velvet"));
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
    solid.box(lx0 + 0.8, m(0.4), lz + m(0.25), lx1 - 0.8, m(0.52), lz + m(0.8), material("velvet"));
    solid.box(lx0 + 0.5, m(0.4), lz + m(0.7), lx1 - 0.5, m(0.95), lz + m(0.88), material("velvet"));
    solid.box(lx0 + 0.5, m(0.4), lz + m(0.2), lx0 + m(0.3), m(0.8), lz + m(0.85), material("velvet"));

    const side = map.pieces.find((piece) => piece.kind === "side-table");
    const [sx, sz] = [m(side.x + 0.5), m(side.y + 0.5)];

    solid.cylinder(sx, sz, 0, m(0.65), m(0.08), m(0.08), material("timber"), { segments: 8 });
    solid.cylinder(sx, sz, m(0.62), m(0.68), m(0.35), m(0.35), material("timber-light"), { segments: 14 });
    candle(solid, sx - m(0.1), sz - m(0.1), m(0.68));
    candle(solid, sx + m(0.12), sz - m(0.05), m(0.68));
    solid.cylinder(sx + m(0.05), sz + m(0.15), m(0.68), m(0.95), m(0.05), m(0.03), material("wine"), { segments: 8 });

    // The bedrooms: canopied beds, a washstand and a chest in each, candles in red glass on the
    // walls
    const drapes = ["velvet", "velvet-purple", "velvet-purple", "velvet"];

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

    for (const piece of map.pieces.filter((each) => each.kind === "chest")) {
        chest(solid, m(piece.x + 0.5), m(piece.y + 0.5));
    }

    // Sconces with red glass in the hallway and by the counter
    for (const [x, z] of [[7.6, 4.62], [11.6, 4.62], [7.6, 6.38], [11.6, 6.38], [1, 0.05]]) {
        solid.box(m(x) - 0.5, m(1.8), m(z) - 0.5, m(x) + 0.5, m(2.1), m(z) + 0.5, material("sconce"));
    }

    return {
        solid,
        moving: [],
        flames: [],
        lights: [
            { kind: "lamp", x: 3.5, y: 2.4, z: 6, colour: 0xff8a6a, intensity: 6, distance: 12, flicker: 0.06 },
            { kind: "fire", x: 10, y: 2.2, z: 5.5, colour: 0xff5a5a, intensity: 4, distance: 11, flicker: 0.1 },
        ],
        hearth: null,
    };
}

const BUILDERS = { taproom, upstairs };

/**
 * Build a map's inside: { map, object (a Group at the map's place in the world, in metres),
 * lights (point lights to place: { kind, x, y, z (world metres), colour, intensity, distance,
 * flicker }), hearth (world point of its fire, or null), update(dt, time) (turns the spit,
 * moves the flames) }.
 */
export function buildInterior(map) {
    const built = BUILDERS[map.id](map);
    const art = new THREE.Group();
    const [ox, oz] = map.origin;

    art.scale.setScalar(1 / M);
    art.add(built.solid.toObject());

    const object = new THREE.Group();
    const statics = new THREE.Group();

    statics.add(art);
    statics.updateMatrixWorld(true);

    // Everything that doesn't move merged by material; the spit and flames apart
    const merged = merge(statics);

    object.add(merged);

    const animated = new THREE.Group();

    animated.scale.setScalar(1 / M);

    for (const { object: part } of built.moving) {
        animated.add(part);
    }

    for (const fire of built.flames) {
        animated.add(fire);
    }

    object.add(animated);
    object.position.set(ox, 0, oz);
    object.name = map.id;

    object.traverse((node) => {
        if (node.isMesh && !node.material.userData?.flame && node.material.type !== "ShaderMaterial") {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    for (const fire of built.flames) {
        fire.traverse((node) => {
            node.castShadow = false;
            node.receiveShadow = false;
        });
    }

    return {
        map,
        object,
        lights: built.lights.map((light) => ({ ...light, x: ox + light.x, z: oz + light.z })),
        hearth: built.hearth ? { x: ox + built.hearth.x, y: built.hearth.y, z: oz + built.hearth.z } : null,
        update(dt, time) {
            for (const { object: part, turn } of built.moving) {
                part.rotation.z += turn * dt;
            }

            for (const fire of built.flames) {
                fire.userData.flame.uniforms.time.value = time;
            }
        },
    };
}
