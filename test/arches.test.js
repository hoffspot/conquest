// The arches of rock (client/js/core/arches.js, client/js/world/art/kits/arches.js, the terrain
// plan's M7h-2, reworked): one to three in each stretch of rocky land, on gentle ground clear of
// roads, water and the settlements, far apart, each inside its chunk; their legs taking their
// squares, out along the fin as far as each foot reaches, open under their spans; drawn as a fin
// of rock with a hole worn through it (beds, joints, knobs), inside its legs' squares where it
// meets the ground, whole over its opening, what's fallen from it about its feet and, as its land
// has it, what grows on it, at every quality
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };

const { ARCHES, archesOf, archSquares, feetOf, legsOf, roomOf } = await import("../client/js/core/arches.js");
const { buildWorld, CHUNK } = await import("../client/js/core/overworld.js");
const { landHeight } = await import("../client/js/core/terrain/height.js");
const { BIOMES, CELL, CELLS, planWorld, WATER } = await import("../client/js/core/worldplan/plan.js");
const { ARCH_LOOK, archInto, archMesh, growthOf, rockField, rockOf } = await import("../client/js/world/art/kits/arches.js");
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
            assert.ok(arch.reach.every((r) => r >= ARCHES.reach[0] && r <= ARCHES.reach[1]), "each foot reaching out its own way");

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

            // (Each leg's out along the fin as far as its foot reaches: the squares at its end its)
            for (const [, [tx, ty]] of legsOf(arch)) {
                assert.ok(squares.some(([x, y]) => Math.hypot(x + 0.5 - tx, y + 0.5 - ty) < 1), `${arch.id} to the end of its leg`);
            }
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
            const room = roomOf(arch);

            assert.ok(chunk.trees.every(({ x, y }) => Math.hypot(x - arch.x, y - arch.y) > room));
            assert.ok(chunk.features.filter((other) => other !== feature).every(({ x, y }) => Math.hypot(x - arch.x, y - arch.y) > room));
        }

        assert.ok(standing >= archesOf(plan).length - 1, `${standing} of ${archesOf(plan).length} stand`);
    });
});

describe("the arches of rock drawn (world/art/kits/arches.js)", () => {
    const ground = (x, y) => landHeight(plan, x, y);

    it("are a fin of rock with a hole worn through it: whole over the opening, open under it, inside its legs' squares where it meets the ground", () => {
        for (const arch of archesOf(plan).slice(0, 6)) {
            const rock = rockOf(arch, ground);
            const [ux, uy] = [Math.cos(arch.turn), Math.sin(arch.turn)];
            const legs = legsOf(arch);
            const nearLeg = ([x, , y]) => Math.min(...legs.map(([[fx, fy], [tx, ty]]) => {
                const [dx, dy] = [tx - fx, ty - fy];
                const long = dx * dx + dy * dy;
                const t = long > 0 ? Math.min(1, Math.max(0, ((x - fx) * dx + (y - fy) * dy) / long)) : 0;

                return Math.hypot(x - fx - dx * t, y - fy - dy * t);
            }));

            assert.ok(rock.points.length > 1000 && rock.faces.length > 2000, `${arch.id}: ${rock.faces.length} faces`);

            // (Below a person's head, every bit of it within its legs' squares)
            for (const point of rock.points.filter(({ local }) => local[1] < ARCH_LOOK.head && local[1] > -0.3)) {
                assert.ok(nearLeg(point.at) < ARCHES.leg + 0.15, `${arch.id}: rock ${nearLeg(point.at).toFixed(2)} m from its legs at ${point.local[1].toFixed(1)} m up`);
            }

            // (Its rock over the opening, where it's highest: up to as high as it rises, and higher)
            const over = rock.points.filter(({ local: [u, v] }) => Math.abs(u - rock.shape.middle) < 1 && v > arch.rise * 0.6);

            assert.ok(over.length > 0 && Math.min(...over.map(({ local }) => local[1])) > arch.rise * 0.6, `${arch.id}: whole over its opening`);
            assert.ok(Math.max(...over.map(({ local }) => local[1])) > arch.rise + 1, `${arch.id}: its cap`);

            // (Each point's normal out of the rock: the field rising along it)
            const field = rockField(rock.shape, legs.map((leg) => leg.map(([x, y]) => [(x - arch.x) * ux + (y - arch.y) * uy, -(x - arch.x) * uy + (y - arch.y) * ux])));
            const outward = rock.points.filter((_, k) => k % 17 === 0).filter(({ local: [u, v, w], normal }) => {
                const n = [normal[0] * ux + normal[2] * uy, normal[1], -normal[0] * uy + normal[2] * ux];

                return field.point(u + n[0] * 0.3, v + n[1] * 0.3, w + n[2] * 0.3) > field.point(u - n[0] * 0.3, v - n[1] * 0.3, w - n[2] * 0.3);
            });

            assert.ok(outward.length > 0.95 * Math.ceil(rock.points.length / 17), `${arch.id}: facing out`);
        }
    });

    it("are drawn with the cliffs' picture, what's fallen from them about their feet, in a few thousand triangles each, at the chunk's corner", () => {
        const arches = archesOf(plan);
        const mesher = new Mesher(4096);
        const [x0, y0] = [Math.floor(arches[0].x / CHUNK) * CHUNK, Math.floor(arches[0].y / CHUNK) * CHUNK];
        const { triangles, rock } = archInto(mesher, arches[0], ground, [x0, y0]);

        assert.ok(triangles > rock.faces.length + 8 * 10 && triangles < 9000, `${triangles} triangles`);

        const { position, uv } = mesher.arrays;

        for (let i = 0; i < mesher.count; i += 7) {
            assert.ok(Math.abs(position[i * 3]) < CHUNK + 4 && Math.abs(position[i * 3 + 2]) < CHUNK + 4, "about the chunk's corner");
            assert.ok(uv[i * 2] > 0.02 && uv[i * 2] < 1, "copies of the picture a metre");
        }

        const group = archMesh([arches[0]], ground, [x0, y0]);
        const drawn = group.children.find(({ name }) => name === "arch rock");

        assert.equal(group.name, "arches");
        assert.equal(drawn.material, cliffMaterial());
        assert.ok(drawn.castShadow && drawn.receiveShadow);
        assert.deepEqual(drawn.position.toArray(), [x0, 0, y0]);
    });

    it("have what grows in their land on their ledges and round their feet: plenty in a green land, a little in a dry one, none in the snow", () => {
        const byLand = Object.fromEntries(archesOf(plan).map((arch) => [arch.land, arch]));
        const grown = Object.fromEntries(Object.entries(byLand).map(([land, arch]) => [land, growthOf(arch, rockOf(arch, ground), ground).plants]));

        assert.equal(grown.snow?.length ?? 0, 0);

        const green = grown.heath ?? grown.mountain;
        const dry = grown.badlands ?? grown.savannah;

        assert.ok(green.length > dry.length && dry.length > 0, `${green.length} and ${dry.length}`);

        for (const plant of [...green, ...dry]) {
            assert.ok(Number.isFinite(plant.ground) && plant.size > 0);
        }

        // (Some up on the rock: well over the ground there)
        assert.ok(green.some(({ x, y, ground: on }) => on > ground(x, y) + 2), "on its ledges and top");
    });
});
