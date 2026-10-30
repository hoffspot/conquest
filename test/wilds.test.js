// The land's own things (client/js/core/wilds.js, client/js/world/art/kits/wilds.js): the
// features the world places and walks round (boulders, fallen trees, bushes...), the undergrowth
// drawn between them (grass, flowers, pebbles, sticks...), the ground's patches (world/ground.js),
// and the noise they're laid out by (core/noise.js)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };

const { fractal, noise, tiling } = await import("../client/js/core/noise.js");
const { buildWorld, CHUNK, Overworld } = await import("../client/js/core/overworld.js");
const { GROUND } = await import("../client/js/core/setpieces/pieces.js");
const { CLUSTER, FEATURES, HOMELANDS, LANDS, strikeAt } = await import("../client/js/core/wilds.js");
const { patchNoise } = await import("../client/js/world/ground.js");
const { featureMesh, Growth, HOME_UNDERGROWTH, KINDS, LOOKS, lookGeometry, Mesher, place, STUMPS, stumpBody, TILE, undergrowthOf, UNDERGROWTH } = await import("../client/js/world/art/kits/wilds.js");
const { LAYERS } = await import("../client/js/world/art/engine/atlas.js");
const { ENDGRAIN, paintLayer } = await import("../client/js/world/art/engine/painters.js");
const { SUN_FROM } = await import("../client/js/world/sun.js");

let world;
let overworld;
let chunks;

// An attribute's values as they're read (its normalised bytes and half floats as numbers: x, y,
// z, w of each vertex in turn)
const valuesOf = (attribute) => Array.from({ length: attribute.count * attribute.itemSize }, (_, k) => attribute[["getX", "getY", "getZ", "getW"][k % attribute.itemSize]](Math.floor(k / attribute.itemSize)));

describe("noise (core/noise.js)", () => {
    it("is smooth, from 0 to 1, the same for the same seed and different for another", () => {
        for (let k = 0; k < 200; k++) {
            const [x, y] = [k * 7.3, k * 3.1];
            const value = fractal(x, y, 40, 5);

            assert.ok(value >= 0 && value <= 1);
            assert.equal(value, fractal(x, y, 40, 5));
            assert.ok(Math.abs(noise(x, y, 40, 5) - noise(x + 0.1, y, 40, 5)) < 0.02, "smooth");
        }

        assert.notEqual(fractal(12.5, 7.5, 40, 5), fractal(12.5, 7.5, 40, 6));
    });

    it("tiles when asked: the same across its period", () => {
        for (let k = 0; k < 50; k++) {
            const y = k * 0.17;

            assert.ok(Math.abs(tiling(0, y, 8, 3) - tiling(8, y, 8, 3)) < 1e-9);
            assert.ok(Math.abs(tiling(y, 0, 8, 3) - tiling(y, 8, 8, 3)) < 1e-9);
        }
    });
});

describe("the ground's patches (world/ground.js)", () => {
    it("are noise that tiles, with dry, lush and bare stretches in it", () => {
        const texels = 64;
        const data = patchNoise(texels);

        for (let channel = 0; channel < 4; channel++) {
            const values = Array.from({ length: texels * texels }, (_, k) => data[k * 4 + channel]);
            const [least, most] = [Math.min(...values), Math.max(...values)];

            assert.ok(least < 100 && most > 150, `channel ${channel}: ${least} to ${most}`);

            // (Its opposite edges meet: the last column runs on into the first)
            for (let y = 0; y < texels; y++) {
                assert.ok(Math.abs(data[(y * texels + texels - 1) * 4 + channel] - data[y * texels * 4 + channel]) < 40);
            }
        }
    });
});

