// Might and power (client/js/core/might.js; docs/WILDS.md "Might and power"), each piece's level
// (core/gear.js LEVELS), and a legendary weapon's effect (core/legendary.js; docs/GAME.md
// "Legendary weapons"): a hero's might and a foe's power on one scale, what's found made for the
// hero's might from the fight's power, an easy kill finding the exceptional less often, and the
// effects charged blow by blow and let loose
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, ELITES, tierPower } from "../client/js/core/creatures.js";
import { CHAMPIONS } from "../client/js/core/dungeons/play.js";
import { AFFIXES, affixesFor, bonusCount, bonusCounts, effectOf, GEAR, levelFactor, levelOf, LEVELS, rollGear, ROLLS, statsOf } from "../client/js/core/gear.js";
import { BLOW_EFFECTS, CHARGE, chargeOf, effectAt, EFFECTS, effectFor, effectStrength, WARD_CHARGE } from "../client/js/core/legendary.js";
import { falloff, fighterOf, fightLook, heroValue, LOOT_LEVEL, MIGHT, mightOf, mightTier, packPower, partsOf, powerOf, scaleOf, tierPowerOf, levelFor } from "../client/js/core/might.js";
import { EXCEPTIONAL, fallenOff, MAKES, priceOf, Progress } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { atLevel } from "../client/js/core/stock.js";

const TREES = ["blade", "marksman", "hexes", "endurance", "evasion", "shield", "trade", "talk", "command"];
const ranks = (xp) => Object.fromEntries(TREES.map((tree) => [tree, xp]));

// A full kit of a make and level, seeded
function kit(seed, quality, level = 1) {
    const random = createRandom(seed);
    const make = (id) => rollGear(id, quality, random, { people: "human", level });

    return { mainHand: make("sword"), offHand: make("towerShield"), head: make("nasalHelm"), chest: make("plate"), bracers: make("vambraces"), gloves: make("platedGloves"), belt: make("girdle"), legs: make("greaves"), boots: make("sabatons"), cloak: make("cloak"), amulet: make("amulet"), ring1: make("ring"), ring2: make("ring") };
}

// One of the wild's creatures as the host rouses it (an elite's or a champion's strength: `times`)
const creature = (id, tier, { hp = 1, power = 1 } = {}) => {
    const spec = CREATURES[id];
    const strength = tierPower(tier) * power;

    return { weapon: spec.weapon, power: { melee: strength, ranged: strength }, armor: spec.armor ?? 0, maxHp: Math.round(spec.hp * tierPower(tier) * hp), wild: { creature: id } };
};

describe("might, a hero's (might.js)", () => {
    it("is 0 for a fresh hero, and rises with their ranks, their gear's make and its level, up to 100", () => {
        const fresh = new Progress({}, { weapon: "sword" });
        const veteran = new Progress({ skills: ranks(800), schools: { fire: 2000 }, spells: ["burn"], gear: kit(13, "masterwork") }, { weapon: "sword" });
        const legend = new Progress({ skills: ranks(4500), schools: { healing: 5000, fire: 24000, earth: 24000, air: 24000, water: 24000 }, spells: ["burn", "rumble", "hurt", "blister"], gear: kit(17, "legendary") }, { weapon: "sword" });
        const higher = new Progress({ ...legend.toJSON(), gear: kit(17, "legendary", 100) }, { weapon: "sword" });

        assert.equal(mightOf(fresh), 0);
        assert.equal(mightOf(new Progress({}, { weapon: "wand" })), 0, "(a fresh wand's caster, no element yet, none)");
        assert.ok(mightOf(veteran) > 40 && mightOf(veteran) < 75, `a veteran in masterwork: ${mightOf(veteran)}`);
        assert.ok(mightOf(legend) > 75, `a legend: ${mightOf(legend)}`);
        assert.ok(heroValue(higher) > heroValue(legend) && mightOf(higher) >= mightOf(legend), "gear of a higher level, mightier");
        assert.ok(mightOf(higher) <= MIGHT.top);
    });

    it("takes the scale's steps as many times as much each, a tier of a creature's about six", () => {
        assert.equal(scaleOf(MIGHT.least), 0);
        assert.equal(scaleOf(MIGHT.least * MIGHT.span), 100);
        assert.equal(scaleOf(MIGHT.least * MIGHT.span * 10), 100, "never more than 100");
        assert.equal(scaleOf(MIGHT.least / 2), 0, "never less than 0");
        assert.equal(scaleOf(MIGHT.least * 1.18 ** 3) - scaleOf(MIGHT.least), 17, "three tiers, about six steps each");
    });

    it("gives the old tiers one for every ten of it (the war's ages, the smith, caches, treasure, dungeons, hoards)", () => {
        assert.deepEqual([0, 9, 10, 29, 59, 99, 100].map(mightTier), [0, 0, 1, 2, 5, 9, 10]);
        assert.deepEqual([1, 2, 5, 10].map(tierPowerOf), [0, 10, 40, 90]);
    });
});

