// The motes drifting in the air round the player (client/js/world/motes.js): each land's own kind,
// as many as the quality has (none on low), fading from one kind to the next as the player crosses
// from land to land, none indoors, and drifting without their breeze ever carrying them out of the
// box round the player
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MOTES, MOTES_OF, Motes } from "../client/js/world/motes.js";
import { QUALITY } from "../client/js/world/view.js";
import { BIOMES } from "../client/js/core/worldplan/plan.js";

describe("the motes (world/motes.js)", () => {
    it("are each land's own kind, and none on low quality, more on high than on medium", () => {
        const lands = new Set(BIOMES.map(({ id }) => id));

        for (const [land, kind] of Object.entries(MOTES_OF)) {
            assert.ok(lands.has(land), land);
            assert.ok(MOTES[kind], `${land}: ${kind}`);
        }

        assert.equal(QUALITY.low.motes, 0);
        assert.ok(QUALITY.medium.motes > 0 && QUALITY.high.motes > QUALITY.medium.motes);
    });

    it("are as many as the quality has, each in its own place, the same whatever the quality", () => {
        const motes = new Motes();

        motes.setQuality(QUALITY.medium.motes);

        const seeds = motes.object.geometry.getAttribute("seed");

        assert.equal(seeds.count, QUALITY.medium.motes);
        assert.ok(seeds.array.every((value) => value >= 0 && value < 1));

        const medium = [...seeds.array];

        motes.setQuality(QUALITY.high.motes);
        assert.deepEqual([...motes.object.geometry.getAttribute("seed").array.slice(0, medium.length)], medium);

        motes.setQuality(0);
        assert.equal(motes.object.geometry.getAttribute("seed"), undefined);
        motes.dispose();
    });

    it("fade in on the land's kind, fade out and the next in crossing into another land, and none indoors", () => {
        const motes = new Motes();
        const { uniforms } = motes;
        const step = (land, seconds) => {
            for (let t = 0; t < seconds; t += 0.1) {
                motes.update(100, 20, 100, 0.1, land, 800);
            }
        };

        motes.setQuality(QUALITY.medium.motes);
        step("meadow", 3);
        assert.ok(motes.object.visible);
        assert.equal(motes.kind, "pollen");
        assert.ok(Math.abs(uniforms.moteAmount.value - MOTES.pollen.amount) < 1e-9);
        assert.deepEqual(uniforms.moteCentre.value.toArray(), [100, 22, 100]);

        // (Into the volcano's ash: the pollen fading out first, then the embers in)
        step("volcanic", 0.5);
        assert.equal(motes.kind, "pollen");
        assert.ok(uniforms.moteAmount.value < MOTES.pollen.amount);
        step("volcanic", 4);
        assert.equal(motes.kind, "embers");
        assert.ok(Math.abs(uniforms.moteAmount.value - MOTES.embers.amount) < 1e-9);

        // (The breeze never carries them out of their box)
        step("volcanic", 120);
        const drift = uniforms.moteDrift.value;

        assert.ok(Math.abs(drift.x) < uniforms.moteBox.value.x && Math.abs(drift.y) < uniforms.moteBox.value.y && Math.abs(drift.z) < uniforms.moteBox.value.z, drift.toArray().join(", "));

        // (Indoors, and on lands with none: gone)
        step(null, 3);
        assert.equal(motes.object.visible, false);
        step("beach", 3);
        assert.equal(motes.object.visible, false);
        motes.dispose();
    });
});
