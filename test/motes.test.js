// The motes drifting in the air round the player (client/js/world/motes.js): each land's own kind,
// as many as the quality has (none on low), fading from one kind to the next as the player crosses
// from land to land, none indoors but a place's own (an ants' nest's spores), gone at once through
// a door, and drifting without their breeze ever carrying them out of the box round the player
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
        // (A land's, as the game gives them: MOTES_OF its kind)
        const step = (land, seconds) => {
            for (let t = 0; t < seconds; t += 0.1) {
                motes.update(100, 20, 100, 0.1, MOTES_OF[land] ?? null, 800);
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

    it("drift indoors only where the place has its own (an ants' nest's spores, glowing), and are gone at once through a door", () => {
        const motes = new Motes();
        const scale = 800;

        motes.setQuality(QUALITY.medium.motes);

        for (let t = 0; t < 3; t += 0.1) {
            motes.update(100, 0, 100, 0.1, MOTES_OF.meadow, scale);
        }

        assert.ok(motes.object.visible);

        // (In through the nest's way in: the pollen gone at once, the spores fading in)
        motes.cut();
        assert.equal(motes.object.visible, false);
        assert.equal(motes.level, 0);

        for (let t = 0; t < 0.5; t += 0.1) {
            motes.update(40, 0, 40, 0.1, "spores", scale);
        }

        assert.equal(motes.kind, "spores");
        assert.ok(motes.object.visible && motes.uniforms.moteAmount.value < MOTES.spores.amount);

        for (let t = 0; t < 3; t += 0.1) {
            motes.update(40, 0, 40, 0.1, "spores", scale);
        }

        assert.ok(Math.abs(motes.uniforms.moteAmount.value - MOTES.spores.amount) < 1e-9);
        // (Their own light, not the sky's: underground, the same by night as by day; rising)
        assert.equal(MOTES.spores.lit, false);
        assert.ok(MOTES.spores.breeze[1] > 0);

        // (No land has them)
        assert.ok(!Object.values(MOTES_OF).includes("spores"));

        // (Something not a kind: none)
        motes.cut();
        motes.update(40, 0, 40, 0.1, "meadow", scale);
        assert.equal(motes.object.visible, false);
        motes.dispose();
    });
});
