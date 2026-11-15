import { expect, playing, test } from "./fixtures.js";
import { BUTTONS } from "../client/js/app/gamepad.js";
import { CRAFT_REFUSALS, previewOf } from "../client/js/core/crafting.js";
import { REFUSALS } from "../client/js/core/host.js";
import { MASTERED, RESEARCH } from "../client/js/core/bestiary.js";
import { whereOf } from "../client/js/app/bestiary.js";

// Crafting, stage 5 (docs/CRAFTING.md *The five stages*: app/pack.js, app/craftinfo.js; core/
// crafting.js and core/host.js #craft, #salvage, #salvageJunk), played in a real browser: at the
// start town's blacksmith, the Craft tab beside Buy and Sell, everything it makes by piece with
// what's missing marked; a piece chosen, its slots filled from what's carried, shown before it's
// made (its name, make, each power's range, the fee), refused for want of gold (said in the
// panel), and made, the piece in the pack with its powers inside the ranges shown; one piece
// broken down, saying first what comes back, and Break down all junk asked once; an ingredient's
// card in the pack, at the crafter's and in the bestiary, the creatures that leave it named once
// they're met, and the bestiary's parts in their makes' colours; the keys' and a controller's
// ways through it; on a phone held upright and on its side.

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

const thing = (id, count = 1, more = {}) => ({ id, quality: "common", count, ...more });

// The game stopped, the orc out of the way; things laid in the pack (`pack`: { slot: thing }), and
// gold
async function carrying(page, { pack = {}, gold = 30 } = {}) {
    await page.evaluate(
        ({ pack, gold }) => {
            const { game } = window.pellagos;
            const progress = game.progress;

            game.stop();
            Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
            progress.gold = gold;
            progress.pack.fill(null);

            for (const [slot, thing] of Object.entries(pack)) {
                progress.pack[Number(slot)] = thing;
            }

            game.hud.setGold(gold);
        },
        { pack, gold },
    );
}

// Into the home town's blacksmith (seed 2's) by its door from the town, as junk's and the stash's
// tests go into the guild
async function intoTheSmithy(page) {
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const door = [...game.world.interiors.buildings.values()].find((each) => each.kind === "blacksmith" && each.place === "home").door;
        const player = game.battle.actor("player");
        const [x, y] = door.ends.find(({ map }) => map === "town").squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.host.command("player", { type: "enter", link: door.id });

        for (let k = 0; k < 20 && player.map === "town"; k++) {
            game.advance(0.25, { render: false });
        }
    });
    await expect.poll(() => page.evaluate(() => window.pellagos.game.battle.actor("player").map)).not.toBe("town");
}

// Up to the smith, talked to as a tap does, and a choice chosen (`choice`, its words: to see their
// wares, the pack open on Buy; "What can you make?", on Craft). Played on by hand till the talk's
// begun. The smith's id
async function atTheSmith(page, choice = "for sale") {
    const keeper = await page.evaluate((choice) => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const smith = game.battle.actors.find((actor) => actor.role === "smith" && actor.map === player.map);

        Object.assign(player, { square: [smith.square[0], smith.square[1] + 1], x: smith.square[0] + 0.5, y: smith.square[1] + 1.5, path: [], order: null });
        game.approaching = smith.id;
        game.battle.command("player", { type: "approach", target: smith.id });

        for (let k = 0; k < 300 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        const { conversation } = game.talking;

        game.talk.onChoose(conversation.choices.findIndex(({ text }) => text.toLowerCase().includes(choice)));
        game.advance(0.05, { render: false });

        return smith.id;
    }, choice);

    await expect(page.locator(".pack .pack-title")).toContainText("Trading with");

    return keeper;
}

// The smithy at seed 2's start town, carrying `pack` and `gold`, the smith's wares open: their id
async function atTheSmithy(page, { pack, gold = 30 } = {}) {
    await playing(page, "/?play&seed=2");
    await carrying(page, { pack, gold });
    await intoTheSmithy(page);

    return atTheSmith(page);
}

// What's carried, by slot: [slot, id, count, junk] each
const carried = (page) => page.evaluate(() => window.pellagos.game.progress.pack.flatMap((stack, slot) => (stack ? [[slot, stack.id, stack.count, stack.junk === true]] : [])));

