import { expect, playing, test } from "./fixtures.js";
import { BUTTONS } from "../client/js/app/gamepad.js";

// Junk (core/progress.js isJunk, junkSale; core/host.js #sellJunk; app/pack.js; docs/GAME.md
// *Junk*), played in a real browser: things in the pack marked as junk by their cards, by J and
// by a controller's Triangle, the tag on their slots, Sort putting them last, the tag in the
// stash; and on a shop's Sell tab, Sell all junk asked about in the panel with its total, Not now
// doing nothing and Sell selling it all, the gold shown in the panel and on the player's plate;
// at a shop that won't buy all of it, what's left said, still junk; on a phone held upright and on
// its side.

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

const POTION = Object.freeze({ id: "potion", quality: "common" });
const MEAL = Object.freeze({ id: "meal", quality: "common" });
const ALE = Object.freeze({ id: "ale", quality: "common" });
const PELT = Object.freeze({ id: "wolfPelt", quality: "common" });

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

// Into one of the home town's buildings (seed 2's: its guild, or its tavern, where its barkeep
// is) by its door from the town, as the stash's tests go in
async function into(page, kind) {
    await page.evaluate((kind) => {
        const { game } = window.pellagos;
        const barkeep = kind === "tavern" ? game.battle.actors.find((actor) => actor.role === "barkeep") : null;
        const door = barkeep ? game.battle.links.find(({ ends }) => ends.some(({ map }) => map === barkeep.map) && ends.some(({ map }) => map === "town")) : [...game.world.interiors.buildings.values()].find((each) => each.kind === kind && each.place === "home").door;
        const player = game.battle.actor("player");
        const [x, y] = door.ends.find(({ map }) => map === "town").squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.host.command("player", { type: "enter", link: door.id });

        for (let k = 0; k < 20 && player.map === "town"; k++) {
            game.advance(0.25, { render: false });
        }
    }, kind);
    await expect.poll(() => page.evaluate(() => window.pellagos.game.battle.actor("player").map)).not.toBe("town");
}

// Up to one of the folk who keeps a shop in the building the player's in (`role`: the guild's
// receptionist, or the tavern's barkeep), talked to as a tap does, and the choice to trade with
// them chosen: their wares in the pack. Played on by hand till the talk's begun
async function trading(page, role) {
    await page.evaluate((role) => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const keeper = game.battle.actors.find((actor) => actor.role === role && actor.map === player.map);

        Object.assign(player, { square: [keeper.square[0], keeper.square[1] + 1], x: keeper.square[0] + 0.5, y: keeper.square[1] + 1.5, path: [], order: null });
        game.approaching = keeper.id;
        game.battle.command("player", { type: "approach", target: keeper.id });

        for (let k = 0; k < 300 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        const { conversation } = game.talking;

        game.talk.onChoose(conversation.choices.findIndex(({ text }) => /buy or sell|for sale/i.test(text)));
        game.advance(0.05, { render: false });
    }, role);
    await expect(page.locator(".pack .pack-title")).toContainText("Trading with");
}

// What's carried, by slot: [slot, id, count, junk] each
const carried = (page) => page.evaluate(() => window.pellagos.game.progress.pack.flatMap((stack, slot) => (stack ? [[slot, stack.id, stack.count, stack.junk === true]] : [])));

