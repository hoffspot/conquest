// The vendored Recast: that it's the one version package.json names; and the navigation tiles'
// bytes (core/navigation/bake.js) and the ways found over them, as recorded:
// every device bakes its own tiles, so a change to Recast (a new version vendored: scripts/
// vendor-recast.js) or to the bake's settings that changes a byte of a tile or a corner of a way
// parts the copies of a world, and fails here first. The tiles are made up here, of whole numbers
// and halves, not taken from the world, so that only Recast and the bake can change them.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { before, describe, it } from "node:test";
import { Navigation } from "../client/js/core/navigation.js";
import { bakeTile } from "../client/js/core/navigation/bake.js";
import { loadRecast } from "../client/js/core/navigation/recast.js";
import { AREA, OVERWORLD, ROOMS, SCENES } from "../client/js/core/navigation/settings.js";
import { squaresInput } from "../client/js/core/navigation/squares.js";
import { squaresOf } from "../client/js/core/grid.js";
import { parseGrid } from "./helpers.js";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// The ground's height at a corner of a made-up tile (metres, in sixteenths: the same number on
// every machine): a little uneven, with a ridge across it too steep to walk but for a pass
const heightAt = (x, y) => ((x * 7 + y * 3) % 8) / 16 + (y >= 14 && y <= 16 ? 0 : Math.max(0, 5 - Math.abs(x - 22)));

/**
 * A made-up tile's triangles, as tiles.js tileInput's: uneven ground a square at a time (a road
 * across it, a pond no one walks, the ridge's sides steep), a box standing on it (what's built)
 * and an outline walked round (a prop's), for a kind of mesh (`measures`).
 */
function madeUp(tx, ty, measures) {
    const { tile, border } = measures;
    const [x0, y0] = [tx * tile - border, ty * tile - border];
    const [x1, y1] = [x0 + tile + 2 * border, y0 + tile + 2 * border];
    const [sx0, sy0, sx1, sy1] = [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)];
    const across = sx1 - sx0 + 1;
    const positions = [];
    const indices = [];
    const areas = [];
    let [low, high] = [Infinity, -Infinity];

    for (let y = sy0; y <= sy1; y++) {
        for (let x = sx0; x <= sx1; x++) {
            const h = heightAt(x - tx * tile, y - ty * tile);

            positions.push(Math.min(x1, Math.max(x0, x)), h, Math.min(y1, Math.max(y0, y)));
            low = Math.min(low, h);
            high = Math.max(high, h);
        }
    }

    for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
            const [lx, ly] = [x - tx * tile, y - ty * tile];
            const a = (y - sy0) * across + (x - sx0);
            const [b, c, d] = [a + 1, a + across, a + across + 1];
            const pond = lx >= 4 && lx < 9 && ly >= 20 && ly < 27;
            const ridge = Math.abs(lx + 0.5 - 22) < 5 && !(ly >= 14 && ly < 16);
            const area = pond ? 0 : ridge ? AREA.steep : ly === 15 ? AREA.road : AREA.ground;

            indices.push(a, c, b, b, c, d);
            areas.push(area, area);
        }
    }

    // (The box: its eight corners, its sides and top walked by no one)
    const [bx0, by0, bx1, by1] = [tx * tile + 10.01, ty * tile + 4.01, tx * tile + 13.99, ty * tile + 8.99];
    const at = positions.length / 3;

    for (const h of [-0.5, 4]) {
        positions.push(bx0, h, by0, bx1, h, by0, bx0, h, by1, bx1, h, by1);
    }

    for (const [a, b, c] of [[4, 6, 5], [5, 6, 7], [0, 1, 4], [1, 5, 4], [2, 6, 3], [3, 6, 7], [0, 4, 2], [2, 4, 6], [1, 3, 5], [3, 7, 5]]) {
        indices.push(at + a, at + b, at + c);
        areas.push(0);
    }

    // (The outline: six corners round a post)
    const corners = [[1, 0], [0.5, 1], [-0.5, 1], [-1, 0], [-0.5, -1], [0.5, -1]].flatMap(([x, y]) => [tx * tile + 6 + x * 0.75, 0, ty * tile + 12 + y * 0.75]);

    return {
        positions: Float32Array.from(positions),
        indices: Int32Array.from(indices),
        areas: Uint8Array.from(areas),
        bmin: [x0, low - 1, y0],
        bmax: [x1, high + 5, y1],
        outlines: { corners: Float32Array.from(corners), counts: Int32Array.from([6]), heights: Float32Array.from([-0.5, 3]) },
    };
}

