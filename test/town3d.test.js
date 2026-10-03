// Drawing the world (client/js/world): what can be checked without a screen
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GROUND, LANDMARKS, pieceCatalog } from "../client/js/core/setpieces/pieces.js";
import { generateWorld } from "../client/js/core/world.js";
import { LANDMARK_BUILDERS } from "../client/js/world/art/kits/landmarks.js";
import { HOMES, LAND_COLOURS, landColour, landColours, splatData, splatOf } from "../client/js/world/ground.js";
import { BIOMES, CELLS } from "../client/js/core/worldplan/plan.js";
import { RACES } from "../client/js/core/worldplan/races.js";
import { MATERIALS, paintLayer } from "../client/js/world/art/engine/painters.js";
import * as THREE from "three";
import { BUILDERS, heightMap, PIXEL } from "../client/js/world/town3d.js";
import { View } from "../client/js/world/view.js";

describe("the town in 3D (town3d.js)", () => {
    it("has something to build every kind of piece a town can have, and every special building", () => {
        for (const piece of pieceCatalog()) {
            assert.equal(typeof BUILDERS[piece.kind], "function", piece.key);
        }

        for (const name of Object.keys(LANDMARKS)) {
            assert.equal(typeof LANDMARK_BUILDERS[name], "function", name);
        }
    });

    it("builds to the world's measure: five art pixels to a metre", () => {
        assert.equal(PIXEL, 0.2);
    });
});

describe("the ground (ground.js)", () => {
    const world = generateWorld({ seed: 1 });
    const splat = splatData(world, 2);
    const at = (x, y, layer) => splat.data[((Math.floor(y * 2) * splat.width) + Math.floor(x * 2)) * 4 + layer];

    it("has a texel for every half metre of the map", () => {
        assert.equal(splat.width, world.width * 2);
        assert.equal(splat.height, world.height * 2);
    });

    it("lays each kind of ground where the plan puts it, and grass everywhere else", () => {
        const layers = { [GROUND.road]: 0, [GROUND.cobbles]: 1, [GROUND.soil]: 2, [GROUND.courtyard]: 3 };
        const found = new Set();

        // Squares in the middle of a patch of one kind of ground (edges blend)
        for (let y = 2; y < world.height - 2; y++) {
            for (let x = 2; x < world.width - 2; x++) {
                const kind = world.ground[y][x];
                let alone = true;

                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        alone &&= world.ground[y + dy][x + dx] === kind;
                    }
                }

                if (!alone) {
                    continue;
                }

                const values = [0, 1, 2, 3].map((layer) => at(x + 0.5, y + 0.5, layer));

                if (kind === GROUND.grass) {
                    // (But the grass beside a road, worn to its dirt)
                    const worn = [-3, -2, -1, 0, 1, 2, 3].some((dy) => [-3, -2, -1, 0, 1, 2, 3].some((dx) => world.ground[y + dy]?.[x + dx] === GROUND.road));

                    assert.deepEqual(worn ? values.slice(1) : values, worn ? [0, 0, 0] : [0, 0, 0, 0], `grass at ${x}, ${y}`);
                } else {
                    assert.equal(values[layers[kind]], 255, `ground ${kind} at ${x}, ${y}`);
                    found.add(kind);
                }
            }
        }

        assert.ok(found.has(GROUND.road) && found.has(GROUND.cobbles), "roads and a cobbled square");
    });

    it("is the same where two parts of a map overlap, so the chunks of the world meet without a seam", () => {
        const kindAt = (x, y) => world.ground[y]?.[x];
        const [left, right] = [splatOf(kindAt, [10, 20, 40, 30], 4), splatOf(kindAt, [46, 20, 40, 30], 4)];
        let compared = 0;

        assert.ok(left.any && right.any);

        // (Metres 46 to 50 are in both)
        for (let j = 0; j < 30 * 4; j++) {
            for (let i = 0; i < 4 * 4; i++) {
                for (let layer = 0; layer < 4; layer++) {
                    assert.equal(left.data[(j * 160 + (36 * 4 + i)) * 4 + layer], right.data[(j * 160 + i) * 4 + layer]);
                    compared++;
                }
            }
        }

        assert.equal(compared, 120 * 16 * 4);
        assert.equal(splatOf(() => GROUND.grass, [0, 0, 8, 8]).any, false, "grass alone");
    });

    it("wears the grass beside a road to its dirt, raggedly, most right beside it, and none further off or beside other ground", () => {
        // (A road four metres wide down x 20 to 23, a cobbled square's edge down x 36 to 39)
        const kindAt = (x) => (x >= 20 && x < 24 ? GROUND.road : x >= 36 && x < 40 ? GROUND.cobbles : GROUND.grass);
        const { data } = splatOf(kindAt, [0, 0, 48, 16], 4);
        const road = (x) => Array.from({ length: 16 * 4 }, (_, j) => [0, 1, 2, 3].map((i) => data[(j * 192 + x * 4 + i) * 4])).flat();

        for (const x of [0, 10, 16, 27, 30, 33, 34, 42, 47]) {
            assert.ok(road(x).every((value) => value === 0), `no wear at ${x}`);
        }

        // (Beside it: some of its dirt, never all, as ragged as the edges' noise; less a square
        // further off)
        const mean = (x) => road(x).reduce((sum, value) => sum + value, 0) / road(x).length;

        for (const x of [19, 24]) {
            const values = road(x);

            assert.ok(mean(x) > 40 && mean(x) < 160, `${mean(x)} at ${x}`);
            assert.ok(Math.max(...values) - Math.min(...values) > 40, `ragged at ${x}`);
        }

        assert.ok(mean(18) > 10 && mean(18) < mean(19) && mean(25) > 10 && mean(25) < mean(24), `${mean(18)}, ${mean(25)} a square further off`);
    });

    it("gives every land a colour over the grass, or none", () => {
        for (const { id } of BIOMES) {
            const [colour, amount] = LAND_COLOURS[id];

            assert.match(colour, /^#[0-9a-f]{6}$/, id);
            assert.ok(amount >= 0 && amount <= 1, id);
        }

        assert.equal(LAND_COLOURS.meadow[1], 0, "the grass as it is in meadows");
        assert.ok(LAND_COLOURS.snow[1] > 0.9 && LAND_COLOURS.woods[1] < 0.5);
    });

    it("lays each people's own ground over its homeland (none under the water), the humans' the grass", () => {
        const biome = new Uint8Array(CELLS * CELLS).fill(BIOMES.findIndex(({ id }) => id === "meadow"));
        const territory = new Uint8Array(CELLS * CELLS);
        const sea = BIOMES.findIndex(({ id }) => id === "sea");

        // (A cell of each people's, and one of the orcs' under the sea)
        RACES.forEach((_, k) => (territory[k] = k + 1));
        territory[CELLS] = RACES.findIndex(({ id }) => id === "orc") + 1;
        biome[CELLS] = sea;

        const land = landColours({ biome, territory });
        const [first, second] = land.userData.home.map((texture) => texture.image.data);
        const weights = (k) => [...first.slice(k * 4, k * 4 + 4), second[k * 4]];

        assert.deepEqual(HOMES, ["cat", "orc", "lizard", "elf", "darkElf"]);

        RACES.forEach(({ id }, k) => {
            assert.deepEqual(weights(k), HOMES.map((people) => (people === id ? 255 : 0)), id);
        });
        assert.deepEqual(weights(CELLS), [0, 0, 0, 0, 0], "under the sea");
        assert.deepEqual(weights(CELLS + 1), [0, 0, 0, 0, 0], "the wild");

        // (Each painted, as a ground: tiling, and not the grass)
        for (const people of HOMES) {
            const name = `home-${people}`;
            const layer = paintLayer(name, 16);

            assert.ok(MATERIALS[name]?.ground, name);
            assert.equal(layer.length, 16 * 16 * 4);
        }

        assert.equal(landColour("savannah", "cat").userData.home[0].image.data[0], 255);
        assert.equal(landColour("meadow", "human").userData.home, undefined);
    });
});

