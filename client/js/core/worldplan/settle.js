// Where the peoples live, and what lies between them: each people's capital, cities, towns and
// villages (every one with a branch of the adventurers' guild), named in their own tongue; the
// roads joining them, and the trade roads between the capitals; the sites in the land between
// (ruins, caves, shrines, standing stones, watchtowers, castles, each people's own buildings);
// the camps of the enemies who raid from the wild places; and, settled last (so the rest of the
// world is as it was before them), hamlets off the roads, a track to each, and farmsteads out in
// the fields near the villages and towns.

import { createRandom } from "../random.js";
import { Queue } from "./queue.js";
import { BIOME, BIOMES, FACTIONS, RACES, SITES } from "./races.js";
import { CELL, CELLS, cellIndex, WATER } from "./terrain.js";

/**
 * The kinds of settlement: how many each people has, how far (cells) they keep from others (two
 * settlements keep the average of theirs), and how far (metres) they spread round their middle;
 * whether they have a branch of the adventurers' guild (and a smithy and a church: every place
 * but a hamlet, which has a tavern only, and a farmstead, which hasn't even that).
 */
export const SETTLEMENTS = Object.freeze({
    capital: { count: [1, 1], apart: 30, radius: 200, guild: true },
    city: { count: [2, 3], apart: 24, radius: 125, guild: true },
    town: { count: [4, 6], apart: 16, radius: 60, guild: true },
    village: { count: [6, 9], apart: 9, radius: 30, guild: true },
    hamlet: { count: [5, 8], apart: 6, radius: 18, guild: false },
    farmstead: { count: [6, 10], apart: 3, radius: 12, guild: false },
});

// Farmsteads stand within this many cells of a village or town, on land that can be farmed if
// there's any
const FARMS_NEAR = 12;
const FARMLAND = new Set(["farmland", "meadow", "savannah", "heath"]);

// How far (cells) capitals, cities and towns keep from water
const DRY = 2;

/** The plan's `road` layer: none, a track (to a village), a road. */
export const ROAD = Object.freeze({ none: 0, track: 1, road: 2 });

// The enemies' camps: how many, and how many of them near where a player of each people starts
// (near enough to be of the first tier: the first they meet); how far (metres) from any
// settlement, how far apart (cells), how far their patrols roam (metres) and how many go out
const CAMPS = 72;
const HOME_CAMPS = 3;
const CAMP_CLEAR = 320;
const CAMPS_APART = 14;
const ROAM = [180, 320];
const PATROLS = [1, 3];

// How far (cells) sites keep from settlements and each other
const SITE_CLEAR = 5;
const SITES_APART = 8;

// Tiers of enemy camp: the first as far as TIER_FROM + TIER_EVERY metres from where the player
// starts, then one more for each TIER_EVERY metres further, up to TIERS; and the camps pitched
// round each start (HOME_CAMPS) within the first tier's reach
const TIER_FROM = 1200;
const TIER_EVERY = 850;
const TIERS = 8;
const NEAR_HOME = TIER_FROM + TIER_EVERY - 50;

// The land a road goes over: how much more a step costs (on top of 1) by what it's over, and
// less along a road already there
const ROAD_COST = { marsh: 1.5, jungle: 1.2, woods: 0.3, elfwood: 0.3, darkwood: 0.5, mountain: 5, snow: 8, volcanic: 3, beach: 0.5 };
const BRIDGE = 5;
const REUSE = 0.35;

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

const centre = (x, y) => [(x + 0.5) * CELL, (y + 0.5) * CELL];
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// A name in a people's tongue, not yet used, and easy to say (no part said twice running, like
// "Ingingwick", nor three vowels together)
function nameIn(race, random, used) {
    const { starts, middles, ends } = race.names;

    for (let tries = 0; ; tries++) {
        const name = random.pick(starts) + random.pick(middles) + random.pick(ends);
        const neat = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        const awkward = /(..+)\1/.test(neat.toLowerCase()) || /[aeiouy]{3}/.test(neat.toLowerCase()) || /([aiu])\1/.test(neat.toLowerCase());

        if ((!used.has(neat) && !awkward) || tries > 80) {
            used.add(neat);

            return neat;
        }
    }
}

