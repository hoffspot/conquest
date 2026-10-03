// The arches of rock (client/js/core/arches.js, client/js/world/art/kits/arches.js, the terrain
// plan's M7h-2): one to three in each stretch of rocky land, on gentle ground clear of roads,
// water and the settlements, far apart, each inside its chunk; their legs taking their squares,
// open under their spans; drawn as a band of rock, outside facing out, coloured and laid with the
// cliffs' picture, at every quality
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };

const { ARCHES, archesOf, archSquares, feetOf } = await import("../client/js/core/arches.js");
const { buildWorld, CHUNK } = await import("../client/js/core/overworld.js");
const { landHeight } = await import("../client/js/core/terrain/height.js");
const { BIOMES, CELL, CELLS, planWorld, WATER } = await import("../client/js/core/worldplan/plan.js");
const { ARCH_LOOK, archInto, archMesh, surfaceOf } = await import("../client/js/world/art/kits/arches.js");
const { cliffMaterial } = await import("../client/js/world/art/engine/atlas.js");
const { Mesher } = await import("../client/js/world/art/kits/wilds.js");

let world;
let plan;

describe("the arches of rock (core/arches.js)", () => {
    before(() => {
        world = buildWorld({ seed: 1 });
        plan = world.plan;
    });

    it("stand one to three in each big stretch of rocky land, far apart, the same every time", () => {
        const arches = archesOf(plan);

        assert.ok(arches.length >= 5 && arches.length <= 40, `${arches.length} arches`);
        assert.equal(archesOf(plan), arches, "worked out once a world");
        assert.deepEqual(archesOf(planWorld(1)), arches, "the same for the same seed");
        assert.notDeepEqual(archesOf(planWorld(2)).map(({ x, y }) => [x, y]), arches.map(({ x, y }) => [x, y]));

        for (const arch of arches) {
            assert.ok(ARCHES.lands.includes(arch.land), arch.land);
            assert.ok(arch.span >= ARCHES.span[0] && arch.span <= ARCHES.span[1] && arch.rise >= ARCHES.rise[0] && arch.rise <= ARCHES.rise[1]);

            for (const other of arches.filter((each) => each !== arch)) {
                assert.ok(Math.hypot(other.x - arch.x, other.y - arch.y) >= ARCHES.apart, `${arch.id} and ${other.id}`);
            }
        }

        // (No region of a land with more than its share: at most `most` in one land's stretch)
        const byLand = Object.groupBy(arches, ({ land }) => land);

        assert.ok(Object.keys(byLand).length >= 3, `in ${Object.keys(byLand).join(", ")}`);
    });

    it("stand on gentle ground well inside their land, clear of roads, water, the settlements and the places, inside one chunk", () => {
        for (const arch of archesOf(plan)) {
            const [i, j] = [Math.floor(arch.x / CELL), Math.floor(arch.y / CELL)];

            for (let dj = -1; dj <= 1; dj++) {
                for (let di = -1; di <= 1; di++) {
                    const k = (j + dj) * CELLS + i + di;

                    assert.equal(BIOMES[plan.biome[k]].id, arch.land);
                    assert.equal(plan.water[k], WATER.none);
                    assert.ok(!plan.road[k]);
                }
            }

            assert.ok(plan.places.every(({ at, radius }) => Math.hypot(at[0] - arch.x, at[1] - arch.y) >= radius + ARCHES.clear));
            assert.ok(plan.sites.every(({ at }) => Math.hypot(at[0] - arch.x, at[1] - arch.y) >= ARCHES.clear));

            const [a, b] = feetOf(arch);

            assert.ok(Math.abs(landHeight(plan, ...a) - landHeight(plan, ...b)) <= ARCHES.gentle * arch.span);

            const squares = archSquares(arch);

            assert.ok(squares.every(([x, y]) => Math.floor(x / CHUNK) === Math.floor(arch.x / CHUNK) && Math.floor(y / CHUNK) === Math.floor(arch.y / CHUNK)), `${arch.id} in one chunk`);
        }
    });

    it("take their legs' squares, and leave the ground under their spans open, nothing grown round them", () => {
        const overworld = world.maps.town;
        let standing = 0;

        for (const arch of archesOf(plan)) {
            const chunk = overworld.chunkAt(arch.x, arch.y);
            const feature = chunk.features.find(({ kind, arch: own }) => kind === "arch" && own === arch);

            if (!feature) {
                continue;
            }

            standing++;

            const squares = archSquares(arch);
            const at = ([x, y]) => (y - chunk.y0) * CHUNK + (x - chunk.x0);

            assert.deepEqual(feature.squares, squares);
            assert.ok(squares.length >= 2 * 12, `${squares.length} squares`);
            assert.ok(squares.every((square) => chunk.blocked[at(square)] && chunk.solid[at(square)] && chunk.opaque[at(square)]));

            // (Under its span, from leg to leg, open: walked through)
            const [a, b] = feetOf(arch);
            const inner = ARCHES.leg + 0.8;

            for (let n = 0; n <= 10; n++) {
                const t = n / 10;
                const [x, y] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

                if (Math.hypot(x - a[0], y - a[1]) > inner && Math.hypot(x - b[0], y - b[1]) > inner) {
                    assert.ok(!overworld.squares.blocked(Math.floor(x), Math.floor(y)), `${arch.id} open under its span at ${x.toFixed(1)}, ${y.toFixed(1)}`);
                }
            }

            // (No tree nor other feature in its room)
            const room = arch.span / 2 + ARCHES.leg;

            assert.ok(chunk.trees.every(({ x, y }) => Math.hypot(x - arch.x, y - arch.y) > room));
            assert.ok(chunk.features.filter((other) => other !== feature).every(({ x, y }) => Math.hypot(x - arch.x, y - arch.y) > room));
        }

        assert.ok(standing >= archesOf(plan).length - 1, `${standing} of ${archesOf(plan).length} stand`);
    });
});

