// Bushes (core/wilds.js's "bush" feature), drawn as the hedges are (kits/hedges.js): a mound of
// leaves, not a ball of facets (the user's word: no vegetation should look polygonal).
// - Its body: a dome a little wider than it's tall, drawn in to its foot, where its stems are,
//   pushed in and out in lumps by smooth noise from its own seed; drawn with a tiling picture of
//   leaves, lit as one soft mass (its normals out from its middle, a little towards the sky),
//   darker below and in its hollows, its top lighter and yellower in the sun; in its land's own
//   green (wilds.js bushLook), a tint of the green its pictures are painted in.
// - Its sprigs: cards of leaves cut out of their picture (as the trees' and the hedges' are),
//   standing out of its sides and top, so its outline is leaves, not a line; fewer at lower
//   qualities.
// - Its berries or flowers, on those that bear them: where on it they are (`berries`), for the
//   wilds' own mesh to draw as little round balls (wilds.js featureMesh).
// Its pictures are its own (no hawthorn blossom on every bush), on materials made as the hedges'
// are, so the graphics card has no new program to make for them.

import * as THREE from "three";
import { hashOf } from "../../../core/noise.js";
import { releaseGeometry } from "../../release.js";
import { leafCards, leafTexture } from "../engine/leafcards.js";
import { leaf } from "./trees.js";

const TAU = Math.PI * 2;

/**
 * How a bush is made: its body's rings up it and points round each, how far it's pushed in and
 * out in lumps (of its size), its sprigs (on a square metre of the ground it covers, at full
 * quality) and their size (metres).
 */
export const BUSHES = Object.freeze({ rings: 8, around: 20, lumps: 0.22, sprigs: 22, sprig: [0.3, 0.55] });

// How far up it (radians, from its middle) its picture's laid on from above, not round it, so it
// isn't drawn in to a point at its top
const CROWN = 0.75;

// How many metres one copy of the body's picture covers
const LEAVES_METRES = 0.6;

// The green the pictures are painted in (as #3e6a2a, linear), which each bush's own is a tint of
const PAINTED = new THREE.Color(0x3e6a2a).toArray();

// The greens painted, darkest first
const GREENS = ["#28441b", "#335822", "#3e6a2a", "#4a7a32", "#5a8c3c"];

/**
 * A chunk's bushes drawn, from its corner `origin` ([x, y], metres): { object (a Group: their
 * bodies, casting shadows, and their sprigs; or null, for none), berries ([{ at, radius, colour
 * }]: each berry or flower on them, from the corner) }. Each of `bushes` is { at ([x, y, z]: its
 * foot, from the corner), across, height (metres), turn, seed, leaves (its green, linear), bloom
 * (its berries' or flowers' colour, or null), blooms (how many) }; `sprigs` as many of those as
 * the quality draws (0 to 1).
 */
