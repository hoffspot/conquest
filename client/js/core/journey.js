// The way across the world to somewhere far (the world map's pin, or a double tap on it: the
// terrain plan's M7g, §9 Pins on the world map). Found over the world plan's cells (32 m a side),
// not the navigation meshes: their tiles are baked only round the players, and a way kilometres
// long would bake hundreds of them. Each cell's ground is worked out once a world (crossingsOf):
// the sea and the lakes not crossed, nor a river but on a road's bridge or at a ford (a mountain
// stream waded anywhere), nor ground rising more than JOURNEY.steepest from one cell's middle to
// the next; the roads cheaper to go by, a climb dearer. The way's then pulled straight wherever it
// can see along the cells (wayAcross). Near the player the navigation mesh takes over (the
// battle's own ways, and the line drawn along the ground).
//
// Exact maths only (it's in core; nothing here's sent or kept, but it's all the same anywhere).

import { landHeight } from "./terrain/height.js";
import { RUNNING, watersOf } from "./terrain/waters.js";
import { CELL, CELLS, WATER } from "./worldplan/plan.js";
import { Queue } from "./worldplan/queue.js";

/**
 * How ways across the world are found: the steepest a step from one cell to the next may climb
 * (rise over run: 37°, as the navigation meshes'), how dear a climb is (its length again this
 * many times for each in a hundred it rises), what a metre counts for along a road, through a
 * mountain stream and across a ford, and the most cells looked at before giving up.
 */
export const JOURNEY = Object.freeze({ steepest: 0.75, climb: 6, road: 0.6, stream: 1.6, ford: 2.5, most: 70000 });

/** Each cell's ground (crossingsOf): not crossed, open, a road, a stream or a ford. */
export const CROSSING = Object.freeze({ none: 0, open: 1, road: 2, stream: 3, ford: 4 });

const COSTS = Object.freeze({ [CROSSING.open]: 1, [CROSSING.road]: JOURNEY.road, [CROSSING.stream]: JOURNEY.stream, [CROSSING.ford]: JOURNEY.ford });

// The eight ways out of a cell: [across, down], and how far each goes (cells)
const STEPS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
const SQRT2 = Math.sqrt(2);

const made = new WeakMap();

/**
 * Each cell of a world plan's ground, for finding ways across it ({ kind: CROSSING, a Uint8Array
 * a cell; height: the land's at its middle, metres, a Float32Array }): worked out the first time
 * it's wanted (about a tenth of a second), and kept with the plan.
 */
export function crossingsOf(plan) {
    if (!made.has(plan)) {
        const waters = watersOf(plan);
        const running = waters.running;
        const kind = new Uint8Array(CELLS * CELLS);
        const height = new Float32Array(CELLS * CELLS);

        for (let k = 0; k < CELLS * CELLS; k++) {
            const [i, j] = [k % CELLS, Math.floor(k / CELLS)];

            height[k] = landHeight(plan, (i + 0.5) * CELL, (j + 0.5) * CELL);

            if (plan.water[k] === WATER.sea || plan.water[k] === WATER.lake) {
                kind[k] = CROSSING.none;
            } else if (running[k] === RUNNING.river) {
                // (A river's cell: crossed only at a ford, or a mountain stream's)
                const { pieces } = waters.course(k);

                kind[k] = pieces.some(({ stream }) => stream) ? CROSSING.stream : pieces.some(({ ford }) => ford[0] > 0 || ford[1] > 0) ? CROSSING.ford : CROSSING.none;
            } else if (plan.road[k]) {
                kind[k] = CROSSING.road;
            } else {
                kind[k] = running[k] === RUNNING.stream ? CROSSING.stream : CROSSING.open;
            }
        }

        made.set(plan, { kind, height });
    }

    return made.get(plan);
}

// The cell a point's in ([x, y] metres), kept on the world
const cellAt = ([x, y]) => Math.min(CELLS - 1, Math.max(0, Math.floor(y / CELL))) * CELLS + Math.min(CELLS - 1, Math.max(0, Math.floor(x / CELL)));

/**
 * A way across the world from one point to another ([x, y], metres): its points, from `from` to
 * `to` (each turn's: the cells' middles between), or null if there's none (the far side of the
 * sea, a lake's island, up a cliff, or nothing found soon enough). The cells the ends are in are
 * always crossed (a bank, a shore).
 */
