import { expect, playing, playUntil, test } from "./fixtures.js";
import { LEFT_OUT, licensedModelsHere } from "../scripts/licensed-models.js";

// A hero's stash (core/progress.js STRONGROOM, core/strongroom.js; docs/GAME.md *The stash*),
// played in a real browser: the great chest in the home town's guild, by the hearth, tapped and
// walked up to, and the stash open beside the pack; a thing tapped sent across, either way;
// dragged to a place, and onto another tab; Sort, and Stow alike; a tab bought, refused without
// the gold; shut by walking off; at a phone's size held upright and on its side; with a
// controller and the keys; and drawn as the halls kit's chest with the licensed models, the
// game's own without them.

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

// Into the home town's guild (seed 2's), the orc out of the way, the game stopped; things laid in
// the pack (`pack`: { slot: thing }) and the stash (`tabs`: [{ place: thing }]), and gold
async function inTheGuild(page, { pack = {}, tabs = [], gold = 100 } = {}) {
    await page.evaluate(
        ({ pack, tabs, gold }) => {
            const { game } = window.pellagos;
            const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "guild" && each.place === "home");
            const player = game.battle.actor("player");
            const [x, y] = building.door.ends[0].squares[0];
            const progress = game.progress;

            game.stop();
            Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
            Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
            game.host.command("player", { type: "enter", link: building.door.id });

            for (let k = 0; k < 20 && player.map === "town"; k++) {
                game.advance(0.25, { render: false });
            }

            progress.gold = gold;
            progress.pack.fill(null);

            for (const [slot, thing] of Object.entries(pack)) {
                progress.pack[Number(slot)] = thing;
            }

            tabs.forEach((tab, k) => {
                for (const [place, thing] of Object.entries(tab)) {
                    progress.strongroom.tabs[k][Number(place)] = thing;
                }
            });
        },
        { pack, tabs, gold },
    );
    await expect.poll(() => page.evaluate(() => window.pellagos.game.battle.actor("player").map)).toMatch(/^home:guild-\d+\/hall$/);
}

// The player stood at a square of the hall, facing east (towards the hearth), and opened at the
// chest if they're asked to be (as a tap on it does, beside it: game.openStrongroom)
async function standAt(page, square, { open = false } = {}) {
    return page.evaluate(
        ({ square: [x, y], open }) => {
            const { game } = window.pellagos;

            Object.assign(game.battle.actor("player"), { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, facing: Math.PI / 2 });
            game.advance(0.1, { render: false });

            return open ? game.openStrongroom() : null;
        },
        { square, open },
    );
}

const middle = async (locator) => {
    const box = await locator.boundingBox();

    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// A thing dragged from one place to another with the mouse, held over `over` first a moment if
// it's given (a tab, turned to as it's held over)
async function drag(page, from, to, { over = null } = {}) {
    const start = await middle(from);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 20, start.y, { steps: 3 });

    if (over) {
        const held = await middle(over);

        await page.mouse.move(held.x, held.y, { steps: 6 });
    }

    const end = await middle(to);

    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
}

// What's in a tab of the stash, and in the pack, by place: [place, id, count] each
const stashed = (page, tab) => page.evaluate((tab) => window.pellagos.game.progress.strongroom.tabs[tab].flatMap((stack, place) => (stack ? [[place, stack.id, stack.count]] : [])), tab);
const carried = (page) => page.evaluate(() => window.pellagos.game.progress.pack.flatMap((stack, slot) => (stack ? [[slot, stack.id, stack.count]] : [])));

const POTION = Object.freeze({ id: "potion", quality: "common" });
const MEAL = Object.freeze({ id: "meal", quality: "common" });

