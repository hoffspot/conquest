// The sites no people builds, drawn (core/setpieces/neutral.js lays them out): standing stones and
// the flat stone in their ring, shrines (a figure on a stepped plinth, braziers, a curved wall
// behind), crags with a cave's black mouth (a catacomb's, a dragon's), torches, the broken walls
// and column stumps of old halls, heaps of fallen stone, bones, broken watchtowers, and the old
// graveyards' low walls, gateposts, tombs and graves. Old and
// weathered: dark at the foot, moss on what faces up, the tops of walls broken off a course at a
// time. Each part is a piece of its own (sites.js), stood on the ground where it is, so each
// reaches down into the ground a little, never floating where the land falls away. And a hell's
// way in, a cult's camp in the wilds: a pentagram scorched into the ground, candles at its points,
// the portal standing in its middle, stakes with skulls on them, the cult's hovels and a cage,
// dead by day and burning only at night.
//
// In world pixels as the kits are (a plot, 4 m, is 20), the part in the middle of its piece's
// plots, facing south.

import * as THREE from "three";
import { createRandom } from "../../../core/random.js";
import { fireLight, lightTorch } from "./torches.js";
import { NEUTRAL, RUINS } from "../../../core/setpieces/neutral.js";
import { LAIR_KINDS } from "../../../core/places.js";
import { PLOT } from "../../../core/setpieces/pieces.js";
import { WINDOW_LIGHT } from "../engine/atlas.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";
import { fireLit } from "../../firelight.js";
import { openVeil } from "../../veil.js";
import { brokenRim, brokenTop, buttress, crumbledRing, crumbledWall, perched, stringCourse, talus, topAt, tumbled } from "./decay.js";
import { IVY, ivyAlong, ringFace, wallFace } from "./ivy.js";
import { brokenCart, fallenTimbers, oldBarrel, oldCrate } from "./leftovers.js";
import { buildWorksPart } from "./works.js";

// World pixels in a metre
const M = 5;
const m = (metres) => metres * M;

// What each people's fallen stone looks like, lying in heaps (loose stones, not dressed: the
// humans' and the wild's the old stone's own rubble, dark and green as its walls)
const RUBBLE = Object.freeze({ elf: "granite", cat: "granite", lizard: "granite", darkElf: "basalt", orc: "basalt" });

/** A people's fallen stone, as it lies in heaps. */
export const rubbleOf = (people) => material(RUBBLE[people] ?? "rubble-old");

// What each people's old stone is (the humans', and the wild's, plain stone gone dark and green:
// painters.js MATERIALS' `old`), and what the breaks in it show (the rubble core it was filled with)
const STONE = Object.freeze({ human: "stone-old", elf: "stone-moon-old", darkElf: "stone-black-old", cat: "mud-pale", lizard: "stone-lime-old", orc: "basalt" });
const CORE = "rubble-old";
// (Standing stones are whole stones, not built of courses: natural rock)
const MEGALITH = Object.freeze({ human: "rock", elf: "rock-pale", darkElf: "obsidian", cat: "rock-red", lizard: "rock-pale", orc: "rock-dark" });
// (A graveyard's stones, each cut whole, gone grey and green: of the land's few, by the people's
// lands it's in, each grave's one of them, `tone`: the humans' grey limestone, buff sandstone and
// grey granite)
const HEADSTONES = Object.freeze({ human: ["dressed-old", "rock-pale", "rock"], elf: ["rock-pale", "dressed-old", "rock"], darkElf: ["obsidian", "rock-dark", "rock-dark"], cat: ["rock-red", "rock-pale", "rock-red"], lizard: ["rock-pale", "dressed-old", "rock"], orc: ["rock-dark", "rock", "rock-dark"] });
const headstoneOf = (people, tone = 0) => (HEADSTONES[people] ?? HEADSTONES.human)[tone];
const stoneOf = (people, tone = 0) => material(headstoneOf(people, tone));

/**
 * What grows on a graveyard's stones, by the stone (HEADSTONES' materials): its colour over the
 * stone's (a multiplier), how much of it there is on a stone (from and to), and where it grows
 * most: on the faces to the west, where the weather comes from, and on the tops, where the birds
 * perch (`west`, `top`), the rest of it scattered. Limestone takes the orange lichens, sandstone
 * grey-green ones all over, granite grey crusts and the yellow-green of map lichen, sparser; dark
 * glassy stone hardly any. On every stone green algae on the faces to the east and the north
 * (`GREEN`: its colour, and how much on each).
 */
export const LICHENS = Object.freeze({
    "dressed-old": { colour: [1.25, 0.9, 0.42], amount: [0.3, 0.85], west: 1, top: 0.9 },
    "rock-pale": { colour: [0.86, 0.96, 0.8], amount: [0.35, 0.9], west: 0.5, top: 0.6 },
    "rock-red": { colour: [0.86, 0.96, 0.8], amount: [0.3, 0.8], west: 0.5, top: 0.6 },
    rock: { colour: [0.98, 1.06, 0.68], amount: [0.1, 0.45], west: 0.5, top: 0.5 },
    "rock-dark": { colour: [0.92, 0.97, 0.86], amount: [0.05, 0.3], west: 0.4, top: 0.4 },
    obsidian: { colour: [0.92, 0.97, 0.9], amount: [0, 0.1], west: 0.3, top: 0.3 },
});
const GREEN = Object.freeze({ colour: [0.6, 0.74, 0.48], east: 0.5, north: 0.35 });

/**
 * A grave as it's drawn (metres): its headstone set into the ground a third of its whole length
 * (half as deep as it stands above it), never less than `deep`; the graveyard's wall narrowing by
 * `batter` of its thickness each metre it rises; a cross's upright and
 * its arm (`cross`: the upright's width, the arm's width and height, how far its middle is below the
 * top) and its ring (`ring`: how big round, how thick); a footstone (`footstone`: how high, wide
 * and thick); the mound over it (`mound`: how high, how much narrower than the grave, how far its
 * sides slope in), the earth freshly turned higher; a grave broken open (`open`: its hole's inset
 * from the grave's sides and ends, the earth heaped on one side of it, how high and wide, and the
 * broken boards of the coffin about it); its railing (`railing`: how high, its bars how far apart,
 * the kerb it stands on).
 */
export const GRAVE = Object.freeze({
    deep: 0.35,
    batter: 0.16,
    cross: { upright: 0.17, arm: [0.58, 0.15, 0.32] },
    ring: { radius: 0.22, thick: 0.035 },
    footstone: { high: [0.25, 0.4], wide: 0.32, thick: 0.08 },
    mound: { high: 0.16, inset: 0.12, fresh: 0.22 },
    open: { inset: [0.12, 0.25], heap: [0.45, 0.6], boards: [2, 4] },
    railing: { high: 0.95, every: 0.3, kerb: 0.14 },
});

/**
 * An old hall's wall's windows (HALL.windows), along it as its broken top's points (`top`, world
 * pixels, `length` long), from its own random numbers: crumbledWall's openings.
 */
export function hallWindows(top, length, random) {
    const { span, k, sill, spring, every, end, standing, clear, chance } = HALL.windows;
    const lowest = (a, b) => Math.min(topAt(top, a), topAt(top, b), ...top.filter(([u]) => u > a && u < b).map(([, h]) => h));
    const openings = [];

    for (let u = m(end) + random.range(0, m(every[0]) / 2); u + m(span) < length - m(end); u += m(random.range(...every))) {
        if (lowest(u - m(clear), u + m(span + clear)) > m(sill + standing) && random.chance(chance)) {
            openings.push({ u0: u, u1: u + m(span), sill: m(sill), spring: m(spring), k });
        }
    }

    return openings;
}

// How far each part reaches into the ground below where it stands (metres)
const FOOTING = 1.4;

/**
 * An old hall's walls as they were built (the research report behind M7b's "five features carry
 * a keep at a hundred metres"), in metres: tall lancet windows through them (`windows`: `span`
 * wide, their heads `k` (decay.js archOf), from `sill` up, springing at `spring`, `every` metres
 * apart give or take, none within `end` of a wall's end, each where the wall still stands
 * `standing` above its sill over it and `clear` either side, open above where its head fell,
 * `chance` of them); a base course and a course under the
 * sills (`courses`: [height, how tall, how far proud]); stepped buttresses on its outer face
 * (`buttresses`: `width` across, standing out `depths`, ending at `stages` of its height, at most
 * `tallest`), between its windows and near its ends.
 */
export const HALL = Object.freeze({
    windows: { span: 0.6, k: 1.1, sill: 1.4, spring: 2.5, every: [2.6, 3.6], end: 1.2, standing: 0.7, clear: 0.4, chance: 0.8 },
    courses: [
        [0.35, 0.3, 0.12],
        [1.3, 0.18, 0.1],
    ],
    buttresses: { width: 0.7, depths: [0.75, 0.5, 0.3], stages: [0.45, 0.75, 1], tallest: 4.2, end: 0.9, least: 1.8 },
});

/**
 * A hell's way in as it's drawn (setpieces/neutral.js HELL_CAMP lays it out), in metres: its
 * pentagram's lines (`scorch`: how high over the ground the ash lies and the burnt line on it, how
 * wide the line is about, and how far the ash reaches past it either side, from and to; its inner
 * ring how far within the outer and how wide; the ash's colour over the burnt earth's), how many
 * sides its rings have (`sides`); its candles (`candles`: how tall and how thick, from and to);
 * its portal's arch (`arch`: how many stones, how much higher its keystone stands); and its cage
 * (`cage`: how wide and high, how many bars to a side).
 */
export const CAMP = Object.freeze({
    scorch: { lift: [0.025, 0.045], line: 0.2, charred: [0.06, 0.2], inner: 0.45, thin: 0.09, ash: [0.5, 0.48, 0.5] },
    sides: 32,
    candles: { tall: [0.1, 0.32], thick: [0.035, 0.055] },
    arch: { stones: 7, keystone: 0.25 },
    cage: { wide: 1.6, high: 1.8, bars: 3 },
});

/**
 * What smoulders round a hell's way in, lit only at night (as the windows are: atlas.js
 * WINDOW_LIGHT), by day as dark as burnt things are: the lines of its pentagram scorched into the
 * ground (`scorch`: a dull red), the runes cut in its portal's stones and the coals in its
 * braziers (`runes`, `coals`: as coals glow). Each its colour by day (sRGB), the light it gives
 * at night (linear: more than 1, brighter than white) and how much that wavers along it.
 */
export const SMOULDERS = Object.freeze({
    scorch: { colour: 0x1c1714, glow: [0.1, 0.01, 0.002], waver: 0.6 },
    runes: { colour: 0x262220, glow: [0.42, 0.05, 0.006], waver: 0.25 },
    coals: { colour: 0x2c2826, glow: [1.5, 0.42, 0.08], waver: 0.35 },
    // (The Sundered Ring's scar of green glass: dark green-black by day, the thin places' green at night)
    greenglass: { colour: 0x0e1a12, glow: [0.03, 0.34, 0.1], waver: 0.45 },
});

const smouldering = new Map();

// The glow of what smoulders at night (SMOULDERS'), as much as the evening's lit the windows,
// wavering slowly in patches along it as coals do (where it is in the world, and the drawing's
// clock: WINDOW_LIGHT's z)
const SMOULDER_GLSL = `
if (windowLight.x > 0.0) {
    float smoulderPatch = 0.5 + 0.25 * sin(vSmoulder.x * 1.7 + vSmoulder.z * 2.3 + windowLight.z * 0.9) + 0.25 * sin(vSmoulder.x * 3.1 - vSmoulder.z * 1.3 - windowLight.z * 1.7);

    totalEmissiveRadiance += smoulderGlow * windowLight.x * (1.0 - smoulderWaver + smoulderWaver * smoulderPatch);
}`;

/**
 * What smoulders (SMOULDERS' `name`), a material of its own: lit as the land round it is (the sun,
 * the fires near: firelight.js), its corners' colours its weathering; and at night glowing too.
 * One program for every kind of it (its colours its own uniforms).
 */
