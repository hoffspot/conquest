// Hedgerows (terrain plan M7b; the user's photographs of them): along the edges of the farmed
// blocks of fields (core/fields.js hedgeLine, core/overworld.js hedgeAt), one continuous wall of
// small leaves, as hawthorn grows: here trimmed flat-topped and straight-sided, there rounded,
// there grown out tall and shaggy, a metre and a third to nearly two and a half tall and a metre
// to a metre and two thirds thick, all of it changing slowly along its length (HEDGES); darker
// towards its foot, where its stems are and the light doesn't reach, and in the hollows between
// its lumps; flecked with blossom. A gateway in a block's edge now and then, and a break where a
// road, water or a settlement's ground meets it.
// - Its body: a profile (between a rounded one and a trimmed one, as much as it's trimmed there)
//   swept along each run of its squares in a chunk, a ring every half metre, its face pushed in
//   and out by smooth noise (all of it from where it is in the world, so a run carries on into the
//   next chunk without a seam), closed where it ends; drawn with a tiling picture of leaves, lit
//   as one soft mass (its normals out from its middle), casting shadows.
// - Its sprigs: cards of leaves (cut out of their picture, as the trees' leaves are) standing out
//   of its top and upper sides, so its outline is leaves, not a line; fewer at lower qualities.
// The drawing's alone: in no one's way.

import * as THREE from "three";
import { blockAlong } from "../../../core/fields.js";
import { fractal, hashOf } from "../../../core/noise.js";
import { CHUNK } from "../../../core/overworld.js";
import { GROUND } from "../../../core/setpieces/pieces.js";
import { allAtOnce } from "../../../core/steps.js";
import { leaf } from "./trees.js";

/**
 * How the hedges grow: how tall and how thick (metres, their least and most: changing slowly
 * along each, over `stretch` metres or so), how far their faces go in and out (metres, the more
 * where they're grown out), how likely a block's edge has a gateway in it and how wide that is
 * (metres), a ring of the body every `step` metres, how many sprigs a metre (at full density) and
 * how big (metres).
 */
export const HEDGES = Object.freeze({ height: [1.3, 2.4], width: [1, 1.65], stretch: 40, lumps: [0.08, 0.2], gates: 0.5, gate: 4, step: 0.5, sprigs: 16, sprig: [0.32, 0.62] });

// A hedge's profile, from its foot on one side over its top to its foot on the other (shares of
// half its thickness across, of its height up): grown rounded, and trimmed
const ROUNDED = [[-0.7, -0.06], [-0.9, 0.14], [-1, 0.38], [-0.98, 0.6], [-0.86, 0.8], [-0.58, 0.95], [-0.2, 1.01], [0.2, 1.01], [0.58, 0.95], [0.86, 0.8], [0.98, 0.6], [1, 0.38], [0.9, 0.14], [0.7, -0.06]];
const TRIMMED = [[-0.86, -0.06], [-0.92, 0.14], [-0.96, 0.38], [-0.99, 0.6], [-1, 0.8], [-0.94, 0.95], [-0.36, 1], [0.36, 1], [0.94, 0.95], [1, 0.8], [0.99, 0.6], [0.96, 0.38], [0.92, 0.14], [0.86, -0.06]];

// How many metres one copy of the leaves' picture covers on the body
const LEAVES_METRES = 0.75;

// How many rings of a hedge's body are made a step (hedgeBuilding)
const RINGS_A_STEP = 24;

/**
 * A chunk's hedgerows: the runs of squares along its farmed blocks' edges with a hedge on them,
 * [{ axis (0: running east to west, along x; 1: north to south, along y), at (the line's other
 * coordinate: the middle of its squares, metres), from, to (metres along it), ends ([whether it's
 * closed at its start, and at its end]: open where it carries on into the next chunk), seed }].
 */
