// Growing stronger (client/js/core/progress.js): skills that grow by use, rank by rank up their
// trees, bringing bonuses and abilities; gear of better and worse make, bought, found, put on;
// gold; a pack; and from all of it, might
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ABILITIES, alike, itemLabel, ITEMS, LOOT, PACK_SIZE, priceOf, Progress, QUALITIES, RANKS, rollLoot, SELL_SHARE, SHOPS, TREES, wares, weaponOf } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { SPELLS } from "../client/js/core/spells.js";
import { STARTING_WEAPONS, WEAPONS } from "../client/js/core/weapons.js";

// A pack full of stacks, two of each, no two alike (and none of the kinds `leaving`)
function fullPack(leaving = []) {
    const ids = Object.keys(ITEMS).filter((id) => !leaving.includes(id));

    return Array.from({ length: PACK_SIZE }, (_, k) => ({ id: ids[k % ids.length], quality: Object.keys(QUALITIES)[Math.floor(k / ids.length)], count: 2 }));
}

describe("growing stronger (progress.js)", () => {
    it("starts untried, with 20 gold, an empty pack, and the weapon the hero chose", () => {
        const progress = new Progress({}, { weapon: "bow" });

        assert.ok(Object.keys(TREES).every((tree) => progress.rank(tree) === 0));
        assert.equal(progress.gold, 20);
        assert.deepEqual(progress.pack, Array(PACK_SIZE).fill(null));
        assert.deepEqual(progress.gear, { weapon: { id: "bow", quality: "common" }, body: null, shield: null });
        assert.equal(weaponOf(progress), "bow");
        assert.equal(progress.might(), 0);
        assert.deepEqual(progress.abilities(), []);
    });

    it("grows a skill by its use, rank by rank, each rank's title and ability told as it comes", () => {
        const progress = new Progress();

        assert.deepEqual(progress.gain("blade", 99), []);
        assert.deepEqual(progress.gain("blade", 1), [{ tree: "blade", rank: 1, title: "Trained", ability: null }]);
        assert.deepEqual(progress.gain("blade", 1000).map(({ rank, ability }) => [rank, ability]), [[2, "powerStrike"], [3, null]]);
        assert.equal(progress.rank("blade"), 3);
        assert.deepEqual(progress.toNext("blade"), { xp: 1100, from: 800, to: 2000 });
        assert.deepEqual(progress.gain("nothing", 50), []);
        assert.deepEqual(progress.gain("blade", -5), []);

        progress.gain("blade", 10000);
        assert.equal(progress.rank("blade"), RANKS.length - 1);
        assert.equal(progress.toNext("blade").to, null);
    });

    it("gives each tree's bonuses at its rank, and its abilities, every one a spell or a stronger blow", () => {
        const progress = new Progress({ skills: { blade: 300, healing: 800, endurance: 2000, trade: 100 } });
        const bonus = progress.bonuses();

        assert.ok(Math.abs(bonus.melee - 0.2) < 1e-9);
        assert.equal(bonus.ranged, 0);
        assert.ok(Math.abs(bonus.heal - 0.5) < 1e-9);
        assert.equal(bonus.hp, 30);
        assert.equal(bonus.stamina, 30);
        assert.ok(Math.abs(bonus.armor - 0.08) < 1e-9);
        assert.ok(Math.abs(bonus.haggle - 0.05) < 1e-9);
        assert.deepEqual(progress.abilities().sort(), ["greaterHeal", "powerStrike"]);

        for (const [id, ability] of Object.entries(ABILITIES)) {
            assert.ok(TREES[ability.tree].abilities[2] === id);
            assert.ok(ability.spell ? SPELLS[ability.spell] : ability.factor > 1, id);
        }
    });

    it("counts the make of a weapon in its blows, and armour's protection, to a point", () => {
        const plain = new Progress().bonuses();
        const armed = new Progress({ gear: { weapon: { id: "sword", quality: "masterwork" }, body: { id: "mail", quality: "fine" }, shield: { id: "kiteShield", quality: "common" } } }).bonuses();

        assert.equal(plain.melee, 0);
        assert.ok(Math.abs(armed.melee - 0.3) < 1e-9);
        assert.ok(Math.abs(armed.armor - (0.16 * 1.15 + 0.1)) < 1e-9);

        const piled = new Progress({ skills: { endurance: 99999 }, gear: { weapon: { id: "sword", quality: "legendary" }, body: { id: "mail", quality: "legendary" }, shield: { id: "kiteShield", quality: "legendary" } } });

        // (The best there is, and the most enduring: never more than 0.6)
        assert.ok(Math.abs(piled.bonuses().armor - (0.16 * 1.5 + 0.1 * 1.5 + 0.1)) < 1e-9);
        assert.ok(piled.bonuses().armor <= 0.6);
    });

    it("is as mighty as its best fighting skill (or its command of others) and its gear, up to 8", () => {
        assert.equal(new Progress({ skills: { blade: 300 } }).might(), 2);
        assert.equal(new Progress({ skills: { healing: 99999, trade: 99999, talk: 99999, endurance: 99999 } }).might(), 0, "(healing and trade aren't might)");
        assert.equal(new Progress({ skills: { healing: 99999, command: 2000 } }).might(), 4, "(but leading others is)");
        assert.equal(new Progress({ skills: { marksman: 800 }, gear: { weapon: { id: "bow", quality: "masterwork" }, body: { id: "mail", quality: "common" } } }).might(), 5);
        assert.equal(new Progress({ skills: { blade: 99999 }, gear: { weapon: { id: "sword", quality: "legendary" }, body: { id: "mail", quality: "legendary" }, shield: { id: "kiteShield", quality: "legendary" } } }).might(), 8);
    });

    it("prices things by their make, with haggling off what's bought and on what's sold", () => {
        assert.equal(priceOf({ id: "sword" }), 30);
        assert.equal(priceOf({ id: "sword", quality: "fine" }), 90);
        assert.equal(priceOf({ id: "sword", quality: "fine" }, { haggle: 0.1 }), 81);
        assert.equal(priceOf({ id: "sword" }, { selling: true }), Math.round(30 * SELL_SHARE));
        assert.equal(priceOf({ id: "sword" }, { selling: true, haggle: 0.25 }), Math.round(30 * SELL_SHARE * 1.25));
        assert.equal(priceOf({ id: "ale" }, { selling: true }), 1);
        assert.equal(itemLabel({ id: "mail", quality: "masterwork" }), "Masterwork mail shirt");
        assert.equal(itemLabel({ id: "potion" }), "Healing draught");
    });

    it("stocks each shop with what it keeps, better made as far as it goes", () => {
        const smith = wares("smith");

        assert.ok(smith.some(({ id, quality }) => id === "mail" && quality === "masterwork"));
        assert.ok(!smith.some(({ quality }) => quality === "legendary"));
        assert.deepEqual(wares("tavern"), [{ id: "ale", quality: "common" }, { id: "meal", quality: "common" }]);
        assert.deepEqual(wares("nowhere"), []);

        for (const [shop, { items }] of Object.entries(SHOPS)) {
            assert.ok(items.every((id) => ITEMS[id]), shop);
        }

        // (Every weapon a hero can start with can be bought, somewhere)
        for (const weapon of STARTING_WEAPONS) {
            assert.ok(Object.values(SHOPS).some(({ items }) => items.includes(weapon)), weapon);
            assert.equal(ITEMS[weapon].slot, "weapon");
            assert.ok(WEAPONS[weapon]);
        }
    });

    it("puts gear on from the pack, what it replaces back in it; shields only with a weapon that goes with one", () => {
        const progress = new Progress({ pack: [{ id: "kiteShield", count: 1 }, { id: "mail", quality: "fine", count: 1 }, { id: "bow", count: 1 }, { id: "potion", count: 1 }] }, { weapon: "sword" });

        assert.equal(progress.equip(3), "item");
        assert.equal(progress.equip(5), "item", "an empty slot");
        assert.equal(progress.equip(0), null);
        assert.equal(progress.gear.shield.id, "kiteShield");
        assert.equal(progress.pack[0], null);
        assert.equal(progress.equip(1), null);
        assert.deepEqual(progress.gear.body, { id: "mail", quality: "fine" });
        assert.deepEqual(progress.worn(), ["mail", "kiteShield"]);

        // A bow: the sword back in the pack, and the shield too
        assert.equal(progress.equip(progress.slotOf("bow")), null);
        assert.equal(progress.gear.weapon.id, "bow");
        assert.equal(progress.gear.shield, null);
        assert.equal(progress.count("sword"), 1);
        assert.equal(progress.count("kiteShield"), 1);
        assert.equal(progress.equip(progress.slotOf("kiteShield")), "shield");

        assert.equal(progress.unequip("body"), null);
        assert.equal(progress.gear.body, null);
        assert.equal(progress.unequip("body"), "item");
        assert.equal(progress.unequip("weapon"), "item");
    });

    it("stacks things alike (the same kind, as well made), as many as there are, each stack in its own slot", () => {
        const progress = new Progress({});

        assert.equal(progress.stow({ id: "potion" }), true);
        assert.equal(progress.stow({ id: "potion" }, 4), true);
        assert.equal(progress.stow({ id: "sword", quality: "fine" }), true);
        assert.equal(progress.stow({ id: "sword" }), true);
        assert.equal(progress.stow({ id: "sword", quality: "fine" }), true);
        assert.deepEqual(progress.pack.slice(0, 4), [{ id: "potion", quality: "common", count: 5 }, { id: "sword", quality: "fine", count: 2 }, { id: "sword", quality: "common", count: 1 }, null]);
        assert.equal(progress.count("potion"), 5);
        assert.equal(progress.count("sword"), 3);
        assert.deepEqual(progress.carried(), ["potion", "sword"]);
        assert.equal(progress.slotOf("sword"), 1);
        assert.equal(progress.stow({ id: "potion" }, 0), false);
        assert.equal(alike({ id: "sword" }, { id: "sword", quality: "common" }), true);
        assert.equal(alike({ id: "sword" }, { id: "sword", quality: "fine" }), false);

        // Taken off a stack, some or all
        assert.deepEqual(progress.take(0, 2), { id: "potion", quality: "common", count: 2 });
        assert.equal(progress.pack[0].count, 3);
        assert.equal(progress.take(0, 4), null, "not so many");
        assert.equal(progress.take(3), null, "an empty slot");
        assert.deepEqual(progress.take(2), { id: "sword", quality: "common", count: 1 });
        assert.equal(progress.pack[2], null);
    });

    it("moves a stack to another slot: into an empty one, onto one alike (put together), or swapped", () => {
        const progress = new Progress({ pack: [{ id: "potion", count: 3 }, { id: "ale", count: 2 }, null, { id: "potion", count: 1 }] });

        assert.equal(progress.move(0, 5), null);
        assert.deepEqual([progress.pack[0], progress.pack[5]], [null, { id: "potion", quality: "common", count: 3 }]);
        assert.equal(progress.move(3, 5), null);
        assert.deepEqual([progress.pack[3], progress.pack[5]], [null, { id: "potion", quality: "common", count: 4 }]);
        assert.equal(progress.move(1, 5), null);
        assert.deepEqual([progress.pack[1].id, progress.pack[5].id], ["potion", "ale"]);
        assert.equal(progress.move(1, 1), null);
        assert.equal(progress.move(2, 1), "item", "nothing to move");
        assert.equal(progress.move(1, PACK_SIZE), "item");
    });

    it("splits some off a stack into an empty slot: the first, or one chosen; never all, or none", () => {
        const progress = new Progress({ pack: [{ id: "potion", count: 7 }, { id: "ale", count: 1 }] });

        assert.equal(progress.split(0, 3), null);
        assert.deepEqual(progress.pack.slice(0, 3), [{ id: "potion", quality: "common", count: 4 }, { id: "ale", quality: "common", count: 1 }, { id: "potion", quality: "common", count: 3 }]);
        assert.equal(progress.split(0, 1, 9), null);
        assert.deepEqual(progress.pack[9], { id: "potion", quality: "common", count: 1 });
        assert.equal(progress.split(0, 3), "count", "all of it");
        assert.equal(progress.split(0, 0), "count");
        assert.equal(progress.split(1, 1), "count", "a stack of one");
        assert.equal(progress.split(0, 1, 1), "full", "onto something");

        // (None to split into, with the pack full)
        assert.equal(new Progress({ pack: fullPack() }).split(0, 1), "full");
    });

    it("reads a pack kept before things stacked: each thing put in, those alike together", () => {
        const progress = new Progress({ pack: [{ id: "potion" }, { id: "sword", quality: "fine" }, { id: "potion" }, { id: "nonsense" }, { id: "potion", quality: "odd" }] });

        assert.deepEqual(progress.pack.slice(0, 3), [{ id: "potion", quality: "common", count: 3 }, { id: "sword", quality: "fine", count: 1 }, null]);
    });

    it("puts nothing on without room in the pack for what comes off", () => {
        const full = new Progress({ pack: fullPack(["boots"]) }, { weapon: "boots" });
        const before = full.toJSON();

        assert.equal(full.equip(full.slotOf("sword")), "full", "the boots have nowhere to go");
        assert.deepEqual(full.toJSON(), before);

        const gauntlets = new Progress({ pack: fullPack() }, { weapon: "gauntlets" });

        assert.equal(gauntlets.equip(gauntlets.slotOf("sword")), null, "the gauntlets go on a stack alike");
        assert.equal(gauntlets.count("gauntlets"), 3);
    });

    it("holds only so much, and keeps just what it should", () => {
        const progress = new Progress({ pack: [...fullPack(), { id: "wand", quality: "legendary", count: 1 }], gold: -5, skills: { blade: "x" } });

        assert.equal(progress.pack.length, PACK_SIZE);
        assert.ok(progress.pack.every(Boolean));
        assert.ok(progress.pack.every(({ quality }) => quality !== "legendary"), "no room for the legendary wand");
        assert.equal(progress.stow({ id: "ale", quality: "legendary" }), false);
        assert.equal(progress.stow({ id: "ale" }), true, "onto a stack alike, however full");
        assert.equal(progress.gold, 0);
        assert.equal(progress.skills.blade, 0);

        const kept = new Progress({ skills: { blade: 320 }, gold: 57, pack: [{ id: "potion", count: 2 }, { id: "nonsense", count: 1 }, null, { id: "ale", count: 1 }], gear: { weapon: { id: "hammer", quality: "fine" }, body: null, shield: null } });
        const back = new Progress(JSON.parse(JSON.stringify(kept)));

        assert.deepEqual(back.toJSON(), kept.toJSON());
        assert.deepEqual(kept.pack.slice(0, 4), [{ id: "potion", quality: "common", count: 2 }, null, null, { id: "ale", quality: "common", count: 1 }]);
    });

    it("finds on fallen foes what their kind carries", () => {
        const random = createRandom(9);
        const rolls = Array.from({ length: 400 }, () => rollLoot("orc", random));

        assert.ok(rolls.every(({ gold }) => gold >= LOOT.orc.gold[0] && gold <= LOOT.orc.gold[1]));
        assert.ok(rolls.some(({ items }) => items.some(({ id }) => id === "potion")));
        assert.ok(rolls.every(({ items }) => items.every(({ id, quality }) => ITEMS[id] && QUALITIES[quality])));
        assert.deepEqual(rollLoot("folk", random), { gold: 0, items: [] });
    });
});