test("the stash: its chest by the guild's hearth tapped and walked up to, the stash open beside the pack; a thing tapped sent across and back, dragged to a place and onto another tab", async ({ page }) => {
    test.setTimeout(300000);
    await playing(page, "/?play&seed=2");
    await inTheGuild(page, { pack: { 0: { ...POTION, count: 3 }, 1: { ...MEAL, count: 2 }, 6: { id: "sword", quality: "fine", count: 1 }, 25: { ...POTION, count: 2 } }, tabs: [{ 9: { id: "ale", quality: "common", count: 4 } }] });

    // Across the room, looking at the hearth; the chest tapped: walked up to it, the stash opens
    const at = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [ox, oz] = game.originOf(player.map);

        Object.assign(player, { square: [12, 5], x: 12.5, y: 5.5, path: [], facing: Math.PI / 2 });

        for (let k = 0; k < 12; k++) {
            game.advance(0.25);
        }

        Object.assign(game.cameraFollow, { yaw: -Math.PI / 2 + 0.3, turning: 0, pitch: 18 });
        game.cameraFollow.heading = { x: 0, z: 0 };
        game.advance(0.05);
        game.start();

        return game.view.toScreen(game.view.camera.position.clone().set(ox + 19.5, 0.5, oz + 5));
    });

    await page.mouse.click(at.x, at.y);
    await page.evaluate(() => window.pellagos.game.stop());
    expect(await playUntil(page, () => window.pellagos.game.pack.open && Boolean(window.pellagos.game.strongroom), { seconds: 20 })).toBe(true);

    const pack = page.locator(".pack.stashing");
    const stash = pack.locator(".stash-section");
    const place = (k) => stash.locator(`.stash-cell[data-place="${k}"]`);
    const slot = (k) => pack.locator(`.carried .pack-cell[data-index="${k}"]`);

    expect(await page.evaluate(() => window.pellagos.game.battle.actor("player").square)).toEqual([18, 5]);
    await expect(pack.locator(".pack-title")).toHaveText("Stash");
    await expect(pack.locator(".pack-gold")).toHaveText("100 gold");
    await expect(stash.locator(".stash-tab")).toHaveCount(6);
    await expect(stash.locator('.stash-tab[aria-selected="true"]')).toHaveText("1");
    await expect(stash.locator(".stash-tab.locked")).toHaveCount(4);
    await expect(stash.locator(".stash-tab.locked").first()).toContainText("10,000");
    await expect(stash.locator(".stash-cell")).toHaveCount(40);
    await expect(place(9)).toHaveAttribute("data-item", "ale");

    // (Side by side on a computer's screen: the stash, then what's carried)
    const [left, right] = await Promise.all([stash.boundingBox(), pack.locator(".carried-section").boundingBox()]);

    expect(left.x + left.width).toBeLessThanOrEqual(right.x);

    // Tapped in the pack: into the tab shown, its first free place; tapped there, back into the
    // pack, onto the draughts alike there
    await slot(0).click();
    expect(await stashed(page, 0)).toEqual([[0, "potion", 3], [9, "ale", 4]]);
    await expect(place(0)).toHaveAttribute("data-item", "potion");
    await expect(slot(0)).toHaveClass(/empty/);
    await slot(1).click();
    await place(0).click();
    expect(await carried(page)).toEqual([[6, "sword", 1], [25, "potion", 5]]);
    expect(await stashed(page, 0)).toEqual([[1, "meal", 2], [9, "ale", 4]]);

    // Dragged from the pack to a place of the tab shown; and from there onto the second tab, held
    // over it (turned to), and let go in its places: the first free one
    await drag(page, slot(6), place(30));
    expect(await stashed(page, 0)).toEqual([[1, "meal", 2], [9, "ale", 4], [30, "sword", 1]]);
    await drag(page, place(30), place(12), { over: stash.locator('.stash-tab[data-tab="1"]') });
    await expect(stash.locator('.stash-tab[aria-selected="true"]')).toHaveText("2");
    expect(await stashed(page, 1)).toEqual([[12, "sword", 1]]);
    expect(await stashed(page, 0)).toEqual([[1, "meal", 2], [9, "ale", 4]]);

    // Dropped on a tab's button: in that tab wherever it goes (from the second, onto the first)
    await drag(page, place(12), stash.locator('.stash-tab[data-tab="0"]'));
    expect(await stashed(page, 1)).toEqual([]);
    expect(await stashed(page, 0)).toEqual([[0, "sword", 1], [1, "meal", 2], [9, "ale", 4]]);
    await stash.locator('.stash-tab[data-tab="0"]').click();
    await expect(stash.locator('.stash-tab[aria-selected="true"]')).toHaveText("1");
});

