// What a foot lands on, for the sound of the step (client/js/audio/footing.js): laid ground as it's
// laid, and out in the world the land's own, by how high it is and whether it's waded through
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { footing, HIGH, LAND_FOOTING, SURFACES } from "../client/js/audio/footing.js";
import { SOUNDS } from "../client/js/audio/synth.js";
import { BIOMES } from "../client/js/core/worldplan/races.js";
import { GROUND } from "../client/js/core/setpieces/pieces.js";

describe("footing", () => {
    it("has a footstep for every footing, and a footing for lands that are only lands", () => {
        for (const surface of SURFACES) {
            assert.ok(SOUNDS[`step${surface[0].toUpperCase()}${surface.slice(1)}`], surface);
        }

        const lands = new Set(BIOMES.map(({ id }) => id));

        for (const [land, surface] of Object.entries(LAND_FOOTING)) {
            assert.ok(lands.has(land), `${land} is a land`);
            assert.ok(SURFACES.includes(surface), surface);
        }
    });

    it("is what's laid where something's laid: boards, cobbles and a courtyard's flags, wet or not", () => {
        assert.equal(footing(GROUND.planks), "wood");
        assert.equal(footing(GROUND.planks, { wet: true, land: "marsh" }), "wood", "a bridge's deck");
        assert.equal(footing(GROUND.cobbles, { land: "snow" }), "stone");
        assert.equal(footing(GROUND.courtyard), "stone");
    });

    it("is the land's own out in the world: sand, snow, scree, mud, leaves or grass", () => {
        assert.equal(footing(GROUND.grass), "grass");
        assert.equal(footing(GROUND.grass, { land: "meadow" }), "grass");
        assert.equal(footing(GROUND.grass, { land: "beach" }), "sand");
        assert.equal(footing(GROUND.grass, { land: "tundra" }), "snow");
        assert.equal(footing(GROUND.grass, { land: "volcanic" }), "gravel");
        assert.equal(footing(GROUND.grass, { land: "marsh" }), "mud");
        assert.equal(footing(GROUND.grass, { land: "woods" }), "leaves");
        assert.equal(footing(GROUND.grass, { land: "meadow", wet: true }), "water");
    });

    it("is scree and then snow up high, whatever the land; a road's packed dirt but where the land's loose", () => {
        assert.equal(footing(GROUND.grass, { land: "meadow", height: HIGH.scree }), "gravel");
        assert.equal(footing(GROUND.grass, { land: "woods", height: HIGH.snow }), "snow");
        assert.equal(footing(GROUND.road, { land: "meadow" }), "dirt");
        assert.equal(footing(GROUND.road, { land: "woods" }), "dirt");
        assert.equal(footing(GROUND.road, { land: "beach" }), "sand");
        assert.equal(footing(GROUND.road, { land: "meadow", height: HIGH.snow }), "snow");
        assert.equal(footing(GROUND.soil, { land: "meadow" }), "dirt");
        assert.equal(footing(GROUND.soil, { land: "marsh" }), "mud");
    });
});
