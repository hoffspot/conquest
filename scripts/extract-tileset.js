// Cuts the book's map (client/images/maps/plains.png) into the tileset that generated maps are
// built from, and writes client/js/core/data/tileset.js. Run it after changing the map image:
//
//     npm run extract:tileset
//
// The map is made of 20 pixel tiles from the "Hard Vacuum" artwork. Terrain edges are "corner"
// tiles: each tile shows the terrain at its four corners (grass, water, lava or a dirt pit) and
// blends between them, with a rocky rim where grass meets anything else. So the script:
//
//   1. finds the distinct tiles (73 of them),
//   2. works out the terrain at every grid corner of the map from the colour around it, which
//      gives each tile its corner signature (for example "GGWW": grass along the top, water
//      along the bottom),
//   3. records which tiles block movement (from the map's obstructed tiles in maps.js), and
//   4. collects obstacles standing on grass (trees, rocks, a walled enclosure) as "stamps", so
//      that they are placed whole rather than tile by tile.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maps } from "../client/js/core/data/maps.js";
import { decodePng } from "./png.js";

const TILE = 20;

// The colour at the centre of each terrain, and the letter used for it in corner signatures
export const TERRAIN_COLORS = {
    G: [27, 104, 4], // grass
    W: [19, 83, 177], // water
    L: [115, 11, 0], // lava
    P: [87, 43, 26], // dirt pit
    R: [135, 90, 72], // rocky ground (only along one edge of the map, so not used)
};

/** Everything the generator needs to know about the tiles in a map image. */
export function extractTileset(png, obstructedTiles) {
    const { width, height, data } = png;
    const columns = width / TILE;
    const rows = height / TILE;
    const obstructed = new Set(obstructedTiles.map(([x, y]) => `${x},${y}`));

    // 1. The distinct tiles, numbered in the order they first appear
    const keys = new Map();
    const tiles = [];
    const grid = [];

    for (let y = 0; y < rows; y++) {
        const row = [];

        for (let x = 0; x < columns; x++) {
            let key = "";

            for (let py = 0; py < TILE; py++) {
                const start = ((y * TILE + py) * width + x * TILE) * 4;

                key += data.subarray(start, start + TILE * 4).toString("base64");
            }

            if (!keys.has(key)) {
                keys.set(key, tiles.length);
                tiles.push({ x, y, count: 0, blocked: 0 });
            }

            const id = keys.get(key);

            tiles[id].count++;
            tiles[id].blocked += obstructed.has(`${x},${y}`) ? 1 : 0;
            row.push(id);
        }

        grid.push(row);
    }

    // 2. The terrain at each grid corner: the nearest terrain colour to the average around it
    const corners = [];

    for (let vy = 0; vy <= rows; vy++) {
        const row = [];

        for (let vx = 0; vx <= columns; vx++) {
            const sum = [0, 0, 0];
            let count = 0;

            for (let py = vy * TILE - 3; py < vy * TILE + 3; py++) {
                for (let px = vx * TILE - 3; px < vx * TILE + 3; px++) {
                    if (px >= 0 && py >= 0 && px < width && py < height) {
                        const i = (py * width + px) * 4;

                        sum[0] += data[i];
                        sum[1] += data[i + 1];
                        sum[2] += data[i + 2];
                        count++;
                    }
                }
            }

            const color = sum.map((value) => value / count);
            const [terrain] = Object.entries(TERRAIN_COLORS)
                .map(([letter, [r, g, b]]) => [letter, (color[0] - r) ** 2 + (color[1] - g) ** 2 + (color[2] - b) ** 2])
                .sort((a, b) => a[1] - b[1])[0];

            row.push(terrain);
        }

        corners.push(row);
    }

    // Each tile's corners, clockwise from the top left. A tile must look the same wherever it is.
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            const tile = tiles[grid[y][x]];
            const signature = corners[y][x] + corners[y][x + 1] + corners[y + 1][x + 1] + corners[y + 1][x];

            if (tile.corners && tile.corners !== signature) {
                throw new Error(`Tile ${grid[y][x]} has corners ${tile.corners} at ${tile.x},${tile.y} but ${signature} at ${x},${y}`);
            }

            tile.corners = signature;
        }
    }

    // 3. Plain grass is the commonest all-grass tile; everything else blocks units (most tiles
    // are marked the same everywhere; a few grass tiles were blocked by hand)
    const grass = tiles.reduce((best, tile, id) => (tile.corners === "GGGG" && tile.count > (tiles[best]?.count ?? 0) ? id : best), -1);

    for (const [id, tile] of tiles.entries()) {
        tile.obstructed = id !== grass && tile.blocked > tile.count / 2;
    }

    // 4. Obstacles on grass: groups of touching all-grass tiles that aren't plain grass
    const seen = new Set();
    const stamps = new Map();
    const isObstacle = (x, y) => x >= 0 && y >= 0 && x < columns && y < rows && grid[y][x] !== grass && tiles[grid[y][x]].corners === "GGGG";

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            if (!isObstacle(x, y) || seen.has(`${x},${y}`)) {
                continue;
            }

            const cells = [];
            const queue = [[x, y]];

            seen.add(`${x},${y}`);

            while (queue.length) {
                const [cx, cy] = queue.pop();

                cells.push([cx, cy]);

                for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
                    if (isObstacle(nx, ny) && !seen.has(`${nx},${ny}`)) {
                        seen.add(`${nx},${ny}`);
                        queue.push([nx, ny]);
                    }
                }
            }

            // Obstacles cut off by the edge of the map would look cut off anywhere else too
            if (cells.some(([cx, cy]) => cx === 0 || cy === 0 || cx === columns - 1 || cy === rows - 1)) {
                continue;
            }

            const stamp = makeStamp(cells, grid, grass);
            const key = JSON.stringify(stamp.tiles);

            if (stamps.has(key)) {
                stamps.get(key).count++;
            } else {
                stamps.set(key, { ...stamp, count: 1 });
            }
        }
    }

    return {
        tileSize: TILE,
        grass,
        tiles: tiles.map(({ x, y, count, corners, obstructed: blocked }) => ({ x, y, corners, count, obstructed: blocked })),
        stamps: [...stamps.values()],
    };
}