// A building's floor, as a test's rows: rooms, a doorway a square wide, a pillar
const FLOOR = [
    "####################",
    "#........#.........#",
    "#........#.........#",
    "#........#....##...#",
    "#..................#",
    "#........#....##...#",
    "#........#.........#",
    "####.#####.........#",
    "#........#.........#",
    "#........###########",
    "#..................#",
    "####################",
];

// What was baked and found when this was recorded (recast-navigation 0.43.1, and the same of
// 0.44.0): each tile's bytes' SHA-256, and the corners of a way over it
const RECORDED = {
    overworld: { bytes: 10664, sha: "aa28d302bc9d7aa23570f9dfb546c27c3c3560ca9bed71e35e12145fdce1848f", way: "[[98.5,66.5,0.5232129096984863],[106,73.25,0.1875],[113,78,0.4375],[120.75,79.5,0.4375],[123,80,0.5625],[125.5,92.5,0.4289688467979431]]" },
    scene: { bytes: 13728, sha: "ec37ebda0f898e13dbac7569bfd2dc8e043b758d426e4e946c7c043bdbb7e091", way: "[[98.5,66.5,0.4894886016845703],[106,73.25,0.2625000476837158],[113,78,0.4624999761581421],[123,80,0.5625],[125.5,92.5,0.45474427938461304]]" },
    rooms: { bytes: 10452, sha: "aa21c05b6856af273d9056f3a6b4a07a0ea064b39d105a722a88d45249f2718d", way: "[[2.5,2.5,0.10000002384185791],[4.400000095367432,6.900000095367432,0.10000002384185791],[4.400000095367432,8.100000381469727,0.10000002384185791],[2.5,10.5,0.10000002384185791]]" },
};

// How many of each of Recast's classes the binder has a wrapper of on this side (Emscripten keeps
// one for every address it's handed an object at, till it's destroyed or forgotten)
const kept = (recast) => {
    const { Module } = recast.Raw;
    const counts = {};

    for (const [name, made] of Object.entries(Module)) {
        if (typeof made === "function" && made.prototype && Object.hasOwn(made, "__cache__")) {
            counts[name] = Object.keys(Module.getCache(made)).length;
        }
    }

    return counts;
};