// The lands no one builds on
const UNBUILDABLE = [BIOME.beach, BIOME.mountain, BIOME.snow, BIOME.volcanic, BIOME.marsh];

// How good a cell is to build on: flat, dry, not too high, better by water
function buildable(land, x, y) {
    const k = cellIndex(x, y);
    const { height, water, biome } = land;

    if (k < 0 || water[k] || height[k] >= 0.62 || UNBUILDABLE.includes(biome[k])) {
        return 0;
    }

    let steep = 0;
    let wet = false;

    for (const [dx, dy] of NEIGHBOURS) {
        const n = cellIndex(x + dx, y + dy);

        if (n < 0 || water[n] === WATER.sea || water[n] === WATER.lake) {
            return 0;
        }

        steep = Math.max(steep, Math.abs(height[n] - height[k]));
    }

    for (let dy = -3; dy <= 3 && !wet; dy++) {
        for (let dx = -3; dx <= 3 && !wet; dx++) {
            const n = cellIndex(x + dx, y + dy);

            wet = n >= 0 && (water[n] === WATER.river || water[n] === WATER.lake);
        }
    }

    return Math.max(0, 1 - steep * 25) + (wet ? 0.4 : 0);
}

// Whether a cell has no water (river, lake or sea) within `clear` cells: a town's, a city's and a
// capital's streets are laid out square to the land round them, clear of rivers
function dry(land, x, y, clear) {
    for (let dy = -clear; dy <= clear; dy++) {
        for (let dx = -clear; dx <= clear; dx++) {
            if (land.water[cellIndex(x + dx, y + dy)]) {
                return false;
            }
        }
    }

    return true;
}

// Each people's settlements: the capital near their heartland, then cities, towns and villages
// through their lands, each far enough from the others
function settle(land, random, used) {
    const places = [];

    RACES.forEach((race, r) => {
        const cells = [];

        for (let k = 0; k < CELLS * CELLS; k++) {
            if (land.territory[k] === r + 1 && land.cost[k] < 46) {
                const [x, y] = [k % CELLS, Math.floor(k / CELLS)];
                const score = buildable(land, x, y);

                if (score > 0.3) {
                    cells.push({ x, y, score, dry: dry(land, x, y, DRY) });
                }
            }
        }

        const [hx, hy] = land.heartlands[r];
        const mine = [];
        const add = (kind, { x, y }) => {
            const place = {
                id: `${race.id}-${kind}-${mine.filter((p) => p.kind === kind).length + 1}`,
                kind,
                race: race.id,
                name: nameIn(race, random, used),
                cell: [x, y],
                at: centre(x, y),
                radius: SETTLEMENTS[kind].radius,
                guild: SETTLEMENTS[kind].guild,
                seed: random.seed(),
            };

            mine.push(place);
            places.push(place);
        };

        // The capital: the best land near the heartland's middle (clear of water, if there's any)
        const close = cells.filter(({ x, y }) => Math.hypot(x - hx, y - hy) < 12);
        const near = close.some((cell) => cell.dry) ? close.filter((cell) => cell.dry) : close;

        add("capital", near.reduce((best, cell) => (cell.score > best.score ? cell : best), near[0] ?? { x: hx, y: hy, score: 0 }));

        // Then the others, the bigger first, on the better land (in a random order, the better more
        // often first)
        for (const kind of ["city", "town", "village"]) {
            const want = random.int(...SETTLEMENTS[kind].count);
            const order = cells.filter((cell) => kind === "village" || cell.dry).map((cell) => ({ cell, key: random.next() ** (1 / (0.2 + cell.score)) })).sort((a, b) => b.key - a.key);

            for (const { cell } of order) {
                if (mine.filter((p) => p.kind === kind).length >= want) {
                    break;
                }

                const clear = mine.every((place) => apart(place.cell, [cell.x, cell.y]) >= (SETTLEMENTS[kind].apart + SETTLEMENTS[place.kind].apart) / 2);

                if (clear) {
                    add(kind, cell);
                }
            }
        }
    });

    return places;
}

