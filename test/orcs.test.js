// The orcs on a dungeon's throne (core/creatures.js orcWarlord, orcReaver): the Orc Warlord a
// cave's boss, his goblins about him, and the Orc Reaver an outlaws' hideout's, at the head of its
// outlaws; met nowhere else. Each drawn from a dressing of the Orc's model (beasts/model.js), its
// finest, the Orc King's, kept for a card; their great axes' blows timed to its clips.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREATURES } from "../client/js/core/creatures.js";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { THEMES } from "../client/js/core/dungeons/themes.js";
import { NATURAL } from "../client/js/core/weapons.js";

const { ASSETS } = await import("../client/js/app/assets.js");
const { MODELS } = await import("../client/js/beasts/model.js");

const ORCS = Object.freeze({ caves: ["orcWarlord", "the Orc Warlord", ["goblin", "goblinBomber"]], hideout: ["orcReaver", "the Orc Reaver", ["bandit"]] });

// The first of a theme's dungeons (one level deep, at a tier the orcs suit) that an orc rules
function ruledBy(theme, creature) {
    for (let seed = 1; seed < 400; seed++) {
        const dungeon = buildDungeon({ seed, theme, tier: 6, levels: 1 });
        const boss = dungeon.levels[0].packs.find(({ role }) => role === "boss");

        if (boss.foes[0].creature === creature) {
            return boss;
        }
    }

    return null;
}

describe("the orcs on a dungeon's throne", () => {
    it("has the Orc Warlord on a cave's throne with his goblins about him, and the Orc Reaver at the head of an outlaws' hideout with his outlaws", () => {
        for (const [theme, [creature, title, guard]] of Object.entries(ORCS)) {
            assert.deepEqual(THEMES[theme].bosses.find(({ id }) => id === creature), { id: creature, creature, title, weight: 1, guard });

            // (In the dungeons made, where the seed has him: his title, his guard about him)
            const boss = ruledBy(theme, creature);

            assert.ok(boss, `no ${theme} ruled by ${creature}`);
            assert.equal(boss.title, title);
            assert.ok(boss.foes.length >= 3 && boss.foes.slice(1).every(({ creature: kind }) => guard.includes(kind)), boss.foes.map(({ creature: kind }) => kind).join(", "));
        }
    });

    it("meets them nowhere else: no land of the wilds and no dungeon's packs", () => {
        for (const creature of ["orcWarlord", "orcReaver"]) {
            assert.deepEqual(CREATURES[creature].biomes, [], creature);
            assert.ok(CREATURES[creature].hands && CREATURES[creature].perilous && CREATURES[creature].steady, creature);

            for (const [id, theme] of Object.entries(THEMES)) {
                assert.ok(!(theme.packs ?? []).some(({ creatures }) => creatures.includes(creature)), `${creature} in ${id}'s packs`);
                assert.ok(!(theme.minis ?? []).some(({ creature: kind }) => kind === creature), `${creature} among ${id}'s mini-bosses`);
            }
        }
    });

    it("draws each from a dressing of the Orc's, its finest the Orc King's, kept for a card", () => {
        assert.equal(MODELS.orcWarlord.asset, "beast-orc-warlord");
        assert.equal(MODELS.orcReaver.asset, "beast-orc-reaver");

        // (The Warlord drawn 2.08 metres tall, the Reaver 1.99: half as tall again as a man, and
        // more as a dungeon's boss)
        assert.deepEqual([MODELS.orcWarlord, MODELS.orcReaver].map(({ length, made }) => +((length / made.long) * made.tall).toFixed(2)), [2.08, 1.99]);

        for (const asset of ["beast-orc-warlord", "beast-orc-reaver", "beast-orc-king", "beast-orc-king-skins"]) {
            assert.ok(ASSETS.models[asset]?.licensed, asset);
        }

        // (The King, and his brown and red skins, in no kind's model yet)
        assert.ok(!Object.values(MODELS).some(({ asset }) => asset === "beast-orc-king"));
        assert.deepEqual(ASSETS.models["beast-orc-king-skins"].files.map(({ path }) => path), ["models/beasts/orc-king.brown.bin", "models/beasts/orc-king.red.bin"]);
    });

    it("times their axes' blows to the Orc's clips: nearly two fifths of the way through each swing, the Warlord's the heavier, the Reaver's the quicker", () => {
        const [warlord] = NATURAL.orcWarlord.attacks;
        const [reaver] = NATURAL.orcReaver.attacks;

        for (const { hitAt, duration } of [warlord, reaver]) {
            assert.ok(Math.abs(hitAt / duration - 0.38) < 0.01, `${hitAt} of ${duration}`);
        }

        assert.ok(warlord.damage[1] > reaver.damage[1] && warlord.duration > reaver.duration);
        assert.deepEqual(Object.keys(MODELS.orcWarlord.attacks), ["sweep", "chop", "spin"]);
    });
});