describe("the town's height maps (town3d.js heightMap)", () => {
    it("covers the town where it's set in the world, and reads nothing outside it", () => {
        const map = heightMap([100, 200, 30, 20]);

        map.rows[5][7] = 6.5;
        assert.equal(map.at(107.2, 205.9), 6.5);
        assert.equal(map.at(99, 205), 0);
        assert.equal(map.at(107, 221), 0);
        assert.equal(map.rows.length, 20);
        assert.equal(map.rows[0].length, 30);
    });
});

describe("what hides the player from the camera (view.js hidden), for the cut-away", () => {
    // (A camera 8 m south of the player and 6 m up, as it follows them looking north)
    const hidden = (map) => View.prototype.hidden.call({ occluders: map, camera: { position: new THREE.Vector3(10.5, 7, 18.5) } }, new THREE.Vector3(10.5, 1, 10.5));

    it("is what stands between them higher than the line from one to the other", () => {
        const map = heightMap([0, 0, 40, 40]);

        assert.equal(hidden(map), false, "nothing");
        map.rows[13][10] = 4;
        assert.equal(hidden(map), true, "a house's wall behind the player");
        map.rows[13][10] = 2;
        assert.equal(hidden(map), false, "something low, seen over");
    });

    it("isn't anything behind the camera, however high", () => {
        const map = heightMap([0, 0, 40, 40]);

        for (let z = 20; z < 30; z++) {
            map.rows[z][10] = 25;
        }

        assert.equal(hidden(map), false);
    });
});
