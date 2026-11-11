import { expect, keeping, playing, test } from "./fixtures.js";
import { BUTTONS } from "../client/js/app/gamepad.js";

// Playing with a game controller (app/padplay.js), in a real browser. A test can't pair a real one,
// so the page is given a stand-in: navigator.getGamepads gives a controller of the standard layout,
// named as a PS5 controller is, whose buttons and sticks the test sets (`pad`). The game reads it
// once a frame, and frames are slow without a GPU, so a press is down for one frame exactly, and
// up for the next; and what's waited on is what the game does.

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

const SAVE = { version: 1, seed: 4242, created: "2026-10-13T12:00:00.000Z", hero: { name: "Ada", weapon: "sword", race: "human", parts: [], shape: {}, look: {} } };

// The stand-in controller, put in the page before it's loaded: unseen till `connect`ed (a real one
// is seen once a button's pressed with the page in front)
async function standIn(page, { settings = { sound: false }, save = null } = {}) {
    // (Laid down the first time only, over the tests' cheap drawing: what's set in Game options is
    // kept from load to load)
    await keeping(page, settings);
    await page.addInitScript(
        ([names, save]) => {
            if (save && !localStorage.getItem("pellagos.save")) {
                localStorage.setItem("pellagos.save", JSON.stringify(save));
            }

            const pad = { id: "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)", index: 0, connected: true, mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0], buttons: names.map(() => ({ pressed: false, touched: false, value: 0 })) };
            // (The frames, counted at the start of each, before the game's own work in it: what's
            // read in a frame, by the game or by a page of Game options asking whether it can rumble,
            // and what's read between frames, is the same, as a real controller's is. Taps counted
            // by the read, a page reading it once more as the game's frame worked a press could let
            // that tap go before the game's next frame, and the next tap be taken for it still held)
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
                // (Down for the next frame's reading alone, up again for the one after: a tap,
                // however slow the frames or the test)
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

                // (A frame's first reading: taps go on to it; those read since let go)
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
        },
        [BUTTONS, save],
    );

    // (Till the controller's been read in `times` more frames)
    const read = async (times = 2) => {
        const from = await page.evaluate(() => window.standIn.reads);

        await page.waitForFunction(([from, times]) => window.standIn.reads >= from + times, [from, times], { polling: 50 });
    };

    return {
        connect: () => page.evaluate(() => window.standIn.connect()),
        // (Down for one frame, so slow frames never make it a hold or the D-pad's repeat, and
        // read up in two after)
        async press(name) {
            await page.evaluate((name) => window.standIn.tap(name), name);
            await read(3);
        },
        async hold(name, down = true) {
            await page.evaluate(([name, down]) => window.standIn.set(name, down ? 1 : 0), [name, down]);
            await read();
        },
        async sticks(axes) {
            await page.evaluate((axes) => (window.standIn.pad.axes = axes), axes);
            await read();
        },
        read,
    };
}