test("things marked as junk in the pack: by their cards and by J, a tag on their slots, Sort putting them last; the tag in the stash, the mark going in and out with them", async ({ page }) => {
    test.setTimeout(300000);
    await playing(page, "/?play&seed=2");
    await carrying(page, { pack: { 0: { ...POTION, count: 3 }, 1: { ...MEAL, count: 2 }, 2: { id: "sword", quality: "fine", count: 1 }, 3: { ...PELT, count: 2 } } });
    await page.evaluate(() => window.pellagos.game.togglePack());

    const pack = page.locator(".pack");
    const slot = (k) => pack.locator(`.carried .pack-cell[data-index="${k}"]`);
    const about = pack.locator(".pack-about");

    // Tapped: its card, Mark as junk among what can be done; marked, its slot tagged
    await slot(0).click();
    await expect(about.getByRole("button", { name: "Mark as junk: Healing draught" })).toBeVisible();
    await about.getByRole("button", { name: "Mark as junk: Healing draught" }).click();
    await expect(slot(0)).toHaveClass(/junk/);
    await expect(slot(0).locator(".pack-junk")).toBeVisible();
    await expect(slot(0)).toHaveAttribute("aria-label", "Healing draught, 3, marked as junk");
    expect(await carried(page)).toEqual([[0, "potion", 3, true], [1, "meal", 2, false], [2, "sword", 1, false], [3, "wolfPelt", 2, false]]);

    // Its card says so, and offers Not junk; Escape puts it away (the game played, as keys are
    // heard)
    await slot(0).click();
    await expect(about.locator(".pack-junk-note")).toHaveText("Marked as junk: Sell all junk sells it from your pack at any shop that buys it.");
    await expect(about.getByRole("button", { name: "Not junk: Healing draught" })).toBeVisible();
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("Escape");
    await expect(about).toBeHidden();

    // J: what the pointer's over marked, and again unmarked
    await slot(3).hover();
    await page.keyboard.press("j");
    await expect(slot(3)).toHaveClass(/junk/);
    await slot(1).hover();
    await page.keyboard.press("j");
    await expect(slot(1)).toHaveClass(/junk/);
    await page.keyboard.press("j");
    await expect(slot(1)).not.toHaveClass(/junk/);
    expect(await carried(page)).toEqual([[0, "potion", 3, true], [1, "meal", 2, false], [2, "sword", 1, false], [3, "wolfPelt", 2, true]]);

    // (Not the Journal, with the Pack open; the Journal, with it shut)
    expect(await page.evaluate(() => window.pellagos.game.journal?.open ?? false)).toBe(false);

    // Sort: the junk after everything else
    await pack.getByRole("button", { name: "Put the pack in order" }).click();
    expect(await carried(page)).toEqual([[0, "sword", 1, false], [1, "meal", 2, false], [2, "potion", 3, true], [3, "wolfPelt", 2, true]]);
    await expect(slot(2)).toHaveClass(/junk/);
    await expect(slot(0)).not.toHaveClass(/junk/);
    await page.keyboard.press("Escape");
    await expect(pack).toBeHidden();
    await page.keyboard.press("j");
    await page.waitForFunction(() => window.pellagos.game.journal?.open);
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.pellagos.game.stop());

    // At the guild's chest: tagged in the stash, junk still going in and coming out
    await into(page, "guild");
    expect(
        await page.evaluate(() => {
            const { game } = window.pellagos;

            Object.assign(game.battle.actor("player"), { square: [18, 5], x: 18.5, y: 5.5, path: [], order: null, facing: Math.PI / 2 });
            game.advance(0.1, { render: false });

            return game.openStrongroom();
        }),
    ).toEqual({ ok: true });

    const stash = pack.locator(".stash-section");

    await expect(pack.locator('.carried .pack-cell[data-index="2"]')).toHaveClass(/junk/);
    await pack.locator('.carried .pack-cell[data-index="2"]').click();
    await expect(stash.locator('.stash-cell[data-place="0"]')).toHaveClass(/junk/);
    await expect(stash.locator('.stash-cell[data-place="0"] .pack-junk')).toBeVisible();
    expect(await page.evaluate(() => window.pellagos.game.progress.strongroom.tabs[0][0])).toEqual({ ...{ id: "potion", quality: "common" }, count: 3, junk: true });
    await stash.locator('.stash-cell[data-place="0"]').click();
    expect(await carried(page)).toEqual([[0, "sword", 1, false], [1, "meal", 2, false], [2, "potion", 3, true], [3, "wolfPelt", 2, true]]);
});