describe("power, a foe's (might.js)", () => {
    it("is a foe's own, as it is: its tier, an elite's or a champion's strength", () => {
        assert.equal(powerOf(creature("rat", 1)), 0);
        assert.ok(powerOf(creature("troll", 9)) > 45 && powerOf(creature("troll", 9)) < 70, `a troll of the ninth tier: ${powerOf(creature("troll", 9))}`);
        assert.ok(powerOf(creature("troll", 9, { hp: ELITES.hp, power: ELITES.power })) > powerOf(creature("troll", 9)), "an elite, stronger");
        assert.ok(powerOf(creature("demonLord", 10, CHAMPIONS.boss)) >= 95, "a dungeon's boss Demon Lord");
        assert.equal(powerOf({ ...creature("troll", 9), wild: { creature: "kaiju", colossus: {} } }), 100, "the colossal, the mightiest");
    });

    it("counts those of a pack that came at a player together as one: stronger than any of them alone", () => {
        const wolves = [1, 2, 3].map(() => creature("wolf", 3));

        assert.equal(powerOf(wolves[0]), 0, "a wolf alone");
        assert.ok(packPower(wolves.map(partsOf)) > 10, `three together: ${packPower(wolves.map(partsOf))}`);
        assert.equal(packPower([partsOf(wolves[0])]), powerOf(wolves[0]), "one alone, as itself");
    });
});

describe("what's found made for might (might.js levelFor, falloff)", () => {
    it("makes a piece of the fight's power, no more than 10 under the hero's might nor 5 over it, a little luck either way", () => {
        const random = createRandom(5);

        for (let k = 0; k < 300; k++) {
            const easy = levelFor(0, 60, random);
            const hard = levelFor(100, 60, random);
            const fair = levelFor(40, 40, random);
            const fresh = levelFor(90, 0, random);

            assert.ok(easy >= 50 - LOOT_LEVEL.luck && easy <= 50 + LOOT_LEVEL.luck, `easy ${easy}`);
            assert.ok(hard >= 65 - LOOT_LEVEL.luck && hard <= 65 + LOOT_LEVEL.luck, `hard ${hard}`);
            assert.ok(Math.abs(fair - 40) <= LOOT_LEVEL.luck, `fair ${fair}`);
            assert.ok(fresh >= 1 && fresh <= 5 + LOOT_LEVEL.luck, `a fresh hero carried: ${fresh}`);
        }
    });

    it("finds the exceptional less often for an easy kill: as likely to 10 weaker, half for each 10 more, never under a tenth", () => {
        assert.deepEqual([-30, 0, 10].map(falloff), [1, 1, 1]);
        assert.equal(falloff(20), 0.5);
        assert.equal(falloff(30), 0.25);
        assert.equal(falloff(60), LOOT_LEVEL.floor);
        assert.deepEqual([15, 0, -15, -40].map(fightLook), ["easy", "fair", "hard", "deadly"]);
    });

    it("takes what an easy kill finds less of from the rare, very rare and legendary, and gives it to the rest", () => {
        const fell = fallenOff(MAKES, 0.25);
        const total = (odds) => Object.values(odds).reduce((sum, chance) => sum + chance, 0);

        assert.ok(Math.abs(total(fell) - total(MAKES)) < 1e-12, "the same odds in all");

        for (const make of EXCEPTIONAL) {
            assert.ok(Math.abs(fell[make] - MAKES[make] * 0.25) < 1e-12, make);
        }

        assert.ok(fell.common > MAKES.common && fell.fine > MAKES.fine);
        assert.equal(fallenOff(MAKES, 1), MAKES, "a fair fight, as it is");
    });
});

