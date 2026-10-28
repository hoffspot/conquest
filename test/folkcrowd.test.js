// The townsfolk drawn in crowds (client/js/characters/folkcrowd.js): each people's and sex's figure
// plain, light and empty-handed; each of them dyed their own colours from it, and as tall and broad
// as they are
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EQUIPMENT } from "../client/js/characters/equipment.js";
import { folkLook, TOWNSFOLK_PARTS } from "../client/js/characters/folk.js";
import { FOLK_BUILD, folkBuild, folkFigureLook, folkKind, folkTint } from "../client/js/characters/folkcrowd.js";
import { RACES } from "../client/js/core/worldplan/races.js";

const PEOPLES = RACES.map(({ id }) => id);

// A colour ("#rrggbb") as it's drawn (linear), and how light it is
const linear = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// One of the townsfolk, as they're dressed in full (core/townsfolk.js townsfolkOf's)
const townsfolk = (people, sex, seed, calling = TOWNSFOLK_PARTS[seed % TOWNSFOLK_PARTS.length]) => folkLook({ role: "townsfolk", local: calling, look: calling, sex, seed, people });

// What a figure dyed so is drawn as, where its own colour is `colour` (linear): its lightness there, times the dye
const dyed = (tint, part, colour) => (tint[part * 4 + 3] ? [0, 1, 2].map((k) => tint[part * 4 + k] * luminance(colour)) : colour);

describe("the townsfolk's figures in a crowd (folkcrowd.js folkFigureLook)", () => {
    it("is one of each people and sex, in their plain everyday clothes, above the hips and below, boots on, nothing on their head or in their hands; a human fair, a cat's fur unstriped; always the same", () => {
        for (const people of PEOPLES) {
            for (const sex of ["m", "f"]) {
                const figure = folkFigureLook({ people, sex });
                const pieces = figure.equipment.map((id) => [id, EQUIPMENT[id]]);

                assert.equal(folkKind({ people, sex }), `folk:${people}:${sex}`);
                assert.ok(
                    pieces.every(([, piece]) => piece),
                    `${people} ${sex}: ${figure.equipment}`,
                );
                assert.ok(
                    pieces.some(([, { slot }]) => ["shirt", "chest", "surcoat"].includes(slot)),
                    `${people} ${sex}: clothes above the hips`,
                );
                assert.ok(
                    pieces.some(([, { slot }]) => ["legs", "apron", "underwear"].includes(slot)),
                    `${people} ${sex}: below them`,
                );
                assert.ok(
                    pieces.every(([, { kind, slot, socket }]) => kind !== "item" || (slot !== "head" && !/Hand$/.test(socket ?? ""))),
                    `${people} ${sex}: nothing held or worn on the head`,
                );
                assert.equal(figure.look.hair.beard, "none");
                assert.equal(figure.look.skin.stripes, undefined);
                assert.equal(figure.sheathed, false);
                assert.equal(folkFigureLook({ people, sex }), figure, "made once");
            }
        }

        assert.deepEqual(folkFigureLook({ people: "human", sex: "m" }).equipment, ["shirt", "trousers", "boots", "belt"]);
        assert.deepEqual(folkFigureLook({ people: "human", sex: "f" }).equipment, ["chemise", "skirt", "boots"]);
        assert.ok(folkFigureLook({ people: "cat", sex: "f" }).equipment.includes("catTail"), "their own parts kept");
    });

    it("is the fairest of its people, in the lightest of what they wear, so each of them is dyed darker from it, mostly", () => {
        for (const people of PEOPLES) {
            for (const sex of ["m", "f"]) {
                const figure = folkFigureLook({ people, sex });
                const skin = luminance(linear(figure.look.skin.tone));
                let darker = 0;
                let all = 0;

                for (let seed = 1; seed <= 40; seed++) {
                    darker += luminance(linear(townsfolk(people, sex, seed).look.skin.tone)) <= skin + 1e-9 ? 1 : 0;
                    all++;
                }

                assert.ok(darker / all >= 0.8, `${people} ${sex}: ${darker} of ${all} no fairer than its figure`);
            }
        }
    });
});