export function hedgeRuns(overworld, chunk) {
    if (!overworld.hedgeAt) {
        return [];
    }

    const seed = overworld.plan.seed;
    const { x0, y0 } = chunk;
    const runs = [];
    // (Whether a square of a block's edge, along `axis`, has the hedge on it: its block farmed, on
    // that edge, open grass, not in a gateway)
    const hedged = (x, y, axis) => {
        if (!overworld.hedgeAt(x, y)) {
            return false;
        }

        const [bx, bx0, bx1] = blockAlong(x, 0, seed);
        const [by, by0, by1] = blockAlong(y, 1, seed);

        if ((axis === 1 ? bx0 : by0) !== (axis === 1 ? x : y)) {
            return false;
        }

        // (A gateway in this edge of the block, if it has one)
        if (hashOf(bx, by, seed * 13 + 90 + axis) < HEDGES.gates) {
            const [start, end] = axis === 1 ? [by0, by1] : [bx0, bx1];
            const gate = start + 3 + Math.floor(hashOf(bx, by, seed * 13 + 92 + axis) * Math.max(1, end - start - 6 - HEDGES.gate));
            const along = axis === 1 ? y : x;

            if (along >= gate && along < gate + HEDGES.gate) {
                return false;
            }
        }

        if (overworld.settled(x, y)) {
            return false;
        }

        if (x < x0 || y < y0 || x >= x0 + CHUNK || y >= y0 + CHUNK) {
            return true;
        }

        const k = (y - y0) * CHUNK + (x - x0);

        return chunk.ground[k] === GROUND.grass && !chunk.water[k] && !chunk.bridge[k];
    };

    for (const axis of [0, 1]) {
        for (let line = 0; line < CHUNK; line++) {
            // (A line of squares across the chunk: a block's edge, or none)
            const at = (axis === 1 ? x0 : y0) + line;

            if (blockAlong(at, axis === 1 ? 0 : 1, seed)[1] !== at) {
                continue;
            }

            const square = (along) => (axis === 1 ? [at, along] : [along, at]);
            const start = axis === 1 ? y0 : x0;
            let from = null;

            for (let along = start; along <= start + CHUNK; along++) {
                const on = along < start + CHUNK && hedged(...square(along), axis);

                if (on && from === null) {
                    from = along;
                } else if (!on && from !== null) {
                    const ends = [!(from === start && hedged(...square(start - 1), axis)), !(along === start + CHUNK && hedged(...square(along), axis))];

                    runs.push({ axis, at: at + 0.5, from, to: along, ends, seed });
                    from = null;
                }
            }
        }
    }

    return runs;
}

// How a hedge grows at a point along it (`s` metres along its line, the line at `at`): how tall
// and how thick (metres), how trimmed (0 rounded to 1 trimmed) and how far its face goes in and
// out (metres)
function growthAt({ axis, at, seed }, s) {
    const line = at * 0.37 + axis * 512;
    const tall = fractal(s, line, HEDGES.stretch, seed * 7 + 3, 2);
    const thick = fractal(s, line, HEDGES.stretch * 0.8, seed * 7 + 4, 2);
    const trim = Math.min(1, Math.max(0, (fractal(s, line, HEDGES.stretch * 1.6, seed * 7 + 5, 2) - 0.3) / 0.4));
    const [least, most] = HEDGES.height;

    return {
        // (Trimmed hedges kept lower)
        height: least + (most - least) * Math.min(1, Math.max(0, (tall - 0.25) / 0.5)) * (1 - 0.35 * trim),
        width: HEDGES.width[0] + (HEDGES.width[1] - HEDGES.width[0]) * Math.min(1, Math.max(0, (thick - 0.25) / 0.5)),
        trim,
        lumps: HEDGES.lumps[1] + (HEDGES.lumps[0] - HEDGES.lumps[1]) * trim,
    };
}