test("the stash's Sort and Stow alike; held, a thing's card; Enter sends a thing across, Escape shuts it; walked away from, it shuts", async ({ page }) => {
    await playing(page, "/?play&seed=2");
    await inTheGuild(page, { pack: { 3: { ...MEAL, count: 4 }, 25: { ...POTION, count: 5 } }, tabs: [{ 0: { id: "sword", quality: "fine", count: 1 }, 1: { ...MEAL, count: 2 }, 9: { id: "ale", quality: "common", count: 4 } }] });
    expect(await standAt(page, [18, 5], { open: true })).toEqual({ ok: true });

    const pack = page.locator(".pack.stashing");
    const stash = pack.locator(".stash-section");
    const place = (k) => stash.locator(`.stash-cell[data-place="${k}"]`);

    // Sort: the sword, the meal, then the ale, from the first place; Stow alike: the draughts
    // carried stack with none of it, the meals with the meal
    await stash.getByRole("button", { name: "Sort" }).click();
    expect(await stashed(page, 0)).toEqual([[0, "sword", 1], [1, "meal", 2], [2, "ale", 4]]);
    await stash.getByRole("button", { name: "Stow alike" }).click();
    expect(await stashed(page, 0)).toEqual([[0, "sword", 1], [1, "meal", 6], [2, "ale", 4]]);
    expect(await carried(page)).toEqual([[25, "potion", 5]]);

    // Held: what it is, in its card, not sent across (its buttons say what can be done)
    const held = await middle(place(1));

    await page.mouse.move(held.x, held.y);
    await page.mouse.down();
    await expect(pack.locator(".pack-about")).toBeVisible();
    await page.mouse.up();
    await expect(pack.locator(".pack-about").getByRole("button", { name: "Take out: Hot meal" })).toBeVisible();
    expect(await stashed(page, 0)).toEqual([[0, "sword", 1], [1, "meal", 6], [2, "ale", 4]]);

    // The keys (heard while the game's played): Escape puts the card away; Enter on a place sends
    // it across; Escape again shuts it all
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("Escape");
    await expect(pack.locator(".pack-about")).toBeHidden();
    await place(0).focus();
    await page.keyboard.press("Enter");
    expect(await stashed(page, 0)).toEqual([[1, "meal", 6], [2, "ale", 4]]);
    expect(await carried(page)).toEqual([[0, "sword", 1], [25, "potion", 5]]);
    await page.keyboard.press("Escape");
    await expect(page.locator(".pack")).toBeHidden();
    expect(await page.evaluate(() => window.pellagos.game.strongroom)).toBe(null);
    await page.evaluate(() => window.pellagos.game.stop());

    // Open again beside it, then walked away from it: it shuts
    expect(await standAt(page, [18, 5], { open: true })).toEqual({ ok: true });
    await expect(pack).toBeVisible();
    await page.evaluate(() => window.pellagos.game.host.command("player", { type: "move", to: [12, 9] }));
    expect(await playUntil(page, () => !window.pellagos.game.pack.open, { seconds: 10 })).toBe(true);
    expect(
        await page.evaluate(() => {
            const { x, y } = window.pellagos.game.battle.actor("player");

            // (Shut as they went out of reach: further than 2.5 squares from the chest's middle)
            return [window.pellagos.game.strongroom, Math.hypot(x - 19.5, y - 5) > 2.5, Math.hypot(x - 19.5, y - 5) < 4];
        }),
    ).toEqual([null, true, true]);

    // (Not from further off: told where to stand)
    expect(await standAt(page, [14, 5], { open: true })).toEqual({ ok: false, reason: "strongroom" });
});

