// A hell's molten rock (docs/DUNGEONS.md *Hells*): its pools in the Breach (core/dungeons: a
// plan's "~", lying against the rock where nothing need walk), drawn as phones can afford it (the
// research, "Levels of hell dungeon design": a texture trick, not a simulation). No light of its
// own but a room's (roomlight.js: one a pool, breathing slowly), and the glow it casts on the rock
// and floor round it baked into their points (poolGlowOn: dungeons3d.js rockMaterial's `glow`), so
// the walls by a pool are lit from below for nothing. Its surface is one material for every pool
// (lavaMaterial), worked out as it's drawn: plates of black crust cracked apart, the cracks
// glowing red, orange and yellow-white as they widen, the crust thinner and the whole hotter
// towards the pool's middle, cooled and dark at its bank; the plates turning slowly round the
// pool as it churns, coming round whole each veil's loop (VEIL), so it never jumps. Round it, a
// bank of the rock's own crust, lit from within.

import * as THREE from "three";
import { noise3 } from "./caverns.js";
import { VEIL } from "./veil.js";
import { WATER_DETAIL } from "./water.js";

/**
 * A pool's shape (`pool`): how far in from its squares' edges it lies (`inset`, metres), how far
 * it reaches in under the rock it lies against (`under`), how many points round its rim
 * (`sides`), how much its rim wanders in and out (`wobble`, a share), how square it is (`square`:
 * 2 an ellipse, more squarer), the rings its surface is drawn in (`rings`: shares of the way out
 * to its rim) and how high it lies (`y`, metres); its bank (`bank`: how far in over the lava it
 * reaches, how far out onto the floor, and how high it stands, metres); its light (`light`: a
 * room's, roomlight.js: its colour, how bright, how far it reaches and how high it is, metres;
 * how much it breathes, a share, and how fast, radians a second); its glow on the rock round it
 * (`glow`: its colour, how far it reaches from the rim and how high up the walls, metres, and how
 * bright at most); and how many of its crust's plates there are to a metre (`plates`).
 */
export const LAVA = Object.freeze({
    pool: Object.freeze({ inset: 0.14, under: 0.24, sides: 28, wobble: 0.12, square: 2.6, rings: Object.freeze([1, 0.82, 0.58, 0.32]), y: 0.03 }),
    bank: Object.freeze({ inside: 0.1, out: 0.4, high: 0.08 }),
    light: Object.freeze({ colour: 0xff5a1c, intensity: 1.8, distance: 6, y: 0.45, breathe: 0.14, pace: 0.6 }),
    glow: Object.freeze({ colour: 0xff6a24, reach: 2.2, high: 2.6, bright: 0.45, floor: 0.35 }),
    plates: 3.2,
});

/**
 * The Breach's rock (a look's `brimstone`: interiors3d.js DUNGEON_LOOKS), where hell breaks
 * through: its sulphur (`sulphur`: its colour, sRGB; how big its patches are, metres; how much of
 * the rock they cover, a share of noise's range kept, and up to how high, metres; and, on the
 * floor, how far from a pool of lava they're found), the soot darkening it towards the roof
 * (`soot`: from how high to how high, metres, and how much darker at most), and the embers glowing
 * in its cracks (`embers`: how far apart the cracks run, across and up, metres; how much of the
 * rock they're in, a share of noise's range at the crack's middle and its edge; up to how high,
 * metres; and how much more of it there is by a pool, out to how far, metres).
 */
export const BRIMSTONE = Object.freeze({
    sulphur: Object.freeze({ colour: 0xc9b040, size: 1.6, cover: [0.62, 0.78], high: 1.4, near: 3.5 }),
    soot: Object.freeze({ from: 1.6, to: 5, dark: 0.55 }),
    embers: Object.freeze({ across: 4.5, up: 2.4, band: [0.92, 0.985], high: 2.6, pools: 0.4, near: 3 }),
});

/**
 * How the Breach's rock or floor (`floor`) is coloured at a point (level metres) by the sulphur
 * crusting it in patches low down (on the floor, only near a pool of lava: `pools`, poolShape's)
 * and the soot darkening it higher up: a multiplier for its colour (linear r, g, b), which is
 * `tint` (linear r, g, b) where the sulphur's not.
 */