// A point of a hedge's profile, at `p` (0 to its last, between points), as it grows there: across
// and up (metres), and the way out from its middle (across, up: a metre long)
function profileAt(p, { height, width, trim }) {
    const j = Math.min(ROUNDED.length - 2, Math.floor(p));
    const t = p - j;
    const share = (k) => [ROUNDED[k][0] + (TRIMMED[k][0] - ROUNDED[k][0]) * trim, ROUNDED[k][1] + (TRIMMED[k][1] - ROUNDED[k][1]) * trim];
    const [a, b] = [share(j), share(j + 1)];
    const across = (a[0] + (b[0] - a[0]) * t) * width * 0.5;
    const up = (a[1] + (b[1] - a[1]) * t) * height;
    const [ox, oy] = [across / (width * 0.5), (up - 0.42 * height) / (height * 0.6)];
    const length = Math.hypot(ox, oy) || 1;

    return { across, up, out: [ox / length, oy / length] };
}

/**
 * A chunk's hedgerows drawn (hedgeRuns' runs), from its corner `origin` ([x, y], metres), on the
 * ground `groundAt(x, z)`: { object (a Group: their bodies and their sprigs), boxes ([{ min, max
 * ([x, y]), top }]: what each run stands over, and how high) }; `sprigs` as many of those as the
 * quality draws (0 to 1; at half or less, the body's rings twice as far apart too).
 */
export function hedgeMesh(runs, origin, groundAt, options) {
    return allAtOnce(hedgeBuilding(runs, origin, groundAt, options));
}

