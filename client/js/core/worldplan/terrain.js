// The land of the world plan, on a grid of cells (CELL metres square): its height, how warm and
// wet it is, the sea round it, its rivers and lakes, which people's territory each cell is in,
// and what kind of land (biome) it is.
//
// The peoples' heartlands are put down first, anywhere, well apart; then the climate is made to
// suit them (each heartland takes its people's climate, and the land between blends from one to
// the next, with a few wild places of their own: frozen north, sodden marsh, scorched waste), so
// every people lives in its own climate however the lands fall. Mountains rise between the
// peoples, not in their heartlands; rain runs downhill to the sea, gathering into rivers, and
// fills hollows into lakes. Each people's territory spreads from its heartland as far as a day's
// walk or so (further on the flat, less over mountains and rivers), leaving wild land between.

import { createRandom, noise } from "../random.js";
import { Queue } from "./queue.js";
import { BIOME, RACES } from "./races.js";

/** How big the world is (metres a side), and its plan's cells (metres; cells a side). */
export const WORLD_SIZE = 8192;
export const CELL = 32;
export const CELLS = WORLD_SIZE / CELL;

/** Where the land meets the sea (height), and where it's mountains and snow-capped peaks. */
export const SEA_LEVEL = 0.12;
export const MOUNTAIN = 0.72;
export const PEAK = 0.86;

/** The plan's `water` layer: none, the sea, a lake, a river. */
export const WATER = Object.freeze({ none: 0, sea: 1, lake: 2, river: 3 });

// How far apart the heartlands are at least, and from the edge (cells)
const HEARTLANDS_APART = 72;
const HEARTLAND_MARGIN = 40;

// How far a territory reaches from its heartland (cells of flat land; mountains and rivers cost
// more), and how much climbing and crossing a river cost
const TERRITORY_REACH = 54;
const MARCHES = 12;
const CLIMB_COST = 5;
const RIVER_COST = 3;

// The wild places' climates, put as far from the heartlands as they can be
const WILD_CLIMATES = [
    { temperature: 0.04, moisture: 0.5 },
    { temperature: 0.1, moisture: 0.35 },
    { temperature: 0.5, moisture: 0.95 },
    { temperature: 0.78, moisture: 0.08 },
];

// The volcano: how far from the orcs' heartland (cells), how wide its slopes and ash fields are
const VOLCANO_FROM = [30, 38];
const VOLCANO_SLOPES = 11;
const ASH_FIELDS = 20;

// A river: this many cells' rain drains through it (more in wetter lands); a lake: a hollow at
// least this deep, of this many cells (a bigger hollow is a basin, a river running through it)
const RIVER_FLOW = 150;
const LAKE_DEPTH = 0.012;
const LAKE_CELLS = [5, 260];

const NEIGHBOURS = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
];

/** The cell's index for (x, y), or -1 off the grid. */
export const cellIndex = (x, y) => (x < 0 || y < 0 || x >= CELLS || y >= CELLS ? -1 : y * CELLS + x);

// The heartlands: one for each people, anywhere not too near the edge, well apart
function placeHeartlands(random) {
    let apart = HEARTLANDS_APART;

    for (let attempt = 0; ; attempt++) {
        const spots = [];

        for (let tries = 0; spots.length < RACES.length && tries < 400; tries++) {
            const spot = [random.int(HEARTLAND_MARGIN, CELLS - 1 - HEARTLAND_MARGIN), random.int(HEARTLAND_MARGIN, CELLS - 1 - HEARTLAND_MARGIN)];

            if (spots.every(([x, y]) => Math.hypot(x - spot[0], y - spot[1]) >= apart)) {
                spots.push(spot);
            }
        }

        if (spots.length === RACES.length) {
            return spots;
        }

        // (Very rarely they don't all fit: ask a little less)
        if (attempt % 5 === 4) {
            apart *= 0.95;
        }
    }
}

