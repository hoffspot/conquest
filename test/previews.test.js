// What a thing is, looked at before it's carried (client/js/app/gearinfo.js describe, rolledOf;
// core/progress.js tryingOn): a shop's ware with what's rolled on it as it's bought said as what it
// could be, and what buying and putting it on would change; another's piece, as if it were carried
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describe as describeThing, REASONS, rolledOf } from "../client/js/app/gearinfo.js";
import { AFFIXES, affixesFor, blockMost, ROLLS } from "../client/js/core/gear.js";
import { BOOSTS, itemLabel, PACK_SIZE, Progress, SHOPS, wares } from "../client/js/core/progress.js";

// A ware as the pack's Buy tab shows it (app/game.js #showPack: the shop's preview)
const ware = (progress, item) => describeThing(item, progress, { label: itemLabel(item), ware: true });

describe("a shop's wares, looked at (gearinfo.js describe, rolledOf)", () => {
    it("says how much a wand or grimoire strengthens spells as it's rolled when bought, and leaves its spell power out of what it would change", () => {
        const progress = new Progress({}, { weapon: "sword" });
        const wand = ware(progress, { id: "wand", quality: "fine" });
        const [least, most] = [BOOSTS[0].band[0], BOOSTS.at(-1).band[1]].map((share) => Math.round(share * 100));

        assert.ok(wand.lines.some(({ text }) => text.startsWith(`+${least}–${most}% spell power, rolled as it's bought (most under +30%)`)), JSON.stringify(wand.lines));
        assert.ok(!wand.compare.some(({ text }) => /spell power/.test(text)), JSON.stringify(wand.compare));
        assert.equal(wand.compare[0].text, "Fights with a wand instead");
        assert.ok(wand.compare.some(({ text }) => text === "A wand's other hand takes only a spellward: the round shield comes off"), JSON.stringify(wand.compare));
    });

    it("says how much of a blow a shield takes as it's rolled when bought: half the most its make can, to all of it", () => {
        const progress = new Progress({}, { weapon: "sword" });

        for (const quality of ["common", "fine", "masterwork", "legendary"]) {
            const most = blockMost("kiteShield", quality);
            const { lines } = ware(progress, { id: "kiteShield", quality });

            assert.equal(lines[0].text, `Blocks ${Math.round(most * 50)}–${Math.round(most * 100)}% of a blow caught on it, rolled as it's bought (the more, the rarer)`);
        }
    });

    it("says which bonuses a piece comes with as it's bought (as many as its make has, any jewel one at least), and how much each could be, stronger the better made", () => {
        assert.equal(rolledOf({ id: "sword", quality: "common" }), null);
        assert.equal(rolledOf({ id: "potion" }), null);

        const fine = rolledOf({ id: "sword", quality: "fine" });
        const legendary = rolledOf({ id: "sword", quality: "legendary" });
        const ring = rolledOf({ id: "ring", quality: "common" });

        assert.equal(fine.count, ROLLS.fine.count);
        assert.equal(fine.title, "Comes with one of these bonuses, rolled as it's bought:");
        assert.deepEqual(fine.choices.map(({ name }) => name), affixesFor("sword").map((key) => AFFIXES[key].prefix ?? AFFIXES[key].suffix));
        assert.equal(fine.choices.find(({ name }) => name === "Keen").text, "+4–10% melee damage");
        assert.equal(legendary.title, "Comes with all 3 of these bonuses, rolled as it's bought, and a name of its own:");
        assert.equal(legendary.choices.find(({ name }) => name === "Keen").text, "+6–15% melee damage");
        assert.equal(legendary.choices.find(({ name }) => name === "of the Bear").text, "+8–23 hit points");
        assert.equal(ring.count, 1);
        assert.equal(ring.choices.length, affixesFor("ring").length);
        assert.equal(rolledOf({ id: "kiteShield", quality: "masterwork" }).title, "Comes with 2 of these bonuses, each different, rolled as it's bought:");
        assert.equal(rolledOf({ id: "kiteShield", quality: "masterwork" }).choices.find(({ name }) => name === "Sturdy").text, "Armour: takes 1–3% more off each blow");
    });

    it("says what buying and putting it on would change, before what's rolled on it; nothing in the pack or on the player changes", () => {
        const progress = new Progress({}, { weapon: "sword" });
        const kept = JSON.stringify(progress.toJSON());
        const helm = ware(progress, { id: "nasalHelm", quality: "fine" });
        const ring = ware(progress, { id: "ring", quality: "common" });
        const staff = ware(progress, { id: "staff", quality: "common" });

        assert.deepEqual(helm.compare.at(-1), { text: "Before what's rolled on it", tone: "note" });
        assert.ok(helm.compare.some(({ text, tone }) => /armour/.test(text) && tone === "better"), JSON.stringify(helm.compare));
        assert.deepEqual(ring.compare, [{ text: "No better or worse than what's worn, before what's rolled on it", tone: "note" }]);
        assert.deepEqual(staff.compare.map(({ text }) => text), ["Fights with a staff instead", "−6% armour", "Takes both hands: the round shield comes off"]);
        assert.equal(staff.rolls, null);
        assert.equal(JSON.stringify(progress.toJSON()), kept);
    });

    it("can say what every ware of every shop is, any people's, in words", () => {
        const progress = new Progress({}, { weapon: "wand" });

        for (const shop of Object.keys(SHOPS)) {
            for (const people of ["human", "orc", "elf"]) {
                for (const item of wares(shop, people)) {
                    const info = ware(progress, item);
                    const words = JSON.stringify(info);

                    assert.ok(!/NaN|undefined|null%/.test(words), `${shop} ${item.id} ${item.quality}: ${words}`);
                }
            }
        }
    });
});

describe("another's piece, looked at (gearinfo.js describe, progress.js tryingOn)", () => {
    it("says what it does as it was made, and what putting it on would change, as if it were carried", () => {
        const progress = new Progress({}, { weapon: "sword" });
        const theirs = { id: "nasalHelm", quality: "fine", affixes: ["bear"], bonuses: { hp: 9 } };
        const info = describeThing(theirs, progress, { label: itemLabel(theirs), outside: true });

        assert.equal(info.rolls, null);
        assert.ok(info.lines.some(({ text, tone }) => text === "+9 hit points" && tone === "bonus"));
        assert.ok(info.compare.some(({ text, tone }) => text === "+9 hit points" && tone === "better"), JSON.stringify(info.compare));
    });

    it("tries on a piece as the pack's own would be, in its first free slot; with none free, says there's no room for it", () => {
        const progress = new Progress({ pack: [{ id: "nasalHelm", quality: "fine" }] }, { weapon: "sword" });

        assert.deepEqual(progress.tryingOn({ id: "nasalHelm", quality: "fine" }), progress.trying(0));

        // (Every slot taken: stacks not alike, put there as they are)
        const full = new Progress({}, { weapon: "sword" });

        full.pack = Array.from({ length: PACK_SIZE }, (each, index) => ({ id: index % 2 ? "potion" : "meal", quality: "common", count: 1 }));
        assert.equal(full.tryingOn({ id: "nasalHelm", quality: "fine" }).reason, "room");
        assert.equal(REASONS.room, "There's no room in the pack for it.");
        assert.deepEqual(describeThing({ id: "nasalHelm", quality: "fine" }, full, { ware: true }).compare, [{ text: REASONS.room, tone: "note" }]);
    });
});