export function smoulder(name) {
    if (!smouldering.has(name)) {
        const { colour, glow, waver } = SMOULDERS[name];
        const result = new THREE.MeshLambertMaterial({ color: colour, vertexColors: true });
        const uniforms = { windowLight: WINDOW_LIGHT, smoulderGlow: { value: new THREE.Vector3(...glow) }, smoulderWaver: { value: waver } };

        result.name = `smoulder-${name}`;
        result.shadowSide = THREE.DoubleSide;
        result.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", "#include <common>\nvarying vec3 vSmoulder;")
                .replace("#include <project_vertex>", "#include <project_vertex>\nvSmoulder = (modelMatrix * vec4(transformed, 1.0)).xyz;");
            shader.fragmentShader = shader.fragmentShader
                .replace("#include <common>", "#include <common>\nuniform vec4 windowLight;\nuniform vec3 smoulderGlow;\nuniform float smoulderWaver;\nvarying vec3 vSmoulder;")
                .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${SMOULDER_GLSL}`);
            fireLit(shader);
        };
        result.customProgramCacheKey = () => "smoulder";
        smouldering.set(name, result);
    }

    return smouldering.get(name);
}

/**
 * Weathering (Solid's tone): darker at the foot, moss where it faces up (and a little north),
 * lights left their own colour. (The ruined castles' pieces too: kits/castle.js.)
 */
export function weathered(seed, { moss = 0.5, dirt = 0.4 } = {}) {
    const random = createRandom(seed >>> 0);
    const mossy = [0.62 + random.next() * 0.08, 0.78, 0.48];

    return Object.assign(
        (point, normal, own) => {
            if (own.userData?.glow !== undefined) {
                return null;
            }

            const foot = Math.max(0, Math.min(1, point[1] / m(1.2)));
            const shade = 1 - dirt * (1 - foot);
            const up = Math.max(0, normal[1] - 0.35) / 0.65 + Math.max(0, -normal[2] - 0.6) * 0.4;
            const green = Math.min(1, moss * up * 1.4);

            return [shade * (1 - green + green * mossy[0]), shade * (1 - green + green * mossy[1]), shade * (1 - green + green * mossy[2])];
        },
        { bands: [m(1.2)] },
    );
}

// The middle of a piece of `w` by `h` plots (world pixels)
const middleOf = (piece) => [piece.w * 10, piece.h * 10];

// A rectangle's corners round (cx, cz), `across` along (ax, az) and `deep` along its quarter turn
function corners(cx, cz, ax, az, across, deep) {
    const [px, pz] = [-az, ax];

    return [
        [cx - (ax * across) / 2 - (px * deep) / 2, cz - (az * across) / 2 - (pz * deep) / 2],
        [cx + (ax * across) / 2 - (px * deep) / 2, cz + (az * across) / 2 - (pz * deep) / 2],
        [cx + (ax * across) / 2 + (px * deep) / 2, cz + (az * across) / 2 + (pz * deep) / 2],
        [cx - (ax * across) / 2 + (px * deep) / 2, cz - (az * across) / 2 + (pz * deep) / 2],
    ];
}

// A face closing a ring of points (a rock's front or back), as a fan from its middle
function fan(solid, ring, out, material) {
    const middle = ring.reduce((sum, p) => [sum[0] + p[0] / ring.length, sum[1] + p[1] / ring.length, sum[2] + p[2] / ring.length], [0, 0, 0]);

    for (let k = 0; k < ring.length; k++) {
        solid.facing([middle, ring[k], ring[(k + 1) % ring.length]], out, material);
    }
}

// A cave's way in, on a rock's face at (cx, y, front): great stones standing out of the face
// either side of it, leaning in a little, and one laid across them (a dolmen's doorway, the old
// way in to a barrow), rough as they were found; between them the black of the way going on into
// the hill, set back so their sides and the stone over it show round it
function mouthOf(solid, piece, random, part, [cx, y, front]) {
    const [mw, mh] = [m(part.mouth.w) * 0.8, m(part.mouth.h)];
    const out = m(1.2);
    const stone = material(LAIR_KINDS.includes(piece.name) ? "rock-dark" : (MEGALITH[piece.people] ?? "rock"));
    const jamb = Math.max(m(0.55), mw * 0.16);

    // (Clear of the face's foot, which stands out a little: outcrop's)
    solid.face([[-mw / 2, 0], [mw / 2, 0], [mw * 0.4, mh], [-mw * 0.4, mh]].map(([x, h]) => [cx + x, y + h, front + m(0.45)]), material("shadow"));

    for (const side of [-1, 1]) {
        const foot = [cx + side * (mw / 2 + jamb / 2), y - m(FOOTING), front + out / 2];
        const head = [cx + side * (mw * 0.4 + jamb / 2) + m(random.range(-0.08, 0.08)), y + mh + m(0.1), front + out / 2 + m(random.range(-0.15, 0.1))];

        solid.beam(foot, head, jamb * random.range(0.9, 1.1), out, stone, { up: [0, 0, 1] });
    }

    // (The stone laid across, longer than the way's wide, a little askew)
    const tilt = m(random.range(-0.15, 0.15));

    solid.beam([cx - mw / 2 - jamb * 1.3, y + mh + m(0.35) - tilt, front + out / 2], [cx + mw / 2 + jamb * 1.3, y + mh + m(0.35) + tilt, front + out / 2], m(0.7), out * 1.05, stone, { up: [0, 0, 1] });
}

const BUILD = {
    // A standing stone: tall and flat-sided, its broad faces to the ring's middle, narrowing a
    // little and rounded off at the top, leaning a touch; or fallen, lying along the ring. Scorched
    // black (`scorched`: the Sundered Ring's), and split across (`split`: so much of it standing, a
    // jagged break across its top, its top lying beyond it, laid out as a fallen stone of its own)
    stone(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = material(part.scorched ? "rock-dark" : (MEGALITH[piece.people] ?? "rock"));
        const [ax, az] = [-Math.sin(part.angle), Math.cos(part.angle)];

        if (part.fallen) {
            const lying = corners(cx, cz, ax, az, m(part.h * 0.9), m(part.w));

            solid.extrude(lying, -m(0.2), m(part.d * 1.1), stone, { batter: m(0.12) });

            return;
        }

        // (Split: its stump, broken off jagged, a little higher at one side than the other)
        if (part.split) {
            const stump = part.h * part.split;
            const foot = corners(cx, cz, ax, az, m(part.w), m(part.d));

            solid.extrude(foot, -m(FOOTING), m(stump * 0.85), stone, { batter: m(0.06) });

            for (const side of [-1, 1]) {
                const half = corners(cx + side * ax * m(part.w * 0.25), cz + side * az * m(part.w * 0.25), ax, az, m(part.w * 0.5), m(part.d * 0.92));

                solid.extrude(half, m(stump * 0.85), m(stump * (side > 0 ? random.range(1, 1.15) : random.range(0.88, 0.98))), stone, { batter: m(part.w * 0.12) });
            }

            return;
        }

        const lean = [random.range(-0.25, 0.25) * M, random.range(-0.25, 0.25) * M];
        const foot = corners(cx, cz, ax, az, m(part.w), m(part.d));

        solid.extrude(foot, -m(FOOTING), m(part.h * 0.82), stone, { batter: m(0.1) });

        const top = corners(cx + lean[0], cz + lean[1], ax, az, m(part.w * 0.86), m(part.d * 0.86));

        solid.extrude(top, m(part.h * 0.82), m(part.h), stone, { batter: m(part.w * 0.18) });
    },

    // A scar of green glass where the ground melted as the world tore (the Sundered Ring's heart:
    // setpieces/neutral.js "sundered ring"), `r` metres round, its edge ragged; cracks of it running
    // out across the scorched earth round it (`cracks`), shards of it standing up out of it
    // (`shards`), all of it dark by day and glowing the green of the thin places at night
    // (SMOULDERS `greenglass`); the earth round it charred to ash. Lying a little over the ground
    scar(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const [glass, ash] = [smoulder("greenglass"), material("earth-sooty")];
        const r = m(part.r);
        const sides = 18;
        // (Its edge, ragged, from the middle out `out` (a share of `r`) at each of its corners)
        const ragged = (out, y, lo, hi) =>
            Array.from({ length: sides }, (_, k) => {
                const a = part.turn + (k / sides) * Math.PI * 2;
                const reach = r * out * random.range(lo, hi);

                return [cx + Math.cos(a) * reach, y, cz + Math.sin(a) * reach];
            });
        const fan = (rim, stuff) => {
            const middle = [cx, rim[0][1], cz];

            rim.forEach((point, k) => solid.facing([middle, rim[(k + 1) % rim.length], point], [0, 1, 0], stuff, undefined, null));
        };

        fan(ragged(1.45, m(0.02), 0.85, 1.15), ash);
        fan(ragged(1, m(0.05), 0.8, 1.1), glass);

        // (Its cracks: thin strips of it running out from its edge, narrowing)
        for (let k = 0; k < part.cracks; k++) {
            const a = part.turn + (k / part.cracks) * Math.PI * 2 + random.range(-0.3, 0.3);
            const [ux, uz] = [Math.cos(a), Math.sin(a)];
            const [from, to] = [r * 0.9, r * random.range(1.7, 2.4)];
            const wide = m(random.range(0.08, 0.14));
            const bend = random.range(-0.25, 0.25);
            const along = (t) => [cx + ux * (from + (to - from) * t) - uz * bend * t * r, cz + uz * (from + (to - from) * t) + ux * bend * t * r];
            const [a0, a1] = [along(0), along(1)];

            solid.facing([[a0[0] - uz * wide, m(0.04), a0[1] + ux * wide], [a1[0], m(0.04), a1[1]], [a0[0] + uz * wide, m(0.04), a0[1] - ux * wide]], [0, 1, 0], glass, undefined, null);
        }

        // (Its shards: thin blades of glass standing up out of it, leaning out)
        for (let k = 0; k < part.shards; k++) {
            const a = random.range(0, Math.PI * 2);
            const out = r * random.range(0.2, 0.85);
            const [x, z] = [cx + Math.cos(a) * out, cz + Math.sin(a) * out];
            const tall = m(random.range(0.25, 0.7));
            const wide = m(random.range(0.06, 0.12));
            const lean = random.range(0.1, 0.35) * tall;
            const tip = [x + Math.cos(a) * lean, tall, z + Math.sin(a) * lean];
            const [px, pz] = [-Math.sin(a) * wide, Math.cos(a) * wide];

            solid.face([[x - px, 0, z - pz], [x + px, 0, z + pz], tip], glass, [[0, 0], [m(1), 0], [m(0.5), m(1)]], null);
            solid.face([[x + px, 0, z + pz], [x - px, 0, z - pz], tip], glass, [[0, 0], [m(1), 0], [m(0.5), m(1)]], null);
        }
    },

    // The flat stone in the ring's middle, on two low stones
    altar(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = material(MEGALITH[piece.people] ?? "rock");

        for (const side of [-1, 1]) {
            solid.box(cx + side * m(part.w * 0.3) - m(0.3), -m(FOOTING), cz - m(part.d * 0.4), cx + side * m(part.w * 0.3) + m(0.3), m(part.h - 0.25), cz + m(part.d * 0.4), stone);
        }

        solid.extrude(corners(cx, cz, 1, 0, m(part.w), m(part.d)), m(part.h - 0.25), m(part.h), stone, { batter: m(0.08) });
    },

    // Three steps up to where the figure stands
    plinth(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = material(STONE[piece.people] ?? STONE.human);
        const step = part.h / 3;

        for (let k = 0; k < 3; k++) {
            const size = m(part.w) * (1 - k * 0.2);

            solid.extrude(corners(cx, cz, 1, 0, size, size), k === 0 ? -m(FOOTING) : m(step * k), m(step * (k + 1)), stone);
        }
    },

    // The figure on the plinth: a robed and hooded one, an obelisk, or a basin held up on a column
    figure(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        // (Pale old stone, weathered: not new marble)
        const marble = material(piece.people === "darkElf" ? "obsidian" : "rock-pale");
        const base = m(0.7);
        const h = m(part.h);

        if (part.figure === "obelisk") {
            solid.extrude(corners(cx, cz, 1, 0, m(0.7), m(0.7)), base, base + h * 0.88, marble, { batter: m(0.12) });
            solid.pyramid(cx - m(0.23), cz - m(0.23), cx + m(0.23), cz + m(0.23), base + h * 0.88, h * 0.12, marble);

            return;
        }

        if (part.figure === "hands") {
            solid.cylinder(cx, cz, base, base + h * 0.6, m(0.22), m(0.18), marble, { segments: 10 });
            solid.lathe(cx, cz, [[m(0.1), base + h * 0.6], [m(0.62), base + h * 0.72], [m(0.66), base + h * 0.76], [m(0.5), base + h * 0.73], [0, base + h * 0.7]], marble, { segments: 12 });
            solid.cylinder(cx, cz, base + h * 0.72, base + h * 0.78, m(0.12), 0, material("glow-gold"), { segments: 8 });

            return;
        }

        // (Robed and hooded, its head bowed: a lathe, the hood a little forward)
        solid.lathe(
            cx,
            cz,
            [
                [m(0.62), base],
                [m(0.5), base + h * 0.35],
                [m(0.36), base + h * 0.62],
                [m(0.42), base + h * 0.74],
                [m(0.26), base + h * 0.82],
                [m(0.22), base + h * 0.93],
                [0, base + h],
            ],
            marble,
            { segments: 10 },
        );
        solid.box(cx - m(0.34), base + h * 0.5, cz, cx + m(0.34), base + h * 0.6, cz + m(0.42), marble);
    },

    // An iron bowl on three legs, burning: a shrine's day and night; a hell's camp's only at
    // night (`night`), its coals cold by day
    brazier(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const iron = material("iron-black");

        for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2;

            solid.turnedBox(cx + Math.cos(a) * m(0.2), cz + Math.sin(a) * m(0.2), m(0.03), m(0.03), 0, m(0.85), a, iron);
        }

        solid.lathe(cx, cz, [[m(0.08), m(0.8)], [m(0.34), m(0.95)], [m(0.36), m(1.05)]], iron, { segments: 10 });
        solid.cylinder(cx, cz, m(0.95), m(1.02), m(0.3), m(0.3), part.night ? smoulder("coals") : material("embers"), { segments: 10 });
        // (Its fire: world/fire.js)
        fireLight(solid, [cx, m(1.02), cz], part.night ? "brazier-night" : "brazier");
    },

    // A curved wall behind the shrine, broken off unevenly
    backwall(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = material(STONE[piece.people] ?? STONE.human);
        const count = 9;

        for (let k = 0; k < count; k++) {
            const a = Math.PI + (k / (count - 1)) * Math.PI;
            const height = m(part.h) * (0.55 + 0.45 * Math.sin((k / (count - 1)) * Math.PI)) * random.range(0.7, 1.05);

            solid.turnedBox(cx + Math.cos(a) * m(part.radius * 0.55), cz + m(0.6) + Math.sin(a) * m(part.radius * 0.45), m(0.45), m(0.3), -m(FOOTING), height, a + Math.PI / 2, stone);
        }
    },

    // The face of rock a cave's cut into a hillside (a cave's, the dragon's: core sites.js digs a
    // level floor into the hill in front of it, as deep at the face as the face is high), the way
    // in at its foot. Its top's the hill's brow, broken; behind that the rock goes back into the
    // hill and under it, so above and behind the face there's only the hill (part.lie: the hill's
    // heights behind the face, from the piece's middle's; or, without, a plane as steep as
    // part.slope). Boulders fallen at its foot.
    outcrop(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const rock = material(piece.people === "orc" || LAIR_KINDS.includes(piece.name) ? "rock-dark" : "rock");
        const [hw, depth] = [m(part.x1 - part.x0) / 2, m(part.y1 - part.y0)];
        const front = cz + depth / 2;
        const slope = Math.max(0, Math.min(1.2, part.slope ?? 0));
        const lie = part.lie ?? { back: [0, 1, 2, 3, 4.5], heights: null };
        // (The hill's height `back` metres behind the face's line (the k'th of lie's), x across)
        const hill = (k, x) => {
            const row = lie.heights?.[k];

            if (!row) {
                return slope * (depth / 2 - m(lie.back[k]));
            }

            const f = Math.min(row.length - 1, Math.max(0, ((x - cx + hw) / (2 * hw)) * (row.length - 1)));
            const i = Math.min(row.length - 2, Math.floor(f));

            return m(row[i] + (row[i + 1] - row[i]) * (f - i));
        };
        const floor = hill(0, cx) - m(part.face ?? 4);
        const bottom = floor - m(FOOTING);
        // (As wide as the floor's dug at the face's line, its banks and all: past that it would
        // only be a lip on the hill)
        const reach = lie.cut ? Math.min(hw, m(Math.sqrt((lie.cut + lie.ease) ** 2 - lie.cut ** 2))) : hw;
        // (How far over the hill each row stands: the face's top a broken lip over its brow, then
        // the rock going back under the hill)
        const over = [
            [0.25, 0.9],
            [0.1, 0.45],
            [-0.15, 0],
            [-0.8, -0.5],
            [-1.8, -1.4],
        ];
        const rings = lie.back.map((back, k) => {
            const z = front - m(back) - (k === 0 ? 0 : m(0.15));
            const w = reach * (1 - 0.03 * k);
            const points = [[cx - w, bottom, z]];

            for (let i = 0; i <= 12; i++) {
                const x = cx - w + (2 * w * i) / 12;
                // (The face's top edge leaning back a little here and there, its rock broken off;
                // going down into the banks at its ends)
                const lean = k === 0 && i > 0 && i < 12 ? m(random.range(0, 0.45)) : 0;
                const end = Math.min(1, (6 - Math.abs(i - 6)) / 2);
                const lip = m(random.range(...over[Math.min(k, over.length - 1)]));

                points.push([x, hill(k, x) + lip * end - m(0.4) * (1 - end), z - lean]);
            }

            points.push([cx + w, bottom, z]);

            return points;
        });

        // (Its face standing a little out at its foot, battered back to its top)
        rings[0][0][2] += m(0.4);
        rings[0].at(-1)[2] += m(0.4);

        solid.loft(rings, rock, { smooth: false });
        fan(solid, rings[0], [0, 0, 1], rock);
        fan(solid, rings.at(-1), [0, 0, -1], rock);

        // (Boulders fallen from it, at its foot on the floor)
        for (let k = random.int(2, 4); k > 0; k--) {
            const side = random.pick([-1, 1]);

            tumbled(solid, random, [cx + side * random.range(0.25, 0.6) * hw, floor + m(0.3), front + m(random.range(0.4, 1.8))], m(random.range(0.5, 1.1)), rock);
        }

        if (part.mouth) {
            mouthOf(solid, piece, random, part, [cx, floor, front]);
        }
    },

    // A spur of rock running down from a hillside (the dragon's lair's, either side of its
    // hollow): a ridge coming up out of the hill behind, highest about its middle, and going down
    // into the ground at its front; craggy along its length. Its foot well down, for the hollow's
    // dug into the hill beside it.
    spur(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const rock = material("rock-dark");
        const [hw, depth] = [m(part.x1 - part.x0) / 2, m(part.y1 - part.y0)];
        const front = cz + depth / 2;
        const slope = Math.max(0, Math.min(1.2, part.slope ?? 0));
        const ground = (t) => slope * depth * (t - 0.5);
        const high = m(part.h);
        // (How high over the hill it stands, front to back)
        const rise = [0.05, 0.45, 0.85, 0.95, 0.6, 0.1];
        const rings = rise.map((over, k) => {
            const t = k / (rise.length - 1);
            const z = front - t * depth;
            const w = hw * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.3))) * random.range(0.8, 1.05);
            const top = high * over * random.range(0.8, 1.1);
            const g = ground(t);
            const lean = random.range(-0.2, 0.2) * w;
            const points = [[cx - w, g - m(FOOTING + 6), z]];

            for (let i = 0; i <= 8; i++) {
                const angle = (i / 8) * Math.PI;
                const rough = 1 + random.range(-0.18, 0.12);

                points.push([cx - Math.cos(angle) * w * rough + lean * Math.sin(angle), g + Math.sin(angle) ** 0.6 * top * rough, z]);
            }

            points.push([cx + w, g - m(FOOTING + 6), z]);

            return points;
        });

        solid.loft(rings, rock, { smooth: false });
        fan(solid, rings[0], [0, 0, 1], rock);
        fan(solid, rings.at(-1), [0, 0, -1], rock);
    },

    // A pit sunk into the ground (core sites.js sinks the land there: steep all round), lined with
    // old stone crumbling at its rim; steps down its front to a dark doorway in its back wall. Its
    // floor is where it stands.
    pit(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = material(STONE[piece.people] ?? STONE.human);
        const [r, ease, drop] = [m(part.radius), m(part.ease), m(part.drop)];
        // (Its lining as far out as the sunk land's three quarters up, so its earth rim shows round
        // it)
        const outer = r + ease * 0.75;
        const heights = brokenRim(random, 20, 2 * Math.PI * outer, drop * 0.86, drop * 1.02, { stone: m(0.6), course: m(0.25), breaches: 0.05 });

        // (Its lining, from its floor's edge out to the land round it, open where the steps are)
        crumbledRing(solid, cx, cz, [r, outer], -m(0.4), heights, stone, { open: [Math.PI / 2 - 0.3, Math.PI / 2 + 0.3], core: material(CORE) });
        solid.cylinder(cx, cz, -m(0.2), m(0.05), r, r, material("cobbles"), { segments: 12 });

        // (Steps down its front: each as high as the sunk land is there)
        const steps = 7;

        for (let k = 0; k < steps; k++) {
            const [d0, d1] = [(k / steps) * (outer - r), ((k + 1) / steps) * (outer - r)];
            const t = Math.min(1, d1 / ease);
            const tread = drop * t * t * (3 - 2 * t);

            solid.box(cx - m(0.75), -m(0.4), cz + r + d0, cx + m(0.75), tread + m(0.05), cz + r + d1, stone);
        }

        // (The doorway in its back wall: dark, framed in great stones)
        const [mw, mh] = [m(part.mouth.w), m(part.mouth.h)];
        const back = cz - r;

        solid.face([[cx - mw / 2, 0, back + m(0.32)], [cx + mw / 2, 0, back + m(0.32)], [cx + mw / 2, mh * 0.8, back + m(0.32)], [cx, mh, back + m(0.32)], [cx - mw / 2, mh * 0.8, back + m(0.32)]], material("shadow"));

        for (const side of [-1, 1]) {
            solid.box(cx + side * (mw / 2) - m(0.4) * (side < 0 ? 1 : 0), -m(0.3), back - m(0.5), cx + side * (mw / 2) + m(0.4) * (side > 0 ? 1 : 0), mh * 0.85, back + m(0.3), stone);
        }

        solid.box(cx - mw / 2 - m(0.5), mh * 0.85, back - m(0.5), cx + mw / 2 + m(0.5), mh * 0.85 + m(0.5), back + m(0.35), stone);

        // (Stones fallen about its rim)
        for (let k = random.int(3, 6); k > 0; k--) {
            const a = random.range(-Math.PI, 0.6 * Math.PI) + Math.PI * 0.2;

            tumbled(solid, random, [cx + Math.cos(a) * (outer + m(0.6)), drop + m(0.2), cz + Math.sin(a) * (outer + m(0.6))], m(random.range(0.4, 0.8)), stone);
        }
    },

    // A torch on a post, its flame in an iron cage
    torch(solid, piece) {
        const [cx, cz] = middleOf(piece);

        solid.cylinder(cx, cz, -m(0.6), m(1.9), m(0.07), m(0.06), material("timber-char"), { segments: 6 });
        solid.cylinder(cx, cz, m(1.9), m(2.15), m(0.14), m(0.17), material("iron-black"), { segments: 6, capped: false });
        solid.cylinder(cx, cz, m(1.92), m(1.98), m(0.1), m(0.1), material("embers"), { segments: 6 });
        // (Its flame, at night: world/fire.js)
        lightTorch(solid, [cx, m(1.98), cz]);
    },

    // A stretch of an old hall's wall, crumbled (kits/decay.js): its top broken a stone at a time,
    // a breach here and there, its fallen stone against its foot either side
    wall(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = material(STONE[piece.people] ?? STONE.human);
        const [w, d] = [m(part.x1 - part.x0), m(part.y1 - part.y0)];
        const alongX = w >= d;
        const [length, thick] = alongX ? [w, d] : [d, w];
        const at = alongX ? (u, y, v) => [cx + u, y, cz + v] : (u, y, v) => [cx + v, y, cz + u];
        const high = m(part.h);
        const top = brokenTop(random, length, m(0.8), high, { stone: m(0.9), course: m(0.32) });
        // (As it was built, from its own random numbers so what fell from it stays as it was)
        const own = createRandom(((part.seed ?? 1) ^ 0x2f1d) >>> 0);
        const openings = hallWindows(top, length, own);

        crumbledWall(solid, at, top, -length / 2, [-thick / 2, thick / 2], -m(FOOTING), stone, { core: material(CORE), openings });

        for (const [height, width, depth] of HALL.courses) {
            for (const side of [-1, 1]) {
                stringCourse(solid, at, top, -length / 2, (side * thick) / 2, side, m(height), stone, { width: m(width), depth: m(depth), openings });
            }
        }

        // (Its buttresses on its outer face: which way that is from where it stands in its site)
        const [w0, h0] = (NEUTRAL[piece.name] ?? [0, 0]).map((plots) => (plots * PLOT) / 2);
        const outer = alongX ? Math.sign((part.y0 + part.y1) / 2 - h0) || 1 : Math.sign((part.x0 + part.x1) / 2 - w0) || 1;
        const { width, depths, stages, tallest, least } = HALL.buttresses;
        const spots = [m(HALL.buttresses.end), length - m(HALL.buttresses.end), ...openings.slice(1).map(({ u0 }, i) => (openings[i].u1 + u0) / 2)];
        const stood = [];

        for (const u of length > m(3) ? spots : []) {
            const tall = Math.min(topAt(top, u) - m(0.3), m(tallest));

            if (tall > m(least) && !openings.some(({ u0, u1 }) => u > u0 - m(width) && u < u1 + m(width))) {
                buttress(solid, at, -length / 2, u, (outer * thick) / 2, outer, -m(FOOTING), stages.map((t) => tall * t), depths.map(m), m(width), stone, material(CORE));
                stood.push([u - m(width) / 2, u + m(width) / 2]);
            }
        }

        // (Ivy hanging from its broken top, more on its outer face; clear of its windows and its
        // buttresses: from numbers of its own, as its windows are)
        const ivy = createRandom(((part.seed ?? 1) ^ 0x1c7) >>> 0);

        for (const side of [-1, 1]) {
            const clear = [...openings.map(({ u0, u1 }) => [u0, u1]), ...(side === outer ? stood : [])];

            ivyAlong(solid, ivy, wallFace(at, top, -length / 2, (side * thick) / 2, side, 0), length, { clear, chance: side === outer ? IVY.chance : IVY.chance * 0.6 });
        }

        for (const side of [-1, 1]) {
            talus(solid, random, at, top, -length / 2, (side * thick) / 2, side, high * 1.4, 0, rubbleOf(piece.people));
        }

        perched(solid, random, at, top, -length / 2, [-thick / 2, thick / 2], high - m(0.6), stone);
    },

    // A column's stump, its drums broken off; or fallen, its drums lying in a row
    column(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = material(STONE[piece.people] ?? STONE.human);
        const r = m(0.4);

        solid.box(cx - r * 1.3, -m(FOOTING), cz - r * 1.3, cx + r * 1.3, m(0.3), cz + r * 1.3, stone);

        if (part.fallen) {
            const [ax, az] = [Math.cos(part.turn), Math.sin(part.turn)];

            for (let k = 0; k < 3; k++) {
                const at = [cx + ax * (k + 0.6) * m(0.9), r * 0.9, cz + az * (k + 0.6) * m(0.9)];

                solid.tube([[at[0] - ax * m(0.4), at[1], at[2] - az * m(0.4)], [at[0] + ax * m(0.4), at[1], at[2] + az * m(0.4)]], r * 0.95, stone, { sides: 8, caps: true, smooth: true });
            }

            return;
        }

        solid.cylinder(cx, cz, m(0.3), m(part.h), r, r * 0.94, stone, { segments: 10 });
        solid.cylinder(cx + random.range(-1, 1), cz + random.range(-1, 1), m(part.h), m(part.h) + m(0.18), r * 0.8, r * 0.5, stone, { segments: 10 });
    },

    // An old hall's way down to its crypt: a stair-house of the hall's stone against its back
    // wall, gabled, a round-arched door in its front onto the dark of the stair going down, a
    // skull over the door
    crypt(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = material(STONE[piece.people] ?? STONE.human);
        const [w, d] = [m(part.x1 - part.x0), m(part.y1 - part.y0)];
        const [x0, x1, z0, z1] = [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2];
        const [eaves, thick, foot] = [m(2.7), m(0.45), m(FOOTING)];
        const [door, high] = RUINS.crypt.door.map(m);

        solid.box(x0, -foot, z0, x0 + thick, eaves, z1 - m(0.01), stone);
        solid.box(x1 - thick, -foot, z0, x1, eaves, z1 - m(0.01), stone);
        solid.box(x0 + thick, -foot, z0, x1 - thick, eaves, z0 + thick, stone);
        solid.wall({ origin: [x0, -foot, z1], across: [1, 0, 0], out: [0, 0, 1] }, w, eaves + foot, [{ u0: (w - door) / 2, u1: (w + door) / 2, v0: foot, v1: foot + high, depth: thick, back: material("shadow"), arch: "round" }], stone);
        solid.roof(x0 - m(0.2), z0, x1 + m(0.2), z1 + m(0.25), eaves, m(1.2), { ridge: "z", material: material("stone-dark"), gable: stone });

        // (Within, the dark of the way down; a skull set over the door)
        solid.box(x0 + thick, m(0.01), z0 + thick, x1 - thick, m(0.03), z1 - thick, material("shadow"));
        solid.box(cx - m(0.13), high + m(0.22), z1 - m(0.02), cx + m(0.13), high + m(0.48), z1 + m(0.12), material("bone"));

        for (const side of [-1, 1]) {
            solid.box(cx + side * m(0.065) - m(0.035), high + m(0.36), z1 + m(0.12), cx + side * m(0.065) + m(0.035), high + m(0.42), z1 + m(0.13), material("shadow"));
        }

        // (Ivy hanging over its front, from numbers of its own)
        ivyAlong(solid, createRandom(((piece.seed ?? 7) ^ 0x3c1) >>> 0), wallFace((u, y, v) => [x0 + u, y, z1 + v], [[0, eaves], [w, eaves]], 0, 0, 1, 0), w, { clear: [[(w - door) / 2 - m(0.2), (w + door) / 2 + m(0.2)]], chance: IVY.chance * 0.7 });
    },

    // A heap of fallen stone: a low mound, blocks tumbled over it every which way
    rubble(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = material(STONE[piece.people] ?? STONE.human);
        const r = m(part.r);

        solid.cone(cx, cz, -m(0.3), r * 0.5 + m(0.3), r, rubbleOf(piece.people), 7);

        for (let k = Math.round(4 + part.r * 4); k > 0; k--) {
            const a = random.range(0, Math.PI * 2);
            const out = Math.sqrt(random.next()) * r;

            tumbled(solid, random, [cx + Math.cos(a) * out, (1 - out / r) * r * 0.45, cz + Math.sin(a) * out], m(random.range(0.3, 0.7)), stone);
        }
    },

    // One of the Lantern Company, flattened where the Stone Golem caught them (core/setpieces/
    // neutral.js "ruined quarry"): a dark stain pressed into the ground; their bones crushed flat,
    // a ribcage's arcs splayed, a skull broken and long bones strewn; their cloak flat over them;
    // and what they carried, by who they were (`who`): a round shield beaten flat and a helm
    // crushed, a bow snapped and its arrows strewn, a mace and a holy book's loose pages, a staff
    // broken in two and a satchel; a boulder on one of them (`boulder`). Or burnt where they fell
    // (`burnt`: those who went to the Sundered Ring before, setpieces/scenes.js `challengers`): the
    // ground scorched black under them and their cloaks charred
    crushed(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const [ax, az] = [Math.cos(part.turn ?? 0), Math.sin(part.turn ?? 0)];
        // (A point `u` metres along them, `v` across and `y` up, as world pixels)
        const at = (u, y, v) => [cx + m(u) * ax - m(v) * az, m(y), cz + m(u) * az + m(v) * ax];
        // (The same on the ground, [x, z], for what's stood up on it)
        const ground = (u, v) => [cx + m(u) * ax - m(v) * az, cz + m(u) * az + m(v) * ax];
        const up = [0, 1, 0];
        const flat = (points, stuff) => solid.facing(points, up, material(stuff));
        const blot = (u, v, r, y, stuff, corners = 11) =>
            flat(
                Array.from({ length: corners }, (_, k) => {
                    const a = (k / corners) * Math.PI * 2;
                    const out = r * random.range(0.7, 1.15);

                    return at(u + Math.cos(a) * out * 1.25, y, v + Math.sin(a) * out);
                }),
                stuff,
            );
        const bone = material("bone");

        // (The stain, and the cloak flat over the middle of them)
        blot(0, 0, random.range(1, 1.3), 0.02, part.burnt ? "earth-sooty" : "mud-dark", 13);
        blot(random.range(-0.2, 0.2), random.range(-0.15, 0.15), 0.55, 0.035, part.burnt ? "timber-char" : ({ shield: "wool-blue", bow: "wool-green", mace: "linen", staff: "cloth-violet" }[part.who] ?? "linen"), 9);

        // (The ribcage, its arcs pressed flat and splayed out)
        for (let k = 0; k < 5; k++) {
            const u = (k - 2) * 0.17 + 0.25;
            const arc = Array.from({ length: 5 }, (_, i) => {
                const t = (i / 4) * Math.PI;

                return at(u + random.range(-0.03, 0.03), 0.06 + Math.sin(t) * 0.04, Math.cos(t) * random.range(0.32, 0.42));
            });

            solid.tube(arc, m(0.025), bone, { sides: 4 });
        }

        solid.tube([at(-0.35, 0.05, 0), at(0.75, 0.05, random.range(-0.06, 0.06))], m(0.035), bone, { sides: 5 });

        // (The skull, broken and flattened; the long bones of the arms and legs strewn)
        const [su, sv] = [0.95 + random.range(0, 0.15), random.range(-0.15, 0.15)];

        solid.lathe(...ground(su, sv), [[m(0.14), 0], [m(0.17), m(0.05)], [m(0.12), m(0.1)], [0, m(0.11)]], bone, { segments: 7 });

        for (let k = 0; k < 4; k++) {
            const [u, v] = [random.range(-0.9, 0.2), (k % 2 ? 1 : -1) * random.range(0.25, 0.55)];
            const a = random.range(-0.6, 0.6);

            solid.tube([at(u, 0.04, v), at(u + Math.cos(a) * 0.42, 0.04, v + Math.sin(a) * 0.42)], m(0.03), bone, { sides: 4 });
        }

        // (What they carried)
        if (part.who === "shield") {
            const [u, v] = [-0.2, random.pick([-1, 1]) * 0.75];

            solid.cylinder(...ground(u, v), 0, m(0.05), m(0.42), m(0.44), material("timber"), { segments: 12 });
            solid.cylinder(...ground(u, v), m(0.05), m(0.09), m(0.12), m(0.08), material("iron"), { segments: 8 });
            solid.tube([at(u - 0.38, 0.06, v - 0.1), at(u + 0.4, 0.06, v + 0.08)], m(0.015), material("shadow"), { sides: 3 });
            solid.lathe(...ground(0.9, -0.55), [[m(0.2), 0], [m(0.19), m(0.06)], [m(0.13), m(0.1)], [0, m(0.12)]], material("iron"), { segments: 9 });
        } else if (part.who === "bow") {
            for (const side of [-1, 1]) {
                solid.tube([at(0.1, 0.03, side * 0.6), at(0.5, 0.06, side * 0.75), at(0.85, 0.03, side * 0.7)], m(0.025), material("timber-light"), { sides: 4 });
            }

            for (let k = random.int(4, 7); k > 0; k--) {
                const [u, v, a] = [random.range(-1.1, 1.1), random.range(-1, 1), random.range(0, Math.PI)];
                const [tu, tv] = [u + Math.cos(a) * 0.55, v + Math.sin(a) * 0.55];

                solid.beam(at(u, 0.02, v), at(tu, 0.02, tv), m(0.02), m(0.02), material("timber-light"));
                solid.beam(at(tu, 0.02, tv), at(tu + Math.cos(a) * 0.06, 0.02, tv + Math.sin(a) * 0.06), m(0.04), m(0.03), material("iron"));
            }

            solid.turnedBox(...ground(-0.55, 0.45), m(0.1), m(0.32), 0, m(0.08), (part.turn ?? 0) + 0.4, material("leather"));
        } else if (part.who === "mace") {
            solid.beam(at(-0.5, 0.04, -0.6), at(0.05, 0.04, -0.75), m(0.04), m(0.04), material("timber"));
            solid.turnedBox(...ground(0.1, -0.77), m(0.1), m(0.1), 0, m(0.14), part.turn ?? 0, material("iron"));

            for (let k = random.int(5, 8); k > 0; k--) {
                const [u, v] = [random.range(-1.2, 1.2), random.range(-1.1, 1.1)];
                const a = random.range(0, Math.PI);
                const [du, dv] = [Math.cos(a) * 0.11, Math.sin(a) * 0.11];

                flat([at(u - du + dv * 0.7, 0.04, v - dv - du * 0.7), at(u + du + dv * 0.7, 0.04, v + dv - du * 0.7), at(u + du - dv * 0.7, 0.04, v + dv + du * 0.7), at(u - du - dv * 0.7, 0.04, v - dv + du * 0.7)], "parchment");
            }
        } else {
            const snap = random.range(-0.3, 0.3);

            solid.beam(at(-1.1, 0.04, 0.55), at(-0.1, 0.04, 0.62 + snap * 0.2), m(0.045), m(0.045), material("timber"));
            solid.beam(at(0.05, 0.04, 0.7 + snap * 0.2), at(0.8, 0.04, 0.95 + snap), m(0.045), m(0.045), material("timber"));
            solid.turnedBox(...ground(-0.6, -0.55), m(0.2), m(0.15), 0, m(0.12), (part.turn ?? 0) - 0.3, material("leather"));
        }

        // (A boulder the golem threw, come down on one of them)
        if (part.boulder) {
            tumbled(solid, random, at(random.range(-0.3, 0.3), 0.35, random.range(-0.2, 0.2)), m(random.range(1.1, 1.4)), material(STONE[piece.people] ?? STONE.human), { lean: 0.2 });
        }
    },

    // A quarry's crane thrown down (core/setpieces/neutral.js "ruined quarry"): its two legs lying
    // across the floor, one snapped, its windlass broken and its rope trailing, its pulley in the
    // dirt, the block it was winding up fallen beside it
    fallenCrane(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const [ax, az] = [Math.cos(part.turn ?? 0), Math.sin(part.turn ?? 0)];
        const at = (u, y, v) => [cx + m(u) * ax - m(v) * az, m(y), cz + m(u) * az + m(v) * ax];
        const timber = material("timber-grey");
        const snap = random.range(0.4, 0.9);

        solid.beam(at(-3.6, 0.15, -0.4), at(3.2, 0.15, 0.3), m(0.24), m(0.24), timber);
        solid.beam(at(-3.4, 0.15, 0.7), at(-0.2, 0.15, 0.6), m(0.24), m(0.24), timber);
        solid.beam(at(0.1, 0.15, 0.75), at(2.6, 0.2 + snap * 0.4, 0.75 + snap), m(0.24), m(0.24), timber);
        solid.beam(at(2.4, 0.12, -0.9), at(3.3, 0.12, -0.5), m(0.18), m(0.3), material("iron"));
        solid.tube([at(-3.6, 0.06, -0.3), at(-2.4, 0.05, -1.3), at(-0.6, 0.05, -1.6), at(0.6, 0.05, -1)], m(0.04), material("rope"), { sides: 4 });

        for (const side of [-1, 1]) {
            solid.beam(at(-3.1, 0.1, side * 0.9 + 0.2), at(-2.6, 0.1, side * 1.2 + 0.2), m(0.16), m(0.16), timber);
        }

        tumbled(solid, random, at(random.range(-1, 1), 0.3, random.range(1.5, 2)), m(0.8), material("rock"), { lean: 0.15 });
    },

    // Bones: a ribcage's arcs and a skull; a beast's, bigger
    bones(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const bone = material("bone");
        const s = part.big ? 2.6 : 1;
        const [ax, az] = [Math.cos(part.turn), Math.sin(part.turn)];

        for (let k = 0; k < 5; k++) {
            const along = (k - 2) * m(0.28) * s;
            const [bx, bz] = [cx + ax * along, cz + az * along];
            const arc = Array.from({ length: 5 }, (_, i) => {
                const t = (i / 4) * Math.PI;

                return [bx - az * Math.cos(t) * m(0.5) * s, Math.sin(t) * m(0.55) * s, bz + ax * Math.cos(t) * m(0.5) * s];
            });

            solid.tube(arc, m(0.04) * s, bone, { sides: 4 });
        }

        solid.tube([[cx - ax * m(0.8) * s, m(0.06) * s, cz - az * m(0.8) * s], [cx + ax * m(0.8) * s, m(0.06) * s, cz + az * m(0.8) * s]], m(0.06) * s, bone, { sides: 5 });
        solid.lathe(cx + ax * m(1.1) * s, cz + az * m(1.1) * s, [[m(0.18) * s, 0], [m(0.24) * s, m(0.14) * s], [m(0.16) * s, m(0.3) * s], [0, m(0.34) * s]], bone, { segments: 8 });
    },

    // A watchtower no one keeps: its wall crumbled round its top (kits/decay.js), a dark doorway,
    // its fallen stone in it and round its foot
    brokenTower(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = material(STONE[piece.people] ?? STONE.human);
        const r = m(part.r);
        const heights = brokenRim(random, 24, 2 * Math.PI * r, m(part.h * 0.4), m(part.h), { stone: m(0.7), course: m(0.32) });

        crumbledRing(solid, cx, cz, [r * 0.8, r], -m(FOOTING), heights, stone, { core: material(CORE) });
        solid.cylinder(cx, cz, -m(FOOTING), m(0.1), r * 0.8, r * 0.8, material("cobbles"), { segments: 12 });
        // (Ivy round it, clear of its doorway, a quarter of the way round)
        ivyAlong(solid, createRandom(((part.seed ?? 1) ^ 0x1c7) >>> 0), ringFace(cx, cz, r, 0, heights), 2 * Math.PI * r, { clear: [[(Math.PI / 2) * r - m(0.6), (Math.PI / 2) * r + m(0.6)]] });
        solid.face([[cx - m(0.55), 0, cz + r + m(0.06)], [cx + m(0.55), 0, cz + r + m(0.06)], [cx + m(0.55), m(1.7), cz + r + m(0.06)], [cx, m(2.1), cz + r + m(0.06)], [cx - m(0.55), m(1.7), cz + r + m(0.06)]], material("shadow"));

        for (let k = random.int(3, 5); k > 0; k--) {
            const a = random.next() * Math.PI * 2;
            const out = random.range(0, 0.6) * r;

            tumbled(solid, random, [cx + Math.cos(a) * out, m(0.3), cz + Math.sin(a) * out], m(random.range(0.5, 0.9)), stone);
        }

        for (let k = random.int(3, 6); k > 0; k--) {
            const a = random.next() * Math.PI * 2;
            const out = r + m(random.range(0.4, 1.6));

            tumbled(solid, random, [cx + Math.cos(a) * out, m(0.2), cz + Math.sin(a) * out], m(random.range(0.4, 0.8)), stone);
        }
    },

    // The timbers of a house fallen in (a ruined castle's): charred posts, beams across the heap
    timbers(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);

        fallenTimbers(solid, random, [cx, m(0.4), cz], m(part.r));
    },

    // What was kept here, left: barrels whole, tipped over and burst, a crate or two
    stores(solid, piece, random) {
        const [cx, cz] = middleOf(piece);

        for (let k = random.int(2, 4); k > 0; k--) {
            oldBarrel(solid, random, [cx + m(random.range(-0.9, 0.9)), 0, cz + m(random.range(-0.9, 0.9))]);
        }

        for (let k = random.int(0, 2); k > 0; k--) {
            oldCrate(solid, random, [cx + m(random.range(-0.8, 0.8)), 0, cz + m(random.range(-0.8, 0.8))], m(random.range(0.6, 0.9)), random.next() * Math.PI);
        }
    },

    // A cart left on one wheel
    cart(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);

        brokenCart(solid, random, [cx, 0, cz], part.turn ?? 0);
    },

    // A pentagram scorched into the ground, a hell's portal standing in its middle (a cult's camp:
    // setpieces/neutral.js HELL_CAMP): a ring, a thinner ring within it, and the star's five lines
    // from point to point, one point to the back; each line burnt black into the earth, ragged at
    // its edges, the earth either side of it charred to ash, and smouldering red at night
    // (SMOULDERS `scorch`). Lying a little over the ground, which is levelled under it
    pentagram(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const { lift, line, charred, inner, thin, ash } = CAMP.scorch;
        const [low, high] = lift.map(m);
        const [burnt, earth] = [smoulder("scorch"), material("earth-sooty")];
        const r = m(part.r);
        // (The star's points round the ring, the first at the back, as its candles stand at them)
        const points = Array.from({ length: 5 }, (_, k) => {
            const a = Math.PI + part.turn + (k / 5) * Math.PI * 2;

            return [cx + Math.sin(a) * r, cz + Math.cos(a) * r];
        });
        // (Round a ring, `out` from the middle, at each of its corners)
        const round = (out) =>
            Array.from({ length: CAMP.sides }, (_, k) => {
                const a = (k / CAMP.sides) * Math.PI * 2;

                return [cx + Math.cos(a) * out, cz + Math.sin(a) * out];
            });
        // (From a to b, in so many steps)
        const straight = (a, b, steps) => Array.from({ length: steps + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
        // (A ragged strip along the ground through `path` ([x, z] points, round and closed if
        // `closed`), out to either side of it at each point as far as `half` (metres, from and to)
        // gives, each side its own; `tone` its colour)
        const strip = (path, half, y, stuff, tone, closed = false) => {
            const n = path.length;
            const edges = path.map(([x, z], k) => {
                const [before, after] = closed ? [path[(k + n - 1) % n], path[(k + 1) % n]] : [path[Math.max(0, k - 1)], path[Math.min(n - 1, k + 1)]];
                const [dx, dz] = [after[0] - before[0], after[1] - before[1]];
                const length = Math.hypot(dx, dz);
                const [left, right] = [m(random.range(...half)), m(random.range(...half))];

                return [[x + (dz / length) * left, y, z - (dx / length) * left], [x - (dz / length) * right, y, z + (dx / length) * right]];
            });

            for (let k = 0; k < (closed ? n : n - 1); k++) {
                const j = (k + 1) % n;

                solid.facing([edges[k][0], edges[j][0], edges[j][1], edges[k][1]], [0, 1, 0], stuff, undefined, tone);
            }
        };
        const lines = [
            ...points.map((point, k) => ({ path: straight(point, points[(k + 2) % 5], 6), wide: line, closed: false })),
            { path: round(r), wide: line, closed: true },
            { path: round(r - m(inner)), wide: thin, closed: true },
        ];

        // (The ash round each line, then the burnt line on it)
        for (const { path, wide, closed } of lines) {
            strip(path, [wide / 2 + charred[0], wide / 2 + charred[1]], low, earth, ash, closed);
        }

        for (const { path, wide, closed } of lines) {
            strip(path, [wide * 0.35, wide * 0.65], high, burnt, null, closed);
        }
    },

    // A cluster of candles at a point of a pentagram (a hell's camp's), short and thick, of tallow,
    // standing in a pool of their own wax, the wax run down to their feet; lit only at night
    // (world/fire.js FIRES `candle-night`), the tallest's light lighting what's round them for
    // them all (lights.js LIGHTS `candles-night`), cold by day
    candles(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const { tall, thick } = CAMP.candles;
        const pool = Array.from({ length: 7 }, (_, k) => {
            const [a, out] = [(k / 7) * Math.PI * 2, m(random.range(0.2, 0.32))];

            return [cx + Math.cos(a) * out, m(0.015), cz + Math.sin(a) * out];
        });
        const stood = Array.from({ length: part.count }, (_, k) => {
            const [a, out] = [(k / part.count) * Math.PI * 2 + random.range(-0.4, 0.4), m(random.range(0.08, 0.17))];

            return { x: cx + Math.cos(a) * out, z: cz + Math.sin(a) * out, h: m(random.range(...tall)), r: m(random.range(...thick)), wax: random.chance(0.35) ? "parchment" : "candle" };
        });

        solid.tone = null;
        solid.facing([[cx, m(0.015), cz], ...pool, pool[0]], [0, 1, 0], material("candle"));

        for (const [k, { x, z, h, r, wax }] of stood.sort((a, b) => b.h - a.h).entries()) {
            solid.lathe(x, z, [[r * 1.6, 0], [r, m(0.05)], [r, h], [0, h]], material(wax), { segments: k ? 4 : 5 });
            fireLight(solid, [x, h + m(0.01), z], k ? "candle-night" : "candles-night");
        }
    },

    // A hell's way in standing in the open (a cult's camp's, in its pentagram's middle): two
    // pillars of rough dark stone, each two great blocks one on the other, an arch of rough stones
    // over them, its keystone standing proud and horns of bone curving up from its shoulders;
    // runes cut in its stones, glowing like coals at night; and in it the veil, swirling red and
    // gold at night and lighting the camp red (veil.js openVeil, lights.js LIGHTS `hellgate`), by
    // day dark and still and the stone cold. Its face to the front, where it's gone into, a worn
    // step before it
    hellgate(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = material("rock-dark");
        const [w, h, p] = [m(part.w), m(part.h), m(part.pillar)];
        const [inner, outer, spring] = [w / 2, w / 2 + p, h - w / 2];
        const [front, back] = [cz + p / 2, cz - p / 2];
        // (Where its runes are cut: [x, y, z, turn])
        const runes = [];

        solid.tone = weathered(random.int(1, 1e6), { moss: 0.1, dirt: 0.5 });

        // (Its pillars, each a block hewn roughly square and a shorter one on it, a little askew,
        // neither into the opening)
        for (const side of [-1, 1]) {
            const px = cx + side * (inner + p / 2);
            const split = spring * random.range(0.5, 0.62);

            for (const [y0, y1, grow, cut] of [[-m(FOOTING), split, 1.04, split * 0.55], [split, spring, 0.96, (split + spring) / 2]]) {
                const [ox, oz] = [side * random.range(0, 0.05) * p, random.range(-0.05, 0.05) * p];
                const batter = m(0.03);

                solid.extrude(hewn(random, px + ox, cz + oz, (p / 2) * grow), y0, y1, stone, { batter });
                // (A rune on its face, which leans in as it rises)
                runes.push([px + ox, cut, cz + oz + (p / 2) * grow - (batter * (cut - y0)) / (y1 - y0), 0]);
            }
        }

        // (The arch's stones round the opening's head, as deep as the pillars, each rough-cut: its
        // face and its back, the soffit under it, its top, and the joints between them)
        for (let k = 0; k < CAMP.arch.stones; k++) {
            const [a0, a1] = [(k / CAMP.arch.stones) * Math.PI + 0.012, ((k + 1) / CAMP.arch.stones) * Math.PI - 0.012];
            const key = k === (CAMP.arch.stones - 1) / 2;
            const reach = outer + (key ? m(CAMP.arch.keystone) : m(random.range(-0.08, 0.1)));
            const ring = [[a0, inner], [a1, inner], [a1, reach], [a0, reach]].map(([a, out]) => [cx + Math.cos(a) * out, spring + Math.sin(a) * out]);
            const [mx, my] = [ring.reduce((sum, [x]) => sum + x / 4, 0), ring.reduce((sum, [, y]) => sum + y / 4, 0)];
            const face = front + (key ? m(0.08) : m(random.range(-0.03, 0.03)));

            solid.facing(ring.map(([x, y]) => [x, y, face]), [0, 0, 1], stone);
            solid.facing(ring.map(([x, y]) => [x, y, back]), [0, 0, -1], stone);

            for (let i = 0; i < 4; i++) {
                const [[xa, ya], [xb, yb]] = [ring[i], ring[(i + 1) % 4]];

                solid.facing([[xa, ya, face], [xb, yb, face], [xb, yb, back], [xa, ya, back]], [(xa + xb) / 2 - mx, (ya + yb) / 2 - my, 0], stone);
            }

            runes.push([mx, my, face, (a0 + a1) / 2 - Math.PI / 2]);
        }

        // (Horns of bone curving up and out from its shoulders, and in again at their tips)
        for (const side of [-1, 1]) {
            const [rx, ry] = [cx + side * Math.cos(Math.PI / 4) * outer, spring + Math.sin(Math.PI / 4) * outer];
            const curve = [[0, -0.15], [0.35, 0.25], [0.45, 0.75], [0.25, 1.2]].map(([out, up]) => [rx + side * m(out), ry + m(up), cz]);

            solid.tube(curve, [m(0.17), m(0.14), m(0.08), 0], material("bone"), { sides: 5 });
        }

        // (The runes, glowing at night: each a stave, and a branch or two struck off it slantwise
        // from above its middle, to one side or both, as the old runes are cut)
        const stroke = ([x, y, z], long, angle) => {
            const [c, s, wide] = [Math.cos(angle), Math.sin(angle), m(0.022)];

            solid.facing([[-wide, -long / 2], [wide, -long / 2], [wide, long / 2], [-wide, long / 2]].map(([u, v]) => [x + u * c - v * s, y + u * s + v * c, z + m(0.015)]), [0, 0, 1], smoulder("runes"), undefined, null);
        };

        for (const [x, y, z, turn] of runes) {
            const [long, from] = [m(0.26), random.range(0.05, 0.3)];
            const [up, way] = [[-Math.sin(turn), Math.cos(turn)], random.pick([-1, 1])];

            stroke([x, y, z], long, turn);

            for (const side of random.chance(0.4) ? [-1, 1] : [way]) {
                const angle = turn + side * random.range(0.6, 0.9);
                const [bx, by] = [x + up[0] * long * from - Math.sin(angle) * m(0.07), y + up[1] * long * from + Math.cos(angle) * m(0.07)];

                stroke([bx, by, z], m(0.14), angle);
            }
        }

        // (The veil, in the pillars' middle, filling the opening: its legs, and its head a fan;
        // its texture coordinates the guild's veil's, so its swirl and its rim fit the opening)
        const veil = openVeil("hell");
        const shaped = ([x, y]) => [((x - cx) / inner) * m(0.8), y <= spring ? (y / spring) * m(1.75) : m(1.75) + ((y - spring) / inner) * m(0.8)];
        const sheet = (outline) => solid.face(outline.map(([x, y]) => [x, y, cz]), veil, outline.map(shaped), null);

        sheet([[cx - inner, -m(0.1)], [cx + inner, -m(0.1)], [cx + inner, spring], [cx - inner, spring]]);
        sheet([[cx, spring], ...Array.from({ length: 11 }, (_, k) => [cx + Math.cos((k / 10) * Math.PI) * inner, spring + Math.sin((k / 10) * Math.PI) * inner])]);

        // (Its worn step, and its light, red as its veil, before it)
        solid.box(cx - outer, -m(0.3), front, cx + outer, m(0.08), front + m(0.55), stone);
        fireLight(solid, [cx, spring - m(0.3), front + m(0.4)], "hellgate");
    },

    // The rift the wizard Sinclair tore in the air by the Tower of Sar Mordal (setpieces/neutral.js
    // "rift tower"): a tear in the air standing over the ground, its foot `lift` metres up, as tall
    // and as wide as it's torn (`tall`, `wide`), its edges ragged and bent a little as torn cloth
    // is, the swirl of the Behemoth's green in it, day and night (veil.js openVeil "rift"), a ragged
    // rim glowing round it; its face to the south and the north, and lighting the land round it
    // green at night (lights.js LIGHTS `riftTear`). Its veil's texture coordinates the guild's veil's
    // (its eye 1.35 m up a tear 2.2 m tall and 1.05 wide), the tear drawn as much bigger
    riftTear(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const [tall, wide, eye, points] = [2.2, 1.05, 1.35, 12];
        const scale = part.tall / tall;
        const foot = eye - tall / 2;
        const edge = [];

        // (Up its right side and down its left, ragged, bent a little: the veil's own metres)
        for (const side of [1, -1]) {
            for (let k = side > 0 ? 0 : points - 1; side > 0 ? k <= points : k >= 1; k += side > 0 ? 1 : -1) {
                const t = k / points;
                const half = (wide / 2) * Math.sin(Math.PI * t) ** 0.7 * (k % 2 ? 1 : random.range(0.55, 0.9)) * (part.wide / (wide * scale));
                const bend = 0.14 * Math.sin(Math.PI * 2 * t + 0.6);

                edge.push([bend + side * half, foot + t * tall]);
            }
        }

        // (Where a point of the veil's is, in the world's pixels: across the tear, up from its foot)
        const at = ([x, y]) => [cx + m(x * scale), m(part.lift + (y - foot) * scale), cz];
        const veil = openVeil("rift");
        const rim = material("glow-green");
        const middle = [0, eye];

        edge.forEach((point, k) => {
            const next = edge[(k + 1) % edge.length];

            solid.face([middle, point, next].map(at), veil, [middle, point, next].map(([x, y]) => [m(x), m(y)]), null);

            // (Its rim, out from its edge as far as it's ragged)
            const [tx, ty] = [next[0] - point[0], next[1] - point[1]];
            const length = Math.hypot(tx, ty) || 1;
            const out = random.range(0.05, 0.16);
            const [ox, oy] = [(ty / length) * out, (-tx / length) * out];

            for (const side of [1, -1]) {
                solid.facing([point, next, [next[0] + ox, next[1] + oy], [point[0] + ox, point[1] + oy]].map(at).map(([x, y, z]) => [x, y, z + side * m(0.01)]), [0, 0, side], rim, undefined, null);
            }
        });

        fireLight(solid, [cx, m(part.lift + (eye - foot) * scale), cz + m(0.6)], "riftTear");
    },

    // A sharpened stake driven into the ground round a hell's camp, leaning a little, a skull
    // spitted on its point mostly, looking out the way the camp's come at
    stake(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const h = m(part.h);
        const [lx, lz] = [Math.tan(part.lean), random.range(-0.06, 0.06)];
        const along = (y) => [cx + lx * y, y, cz + lz * y];

        solid.tube([along(-m(0.6)), along(h - m(0.32)), along(h)], [m(0.06), m(0.055), 0], material(random.pick(["timber-grey", "deadwood", "timber"])), { sides: 5, smooth: false });

        if (part.skull) {
            skull(solid, along(h - m(0.36)), random.range(-0.5, 0.5), 1.4);
        }
    },

    // One of a cult's hovels round its camp (a hell's way in), its front to the ring (`turn`):
    // ramshackle, of whatever they took or found. A hut: poles at its corners, walls of old planks
    // patched with hides, a dark doorway in its front with a hide hung half across it, a crooked
    // roof of hides or old thatch on a ridge pole, poles crossed over its gables. Or a lean-to,
    // its roof sloping down to its back from poles at its front, open to the ring, dark within
    hovel(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const [w, d, h] = [m(part.w), m(part.d), m(part.h)];
        const [fx, fz] = [Math.sin(part.turn), Math.cos(part.turn)];
        // (Across it, up, and towards its front)
        const at = (u, y, v) => [cx + fz * u + fx * v, y, cz - fx * u + fz * v];
        const pole = material(random.pick(["timber-grey", "timber-char", "deadwood"]));
        const boards = material(random.pick(["planks-dark", "planks-char", "timber-grey"]));
        const roofing = material(random.pick(["hide-dark", "thatch-grey", "hide-dark", "hide"]));
        const [hw, hd] = [w / 2, d / 2];
        const foot = -m(0.4);
        // (Dark within: what's seen of its insides from the open front; and its roof darkened by
        // the smoke of its fire)
        const gloom = [0.3, 0.28, 0.27];
        const smoked = [0.68, 0.64, 0.6];

        solid.tone = weathered(random.int(1, 1e6), { moss: 0.12, dirt: 0.45 });

        if (random.chance(0.35)) {
            // A lean-to: high at its open front, low at its back
            const [high, low] = [h, h * random.range(0.42, 0.52)];
            const roofAt = (v) => low + ((high - low) * (v + hd)) / d;
            const sag = m(random.range(0.05, 0.15));

            for (const side of [-1, 1]) {
                solid.beam(at(side * (hw - m(0.08)), foot, hd - m(0.08)), at(side * (hw - m(0.08)) + m(random.range(-0.08, 0.08)), high + m(0.15), hd - m(0.05)), m(0.12), m(0.12), pole, { ends: false });

                // (Its side, inside and out)
                const wall = [at(side * hw, foot, -hd), at(side * hw, foot, hd), at(side * hw, roofAt(hd) - m(0.1), hd), at(side * hw, roofAt(-hd), -hd)];

                solid.facing(wall, [side * fz, 0, -side * fx], boards);
                solid.facing(wall, [-side * fz, 0, side * fx], boards, undefined, gloom);
            }

            const backWall = [at(-hw, foot, -hd), at(hw, foot, -hd), at(hw, low, -hd), at(-hw, low, -hd)];

            solid.facing(backWall, [-fx, 0, -fz], boards);
            solid.facing(backWall, [fx, 0, fz], boards, undefined, gloom);

            // (Its roof, sagging between its sides, over the eaves a little, its underside dark; held
            // down)
            const roof = [at(-hw - m(0.2), low - m(0.08), -hd - m(0.25)), at(hw + m(0.2), low - m(0.05), -hd - m(0.25)), at(hw + m(0.25), high + m(0.05), hd + m(0.3)), at(0, high - sag, hd + m(0.3)), at(-hw - m(0.25), high, hd + m(0.3))];

            solid.facing(roof, [0, 1, 0], roofing, undefined, smoked);
            solid.facing(roof, [0, -1, 0], roofing, undefined, gloom);
            heldDown(solid, random, [roof[2], roof[4], roof[0], roof[1]], 3, pole);
            hidePatch(solid, random, at, [-hw, hw], -hd - m(0.01), [m(0.2), low - m(0.2)], [-fx, -fz]);

            return;
        }

        // A hut: its eaves front and back, its ridge across it, crooked
        const eaves = h * random.range(0.58, 0.66);
        const ridge = [h + m(random.range(-0.15, 0.1)), h + m(random.range(-0.15, 0.1))];
        const lean = m(random.range(-0.2, 0.2));

        for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            solid.beam(at(i * (hw - m(0.06)), foot, j * (hd - m(0.06))), at(i * (hw - m(0.06)) + m(random.range(-0.06, 0.06)), eaves + m(0.1), j * (hd - m(0.06))), m(0.12), m(0.12), pole, { ends: false });
        }

        // (Its walls: the back, the gabled sides, and the front with its doorway)
        solid.facing([at(-hw, foot, -hd), at(hw, foot, -hd), at(hw, eaves, -hd), at(-hw, eaves, -hd)], [-fx, 0, -fz], boards);

        for (const [k, side] of [-1, 1].entries()) {
            solid.facing([at(side * hw, foot, -hd), at(side * hw, foot, hd), at(side * hw, eaves, hd), at(side * hw, ridge[k] - m(0.1), lean), at(side * hw, eaves, -hd)], [side * fz, 0, -side * fx], boards);
        }

        const door = { wide: m(random.range(0.75, 0.95)), high: Math.min(eaves - m(0.25), m(1.75)) };
        const doorAt = random.range(-0.25, 0.25) * (w - door.wide);

        solid.wall({ origin: at(-hw, foot, hd), across: [fz, 0, -fx], out: [fx, 0, fz] }, w, eaves - foot, [{ u0: hw + doorAt - door.wide / 2, u1: hw + doorAt + door.wide / 2, v0: -foot, v1: -foot + door.high, depth: m(0.15), back: material("shadow") }], boards);

        // (A hide hung half across its doorway)
        const hung = random.pick([-1, 1]);

        solid.facing([at(doorAt + hung * door.wide * 0.55, door.high + m(0.08), hd + m(0.04)), at(doorAt - hung * door.wide * 0.05, door.high + m(0.08), hd + m(0.04)), at(doorAt + hung * door.wide * 0.1, m(0.1), hd + m(0.12)), at(doorAt + hung * door.wide * 0.55, m(0.05), hd + m(0.05))], [fx, 0, fz], material("hide-dark"));

        // (Its roof, over the eaves and the gables, sagging between them, its underside dark; held
        // down)
        const over = [-hw - m(random.range(0.25, 0.4)), hw + m(random.range(0.25, 0.4))];
        const sag = m(random.range(0.08, 0.2));
        const ridgeAt = [at(over[0], ridge[0], lean), at((over[0] + over[1]) / 2, (ridge[0] + ridge[1]) / 2 - sag, lean), at(over[1], ridge[1], lean)];
        const eavesAt = (j) => [at(over[0], eaves - m(0.15), j * (hd + m(0.35))), at((over[0] + over[1]) / 2, eaves - m(0.18) - sag, j * (hd + m(0.35))), at(over[1], eaves - m(0.21), j * (hd + m(0.35)))];

        for (const j of [-1, 1]) {
            for (const k of [0, 1]) {
                const slope = [ridgeAt[k], ridgeAt[k + 1], eavesAt(j)[k + 1], eavesAt(j)[k]];

                solid.facing(slope, [j * fx, 1, j * fz], roofing, undefined, smoked);
                solid.facing(slope.map(([x, y, z]) => [x, y - m(0.1), z]), [-j * fx, -1, -j * fz], roofing, undefined, gloom);
                heldDown(solid, random, slope, 1, pole);
            }
        }

        // (The ridge pole, sagging with it, and poles crossed over each gable, standing past it)
        const past = (point, side) => [point[0] + side * fz * m(0.25), point[1] + m(0.08), point[2] - side * fx * m(0.25)];

        solid.beam(past(ridgeAt[0], -1), [ridgeAt[1][0], ridgeAt[1][1] + m(0.08), ridgeAt[1][2]], m(0.12), m(0.12), pole);
        solid.beam([ridgeAt[1][0], ridgeAt[1][1] + m(0.08), ridgeAt[1][2]], past(ridgeAt[2], 1), m(0.12), m(0.12), pole);

        for (const [k, side] of [-1, 1].entries()) {
            for (const j of [-1, 1]) {
                const from = at(side * (hw + m(0.05)), eaves - m(0.2), j * (hd + m(0.1)));
                const to = at(side * (hw + m(0.05)), ridge[k] + m(0.45), lean - j * m(0.35));

                solid.beam(from, to, m(0.09), m(0.09), pole, { ends: false });
            }
        }

        hidePatch(solid, random, at, [-hw, hw], -hd - m(0.01), [m(0.3), eaves - m(0.2)], [-fx, -fz]);

        // (A skull over its door, now and then)
        if (random.chance(0.4)) {
            skull(solid, at(doorAt, door.high + m(0.12), hd + m(0.08)), part.turn, 0.9);
        }
    },

    // A cage for the cult's captives, of poles lashed together with rope: posts at its corners,
    // rails round its foot and its top, its bars a hand or so apart, a pole or two across its top;
    // straw on its floor, and in it bones, or the slumped shape of one who died in it
    cage(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const [fx, fz] = [Math.sin(part.turn), Math.cos(part.turn)];
        const at = (u, y, v) => [cx + fz * u + fx * v, y, cz - fx * u + fz * v];
        const pole = material(random.pick(["timber-grey", "deadwood"]));
        const [half, high] = [m(CAMP.cage.wide / 2), m(CAMP.cage.high)];
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

        solid.tone = weathered(random.int(1, 1e6), { moss: 0.1, dirt: 0.4 });

        for (const [i, j] of corners) {
            solid.beam(at(i * half, -m(0.4), j * half), at(i * half + m(random.range(-0.05, 0.05)), high + m(0.1), j * half + m(random.range(-0.05, 0.05))), m(0.11), m(0.11), pole);
        }

        for (let k = 0; k < 4; k++) {
            const [[i0, j0], [i1, j1]] = [corners[k], corners[(k + 1) % 4]];
            const side = (t, y) => at(half * (i0 + (i1 - i0) * t), y, half * (j0 + (j1 - j0) * t));

            solid.beam(side(0, m(0.15)), side(1, m(0.15)), m(0.08), m(0.08), pole, { ends: false });
            solid.beam(side(0, high - m(0.08)), side(1, high - m(0.08)), m(0.08), m(0.08), pole, { ends: false });

            for (let b = 1; b <= CAMP.cage.bars; b++) {
                const t = b / (CAMP.cage.bars + 1) + random.range(-0.04, 0.04);

                solid.beam(side(t, m(0.1)), side(t + random.range(-0.03, 0.03), high - m(0.04)), m(0.06), m(0.06), pole, { ends: false });
            }
        }

        // (Poles across its top; and the rope lashing its corners, only worth drawing near)
        for (const v of [-0.3, 0.35]) {
            solid.beam(at(-half - m(0.1), high + m(0.02), half * v), at(half + m(0.1), high + m(0.02), half * v + m(random.range(-0.1, 0.1))), m(0.07), m(0.07), pole);
        }

        solid.near(() => {
            for (const [i, j] of corners) {
                const [x, , z] = at(i * half, 0, j * half);

                solid.box(x - m(0.08), high - m(0.18), z - m(0.08), x + m(0.08), high + m(0.02), z + m(0.08), material("rope"));
            }
        });

        // (Straw on its floor)
        const straw = Array.from({ length: 6 }, (_, k) => {
            const a = (k / 6) * Math.PI * 2;

            return at(Math.cos(a) * half * random.range(0.6, 0.9), m(0.03), Math.sin(a) * half * random.range(0.6, 0.9));
        });

        solid.facing([at(0, m(0.03), 0), ...straw, straw[0]], [0, 1, 0], material("thatch-grey"));

        if (random.chance(0.5)) {
            // (One who died in it, slumped in rags against its back, the head fallen forward)
            const [bx, , bz] = at(m(random.range(-0.3, 0.3)), 0, -half + m(0.34));
            const [hx, , hz] = at(m(random.range(-0.3, 0.3)) * 0.2, 0, -half + m(0.5));

            solid.lathe(bx, bz, [[m(0.3), 0], [m(0.31), m(0.2)], [m(0.21), m(0.48)], [m(0.1), m(0.6)], [0, m(0.62)]], material(random.pick(["canvas-sack", "fur"])), { segments: 6 });
            solid.lathe(hx, hz, [[m(0.08), m(0.52)], [m(0.11), m(0.62)], [0, m(0.74)]], material(random.pick(["fur", "leather"])), { segments: 5 });

            return;
        }

        // (Or the bones of one: a skull, and long bones about it)
        skull(solid, at(m(random.range(-0.3, 0.3)), 0, m(random.range(-0.3, 0.3))), random.range(0, Math.PI * 2));

        for (let k = random.int(2, 3); k > 0; k--) {
            const [a, u, v] = [random.range(0, Math.PI), m(random.range(-0.4, 0.4)), m(random.range(-0.4, 0.4))];
            const [du, dv] = [Math.cos(a) * m(0.22), Math.sin(a) * m(0.22)];

            solid.tube([at(u - du, m(0.04), v - dv), at(u + du, m(0.04), v + dv)], m(0.025), material("bone"), { sides: 4 });
        }
    },

    // A graveyard's wall of field stone, laid dry, its top uneven where stones have come off
    // (grey: the humans' the land's granite, not the ruins' old dark stone)
    lowWall(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = piece.people && piece.people !== "human" ? rubbleOf(piece.people) : material("granite");
        const [w, d] = [m(part.x1 - part.x0), m(part.y1 - part.y0)];
        const alongX = w >= d;
        const [length, thick] = alongX ? [w, d] : [d, w];
        // (Narrowing as it rises, as a wall of field stone laid dry is built: GRAVE.batter)
        const narrow = (y, v) => v * (1 - (GRAVE.batter * Math.max(0, y)) / m(1));
        const at = alongX ? (u, y, v) => [cx + u, y, cz + narrow(y, v)] : (u, y, v) => [cx + narrow(y, v), y, cz + u];
        const top = brokenTop(random, length, m(part.h * 0.6), m(part.h), { stone: m(1.1), course: m(0.15), breaches: 0.06 });

        crumbledWall(solid, at, top, -length / 2, [-thick / 2, thick / 2], -m(0.4), stone, { core: stone });
    },

    // A pier either side of a graveyard's way in: squared stone, a cap stepping out over it, a
    // low pyramid on that
    gatepost(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = stoneOf(piece.people);
        const [r, h] = [m(part.w ?? 0.5) / 2, m(part.h)];

        solid.tone = lichened(part.seed ?? 5, northOf(piece), headstoneOf(piece.people));
        solid.box(cx - r, -m(0.4), cz - r, cx + r, h, cz + r, stone);
        solid.box(cx - r - m(0.06), h, cz - r - m(0.06), cx + r + m(0.06), h + m(0.12), cz + r + m(0.06), stone);
        solid.pyramid(cx - r * 0.8, cz - r * 0.8, cx + r * 0.8, cz + r * 0.8, h + m(0.12), r * 0.9, stone);
    },

    // An iron gate hung from its pier at the way in (its hinge where the piece stands): bars
    // between two rails, swung in and left so; or come off its hinges and lying flat inside
    gate(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const iron = material("iron-black");
        const [wide, high, bar, rail] = [m(part.wide), m(1.25), m(0.014), m(0.022)];
        const count = Math.round(part.wide / 0.16);
        // (Closed, it runs from its hinge to the way in's middle; the yard's behind the front, north
        // in the layout)
        const shut = part.hand < 0 ? 0 : Math.PI;

        if (part.fallen) {
            const a = shut + random.range(-0.4, 0.4);
            const [ux, uz] = [Math.cos(a), Math.sin(a)];
            const [vx, vz] = uz > 0 ? [uz, -ux] : [-uz, ux];
            const [ox, oz] = [cx, cz - m(0.4)];

            for (let k = 0; k <= count; k++) {
                const u = (k / count) * wide;

                solid.turnedBox(ox + ux * u + (vx * high) / 2, oz + uz * u + (vz * high) / 2, high / 2, bar, m(0.01), m(0.04), Math.atan2(vz, vx), iron);
            }

            for (const v of [m(0.15), high - m(0.05)]) {
                solid.turnedBox(ox + (ux * wide) / 2 + vx * v, oz + (uz * wide) / 2 + vz * v, wide / 2, rail, m(0.01), m(0.05), a, iron);
            }

            return;
        }

        const a = part.hand < 0 ? -part.open : Math.PI + part.open;
        const [ux, uz] = [Math.cos(a), Math.sin(a)];

        for (let k = 0; k <= count; k++) {
            const u = (k / count) * wide;

            solid.turnedBox(cx + ux * u, cz + uz * u, bar, bar, m(0.05), high + (k % 2 ? m(0.08) : 0), a, iron);
        }

        for (const y of [m(0.15), high - m(0.06)]) {
            solid.turnedBox(cx + (ux * wide) / 2, cz + (uz * wide) / 2, wide / 2, rail, y, y + m(0.05), a, iron);
        }
    },

    // A path of flagstones: in rows across it, one or two to a row, of different lengths, each set
    // a little off true and standing a little proud; one gone here and there, the ground showing
    flags(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = stoneOf(piece.people);
        const [w, d] = [part.x1 - part.x0, part.y1 - part.y0];

        for (let v = 0; v < d - 0.25; ) {
            const long = Math.min(d - v, random.range(0.5, 0.9));
            const split = random.chance(0.45) ? random.range(0.35, 0.65) : 1;

            for (const [u0, u1] of split < 1 ? [[0, split], [split, 1]] : [[0, 1]]) {
                const [a, b] = [u0 * w + 0.03, u1 * w - 0.03];

                if (!random.chance(0.08)) {
                    solid.turnedBox(cx + m(-w / 2 + (a + b) / 2), cz + m(-d / 2 + v + long / 2), m((b - a) / 2), m(long / 2 - 0.03), -m(0.06), m(random.range(0.03, 0.06)), random.range(-0.05, 0.05), stone);
                }
            }

            v += long;
        }
    },

    // A tomb (setpieces/neutral.js tombAt), east and west as the graves: a chest tomb, its stone
    // chest on a plinth stepping out round it, its lid overhanging it, shoved askew by what came
    // out of it (the dark of it showing), cracked across, or whole; or a table tomb, a slab on legs
    // over a base
    tomb(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = stoneOf(piece.people, part.seed % 2);
        const angle = part.turn + Math.PI / 2;
        const [ax, az] = [Math.cos(angle), Math.sin(angle)];
        const at = (u, v) => [cx + ax * u - az * v, cz + az * u + ax * v];
        const [long, wide, h] = [m(part.long), m(part.wide), m(part.h)];
        const [lid, over] = [m(0.12), m(0.08)];

        solid.tone = lichened(part.seed ?? 7, northOf(piece), headstoneOf(piece.people));

        if (part.kind === "table") {
            solid.turnedBox(cx, cz, long / 2 + m(0.1), wide / 2 + m(0.1), -m(0.3), m(0.12), angle, stone);

            for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1], ...(part.long > 1.82 ? [[0, -1], [0, 1]] : [])]) {
                solid.turnedBox(...at(i * (long / 2 - m(0.15)), j * (wide / 2 - m(0.15))), m(0.08), m(0.08), m(0.12), h - lid, angle, stone);
            }
        } else {
            solid.turnedBox(cx, cz, long / 2 + m(0.1), wide / 2 + m(0.1), -m(0.35), m(0.15), angle, stone);
            solid.turnedBox(cx, cz, long / 2, wide / 2, m(0.15), h - lid, angle, stone);

            // (The dark of it, where the lid's been moved off it)
            if (part.lid !== "whole") {
                const y = h - lid + m(0.02);
                const rim = m(0.07);

                solid.facing([[...at(-long / 2 + rim, -wide / 2 + rim)], [...at(long / 2 - rim, -wide / 2 + rim)], [...at(long / 2 - rim, wide / 2 - rim)], [...at(-long / 2 + rim, wide / 2 - rim)]].map(([x, z]) => [x, y, z]), [0, 1, 0], material("shadow"));
            }
        }

        // Its lid: shoved along and turned; cracked across, its halves apart; or whole
        if (part.lid === "askew") {
            solid.turnedBox(...at(m(part.shift) * Math.sign(part.skew), m(part.shift * 0.35)), long / 2 + over, wide / 2 + over, h - lid, h, angle + part.skew, stone);
        } else if (part.lid === "cracked") {
            for (const side of [-1, 1]) {
                solid.turnedBox(...at(side * (long / 4 + m(0.04)), side * m(0.03)), long / 4 + over / 2 - m(0.02), wide / 2 + over, h - lid - (side > 0 ? m(0.05) : 0), h - (side > 0 ? m(0.05) : 0), angle + side * random.range(0.02, 0.07), stone);
            }
        } else {
            solid.turnedBox(cx, cz, long / 2 + over, wide / 2 + over, h - lid, h, angle, stone);
        }
    },

    // A family's mausoleum: a small stone house on two steps, pilasters at its front corners, a
    // cornice round it, under a gabled roof (its pediment over the door) or a pyramid of stone
    // slates; its iron door in a dark doorway, a stone framing it and a panel for their name over
    // it; the door ajar now and then, the dark within showing
    mausoleum(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = stoneOf(piece.people);
        const slates = material(piece.people === "darkElf" ? "obsidian" : "slate-grey");
        const iron = material("iron-black");
        const [w, d, h] = [m(part.w), m(part.d), m(part.h)];
        const [x0, z0, x1, z1] = [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2];
        const base = m(0.36);
        const [dw, dh] = [m(1), m(1.9)];

        solid.tone = lichened(part.seed ?? 9, northOf(piece), headstoneOf(piece.people));

        // Its steps, its walls, the pilasters at its front corners and the cornice round its top
        solid.box(x0 - m(0.25), -m(0.4), z0 - m(0.25), x1 + m(0.25), m(0.18), z1 + m(0.25), stone);
        solid.box(x0 - m(0.12), m(0.18), z0 - m(0.12), x1 + m(0.12), base, z1 + m(0.12), stone);
        solid.box(x0, base, z0, x1, h, z1, stone);

        for (const x of [x0, x1 - m(0.32)]) {
            solid.box(x, base, z1, x + m(0.32), h, z1 + m(0.1), stone);
        }

        solid.box(x0 - m(0.12), h, z0 - m(0.12), x1 + m(0.12), h + m(0.16), z1 + m(0.22), stone);

        const eaves = h + m(0.16);

        if (part.roof === "gable") {
            solid.roof(x0 - m(0.1), z0 - m(0.1), x1 + m(0.1), z1 + m(0.2), eaves, m(part.w * 0.3), { ridge: "z", material: slates, gable: stone });
        } else {
            solid.pyramid(x0 - m(0.1), z0 - m(0.1), x1 + m(0.1), z1 + m(0.2), eaves, m(part.w * 0.42), slates);
        }

        // Its doorway, dark, its stone frame and the name panel over it
        const front = z1 + m(0.02);

        solid.facing([[cx - dw / 2, base, front], [cx + dw / 2, base, front], [cx + dw / 2, base + dh, front], [cx - dw / 2, base + dh, front]], [0, 0, 1], material("shadow"));
        solid.box(cx - dw / 2 - m(0.14), base, z1, cx - dw / 2, base + dh + m(0.14), z1 + m(0.06), stone);
        solid.box(cx + dw / 2, base, z1, cx + dw / 2 + m(0.14), base + dh + m(0.14), z1 + m(0.06), stone);
        solid.box(cx - dw / 2 - m(0.14), base + dh, z1, cx + dw / 2 + m(0.14), base + dh + m(0.16), z1 + m(0.06), stone);
        solid.box(cx - m(0.5), base + dh + m(0.3), z1, cx + m(0.5), base + dh + m(0.62), z1 + m(0.04), material("rock-pale"));

        // Its iron door: shut in the doorway, or ajar, swung out on its hinge
        if (part.door === "ajar") {
            const swing = random.range(0.5, 1.1);

            solid.turnedBox(cx - dw / 2 + (Math.cos(swing) * dw) / 2, front + (Math.sin(swing) * dw) / 2, dw / 2, m(0.03), base, base + dh, swing, iron);
        } else {
            solid.box(cx - dw / 2, base, front, cx + dw / 2, base + dh, front + m(0.04), iron);
        }
    },

    // An obelisk on its pedestal: a step, a die with a cornice, the shaft tapering to a point
    obelisk(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = stoneOf(piece.people);
        const h = m(part.h);
        const top = h * 0.92;

        solid.tone = lichened(part.seed ?? 11, northOf(piece), headstoneOf(piece.people));
        solid.box(cx - m(0.5), -m(0.3), cz - m(0.5), cx + m(0.5), m(0.18), cz + m(0.5), stone);
        solid.box(cx - m(0.36), m(0.18), cz - m(0.36), cx + m(0.36), m(0.85), cz + m(0.36), stone);
        solid.box(cx - m(0.42), m(0.85), cz - m(0.42), cx + m(0.42), m(0.95), cz + m(0.42), stone);
        solid.extrude(corners(cx, cz, 1, 0, m(0.42), m(0.42)), m(0.95), top, stone, { batter: m(0.1) });
        solid.pyramid(cx - m(0.11), cz - m(0.11), cx + m(0.11), cz + m(0.11), top, h - top, stone);
    },

    // A grave, east and west as the world lies (setpieces/neutral.js GRAVEYARD): its headstone at
    // its head, at the west (shaped as it was cut, leaning forward over it as the ground's sunk
    // under it, sunk, fallen or snapped), a footstone at its foot now and then; over it a mound gone
    // to grass, the earth freshly turned, nothing (sunk level with the ground), or the hole its
    // dead climbed out of, the earth heaped on one side and the broken boards of the coffin about;
    // railed round, now and then
    grave(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const stone = stoneOf(piece.people, part.tone ?? 0);
        const [ax, az] = [Math.cos(part.turn ?? 0), Math.sin(part.turn ?? 0)];
        const [nx, nz] = [-az, ax];
        // (A point on the grave: `u` across it, `v` along it from its middle, its foot +)
        const on = (u, y, v) => [cx + m(u) * ax + m(v) * nx, m(y), cz + m(u) * az + m(v) * nz];
        const [head, foot] = [-part.d / 2 + 0.25, part.d / 2 - 0.15];
        const along = [nx, 0, nz];
        const across = [ax, 0, az];

        solid.tone = lichened(part.seed ?? 3, northOf(piece), headstoneOf(piece.people, part.tone ?? 0));

        if (part.stone) {
            const look = [Math.cos(part.look ?? 0), 0, Math.sin(part.look ?? 0)];
            const spec = { shape: part.stone, ring: part.ring, tall: part.tall, broad: part.broad, thick: part.thick, look, sag: part.sag, lean: part.lean, sunk: part.sunk, state: part.state };

            if (part.state === "snapped") {
                // (Snapped off near the ground: its stump standing, the rest lying beside it)
                const cut = random.range(0.15, 0.3);

                headstone(solid, { ...spec, shape: "stump", tall: cut, state: "standing" }, stone, on(0, 0, head), along, across);
                headstone(solid, { ...spec, tall: part.tall - cut, state: "fallen", faceDown: random.chance(0.5) }, stone, on(random.pick([-1, 1]) * 0.55, 0, head + 0.15), along, across);
            } else {
                headstone(solid, { ...spec, faceDown: random.chance(0.5) }, stone, on(0, 0, head), along, across);
            }
        }

        if (part.footstone && part.ground !== "open") {
            const { high, wide, thick } = GRAVE.footstone;

            headstone(solid, { shape: random.pick(["round", "flat"]), tall: random.range(...high), broad: wide, thick, look: along, sag: random.range(-0.05, 0.12), lean: random.range(-0.08, 0.08), sunk: 0, state: "standing" }, stone, on(0, 0, foot), along, across);
        }

        if (part.railed) {
            railing(solid, on, part, stone);
        }

        // (The earth: dark and damp where it's been turned, the soil of an old mound under its grass)
        const [soil, earth] = [material("soil"), material("mud-dark")];
        const w = part.w;

        if (part.ground === "open") {
            // The hole, the earth thrown up on one side of it, the coffin's boards about
            const [inU, inV] = GRAVE.open.inset;
            const [hw, v0, v1] = [w / 2 - inU, head + 0.2, foot - inV];
            const hand = random.pick([-1, 1]);
            const [heap, broad] = GRAVE.open.heap;

            const dug = weathered(part.seed ?? 3, { moss: 0, dirt: 0.55 });

            // (Its dark mouth; the earth dug out of it heaped beside it, lumpy, clods rolled off it)
            solid.facing([on(-hw, 0.04, v0), on(hw, 0.04, v0), on(hw, 0.04, v1), on(-hw, 0.04, v1)], [0, 1, 0], material("shadow"));

            const out = hand * (hw + 0.1 + broad / 2);

            hump(solid, on, out, (v0 + v1) / 2 - 0.15, broad / 2, (v1 - v0) / 2, heap * random.range(0.8, 1.1), earth, dug, random);
            hump(solid, on, out + hand * broad * 0.3, v1 - 0.25, broad * 0.35, 0.4, heap * random.range(0.45, 0.65), earth, dug, random);

            for (let k = random.int(2, 4); k > 0; k--) {
                const [x, , z] = on(out + hand * (broad / 2 + random.range(0.05, 0.3)), 0, random.range(v0, v1));

                solid.cone(x, z, -m(0.05), m(random.range(0.08, 0.16)), m(random.range(0.08, 0.15)), earth, 5);
            }

            for (let k = random.int(...GRAVE.open.boards); k > 0; k--) {
                const [x, , z] = on(-hand * (hw + random.range(0.1, 0.5)), 0, random.range(v0, v1));

                solid.turnedBox(x, z, m(random.range(0.3, 0.5)), m(0.07), 0, m(0.03), part.turn + random.range(-0.6, 0.6), material("planks-dark"));
            }

            return;
        }

        if (part.ground === "flat") {
            return;
        }

        // A mound over it: low and gone to grass, or the earth freshly turned, higher and bare
        const fresh = part.ground === "fresh";
        const [hw, hl] = [w / 2 - GRAVE.mound.inset, (foot - head - 0.3) / 2];

        hump(solid, on, 0, head + 0.25 + hl, hw, hl, (fresh ? GRAVE.mound.fresh : GRAVE.mound.high) * random.range(0.75, 1.1), fresh ? earth : soil, fresh ? weathered(part.seed ?? 3, { moss: 0, dirt: 0.5 }) : weathered(part.seed ?? 3, { moss: 1.5, dirt: 0.15 }), fresh ? random : null);
    },
};

// A hump of earth on a grave (`on`: a point on it, the grave's), round (u, v) on it, `hw` across
// and `hl` along from there, `high` at its crest (metres): rounded across and falling away to its
// ends, its edge down into the ground; lumpy, if it's earth just dug (`random` for its lumps)
function hump(solid, on, u, v, hw, hl, high, soil, tone, random = null) {
    const across = [-1, -0.55, 0, 0.55, 1];
    const lump = () => (random ? random.range(0.7, 1.3) : 1);
    const rings = [-1, -0.45, 0.45, 1].map((t) => {
        const swell = Math.sqrt(Math.max(0, 1 - t * t * 0.85));

        return across.map((s) => on(u + s * hw * (0.75 + 0.25 * swell), Math.abs(s) === 1 ? -0.08 : high * swell * Math.pow(1 - s * s, 0.6) * lump(), v + t * hl));
    });
    const [mx, , mz] = on(u, 0, v);

    solid.loft(rings, soil, { closed: false, out: (point) => [point[0] - mx, m(1), point[2] - mz], tone });
}

// Which way north is in a piece, as it's built (x, z): its site's turned so (sites.js)
const northOf = (piece) => [Math.sin(piece.facing ?? 0), -Math.cos(piece.facing ?? 0)];

// A gravestone's weathering (weathered's: dark at its foot, moss on what faces up) and what grows
// on it, as its stone has it (LICHENS: `stone`, a material's name): lichen in patches, most on the
// faces to the west (`north`: which way north is, x and z; the west a quarter turn from it) and
// on its top, more on some stones than others; green algae on the faces to the east and north
function lichened(seed, north, stone = "dressed-old") {
    const random = createRandom((seed ^ 0x11c4e) >>> 0);
    const base = weathered(random.int(1, 1e6), { moss: 0.45, dirt: 0.35 });
    const growth = LICHENS[stone] ?? LICHENS["dressed-old"];
    const amount = random.range(...growth.amount);
    const [phase, scale] = [random.range(0, 100), random.range(0.12, 0.22)];
    const west = [-north[1], north[0]].map((v) => -v);

    return Object.assign(
        (point, normal, own) => {
            const shade = base(point, normal, own);

            if (!shade) {
                return shade;
            }

            const [northward, westward] = [north, west].map(([x, z]) => normal[0] * x + normal[2] * z);
            const upward = Math.max(0, normal[1]);
            const patch = Math.max(0, Math.sin(point[0] * scale + phase) * Math.sin(point[2] * scale * 1.3 + phase * 0.7) + Math.sin(point[1] * scale * 1.7 + phase * 0.3) * 0.5);
            const where = 0.25 + growth.west * Math.max(0, westward) + growth.top * upward;
            const lichen = Math.min(0.85, amount * where * patch * 1.6);
            const green = GREEN.east * Math.max(0, -westward) + GREEN.north * Math.max(0, northward);

            return shade.map((c, k) => c * (1 - lichen + lichen * growth.colour[k]) * (1 - green + green * GREEN.colour[k]));
        },
        { bands: base.bands },
    );
}

// A headstone (or a footstone) standing at `foot` (world pixels: where its middle meets the
// ground), as `spec` has it: its shape (round-headed, segmental, shouldered, pointed, flat, a
// cross, ringed or not; or the stump of one snapped off), how tall, broad and thick (metres), which
// way its face looks (`look`), leaning forward over its grave (`sag`, along `along`) and to a side
// (`lean`, along `across`), sunk; or fallen, lying along its grave, face down or up. A slab of its
// outline, set into the ground but for a fallen one
function headstone(solid, spec, stone, foot, along, across) {
    const fallen = spec.state === "fallen";
    const tip = fallen ? 1.48 : (spec.sag ?? 0);
    const lean = fallen ? 0 : (spec.lean ?? 0);
    const up = unit3(add3(add3(times3([0, 1, 0], Math.cos(tip) * Math.cos(lean)), times3(along, Math.sin(tip))), times3(across, Math.sin(lean))));
    const facing = fallen ? [0, spec.faceDown ? -1 : 1, 0] : spec.look;
    const towards = unit3(minus3(facing, times3(up, dot3(facing, up))));
    const side = cross3(up, towards);
    const thick = m(spec.thick);
    const base = fallen ? thick / 2 + m(0.02) : -m(spec.sunk ?? 0);
    const at = (u, y, v) => [foot[0] + side[0] * u + up[0] * y + towards[0] * v, foot[1] + base + side[1] * u + up[1] * y + towards[1] * v, foot[2] + side[2] * u + up[2] * y + towards[2] * v];
    const [hw, h, y0] = [m(spec.broad) / 2, m(spec.tall), fallen ? 0 : -m(Math.max(GRAVE.deep, spec.tall / 2))];
    // (A slab of an outline (convex, round from its foot), `thick` through: its two faces and its
    // edges, all but its foot's under the ground)
    const slab = (outline, depth = thick) => {
        const way = (u, y, v) => minus3(at(u, y, v), at(0, 0, 0));

        solid.facing(outline.map(([u, y]) => at(u, y, depth / 2)), way(0, 0, 1), stone);
        solid.facing(outline.map(([u, y]) => at(u, y, -depth / 2)), way(0, 0, -1), stone);

        for (let k = 0; k < outline.length; k++) {
            const [[ua, ya], [ub, yb]] = [outline[k], outline[(k + 1) % outline.length]];

            if (!fallen && ya <= y0 + 1e-6 && yb <= y0 + 1e-6) {
                continue;
            }

            solid.facing([at(ua, ya, -depth / 2), at(ub, yb, -depth / 2), at(ub, yb, depth / 2), at(ua, ya, depth / 2)], way(yb - ya, -(ub - ua), 0), stone);
        }
    };
    // (An arc of a circle round (0, cy), radius r, from angle a0 to a1, in `count` steps)
    const arc = (cy, r, a0, a1, count) => Array.from({ length: count + 1 }, (_, k) => [Math.cos(a0 + ((a1 - a0) * k) / count) * r, cy + Math.sin(a0 + ((a1 - a0) * k) / count) * r]);

    switch (spec.shape) {
        case "stump":
            slab([[-hw, y0], [hw, y0], [hw, h], [hw * 0.3, h + m(0.04)], [-hw * 0.4, h - m(0.03)], [-hw, h + m(0.02)]]);

            return;
        case "flat": {
            const c = m(0.04);

            slab([[-hw, y0], [hw, y0], [hw, h - c], [hw - c, h], [-hw + c, h], [-hw, h - c]]);

            return;
        }
        case "segmental": {
            // (Its top a shallow arc, rising a fifth of its width)
            const rise = hw * 0.4;
            const r = (hw * hw + rise * rise) / (2 * rise);
            const a0 = Math.atan2(h - rise - (h - r), hw);

            slab([[-hw, y0], [hw, y0], ...arc(h - r, r, a0, Math.PI - a0, 5)]);

            return;
        }
        case "shouldered": {
            // (Square shoulders, a round head standing up from between them)
            const shoulder = Math.min(h * 0.78, h - hw * 0.75 - m(0.04));
            const head = hw * 0.75;

            slab([[-hw, y0], [hw, y0], [hw, shoulder], [-hw, shoulder]]);
            slab([[-head, shoulder - m(0.02)], [head, shoulder - m(0.02)], ...arc(h - head, head, 0, Math.PI, 6)], thick * 0.96);

            return;
        }
        case "pointed": {
            // (An equilateral arch: each side an arc about the other's springing)
            const spring = Math.max(y0 + m(0.2), h - hw * Math.sqrt(3));
            const right = arc(spring, hw * 2, 0, Math.PI / 3, 3).map(([u, y]) => [u - hw, y]);
            const left = right.slice(0, -1).reverse().map(([u, y]) => [-u, y]);

            slab([[-hw, y0], [hw, y0], ...right, ...left]);

            return;
        }
        case "cross": {
            const { upright, arm: [width, high, below] } = GRAVE.cross;
            const [uw, aw, ah, ab] = [m(upright) / 2, m(width) / 2, m(high), m(below)];
            const middle = h - ab - ah / 2;

            slab([[-uw, y0], [uw, y0], [uw, h], [-uw, h]]);
            slab([[-aw, middle - ah / 2], [aw, middle - ah / 2], [aw, middle + ah / 2], [-aw, middle + ah / 2]], thick * 0.9);

            // (A ring round where they cross, now and then: the Celtic cross's)
            if (spec.ring) {
                const ring = Array.from({ length: 13 }, (_, k) => at(Math.cos((k / 12) * Math.PI * 2) * m(GRAVE.ring.radius), middle + Math.sin((k / 12) * Math.PI * 2) * m(GRAVE.ring.radius), 0));

                solid.tube(ring, m(GRAVE.ring.thick), stone, { sides: 4 });
            }

            return;
        }
        default:
            // (Round-headed: its top a half circle)
            slab([[-hw, y0], [hw, y0], ...arc(h - hw, hw, 0, Math.PI, 6)]);
    }
}

// The railing round a grave: a stone kerb, iron bars on it (one gone here and there), a rail along
// their tops; `on`: a point on the grave (grave's)
function railing(solid, on, part, stone) {
    const iron = material("iron-black");
    const { high, every, kerb } = GRAVE.railing;
    const [hw, hl] = [part.w / 2 + 0.08, part.d / 2 + 0.02];
    const sides = [
        [[-hw, -hl], [hw, -hl]],
        [[hw, -hl], [hw, hl]],
        [[hw, hl], [-hw, hl]],
        [[-hw, hl], [-hw, -hl]],
    ];
    const random = createRandom(((part.seed ?? 1) ^ 0x3a11) >>> 0);

    for (const [[ua, va], [ub, vb]] of sides) {
        const [a, b] = [on(ua, 0, va), on(ub, 0, vb)];
        const long = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const angle = Math.atan2(b[2] - a[2], b[0] - a[0]);
        const [mx, mz] = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];

        solid.turnedBox(mx, mz, long / 2 + m(0.06), m(0.07), -m(0.2), m(kerb), angle, stone);
        solid.turnedBox(mx, mz, long / 2, m(0.018), m(high - 0.04), m(high), angle, iron);

        for (let k = 0, count = Math.max(1, Math.round(long / m(every))); k < count; k++) {
            if (random.chance(0.08)) {
                continue;
            }

            const t = k / count;

            solid.turnedBox(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, m(0.012), m(0.012), m(kerb), m(high + 0.06), angle, iron);
        }
    }
}

// A block's plan hewn roughly square, `half` across from its middle (x, z), its corners knocked
// off unevenly: its corners in order round it
function hewn(random, x, z, half) {
    return [[1, 1], [-1, 1], [-1, -1], [1, -1]].flatMap(([sx, sz]) => {
        const cut = half * random.range(0.12, 0.35);

        return sx * sz > 0 ? [[x + sx * half, z + sz * (half - cut)], [x + sx * (half - cut), z + sz * half]] : [[x + sx * (half - cut), z + sz * half], [x + sx * half, z + sz * (half - cut)]];
    });
}

// A skull, the foot of its cranium at `at` ([x, y, z], world pixels), looking the way `turn` says
// (radians round from the south, as a part's), `size` times a man's: its cranium, the bone of its
// face with the dark of its eyes and its nose in it, its upper jaw
function skull(solid, [x, y, z], turn, size = 1) {
    const bone = material("bone");
    const s = (metres) => m(metres * size);
    const [fx, fz] = [Math.sin(turn), Math.cos(turn)];
    // (Across it, up, and forward)
    const on = (u, v, w) => [x + fz * s(u) + fx * s(w), y + s(v), z - fx * s(u) + fz * s(w)];
    const ahead = [fx, 0, fz];
    const [jx, , jz] = on(0, 0, 0.045);

    solid.lathe(x, z, [[s(0.06), y], [s(0.09), y + s(0.08)], [s(0.075), y + s(0.16)], [0, y + s(0.2)]], bone, { segments: 6 });
    solid.facing([on(-0.06, 0.02, 0.075), on(0.06, 0.02, 0.075), on(0.065, 0.13, 0.088), on(-0.065, 0.13, 0.088)], ahead, bone);

    for (const side of [-1, 1]) {
        solid.facing([on(side * 0.012, 0.072, 0.09), on(side * 0.052, 0.072, 0.09), on(side * 0.05, 0.11, 0.092), on(side * 0.014, 0.11, 0.092)], ahead, material("shadow"));
    }

    solid.facing([on(-0.013, 0.034, 0.086), on(0.013, 0.034, 0.086), on(0, 0.064, 0.088)], ahead, material("shadow"));
    solid.turnedBox(jx, jz, s(0.045), s(0.035), y - s(0.03), y + s(0.025), -turn, bone);
}

// A point on a stretch of a hovel's roof (`slope`: its corners in order round it, the first two
// along its top), `s` of the way along it and `t` of the way down it, `lift` over it (world pixels)
function onSlope([a, b, c, d], s, t, lift = 0) {
    return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * s + (d[i] - a[i]) * t + (a[i] - b[i] + c[i] - d[i]) * s * t + (i === 1 ? lift : 0));
}

// A hovel's roof held down (`slope`, as onSlope's): a hide laid over a hole in it somewhere, and
// poles laid down it from its top past its foot, to keep the wind from lifting it (`poles` of them)
function heldDown(solid, random, slope, poles, pole) {
    const [s0, t0] = [random.range(0.1, 0.5), random.range(0.15, 0.45)];
    const [s1, t1] = [s0 + random.range(0.25, 0.4), t0 + random.range(0.3, 0.45)];

    solid.facing([onSlope(slope, s0, t0, m(0.04)), onSlope(slope, s1, t0 + random.range(-0.05, 0.05), m(0.04)), onSlope(slope, s1 - random.range(0, 0.08), t1, m(0.04)), onSlope(slope, s0 + random.range(0, 0.08), t1, m(0.04))], [0, 1, 0], material(random.pick(["hide", "fur", "hide-dark", "thatch-grey"])));

    for (let k = 0; k < poles; k++) {
        const s = (k + random.range(0.3, 0.7)) / poles;

        solid.beam(onSlope(slope, s, -0.04, m(0.07)), onSlope(slope, s + random.range(-0.08, 0.08), random.range(1.02, 1.12), m(0.07)), m(0.09), m(0.09), pole, { ends: false });
    }
}

// A hide stretched over a hovel's wall to patch it (`at`: the hovel's, across it, up and towards
// its front), somewhere between u0 and u1 across and y0 and y1 up, at `v`, facing `out` ([x, z])
function hidePatch(solid, random, at, [u0, u1], v, [y0, y1], [ox, oz]) {
    const wide = (u1 - u0) * random.range(0.25, 0.4);
    const u = random.range(u0 + wide / 2, u1 - wide / 2);
    const [low, high] = [y0 + (y1 - y0) * random.range(0, 0.3), y0 + (y1 - y0) * random.range(0.65, 1)];

    solid.facing([at(u - wide / 2, low + m(random.range(0, 0.1)), v), at(u + wide / 2, low, v), at(u + wide * 0.45, high, v), at(u - wide * 0.55, high - m(0.08), v)], [ox, 0, oz], material(random.pick(["hide", "fur", "hide-dark"])));
}

const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const minus3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const times3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a) => times3(a, 1 / Math.hypot(...a));

/** A neutral site's part (sites.js: piece.part, laid out by core/setpieces/neutral.js), built. */
export function neutral(piece) {
    const part = piece.part;
    const random = createRandom(((part.seed ?? piece.seed ?? 1) ^ Math.round((part.x ?? part.x0 ?? 0) * 977 + (part.y ?? part.y0 ?? 0) * 131)) >>> 0);
    const solid = new Solid();

    // (A people's works, worked rather than ruined: kits/works.js; or one ruined, `ruined`, as the
    // rest are: weathered)
    if (!buildWorksPart(solid, piece, random, part.ruined ? weathered(random.int(1, 1e6), { moss: 0.7 }) : null)) {
        solid.tone = weathered(random.int(1, 1e6), { moss: piece.people === "cat" ? 0.1 : 0.6 });
        BUILD[part.part]?.(solid, piece, random, part);
    }

    return solid.toObject();
}
