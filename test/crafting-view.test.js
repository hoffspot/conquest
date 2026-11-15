// Crafting, stage 5 (docs/CRAFTING.md *The five stages*): what the player sees, as the pack shows
// it (app/craftinfo.js, pure): a crafter's list by piece, what the pack's short of marked, never
// hidden; a piece's slots and their choices from what's carried; the piece shown before it's made
// as the host makes it; an ingredient's card (its make's colour, its power three ways, what it goes
// into, where it comes from, the creature named once it's met); what breaking down gives back; the
// bestiary's parts in their makes' colours with what each is for (app/bestiary.js); the words for a
// power's range (app/gearinfo.js); an ingredient's make as its grade (core/progress.js gradeOf).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pageOf } from "../client/js/app/bestiary.js";
import { CRAFT_GROUPS, CRAFTER_WORDS, craftList, ingredientInfo, KIND_WORDS, previewInfo, salvageInfo, slotsOf, sourcesWords, takesWords, thingsSaid, usingFirst, yieldsSaid } from "../client/js/app/craftinfo.js";
import { aboutOf, HOST_EVENTS } from "../client/js/app/game.js";
import { MAKES, rangeWorded, usedFor } from "../client/js/app/gearinfo.js";
import { MASTERED, RESEARCH } from "../client/js/core/bestiary.js";
import { previewOf, recipesAt, salvageOf, sourcesOf } from "../client/js/core/crafting.js";
import { CREATURES } from "../client/js/core/creatures.js";
import { GEAR, STATS } from "../client/js/core/gear.js";
import { FAMILIES, INGREDIENTS } from "../client/js/core/materials.js";
import { gradeOf, itemLabel, ITEMS } from "../client/js/core/progress.js";
import { CRAFTERS, RECIPES } from "../client/js/core/recipes.js";
import { SPOILS } from "../client/js/core/spoils.js";

const stack = (id, count = 1, more = {}) => ({ id, quality: "common", count, ...more });
const PACK = Object.freeze([stack("steelIngot", 2), null, stack("tannedLeather", 2), stack("hardenedLeather"), stack("demonHorn"), stack("ironIngot", 3)]);

describe("a crafter's list, by piece (app/craftinfo.js craftList)", () => {
    it("lists everything each crafter makes, every piece and main material once, under where it goes, the commoner first; in a capital, to the legendary", () => {
        for (const shop of Object.keys(CRAFTERS)) {
            for (const capital of [false, true]) {
                const list = craftList(shop, PACK, { capital });
                const rows = list.flatMap(({ pieces }) => pieces.flatMap(({ base, mains }) => mains.map(({ main, make }) => ({ base, main, make }))));
                const key = ({ base, main }) => `${base}|${main}`;

                assert.deepEqual(rows.map(key).sort(), recipesAt(shop, { capital }).map(key).sort(), `${shop} ${capital}`);
                assert.deepEqual(
                    list.map(({ heading }) => heading),
                    CRAFT_GROUPS.map(({ heading }) => heading).filter((heading) => list.some((group) => group.heading === heading)),
                    "(in the groups' order)",
                );

                for (const { heading, pieces } of list) {
                    const { slots } = CRAFT_GROUPS.find((group) => group.heading === heading);

                    assert.ok(pieces.every(({ base }) => slots.includes(GEAR[base].slot)), `${shop}: ${heading}`);
                }
            }
        }

        assert.equal(craftList("tavern", PACK).length, 0, "(a shop that crafts nothing, nothing)");
    });

    it("marks what the pack's short of, never hides it: the main material, so many of it, and a second of its kind; the essence never", () => {
        const pieces = new Map(craftList("smith", PACK).flatMap(({ pieces: some }) => some.map((piece) => [piece.base, piece])));
        const main = (base, id) => pieces.get(base).mains.find((each) => each.main === id);

        assert.equal(pieces.get("sword").label, "Sword");
        assert.equal(pieces.get("sword").takes, "A metal, a leather, and an essence if you like");
        assert.deepEqual(main("sword", "steelIngot"), { main: "steelIngot", make: "fine", label: "Steel ingot", word: "Steel", lacking: [], can: true });
        assert.deepEqual(main("sword", "goldIngot").lacking, [{ id: "goldIngot", need: 1, have: 0, text: "Gold ingot (0 of 1)" }]);
        assert.deepEqual(main("plate", "steelIngot").lacking.map(({ text }) => text), ["Steel ingot (2 of 3)"]);
        assert.deepEqual(main("roundShield", "oakWood").lacking.map(({ text }) => text), ["Oak wood (0 of 2)"], "(its second, a metal, carried)");
        assert.deepEqual(main("axe", "ironIngot").lacking, [{ kind: "wood", need: 1, have: 0, text: "a wood" }], "(no wood for its haft)");
        assert.equal(main("towerShield", "steelIngot").can, false);
        assert.ok(craftList("smith", []).every(({ pieces: some }) => some.every(({ mains }) => mains.every(({ can }) => !can))), "(an empty pack: everything there, all greyed)");
        assert.equal(takesWords("plate"), "3 of a metal, a leather, and an essence if you like");
    });
});