// The places furthest from all of `from` (and each other), for the wild climates
function furthest(from, count, random) {
    const chosen = [];

    for (let k = 0; k < count; k++) {
        let best = null;
        let bestDistance = -1;

        for (let tries = 0; tries < 300; tries++) {
            const spot = [random.int(12, CELLS - 13), random.int(12, CELLS - 13)];
            const distance = Math.min(...[...from, ...chosen].map(([x, y]) => Math.hypot(x - spot[0], y - spot[1])));

            if (distance > bestDistance) {
                best = spot;
                bestDistance = distance;
            }
        }

        chosen.push(best);
    }

    return chosen;
}

/**
 * The land: { heartlands ([x, y] cells, one for each of RACES), wilds (the wild climates'), volcano
 * ([x, y] cells), height, temperature, moisture
 * (Float32Array, 0 to 1), water (Uint8Array: WATER), flow (Float32Array: how much drains
 * through), territory (Uint8Array: 0 none, else RACES index + 1), cost (Float64Array: how far
 * into its territory), biome (Uint8Array: BIOME) }.
 */
export function shapeLand(seed) {
    const random = createRandom(seed * 7 + 11);
    const count = CELLS * CELLS;
    const heartlands = placeHeartlands(random);
    const wilds = furthest(heartlands, WILD_CLIMATES.length, random);

    // A volcano beyond the orcs' heartland, towards the middle of the world
    const [ox, oy] = heartlands[RACES.findIndex(({ id }) => id === "orc")];
    const inward = Math.atan2(CELLS / 2 - oy, CELLS / 2 - ox) + random.range(-1, 1);
    const out = random.range(...VOLCANO_FROM);
    const volcano = [Math.round(ox + Math.cos(inward) * out), Math.round(oy + Math.sin(inward) * out)];
    const anchors = [
        ...heartlands.map(([x, y], k) => ({ x, y, ...RACES[k].climate, weight: 2 })),
        ...wilds.map(([x, y], k) => ({ x, y, ...WILD_CLIMATES[k], weight: 1 })),
    ];

    const height = new Float32Array(count);
    const temperature = new Float32Array(count);
    const moisture = new Float32Array(count);

    for (let y = 0; y < CELLS; y++) {
        for (let x = 0; x < CELLS; x++) {
            const k = y * CELLS + x;

            // The climate: blended from the anchors' (the nearer, the more), a little uneven
            let [warm, wet, total] = [0, 0, 0];

            for (const anchor of anchors) {
                const d2 = (anchor.x - x) ** 2 + (anchor.y - y) ** 2;
                const weight = anchor.weight / (d2 + 100) ** 1.6;

                warm += anchor.temperature * weight;
                wet += anchor.moisture * weight;
                total += weight;
            }

            // The land: rolling, with mountains rising away from the heartlands (between peoples)
            let nearest = Infinity;

            for (const [hx, hy] of heartlands) {
                nearest = Math.min(nearest, Math.hypot(hx - x, hy - y));
            }

            const rolling = noise(x, y, seed + 101, 48, 4);
            const ridge = 1 - Math.abs(2 * noise(x, y, seed + 202, 56, 3) - 1);
            const away = Math.min(1, Math.max(0, (nearest - 32) / 26));
            const cold = Math.max(0, 0.35 - warm / total);
            let land = 0.2 + 0.32 * rolling + 0.62 * ridge ** 4 * away + cold * 0.5 * ridge;

            // The sea round it all, its coast ragged
            const edge = Math.min(x, y, CELLS - 1 - x, CELLS - 1 - y) / CELLS;
            const coast = edge * 7 + (noise(x, y, seed + 303, 20, 3) - 0.5) * 0.5;

            if (coast < 0.22) {
                land = Math.min(land, SEA_LEVEL * (coast / 0.22) ** 2);
            } else if (coast < 0.32) {
                land = SEA_LEVEL + (land - SEA_LEVEL) * ((coast - 0.22) / 0.1);
            }

            // The volcano's cone
            const fromVolcano = Math.hypot(volcano[0] - x, volcano[1] - y);

            if (fromVolcano < VOLCANO_SLOPES) {
                land = Math.max(land, 0.95 - 0.45 * (fromVolcano / VOLCANO_SLOPES) ** 0.8);
            }

            height[k] = Math.min(1, land);
            temperature[k] = Math.min(1, Math.max(0, warm / total + (noise(x, y, seed + 404, 30, 2) - 0.5) * 0.12 - 0.45 * Math.max(0, height[k] - 0.55)));
            moisture[k] = Math.min(1, Math.max(0, wet / total + (noise(x, y, seed + 505, 30, 2) - 0.5) * 0.16));
        }
    }

    // The heartlands are good land: low hills, not mountains (a little higher in the middle, so the
    // rain runs off rather than filling them)
    for (const [hx, hy] of heartlands) {
        for (let y = hy - 16; y <= hy + 16; y++) {
            for (let x = hx - 16; x <= hx + 16; x++) {
                const k = cellIndex(x, y);
                const d = Math.hypot(x - hx, y - hy) / 16;

                if (k >= 0 && d < 1) {
                    height[k] = Math.min(height[k], 0.3 + 0.12 * (1 - d) + 0.2 * d ** 3 + 0.06 * noise(x, y, seed + 606, 8, 2));
                }
            }
        }
    }

    // A faint ripple over all the land, so rain finds its own way down rather than running straight
    for (let k = 0; k < count; k++) {
        if (height[k] >= SEA_LEVEL) {
            height[k] = Math.max(SEA_LEVEL, height[k] + (noise(k % CELLS, Math.floor(k / CELLS), seed + 909, 6, 3) - 0.5) * 0.05);
        }
    }

    const { water, flow } = drain(height, moisture, heartlands);
    const { territory, cost } = claim(heartlands, height, water);
    const biome = lands(seed, { height, temperature, moisture, water, territory, heartlands });

    // Round the volcano, ash and old lava
    for (let y = volcano[1] - ASH_FIELDS; y <= volcano[1] + ASH_FIELDS; y++) {
        for (let x = volcano[0] - ASH_FIELDS; x <= volcano[0] + ASH_FIELDS; x++) {
            const k = cellIndex(x, y);
            const d = Math.hypot(x - volcano[0], y - volcano[1]) / ASH_FIELDS;

            if (k >= 0 && !water[k] && d < 1 && noise(x, y, seed + 808, 6, 2) > d * 0.8) {
                biome[k] = BIOME.volcanic;
            }
        }
    }

    return { heartlands, wilds, volcano, height, temperature, moisture, water, flow, territory, cost, biome };
}

