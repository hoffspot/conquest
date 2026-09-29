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
const { FEATURES, HOMELANDS, LANDS } = await import("../client/js/core/wilds.js");
const { patchNoise } = await import("../client/js/world/ground.js");
const { featureMesh, Growth, HOME_UNDERGROWTH, KINDS, LOOKS, lookGeometry, TILE, undergrowthOf, UNDERGROWTH } = await import("../client/js/world/art/kits/wilds.js");

let world;
let overworld;
let chunks;

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
            assert.ok(chunk.features.length <= 16, `${chunk.features.length} in chunk ${chunk.cx}, ${chunk.cy}`);

            for (const feature of chunk.features) {
                const land = overworld.biomeAt(Math.floor(feature.x), Math.floor(feature.y));

                // (A land's own kinds, or its people's where it's their homeland)
                const home = HOMELANDS[overworld.homeAt(Math.floor(feature.x), Math.floor(feature.y))];

                kinds.add(feature.kind);
                assert.ok(LANDS[land]?.kinds[feature.kind] !== undefined || home?.kinds[feature.kind] !== undefined, `${feature.kind} on ${land}`);
                lands.set(land, (lands.get(land) ?? 0) + 1);
            }
        }

        const total = [...lands.values()].reduce((sum, n) => sum + n, 0);

        assert.ok(total > chunks.length * 1.5, `${total} features in ${chunks.length} chunks`);
        assert.ok(kinds.size >= 10, [...kinds].join(", "));
        assert.ok(lands.size >= 8, [...lands.keys()].join(", "));
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
            for (const feature of chunk.features) {
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

                assert.ok(triangles >= 4 && triangles <= (kind === "ring" || kind === "ribs" || kind === "bush" || kind === "campfire" || kind === "outcrop" || kind === "ruin" ? 400 : 260), `${kind} (${land}): ${triangles} triangles`);

                for (const name of ["position", "normal", "color", "uv", "layer", "sway"]) {
                    assert.ok(geometry.attributes[name].array.every(Number.isFinite), `${kind} (${land}): ${name}`);
                }

                assert.ok(geometry.attributes.color.array.every((value) => value >= 0 && value <= 1.3), `${kind} (${land}): colours`);
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

    it("draws a chunk's features as one mesh, each as tall as it stands", () => {
        const chunk = chunks.find(({ features }) => features.length > 3);
        const { mesh, boxes } = featureMesh(chunk.features, (x, y) => overworld.biomeAt(x, y), [chunk.x0, chunk.y0]);

        assert.equal(mesh.material.name, "atlas");
        assert.ok(mesh.castShadow);
        assert.equal(boxes.length, chunk.features.length);

        for (const [k, { top }] of boxes.entries()) {
            const feature = chunk.features[k];

            assert.ok(top > 0.1 && top < 8, `${feature.kind}: ${top}`);
        }
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
            assert.ok(mesh.geometry.attributes.sway);
            assert.ok(!mesh.castShadow);
            triangles += mesh.geometry.attributes.position.count / 3;
        }

        assert.ok(triangles < 45000, `${triangles} triangles`);
    });
});