test("the stash's tabs: one still to buy asked about in the panel, refused without the gold (said why) and bought with it; bought in order; a controller's Cross opens it and sends things across", async ({ page }) => {
    await playing(page, "/?play&seed=2");
    await inTheGuild(page, { pack: { 0: { ...POTION, count: 2 } }, gold: 3200 });

    // (A controller's: what's in front, beside the chest and the camera looking at it, is it;
    // Cross opens it. Played, as a controller's only looked to while the game is)
    await standAt(page, [18, 5]);

    const front = await page.evaluate(() => {
        const { game } = window.pellagos;

        Object.assign(game.cameraFollow, { yaw: -Math.PI / 2, turning: 0 });
        game.start();

        const pick = game.padFront(Infinity);

        game.padDo();
        game.stop();

        return pick && { kind: pick.kind, words: pick.words };
    });

    expect(front).toEqual({ kind: "strongroom", words: "Your stash" });
    await expect(page.locator(".pack.stashing")).toBeVisible();

    const pack = page.locator(".pack.stashing");
    const stash = pack.locator(".stash-section");
    const ask = stash.locator(".stash-ask");

    // Cross on a slot of the pack (a click from no pointer: app/padplay.js): sent across
    await page.evaluate(() => document.querySelector('.carried .pack-cell[data-index="0"]').click());
    expect(await stashed(page, 0)).toEqual([[0, "potion", 2]]);

    // Tab 3 tapped: asked about; Buy, short of the gold: refused, and said why, nothing paid
    await stash.locator('.stash-tab[data-tab="2"]').click();
    await expect(ask).toBeVisible();
    await expect(ask.locator(".stash-ask-title")).toHaveText("Buy tab 3?");
    await expect(ask.locator(".stash-ask-text")).toHaveText("A tab is 10,000 gold, and you have 3,200.");
    await ask.getByRole("button", { name: "Buy tab 3 for 10,000 gold" }).click();
    await expect(ask.locator(".stash-ask-why")).toHaveText("Not enough gold.");
    await expect(page.locator("#banner")).toHaveText("Not enough gold.");
    expect(await page.evaluate(() => [window.pellagos.game.progress.gold, window.pellagos.game.progress.strongroom.tabs.length])).toEqual([3200, 2]);

    // Not now: put away. With the gold: bought, turned to, the gold paid
    await ask.getByRole("button", { name: "Not now" }).click();
    await expect(ask).toHaveCount(0);
    await page.evaluate(() => {
        window.pellagos.game.progress.gold = 25000;
        window.pellagos.game.openStrongroom();
    });
    await expect(pack.locator(".pack-gold")).toHaveText("25,000 gold");
    await stash.locator('.stash-tab[data-tab="2"]').click();
    await ask.getByRole("button", { name: "Buy tab 3 for 10,000 gold" }).click();
    await expect(stash.locator('.stash-tab[aria-selected="true"]')).toHaveText("3");
    await expect(stash.locator(".stash-tab.locked")).toHaveCount(3);
    await expect(ask).toHaveCount(0);
    await expect(pack.locator(".pack-gold")).toHaveText("15,000 gold");
    expect(await page.evaluate(() => window.pellagos.game.progress.strongroom.tabs.length)).toBe(3);

    // Tab 6 tapped: tab 4's to be bought first, and it's tab 4 that's bought
    await stash.locator('.stash-tab[data-tab="5"]').click();
    await expect(ask.locator(".stash-ask-title")).toHaveText("Tab 4 first");
    await ask.getByRole("button", { name: "Buy tab 4 for 10,000 gold" }).click();
    await expect(stash.locator('.stash-tab[aria-selected="true"]')).toHaveText("4");
    expect(await page.evaluate(() => [window.pellagos.game.progress.gold, window.pellagos.game.progress.strongroom.tabs.length])).toEqual([5000, 4]);

    // Cross on a place of the stash (the first tab's, turned back to): back into the pack
    await stash.locator('.stash-tab[data-tab="0"]').click();
    await page.evaluate(() => document.querySelector('.stash-cell[data-place="0"]').click());
    expect(await carried(page)).toEqual([[0, "potion", 2]]);
});