describe("the navigation tiles' bytes (navigation/bake.js)", () => {
    let recast;

    before(async () => {
        recast = await loadRecast();
    });

    // A tile baked for a kind of mesh, and the way found over it alone
    const baked = (measures, input, from, to, height = () => 0) => {
        const data = bakeTile(recast, input, 3, 2, measures);
        const navigation = new Navigation(recast, null, { measures, input: () => input, heightAt: height, size: [4 * measures.tile, 3 * measures.tile] });

        try {
            navigation.add(3, 2, data);

            return { bytes: data.length, sha: sha(data), way: JSON.stringify(navigation.wayIn(from, to)) };
        } finally {
            navigation.dispose();
        }
    };

    it("bakes the overworld's kind of tile to the bytes recorded, and finds the way recorded over it", () => {
        const [ox, oy] = [3 * OVERWORLD.tile, 2 * OVERWORLD.tile];
        const found = baked(OVERWORLD, madeUp(3, 2, OVERWORLD), [ox + 2.5, oy + 2.5], [ox + 29.5, oy + 28.5], (x, y) => heightAt(Math.round(x - ox), Math.round(y - oy)));

        assert.deepEqual(found, RECORDED.overworld);
        // (Round the box and through the ridge's pass: a way worth recording)
        assert.ok(JSON.parse(found.way).length > 3);
    });

    it("bakes a scene's kind of tile (no ledge filtered out) to the bytes recorded", () => {
        const [ox, oy] = [3 * SCENES.tile, 2 * SCENES.tile];
        const found = baked(SCENES, madeUp(3, 2, SCENES), [ox + 2.5, oy + 2.5], [ox + 29.5, oy + 28.5], (x, y) => heightAt(Math.round(x - ox), Math.round(y - oy)));

        assert.deepEqual(found, RECORDED.scene);
        assert.notEqual(found.sha, RECORDED.overworld.sha);
    });

    it("leaves nothing behind, bake after bake: no wrapper of a context, a tile's params, a heightfield or a mesh kept (each was, for good)", () => {
        const tiles = [[OVERWORLD, madeUp(3, 2, OVERWORLD)], [SCENES, madeUp(1, 1, SCENES)], [ROOMS, squaresInput(squaresOf({ blocked: parseGrid(FLOOR) }), 0, 0, ROOMS)]];
        // (A tile with nothing to walk in it too: every square a pond's)
        const nothing = madeUp(3, 2, OVERWORLD);

        nothing.areas.fill(0);

        assert.equal(bakeTile(recast, nothing, 3, 2, OVERWORLD), null);

        // (Once round first: the one context is made then, and kept)
        for (const [measures, input] of tiles) {
            bakeTile(recast, input, 3, 2, measures);
        }

        const before = kept(recast);

        assert.ok(Object.keys(before).length > 20, "the binder's classes are counted");
        assert.equal(before.RecastBuildContextJsImpl, 1);

        for (let k = 0; k < 12; k++) {
            for (const [measures, input] of tiles) {
                assert.ok(bakeTile(recast, input, 3 + k, 2, measures));
            }

            bakeTile(recast, nothing, 3, 2, OVERWORLD);
        }

        assert.deepEqual(kept(recast), before);
    });

    it("leaves nothing behind for a tile added and let go of, a way found, or a whole mesh made and let go of (navigation.js)", () => {
        const squares = squaresOf({ blocked: parseGrid(FLOOR) });
        const kind = { measures: ROOMS, input: (tx, ty) => squaresInput(squares, tx, ty, ROOMS), heightAt: () => 0, size: [squares.width, squares.height] };
        const data = bakeTile(recast, kind.input(0, 0), 0, 0, ROOMS);
        const navigation = new Navigation(recast, squares, kind);

        navigation.add(0, 0, data);

        const way = JSON.stringify(navigation.path([2.5, 2.5], [2.5, 10.5]));

        // (Once first: what the binder hands back the same one of each time is made then)
        navigation.drop(0, 0);
        navigation.add(0, 0, data);

        const before = kept(recast);

        for (let k = 0; k < 12; k++) {
            navigation.drop(0, 0);
            navigation.add(0, 0, data);
            // (The mesh's data its own, whole, once the array that carried it is let go of)
            assert.equal(JSON.stringify(navigation.path([2.5, 2.5], [2.5, 10.5])), way);
            navigation.raycast([2.5, 2.5], [7.5, 5.5]);
            navigation.walkable(12.5, 2.5);
            navigation.nearest([15.2, 4.4]);
        }

        assert.deepEqual(kept(recast), before);
        // (Its tiles are in the mesh, with no second copy of their data kept beside it)
        assert.deepEqual(Object.keys(navigation.tiles.get(0)).sort(), ["ref", "tx", "ty"]);

        for (let k = 0; k < 6; k++) {
            const one = new Navigation(recast, squares, kind);

            one.add(0, 0, data);
            assert.equal(JSON.stringify(one.path([2.5, 2.5], [2.5, 10.5])), way);
            one.dispose();
        }

        assert.deepEqual(kept(recast), before);
        navigation.dispose();
    });

    it("asks for the nearest point on the mesh as the wrapper's own asking answers, to the last bit: on it, off it, and nowhere near", () => {
        const squares = squaresOf({ blocked: parseGrid(FLOOR) });
        const kind = { measures: ROOMS, input: (tx, ty) => squaresInput(squares, tx, ty, ROOMS), heightAt: () => 0, size: [squares.width, squares.height] };
        const navigation = new Navigation(recast, squares, kind);

        navigation.ensure(0, 0);

        let [on, off, none] = [0, 0, 0];

        // (A point every 0.37 m over the floor and a little beyond it, each asked within two
        // metres and within a quarter; and with a height given)
        for (let y = -3.1; y < 15; y += 0.37) {
            for (let x = -3.1; x < 23; x += 0.37) {
                for (const [point, across] of [[[x, y], 2], [[x, y], 0.25], [[x, y, 0.4], 2]]) {
                    const theirs = navigation.query.findClosestPoint({ x, y: point[2] ?? 0, z: y }, { filter: navigation.filter, halfExtents: { x: across, y: 4, z: across } });
                    const want = theirs.success && theirs.polyRef ? [theirs.point.x, theirs.point.z, theirs.point.y] : null;

                    assert.deepEqual(navigation.nearestIn(point, across), want);
                    none += want ? 0 : 1;
                    on += want && want[0] === Math.fround(x) && want[1] === Math.fround(y) ? 1 : 0;
                    off += want && (want[0] !== Math.fround(x) || want[1] !== Math.fround(y)) ? 1 : 0;
                }
            }
        }

        assert.ok(on > 1000 && off > 1000 && none > 1000, `${on} on it, ${off} off it, ${none} nowhere near`);
        assert.equal(navigation.walkable(2.5, 2.5), true);
        assert.equal(navigation.walkable(0.5, 0.5), false);
        navigation.dispose();
    });

    it("bakes a map of squares' kind of tile to the bytes recorded, and finds the way recorded through its doorways", () => {
        const squares = squaresOf({ blocked: parseGrid(FLOOR) });
        const data = bakeTile(recast, squaresInput(squares, 0, 0, ROOMS), 0, 0, ROOMS);
        const navigation = new Navigation(recast, squares, { measures: ROOMS, input: (tx, ty) => squaresInput(squares, tx, ty, ROOMS), heightAt: () => 0, size: [squares.width, squares.height] });

        try {
            navigation.add(0, 0, data);

            const way = navigation.wayIn([2.5, 2.5], [2.5, 10.5]);

            assert.deepEqual({ bytes: data.length, sha: sha(data), way: JSON.stringify(way) }, RECORDED.rooms);
            assert.ok(way.length > 2);
        } finally {
            navigation.dispose();
        }
    });
});

