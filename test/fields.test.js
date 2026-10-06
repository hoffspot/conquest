// Farmland's fields (client/js/core/fields.js): blocks of parallel strips, each its own crop, grass
// verges round each block and baulks between its strips, some blocks left as pasture; laid into
// the world's chunks (soil where a strip's ploughed or sown, the trees on the verges), standing in
// the tall grass (world/grassmap.js) and drawn on the ground (world/ground.js)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ALONG, blockAlong, CROP, fieldAt, FIELDS, hedgeLine, sown } from "../client/js/core/fields.js";
import { buildWorld, CHUNK, VERGE } from "../client/js/core/overworld.js";
import { GROUND } from "../client/js/core/setpieces/pieces.js";
import { fieldsOf } from "../client/js/world/ground.js";
import { CROP_STANDS, grassMap } from "../client/js/world/grassmap.js";
import { HEDGES, hedgeMesh, hedgeRuns } from "../client/js/world/art/kits/hedges.js";
import { undergrowthOf } from "../client/js/world/art/kits/wilds.js";

const SEED = 1;

// The squares of the block a square's in (whole metres): [x0, y0, x1, y1], the far edges past it
function blockOf(x, y) {
    const [, x0, x1] = blockAlong(x, 0, SEED);
    const [, y0, y1] = blockAlong(y, 1, SEED);

    return [x0, y0, x1, y1];
}

describe("the fields' layout (fields.js)", () => {
    it("lays the land out in blocks, their edges wandering, every metre in exactly one", () => {
        const widths = new Set();

        for (let x = 0; x < 3000; x++) {
            const [k, x0, x1] = blockAlong(x, 0, SEED);

            assert.ok(x >= x0 && x < x1, `${x} in ${x0} to ${x1}`);
            assert.ok(Math.abs(x0 - k * FIELDS.block) <= FIELDS.jitter);
            assert.deepEqual(blockAlong(x1, 0, SEED)[1], x1);
            widths.add(x1 - x0);
        }

        // (Not all one size)
        assert.ok(widths.size > 10, `${widths.size} widths`);
        assert.ok(Math.min(...widths) >= FIELDS.block - 2 * FIELDS.jitter && Math.max(...widths) <= FIELDS.block + 2 * FIELDS.jitter);
    });

    it("strips each block one way, its strips its width, a baulk between each and a verge round it", () => {
        let blocks = 0;

        for (let by = 0; by < 20; by++) {
            for (let bx = 0; bx < 20; bx++) {
                const [x0, y0, x1, y1] = blockOf(bx * FIELDS.block + 40, by * FIELDS.block + 40);
                const fields = [];

                for (let y = y0; y < y1; y++) {
                    for (let x = x0; x < x1; x++) {
                        const field = fieldAt(SEED, x, y);

                        fields.push({ x, y, ...field });
                        // (The same every time; the block's middle where it is)
                        assert.deepEqual(fieldAt(SEED, x, y), field);
                        assert.deepEqual(field.middle, [Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2)]);
                    }
                }

                // (Its verge grass all round)
                const verge = fields.filter(({ x, y }) => x - x0 < FIELDS.margin || y - y0 < FIELDS.margin || x1 - 1 - x < FIELDS.margin || y1 - 1 - y < FIELDS.margin);

                assert.ok(verge.every(({ crop }) => crop === CROP.none));

                const strips = fields.filter(({ crop }) => crop !== CROP.none);

                // (A pasture: grass all over)
                if (!strips.length) {
                    continue;
                }

                blocks++;

                // (All its strips one way; each the same crop all along it, and the same width
                // as the next but at its block's far side)
                const { along } = fields[0];

                assert.ok(fields.every((field) => field.along === along));

                const across = new Map();

                for (const { x, y, crop } of fields) {
                    const at = along === 0 ? y : x;
                    const length = along === 0 ? x : y;
                    const start = along === 0 ? x0 : y0;
                    const end = along === 0 ? x1 : y1;

                    if (length - start >= FIELDS.margin && end - 1 - length >= FIELDS.margin) {
                        across.set(at, [...(across.get(at) ?? []), crop]);
                    }
                }

                const rows = [...across.entries()].sort(([a], [b]) => a - b).map(([, crops]) => crops);

                assert.ok(rows.every((crops) => crops.every((crop) => crop === crops[0])), "a strip's crop all along it");

                // (Runs of sown rows, a row of grass between each run and the next)
                const runs = [];
                let run = 0;

                for (const crops of rows.slice(FIELDS.margin, rows.length - FIELDS.margin)) {
                    if (crops[0] === CROP.none) {
                        if (run) {
                            runs.push(run);
                        }

                        run = 0;
                    } else {
                        run++;
                    }
                }

                if (run) {
                    runs.push(run);
                }

                assert.ok(runs.length >= 2, `${runs.length} strips`);
                assert.ok(FIELDS.strips.includes(runs[0]), `strips ${runs[0]} wide`);
                assert.ok(runs.slice(0, -1).every((width) => width === runs[0]), `strips ${runs.join(", ")} wide`);
                assert.ok(runs.at(-1) >= 4 && runs.at(-1) <= runs[0]);
            }
        }

        assert.ok(blocks > 200, `${blocks} blocks in strips`);
    });

    it("sows a mix of crops, ploughed the most, and leaves some blocks as pasture", () => {
        const crops = new Map();
        let [pasture, blocks] = [0, 0];

        for (let by = 0; by < 40; by++) {
            for (let bx = 0; bx < 40; bx++) {
                const [x0, y0, x1, y1] = blockOf(bx * FIELDS.block + 40, by * FIELDS.block + 40);
                let any = false;

                for (let y = y0 + FIELDS.margin; y < y1 - FIELDS.margin; y++) {
                    for (let x = x0 + FIELDS.margin; x < x1 - FIELDS.margin; x++) {
                        const { crop } = fieldAt(SEED, x, y);

                        crops.set(crop, (crops.get(crop) ?? 0) + 1);
                        any ||= crop !== CROP.none;
                    }
                }

                blocks++;
                pasture += any ? 0 : 1;
            }
        }

        assert.ok(Math.abs(pasture / blocks - FIELDS.pasture) < 0.06, `${pasture} of ${blocks} pasture`);

        for (const crop of [CROP.ploughed, CROP.wheat, CROP.barley, CROP.greens, CROP.fallow]) {
            assert.ok(crops.get(crop) > 0, `crop ${crop}`);
        }

        assert.ok([CROP.wheat, CROP.barley, CROP.greens, CROP.fallow].every((crop) => crops.get(CROP.ploughed) > crops.get(crop)));
        assert.deepEqual([0, 1, 2, 3, 4, 5].map(sown), [false, true, true, true, true, false]);
    });
});