describe("the land's features (core/wilds.js)", () => {
    before(() => {
        world = buildWorld({ seed: 3 });
        overworld = world.maps.town;
        chunks = [];

        for (let cy = 10; cy < 118; cy += 6) {
            for (let cx = 10; cx < 118; cx += 6) {
                chunks.push(overworld.chunk(cx, cy));
            }
        }
    });

    it("are placed in chunks across every land, many kinds of them, a few a chunk", () => {
        const kinds = new Set();
        const lands = new Map();

        for (const chunk of chunks) {
            // (A few a chunk, and as many smaller stones as their boulders have round them)
            const stones = chunk.features.filter(({ kind }) => kind === "stone").length;
            const boulders = chunk.features.filter(({ kind }) => kind === "boulder").length;

            assert.ok(chunk.features.length - stones <= 16, `${chunk.features.length - stones} in chunk ${chunk.cx}, ${chunk.cy}`);
            assert.ok(stones <= boulders * CLUSTER.stones[1], `${stones} stones by ${boulders} boulders`);

            // (Not the arches of rock nor the aqueducts' piers: arches.js's and aqueducts.js's,
            // test/arches.test.js and test/aqueducts.test.js)
            for (const feature of chunk.features.filter(({ kind }) => kind !== "arch" && kind !== "aqueduct")) {
                const land = overworld.biomeAt(Math.floor(feature.x), Math.floor(feature.y));

                // (A land's own kinds, or its people's where it's their homeland)
                const home = HOMELANDS[overworld.homeAt(Math.floor(feature.x), Math.floor(feature.y))];

                kinds.add(feature.kind);

                // (A stone lies by a boulder: CLUSTER)
                if (feature.kind === "stone") {
                    assert.ok(chunk.features.some(({ kind, x, y }) => kind === "boulder" && Math.hypot(x - feature.x, y - feature.y) < feature.size * 4 + 7), `a stone at ${feature.x}, ${feature.y} by no boulder`);
                    continue;
                }

                assert.ok(LANDS[land]?.kinds[feature.kind] !== undefined || home?.kinds[feature.kind] !== undefined, `${feature.kind} on ${land}`);
                lands.set(land, (lands.get(land) ?? 0) + 1);
            }
        }

        const total = [...lands.values()].reduce((sum, n) => sum + n, 0);

        assert.ok(total > chunks.length * 1.5, `${total} features in ${chunks.length} chunks`);
        assert.ok(kinds.size >= 10, [...kinds].join(", "));
        assert.ok(lands.size >= 8, [...lands.keys()].join(", "));
    });

    it("lays each boulder among smaller stones strung out along the way the rock runs, a stretch's all one way", () => {
        let [clusters, stones] = [0, 0];
        const angle = (a) => ((a % Math.PI) + Math.PI) % Math.PI;
        const apart = (a, b) => Math.min(Math.abs(angle(a) - angle(b)), Math.PI - Math.abs(angle(a) - angle(b)));

        for (const chunk of chunks) {
            const boulders = chunk.features.filter(({ kind }) => kind === "boulder");

            for (const boulder of boulders) {
                // (Lying along the strike there, give or take)
                assert.ok(apart(boulder.turn, strikeAt(boulder.x, boulder.y, world.seed)) <= CLUSTER.turn + 1e-9, `a boulder at ${boulder.x}, ${boulder.y}`);
            }

            for (const stone of chunk.features.filter(({ kind }) => kind === "stone")) {
                // (Each by its boulder: along its strike, not far across it, a quarter to a half its size)
                const boulder = boulders.find((b) => {
                    const [dx, dy] = [stone.x - b.x, stone.y - b.y];
                    const along = dx * Math.cos(b.turn) + dy * Math.sin(b.turn);
                    const across = -dx * Math.sin(b.turn) + dy * Math.cos(b.turn);

                    return Math.abs(along) >= b.size + CLUSTER.reach[0] - 1e-6 && Math.abs(along) <= b.size + CLUSTER.reach[1] + 1e-6 && Math.abs(across) <= CLUSTER.across * Math.abs(along) + 1e-6 && stone.size >= b.size * CLUSTER.size[0] - 1e-9 && stone.size <= b.size * CLUSTER.size[1] + 1e-9;
                });

                assert.ok(boulder, `a stone at ${stone.x}, ${stone.y}`);
                assert.ok(!stone.opaque);
                stones++;
            }

            clusters += boulders.length;
        }

        assert.ok(clusters > 20 && stones > clusters, `${stones} stones round ${clusters} boulders`);

        // (The strike changes slowly: a stretch's stones all lie one way)
        for (let k = 0; k < 50; k++) {
            const [x, y] = [500 + k * 140, 7000 - k * 120];

            assert.ok(apart(strikeAt(x, y, world.seed), strikeAt(x + 4, y + 4, world.seed)) < 0.25, `${x}, ${y}`);
        }
    });

    it("has each people's own in its homeland, and only there", () => {
        const found = new Map();

        // (A chunk in every 36 across the world: each people's lands are many of them wide)
        for (let cy = 4; cy < 124; cy += 6) {
            for (let cx = 4; cx < 124; cx += 6) {
                for (const feature of overworld.chunk(cx, cy).features) {
                    const home = overworld.homeAt(Math.floor(feature.x), Math.floor(feature.y));

                    for (const [people, { kinds }] of Object.entries(HOMELANDS)) {
                        if (kinds[feature.kind] !== undefined) {
                            assert.equal(home, people, `${feature.kind} in ${home ?? "the wild"}'s land`);
                            found.set(people, (found.get(people) ?? 0) + 1);
                        }
                    }
                }
            }
        }

        assert.deepEqual([...found.keys()].sort(), Object.keys(HOMELANDS).sort(), JSON.stringify([...found]));
    });

    it("are the same every time a chunk is made", () => {
        const again = new Overworld({ plan: world.plan, stamp: world.stamp, start: world.start });

        for (const chunk of chunks.slice(0, 20)) {
            assert.deepEqual(again.chunk(chunk.cx, chunk.cy).features, chunk.features);
        }
    });

    it("take their squares, hide what's behind them if tall, and keep clear of roads, water, the town and the settlements", () => {
        for (const chunk of chunks) {
            // (Not the arches of rock nor the aqueducts' piers: arches.js's and aqueducts.js's,
            // test/arches.test.js and test/aqueducts.test.js)
            for (const feature of chunk.features.filter(({ kind }) => kind !== "arch" && kind !== "aqueduct")) {
                const spec = FEATURES[feature.kind];

                assert.ok(feature.size >= spec.size[0] - 1e-9 && feature.size <= spec.size[1] + 1e-9, feature.kind);
                assert.ok(feature.squares.length >= 1);

                for (const [x, y] of feature.squares) {
                    const k = (y - chunk.y0) * CHUNK + (x - chunk.x0);

                    assert.ok(x >= chunk.x0 + 3 && y >= chunk.y0 + 3 && x < chunk.x0 + CHUNK - 3 && y < chunk.y0 + CHUNK - 3, "inside its chunk");
                    assert.equal(chunk.blocked[k], 1);
                    assert.equal(chunk.opaque[k], feature.opaque ? 1 : chunk.opaque[k]);
                    assert.ok(!overworld.inTown(x, y));

                    // (Two squares clear of roads, bridges and water all round)
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            const j = (y + dy - chunk.y0) * CHUNK + (x + dx - chunk.x0);

                            assert.ok(!chunk.water[j] && !chunk.bridge[j] && chunk.ground[j] !== GROUND.road && chunk.ground[j] !== GROUND.cobbles, `${feature.kind} at ${x}, ${y}`);
                        }
                    }

                    const settlement = overworld.settlements.at(x, y);

                    assert.ok(!settlement || !overworld.settlements.squareAt(settlement, x, y), `${feature.kind} in a settlement`);
                }

                assert.equal(feature.opaque, feature.height > 1.65 && !["scarecrow", "ribs", "skullpole", "leaflamp", "stakes"].includes(feature.kind));
            }
        }
    });
});