describe("a piece's level (gear.js LEVELS)", () => {
    it("is 1 to 100, a level-100 piece twice what a level-1 of its make is; level 1, as everything was before levels", () => {
        assert.equal(levelFactor(1), 1);
        assert.equal(levelFactor(100), LEVELS.span);
        assert.equal(levelFactor(undefined), 1, "(one made before levels)");
        assert.deepEqual([0, 1, 50.4, 100, 140, NaN].map(levelOf), [1, 1, 50, 100, 100, 1]);
        assert.deepEqual(statsOf({ id: "plate" }, 1.5), { armor: 0.2 * 1.5 }, "as it was");
        assert.ok(Math.abs(statsOf({ id: "plate", level: 100 }, 1.5).armor - 0.2 * 1.5 * 2) < 1e-12);
    });

    it("rolls its bonuses as strong as its level, and keeps the level with it", () => {
        const random = createRandom(9);
        const low = rollGear("ring", "legendary", random, { level: 1 });
        const high = rollGear("ring", "legendary", random, { level: 100 });

        assert.equal(low.level, undefined, "(the first level, not kept)");
        assert.equal(high.level, 100);

        for (const [stat, value] of Object.entries(high.bonuses)) {
            const key = high.affixes.find((each) => AFFIXES[each].stat === stat);
            const [least, most] = AFFIXES[key].range;
            const strength = ROLLS.legendary.strength * 2;

            assert.ok(value >= least * strength - 0.011 && value <= most * strength + 0.011, `${stat} ${value}`);
        }
    });

    it("rolls as many bonuses as its make has, the fewest always likeliest, the more a little likelier the higher its level", () => {
        for (const quality of Object.keys(ROLLS)) {
            const [least, most] = ROLLS[quality].count;

            for (const level of [1, 50, 100]) {
                const counts = bonusCounts(quality, level);

                assert.deepEqual(counts.map(({ count }) => count), Array.from({ length: most - least + 1 }, (each, k) => least + k));
                assert.ok(Math.abs(counts.reduce((sum, { chance }) => sum + chance, 0) - 1) < 1e-12);
                counts.slice(1).forEach(({ chance }, k) => assert.ok(chance < counts[k].chance, `${quality} at ${level}: fewer likelier`));
            }

            if (most > least) {
                assert.ok(bonusCounts(quality, 100).at(-1).chance > bonusCounts(quality, 1).at(-1).chance, `${quality}: the most likelier higher`);
            }
        }

        assert.deepEqual(ROLLS.legendary.count, [3, 5]);

        const random = createRandom(2);
        const seen = new Set(Array.from({ length: 400 }, () => bonusCount("legendary", 50, random)));

        assert.deepEqual([...seen].sort(), [3, 4, 5]);
    });

    it("has room on every piece for a legendary's five bonuses, each a different one", () => {
        for (const id of Object.keys(GEAR)) {
            assert.ok(new Set(affixesFor(id).map((key) => AFFIXES[key].stat)).size >= ROLLS.legendary.count[1], id);
        }

        const random = createRandom(4);

        for (let k = 0; k < 50; k++) {
            const piece = rollGear("plate", "legendary", random, { level: 100 });

            assert.equal(Object.keys(piece.bonuses).length, piece.affixes.length);
            assert.ok(piece.affixes.length >= 3 && piece.affixes.length <= 5);
        }
    });

    it("prices a piece by its level (a wand by its boost), and brings one made already to another level", () => {
        assert.equal(priceOf({ id: "sword", quality: "fine", level: 100 }), 2 * priceOf({ id: "sword", quality: "fine" }));

        const ring = { id: "ring", quality: "rare", bonuses: { hp: 10, melee: 0.05 }, affixes: ["bear", "keen"] };
        const raised = atLevel(ring, 100);

        assert.equal(raised.level, 100);
        assert.deepEqual(raised.bonuses, { hp: 20, melee: 0.1 });
        assert.deepEqual(atLevel(raised, 1).bonuses, ring.bonuses, "and back");
    });

    it("keeps a piece's level, and stacks only pieces of a level", () => {
        const progress = new Progress({ pack: [{ id: "sword", quality: "fine", level: 30, count: 1 }] }, { weapon: "sword" });

        assert.equal(progress.pack[0].level, 30);
        assert.ok(progress.stow({ id: "sword", quality: "fine", level: 40 }));
        assert.ok(progress.stow({ id: "sword", quality: "fine", level: 30 }));
        assert.equal(progress.pack.filter(Boolean).length, 2);
        assert.equal(progress.heldAlike({ id: "sword", quality: "fine", level: 30 }), 2);
        assert.ok(progress.removeAlike({ id: "sword", quality: "fine", level: 30 }, 2));
        assert.equal(progress.heldAlike({ id: "sword", quality: "fine", level: 40 }), 1, "the other left");
    });
});