describe("a piece's slots and what goes in them first (app/craftinfo.js slotsOf, usingFirst)", () => {
    it("fills a piece first with the commonest second carried that keeps it as fine as its main material, else the finest; no essence", () => {
        assert.deepEqual(usingFirst(PACK, "sword", "steelIngot"), ["steelIngot", "tannedLeather", null], "(tanned leather keeps a steel sword fine)");
        assert.deepEqual(usingFirst([stack("adamantiteIngot"), stack("tannedLeather"), stack("hardenedLeather"), stack("wyvernScale")], "sword", "adamantiteIngot"), ["adamantiteIngot", "wyvernScale", null]);
        assert.deepEqual(usingFirst([stack("adamantiteIngot"), stack("tannedLeather"), stack("hardenedLeather")], "sword", "adamantiteIngot"), ["adamantiteIngot", "hardenedLeather", null], "(none that keeps it very rare: the finest)");
        assert.deepEqual(usingFirst([stack("ironIngot", 2)], "axe", "ironIngot"), ["ironIngot", null, null], "(no wood: none)");
        assert.deepEqual(usingFirst([stack("ironIngot", 2), stack("oakWood", 1)], "towerShield", "ironIngot"), ["ironIngot", "oakWood", null]);
    });

    it("gives each slot its choices from what's carried, of its kind, the commonest first, and what's chosen though it isn't; a main material finer than is worked, not to be had", () => {
        const pack = [...PACK, stack("orichalcumIngot")];
        const [main, second, essence] = slotsOf(pack, "smith", "sword", ["goldIngot", "tannedLeather", null]);

        assert.deepEqual(
            main.choices.map(({ id, have, enough, worked }) => [id, have, enough, worked]),
            [
                ["ironIngot", 3, true, true],
                ["steelIngot", 2, true, true],
                ["goldIngot", 0, false, true],
                ["orichalcumIngot", 1, true, false],
            ],
        );
        assert.equal(main.chosen, "goldIngot");
        assert.deepEqual([main.heading, second.heading, essence.heading], ["Main material", "Second", "Essence"]);
        assert.deepEqual(second.choices.map(({ id }) => id), ["tannedLeather", "hardenedLeather"]);
        assert.deepEqual(essence.choices.map(({ id, make }) => [id, make]), [["demonHorn", "veryRare"]]);
        assert.equal(essence.optional, true);
        assert.ok(slotsOf(pack, "smith", "sword", ["orichalcumIngot", null, null], { capital: true })[0].choices.every(({ worked }) => worked), "(in a capital, the legendary worked)");
    });
});