// A way-finder over the land (`route(road, from, to)`): the cheapest way from one cell to another
// (A*), along roads already there where it can; null if there's none. One for all a world's roads,
// working in the same lists (each cell's cost so far, and where from), each way putting back only
// the cells it touched (a few thousand of 65,536) rather than every road making its own
function router(land) {
    const { height, water, biome } = land;
    const count = CELLS * CELLS;
    const cost = new Float64Array(count).fill(Infinity);
    const came = new Int32Array(count).fill(-1);
    const touched = [];
    const over = BIOMES.map(({ id }) => ROAD_COST[id] ?? 0);

    const search = (road, from, to) => {
        const queue = new Queue();
        const start = cellIndex(...from);
        const goal = cellIndex(...to);
        const guess = (k) => Math.hypot((k % CELLS) - to[0], Math.floor(k / CELLS) - to[1]) * REUSE;

        cost[start] = 0;
        touched.push(start);
        queue.push(start, guess(start));

        while (queue.size) {
            const { item: k, key } = queue.pop();

            if (k === goal) {
                const path = [];

                for (let at = goal; at >= 0; at = came[at]) {
                    path.push([at % CELLS, Math.floor(at / CELLS)]);
                }

                return path.reverse();
            }

            if (key - guess(k) > cost[k] + 1e-9) {
                continue;
            }

            const [x, y] = [k % CELLS, Math.floor(k / CELLS)];

            for (const [dx, dy, step] of NEIGHBOURS) {
                const n = cellIndex(x + dx, y + dy);

                if (n < 0 || water[n] === WATER.sea || water[n] === WATER.lake) {
                    continue;
                }

                const next = cost[k] + step * (road[n] ? REUSE : 1 + over[biome[n]] + 10 * Math.abs(height[n] - height[k]) + (water[n] === WATER.river ? BRIDGE : 0));

                if (next < cost[n]) {
                    if (cost[n] === Infinity) {
                        touched.push(n);
                    }

                    cost[n] = next;
                    came[n] = k;
                    queue.push(n, next + guess(n));
                }
            }
        }

        return null;
    };

    return (road, from, to) => {
        try {
            return search(road, from, to);
        } finally {
            for (const k of touched) {
                cost[k] = Infinity;
                came[k] = -1;
            }

            touched.length = 0;
        }
    };
}

// The shortest joins making one network of `nodes` (Prim's), and then a few more, where going
// round by the network is much further than straight there
function network(nodes, extra) {
    const joined = [0];
    const edges = [];

    while (joined.length < nodes.length) {
        let best = null;

        for (const a of joined) {
            for (let b = 0; b < nodes.length; b++) {
                if (!joined.includes(b)) {
                    const d = apart(nodes[a].cell, nodes[b].cell);

                    if (!best || d < best.d) {
                        best = { a, b, d };
                    }
                }
            }
        }

        joined.push(best.b);
        edges.push([best.a, best.b]);
    }

    // How far round by the network
    const round = (from, to) => {
        const far = nodes.map(() => Infinity);
        const queue = new Queue();

        far[from] = 0;
        queue.push(from, 0);

        while (queue.size) {
            const { item, key } = queue.pop();

            for (const [a, b] of edges) {
                const other = a === item ? b : b === item ? a : -1;
                const d = other >= 0 ? key + apart(nodes[item].cell, nodes[other].cell) : Infinity;

                if (d < far[other]) {
                    far[other] = d;
                    queue.push(other, d);
                }
            }
        }

        return far[to];
    };
    const pairs = [];

    for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
            pairs.push({ a, b, d: apart(nodes[a].cell, nodes[b].cell) });
        }
    }

    pairs.sort((p, q) => p.d - q.d);

    for (const { a, b, d } of pairs) {
        if (extra <= 0) {
            break;
        }

        if (!edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a)) && round(a, b) > d * 1.7) {
            edges.push([a, b]);
            extra--;
        }
    }

    return edges;
}