describe("the land's things drawn (world/art/kits/wilds.js)", () => {
    it("builds every kind of thing for every land's look, whole, within a few hundred triangles", () => {
        for (const kind of KINDS) {
            for (const land of Object.keys(LOOKS)) {
                const geometry = lookGeometry(kind, land, 3);
                const triangles = geometry.attributes.position.count / 3;

                // (Stumps more than most: their tops made inward from their walls, rings of bark,
                // inner bark, sapwood and heartwood, and roots out of their flaring foot)
                assert.ok(triangles >= 4 && triangles <= (["ring", "ribs", "bush", "campfire", "outcrop", "ruin", "bean", "stump", "webstump"].includes(kind) ? 400 : 260), `${kind} (${land}): ${triangles} triangles`);

                for (const name of ["position", "normal", "color", "uv", "layer", "wild"]) {
                    assert.ok(valuesOf(geometry.attributes[name]).every(Number.isFinite), `${kind} (${land}): ${name}`);
                }

                assert.ok(valuesOf(geometry.attributes.color).every((value) => value >= 0 && value <= 1.3), `${kind} (${land}): colours`);
                assert.ok(geometry.boundingBox.min.y > -0.2 && geometry.boundingBox.max.y < 2, `${kind} (${land}): ${geometry.boundingBox.min.y} to ${geometry.boundingBox.max.y}`);
                geometry.dispose();
            }
        }
    });

    it("makes each look its own: no two of a kind alike", () => {
        for (const kind of ["boulder", "tuft", "poppy", "log", "fern"]) {
            const looks = new Set(Array.from({ length: 6 }, (_, k) => lookGeometry(kind, "meadow", k).attributes.position.array.slice(0, 30).join()));

            assert.equal(looks.size, 6, kind);
        }
    });

    it("draws a chunk's features as one mesh, its bushes as the hedges are (kits/bushes.js), each as tall as it stands", () => {
        const chunk = chunks.find(({ features }) => features.length > 3 && features.some(({ kind }) => kind === "bush"));
        const { mesh, bushes, boxes } = featureMesh(chunk.features, (x, y) => overworld.biomeAt(x, y), [chunk.x0, chunk.y0]);

        assert.equal(mesh.material.name, "atlas");
        assert.ok(mesh.castShadow);
        assert.equal(boxes.length, chunk.features.length);
        assert.deepEqual(
            bushes.children.map(({ name }) => name),
            ["bushes", "bush sprigs"],
        );

        for (const [k, { top }] of boxes.entries()) {
            const feature = chunk.features[k];

            assert.ok(top > 0.1 && top < 8, `${feature.kind}: ${top}`);
        }

        // (None, where there's no bush)
        const bare = chunks.find(({ features }) => features.length && !features.some(({ kind }) => kind === "bush"));

        assert.equal(featureMesh(bare.features, (x, y) => overworld.biomeAt(x, y), [bare.x0, bare.y0]).bushes, null);
    });

    it("grows undergrowth only on open grass, the same every time, thinner where asked and in settlements", () => {
        const lush = ({ x0, y0, ground }) => ["meadow", "woods", "heath", "elfwood"].includes(overworld.biomeAt(x0 + CHUNK / 2, y0 + CHUNK / 2)) && ground.filter((kind) => kind === GROUND.grass).length > 3000;
        const chunk = chunks.find(lush);
        const items = undergrowthOf(overworld, chunk);
        const kinds = new Set(items.map(({ kind }) => kind));

        assert.ok(items.length > 100, `${items.length} things`);
        assert.ok(kinds.size >= 4, [...kinds].join(", "));
        assert.deepEqual(undergrowthOf(overworld, chunk), items);

        for (const { kind, land, x, y } of items) {
            const k = (Math.floor(y) - chunk.y0) * CHUNK + (Math.floor(x) - chunk.x0);

            assert.equal(chunk.ground[k], GROUND.grass);
            assert.ok(!chunk.blocked[k] && !chunk.water[k]);
            assert.ok(UNDERGROWTH[land].kinds[kind] !== undefined || HOME_UNDERGROWTH[overworld.homeAt(Math.floor(x), Math.floor(y))]?.[kind] !== undefined, `${kind} on ${land}`);
        }

        const thin = undergrowthOf(overworld, chunk, { density: 0.5 });

        assert.ok(thin.length < items.length * 0.7 && thin.length > items.length * 0.3, `${thin.length} of ${items.length}`);

        // In the town, fewer, and only the tidier kinds
        const [tx, ty] = [Math.floor((world.stamp.at[0] + world.stamp.width / 2) / CHUNK), Math.floor((world.stamp.at[1] + world.stamp.height / 2) / CHUNK)];
        const town = undergrowthOf(overworld, overworld.chunk(tx, ty));

        assert.ok(town.some(({ x, y }) => overworld.settled(Math.floor(x), Math.floor(y))), "some in the town");
        assert.ok(town.some(({ x, y }) => overworld.inTown(Math.floor(x), Math.floor(y)) && !overworld.settled(Math.floor(x), Math.floor(y))), "more in its fields");

        for (const { kind, x, y } of town) {
            if (overworld.settled(Math.floor(x), Math.floor(y))) {
                assert.ok(!["campfire", "burrow", "molehill", "fern", "reeds", "ring"].includes(kind), kind);
            }
        }
    });

    it("carpets the sunny side of a hill with flowers, most of them of one kind, and not the shaded side", () => {
        // (The same meadow in eight places, tilted towards the sun and away from it)
        const across = Math.hypot(SUN_FROM[0], SUN_FROM[2]);
        const meadow = { plan: { seed: 1 }, biomeAt: () => "meadow", settled: () => false, homeAt: () => null };
        const tilted = (cx, cy, fall) => ({
            cx,
            cy,
            x0: cx * CHUNK,
            y0: cy * CHUNK,
            trees: [],
            heights: Float32Array.from({ length: (CHUNK + 1) ** 2 }, (_, k) => 20 - (fall * ((k % (CHUNK + 1)) * SUN_FROM[0] + Math.floor(k / (CHUNK + 1)) * SUN_FROM[2])) / across),
            ...Object.fromEntries(["ground", "blocked", "water", "bridge"].map((name) => [name, new Uint8Array(CHUNK * CHUNK)])),
        });
        const flowers = (fall) => {
            const kinds = new Map();

            for (let c = 0; c < 8; c++) {
                for (const { kind } of undergrowthOf(meadow, tilted(40 + c * 3, 70 + c * 2, fall))) {
                    if (!["tuft", "tall", "pebbles", "stones", "molehill", "burrow", "sticks", "campfire"].includes(kind)) {
                        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
                    }
                }
            }

            const all = [...kinds.values()].reduce((sum, count) => sum + count, 0);

            return { all, most: Math.max(...kinds.values()) / all };
        };
        const [sunny, shaded] = [flowers(0.15), flowers(-0.15)];

        assert.ok(sunny.all > shaded.all * 1.5, `${sunny.all} flowers sunny, ${shaded.all} shaded`);
        assert.ok(sunny.most > shaded.most, `the commonest ${sunny.most} of them sunny, ${shaded.most} shaded`);
    });

    it("draws undergrowth a few things at a time, in tiles, within budget", () => {
        const chunk = chunks.find(({ ground }) => ground.filter((kind) => kind === GROUND.grass).length > 3000);
        const items = undergrowthOf(overworld, chunk);
        const growth = new Growth(items, [chunk.x0, chunk.y0]);

        // (Not all at once when there's no time)
        assert.equal(growth.grow(performance.now() - 1), false);

        while (!growth.grow(performance.now() + 2)) {
            // (A frame's worth at a time)
        }

        const meshes = growth.meshes();
        let triangles = 0;

        assert.ok(meshes.length >= 1 && meshes.length <= (CHUNK / TILE) ** 2);

        for (const mesh of meshes) {
            assert.equal(mesh.material.name, "wilds");
            assert.ok(mesh.geometry.attributes.wild);
            assert.ok(!mesh.castShadow);
            triangles += mesh.geometry.attributes.position.count / 3;
        }

        assert.ok(triangles < 45000, `${triangles} triangles`);
        assert.equal(growth.tiles.size, 0, "every tile built");
    });

    it("packs the undergrowth into 36 bytes a vertex, not 56, each read back as it was made", () => {
        const chunk = chunks.find(({ ground }) => ground.filter((kind) => kind === GROUND.grass).length > 3000);
        const growth = new Growth(undergrowthOf(overworld, chunk), [chunk.x0, chunk.y0]);
        let checked = 0;
        let farthest = 0;

        for (const tile of [...growth.tiles]) {
            // (As it's placed, every value a float; then as it's drawn)
            growth.grow(Infinity, tile);

            const { count, arrays } = tile.mesher;
            const { attributes } = growth.mesh(tile).geometry;
            const [position, normal, color, uv, wild] = ["position", "normal", "color", "uv", "wild"].map((name) => valuesOf(attributes[name]));
            const near = (a, b, within, what) => assert.ok(Math.abs(a - b) <= within, `${what}: ${a} for ${b}`);

            // (Each 4 bytes a vertex or a multiple of 4, 36 in all)
            assert.equal(attributes.position.count, count);
            assert.ok(Object.values(attributes).every(({ itemSize, array }) => (itemSize * array.BYTES_PER_ELEMENT) % 4 === 0));
            assert.equal(Object.values(attributes).reduce((sum, { itemSize, array }) => sum + itemSize * array.BYTES_PER_ELEMENT, 0), 36);
            assert.deepEqual(attributes.position.array, arrays.position.slice(0, count * 3));
            assert.deepEqual(attributes.layer.array, arrays.layer.slice(0, count));

            for (let i = 0; i < count; i++) {
                for (let k = 0; k < 3; k++) {
                    near(normal[i * 4 + k], arrays.normal[i * 3 + k], 0.005, "normal");
                    near(color[i * 4 + k], arrays.color[i * 3 + k], arrays.color[i * 3 + k] / 1000 + 1e-6, "colour");
                }

                assert.equal(color[i * 4 + 3], 1);
                near(wild[i * 2], arrays.sway[i], 0.001, "sway");
                near(position[i * 3 + 1] - wild[i * 2 + 1], arrays.foot[i], 0.001, "foot");
            }

            // (Each triangle's texture coordinates moved by whole copies of its picture, the same
            // for its three corners, to within a 1000th of a copy: a quarter of one of the atlas's
            // pixels)
            for (let i = 0; i < count; i += 3) {
                for (let k = 0; k < 2; k++) {
                    const whole = Math.round(arrays.uv[i * 2 + k] - uv[i * 2 + k]);

                    for (let j = i; j < i + 3; j++) {
                        near(uv[j * 2 + k] + whole, arrays.uv[j * 2 + k], 0.001, "uv");
                        assert.ok(uv[j * 2 + k] >= 0 && uv[j * 2 + k] < 4, `uv ${uv[j * 2 + k]}`);
                    }
                }
            }

            checked += count;
            farthest = arrays.uv.subarray(0, count * 2).reduce((most, value) => Math.max(most, value), farthest);
        }

        // (Their texture coordinates as made hundreds of copies of their pictures out: shifted by
        // where each thing grows)
        assert.ok(checked > 1000, `${checked} vertices`);
        assert.ok(farthest > 100, `${farthest} copies`);
    });
});

