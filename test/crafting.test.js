// Crafting (client/js/core/materials.js, recipes.js, crafting.js; docs/CRAFTING.md): every piece of
// gear has a recipe at a crafter's, its main material setting its make (no more than a make above
// the poorest of what goes with it), every ingredient a power by its family, rolled within the
// range the recipe shows and as strong as its make and the piece's level; every ingredient comes
// from somewhere (a shop, a creature, a creature to come, or gear broken down), the rarest from
// the hardest foes; the fee grows with the make and the piece's price; and gear broken down gives
// back an ingredient of its main material's kind and make. Pure rules, with the world's dice.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ITEM_ICONS, partIcon } from "../client/js/app/icons.js";
import { AFFLICTIONS } from "../client/js/core/afflictions.js";
import { CRAFT_REFUSALS, craftItem, craftRefusal, feeOf, heldIn, ingredientsOf, junkSalvage, lackingIn, legendOf, MAKE_ABOVE, makeOf, nameOf, needs, placeOf, powerOf, powersOf, previewOf, recipesAt, salvageOf, salvagesAt, sourcesOf, statOf, usesOf, worthOf } from "../client/js/core/crafting.js";
import { CREATURES, TIERS } from "../client/js/core/creatures.js";
import { THEMES } from "../client/js/core/dungeons/themes.js";
import { GEAR, levelOf, STATS, UNIFORM_PEOPLES } from "../client/js/core/gear.js";
import { REFUSALS } from "../client/js/core/host.js";
import { BLOW_EFFECTS } from "../client/js/core/legendary.js";
import { BLOW_CAP, FAMILIES, INGREDIENT_KINDS, INGREDIENTS, MAKE_STRENGTH, MATERIALS, MORE_SPOILS, NEW_BEASTS, ON_BLOW, RANGES, UNHOLY } from "../client/js/core/materials.js";
import { buys, ITEMS, priceOf, QUALITIES, SHOPS, thingOf } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { CRAFT_FEE, CRAFTER_TOWNS, CRAFTERS, RECIPES, SALVAGE } from "../client/js/core/recipes.js";
import { PARTS, SPOILS } from "../client/js/core/spoils.js";

const MAKES = Object.keys(QUALITIES);
const rank = (make) => MAKES.indexOf(make);

// The new creatures' parts this brings (spoils.js PARTS), and the four new crafters
const NEW_PARTS = ["widowSilk", "blackSteelIngot", "goldIngot", "mythrilIngot", "adamantiteIngot", "orichalcumIngot", "ironwood", "ghostwood", "sylvanwood", "gloomsilk", "moonsilk", "sapphire", "diamond", "starRuby", "ancientSap"];
const NEW_CRAFTERS = ["bowyer", "leatherworker", "tailor", "jeweller"];

// The ingredients a recipe's slots take, the `n`th of each kind (round its list), the essence too
// unless `bare`
const pickFor = (base, n, bare = false) => RECIPES[base].slots.map(({ kind, optional }, k) => {
    if (optional && bare) {
        return null;
    }

    const list = ingredientsOf(kind);

    return list[(n * (k + 3)) % list.length];
});

