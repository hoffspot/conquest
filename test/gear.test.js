// Gear (client/js/core/gear.js): a slot for each part of a player, what goes in each and with
// what; bonuses rolled on better made pieces, and named for them; each people's uniform, its
// sets' bonuses, and passing for one of them
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AFFIXES, affixesFor, disguiseOf, GEAR, GEAR_SLOTS, gearName, handsOf, offHandFits, offHandFree, ROLLS, rollGear, sameGear, SETS, setBonuses, setCounts, SLOT_IDS, STATS, statsOf, UNIFORM, UNIFORM_PEOPLES } from "../client/js/core/gear.js";
import { ITEM_ICONS, iconOf, uniformIcon } from "../client/js/app/icons.js";
import { dress, LIVERIES, lookOf } from "../client/js/characters/liveries.js";
import { alike } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { STARTING_WEAPONS, WEAPONS } from "../client/js/core/weapons.js";

describe("gear (gear.js)", () => {
    it("has a slot for each part of a player, and pieces for every slot", () => {
        assert.deepEqual(SLOT_IDS, ["head", "amulet", "cloak", "chest", "bracers", "gloves", "belt", "legs", "boots", "ring1", "ring2", "mainHand", "offHand"]);

        for (const { takes } of GEAR_SLOTS) {
            assert.ok(Object.values(GEAR).some(({ slot }) => slot === takes), takes);
        }

        for (const [id, piece] of Object.entries(GEAR)) {
            assert.ok(GEAR_SLOTS.some(({ takes }) => takes === piece.slot), id);
            assert.ok(piece.price > 0, id);
            assert.ok(ITEM_ICONS[id], `${id} has an icon`);
        }

        // (Every weapon a hero can start with, in the main hand or, spiked boots, on the feet)
        for (const weapon of STARTING_WEAPONS) {
            assert.ok(GEAR[weapon], weapon);
            assert.ok(WEAPONS[weapon], weapon);
        }
    });

    it("leaves the other hand free with a one-handed weapon (a wand's for a spellward only); a bow's takes only a quiver; any other two-handed weapon's nothing", () => {
        assert.deepEqual(["sword", "wand", "staff", "hammer", "bow", "gauntlets", "grimoire"].map(handsOf), [1, 1, 2, 2, 2, 2, 2]);
        assert.equal(offHandFits("sword", "kiteShield"), null);
        assert.equal(offHandFits("sword", "towerShield"), null);
        assert.equal(offHandFits("sword", "spellward"), null, "(a sword, any shield)");
        assert.deepEqual(["roundShield", "kiteShield", "towerShield", "shield"].map((piece) => offHandFits("wand", piece)), ["ward", "ward", "ward", "ward"]);
        assert.equal(offHandFits("wand", "spellward"), null);
        assert.equal(offHandFits("grimoire", "spellward"), "twoHanded", "(a grimoire, none: held open in both hands)");
        assert.equal(offHandFits("sword", "quiver"), "quiver");
        assert.equal(offHandFits("bow", "quiver"), null);
        assert.equal(offHandFits("bow", "shield"), "bow");
        assert.equal(offHandFits("hammer", "kiteShield"), "twoHanded");
        assert.equal(offHandFits("staff", "quiver"), "quiver");
        assert.equal(offHandFits(null, "roundShield"), null, "(kicking, a shield on the arm)");
        assert.equal(offHandFits(null, "quiver"), "quiver");
        assert.deepEqual(["sword", "bow", "hammer", null].map(offHandFree), [true, false, false, true]);
    });

    it("rolls as many bonuses as a piece's make has, each on something different and fitting the piece, stronger the better made", () => {
        const random = createRandom(4);

        for (const [id, piece] of Object.entries(GEAR)) {
            for (const [quality, { count }] of Object.entries(ROLLS)) {
                const made = rollGear(id, quality, random, { people: "elf" });
                const bonuses = Object.keys(made.bonuses ?? {});

                assert.equal(made.id, id);
                assert.equal(made.quality, quality);
                assert.equal(bonuses.length, Math.min(Math.max(count, piece.jewel ? 1 : 0), new Set(affixesFor(id).map((key) => AFFIXES[key].stat)).size), `${quality} ${id}`);
                assert.ok(bonuses.every((stat) => STATS[stat]));
                assert.ok((made.affixes ?? []).every((key) => affixesFor(id).includes(key)), `${id}'s bonuses fit it`);
                assert.equal(made.people, piece.uniform ? "elf" : undefined);
                assert.equal(Boolean(made.name), quality === "legendary");
            }
        }

        // (A masterwork's two: a word before its name, and one after)
        const sword = rollGear("sword", "masterwork", random);

        assert.ok(AFFIXES[sword.affixes[0]].prefix && AFFIXES[sword.affixes[1]].suffix);

        // (Stronger the better made: the most a legendary one rolls is more than a fine one can)
        const most = (quality) => Math.max(...Array.from({ length: 300 }, () => rollGear("ring", quality, random).bonuses.hp ?? 0));

        assert.ok(most("legendary") > AFFIXES.bear.range[1]);
        assert.ok(most("fine") <= AFFIXES.bear.range[1]);
    });

    it("names a piece for what was rolled on it, whose make it is, or its own name", () => {
        assert.equal(gearName({ id: "sword" }), "Sword");
        assert.equal(gearName({ id: "sword", affixes: ["keen"] }), "Keen sword");
        assert.equal(gearName({ id: "helm", people: "darkElf", affixes: ["sturdy", "bear"] }), "Sturdy dark elven helm of the Bear");
        assert.equal(gearName({ id: "cloak", people: "cat", affixes: ["eloquence"] }), "Cat-folk cloak of Eloquence");
        assert.equal(gearName({ id: "ring", name: "Starheart", affixes: ["bear"] }), "Starheart");
    });

    it("tells what a piece does: its armour and own bonus, as well made as it is, and what was rolled on it", () => {
        assert.deepEqual(statsOf({ id: "mail" }), { armor: 0.14 });
        assert.ok(Math.abs(statsOf({ id: "mail" }, 1.5).armor - 0.21) < 1e-9);
        assert.deepEqual(statsOf({ id: "belt", bonuses: { hp: 7 } }), { armor: 0.005, stamina: 5, hp: 7 });
        assert.deepEqual(statsOf({ id: "quiver" }), { ranged: 0.05 });
        assert.deepEqual(statsOf({ id: "ring", bonuses: { nonsense: 3 } }), {});
    });

    it("counts each people's uniform worn, its set's bonuses at three and six pieces; and its helm, chest and cloak pass for one of them", () => {
        assert.deepEqual(Object.keys(SETS).sort(), [...UNIFORM_PEOPLES].sort());

        const gear = { head: { id: "helm", people: "lizard" }, chest: { id: "hauberk", people: "lizard" }, cloak: { id: "cloak", people: "lizard" }, legs: { id: "legguards", people: "orc" }, boots: { id: "leatherBoots" }, ring1: null };

        assert.deepEqual(setCounts(gear), { lizard: 3, orc: 1 });
        assert.deepEqual(setBonuses(gear), { hp: 15 });
        assert.equal(disguiseOf(gear), "lizard");
        assert.equal(disguiseOf({ ...gear, cloak: { id: "cloak", people: "orc" } }), null);
        assert.equal(disguiseOf({ ...gear, cloak: { id: "travelCloak" } }), null);

        const six = Object.fromEntries(["helm", "hauberk", "cloak", "vambraces", "warGloves", "legguards"].map((id, k) => [`slot${k}`, { id, people: "elf" }]));

        assert.deepEqual(setBonuses(six), { ranged: 0.08, stamina: 20, heal: 0.1 });
        assert.equal(UNIFORM.length, 9);
    });

    it("stacks only pieces alike: the same make, people and bonuses", () => {
        assert.ok(sameGear({ id: "helm", people: "orc" }, { id: "helm", people: "orc" }));
        assert.ok(!sameGear({ id: "helm", people: "orc" }, { id: "helm", people: "elf" }));
        assert.ok(!alike({ id: "ring", bonuses: { hp: 5 }, affixes: ["bear"] }, { id: "ring", bonuses: { hp: 6 }, affixes: ["bear"] }));
        assert.ok(alike({ id: "ring", bonuses: { hp: 5 }, affixes: ["bear"] }, { id: "ring", bonuses: { hp: 5 }, affixes: ["bear"] }));
    });

    it("draws every piece on a character, each people's uniform in its own make, and shows each people's in its colours", () => {
        for (const [id, piece] of Object.entries(GEAR)) {
            const worn = lookOf({ id, people: "cat" });

            assert.ok(piece.slot === "mainHand" || piece.jewel ? worn.length === 0 : worn.length > 0, id);
        }

        assert.deepEqual(lookOf({ id: "helm", people: "orc" }), ["helm.orc"]);
        assert.deepEqual(lookOf({ id: "hauberk", people: "orc" }), ["breastplate.orc"]);
        assert.deepEqual(lookOf({ id: "hauberk", people: "elf" }), ["mail.elf", "surcoat.elf"]);
        assert.deepEqual(dress([{ id: "greaves" }, { id: "breeches" }, { id: "ring" }]), ["breeches", "greaves"]);

        for (const people of UNIFORM_PEOPLES) {
            assert.ok(LIVERIES[people], people);

            for (const id of UNIFORM) {
                assert.ok(uniformIcon(id, people).includes(LIVERIES[people].main) || uniformIcon(id, people).includes(LIVERIES[people].metal), `${people} ${id}`);
                assert.equal(iconOf({ id, people }), uniformIcon(id, people));
            }
        }
    });
});
