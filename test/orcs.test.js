// The orcs on a dungeon's throne (core/creatures.js orcWarlord, orcReaver): the Orc Warlord a
// cave's boss, his goblins about him, and the Orc Reaver an outlaws' hideout's, at the head of its
// outlaws; met nowhere else. Each drawn from a dressing of the Orc's model (beasts/model.js), its
// finest the Orc King's, his rare card's foe, and his champions' in its other skins; their great
// axes' blows timed to its clips.
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

    it("draws each from a dressing of the Orc's, its finest the Orc King's, and his champions in its brown and red skins", () => {
        assert.equal(MODELS.orcWarlord.asset, "beast-orc-warlord");
        assert.equal(MODELS.orcReaver.asset, "beast-orc-reaver");

        // (The Warlord drawn 2.08 metres tall, the Reaver 1.99: half as tall again as a man, and
        // more as a dungeon's boss)
        assert.deepEqual([MODELS.orcWarlord, MODELS.orcReaver].map(({ length, made }) => +((length / made.long) * made.tall).toFixed(2)), [2.08, 1.99]);

        for (const asset of ["beast-orc-warlord", "beast-orc-reaver", "beast-orc-king", "beast-orc-king-skins"]) {
            assert.ok(ASSETS.models[asset]?.licensed, asset);
        }

        // (The King in his own skin, drawn 2.17 metres tall; Ironjaw in the brown, Bloodtusk in the
        // red, drawn 2.08)
        assert.deepEqual(
            ["orcKing", "orcIronjaw", "orcBloodtusk"].map((kind) => [MODELS[kind].asset, MODELS[kind].skins ?? [""], +((MODELS[kind].length / MODELS[kind].made.long) * MODELS[kind].made.tall).toFixed(2)]),
            [
                ["beast-orc-king", [""], 2.17],
                ["beast-orc-king", ["brown"], 2.08],
                ["beast-orc-king", ["red"], 2.08],
            ],
        );
        assert.deepEqual(ASSETS.models["beast-orc-king-skins"].files.map(({ path }) => path), ["models/beasts/orc-king-2.brown.bin", "models/beasts/orc-king-2.red.bin"]);
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

    it("times the King's blows to his clips: each where his axe (or his foot) moves fastest in it, as much of it played as his `spans` say; his leap landing as he comes down", () => {
        // (When each blow lands in its clip, seconds, as his model has it: where the hand holding
        // his axe, or the kicking foot, is quickest; and how long each clip is)
        const BLOWS = { chop: [0.85], sweep: [1], backhand: [1.1], combo: [1.07, 1.65, 2.53], kick: [0.63], spin: [1.12], leap: [1.68] };
        const LENGTHS = { "Attack Chop": 2.33, "Attack Sweep": 2.5, "Kick 2": 1.47 };
        const { orcKing: king } = MODELS;
        const ways = [...NATURAL.orcKing.attacks[0].either, ...CREATURES.orcKing.moves];

        for (const [way, times] of Object.entries(BLOWS)) {
            const attack = ways.find(({ id }) => id === way);
            const [from, to] = king.spans[way] ?? [0, LENGTHS[king.specials[way]]];
            const lands = attack.blows?.map(({ at }) => at) ?? [attack.hitAt];

            assert.equal(lands.length, times.length, way);
            lands.forEach((at, k) => assert.ok(Math.abs(at / attack.duration - (times[k] - from) / (to - from)) < 0.02, `${way}: ${at} of ${attack.duration}`));
        }

        // (His flurry: two blows of Combo 3, at 1.03 and 1.78 seconds into it, then Kick 2's)
        const flurry = ways.find(({ id }) => id === "flurry");
        const [first, second] = king.chains.flurry;
        const whole = second.to - second.from + (first.to - first.from);
        const at = [1.03 - first.from, 1.78 - first.from, first.to - first.from + 0.63 - second.from];

        flurry.blows.forEach(({ at: ms }, k) => assert.ok(Math.abs(ms / flurry.duration - at[k] / whole) < 0.02, `flurry ${k}: ${ms}`));

        // (Springing up 0.9 seconds into his Leap Attack, down at 1.68)
        const leap = CREATURES.orcKing.moves.find(({ id }) => id === "leap");
        const [from, to] = king.spans.leap;

        assert.ok(Math.abs(leap.leap.lift / leap.duration - (0.9 - from) / (to - from)) < 0.02);
    });
});
