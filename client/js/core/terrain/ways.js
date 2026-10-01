// Ways over the land that keep to a grade, for roads too steep to run straight and for paths up
// into the hills and mountains: found over a lattice of points WAYS.grid metres apart, sixteen
// ways out of each (the eight round it and the eight a knight's move off). A step steeper than the
// grade asked costs dearly, the more the steeper (WAYS.steep), and one far steeper (WAYS.hard
// times the grade) isn't taken at all, nor any into a lake or the sea, so a way climbs a steep
// slope across it, turning back on itself in hairpins where it must; and turning costs a little
// (WAYS.turn), so it runs long and straight between them. The land's own lie is what's climbed
// (height.js landHeight): a way's later cut into it and built up over it to its grade, and its
// bridges found where it crosses rivers.
//
// The same every time, in every browser: exact maths, and a queue that gives back the first put in
// of any that cost the same (worldplan/queue.js).

import { Queue } from "../worldplan/queue.js";
import { landHeight, stillLevelAt } from "./height.js";

/**
 * How ways are found: the lattice's spacing (metres); how much a step steeper than the grade costs
 * (its length again this many times for each grade it's steeper by), and how many times the grade
 * no step may be steeper than; how much turning costs (its length again this many times for a
 * quarter turn); and how many points are looked at, at most, before giving up.
 */
export const WAYS = Object.freeze({ grid: 4, steep: 12, hard: 3, turn: 0.4, eager: 1.5, most: 120000 });

// The sixteen ways out of a point: [across, down] in lattice steps
const STEPS = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
    [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1],
];
const LENGTHS = STEPS.map(([i, j]) => Math.sqrt(i * i + j * j));

/**
 * A way over the land from `from` to `to` ([x, y], metres), within `box` ([x0, y0, x1, y1],
 * metres), climbing no faster than `grade` (rise over run) wherever it can, and never through a
 * point `avoid` ((x, y) => boolean) says to keep out of but its ends: its points ([x, y], metres,
 * from `from` to `to`, at each turn), or null if there's none (or none found soon enough).
 */
export function wayOver(plan, from, to, { grade, box, avoid = null }) {
    const { grid } = WAYS;
    const [x0, y0] = [box[0], box[1]];
    const across = Math.floor((box[2] - x0) / grid) + 1;
    const down = Math.floor((box[3] - y0) / grid) + 1;
    const count = across * down;
    const at = (k) => [x0 + (k % across) * grid, y0 + Math.floor(k / across) * grid];
    const nearest = ([x, y]) => Math.min(down - 1, Math.max(0, Math.round((y - y0) / grid))) * across + Math.min(across - 1, Math.max(0, Math.round((x - x0) / grid)));

    const [start, goal] = [nearest(from), nearest(to)];

    // Each point's land, and whether it's under a lake or the sea or kept out of, looked at when
    // first wanted
    const heights = new Float64Array(count).fill(NaN);
    const height = (k) => {
        if (Number.isNaN(heights[k])) {
            const [x, y] = at(k);
            const land = landHeight(plan, x, y);
            const still = stillLevelAt(plan, x, y);
            const out = avoid !== null && k !== start && k !== goal && avoid(x, y);

            heights[k] = out || (still !== null && land < still) ? -Infinity : land;
        }

        return heights[k];
    };

    const [gx, gy] = at(goal);
    const cost = new Float64Array(count).fill(Infinity);
    const came = new Int32Array(count).fill(-1);
    const heading = new Int8Array(count).fill(-1);
    const done = new Uint8Array(count);
    const queue = new Queue();
    const guess = (k) => {
        const [x, y] = at(k);

        return WAYS.eager * Math.sqrt((x - gx) * (x - gx) + (y - gy) * (y - gy));
    };

    cost[start] = 0;
    queue.push(start, guess(start));

    let looked = 0;

    while (queue.size && looked < WAYS.most) {
        const k = queue.pop().item;

        if (done[k]) {
            continue;
        }

        done[k] = 1;
        looked++;

        if (k === goal) {
            break;
        }

        const [i, j] = [k % across, Math.floor(k / across)];
        const here = height(k);

        for (let s = 0; s < STEPS.length; s++) {
            const [ni, nj] = [i + STEPS[s][0], j + STEPS[s][1]];

            if (ni < 0 || nj < 0 || ni >= across || nj >= down) {
                continue;
            }

            const n = nj * across + ni;
            const there = height(n);

            if (done[n] || there === -Infinity) {
                continue;
            }

            const length = LENGTHS[s] * grid;
            const climb = Math.abs(there - here) / length;

            if (climb > grade * WAYS.hard) {
                continue;
            }

            // (Turning: how far from straight on, 0 to 2, from the way it came)
            const last = heading[k];
            const turn = last < 0 ? 0 : 1 - (STEPS[s][0] * STEPS[last][0] + STEPS[s][1] * STEPS[last][1]) / (LENGTHS[s] * LENGTHS[last]);
            const step = length * (1 + WAYS.steep * Math.max(0, climb - grade) / grade + WAYS.turn * turn);

            if (cost[k] + step < cost[n]) {
                cost[n] = cost[k] + step;
                came[n] = k;
                heading[n] = s;
                queue.push(n, cost[n] + guess(n));
            }
        }
    }

    if (!done[goal]) {
        return null;
    }

    // Back from its end to its start, keeping only the points it turns at
    const points = [];

    for (let k = goal; k >= 0; k = came[k]) {
        if (k === goal || came[k] < 0 || heading[k] !== heading[came[k]]) {
            points.push(at(k));
        }
    }

    points.reverse();
    points[0] = [...from];
    points[points.length - 1] = [...to];

    return points;
}

/**
 * A way's corners cut (Chaikin's: each corner replaced by points a quarter and three quarters of
 * the way along the sides meeting there), `times` times over, its ends kept.
 */
export function rounded(points, times = 2) {
    let way = points;

    for (let t = 0; t < times; t++) {
        const next = [way[0]];

        for (let k = 0; k < way.length - 1; k++) {
            const [[ax, ay], [bx, by]] = [way[k], way[k + 1]];

            if (k > 0) {
                next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
            }

            if (k < way.length - 2) {
                next.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
            }
        }

        next.push(way.at(-1));
        way = next;
    }

    return way;
}