export function brimstoneTone(x, y, z, seed, tint, pools = [], floor = false) {
    const { sulphur, soot } = BRIMSTONE;
    const near = floor ? Math.max(0, ...pools.map((pool) => 1 - Math.max(0, outOfPool(pool, x, z)) / sulphur.near)) : 1;
    const patch = smoothstep(sulphur.cover[0], sulphur.cover[1], noise3(x / sulphur.size, y / sulphur.size, z / sulphur.size, seed + 71)) * near * (1 - smoothstep(0.2, sulphur.high, y));
    const dark = 1 - soot.dark * smoothstep(soot.from, soot.to, y);
    // (Its crust darker than sulphur's own yellow, its grain drawn over it as the rock's is)
    const crust = linear(sulphur.colour).map((c) => c * 0.45);

    return crust.map((c, k) => (1 + (c / Math.max(1e-4, tint[k]) - 1) * patch) * dark);
}

/**
 * The embers in the Breach's rock at each of its points (`positions`: x, y, z level metres, three
 * a point): how much each glows, a byte (0 to 255: dungeons3d.js rockMaterial's `ember`): in
 * cracks running through it (where a noise is near its middle), low down, more of them by a pool
 * of lava (`pools`: poolShape's). The cracks themselves are drawn by the rock's picture: only its
 * dark grooves glow.
 */
export function embersOn(positions, seed, pools = []) {
    const { across, up, band, high, pools: more, near } = BRIMSTONE.embers;
    const ember = new Uint8Array(positions.length / 3);

    for (let p = 0, k = 0; p < positions.length; p += 3, k++) {
        const [x, y, z] = [positions[p], positions[p + 1], positions[p + 2]];
        const by = Math.max(0, ...pools.map((pool) => 1 - Math.max(0, outOfPool(pool, x, z)) / near));
        const crack = 1 - Math.abs(2 * noise3(x / across, y / up, z / across, seed + 91) - 1);
        const lit = smoothstep(band[0], band[1], crack) * Math.min(1, 1 - smoothstep(0.4, high, y) + by * more);

        ember[k] = Math.round(Math.min(1, lit) * 255);
    }

    return ember;
}

// A number from 0 to 1 for a square of the level and a slot (the same every time)
function hashOf(x, y, slot) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(slot, 2246822519) ^ 0x5bd1e995;

    h = Math.imul(h ^ (h >>> 13), 1274126177);

    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A colour (sRGB, 0xrrggbb) as linear r, g, b