describe("crafting's ingredients (materials.js)", () => {
    it("is every one a thing that can be carried, of a kind, a make and a family, with a word for a name and words for its card", () => {
        assert.equal(Object.keys(INGREDIENTS).length, 168);

        for (const [id, { kind, make, family, word, about }] of Object.entries(INGREDIENTS)) {
            assert.ok(ITEMS[id], `${id} is a thing`);
            assert.ok(INGREDIENT_KINDS.includes(kind), `${id}: ${kind}`);
            assert.ok(QUALITIES[make], `${id}: ${make}`);
            assert.ok(FAMILIES[family], `${id}: ${family}`);
            assert.match(word, /^[A-Z][A-Za-z-]+( [A-Z][a-z]+)?$/, id);
            assert.ok(word.length <= 11, `${id}'s word is short: ${word}`);
            assert.match(about, /^[A-Z].+[.!]$/, id);
        }
    });

    it("makes every creature's part useful but what's eaten, and the sold metals, woods, cloths, leathers and gems are things of their own", () => {
        for (const [id, { icon }] of Object.entries(PARTS)) {
            assert.equal(Boolean(INGREDIENTS[id]), icon !== "meat", id);
        }

        for (const id of Object.keys(MATERIALS)) {
            assert.ok(INGREDIENTS[id], id);
            assert.equal(INGREDIENTS[id].kind === "essence", false, `${id}: a material`);
            assert.ok(ITEMS[id].material && !ITEMS[id].part && !ITEMS[id].slot && !ITEMS[id].use, `${id}: ${JSON.stringify(ITEMS[id])}`);
            assert.ok(!PARTS[id] && !GEAR[id], `${id} is no other thing's id`);
            assert.equal(ITEMS[id].price, MATERIALS[id].price);
        }

        for (const id of NEW_PARTS) {
            assert.ok(ITEMS[id].part && !MATERIALS[id] && INGREDIENTS[id], id);
        }
    });

    it("has every metal, wood, cloth, leather and gem in every make, so every piece can be made in every make, and sells only the common and the fine", () => {
        for (const kind of INGREDIENT_KINDS) {
            for (const make of MAKES) {
                assert.ok(ingredientsOf(kind).some((id) => INGREDIENTS[id].make === make), `a ${make} ${kind}`);
            }
        }

        assert.deepEqual(ingredientsOf("metal").slice(0, 2), ["bronzeIngot", "ironIngot"]);
        assert.equal(ingredientsOf("metal").at(-1), "orichalcumIngot");

        for (const id of Object.keys(MATERIALS)) {
            assert.ok(rank(INGREDIENTS[id].make) <= rank("fine"), `${id} is common or fine`);
        }
    });

    it("draws every one, each in its own picture and colour, the gems and bolts of cloth in theirs", () => {
        for (const id of Object.keys(INGREDIENTS)) {
            assert.match(ITEM_ICONS[id], /<(path|circle|ellipse|rect)/, `${id} has an icon`);
        }

        for (const { icon, tint } of [...Object.values(MATERIALS), ...NEW_PARTS.map((id) => PARTS[id])]) {
            assert.ok(icon === "gel" || partIcon({ icon, tint }) !== partIcon({ icon: "gel", tint }), `${icon} is drawn`);
        }

        assert.notEqual(partIcon({ icon: "gem", tint: "#2a5ad8" }), partIcon({ icon: "gem", tint: "#d81a3a" }));
    });

    it("has the adventurers' guild buy every one, a creature's part for what it's worth and the rest as anything else", () => {
        for (const id of Object.keys(INGREDIENTS)) {
            assert.ok(buys("guild", id), id);
        }

        assert.equal(priceOf({ id: "mythrilIngot" }, { selling: true }), 80);
        assert.equal(priceOf({ id: "steelIngot" }, { selling: true }), Math.round(24 * 0.4));
    });

    it("gives every family a power in a weapon, a wand and anything worn, each a bonus there is or one of the new blows, and a legendary weapon's effect", () => {
        for (const [family, { label, arms, magic, worn, legend }] of Object.entries(FAMILIES)) {
            assert.ok(label, family);

            for (const stat of [arms, magic, worn]) {
                assert.ok(RANGES[stat], `${family}: ${stat} has a range`);
                assert.ok(STATS[stat] || ON_BLOW[stat], `${family}: ${stat}`);
            }

            assert.ok(BLOW_EFFECTS.includes(legend), `${family}: ${legend}`);
        }

        for (const [stat, [least, most]] of Object.entries(RANGES)) {
            assert.ok(STATS[stat] || ON_BLOW[stat], stat);
            assert.ok(least > 0 && least < most, stat);
        }

        assert.deepEqual(Object.keys(MAKE_STRENGTH), MAKES);
        assert.ok(MAKES.every((make, k) => !k || MAKE_STRENGTH[make] > MAKE_STRENGTH[MAKES[k - 1]]));
    });

    it("lets each new blow loose as an element warded against, what it leaves one there is, holy fire on the unholy alone and shadow on all but them", () => {
        for (const [stat, { label, element, afflict, chance, only, not }] of Object.entries(ON_BLOW)) {
            assert.match(label, / on each blow$/, stat);
            assert.ok(["fire", "water", "air", "earth", "magic"].includes(element), stat);
            assert.ok(!afflict || (AFFLICTIONS[afflict] && chance > 0), stat);
            assert.ok(!(only && not), stat);
            assert.ok(!STATS[stat] || STATS[stat].label === label, `${stat} is no other bonus`);
        }

        assert.ok(ON_BLOW.holyBlow.only && ON_BLOW.shadowBlow.not);
        assert.ok(BLOW_CAP > 0 && BLOW_CAP < 1);
        assert.ok(UNHOLY.length > 20 && UNHOLY.every((id) => CREATURES[id]), UNHOLY.filter((id) => !CREATURES[id]).join());
        assert.ok(UNHOLY.includes("demonBoss") && UNHOLY.includes("skeleton") && !UNHOLY.includes("wolf"));
    });
});