describe("the vendored Recast (scripts/vendor-recast.js)", () => {
    const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

    it("is the one version package.json names, exactly: the only folder of it, the one recast.js imports, once, and the one the docs name", async () => {
        const { devDependencies } = JSON.parse(await read("package.json"));
        const version = devDependencies["@recast-navigation/core"];

        // (An exact version, not a range: every device bakes its own tiles, so every device, and
        // every checkout, must have the same Recast; and its WebAssembly's package with it)
        assert.match(version, /^\d+\.\d+\.\d+$/);
        assert.equal(devDependencies["@recast-navigation/wasm"], version);
        // (Nothing imports the generators: the bake is the game's own)
        assert.equal(devDependencies["@recast-navigation/generators"], undefined);

        const { packages } = JSON.parse(await read("package-lock.json"));

        assert.equal(packages["node_modules/@recast-navigation/core"].version, version);
        assert.equal(packages["node_modules/@recast-navigation/wasm"].version, version);

        // The one folder, made from that version (a half-done upgrade leaves two, or the old one)
        const folders = (await readdir(new URL("../client/vendor/", import.meta.url))).filter((name) => name.startsWith("recast-navigation-"));

        assert.deepEqual(folders, [`recast-navigation-${version}`]);
        assert.ok((await read(`client/vendor/recast-navigation-${version}/core.min.mjs`)).startsWith(`// @recast-navigation/core ${version},`));
        assert.equal((await import(`../client/vendor/recast-navigation-${version}/recast.mjs`)).VERSION, version);

        // The game spells the folder once, where it imports it; the docs, and the tests that
        // read its files, name no other
        const named = (text) => text.match(/recast-navigation-\d+\.\d+\.\d+/g) ?? [];

        assert.deepEqual(named(await read("client/js/core/navigation/recast.js")), [`recast-navigation-${version}`]);

        for (const doc of ["README.md", "docs/WORLD.md", "test/manifest.test.js", "test/release.test.js"]) {
            const names = named(await read(doc));

            assert.ok(names.length > 0, doc);
            assert.deepEqual([...new Set(names)], [`recast-navigation-${version}`], doc);
        }

        // (And it's that module the game's loaded with)
        const recast = await loadRecast();

        assert.equal(recast, (await import(`../client/vendor/recast-navigation-${version}/recast.mjs`)).core);
    });
});
