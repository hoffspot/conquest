// Turns a level (see data/levels.js) into what Game.loadLevel plays: a map, and the level's items
// and triggers for the sites on it. Either the book's map, or a map generated from a seed.

import { TILESET } from "./data/tileset.js";
import { maps } from "./data/maps.js";
import { Game } from "./game.js";
import { generateMap } from "./mapgen.js";
import { findPath } from "./pathfinding.js";
import { fixedSite } from "./sites.js";

// How many seeds to try (derived from the one asked for) before giving up
const ATTEMPTS = 20;

/** A random seed for a new map. */
export function newSeed() {
    return Math.floor(Math.random() * 1e9);
}

/**
 * Get a level ready to play.
 * @param {object} level  an entry of levels.singleplayer or levels.multiplayer
 * @param {{seed?: number, classic?: boolean}} options  classic plays on the book's map; otherwise
 *        a map is generated from the seed (the same seed always gives the same map)
 * @returns {object} the level with its map, sites, items and triggers
 */
export function createMission(level, { seed = 0, classic = false } = {}) {
    if (classic || !level.generate) {
        const map = maps[level.classic.mapName];
        const sites = Object.fromEntries(Object.entries(level.classic.sites).map(([name, [x, y, width, height, side]]) => [name, fixedSite(name, [x, y, width, height], map, side)]));

        return assemble(level, { map, mapName: level.classic.mapName, sites, startX: level.classic.startX, startY: level.classic.startY, spawnViews: level.classic.spawnViews });
    }

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const generated = generateMap(level.generate, ((seed >>> 0) + Math.imul(attempt, 0x85ebca6b)) >>> 0);
        const sites = { ...generated.sites, ...level.generate.areas?.(generated.sites) };
        const main = Object.values(generated.sites)[0];
        const mission = assemble(level, { map: toGameMap(generated), sites, seed, startX: main.x, startY: main.y });

        // Check again with the level's buildings in place
        if (routesAreOpen(mission, level.generate.connect ?? [])) {
            return mission;
        }
    }

    throw new Error(`Could not make a map for "${level.name ?? "multiplayer"}" from seed ${seed}`);
}

function assemble(level, { map, mapName, sites, seed, startX, startY, spawnViews }) {
    const mission = {
        ...level,
        map,
        mapName,
        seed,
        sites,
        startX,
        startY,
        items: level.items(sites),
        triggers: level.triggers(sites),
    };

    // The rules for making maps have been used
    delete mission.classic;
    delete mission.generate;

    // Multiplayer: where each player can start
    if (level.teamStartingItems) {
        mission.spawnLocations = Object.keys(sites)
            .filter((name) => name.startsWith("spawn"))
            .map((name, index) => {
                const site = sites[name];
                const [viewX, viewY] = spawnViews?.[index] ?? [site.x, site.y];

                return { x: site.x, y: site.y, startX: viewX, startY: viewY };
            });
    }

    return mission;
}

/** A generated map in the form the game uses for maps. */
export function toGameMap(generated) {
    const obstructed = [];

    for (const [y, row] of generated.obstructed.entries()) {
        for (const [x, blocked] of row.entries()) {
            if (blocked) {
                obstructed.push([x, y]);
            }
        }
    }

    return {
        mapGridWidth: generated.width,
        mapGridHeight: generated.height,
        mapObstructedTerrain: obstructed,
        // Drawn from the tiles of the book's map
        tileImage: TILESET.image,
        tileSize: TILESET.tileSize,
        tiles: generated.tiles.map((row) => row.map((id) => [TILESET.tiles[id].x, TILESET.tiles[id].y])),
        seed: generated.seed,
    };
}

/**
 * Can units get between every pair of connected sites, with the level's buildings (and every
 * multiplayer team's starting buildings) in place? Uses the game's own path finding.
 */
export function routesAreOpen(mission, connect) {
    const game = new Game();

    game.loadLevel(mission, { team: "blue" });

    for (const spawn of mission.spawnLocations ?? []) {
        for (const item of mission.teamStartingItems) {
            game.add({ ...item, x: item.x + spawn.x, y: item.y + spawn.y, team: "blue" });
        }
    }

    const grid = game.getPassableGrid();

    // The open tile in a site nearest its middle
    const doorway = (site) => {
        let best;

        for (let y = site.y; y < site.y + site.height; y++) {
            for (let x = site.x; x < site.x + site.width; x++) {
                const distance = (x + 0.5 - site.cx) ** 2 + (y + 0.5 - site.cy) ** 2;

                if (!grid[y]?.[x] && grid[y] && x >= 0 && x < grid[y].length && (!best || distance < best.distance)) {
                    best = { x, y, distance };
                }
            }
        }

        return best && [best.x, best.y];
    };

    return connect.every(([a, b]) => {
        const from = doorway(mission.sites[a]);
        const to = doorway(mission.sites[b]);

        return from && to && findPath(grid, from, to).length > 0;
    });
}