// The stash opened at a phone's size (`viewport`), something carried and something tapped across:
// where the stash and the pack are, and the panel's place on the screen
async function onAPhone(page) {
    await playing(page, "/?play&seed=2");
    await inTheGuild(page, { pack: { 0: { ...POTION, count: 2 }, 1: { ...MEAL, count: 1 } } });
    await standAt(page, [18, 5], { open: true });

    const pack = page.locator(".pack.stashing");
    const stash = pack.locator(".stash-section");

    await expect(pack).toBeVisible();
    await pack.locator('.carried .pack-cell[data-index="1"]').click();
    expect(await stashed(page, 0)).toEqual([[0, "meal", 1]]);

    const [upper, lower, first, ninth, tenth] = await Promise.all([stash, pack.locator(".carried-section"), ...[0, 8, 9].map((k) => stash.locator(`.stash-cell[data-place="${k}"]`))].map((each) => each.boundingBox()));
    // (The panel on the screen, nothing scrolled across; the stash's six tabs in a row, inside it)
    const fits = await page.evaluate(() => {
        const panel = document.querySelector(".pack").getBoundingClientRect();
        const tabs = [...document.querySelectorAll(".stash-tab")].map((tab) => tab.getBoundingClientRect());

        return { across: document.documentElement.scrollWidth <= innerWidth, left: panel.left >= 0, right: panel.right <= innerWidth, bottom: panel.bottom <= innerHeight, tabs: tabs.every(({ right, top }) => right <= panel.right - 8 && Math.abs(top - tabs[0].top) < 2) };
    });

    expect(fits).toEqual({ across: true, left: true, right: true, bottom: true, tabs: true });
    expect(first.width).toBeGreaterThanOrEqual(30);

    // (And tapped there: back into the pack)
    await stash.locator('.stash-cell[data-place="0"]').click();
    expect(await carried(page)).toEqual([[0, "potion", 2], [1, "meal", 1]]);

    return { upper, lower, first, ninth, tenth };
}

test.describe("the stash on a phone held upright", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the stash over the pack, both across the panel, eight places a row, all of it on the screen; tapped, things go across", async ({ page }) => {
        const { upper, lower, first, ninth } = await onAPhone(page);

        expect(upper.y + upper.height).toBeLessThanOrEqual(lower.y);
        expect(Math.abs(upper.x - lower.x)).toBeLessThan(2);
        expect(ninth.y).toBeGreaterThan(first.y);
    });
});

test.describe("the stash on a phone on its side", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("the stash and the pack side by side, the stash ten places a row, all of it on the screen; tapped, things go across", async ({ page }) => {
        const { upper, lower, first, tenth } = await onAPhone(page);

        expect(upper.x + upper.width).toBeLessThanOrEqual(lower.x);
        expect(Math.abs(tenth.y - first.y)).toBeLessThan(2);
    });
});

// How the guild's stash's chest is drawn: the halls kit's chest in its hall, and whether the
// game's own furnishing there (the kit's stand-ins) is drawn; played a frame at a time till it's as
// `wanted`, the kit read if it's to be
async function chestDrawn(page, wanted) {
    const drawn = () =>
        page.evaluate(() => {
            const { game } = window.pellagos;
            let [chest, standing] = [false, null];

            game.interiors.get(game.mapId)?.object.traverse((node) => {
                if (node.name === "prop-medieval-hall-chest") {
                    chest = true;
                } else if (node.name === "kit-stand-ins") {
                    standing = node.visible;
                }
            });

            return { chest, standing };
        });

    await expect
        .poll(
            async () => {
                await page.evaluate(() => window.pellagos.game.advance(0.1, { render: true, wait: true }));

                return drawn();
            },
            { timeout: 120000, intervals: [500] },
        )
        .toEqual(wanted);
}

test("the stash's chest drawn with the licensed models: the halls kit's, the game's own put away; opened at it", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    test.setTimeout(240000);
    await playing(page, "/?play&seed=2");
    await inTheGuild(page);
    await standAt(page, [18, 5]);
    await chestDrawn(page, { chest: true, standing: false });
    expect(await page.evaluate(() => window.pellagos.game.openStrongroom())).toEqual({ ok: true });
    await expect(page.locator(".pack.stashing")).toBeVisible();
});

test("the stash's chest drawn without the licensed models: the game's own great chest in its place; opened at it the same", async ({ page }) => {
    test.setTimeout(240000);
    await page.route("**/models/scenery/**", (route) => (route.request().url().includes(".bin") ? route.abort() : route.continue()));
    await playing(page, "/?play&seed=2");
    await inTheGuild(page);
    await standAt(page, [18, 5]);
    await chestDrawn(page, { chest: false, standing: true });
    expect(await page.evaluate(() => window.pellagos.game.openStrongroom())).toEqual({ ok: true });
    await expect(page.locator(".pack.stashing")).toBeVisible();
});