export function bushMesh(bushes, [ox, oy], { sprigs = 1 } = {}) {
    const body = { position: [], normal: [], uv: [], color: [], index: [] };
    const cards = { position: [], normal: [], uv: [], color: [], index: [] };
    const berries = [];

    for (const bush of bushes) {
        const shape = shapeOf(bush);

        bodyOf(body, shape);
        sprigsOf(cards, shape, Math.round(BUSHES.sprigs * bush.across * bush.across * sprigs));

        if (bush.bloom) {
            berries.push(...berriesOf(shape, bush));
        }
    }

    if (!body.index.length) {
        return { object: null, berries };
    }

    const object = new THREE.Group();
    const materials = bushMaterials();

    object.name = "bushes";

    for (const [lists, material, name] of [[body, materials.body, "bushes"], [cards, materials.sprigs, "bush sprigs"]]) {
        if (!lists.index.length) {
            continue;
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute(lists.position, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(lists.normal, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(lists.uv, 2));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(lists.color, 3));
        geometry.setIndex(lists.index);
        geometry.computeBoundingSphere();

        // (Let go of on the page once it's on the graphics card: what stands in the way is the
        // features' boxes)
        const mesh = new THREE.Mesh(releaseGeometry(geometry), material);

        mesh.name = name;
        mesh.position.set(ox, 0, oy);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.receiveShadow = true;
        mesh.castShadow = material === materials.body;
        object.add(mesh);
    }

    return { object, berries };
}

// A bush's shape: where a point of it is, `up` (radians, from its foot to its top) and `round`
// (radians) of the way, and how it's lit and coloured there
function shapeOf({ at, across, height, turn, seed, leaves }) {
    const [rx, ry, cy] = [across / 2, height * 0.62, height * 0.38];
    const foot = -Math.asin(Math.min(1, (cy + 0.06) / ry));
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    const tint = PAINTED.map((v, i) => Math.min(2.5, Math.max(0.4, leaves[i] / v)));

    // Lumps big and small (-1 to 1), from which way from its middle a point is
    const lumpAt = (d) => (noise3(d[0] * 1.4, d[1] * 1.4, d[2] * 1.4, seed) - 0.5) * 1.6 + (noise3(d[0] * 3.3, d[1] * 3.3, d[2] * 3.3, seed + 3) - 0.5) * 0.8;

    const point = (up, round, inward = 0) => {
        const d = [Math.cos(up) * Math.cos(round), Math.sin(up), Math.cos(up) * Math.sin(round)];
        const lump = lumpAt(d);
        const f = 1 + BUSHES.lumps * lump;
        const local = [d[0] * rx * f, Math.max(-0.06, cy + d[1] * ry * f), d[2] * rx * f];
        // (Out from its middle, as an egg of its shape is, and a little towards the sky: one soft
        // mass, not its faces)
        const out = new THREE.Vector3(d[0] / rx, d[1] / ry + 0.35 / ry, d[2] / rx).normalize();
        const [x, z] = [local[0] - out.x * inward, local[2] - out.z * inward];
        const y = local[1] - out.y * inward;
        const tall = Math.min(1, Math.max(0, y / height));
        const t = Math.min(1, tall / 0.7);
        const shade = (0.36 + 0.64 * t * t * (3 - 2 * t)) * (0.8 + 0.2 * (Math.max(-1, Math.min(1, lump)) + 1) * 0.5) * (1 - Math.min(0.5, inward * 2));
        // (Its top lighter and yellower in the sun)
        const tips = Math.min(1, Math.max(0, (tall - 0.7) / 0.3));

        return {
            position: [at[0] + x * c - z * s, at[1] + y, at[2] + x * s + z * c],
            normal: [out.x * c - out.z * s, out.y, out.x * s + out.z * c],
            colour: [tint[0] * shade * (0.96 + 0.12 * tips), tint[1] * shade * (1 + 0.05 * tips), tint[2] * shade * (0.92 - 0.12 * tips)],
            // (Its picture laid round it, or on its crown from above)
            round: [(round * rx) / LEAVES_METRES, ((up - foot) * ry) / LEAVES_METRES],
            above: [x / LEAVES_METRES, z / LEAVES_METRES],
        };
    };

    return { point, foot, top: 1.25, seed, size: Math.min(1.2, Math.max(0.7, across / 1.8)) };
}

// Its body: rings from its foot up, a point at its top; its picture laid round it below CROWN and
// from above over it (the ring where they meet made twice, once each way: its leaves don't line
// up across it, which a mass of leaves hides)
function bodyOf(lists, { point, foot, top }) {
    const { rings, around } = BUSHES;
    const add = (at, uv) => {
        lists.position.push(...at.position);
        lists.normal.push(...at.normal);
        lists.uv.push(...uv);
        lists.color.push(...at.colour);
    };
    // A ring of points, its picture laid on `way` ("round" or "above"): the first of them
    // (round once, the first point again at the end, its picture carrying on across the join)
    const ring = (up, way) => {
        const first = lists.position.length / 3;

        for (let j = 0; j <= around; j++) {
            const at = point(up, (j / around) * TAU);

            add(at, at[way]);
        }

        return first;
    };
    let below = null;

    for (let r = 0; r < rings; r++) {
        const up = foot + ((top - foot) * r) / (rings - 1);
        const way = up < CROWN ? "round" : "above";

        // (Where its picture's laid on from above from here, the ring below made again that way)
        if (below && below.way !== way) {
            below = { first: ring(below.up, way), up: below.up, way };
        }

        const first = ring(up, way);

        if (below) {
            for (let j = 0; j < around; j++) {
                lists.index.push(below.first + j, first + j, below.first + j + 1, below.first + j + 1, first + j, first + j + 1);
            }
        }

        below = { first, up, way };
    }

    const crown = lists.position.length / 3;
    const tip = point(Math.PI / 2, 0);

    add(tip, tip.above);

    for (let j = 0; j < around; j++) {
        lists.index.push(below.first + j, crown, below.first + j + 1);
    }
}

// Its sprigs: over it from low on its sides to its top, at different depths in it, turned every
// which way but mostly out
function sprigsOf(lists, { point, foot, seed, size }, count) {
    for (let k = 0; k < count; k++) {
        const h = (n) => hashOf(k, n, seed);
        const up = foot * 0.5 + (1.45 - foot * 0.5) * h(1) ** 0.8;
        const at = point(up, h(2) * TAU, (h(3) - 0.45) * 0.18);
        const outward = new THREE.Vector3(...at.normal);
        const facing = outward.clone().add(new THREE.Vector3(h(4) - 0.5, h(5) - 0.5, h(6) - 0.5).multiplyScalar(1.4)).normalize();
        const right = new THREE.Vector3().crossVectors(facing, new THREE.Vector3(h(7) - 0.5, h(8) - 0.5, h(9) - 0.5)).normalize();
        const upward = new THREE.Vector3().crossVectors(right, facing).normalize();
        const across = (BUSHES.sprig[0] + (BUSHES.sprig[1] - BUSHES.sprig[0]) * h(10)) * size;
        const base = lists.position.length / 3;
        const colour = at.colour.map((v) => v * (0.88 + 0.24 * h(11)));

        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
            lists.position.push(at.position[0] + right.x * (u - 0.5) * across + upward.x * (v - 0.5) * across, at.position[1] + right.y * (u - 0.5) * across + upward.y * (v - 0.5) * across, at.position[2] + right.z * (u - 0.5) * across + upward.z * (v - 0.5) * across);
            lists.normal.push(outward.x, outward.y, outward.z);
            lists.uv.push(u, v);
            lists.color.push(...colour);
        }

        lists.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
}

// Its berries or flowers: on its upper sides and top, standing just out of its face
function berriesOf({ point, seed }, { bloom, blooms }) {
    return Array.from({ length: Math.min(blooms, 18) }, (_, k) => {
        const h = (n) => hashOf(k, n + 40, seed);
        const at = point(0.15 + h(1) * 1.2, h(2) * TAU, -0.03);
        const tone = 0.85 + 0.25 * h(3);

        return { at: at.position, radius: 0.025 + 0.02 * h(4), colour: bloom.map((v) => v * tone) };
    });
}

// 3D value noise from 0 to 1
function noise3(x, y, z, seed) {
    const [x0, y0, z0] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const smooth = (t) => t * t * (3 - 2 * t);
    const [fx, fy, fz] = [smooth(x - x0), smooth(y - y0), smooth(z - z0)];
    const at = (i, j, k) => hashOf(i + k * 157, j - k * 311, seed + k * 7);
    const plane = (k) => {
        const near = at(x0, y0, k) + (at(x0 + 1, y0, k) - at(x0, y0, k)) * fx;
        const far = at(x0, y0 + 1, k) + (at(x0 + 1, y0 + 1, k) - at(x0, y0 + 1, k)) * fx;

        return near + (far - near) * fy;
    };

    return plane(z0) + (plane(z0 + 1) - plane(z0)) * fz;
}

let materials = null;

/**
 * The bushes' materials, their pictures painted once (none in Node): { body (its leaves, tiling,
 * opaque), sprigs (a sprig of leaves, cut out of its picture) }; made as the hedges' are.
 */
export function bushMaterials() {
    if (!materials) {
        // (Painted where there's a page to paint on: not in Node, nor on a test's stand-in for one)
        const drawn = typeof document !== "undefined" && typeof document.createElement("canvas").getContext("2d")?.beginPath === "function";
        const body = new THREE.MeshLambertMaterial({ name: "bush", color: drawn ? 0xffffff : 0x3e6a2a, map: drawn ? leafTexture(facePicture(), true) : null, vertexColors: true });

        materials = { body, sprigs: leafCards("bush sprigs", drawn ? sprigPicture() : null, 0x46702c) };
    }

    return materials;
}

// A bush's face: leaves packed over the dark inside of it, a few twigs; 256 pixels square, tiling
// every way (each leaf drawn again across the edges it crosses)
function facePicture() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const size = 256;
    const random = seeded(83);

    canvas.width = canvas.height = size;
    context.fillStyle = "#14240e";
    context.fillRect(0, 0, size, size);
    context.lineCap = "round";

    const wrapped = (x, y, reach, draw) => {
        for (const dx of [-size, 0, size]) {
            for (const dy of [-size, 0, size]) {
                if (x + dx > -reach && x + dx < size + reach && y + dy > -reach && y + dy < size + reach) {
                    context.save();
                    context.translate(x + dx, y + dy);
                    draw();
                    context.restore();
                }
            }
        }
    };

    // (Twigs in the dark under the leaves)
    context.strokeStyle = "#3a2c1e";
    context.lineWidth = 1.5;

    for (let k = 0; k < 24; k++) {
        const [x, y, turn, length] = [random() * size, random() * size, random() * TAU, 18 + random() * 26];

        wrapped(x, y, length, () => {
            context.rotate(turn);
            context.beginPath();
            context.moveTo(0, 0);
            context.lineTo(0, -length);
            context.stroke();
        });
    }

    // (Leaves, the darker first and deeper, the lighter over them)
    for (const [k, green] of GREENS.entries()) {
        for (let n = 0; n < 70 + k * 14; n++) {
            const [x, y, turn, length] = [random() * size, random() * size, random() * TAU, 14 + random() * 10];

            wrapped(x, y, length, () => {
                context.rotate(turn);
                leaf(context, random() < 0.25 ? "narrow" : "oval", length, green, "rgba(16, 30, 8, 0.45)");
            });
        }
    }

    return canvas;
}

// A sprig of leaves on its twig, on nothing; 128 pixels square
function sprigPicture() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const random = seeded(47);

    canvas.width = canvas.height = 128;
    context.lineCap = "round";
    context.strokeStyle = "#3a2c1e";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(64, 124);
    context.quadraticCurveTo(70, 70, 62, 16);
    context.stroke();

    for (let k = 0; k < 40; k++) {
        const t = random();
        const [x, y] = [64 + (random() - 0.5) * 72 * (0.4 + t * 0.6), 120 - t * 104 + (random() - 0.5) * 16];

        context.save();
        context.translate(x, y);
        context.rotate((x < 64 ? -1 : 1) * (0.5 + random() * 1.1) + (random() - 0.5) * 0.6);
        leaf(context, random() < 0.25 ? "narrow" : "oval", 16 + random() * 10, GREENS[1 + Math.floor(random() * (GREENS.length - 1))], "rgba(16, 30, 8, 0.5)");
        context.restore();
    }

    return canvas;
}

// Numbers from 0 to 1, the same every time from the same seed
function seeded(seed) {
    let k = 0;

    return () => hashOf(k++, 19, seed);
}