test("Sell all junk at the guild: asked in the panel with its total, Not now doing nothing, Sell selling it all, the gold on the panel and the plate; a row's card marks it too", async ({ page }) => {
    test.setTimeout(300000);
    await playing(page, "/?play&seed=2");
    await carrying(page, { pack: { 0: { ...POTION, count: 3, junk: true }, 1: { ...MEAL, count: 2 }, 2: { ...PELT, count: 4, junk: true }, 3: { ...ALE, count: 5 } }, gold: 30 });
    await into(page, "guild");
    await trading(page, "receptionist");

    const pack = page.locator(".pack");
    const modes = pack.locator(".pack-modes");

    await modes.getByRole("tab", { name: "Sell" }).click();

    const row = (item) => pack.locator(`.selling .pack-row[data-item="${item}"]`);
    const bar = pack.locator(".junk-bar");
    const ask = pack.locator(".junk-ask");
    // (What it comes to, as the host pays it: core/progress.js junkSale)
    const total = await page.evaluate(() => {
        const { game } = window.pellagos;
        const haggle = game.progress.bonuses().haggle;

        return game.progress.pack.filter((stack) => stack?.junk).reduce((sum, stack) => sum + Math.max(1, Math.round((stack.id === "wolfPelt" ? 1 : 0.4) * { potion: 15, wolfPelt: 7 }[stack.id] * (1 + haggle))) * stack.count, 0);
    });

    // The junk tagged on its rows; the bar says what it comes to
    await expect(row("potion")).toHaveClass(/junk/);
    await expect(row("potion").locator(".pack-junk")).toBeVisible();
    await expect(row("meal")).not.toHaveClass(/junk/);
    await expect(bar.locator(".junk-said")).toHaveText(`Junk: 7 things, ${total} gold here.`);

    // A row's card: Mark as junk (the ale)
    await row("ale").locator(".pack-peek").click();
    await row("ale").getByRole("button", { name: "Mark as junk: Tankard of ale" }).click();
    await expect(row("ale")).toHaveClass(/junk/);
    await expect(bar.locator(".junk-said")).toHaveText(`Junk: 12 things, ${total + 5} gold here.`);

    // Asked first, in the panel: Not now, nothing sold
    await bar.getByRole("button", { name: "Sell all junk: 12 things for " + (total + 5) + " gold" }).click();
    await expect(ask).toBeVisible();
    await expect(ask.locator(".stash-ask-title")).toHaveText(`Sell 12 things for ${total + 5} gold?`);
    await expect(ask.locator(".stash-ask-text")).toHaveText("Sold, it can't be bought back.");
    await expect(ask.getByRole("button", { name: `Sell 12 things for ${total + 5} gold` })).toBeFocused();
    await ask.getByRole("button", { name: "Not now" }).click();
    await expect(ask).toHaveCount(0);
    expect(await page.evaluate(() => window.pellagos.game.progress.gold)).toBe(30);
    expect(await carried(page)).toEqual([[0, "potion", 3, true], [1, "meal", 2, false], [2, "wolfPelt", 4, true], [3, "ale", 5, true]]);

    // Sell: all of it gone, the meals kept; the gold on the panel and on the player's plate
    await bar.getByRole("button", { name: /^Sell all junk/ }).click();
    await ask.getByRole("button", { name: `Sell 12 things for ${total + 5} gold` }).click();
    await expect(pack.locator(".pack-gold")).toHaveText(`${30 + total + 5} gold`);
    await expect(page.locator("#playerplate .coins")).toHaveText(`${30 + total + 5} gold`);
    await expect(ask).toHaveCount(0);
    expect(await carried(page)).toEqual([[1, "meal", 2, false]]);
    await expect(bar.getByRole("button", { name: /^Sell all junk/ })).toBeDisabled();
    await expect(bar.locator(".junk-said")).toHaveText("Nothing marked as junk: mark things as junk in their cards, and sell them all here at once.");
});

test("Sell all junk at a tavern: only the ale and meals it buys; the rest still junk, and said", async ({ page }) => {
    test.setTimeout(300000);
    await playing(page, "/?play&seed=2");
    await carrying(page, { pack: { 0: { ...ALE, count: 3, junk: true }, 1: { ...PELT, count: 2, junk: true }, 2: { ...MEAL, count: 1 }, 3: { ...POTION, count: 1, junk: true } }, gold: 0 });
    await into(page, "tavern");
    await trading(page, "barkeep");

    const pack = page.locator(".pack");

    await pack.locator(".pack-modes").getByRole("tab", { name: "Sell" }).click();

    const bar = pack.locator(".junk-bar");
    const ask = pack.locator(".junk-ask");
    const left = pack.locator(".junk-left");

    await expect(bar.locator(".junk-said")).toHaveText("Junk: 3 things, 3 gold here.");
    await expect(left).toHaveText(/^Still junk, as .+ won't buy them: 2 wolf pelts, a healing draught\. The adventurers' guild buys everything\.$/);
    await bar.getByRole("button", { name: "Sell all junk: 3 things for 3 gold" }).click();
    await expect(ask.locator(".stash-ask-title")).toHaveText("Sell 3 things for 3 gold?");
    await expect(ask.locator(".stash-ask-text")).toHaveText("What they won't buy (3 things) stays marked as junk. Sold, it can't be bought back.");
    await ask.getByRole("button", { name: "Sell 3 things for 3 gold" }).click();
    await expect(pack.locator(".pack-gold")).toHaveText("3 gold");
    expect(await carried(page)).toEqual([[1, "wolfPelt", 2, true], [2, "meal", 1, false], [3, "potion", 1, true]]);

    // (Said as it's heard, with the next step)
    await page.evaluate(() => window.pellagos.game.advance(0.1, { render: false }));
    await expect(page.locator("#banner")).toHaveText("You sell your junk: 3 things for 3 gold. 3 things they won't buy are still marked as junk: the adventurers' guild buys everything.");

    // Now nothing they'd buy: the button greyed, and why
    await expect(bar.getByRole("button", { name: /^Sell all junk/ })).toBeDisabled();
    await expect(bar.locator(".junk-said")).toHaveText(/ buys none of your junk\.$/);
    await expect(left).toBeVisible();
    await expect(pack.locator('.selling .pack-row[data-item="wolfPelt"]')).toHaveClass(/junk/);
});