// What the host would show the player of a piece (core/crafting.js previewOf), as the pack does:
// at their might's level, with their haggling, at the start town's smith (no capital)
async function shown(page, base, using) {
    const { might, haggle } = await page.evaluate(() => ({ might: window.pellagos.game.host.mightFor("player"), haggle: window.pellagos.game.progress.bonuses().haggle }));

    return previewOf("smith", base, using, { level: might, haggle });
}

// A power's range as the preview says it: a whole percent, or a whole number
const percent = (value) => Math.round(value * 100);

const STEEL_SWORD = Object.freeze(["steelIngot", "tannedLeather", "demonHorn"]);

test("the Craft tab at the smith's: all it makes by piece, what's missing marked; a piece shown first, refused without the gold (said), made, its powers in the ranges shown", async ({ page }) => {
    test.setTimeout(300000);

    const keeper = await atTheSmithy(page, { pack: { 0: thing("steelIngot", 2), 1: thing("hardenedLeather"), 2: thing("tannedLeather", 2), 3: thing("demonHorn"), 4: thing("ironIngot", 3) }, gold: 5 });
    const pack = page.locator(".pack");
    const modes = pack.locator(".pack-modes");

    // Buy, Sell and Craft across the top
    await expect(modes.getByRole("tab")).toHaveText(["Buy", "Sell", "Craft"]);
    await modes.getByRole("tab", { name: "Craft" }).click();
    await expect(modes.getByRole("tab", { name: "Craft" })).toHaveAttribute("aria-selected", "true");

    // Everything it makes, by piece under where it goes; each piece's main materials, what the pack
    // is short of greyed and said
    await expect(pack.locator(".craft-intro")).toContainText("makes all of this, up to masterwork");
    await expect(pack.locator(".pack-section .pack-heading")).toContainText(["Weapons", "The other hand", "Head", "Body"]);

    const sword = pack.locator('.craft-piece[data-base="sword"]');

    await expect(sword.locator(".pack-label")).toHaveText("Sword");
    await expect(sword.locator(".craft-takes")).toHaveText("A metal, a leather, and an essence if you like");
    await expect(sword.locator(".craft-main")).toHaveText(["Bronze", "Iron", "Rusted", "Steel", "Silver", "Blacksteel", "Gold"]);
    await expect(sword.locator('.craft-main[data-main="steelIngot"]')).not.toHaveClass(/lacking/);
    await expect(sword.locator('.craft-main[data-main="steelIngot"]')).toHaveClass(/rarity-fine/);
    await expect(sword.locator('.craft-main[data-main="goldIngot"]')).toHaveClass(/lacking/);
    await expect(sword.locator('.craft-main[data-main="goldIngot"]')).toHaveAttribute("aria-label", "Gold Sword: you haven't Gold ingot (0 of 1)");
    await expect(pack.locator('.craft-piece[data-base="plate"] .craft-main[data-main="steelIngot"]')).toHaveAttribute("aria-label", "Steel Plate: you haven't Steel ingot (2 of 3)");
    // (A round shield's main material's a wood: none carried, none of its second's metal wanted)
    await expect(pack.locator('.craft-piece[data-base="roundShield"] .craft-main[data-main="oakWood"]')).toHaveAttribute("aria-label", "Oak Round Shield: you haven't Oak wood (0 of 2)");

    // A steel sword chosen: its slots filled from what's carried (the commonest second that keeps it
    // as fine as its steel, a make below it; no essence), each choice what the pack holds of its kind
    await sword.locator('.craft-main[data-main="steelIngot"]').click();

    const slot = (k) => pack.locator(`.craft-slot[data-slot="${k}"]`);

    await expect(slot(0).locator(".pack-heading")).toHaveText("Main material");
    await expect(slot(0).locator(".craft-pick")).toHaveText(["Iron ingot3/1", "Steel ingot2/1"]);
    await expect(slot(0).getByRole("button", { name: "Steel ingot: 2 carried" })).toHaveAttribute("aria-pressed", "true");
    await expect(slot(1).locator(".craft-pick")).toHaveText(["Tanned leather2/1", "Hardened leather1/1"]);
    await expect(slot(1).getByRole("button", { name: "Tanned leather: 2 carried" })).toHaveAttribute("aria-pressed", "true");
    await expect(slot(2).getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "true");

    // The demon's horn put in: shown first, its name, its make, each power's range, the fee and
    // what it's all worth (as the host would make it: core/crafting.js previewOf)
    await slot(2).getByRole("button", { name: "Demon's horn: 1 carried" }).click();
    await expect(slot(2).getByRole("button", { name: "Demon's horn: 1 carried" })).toHaveAttribute("aria-pressed", "true");

    const preview = await shown(page, "sword", STEEL_SWORD);
    const card = pack.locator(".craft-preview");

    expect(preview).toMatchObject({ reason: null, make: "fine", name: "Steel Demon Sword" });
    expect(preview.powers.map(({ stat }) => stat)).toEqual(["melee", "hp", "fireBlow"]);
    await expect(card.locator(".pack-name")).toHaveText("Steel Demon Sword");
    await expect(card.locator(".pack-name")).toHaveClass(/rarity-fine/);
    await expect(card.locator(".pack-kind")).toHaveText("One-handed weapon · Fine");

    for (const { stat, range: [least, most] } of preview.powers) {
        const said = { melee: `+${percent(least)}–${percent(most)}% melee damage (Steel ingot)`, hp: `+${least}–${most} hit points (Tanned leather)`, fireBlow: `+${percent(least)}–${percent(most)}% of each blow's harm again as fire, setting the foe struck burning as often (Demon's horn)` }[stat];

        await expect(card.locator(".pack-lines")).toContainText(said);
    }

    await expect(pack.locator(".craft-fee")).toHaveText(`Fee: ${preview.fee} gold (you have 5)`);
    await expect(pack.locator(".craft-fee")).toHaveClass(/short/);
    await expect(pack.locator(".craft-worth")).toHaveText(`What goes into it is worth ${preview.worth} gold`);

    // Without the gold: refused, and said in the panel; nothing taken
    await pack.getByRole("button", { name: `Craft Steel Demon Sword for ${preview.fee} gold` }).click();
    await expect(pack.locator(".craft-why")).toHaveText(REFUSALS.gold);
    expect(await carried(page)).toEqual([[0, "steelIngot", 2, false], [1, "hardenedLeather", 1, false], [2, "tannedLeather", 2, false], [3, "demonHorn", 1, false], [4, "ironIngot", 3, false]]);

    // With it: the smith asked "What can you make?", the pack opened on its Craft tab
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.progress.gold = 1000;
        game.hud.setGold(1000);
        game.closePack();
    });
    expect(await atTheSmith(page, "what can you make")).toBe(keeper);
    await expect(modes.getByRole("tab", { name: "Craft" })).toHaveAttribute("aria-selected", "true");
    await sword.locator('.craft-main[data-main="steelIngot"]').click();
    await slot(2).getByRole("button", { name: "Demon's horn: 1 carried" }).click();
    await pack.getByRole("button", { name: `Craft Steel Demon Sword for ${preview.fee} gold` }).click();

    // Made at once: shown as it came out, in the pack, the ingredients and the fee gone
    const made = pack.locator(".craft-made");

    await expect(made.locator(".pack-name")).toHaveText("Steel Demon Sword");
    await expect(pack.locator(".pack-gold")).toHaveText(`${1000 - preview.fee} gold`);
    expect(await carried(page)).toEqual([[0, "steelIngot", 1, false], [1, "hardenedLeather", 1, false], [2, "tannedLeather", 1, false], [3, "sword", 1, false], [4, "ironIngot", 3, false]]);

    const piece = await page.evaluate(() => window.pellagos.game.progress.pack[3]);

    expect(piece).toMatchObject({ id: "sword", quality: "fine", name: "Steel Demon Sword" });

    for (const { stat, range: [least, most] } of preview.powers) {
        expect(piece.bonuses[stat], stat).toBeGreaterThanOrEqual(least);
        expect(piece.bonuses[stat], stat).toBeLessThanOrEqual(most);
    }

    // (Told, as it's heard with the next step)
    await page.evaluate(() => window.pellagos.game.advance(0.1, { render: false }));
    await expect(page.locator("#banner")).toHaveText(`Made for you: Steel Demon Sword, for ${preview.fee} gold. It's in your pack.`);

    // Short of steel now: what it was in, still listed, greyed and said
    await pack.locator(".craft-back").click();
    await expect(sword.locator('.craft-main[data-main="steelIngot"]')).not.toHaveClass(/lacking/);
    await expect(pack.locator('.craft-piece[data-base="greatsword"] .craft-main[data-main="steelIngot"]')).toHaveAttribute("aria-label", "Steel Greatsword: you haven't Steel ingot (1 of 2)");
    expect(CRAFT_REFUSALS.lacking).toBe("You haven't all it takes.");
});

