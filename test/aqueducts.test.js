// The broken aqueducts (client/js/core/aqueducts.js, client/js/world/art/kits/aqueducts.js, the
// terrain plan's M7i-3): one to three in each big stretch of the humans' land, far apart, each a
// straight row of piers on its people's land clear of roads, water, the settlements and the
// places; a stretch of each kept whole, the rest broken; their standing piers taking their squares,
// open under their arches, a fallen pier only rubble; drawn as piers, arches and the channel over
// them, stubs where arches have fallen, rubble below, in a few thousand triangles; seen from afar
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })) }) }) };

const { AQUEDUCTS, aqueductsOf, inOneChunk, pierCorners, pierSquares } = await import("../client/js/core/aqueducts.js");
const { archesOf: rockArchesOf } = await import("../client/js/core/arches.js");
const { buildWorld, CHUNK } = await import("../client/js/core/overworld.js");
const { landHeight } = await import("../client/js/core/terrain/height.js");
const { CELL, CELLS, planWorld, RACES, WATER } = await import("../client/js/core/worldplan/plan.js");
const { AQUEDUCT_LOOK, archesOf, aqueductMesh } = await import("../client/js/world/art/kits/aqueducts.js");
const { AQUEDUCT_STONE, aqueductShapes, Shapes } = await import("../client/js/world/far/shapes.js");
const { gatherSilhouettes } = await import("../client/js/world/far/gather.js");

let world;
let plan;

const human = RACES.findIndex(({ id }) => id === "human") + 1;

