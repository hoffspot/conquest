import { expect, test } from "./fixtures.js";
import { BUTTONS } from "../client/js/app/gamepad.js";

// The keys, mouse buttons and controller buttons for the game's actions, set on the Bindings page
// (Game options, Controls: app/keys.js, app/gamepad.js), and the handhelds' presets
// (app/handhelds.js), in a real browser.

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

async function playing(page, address) {
    await page.goto(address);
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000, polling: 250 });
}

// The menu opened by its button, and Game options, Controls, Bindings
async function bindings(page) {
    await page.locator("#menubutton").click();
    await page.waitForFunction(() => document.querySelector("#menu").open);

    for (const button of ["#optionsbutton", "#controlsbutton", "#bindingsbutton"]) {
        await page.locator(button).click();
    }

    await expect(page.locator("#menubindings")).toBeVisible();
}

// Back from Bindings to the menu's first page, and Resume
async function resume(page) {
    for (const button of ["#bindingsback", "#controlsback", "#optionsback", "#resumebutton"]) {
        await page.locator(button).click();
    }

    await page.waitForFunction(() => !document.querySelector("#menu").open);
}

const slot = (page, action, which) => page.locator(`.bind[data-action="${action}"] .bind-slot[data-slot="${which}"]`);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.settings") ?? "{}"));

test("keys set on the Bindings page: an action chosen and a key pressed, taken from what had it (and said), a mouse button, Escape; played with as set, and every key as it came", async ({ page }) => {
    test.setTimeout(360000);
    await playing(page, "/?play&seed=1");
    await bindings(page);

    // As they come, a main key and a spare
    await expect(slot(page, "forward", 0)).toHaveText("W");
    await expect(slot(page, "forward", 1)).toHaveText("↑");
    await expect(slot(page, "lastFoe", 0)).toHaveText("Shift+Tab");
    await expect(page.locator("#bindreset")).toBeDisabled();

    // The Journal chosen by its name, K pressed: its key
    await page.locator('.bind[data-action="journal"] .bind-name').click();
    await expect(page.locator('.bind[data-action="journal"] .bind-ask')).toHaveText("Press a key or click…");
    await page.keyboard.press("k");
    await expect(slot(page, "journal", 0)).toHaveText("K");

    // The Pack's key chosen, K pressed: the Journal lets it go, and that's said
    await slot(page, "pack", 0).click();
    await page.keyboard.press("k");
    await expect(slot(page, "pack", 0)).toHaveText("K");
    await expect(slot(page, "journal", 0)).toHaveText("—");
    await expect(page.locator("#bindtold")).toHaveText("Taken from The Journal: choose it to give it another.");

    // The Journal's spare: the right mouse button
    await slot(page, "journal", 1).click();
    await page.mouse.click(500, 300, { button: "right" });
    await expect(slot(page, "journal", 1)).toHaveText("Right click");

    // Escape set as the world map's spare: set, the menu not closed by it; the menu's own taken
    await slot(page, "map", 1).click();
    await page.keyboard.press("Escape");
    await expect(slot(page, "map", 1)).toHaveText("Esc");
    await expect(slot(page, "menu", 0)).toHaveText("—");
    expect(await page.evaluate(() => document.querySelector("#menu").open)).toBe(true);
    expect((await saved(page)).keyBindings).toEqual({ pack: ["KeyK", null], journal: [null, "Mouse2"], map: ["KeyM", "Escape"], menu: [null, null] });

    // A box chosen and cleared; a choice given up
    await slot(page, "map", 1).click();
    await page.locator('.bind[data-action="map"] .bind-clear').click();
    await expect(slot(page, "map", 1)).toHaveText("—");
    await slot(page, "stop", 0).click();
    await page.locator('.bind[data-action="stop"] .bind-cancel').click();
    await expect(slot(page, "stop", 0)).toHaveText("C");

    // Played: K opens the Pack (the hint says so), a right click the Journal; the menu's button,
    // with no key of its own, says none
    await resume(page);
    await expect(page.locator('#hint [data-keys="pack"]')).toHaveText("K");
    await expect(page.locator("#menubutton")).toHaveAttribute("title", "Menu");
    await page.keyboard.press("k");
    await page.waitForFunction(() => window.pellagos.game.pack?.open);
    await page.keyboard.press("k");
    await page.waitForFunction(() => !window.pellagos.game.pack?.open);
    await page.mouse.click(500, 300, { button: "right" });
    await page.waitForFunction(() => window.pellagos.game.journal?.open);
    await page.locator("#journalbutton").click();

    // Every key as it came: I the Pack's again, Escape the menu's
    await bindings(page);
    await page.locator("#bindreset").click();
    await expect(slot(page, "pack", 0)).toHaveText("I");
    await expect(slot(page, "menu", 0)).toHaveText("Esc");
    await expect(page.locator("#bindreset")).toBeDisabled();
    expect((await saved(page)).keyBindings).toEqual({});
    await resume(page);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("#menu").open);
});