test("a game controller plays: walks, looks, talks to who's in front, the Action Bar on R2, a wheel, the Pack and the menu", async ({ page }) => {
    // (Walking up to the crier takes a while, a frame or two a second without a GPU)
    test.setTimeout(480000);

    const pad = await standIn(page);

    await playing(page, "/?play&seed=1&weapon=sword");
    await pad.connect();

    const where = () => page.evaluate(() => {
        const game = window.pellagos.game;
        const me = game.battle.actor(game.me);

        return { x: me.x, y: me.y, yaw: game.cameraFollow.yaw };
    });

    // The left stick walks; the right stick turns the camera; the page knows it's the controller
    const start = await where();

    await pad.sticks([0, -1, 0, 0]);
    await page.waitForFunction(([x, y]) => {
        const game = window.pellagos.game;
        const me = game.battle.actor(game.me);

        return Math.hypot(me.x - x, me.y - y) > 0.2;
    }, [start.x, start.y], { timeout: 30000 });
    await pad.sticks([0, 0, 1, 0]);
    await page.waitForFunction((yaw) => Math.abs(window.pellagos.game.cameraFollow.yaw - yaw) > 0.05, start.yaw, { timeout: 30000 });
    await pad.sticks([0, 0, 0, 0]);
    expect(await page.evaluate(() => document.body.dataset.pad)).toBe("on");

    // Before the town crier, the camera looking at him: he's what's in front, marked "✕ Talk", and
    // Cross talks to him; Circle ends it
    const crier = "crier:human-town-6";

    await page.evaluate((id) => {
        const game = window.pellagos.game;
        const them = game.battle.actor(id);

        game.host.command(game.me, { type: "move", to: [Math.floor(them.x) + 1, Math.floor(them.y) + 1] });
    }, crier);
    // (Walked there a frame at a time, no more than a tenth of a second each, every frame drawn in
    // software looking out across the land: a while)
    await page.waitForFunction((id) => {
        const game = window.pellagos.game;
        const [me, them] = [game.battle.actor(game.me), game.battle.actor(id)];

        return Math.hypot(them.x - me.x, them.y - me.y) < 4 && !me.path.length;
    }, crier, { timeout: 180000 });
    await page.evaluate((id) => {
        const game = window.pellagos.game;
        const [me, them] = [game.battle.actor(game.me), game.battle.actor(id)];

        game.cameraFollow.yaw = Math.atan2(them.x - me.x, them.y - me.y) + Math.PI;
        game.padPicked = null;
    }, crier);
    await page.waitForFunction((id) => window.pellagos.game.padFront(Infinity)?.actor?.id === id, crier, { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector(".padmark").hidden && document.querySelector(".padmark").textContent === "✕ Talk", null, { timeout: 30000 });
    await pad.press("cross");
    await page.waitForFunction(() => window.pellagos.game.talk.open, null, { timeout: 30000 });
    await pad.press("circle");
    await page.waitForFunction(() => !window.pellagos.game.talk.open, null, { timeout: 30000 });

    // R2 held: the Action Bar up, out of a fight, each slot showing its button
    await pad.hold("r2");
    await page.waitForFunction(() => window.pellagos.game.quickBar.up, null, { timeout: 30000 });
    expect(await page.locator(".quickbar .quick-slot .quick-key").allTextContents()).toEqual(["□", "△", "○", "✕", "←", "→"]);
    await pad.hold("r2", false);
    await page.waitForFunction(() => !window.pellagos.game.padBarHeld, null, { timeout: 30000 });

    // Square held: their own wheel opens round them; the left stick pushed up picks its top
    // slice, and the wheel goes
    await pad.hold("square");
    await page.waitForFunction(() => window.pellagos.game.wheel.open && window.pellagos.game.padPointer, null, { timeout: 30000 });
    await pad.sticks([0, -1, 0, 0]);
    await page.waitForFunction(() => !window.pellagos.game.padPointer, null, { timeout: 30000 });
    await pad.sticks([0, 0, 0, 0]);
    await pad.hold("square", false);

    // Square tapped: the Pack, its prompts shown, the D-pad going from button to button in it,
    // and Circle closing it
    await pad.press("square");
    await page.waitForFunction(() => window.pellagos.game.pack.open, null, { timeout: 30000 });
    await pad.press("down");
    await page.waitForFunction(() => window.pellagos.game.pack.panel.contains(document.activeElement), null, { timeout: 30000 });
    await expect(page.locator(".padprompts")).toContainText("✕ Choose");
    await pad.press("circle");
    await page.waitForFunction(() => !window.pellagos.game.pack.open, null, { timeout: 30000 });

    // Options: the menu, the game paused, its first button in focus; Circle goes back to the game
    await pad.press("options");
    await page.waitForFunction(() => document.querySelector("#menu").open, null, { timeout: 30000 });
    await pad.press("down");
    expect(await page.evaluate(() => document.querySelector("#menu").contains(document.activeElement))).toBe(true);
    await pad.press("circle");
    await page.waitForFunction(() => !document.querySelector("#menu").open, null, { timeout: 30000 });
});

test("a game controller works the windows: Multiplayer, a world's code picked a letter at a time, the game's own keyboard, and a button set otherwise", async ({ page }) => {
    const pad = await standIn(page, { save: SAVE });

    await page.goto("/");
    await page.locator("#multiplayerbutton").waitFor({ state: "visible", timeout: 90000 });
    await pad.connect();

    // The title's buttons, gone between with the D-pad; Cross presses
    await pad.press("down");
    await page.waitForFunction(() => document.querySelector("#title").contains(document.activeElement), null, { timeout: 30000 });
    await page.locator("#multiplayerbutton").focus();
    await pad.press("cross");
    await expect(page.locator("#multiplayer")).toBeVisible();

    // Join a World on another Device: the code picked a letter at a time (up B then C, along,
    // down Z), done, and on to the next thing; Circle back to the menu, its button in focus
    await page.locator("#mpjoindevice").focus();
    await pad.press("cross");
    await expect(page.locator("#join")).toBeVisible();
    await page.locator("#joincode").focus();
    await pad.press("cross");
    await expect(page.locator(".padcode")).toBeVisible();

    for (const way of ["up", "up", "right", "down"]) {
        await pad.press(way);
    }

    await pad.press("cross");
    await expect(page.locator(".padcode")).toBeHidden();
    await expect(page.locator("#joincode")).toHaveValue("CZAA");
    await pad.press("circle");
    await expect(page.locator("#join")).toBeHidden();
    await expect(page.locator("#mpjoindevice")).toBeFocused();

    // Known Servers' address: typed on the game's own keyboard (q, w, a space, the space
    // deleted), closed with what's typed kept
    await page.locator("#mpservers").focus();
    await pad.press("cross");
    await expect(page.locator("#servers")).toBeVisible();
    await page.locator("#serversaddress").focus();
    await pad.press("cross");
    await expect(page.locator(".padkeys")).toBeVisible();
    await expect(page.locator(".padkeys-key.at")).toHaveText(/^q$/i);
    await pad.press("cross");
    await pad.press("right");
    await pad.press("cross");
    await pad.press("triangle");
    await pad.press("square");
    await expect(page.locator("#serversaddress")).toHaveValue("qw");
    await pad.press("circle");
    await expect(page.locator(".padkeys")).toBeHidden();
    await expect(page.locator("#serversaddress")).toHaveValue("qw");
    await pad.press("circle");
    await pad.press("circle");
    await expect(page.locator("#multiplayer")).toBeHidden();
});

test("a game controller's buttons are set on the Bindings page: chosen, the button pressed, taken from what had it (and said), and set back", async ({ page }) => {
    test.setTimeout(360000);

    const pad = await standIn(page);

    await playing(page, "/?play&seed=1&weapon=sword");
    await pad.connect();
    await pad.press("options");
    await page.waitForFunction(() => document.querySelector("#menu").open, null, { timeout: 30000 });

    // Game options, Controls, Controller: the controller's seen; its buttons, on the Bindings page
    for (const button of ["#optionsbutton", "#controlsbutton", "#controllerbutton"]) {
        await page.locator(button).focus();
        await pad.press("cross");
    }

    await expect(page.locator("#menucontroller")).toBeVisible();
    await expect(page.locator("#padseen")).toContainText("DualSense Wireless Controller: ready.");
    await page.locator("#padbindingsbutton").focus();
    await pad.press("cross");
    await expect(page.locator("#menubindings")).toBeVisible();

    // "Do it" set to R1, its controller box chosen: R1's old action (the next foe) lets it go, and that's said
    const doIt = page.locator('.bind[data-action="do"] .bind-slot[data-slot="pad"]');

    await expect(doIt).toHaveText("✕");
    await doIt.focus();
    await pad.press("cross");
    await expect(page.locator('.bind[data-action="do"] .bind-ask')).toHaveText("Press a button…");
    await pad.press("r1");
    await expect(doIt).toHaveText("R1");
    await expect(page.locator('.bind[data-action="nextFoe"] .bind-slot[data-slot="pad"]')).toHaveText("—");
    await expect(page.locator("#bindtold")).toHaveText("Taken from The next foe, nearest first: choose it to give it another.");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.settings")).padBindings)).toMatchObject({ do: "r1", nextFoe: "" });

    // Chosen by its name, the action takes a button pressed too: Stop, held Triangle
    await page.locator('.bind[data-action="stop"] .bind-name').focus();
    await pad.press("cross");
    await pad.hold("triangle");
    await page.waitForFunction(() => document.querySelector('.bind[data-action="stop"] .bind-slot[data-slot="pad"]').textContent === "△ held", null, { timeout: 30000 });
    await pad.hold("triangle", false);

    // Every key and button as it came
    await page.locator("#bindreset").focus();
    await pad.press("cross");
    await expect(doIt).toHaveText("✕");
    await expect(page.locator("#bindreset")).toBeDisabled();
});