describe("a piece shown before it's made (app/craftinfo.js previewInfo)", () => {
    it("says its name, its make, its level, its blows and each power's range as the host would roll it, and which ingredient brings it", () => {
        const using = ["steelIngot", "tannedLeather", "demonHorn"];
        const shown = previewOf("smith", "sword", using, { level: 40 });
        const info = previewInfo(shown, "sword");
        const percent = (value) => Math.round(value * 100);

        assert.deepEqual([info.label, info.rarity, info.kind], ["Steel Demon Sword", "fine", "One-handed weapon"]);
        assert.equal(info.lines[0].text, `Level ${shown.level}, your might's`);
        assert.match(info.lines[1].text, /^Up close: \d+–\d+ damage$/);

        const [melee, hp, fire] = shown.powers;

        assert.deepEqual(
            info.lines.filter(({ tone }) => tone === "bonus").map(({ text }) => text),
            [
                `+${percent(melee.range[0])}–${percent(melee.range[1])}% melee damage (Steel ingot)`,
                `+${hp.range[0]}–${hp.range[1]} hit points (Tanned leather)`,
                `+${percent(fire.range[0])}–${percent(fire.range[1])}% of each blow's harm again as fire, setting the foe struck burning as often (Demon's horn)`,
            ],
        );
    });

    it("says a legendary weapon's effect, a shield's block and a wand's spell power, each rolled as it's made; two ingredients' powers together", () => {
        const legend = previewOf("masterSwordsmith", "sword", ["orichalcumIngot", "dragonScale", "demonHorn"], { level: 60 });

        assert.ok(previewInfo(legend, "sword").lines.some(({ text, tone }) => tone === "effect" && text.startsWith("Cinderburst:")));

        const shield = previewInfo(previewOf("smith", "kiteShield", ["steelIngot", "tannedLeather", null], { level: 10 }), "kiteShield");

        assert.ok(shield.lines.some(({ text }) => /^Blocks \d+–\d+% of a blow caught on it, rolled as it's made$/.test(text)));
        assert.ok(shield.lines.some(({ text }) => text.startsWith("Armour: takes")));

        const wand = previewInfo(previewOf("scriptorium", "wand", ["birchWood", "quartz", null]), "wand");

        assert.ok(wand.lines.some(({ text }) => /spell power, rolled as it's made/.test(text)));
        assert.ok(wand.lines.some(({ text }) => text.endsWith("(Birch wood and Quartz)")), "(two that add to the same thing, together)");
    });
});

describe("an ingredient's card (app/craftinfo.js ingredientInfo, sourcesWords)", () => {
    it("is had of every ingredient: what it is, its make, its power in a weapon, a wand and worn, what it goes into, where it's from; nothing missing", () => {
        for (const [id, { kind, make, about }] of Object.entries(INGREDIENTS)) {
            const info = ingredientInfo(id, { level: 30 });
            const words = info.lines.map(({ text }) => text).join(" ");

            assert.equal(info.rarity, make, id);
            assert.equal(info.rarity, gradeOf({ id }), `${id}: as progress.js gradeOf colours it`);
            assert.equal(info.made, make === "common" ? null : MAKES[make]);
            assert.equal(info.kind, `Ingredient: ${KIND_WORDS[kind].one}`);
            assert.equal(info.label, itemLabel({ id }));
            assert.equal(info.lines[0].text, about);
            assert.deepEqual(info.lines.slice(1, 4).map(({ text }) => text.split(":")[0]), ["In a weapon", "In a wand or grimoire", "Worn"], id);
            assert.ok(!/undefined|NaN|null|\[object/.test(words), `${id}: ${words}`);
            assert.ok(info.lines.some(({ tone }) => tone === "set") || words.includes("Not to be had anywhere yet."), id);
        }
    });

    it("tells its power as strong as it comes at the player's level, the finer the stronger", () => {
        const at = (id, level) => ingredientInfo(id, { level }).lines[1].text;

        assert.equal(at("demonHorn", 1), "In a weapon: +6–14% fire on each blow");
        assert.equal(at("ratTail", 1), "In a weapon: +3–7% gold found");
        assert.equal(ingredientInfo("demonHorn", { level: 1 }).lines[3].text, "Worn: −4–10% fire's harm");
        assert.notEqual(at("demonHorn", 100), at("demonHorn", 1));
    });

    it("says what it goes into: a material the pieces it's the main material or second of, an essence anything", () => {
        const lines = (id) => ingredientInfo(id).lines.map(({ text }) => text);

        assert.ok(lines("ironIngot").includes("The main material of sword, war hammer, greatsword, battle axe, mace, spiked gauntlets and 14 more: it sets how well made the piece is."));
        assert.ok(lines("ironIngot").includes("The second of round shield, leather bracers, belt, war belt, war boots, spiked boots and 2 more."));
        assert.ok(lines("ratTail").includes("Goes into anything made, as its essence, if you like: it names the piece, and never makes it worse."));
    });

    it("says where it's from: the crafters that sell it, the creatures that leave it by name once they're in the bestiary and where they're met till then, and broken-down gear", () => {
        const said = (id, known = () => false) => sourcesWords(id, { known }).map(({ text }) => text);

        assert.deepEqual(said("steelIngot"), ["Sold by blacksmiths, swordsmiths, armorers, the Master Swordsmiths and the Master Armorers.", "Given back by gear broken down at a crafter's."]);
        assert.deepEqual(said("wolfPelt"), ["Left by something in the woods, the tundra, the heaths, the elves' woods, the meadows, the snows and the dark woods."]);
        assert.deepEqual(said("wolfPelt", (kind) => kind === "wolf"), ["Left by Wolf."]);
        assert.deepEqual(said("mythrilIngot"), ["Left by something in the mountains, the snows and the tundra.", "Given back by gear broken down at a crafter's."], "(the mythril golem, where it's met)");
        assert.equal(said("obsidian").at(-1), "And by more you've yet to meet.");
        assert.ok(said("obsidian", () => true)[0].startsWith("Left by Magma slime, "));
        assert.deepEqual(Object.keys(CRAFTER_WORDS).sort(), Object.keys(CRAFTERS).sort());

        // (Every creature that leaves something said, met or not)
        for (const id of Object.keys(INGREDIENTS)) {
            for (const kind of sourcesOf(id).dropped) {
                assert.ok(CREATURES[kind], `${id}: ${kind}`);
            }
        }
    });

    it("says what the guild pays for a creature's part, and what a crafter's material is, where the pack tells what a thing is (game.js aboutOf)", () => {
        assert.ok(ingredientInfo("wolfPelt").lines.some(({ text }) => text === "The adventurers' guild pays 7 gold for it."));
        assert.ok(!ingredientInfo("steelIngot").lines.some(({ text }) => text.includes("guild pays")));
        assert.equal(aboutOf({ id: "steelIngot" }), INGREDIENTS.steelIngot.about);
        assert.equal(aboutOf({ id: "wolfPelt" }), `${INGREDIENTS.wolfPelt.about} The adventurers' guild pays 7 gold for it.`);
        assert.equal(aboutOf({ id: "boarMeat" }), "Heals 15 hit points. The adventurers' guild pays 3 gold for it.", "(what's eaten, no ingredient)");
    });
});

describe("what breaking down gives back, in words (app/craftinfo.js salvageInfo)", () => {
    it("says what each piece a crafter breaks down gives back, so many of it; nothing for what it won't", () => {
        assert.deepEqual(salvageInfo(stack("plate", 2, { quality: "fine" }), "smith"), { yields: [{ id: "steelIngot", count: 4 }], words: "4 steel ingots" });
        assert.deepEqual(salvageInfo(stack("plate", 2, { quality: "fine" }), "smith", { count: 1 }), { yields: [{ id: "steelIngot", count: 2 }], words: "2 steel ingots" });
        assert.deepEqual(salvageInfo(stack("sword"), "smith"), { yields: salvageOf({ id: "sword", quality: "common" }), words: "an iron ingot" });
        assert.equal(salvageInfo(stack("sword", 1, { quality: "legendary" }), "smith"), null, "(finer than it works)");
        assert.deepEqual(salvageInfo(stack("sword", 1, { quality: "legendary" }), "smith", { capital: true }).words, "an orichalcum ingot");
        assert.equal(salvageInfo(stack("wand"), "smith"), null, "(what it doesn't make)");
        assert.equal(salvageInfo(stack("sword", 1, { unique: "greenbrand" }), "smith"), null, "(what's bound)");
        assert.equal(yieldsSaid([{ id: "ironIngot", count: 2 }, { id: "steelIngot", count: 1 }]), "2 iron ingots and a steel ingot");
        assert.equal(thingsSaid({ id: "amethyst" }), "an amethyst");
    });
});

describe("the bestiary's parts and the words for a power (app/bestiary.js pageOf, app/gearinfo.js)", () => {
    it("shows each thing a creature leaves in its make's colour, with what it's for in a weapon, briefly; shut, nothing of it", () => {
        const mastered = { points: RESEARCH.levels[MASTERED - 1].points };

        for (const kind of Object.keys(SPOILS)) {
            if (!CREATURES[kind]) {
                continue;
            }

            const leaves = pageOf(kind, mastered).sections.find(({ heading }) => heading === "What it leaves");

            assert.equal(leaves.parts.length, SPOILS[kind].items.length, kind);
            leaves.parts.forEach(({ id, rarity, before, label, after, use }, k) => {
                assert.equal(rarity, gradeOf({ id }), `${kind}: ${id}`);
                assert.equal(label, itemLabel({ id }));
                assert.equal(use, usedFor(id));
                assert.equal(leaves.lines[k], `${before}${label}${after}${use ? ` ${use}.` : ""}`);
            });
            assert.deepEqual(pageOf(kind, { points: 0 }).sections.find(({ heading }) => heading === "What it leaves").parts, []);
        }

        const demon = pageOf("demonBoss", mastered).sections.at(-1);
        const horn = demon.parts.find(({ id }) => id === "demonHorn");

        assert.deepEqual([horn.rarity, horn.use], ["veryRare", "Fire on each blow, in a weapon"]);
        assert.equal(usedFor("boarMeat"), null, "(what's eaten: nothing)");
        assert.ok(Object.keys(INGREDIENTS).every((id) => usedFor(id) === `${STATS[FAMILIES[INGREDIENTS[id].family].arms].label}, in a weapon`));
    });

    it("words a power's range as the card and the preview say it: a share or a number, the same at both ends once, a blow briefly or in full", () => {
        assert.equal(rangeWorded("melee", [0.05, 0.12]), "+5–12% melee damage");
        assert.equal(rangeWorded("hp", [4, 10]), "+4–10 hit points");
        assert.equal(rangeWorded("hp", [4, 4]), "+4 hit points");
        assert.equal(rangeWorded("wardFire", [0.04, 0.1]), "−4–10% fire's harm");
        assert.equal(rangeWorded("armor", [0.01, 0.02]), "Armour: takes 1–2% more off each blow");
        assert.equal(rangeWorded("fireBlow", [0.06, 0.14]), "+6–14% fire on each blow");
        assert.equal(rangeWorded("holyBlow", [0.12, 0.28], { full: true }), "+12–28% of each blow's harm again as holy fire, on the restless dead and demons alone");
    });

    it("colours an ingredient by its make (core/progress.js gradeOf), and what's no ingredient as before", () => {
        assert.equal(gradeOf({ id: "demonHorn" }), "veryRare");
        assert.equal(gradeOf({ id: "orichalcumIngot" }), "legendary");
        assert.equal(gradeOf({ id: "ironIngot" }), "common");
        assert.equal(gradeOf({ id: "boarMeat" }), "common");
        assert.equal(gradeOf({ id: "potion" }), "common");
        assert.equal(gradeOf({ id: "sword", quality: "rare" }), "rare");
        assert.ok(Object.keys(INGREDIENTS).every((id) => ITEMS[id] && gradeOf({ id }) === INGREDIENTS[id].make));
    });

    it("hears what's made and broken down (game.js HOST_EVENTS)", () => {
        assert.ok(HOST_EVENTS.has("crafted") && HOST_EVENTS.has("brokenDown"));
        assert.ok(Object.keys(RECIPES).every((base) => KIND_WORDS[RECIPES[base].slots[0].kind]));
    });
});