describe("a legendary weapon's effect (legendary.js)", () => {
    it("is rolled on every legendary weapon, and given one made before them, the same wherever it's asked", () => {
        const random = createRandom(6);

        for (const id of ["sword", "bow", "wand", "grimoire", "hammer", "gauntlets"]) {
            assert.ok(EFFECTS[rollGear(id, "legendary", random).effect], id);
        }

        assert.equal(rollGear("plate", "legendary", random).effect, undefined, "(armour: none)");
        assert.equal(rollGear("sword", "veryRare", random).effect, undefined, "(only the legendary)");

        const old = { id: "sword", quality: "legendary", name: "Stormfang", bonuses: { melee: 0.1 }, affixes: ["keen"] };

        assert.ok(EFFECTS[effectFor(old)]);
        assert.equal(effectFor(old), effectFor({ ...old }));
        assert.equal(effectOf(old), effectFor(old));
        assert.equal(new Progress({ gear: { mainHand: old } }, { weapon: "sword" }).gear.mainHand.effect, effectFor(old), "kept with it from then on");
    });

    it("charges in as many blows as its weapon strikes in eight seconds", () => {
        assert.equal(chargeOf("sword"), 7);
        assert.equal(chargeOf("hammer"), 5);
        assert.equal(chargeOf("gauntlets"), 13);
        assert.ok(["sword", "staff", "wand", "grimoire", "hammer", "greatsword", "axe", "bow", "gauntlets"].every((id) => chargeOf(id) >= CHARGE.least));
    });

    it("is as strong as the weapon's level: its harm in proportion to it, how long and far from a little to all of it; a ward's guard, its stone skin's length and hardness too", () => {
        for (const id of BLOW_EFFECTS) {
            const [weak, strong] = [effectAt(id, 10), effectAt(id, 100)];

            assert.ok(Math.abs(weak.damage[1] - strong.damage[1] * 0.1) < 0.011, `${id}: a tenth the harm at level 10`);
            assert.deepEqual(strong.damage, EFFECTS[id].damage);

            for (const key of ["freeze", "radius", "knockdown", "leaps", "toss"]) {
                if (EFFECTS[id][key]) {
                    assert.equal(effectAt(id, 1)[key], EFFECTS[id][key][0], `${id} ${key} at the first level`);
                    assert.equal(strong[key], EFFECTS[id][key][1], `${id} ${key} at the highest`);
                }
            }
        }

        // (A ward, a unique's: Stoneheart's, from its first level's to its highest's, no harm of its own)
        for (const id of Object.keys(EFFECTS).filter((each) => EFFECTS[each].ward)) {
            const [weak, strong] = [effectAt(id, 1), effectAt(id, 100)];

            assert.equal(weak.damage, undefined, id);

            for (const key of ["guard", "skin", "harden"]) {
                assert.equal(weak[key], EFFECTS[id][key][0], `${id} ${key} at the first level`);
                assert.equal(strong[key], EFFECTS[id][key][1], `${id} ${key} at the highest`);
            }
        }

        assert.deepEqual(BLOW_EFFECTS, ["frostbind", "cinderburst", "earthsunder", "stormlash", "ruinblast"]);
        assert.equal(effectStrength(10), 0.1);
    });

    it("lets loose on the blow that lands once it's full, and starts again; thirty seconds without fighting, it's lost", () => {
        const battle = new Battle({ blocked: Array.from({ length: 12 }, () => new Uint8Array(12)) }, { seed: 4 });

        battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [4, 4] });
        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [5, 5], ai: "patrol", patrol: [[5, 5], [5, 5]], hp: 100000 });

        const player = battle.actor("player");

        player.legendary = { effect: "frostbind", level: 100, charge: 3 };

        const events = [];

        for (let t = 0; t < 8000; t += STEP_MS) {
            events.push(...battle.advance(STEP_MS));
        }

        const unleashed = events.filter((event) => event.type === "unleashed");

        assert.ok(unleashed.length >= 1, "let loose");
        assert.equal(unleashed[0].effect, "frostbind");
        assert.ok(events.some((event) => event.type === "charged" && event.id === "player"));
        assert.ok(events.some((event) => event.type === "stunned" && event.id === "orc" && event.effect === "frost"), "the orc frozen");
        assert.ok(player.charge < player.legendary.charge, "emptied");

        // (Long out of a fight: its next blow starts it again)
        player.charge = 2;
        player.foughtAt = battle.time - CHARGE.idle - 1;
        battle.actor("orc").dead = true;
        assert.ok(battle.time - player.foughtAt > CHARGE.idle);
    });

    it("is a unique's own on any piece, held or worn: one let loose by blows struck and one ward at most, the weapon's first, then each piece's as they're worn", () => {
        const level = 50;
        const amulet = { ...rollGear("amulet", "legendary", createRandom(3), { level }), unique: "heartOfHarrowstone", effect: "stoneheart" };
        const ring = { ...rollGear("ring", "legendary", createRandom(4), { level }), unique: "ring", effect: "cinderburst" };
        const plain = { ...rollGear("sword", "fine", createRandom(5), { level }) };
        const fighter = fighterOf(new Progress({ gear: { mainHand: plain, amulet, ring1: ring } }, { weapon: "sword" }));

        // (Worn, whatever they strike with: the ring's let loose by the sword's blows, its charge
        // the sword's; the amulet's a ward, charged by the blows they take)
        assert.equal(effectOf(amulet), "stoneheart");
        assert.equal(effectOf(ring), "cinderburst");
        assert.equal(effectOf({ ...ring, effect: undefined }), null, "(a legendary ring rolls none of its own)");
        assert.deepEqual(fighter.legendary, { effect: "cinderburst", level: levelOf(level), charge: chargeOf("sword") });
        assert.deepEqual(fighter.ward, { effect: "stoneheart", level: levelOf(level), charge: WARD_CHARGE.blows });

        // (A legendary sword's own first; none, no ward)
        const legendary = { ...rollGear("sword", "legendary", createRandom(6), { level }) };

        assert.equal(fighterOf(new Progress({ gear: { mainHand: legendary, ring1: ring } }, { weapon: "sword" })).legendary.effect, effectOf(legendary));
        assert.equal(fighterOf(new Progress({ gear: { mainHand: plain, ring1: ring } }, { weapon: "sword" })).ward, null);

        // (Counted in their might: what the ward keeps off)
        assert.ok(mightOf(new Progress({ gear: { mainHand: plain, amulet } }, { weapon: "sword" })) > mightOf(new Progress({ gear: { mainHand: plain, amulet: { ...amulet, effect: undefined } } }, { weapon: "sword" })));
    });

    it("lets a ward loose on whoever wears it by the blows they take: every blow on them lighter, and once it's full their skin stone a while, the blows on them lighter again", () => {
        const fight = (ward) => {
            const battle = new Battle({ blocked: Array.from({ length: 12 }, () => new Uint8Array(12)) }, { seed: 4 });

            battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [4, 4], hp: 100000 });
            battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [5, 5], ai: "patrol", patrol: [[5, 5], [5, 5]], hp: 100000 });

            const player = battle.actor("player");

            player.ward = ward;

            const events = [];
            let stone = 0;

            for (let t = 0; t < 12000; t += STEP_MS) {
                events.push(...battle.advance(STEP_MS));
                stone += player.stoneUntil > battle.time ? 1 : 0;
            }

            const taken = events.filter(({ type, id }) => type === "hit" && id === "player");

            return { player, events, stone, taken, harm: taken.reduce((sum, { damage }) => sum + damage, 0) };
        };
        const bare = fight(null);
        const warded = fight({ effect: "stoneheart", level: 100, charge: 3 });
        const unleashed = warded.events.filter(({ type }) => type === "unleashed");
        const numbers = effectAt("stoneheart", 100);

        assert.ok(bare.taken.length >= 4, "the orc's blows land");
        assert.equal(bare.events.filter(({ type }) => type === "unleashed").length, 0);
        assert.ok(unleashed.length >= 1, "let loose");
        const { id, target, effect, level, radius, struck, time, until } = unleashed[0];

        assert.deepEqual({ id, target, effect, level, radius, struck }, { id: "player", target: "player", effect: "stoneheart", level: 100, radius: null, struck: [] }, "on them, striking no one");
        assert.equal(until - time, numbers.skin, "their skin stone as long as its level makes it");
        assert.ok(warded.stone > 0, "their skin stone a while");
        assert.ok(warded.stone * STEP_MS <= numbers.skin * unleashed.length, "no longer than its skin");
        assert.ok(warded.harm < bare.harm * (1 - numbers.guard), `lighter: ${warded.harm} taken against ${bare.harm}`);
    });
});