// The roads: each people's settlements joined up (tracks to the villages), and the capitals by
// trade roads; each laid over the land the easiest way, sharing the way where roads meet
function lay(land, places, route) {
    const road = new Uint8Array(CELLS * CELLS);
    const roads = [];
    const joins = [];

    for (const race of RACES) {
        const mine = places.filter((place) => place.race === race.id);

        for (const [a, b] of network(mine, 2)) {
            joins.push({ from: mine[a], to: mine[b], kind: mine[a].kind === "village" || mine[b].kind === "village" ? "track" : "road" });
        }
    }

    const capitals = places.filter(({ kind }) => kind === "capital");

    for (const [a, b] of network(capitals, 1)) {
        joins.push({ from: capitals[a], to: capitals[b], kind: "trade" });
    }

    // The trade roads first, then the roads, then the tracks (so the lesser join the greater)
    const rank = { trade: 0, road: 1, track: 2 };

    joins.sort((p, q) => rank[p.kind] - rank[q.kind] || apart(p.from.cell, p.to.cell) - apart(q.from.cell, q.to.cell));

    for (const { from, to, kind } of joins) {
        const cells = route(road, from.cell, to.cell);

        if (!cells) {
            continue;
        }

        for (const [x, y] of cells) {
            const k = cellIndex(x, y);

            road[k] = Math.max(road[k], kind === "track" ? ROAD.track : ROAD.road);
        }

        roads.push({ from: from.id, to: to.id, kind, cells, bridges: cells.filter(([x, y]) => land.water[cellIndex(x, y)] === WATER.river) });
    }

    return { road, roads };
}

// Whether a cell is at least `clear` cells beyond every settlement's edge
function clearOf(places, [x, y], clear) {
    return places.every((place) => apart(place.cell, [x, y]) >= place.radius / CELL + clear);
}

// The sites between the settlements, and each people's own buildings and castle in their lands
function scatter(land, road, places, random, used) {
    const sites = [];
    const { biome, water, height, territory } = land;
    const nearRoad = ([x, y], within) => {
        for (let dy = -within; dy <= within; dy++) {
            for (let dx = -within; dx <= within; dx++) {
                if (road[cellIndex(x + dx, y + dy)]) {
                    return true;
                }
            }
        }

        return false;
    };
    const put = ({ kind, count, biomes, wild, hills, near, race }) => {
        for (let placed = 0, tries = 0; placed < count && tries < 6000; tries++) {
            const cell = [random.int(4, CELLS - 5), random.int(4, CELLS - 5)];
            const k = cellIndex(...cell);
            const owner = territory[k] ? RACES[territory[k] - 1] : null;

            if (water[k] || biome[k] === BIOME.beach) {
                continue;
            }

            if ((biomes && !biomes.includes(BIOMES[biome[k]].id)) || (wild && owner) || (race && owner?.id !== race.id) || (hills && height[k] < 0.5 && tries < 4000)) {
                continue;
            }

            if (!clearOf(places, cell, SITE_CLEAR) || sites.some((site) => apart(site.cell, cell) < SITES_APART) || (near === "roads" && !nearRoad(cell, 2))) {
                continue;
            }

            const named = ["ruins", "ruined castle", "castle", "dragon's lair"].includes(kind) || race;
            const tongue = owner ?? RACES[random.int(0, RACES.length - 1)];

            sites.push({
                id: `${kind.replace(/[^a-z]+/g, "-")}-${sites.length + 1}`,
                kind,
                race: owner?.id ?? null,
                name: named ? nameIn(tongue, random, used) : null,
                cell,
                at: centre(...cell),
                seed: random.seed(),
            });
            placed++;
        }
    };

    for (const race of RACES) {
        put({ kind: "castle", count: 1, near: "roads", race });

        for (const kind of race.structures) {
            put({ kind, count: 1, race });
        }
    }

    for (const site of SITES) {
        put(site);
    }

    return sites;
}

