// The world's landmark, the volcano: a crater cut into its top (core/terrain/height.js), a bowl
// whatever the cone's steepness, flat where the lava lies and meeting the land round it without a
// step; and its fire and smoke (world/far/volcano.js), on the ground where it should be, cheap to draw
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { CRATER, craterOf, heightAt } from "../client/js/core/terrain/height.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";
import { Volcano, VOLCANO } from "../client/js/world/far/volcano.js";

describe("the volcano (height.js, far/volcano.js)", () => {
    let plan;

    before(() => {
        plan = planWorld(1);
    });

    it("has a crater cut into its top: a bowl under its rim, flat in the middle, meeting the land round it", () => {
        const crater = craterOf(plan);
        const [x0, z0] = crater.at;

        assert.deepEqual(crater.at, [(plan.volcano[0] + 0.5) * 32, (plan.volcano[1] + 0.5) * 32]);
        assert.equal(crater.floor, crater.rim - CRATER.depth);
        // (Its floor flat where the lava lies)
        assert.ok(Math.abs(heightAt(plan, x0, z0) - crater.floor) < 0.01);
        assert.ok(Math.abs(heightAt(plan, x0 + VOLCANO.lake.radius * 0.8, z0) - crater.floor) < 0.5);

        for (let k = 0; k < 24; k++) {
            const angle = (k / 24) * Math.PI * 2;
            const [dx, dz] = [Math.cos(angle), Math.sin(angle)];
            const at = (r) => heightAt(plan, x0 + dx * r, z0 + dz * r);

            // (Rising from the floor to the rim, each way: a bowl)
            assert.ok(at(30) > crater.floor + 3 && at(45) > at(30), `(${k})`);
            // (No step where the crater meets the land)
            assert.ok(Math.abs(at(CRATER.radius - 0.05) - at(CRATER.radius + 0.05)) < 0.5, `(${k})`);
        }

        // (High over the land round it all the same)
        assert.ok(crater.rim > heightAt(plan, x0 + 400, z0) + 100);
    });

    it("draws its lake on the crater's floor and its walls on the ground, in a few hundred triangles; its smoke in puffs", () => {
        const volcano = new Volcano(plan);
        const crater = craterOf(plan);
        const [fire, smoke] = volcano.far.children;
        const positions = fire.geometry.getAttribute("position");
        const fires = fire.geometry.getAttribute("fire");

        for (let k = 0; k < positions.count; k++) {
            const [x, y, z] = [positions.getX(k), positions.getY(k), positions.getZ(k)];

            if (fires.getX(k) > 1.5) {
                assert.ok(Math.abs(y - (crater.floor + VOLCANO.lake.over)) < 1e-3);
            } else {
                assert.ok(Math.abs(y - heightAt(plan, x, z) - 0.6) < 0.01);
            }
        }

        // (The glow and the puffs: four corners each)
        assert.equal(smoke.geometry.getAttribute("corner").count, (VOLCANO.smoke.puffs + 1) * 4);
        assert.ok(volcano.triangles < 1000, `(${volcano.triangles})`);

        // Two copies, sharing their geometry; the one drawn with the far land leaving out what the
        // near one draws
        assert.equal(volcano.near.children[0].geometry, fire.geometry);
        assert.ok(fire.material.uniforms.nearCut.value > 150);
        assert.equal(volcano.near.children[0].material.uniforms.nearCut.value, 0);

        volcano.update(12.5);
        assert.ok(volcano.materials.every((material) => material.uniforms.time.value === 12.5));
        volcano.dispose();
    });
});
