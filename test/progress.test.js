// Growing stronger (client/js/core/progress.js): skills that grow by use, rank by rank up their
// trees, bringing bonuses and abilities; gear of better and worse make, bought, found, put on;
// gold; a pack; and from all of it, might
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ABILITIES, itemLabel, ITEMS, LOOT, PACK_SIZE, priceOf, Progress, QUALITIES, RANKS, rollLoot, SELL_SHARE, SHOPS, TREES, wares, weaponOf } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { SPELLS } from "../client/js/core/spells.js";
import { STARTING_WEAPONS, WEAPONS } from "../client/js/core/weapons.js";

describe("growing stronger (progress.js)", () => {
    it("starts untried, with 20 gold, an empty pack, and the weapon the hero chose", () => {
        const progress = new Progress({}, { weapon: "bow" });

        assert.ok(Object.keys(TREES).every((tree) => progress.rank(tree) === 0));
        assert.equal(progress.gold, 20);
        assert.deepEqual(progress.pack, []);
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
        const progress = new Progress({ pack: [{ id: "kiteShield" }, { id: "mail", quality: "fine" }, { id: "bow" }, { id: "potion" }] }, { weapon: "sword" });

        assert.equal(progress.equip(3), "item");
        assert.equal(progress.equip(0), null);
        assert.equal(progress.gear.shield.id, "kiteShield");
        assert.equal(progress.equip(0), null);
        assert.deepEqual(progress.gear.body, { id: "mail", quality: "fine" });
        assert.deepEqual(progress.worn(), ["mail", "kiteShield"]);

        // A bow: the sword back in the pack, and the shield too
        assert.equal(progress.equip(progress.pack.findIndex(({ id }) => id === "bow")), null);
        assert.equal(progress.gear.weapon.id, "bow");
        assert.equal(progress.gear.shield, null);
        assert.ok(progress.pack.some(({ id }) => id === "sword") && progress.pack.some(({ id }) => id === "kiteShield"));
        assert.equal(progress.equip(progress.pack.findIndex(({ id }) => id === "kiteShield")), "shield");

        assert.equal(progress.unequip("body"), null);
        assert.equal(progress.gear.body, null);
        assert.equal(progress.unequip("body"), "item");
        assert.equal(progress.unequip("weapon"), "item");
    });

    it("holds only so much, and keeps just what it should", () => {
        const progress = new Progress({ pack: Array.from({ length: 30 }, () => ({ id: "potion" })), gold: -5, skills: { blade: "x" } });

        assert.equal(progress.pack.length, PACK_SIZE);
        assert.equal(progress.stow({ id: "ale" }), false);
        assert.equal(progress.gold, 0);
        assert.equal(progress.skills.blade, 0);

        const kept = new Progress({ skills: { blade: 320 }, gold: 57, pack: [{ id: "potion" }, { id: "nonsense" }], gear: { weapon: { id: "hammer", quality: "fine" }, body: null, shield: null } });
        const back = new Progress(JSON.parse(JSON.stringify(kept)));

        assert.deepEqual(back.toJSON(), kept.toJSON());
        assert.deepEqual(kept.pack, [{ id: "potion", quality: "common" }]);
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
