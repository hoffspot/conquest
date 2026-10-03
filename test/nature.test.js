// The trees and rivers seen from afar (world/far/trees.js, rivers.js): the trees where the
// overworld plants them, each kind its own; the rivers along their courses on their surfaces; both
// cheap enough for the far land's reach; and drawn in the one mesh each, the trees fading in, the
// rivers as still water's seen from afar (silhouettes.js)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import { buildWorld } from "../client/js/core/overworld.js";
import { heightAt, SLOPE } from "../client/js/core/terrain/height.js";
import { RUNNING, watersOf } from "../client/js/core/terrain/waters.js";
import { CELL, CELLS, CHUNK } from "../client/js/core/worldplan/plan.js";
import { FAR_LEVELS, farReach } from "../client/js/world/far/levels.js";
import { FAR_RIVERS, gatherRivers, RIVER_FLOATS } from "../client/js/world/far/rivers.js";
import { Silhouettes } from "../client/js/world/far/silhouettes.js";
import { CARD_FLOATS, FAR_TREES, FORMS, gatherTrees, treeCards, TREE_FLOATS } from "../client/js/world/far/trees.js";
import { QUALITY } from "../client/js/world/view.js";
import { STILL_WATER } from "../client/js/world/water.js";

describe("the trees and rivers seen from afar (far/trees.js, rivers.js)", () => {
    let world;

    before(() => {
        world = buildWorld({ seed: 1 });
    });

    it("stands every tree the overworld plants where it plants it, as tall as its kind", () => {
        const land = world.maps.town;
        let checked = 0;

        // (Chunks out in the woods, away from the start town)
        for (const [cx, cy] of [
            [30, 60],
            [70, 70],
            [80, 40],
            [50, 90],
        ]) {
            const chunk = land.chunk(cx, cy);
            const [x, z] = [(cx + 0.5) * CHUNK, (cy + 0.5) * CHUNK];
            const far = gatherTrees(world.plan, { x, z, reach: CHUNK });
            const spots = new Set();

            for (let k = 0; k < far.length; k += TREE_FLOATS) {
                spots.add(`${far[k]},${far[k + 2]}`);
            }

            for (const tree of chunk.trees) {
                assert.ok(spots.has(`${tree.x},${tree.y}`), `(${cx}, ${cy}: ${tree.x}, ${tree.y})`);
                checked++;
            }
        }

        assert.ok(checked > 50, `(${checked} trees)`);

        // (Each as its kind: as tall as it grows, sized as the overworld sizes them; a known outline)
        const far = gatherTrees(world.plan, { x: 2400, z: 3900, reach: 400 });
        const tallest = Math.max(...Object.values(FAR_TREES).map(({ height }) => height)) * 1.3;

        for (let k = 0; k < far.length; k += TREE_FLOATS) {
            assert.ok(far[k + 3] > 3 && far[k + 3] <= tallest + 1e-6);
            assert.ok(Object.values(FORMS).includes(far[k + 5]));
        }
    });

    it("keeps out of the start town and the lakes, and from where they're drawn near to", () => {
        const [x, z] = [2928, 5072];
        const town = [x - 80, z - 80, x + 80, z + 80];
        const far = gatherTrees(world.plan, { x, z, reach: 600, from: 100, town });

        for (let k = 0; k < far.length; k += TREE_FLOATS) {
            const [tx, tz] = [far[k], far[k + 2]];

            assert.ok(!(tx >= town[0] && tz >= town[1] && tx < town[2] && tz < town[3]));
            assert.ok(Math.hypot(tx - x, tz - z) >= 100);
        }
    });

    it("keeps off land too steep to climb, as the overworld keeps its trees off it (the cliffs over the coast)", () => {
        // (How steep the land is across the four metres round a point: tan² of its slope)
        const steepness = (x, z) => {
            const [nw, ne, sw, se] = [heightAt(world.plan, x - 2, z - 2), heightAt(world.plan, x + 2, z - 2), heightAt(world.plan, x - 2, z + 2), heightAt(world.plan, x + 2, z + 2)];

            return ((ne - nw + se - sw) / 8) ** 2 + ((sw - nw + se - ne) / 8) ** 2;
        };
        const [x, z] = [2096, 304];
        const far = gatherTrees(world.plan, { x, z, reach: 600, from: 100 });
        let cliffs = 0;

        for (let k = 0; k < far.length; k += TREE_FLOATS) {
            assert.ok(steepness(far[k], far[k + 2]) < SLOPE.cliff ** 2, `(${far[k]}, ${far[k + 2]})`);
        }

        // (And there are cliffs there to keep off)
        for (let gz = z - 600; gz < z + 600; gz += 8) {
            for (let gx = x - 600; gx < x + 600; gx += 8) {
                cliffs += steepness(gx, gz) >= SLOPE.cliff ** 2 ? 1 : 0;
            }
        }

        assert.ok(far.length / TREE_FLOATS > 500 && cliffs > 500, `${far.length / TREE_FLOATS} trees, ${cliffs} cliff points`);
    });

    it("lays each river's ribbon along its course, on its surface, as wide as it is (or wide enough to be seen)", () => {
        const waters = watersOf(world.plan);
        const k = waters.running.findIndex((kind) => kind === RUNNING.river);
        const [x, z] = [((k % CELLS) + 0.5) * CELL, (Math.floor(k / CELLS) + 0.5) * CELL];
        const ribbons = gatherRivers(world.plan, { x, z, reach: 64 });
        const piece = waters.course(k).pieces[0];

        assert.ok(ribbons.length > 0 && ribbons.length % (RIVER_FLOATS * 6) === 0);

        // (A piece's first corner beside its start, across it as wide as the river, on its surface)
        const across = Math.max(FAR_RIVERS.narrowest / 2, piece.half[0]);
        let found = false;

        for (let c = 0; c < ribbons.length; c += RIVER_FLOATS) {
            const [rx, ry, rz] = [ribbons[c], ribbons[c + 1], ribbons[c + 2]];

            found ||= Math.abs(Math.hypot(rx - piece.ax, rz - piece.ay) - across) < 1e-3 && Math.abs(ry - piece.surface[0] - FAR_RIVERS.over) < 1e-3;
        }

        assert.ok(found);
    });

    it("is cheap enough for the far land: so many trees and river triangles a quality level, worked out quickly", () => {
        for (const name of ["medium", "high"]) {
            const quality = QUALITY[name];
            const started = performance.now();
            const trees = gatherTrees(world.plan, { x: 2928, z: 5072, reach: quality.farTrees, from: 100 });
            const rivers = gatherRivers(world.plan, { x: 2928, z: 5072, reach: farReach(quality.far), from: 100 });
            const took = performance.now() - started;

            assert.ok((trees.length / TREE_FLOATS) * 2 < 60000, `${name}: ${trees.length / TREE_FLOATS} trees`);
            assert.ok(rivers.length / RIVER_FLOATS / 3 < 20000, `${name}: ${rivers.length / RIVER_FLOATS / 3} river triangles`);
            assert.ok(took < 3000, `${name}: ${took} ms`);
        }

        assert.equal(QUALITY.low.farTrees, 0, "(no far trees on low)");
    });

    it("makes each tree a card: four corners at its foot, each corner its own, carrying its height, width, form and colour", () => {
        const trees = gatherTrees(world.plan, { x: 2400, z: 3900, reach: 200 });
        const { vertices, index } = treeCards(trees);
        const count = trees.length / TREE_FLOATS;

        assert.ok(count > 10);
        assert.equal(vertices.length, count * 4 * CARD_FLOATS);
        assert.deepEqual([...index.subarray(6, 12)], [4, 5, 6, 6, 5, 7]);

        for (let t = 0; t < count; t += 7) {
            const corners = [];

            for (let c = 0; c < 4; c++) {
                const at = (t * 4 + c) * CARD_FLOATS;

                assert.deepEqual([...vertices.subarray(at, at + 3)], [...trees.subarray(t * TREE_FLOATS, t * TREE_FLOATS + 3)]);
                assert.deepEqual([...vertices.subarray(at + 5, at + 11)], [...trees.subarray(t * TREE_FLOATS + 3, (t + 1) * TREE_FLOATS)]);
                corners.push(`${vertices[at + 3]},${vertices[at + 4]}`);
            }

            assert.deepEqual(corners, ["-0.5,0", "0.5,0", "-0.5,1", "0.5,1"]);
        }
    });

    it("draws the trees in one mesh, a card each, fading in as the near world fades out; and the rivers in another, as still water's seen from afar, with the far land only", () => {
        const silhouettes = new Silhouettes(world.plan, { reach: farReach(FAR_LEVELS.low), trees: 500 });

        silhouettes.update(2928, 5072);

        const [, trees, rivers] = silhouettes.far.children;

        assert.ok(silhouettes.treeCount > 500);
        assert.ok(!trees.geometry.isInstancedBufferGeometry, "(not instanced: the software renderer draws instances almost one at a time)");
        assert.equal(trees.geometry.index.count, silhouettes.treeCount * 6, "(a card each: two triangles)");
        assert.equal(trees.geometry.getAttribute("position").count, silhouettes.treeCount * 4);
        assert.ok(rivers.geometry.getAttribute("position").count > 0);
        assert.equal(silhouettes.near.children[1].geometry, trees.geometry);
        assert.ok("FAR_FADE_IN" in silhouettes.treeMaterial.defines && silhouettes.treeMaterial.fog);

        // (The rivers: not with the near world, whose water goes on to where these start, looking
        // as they do)
        assert.ok(!silhouettes.near.children.some(({ name }) => name === "far rivers"));
        assert.equal(rivers.material, silhouettes.riverMaterial);
        assert.ok(silhouettes.riverMaterial.isMeshLambertMaterial && silhouettes.riverMaterial.fog);

        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };

        silhouettes.riverMaterial.onBeforeCompile(shader);
        assert.ok(shader.vertexShader.includes("mvPosition.xyz *= 1.0 - min(0.03"), "(drawn a little towards the eye)");
        assert.ok(shader.fragmentShader.includes(`, ${FAR_RIVERS.depth.toFixed(1)}, `) && shader.fragmentShader.includes(STILL_WATER.reflected));

        silhouettes.dispose();
    });
});
