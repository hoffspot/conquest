// How a dungeon's bosses and mini-bosses look (client/js/beasts/champions.js): every theme's own
// each with a look, what's worn in place of what was in its slot, and a sculpted one bigger, its
// body tinted and what glows on it brighter than others of its kind; and the wild's elites, gilded,
// bigger and radiant (world/ailments3d.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// (The creatures' skins paint a canvas: enough of one for them to in Node, every other drawing
// call doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const THREE = await import("three");
const { BeastAvatar } = await import("../client/js/beasts/beast.js");
const { Ailments3D } = await import("../client/js/world/ailments3d.js");
const { CHAMPION_HEIGHT, CHAMPION_LOOKS, championLook, championScale, REGALIA, wearing } = await import("../client/js/beasts/champions.js");
const { LOOKS } = await import("../client/js/beasts/looks.js");
const { EQUIPMENT } = await import("../client/js/characters/equipment.js");
const { THEMES } = await import("../client/js/core/dungeons/themes.js");

describe("a dungeon's bosses and mini-bosses drawn their own way (beasts/champions.js)", () => {
    it("gives every theme's boss and mini-boss a look: bigger than its kind, a boss more than a mini-boss, and what a people-shaped one wears on its head", () => {
        assert.ok(CHAMPION_LOOKS.boss.scale > CHAMPION_LOOKS.mini.scale && CHAMPION_LOOKS.mini.scale > 1);

        for (const [theme, { bosses, minis }] of Object.entries(THEMES)) {
            for (const [rank, list] of [["boss", bosses], ["mini", minis]]) {
                for (const { id, creature } of list) {
                    const look = championLook(rank, id);

                    assert.ok(REGALIA[id], `${theme}: ${id} has no look`);
                    assert.ok(look.scale > 1 && look.glow >= 1, `${theme}: ${id}`);

                    for (const each of look.wear) {
                        assert.equal(EQUIPMENT[each]?.slot, "head", `${theme}: ${id} wears ${each}`);
                        assert.equal(LOOKS[creature].body, "humanoid", `${theme}: ${id} (a ${creature}) can't wear ${each}`);
                    }
                }
            }
        }

        assert.equal(championLook(null, "trollKing"), null);
        assert.deepEqual(championLook("mini", "nobodyKnown"), { ...CHAMPION_LOOKS.mini, tint: null, wear: [] });
    });

    it("makes one no taller than a dungeon's lowest roof has room for, by being one: a big one only a little bigger", () => {
        const look = championLook("boss", "trollKing");

        assert.equal(championScale(look, 1.5), look.scale);
        assert.ok(Math.abs(championScale(look, 3) * 3 - CHAMPION_HEIGHT.tallest) < 1e-9);
        assert.equal(championScale(look, 3.5), CHAMPION_HEIGHT.least);
    });

    it("puts what's worn in place of whatever was in its slot", () => {
        assert.deepEqual(wearing(["loincloth", "nasalHelm", "belt"], ["crown"]), ["loincloth", "belt", "crown"]);
        assert.deepEqual(wearing(["loincloth", "belt"], []), ["loincloth", "belt"]);
    });

    it("draws a sculpted one bigger than others of its kind, its body tinted and what glows on it brighter", () => {
        const look = championLook("boss", "broodmother");
        const [plain, mother] = [new BeastAvatar("caveSpider", { seed: 5 }), new BeastAvatar("caveSpider", { seed: 5, champion: look })];
        const glows = (avatar) => {
            const found = [];

            avatar.object.traverse((node) => {
                if (node.isMesh && node.material.isMeshBasicMaterial) {
                    found.push(node.material.color.r + node.material.color.g + node.material.color.b);
                }
            });

            return found;
        };

        assert.ok(Math.abs(mother.scale / plain.scale - look.scale) < 1e-9);
        assert.ok(Math.abs(mother.character.height / plain.character.height - look.scale) < 1e-9);

        // (Its shell's colour the tint times its own: redder than green)
        const [a, b] = [plain.plan.materials.body.color, mother.plan.materials.body.color];

        assert.ok(b.r / a.r > b.g / a.g);
        assert.ok(glows(plain).length > 0);
        glows(plain).forEach((each, k) => assert.ok(Math.abs(glows(mother)[k] / each - look.glow) < 1e-6));

        plain.dispose();
        mother.dispose();
    });

    it("draws one of the wild's elites gilded and bigger than its kind, and radiant till it falls", () => {
        const look = championLook("elite");

        assert.deepEqual(look, { ...CHAMPION_LOOKS.elite, wear: [] });
        assert.ok(look.scale > CHAMPION_LOOKS.mini.scale && look.glow > 1 && look.tint !== null);

        const [plain, elite] = [new BeastAvatar("wolf", { seed: 5 }), new BeastAvatar("wolf", { seed: 5, champion: look })];
        const [a, b] = [plain.plan.materials.body.color, elite.plan.materials.body.color];

        assert.ok(Math.abs(elite.scale / plain.scale - look.scale) < 1e-9);
        // (Gilded: its coat warmer, redder than blue)
        assert.ok(b.r / a.r > b.b / a.b);

        // Radiant: a glow of gold on the ground round it and sparks rising, from when it's seen;
        // gone a moment after it falls
        const parent = new THREE.Group();
        const ailments = new Ailments3D(parent);

        elite.object.position.set(3, 0, 4);
        ailments.add("wild-1", "elite", elite.object, elite.character.height);
        assert.deepEqual(ailments.shown(), { "wild-1": ["elite"] });

        ailments.update(0.5);

        const [radiance] = parent.children;
        const sparks = radiance.children.filter((child) => !child.userData.pool);

        assert.deepEqual([radiance.position.x, radiance.position.z], [3, 4]);
        assert.ok(sparks.length >= 6 && sparks.every((spark) => spark.position.y >= 0 && spark.position.y <= elite.character.height * 1.2));

        const heights = sparks.map((spark) => spark.position.y);

        ailments.update(0.5);
        assert.ok(sparks.some((spark, k) => spark.position.y !== heights[k]), "rising");

        ailments.remove("wild-1", "elite");
        ailments.update(1);
        assert.deepEqual(ailments.shown(), {});
        assert.equal(parent.children.length, 0);

        plain.dispose();
        elite.dispose();
    });
});