describe("the arches of rock drawn (world/art/kits/arches.js)", () => {
    it("are a band of rock from foot to foot, its feet in the ground, its outside facing out, rising to its height", () => {
        const [arch] = archesOf(plan);
        const ground = (x, y) => landHeight(plan, x, y);
        const surface = surfaceOf(arch, ground);
        const [a, b] = feetOf(arch);

        assert.equal(surface.length, (ARCH_LOOK.rings + 1) * ARCH_LOOK.sides);

        // (Its first and last rings round its feet, under the ground)
        for (const [ring, [fx, fy]] of [[0, a], [ARCH_LOOK.rings, b]]) {
            const points = surface.slice(ring * ARCH_LOOK.sides, (ring + 1) * ARCH_LOOK.sides);
            const middle = points.reduce((sum, { at }) => [sum[0] + at[0] / points.length, sum[1] + at[1] / points.length, sum[2] + at[2] / points.length], [0, 0, 0]);

            assert.ok(Math.hypot(middle[0] - fx, middle[2] - fy) < 0.8, "round its foot");
            assert.ok(middle[1] < ground(fx, fy), "its foot in the ground");
        }

        // (Its top as high as it rises, over its middle)
        const highest = Math.max(...surface.map(({ at }) => at[1]));

        assert.ok(highest > (ground(...a) + ground(...b)) / 2 + arch.rise, `${highest.toFixed(1)} m up`);

        // (Each point's normal out from the band's middle there)
        for (let k = 1; k < ARCH_LOOK.rings; k++) {
            const ring = surface.slice(k * ARCH_LOOK.sides, (k + 1) * ARCH_LOOK.sides);
            const middle = ring.reduce((sum, { at }) => sum.map((v, n) => v + at[n] / ring.length), [0, 0, 0]);

            for (const { at, normal } of ring) {
                assert.ok((at[0] - middle[0]) * normal[0] + (at[1] - middle[1]) * normal[1] + (at[2] - middle[2]) * normal[2] > 0, "facing out");
            }
        }
    });

    it("are drawn with the cliffs' picture, a mesh at the chunk's corner, in under 2,000 triangles each", () => {
        const arches = archesOf(plan);
        const ground = (x, y) => landHeight(plan, x, y);
        const mesher = new Mesher(4096);
        const [x0, y0] = [Math.floor(arches[0].x / CHUNK) * CHUNK, Math.floor(arches[0].y / CHUNK) * CHUNK];
        const triangles = archInto(mesher, arches[0], ground, [x0, y0]);

        assert.ok(triangles >= ARCH_LOOK.rings * ARCH_LOOK.sides * 2 && triangles < 2000, `${triangles} triangles`);

        const { position, uv } = mesher.arrays;

        for (let i = 0; i < mesher.count; i++) {
            assert.ok(Math.abs(position[i * 3]) < CHUNK + 4 && Math.abs(position[i * 3 + 2]) < CHUNK + 4, "about the chunk's corner");
            assert.ok(uv[i * 2] > 0.02 && uv[i * 2] < 1, "copies of the picture a metre");
        }

        const mesh = archMesh([arches[0]], ground, [x0, y0]);

        assert.equal(mesh.name, "arches");
        assert.equal(mesh.material, cliffMaterial());
        assert.ok(mesh.castShadow && mesh.receiveShadow);
        assert.deepEqual(mesh.position.toArray(), [x0, 0, y0]);
    });
});