describe("Swift, Leeching and Vicious in a fight (battle.js)", () => {
    it("strikes sooner, draws health back from the harm, and leaves the foe bleeding", () => {
        const fight = (more) => {
            const battle = new Battle({ blocked: Array.from({ length: 12 }, () => new Uint8Array(12)) }, { seed: 8 });

            battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [4, 4] });
            battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [5, 5], ai: "patrol", patrol: [[5, 5], [5, 5]], hp: 100000 });
            Object.assign(battle.actor("player"), more);

            const events = [];

            for (let t = 0; t < 10000; t += STEP_MS) {
                events.push(...battle.advance(STEP_MS));
            }

            return events;
        };
        const blows = (events) => events.filter((event) => event.type === "attack" && event.id === "player").length;
        const plain = fight({});
        const swift = fight({ haste: 0.3 });
        const leeching = fight({ leech: 0.25 });
        const vicious = fight({ bleed: 0.5 });

        assert.ok(blows(swift) > blows(plain), `${blows(swift)} blows to ${blows(plain)}`);
        assert.ok(leeching.some((event) => event.type === "healed" && event.id === "player" && event.attack === "leech"));
        assert.ok(!plain.some((event) => event.type === "healed" && event.attack === "leech"));
        assert.ok(vicious.some((event) => event.type === "afflicted" && event.id === "orc" && event.kind === "bleed"));
    });
});
