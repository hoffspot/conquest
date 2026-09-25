// Drawing the world (client/js/world): what can be checked without a screen
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GROUND, LANDMARKS, pieceCatalog } from "../client/js/core/setpieces/pieces.js";
import { generateWorld } from "../client/js/core/world.js";
import { LANDMARK_BUILDERS } from "../client/js/world/art/kits/landmarks.js";
import { splatData } from "../client/js/world/ground.js";
import { BUILDERS, PIXEL } from "../client/js/world/town3d.js";

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
                    assert.deepEqual(values, [0, 0, 0, 0], `grass at ${x}, ${y}`);
                } else {
                    assert.equal(values[layers[kind]], 255, `ground ${kind} at ${x}, ${y}`);
                    found.add(kind);
                }
            }
        }

        assert.ok(found.has(GROUND.road) && found.has(GROUND.cobbles), "roads and a cobbled square");
    });
});