test("breaking down at the smith's: one piece, what comes back said first; all the junk it breaks down, asked once, the rest still junk; told", async ({ page }) => {
    test.setTimeout(300000);

    await atTheSmithy(page, { pack: { 0: thing("sword", 1, { quality: "fine" }), 1: thing("mace", 2, { junk: true }), 2: thing("plate", 1, { junk: true }), 3: thing("wand", 1, { junk: true }), 4: thing("potion") } });

    const pack = page.locator(".pack");

    await pack.locator(".pack-modes").getByRole("tab", { name: "Sell" }).click();

    // One piece: its card says what comes back, then Break down asks, in the panel
    const sword = pack.locator('.selling .pack-row[data-item="sword"]');

    await sword.locator(".pack-peek").click();
    await expect(sword.locator(".craft-salvage-note")).toHaveText("Broken down here: a steel ingot back.");
    await sword.getByRole("button", { name: "Break down Fine sword: a steel ingot back" }).click();

    const ask = pack.locator(".salvage-ask");

    await expect(ask.locator(".stash-ask-title")).toHaveText("Break down Fine sword?");
    await expect(ask.locator(".stash-ask-text")).toHaveText("You'd get back a steel ingot. Broken down, it's gone for good.");
    await expect(ask.getByRole("button", { name: "Break down Fine sword for a steel ingot" })).toBeFocused();
    await ask.getByRole("button", { name: "Not now" }).click();
    await expect(ask).toHaveCount(0);
    expect(await carried(page)).toEqual([[0, "sword", 1, false], [1, "mace", 2, true], [2, "plate", 1, true], [3, "wand", 1, true], [4, "potion", 1, false]]);
    await sword.getByRole("button", { name: /^Break down Fine sword/ }).click();
    await ask.getByRole("button", { name: "Break down Fine sword for a steel ingot" }).click();
    await expect(ask).toHaveCount(0);
    expect(await carried(page)).toEqual([[0, "steelIngot", 1, false], [1, "mace", 2, true], [2, "plate", 1, true], [3, "wand", 1, true], [4, "potion", 1, false]]);
    await page.evaluate(() => window.pellagos.game.advance(0.1, { render: false }));
    await expect(page.locator("#banner")).toHaveText("You break down a fine sword: back comes a steel ingot.");

    // All the junk a smith breaks down (the maces and the plate: not the wand), asked once with
    // what comes back; Not now, nothing; Break down, all of it, the wand still junk
    const bar = pack.locator(".salvage-bar");

    await expect(bar.locator(".junk-said")).toHaveText("Broken down here: 3 things, for 4 iron ingots.");
    await bar.getByRole("button", { name: "Break down all junk: 3 things for 4 iron ingots" }).click();
    await expect(ask.locator(".stash-ask-title")).toHaveText("Break down 3 things?");
    await expect(ask.locator(".stash-ask-text")).toHaveText("You'd get back 4 iron ingots. What they won't break down (one thing) stays marked as junk. Broken down, it's gone for good.");
    await ask.getByRole("button", { name: "Not now" }).click();
    expect(await carried(page)).toEqual([[0, "steelIngot", 1, false], [1, "mace", 2, true], [2, "plate", 1, true], [3, "wand", 1, true], [4, "potion", 1, false]]);
    await bar.getByRole("button", { name: /^Break down all junk/ }).click();
    await ask.getByRole("button", { name: "Break down 3 things for 4 iron ingots" }).click();
    await expect(ask).toHaveCount(0);
    expect(await carried(page)).toEqual([[0, "steelIngot", 1, false], [1, "ironIngot", 4, false], [3, "wand", 1, true], [4, "potion", 1, false]]);
    await expect(bar.getByRole("button", { name: /^Break down all junk/ })).toBeDisabled();
    await expect(bar.locator(".junk-said")).toHaveText(/ breaks down none of your junk\.$/);
    await page.evaluate(() => window.pellagos.game.advance(0.1, { render: false }));
    await expect(page.locator("#banner")).toHaveText("You break down your junk, 3 things: back come 4 iron ingots.");
});