const linear = (hex) =>
    [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((byte) => {
        const c = byte / 255;

        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });

const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

/**
 * A pool's shape, from its piece of the level's plan (`piece`: its squares, x, y, w, h) and the
 * way to the rock it lies against (`wall`: [dx, dy], or null): its middle (`x`, `z`, level
 * metres), how far it reaches each way (`rx`, `rz`), its rim (`rim`: how far out its rim is at
 * each of LAVA.pool.sides points round it, a share of the way to the ellipse's: 1 give or take its
 * wobble), which way its crust turns (`spin`: 1 or -1) and its seed. It reaches in under the rock
 * it lies against, the rock's foot hiding its edge there.
 */
export function poolShape(piece, wall = null) {
    const { inset, under, sides, wobble } = LAVA.pool;
    const [dx, dy] = wall ?? [0, 0];
    const seed = Math.floor(hashOf(piece.x, piece.y, 1) * 1e6);
    const [p1, p2] = [hashOf(piece.x, piece.y, 2) * Math.PI * 2, hashOf(piece.x, piece.y, 3) * Math.PI * 2];
    const rim = Array.from({ length: sides }, (_, k) => {
        const a = (k / sides) * Math.PI * 2;

        return 1 + wobble * (0.6 * Math.sin(2 * a + p1) + 0.4 * Math.sin(3 * a + p2));
    });

    return {
        x: piece.x + piece.w / 2 + (dx * under) / 2,
        z: piece.y + piece.h / 2 + (dy * under) / 2,
        rx: piece.w / 2 - inset + (Math.abs(dx) * under) / 2,
        rz: piece.h / 2 - inset + (Math.abs(dy) * under) / 2,
        rim,
        spin: hashOf(piece.x, piece.y, 4) < 0.5 ? 1 : -1,
        seed,
    };
}

// The way out to a pool's rim at the `k`th of its points round it (a superellipse's), and how far
// that is (metres, along it) times `share`, plus `more` metres
function rimPoint(pool, k, share, more = 0) {
    const { sides, square } = LAVA.pool;
    const a = (k / sides) * Math.PI * 2;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const e = 2 / square;
    const [ex, ez] = [Math.sign(c) * Math.abs(c) ** e * pool.rx, Math.sign(s) * Math.abs(s) ** e * pool.rz];
    const r = Math.hypot(ex, ez) || 1;
    const out = r * pool.rim[k] * share + more;

    return [pool.x + (ex / r) * out, pool.z + (ez / r) * out];
}

/** A pool's rim (poolShape's), as [x, z] level metres, LAVA.pool.sides points round it. */
export const poolRim = (pool) => pool.rim.map((_, k) => rimPoint(pool, k, 1));

/**
 * How far a point (level metres) is out from a pool's rim (metres, as near as a glow needs it:
 * negative within it).
 */
export function outOfPool(pool, x, z) {
    const e = Math.hypot((x - pool.x) / pool.rx, (z - pool.z) / pool.rz);

    return (e - 1) * Math.min(pool.rx, pool.rz);
}

/**
 * The glow a level's pools cast on the points of its rock or floor (`positions`: x, y, z level
 * metres, three a point; `normals`, which way each faces, if known), each point's linear r, g, b
 * as bytes (0 to 255: a `glow` attribute, dungeons3d.js rockMaterial): brightest at the rim,
 * falling off as the square of the way out to LAVA.glow's reach, and up the walls to its height;
 * what faces up (the floor) lit less than the walls and the rock over the pool (LAVA.glow's
 * `floor`: the room's light lights it already). Added to `into` (bytes as these), if given.
 */
export function poolGlowOn(positions, pools, into = null, normals = null) {
    const glow = into ?? new Uint8Array(positions.length);
    const { colour, reach, high, bright, floor } = LAVA.glow;
    const [r, g, b] = linear(colour);

    for (let p = 0; p < positions.length; p += 3) {
        const [x, y, z] = [positions[p], positions[p + 1], positions[p + 2]];
        let share = 0;

        for (const pool of pools) {
            if (Math.abs(x - pool.x) > pool.rx + reach || Math.abs(z - pool.z) > pool.rz + reach) {
                continue;
            }

            const away = Math.max(0, outOfPool(pool, x, z)) / reach;

            if (away < 1) {
                share += (1 - away) * (1 - away) * (1 - smoothstep(0.2, high, y));
            }
        }

        if (share > 0) {
            share = Math.min(1, share) * bright * (normals ? floor + (1 - floor) * (1 - Math.max(0, normals[p + 1])) : 1);
            glow[p] = Math.min(255, glow[p] + Math.round(r * share * 255));
            glow[p + 1] = Math.min(255, glow[p + 1] + Math.round(g * share * 255));
            glow[p + 2] = Math.min(255, glow[p + 2] + Math.round(b * share * 255));
        }
    }

    return glow;
}

/**
 * A pool's light (a room's: roomlight.js), over its middle, in level metres.
 */
export function poolLight(pool) {
    const { colour, intensity, distance, y, breathe, pace } = LAVA.light;

    return { kind: "lava", x: pool.x, y, z: pool.z, colour, intensity, distance, flicker: 0, breathe, rate: 0, pace, seed: (pool.seed % 1000) / 20 };
}

// The surface: worked out at each point from where it is on its pool (`lava`: metres from the
// pool's middle), how far in from its bank (`heat`: 0 at the bank, 1 at the middle) and which way
// its crust turns (`spin`), as a fire's colours: molten, orange to yellow-white where it's hottest
// (a slower noise, drifting) and churning; plates of black crust floating on it (cells about a
// point each, the nearest of a lattice's jittered points), turned about the pool's middle a whole
// turn each loop, every one of them crusted over at the bank and fewer towards the middle, their
// edges still glowing; the whole cooled at the bank; breathing slowly. Its finer churning at
// medium quality and up (WATER_DETAIL)
function lavaShader(shader) {
    Object.assign(shader.uniforms, { veilTime: VEIL.time, lavaDetail: WATER_DETAIL });
    shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 lava;\nattribute float heat;\nattribute float spin;\nvarying vec2 vLava;\nvarying float vHeat;\nvarying float vSpin;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvLava = lava;\nvHeat = heat;\nvSpin = spin;");
    shader.fragmentShader = shader.fragmentShader
        .replace(
            "#include <common>",
            `#include <common>
varying vec2 vLava;
varying float vHeat;
varying float vSpin;
uniform float veilTime;
uniform float lavaDetail;

const float LAVA_LOOP = ${VEIL.loop.toFixed(1)};
const float LAVA_PLATES = ${LAVA.plates.toFixed(2)};

// (A hash without sines, Dave Hoskins's: one number, and two)
float lavaHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);

    p3 += dot(p3, p3.yzx + 33.33);

    return fract((p3.x + p3.y) * p3.z);
}

vec2 lavaHash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));

    p3 += dot(p3, p3.yzx + 33.33);

    return fract((p3.xx + p3.yz) * p3.zy);
}

// (Value noise on a lattice wrapped to its period, so what drifts across it by a whole period each
// loop comes round whole)
float lavaNoise(vec2 p, vec2 period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 i0 = mod(i, period);
    vec2 i1 = mod(i + 1.0, period);

    return mix(mix(lavaHash(i0), lavaHash(vec2(i1.x, i0.y)), u.x), mix(lavaHash(vec2(i0.x, i1.y)), lavaHash(i1), u.x), u.y);
}

// (The crust's plates about a point: how much nearer the nearest plate's middle is than the next
// (0 on a crack), and the nearest plate's own number)
vec2 lavaPlates(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float first = 8.0;
    float second = 8.0;
    float which = 0.0;

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 cell = vec2(float(x), float(y));
            vec2 o = 0.15 + 0.7 * lavaHash2(i + cell);
            float d = length(cell + o - f);

            if (d < first) {
                second = first;
                first = d;
                which = lavaHash(i + cell + 17.0);
            } else if (d < second) {
                second = d;
            }
        }
    }

    return vec2(second - first, which);
}

vec3 lavaAt() {
    float turn = PI2 * vSpin * veilTime / LAVA_LOOP;
    float c = cos(turn);
    float s = sin(turn);
    vec2 p = mat2(c, -s, s, c) * vLava;
    float hot = lavaNoise(vLava * 1.3 + vec2(0.0, veilTime / LAVA_LOOP * 6.0), vec2(64.0, 6.0));
    float churn = lavaNoise(p * 3.1 + 4.0, vec2(64.0));
    float twist = lavaNoise(p * 3.1 + 9.0, vec2(64.0));
    // (The plates' edges ragged: where they're looked for warped by the churning)
    vec2 plates = lavaPlates(p * LAVA_PLATES + 0.45 * vec2(churn, twist));
    float cool = 1.0 - vHeat;
    // (Whether a plate's crusted over: all of them at the bank, a few in the middle, fewer where
    // it's hotter; and in from its edges, where it's cooled)
    float crusted = smoothstep(-0.04, 0.04, plates.y - 0.78 + 0.95 * cool + 0.3 * (0.5 - hot));
    float inside = smoothstep(0.03, 0.14, plates.x);
    float molten = 0.5 + 0.32 * hot + 0.3 * (churn - 0.5) + 0.12 * (twist - 0.5);

    // (Its finer churning, where there's room to draw it)
    if (lavaDetail > 0.5) {
        molten += 0.08 * (lavaNoise(p * 7.3 + vec2(veilTime / LAVA_LOOP * 18.0, 0.0), vec2(18.0, 64.0)) - 0.5);
    }

    float heat = mix(molten, 0.05 + 0.08 * plates.y, crusted * inside) + crusted * (1.0 - inside) * 0.12;

    heat *= mix(0.3, 1.0, smoothstep(0.0, 0.45, vHeat));
    heat *= 0.93 + 0.07 * sin(PI2 * 20.0 * veilTime / LAVA_LOOP + vLava.x * 2.0);

    vec3 colour = mix(vec3(0.016, 0.009, 0.007), vec3(0.32, 0.022, 0.0), smoothstep(0.05, 0.32, heat));

    colour = mix(colour, vec3(1.45, 0.3, 0.025), smoothstep(0.28, 0.6, heat));
    colour = mix(colour, vec3(2.4, 1.15, 0.28), smoothstep(0.7, 1.0, heat));

    return colour;
}`,
        )
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( lavaAt(), opacity );");
}

let lava = null;

/**
 * The material every pool of lava is drawn with (its surface: lavaShader), its light its own, by
 * the veil's clock (VEIL); casting no shadow.
 */
export function lavaMaterial() {
    if (!lava) {
        lava = new THREE.MeshBasicMaterial({ color: 0xffffff });
        lava.name = "lava";
        lava.userData.shadow = false;
        lava.onBeforeCompile = (shader) => lavaShader(shader);
        lava.customProgramCacheKey = () => "lava";
    }

    return lava;
}

/**
 * A level's pools of lava (poolShape's), each its surface (in rings round its middle, as hot as
 * it is far in) and its bank (a low ridge of crust round it, reaching in over its edge, its inside
 * glowing): { surface, bank } geometries in level metres, every pool's in one (for one draw each),
 * the bank's points coloured `tint` (linear r, g, b) and glowing (`glow`, bytes: rockMaterial's).
 */
export function poolGeometries(pools, tint = [0.16, 0.13, 0.12]) {
    const { sides, rings, y } = LAVA.pool;
    const { inside, out, high } = LAVA.bank;
    const surface = { positions: [], lava: [], heat: [], spin: [], indices: [] };
    const bank = { positions: [], colours: [], glow: [], indices: [] };
    const [gr, gg, gb] = linear(LAVA.glow.colour);

    for (const pool of pools) {
        // (Its middle, then each ring out from it)
        const base = surface.positions.length / 3;

        surface.positions.push(pool.x, y, pool.z);
        surface.lava.push(0, 0);
        surface.heat.push(1);
        surface.spin.push(pool.spin);

        for (const share of [...rings].reverse()) {
            for (let k = 0; k < sides; k++) {
                const [px, pz] = rimPoint(pool, k, share);

                surface.positions.push(px, y, pz);
                surface.lava.push(px - pool.x, pz - pool.z);
                surface.heat.push(1 - share);
                surface.spin.push(pool.spin);
            }
        }

        for (let k = 0; k < sides; k++) {
            const j = (k + 1) % sides;

            surface.indices.push(base, base + 1 + j, base + 1 + k);

            for (let ring = 0; ring < rings.length - 1; ring++) {
                const [a, b] = [base + 1 + ring * sides, base + 1 + (ring + 1) * sides];

                surface.indices.push(a + k, a + j, b + j, a + k, b + j, b + k);
            }
        }

        // (Its bank: in over the lava's edge, up to its crest, down onto the floor beyond; each
        // point a little higher or lower, the inside lit by the lava)
        const from = bank.positions.length / 3;
        const ridge = [
            [-inside, high * 0.55, 0.45],
            [out * 0.35, high, 0.12],
            [out, -0.02, 0.02],
        ];

        for (const [k, [more, up, lit]] of ridge.flatMap((each) => Array.from({ length: sides }, (_, k) => [k, each]))) {
            const slot = Math.round(more * 100);
            const [px, pz] = rimPoint(pool, k, 1, more + (hashOf(k, pool.seed, slot + 3) - 0.5) * 0.1);
            const lift = up > 0 ? up * (0.5 + hashOf(k, pool.seed, slot + 7)) : up;
            const shade = 0.75 + 0.25 * hashOf(k, pool.seed, 11);

            bank.positions.push(px, lift, pz);
            bank.colours.push(tint[0] * shade, tint[1] * shade, tint[2] * shade);
            bank.glow.push(Math.round(gr * lit * 255), Math.round(gg * lit * 255), Math.round(gb * lit * 255));
        }

        for (let ring = 0; ring < ridge.length - 1; ring++) {
            for (let k = 0; k < sides; k++) {
                const j = (k + 1) % sides;
                const [a, b] = [from + ring * sides, from + (ring + 1) * sides];

                bank.indices.push(a + k, a + j, b + j, a + k, b + j, b + k);
            }
        }
    }

    const lavaGeometry = new THREE.BufferGeometry();

    lavaGeometry.setAttribute("position", new THREE.Float32BufferAttribute(surface.positions, 3));
    lavaGeometry.setAttribute("lava", new THREE.Float32BufferAttribute(surface.lava, 2));
    lavaGeometry.setAttribute("heat", new THREE.Float32BufferAttribute(surface.heat, 1));
    lavaGeometry.setAttribute("spin", new THREE.Float32BufferAttribute(surface.spin, 1));
    lavaGeometry.setIndex(surface.indices);

    const bankGeometry = new THREE.BufferGeometry();

    bankGeometry.setAttribute("position", new THREE.Float32BufferAttribute(bank.positions, 3));
    bankGeometry.setAttribute("color", new THREE.Float32BufferAttribute(bank.colours, 3));
    bankGeometry.setAttribute("glow", new THREE.BufferAttribute(new Uint8Array(bank.glow), 3, true));
    bankGeometry.setIndex(bank.indices);
    bankGeometry.computeVertexNormals();

    return { surface: lavaGeometry, bank: bankGeometry };
}