// The enemies' camps, out in the wild (a few near each people's lands, the rest anywhere), each
// of a faction that likes the land there, and near what it likes to be near
function encamp(land, road, places, sites, random) {
    const camps = [];
    const { biome, water, territory, cost } = land;
    const near = (cell, kinds, within) => sites.some((site) => kinds.includes(site.kind) && apart(site.cell, cell) <= within);
    const byRoad = ([x, y]) => {
        for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -6; dx <= 6; dx++) {
                if (road[cellIndex(x + dx, y + dy)]) {
                    return true;
                }
            }
        }

        return false;
    };

    // A camp at a cell, if it can be there (in a people's lands only if `inside`)
    const pitch = (cell, inside) => {
        const k = cellIndex(...cell);

        if (k < 0 || water[k] || biome[k] === BIOME.beach || road[k] || (!inside && territory[k] && cost[k] < 38)) {
            return false;
        }

        if (!clearOf(places, cell, CAMP_CLEAR / CELL) || camps.some((camp) => apart(camp.cell, cell) < CAMPS_APART) || sites.some((site) => apart(site.cell, cell) < 3)) {
            return false;
        }

        const here = BIOMES[biome[k]].id;
        const fits = FACTIONS.map((faction) => {
            let weight = faction.biomes.includes(here) ? 1 : 0.05;

            if (faction.near === "roads" && byRoad(cell)) {
                weight += 1.5;
            } else if (faction.near === "caves" && near(cell, ["cave"], 12)) {
                weight += 1.5;
            } else if (faction.near === "ruins" && near(cell, ["ruins", "ruined castle"], 12)) {
                weight += 1.5;
            }

            return { faction, weight };
        });
        const { faction } = random.pickWeighted(fits, ({ weight }) => weight);

        camps.push({
            id: `camp-${camps.length + 1}`,
            faction: faction.id,
            cell,
            at: centre(...cell),
            roam: Math.round(random.range(...ROAM)),
            patrols: random.int(...PATROLS),
            seed: random.seed(),
        });

        return true;
    };

    // First a few round where a player of each people starts (in their lands or out of them), for
    // the first they meet
    for (const { id } of RACES) {
        const [sx, sy] = startTown(places, id).at;

        for (let placed = 0, tries = 0; placed < HOME_CAMPS && tries < 1500; tries++) {
            const angle = random.next() * Math.PI * 2;
            const out = random.range(900, NEAR_HOME);
            const cell = [Math.floor((sx + Math.cos(angle) * out) / CELL), Math.floor((sy + Math.sin(angle) * out) / CELL)];

            placed += pitch(cell, true) ? 1 : 0;
        }
    }

    // Then the rest, out in the wild
    for (let tries = 0; camps.length < CAMPS && tries < 20000; tries++) {
        pitch([random.int(4, CELLS - 5), random.int(4, CELLS - 5)], false);
    }

    return camps;
}

/**
 * Settle the land (terrain.js shapeLand's): { places (settlements), road (Uint8Array: ROAD),
 * roads ([{ from, to (place ids), kind: "trade" | "road" | "track", cells, bridges }]), sites,
 * camps }.
 */
export function settleLand(land, seed) {
    const random = createRandom(seed * 13 + 7);
    const used = new Set();
    const route = router(land);
    const places = settle(land, random, used);
    const { road, roads } = lay(land, places, route);
    const sites = scatter(land, road, places, random, used);
    const camps = encamp(land, road, places, sites, random);

    hamlets(land, road, roads, places, sites, camps, createRandom(seed * 29 + 3), used, route);

    return { places, road, roads, sites, camps };
}

