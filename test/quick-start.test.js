// The quick start's hero (client/js/app/heroes.js quickStartHero; `?play`, main.js): made from the
// world's seed, so the browser tests, which nearly all come into the game that way, play the same
// body every run. What's true of one body isn't of the next (a tall one's hips ride higher in the
// saddle), and a hero rolled afresh each run made tests fail now and then.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HUMAN_TONES, quickStartHero, tonesOf } from "../client/js/app/heroes.js";
import { BEARDS, HAIRSTYLES } from "../client/js/characters/hair.js";

describe("the quick start's hero (heroes.js quickStartHero)", () => {
    it("is the same for a seed every time, named, and playable", () => {
        for (const seed of [1, 2, 5, 12, 4242]) {
            const hero = quickStartHero(seed);

            assert.deepEqual(quickStartHero(seed), hero, `seed ${seed}`);
            assert.ok(hero.name.length > 0, `seed ${seed}: named`);
            assert.ok(Object.values(HUMAN_TONES).includes(hero.look.skin.tone), `seed ${seed}`);
            assert.ok(HAIRSTYLES[hero.look.hair.style] && BEARDS[hero.look.hair.beard], `seed ${seed}`);

            for (const key of ["gender", "muscle", "weight", "height", "bust"]) {
                assert.ok(hero.shape.macro[key] >= 0 && hero.shape.macro[key] <= 1, `seed ${seed}: ${key}`);
            }
        }
    });

    it("is another body for another seed, and for another `hero` of the same seed, each the same every time", () => {
        const bodies = [quickStartHero(1), quickStartHero(2), quickStartHero(1, { which: 1 }), quickStartHero(1, { which: 2 })];
        const shapes = new Set(bodies.map(({ shape }) => JSON.stringify(shape)));

        assert.equal(shapes.size, bodies.length);
        assert.deepEqual(quickStartHero(1, { which: 2 }), bodies[3]);
        // (As the page's address gives it, text; none, or not a number: the first)
        assert.deepEqual(quickStartHero(1, { which: "2" }), bodies[3]);
        assert.deepEqual(quickStartHero(1, { which: null }), bodies[0]);
        assert.deepEqual(quickStartHero(1, { which: "tall" }), bodies[0]);
        assert.deepEqual(quickStartHero(1, { which: -3 }), bodies[0]);
    });

    it("is one of a people asked for, the same every time", () => {
        const elf = quickStartHero(3, { people: "elf" });
        const cat = quickStartHero(3, { people: "cat" });

        assert.equal(elf.race, "elf");
        assert.deepEqual(cat.parts, ["catEars", "catTail"]);
        assert.ok(Object.values(tonesOf("cat")).map((tone) => tone.toLowerCase()).includes(cat.look.skin.tone.toLowerCase()));
        assert.deepEqual(quickStartHero(3, { people: "elf" }), elf);
        assert.deepEqual(quickStartHero(3, { people: "cat" }), cat);
        assert.notDeepEqual(quickStartHero(3, { people: "cat", which: 1 }).look, cat.look);
        // (A people there isn't: a human)
        assert.equal(quickStartHero(3, { people: "dragon" }).race, "human");
    });
});