describe("the fields in the world (overworld.js, grassmap.js, ground.js)", () => {
    let overworld;
    let chunks;

    before(() => {
        overworld = buildWorld({ seed: SEED }).maps.town;
        // (Farmland near where the player starts)
        chunks = [[3010, 5434], [3080, 5434], [3010, 5500]].map(([x, y]) => overworld.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK)));
    });

    it("lays them into farmland's chunks: soil where a strip's ploughed or sown, grass on its verges, baulks and fallow", () => {
        let strips = 0;

        for (const chunk of chunks) {
            for (let k = 0; k < CHUNK * CHUNK; k++) {
                const crop = chunk.crops[k] % ALONG;
                const [x, y] = [chunk.x0 + (k % CHUNK), chunk.y0 + Math.floor(k / CHUNK)];

                if (crop) {
                    const field = fieldAt(SEED, x, y);

                    assert.equal(crop, field.crop);
                    assert.equal(chunk.crops[k] >= ALONG, field.along === 1);
                    assert.equal(chunk.ground[k], sown(crop) ? GROUND.soil : GROUND.grass);
                    strips++;
                } else if (!chunk.water[k] && !overworld.inTown(x, y) && !overworld.settled(x, y)) {
                    // (No soil but in a strip: but under the water, and a town's or a settlement's own)
                    assert.notEqual(chunk.ground[k], GROUND.soil, `${x}, ${y}`);
                }
            }
        }

        assert.ok(strips > 3000, `${strips} squares in strips`);
    });

    it("leaves a verge of the wild's grass between the fields and the roads, and the settlements' streets out through their fields", () => {
        // (Round where the player starts, and the next town: its streets running out through its fields)
        const world = buildWorld({ seed: SEED });
        const map = world.maps.town;
        const next = world.plan.places.filter(({ kind }) => kind === "town" && kind !== world.start).sort((a, b) => Math.hypot(a.at[0] - world.start.at[0], a.at[1] - world.start.at[1]) - Math.hypot(b.at[0] - world.start.at[0], b.at[1] - world.start.at[1]))[1];
        const square = (x, y) => {
            const chunk = map.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
            const k = (y - chunk.y0) * CHUNK + (x - chunk.x0);

            return { crop: chunk.crops[k], ground: chunk.ground[k] };
        };
        const reach = Math.ceil(VERGE) + 1;
        let [crops, roads] = [0, 0];

        for (const [cx, cy] of [world.start.at, next.at]) {
            for (let y = Math.round(cy) - 180; y < Math.round(cy) + 180; y++) {
                for (let x = Math.round(cx) - 180; x < Math.round(cx) + 180; x++) {
                    const { crop, ground } = square(x, y);

                    roads += ground === GROUND.road || ground === GROUND.cobbles ? 1 : 0;

                    if (!crop) {
                        continue;
                    }

                    crops++;

                    // (No road's or street's square nearer it than the verge, edge to edge)
                    for (let dy = -reach; dy <= reach; dy++) {
                        for (let dx = -reach; dx <= reach; dx++) {
                            const near = square(x + dx, y + dy).ground;
                            const gap = Math.hypot(Math.max(0, Math.abs(dx) - 1), Math.max(0, Math.abs(dy) - 1));

                            assert.ok(!(near === GROUND.road || near === GROUND.cobbles) || gap >= VERGE, `${x}, ${y}: a field ${gap} m from a road at ${x + dx}, ${y + dy}`);
                        }
                    }
                }
            }
        }

        assert.ok(crops > 10000 && roads > 2000, `${crops} squares sown, ${roads} of road`);
        assert.equal(VERGE, 2);
    });

    it("keeps trees and the land's things out of the strips: the trees on the verges, only haystacks and scarecrows in them", () => {
        for (const chunk of chunks) {
            const crop = (x, y) => chunk.crops[(y - chunk.y0) * CHUNK + (x - chunk.x0)];

            for (const { x, y } of chunk.trees) {
                assert.ok(!crop(x - 1, y - 1) && !crop(x, y - 1) && !crop(x - 1, y) && !crop(x, y), `a tree at ${x}, ${y}`);
            }

            for (const { kind, squares } of chunk.features) {
                if (squares.some(([x, y]) => crop(x, y))) {
                    assert.ok(kind === "haystack" || kind === "scarecrow", kind);
                }
            }
        }
    });

    it("stands the crops in their strips, thick, upright and of a height; none on the ploughed", () => {
        let stood = 0;

        for (const chunk of chunks) {
            const { map } = grassMap(overworld, chunk);

            for (let k = 0; k < CHUNK * CHUNK; k++) {
                const crop = chunk.crops[k] % ALONG;
                const stand = chunk.ground[k] === GROUND.soil && !chunk.blocked[k] ? CROP_STANDS[crop] : null;

                if (stand) {
                    const tall = (map[k * 4 + 1] / 255) * 2;

                    assert.equal(map[k * 4], 255);
                    assert.equal(map[k * 4 + 3], 255);
                    assert.ok(tall >= stand.height[0] - 0.01 && tall <= stand.height[1] + 0.01, `${tall} m`);
                    stood++;
                } else {
                    // (Wild grass isn't sown; nothing grows on the ploughed)
                    assert.equal(map[k * 4 + 3], 0);

                    if (crop === CROP.ploughed) {
                        assert.equal(map[k * 4], 0);
                    }
                }
            }
        }

        assert.ok(stood > 1000, `${stood} squares of crops`);
    });

    it("grows hedgerows along the farmed blocks' edges, broken only at gateways and where the ground isn't grass; nothing else growing in them", () => {
        let [metres, carried] = [0, 0];

        for (const chunk of chunks) {
            const runs = hedgeRuns(overworld, chunk);
            const { map } = grassMap(overworld, chunk);

            for (const { axis, at, from, to, ends } of runs) {
                assert.ok(to > from);

                for (let along = from; along < to; along++) {
                    const [x, y] = axis === 1 ? [at - 0.5, along] : [along, at - 0.5];
                    const k = (y - chunk.y0) * CHUNK + (x - chunk.x0);

                    // (On its block's edge, the block farmed; no tall grass through it)
                    assert.ok(overworld.hedgeAt(x, y) && hedgeLine(SEED, x, y), `${x}, ${y}`);
                    assert.equal(blockAlong(axis === 1 ? x : y, axis === 1 ? 0 : 1, SEED)[1], axis === 1 ? x : y);
                    assert.equal(chunk.ground[k], GROUND.grass);
                    assert.equal(map[k * 4], 0, `tall grass in the hedge at ${x}, ${y}`);
                    metres++;
                }

                // (Open only where it carries on into the next chunk)
                const [start, end] = axis === 1 ? [chunk.y0, chunk.y0 + CHUNK] : [chunk.x0, chunk.x0 + CHUNK];

                assert.ok(ends[0] || from === start, "open at its start");
                assert.ok(ends[1] || to === end, "open at its end");
                carried += ends.filter((closed) => !closed).length;
            }

            // (Nothing of the undergrowth in it)
            for (const { x, y } of undergrowthOf(overworld, chunk)) {
                assert.ok(!overworld.hedgeAt(Math.floor(x), Math.floor(y)), `undergrowth in the hedge at ${x}, ${y}`);
            }
        }

        assert.ok(metres > 150 && carried > 0, `${metres} m of hedges, ${carried} ends carried on`);
    });

    it("draws them as walls of leaves, as tall and thick as they grow there, rounded off where they end, sprigs standing out of them; the same every time; fewer sprigs and coarser on low", () => {
        const groundAt = (x, z) => overworld.ground.heightAt(x, z);

        for (const chunk of chunks) {
            const runs = hedgeRuns(overworld, chunk);
            const { object, boxes } = hedgeMesh(runs, [chunk.x0, chunk.y0], groundAt);
            const [body, sprigs] = ["hedges", "hedge sprigs"].map((name) => object.getObjectByName(name));
            const metres = runs.reduce((sum, { from, to }) => sum + to - from, 0);
            const position = body.geometry.attributes.position;

            // (Standing on the ground, no taller than a hedge grows, its lumps aside)
            for (let k = 0; k < position.count; k++) {
                const [x, y, z] = [position.getX(k) + chunk.x0, position.getY(k), position.getZ(k) + chunk.y0];
                const up = y - groundAt(x, z);

                assert.ok(up > -0.3 && up < HEDGES.height[1] + HEDGES.lumps[1] + 0.2, `${up} m up`);
            }

            assert.equal(boxes.length, runs.length);
            assert.ok(boxes.every(({ top, min, max }) => top > groundAt(min[0], min[1]) + 0.8 && max[0] >= min[0] && max[1] >= min[1]));
            assert.ok(Math.abs(sprigs.geometry.attributes.position.count / 4 - metres * HEDGES.sprigs) <= runs.length);
            assert.ok(body.castShadow && !sprigs.castShadow);

            // (The same every time)
            assert.deepEqual([...hedgeMesh(runs, [chunk.x0, chunk.y0], groundAt).object.getObjectByName("hedges").geometry.attributes.position.array], [...position.array]);

            // (On low, half the sprigs and half the rings)
            const low = hedgeMesh(runs, [chunk.x0, chunk.y0], groundAt, { sprigs: 0.5 }).object;

            assert.ok(Math.abs(low.getObjectByName("hedge sprigs").geometry.attributes.position.count / 4 - (metres * HEDGES.sprigs) / 2) <= runs.length);
            assert.ok(low.getObjectByName("hedges").geometry.attributes.position.count < position.count * 0.65);
        }
    });

    it("tells the ground each square's crop and which way its strip runs, and nothing where there are no fields", () => {
        for (const chunk of chunks) {
            const { texture, area } = fieldsOf(chunk);

            assert.deepEqual(area, [chunk.x0, chunk.y0, CHUNK, CHUNK]);

            for (let k = 0; k < CHUNK * CHUNK; k++) {
                assert.equal(texture.image.data[k * 4], chunk.crops[k] % ALONG);
                assert.equal(texture.image.data[k * 4 + 1], chunk.crops[k] >= ALONG ? 255 : 0);
            }

            texture.dispose();
        }

        // (The town's chunk: no fields)
        const town = overworld.chunk(Math.floor(overworld.stamp.at[0] / CHUNK) + 1, Math.floor(overworld.stamp.at[1] / CHUNK) + 1);

        assert.equal(fieldsOf(town), null);
    });
});