export function wayAcross(plan, from, to) {
    const { kind, height } = crossingsOf(plan);
    const [start, goal] = [cellAt(from), cellAt(to)];
    const crossed = (k) => kind[k] !== CROSSING.none || k === start || k === goal;
    const open = (k) => (kind[k] === CROSSING.none ? CROSSING.open : kind[k]);

    if (start === goal) {
        return [[...from], [...to]];
    }

    const [gi, gj] = [goal % CELLS, Math.floor(goal / CELLS)];
    const guess = (k) => {
        const [di, dj] = [Math.abs((k % CELLS) - gi), Math.abs(Math.floor(k / CELLS) - gj)];

        // (Octile: as far as it is, along a road)
        return (Math.max(di, dj) + (SQRT2 - 1) * Math.min(di, dj)) * CELL * JOURNEY.road;
    };

    const cost = new Float64Array(CELLS * CELLS).fill(Infinity);
    const came = new Int32Array(CELLS * CELLS).fill(-1);
    const done = new Uint8Array(CELLS * CELLS);
    const queue = new Queue();
    let looked = 0;

    cost[start] = 0;
    queue.push(start, guess(start));

    while (queue.size && looked < JOURNEY.most) {
        const k = queue.pop().item;

        if (done[k]) {
            continue;
        }

        done[k] = 1;
        looked++;

        if (k === goal) {
            break;
        }

        const [i, j] = [k % CELLS, Math.floor(k / CELLS)];

        for (const [di, dj] of STEPS) {
            const [ni, nj] = [i + di, j + dj];

            if (ni < 0 || nj < 0 || ni >= CELLS || nj >= CELLS) {
                continue;
            }

            const n = nj * CELLS + ni;

            if (done[n] || !crossed(n)) {
                continue;
            }

            // (Corner to corner only past two cells that can be crossed, or from road to road:
            // a road crosses a river so, on its bridge)
            const diagonal = di !== 0 && dj !== 0;

            if (diagonal && !(crossed(j * CELLS + ni) && crossed(nj * CELLS + i)) && !(kind[k] === CROSSING.road && kind[n] === CROSSING.road)) {
                continue;
            }

            const length = (diagonal ? SQRT2 : 1) * CELL;
            const climb = Math.abs(height[n] - height[k]) / length;

            if (climb > JOURNEY.steepest && n !== goal && k !== start) {
                continue;
            }

            const step = length * ((COSTS[open(k)] + COSTS[open(n)]) / 2) * (1 + JOURNEY.climb * climb);

            if (cost[k] + step < cost[n]) {
                cost[n] = cost[k] + step;
                came[n] = k;
                queue.push(n, cost[n] + guess(n));
            }
        }
    }

    if (!done[goal]) {
        return null;
    }

    const cells = [];

    for (let k = goal; k !== -1; k = came[k]) {
        cells.push(k);
    }

    cells.reverse();

    return straightened(plan, cells, from, to);
}

// A way's cells pulled straight wherever one can be seen from another along cells as easy to
// cross (no water, no road left for open ground): its points, from `from` to `to`
function straightened(plan, cells, from, to) {
    const { kind } = crossingsOf(plan);
    const middle = (k) => [((k % CELLS) + 0.5) * CELL, (Math.floor(k / CELLS) + 0.5) * CELL];
    const points = [[...from]];
    let at = 0;

    while (at < cells.length - 1) {
        let next = at + 1;

        // (As far on as it can see, along cells all of one kind: open ground's, or a road's)
        for (let k = cells.length - 1; k > at + 1; k--) {
            if (sees(kind, cells[at], cells[k])) {
                next = k;
                break;
            }
        }

        points.push(next === cells.length - 1 ? [...to] : middle(cells[next]));
        at = next;
    }

    if (points.length === 1) {
        points.push([...to]);
    }

    return points;
}

// Whether every cell along the line between two cells' middles is the same kind as the first
// (open ground, or road), stepping through them a quarter cell at a time
function sees(kind, a, b) {
    const [ai, aj, bi, bj] = [a % CELLS, Math.floor(a / CELLS), b % CELLS, Math.floor(b / CELLS)];
    const along = Math.max(Math.abs(bi - ai), Math.abs(bj - aj)) * 4;
    const own = kind[a];

    if (own !== CROSSING.open && own !== CROSSING.road) {
        return false;
    }

    for (let s = 1; s < along; s++) {
        const [i, j] = [Math.floor(ai + 0.5 + ((bi - ai) * s) / along), Math.floor(aj + 0.5 + ((bj - aj) * s) / along)];

        if (kind[j * CELLS + i] !== own) {
            return false;
        }
    }

    return true;
}

/** How long a way is (metres: its points', [x, y]). */
export function lengthOf(points) {
    let length = 0;

    for (let k = 1; k < points.length; k++) {
        length += Math.sqrt((points[k][0] - points[k - 1][0]) * (points[k][0] - points[k - 1][0]) + (points[k][1] - points[k - 1][1]) * (points[k][1] - points[k - 1][1]));
    }

    return length;
}

/** Where along a way (its points, [x, y]) a point is nearest: { along (metres from its start), off (metres from it), segment }. */
export function nearestAlong(points, [x, y]) {
    let best = { along: 0, off: Infinity, segment: 0 };
    let walked = 0;

    for (let k = 1; k < points.length; k++) {
        const [ax, ay] = points[k - 1];
        const [dx, dy] = [points[k][0] - ax, points[k][1] - ay];
        const long = Math.sqrt(dx * dx + dy * dy);
        const t = long > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (long * long))) : 0;
        const [px, py] = [ax + dx * t, ay + dy * t];
        const off = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));

        if (off < best.off) {
            best = { along: walked + long * t, off, segment: k - 1 };
        }

        walked += long;
    }

    return best;
}

/** The point a distance along a way (its points, [x, y]; metres from its start), at its end past it. */
export function pointAlong(points, distance) {
    let left = distance;

    for (let k = 1; k < points.length; k++) {
        const [ax, ay] = points[k - 1];
        const [dx, dy] = [points[k][0] - ax, points[k][1] - ay];
        const long = Math.sqrt(dx * dx + dy * dy);

        if (left <= long && long > 0) {
            return [ax + (dx * left) / long, ay + (dy * left) / long];
        }

        left -= long;
    }

    return [...points.at(-1)];
}

/** The rest of a way from a distance along it (metres): its points from there on. */
export function wayFrom(points, distance) {
    let left = distance;

    for (let k = 1; k < points.length; k++) {
        const [ax, ay] = points[k - 1];
        const [dx, dy] = [points[k][0] - ax, points[k][1] - ay];
        const long = Math.sqrt(dx * dx + dy * dy);

        if (left < long) {
            return [[ax + (dx * left) / (long || 1), ay + (dy * left) / (long || 1)], ...points.slice(k).map((point) => [...point])];
        }

        left -= long;
    }

    return [[...points.at(-1)]];
}