/** The same (hedgeMesh), made a step at a time (each a yield: a few dozen rings), returning it. */
export function* hedgeBuilding(runs, [ox, oy], groundAt, { sprigs = 1 } = {}) {
    const body = { position: [], normal: [], uv: [], color: [], index: [] };
    const cards = { position: [], normal: [], uv: [], color: [], index: [] };
    const boxes = [];
    const points = ROUNDED.length;

    for (const run of runs) {
        const { axis, at, from, to, ends, seed } = run;
        const rings = Math.max(1, Math.ceil((to - from) / (HEDGES.step * (sprigs > 0.5 ? 1 : 2))));
        // (Along the line, and across it, in the world's x and z)
        const [ax, az] = axis === 0 ? [1, 0] : [0, 1];
        const [cx, cz] = axis === 0 ? [0, 1] : [1, 0];
        const world = (s, across) => [axis === 0 ? s + cx * across : at + cx * across, axis === 0 ? at + cz * across : s + cz * across];
        // (Its faces turned out: running along x, across is z, and the winding the other way)
        const face = axis === 0 ? (a, b, c) => [a, c, b] : (a, b, c) => [a, b, c];
        // A point of its face, `j` along its profile at `s` along it, as it grows there; at an end,
        // drawn in towards its middle (`scale` 1 none, 0 all) and on past it (`past` metres, `way`)
        const point = (s, j, growth, scale = 1, past = 0, way = 0) => {
            const { across, up, out } = profileAt(j, growth);
            // (Its face pushed in and out, in big lumps and small, from where it is in the world;
            // and lit a little each way as the small lumps turn)
            const foot = j === 0 || j === points - 1;
            const lump = (fractal(s, j * 0.45 + at * 0.11, 1.1, seed * 7 + 11, 2) - 0.5) * 2;
            const small = fractal(s * 2.3, j * 0.9 + at * 0.23, 1, seed * 7 + 13, 1) - 0.5;
            const pushed = (growth.lumps * lump + 0.07 * small) * (foot ? 0.3 : 1);
            const middle = growth.height * 0.42;
            const [x, z] = world(s + way * past, (across + out[0] * pushed) * scale);
            const height = foot ? up : middle + (up + out[1] * pushed - middle) * scale;
            const y = groundAt(x, z) + height;
            const along = (way ? way * (1 - scale) : 0) + small * 0.9;
            const normal = new THREE.Vector3(cx * out[0] * scale + ax * along, out[1] * scale + (lump * 0.25 + small * 0.5) * 0.4, cz * out[0] * scale + az * along).normalize();
            const shade = profileShade(height / growth.height, lump + small);
            // (Its tips, at the top, lighter and yellower in the sun)
            const tips = Math.min(1, Math.max(0, (height / growth.height - 0.75) / 0.25));

            return { x, y, z, across: (across + out[0] * pushed) * scale, height, normal, colour: [shade * (0.96 + 0.1 * tips), shade * (1 + 0.05 * tips), shade * (0.92 - 0.1 * tips)] };
        };
        const add = (lists, { x, y, z, normal, colour }, u, v) => {
            lists.position.push(x - ox, y, z - oy);
            lists.normal.push(normal.x, normal.y, normal.z);
            lists.uv.push(u, v);
            lists.color.push(...colour);
        };
        const first = body.position.length / 3;
        // (How it grows at each ring, kept for its sprigs)
        const growths = [];
        let top = -Infinity;

        for (let r = 0; r <= rings; r++) {
            if (r > 0 && r % RINGS_A_STEP === 0) {
                yield;
            }

            const s = from + ((to - from) * r) / rings;
            const growth = growthAt(run, s);
            let [arc, last] = [0, null];

            growths.push(growth);

            for (let j = 0; j < points; j++) {
                const at = point(s, j, growth);

                arc += last ? Math.hypot(at.x - last.x, at.y - last.y, at.z - last.z) : 0;
                last = at;
                top = Math.max(top, at.y);
                add(body, at, s / LEAVES_METRES, arc / LEAVES_METRES);
            }

            if (r > 0) {
                const [a, b] = [first + (r - 1) * points, first + r * points];

                for (let j = 0; j < points - 1; j++) {
                    body.index.push(...face(a + j, b + j, a + j + 1), ...face(a + j + 1, b + j, b + j + 1));
                }
            }
        }

        // (Closed where it ends: rounded off over a few rings, each smaller and further past its
        // last, to a point; the leaves' picture laid on them as seen from the end)
        for (const [end, s, way] of [[ends[0], from, -1], [ends[1], to, 1]]) {
            if (!end) {
                continue;
            }

            const growth = growthAt(run, s);
            const half = growth.width * 0.5;
            const rounding = [[1, 0], [0.82, 0.22], [0.52, 0.4], [0.2, 0.52]];
            const start = body.position.length / 3;

            rounding.forEach(([scale, past], k) => {
                for (let j = 0; j < points; j++) {
                    const at = point(s, j, growth, scale, past * half, way);

                    add(body, at, at.across / LEAVES_METRES + 5, at.height / LEAVES_METRES);
                }

                if (k > 0) {
                    const [a, b] = way > 0 ? [start + (k - 1) * points, start + k * points] : [start + k * points, start + (k - 1) * points];

                    for (let j = 0; j < points - 1; j++) {
                        body.index.push(...face(a + j, b + j, a + j + 1), ...face(a + j + 1, b + j, b + j + 1));
                    }
                }
            });

            const tip = body.position.length / 3;
            const ring = start + (rounding.length - 1) * points;
            const [x, z] = world(s + way * half * 0.6, 0);

            add(body, { x, y: groundAt(x, z) + growth.height * 0.42, z, normal: new THREE.Vector3(ax * way, 0.3, az * way).normalize(), colour: [0.9, 0.94, 0.86].map((v) => v * profileShade(0.42, 0)) }, 5, (growth.height * 0.42) / LEAVES_METRES);

            // (All the way round, its feet too: no notch under its point)
            for (let j = 0; j < points; j++) {
                const next = (j + 1) % points;

                body.index.push(...(way < 0 ? face(ring + next, tip, ring + j) : face(ring + j, tip, ring + next)));
            }
        }

        // Its sprigs: over its face from low on one side, over its top, to low on the other, at
        // different depths in it, turned every which way but mostly out
        const count = Math.round((to - from) * HEDGES.sprigs * sprigs);

        for (let k = 0; k < count; k++) {
            if (k > 0 && k % (RINGS_A_STEP * 3) === 0) {
                yield;
            }

            const h = (n) => hashOf(Math.floor(from * 13 + k), Math.floor(at * 7) + axis * 9973, seed * 31 + n);
            const s = from + (to - from) * h(1);
            const growth = growths[Math.round(((s - from) / (to - from)) * rings)];
            const p = 1.4 + h(2) * (points - 3.8);
            const { across, up, out } = profileAt(p, growth);
            const size = HEDGES.sprig[0] + (HEDGES.sprig[1] - HEDGES.sprig[0]) * h(3);
            const depth = (h(11) - 0.35) * 0.22;
            const [x, z] = world(s, across + out[0] * depth);
            const centre = new THREE.Vector3(x - ox, groundAt(x, z) + up + out[1] * depth, z - oy);
            const outward = new THREE.Vector3(cx * out[0], out[1], cz * out[0]);
            const facing = outward.clone().add(new THREE.Vector3(h(4) - 0.5, h(5) - 0.5, h(6) - 0.5).multiplyScalar(1.4)).normalize();
            const right = new THREE.Vector3().crossVectors(facing, new THREE.Vector3(h(7) - 0.5, h(8) - 0.5, h(9) - 0.5)).normalize();
            const upward = new THREE.Vector3().crossVectors(right, facing).normalize();
            const base = cards.position.length / 3;
            const shade = profileShade(up / growth.height, depth * 6) * (0.88 + 0.24 * h(10));
            const tips = Math.min(1, Math.max(0, (up / growth.height - 0.75) / 0.25));
            const colour = [shade * (0.96 + 0.1 * tips), shade * (1 + 0.05 * tips), shade * (0.92 - 0.1 * tips)];

            for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
                const corner = centre.clone().addScaledVector(right, (u - 0.5) * size).addScaledVector(upward, (v - 0.5) * size);

                add(cards, { x: corner.x + ox, y: corner.y, z: corner.z + oy, normal: outward, colour }, u, v);
            }

            cards.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }

        const [x0, z0] = world(from, -HEDGES.width[1] / 2);
        const [x1, z1] = world(to, HEDGES.width[1] / 2);

        boxes.push({ min: [Math.min(x0, x1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(z0, z1)], top });
    }

    const object = new THREE.Group();
    const { body: bodyMaterial, sprigs: sprigMaterial } = hedgeMaterials();

    object.name = "hedgerows";

    for (const [lists, material, name] of [[body, bodyMaterial, "hedges"], [cards, sprigMaterial, "hedge sprigs"]]) {
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

        const mesh = new THREE.Mesh(geometry, material);

        mesh.name = name;
        mesh.position.set(ox, 0, oy);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.receiveShadow = true;
        mesh.castShadow = material === bodyMaterial;
        object.add(mesh);
    }

    return { object, boxes };
}

