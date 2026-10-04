// Growing stronger (client/js/core/progress.js): skills that grow by use, rank by rank up their
// trees, bringing bonuses and abilities; gear of better and worse make, bought, found, put on;
// gold; a pack; and from all of it, might
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UNIFORM } from "../client/js/core/gear.js";
import { ABILITIES, alike, ARMOR_CAP, buys, itemLabel, ITEMS, LOOT, PACK_PAGE, PACK_SIZE, priceOf, Progress, QUALITIES, RANKS, rollLoot, SELL_SHARE, SHOPS, shopOrder, startingGear, TREES, WARE_KINDS, wareKind, wares, weaponOf } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { SPELLS } from "../client/js/core/spells.js";
import { STARTING_WEAPONS, WEAPONS } from "../client/js/core/weapons.js";

// A pack full of stacks, two of each, no two alike (and none of the kinds `leaving`)
function fullPack(leaving = []) {
    const ids = Object.keys(ITEMS).filter((id) => !leaving.includes(id));

    return Array.from({ length: PACK_SIZE }, (_, k) => ({ id: ids[k % ids.length], quality: Object.keys(QUALITIES)[Math.floor(k / ids.length)], count: 2 }));
}

describe("growing stronger (progress.js)", () => {
    it("starts untried, with 20 gold, an empty pack of two pages, and the weapon the hero chose, in leather bracers, breeches and boots", () => {
        const progress = new Progress({}, { weapon: "bow" });
        const common = (id) => ({ id, quality: "common" });

        assert.ok(Object.keys(TREES).every((tree) => progress.rank(tree) === 0));
        assert.equal(progress.gold, 20);
        assert.deepEqual(progress.pack, Array(PACK_SIZE).fill(null));
        assert.equal(PACK_SIZE, 2 * PACK_PAGE);
        assert.deepEqual(progress.gear, { head: null, amulet: null, cloak: null, chest: null, bracers: common("bracers"), gloves: null, belt: null, legs: common("breeches"), boots: common("leatherBoots"), ring1: null, ring2: null, mainHand: common("bow"), offHand: null });
        assert.deepEqual(progress.gear, startingGear({ weapon: "bow" }));
        assert.deepEqual(progress.worn(), [{ id: "bracers" }, { id: "breeches" }, { id: "leatherBoots" }]);
        assert.equal(weaponOf(progress), "bow");
        assert.equal(progress.kicks(), false);

        // (In spiked boots: kicking too; in them alone, nothing in hand)
        assert.equal(new Progress({}, { weapon: "sword", boots: true }).gear.boots.id, "boots");
        assert.equal(new Progress({}, { weapon: "sword", boots: true }).kicks(), true);
        assert.equal(new Progress({}, { weapon: "boots" }).gear.mainHand, null);
        assert.equal(weaponOf(new Progress({}, { weapon: "boots" })), "boots");
        assert.equal(progress.might(), 0);
        assert.deepEqual(progress.abilities(), []);
    });

    it("slips one blow or shot in twenty from the start (Evasion), more as it grows, one in four at its height", () => {
        const progress = new Progress();

        assert.equal(progress.bonuses().dodge, 0.05);
        assert.ok(TREES.evasion.bonus.dodge.every((share, rank, all) => rank === 0 || share > all[rank - 1]));
        progress.gain("evasion", RANKS.at(-1).xp);
        assert.equal(progress.bonuses().dodge, 0.25);
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
        const progress = new Progress({ skills: { blade: 300, hexes: 300, endurance: 2000, trade: 100 }, gear: { mainHand: { id: "sword" } } });
        const bonus = progress.bonuses();

        assert.ok(Math.abs(bonus.melee - 0.2) < 1e-9);
        assert.equal(bonus.ranged, 0);
        assert.ok(Math.abs(bonus.stun - 0.3) < 1e-9);
        assert.equal(bonus.hp, 30);
        assert.equal(bonus.stamina, 30);
        assert.ok(Math.abs(bonus.armor - 0.08) < 1e-9);
        assert.ok(Math.abs(bonus.haggle - 0.05) < 1e-9);
        assert.deepEqual(progress.abilities().sort(), ["hold", "powerStrike"]);

        for (const [id, ability] of Object.entries(ABILITIES)) {
            assert.ok(TREES[ability.tree].abilities[2] === id);
            assert.ok(ability.spell ? SPELLS[ability.spell] : ability.factor > 1, id);
        }
    });

    it("counts the make of a weapon in its blows, and everything worn: its armour, its bonuses and its sets', to a point", () => {
        const plain = new Progress({ gear: { mainHand: { id: "sword" } } }).bonuses();
        const armed = new Progress({ gear: { mainHand: { id: "sword", quality: "masterwork" }, chest: { id: "mail", quality: "fine" }, offHand: { id: "kiteShield", quality: "common" }, belt: { id: "belt" }, ring1: { id: "ring", bonuses: { hp: 8 }, affixes: ["bear"] } } }).bonuses();

        assert.equal(plain.melee, 0);
        assert.equal(plain.armor, 0);
        assert.ok(Math.abs(armed.melee - 0.3) < 1e-9);
        assert.ok(Math.abs(armed.armor - (0.14 * 1.15 + 0.1 + 0.005)) < 1e-9);
        assert.equal(armed.stamina, 5, "(the belt's own)");
        assert.equal(armed.hp, 8, "(the ring's)");

        // A people's uniform worn together: three pieces, then six
        const uniform = (count) => Object.fromEntries([["head", "helm"], ["chest", "hauberk"], ["cloak", "cloak"], ["bracers", "vambraces"], ["gloves", "warGloves"], ["legs", "legguards"]].slice(0, count).map(([slot, id]) => [slot, { id, people: "orc" }]));
        const melee = (count) => new Progress({ gear: { mainHand: { id: "sword" }, ...uniform(count) } }).bonuses();

        assert.equal(melee(2).melee, 0);
        assert.ok(Math.abs(melee(3).melee - 0.08) < 1e-9);
        assert.equal(melee(6).hp, 25);

        const piled = new Progress({ skills: { endurance: 99999 }, gear: { mainHand: { id: "sword", quality: "legendary" }, chest: { id: "plate", quality: "legendary" }, offHand: { id: "kiteShield", quality: "legendary" }, head: { id: "nasalHelm", quality: "legendary" }, legs: { id: "greaves", quality: "legendary" } } });

        // (The best there is, and the most enduring: never more than the cap)
        assert.equal(piled.bonuses().armor, ARMOR_CAP);
    });

    it("is as mighty as its best fighting skill (or its command of others) and its gear, up to 8", () => {
        assert.equal(new Progress({ skills: { blade: 300 } }).might(), 2);
        assert.equal(new Progress({ skills: { healing: 99999, trade: 99999, talk: 99999, endurance: 99999 } }).might(), 0, "(healing and trade aren't might)");
        assert.equal(new Progress({ skills: { healing: 99999, command: 2000 } }).might(), 4, "(but leading others is)");
        assert.equal(new Progress({ skills: { marksman: 800 }, gear: { mainHand: { id: "bow", quality: "masterwork" }, chest: { id: "mail", quality: "common" } } }).might(), 4);
        assert.equal(new Progress({ skills: { marksman: 800 }, gear: { mainHand: { id: "bow", quality: "masterwork" }, chest: { id: "plate", quality: "common" }, head: { id: "nasalHelm" }, ring1: { id: "ring", bonuses: { ranged: 0.05 }, affixes: ["trueShot"] } } }).might(), 5);
        assert.equal(new Progress({ skills: { blade: 99999 }, gear: { mainHand: { id: "sword", quality: "legendary" }, chest: { id: "mail", quality: "legendary" }, offHand: { id: "kiteShield", quality: "legendary" } } }).might(), 8);
    });

    it("prices things by their make, with haggling off what's bought and on what's sold", () => {
        assert.equal(priceOf({ id: "sword" }), 30);
        assert.equal(priceOf({ id: "sword", quality: "fine" }), 90);
        assert.equal(priceOf({ id: "sword", quality: "fine" }, { haggle: 0.1 }), 81);
        assert.equal(priceOf({ id: "sword" }, { selling: true }), Math.round(30 * SELL_SHARE));
        assert.equal(priceOf({ id: "sword" }, { selling: true, haggle: 0.25 }), Math.round(30 * SELL_SHARE * 1.25));
        assert.equal(priceOf({ id: "ale" }, { selling: true }), 1);
        assert.equal(itemLabel({ id: "mail", quality: "masterwork" }), "Masterwork mail shirt");
        assert.equal(itemLabel({ id: "mail", quality: "masterwork", bonuses: { armor: 0.02, hp: 9 }, affixes: ["sturdy", "bear"] }), "Sturdy mail shirt of the Bear");
        assert.equal(itemLabel({ id: "helm", quality: "fine", people: "orc", bonuses: { hp: 9 }, affixes: ["bear"] }), "Orcish helm of the Bear");
        assert.equal(itemLabel({ id: "ring", quality: "legendary", bonuses: { hp: 9 }, affixes: ["bear"], name: "Emberheart" }), "Emberheart");
        assert.equal(itemLabel({ id: "potion" }), "Healing draught");
    });

    it("shows a shop's wares by kind, the commoner made first, then by name; and only the guild buys spoils and tomes", () => {
        const kinds = Object.keys(WARE_KINDS);
        const makes = Object.keys(QUALITIES);

        for (const shop of Object.keys(SHOPS)) {
            const shown = wares(shop).sort(shopOrder);

            for (let k = 1; k < shown.length; k++) {
                const [a, b] = [shown[k - 1], shown[k]];
                const [ka, kb] = [kinds.indexOf(wareKind(a.id)), kinds.indexOf(wareKind(b.id))];

                assert.ok(ka < kb || (ka === kb && (makes.indexOf(a.quality) < makes.indexOf(b.quality) || (a.quality === b.quality && ITEMS[a.id].label <= ITEMS[b.id].label))), `${shop}: ${a.id} ${a.quality} before ${b.id} ${b.quality}`);
            }
        }

        // (The guild's: its wands and grimoires, its hats, its jewellery, its draughts and cures,
        // its tomes; the common of each kind before the fine)
        assert.deepEqual(
            [...new Set(wares("guild").sort(shopOrder).map(({ id }) => WARE_KINDS[wareKind(id)]))],
            ["Weapons", "Clothes and armour", "Jewellery", "Food, drink and draughts", "Tomes"],
        );
        assert.deepEqual(
            wares("guild").sort(shopOrder).filter(({ id }) => wareKind(id) === "weapon").map(({ id, quality }) => `${quality} ${id}`),
            ["common grimoire", "common wand", "fine grimoire", "fine wand"],
        );
        assert.ok(wares("smith").sort(shopOrder).some(({ id }) => wareKind(id) === "offHand"));
        assert.deepEqual(
            wares("guild").sort(shopOrder).filter(({ id }) => wareKind(id) === "jewel").map(({ id, quality }) => `${quality} ${id}`),
            ["common amulet", "common ring", "fine amulet", "fine ring"],
        );

        assert.ok(buys("guild", "wolfPelt") && buys("guild", "tomeBurn") && buys("guild", "sword"));
        assert.ok(!buys("smith", "wolfPelt") && !buys("tavern", "tomeBurn"));
        assert.ok(buys("smith", "sword") && buys("tavern", "ale") && buys("temple", "potion"));
    });

    it("stocks each shop with what it keeps, better made as far as it goes; a smith, its own people's uniform", () => {
        const smith = wares("smith");

        assert.ok(smith.some(({ id, quality }) => id === "mail" && quality === "masterwork"));
        assert.ok(smith.some(({ id, people }) => id === "helm" && people === "human"));
        assert.ok(wares("smith", "lizard").some(({ id, people }) => id === "cloak" && people === "lizard"));
        assert.ok(wares("guild").some(({ id }) => id === "ring"));
        assert.ok(!smith.some(({ quality }) => quality === "legendary"));
        assert.deepEqual(wares("tavern"), [{ id: "ale", quality: "common" }, { id: "meal", quality: "common" }]);
        assert.deepEqual(wares("nowhere"), []);

        for (const [shop, { items }] of Object.entries(SHOPS)) {
            assert.ok(items.every((id) => ITEMS[id]), shop);
        }

        // (Every weapon a hero can start with can be bought, somewhere)
        for (const weapon of STARTING_WEAPONS) {
            assert.ok(Object.values(SHOPS).some(({ items }) => items.includes(weapon)), weapon);
            assert.equal(ITEMS[weapon].slot, weapon === "boots" ? "boots" : "mainHand");
            assert.ok(WEAPONS[weapon]);
        }
    });

    it("puts gear on from the pack, in its slot, what it replaces back where it was; the other hand as the weapon leaves it", () => {
        const progress = new Progress({ pack: [{ id: "kiteShield", count: 1 }, { id: "mail", quality: "fine", count: 1 }, { id: "bow", count: 1 }, { id: "potion", count: 1 }, { id: "quiver", count: 1 }, { id: "sabatons", count: 1 }] }, { weapon: "sword" });

        assert.equal(progress.equip(3), "item");
        assert.equal(progress.equip(7), "item", "an empty slot");
        assert.equal(progress.equip(4), "quiver", "a quiver only with a bow");
        assert.equal(progress.equip(0), null);
        assert.equal(progress.gear.offHand.id, "kiteShield");
        assert.equal(progress.pack[0], null);
        assert.equal(progress.equip(1), null);
        assert.deepEqual(progress.gear.chest, { id: "mail", quality: "fine" });
        assert.deepEqual(progress.worn().map(({ id }) => id), ["chest", "bracers", "legs", "boots", "offHand"].map((slot) => progress.gear[slot].id));

        // (What comes off goes where what went on was)
        assert.equal(progress.equip(5), null);
        assert.deepEqual(progress.pack[5], { id: "leatherBoots", quality: "common", count: 1 });

        // A bow, two-handed: the sword back in the pack, and the shield too; its other hand takes a quiver, and nothing else
        assert.equal(progress.equip(progress.slotOf("bow")), null);
        assert.equal(progress.gear.mainHand.id, "bow");
        assert.equal(progress.gear.offHand, null);
        assert.equal(progress.count("sword"), 1);
        assert.equal(progress.count("kiteShield"), 1);
        assert.equal(progress.equip(progress.slotOf("kiteShield")), "bow");
        assert.equal(progress.equip(progress.slotOf("quiver")), null);

        // A hammer, two-handed: the quiver comes off; nothing in the other hand
        progress.stow({ id: "hammer" });
        assert.equal(progress.equip(progress.slotOf("hammer")), null);
        assert.equal(progress.gear.offHand, null);
        assert.equal(progress.count("quiver"), 1);
        assert.equal(progress.equip(progress.slotOf("kiteShield")), "twoHanded");

        assert.equal(progress.unequip("chest"), null);
        assert.equal(progress.gear.chest, null);
        assert.equal(progress.unequip("chest"), "item");
        assert.equal(progress.unequip("mainHand"), "unarmed", "nothing to fight with");
        assert.equal(progress.unequip("nowhere"), "item");
    });

    it("puts a ring on either hand, and takes things off into the pack where asked", () => {
        const progress = new Progress({ pack: [{ id: "ring", bonuses: { hp: 5 }, affixes: ["bear"], count: 1 }, { id: "ring", bonuses: { melee: 0.05 }, affixes: ["keen"], count: 1 }, { id: "ring", bonuses: { stun: 0.1 }, affixes: ["binding"], count: 1 }, { id: "cap", count: 1 }] }, { weapon: "sword" });

        assert.equal(progress.equip(0), null);
        assert.equal(progress.gear.ring1.bonuses.hp, 5);
        assert.equal(progress.equip(1), null);
        assert.equal(progress.gear.ring2.bonuses.melee, 0.05);
        assert.equal(progress.equip(2, "ring1"), null);
        assert.equal(progress.gear.ring1.bonuses.stun, 0.1);
        assert.equal(progress.pack[2].bonuses.hp, 5, "(the ring taken off, where the one put on was)");
        assert.equal(progress.equip(3, "ring2"), "slot", "a cap isn't a ring");

        assert.equal(progress.unequip("ring2", 9), null);
        assert.equal(progress.pack[9].bonuses.melee, 0.05);
        assert.equal(progress.unequip("ring1", 9), "full", "something else there");
        assert.equal(progress.unequip("ring1", PACK_SIZE), "item");
    });

    it("fights in spiked boots alone: the weapon off only with them on, and they only off with a weapon in hand", () => {
        const progress = new Progress({ pack: [{ id: "leatherBoots", count: 1 }] }, { weapon: "sword", boots: true });

        assert.equal(progress.unequip("mainHand"), null);
        assert.equal(weaponOf(progress), "boots");
        assert.equal(progress.unequip("boots"), "unarmed");
        assert.equal(progress.equip(0), "unarmed", "(ordinary boots on: nothing to fight with)");
        assert.equal(progress.equip(progress.slotOf("sword")), null);
        assert.equal(progress.equip(progress.slotOf("leatherBoots")), null);
        assert.equal(progress.kicks(), false);
    });

    it("reads gear kept before there was a slot for everything: the weapon, body and shield in theirs, what a new character starts with on, and what can't be worn in the pack", () => {
        const progress = new Progress({ gear: { weapon: { id: "hammer", quality: "fine" }, body: { id: "mail", quality: "fine" }, shield: { id: "kiteShield", quality: "common" } } }, { weapon: "hammer" });

        assert.deepEqual(progress.gear.mainHand, { id: "hammer", quality: "fine" });
        assert.deepEqual(progress.gear.chest, { id: "mail", quality: "fine" });
        assert.equal(progress.gear.offHand, null, "the hammer takes both hands");
        assert.equal(progress.count("kiteShield"), 1);
        assert.equal(progress.gear.boots.id, "leatherBoots");

        const kicking = new Progress({ gear: { weapon: { id: "boots" }, body: null, shield: null } }, { weapon: "boots" });

        assert.equal(kicking.gear.mainHand, null);
        assert.equal(kicking.gear.boots.id, "boots");
        assert.equal(new Progress({ gear: { weapon: { id: "sword" }, body: null, shield: null } }, { weapon: "sword", boots: true }).kicks(), true);

        // (Something in the wrong slot, or nothing to fight with: put right)
        const muddled = new Progress({ gear: { head: { id: "mail" }, mainHand: null, boots: { id: "leatherBoots" } } }, { weapon: "staff" });

        assert.equal(muddled.gear.head, null);
        assert.equal(muddled.gear.mainHand.id, "staff");
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
        const full = new Progress({ pack: fullPack(["leatherBoots"]) }, { weapon: "sword" });
        const before = full.toJSON();

        assert.equal(full.equip(full.slotOf("sabatons")), "full", "the leather boots have nowhere to go");
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
        assert.equal(progress.stow({ id: "sword" }), true, "onto a stack alike, however full");
        assert.equal(progress.gold, 0);
        assert.equal(progress.skills.blade, 0);

        const kept = new Progress({ skills: { blade: 320 }, gold: 57, pack: [{ id: "potion", count: 2 }, { id: "nonsense", count: 1 }, null, { id: "ale", count: 1 }], gear: { mainHand: { id: "hammer", quality: "fine" }, head: { id: "helm", quality: "legendary", people: "elf", bonuses: { hp: 12, spell: 0.1, bad: 3 }, affixes: ["bear", "arcane"], name: "Starward" }, ring1: { id: "ring", bonuses: { stun: 0.1 }, affixes: ["binding"] } } });
        const back = new Progress(JSON.parse(JSON.stringify(kept)));

        assert.deepEqual(back.toJSON(), kept.toJSON());
        assert.deepEqual(kept.pack.slice(0, 4), [{ id: "potion", quality: "common", count: 2 }, null, null, { id: "ale", quality: "common", count: 1 }]);
        assert.deepEqual(kept.gear.head, { id: "helm", quality: "legendary", people: "elf", bonuses: { hp: 12, spell: 0.1 }, affixes: ["bear", "arcane"], name: "Starward" });
    });

    it("finds on fallen foes what their kind carries", () => {
        const random = createRandom(9);
        const rolls = Array.from({ length: 400 }, () => rollLoot("orc", random));

        assert.ok(rolls.every(({ gold }) => gold >= LOOT.orc.gold[0] && gold <= LOOT.orc.gold[1]));
        assert.ok(rolls.some(({ items }) => items.some(({ id }) => id === "potion")));
        assert.ok(rolls.every(({ items }) => items.every(({ id, quality }) => ITEMS[id] && QUALITIES[quality])));
        assert.deepEqual(rollLoot("folk", random), { gold: 0, items: [] });

        // A soldier's: pieces of their people's uniform, as well made as they happen to be
        const found = Array.from({ length: 400 }, () => rollLoot("soldier", random, { people: "cat" })).flatMap(({ items }) => items).filter(({ id }) => UNIFORM.includes(id));

        assert.ok(found.length > 20);
        assert.ok(found.every(({ people }) => people === "cat"));
        assert.ok(found.some(({ quality }) => quality === "fine") && found.some(({ quality }) => quality === "common"));
        assert.ok(found.filter(({ quality }) => quality !== "common").every(({ bonuses }) => Object.keys(bonuses ?? {}).length >= 1));
    });
});
