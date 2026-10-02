// Stone steps up the trails' steepest stretches (core/terrain/ground.js STAIRS: where a foot path's
// land is too steep for a path, it climbs at GRADE.steps instead): a stone across the path for
// every STAIRS.rise metres it climbs, its tread level, its riser facing down the path, set into the
// ground. The ground under them still rises smoothly (it's what's walked, and what the navigation
// mesh is made from): each tread stands just over it at its back, so none of it shows through, and
// each riser goes down into it at its front. Of old stone the colour of the land's own rock
// (STEP_STONE), drawn with the atlas, one mesh a chunk.

import * as THREE from "three";
import { hashOf } from "../../../core/noise.js";
import { ROAD, STAIRS } from "../../../core/terrain/ground.js";
import { TRAILS } from "../../../core/trails.js";
import { LAYERS, atlasMaterial } from "../engine/atlas.js";
import { MATERIALS } from "../engine/painters.js";
import { LOOKS, Mesher } from "./wilds.js";

/**
 * The stones (metres): how far past the path's edges they reach, how far each tread stands over
 * the ground at its back, how deep each is set into the ground in front, the shortest and longest
 * a tread is (the gentler the climb, the longer: a step every STAIRS.rise of it), how far a
 * step's tread is split into two stones across it where it's wider than `split` (as often as
 * not), how much their tones vary, how far their front edges wander, and how much darker a riser
 * is at its foot than its top.
 */
export const STONES = Object.freeze({ beyond: 0.15, proud: 0.03, set: 0.2, tread: [0.3, 0.9], split: 0.5, tone: 0.16, ragged: 0.07, foot: 0.5 });

/**
 * What the steps are made of, by the land's rock (kits/wilds.js LOOKS): its old stone, laid in
 * courses long ago, mossy where it faces up and streaked (the atlas weathers old stone: AGED).
 */
export const STEP_STONE = Object.freeze({ rock: "stone-old", "rock-pale": "stone-moon-old", "rock-dark": "stone-black-old", "rock-red": "stone-lime-old" });

// Each layer's index, and how many metres one copy of its texture covers
const LAYER = Object.fromEntries(LAYERS.map((name, k) => [name, k]));
const METRES = Object.fromEntries(Object.entries(MATERIALS).map(([name, { world }]) => [name, world / 5]));

/**
 * The stones of the steps up the foot paths `lines` (the overworld's: { planned, kind }) whose
 * middles are in a box ([x0, y0, x1, y1], metres), each { x, y (its tread's middle), along ([x, y]:
 * the way up the path, a unit), deep (its tread, metres along the path), half (half its width
 * across), top, bottom (heights), seed }. `profileOf(line)` is the ground's (Ground.profileOf);
 * `groundAt(x, y)` the ground's height.
 */
export function stonesOf(lines, profileOf, groundAt, [x0, y0, x1, y1]) {
    const stones = [];

    for (const line of lines) {
        const { heights, starts, steps } = profileOf(line);

        if (!steps.length) {
            continue;
        }

        const points = line.planned;
        const length = starts.at(-1);
        // (The path's height and its middle's point, `s` metres along it)
        const height = (s) => {
            const t = Math.max(0, Math.min(length, s)) / ROAD.step;
            const k = Math.min(heights.length - 2, Math.floor(t));

            return heights[k] + (heights[k + 1] - heights[k]) * (t - k);
        };
        const pointAt = (s) => {
            let k = 0;

            while (k < starts.length - 2 && starts[k + 1] < s) {
                k++;
            }

            const t = Math.max(0, Math.min(1, (s - starts[k]) / (starts[k + 1] - starts[k] || 1)));
            const [[ax, ay], [bx, by]] = [points[k], points[k + 1]];

            return [ax + (bx - ax) * t, ay + (by - ay) * t];
        };

        for (const [from, to] of steps) {
            let s = from;

            while (s < to - STONES.tread[0] / 2) {
                // (A step every STAIRS.rise of the climb: its tread as long as that takes here)
                const ahead = Math.min(to, s + 1) - s;
                const grade = Math.abs(height(s + ahead) - height(s)) / ahead;
                const tread = Math.max(STONES.tread[0], Math.min(STONES.tread[1], STAIRS.rise / Math.max(grade, 1e-3)));
                // (The last of a run as long as what's left, if what's left is too short for one)
                const end = to - (s + tread) < STONES.tread[0] ? to : s + tread;
                const [a, b] = [pointAt(s), pointAt(end)];
                const [x, y] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                const run = Math.hypot(b[0] - a[0], b[1] - a[1]);

                if (x >= x0 && y >= y0 && x < x1 && y < y1 && run > 0.01) {
                    // (Facing down the path: the way up it is from its lower end to its higher)
                    const up = height(end) >= height(s) ? 1 : -1;
                    const along = [((b[0] - a[0]) / run) * up, ((b[1] - a[1]) / run) * up];
                    const half = TRAILS.half + STONES.beyond;
                    // (Its tread as high as the path at its back, so none of the path shows
                    // through it; past the path's edges it goes into the bank, or stands over the
                    // ground falling away, set into it as deep below the lowest of it)
                    const point = (u, v) => groundAt(x + along[0] * u - along[1] * v, y + along[1] * u + along[0] * v);
                    const back = [-1, 0, 1].map((across) => point(run / 2, TRAILS.half * across));
                    const corners = [-1, 1].flatMap((across) => [-1, 1].map((ends) => point((run / 2) * ends, half * across)));

                    stones.push({
                        x,
                        y,
                        along,
                        deep: run,
                        half,
                        top: Math.max(...back, point(0, 0)) + STONES.proud,
                        bottom: Math.min(...corners) - STONES.set,
                        seed: hashOf(Math.round(x * 16), Math.round(y * 16), 2753),
                    });
                }

                s = end;
            }
        }
    }

    return stones;
}