// How light a hedge is at a share of the way up it (0 at its foot, 1 at its top), and in a lump
// or a hollow of its face (-1 to 1): dark at its foot, where its stems are, and in its hollows
function profileShade(up, lump) {
    const t = Math.min(1, Math.max(0, up / 0.55));

    return (0.32 + 0.68 * t * t * (3 - 2 * t)) * (0.72 + 0.28 * (lump + 1) * 0.5) * (up > 0.85 ? 1.05 : 1);
}

let materials = null;

/**
 * The hedges' materials, their pictures painted once (none in Node): { body (its leaves, tiling,
 * opaque), sprigs (a sprig of leaves, cut out of its picture: soft-edged where it's drawn
 * multisampled, as the trees' leaves are) }.
 */
export function hedgeMaterials() {
    if (!materials) {
        const drawn = typeof document !== "undefined";
        const texture = (canvas, repeat) => {
            const result = new THREE.CanvasTexture(canvas);

            result.colorSpace = THREE.SRGBColorSpace;
            result.anisotropy = 4;
            result.wrapS = result.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;

            return result;
        };
        const body = new THREE.MeshLambertMaterial({ name: "hedge", color: drawn ? 0xffffff : 0x3a5a26, map: drawn ? texture(facePicture(), true) : null, vertexColors: true });
        const sprigs = new THREE.MeshLambertMaterial({
            name: "hedge sprigs",
            color: drawn ? 0xffffff : 0x46682c,
            map: drawn ? texture(sprigPicture(), false) : null,
            vertexColors: true,
            alphaTest: 0.45,
            alphaToCoverage: true,
            side: THREE.DoubleSide,
        });

        // (Seen from behind, a sprig's lit as from in front, as the hedge is)
        sprigs.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""));
        };
        sprigs.customProgramCacheKey = () => "hedge sprigs";
        materials = { body, sprigs };
    }

    return materials;
}