describe("the broken aqueducts (core/aqueducts.js)", () => {
    before(() => {
        world = buildWorld({ seed: 1 });
        plan = world.plan;
    });

    it("stand one to three in each big stretch of the humans' land, far apart, the same every time", () => {
        const aqueducts = aqueductsOf(plan);

        assert.ok(aqueducts.length >= 1 && aqueducts.length <= 12, `${aqueducts.length} aqueducts`);
        assert.equal(aqueductsOf(plan), aqueducts, "worked out once a world");
        assert.deepEqual(aqueductsOf(planWorld(1)), aqueducts, "the same for the same seed");
        assert.notDeepEqual(aqueductsOf(planWorld(2)).map(({ x, y }) => [x, y]), aqueducts.map(({ x, y }) => [x, y]));

        for (const aqueduct of aqueducts) {
            assert.ok(aqueduct.piers.length >= AQUEDUCTS.piers[0] && aqueduct.piers.length <= AQUEDUCTS.piers[1], `${aqueduct.id}: ${aqueduct.piers.length} piers`);
            assert.ok(aqueduct.spacing >= AQUEDUCTS.spacing[0] && aqueduct.spacing <= AQUEDUCTS.spacing[1]);
            assert.equal(aqueduct.spans.length, aqueduct.piers.length - 1);

            // (In a straight row, each pier its spacing on from the last)
            for (const [n, pier] of aqueduct.piers.slice(1).entries()) {
                const last = aqueduct.piers[n];

                assert.ok(Math.abs(Math.hypot(pier.x - last.x, pier.y - last.y) - aqueduct.spacing) < 1e-6);
                assert.ok(Math.abs(Math.atan2(pier.y - last.y, pier.x - last.x) - Math.atan2(Math.sin(aqueduct.turn), Math.cos(aqueduct.turn))) < 1e-6);
            }

            for (const other of aqueducts.filter((each) => each !== aqueduct)) {
                assert.ok(Math.hypot(other.x - aqueduct.x, other.y - aqueduct.y) >= AQUEDUCTS.apart, `${aqueduct.id} and ${other.id}`);
            }

            // (Clear of the arches of rock)
            for (const arch of rockArchesOf(plan)) {
                assert.ok(aqueduct.piers.every(({ x, y }) => Math.hypot(arch.x - x, arch.y - y) >= AQUEDUCTS.clear), `${aqueduct.id} clear of ${arch.id}`);
            }
        }

        // (More of them in more worlds: some in each of a few)
        const counts = [2, 3, 7].map((seed) => aqueductsOf(planWorld(seed)).length);

        assert.ok(counts.every((count) => count >= 1 && count <= 12), `${counts}`);
    });

    it("stride on the humans' land, clear of roads, water, the settlements and the places, their channel high over the ground", () => {
        for (const aqueduct of aqueductsOf(plan)) {
            for (const pier of aqueduct.piers) {
                const cell = Math.floor(pier.y / CELL) * CELLS + Math.floor(pier.x / CELL);

                assert.equal(plan.territory[cell], human, `${aqueduct.id} on the humans' land`);
                assert.equal(plan.water[cell], WATER.none);
                assert.ok(!plan.road[cell], `${aqueduct.id} off the roads`);
                assert.ok(plan.places.every(({ at, radius }) => Math.hypot(at[0] - pier.x, at[1] - pier.y) >= radius + AQUEDUCTS.clear));
                assert.ok(plan.sites.every(({ at }) => Math.hypot(at[0] - pier.x, at[1] - pier.y) >= AQUEDUCTS.clear));
                assert.ok(Math.abs(pier.ground - landHeight(plan, pier.x, pier.y)) < 1e-9);

                // (Its channel from `over` up over the highest ground under it, no pier taller than the tallest)
                assert.ok(aqueduct.top - pier.ground >= AQUEDUCTS.over[0] - 1e-9 && aqueduct.top - pier.ground <= AQUEDUCTS.tallest + 1e-9, `${aqueduct.id}: ${(aqueduct.top - pier.ground).toFixed(1)} m up`);
            }
        }
    });

    it("are broken: a stretch kept whole, its arches standing; beyond it piers fallen and broken to stumps, their arches down", () => {
        const all = [1, 2, 3, 7].flatMap((seed) => aqueductsOf(seed === 1 ? plan : planWorld(seed)));
        const states = all.flatMap(({ piers }) => piers.map(({ state }) => state));

        for (const state of ["whole", "broken", "fallen"]) {
            assert.ok(states.filter((each) => each === state).length >= 5, `${states.filter((each) => each === state).length} ${state}`);
        }

        for (const aqueduct of all) {
            const [start, kept] = aqueduct.kept;

            // (The stretch kept: never its ends, at least three piers, all whole, nearly all its arches standing)
            assert.ok(start >= 1 && kept >= 3 && start + kept <= aqueduct.piers.length - 1, `${aqueduct.id}: ${start}+${kept} of ${aqueduct.piers.length}`);
            assert.ok(aqueduct.piers.slice(start, start + kept).every(({ state }) => state === "whole"));
            assert.ok(aqueduct.spans.slice(start, start + kept - 1).filter(Boolean).length >= kept - 2, `${aqueduct.id}: its kept arches`);

            for (const [n, pier] of aqueduct.piers.entries()) {
                const full = aqueduct.top - pier.ground;

                if (pier.state === "whole") {
                    assert.ok(Math.abs(pier.height - full) < 1e-9);
                } else if (pier.state === "broken") {
                    assert.ok(pier.height >= AQUEDUCTS.stump * full - 1e-9 && pier.height < full, `${aqueduct.id} pier ${n}: a stump ${pier.height.toFixed(1)} of ${full.toFixed(1)}`);
                } else {
                    assert.equal(pier.height, 0);
                }

                // (A pier across a chunk's edge has fallen: a chunk's squares are its own)
                assert.ok(pier.state === "fallen" || inOneChunk(aqueduct, pier), `${aqueduct.id} pier ${n} in one chunk`);

                // (An arch only between two whole piers)
                if (aqueduct.spans[n]) {
                    assert.ok(pier.state === "whole" && aqueduct.piers[n + 1].state === "whole", `${aqueduct.id} arch ${n}`);
                }
            }
        }
    });

    it("take their standing piers' squares (walked round, not seen through), open under their arches; a fallen pier only rubble, walked over", () => {
        const overworld = world.maps.town;
        let [standing, fallen] = [0, 0];

        for (const aqueduct of aqueductsOf(plan)) {
            for (const [n, pier] of aqueduct.piers.entries()) {
                const chunk = overworld.chunkAt(Math.floor(pier.x), Math.floor(pier.y));
                const feature = chunk.features.find((each) => each.kind === "aqueduct" && each.aqueduct === aqueduct && each.pier === n);
                const at = ([x, y]) => (y - chunk.y0) * CHUNK + (x - chunk.x0);

                assert.ok(feature, `${aqueduct.id} pier ${n} in its chunk`);

                if (pier.state === "fallen") {
                    fallen++;
                    assert.equal(feature.standing, false);
                    assert.deepEqual(feature.squares, []);
                    assert.deepEqual(pierSquares(aqueduct, pier), []);
                    assert.ok(!overworld.squares.blocked(Math.floor(pier.x), Math.floor(pier.y)), `${aqueduct.id} pier ${n}: rubble walked over`);
                    continue;
                }

                if (!feature.standing) {
                    continue;
                }

                standing++;

                const squares = pierSquares(aqueduct, pier);

                assert.deepEqual(feature.squares, squares);
                assert.ok(squares.length >= 6 && squares.length <= 14, `${squares.length} squares`);
                assert.ok(squares.every((square) => chunk.blocked[at(square)] && chunk.solid[at(square)] && chunk.opaque[at(square)]));

                // (Its squares about its footprint: each corner of it within a square of one)
                for (const [cx, cy] of pierCorners(aqueduct, pier)) {
                    assert.ok(squares.some(([x, y]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 1.2), `${aqueduct.id} pier ${n}'s corner`);
                }

                // (Halfway on to the next, under its arch or where it's fallen, open)
                const next = aqueduct.piers[n + 1];

                if (next) {
                    const [mx, my] = [(pier.x + next.x) / 2, (pier.y + next.y) / 2];

                    assert.ok(!overworld.squares.blocked(Math.floor(mx), Math.floor(my)), `${aqueduct.id} open between piers ${n} and ${n + 1}`);
                }

                // (No tree on it)
                assert.ok(chunk.trees.every(({ x, y }) => Math.hypot(x - pier.x, y - pier.y) > 2.5), `${aqueduct.id} pier ${n} clear of trees`);
            }
        }

        assert.ok(standing >= 8 && fallen >= 1, `${standing} standing, ${fallen} fallen`);
    });
});

describe("the broken aqueducts drawn (world/art/kits/aqueducts.js)", () => {
    const ground = (x, y) => landHeight(plan, x, y);

    // (A chunk's aqueduct features, and whether a pier stands as its own chunk has it)
    const featuresOf = (aqueduct, chunk) => chunk.features.filter((feature) => feature.kind === "aqueduct" && feature.aqueduct === aqueduct);
    const standing = (aqueduct, n) => world.maps.town.chunkAt(Math.floor(aqueduct.piers[n].x), Math.floor(aqueduct.piers[n].y)).features.some((feature) => feature.aqueduct === aqueduct && feature.pier === n && feature.standing);
    const trianglesOf = (object) => {
        let triangles = 0;

        object.traverse((node) => {
            if (node.isMesh) {
                triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
            }
        });

        return triangles;
    };

    it("are piers up to their channel, arches between them with the channel over, two rows where they're tall, in a few thousand triangles", () => {
        const overworld = world.maps.town;

        for (const aqueduct of aqueductsOf(plan)) {
            const chunks = new Set(aqueduct.piers.map(({ x, y }) => overworld.chunkAt(Math.floor(x), Math.floor(y))));
            let triangles = 0;

            for (const chunk of chunks) {
                const drawn = aqueductMesh(featuresOf(aqueduct, chunk), { groundAt: ground, standing });

                assert.equal(drawn.name, "aqueducts");
                triangles += trianglesOf(drawn);

                // (Its stone in the buildings' atlas, up to its channel's walls' tops and down into the ground)
                const box = new THREE.Box3();

                drawn.updateMatrixWorld(true);

                for (const mesh of drawn.children.filter(({ isMesh, name }) => isMesh && name !== "aqueduct ivy")) {
                    mesh.geometry.computeBoundingBox();
                    box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
                }

                const piers = featuresOf(aqueduct, chunk);

                if (piers.some(({ standing: up, pier: n }) => up && aqueduct.piers[n].state === "whole")) {
                    assert.ok(Math.abs(box.max.y - (aqueduct.top + AQUEDUCT_LOOK.walls[0])) < 0.2, `${aqueduct.id}: up to ${box.max.y.toFixed(2)}, its channel's walls at ${(aqueduct.top + AQUEDUCT_LOOK.walls[0]).toFixed(2)}`);
                }

                assert.ok(box.min.y < Math.min(...piers.map(({ pier: n }) => aqueduct.piers[n].ground)), `${aqueduct.id}: into the ground`);
            }

            assert.ok(triangles > 400 * aqueduct.piers.length * 0.5 && triangles < 600 * aqueduct.piers.length, `${aqueduct.id}: ${triangles} triangles for ${aqueduct.piers.length} piers`);
        }

        // (Its arches: round, from pier to pier; two rows where its piers stand taller than `tiers`)
        for (const aqueduct of aqueductsOf(plan)) {
            for (let n = 0; n < aqueduct.spans.length; n++) {
                const rows = archesOf(aqueduct, n);
                const low = Math.min(aqueduct.piers[n].ground, aqueduct.piers[n + 1].ground);

                assert.equal(rows.length, aqueduct.top - low > AQUEDUCT_LOOK.tiers ? 2 : 1);
                assert.ok(Math.abs(rows[0].radius * 2 + AQUEDUCTS.pier[0] - aqueduct.spacing) < 1e-9);
                assert.ok(Math.abs(rows[0].crown - (aqueduct.top - AQUEDUCT_LOOK.crown)) < 1e-9);
                assert.ok(rows.every(({ springs }) => springs > low), `${aqueduct.id} arch ${n} springs over the ground`);
            }
        }
    });

    it("draw a standing arch whole, a fallen one as a stub from each whole pier, and rubble where it fell and where a pier did", () => {
        const aqueduct = aqueductsOf(plan).find(({ spans }) => spans.some(Boolean) && spans.some((up) => !up));
        const n = aqueduct.spans.findIndex((up, k) => up && standing(aqueduct, k) && standing(aqueduct, k + 1));
        const feature = (k, up = true) => ({ kind: "aqueduct", aqueduct, pier: k, standing: up });
        const alone = (k, options = {}) => trianglesOf(aqueductMesh([feature(k, options.up)], { groundAt: ground, standing: options.standing ?? standing }));

        // (The same pier, with its arch on to the next standing, and with the next pier down: a
        // stub of it and the arch's stone in a heap under where it stood)
        const whole = alone(n);
        const broken = alone(n, { standing: (_, k) => k !== n + 1 });

        assert.ok(whole > broken * 0.8 && whole !== broken, `${whole} and ${broken}`);

        // (A fallen pier: only its rubble, a few dozen stones)
        const rubble = alone(n, { up: false, standing: () => false });

        assert.ok(rubble > 12 * 16 && rubble < 12 * 40, `${rubble} triangles of rubble`);
    });

    it("hang ivy from their broken tops", () => {
        const piers = aqueductsOf(plan).flatMap((aqueduct) => aqueduct.piers.map((pier, n) => ({ aqueduct, pier, n }))).filter(({ pier }) => pier.state === "broken");
        const ivied = piers.filter(({ aqueduct, n }) => aqueductMesh([{ kind: "aqueduct", aqueduct, pier: n, standing: true }], { groundAt: ground, standing }).getObjectByName("aqueduct ivy"));

        assert.ok(piers.length > 0 && ivied.length > 0, `${ivied.length} of ${piers.length} broken piers with ivy`);
    });

    it("are seen from afar: a box for each pier standing, and for each arch the masonry and channel over it", () => {
        const heightOf = (x, z) => landHeight(plan, x, z);

        for (const aqueduct of aqueductsOf(plan)) {
            const shapes = new Shapes();

            aqueductShapes(shapes, aqueduct, heightOf);

            const boxes = aqueduct.piers.filter(({ state }) => state !== "fallen").length + aqueduct.spans.filter(Boolean).length;
            const ys = shapes.positions.filter((_, k) => k % 3 === 1);

            assert.equal(shapes.triangles, boxes * 10, `${aqueduct.id}: ${boxes} boxes`);
            assert.ok(Math.max(...ys) > aqueduct.top && Math.max(...ys) < aqueduct.top + 1.5, `${aqueduct.id}: up to its channel's walls`);
            assert.ok(Math.min(...ys) < Math.min(...aqueduct.piers.map(({ ground: g }) => g)), `${aqueduct.id}: down into the ground`);
        }

        // (Gathered with what's built near: its boxes along it)
        const [aqueduct] = aqueductsOf(plan);
        const near = gatherSilhouettes(plan, { x: aqueduct.x + 600, z: aqueduct.y, reach: 1000, layouts: new Map() }).shapes;
        const along = aqueduct.spacing * aqueduct.piers.length;
        let on = 0;

        for (let k = 0; k < near.positions.length; k += 3) {
            const [dx, dz] = [near.positions[k] - aqueduct.x, near.positions[k + 2] - aqueduct.y];
            const u = dx * Math.cos(aqueduct.turn) + dz * Math.sin(aqueduct.turn);

            on += u > -3 && u < along && Math.abs(-dx * Math.sin(aqueduct.turn) + dz * Math.cos(aqueduct.turn)) < 2 && near.positions[k + 1] > aqueduct.top - 2 ? 1 : 0;
        }

        assert.ok(on >= 12, `${on} corners on it`);
        assert.ok(AQUEDUCT_STONE > 0);
    });
});
