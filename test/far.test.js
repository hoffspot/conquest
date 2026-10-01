// The far land (client/js/world/far/): levels of ground round the player out to the horizon, each
// twice as coarse and as wide as the one inside it, on lattices that meet; their ground the land's
// as it's seen from afar (lakes and the sea, no rivers), their edges eased into the next level's;
// within the triangles the plan allows; and the haze over it (world/fog.js)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import { buildWorld } from "../client/js/core/overworld.js";
import { distantHeights, landHeight, stillLevelAt } from "../client/js/core/terrain/height.js";
import { FarLand } from "../client/js/world/far/far.js";
import { FAR, FAR_LEVELS, farReach, middleOf, reachOf, sampleLevel, spacingOf } from "../client/js/world/far/levels.js";
import { FADE, FAR_FOG, farHaze, hazeAt } from "../client/js/world/fog.js";
import { QUALITY } from "../client/js/world/view.js";

// (The ground's textures paint a canvas: enough of one for them to in Node, every other drawing
// call doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            createPattern: () => ({}),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

describe("the far land (world/far)", () => {
    let plan;

    before(() => {
        plan = buildWorld({ seed: 1 }).plan;
    });

    it("nests its levels on lattices that meet: each one's edges on the next one out's corners", () => {
        for (const [x, z] of [
            [2928.4, 5072.9],
            [100, 7000],
            [4097, 4095],
        ]) {
            for (let level = 0; level < FAR_LEVELS.high - 1; level++) {
                const [mx, mz] = middleOf(level, x, z);
                const [ox, oz] = middleOf(level + 1, x, z);
                const outer = spacingOf(level + 1);

                // (Its middle within a lattice step of the player, its edges on the next one's lines)
                assert.ok(Math.abs(mx - x) <= spacingOf(level) && Math.abs(mz - z) <= spacingOf(level));
                assert.equal((mx - reachOf(level) - (ox - reachOf(level + 1))) % outer, 0);
                assert.equal((mz + reachOf(level) - (oz - reachOf(level + 1))) % outer, 0);
                // (And inside it, with room to spare)
                assert.ok(Math.abs(mx - ox) + reachOf(level) <= reachOf(level + 1) - outer);
            }
        }

        assert.deepEqual(Object.values(FAR_LEVELS).map(farReach), [1024, 2048, 4096]);
        assert.ok(FAR.hole + 32 < FAR.nearFar - 10, "(the chunks' ground drawn wherever the far land isn't, the camera up to 32 m back)");
    });

    it("has the land as it's seen from afar: lakes and the sea at their level, flat and marked water; the edges eased into the next level's", () => {
        // (By a lake south-west of seed 1's town)
        const middle = middleOf(1, 1950, 4478);
        const { heights, water, normals } = sampleLevel(plan, 1, middle);
        const count = FAR.cells + 1;
        const step = spacingOf(1);
        const [x0, z0] = [middle[0] - reachOf(1), middle[1] - reachOf(1)];
        let wet = 0;

        for (let j = 1; j < count - 1; j++) {
            for (let i = 1; i < count - 1; i++) {
                const k = j * count + i;
                const [x, z] = [x0 + i * step, z0 + j * step];
                const level = stillLevelAt(plan, x, z);

                if (water[k]) {
                    wet++;
                    assert.equal(heights[k], level);
                } else {
                    assert.ok(level === null || heights[k] >= level);
                }

                assert.ok(Math.abs(Math.hypot(normals[k * 3], normals[k * 3 + 1], normals[k * 3 + 2]) - 1) < 1e-5);
            }
        }

        assert.ok(wet > 0, "(lakes near the town)");

        // (Along each edge, every other corner halfway between its neighbours)
        for (let k = 1; k < count - 1; k += 2) {
            assert.ok(Math.abs(heights[k] - (heights[k - 1] + heights[k + 1]) / 2) < 1e-3);
            assert.ok(Math.abs(heights[(count - 1) * count + k] - (heights[(count - 1) * count + k - 1] + heights[(count - 1) * count + k + 1]) / 2) < 1e-3);
            assert.ok(Math.abs(heights[k * count] - (heights[(k - 1) * count] + heights[(k + 1) * count]) / 2) < 1e-3);
        }

        // (Away from water, the land's own lie; past the world's edge, the sea)
        const { heights: dry } = distantHeights(plan, 2928, 5072, 1, 1);

        assert.ok(Math.abs(dry[0] - landHeight(plan, 2928, 5072)) < 1e-3, `${dry[0]} against ${landHeight(plan, 2928, 5072)}`);

        const { heights: sea, water: open } = distantHeights(plan, -2000, -2000, 2, 64);

        assert.deepEqual([...sea], [0, 0, 0, 0]);
        assert.deepEqual([...open], [1, 1, 1, 1]);
    });

    it("works out a level quickly enough to be done off the page's thread as the player walks", () => {
        sampleLevel(plan, 0, middleOf(0, 2000, 4000));

        const start = performance.now();

        for (let level = 0; level < 4; level++) {
            sampleLevel(plan, level, middleOf(level, 2928, 5072));
        }

        assert.ok((performance.now() - start) / 4 < 60, `${((performance.now() - start) / 4).toFixed(1)} ms a level`);
    });

    it("draws within the plan's budget (about 35k triangles on medium), in one draw a level, and moves its levels as the player walks", () => {
        for (const [name, quality] of Object.entries(QUALITY)) {
            assert.equal(quality.far, FAR_LEVELS[name]);
        }

        const land = new FarLand(plan, { land: null, levels: QUALITY.medium.far });

        assert.equal(land.triangles, 4 * 64 * 64 * 2);
        assert.ok(land.triangles <= 35000);
        assert.equal(land.object.children.length, 4);

        // (No workers in Node: worked out at once)
        land.update(2928, 5072);

        for (const { mesh, middle, level } of land.levels) {
            assert.equal(mesh.visible, true);
            assert.deepEqual(middle, middleOf(level, 2928, 5072));
            assert.deepEqual(mesh.position.toArray(), [middle[0], 0, middle[1]]);
        }

        // (Each level out sunk inside the one in, but at its edge; none round the player)
        const [inner, outer] = land.levels;

        assert.deepEqual(outer.inner.value.toArray(), [inner.middle[0] - 256 + 8, inner.middle[1] - 256 + 8, inner.middle[0] + 256 - 8, inner.middle[1] + 256 - 8]);
        assert.deepEqual(land.hole.value.toArray(), [2928, 5072, FAR.hole]);

        // (Walked a little way: only the finest level moves)
        const before = land.levels.map(({ middle }) => middle);

        land.update(2928 + 9, 5072);
        assert.notDeepEqual(land.levels[0].middle, before[0]);
        assert.deepEqual(land.levels.slice(1).map(({ middle }) => middle), before.slice(1));
        land.dispose();
    });
});

describe("the haze (fog.js)", () => {
    it("thickens exponentially to all but gone at the far land's edge; nearer fogs are as they were", () => {
        assert.equal(farHaze(), true);
        assert.equal(farHaze(), true, "(once)");
        assert.match(THREE.ShaderChunk.fog_fragment, /exp\( - 3\.0/);
        assert.match(THREE.ShaderChunk.fog_fragment, /#elif !defined\( NO_NEAR_FADE \)/);

        const far = farReach(FAR_LEVELS.medium);

        assert.ok(far > FAR_FOG);
        assert.equal(hazeAt(20, 20, far), 0);
        assert.ok(Math.abs(hazeAt(far, 20, far) - (1 - Math.exp(-3))) < 1e-12);
        assert.ok(hazeAt(FADE.from, 20, far) < 0.2, "(the near world clear)");
        // (Indoors, as three.js has it)
        assert.equal(hazeAt(16, 16, 38), 0);
        assert.equal(hazeAt(27, 16, 38), 0.5);
        assert.equal(hazeAt(40, 16, 38), 1);
        assert.ok(FADE.from < FADE.to && FADE.to < FAR.nearFar);
    });
});
