// The tall grass (world/grassmap.js says where it grows, how tall and how dry; world/grass.js draws
// it round the player): the same every time, only on open grass, as thick and as tall as its land
// grows it and varied across it; drawn in two bands round the player as far as each quality asks,
// none on low
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ALONG } from "../client/js/core/fields.js";
import { buildWorld, CHUNK, WET } from "../client/js/core/overworld.js";
import { GROUND } from "../client/js/core/setpieces/pieces.js";
import { GRASS_BANDS, TallGrass } from "../client/js/world/grass.js";
import { CROP_STANDS, GRASS_LANDS, grassMap } from "../client/js/world/grassmap.js";
import { QUALITY } from "../client/js/world/view.js";

describe("where the tall grass grows (world/grassmap.js)", () => {
    let overworld;
    // (Chunks of open land: a meadow's, a heath's, farmland's, near where the player starts)
    const chunks = [];

    before(() => {
        overworld = buildWorld({ seed: 1 }).maps.town;

        for (const [x, y] of [[3043, 5073], [2747, 5586], [3010, 5434]]) {
            chunks.push(overworld.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK)));
        }
    });

    it("maps each chunk the same every time, standing on its ground", () => {
        for (const chunk of chunks) {
            const map = grassMap(overworld, chunk);

            assert.deepEqual(grassMap(overworld, chunk), map);

            for (let j = 0; j < CHUNK; j++) {
                for (let i = 0; i < CHUNK; i++) {
                    assert.equal(map.heights[j * CHUNK + i], chunk.heights[j * (CHUNK + 1) + i]);
                }
            }
        }
    });

    it("grows it only on open grass (and the crops in the fields' strips): none on roads, ploughed strips or yards, where anything stands, on water or a bridge", () => {
        let open = 0;

        for (const chunk of chunks) {
            const { map } = grassMap(overworld, chunk);

            for (let k = 0; k < CHUNK * CHUNK; k++) {
                const sown = chunk.ground[k] === GROUND.soil && CROP_STANDS[chunk.crops[k] % ALONG];
                const closed = (chunk.ground[k] !== GROUND.grass && !sown) || chunk.blocked[k] || chunk.water[k] !== WET.none || chunk.bridge[k];

                if (closed) {
                    assert.equal(map[k * 4], 0, `square ${k}`);
                } else {
                    open++;
                }
            }
        }

        assert.ok(open > 5000, `${open} open squares`);
    });

    it("grows it in clumps and stretches: thick and thin, tall and short, green and golden", () => {
        const values = [[], [], []];

        for (const chunk of chunks) {
            const { map } = grassMap(overworld, chunk);

            for (let k = 0; k < CHUNK * CHUNK; k++) {
                if (map[k * 4]) {
                    [0, 1, 2].forEach((channel) => values[channel].push(map[k * 4 + channel]));
                }
            }
        }

        // (Each spread out over much of its range: not all one thickness, height or colour)
        for (const [channel, name] of [[0, "thickness"], [1, "height"], [2, "dryness"]]) {
            const sorted = values[channel].sort((a, b) => a - b);
            const [low, high] = [sorted[Math.floor(sorted.length * 0.1)], sorted[Math.floor(sorted.length * 0.9)]];

            assert.ok(high - low > 40, `${name} from ${low} to ${high}`);
        }

        // (None taller than its land's tallest)
        const tallest = Math.max(...Object.values(GRASS_LANDS).map(({ height }) => height[1]));

        assert.ok((Math.max(...values[1]) / 255) * 2 <= tallest + 0.01, `${(Math.max(...values[1]) / 255) * 2} m`);
    });
});

describe("the tall grass drawn (world/grass.js)", () => {
    let overworld;

    before(() => {
        overworld = buildWorld({ seed: 1 }).maps.town;
    });

    it("draws none on low; two bands on medium and high, reaching further on high", () => {
        assert.equal(QUALITY.low.grass, null);
        assert.ok(QUALITY.medium.grass.near < QUALITY.medium.grass.far);
        assert.ok(QUALITY.high.grass.near > QUALITY.medium.grass.near && QUALITY.high.grass.far > QUALITY.medium.grass.far);

        const grass = new TallGrass(overworld);

        grass.setQuality(QUALITY.low.grass);
        assert.equal(grass.object.children.length, 0);

        grass.setQuality(QUALITY.medium.grass);
        assert.equal(grass.object.children.length, 2);

        // (Each band's clump drawn once for each cell of a lattice as wide as the band's reach)
        const [near, far] = grass.object.children;
        const cells = (reach, { cell }) => (Math.ceil((2 * reach) / cell) + 1) ** 2;

        assert.equal(near.geometry.instanceCount, cells(QUALITY.medium.grass.near, GRASS_BANDS.near));
        assert.equal(far.geometry.instanceCount, cells(QUALITY.medium.grass.far, GRASS_BANDS.far));
        // (A near blade's five corners make three triangles; a far blade's three, one)
        assert.equal(near.geometry.attributes.position.count, GRASS_BANDS.near.blades * 5);
        assert.equal(near.geometry.index.count, GRASS_BANDS.near.blades * 9);
        assert.equal(far.geometry.attributes.position.count, GRASS_BANDS.far.blades * 3);
        assert.equal(far.geometry.index.count, GRASS_BANDS.far.blades * 3);

        grass.setQuality(null);
        assert.equal(grass.object.children.length, 0);
        grass.dispose();
    });

    it("maps the nine chunks round the player into their blocks as they're drawn, and none that aren't", () => {
        const [x, z] = [3043, 5073];
        const [pcx, pcy] = [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];
        // (The chunk to the player's east not drawn yet)
        const grass = new TallGrass(overworld, { ready: (cx, cy) => !(cx === pcx + 1 && cy === pcy) });

        grass.setQuality(QUALITY.medium.grass);
        grass.update(x, z, 1e6);

        const texels = grass.map.image.width;
        const blockOf = (cx, cy) => [(((cx % 4) + 4) % 4) * CHUNK, (((cy % 4) + 4) % 4) * CHUNK];

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const [cx, cy] = [pcx + dx, pcy + dy];
                const [bx, by] = blockOf(cx, cy);
                const map = grassMap(overworld, overworld.chunk(cx, cy)).map;
                const drawn = !(dx === 1 && dy === 0);

                for (const [i, j] of [[0, 0], [17, 40], [63, 63], [32, 5]]) {
                    const at = ((by + j) * texels + bx + i) * 4;

                    assert.equal(grass.map.image.data[at], drawn ? map[(j * CHUNK + i) * 4] : 0, `${dx}, ${dy} at ${i}, ${j}`);
                }
            }
        }

        grass.dispose();
    });
});
