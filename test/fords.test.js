// The fords made to be seen (client/js/core/terrain/waters.js fordOf, fordsNear, fords;
// core/overworld.js, the way over each trodden bare up its banks; world/art/kits/fords.js, its
// stepping stones and, in wooded lands, a fallen trunk; app/minimap.js fordMark and the world map;
// docs/WORLD.md *Fords*): each ford's middle, straight across from bank to bank; the banks there
// a track's ground, the same whichever chunks are made first, the fields keeping off it; the
// stones over the water, only drawn, in no one's way
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (The art paints canvases: enough of one for it to in Node, every other drawing call doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            createPattern: () => ({}),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const { buildWorld, CHUNK } = await import("../client/js/core/overworld.js");
const { GROUND } = await import("../client/js/core/setpieces/pieces.js");
const { FORD_WAY, FORDS, watersOf } = await import("../client/js/core/terrain/waters.js");
const { BIOMES, CELL, CELLS, planWorld } = await import("../client/js/core/worldplan/plan.js");
const { FORD_STONES, FORD_TRUNK, fordParts, fordsMesh, ROCKY, WOODED } = await import("../client/js/world/art/kits/fords.js");
const { FORD_MARK, fordMark } = await import("../client/js/app/minimap.js");

const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("the fords (waters.js fordOf, fordsNear, fords)", () => {
    const plan = planWorld(1);
    const waters = watersOf(plan);

    it("finds every ford's middle, deep and wide as a ford is, its banks straight across it either side", () => {
        const fords = waters.fords();

        assert.ok(fords.length > 100, `${fords.length} fords`);
        assert.equal(waters.fords(), fords, "(worked out once)");

        for (const { cell, at, banks, way, half, depth } of fords) {
            const river = waters.river(...at, 0);

            assert.ok(river && river.gap < 0 && river.ford === 1, `${at}: in the ford`);
            assert.equal(Math.floor(at[0] / CELL) + Math.floor(at[1] / CELL) * CELLS >= 0, true);
            assert.ok(Math.abs(depth - FORDS.depth) < 1e-9 && half > 1 && half <= FORDS.half * FORDS.widen + 1e-9, `${cell}: ${depth} deep, ${half} wide`);
            assert.ok(Math.abs(Math.hypot(...way) - 1) < 1e-9);

            // (Across it: its banks either side of its middle, about as far apart as it's wide,
            // the way between them across the way it runs)
            const [[ax, ay], [bx, by]] = banks;
            const across = apart(banks[0], banks[1]);

            assert.ok(Math.abs(across - 2 * half) < 1e-9, `${cell}: ${across} m across, ${half} half`);
            assert.ok(Math.abs(((bx - ax) * way[0] + (by - ay) * way[1]) / across) < 1e-9, `${cell}: straight across`);
            assert.ok(apart([(ax + bx) / 2, (ay + by) / 2], at) < 1e-9);

            // (Where the water ends, near enough: the river's wandering bends its banks a little)
            for (const [x, y] of banks) {
                const edge = waters.river(x, y, 3);

                assert.ok(edge && Math.abs(edge.gap) < 2, `${cell}: ${edge?.gap} m from the water's edge`);
            }
        }
    });

    it("lists those near a chunk, every one whose way over reaches into it", () => {
        const fords = waters.fords();
        const [cx, cy] = [Math.floor(fords[0].at[0] / CHUNK), Math.floor(fords[0].at[1] / CHUNK)];
        const near = waters.fordsNear(cx, cy);

        assert.ok(near.some(({ cell }) => cell === fords[0].cell));
        assert.equal(waters.fordsNear(cx, cy), near, "(kept)");

        // (Every ford with any of its way within the chunk, and none far from it)
        for (const ford of fords) {
            const reaches = ford.banks.some(([x, y]) => x > (cx - 0.5) * CHUNK && y > (cy - 0.5) * CHUNK && x < (cx + 1.5) * CHUNK && y < (cy + 1.5) * CHUNK);

            if (reaches && ford.banks.every(([x, y]) => Math.floor(x / CHUNK) === cx && Math.floor(y / CHUNK) === cy)) {
                assert.ok(near.includes(ford), `${ford.cell}`);
            }
        }

        assert.ok(near.every(({ at }) => apart(at, [(cx + 0.5) * CHUNK, (cy + 0.5) * CHUNK]) < CHUNK * 3));
    });
});

describe("the way over a ford, in the world (overworld.js)", () => {
    let world;
    let ford;

    before(() => {
        world = buildWorld({ seed: 1 });
        // (The ford in the woods south of where the player starts)
        ford = world.maps.town.waters.fords().sort((a, b) => apart(a.at, [3112.5, 4374.5]) - apart(b.at, [3112.5, 4374.5]))[0];
    });

    // Each square along the way over (from a bank `out` metres along, past it), as the world has it
    const along = (map, [from, to], steps) => {
        const [[ax, ay], [bx, by]] = [from, to];
        const long = apart(from, to);
        const [ux, uy] = [(bx - ax) / long, (by - ay) / long];

        return steps.map((out) => {
            const [x, y] = [Math.floor(bx + ux * out), Math.floor(by + uy * out)];

            return { x, y, ground: map.squares.ground(x, y), on: map.onFordWay(x, y), land: map.landAt(x, y) };
        });
    };

    it("treads the banks bare up either side of it, straight across the river, and none of the water", () => {
        const map = world.maps.town;
        const [a, b] = ford.banks;

        // (On up each bank: a track's ground, out to FORD_WAY.approach past the water)
        for (const [from, to] of [[a, b], [b, a]]) {
            const up = along(map, [from, to], [1.5, 3, FORD_WAY.approach - 1]);

            assert.ok(up.every(({ ground, on }) => ground === GROUND.road && on), JSON.stringify(up));
            assert.ok(up.every(({ land }) => land.road === null), "(not a road, for the roads' own rules)");

            // (And beyond it, the land's own)
            assert.ok(along(map, [from, to], [FORD_WAY.approach + 3]).every(({ ground }) => ground !== GROUND.road));
        }

        // (Across the water: still water, waded, its bed drawn as the track's: world/ground.js)
        const middle = [Math.floor(ford.at[0]), Math.floor(ford.at[1])];
        const chunk = map.chunkAt(...middle);
        const k = (middle[1] - chunk.y0) * CHUNK + (middle[0] - chunk.x0);

        assert.ok(chunk.water[k] && !chunk.blocked[k], "(the ford's water, waded)");
        assert.equal(map.onFordWay(...middle), true);

        // (Off to the side of the way, the bank's the land's own)
        const [ux, uy] = ford.way;
        const side = [Math.floor(b[0] + (b[0] - a[0]) / apart(a, b) * 2 + ux * 6), Math.floor(b[1] + (b[1] - a[1]) / apart(a, b) * 2 + uy * 6)];

        assert.equal(map.onFordWay(...side), false);
    });

    it("is the same whichever chunks are made first", () => {
        const other = buildWorld({ seed: 1 }).maps.town;
        const [cx, cy] = [Math.floor(ford.at[0] / CHUNK), Math.floor(ford.at[1] / CHUNK)];

        for (let dy = 1; dy >= -1; dy--) {
            for (let dx = 1; dx >= -1; dx--) {
                other.chunk(cx + dx, cy + dy);
            }
        }

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const [mine, theirs] = [world.maps.town.chunk(cx + dx, cy + dy), other.chunk(cx + dx, cy + dy)];

                for (const layer of ["ground", "blocked", "water", "bridge", "crops"]) {
                    assert.deepEqual(theirs[layer], mine[layer], layer);
                }
            }
        }
    });

    it("keeps the fields a verge off it, and the trees and the land's things", () => {
        const map = world.maps.town;
        // (A ford in farmland)
        const farmed = map.waters.fords().filter(({ at }) => BIOMES[world.plan.biome[Math.floor(at[1] / CELL) * CELLS + Math.floor(at[0] / CELL)]].id === "farmland");
        let way = 0;

        assert.ok(farmed.length > 3);

        for (const { at } of farmed) {
            for (let y = Math.floor(at[1]) - 16; y < at[1] + 16; y++) {
                for (let x = Math.floor(at[0]) - 16; x < at[0] + 16; x++) {
                    if (!map.onFordWay(x, y) || map.squares.ground(x, y) !== GROUND.road) {
                        continue;
                    }

                    way++;

                    // (Nothing sown within two squares of it, nothing standing on it)
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            const chunk = map.chunkAt(x + dx, y + dy);

                            assert.equal(chunk.crops[(y + dy - chunk.y0) * CHUNK + (x + dx - chunk.x0)], 0, `${x + dx}, ${y + dy}`);
                        }
                    }

                    assert.equal(map.squares.blocked(x, y), false, `${x}, ${y}`);
                }
            }
        }

        assert.ok(way > 50, `${way} squares of the ways over`);
    });
});