/**
 * The stones (stonesOf's) drawn: a mesh at the chunk's corner (`[x0, y0]`, metres), with the
 * atlas, casting shadows; or null if there are none. `landAt(x, y)` is each point's land.
 */
export function stepsMesh(stones, landAt, [x0, y0]) {
    if (!stones.length) {
        return null;
    }

    const mesher = new Mesher(stones.length * 48);
    const linear = new THREE.Color();

    for (const { x, y, along, deep, half, top, bottom, seed } of stones) {
        const stone = STEP_STONE[(LOOKS[landAt(Math.floor(x), Math.floor(y))] ?? LOOKS.meadow).stone] ?? STEP_STONE.rock;
        const [layer, uvScale] = [LAYER[stone], METRES[stone]];
        const [ux, uy] = along;
        const [cx, cy] = [x - x0, y - y0];
        // (Across the path, left to right going up it)
        const [ax, ay] = [uy, -ux];
        // (One stone across, or two side by side, splitting it somewhere near its middle)
        const split = half * 2 > STONES.split * 2 && seed < 0.5 ? -0.25 * half + seed * half : null;
        const spans = split === null ? [[-half, half]] : [[-half, split - 0.01], [split + 0.01, half]];

        spans.forEach(([left, right], k) => {
            const own = hashOf(Math.floor(seed * 1e6), k, 41);
            const tone = 1 + (own - 0.5) * 2 * STONES.tone;
            // (Its front edge wandering a little, as a stone's does: and the next one's back
            // under it, so none of the ground shows between them)
            const front = -deep / 2 + (own - 0.5) * 2 * STONES.ragged;
            const back = deep / 2 + STONES.ragged;
            const lift = (hashOf(Math.floor(seed * 1e6), k, 59) - 0.5) * 0.02;
            const at = (u, v, h) => [cx + ux * u + ax * v, h, cy + uy * u + ay * v];
            const [high, low] = [top + lift, bottom];
            const [fl, fr, bl, br] = [at(front, left, high), at(front, right, high), at(back, left, high), at(back, right, high)];
            const [fld, frd, bld, brd] = [at(front, left, low), at(front, right, low), at(back, left, low), at(back, right, low)];

            linear.setRGB(tone, tone, tone);

            const [lit, worn, dark] = [[linear.r, linear.g, linear.b], [linear.r * 1.06, linear.g * 1.06, linear.b * 1.06], [linear.r * STONES.foot, linear.g * STONES.foot, linear.b * STONES.foot]];
            // (A face of four corners, wound to face `out`, each corner its colour)
            const face = (corners, colours, out) => {
                const [p, q, r] = corners;
                const n = [(q[1] - p[1]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[1] - p[1]), (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]), (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])];
                const order = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? [0, 3, 2, 1] : [0, 1, 2, 3];

                mesher.quad(...order.map((k) => corners[k]), { layer, uvScale, colours: order.map((k) => colours[k]) });
            };

            // (The tread, worn a little paler; the riser, darker towards its foot; its sides)
            face([fl, fr, br, bl], [worn, worn, worn, worn], [0, 1, 0]);
            face([fld, frd, fr, fl], [dark, dark, lit, lit], [-ux, 0, -uy]);
            face([frd, brd, br, fr], [dark, dark, lit, lit], [ax, 0, ay]);
            face([bld, fld, fl, bl], [dark, dark, lit, lit], [-ax, 0, -ay]);
        });
    }

    const mesh = new THREE.Mesh(mesher.geometry(), atlasMaterial());

    mesh.name = "steps";
    mesh.position.set(x0, 0, y0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
}