describe("stumps (world/art/kits/wilds.js)", () => {
    // Each look's body (stumpBody: its wall and top), as triangles of three points
    const bodies = () => Object.keys(LOOKS).flatMap((land) => Array.from({ length: 8 }, (_, index) => {
        const position = stumpBody(land, index).attributes.position.array;

        return { land, index, triangles: Array.from({ length: position.length / 9 }, (_, t) => [0, 1, 2].map((k) => Array.from(position.slice(t * 9 + k * 3, t * 9 + k * 3 + 3)))) };
    }));

    it("closes every stump's body: its top made inward from its wall's own top ring, so nothing shows through where they meet, and every face turned outward", () => {
        const key = (p) => p.map((v) => Math.round(v * 1e5)).join();

        for (const { land, index, triangles } of bodies()) {
            const edges = new Map();

            for (const corners of triangles) {
                for (let e = 0; e < 3; e++) {
                    const [a, b] = [corners[e], corners[(e + 1) % 3]];

                    // (Its foot, under the ground, left open)
                    if (a[1] > -0.05 || b[1] > -0.05) {
                        edges.set(`${key(a)}|${key(b)}`, (edges.get(`${key(a)}|${key(b)}`) ?? 0) + 1);
                    }
                }
            }

            for (const [edge, count] of edges) {
                const back = edge.split("|").reverse().join("|");

                assert.ok(count === 1 && edges.get(back) === 1, `${land} ${index}: the edge ${edge} has ${count} the one way and ${edges.get(back) ?? 0} the other`);
            }
        }
    });

    it("tears a broken stump's top, never peaked: the middle of every stump's top no higher than its rim", () => {
        for (const { land, index, triangles } of bodies()) {
            const points = triangles.flat();
            const out = (p) => Math.hypot(p[0], p[2]);

            // (Its rim: the highest point of its edge each way round)
            const bins = new Map();

            for (const p of points.filter((point) => out(point) > STUMPS.radius * 0.85)) {
                const bin = Math.round(Math.atan2(p[2], p[0]) * (STUMPS.sides / (Math.PI * 2)));

                bins.set(bin, Math.max(bins.get(bin) ?? -Infinity, p[1]));
            }

            const rim = [...bins.values()].sort((a, b) => a - b);

            // (Its middle: the point its top's triangles all meet at, round the pith, or a
            // hollow's bottom)
            const shared = new Map();

            for (const p of points.filter((point) => point[1] > 0.1)) {
                shared.set(p.join(), (shared.get(p.join()) ?? 0) + 1);
            }

            const [middle] = [...shared].filter(([, count]) => count >= STUMPS.sides).map(([point]) => Number(point.split(",")[1]));

            assert.ok(Number.isFinite(middle), `${land} ${index}: a middle`);
            assert.ok(middle <= rim[Math.floor(rim.length / 2)] + 1e-6, `${land} ${index}: its middle ${middle.toFixed(3)} over its rim ${rim[Math.floor(rim.length / 2)].toFixed(3)}`);
        }
    });

    it("draws a stump's cut wood with the end grain's picture once, centred on its pith, wherever it's placed", () => {
        const [grain, old] = [LAYERS.indexOf("endgrain"), LAYERS.indexOf("endgrain-old")];
        let cuts = 0;

        for (const land of Object.keys(LOOKS)) {
            for (let index = 0; index < 8; index++) {
                const geometry = lookGeometry("stump", land, index);
                const { layer, uv } = geometry.attributes;

                for (let i = 0; i < layer.count; i++) {
                    if (layer.getX(i) === grain || layer.getX(i) === old) {
                        const [u, v] = [uv.getX(i), uv.getY(i)];

                        cuts++;
                        assert.ok(u > 0 && u < 1 && v > 0 && v < 1, `${land} ${index}: ${u}, ${v}`);
                    }
                }
            }
        }

        assert.ok(cuts > 0, "some stumps' tops cut");

        // (Placed shifted, as each of a chunk's features is so no two show the same bark, its end
        // grain isn't)
        const mesher = new Mesher();

        mesher.tri([0, 0, 0], [1, 0, 0], [0, 0, 1], { layer: grain, uvs: [[0.5, 0.5], [0.9, 0.5], [0.5, 0.9]] });
        mesher.tri([0, 0, 0], [0, 1, 0], [1, 0, 0], { layer: LAYERS.indexOf("bark"), uvs: [[0, 0], [0, 1], [1, 0]] });

        const placed = new Mesher();

        place(placed, mesher.part(), { at: [0, 0, 0], shift: [7.3, 3.1] });
        assert.deepEqual(Array.from(placed.arrays.uv.slice(0, 6)).map((v) => Math.round(v * 10) / 10), [0.5, 0.5, 0.9, 0.5, 0.5, 0.9]);
        assert.deepEqual(Array.from(placed.arrays.uv.slice(6, 12)).map((v) => Math.round(v * 10) / 10), [7.3, 3.1, 7.3, 4.1, 8.3, 3.1]);
    });

    it("paints end grain the same every time: its pith dark in the middle, its rings round it no narrower than shows far off, and plain past its bark", () => {
        const size = 256;

        for (const name of ["endgrain", "endgrain-old"]) {
            const painted = paintLayer(name, size);
            const brightness = (x, y) => {
                const i = (Math.round(y) * size + Math.round(x)) * 4;

                return painted[i] + painted[i + 1] + painted[i + 2];
            };
            const ring = (radius) => Array.from({ length: 64 }, (_, k) => brightness(size / 2 + Math.cos((k / 64) * Math.PI * 2) * radius, size / 2 + Math.sin((k / 64) * Math.PI * 2) * radius));
            const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

            assert.deepEqual(paintLayer(name, size), painted, `${name}: the same every time`);
            assert.ok(brightness(size / 2, size / 2) < mean(ring(size * ENDGRAIN.bark * 0.6)) * 0.8, `${name}: its pith dark`);

            // (Across the rings, light and dark; past the bark, its wood's colour, even)
            const across = Array.from({ length: Math.round(size * ENDGRAIN.bark * 0.5) }, (_, k) => brightness(size / 2 + size * ENDGRAIN.bark * 0.35 + k, size / 2 + 3));
            const corner = Array.from({ length: 20 }, (_, k) => brightness(4 + k, 4));
            const spread = (values) => Math.max(...values) - Math.min(...values);

            assert.ok(spread(across) > spread(corner) * 2, `${name}: rings ${spread(across)}, past the bark ${spread(corner)}`);
        }

        assert.ok(ENDGRAIN.least >= 3, "no ring drawn under three pixels");
    });
});