// A stamp: the obstacle's tiles in its bounding box (null where the map's own grass shows
// through), and which of those tiles block units (the obstacle, and any grass it encloses)
function makeStamp(cells, grid, grass) {
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const width = Math.max(...xs) - left + 1;
    const height = Math.max(...ys) - top + 1;
    const inStamp = new Set(cells.map(([x, y]) => `${x - left},${y - top}`));
    const tiles = [];
    const blocked = [];

    // Grass that can't be reached from outside the bounding box is enclosed by the obstacle
    const outside = new Set();
    const queue = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && !inStamp.has(`${x},${y}`)) {
                outside.add(`${x},${y}`);
                queue.push([x, y]);
            }
        }
    }

    while (queue.length) {
        const [x, y] = queue.pop();

        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            const key = `${nx},${ny}`;

            if (nx >= 0 && ny >= 0 && nx < width && ny < height && !inStamp.has(key) && !outside.has(key)) {
                outside.add(key);
                queue.push([nx, ny]);
            }
        }
    }

    for (let y = 0; y < height; y++) {
        const tileRow = [];
        const blockedRow = [];

        for (let x = 0; x < width; x++) {
            const own = inStamp.has(`${x},${y}`);
            const id = grid[top + y][left + x];

            tileRow.push(own || id !== grass ? id : null);
            blockedRow.push(own || !outside.has(`${x},${y}`) ? 1 : 0);
        }

        tiles.push(tileRow);
        blocked.push(blockedRow);
    }

    return { width, height, tiles, blocked };
}

function toModule(tileset) {
    const tiles = tileset.tiles.map((tile) => `        ${JSON.stringify(tile).replaceAll(",", ", ").replaceAll(":", ": ")},`).join("\n");
    const stamps = tileset.stamps.map((stamp) => `        ${JSON.stringify(stamp).replaceAll(",", ", ").replaceAll(":", ": ")},`).join("\n");

    return `// The tiles that generated maps are built from, cut from the book's map (images/maps/plains.png).
// Generated by scripts/extract-tileset.js (npm run extract:tileset); do not edit by hand.
//
//   tiles[id]     x, y: where the tile is in plains.png, in tiles
//                 corners: the terrain at its corners, clockwise from the top left
//                          (G grass, W water, L lava, P dirt pit, R rocky ground)
//                 count: how often the book's map uses it (for picking between variants)
//                 obstructed: whether units can't cross it
//   grass         the plain grass tile
//   stamps        obstacles standing on grass (trees, rocks, an enclosure), placed whole:
//                 tiles[y][x] is a tile id or null for plain grass, blocked[y][x] is 1 where
//                 units can't go, and count is how often the book's map has it

export const TILESET = Object.freeze({
    image: "plains.png",
    tileSize: ${tileset.tileSize},
    grass: ${tileset.grass},
    tiles: [
${tiles}
    ],
    stamps: [
${stamps}
    ],
});
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const png = decodePng(readFileSync(path.join(root, "client/images/maps/plains.png")));
    const tileset = extractTileset(png, maps.plains.mapObstructedTerrain);

    writeFileSync(path.join(root, "client/js/core/data/tileset.js"), toModule(tileset));
    console.log(`${tileset.tiles.length} tiles and ${tileset.stamps.length} obstacles written to client/js/core/data/tileset.js`);
}