test("a controller's actions on keys: G held opens your own wheel, the keys that move aim it; O held, the ring of panels, W its world map; F does what's in front, C stops, = and - zoom", async ({ page }) => {
    test.setTimeout(360000);
    await playing(page, "/?play&seed=1&weapon=sword");

    // G held: your own wheel, open round you; the player not walked by D while it aims; let go, put away
    const at = await page.evaluate(() => {
        const me = window.pellagos.game.battle.actor(window.pellagos.game.me);

        return { x: me.x, y: me.y };
    });

    await page.keyboard.down("g");
    await page.waitForFunction(() => window.pellagos.game.wheel?.open && window.pellagos.game.keyWheel);
    await page.keyboard.down("d");
    await page.waitForTimeout(400);
    await page.keyboard.up("d");
    expect(await page.evaluate(([x, y]) => {
        const me = window.pellagos.game.battle.actor(window.pellagos.game.me);

        return Math.hypot(me.x - x, me.y - y);
    }, [at.x, at.y])).toBeLessThan(0.05);
    await page.keyboard.up("g");
    await page.waitForFunction(() => !window.pellagos.game.keyWheel);

    // O held: the ring of panels; W, its top slice, the world map
    await page.keyboard.down("o");
    await expect(page.locator(".padring")).toBeVisible();
    await page.keyboard.press("w");
    await page.waitForFunction(() => document.querySelector("#worldmap").open);
    await page.keyboard.up("o");
    await expect(page.locator(".padring")).toBeHidden();
    await page.keyboard.press("m");
    await page.waitForFunction(() => !document.querySelector("#worldmap").open);

    // F, C, V, = and -: what a controller's ✕, ○, ○ held and the D-pad's up and down do (what each
    // does is the controller's tests')
    await page.evaluate(() => {
        const game = window.pellagos.game;

        window.done = [];

        for (const name of ["padDo", "padStop", "padUnlock", "padZoom"]) {
            const was = game[name].bind(game);

            game[name] = (...args) => {
                window.done.push([name, ...args]);

                return was(...args);
            };
        }
    });

    for (const key of ["f", "c", "v", "=", "-"]) {
        await page.keyboard.press(key);
    }

    expect(await page.evaluate(() => window.done)).toEqual([["padDo"], ["padStop"], ["padUnlock"], ["padZoom", 0.8], ["padZoom", 1.25]]);
});

test("a handheld's preset: offered once on what looks like a Steam Deck, chosen: its back buttons' keys and how to set them in Steam, its dead zone and larger text", async ({ page }) => {
    test.setTimeout(360000);

    // A Steam Deck's controller as Chrome names it on SteamOS with Steam closed: seen once a button's pressed
    await page.addInitScript((names) => {
        const pad = { id: "Valve Software Steam Deck Controller (STANDARD GAMEPAD Vendor: 28de Product: 1205)", index: 0, connected: true, mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0], buttons: names.map(() => ({ pressed: false, touched: false, value: 0 })) };

        window.standIn = {
            connected: false,
            connect() {
                this.connected = true;
                window.dispatchEvent(Object.assign(new Event("gamepadconnected"), { gamepad: pad }));
            },
        };
        navigator.getGamepads = () => (window.standIn.connected ? [pad] : []);
    }, BUTTONS);
    await playing(page, "/?play&seed=1");

    // Seen: told once there's a preset for it
    await page.evaluate(() => window.standIn.connect());
    // (Read from those kept for the journal, not the banner, which another may take over)
    await page.waitForFunction(() => window.pellagos.game.messages.some(({ text }) => text === "Playing on a Steam Deck? Game options, Controls, Bindings has a preset for it."), null, { timeout: 30000 });
    expect((await saved(page)).handheldOffered).toBe(true);

    // The Bindings page says what it looks like; its preset chosen
    await bindings(page);
    await expect(page.locator("#handheldguess")).toHaveText("This looks like a Steam Deck: its preset's under Handheld presets.");
    await page.locator("#handheldsbutton").click();
    await page.locator('.handheld[data-handheld="steamDeck"]').click();
    await expect(page.locator("#menubindings")).toBeVisible();
    await expect(page.locator("#handheldname")).toHaveText("Steam Deck");
    await expect(page.locator("#handheldguess")).toBeHidden();
    await expect(page.locator("#handheldsteps")).toContainText("set L4 to G, R4 to T, L5 to M and R5 to J, each as a keyboard key");

    const settings = await saved(page);

    expect([settings.handheld, settings.padDeadZone, settings.textSize]).toEqual(["steamDeck", 0.15, "large"]);
    expect(await page.evaluate(() => document.body.dataset.text)).toBe("large");

    // The map's key moved: the steps say the new one
    await slot(page, "map", 0).click();
    await page.keyboard.press("n");
    await expect(page.locator("#handheldsteps")).toContainText("L5 to N");
});