describe("where the ingredients come from (crafting.js sourcesOf)", () => {
    it("has every one come from somewhere: a crafter's shelves, a creature, a creature to come, or gear broken down", () => {
        for (const id of Object.keys(INGREDIENTS)) {
            const { sold, dropped, planned, salvage } = sourcesOf(id);

            assert.ok(sold.length || dropped.length || planned.length || salvage, `${id} comes from somewhere`);
        }

        for (const id of Object.keys(MATERIALS)) {
            assert.ok(sourcesOf(id).sold.length, `${id} is sold`);
        }

        for (const id of NEW_PARTS) {
            assert.ok(sourcesOf(id).planned.length || sourcesOf(id).dropped.length, `${id} comes off a creature, or will`);
        }

        assert.ok(["demonBoss", "ashkhar"].every((creature) => sourcesOf("demonHorn").dropped.includes(creature)));

        const mythril = sourcesOf("mythrilIngot");

        assert.ok([...mythril.dropped, ...mythril.planned].includes("mythrilGolem") && mythril.salvage && !mythril.sold.length);
    });

    it("has the rarest come from the hardest foes: the legendary only off the perilous, the very rare off those met at the ninth tier, the rare at the eighth", () => {
        const foe = (id) => CREATURES[id] ?? NEW_BEASTS[id];

        for (const [id, { make }] of Object.entries(INGREDIENTS)) {
            if (rank(make) < rank("rare") || MATERIALS[id]) {
                continue;
            }

            const { dropped, planned } = sourcesOf(id);
            const from = [...dropped, ...planned];

            assert.ok(from.length, `${id} comes off a creature`);

            for (const creature of from) {
                const { tiers, perilous } = foe(creature);

                assert.ok(make === "legendary" ? perilous : tiers[1] >= (make === "veryRare" ? 9 : 8), `${make} ${id} off ${creature} (${tiers})`);
            }
        }
    });

    it("plans each new creature from one there is, met where the world has places for it, leaving what's new; and each one there is leaving more", () => {
        const biomes = new Set(Object.values(CREATURES).flatMap(({ biomes }) => biomes ?? []));
        const catalog = JSON.parse(readFileSync(new URL("../client/models/assets.json", import.meta.url), "utf8")).models;
        const models = new Set();

        assert.equal(Object.keys(NEW_BEASTS).length, 9);

        for (const [id, beast] of Object.entries(NEW_BEASTS)) {
            const { name, like, tint, size, model, tiers, people, themes, items } = beast;

            assert.ok(!CREATURES[id] || CREATURES[id].name === name, `${id} is no creature there is`);
            assert.ok(CREATURES[like], `${id} is like ${like}`);
            assert.match(tint, /^#[0-9a-f]{6}$/);
            assert.ok(size > 0);
            assert.match(model, /^beast-[a-z-]+$/);
            assert.ok(!catalog[model] && !models.has(model), `${model} is its own`);
            models.add(model);
            assert.ok(tiers[0] >= 1 && tiers[0] <= tiers[1] && tiers[1] <= TIERS, id);
            assert.ok(people ? UNIFORM_PEOPLES.includes(people) : beast.biomes.length && beast.biomes.every((biome) => biomes.has(biome)), id);
            assert.ok(themes.every((theme) => THEMES[theme]), id);
            assert.ok(items.length && items.every(({ id: item, chance }) => PARTS[item] && chance > 0 && chance <= 1), id);
        }

        for (const [id, items] of Object.entries(MORE_SPOILS)) {
            assert.ok(SPOILS[id], id);
            assert.ok(items.length && items.every(({ id: item, chance }) => PARTS[item] && chance > 0 && chance <= 1), id);
        }
    });
});

describe("the recipes and the crafters (recipes.js)", () => {
    it("has a recipe for every piece of gear: its main material, a second of another kind, and an essence that can be left out", () => {
        assert.deepEqual(Object.keys(RECIPES).sort(), Object.keys(GEAR).sort());
        assert.equal(Object.keys(RECIPES).length, 44);

        for (const [base, { noun, slots }] of Object.entries(RECIPES)) {
            assert.match(noun, /^[A-Z]/, base);
            assert.ok(noun.length <= 16, base);
            assert.equal(slots.length, 3, base);
            assert.ok(slots.every(({ kind, count }) => INGREDIENT_KINDS.includes(kind) && Number.isInteger(count) && count >= 1), base);
            assert.ok(slots[0].kind !== "essence" && slots[1].kind !== "essence" && slots[0].kind !== slots[1].kind, base);
            assert.ok(!slots[0].optional && !slots[1].optional && slots[2].optional && slots[2].kind === "essence", base);
        }
    });

    it("has every piece made at some crafter's, and in the legendary make at a master's", () => {
        for (const base of Object.keys(GEAR)) {
            assert.ok(Object.values(CRAFTERS).some(({ makes }) => makes.includes(base)), `${base} is made`);
            assert.ok(Object.values(CRAFTERS).some(({ makes, best }) => best === "legendary" && makes.includes(base)), `${base} is made legendary`);
        }

        assert.deepEqual(Object.keys(CRAFTERS).filter((shop) => CRAFTERS[shop].best === "legendary"), ["masterSwordsmith", "masterArmorer", "emporium"]);
    });

    it("makes each crafter one of the shops, or one of the four new; each makes what's of its line, works to its make, and sells what it's made of", () => {
        for (const [shop, { makes, best, sells }] of Object.entries(CRAFTERS)) {
            assert.ok(SHOPS[shop] || NEW_CRAFTERS.includes(shop), shop);
            assert.ok(makes.length && makes.every((base) => RECIPES[base]) && new Set(makes).size === makes.length, shop);
            assert.ok(QUALITIES[best], shop);
            assert.ok(sells.every((id) => MATERIALS[id]), shop);
            assert.ok(makes.every((base) => sells.some((id) => INGREDIENTS[id].kind === RECIPES[base].slots[0].kind)), `${shop} sells something of each main material`);
        }

        // (The village's smith works no finer than it sells; the four new crafters ask for no new
        // master)
        assert.equal(CRAFTERS.smith.best, SHOPS.smith.best);
        assert.ok(NEW_CRAFTERS.every((shop) => CRAFTERS[shop].best === "veryRare"));
        assert.deepEqual(CRAFTERS.bowyer.makes, ["bow", "staff", "quiver"]);
        assert.deepEqual(CRAFTERS.jeweller.makes, ["amulet", "ring"]);
    });

    it("puts the four new crafters in the settlements by size, the capital every one", () => {
        assert.deepEqual(Object.keys(CRAFTER_TOWNS), ["village", "town", "city", "capital"]);

        for (const { always, some, count } of Object.values(CRAFTER_TOWNS)) {
            assert.ok([...always, ...some].every((shop) => NEW_CRAFTERS.includes(shop)));
            assert.ok(count <= some.length);
        }

        assert.deepEqual([...CRAFTER_TOWNS.capital.always].sort(), [...NEW_CRAFTERS].sort());

        const kept = ({ always, count }) => always.length + count;

        assert.ok(kept(CRAFTER_TOWNS.village) <= kept(CRAFTER_TOWNS.town) && kept(CRAFTER_TOWNS.town) <= kept(CRAFTER_TOWNS.city) && kept(CRAFTER_TOWNS.city) <= kept(CRAFTER_TOWNS.capital));
    });

    it("lists each crafter's recipes, each piece in every main material it works, none finer than its make", () => {
        const smith = recipesAt("smith");

        assert.ok(smith.some(({ base, main }) => base === "sword" && main === "ironIngot"));
        assert.ok(smith.some(({ base, main }) => base === "sword" && main === "blackSteelIngot"));
        assert.ok(!smith.some(({ main }) => main === "mythrilIngot"), "no mythril at a village smithy");
        assert.ok(recipesAt("masterSwordsmith").some(({ base, main }) => base === "sword" && main === "orichalcumIngot"));
        assert.deepEqual(recipesAt("tavern"), []);

        for (const shop of Object.keys(CRAFTERS)) {
            for (const { base, main, make } of recipesAt(shop)) {
                assert.equal(INGREDIENTS[main].kind, RECIPES[base].slots[0].kind);
                assert.equal(make, INGREDIENTS[main].make);
                assert.ok(rank(make) <= rank(CRAFTERS[shop].best), `${shop}: ${main} ${base}`);
                assert.equal(craftRefusal(shop, base, [main, ingredientsOf(RECIPES[base].slots[1].kind)[0], null]), null);
            }
        }
    });
});

describe("a piece made (crafting.js)", () => {
    it("makes the owner's Adamantite Demon Sword: an adamantite ingot, a wyvern's scale for its grip and a demon's horn, very rare, fire on every blow", () => {
        const using = ["adamantiteIngot", "wyvernScale", "demonHorn"];
        const shown = previewOf("swordsmith", "sword", using, { level: 60 });
        const sword = craftItem("sword", using, createRandom(7), { level: 60 });

        assert.equal(shown.reason, null);
        assert.equal(shown.make, "veryRare");
        assert.equal(shown.name, "Adamantite Demon Sword");
        assert.deepEqual(shown.powers.map(({ stat }) => stat), ["melee", "stormBlow", "fireBlow"]);
        assert.deepEqual(shown.needs, [{ id: "adamantiteIngot", count: 1 }, { id: "wyvernScale", count: 1 }, { id: "demonHorn", count: 1 }]);
        assert.equal(sword.name, "Adamantite Demon Sword");
        assert.equal(sword.quality, "veryRare");
        assert.equal(sword.level, 60);
        assert.ok(sword.bonuses.fireBlow > 0 && sword.bonuses.melee > 0, JSON.stringify(sword));
        assert.equal(thingOf(sword).name, "Adamantite Demon Sword", "its name kept as it's carried");

        // (Without the horn, an adamantite sword, no fire; and a master's, the same)
        assert.equal(nameOf("sword", ["adamantiteIngot", "wyvernScale", null]), "Adamantite Sword");
        assert.equal(craftItem("sword", ["adamantiteIngot", "wyvernScale", null], createRandom(7), { level: 60 }).bonuses.fireBlow, undefined);
        assert.equal(previewOf("masterSwordsmith", "sword", using, { level: 60 }).make, "veryRare");
    });

    it("makes it as fine as its main material, a make above the poorest of what goes with it at the most, the essence never lowering it", () => {
        assert.equal(MAKE_ABOVE, 1);
        assert.equal(makeOf("sword", ["orichalcumIngot", "tannedLeather", null]), "fine");
        assert.equal(makeOf("sword", ["orichalcumIngot", "dragonScale", "ratTail"]), "legendary");
        assert.equal(makeOf("sword", ["ironIngot", "dreadthornScale", "dreadthornHeart"]), "common");
        assert.equal(makeOf("ring", ["starRuby", "goldIngot", null]), "rare");

        for (const main of ingredientsOf("metal")) {
            for (const second of ingredientsOf("leather")) {
                for (const essence of [null, "ratTail", "dreadthornHeart"]) {
                    const expected = MAKES[Math.min(rank(INGREDIENTS[main].make), rank(INGREDIENTS[second].make) + 1)];

                    assert.equal(makeOf("sword", [main, second, essence]), expected, `${main} ${second} ${essence}`);
                }
            }
        }
    });

    it("refuses what a crafter doesn't make, what isn't of its slot's kind or is left out, and finer than it works", () => {
        assert.equal(craftRefusal("tavern", "sword", ["ironIngot", "tannedLeather", null]), "uncrafted");
        assert.equal(craftRefusal("bowyer", "sword", ["ironIngot", "tannedLeather", null]), "uncrafted");
        assert.equal(craftRefusal("swordsmith", "plate", ["ironIngot", "tannedLeather", null]), "uncrafted");
        assert.equal(craftRefusal("swordsmith", "sword", ["oakWood", "tannedLeather", null]), "unfit");
        assert.equal(craftRefusal("swordsmith", "sword", ["ironIngot", null, null]), "unfit");
        assert.equal(craftRefusal("swordsmith", "sword", ["ironIngot", "tannedLeather", "ironIngot"]), "unfit");
        assert.equal(craftRefusal("swordsmith", "sword", ["ironIngot", "tannedLeather", "boarMeat"]), "unfit", "meat's no essence");
        assert.equal(craftRefusal("swordsmith", "sword", ["ironIngot", "tannedLeather", "demonHorn", "ratTail"]), "unfit");
        assert.equal(craftRefusal("swordsmith", "sword", ["constructor", "tannedLeather", null]), "unfit");
        assert.equal(craftRefusal("swordsmith", "sword", "ironIngot"), "unfit");
        assert.equal(craftRefusal("swordsmith", "sword", ["ironIngot", "tannedLeather"]), null, "the essence left off the end");
        assert.equal(craftRefusal("smith", "sword", ["mythrilIngot", "wyvernScale", null]), "unworked");
        assert.equal(craftRefusal("swordsmith", "sword", ["orichalcumIngot", "dragonScale", null]), "unworked");
        assert.equal(craftRefusal("masterSwordsmith", "sword", ["orichalcumIngot", "dragonScale", null]), null);
        assert.equal(previewOf("smith", "sword", ["mythrilIngot", "wyvernScale", null]).reason, "unworked");
    });

    it("names each piece its main material's word, its essence's and its noun, short enough to be kept whole", () => {
        assert.equal(nameOf("travelCloak", ["moonsilk", "dreadthornScale", "riftHeart"]), "Moonsilk Behemoth Travelling Cloak");
        assert.equal(nameOf("ring", ["starRuby", "goldIngot", "demonHorn"]), "Star Ruby Demon Ring");
        assert.equal(nameOf("bow", ["yewWood", "linenBolt", null]), "Yew Bow");

        const longest = Math.max(...Object.entries(RECIPES).flatMap(([base, { slots }]) => ingredientsOf(slots[0].kind).flatMap((main) => [null, ...ingredientsOf("essence")].map((essence) => nameOf(base, [main, null, essence]).length))));

        assert.ok(longest <= 40, `${longest} letters at the most: progress.js thingOf keeps 40`);
    });

    it("gives each ingredient its family's power as the piece reads it: a weapon's, a shot's, a wand's, or what's worn", () => {
        assert.equal(placeOf("sword"), "arms");
        assert.equal(placeOf("quiver"), "arms");
        assert.equal(placeOf("wand"), "magic");
        assert.equal(placeOf("grimoire"), "magic");
        assert.equal(placeOf("staff"), "arms");
        assert.equal(placeOf("plate"), "worn");
        assert.equal(placeOf("ring"), "worn");
        assert.equal(statOf("demonHorn", "sword"), "fireBlow");
        assert.equal(statOf("demonHorn", "plate"), "wardFire");
        assert.equal(statOf("demonHorn", "wand"), "spell");
        assert.equal(statOf("adamantiteIngot", "sword"), "melee");
        assert.equal(statOf("yewWood", "bow"), "ranged", "a bow's blows are shots");
        assert.equal(statOf("leech", "sword"), "leech");
        assert.equal(statOf("frostHeart", "axe"), "frostBlow");
        assert.equal(statOf("boarMeat", "sword"), null);
        assert.equal(statOf("ironIngot", "potion"), null);
        assert.equal(statOf("ironIngot", "constructor"), null);

        for (const id of Object.keys(INGREDIENTS)) {
            assert.ok(usesOf(id).length, `${id} is used`);
            assert.ok(usesOf(id).every(({ base, slot, stat }) => RECIPES[base].slots[slot].kind === INGREDIENTS[id].kind && stat), id);
        }

        assert.equal(usesOf("demonHorn").length, 44, "an essence goes in anything");
    });

    it("makes a legendary weapon let loose its essence's family's effect, or its main material's", () => {
        assert.equal(legendOf("sword", ["orichalcumIngot", "dragonScale", "frostHeart"]), "frostbind");
        assert.equal(legendOf("sword", ["orichalcumIngot", "dragonScale", null]), "earthsunder");

        const sword = craftItem("sword", ["orichalcumIngot", "dreadthornScale", "dragonHeart"], createRandom(3), { level: 90 });

        assert.equal(sword.quality, "legendary");
        assert.equal(sword.effect, "cinderburst");
        assert.equal(sword.name, "Orichalcum Drakeheart Sword", "its own name, not a legendary one by chance");
        assert.equal(thingOf(sword).effect, "cinderburst");
        assert.equal(craftItem("plate", ["orichalcumIngot", "dreadthornScale", "dragonHeart"], createRandom(3), { level: 90 }).effect, undefined);
        assert.equal(previewOf("masterSwordsmith", "sword", ["orichalcumIngot", "dreadthornScale", "dragonHeart"], { level: 90 }).effect, "cinderburst");
    });

    it("rolls every power within the range its recipe shows, the same every time for the same dice, and never by Math.random", () => {
        const random = Math.random;

        Math.random = () => {
            throw new Error("Math.random");
        };

        try {
            for (const base of Object.keys(RECIPES)) {
                for (let n = 0; n < 6; n++) {
                    const using = pickFor(base, n);
                    const shop = Object.keys(CRAFTERS).find((each) => CRAFTERS[each].best === "legendary" && CRAFTERS[each].makes.includes(base));

                    for (const level of [1, 37, 100]) {
                        const shown = previewOf(shop, base, using, { level });

                        assert.equal(shown.reason, null, `${base} of ${using}`);

                        for (let seed = 1; seed <= 25; seed++) {
                            const piece = craftItem(base, using, createRandom(seed), { level, people: "orc" });

                            assert.equal(piece.quality, shown.make);
                            assert.equal(piece.name, shown.name);
                            assert.equal(levelOf(piece.level), shown.level);
                            assert.deepEqual(Object.keys(piece.bonuses), shown.powers.map(({ stat }) => stat));

                            for (const { stat, range: [least, most] } of shown.powers) {
                                assert.ok(piece.bonuses[stat] >= least - 1e-9 && piece.bonuses[stat] <= most + 1e-9, `${base} ${stat} ${piece.bonuses[stat]} in ${least} to ${most}`);
                            }

                            assert.deepEqual(craftItem(base, using, createRandom(seed), { level, people: "orc" }), piece);
                        }
                    }
                }
            }
        } finally {
            Math.random = random;
        }
    });

    it("comes out stronger as its maker's might is, of their might's level, as what's bought is", () => {
        for (const id of Object.keys(INGREDIENTS)) {
            const [low, high] = [powerOf(id, "sword", 1), powerOf(id, "sword", 100)];

            assert.equal(low.stat, high.stat);
            assert.ok(high.range[0] >= low.range[0] && high.range[1] > low.range[1], id);
        }

        assert.deepEqual(powerOf("demonHorn", "sword", 100).range.map((value) => Math.round(value * 100)), [12, 28]);
        assert.equal(craftItem("sword", ["ironIngot", "tannedLeather"], createRandom(1), { level: 1 }).level, undefined);
        assert.equal(craftItem("sword", ["ironIngot", "tannedLeather"], createRandom(1), { level: 57.4 }).level, 57);
        assert.equal(craftItem("sword", ["ironIngot", "tannedLeather"], createRandom(1), { level: 400 }).level, 100);

        // (A finer ingredient, a stronger power)
        assert.ok(powerOf("dreadthornHeart", "sword", 1).range[1] > powerOf("emberGland", "sword", 1).range[1]);
    });

    it("adds two ingredients' powers that add to the same thing together, in its range too", () => {
        const powers = powersOf("sword", ["ironIngot", "tannedLeather", null], 1);

        assert.deepEqual(powers, [{ stat: "hp", range: [6, 16], from: ["ironIngot", "tannedLeather"] }]);
    });

    it("makes a shield block, a wand boost spells, a uniform's piece and a design the crafter's people's, a mace one of its looks", () => {
        const kite = craftItem("kiteShield", ["steelIngot", "tannedLeather", null], createRandom(2), { people: "lizard" });
        const wand = craftItem("wand", ["birchWood", "quartz", null], createRandom(2), { level: 50 });
        const helm = craftItem("helm", ["steelIngot", "tannedLeather", null], createRandom(2), { people: "elf" });
        const mace = craftItem("mace", ["ironIngot", "tannedLeather", null], createRandom(2));

        assert.ok(kite.boost > 0 && GEAR.kiteShield.looks.includes(kite.look), JSON.stringify(kite));
        assert.ok(wand.boost >= 0.1 && wand.bonuses.spell > 0, JSON.stringify(wand));
        assert.equal(helm.people, "elf");
        assert.equal(craftItem("helm", ["steelIngot", "tannedLeather", null], createRandom(2), { people: "goblin" }).people, "human");
        assert.ok(GEAR.mace.looks.includes(mace.look));
        assert.equal(craftItem("sword", ["steelIngot", "tannedLeather", null], createRandom(2), { people: "elf" }).look, undefined, "the elves have no sword of their own design");
    });
});

describe("the fee and what it takes (crafting.js)", () => {
    it("asks more the finer the make, the dearer the piece and the higher its level, less for haggling", () => {
        assert.equal(CRAFT_FEE, 0.5);
        assert.equal(feeOf("sword", "common", 1), 15);
        assert.equal(feeOf("sword", "legendary", 100), 900);

        for (const base of Object.keys(GEAR)) {
            const fees = MAKES.map((make) => feeOf(base, make, 1));

            assert.ok(fees.every((fee, k) => !k || fee > fees[k - 1]), `${base}: ${fees}`);
            assert.ok(feeOf(base, "rare", 100) > feeOf(base, "rare", 1), base);
            assert.ok(feeOf(base, "rare", 50, { haggle: 0.2 }) < feeOf(base, "rare", 50), base);
        }

        for (const make of MAKES) {
            assert.ok(feeOf("plate", make, 30) > feeOf("mail", make, 30) && feeOf("mail", make, 30) > feeOf("jerkin", make, 30), make);
        }
    });

    it("takes each ingredient its slot's count of, and says what a pack's short of", () => {
        assert.deepEqual(needs("plate", ["steelIngot", "tannedLeather", "ratTail"]), [{ id: "steelIngot", count: 3 }, { id: "tannedLeather", count: 1 }, { id: "ratTail", count: 1 }]);
        assert.equal(worthOf("plate", ["steelIngot", "tannedLeather", "ratTail"]), 3 * 24 + 6 + 2);

        const pack = Array(40).fill(null);

        pack[0] = { id: "steelIngot", quality: "common", count: 2 };
        pack[5] = { id: "steelIngot", quality: "common", count: 1, junk: true };
        pack[9] = { id: "ratTail", quality: "common", count: 4 };

        assert.equal(heldIn(pack, "steelIngot"), 3);
        assert.deepEqual(lackingIn(pack, "plate", ["steelIngot", "tannedLeather", "ratTail"]), [{ id: "tannedLeather", need: 1, have: 0 }]);
        pack[12] = { id: "tannedLeather", quality: "common", count: 1 };
        assert.deepEqual(lackingIn(pack, "plate", ["steelIngot", "tannedLeather", "ratTail"]), []);
        assert.deepEqual(lackingIn(pack, "greatsword", ["adamantiteIngot", "tannedLeather", null]), [{ id: "adamantiteIngot", need: 2, have: 0 }]);
    });
});

describe("gear broken down (crafting.js salvageOf, junkSalvage)", () => {
    it("gives back an ingredient of the piece's main material's kind and make, and one more for each two more of it it took", () => {
        for (const kind of Object.keys(SALVAGE)) {
            assert.deepEqual(Object.keys(SALVAGE[kind]), MAKES, kind);

            for (const [make, id] of Object.entries(SALVAGE[kind])) {
                assert.equal(INGREDIENTS[id].kind, kind);
                assert.equal(INGREDIENTS[id].make, make);
            }
        }

        for (const base of Object.keys(GEAR)) {
            for (const make of MAKES) {
                const [{ id, count }] = salvageOf({ id: base, quality: make });

                assert.equal(INGREDIENTS[id].kind, RECIPES[base].slots[0].kind);
                assert.equal(INGREDIENTS[id].make, make);
                assert.equal(count, Math.ceil(RECIPES[base].slots[0].count / 2));
            }
        }

        assert.deepEqual(salvageOf({ id: "plate", quality: "legendary" }), [{ id: "orichalcumIngot", count: 2 }]);
        assert.deepEqual(salvageOf({ id: "potion" }), []);
        assert.deepEqual(salvageOf(null), []);
    });

    it("is done at a crafter that makes the piece, no finer than it works, never what's bound to its hero", () => {
        assert.ok(salvagesAt("smith", { id: "sword", quality: "masterwork" }));
        assert.ok(!salvagesAt("smith", { id: "sword", quality: "rare" }));
        assert.ok(salvagesAt("masterSwordsmith", { id: "sword", quality: "legendary" }));
        assert.ok(!salvagesAt("bowyer", { id: "sword", quality: "common" }));
        assert.ok(!salvagesAt("masterSwordsmith", { id: "sword", quality: "legendary", unique: "kingsplitter" }));
        assert.ok(!salvagesAt("tavern", { id: "sword" }));
    });

    it("breaks down all the junk carried that a crafter will, keeping what it won't junk for one that will", () => {
        const pack = Array(40).fill(null);

        pack[0] = { id: "sword", quality: "common", count: 2, junk: true };
        pack[1] = { id: "plate", quality: "fine", count: 1, junk: true };
        pack[2] = { id: "bow", quality: "common", count: 1, junk: true };
        pack[3] = { id: "sword", quality: "rare", count: 1, junk: true };
        pack[4] = { id: "sword", quality: "common", count: 1 };
        pack[5] = { id: "wolfPelt", quality: "common", count: 3, junk: true };
        pack[6] = { id: "sword", quality: "masterwork", count: 1, junk: true, unique: "vespers" };

        const all = junkSalvage(pack, "smith");

        assert.deepEqual(all.salvaged.map(({ index }) => index), [0, 1]);
        assert.deepEqual(all.kept.map(({ index }) => index), [2, 3]);
        assert.equal(all.count, 3);
        assert.equal(all.left, 2);
        assert.deepEqual(all.yields, [{ id: "ironIngot", count: 2 }, { id: "steelIngot", count: 2 }]);
        assert.equal(junkSalvage(pack, "tavern").count, 0);
    });
});

describe("no name used again (docs/CRAFTING.md *Multiplayer*)", () => {
    it("gives the host's refusals for crafting names it never gave, each for crafting alone", () => {
        assert.deepEqual(Object.keys(CRAFT_REFUSALS), ["uncrafted", "unfit", "unworked", "lacking", "craftChanged", "unsalvaged", "salvageNone", "salvageChanged"]);

        for (const [reason, words] of Object.entries(CRAFT_REFUSALS)) {
            assert.ok(!REFUSALS[reason] || REFUSALS[reason] === words, `${reason} is no refusal there was`);
            assert.match(words, /^[A-Z].+\.$/);
        }
    });

    it("gives every new thing, creature and crafter an id of its own", () => {
        const ids = [...Object.keys(MATERIALS), ...NEW_PARTS, ...Object.keys(NEW_BEASTS), ...NEW_CRAFTERS, ...Object.keys(ON_BLOW)];

        assert.equal(new Set(ids).size, ids.length);

        for (const id of [...Object.keys(MATERIALS), ...NEW_PARTS]) {
            assert.ok(!CREATURES[id] && !SHOPS[id] && !STATS[id], id);
        }

        for (const id of NEW_CRAFTERS) {
            assert.ok(!ITEMS[id] && !CREATURES[id], id);
        }
    });
});