// A stand-in game controller (as e2e/controller.spec.js gives one): navigator.getGamepads gives a
// controller of the standard layout, its buttons set by the test, a press down for one frame
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

test("a controller's Triangle marks what's in focus in the Pack as junk, or not, its prompt saying so; the focus kept on it", async ({ page }) => {
    test.setTimeout(300000);

    const pad = await standIn(page);

    await playing(page, "/?play&seed=2");
    await carrying(page, { pack: { 0: { ...POTION, count: 2 }, 1: { ...MEAL, count: 1 } } });
    await page.evaluate(() => window.pellagos.game.start());
    await pad.connect();
    await pad.press("square");
    await page.waitForFunction(() => window.pellagos.game.pack.open, null, { timeout: 30000 });

    const slot = (k) => page.locator(`.pack .carried .pack-cell[data-index="${k}"]`);

    await slot(1).focus();
    await expect(page.locator(".padprompts")).toContainText("△ Junk");
    await pad.press("triangle");
    await expect(slot(1)).toHaveClass(/junk/);
    await expect(slot(1)).toBeFocused();
    expect(await carried(page)).toEqual([[0, "potion", 2, false], [1, "meal", 1, true]]);
    await pad.press("triangle");
    await expect(slot(1)).not.toHaveClass(/junk/);
    expect(await carried(page)).toEqual([[0, "potion", 2, false], [1, "meal", 1, false]]);
    await pad.press("circle");
    await page.waitForFunction(() => !window.pellagos.game.pack.open, null, { timeout: 30000 });
});

// The guild's Sell tab at a phone's size (`viewport`), junk carried: the bar and the question on
// the screen, nothing scrolled across, and sold
async function onAPhone(page) {
    await playing(page, "/?play&seed=2");
    await carrying(page, { pack: { 0: { ...POTION, count: 2, junk: true }, 1: { ...MEAL, count: 1 }, 2: { ...PELT, count: 3, junk: true } }, gold: 10 });
    await into(page, "guild");
    await trading(page, "receptionist");

    const pack = page.locator(".pack");
    const bar = pack.locator(".junk-bar");
    const ask = pack.locator(".junk-ask");

    await pack.locator(".pack-modes").getByRole("tab", { name: "Sell" }).click();
    await bar.getByRole("button", { name: /^Sell all junk/ }).click();
    await expect(ask).toBeVisible();

    const fits = await page.evaluate(() => {
        const panel = document.querySelector(".pack").getBoundingClientRect();
        const inside = (selector) => {
            const box = document.querySelector(selector).getBoundingClientRect();

            return box.left >= panel.left && box.right <= panel.right && box.top >= 0 && box.bottom <= innerHeight;
        };

        return { across: document.documentElement.scrollWidth <= innerWidth, panel: panel.left >= 0 && panel.right <= innerWidth, bar: inside(".junk-bar"), ask: inside(".junk-ask"), sell: inside(".junk-ask .primary") };
    });

    expect(fits).toEqual({ across: true, panel: true, bar: true, ask: true, sell: true });
    await ask.locator(".primary").click();
    await expect(ask).toHaveCount(0);
    expect(await carried(page)).toEqual([[1, "meal", 1, false]]);
    expect(await page.evaluate(() => window.pellagos.game.progress.gold)).toBeGreaterThan(10);
}

test.describe("Sell all junk on a phone held upright", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the bar and the question on the screen, inside the panel; sold", async ({ page }) => {
        test.setTimeout(300000);
        await onAPhone(page);
    });
});

test.describe("Sell all junk on a phone on its side", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("the bar and the question on the screen, inside the panel; sold", async ({ page }) => {
        test.setTimeout(300000);
        await onAPhone(page);
    });
});