describe("the fords as they're drawn (world/art/kits/fords.js) and marked (app/minimap.js)", () => {
    // A ford running north to south, 8 m across from x 6 to 14, its bed 0.35 m under its surface
    const ford = { at: [10, 10], banks: [[6, 10], [14, 10]], way: [0, 1], surface: 1, half: 4, depth: 0.35 };
    const groundAt = (x) => (Math.abs(x - 10) < 4 ? 0.65 : 1.3);

    it("steps stones straight across the water, their tops just clear of it, onto each bank; bigger in rocky lands", () => {
        const { stones, trunks } = fordParts([ford], { groundAt, landAt: () => "meadow" }, [0, 0, 64, 64]);

        assert.equal(trunks.length, 0);
        assert.ok(stones.length >= 10, `${stones.length} stones`);
        assert.ok(stones.every(({ y }) => Math.abs(y - 10) <= FORD_STONES.wander + 1e-9), "(in a row, across)");
        assert.ok(stones[0].x < 6 && stones.at(-1).x > 14, "(from bank to bank)");
        assert.ok(stones.filter(({ x }) => Math.abs(x - 10) < 3.5).every(({ top, bottom }) => top >= 1 + FORD_STONES.clear - 1e-9 && bottom < 0.65), "(over the water, from the bed)");
        assert.ok(stones.every(({ radius }) => radius >= FORD_STONES.radius[0] && radius <= FORD_STONES.radius[1]));

        const rocky = fordParts([ford], { groundAt, landAt: () => "badlands" }, [0, 0, 64, 64]).stones;

        assert.ok(rocky.length < stones.length && rocky.every(({ radius }) => radius >= FORD_STONES.radius[0] * ROCKY.badlands - 1e-9));

        // (Only those whose fords' middles are in the box)
        assert.equal(fordParts([ford], { groundAt, landAt: () => "meadow" }, [64, 0, 128, 64]).stones.length, 0);
    });

    it("lays a fallen trunk across it, downstream of the stones, its ends up the banks, in wooded lands only", () => {
        for (const land of WOODED) {
            const { trunks } = fordParts([ford], { groundAt, landAt: () => land }, [0, 0, 64, 64]);

            assert.equal(trunks.length, 1, land);

            const [{ a, b, radius }] = trunks;

            assert.ok(a[0] < 6 - 1 && b[0] > 14 + 1, "(up the banks)");
            assert.ok(Math.abs(a[1] - (10 + FORD_TRUNK.downstream)) < 1e-9, "(downstream)");
            assert.ok(a[2] - radius > 1 && b[2] - radius > 1, "(over the water)");
        }

        assert.deepEqual(WOODED, ["woods", "darkwood", "elfwood", "jungle"]);
    });

    it("draws them in one mesh with the atlas, every face facing out", () => {
        const parts = fordParts([ford], { groundAt, landAt: () => "woods" }, [0, 0, 64, 64]);
        const mesh = fordsMesh(parts, [0, 0]);
        const { position, normal } = mesh.geometry.attributes;
        let inward = 0;

        assert.equal(mesh.name, "fords");
        assert.equal(fordsMesh({ stones: [], trunks: [] }, [0, 0]), null);

        for (let t = 0; t < position.count; t += 3) {
            const middle = [0, 1, 2].map((axis) => (position.getComponent(t, axis) + position.getComponent(t + 1, axis) + position.getComponent(t + 2, axis)) / 3);
            const stone = parts.stones.find(({ x, y, radius }) => Math.hypot(x - middle[0], y - middle[2]) < radius * 1.5);
            const trunk = parts.trunks[0];
            // (From the thing it's part of: a stone's middle, or the trunk's line under it)
            const from = stone ? [stone.x, (stone.top + stone.bottom) / 2, stone.y] : [middle[0], trunk.a[2], trunk.a[1]];
            const out = middle.map((value, axis) => value - from[axis]);

            if (stone || Math.abs(middle[0] - trunk.a[0]) > 0.01) {
                inward += out[0] * normal.getX(t) + out[1] * normal.getY(t) + out[2] * normal.getZ(t) < 0 ? 1 : 0;
            }
        }

        assert.equal(inward, 0);
    });

    it("marks each on the map as a row of pale stones straight across the water, onto each bank", () => {
        const drawn = [];
        const fake = { arc: (x, y, r) => drawn.push([x, y, r]), beginPath: noop, fill: noop, stroke: noop };

        fordMark(fake, ford);

        assert.ok(drawn.length >= 4);
        assert.ok(drawn.every(([, y, r]) => y === 10 && r === FORD_MARK.radius));
        assert.equal(drawn[0][0], 6 - FORD_MARK.beyond);
        assert.equal(drawn.at(-1)[0], 14 + FORD_MARK.beyond);
        assert.equal(fake.fillStyle, FORD_MARK.colour);
    });
});