// Hawthorn's greens, darkest first, and its blossom's white
const GREENS = ["#24401a", "#2f5220", "#3d6527", "#4c762e", "#5d8838"];
const BLOSSOM = "#f1ede2";

// A hedge's face: small leaves packed over the dark inside of it, a few twigs, blossom here and
// there; 256 pixels square, tiling every way (each leaf drawn again across the edges it crosses)
function facePicture() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const size = 256;
    const random = seeded(71);

    canvas.width = canvas.height = size;
    context.fillStyle = "#16260f";
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

    for (let k = 0; k < 30; k++) {
        const [x, y, turn, length] = [random() * size, random() * size, random() * Math.PI * 2, 20 + random() * 30];

        wrapped(x, y, length, () => {
            context.rotate(turn);
            context.beginPath();
            context.moveTo(0, 0);
            context.lineTo(0, -length);
            context.stroke();
        });
    }

    // (Leaves, the darker ones first, deeper in)
    for (let layer = 0; layer < GREENS.length; layer++) {
        for (let k = 0; k < 150; k++) {
            const [x, y, turn, length] = [random() * size, random() * size, random() * Math.PI * 2, 13 + random() * 9];

            wrapped(x, y, length, () => {
                context.rotate(turn);
                leaf(context, "lobed", length, GREENS[layer], "rgba(16, 30, 8, 0.5)");
            });
        }
    }

    // (Blossom: little clusters of white flowers)
    for (let k = 0; k < 11; k++) {
        const [x, y] = [random() * size, random() * size];

        wrapped(x, y, 12, () => blossom(context, random));
    }

    return canvas;
}

// A sprig of hawthorn: a twig with small leaves all along it and round its tip, and now and then
// a cluster of blossom; 128 pixels square, on nothing
function sprigPicture() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const random = seeded(29);

    canvas.width = canvas.height = 128;
    context.lineCap = "round";
    context.strokeStyle = "#3a2c1e";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(64, 124);
    context.quadraticCurveTo(58, 70, 66, 16);
    context.stroke();

    for (let k = 0; k < 46; k++) {
        const t = random();
        const [x, y] = [64 + (random() - 0.5) * 70 * (0.4 + t * 0.6), 120 - t * 104 + (random() - 0.5) * 16];

        context.save();
        context.translate(x, y);
        context.rotate((x < 64 ? -1 : 1) * (0.5 + random() * 1.1) + (random() - 0.5) * 0.6);
        leaf(context, "lobed", 15 + random() * 10, GREENS[1 + Math.floor(random() * (GREENS.length - 1))], "rgba(16, 30, 8, 0.5)");
        context.restore();
    }

    context.save();
    context.translate(58 + random() * 12, 30 + random() * 30);
    blossom(context, random);
    context.restore();

    return canvas;
}

// A cluster of hawthorn's small white flowers round (0, 0)
function blossom(context, random) {
    for (let f = 0; f < 4 + Math.floor(random() * 4); f++) {
        const [fx, fy] = [(random() - 0.5) * 14, (random() - 0.5) * 14];

        context.fillStyle = BLOSSOM;
        context.beginPath();
        context.arc(fx, fy, 2.2 + random(), 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#d8c27a";
        context.beginPath();
        context.arc(fx, fy, 0.8, 0, Math.PI * 2);
        context.fill();
    }
}

// Numbers from 0 to 1, the same every time from the same seed
function seeded(seed) {
    let k = 0;

    return () => hashOf(k++, 17, seed);
}