// The small places, settled last, each people's through their lands: hamlets on dry land clear of
// everything else, each with a track to the nearest bigger place of its people; farmsteads on
// land that can be farmed near a village or town, off the roads
function hamlets(land, road, roads, places, sites, camps, random, used, route) {
    RACES.forEach((race, r) => {
        const cells = [];

        for (let k = 0; k < CELLS * CELLS; k++) {
            if (land.territory[k] === r + 1 && land.cost[k] < 46 && !road[k] && !land.water[k]) {
                const [x, y] = [k % CELLS, Math.floor(k / CELLS)];
                const score = buildable(land, x, y);

                if (score > 0.3 && dry(land, x, y, 1)) {
                    cells.push({ x, y, score, biome: BIOMES[land.biome[k]].id });
                }
            }
        }

        const bigger = places.filter((place) => place.race === race.id);
        const mine = [];

        for (const kind of ["hamlet", "farmstead"]) {
            const want = random.int(...SETTLEMENTS[kind].count);
            // (Farmsteads on land that can be farmed if there's any near, and on any near if not)
            const near = cells.filter((cell) => bigger.some((place) => place.kind !== "capital" && apart(place.cell, [cell.x, cell.y]) <= FARMS_NEAR));
            const order = kind === "hamlet" ? random.shuffle([...cells]) : [...random.shuffle(near.filter((cell) => FARMLAND.has(cell.biome))), ...random.shuffle(near.filter((cell) => !FARMLAND.has(cell.biome)))];
            let placed = 0;

            for (const cell of order) {
                if (placed >= want) {
                    break;
                }

                const at = centre(cell.x, cell.y);
                const clear = places.every((place) => apart(place.cell, [cell.x, cell.y]) >= (SETTLEMENTS[kind].apart + SETTLEMENTS[place.kind].apart) / 2) && sites.every((site) => apart(site.cell, [cell.x, cell.y]) >= SITE_CLEAR) && camps.every((camp) => apart(camp.at, at) >= SETTLEMENTS[kind].radius + CAMP_CLEAR);

                if (!clear) {
                    continue;
                }

                const place = {
                    id: `${race.id}-${kind}-${placed + 1}`,
                    kind,
                    race: race.id,
                    name: nameIn(race, random, used),
                    cell: [cell.x, cell.y],
                    at,
                    radius: SETTLEMENTS[kind].radius,
                    guild: false,
                    seed: random.seed(),
                };

                places.push(place);
                mine.push(place);
                placed++;
            }
        }

        // A track from each hamlet to the nearest bigger place of its people
        for (const hamlet of mine.filter(({ kind }) => kind === "hamlet")) {
            const to = bigger.filter(({ kind }) => kind !== "hamlet" && kind !== "farmstead").reduce((best, place) => (!best || apart(place.cell, hamlet.cell) < apart(best.cell, hamlet.cell) ? place : best), null);
            const cells = to && route(road, hamlet.cell, to.cell);

            if (!cells) {
                continue;
            }

            for (const [x, y] of cells) {
                road[cellIndex(x, y)] = Math.max(road[cellIndex(x, y)], ROAD.track);
            }

            roads.push({ from: hamlet.id, to: to.id, kind: "track", cells, bridges: cells.filter(([x, y]) => land.water[cellIndex(x, y)] === WATER.river) });
        }
    });
}

/**
 * How strong a camp's enemies are (1 to 8): stronger the further it is from where the player
 * started (`from`: [x, y] metres), so the danger grows as they go further afield.
 */
export function campTier(camp, from) {
    return Math.min(TIERS, 1 + Math.floor(Math.max(0, apart(camp.at, from) - TIER_FROM) / TIER_EVERY));
}

/** Where a player of a people starts: of their towns, the one nearest their capital. */
export function startTown(places, raceId) {
    const capital = places.find((place) => place.race === raceId && place.kind === "capital");
    const towns = places.filter((place) => place.race === raceId && place.kind === "town");

    return towns.reduce((best, town) => (apart(town.at, capital.at) < apart(best.at, capital.at) ? town : best), towns[0]);
}
