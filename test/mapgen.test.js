import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { levels } from "../client/js/core/data/levels.js";
import { maps } from "../client/js/core/data/maps.js";
import { TILESET } from "../client/js/core/data/tileset.js";
import { Game } from "../client/js/core/game.js";
import { generateMap } from "../client/js/core/mapgen.js";
import { createMission, routesAreOpen } from "../client/js/core/missions.js";
import { createRandom, noise } from "../client/js/core/random.js";
import { layout, offMap, sector } from "../client/js/core/sites.js";
import { extractTileset } from "../scripts/extract-tileset.js";
import { decodePng } from "../scripts/png.js";

const ALL_LEVELS = [...levels.singleplayer, ...levels.multiplayer];
const SEEDS = Array.from({ length: 25 }, (_, index) => index * 7919 + 1);

// A short fingerprint of a map's tiles
function fingerprint(map) {
    let hash = 0;

    for (const row of map.tiles) {
        for (const tile of row) {
            hash = (Math.imul(hash, 31) + tile + 1) >>> 0;
        }
    }

    return hash;
}

describe("map generation", () => {
    it("uses the tiles of the book's map, as they are in the image", () => {
        const png = decodePng(readFileSync(new URL("../client/images/maps/plains.png", import.meta.url)));
        const tileset = extractTileset(png, maps.plains.mapObstructedTerrain);

        // client/js/core/data/tileset.js is up to date (npm run extract:tileset)
        assert.deepEqual(tileset, JSON.parse(JSON.stringify({ ...TILESET, image: undefined })));
        assert.equal(TILESET.tiles.length, 73);
        assert.ok(TILESET.stamps.some((stamp) => stamp.width === 3 && stamp.height === 3), "tree clumps");
    });

    it("gives the same map for the same seed, and different maps for different seeds", () => {
        const spec = levels.singleplayer[0].generate;

        assert.deepEqual(generateMap(spec, 123), generateMap(spec, 123));
        assert.notEqual(fingerprint(generateMap(spec, 123)), fingerprint(generateMap(spec, 124)));
    });

    it("keeps making the same maps (so that players with different versions agree)", () => {
        // If this changes on purpose, update the number: every seed now gives a different map
        assert.equal(fingerprint(generateMap(levels.multiplayer[0].generate, 2024)), 1536956382);
    });

    it("only uses arithmetic that every browser does the same way", () => {
        const random = createRandom(42);
        const again = createRandom(42);

        for (let i = 0; i < 100; i++) {
            assert.equal(random.next(), again.next());
        }

        for (let i = 0; i < 100; i++) {
            const value = noise(i * 1.7, i * 0.3, 9);

            assert.ok(value >= 0 && value <= 1);
        }

        // No Math.random, Math.sin and the like in the code that makes maps
        for (const file of ["mapgen.js", "random.js"]) {
            const source = readFileSync(new URL(`../client/js/core/${file}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");

            assert.doesNotMatch(source, /Math\.(random|sin|cos|tan|exp|log|pow|atan|hypot|cbrt)\b/, file);
        }
    });

    for (const level of ALL_LEVELS) {
        it(`makes good maps for ${level.name ? `"${level.name}"` : "multiplayer"}: tiles fit, sites are clear, routes are open`, () => {
            const spec = level.generate;

            for (const seed of SEEDS) {
                const map = generateMap(spec, seed);
                const where = `seed ${seed}`;

                assert.equal(map.tiles.length, spec.height, where);
                assert.equal(map.tiles[0].length, spec.width, where);

                for (let y = 0; y < map.height; y++) {
                    for (let x = 0; x < map.width; x++) {
                        const tile = TILESET.tiles[map.tiles[y][x]];

                        assert.ok(tile, `${where}: tile ${x},${y} exists`);

                        // Neighbouring tiles agree on the terrain at the corners they share
                        const right = TILESET.tiles[map.tiles[y][x + 1]];
                        const below = TILESET.tiles[map.tiles[y + 1]?.[x]];

                        if (right) {
                            assert.equal(tile.corners[1] + tile.corners[2], right.corners[0] + right.corners[3], `${where}: tiles ${x},${y} and ${x + 1},${y} join up`);
                        }

                        if (below) {
                            assert.equal(tile.corners[3] + tile.corners[2], below.corners[0] + below.corners[1], `${where}: tiles ${x},${y} and ${x},${y + 1} join up`);
                        }

                        // Units can cross plain grass only
                        if (map.tiles[y][x] !== TILESET.grass) {
                            assert.equal(map.obstructed[y][x], 1, `${where}: tile ${x},${y} blocks units`);
                        }
                    }
                }

                for (const site of Object.values(map.sites)) {
                    assert.ok(site.x >= 0 && site.y >= 0 && site.x + site.width <= map.width && site.y + site.height <= map.height, `${where}: ${site.name} is on the map`);

                    for (let y = site.y; y < site.y + site.height; y++) {
                        for (let x = site.x; x < site.x + site.width; x++) {
                            assert.equal(map.obstructed[y][x], 0, `${where}: ${site.name} is open ground`);
                        }
                    }
                }
            }
        });

        it(`makes every ${level.name ? `"${level.name}"` : "multiplayer"} mission playable: its buildings leave every route open`, () => {
            for (const seed of SEEDS) {
                const mission = createMission(level, { seed });

                assert.ok(routesAreOpen(mission, level.generate.connect), `seed ${seed}`);

                // Nothing starts on water, lava or an obstacle
                const game = new Game();

                game.loadLevel(mission, { team: "blue" });

                for (const item of game.items) {
                    const onMap = item.x >= 0 && item.y >= 0 && item.x < mission.map.mapGridWidth && item.y < mission.map.mapGridHeight;

                    if (onMap && item.type !== "aircraft") {
                        assert.equal(game.mapTerrainGrid[Math.floor(item.y)][Math.floor(item.x)], 0, `seed ${seed}: ${item.name} at ${item.x},${item.y}`);
                    }
                }
            }
        });
    }

    it("puts the mission's objectives where the mission's story says they are", () => {
        for (const seed of SEEDS) {
            const mission = createMission(levels.singleplayer[0], { seed });
            const { base, convoy, rescue, home } = mission.sites;
            const hint = [];
            const game = new Game();

            game.on("message", (from, message) => hint.push(message));
            game.loadLevel(mission, { team: "blue" });

            // The convoy waits just off the map beside its site, far from the base
            const transport = mission.items.find((item) => item.uid === -3);

            assert.ok(convoy.side, `seed ${seed}: the convoy is against the edge of the map`);
            assert.deepEqual({ x: transport.x, y: transport.y }, (({ x, y }) => ({ x, y }))(offMap(convoy, 3, 2)));
            assert.ok((convoy.cx - base.cx) ** 2 + (convoy.cy - base.cy) ** 2 > 30 ** 2, `seed ${seed}: the convoy is far from the base`);

            // The areas the triggers check are around the right sites
            assert.ok(rescue.x < convoy.x && rescue.x + rescue.width > convoy.x + convoy.width);
            assert.ok(home.x < base.x && home.x + home.width > base.x + base.width);

            // The operator says where to look
            for (let tick = 0; tick < 110; tick++) {
                game.update();
            }

            assert.ok(hint.some((message) => message.includes(`${sector(convoy)} Sector`)), `seed ${seed}: ${hint.join(" / ")}`);
        }
    });

    it("mirrors a base's layout to suit the corner it is in", () => {
        const site = (corner) => ({ x: 10, y: 20, width: 9, height: 12, corner });
        const designedForSouthWest = (corner) => layout(site(corner), "sw");

        assert.deepEqual(designedForSouthWest("sw")(4, 8, 2, 2), { x: 14, y: 28 });
        assert.deepEqual(designedForSouthWest("se")(4, 8, 2, 2), { x: 13, y: 28 });
        assert.deepEqual(designedForSouthWest("nw")(4, 8, 2, 2), { x: 14, y: 22 });
        // Facing east (2) becomes west (6) when mirrored left to right; south (4) becomes north (0) top to bottom
        assert.equal(designedForSouthWest("se").direction(2), 6);
        assert.equal(designedForSouthWest("nw").direction(4), 0);
        assert.equal(designedForSouthWest("ne").direction(3), 7);
    });
});