test("an ingredient's card: tapped in the pack, held at the crafter's, tapped in the bestiary; its make's colour, what it's for, where it comes from, the creature named once it's met", async ({ page }) => {
    test.setTimeout(300000);
    await playing(page, "/?play&seed=2");
    await carrying(page, { pack: { 0: thing("wolfPelt", 2), 1: thing("demonHorn"), 2: thing("steelIngot") } });

    const pack = page.locator(".pack");
    const about = pack.locator(".pack-about");

    // In the pack, before the wolf's in the bestiary: what it is, its make's colour, its power read
    // three ways, what it goes into, and something where wolves are met
    await page.evaluate(() => window.pellagos.game.togglePack());
    await pack.locator('.carried .pack-cell[data-index="0"]').click();
    await expect(about.locator(".pack-name")).toHaveText("Wolf pelt ×2");
    await expect(about.locator(".pack-name")).toHaveClass(/rarity-fine/);
    await expect(pack.locator('.carried .pack-cell[data-index="0"]')).toHaveClass(/rarity-fine/);
    await expect(about.locator(".pack-kind")).toHaveText("Ingredient: a leather · Fine");
    await expect(about.locator(".pack-lines li").first()).toHaveText("Grey wolf fur, warm and hard-wearing: a ranger's lining.");
    await expect(about.locator(".pack-lines")).toContainText("In a weapon: +4–10 stamina");
    await expect(about.locator(".pack-lines")).toContainText("Worn: −5–11% running's toll");
    await expect(about.locator(".pack-lines")).toContainText("The main material of grimoire, quiver, leather cap");
    await expect(about.locator(".pack-lines")).toContainText(`Left by something ${whereOf("wolf")}.`);
    await expect(about.locator(".pack-lines")).toContainText("The adventurers' guild pays 7 gold for it.");

    // Met (Sighted in the bestiary): named
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.closePack();
        game.progress.bestiary.kinds.wolf = { points: 1, seen: true, signs: 0, slain: 0 };
        game.togglePack();
    });
    await pack.locator('.carried .pack-cell[data-index="0"]').click();
    await expect(about.locator(".pack-lines")).toContainText("Left by Wolf.");
    await expect(about.locator(".pack-lines")).not.toContainText("Left by something");

    // A demon's horn: very rare, its fire on each blow in a weapon
    await pack.locator('.carried .pack-cell[data-index="1"]').click();
    await expect(about.locator(".pack-name")).toHaveClass(/rarity-veryRare/);
    await expect(about.locator(".pack-kind")).toHaveText("Ingredient: an essence · Very rare");
    await expect(about.locator(".pack-lines")).toContainText(/In a weapon: \+\d+–\d+% fire on each blow/);
    await page.evaluate(() => window.pellagos.game.closePack());

    // The bestiary, the wolf mastered: what it leaves in its makes' colours and what each is for,
    // its card a tap away
    await page.evaluate((points) => {
        const { game } = window.pellagos;

        game.progress.bestiary.kinds.wolf = { points, seen: true, signs: 0, slain: 3 };
        game.toggleJournal();
    }, RESEARCH.levels[MASTERED - 1].points);

    const journal = page.locator(".journal");

    await journal.getByRole("button", { name: "Bestiary" }).click();
    await journal.locator(".bestiary-row", { hasText: "Wolf" }).first().click();

    const pelt = journal.locator('.bestiary-part[data-part="wolfPelt"]');

    await expect(pelt.locator(".bestiary-line")).toHaveText("Sometimes: Wolf pelt. Stamina, in a weapon.");
    await expect(pelt.locator(".bestiary-part-name")).toHaveClass(/rarity-fine/);
    await expect(journal.locator('.bestiary-part[data-part="wolfFang"] .bestiary-part-name')).toHaveClass(/rarity-common/);
    await pelt.getByRole("button", { name: "Wolf pelt: what it is" }).click();
    await expect(pelt.locator(".bestiary-card .pack-kind")).toHaveText("Ingredient: a leather · Fine");
    await expect(pelt.locator(".bestiary-card")).toContainText("Left by Wolf.");
    await pelt.getByRole("button", { name: "Wolf pelt: what it is" }).click();
    await expect(pelt.locator(".bestiary-card")).toHaveCount(0);
    await page.evaluate(() => window.pellagos.game.closeJournal());

    // At the smith's: a main material in the list right-clicked (held), its card beside it; and in
    // a piece chosen, the chosen one's tapped open beneath its slot
    await intoTheSmithy(page);
    await atTheSmith(page);
    await pack.locator(".pack-modes").getByRole("tab", { name: "Craft" }).click();

    const steel = pack.locator('.craft-piece[data-base="sword"] .craft-main[data-main="steelIngot"]');

    await steel.click({ button: "right" });
    await expect(about.locator(".pack-name")).toHaveText("Steel ingot");
    await expect(about.locator(".pack-kind")).toHaveText("Ingredient: a metal · Fine");
    await expect(about.locator(".pack-lines")).toContainText("Sold by blacksmiths, swordsmiths, armorers, the Master Swordsmiths and the Master Armorers.");
    await expect(about.locator(".pack-lines")).toContainText("Given back by gear broken down at a crafter's.");
    await pack.locator(".craft-intro").click();
    await expect(about).toBeHidden();
    await steel.click();

    const chosen = pack.locator('.craft-slot[data-slot="0"] .craft-chosen .pack-row');

    await chosen.locator(".pack-peek").click();
    await expect(chosen.locator(".pack-peeked .pack-kind")).toHaveText("Ingredient: a metal · Fine");
    await expect(chosen.locator(".pack-peeked")).toContainText("In a weapon: +");
});

