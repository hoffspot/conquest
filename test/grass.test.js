// The tall grass (world/grassmap.js says where it grows, how tall and how dry; world/grass.js draws
// it round the player): the same every time, only on open grass, as thick and as tall as its land
// grows it and varied across it, gathered round what stands, trodden beside the ways, drier on the
// sunny side; drawn in two bands round the player as far as each quality asks, none on low
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ALONG } from "../client/js/core/fields.js";
import { buildWorld, CHUNK, WET } from "../client/js/core/overworld.js";
import { GROUND } from "../client/js/core/setpieces/pieces.js";
import { GRASS_BANDS, TallGrass } from "../client/js/world/grass.js";
import { CROP_STANDS, GRASS_LANDS, GRASS_PATHS, GRASS_RINGS, grassMap } from "../client/js/world/grassmap.js";
import { facingSun, SUN_FROM } from "../client/js/world/sun.js";
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

        // (None taller than its land's tallest, but where it gathers round what stands or at a
        // way's verge)
        assert.ok((Math.max(...values[1]) / 255) * 2 <= tallest * (1 + GRASS_RINGS.taller) * (1 + GRASS_PATHS.taller) + 0.01, `${(Math.max(...values[1]) / 255) * 2} m`);
    });

    it("gathers it round what stands, treads it short beside the ways and thick at their verges", () => {
        const [sx, sy] = [3043, 5073];
        const heights = { near: [], far: [], trodden: [], verge: [], away: [] };
        // (How far a square is from the nearest in its chunk a test says: up to `reach`)
        const nearest = (chunk, i, j, test, reach) => {
            let best = Infinity;

            for (let b = -reach; b <= reach; b++) {
                for (let a = -reach; a <= reach; a++) {
                    const [x, y] = [i + a, j + b];

                    if (x >= 0 && y >= 0 && x < CHUNK && y < CHUNK && test(y * CHUNK + x)) {
                        best = Math.min(best, Math.hypot(a, b));
                    }
                }
            }

            return best;
        };

        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const chunk = overworld.chunk(Math.floor(sx / CHUNK) + dx, Math.floor(sy / CHUNK) + dy);
                const { map } = grassMap(overworld, chunk);

                // (The squares well inside the chunk, of wild grass)
                for (let j = 6; j < CHUNK - 6; j++) {
                    for (let i = 6; i < CHUNK - 6; i++) {
                        const k = j * CHUNK + i;

                        if (!map[k * 4] || map[k * 4 + 3]) {
                            continue;
                        }

                        const standing = nearest(chunk, i, j, (n) => chunk.opaque[n] || chunk.solid[n], 5);
                        const way = nearest(chunk, i, j, (n) => [GROUND.road, GROUND.cobbles, GROUND.planks].includes(chunk.ground[n]), 6);

                        if (way > 6) {
                            heights[standing <= 1.5 ? "near" : standing >= 3.5 ? "far" : "between"]?.push(map[k * 4 + 1]);
                        }

                        if (standing > 5) {
                            heights[way <= 1.5 ? "trodden" : way >= 2.5 && way <= 4 ? "verge" : way > 6 ? "away" : "between"]?.push(map[k * 4 + 1]);
                        }
                    }
                }
            }
        }

        const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

        for (const values of Object.values(heights)) {
            assert.ok(values.length > 300, `${values.length} squares`);
        }

        assert.ok(mean(heights.near) > mean(heights.far) * 1.08, `${mean(heights.near)} by what stands, ${mean(heights.far)} away`);
        assert.ok(mean(heights.trodden) < mean(heights.away) * 0.6, `${mean(heights.trodden)} trodden, ${mean(heights.away)} away`);
        assert.ok(mean(heights.verge) > mean(heights.away) * 1.1, `${mean(heights.verge)} at the verge, ${mean(heights.away)} away`);
    });

    it("dries it on the side of a hill that faces the sun, and greens it on the shaded side", () => {
        // (The same meadow, tilted towards the sun and away from it)
        const [sx, sz] = [SUN_FROM[0] / Math.hypot(SUN_FROM[0], SUN_FROM[2]), SUN_FROM[2] / Math.hypot(SUN_FROM[0], SUN_FROM[2])];
        const meadow = { plan: { seed: 1 }, biomeAt: () => "meadow", settled: () => false, chunks: new Map() };
        const tilted = (fall) => ({
            cx: 50,
            cy: 80,
            x0: 50 * CHUNK,
            y0: 80 * CHUNK,
            heights: Float32Array.from({ length: (CHUNK + 1) ** 2 }, (_, k) => 20 - fall * ((k % (CHUNK + 1)) * sx + Math.floor(k / (CHUNK + 1)) * sz)),
            ...Object.fromEntries(["ground", "blocked", "water", "bridge", "slopes", "crops", "opaque", "solid"].map((name) => [name, new Uint8Array(CHUNK * CHUNK)])),
        });
        const [sunny, shaded] = [tilted(0.15), tilted(-0.15)];
        const mean = (chunk, channel) => grassMap(meadow, chunk).map.reduce((sum, value, k) => sum + (k % 4 === channel ? value : 0), 0) / (CHUNK * CHUNK);

        assert.ok(facingSun(sunny.heights, 10, 10) > 0.1 && facingSun(shaded.heights, 10, 10) < -0.1);
        assert.ok(mean(sunny, 2) > mean(shaded, 2) + 40, `${mean(sunny, 2)} sunny, ${mean(shaded, 2)} shaded`);
        // (And thinner on the sunny side)
        assert.ok(mean(sunny, 0) < mean(shaded, 0), `${mean(sunny, 0)} sunny, ${mean(shaded, 0)} shaded`);
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

    it("maps the nine chunks round the player into their blocks once they and the chunks round them are drawn, and none that aren't", () => {
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
                // (Those with the undrawn chunk among the nine round them wait for it)
                const drawn = dx === -1;

                for (const [i, j] of [[0, 0], [17, 40], [63, 63], [32, 5]]) {
                    const at = ((by + j) * texels + bx + i) * 4;

                    assert.equal(grass.map.image.data[at], drawn ? map[(j * CHUNK + i) * 4] : 0, `${dx}, ${dy} at ${i}, ${j}`);
                }
            }
        }

        grass.dispose();
    });
});