// A number from 0 to 1 for a cell, the same every time
function wobble(k) {
    let h = Math.imul(k ^ 0x5bd1e995, 0x27d4eb2d);

    h ^= h >>> 15;
    h = Math.imul(h, 0x165667b1);

    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

// Where the rain goes: flooding up from the sea (each cell draining into the one it was reached
// from, hollows filled into lakes), then adding up the rain running down, rivers where enough
// does
function drain(height, moisture, heartlands) {
    const count = CELLS * CELLS;
    const water = new Uint8Array(count);
    const filled = new Float32Array(count);
    const into = new Int32Array(count).fill(-1);
    const done = new Uint8Array(count);
    const order = [];
    const queue = new Queue();

    for (let k = 0; k < count; k++) {
        const [x, y] = [k % CELLS, Math.floor(k / CELLS)];

        if (height[k] < SEA_LEVEL || x === 0 || y === 0 || x === CELLS - 1 || y === CELLS - 1) {
            water[k] = height[k] < SEA_LEVEL ? WATER.sea : WATER.none;
            filled[k] = height[k];
            done[k] = 1;
            queue.push(k, height[k]);
        }
    }

    while (queue.size) {
        const { item: k } = queue.pop();
        const [x, y] = [k % CELLS, Math.floor(k / CELLS)];

        order.push(k);

        for (const [dx, dy] of NEIGHBOURS) {
            const n = cellIndex(x + dx, y + dy);

            if (n < 0 || done[n]) {
                continue;
            }

            // (Filling a hollow a random little higher each cell further in, so water finds a
            // wandering way across it, not a straight line)
            done[n] = 1;
            filled[n] = Math.max(height[n], filled[k] + 1e-5 * (0.2 + wobble(n)));
            into[n] = k;
            queue.push(n, filled[n]);
        }
    }

    // Lakes: hollows deep and wide enough, but not so wide they're basins (and not on a heartland)
    const seen = new Uint8Array(count);

    for (let k = 0; k < count; k++) {
        if (seen[k] || water[k] || filled[k] - height[k] < LAKE_DEPTH) {
            continue;
        }

        const hollow = [k];

        seen[k] = 1;

        for (let i = 0; i < hollow.length; i++) {
            const [x, y] = [hollow[i] % CELLS, Math.floor(hollow[i] / CELLS)];

            for (const [dx, dy] of NEIGHBOURS.slice(0, 4)) {
                const n = cellIndex(x + dx, y + dy);

                if (n >= 0 && !seen[n] && !water[n] && filled[n] - height[n] >= LAKE_DEPTH * 0.5) {
                    seen[n] = 1;
                    hollow.push(n);
                }
            }
        }

        const home = heartlands.some(([hx, hy]) => hollow.some((n) => Math.abs((n % CELLS) - hx) < 6 && Math.abs(Math.floor(n / CELLS) - hy) < 6));

        if (hollow.length >= LAKE_CELLS[0] && hollow.length <= LAKE_CELLS[1] && !home) {
            for (const n of hollow) {
                water[n] = WATER.lake;
            }
        }
    }

    // Each cell drains down the steepest way over the flooded land (in a hollow, the way the flood
    // came)
    for (let k = 0; k < count; k++) {
        const [x, y] = [k % CELLS, Math.floor(k / CELLS)];
        let steepest = 0;

        for (const [dx, dy, step] of NEIGHBOURS) {
            const n = cellIndex(x + dx, y + dy);
            const fall = n < 0 ? 0 : (filled[k] - filled[n]) / step;

            if (fall > steepest + 1e-9) {
                steepest = fall;
                into[k] = n;
            }
        }
    }

    // The rain running down, from the highest (last flooded) to the sea
    const flow = new Float32Array(count);

    for (let i = order.length - 1; i >= 0; i--) {
        const k = order[i];

        if (water[k] === WATER.sea) {
            continue;
        }

        flow[k] += 0.4 + moisture[k] * 1.2;

        if (into[k] >= 0) {
            flow[into[k]] += flow[k];
        }
    }

    for (let k = 0; k < count; k++) {
        if (!water[k] && flow[k] >= RIVER_FLOW && height[k] < PEAK) {
            water[k] = WATER.river;
        }
    }

    return { water, flow, into };
}

// The peoples' territories: spreading from each heartland over land (not water), further on the
// flat than over mountains or across rivers, as far as TERRITORY_REACH, and short of where they
// meet another people's by MARCHES (wild land between them)
function claim(heartlands, height, water) {
    const count = CELLS * CELLS;
    const territory = new Uint8Array(count);
    const cost = new Float64Array(count).fill(Infinity);
    const second = new Float64Array(count).fill(Infinity);

    // How far each people's reach gets, spreading from their heartland
    heartlands.forEach(([hx, hy], r) => {
        const reach = new Float64Array(count).fill(Infinity);
        const queue = new Queue();
        const start = cellIndex(hx, hy);

        reach[start] = 0;
        queue.push(start, 0);

        while (queue.size) {
            const { item: k, key } = queue.pop();

            if (key > reach[k]) {
                continue;
            }

            const [x, y] = [k % CELLS, Math.floor(k / CELLS)];

            for (const [dx, dy, step] of NEIGHBOURS) {
                const n = cellIndex(x + dx, y + dy);

                if (n < 0 || water[n] === WATER.sea || water[n] === WATER.lake) {
                    continue;
                }

                const next = key + step * (1 + CLIMB_COST * Math.max(0, height[n] - 0.55)) + (water[n] === WATER.river ? RIVER_COST : 0);

                if (next < reach[n] && next <= TERRITORY_REACH + MARCHES) {
                    reach[n] = next;
                    queue.push(n, next);
                }
            }
        }

        // The nearest people's (and how near the next nearest gets)
        for (let k = 0; k < count; k++) {
            if (reach[k] < cost[k]) {
                second[k] = cost[k];
                cost[k] = reach[k];
                territory[k] = r + 1;
            } else if (reach[k] < second[k]) {
                second[k] = reach[k];
            }
        }
    });

    // Only as far as they reach, and not where another people nearly reaches as far: the marches
    // between them are wild
    for (let k = 0; k < count; k++) {
        if (cost[k] > TERRITORY_REACH || second[k] - cost[k] < MARCHES) {
            territory[k] = 0;
        }
    }

    return { territory, cost };
}

// What kind of land each cell is: water; beaches by the sea; mountains and snow up high; in a
// people's territory, their kinds of land (by how wet it is there, with patches of their woods);
// in the wild, whatever the climate makes it
function lands(seed, { height, temperature, moisture, water, territory }) {
    const count = CELLS * CELLS;
    const biome = new Uint8Array(count);

    for (let k = 0; k < count; k++) {
        const [x, y] = [k % CELLS, Math.floor(k / CELLS)];
        const [h, t, m] = [height[k], temperature[k], moisture[k]];
        const patch = noise(x, y, seed + 707, 10, 2);

        if (water[k] === WATER.sea) {
            biome[k] = BIOME.sea;
            continue;
        }

        if (water[k] === WATER.lake) {
            biome[k] = BIOME.lake;
            continue;
        }

        if (h < SEA_LEVEL + 0.03 && NEIGHBOURS.some(([dx, dy]) => water[cellIndex(x + dx, y + dy)] === WATER.sea)) {
            biome[k] = BIOME.beach;
            continue;
        }

        const race = territory[k] ? RACES[territory[k] - 1] : null;

        if (h >= PEAK || (h >= MOUNTAIN && t < 0.2)) {
            biome[k] = BIOME.snow;
        } else if (h >= MOUNTAIN) {
            biome[k] = race?.id === "orc" ? BIOME.volcanic : BIOME.mountain;
        } else if (race) {
            const { lands: kinds, climate } = race;
            const kind = h > 0.6 ? kinds.hills : m < climate.moisture - 0.1 ? kinds.dry : m > climate.moisture + 0.1 ? kinds.wet : kinds.mid;

            // Patches of their woods, or (where the land is woods) clearings
            biome[k] = BIOME[kind];

            if (race.id === "human" && patch > 0.64) {
                biome[k] = BIOME.woods;
            } else if (race.id === "human" && patch > 0.46 && kind === "farmland") {
                biome[k] = BIOME.meadow;
            } else if (race.id === "lizard" && patch > 0.66) {
                biome[k] = BIOME.marsh;
            } else if (race.id === "cat" && patch > 0.7) {
                biome[k] = BIOME.woods;
            }
        } else if (t < 0.14) {
            biome[k] = h > 0.5 ? BIOME.snow : BIOME.tundra;
        } else if (t < 0.28) {
            biome[k] = m > 0.55 || patch > 0.6 ? BIOME.woods : BIOME.tundra;
        } else if (t > 0.72) {
            biome[k] = m < 0.25 ? (h > 0.55 ? BIOME.volcanic : BIOME.badlands) : m < 0.6 ? BIOME.savannah : BIOME.jungle;
        } else if (m > 0.78) {
            biome[k] = BIOME.marsh;
        } else if (m < 0.3) {
            biome[k] = BIOME.heath;
        } else {
            biome[k] = patch > 0.5 ? BIOME.woods : BIOME.meadow;
        }
    }

    return biome;
}