// A stand-in game controller (as e2e/controller.spec.js and junk's give one): navigator.getGamepads
// gives a controller of the standard layout, its buttons set by the test, a press down for one frame
async function standIn(page) {
    await page.addInitScript((names) => {
        const pad = { id: "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)", index: 0, connected: true, mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0], buttons: names.map(() => ({ pressed: false, touched: false, value: 0 })) };
        let frame = 0;
        const count = () => {
            frame += 1;
            requestAnimationFrame(count);
        };

        requestAnimationFrame(count);
        window.standIn = {
            pad,
            reads: 0,
            frame: -1,
            connected: false,
            taps: new Map(),
            set(name, value) {
                pad.buttons[names.indexOf(name)] = { pressed: value > 0.5, touched: value > 0, value };
            },
            tap(name) {
                this.set(name, 1);
                this.taps.set(name, 1);
            },
            connect() {
                this.connected = true;
                window.dispatchEvent(Object.assign(new Event("gamepadconnected"), { gamepad: pad }));
            },
        };
        navigator.getGamepads = () => {
            const standIn = window.standIn;

            if (standIn.frame !== frame) {
                standIn.frame = frame;

                for (const [name, left] of standIn.taps) {
                    if (left > 0) {
                        standIn.taps.set(name, left - 1);
                    } else {
                        standIn.set(name, 0);
                        standIn.taps.delete(name);
                    }
                }

                standIn.reads += 1;
            }

            return standIn.connected ? [pad] : [];
        };
    }, BUTTONS);

    const read = async (times = 3) => {
        const from = await page.evaluate(() => window.standIn.reads);

        await page.waitForFunction(([from, times]) => window.standIn.reads >= from + times, [from, times], { polling: 50 });
    };

    return {
        connect: () => page.evaluate(() => window.standIn.connect()),
        async press(name) {
            await page.evaluate((name) => window.standIn.tap(name), name);
            await read();
        },
    };
}

