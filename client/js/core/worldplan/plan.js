// The world plan: the whole world, 8 kilometres square, laid out from a seed before any of it is
// built, so that every part of it can be built (and rebuilt, the same) as the player comes near:
// its land (terrain.js), and who lives where and what lies between (settle.js). Pure data (typed
// arrays and plain objects), the same every time for a seed.
//
// Its grid is of CELL-metre cells; the world is built later in chunks of CHUNK metres, each
// from the cells under it.

import { BIOMES, RACE, RACES } from "./races.js";
import { campTier, ROAD, SETTLEMENTS, settleLand, startTown } from "./settle.js";
import { CELL, CELLS, cellIndex, shapeLand, WATER, WORLD_SIZE } from "./terrain.js";

export { BIOME, BIOMES, FACTIONS, RACE, RACES, SITES } from "./races.js";
export { campTier, ROAD, SETTLEMENTS } from "./settle.js";
export { CELL, CELLS, WATER, WORLD_SIZE } from "./terrain.js";

/** How big a chunk of the world is when it's built (metres a side), and how many a side. */
export const CHUNK = 64;
export const CHUNKS = WORLD_SIZE / CHUNK;

/**
 * Lay out a world from a seed: {
 *   seed, size (metres a side), cell (metres), cells (a side),
 *   height, temperature, moisture (Float32Array, 0 to 1, a cell each), water (Uint8Array: WATER),
 *   flow (Float32Array: how much rain drains through each cell: the wider a river),
 *   biome (Uint8Array: BIOMES index), territory (Uint8Array: 0 none, else RACES index + 1),
 *   road (Uint8Array: ROAD),
 *   races ([{ id, heartland: [x, y] cells, capital (a place id) }]),
 *   places (settlements: { id, kind, race, name, cell, at: [x, y] metres, radius, guild, seed }),
 *   roads ([{ from, to (place ids), kind, cells, bridges }]),
 *   sites ({ id, kind, race, name, cell, at, seed }),
 *   camps ({ id, faction, cell, at, roam (metres), patrols, seed }),
 *   volcano ([x, y] cells),
 * }
 */
export function planWorld(seed) {
    const land = shapeLand(seed);
    const settled = settleLand(land, seed);

    return {
        seed,
        size: WORLD_SIZE,
        cell: CELL,
        cells: CELLS,
        height: land.height,
        temperature: land.temperature,
        moisture: land.moisture,
        water: land.water,
        flow: land.flow,
        biome: land.biome,
        territory: land.territory,
        road: settled.road,
        volcano: land.volcano,
        races: RACES.map(({ id }, k) => ({ id, heartland: land.heartlands[k], capital: settled.places.find((place) => place.race === id && place.kind === "capital").id })),
        places: settled.places,
        roads: settled.roads,
        sites: settled.sites,
        camps: settled.camps,
    };
}

/** The cell a point (metres) is in: [x, y], or null outside the world. */
export function cellAt(x, z) {
    const [cx, cy] = [Math.floor(x / CELL), Math.floor(z / CELL)];

    return cellIndex(cx, cy) < 0 ? null : [cx, cy];
}

/** What's at a point (metres): { biome (id), race (id or null), water (WATER), road (ROAD), height }. */
export function landAt(plan, x, z) {
    const cell = cellAt(x, z);

    if (!cell) {
        return { biome: "sea", race: null, water: WATER.sea, road: ROAD.none, height: 0 };
    }

    const k = cellIndex(...cell);

    return {
        biome: BIOMES[plan.biome[k]].id,
        race: plan.territory[k] ? RACES[plan.territory[k] - 1].id : null,
        water: plan.water[k],
        road: plan.road[k],
        height: plan.height[k],
    };
}

/**
 * Where a player of a people (RACES id) starts: in one of that people's towns, the one nearest
 * their capital (so near the middle of their lands, with a guild).
 */
export function startFor(plan, raceId) {
    if (!RACE[raceId]) {
        throw new Error(`No people called ${raceId}`);
    }

    return startTown(plan.places, raceId);
}

/** The branches of the adventurers' guild: every settlement with one (all of them, for fast travel). */
export function guilds(plan) {
    return plan.places.filter(({ guild }) => guild);
}

/** The guild branch whose district a point (metres) is in: the nearest. */
export function guildFor(plan, x, z) {
    const branches = guilds(plan);

    return branches.reduce((best, place) => (Math.hypot(place.at[0] - x, place.at[1] - z) < Math.hypot(best.at[0] - x, best.at[1] - z) ? place : best), branches[0]);
}

/**
 * Open ground in a guild branch's district (the land nearer it than any other branch): points
 * (metres) out in the open, clear of settlements, roads, water, sites and camps, where the guild
 * can send adventurers to something it makes up (`count` of them, from `seed`, the same each
 * time).
 */
export function openGround(plan, branch, seed, count) {
    let state = (seed ^ 0x9e3779b9) >>> 0;
    const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

        return state / 4294967296;
    };
    const found = [];
    const clear = (cell, list, within) => list.every((item) => Math.hypot(item.cell[0] - cell[0], item.cell[1] - cell[1]) >= within);

    for (let tries = 0; found.length < count && tries < count * 400; tries++) {
        const at = [branch.at[0] + (next() - 0.5) * 3200, branch.at[1] + (next() - 0.5) * 3200];
        const cell = cellAt(...at);

        if (!cell) {
            continue;
        }

        const k = cellIndex(...cell);

        if (plan.water[k] || plan.road[k] || BIOMES[plan.biome[k]].water || guildFor(plan, ...at) !== branch) {
            continue;
        }

        if (!plan.places.every((place) => Math.hypot(place.at[0] - at[0], place.at[1] - at[1]) >= place.radius + 150)) {
            continue;
        }

        if (clear(cell, plan.sites, 4) && clear(cell, plan.camps, 5) && clear(cell, found, 6)) {
            found.push({ cell, at });
        }
    }

    return found.map(({ at }) => at);
}

/** How strong each camp's enemies are for a player who started at `from` ([x, y] metres). */
export function campTiers(plan, from) {
    return new Map(plan.camps.map((camp) => [camp.id, campTier(camp, from)]));
}

/** The settlement kinds, biggest first (for the world map's key). */
export const SETTLEMENT_KINDS = Object.freeze(Object.keys(SETTLEMENTS));