describe("each of the townsfolk in a crowd in their own colours (folkcrowd.js folkTint)", () => {
    it("dyes one dressed as the figure is its figure's own colours, part for part", () => {
        const figure = folkFigureLook({ people: "human", sex: "m" });
        const same = { ...figure, look: structuredClone(figure.look) };
        const tint = folkTint(same, figure);

        assert.equal(tint.length, 16);

        for (const [part, hex] of [
            [0, figure.look.skin.tone],
            [1, EQUIPMENT.shirt.colour],
            [2, EQUIPMENT.trousers.colour],
            [3, figure.look.hair.colour],
        ]) {
            assert.equal(tint[part * 4 + 3], 1, `part ${part} dyed`);
            dyed(tint, part, linear(hex)).forEach((c, k) => assert.ok(Math.abs(c - linear(hex)[k]) < 1e-6, `part ${part}: ${c} for ${linear(hex)[k]}`));
        }
    });

    it("dyes each their own skin, clothes and hair: a green tunic green, a red kirtle red, black hair black; the bald their skin's colour there, and one bare above the hips their skin's too", () => {
        const man = folkFigureLook({ people: "human", sex: "m" });
        const woman = folkFigureLook({ people: "human", sex: "f" });
        const hue = (colour) => colour.map((c) => c / Math.max(...colour));
        const close = (a, b, why) => a.forEach((c, k) => assert.ok(Math.abs(c - b[k]) < 0.02, `${why}: ${a} for ${b}`));

        // (A shopper in a green tunic over his trousers, his hair black)
        const shopper = { ...man, look: { ...man.look, hair: { ...man.look.hair, colour: "#141110" } }, equipment: ["greenTunic", "trousers", "boots"] };
        const green = folkTint(shopper, man);

        close(hue(dyed(green, 1, linear(EQUIPMENT.shirt.colour))), hue(linear(EQUIPMENT.greenTunic.colour)), "a green tunic");
        close(dyed(green, 3, linear(man.look.hair.colour)), linear("#141110"), "black hair");

        // (A woman in a red kirtle)
        const red = folkTint({ ...woman, equipment: ["chemise", "kirtle", "boots"] }, woman);

        close(hue(dyed(red, 2, linear(EQUIPMENT.skirt.colour))), hue(linear(EQUIPMENT.kirtle.colour)), "a red kirtle");

        // (Bald, and bare above the hips: their skin)
        const bare = folkTint({ ...man, look: { ...man.look, skin: { ...man.look.skin, tone: "#5a3a2a" }, hair: { ...man.look.hair, style: "bald" } }, equipment: ["trousers", "boots"] }, man);

        close(dyed(bare, 3, linear(man.look.hair.colour)), linear("#5a3a2a"), "the bald");
        close(dyed(bare, 1, linear(EQUIPMENT.shirt.colour)), linear("#5a3a2a"), "bare above the hips");
    });

    it("gives no two of a town's townsfolk the same colours, mostly, of whatever people", () => {
        for (const people of PEOPLES) {
            for (const sex of ["m", "f"]) {
                const figure = folkFigureLook({ people, sex });
                const tints = new Set();

                for (let seed = 1; seed <= 12; seed++) {
                    const tint = folkTint(townsfolk(people, sex, seed * 7919), figure);

                    assert.ok(
                        [...tint].every((value) => Number.isFinite(value) && value >= 0),
                        `${people} ${sex}: ${tint}`,
                    );
                    tints.add([...tint].map((value) => value.toFixed(2)).join());
                }

                assert.ok(tints.size >= 6, `${people} ${sex}: ${tints.size} kinds of colours in 12`);
            }
        }
    });
});

describe("each of the townsfolk in a crowd as tall and broad as they are (folkcrowd.js folkBuild)", () => {
    it("is the figure's build for one built as it is; taller for one taller, broader for one heavier, never more than FOLK_BUILD.most either way", () => {
        const figure = folkFigureLook({ people: "human", sex: "m" });
        const as = (macro) => ({ ...figure, shape: { ...figure.shape, macro: { ...figure.shape.macro, ...macro } } });
        const { height, weight } = figure.shape.macro;

        assert.deepEqual(folkBuild(figure, figure), [1, 1]);
        assert.ok(folkBuild(as({ height: height + 0.1 }), figure)[1] > 1);
        assert.ok(folkBuild(as({ height: height - 0.1 }), figure)[1] < 1);
        assert.ok(folkBuild(as({ weight: weight + 0.2 }), figure)[0] > 1);
        assert.deepEqual(folkBuild(as({ height: 5, weight: 5, muscle: 5 }), figure), [1 + FOLK_BUILD.most, 1 + FOLK_BUILD.most]);
        assert.deepEqual(folkBuild(as({ height: -5, weight: -5, muscle: -5 }), figure), [1 - FOLK_BUILD.most, 1 - FOLK_BUILD.most]);
    });
});