test("at the smith's by the keys, Enter choosing and crafting and Escape going back; and by a controller, L1 and R1 turning Buy, Sell and Craft, Cross choosing and crafting, Square a card, Circle back", async ({ page }) => {
    test.setTimeout(300000);

    const pad = await standIn(page);
    const keeper = await atTheSmithy(page, { pack: { 0: thing("ironIngot", 3), 1: thing("tannedLeather", 2) }, gold: 200 });
    const pack = page.locator(".pack");
    const modes = pack.locator(".pack-modes");
    const iron = pack.locator('.craft-piece[data-base="sword"] .craft-main[data-main="ironIngot"]');
    const make = pack.locator(".craft-make");
    const swords = () => page.evaluate(() => window.pellagos.game.progress.pack.filter((stack) => stack?.id === "sword").length);

    // The keys: Enter on the Craft tab, on a material (its Craft in focus), on Craft
    await modes.getByRole("tab", { name: "Craft" }).focus();
    await page.keyboard.press("Enter");
    await expect(modes.getByRole("tab", { name: "Craft" })).toHaveAttribute("aria-selected", "true");
    await iron.focus();
    await page.keyboard.press("Enter");
    await expect(make).toBeFocused();
    await expect(make).toHaveAccessibleName(/^Craft Iron Sword for \d+ gold$/);
    await page.keyboard.press("Enter");
    await expect(pack.locator(".craft-made .pack-name")).toHaveText("Iron Sword");
    expect(await swords()).toBe(1);

    // Escape: back to the list, the material it was of in focus; again, the pack shut
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("Escape");
    await expect(pack.locator(".craft-list").first()).toBeVisible();
    await expect(iron).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(pack).toBeHidden();

    // A controller: opened on its Craft tab (openCrafting), R1 and L1 turning the tabs, its prompt
    // saying so
    expect(await page.evaluate((keeper) => window.pellagos.game.openCrafting(keeper), keeper)).toBe(true);
    await pad.connect();
    await expect(modes.getByRole("tab", { name: "Craft" })).toHaveAttribute("aria-selected", "true");
    await iron.focus();
    await pad.press("r1");
    await expect(modes.getByRole("tab", { name: "Buy" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".padprompts")).toContainText("Tabs");
    await pad.press("l1");
    await expect(modes.getByRole("tab", { name: "Craft" })).toHaveAttribute("aria-selected", "true");

    // Square on a material: its card; Circle puts it away; Cross chooses it, and crafts
    await iron.focus();
    await pad.press("square");
    await expect(pack.locator(".pack-about .pack-name")).toHaveText("Iron ingot");
    await pad.press("circle");
    await expect(pack.locator(".pack-about")).toBeHidden();
    await expect(iron).toBeFocused();
    await pad.press("cross");
    await expect(make).toBeFocused();
    await pad.press("cross");
    await expect.poll(swords).toBe(2);

    // Circle: back to the list, and the pack shut
    await pad.press("circle");
    await expect(iron).toBeFocused();
    await pad.press("circle");
    await expect(pack).toBeHidden();
});

// The smith's Craft tab at a phone's size (`viewport`): the list, a piece chosen and what it'd be,
// all inside the panel and nothing scrolled across; made
async function onAPhone(page) {
    await atTheSmithy(page, { pack: { 0: thing("steelIngot", 1), 1: thing("tannedLeather", 1), 2: thing("demonHorn") }, gold: 300 });

    const pack = page.locator(".pack");
    const fits = (selectors) =>
        page.evaluate((selectors) => {
            const panel = document.querySelector(".pack").getBoundingClientRect();
            const inside = (selector) => {
                const box = document.querySelector(selector).getBoundingClientRect();

                return box.left >= panel.left && box.right <= panel.right && box.top >= 0 && box.bottom <= innerHeight;
            };

            return { across: document.documentElement.scrollWidth <= innerWidth, panel: panel.left >= 0 && panel.right <= innerWidth, ...Object.fromEntries(selectors.map((selector) => [selector, inside(selector)])) };
        }, selectors);

    await pack.locator(".pack-modes").getByRole("tab", { name: "Craft" }).click();
    await expect(pack.locator('.craft-piece[data-base="sword"]')).toBeVisible();
    expect(await fits([".pack-modes", ".craft-intro"])).toEqual({ across: true, panel: true, ".pack-modes": true, ".craft-intro": true });
    await pack.locator('.craft-piece[data-base="plate"]').scrollIntoViewIfNeeded();
    expect(await fits(['.craft-piece[data-base="plate"]'])).toEqual({ across: true, panel: true, '.craft-piece[data-base="plate"]': true });
    await pack.locator('.craft-piece[data-base="sword"] .craft-main[data-main="steelIngot"]').click();
    await pack.locator('.craft-slot[data-slot="2"]').getByRole("button", { name: "Demon's horn: 1 carried" }).click();
    await pack.locator(".craft-make").scrollIntoViewIfNeeded();
    expect(await fits([".craft-make", ".craft-sums"])).toEqual({ across: true, panel: true, ".craft-make": true, ".craft-sums": true });
    await pack.locator(".craft-preview").scrollIntoViewIfNeeded();
    expect(await fits([".craft-preview"])).toEqual({ across: true, panel: true, ".craft-preview": true });
    await pack.locator(".craft-make").click();
    await expect(pack.locator(".craft-made .pack-name")).toHaveText("Steel Demon Sword");
}

test.describe("crafting on a phone held upright", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the list, a piece chosen and what it'd be, inside the panel; made", async ({ page }) => {
        test.setTimeout(300000);
        await onAPhone(page);
    });
});

test.describe("crafting on a phone on its side", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("the list, a piece chosen and what it'd be, inside the panel; made", async ({ page }) => {
        test.setTimeout(300000);
        await onAPhone(page);
    });
});
